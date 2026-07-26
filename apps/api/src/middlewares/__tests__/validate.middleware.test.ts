import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { validateRequest } from '../validate.middleware';

jest.mock('../../utils/logger', () => ({
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import logger from '../../utils/logger';

function buildApp(schemas: Parameters<typeof validateRequest>[0]) {
  const app = express();
  app.use(express.json());
  app.post('/test', validateRequest(schemas), (_req, res) => res.json({ ok: true }));
  app.get('/test', validateRequest(schemas), (_req, res) => res.json({ ok: true }));
  return app;
}

describe('validateRequest middleware', () => {
  describe('body validation', () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    it('passes valid body to handler', async () => {
      const app = buildApp({ body: schema });
      const res = await request(app).post('/test').send({ name: 'Alice', age: 30 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 for invalid body', async () => {
      const app = buildApp({ body: schema });
      const res = await request(app).post('/test').send({ name: 'Alice' }); // missing age
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.details).toBeDefined();
    });

    it('logs a warning on body validation failure', async () => {
      const app = buildApp({ body: schema });
      await request(app).post('/test').send({ name: 123 });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/test' }),
        'Request body validation failed'
      );
    });

    it('strips unknown fields via schema (if schema uses strip)', async () => {
      const strictSchema = z.object({ name: z.string() }).strip();
      const app = buildApp({ body: strictSchema });
      const res = await request(app).post('/test').send({ name: 'Bob', extra: 'ignored' });
      expect(res.status).toBe(200);
    });
  });

  describe('query validation', () => {
    const schema = z.object({ page: z.coerce.number().min(1) });

    it('passes valid query to handler', async () => {
      const app = buildApp({ query: schema });
      const res = await request(app).get('/test?page=2');
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid query', async () => {
      const app = buildApp({ query: schema });
      const res = await request(app).get('/test?page=0');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ValidationError');
      expect(res.body.message).toBe('Invalid query parameters');
    });

    it('logs a warning on query validation failure', async () => {
      const app = buildApp({ query: schema });
      await request(app).get('/test?page=0');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', path: '/test' }),
        'Request query validation failed'
      );
    });
  });

  describe('edge cases', () => {
    it('accepts request when no schemas provided', async () => {
      const app = buildApp({});
      const res = await request(app).post('/test').send({ anything: true });
      expect(res.status).toBe(200);
    });

    it('returns first failing schema error when multiple schemas are invalid', async () => {
      const bodySchema = z.object({ x: z.number() });
      const querySchema = z.object({ y: z.number() });
      const app = buildApp({ body: bodySchema, query: querySchema });
      // body is invalid — should fail at body check first
      const res = await request(app).post('/test?y=abc').send({ x: 'not-a-number' });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid request body');
    });
  });
});
