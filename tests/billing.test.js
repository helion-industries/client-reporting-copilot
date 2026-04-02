'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// Mock puppeteer (needed by app.js)
jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue({
    newPage: jest.fn().mockResolvedValue({
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')),
    }),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

// Mock Stripe SDK
jest.mock('stripe', () => {
  const mockCheckoutCreate = jest.fn().mockResolvedValue({
    id: 'cs_test_123',
    url: 'https://checkout.stripe.com/pay/cs_test_123',
  });
  const mockPortalCreate = jest.fn().mockResolvedValue({
    url: 'https://billing.stripe.com/p/session_test_123',
  });
  const mockSubRetrieve = jest.fn().mockResolvedValue({
    current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
  });

  return jest.fn().mockReturnValue({
    checkout: {
      sessions: { create: mockCheckoutCreate },
    },
    billingPortal: {
      sessions: { create: mockPortalCreate },
    },
    subscriptions: { retrieve: mockSubRetrieve },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((body) => JSON.parse(body.toString())),
    },
  });
});

function setupApp(options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-test-'));
  process.env.DB_PATH = path.join(tempDir, 'app.db');
  process.env.JWT_SECRET = 'test-billing-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_placeholder';
  delete process.env.OPENAI_API_KEY;
  process.env.OPENAI_MODEL = 'gpt-4o-mini';

  jest.resetModules();
  // Re-apply stripe mock after resetModules
  jest.mock('stripe', () => {
    const mockCheckoutCreate = jest.fn().mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });
    const mockPortalCreate = jest.fn().mockResolvedValue({
      url: 'https://billing.stripe.com/p/session_test_123',
    });
    const mockSubRetrieve = jest.fn().mockResolvedValue({
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    });

    return jest.fn().mockReturnValue({
      checkout: { sessions: { create: mockCheckoutCreate } },
      billingPortal: { sessions: { create: mockPortalCreate } },
      subscriptions: { retrieve: mockSubRetrieve },
      webhooks: {
        constructEvent: jest.fn().mockImplementation((body) => JSON.parse(body.toString())),
      },
    });
  });

  const { createApp } = require('../src/app');
  const app = createApp({
    uploadDir: path.join(tempDir, 'uploads'),
    appBaseUrl: options.appBaseUrl || 'http://localhost:3000',
  });

  return { app, tempDir };
}

async function registerUser(app, email = 'billing@example.com') {
  const res = await request(app).post('/api/auth/register').send({
    agencyName: 'Billing Agency',
    email,
    password: 'secret123',
  });
  return { token: res.body.token, agency: res.body.agency };
}

describe('Billing API', () => {
  test('GET /api/billing/plans returns 200 with plans array', async () => {
    const { app } = setupApp();
    const res = await request(app).get('/api/billing/plans');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('plans');
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBeGreaterThanOrEqual(2);

    const planIds = res.body.plans.map((p) => p.id);
    expect(planIds).toContain('starter');
    expect(planIds).toContain('pro');
  });

  test('GET /api/billing/subscription returns 401 without auth', async () => {
    const { app } = setupApp();
    const res = await request(app).get('/api/billing/subscription');
    expect(res.status).toBe(401);
  });

  test('GET /api/billing/subscription returns 200 with subscription for authed user', async () => {
    const { app } = setupApp();
    const { token } = await registerUser(app);

    const res = await request(app)
      .get('/api/billing/subscription')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('subscription');
    expect(res.body.subscription.plan_id).toBe('free');
    expect(res.body.subscription.status).toBe('active');
    expect(res.body.subscription).toHaveProperty('plan');
    expect(res.body.subscription).toHaveProperty('client_count');
  });

  test('POST /api/billing/create-checkout-session returns 400 for invalid plan_id', async () => {
    const { app } = setupApp();
    const { token } = await registerUser(app);

    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan_id: 'invalid_plan' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/billing/create-checkout-session returns 400 for "free" plan_id', async () => {
    const { app } = setupApp();
    const { token } = await registerUser(app);

    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .set('Authorization', `Bearer ${token}`)
      .send({ plan_id: 'free' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/billing/create-checkout-session returns 401 without auth', async () => {
    const { app } = setupApp();
    const res = await request(app)
      .post('/api/billing/create-checkout-session')
      .send({ plan_id: 'starter' });
    expect(res.status).toBe(401);
  });

  test('POST /api/clients enforces free tier client limit (2 clients)', async () => {
    const { app } = setupApp();
    const { token } = await registerUser(app, 'limit-test@example.com');
    const auth = { Authorization: `Bearer ${token}` };

    // Create first client — should succeed
    const r1 = await request(app)
      .post('/api/clients')
      .set(auth)
      .send({ name: 'Client One' });
    expect(r1.status).toBe(201);

    // Create second client — should succeed
    const r2 = await request(app)
      .post('/api/clients')
      .set(auth)
      .send({ name: 'Client Two' });
    expect(r2.status).toBe(201);

    // Third client should be blocked
    const r3 = await request(app)
      .post('/api/clients')
      .set(auth)
      .send({ name: 'Client Three' });
    expect(r3.status).toBe(403);
    expect(r3.body).toHaveProperty('error');
    expect(r3.body.upgrade_required).toBe(true);
  });

  test('POST /api/billing/create-portal-session returns 400 when no Stripe customer exists', async () => {
    const { app } = setupApp();
    const { token } = await registerUser(app, 'portal-test@example.com');

    const res = await request(app)
      .post('/api/billing/create-portal-session')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});
