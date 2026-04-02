const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupApp() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workspace-'));
  process.env.DB_PATH = path.join(tempDir, 'app.db');
  process.env.JWT_SECRET = 'test-secret';

  jest.resetModules();
  const { createApp } = require('../src/app');
  const app = createApp();

  return { app, tempDir };
}

describe('auth endpoints', () => {
  test('registers an agency and returns a JWT', async () => {
    const { app } = setupApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        agencyName: 'Northstar Agency',
        email: 'owner@example.com',
        password: 'secret123',
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
    expect(response.body.agency.email).toBe('owner@example.com');
    expect(response.body.agency.name).toBe('Northstar Agency');
  });

  test('logs in with valid credentials', async () => {
    const { app } = setupApp();

    await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'owner@example.com',
      password: 'secret123',
    });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.agency.name).toBe('Northstar Agency');
  });

  test('rejects invalid credentials', async () => {
    const { app } = setupApp();

    await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const response = await request(app).post('/api/auth/login').send({
      email: 'owner@example.com',
      password: 'wrong-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid credentials');
  });
});

describe('auth middleware', () => {
  test('allows a valid token on protected routes', async () => {
    const { app } = setupApp();

    const register = await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const response = await request(app)
      .get('/api/agency')
      .set('Authorization', `Bearer ${register.body.token}`);

    expect(response.status).toBe(200);
    expect(response.body.agency.email).toBe('owner@example.com');
  });

  test('rejects an invalid token', async () => {
    const { app } = setupApp();

    const response = await request(app)
      .get('/api/agency')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid token');
  });

  test('rejects when no token is provided', async () => {
    const { app } = setupApp();

    const response = await request(app).get('/api/agency');

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Authentication required');
  });
});

describe('agency and client CRUD', () => {
  test('updates agency profile', async () => {
    const { app } = setupApp();

    const register = await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const response = await request(app)
      .put('/api/agency')
      .set('Authorization', `Bearer ${register.body.token}`)
      .send({
        name: 'Northstar Creative',
        logo_url: 'https://example.com/logo.png',
        brand_color: '#ff6600',
      });

    expect(response.status).toBe(200);
    expect(response.body.agency.name).toBe('Northstar Creative');
    expect(response.body.agency.logo_url).toBe('https://example.com/logo.png');
    expect(response.body.agency.brand_color).toBe('#ff6600');
  });

  test('creates, lists, updates, and archives clients', async () => {
    const { app } = setupApp();

    const register = await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const auth = { Authorization: `Bearer ${register.body.token}` };

    const createResponse = await request(app)
      .post('/api/clients')
      .set(auth)
      .send({ name: 'Acme Co', industry: 'SaaS' });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.client.name).toBe('Acme Co');

    const listResponse = await request(app).get('/api/clients').set(auth);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.clients).toHaveLength(1);
    expect(listResponse.body.clients[0].name).toBe('Acme Co');

    const clientId = createResponse.body.client.id;
    const updateResponse = await request(app)
      .put(`/api/clients/${clientId}`)
      .set(auth)
      .send({ name: 'Acme Incorporated', industry: 'B2B SaaS' });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.client.name).toBe('Acme Incorporated');

    const deleteResponse = await request(app)
      .delete(`/api/clients/${clientId}`)
      .set(auth);

    expect(deleteResponse.status).toBe(204);

    const afterArchive = await request(app).get('/api/clients').set(auth);
    expect(afterArchive.status).toBe(200);
    expect(afterArchive.body.clients).toHaveLength(0);
  });
});
