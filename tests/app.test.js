const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const mockPdf = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 test pdf'));
const mockSetContent = jest.fn().mockResolvedValue(undefined);
const mockNewPage = jest.fn().mockResolvedValue({
  setContent: mockSetContent,
  pdf: mockPdf,
});
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockLaunch = jest.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockClose,
});

jest.mock('puppeteer', () => ({
  launch: mockLaunch,
}));

const { ReportEngine, DEFAULT_REPORT_TEMPLATE, MAX_AI_ROWS } = require('../src/reportEngine');

function setupApp(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workspace-'));
  process.env.DB_PATH = path.join(tempDir, 'app.db');
  process.env.JWT_SECRET = 'test-secret';

  if (options.apiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = options.apiKey;
  }

  process.env.OPENAI_MODEL = options.model || 'gpt-4o-mini';

  jest.resetModules();
  const { createApp } = require('../src/app');
  const app = createApp({
    fetch: options.fetch,
    uploadDir: path.join(tempDir, 'uploads'),
    reportEngine: options.reportEngine,
    appBaseUrl: options.appBaseUrl,
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

async function createImport(app, auth, clientId) {
  const response = await request(app)
    .post(`/api/clients/${clientId}/imports/csv`)
    .set(auth)
    .field('period', '2026-03')
    .attach('file', Buffer.from('channel,clicks,conversions\nGoogle Ads,120,15\nMeta,95,9\n'), 'report.csv');

  return response.body.import;
}

describe('app polish and security', () => {
  test('serves the landing page for unauthenticated requests to /', async () => {
    const { app } = setupApp();

    const response = await request(app).get('/').set('Accept', 'text/html');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Client Reporting Copilot');
  });

  test('redirects authenticated requests on / to the dashboard', async () => {
    const { app } = setupApp();
    const register = await request(app).post('/api/auth/register').send({
      agencyName: 'Northstar Agency',
      email: 'owner@example.com',
      password: 'secret123',
    });

    const response = await request(app)
      .get('/')
      .redirects(0)
      .set('Authorization', `Bearer ${register.body.token}`)
      .set('Accept', 'text/html');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/dashboard.html');
  });

  test('returns analytics counts for the dashboard', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);

    await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const response = await request(app)
      .get('/api/analytics')
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.analytics).toEqual({
      reports_generated: 1,
      clients_count: 1,
      imports_count: 1,
    });
  });

  test('applies helmet security headers', async () => {
    const { app } = setupApp();

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('rate limits auth endpoints after 5 attempts per minute', async () => {
    const { app } = setupApp();

    for (let index = 0; index < 5; index += 1) {
      await request(app).post('/api/auth/login').send({
        email: 'owner@example.com',
        password: 'wrong-password',
      });
    }

    const response = await request(app).post('/api/auth/login').send({
      email: 'owner@example.com',
      password: 'wrong-password',
    });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('Too many auth attempts, try again in a minute');
  });

  test('returns an HTML 404 page for browser requests', async () => {
    const { app } = setupApp();

    const response = await request(app).get('/missing-page').set('Accept', 'text/html');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Page not found');
  });
});

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

describe('report engine', () => {
  test('returns mock report sections when no API key is set', async () => {
    const engine = new ReportEngine({ apiKey: null });
    const report = await engine.generateReport({
      client: { name: 'Acme Co' },
      imported: {
        row_count: 2,
        column_headers: ['channel', 'clicks'],
        raw_data: [
          { channel: 'Google Ads', clicks: '120' },
          { channel: 'Meta', clicks: '95' },
        ],
      },
      period: '2026-03',
      templateConfig: DEFAULT_REPORT_TEMPLATE,
    });

    expect(report.meta.used_mock).toBe(true);
    expect(Object.keys(report.sections)).toEqual(DEFAULT_REPORT_TEMPLATE.sections.map((section) => section.key));
    expect(report.sections.executive_summary.content).toContain('Mock executive summary');
  });

  test('uses separate OpenAI calls per section and limits rows to 50', async () => {
    const create = jest.fn().mockImplementation(async ({ input }) => ({ output_text: input.includes('Section: Executive Summary') ? 'Summary output' : 'Section output' }));
    const engine = new ReportEngine({
      apiKey: 'test-key',
      openai: { responses: { create } },
      model: 'custom-model',
    });

    const rows = Array.from({ length: 55 }, (_, index) => ({ campaign: `Campaign ${index + 1}`, clicks: String(index + 1) }));
    const report = await engine.generateReport({
      client: { name: 'Acme Co' },
      imported: {
        row_count: rows.length,
        column_headers: ['campaign', 'clicks'],
        raw_data: rows,
      },
      period: '2026-03',
      templateConfig: DEFAULT_REPORT_TEMPLATE,
    });

    expect(create).toHaveBeenCalledTimes(DEFAULT_REPORT_TEMPLATE.sections.length);
    expect(create.mock.calls[0][0].model).toBe('custom-model');
    expect(create.mock.calls[0][0].input).toContain(`first ${MAX_AI_ROWS} max`);
    expect(create.mock.calls[0][0].input).toContain('Campaign 50');
    expect(create.mock.calls[0][0].input).not.toContain('Campaign 55');
    expect(report.meta.ai_row_count).toBe(MAX_AI_ROWS);
  });
});

describe('report CRUD endpoints', () => {
  test('generates a report with mock content, then lists, gets, updates, and deletes it', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);

    const generateResponse = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({
        import_id: imported.id,
        period: '2026-03',
      });

    expect(generateResponse.status).toBe(201);
    expect(generateResponse.body.meta.used_mock).toBe(true);
    expect(generateResponse.body.report.status).toBe('generated');
    expect(generateResponse.body.report.sections.executive_summary.content).toContain('Mock executive summary');

    const reportId = generateResponse.body.report.id;

    const listResponse = await request(app)
      .get(`/api/clients/${clientId}/reports`)
      .set(auth);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.reports).toHaveLength(1);

    const getResponse = await request(app)
      .get(`/api/clients/${clientId}/reports/${reportId}`)
      .set(auth);
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.report.id).toBe(reportId);

    const updatedSections = {
      ...getResponse.body.report.sections,
      recommendations: {
        ...getResponse.body.report.sections.recommendations,
        content: '1. Tighten budget allocation.\n2. Double down on top-performing channels.',
      },
    };

    const updateResponse = await request(app)
      .put(`/api/clients/${clientId}/reports/${reportId}`)
      .set(auth)
      .send({
        sections: updatedSections,
        status: 'edited',
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.report.status).toBe('edited');
    expect(updateResponse.body.report.sections.recommendations.content).toContain('Tighten budget allocation');

    const deleteResponse = await request(app)
      .delete(`/api/clients/${clientId}/reports/${reportId}`)
      .set(auth);
    expect(deleteResponse.status).toBe(204);

    const afterDelete = await request(app)
      .get(`/api/clients/${clientId}/reports`)
      .set(auth);
    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body.reports).toHaveLength(0);
  });

  test('uses injected OpenAI client and surfaces rate limit errors gracefully', async () => {
    const create = jest.fn()
      .mockResolvedValueOnce({ output_text: 'Summary' })
      .mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { status: 429 }));
    const reportEngine = new ReportEngine({
      apiKey: 'live-key',
      openai: { responses: { create } },
    });
    const { app } = setupApp({ reportEngine, apiKey: 'live-key' });
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);

    const response = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({
        import_id: imported.id,
        period: '2026-03',
      });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe('OpenAI rate limit exceeded');
  });

  test('returns the default report template', async () => {
    const { app } = setupApp();
    const { auth } = await registerAndCreateClient(app);

    const response = await request(app)
      .get('/api/report-template/default')
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.template_config.sections).toHaveLength(6);
  });
});


