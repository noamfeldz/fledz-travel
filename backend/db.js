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

    CREATE TABLE IF NOT EXISTS trip_config (
      id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      trip_name           TEXT NOT NULL DEFAULT 'הטיול שלנו',
      day_start_hour      REAL NOT NULL DEFAULT 9,
      day_end_hour        REAL NOT NULL DEFAULT 21,
      lunch_break_start   REAL NOT NULL DEFAULT 13,
      lunch_break_end     REAL NOT NULL DEFAULT 15,
      destination         TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS flights (
      id               TEXT PRIMARY KEY,
      type             TEXT NOT NULL CHECK (type IN ('arrival','departure')),
      flight_date      DATE NOT NULL,
      flight_time      TEXT NOT NULL,
      airport          TEXT NOT NULL DEFAULT '',
      transfer_minutes INTEGER NOT NULL DEFAULT 45,
      notes            TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS visited_places (
      place_id TEXT PRIMARY KEY REFERENCES places(id) ON DELETE CASCADE
    );
  `);

  // Migrate existing tables: add columns if they don't exist yet
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 3`);
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS visit_duration_minutes INTEGER`);
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS entry_cost REAL`);
  await query(`ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS pinned_place_ids JSONB NOT NULL DEFAULT '[]'`);
  await query(`ALTER TABLE flights ADD COLUMN IF NOT EXISTS flight_number TEXT NOT NULL DEFAULT ''`);

  // Seed: trip flights (idempotent — ON CONFLICT DO UPDATE)
  await query(`
    INSERT INTO flights (id, type, flight_date, flight_time, airport, flight_number, transfer_minutes, notes)
    VALUES
      ('flight-iz911', 'departure', '2026-06-30', '12:30', 'TLV → STN (London Stansted)', 'IZ911', 60, 'Economy (Y), מגיע 15:55'),
      ('flight-iz912', 'arrival',   '2026-07-07', '17:10', 'STN (London Stansted) → TLV', 'IZ912', 45, 'Economy (Y), מגיע 08.07 00:05')
    ON CONFLICT (id) DO UPDATE
      SET type             = EXCLUDED.type,
          flight_date      = EXCLUDED.flight_date,
          flight_time      = EXCLUDED.flight_time,
          airport          = EXCLUDED.airport,
          flight_number    = EXCLUDED.flight_number,
          transfer_minutes = EXCLUDED.transfer_minutes,
          notes            = EXCLUDED.notes
  `);

  console.log('✅ Schema ready');
}

module.exports = { query, initSchema, pool };
