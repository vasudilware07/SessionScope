import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('HTTP API', () => {
  it('returns health status and a correlation ID', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
  });
  it('rejects invalid event payloads before database access', async () => {
    const response = await request(app).post('/api/v1/events').send({}).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
