import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { Event, Project } from './models.js';
import { config } from './config.js';
import { eventBatchSchema } from './validation.js';

export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { const id = req.header('x-request-id')?.slice(0, 100) || randomUUID(); res.setHeader('x-request-id', id); (req as any).id = id; next(); });
app.use(pinoHttp({ logger, serializers: { req: req => ({ id: (req as any).id, method: req.method, url: req.url }) } }));
app.use(helmet());
app.use(cors({ origin(origin, cb) { if (!origin || config.allowedOrigins.includes(origin)) return cb(null, true); const error: any = new Error('Origin is not allowed'); error.status = 403; cb(error); }, methods: ['GET','POST','PATCH','OPTIONS'], allowedHeaders: ['Content-Type','X-Request-ID'] }));
app.use(express.json({ limit: '128kb' }));
const ipIngestionLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
const projectIngestionLimit = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false, keyGenerator: req => String(req.body?.projectId ?? 'unknown') });
const projectQuery = (req: express.Request) => String(req.query.projectId ?? config.projectId);
const dateRange = (req: express.Request) => { const timestamp: Record<string, Date> = {}; if (req.query.from) timestamp.$gte = new Date(String(req.query.from)); if (req.query.to) timestamp.$lte = new Date(String(req.query.to)); return timestamp; };

app.get('/api/v1/health', (_req, res) => res.json({ data: { status: 'ok', time: new Date().toISOString() } }));
app.get('/api/v1/ready', async (_req, res) => { const ready = (await import('mongoose')).default.connection.readyState === 1; res.status(ready ? 200 : 503).json({ data: { ready } }); });
app.use('/api/v1/docs', ...(swaggerUi.serve as any));
app.get('/api/v1/docs', swaggerUi.setup({ openapi: '3.0.3', info: { title: 'SessionScope API', version: '1.0.0' }, servers: [{ url: '/' }], paths: { '/api/v1/events': { post: { summary: 'Ingest one event or a batch', responses: { '202': { description: 'Accepted' }, '400': { description: 'Invalid payload' } } } }, '/api/v1/sessions': { get: { summary: 'List aggregated sessions' } }, '/api/v1/analytics/overview': { get: { summary: 'Project analytics' } } } }) as any);

app.post('/api/v1/events', ipIngestionLimit, projectIngestionLimit, async (req, res, next) => {
  try {
    const parsed = eventBatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: parsed.error.flatten() } });
    const events = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
    const projectIds = [...new Set(events.map(e => e.projectId))];
    if (projectIds.length !== 1) return res.status(400).json({ error: { code: 'MIXED_PROJECTS', message: 'A batch must contain a single project' } });
    const project: any = await Project.findOne({ projectId: projectIds[0] }).lean();
    if (!project) return res.status(403).json({ error: { code: 'UNKNOWN_PROJECT', message: 'Unknown project ID' } });
    const origin = req.header('origin');
    if (origin && project.allowedOrigins.length && !project.allowedOrigins.includes(origin)) return res.status(403).json({ error: { code: 'ORIGIN_DENIED', message: 'Origin is not allowed for this project' } });
    const ops = events.map(e => ({ updateOne: { filter: { projectId: e.projectId, eventId: e.eventId }, update: { $setOnInsert: { ...e, receivedAt: new Date() } }, upsert: true } }));
    const result = await Event.bulkWrite(ops, { ordered: false });
    res.status(202).json({ data: { accepted: events.length, inserted: result.upsertedCount, duplicates: events.length - result.upsertedCount } });
  } catch (err) { next(err); }
});

