// db.js — PostgreSQL connection pool
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

pool.on('error', (err) => {
  console.warn('PG pool error:', err.message);
});

async function query(text, params) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS places (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      short_description TEXT NOT NULL DEFAULT '',
      address       TEXT NOT NULL DEFAULT '',
      opening_hours TEXT NOT NULL DEFAULT '',
      type          TEXT NOT NULL DEFAULT 'אטרקציה',
      area          TEXT NOT NULL DEFAULT '',
      rating        REAL,
      tips          JSONB NOT NULL DEFAULT '[]',
      image_url     TEXT NOT NULL DEFAULT '',
      source_url    TEXT,
      instagram_url TEXT,
      station       TEXT,
      lat           REAL NOT NULL DEFAULT 0,
      lng           REAL NOT NULL DEFAULT 0,
      website_url   TEXT,
      phone_number  TEXT,
      google_maps_url TEXT,
      google_place_id TEXT,
      business_status TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS saved_places (
      place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS hotel (
      id      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      name    TEXT NOT NULL,
      address TEXT NOT NULL,
      lat     REAL NOT NULL,
      lng     REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS day_plans (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL,
      place_ids JSONB NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);
  console.log('✅ Schema ready');
}

module.exports = { query, initSchema, pool };
