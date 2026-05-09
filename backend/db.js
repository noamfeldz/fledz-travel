// db.js — PostgreSQL connection pool + schema init
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  allowExitOnIdle: false,
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
  // ── legacy app tables ─────────────────────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL DEFAULT 'שיחה חדשה',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id         TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      meta       JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Legacy column additions
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 3`);
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS visit_duration_minutes INTEGER`);
  await query(`ALTER TABLE places ADD COLUMN IF NOT EXISTS entry_cost REAL`);
  await query(`ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS pinned_place_ids JSONB NOT NULL DEFAULT '[]'`);
  await query(`ALTER TABLE day_plans ADD COLUMN IF NOT EXISTS pinned_times JSONB NOT NULL DEFAULT '{}'`);
  await query(`ALTER TABLE flights ADD COLUMN IF NOT EXISTS flight_number TEXT NOT NULL DEFAULT ''`);

  // ── auth + multi-trip tables ──────────────────────────────────────────────
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      google_id  TEXT UNIQUE NOT NULL,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT '',
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trips (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT 'הטיול שלנו',
      slug        TEXT UNIQUE,
      destination TEXT NOT NULL DEFAULT '',
      start_date  DATE,
      end_date    DATE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS trip_members (
      trip_id   UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role      TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (trip_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS share_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id    UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      mode       TEXT NOT NULL CHECK (mode IN ('editor', 'viewer')),
      token      TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ
    )
  `);

  // Session table for express-session / connect-pg-simple
  await query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    varchar NOT NULL COLLATE "default",
      "sess"   json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `);
  await query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);

  // ── add trip_id column to legacy tables ───────────────────────────────────
  await query(`ALTER TABLE places         ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE saved_places   ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE visited_places ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE day_plans      ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE flights        ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE hotel          ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);
  await query(`ALTER TABLE trip_config    ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id) ON DELETE CASCADE`);

  // Drop singleton check constraints so multiple hotels/trip_configs can exist (one per trip)
  await query(`ALTER TABLE hotel       DROP CONSTRAINT IF EXISTS hotel_id_check`);
  await query(`ALTER TABLE trip_config DROP CONSTRAINT IF EXISTS trip_config_id_check`);

  // Add unique constraint on trip_id for hotel and trip_config (idempotent via DO block)
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hotel_trip_id_unique') THEN
        ALTER TABLE hotel ADD CONSTRAINT hotel_trip_id_unique UNIQUE (trip_id);
      END IF;
    END $$
  `);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_config_trip_id_unique') THEN
        ALTER TABLE trip_config ADD CONSTRAINT trip_config_trip_id_unique UNIQUE (trip_id);
      END IF;
    END $$
  `);

  // ── seed: default user + trip, backfill existing rows ────────────────────
  const seedGoogleId  = 'seed-user-shiran';
  const seedEmail     = 'shiranfeld@gmail.com';
  const defaultTripId = '00000000-0000-0000-0000-000000000001';

  await query(`
    INSERT INTO users (google_id, email, name)
    VALUES ($1, $2, 'שירן פלד')
    ON CONFLICT (google_id) DO NOTHING
  `, [seedGoogleId, seedEmail]);

  const userRow = await query(`SELECT id FROM users WHERE google_id = $1`, [seedGoogleId]);
  const seedUserId = userRow.rows[0].id;

  // Add slug column if it doesn't exist (idempotent for existing DBs)
  await query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS slug TEXT`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_slug_key') THEN
        ALTER TABLE trips ADD CONSTRAINT trips_slug_key UNIQUE (slug);
      END IF;
    END $$
  `);

  await query(`
    INSERT INTO trips (id, owner_id, name, slug, destination, start_date, end_date)
    VALUES ($1, $2, 'לונדון 2026', 'london-2026', 'London', '2026-06-30', '2026-07-07')
    ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, slug = COALESCE(trips.slug, 'london-2026')
  `, [defaultTripId, seedUserId]);

  await query(`
    INSERT INTO trip_members (trip_id, user_id, role)
    VALUES ($1, $2, 'owner')
    ON CONFLICT (trip_id, user_id) DO NOTHING
  `, [defaultTripId, seedUserId]);

  // Backfill trip_id for rows without one
  await query(`UPDATE places         SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE saved_places   SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE visited_places SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE day_plans      SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE flights        SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE hotel          SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);
  await query(`UPDATE trip_config    SET trip_id = $1 WHERE trip_id IS NULL`, [defaultTripId]);

  // Seed flights (idempotent)
  await query(`
    INSERT INTO flights (id, trip_id, type, flight_date, flight_time, airport, flight_number, transfer_minutes, notes)
    VALUES
      ('flight-iz911', $1, 'departure', '2026-06-30', '12:30', 'TLV → STN (London Stansted)', 'IZ911', 60, 'Economy (Y), מגיע 15:55'),
      ('flight-iz912', $1, 'arrival',   '2026-07-07', '17:10', 'STN (London Stansted) → TLV', 'IZ912', 45, 'Economy (Y), מגיע 08.07 00:05')
    ON CONFLICT (id) DO UPDATE SET
      trip_id          = EXCLUDED.trip_id,
      type             = EXCLUDED.type,
      flight_date      = EXCLUDED.flight_date,
      flight_time      = EXCLUDED.flight_time,
      airport          = EXCLUDED.airport,
      flight_number    = EXCLUDED.flight_number,
      transfer_minutes = EXCLUDED.transfer_minutes,
      notes            = EXCLUDED.notes
  `, [defaultTripId]);

  console.log('✅ Schema ready');
}

module.exports = { query, initSchema, pool };
