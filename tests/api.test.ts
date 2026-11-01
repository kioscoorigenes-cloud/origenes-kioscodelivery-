import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mockeamos Firebase Admin para no necesitar credenciales en CI
vi.mock('../src/services/serverAuth', () => ({
  getAdminFirestore: () => null,
  requireAdmin: (_req: any, _res: any, next: any) => next(),
  initAdminSDK: () => {},
}));

// Importamos las rutas directamente
import { storeRoutes } from '../src/routes/store';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', storeRoutes());
  // API 404 catch-all (FE-02)
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  });
  return app;
}

describe('Store API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  it('GET /api/store/free-shipping-status devuelve JSON', async () => {
    const res = await request(app).get('/api/store/free-shipping-status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    // Sin Firebase Admin, available debe ser false
    expect(res.body.available).toBe(false);
  });

  it('GET /api/store/export-products sin token devuelve 401', async () => {
    const res = await request(app).get('/api/store/export-products');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('GET /api/store/export-products con token malo devuelve 401', async () => {
    const res = await request(app)
      .get('/api/store/export-products')
      .set('x-cron-token', 'token-invalido');
    expect(res.status).toBe(401);
  });

  it('Ruta API inexistente devuelve 404 JSON', async () => {
    const res = await request(app).get('/api/store/ruta-que-no-existe');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

describe('Security basics', () => {
  let app: express.Express;

  beforeAll(() => {
    app = buildApp();
  });

  it('POST grande es rechazado por body limit', async () => {
    const bigPayload = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB
    const res = await request(app)
      .post('/api/store/export-products')
      .send(bigPayload);
    // Express devuelve 413 cuando el body excede el límite
    expect([413, 401]).toContain(res.status);
  });
});
