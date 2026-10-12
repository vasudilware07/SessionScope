import mongoose from 'mongoose';
import { config } from './config.js';
import { Event, Project } from './models.js';

await mongoose.connect(config.mongoUri);
await Project.updateOne({ projectId: config.projectId }, { $set: { projectId: config.projectId, name: config.projectName, allowedOrigins: config.allowedOrigins, retentionDays: config.retentionDays } }, { upsert: true });
if (await Event.countDocuments({ projectId: config.projectId }) === 0) {
  const pages = ['http://localhost:5174/', 'http://localhost:5174/products', 'http://localhost:5174/products/field-notes'];
  const now = Date.now(), docs = [] as any[];
  for (let s = 0; s < 8; s++) { const sid = `seed-session-${s}-000000`; const start = now - s * 86400000; for (let j = 0; j < 5 + s % 3; j++) { const type = j % 2 ? 'click' : 'page_view', pageUrl = pages[(j + s) % pages.length]; docs.push({ eventId: `seed-${s}-${j}-000000`, projectId: config.projectId, sessionId: sid, eventType: type, pageUrl, pagePath: new URL(pageUrl).pathname, pageTitle: 'SessionScope Demo', timestamp: new Date(start + j * 60000), receivedAt: new Date(), viewport: { width: 1440, height: 900 }, screen: { width: 1440, height: 900 }, device: { category: 'desktop' }, ...(type === 'click' ? { click: { x: 400 + j * 25, y: 200 + s * 20, normalizedX: 0.28 + j * .02, normalizedY: 0.22 + s * .02 }, element: { tag: 'button', label: 'Explore product' } } : {}) }); } }
  await Event.insertMany(docs); console.info(`Inserted ${docs.length} sample events.`);
}
await mongoose.disconnect();
