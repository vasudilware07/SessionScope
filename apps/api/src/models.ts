import mongoose, { Schema } from 'mongoose';
import type { TrackingEvent } from '@sessionscope/shared-types';

const eventSchema = new Schema({
  eventId: { type: String, required: true }, projectId: { type: String, required: true },
  sessionId: { type: String, required: true }, eventType: { type: String, enum: ['page_view','click'], required: true },
  pageUrl: { type: String, required: true }, pagePath: { type: String, required: true }, pageTitle: { type: String, default: '' },
  referrer: String, timestamp: { type: Date, required: true }, receivedAt: { type: Date, default: Date.now },
  viewport: { width: Number, height: Number }, screen: { width: Number, height: Number },
  device: { category: String, browser: String, os: String },
  click: { x: Number, y: Number, normalizedX: Number, normalizedY: Number },
  element: { tag: String, selector: String, label: String },
}, { versionKey: false });
eventSchema.index({ projectId:  1, eventId: 1 }, { unique: true });
eventSchema.index({ projectId: 1, sessionId: 1, timestamp: 1 });
eventSchema.index({ projectId: 1, timestamp: -1 });
eventSchema.index({ projectId: 1, eventType: 1, timestamp: -1 });
eventSchema.index({ projectId: 1, pageUrl: 1, eventType: 1, timestamp: -1 });
eventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: Math.max(1, Number(process.env.EVENT_RETENTION_DAYS ?? 90)) * 86400 });

const projectSchema = new Schema({
  projectId: { type: String, unique: true, required: true }, name: { type: String, required: true },
  allowedOrigins: { type: [String], default: [] }, createdAt: { type: Date, default: Date.now },
  trackingConfig: { enabled: { type: Boolean, default: true }, sessionTimeoutMinutes: { type: Number, default: 30 } },
  retentionDays: { type: Number, default: 90 },
}, { versionKey: false });
export const Event = mongoose.models.Event ?? mongoose.model('Event', eventSchema);
export const Project = mongoose.models.Project ?? mongoose.model('Project', projectSchema);