describe('report export and sharing endpoints', () => {
  beforeEach(() => {
    mockLaunch.mockClear();
    mockNewPage.mockClear();
    mockSetContent.mockClear();
    mockPdf.mockClear();
    mockClose.mockClear();
    mockPdf.mockResolvedValue(Buffer.from('%PDF-1.4 test pdf'));
  });

  test('renders a branded report preview as HTML', async () => {
    const { app } = setupApp({ appBaseUrl: 'https://reports.example.com' });
    const { auth, clientId } = await registerAndCreateClient(app);
    await request(app)
      .put('/api/agency')
      .set(auth)
      .send({
        name: 'Northstar Creative',
        logo_url: 'https://example.com/logo.png',
        brand_color: '#ff6600',
      });
    const imported = await createImport(app, auth, clientId);
    const generated = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const response = await request(app)
      .get(`/api/clients/${clientId}/reports/${generated.body.report.id}/preview`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Northstar Creative');
    expect(response.text).toContain('https://example.com/logo.png');
    expect(response.text).toContain('#ff6600');
    expect(response.text).toContain('Acme Co — Performance Report');
  });

  test('renders a PDF with mocked puppeteer', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);
    const generated = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const response = await request(app)
      .get(`/api/clients/${clientId}/reports/${generated.body.report.id}/pdf`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(mockLaunch).toHaveBeenCalledWith({ headless: true, args: ['--no-sandbox'] });
    expect(mockSetContent).toHaveBeenCalledWith(expect.stringContaining('Acme Co'), { waitUntil: 'networkidle0' });
    expect(mockPdf).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  test('creates and retrieves a valid share link publicly', async () => {
    const { app } = setupApp({ appBaseUrl: 'https://reports.example.com' });
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);
    const generated = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const shareResponse = await request(app)
      .post(`/api/clients/${clientId}/reports/${generated.body.report.id}/share`)
      .set(auth)
      .send({ expires_in_days: 30 });

    expect(shareResponse.status).toBe(201);
    expect(shareResponse.body.share_link.token).toMatch(/^[a-f0-9]{48}$/);
    expect(shareResponse.body.share_link.url).toContain('/api/shared/');

    const publicResponse = await request(app)
      .get(`/api/shared/${shareResponse.body.share_link.token}`);

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers['content-type']).toContain('text/html');
    expect(publicResponse.text).toContain('Shared client view');
    expect(publicResponse.text).toContain('Acme Co');
  });

  test('returns 404 for expired and invalid share links', async () => {
    const { app } = setupApp();
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);
    const generated = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const shareResponse = await request(app)
      .post(`/api/clients/${clientId}/reports/${generated.body.report.id}/share`)
      .set(auth)
      .send({ expires_in_days: 30 });

    app.locals.db.prepare('UPDATE share_links SET expires_at = ? WHERE token = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      shareResponse.body.share_link.token
    );

    const expiredResponse = await request(app)
      .get(`/api/shared/${shareResponse.body.share_link.token}`);
    const invalidResponse = await request(app)
      .get('/api/shared/not-a-real-token');

    expect(expiredResponse.status).toBe(404);
    expect(invalidResponse.status).toBe(404);
  });

  test('builds an email draft with executive summary and share link', async () => {
    const { app } = setupApp({ appBaseUrl: 'https://reports.example.com' });
    const { auth, clientId } = await registerAndCreateClient(app);
    const imported = await createImport(app, auth, clientId);
    const generated = await request(app)
      .post(`/api/clients/${clientId}/reports/generate`)
      .set(auth)
      .send({ import_id: imported.id, period: '2026-03' });

    const response = await request(app)
      .get(`/api/clients/${clientId}/reports/${generated.body.report.id}/email-draft`)
      .set(auth);

    expect(response.status).toBe(200);
    expect(response.body.email_draft.subject).toBe('Acme Co 2026-03 performance report');
    expect(response.body.email_draft.body).toContain('Executive summary:');
    expect(response.body.email_draft.body).toContain('Mock executive summary');
    expect(response.body.email_draft.body).toContain('https://reports.example.com/api/shared/');
    expect(response.body.email_draft.share_url).toContain('https://reports.example.com/api/shared/');
  });

  test('requires auth for preview, pdf, share, and email draft endpoints', async () => {
    const { app } = setupApp();
    const responseStatuses = await Promise.all([
      request(app).get('/api/clients/1/reports/1/preview'),
      request(app).get('/api/clients/1/reports/1/pdf'),
      request(app).post('/api/clients/1/reports/1/share').send({}),
      request(app).get('/api/clients/1/reports/1/email-draft'),
    ]);

    responseStatuses.forEach((response) => {
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Authentication required');
    });
  });
});