app.get('/api/v1/projects', async (_req, res, next) => { try { const projects = await Project.find().select('-_id projectId name allowedOrigins createdAt trackingConfig retentionDays').lean(); res.json({ data: projects }); } catch (e) { next(e); } });
app.patch('/api/v1/projects/:projectId', async (req, res, next) => { try { if (process.env.NODE_ENV === 'production') { const expected = process.env.ADMIN_API_KEY ?? '', supplied = req.header('x-admin-key') ?? ''; if (!expected) return res.status(503).json({ error: { code: 'ADMIN_KEY_REQUIRED', message: 'Project administration is not configured' } }); const a = Buffer.from(expected), b = Buffer.from(supplied); if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin authentication is required' } }); } const origins = req.body?.allowedOrigins; const valid = Array.isArray(origins) && origins.length <= 50 && origins.every((x: unknown) => { if (typeof x !== 'string') return false; try { const u = new URL(x); return ['http:','https:'].includes(u.protocol) && u.origin === x; } catch { return false; } }); if (!valid) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'allowedOrigins must contain HTTP(S) origins without paths' } }); const project = await Project.findOneAndUpdate({ projectId: req.params.projectId }, { $set: { allowedOrigins: origins } }, { new: true }).select('-_id projectId name allowedOrigins createdAt trackingConfig retentionDays').lean(); if (!project) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }); res.json({ data: project }); } catch (e) { next(e); } });

app.get('/api/v1/sessions', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)), limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const match: any = { projectId: projectQuery(req), timestamp: dateRange(req) };
    if (req.query.search) match.sessionId = { $regex: String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    if (req.query.pageUrl) match.pageUrl = String(req.query.pageUrl);
    const sortKey = req.query.sort === 'events' ? 'eventCount' : 'lastSeen';
    const [result] = await Event.aggregate([{ $match: match }, { $group: { _id: '$sessionId', firstSeen: { $min: '$timestamp' }, lastSeen: { $max: '$timestamp' }, eventCount: { $sum: 1 }, pageViews: { $sum: { $cond: [{ $eq: ['$eventType','page_view'] },1,0] } }, clicks: { $sum: { $cond: [{ $eq: ['$eventType','click'] },1,0] } }, pages: { $addToSet: '$pageUrl' }, device: { $last: '$device.category' } } }, { $addFields: { durationMs: { $subtract: ['$lastSeen','$firstSeen'] }, pageCount: { $size: '$pages' } } }, { $sort: { [sortKey]: -1 } }, { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'count' }] } }]);
    const sessions = (result?.items ?? []).map((s: any) => ({ sessionId: s._id, firstSeen: s.firstSeen, lastSeen: s.lastSeen, durationMs: s.durationMs, eventCount: s.eventCount, pageViews: s.pageViews, clicks: s.clicks, pages: s.pages, pageCount: s.pageCount, device: s.device ?? null }));
    res.json({ data: sessions, meta: { page, limit, total: result?.total?.[0]?.count ?? 0 } });
  } catch (e) { next(e); }
});
app.get('/api/v1/sessions/:sessionId/events', async (req, res, next) => { try { const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200))); const events = await Event.find({ projectId: projectQuery(req), sessionId: req.params.sessionId }).sort({ timestamp: 1 }).limit(limit).select('-_id -__v').lean(); res.json({ data: events }); } catch (e) { next(e); } });
app.get('/api/v1/events', async (req, res, next) => { try { const page = Math.max(1, Number(req.query.page ?? 1)), limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50))); const q: any = { projectId: projectQuery(req), timestamp: dateRange(req) }; if (req.query.eventType) q.eventType = String(req.query.eventType); if (req.query.sessionId) q.sessionId = String(req.query.sessionId); if (req.query.pageUrl) q.pageUrl = String(req.query.pageUrl); const [data,total] = await Promise.all([Event.find(q).sort({ timestamp: -1 }).skip((page - 1) * limit).limit(limit).select('-_id -__v').lean(), Event.countDocuments(q)]); res.json({ data, meta: { page, limit, total } }); } catch (e) { next(e); } });
app.get('/api/v1/heatmap/pages', async (req, res, next) => { try { const data = await Event.aggregate([{ $match: { projectId: projectQuery(req) } }, { $group: { _id: '$pageUrl', eventCount: { $sum: 1 }, clickCount: { $sum: { $cond: [{ $eq: ['$eventType','click'] },1,0] } } } }, { $sort: { clickCount: -1, eventCount: -1 } }, { $project: { _id: 0, pageUrl: '$_id', eventCount: 1, clickCount: 1 } }]); res.json({ data }); } catch (e) { next(e); } });
app.get('/api/v1/heatmap/clicks', async (req, res, next) => { try { if (!req.query.pageUrl) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'pageUrl is required' } }); const q: any = { projectId: projectQuery(req), eventType: 'click', pageUrl: String(req.query.pageUrl), timestamp: dateRange(req) }; if (req.query.viewportWidth) q['viewport.width'] = Number(req.query.viewportWidth); if (req.query.viewportHeight) q['viewport.height'] = Number(req.query.viewportHeight); const data = await Event.find(q).sort({ timestamp: -1 }).limit(5000).select('eventId sessionId timestamp click viewport element -_id').lean(); res.json({ data }); } catch (e) { next(e); } });
app.get('/api/v1/analytics/overview', async (req, res, next) => {
  try {
    const match: any = { projectId: projectQuery(req), timestamp: dateRange(req) };
    const [summary] = await Event.aggregate([{ $match: match }, { $group: { _id: null, totalEvents: { $sum: 1 }, pageViews: { $sum: { $cond: [{ $eq: ['$eventType','page_view'] },1,0] } }, clicks: { $sum: { $cond: [{ $eq: ['$eventType','click'] },1,0] } }, sessions: { $addToSet: '$sessionId' }, firstSeen: { $min: '$timestamp' }, lastSeen: { $max: '$timestamp' } } }, { $project: { _id: 0, totalEvents: 1, pageViews: 1, clicks: 1, sessions: { $size: '$sessions' } } }]);
    const [pages,topClickPages,trends,eventTypes,recent,devices,rawSources] = await Promise.all([
      Event.aggregate([{ $match: { ...match, eventType: 'page_view' } }, { $group: { _id: '$pageUrl', views: { $sum: 1 }, clicks: { $sum: 0 } } }, { $sort: { views: -1 } }, { $limit: 8 }, { $project: { _id: 0, pageUrl: '$_id', views: 1 } }]),
      Event.aggregate([{ $match: { ...match, eventType: 'click' } }, { $group: { _id: '$pageUrl', clicks: { $sum: 1 } } }, { $sort: { clicks: -1 } }, { $limit: 8 }, { $project: { _id: 0, pageUrl: '$_id', clicks: 1 } }]),
      Event.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }, sessions: { $addToSet: '$sessionId' }, pageViews: { $sum: { $cond: [{ $eq: ['$eventType','page_view'] },1,0] } }, clicks: { $sum: { $cond: [{ $eq: ['$eventType','click'] },1,0] } } } }, { $sort: { _id: 1 } }, { $project: { _id: 0, date: '$_id', sessions: { $size: '$sessions' }, pageViews: 1, clicks: 1 } }]),
      Event.aggregate([{ $match: match }, { $group: { _id: '$eventType', count: { $sum: 1 } } }, { $project: { _id: 0, eventType: '$_id', count: 1 } }]),
      Event.aggregate([{ $match: match }, { $sort: { timestamp: -1 } }, { $group: { _id: '$sessionId', lastSeen: { $first: '$timestamp' }, eventCount: { $sum: 1 }, lastPage: { $first: '$pageUrl' } } }, { $sort: { lastSeen: -1 } }, { $limit: 6 }]),
      Event.aggregate([{ $match: match }, { $group: { _id: '$sessionId', device: { $first: { $ifNull: ['$device.category', 'unknown'] } } } }, { $group: { _id: '$device', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $project: { _id: 0, device: '$_id', count: 1 } }]),
      Event.aggregate([{ $match: { ...match, eventType: 'page_view' } }, { $group: { _id: { $ifNull: ['$referrer', ''] }, visits: { $sum: 1 } } }, { $sort: { visits: -1 } }, { $limit: 30 }]),
    ]);
    const [sessionAgg] = await Event.aggregate([{ $match: match }, { $group: { _id: '$sessionId', first: { $min: '$timestamp' }, last: { $max: '$timestamp' }, events: { $sum: 1 }, pageViews: { $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] } }, clicks: { $sum: { $cond: [{ $eq: ['$eventType', 'click'] }, 1, 0] } } } }, { $group: { _id: null, avgDurationMs: { $avg: { $subtract: ['$last','$first'] } }, avgEvents: { $avg: '$events' }, engagedSessions: { $sum: { $cond: [{ $or: [{ $gt: ['$events', 1] }, { $gt: ['$clicks', 0] }] }, 1, 0] } }, singlePageSessions: { $sum: { $cond: [{ $and: [{ $eq: ['$pageViews', 1] }, { $eq: ['$clicks', 0] }] }, 1, 0] } } } }]);
    const sourceCounts = new Map<string, number>();
    for (const source of rawSources as Array<{ _id: string; visits: number }>) {
      let label = 'Direct / unknown';
      if (source._id) { try { label = new URL(source._id).hostname.replace(/^www\./, '') || label; } catch { label = 'Other'; } }
      sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + source.visits);
    }
    const sources = [...sourceCounts].map(([source, visits]) => ({ source, visits })).sort((a, b) => b.visits - a.visits).slice(0, 8);
    const sessions = summary?.sessions ?? 0;
    const engagedSessions = sessionAgg?.engagedSessions ?? 0;
    const singlePageSessions = sessionAgg?.singlePageSessions ?? 0;
    res.json({ data: { ...(summary ?? { totalEvents: 0, pageViews: 0, clicks: 0, sessions: 0 }), averageDurationMs: sessionAgg?.avgDurationMs ?? 0, averageEventsPerSession: sessionAgg?.avgEvents ?? 0, engagedSessions, engagementRate: sessions ? engagedSessions / sessions * 100 : 0, singlePageSessions, bounceRate: sessions ? singlePageSessions / sessions * 100 : 0, pages, topClickPages, trends, eventTypes, devices, sources, recentSessions: recent.map((s: any) => ({ sessionId: s._id, ...s })) } });
  } catch (e) { next(e); }
});

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => { const status = err?.status ?? 500; logger.error({ requestId: (req as any).id, status, message: err?.message }, 'request failed'); res.status(status).json({ error: { code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR', message: status === 500 ? 'An unexpected error occurred' : err.message, requestId: (req as any).id } }); });
