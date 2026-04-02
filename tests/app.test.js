const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function setupApp(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workspace-'));
  process.env.DB_PATH = path.join(tempDir, 'app.db');
  process.env.JWT_SECRET = 'test-secret';

  jest.resetModules();
  const { createApp } = require('../src/app');
  const app = createApp({
    fetch: options.fetch,
    uploadDir: path.join(tempDir, 'uploads'),
  });

  return { app, tempDir };
}

async function registerAndCreateClient(app) {
  const register = await request(app).post('/api/auth/register').send({
    agencyName: 'Northstar Agency',
    email: 'owner@example.com',
    password: 'secret123',
  });

  const auth = { Authorization: `Bearer ${register.body.token}` };
  const createClient = await request(app)
    .post('/api/clients')
    .set(auth)
    .send({ name: 'Acme Co', industry: 'SaaS' });

  return {
    auth,
    clientId: createClient.body.client.id,
    token: register.body.token,
  };
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

describe('data imports', () => {
  test('uploads a valid CSV import and stores structured data', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/csv`)
      .set(auth)
      .field('period', '2026-03')
      .attach('file', Buffer.from('channel,clicks\nGoogle Ads,120\nMeta,95\n'), 'report.csv');

    expect(response.status).toBe(201);
    expect(response.body.import.source_type).toBe('csv');
    expect(response.body.import.period).toBe('2026-03');
    expect(response.body.import.column_headers).toEqual(['channel', 'clicks']);
    expect(response.body.import.row_count).toBe(2);
    expect(response.body.import.raw_data).toEqual([
      { channel: 'Google Ads', clicks: '120' },
      { channel: 'Meta', clicks: '95' },
    ]);
  });

  test('rejects an empty CSV file', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/csv`)
      .set(auth)
      .field('period', '2026-03')
      .attach('file', Buffer.from(''), 'report.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('CSV file is empty');
  });

  test('rejects a CSV with headers but no data rows', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/csv`)
      .set(auth)
      .field('period', '2026-03')
      .attach('file', Buffer.from('channel,clicks\n'), 'report.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('CSV file must include headers and at least one data row');
  });

  test('rejects files over 5MB', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);
    const tooLarge = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/csv`)
      .set(auth)
      .field('period', '2026-03')
      .attach('file', tooLarge, 'large.csv');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('CSV file must be 5MB or smaller');
  });

  test('rejects non-CSV uploads', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/csv`)
      .set(auth)
      .field('period', '2026-03')
      .attach('file', Buffer.from('{"hello":"world"}'), 'report.json');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Only CSV files are allowed');
  });

  test('imports from a valid Google Sheets URL', async () => {
    const fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => 'campaign,spend\nSearch,1200\nSocial,900\n',
    });
    const { app } = setupApp({ fetch });
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/gsheets`)
      .set(auth)
      .send({
        period: 'March 2026',
        sheetsUrl: 'https://docs.google.com/spreadsheets/d/testSheet123/edit#gid=0',
      });

    expect(response.status).toBe(201);
    expect(response.body.import.source_type).toBe('gsheets');
    expect(response.body.import.row_count).toBe(2);
    expect(fetch).toHaveBeenCalledWith('https://docs.google.com/spreadsheets/d/testSheet123/export?format=csv');
  });

  test('rejects an invalid Google Sheets URL', async () => {
    const { app } = setupApp({ fetch: jest.fn() });
    const { auth, clientId } = await registerAndCreateClient(app);

    const response = await request(app)
      .post(`/api/clients/${clientId}/imports/gsheets`)
      .set(auth)
      .send({
        period: 'March 2026',
        sheetsUrl: 'https://example.com/not-a-sheet',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid Google Sheets URL');
  });

  test('lists imports by period descending and deletes an import', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'campaign,spend\nSearch,1200\n',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'campaign,spend\nSocial,900\n',
      });

    const { app } = setupApp({ fetch });
    const { auth, clientId } = await registerAndCreateClient(app);

    const first = await request(app)
      .post(`/api/clients/${clientId}/imports/gsheets`)
      .set(auth)
      .send({
        period: '2026-02',
        sheetId: 'sheet-one',
      });

    const second = await request(app)
      .post(`/api/clients/${clientId}/imports/gsheets`)
      .set(auth)
      .send({
        period: '2026-03',
        sheetId: 'sheet-two',
      });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const listResponse = await request(app)
      .get(`/api/clients/${clientId}/imports`)
      .set(auth);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.imports).toHaveLength(2);
    expect(listResponse.body.imports[0].period).toBe('2026-03');
    expect(listResponse.body.imports[1].period).toBe('2026-02');
    expect(listResponse.body.imports[0].raw_data).toBeUndefined();

    const getSingle = await request(app)
      .get(`/api/clients/${clientId}/imports/${second.body.import.id}`)
      .set(auth);

    expect(getSingle.status).toBe(200);
    expect(getSingle.body.import.raw_data).toEqual([{ campaign: 'Social', spend: '900' }]);

    const deleteResponse = await request(app)
      .delete(`/api/clients/${clientId}/imports/${first.body.import.id}`)
      .set(auth);

    expect(deleteResponse.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/clients/${clientId}/imports`)
      .set(auth);

    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.imports).toHaveLength(1);
    expect(afterDelete.body.imports[0].id).toBe(second.body.import.id);
  });
});
