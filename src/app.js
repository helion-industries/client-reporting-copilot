const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { createDatabase } = require('./db');
const { authMiddleware, signToken, optionalAuthMiddleware } = require('./auth');
const { buildEmailDraft, buildReportHtml } = require('./reportRender');
const { PLANS, PAID_PLANS } = require('./plans');
const { createRequirePlan } = require('./billing');
const {
  DEFAULT_REPORT_TEMPLATE,
  ReportEngine,
  ReportGenerationError,
  normalizeTemplateConfig,
} = require('./reportEngine');

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;

function createUploadMiddleware(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true });

  return multer({
    dest: uploadDir,
    limits: {
      fileSize: MAX_UPLOAD_SIZE_BYTES,
    },
    fileFilter: (_req, file, cb) => {
      const extension = path.extname(file.originalname || '').toLowerCase();
      const mimeType = String(file.mimetype || '').toLowerCase();
      const looksLikeCsv =
        extension === '.csv' ||
        mimeType.includes('csv') ||
        mimeType === 'text/plain' ||
        mimeType === 'application/vnd.ms-excel';

      if (!looksLikeCsv) {
        return cb(new Error('Only CSV files are allowed'));
      }

      return cb(null, true);
    },
  });
}

function parseCsvText(csvText) {
  const trimmed = String(csvText || '').trim();

  if (!trimmed) {
    throw new Error('CSV file is empty');
  }

  const records = parse(trimmed, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (!records.length) {
    throw new Error('CSV file must include headers and at least one data row');
  }

  const headers = Object.keys(records[0]);

  if (!headers.length) {
    throw new Error('CSV file must include a header row');
  }

  return {
    headers,
    rows: records,
    rowCount: records.length,
  };
}

function parseGoogleSheetInput(input) {
  const value = String(input || '').trim();

  if (!value) {
    throw new Error('sheetsUrl or sheetId is required');
  }

  if (/^[a-zA-Z0-9-_]+$/.test(value) && !value.includes('http')) {
    return {
      sheetId: value,
      exportUrl: `https://docs.google.com/spreadsheets/d/${value}/export?format=csv`,
    };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch (_error) {
    throw new Error('Invalid Google Sheets URL');
  }

  const match = parsedUrl.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error('Invalid Google Sheets URL');
  }

  const gid = parsedUrl.searchParams.get('gid');
  const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${match[1]}/export`);
  exportUrl.searchParams.set('format', 'csv');
  if (gid) {
    exportUrl.searchParams.set('gid', gid);
  }

  return {
    sheetId: match[1],
    exportUrl: exportUrl.toString(),
  };
}

function isBrowserRequest(req) {
  const accept = String(req.headers.accept || '');
  return req.method === 'GET' && accept.includes('text/html') && !req.path.startsWith('/api/');
}

function renderErrorPage({ statusCode, title, message }) {
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${statusCode} · ${title}</title>
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <main class="shell error-shell">
        <section class="error-card card">
          <div class="error-code">Error ${statusCode}</div>
          <h1>${title}</h1>
          <p class="muted">${message}</p>
          <div class="hero-actions">
            <a class="button-link" href="/">Go home</a>
            <a class="button-link button-link-secondary" href="/login.html">Log in</a>
          </div>
        </section>
      </main>
    </body>
  </html>`;
}

function createApp(options = {}) {
  const app = express();
  const db = options.db || createDatabase();
  const fetchImpl = options.fetch || global.fetch;
  const uploadDir = options.uploadDir || path.join(os.tmpdir(), 'client-reporting-imports');
  const upload = createUploadMiddleware(uploadDir);
  const reportEngine = options.reportEngine || new ReportEngine(options.reportEngineOptions);
  const puppeteer = options.puppeteer || require('puppeteer');
  const appBaseUrl = String(options.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const corsOrigin = process.env.CORS_ORIGIN;
  const authRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts, try again in a minute' },
  });

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors(
      corsOrigin
        ? {
            origin: corsOrigin,
          }
        : undefined
    )
  );
  // Stripe webhook must use raw body — registered BEFORE express.json()
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      const sig = req.headers['stripe-signature'];
      if (webhookSecret && webhookSecret !== 'whsec_placeholder') {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } else {
        // dev/test: parse raw body directly
        event = JSON.parse(req.body.toString());
      }
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: `Webhook error: ${err.message}` });
    }

    const upsertSubscription = db.prepare(`
      INSERT INTO subscriptions (agency_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_end, cancel_at_period_end, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, 0, CURRENT_TIMESTAMP)
      ON CONFLICT(agency_id) DO UPDATE SET
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        plan_id = excluded.plan_id,
        status = 'active',
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = 0,
        updated_at = CURRENT_TIMESTAMP
    `);

    const updateSubscriptionStatus = db.prepare(`
      UPDATE subscriptions
      SET status = ?, current_period_end = ?, cancel_at_period_end = ?, updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = ?
    `);

    const cancelSubscription = db.prepare(`
      UPDATE subscriptions
      SET status = 'cancelled', plan_id = 'free', updated_at = CURRENT_TIMESTAMP
      WHERE stripe_subscription_id = ?
    `);

    const findAgencyByCustomer = db.prepare(
      'SELECT agency_id FROM subscriptions WHERE stripe_customer_id = ?'
    );

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const customerId = session.customer;
          const subscriptionId = session.subscription;
          const planId = session.metadata?.plan_id || 'starter';
          const agencyId = session.metadata?.agency_id;

          if (agencyId) {
            // Fetch period end from subscription
            let periodEnd = null;
            try {
              const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
              periodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
            } catch (_) {}
            upsertSubscription.run(agencyId, customerId, subscriptionId, planId, periodEnd);
          }
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object;
          const periodEnd = new Date(sub.current_period_end * 1000).toISOString();
          updateSubscriptionStatus.run(sub.status, periodEnd, sub.cancel_at_period_end ? 1 : 0, sub.id);
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object;
          cancelSubscription.run(sub.id);
          break;
        }

        default:
          // ignore other events
      }
    } catch (err) {
      console.error('Webhook handler error:', err);
    }

    return res.json({ received: true });
  });

  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..', 'public'), { index: false }));

  const selectAgencyByEmail = db.prepare('SELECT * FROM agencies WHERE email = ?');
  const selectAgencyById = db.prepare(
    'SELECT id, name, email, logo_url, brand_color, created_at FROM agencies WHERE id = ?'
  );
  const insertAgency = db.prepare(
    'INSERT INTO agencies (name, email, password_hash) VALUES (?, ?, ?)'
  );

  // Billing prepared statements
  const insertFreeSubscription = db.prepare(`
    INSERT OR IGNORE INTO subscriptions (agency_id, plan_id, status)
    VALUES (?, 'free', 'active')
  `);
  const selectSubscription = db.prepare('SELECT * FROM subscriptions WHERE agency_id = ?');
  const upsertSubscriptionBilling = db.prepare(`
    INSERT INTO subscriptions (agency_id, stripe_customer_id, stripe_subscription_id, plan_id, status, updated_at)
    VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
    ON CONFLICT(agency_id) DO UPDATE SET
      stripe_customer_id = excluded.stripe_customer_id,
      stripe_subscription_id = excluded.stripe_subscription_id,
      plan_id = excluded.plan_id,
      status = 'active',
      updated_at = CURRENT_TIMESTAMP
  `);

  const requirePlan = createRequirePlan(db);
  const updateAgency = db.prepare(
    'UPDATE agencies SET name = ?, logo_url = ?, brand_color = ? WHERE id = ?'
  );
  const countClientsForAgency = db.prepare(
    'SELECT COUNT(*) AS total FROM clients WHERE agency_id = ? AND archived_at IS NULL'
  );
  const countImportsForAgency = db.prepare(
    `SELECT COUNT(*) AS total
     FROM data_imports di
     INNER JOIN clients c ON c.id = di.client_id
     WHERE c.agency_id = ? AND c.archived_at IS NULL`
  );
  const countReportsForAgency = db.prepare(
    `SELECT COUNT(*) AS total
     FROM reports r
     INNER JOIN clients c ON c.id = r.client_id
     WHERE c.agency_id = ? AND c.archived_at IS NULL`
  );

  const insertClient = db.prepare(
    'INSERT INTO clients (agency_id, name, industry) VALUES (?, ?, ?)'
  );
  const listClients = db.prepare(
    `SELECT id, agency_id, name, industry, created_at, archived_at
     FROM clients
     WHERE agency_id = ? AND archived_at IS NULL
     ORDER BY id DESC`
  );
  const selectClient = db.prepare('SELECT * FROM clients WHERE id = ? AND agency_id = ?');
  const updateClient = db.prepare(
    'UPDATE clients SET name = ?, industry = ? WHERE id = ? AND agency_id = ?'
  );
  const archiveClient = db.prepare(
    'UPDATE clients SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ? AND archived_at IS NULL'
  );

  const insertImport = db.prepare(
    `INSERT INTO data_imports (
      client_id,
      period,
      source_type,
      raw_data_json,
      column_headers_json,
      row_count
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const listImports = db.prepare(
    `SELECT di.id, di.client_id, di.period, di.source_type, di.row_count, di.created_at
     FROM data_imports di
     INNER JOIN clients c ON c.id = di.client_id
     WHERE di.client_id = ? AND c.agency_id = ? AND c.archived_at IS NULL
     ORDER BY di.period DESC, di.id DESC`
  );
  const selectImport = db.prepare(
    `SELECT di.*, c.agency_id, c.archived_at
     FROM data_imports di
     INNER JOIN clients c ON c.id = di.client_id
     WHERE di.id = ? AND di.client_id = ? AND c.agency_id = ?`
  );
  const deleteImport = db.prepare(
    `DELETE FROM data_imports
     WHERE id = ? AND client_id = ? AND client_id IN (
       SELECT id FROM clients WHERE agency_id = ? AND archived_at IS NULL
     )`
  );

  const insertReport = db.prepare(
    `INSERT INTO reports (
      client_id,
      import_id,
      period,
      template_config_json,
      sections_json,
      status
    ) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const listReports = db.prepare(
    `SELECT r.*
     FROM reports r
     INNER JOIN clients c ON c.id = r.client_id
     WHERE r.client_id = ? AND c.agency_id = ? AND c.archived_at IS NULL
     ORDER BY r.created_at DESC, r.id DESC`
  );
  const selectReport = db.prepare(
    `SELECT r.*, c.agency_id, c.archived_at
     FROM reports r
     INNER JOIN clients c ON c.id = r.client_id
     WHERE r.id = ? AND r.client_id = ? AND c.agency_id = ?`
  );
  const updateReport = db.prepare(
    `UPDATE reports
     SET period = ?, template_config_json = ?, sections_json = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND client_id = ?`
  );
  const deleteReport = db.prepare(
    `DELETE FROM reports
     WHERE id = ? AND client_id = ? AND client_id IN (
       SELECT id FROM clients WHERE agency_id = ? AND archived_at IS NULL
     )`
  );

  const insertShareLink = db.prepare(
    `INSERT INTO share_links (report_id, token, expires_at) VALUES (?, ?, ?)`
  );
  const selectLatestShareLinkForReport = db.prepare(
    `SELECT sl.*
     FROM share_links sl
     INNER JOIN reports r ON r.id = sl.report_id
     INNER JOIN clients c ON c.id = r.client_id
     WHERE sl.report_id = ? AND c.agency_id = ? AND c.archived_at IS NULL
     ORDER BY sl.created_at DESC, sl.id DESC
     LIMIT 1`
  );
  const selectShareLinkByToken = db.prepare(
    `SELECT sl.*,
            r.id AS report_id, r.client_id, r.import_id, r.period, r.template_config_json, r.sections_json, r.status, r.created_at AS report_created_at, r.updated_at,
            c.name AS client_name, c.industry AS client_industry, c.archived_at,
            a.id AS agency_id, a.name AS agency_name, a.email AS agency_email, a.logo_url, a.brand_color
     FROM share_links sl
     INNER JOIN reports r ON r.id = sl.report_id
     INNER JOIN clients c ON c.id = r.client_id
     INNER JOIN agencies a ON a.id = c.agency_id
     WHERE sl.token = ?`
  );

  function sanitizeAgency(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      logo_url: row.logo_url,
      brand_color: row.brand_color,
      created_at: row.created_at,
    };
  }

  function serializeImport(row, { includeData = false } = {}) {
    if (!row) return null;

    const base = {
      id: row.id,
      client_id: row.client_id,
      period: row.period,
      source_type: row.source_type,
      row_count: row.row_count,
      created_at: row.created_at,
      column_headers: JSON.parse(row.column_headers_json || '[]'),
    };

    if (includeData) {
      base.raw_data = JSON.parse(row.raw_data_json || '[]');
    }

    return base;
  }

  function serializeReport(row) {
    if (!row) return null;

    return {
      id: row.id,
      client_id: row.client_id,
      import_id: row.import_id,
      period: row.period,
      template_config: JSON.parse(row.template_config_json || '{}'),
      sections: JSON.parse(row.sections_json || '{}'),
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  function requireActiveClient(clientId, agencyId) {
    const client = selectClient.get(clientId, agencyId);
    if (!client || client.archived_at) {
      return null;
    }
    return client;
  }

  function getAuthorizedReport(clientId, reportId, agencyId) {
    const client = requireActiveClient(clientId, agencyId);
    if (!client) {
      return { client: null, report: null };
    }

    const report = selectReport.get(reportId, clientId, agencyId);
    if (!report || report.archived_at) {
      return { client, report: null };
    }

    return { client, report };
  }

  function getShareUrl(token) {
    return `${appBaseUrl}/api/shared/${token}`;
  }

  function isExpired(expiresAt) {
    return Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now();
  }

  function createReportHtmlPayload({ agency, client, report, shareUrl = null, isShared = false }) {
    return buildReportHtml({
      agency: sanitizeAgency(agency) || agency,
      client,
      report: serializeReport(report) || report,
      shareUrl,
      isShared,
    });
  }

  async function renderReportPdf(html) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } });
    } finally {
      await browser.close();
    }
  }

  // ── Billing Routes ──────────────────────────────────────────────────────────

  app.get('/api/billing/plans', (_req, res) => {
    return res.json({ plans: PAID_PLANS });
  });

  app.get('/api/billing/subscription', authMiddleware, (req, res) => {
    const sub = selectSubscription.get(req.auth.sub) || {
      plan_id: 'free',
      status: 'active',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
      cancel_at_period_end: 0,
    };
    const plan = PLANS[sub.plan_id] || PLANS.free;
    const { total: clientCount } = db.prepare(
      'SELECT COUNT(*) AS total FROM clients WHERE agency_id = ? AND archived_at IS NULL'
    ).get(req.auth.sub);

    return res.json({
      subscription: {
        ...sub,
        plan,
        client_count: clientCount,
      },
    });
  });

  app.post('/api/billing/create-checkout-session', authMiddleware, async (req, res) => {
    const { plan_id } = req.body || {};

    const plan = PLANS[plan_id];
    if (!plan || plan.id === 'free') {
      return res.status(400).json({ error: 'Invalid plan_id. Must be "starter" or "pro".' });
    }

    if (!plan.stripe_price_id || plan.stripe_price_id.includes('placeholder')) {
      return res.status(400).json({ error: 'Stripe price ID not configured for this plan. Please create the product in Stripe Dashboard first.' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const agency = selectAgencyById.get(req.auth.sub);

    try {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        customer_email: agency.email,
        metadata: { agency_id: String(req.auth.sub), plan_id: plan.id },
        subscription_data: { trial_period_days: 14 },
        success_url: `${appBaseUrl}/dashboard.html?checkout=success`,
        cancel_url: `${appBaseUrl}/dashboard.html?checkout=cancelled`,
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe checkout error:', err);
      return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
  });

  app.post('/api/billing/create-portal-session', authMiddleware, async (req, res) => {
    const sub = selectSubscription.get(req.auth.sub);
    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found. Please subscribe first.' });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id,
        return_url: `${appBaseUrl}/dashboard.html`,
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe portal error:', err);
      return res.status(500).json({ error: err.message || 'Failed to create portal session' });
    }
  });

  // ── End Billing Routes ───────────────────────────────────────────────────────

  app.get('/', optionalAuthMiddleware, (req, res) => {
    if (req.auth?.sub) {
      return res.redirect('/dashboard.html');
    }
    const htmlPath = path.resolve(__dirname, '..', 'public', 'index.html');
    const fs = require('fs');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(fs.readFileSync(htmlPath, 'utf8'));
  });

  app.post('/api/auth/register', authRateLimiter, async (req, res) => {
    const { email, password, agencyName } = req.body || {};

    if (!email || !password || !agencyName) {
      return res.status(400).json({ error: 'email, password, and agencyName are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (selectAgencyByEmail.get(normalizedEmail)) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = insertAgency.run(agencyName.trim(), normalizedEmail, passwordHash);
    const agency = selectAgencyById.get(result.lastInsertRowid);

    // Auto-create free subscription
    insertFreeSubscription.run(result.lastInsertRowid);

    const token = signToken(agency);

    return res.status(201).json({ token, agency: sanitizeAgency(agency) });
  });

  app.post('/api/auth/login', authRateLimiter, async (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const agency = selectAgencyByEmail.get(normalizedEmail);

    if (!agency) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, agency.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const profile = selectAgencyById.get(agency.id);
    const token = signToken(profile);

    return res.json({ token, agency: sanitizeAgency(profile) });
  });

  app.get('/api/agency', authMiddleware, (req, res) => {
    const agency = selectAgencyById.get(req.auth.sub);
    return res.json({ agency: sanitizeAgency(agency) });
  });

  app.get('/api/analytics', authMiddleware, (req, res) => {
    return res.json({
      analytics: {
        reports_generated: countReportsForAgency.get(req.auth.sub).total,
        clients_count: countClientsForAgency.get(req.auth.sub).total,
        imports_count: countImportsForAgency.get(req.auth.sub).total,
      },
    });
  });

  app.put('/api/agency', authMiddleware, (req, res) => {
    const current = selectAgencyById.get(req.auth.sub);
    if (!current) {
      return res.status(404).json({ error: 'Agency not found' });
    }

    const name = req.body?.name ? String(req.body.name).trim() : current.name;
    const logoUrl = req.body?.logo_url ?? current.logo_url;
    const brandColor = req.body?.brand_color ?? current.brand_color;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    updateAgency.run(name, logoUrl, brandColor, req.auth.sub);
    const updated = selectAgencyById.get(req.auth.sub);
    return res.json({ agency: sanitizeAgency(updated) });
  });

  app.post('/api/clients', authMiddleware, requirePlan, (req, res) => {
    const { name, industry = null } = req.body || {};

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }

    const result = insertClient.run(req.auth.sub, String(name).trim(), industry ? String(industry).trim() : null);
    const client = selectClient.get(result.lastInsertRowid, req.auth.sub);
    return res.status(201).json({ client });
  });

  app.get('/api/clients', authMiddleware, (req, res) => {
    const clients = listClients.all(req.auth.sub);
    return res.json({ clients });
  });

  app.put('/api/clients/:id', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const existing = selectClient.get(clientId, req.auth.sub);

    if (!existing || existing.archived_at) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const name = req.body?.name ? String(req.body.name).trim() : existing.name;
    const industry = req.body?.industry !== undefined ? (req.body.industry ? String(req.body.industry).trim() : null) : existing.industry;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    updateClient.run(name, industry, clientId, req.auth.sub);
    const updated = selectClient.get(clientId, req.auth.sub);
    return res.json({ client: updated });
  });

  app.delete('/api/clients/:id', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const result = archiveClient.run(clientId, req.auth.sub);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    return res.status(204).send();
  });

  app.post('/api/clients/:id/imports/csv', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    upload.single('file')(req, res, async (error) => {
      if (error) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'CSV file must be 5MB or smaller' });
        }
        return res.status(400).json({ error: error.message || 'Upload failed' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'CSV file is required' });
      }

      const period = String(req.body?.period || '').trim();
      if (!period) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'period is required' });
      }

      try {
        const csvText = await fs.promises.readFile(req.file.path, 'utf8');
        const parsed = parseCsvText(csvText);

        const result = insertImport.run(
          clientId,
          period,
          'csv',
          JSON.stringify(parsed.rows),
          JSON.stringify(parsed.headers),
          parsed.rowCount
        );

        const created = selectImport.get(result.lastInsertRowid, clientId, req.auth.sub);
        return res.status(201).json({ import: serializeImport(created, { includeData: true }) });
      } catch (parseError) {
        return res.status(400).json({ error: parseError.message || 'Failed to parse CSV file' });
      } finally {
        fs.unlink(req.file.path, () => {});
      }
    });
  });

  app.post('/api/clients/:id/imports/gsheets', authMiddleware, async (req, res) => {
    const clientId = Number(req.params.id);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const period = String(req.body?.period || '').trim();
    if (!period) {
      return res.status(400).json({ error: 'period is required' });
    }

    let parsedSheet;
    try {
      parsedSheet = parseGoogleSheetInput(req.body?.sheetsUrl || req.body?.sheetId);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!fetchImpl) {
      return res.status(500).json({ error: 'Fetch is not available on this server' });
    }

    try {
      const response = await fetchImpl(parsedSheet.exportUrl);
      if (!response.ok) {
        return res.status(400).json({ error: 'Failed to fetch Google Sheet. Ensure the sheet is public.' });
      }

      const csvText = await response.text();
      const parsed = parseCsvText(csvText);
      const result = insertImport.run(
        clientId,
        period,
        'gsheets',
        JSON.stringify(parsed.rows),
        JSON.stringify(parsed.headers),
        parsed.rowCount
      );

      const created = selectImport.get(result.lastInsertRowid, clientId, req.auth.sub);
      return res.status(201).json({ import: serializeImport(created, { includeData: true }) });
    } catch (error) {
      return res.status(400).json({ error: error.message || 'Failed to import Google Sheet' });
    }
  });

  app.get('/api/clients/:id/imports', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const imports = listImports.all(clientId, req.auth.sub).map((row) => serializeImport(row));
    return res.json({ imports });
  });

  app.get('/api/clients/:id/imports/:importId', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const importId = Number(req.params.importId);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const imported = selectImport.get(importId, clientId, req.auth.sub);
    if (!imported || imported.archived_at) {
      return res.status(404).json({ error: 'Import not found' });
    }

    return res.json({ import: serializeImport(imported, { includeData: true }) });
  });

  app.delete('/api/clients/:id/imports/:importId', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const importId = Number(req.params.importId);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = deleteImport.run(importId, clientId, req.auth.sub);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Import not found' });
    }

    return res.status(204).send();
  });

  app.post('/api/clients/:id/reports/generate', authMiddleware, async (req, res) => {
    const clientId = Number(req.params.id);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const importId = Number(req.body?.import_id);
    const period = String(req.body?.period || '').trim();

    if (!importId || !period) {
      return res.status(400).json({ error: 'import_id and period are required' });
    }

    const importedRow = selectImport.get(importId, clientId, req.auth.sub);
    if (!importedRow || importedRow.archived_at) {
      return res.status(404).json({ error: 'Import not found' });
    }

    const imported = serializeImport(importedRow, { includeData: true });
    const templateConfig = normalizeTemplateConfig(req.body?.template_config);

    try {
      const generated = await reportEngine.generateReport({
        client,
        imported,
        period,
        templateConfig,
      });

      const result = insertReport.run(
        clientId,
        importId,
        period,
        JSON.stringify(generated.template_config),
        JSON.stringify(generated.sections),
        'generated'
      );

      const created = selectReport.get(result.lastInsertRowid, clientId, req.auth.sub);
      return res.status(201).json({ report: serializeReport(created), meta: generated.meta });
    } catch (error) {
      if (error instanceof ReportGenerationError || error?.name === 'ReportGenerationError' || error?.statusCode) {
        return res.status(error.statusCode || 502).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  app.get('/api/clients/:id/reports', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const reports = listReports.all(clientId, req.auth.sub).map((row) => serializeReport(row));
    return res.json({ reports });
  });

  app.get('/api/clients/:id/reports/:reportId', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const { client, report } = getAuthorizedReport(clientId, reportId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.json({ report: serializeReport(report) });
  });

  app.get('/api/clients/:id/reports/:reportId/preview', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const { client, report } = getAuthorizedReport(clientId, reportId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const agency = selectAgencyById.get(req.auth.sub);
    const shareLink = selectLatestShareLinkForReport.get(reportId, req.auth.sub);
    const shareUrl = shareLink && !isExpired(shareLink.expires_at) ? getShareUrl(shareLink.token) : null;
    const html = createReportHtmlPayload({ agency, client, report, shareUrl });

    res.type('html');
    return res.send(html);
  });

  app.get('/api/clients/:id/reports/:reportId/pdf', authMiddleware, async (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const { client, report } = getAuthorizedReport(clientId, reportId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    try {
      const agency = selectAgencyById.get(req.auth.sub);
      const shareLink = selectLatestShareLinkForReport.get(reportId, req.auth.sub);
      const shareUrl = shareLink && !isExpired(shareLink.expires_at) ? getShareUrl(shareLink.token) : null;
      const html = createReportHtmlPayload({ agency, client, report, shareUrl });
      const pdf = await renderReportPdf(html);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=report-${reportId}.pdf`);
      return res.send(pdf);
    } catch (error) {
      return res.status(500).json({ error: error.message || 'Failed to generate PDF' });
    }
  });

  app.post('/api/clients/:id/reports/:reportId/share', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const { client, report } = getAuthorizedReport(clientId, reportId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const expiresInDays = Number(req.body?.expires_in_days || 30);
    const safeDays = Number.isFinite(expiresInDays) && expiresInDays > 0 ? expiresInDays : 30;
    const expiresAt = new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(24).toString('hex');
    insertShareLink.run(reportId, token, expiresAt);

    return res.status(201).json({
      share_link: {
        token,
        url: getShareUrl(token),
        expires_at: expiresAt,
      },
    });
  });

  app.get('/api/shared/:token', (req, res) => {
    const shared = selectShareLinkByToken.get(String(req.params.token || '').trim());

    if (!shared || shared.archived_at || isExpired(shared.expires_at)) {
      if (String(req.headers.accept || '').includes('text/html')) {
        return res.status(404).send(
          renderErrorPage({
            statusCode: 404,
            title: 'Share link not found',
            message: 'This report link is invalid, expired, or no longer available.',
          })
        );
      }
      return res.status(404).send('Not found');
    }

    const html = buildReportHtml({
      agency: {
        id: shared.agency_id,
        name: shared.agency_name,
        email: shared.agency_email,
        logo_url: shared.logo_url,
        brand_color: shared.brand_color,
      },
      client: {
        id: shared.client_id,
        name: shared.client_name,
        industry: shared.client_industry,
      },
      report: serializeReport(shared),
      shareUrl: getShareUrl(shared.token),
      isShared: true,
    });

    res.type('html');
    return res.send(html);
  });

  app.get('/api/clients/:id/reports/:reportId/email-draft', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const { client, report } = getAuthorizedReport(clientId, reportId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    let shareLink = selectLatestShareLinkForReport.get(reportId, req.auth.sub);
    if (!shareLink || isExpired(shareLink.expires_at)) {
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      insertShareLink.run(reportId, token, expiresAt);
      shareLink = { token, expires_at: expiresAt };
    }

    const agency = selectAgencyById.get(req.auth.sub);
    const draft = buildEmailDraft({
      agency,
      client,
      report: serializeReport(report),
      shareUrl: getShareUrl(shareLink.token),
    });

    return res.json({
      email_draft: {
        subject: draft.subject,
        body: draft.body,
        share_url: getShareUrl(shareLink.token),
      },
    });
  });

  app.put('/api/clients/:id/reports/:reportId', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const existing = selectReport.get(reportId, clientId, req.auth.sub);
    if (!existing || existing.archived_at) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const period = req.body?.period ? String(req.body.period).trim() : existing.period;
    const templateConfig = req.body?.template_config
      ? normalizeTemplateConfig(req.body.template_config)
      : JSON.parse(existing.template_config_json || '{}');
    const sections = req.body?.sections || JSON.parse(existing.sections_json || '{}');
    const status = req.body?.status ? String(req.body.status).trim() : 'edited';

    updateReport.run(
      period,
      JSON.stringify(templateConfig),
      JSON.stringify(sections),
      status || 'edited',
      reportId,
      clientId
    );

    const updated = selectReport.get(reportId, clientId, req.auth.sub);
    return res.json({ report: serializeReport(updated) });
  });

  app.delete('/api/clients/:id/reports/:reportId', authMiddleware, (req, res) => {
    const clientId = Number(req.params.id);
    const reportId = Number(req.params.reportId);
    const client = requireActiveClient(clientId, req.auth.sub);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const result = deleteReport.run(reportId, clientId, req.auth.sub);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    return res.status(204).send();
  });

  app.get('/api/report-template/default', authMiddleware, (_req, res) => {
    return res.json({ template_config: DEFAULT_REPORT_TEMPLATE });
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res) => {
    if (isBrowserRequest(req)) {
      return res.status(404).send(
        renderErrorPage({
          statusCode: 404,
          title: 'Page not found',
          message: 'The page you requested does not exist or has moved.',
        })
      );
    }

    return res.status(404).json({ error: 'Not found' });
  });

  app.use((error, req, res, _next) => {
    console.error(error);

    if (res.headersSent) {
      return;
    }

    if (isBrowserRequest(req)) {
      return res.status(500).send(
        renderErrorPage({
          statusCode: 500,
          title: 'Something went wrong',
          message: 'The app hit an unexpected error. Please try again in a moment.',
        })
      );
    }

    return res.status(500).json({ error: 'Internal server error' });
  });

  app.locals.db = db;

  return app;
}

module.exports = {
  createApp,
  MAX_UPLOAD_SIZE_BYTES,
  parseCsvText,
  parseGoogleSheetInput,
};
