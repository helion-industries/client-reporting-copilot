const path = require('path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('./db');
const { authMiddleware, signToken } = require('./auth');

function createApp(options = {}) {
  const app = express();
  const db = options.db || createDatabase();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.resolve(__dirname, '..', 'public')));

  const selectAgencyByEmail = db.prepare(
    'SELECT * FROM agencies WHERE email = ?'
  );
  const selectAgencyById = db.prepare(
    'SELECT id, name, email, logo_url, brand_color, created_at FROM agencies WHERE id = ?'
  );
  const insertAgency = db.prepare(
    'INSERT INTO agencies (name, email, password_hash) VALUES (?, ?, ?)'
  );
  const updateAgency = db.prepare(
    'UPDATE agencies SET name = ?, logo_url = ?, brand_color = ? WHERE id = ?'
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
  const selectClient = db.prepare(
    'SELECT * FROM clients WHERE id = ? AND agency_id = ?'
  );
  const updateClient = db.prepare(
    'UPDATE clients SET name = ?, industry = ? WHERE id = ? AND agency_id = ?'
  );
  const archiveClient = db.prepare(
    'UPDATE clients SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND agency_id = ? AND archived_at IS NULL'
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

  app.post('/api/auth/register', async (req, res) => {
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
    const token = signToken(agency);

    return res.status(201).json({ token, agency: sanitizeAgency(agency) });
  });

  app.post('/api/auth/login', async (req, res) => {
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

  app.post('/api/clients', authMiddleware, (req, res) => {
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

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.locals.db = db;

  return app;
}

module.exports = {
  createApp,
};
