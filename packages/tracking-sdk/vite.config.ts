import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ build: { lib: { entry: resolve(__dirname, 'src/index.ts'), name: 'SessionScopeSDK', formats: ['iife'], fileName: () => 'tracker.js' }, outDir: resolve(__dirname, '../../apps/demo-storefront/public'), emptyOutDir: false } });
