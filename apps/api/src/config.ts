import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The API runs from apps/api when invoked through npm workspaces, while the
// development environment file lives at the repository root.
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/sessionscope',
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174').split(',').map(x => x.trim()).filter(Boolean),
  projectId: process.env.DEFAULT_PROJECT_ID ?? 'demo-project',
  projectName: process.env.DEFAULT_PROJECT_NAME ?? 'SessionScope Demo',
  retentionDays: Number(process.env.EVENT_RETENTION_DAYS ?? 90),
};
