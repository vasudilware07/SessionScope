import mongoose from 'mongoose';
import { app, logger } from './app.js';
import { config } from './config.js';
import { Project } from './models.js';

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  await Project.updateOne({ projectId: config.projectId }, { $setOnInsert: { projectId: config.projectId, name: config.projectName, allowedOrigins: config.allowedOrigins, retentionDays: config.retentionDays, trackingConfig: { enabled: true, sessionTimeoutMinutes: 30 } } }, { upsert: true });
  const server = app.listen(config.port, () => logger.info({ port: config.port }, 'SessionScope API listening'));
  const shutdown = async () => { server.close(); await mongoose.disconnect(); process.exit(0); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
}
main().catch(error => { logger.fatal({ err: error }, 'API startup failed'); process.exit(1); });
