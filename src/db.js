const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.resolve(__dirname, '..', 'data');
const defaultDbPath = path.join(dataDir, 'app.db');

function getDbPath() {
  return process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function createDatabase() {
  const dbPath = getDbPath();
  ensureDir(dbPath);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS agencies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      logo_url TEXT,
      brand_color TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agency_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      industry TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TEXT,
      FOREIGN KEY (agency_id) REFERENCES agencies(id)
    );
  `);

  return db;
}

module.exports = {
  createDatabase,
  getDbPath,
};
