// server.js — fledz-travel REST API
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const connectPg = require('connect-pg-simple');
const { v4: uuidv4 } = require('uuid');

// ── Slug helpers ─────────────────────────────────────────────────────────────
function generateSlug(name, destination) {
  const year = new Date().getFullYear();
  const base = (destination || name || 'trip').toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\s-]/g, '')
    .trim().replace(/\s+/g, '-');
  return `${base}-${year}`;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query, initSchema, pool } = require('./db');

const PgSession = connectPg(session);
const app = express();

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:4173',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,          // needed for session cookies
}));

// ── Session ───────────────────────────────────────────────────────────────────
app.use(session({
  store: new PgSession({ pool, tableName: 'session', createTableIfMissing: false }),
  secret: process.env.SESSION_SECRET || 'fledz-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// ── Passport ──────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, result.rows[0] || null);
  } catch (e) {
    done(e);
  }
});

// Setup Google strategy only when credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const callbackURL = process.env.GOOGLE_CALLBACK_URL ||
    `http://localhost:${process.env.PORT || 3001}/auth/google/callback`;

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL,
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const googleId = profile.id;
      const email    = profile.emails?.[0]?.value || '';
      const name     = profile.displayName || '';
      const avatar   = profile.photos?.[0]?.value || null;

      // Upsert: link real Google ID to existing seed user if same email
      const existing = await query('SELECT id FROM users WHERE email=$1', [email]);
      if (existing.rows.length > 0) {
        await query(
          'UPDATE users SET google_id=$1, name=$2, avatar_url=$3 WHERE email=$4',
          [googleId, name, avatar, email]
        );
        const updated = await query('SELECT * FROM users WHERE email=$1', [email]);
        return done(null, updated.rows[0]);
      }

      // New user
      const result = await query(
        `INSERT INTO users (google_id, email, name, avatar_url)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [googleId, email, name, avatar]
      );
      done(null, result.rows[0]);
    } catch (e) {
      done(e);
    }
  }));
} else {
  console.warn('⚠️  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — OAuth disabled (dev mode)');
}

app.use(express.json({ limit: '4mb' }));

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=auth' }),
  (req, res) => {
    const frontend = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontend}/dashboard`);
  }
);

app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    return res.json({
      id:        req.user.id,
      email:     req.user.email,
      name:      req.user.name,
      avatarUrl: req.user.avatar_url,
    });
  }
  // Dev mode: if Google OAuth not configured, return the seed user
  if (!process.env.GOOGLE_CLIENT_ID) {
    query('SELECT * FROM users WHERE google_id=$1', ['seed-user-shiran'])
      .then((r) => {
        if (r.rows[0]) {
          return res.json({
            id:        r.rows[0].id,
            email:     r.rows[0].email,
            name:      r.rows[0].name,
            avatarUrl: r.rows[0].avatar_url,
          });
        }
        res.status(401).json({ error: 'not authenticated' });
      })
      .catch(() => res.status(401).json({ error: 'not authenticated' }));
    return;
  }
  res.status(401).json({ error: 'not authenticated' });
});

app.post('/auth/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ ok: true });
  });
});

// ── Auth middleware ────────────────────────────────────────────────────────────

async function requireAuth(req, res, next) {
  // Dev mode bypass when Google OAuth is not configured — use real shiranfeld account
  if (!process.env.GOOGLE_CLIENT_ID) {
    if (!req.user) {
      const r = await query("SELECT * FROM users WHERE email='shiranfeld@gmail.com' AND google_id != 'seed-user-shiran' ORDER BY created_at DESC LIMIT 1");
      req.user = r.rows[0] || null;
    }
    return next();
  }
  if (req.isAuthenticated() && req.user) return next();
  res.status(401).json({ error: 'not authenticated' });
}

async function requireTripAccess(minRole = 'viewer') {
  const roleRank = { owner: 3, editor: 2, viewer: 1 };
  return async (req, res, next) => {
    let tripId = req.params.tripId;
    const userId = req.user?.id;
    if (!userId || !tripId) return res.status(403).json({ error: 'forbidden' });

    // Resolve slug → UUID if needed
    if (!UUID_RE.test(tripId)) {
      const row = await query('SELECT id FROM trips WHERE slug=$1', [tripId]);
      if (!row.rows.length) return res.status(404).json({ error: 'trip not found' });
      tripId = row.rows[0].id;
      req.params.tripId = tripId; // rewrite so downstream handlers get UUID
    }

    // Check if this is a public shared trip view (token auth)
    if (req.shareToken) {
      if (minRole === 'viewer') return next();
      const tokenMode = req.shareToken.mode;
      if (roleRank[tokenMode] >= roleRank[minRole]) return next();
      return res.status(403).json({ error: 'insufficient access' });
    }

    const result = await query(
      'SELECT role FROM trip_members WHERE trip_id=$1 AND user_id=$2',
      [tripId, userId]
    );
    if (!result.rows.length) return res.status(403).json({ error: 'forbidden' });
    const role = result.rows[0].role;
    if (roleRank[role] >= roleRank[minRole]) return next();
    res.status(403).json({ error: 'insufficient access' });
  };
}

// ── Auto-resolve tripId slug → UUID for all routes using :tripId ─────────────
app.param('tripId', async (req, res, next, tripId) => {
  if (!UUID_RE.test(tripId)) {
    try {
      const row = await query('SELECT id FROM trips WHERE slug=$1', [tripId]);
      if (!row.rows.length) return res.status(404).json({ error: 'trip not found' });
      req.params.tripId = row.rows[0].id;
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  next();
});

// ── Trips CRUD ────────────────────────────────────────────────────────────────

app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.*, tm.role,
             (SELECT COUNT(*) FROM places WHERE trip_id = t.id) AS place_count
      FROM trips t
      JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = $1
      ORDER BY t.created_at DESC
    `, [req.user.id]);
    res.json(result.rows.map((r) => ({
      id:          r.id,
      slug:        r.slug,
      name:        r.name,
      destination: r.destination,
      startDate:   r.start_date,
      endDate:     r.end_date,
      role:        r.role,
      placeCount:  parseInt(r.place_count, 10),
      createdAt:   r.created_at,
      updatedAt:   r.updated_at,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trips', requireAuth, async (req, res) => {
  try {
    const { name, destination, startDate, endDate } = req.body;
    const tripId = uuidv4();
    // Generate unique slug
    let slug = generateSlug(name, destination);
    const slugExists = await query('SELECT 1 FROM trips WHERE slug=$1', [slug]);
    if (slugExists.rows.length) slug = `${slug}-${tripId.slice(0, 6)}`;
    const result = await query(
      `INSERT INTO trips (id, owner_id, name, slug, destination, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tripId, req.user.id, name || 'הטיול שלנו', slug, destination || '', startDate || null, endDate || null]
    );
    // Add owner to trip_members
    await query(
      'INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,$3)',
      [tripId, req.user.id, 'owner']
    );
    const t = result.rows[0];
    res.status(201).json({ id: t.id, slug: t.slug, name: t.name, destination: t.destination, startDate: t.start_date, endDate: t.end_date, role: 'owner', placeCount: 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/trips/:tripId', requireAuth, async (req, res) => {
  try {
    const { name, destination, startDate, endDate } = req.body;
    const editorCheck = await requireTripAccess('editor');
    await new Promise((resolve, reject) => editorCheck(req, res, (err) => err ? reject(err) : resolve()));
    await query(
      `UPDATE trips SET name=$1, destination=$2, start_date=$3, end_date=$4, updated_at=now()
       WHERE id=$5`,
      [name, destination, startDate || null, endDate || null, req.params.tripId]
    );
    res.json({ ok: true });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

app.delete('/api/trips/:tripId', requireAuth, async (req, res) => {
  try {
    const ownerCheck = await query(
      'SELECT 1 FROM trip_members WHERE trip_id=$1 AND user_id=$2 AND role=$3',
      [req.params.tripId, req.user.id, 'owner']
    );
    if (!ownerCheck.rows.length) return res.status(403).json({ error: 'only owner can delete' });
    await query('DELETE FROM trips WHERE id=$1', [req.params.tripId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Share tokens ──────────────────────────────────────────────────────────────

app.post('/api/trips/:tripId/share', requireAuth, async (req, res) => {
  try {
    const { mode = 'viewer' } = req.body;
    const accessCheck = await requireTripAccess('editor');
    await new Promise((resolve, reject) => accessCheck(req, res, (err) => err ? reject(err) : resolve()));

    // Reuse existing token for same trip+mode if it exists
    const existing = await query(
      'SELECT token FROM share_tokens WHERE trip_id=$1 AND mode=$2',
      [req.params.tripId, mode]
    );
    if (existing.rows.length) {
      return res.json({ token: existing.rows[0].token });
    }
    const token = uuidv4();
    await query(
      'INSERT INTO share_tokens (trip_id, mode, token) VALUES ($1,$2,$3)',
      [req.params.tripId, mode, token]
    );
    res.json({ token });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// Public: resolve share token and return full trip snapshot
app.get('/api/share/:token', async (req, res) => {
  try {
    const tokenRow = await query(
      'SELECT * FROM share_tokens WHERE token=$1',
      [req.params.token]
    );
    if (!tokenRow.rows.length) return res.status(404).json({ error: 'invalid share link' });
    const { trip_id: tripId, mode } = tokenRow.rows[0];

    const [tripResult, places, saved, visited, hotel, plans, config, flights] = await Promise.all([
      query('SELECT * FROM trips WHERE id=$1', [tripId]),
      query('SELECT * FROM places WHERE trip_id=$1 ORDER BY created_at ASC', [tripId]),
      query('SELECT place_id FROM saved_places WHERE trip_id=$1', [tripId]),
      query('SELECT place_id FROM visited_places WHERE trip_id=$1', [tripId]),
      query('SELECT * FROM hotel WHERE trip_id=$1', [tripId]),
      query('SELECT * FROM day_plans WHERE trip_id=$1 ORDER BY sort_order ASC', [tripId]),
      query('SELECT * FROM trip_config WHERE trip_id=$1', [tripId]),
      query('SELECT * FROM flights WHERE trip_id=$1 ORDER BY flight_date ASC, flight_time ASC', [tripId]),
    ]);

    if (!tripResult.rows.length) return res.status(404).json({ error: 'trip not found' });
    const trip = tripResult.rows[0];

    res.json({
      mode,
      tripId,
      trip: { id: trip.id, name: trip.name, destination: trip.destination, startDate: trip.start_date, endDate: trip.end_date },
      places: places.rows.map(rowToPlace),
      savedIds: saved.rows.map((r) => r.place_id),
      visitedIds: visited.rows.map((r) => r.place_id),
      hotel: hotel.rows[0] ? { name: hotel.rows[0].name, address: hotel.rows[0].address, lat: hotel.rows[0].lat, lng: hotel.rows[0].lng } : null,
      dayPlans: plans.rows.map((r) => ({ id: r.id, title: r.title, placeIds: r.place_ids, pinnedPlaceIds: r.pinned_place_ids ?? [], pinnedTimes: r.pinned_times ?? {} })),
      tripConfig: config.rows[0] ? { tripName: config.rows[0].trip_name, dayStartHour: config.rows[0].day_start_hour, dayEndHour: config.rows[0].day_end_hour, lunchBreakStart: config.rows[0].lunch_break_start, lunchBreakEnd: config.rows[0].lunch_break_end, destination: config.rows[0].destination } : null,
      flights: flights.rows.map((r) => ({ id: r.id, type: r.type, flightDate: r.flight_date, flightTime: r.flight_time, airport: r.airport, flightNumber: r.flight_number, transferMinutes: r.transfer_minutes, notes: r.notes })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Authenticated: copy a shared trip to current user's account
app.post('/api/share/:token/copy', requireAuth, async (req, res) => {
  try {
    const tokenRow = await query(
      'SELECT * FROM share_tokens WHERE token=$1',
      [req.params.token]
    );
    if (!tokenRow.rows.length) return res.status(404).json({ error: 'invalid share link' });
    const { trip_id: sourceTripId } = tokenRow.rows[0];

    // Load source trip
    const [srcTrip, srcPlaces, srcSaved, srcVisited, srcHotel, srcPlans, srcConfig, srcFlights] = await Promise.all([
      query('SELECT * FROM trips WHERE id=$1', [sourceTripId]),
      query('SELECT * FROM places WHERE trip_id=$1', [sourceTripId]),
      query('SELECT place_id FROM saved_places WHERE trip_id=$1', [sourceTripId]),
      query('SELECT place_id FROM visited_places WHERE trip_id=$1', [sourceTripId]),
      query('SELECT * FROM hotel WHERE trip_id=$1', [sourceTripId]),
      query('SELECT * FROM day_plans WHERE trip_id=$1 ORDER BY sort_order ASC', [sourceTripId]),
      query('SELECT * FROM trip_config WHERE trip_id=$1', [sourceTripId]),
      query('SELECT * FROM flights WHERE trip_id=$1 ORDER BY flight_date ASC', [sourceTripId]),
    ]);

    if (!srcTrip.rows.length) return res.status(404).json({ error: 'source trip not found' });
    const src = srcTrip.rows[0];

    // Create new trip for this user
    const newTripId = uuidv4();
    await query(
      `INSERT INTO trips (id, owner_id, name, destination, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [newTripId, req.user.id, src.name, src.destination, src.start_date, src.end_date]
    );
    await query('INSERT INTO trip_members (trip_id, user_id, role) VALUES ($1,$2,$3)',
      [newTripId, req.user.id, 'owner']);

    // Build old→new place ID map for day plans
    const placeIdMap = {};
    for (const p of srcPlaces.rows) {
      const newPlaceId = `${p.id}-copy-${Date.now()}`;
      placeIdMap[p.id] = newPlaceId;
      await query(
        `INSERT INTO places
           (id,trip_id,name,short_description,address,opening_hours,type,area,rating,tips,
            image_url,source_url,instagram_url,station,lat,lng,website_url,phone_number,
            google_maps_url,google_place_id,business_status,priority,visit_duration_minutes,entry_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [newPlaceId, newTripId, p.name, p.short_description, p.address, p.opening_hours,
         p.type, p.area, p.rating, p.tips, p.image_url, p.source_url, p.instagram_url,
         p.station, p.lat, p.lng, p.website_url, p.phone_number, p.google_maps_url,
         p.google_place_id, p.business_status, p.priority, p.visit_duration_minutes, p.entry_cost]
      );
    }

    // Copy saved/visited
    for (const r of srcSaved.rows) {
      const newId = placeIdMap[r.place_id];
      if (newId) await query('INSERT INTO saved_places (place_id, trip_id) VALUES ($1,$2)', [newId, newTripId]);
    }
    for (const r of srcVisited.rows) {
      const newId = placeIdMap[r.place_id];
      if (newId) await query('INSERT INTO visited_places (place_id, trip_id) VALUES ($1,$2)', [newId, newTripId]);
    }

    // Copy hotel
    if (srcHotel.rows[0]) {
      const h = srcHotel.rows[0];
      await query(`INSERT INTO hotel (name, address, lat, lng, trip_id) VALUES ($1,$2,$3,$4,$5)`,
        [h.name, h.address, h.lat, h.lng, newTripId]);
    }

    // Copy day plans (remap place IDs)
    for (let i = 0; i < srcPlans.rows.length; i++) {
      const p = srcPlans.rows[i];
      const newPlaceIds = (p.place_ids || []).map((id) => placeIdMap[id]).filter(Boolean);
      const newPinnedIds = (p.pinned_place_ids || []).map((id) => placeIdMap[id]).filter(Boolean);
      const newPinnedTimes = Object.fromEntries(Object.entries(p.pinned_times || {}).map(([id, t]) => [placeIdMap[id], t]).filter(([id]) => id));
      await query(
        'INSERT INTO day_plans (id, trip_id, title, place_ids, pinned_place_ids, pinned_times, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [`${p.id}-copy-${newTripId.slice(0,8)}`, newTripId, p.title, JSON.stringify(newPlaceIds), JSON.stringify(newPinnedIds), JSON.stringify(newPinnedTimes), i]
      );
    }

    // Copy trip config
    if (srcConfig.rows[0]) {
      const c = srcConfig.rows[0];
      await query(
        `INSERT INTO trip_config (trip_id, trip_name, day_start_hour, day_end_hour, lunch_break_start, lunch_break_end, destination)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [newTripId, c.trip_name, c.day_start_hour, c.day_end_hour, c.lunch_break_start, c.lunch_break_end, c.destination]
      );
    }

    // Copy flights
    for (const f of srcFlights.rows) {
      await query(
        'INSERT INTO flights (id, trip_id, type, flight_date, flight_time, airport, flight_number, transfer_minutes, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [`flight-${uuidv4().slice(0,8)}`, newTripId, f.type, f.flight_date, f.flight_time, f.airport, f.flight_number, f.transfer_minutes, f.notes]
      );
    }

    res.status(201).json({ tripId: newTripId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Gemini helpers ────────────────────────────────────────────────────────────

function getGeminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in backend/.env');
  return new GoogleGenerativeAI(key);
}

function defaultDurationByType(type) {
  switch (type) {
    case 'מוזיאון': return 150;
    case 'פארק': return 90;
    case 'אוכל': return 75;
    case 'ילדים': return 120;
    default: return 120;
  }
}

function buildTripContext({ places, hotel, dayPlans, tripConfig, flights, visitedIds }) {
  const visitedSet = new Set(visitedIds || []);
  const destination = tripConfig?.destination || 'יעד לא הוגדר';
  const placesInfo = (places || []).map((p) => ({
    id: p.id, name: p.name, type: p.type, area: p.area || 'לא ידוע',
    station: p.station || '', openingHours: p.openingHours || 'לא ידוע',
    visitDurationMins: p.visitDurationMinutes || defaultDurationByType(p.type),
    priority: p.priority || 3,
    entryCost: p.entryCost != null ? `${p.entryCost}` : 'לא ידוע',
    lat: p.lat, lng: p.lng, isVisited: visitedSet.has(p.id),
  }));
  const currentPlan = (dayPlans || []).map((d) => ({
    day: d.title, id: d.id, places: d.placeIds || [], pinned: d.pinnedPlaceIds || [],
    pinnedTimes: d.pinnedTimes || {},
  }));
  const flightsInfo = (flights || []).map((f) => ({
    type: f.type === 'arrival' ? 'נחיתה' : 'המראה',
    date: f.flightDate, time: f.flightTime, airport: f.airport,
    transferToHotelMins: f.transferMinutes, notes: f.notes,
  }));
  const startH = tripConfig?.dayStartHour ?? 9;
  const endH = tripConfig?.dayEndHour ?? 21;
  const lunchS = tripConfig?.lunchBreakStart ?? 13;
  const lunchE = tripConfig?.lunchBreakEnd ?? 15;
  return [
    '## מידע על הטיול',
    `יעד: ${destination}`,
    `מלון: ${hotel?.name || 'לא הוגדר'} (${hotel?.address || ''})`,
    `שעות פעילות יומי: ${startH}:00-${endH}:00`,
    `הפסקת צהריים: ${lunchS}:00-${lunchE}:00`,
    '',
    '## טיסות',
    flightsInfo.length ? JSON.stringify(flightsInfo, null, 2) : 'לא הוזנו טיסות',
    '',
    `## המקומות (${placesInfo.length} סה"כ)`,
    JSON.stringify(placesInfo, null, 2),
    '',
    '## התוכנית הנוכחית',
    JSON.stringify(currentPlan, null, 2),
  ].join('\n');
}

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToPlace(r) {
  return {
    id: r.id,
    name: r.name,
    shortDescription: r.short_description,
    address: r.address,
    openingHours: r.opening_hours,
    type: r.type,
    area: r.area,
    rating: r.rating ?? undefined,
    tips: r.tips ?? [],
    imageUrl: r.image_url,
    sourceUrl: r.source_url ?? undefined,
    instagramUrl: r.instagram_url ?? undefined,
    station: r.station ?? undefined,
    lat: r.lat,
    lng: r.lng,
    websiteUrl: r.website_url ?? undefined,
    phoneNumber: r.phone_number ?? undefined,
    googleMapsUrl: r.google_maps_url ?? undefined,
    googlePlaceId: r.google_place_id ?? undefined,
    businessStatus: r.business_status ?? undefined,
    priority: r.priority ?? 3,
    visitDurationMinutes: r.visit_duration_minutes ?? undefined,
    entryCost: r.entry_cost ?? undefined,
  };
}

function placeToRow(p) {
  return [
    p.id,
    p.name,
    p.shortDescription ?? '',
    p.address ?? '',
    p.openingHours ?? '',
    p.type ?? 'אטרקציה',
    p.area ?? '',
    p.rating ?? null,
    JSON.stringify(p.tips ?? []),
    p.imageUrl ?? '',
    p.sourceUrl ?? null,
    p.instagramUrl ?? null,
    p.station ?? null,
    p.lat,
    p.lng,
    p.websiteUrl ?? null,
    p.phoneNumber ?? null,
    p.googleMapsUrl ?? null,
    p.googlePlaceId ?? null,
    p.businessStatus ?? null,
    p.priority ?? 3,
    p.visitDurationMinutes ?? null,
    p.entryCost ?? null,
  ];
}

// ── places ───────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/places', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM places WHERE trip_id=$1 ORDER BY created_at ASC', [req.params.tripId]);
    res.json(result.rows.map(rowToPlace));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trips/:tripId/places', requireAuth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.id) p.id = `place-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const vals = [req.params.tripId, ...placeToRow(p)];
    await query(
      `INSERT INTO places
         (trip_id,id,name,short_description,address,opening_hours,type,area,rating,tips,
          image_url,source_url,instagram_url,station,lat,lng,website_url,
          phone_number,google_maps_url,google_place_id,business_status,
          priority,visit_duration_minutes,entry_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         name=$3, short_description=$4, address=$5, opening_hours=$6, type=$7,
         area=$8, rating=$9, tips=$10, image_url=$11, source_url=$12,
         instagram_url=$13, station=$14, lat=$15, lng=$16, website_url=$17,
         phone_number=$18, google_maps_url=$19, google_place_id=$20,
         business_status=$21, priority=$22, visit_duration_minutes=$23,
         entry_cost=$24, updated_at=now()`,
      vals
    );
    const row = await query('SELECT * FROM places WHERE id=$1', [p.id]);
    res.status(201).json(rowToPlace(row.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/trips/:tripId/places/:id', requireAuth, async (req, res) => {
  try {
    const p = { ...req.body, id: req.params.id };
    const vals = [req.params.tripId, ...placeToRow(p)];
    await query(
      `INSERT INTO places
         (trip_id,id,name,short_description,address,opening_hours,type,area,rating,tips,
          image_url,source_url,instagram_url,station,lat,lng,website_url,
          phone_number,google_maps_url,google_place_id,business_status,
          priority,visit_duration_minutes,entry_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       ON CONFLICT (id) DO UPDATE SET
         name=$3, short_description=$4, address=$5, opening_hours=$6, type=$7,
         area=$8, rating=$9, tips=$10, image_url=$11, source_url=$12,
         instagram_url=$13, station=$14, lat=$15, lng=$16, website_url=$17,
         phone_number=$18, google_maps_url=$19, google_place_id=$20,
         business_status=$21, priority=$22, visit_duration_minutes=$23,
         entry_cost=$24, updated_at=now()`,
      vals
    );
    const row = await query('SELECT * FROM places WHERE id=$1', [req.params.id]);
    res.json(rowToPlace(row.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/trips/:tripId/places/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM places WHERE id=$1 AND trip_id=$2', [req.params.id, req.params.tripId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/trips/:tripId/places/bulk', requireAuth, async (req, res) => {
  try {
    const places = req.body;
    if (!Array.isArray(places)) return res.status(400).json({ error: 'expected array' });
    let inserted = 0;
    for (const p of places) {
      if (!p.id) p.id = `place-${Date.now()}-${uuidv4().slice(0, 6)}`;
      const vals = [req.params.tripId, ...placeToRow(p)];
      await query(
        `INSERT INTO places
           (trip_id,id,name,short_description,address,opening_hours,type,area,rating,tips,
            image_url,source_url,instagram_url,station,lat,lng,website_url,
            phone_number,google_maps_url,google_place_id,business_status,
            priority,visit_duration_minutes,entry_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
         ON CONFLICT (id) DO NOTHING`,
        vals
      );
      inserted++;
    }
    res.json({ inserted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Legacy routes (backward compat for old frontend)
app.get('/api/places', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM places ORDER BY created_at ASC');
    res.json(result.rows.map(rowToPlace));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/places', async (req, res) => {
  try {
    const p = req.body;
    if (!p.id) p.id = `place-${Date.now()}-${uuidv4().slice(0, 6)}`;
    const vals = placeToRow(p);
    await query(
      `INSERT INTO places
         (id,name,short_description,address,opening_hours,type,area,rating,tips,
          image_url,source_url,instagram_url,station,lat,lng,website_url,
          phone_number,google_maps_url,google_place_id,business_status,
          priority,visit_duration_minutes,entry_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, short_description=$3, address=$4, opening_hours=$5, type=$6,
         area=$7, rating=$8, tips=$9, image_url=$10, source_url=$11,
         instagram_url=$12, station=$13, lat=$14, lng=$15, website_url=$16,
         phone_number=$17, google_maps_url=$18, google_place_id=$19,
         business_status=$20, priority=$21, visit_duration_minutes=$22,
         entry_cost=$23, updated_at=now()`,
      vals
    );
    const row = await query('SELECT * FROM places WHERE id=$1', [p.id]);
    res.status(201).json(rowToPlace(row.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/places/:id', async (req, res) => {
  try {
    const p = { ...req.body, id: req.params.id };
    const vals = placeToRow(p);
    await query(
      `INSERT INTO places
         (id,name,short_description,address,opening_hours,type,area,rating,tips,
          image_url,source_url,instagram_url,station,lat,lng,website_url,
          phone_number,google_maps_url,google_place_id,business_status,
          priority,visit_duration_minutes,entry_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, short_description=$3, address=$4, opening_hours=$5, type=$6,
         area=$7, rating=$8, tips=$9, image_url=$10, source_url=$11,
         instagram_url=$12, station=$13, lat=$14, lng=$15, website_url=$16,
         phone_number=$17, google_maps_url=$18, google_place_id=$19,
         business_status=$20, priority=$21, visit_duration_minutes=$22,
         entry_cost=$23, updated_at=now()`,
      vals
    );
    const row = await query('SELECT * FROM places WHERE id=$1', [req.params.id]);
    res.json(rowToPlace(row.rows[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/places/:id', async (req, res) => {
  try {
    await query('DELETE FROM places WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── bulk import ───────────────────────────────────────────────────────────────

app.post('/api/places/bulk', async (req, res) => {
  try {
    const places = req.body;
    if (!Array.isArray(places)) return res.status(400).json({ error: 'expected array' });
    let inserted = 0;
    for (const p of places) {
      if (!p.id) p.id = `place-${Date.now()}-${uuidv4().slice(0, 6)}`;
      const vals = placeToRow(p);
      await query(
        `INSERT INTO places
           (id,name,short_description,address,opening_hours,type,area,rating,tips,
            image_url,source_url,instagram_url,station,lat,lng,website_url,
            phone_number,google_maps_url,google_place_id,business_status,
            priority,visit_duration_minutes,entry_cost)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         ON CONFLICT (id) DO NOTHING`,
        vals
      );
      inserted++;
    }
    res.json({ inserted });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── saved ─────────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/saved', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT place_id FROM saved_places WHERE trip_id=$1', [req.params.tripId]);
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trips/:tripId/saved', requireAuth, async (req, res) => {
  try {
    const ids = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM saved_places WHERE trip_id=$1', [req.params.tripId]);
    for (const id of ids) {
      await query('INSERT INTO saved_places (place_id, trip_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.params.tripId]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy
app.get('/api/saved', async (_req, res) => {
  try {
    const result = await query('SELECT place_id FROM saved_places');
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── visited ───────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/visited', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT place_id FROM visited_places WHERE trip_id=$1', [req.params.tripId]);
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trips/:tripId/visited', requireAuth, async (req, res) => {
  try {
    const ids = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM visited_places WHERE trip_id=$1', [req.params.tripId]);
    for (const id of ids) {
      await query('INSERT INTO visited_places (place_id, trip_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.params.tripId]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy
app.get('/api/visited', async (_req, res) => {
  try {
    const result = await query('SELECT place_id FROM visited_places');
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/visited', async (_req, res) => res.json({ ok: true }));

// ── hotel ─────────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/hotel', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM hotel WHERE trip_id=$1', [req.params.tripId]);
    res.json(result.rows[0] ? { name: result.rows[0].name, address: result.rows[0].address, lat: result.rows[0].lat, lng: result.rows[0].lng } : null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trips/:tripId/hotel', requireAuth, async (req, res) => {
  try {
    const { name, address, lat, lng } = req.body;
    await query(
      `INSERT INTO hotel (trip_id, name, address, lat, lng)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (trip_id) DO UPDATE SET name=$2, address=$3, lat=$4, lng=$5`,
      [req.params.tripId, name, address, lat, lng]
    );
    res.json({ name, address, lat, lng });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy
app.get('/api/hotel', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM hotel WHERE id=1');
    res.json(result.rows[0] ?? null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/hotel', async (_req, res) => res.json({ ok: true }));

// ── day plans ─────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/plans', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM day_plans WHERE trip_id=$1 ORDER BY sort_order ASC', [req.params.tripId]);
    res.json(result.rows.map((r) => ({ id: r.id, title: r.title, placeIds: r.place_ids, pinnedPlaceIds: r.pinned_place_ids ?? [], pinnedTimes: r.pinned_times ?? {} })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trips/:tripId/plans', requireAuth, async (req, res) => {
  try {
    const plans = req.body;
    if (!Array.isArray(plans)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM day_plans WHERE trip_id=$1', [req.params.tripId]);
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      await query(
        `INSERT INTO day_plans (id, trip_id, title, place_ids, pinned_place_ids, pinned_times, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, req.params.tripId, p.title, JSON.stringify(p.placeIds ?? []), JSON.stringify(p.pinnedPlaceIds ?? []), JSON.stringify(p.pinnedTimes ?? {}), i]
      );
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── trip config ───────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/trip-config', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM trip_config WHERE trip_id=$1', [req.params.tripId]);
    if (!result.rows[0]) return res.json({ tripName: 'הטיול שלנו', dayStartHour: 9, dayEndHour: 21, lunchBreakStart: 13, lunchBreakEnd: 15, destination: '' });
    const r = result.rows[0];
    res.json({ tripName: r.trip_name, dayStartHour: r.day_start_hour, dayEndHour: r.day_end_hour, lunchBreakStart: r.lunch_break_start, lunchBreakEnd: r.lunch_break_end, destination: r.destination });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/trips/:tripId/trip-config', requireAuth, async (req, res) => {
  try {
    const { tripName, dayStartHour, dayEndHour, lunchBreakStart, lunchBreakEnd, destination } = req.body;
    await query(
      `INSERT INTO trip_config (trip_id, trip_name, day_start_hour, day_end_hour, lunch_break_start, lunch_break_end, destination)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (trip_id) DO UPDATE SET trip_name=$2, day_start_hour=$3, day_end_hour=$4, lunch_break_start=$5, lunch_break_end=$6, destination=$7`,
      [req.params.tripId, tripName ?? 'הטיול שלנו', dayStartHour ?? 9, dayEndHour ?? 21, lunchBreakStart ?? 13, lunchBreakEnd ?? 15, destination ?? '']
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── flights ───────────────────────────────────────────────────────────────────

app.get('/api/trips/:tripId/flights', requireAuth, async (req, res) => {
  try {
    const result = await query('SELECT * FROM flights WHERE trip_id=$1 ORDER BY flight_date ASC, flight_time ASC', [req.params.tripId]);
    res.json(result.rows.map((r) => ({ id: r.id, type: r.type, flightDate: r.flight_date, flightTime: r.flight_time, airport: r.airport, flightNumber: r.flight_number || undefined, transferMinutes: r.transfer_minutes, notes: r.notes })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/trips/:tripId/flights', requireAuth, async (req, res) => {
  try {
    const f = req.body;
    const id = f.id || `flight-${uuidv4().slice(0, 8)}`;
    await query(
      `INSERT INTO flights (id, trip_id, type, flight_date, flight_time, airport, flight_number, transfer_minutes, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET trip_id=$2, type=$3, flight_date=$4, flight_time=$5, airport=$6, flight_number=$7, transfer_minutes=$8, notes=$9`,
      [id, req.params.tripId, f.type, f.flightDate, f.flightTime, f.airport ?? '', f.flightNumber ?? '', f.transferMinutes ?? 45, f.notes ?? '']
    );
    res.status(201).json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/trips/:tripId/flights/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM flights WHERE id=$1 AND trip_id=$2', [req.params.id, req.params.tripId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Legacy
app.get('/api/plans', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM day_plans ORDER BY sort_order ASC');
    res.json(result.rows.map((r) => ({ id: r.id, title: r.title, placeIds: r.place_ids, pinnedPlaceIds: r.pinned_place_ids ?? [], pinnedTimes: r.pinned_times ?? {} })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/plans', async (_req, res) => res.json({ ok: true }));
app.get('/api/trip-config', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM trip_config WHERE trip_id=$1', ['00000000-0000-0000-0000-000000000001']);
    if (!result.rows[0]) return res.json({ tripName: 'הטיול שלנו', dayStartHour: 9, dayEndHour: 21, lunchBreakStart: 13, lunchBreakEnd: 15, destination: '' });
    const r = result.rows[0];
    res.json({ tripName: r.trip_name, dayStartHour: r.day_start_hour, dayEndHour: r.day_end_hour, lunchBreakStart: r.lunch_break_start, lunchBreakEnd: r.lunch_break_end, destination: r.destination });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/trip-config', async (_req, res) => res.json({ ok: true }));
app.get('/api/flights', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM flights ORDER BY flight_date ASC, flight_time ASC');
    res.json(result.rows.map((r) => ({ id: r.id, type: r.type, flightDate: r.flight_date, flightTime: r.flight_time, airport: r.airport, flightNumber: r.flight_number || undefined, transferMinutes: r.transfer_minutes, notes: r.notes })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/flights', async (_req, res) => res.json({ ok: true }));
app.delete('/api/flights/:id', async (_req, res) => res.json({ ok: true }));

// ── AI: plan ──────────────────────────────────────────────────────────────────

app.post('/api/trips/:tripId/ai/plan', requireAuth, async (req, res) => {
  try {
    const genAI = getGeminiClient();
    const { places, hotel, dayPlans, tripConfig, flights, visitedIds } = req.body;
    const systemContext = buildTripContext({ places, hotel, dayPlans, tripConfig, flights, visitedIds });
    const startH = tripConfig?.dayStartHour ?? 9;
    const endH = tripConfig?.dayEndHour ?? 21;
    const lunchS = tripConfig?.lunchBreakStart ?? 13;
    const lunchE = tripConfig?.lunchBreakEnd ?? 15;
    const prompt = [
      'אתה מתכנן טיולים חכם. קיבלת את כל המידע על הטיול הבא.',
      'המשימה: חשב תוכנית יום-יום אופטימלית.',
      '',
      'חוקים:',
      `1. כבד שעות פעילות יומית (${startH}:00-${endH}:00)`,
      `2. שמור הפסקת צהריים ${lunchS}:00-${lunchE}:00`,
      '3. אל תעמיס יותר מקומות ממה שיש זמן (כולל זמני נסיעה)',
      '4. עדיפות 5 נכנסת ראשונה, עדיפות 1 אחרונה',
      '5. קבץ לפי אזור גיאוגרפי',
      '6. אוכל בבוקר = ארוחת בוקר/קפה, אוכל בצהריים/ערב = מסעדה',
      '7. ביום ראשון/אחרון עם טיסה — פחות מקומות',
      '8. מקומות עם isVisited=true — אל תכלול שוב',
      '9. מקומות מעוגנים (pinned) — שמור ביום שלהם. אם pinnedTimes מכיל שעה עבור המקום — תכנן שהגעה תהיה לפני אותה שעה (כולל זמן נסיעה). שאר מקומות היום יסתדרו סביב השעה הזו',
      '10. אם יש 2 מקומות דומים מאוד — ציין בהמלצות',
      '',
      systemContext,
      '',
      'החזר JSON בלבד (ללא markdown, ללא טקסט נוסף):',
      '{"plan":{"day-1":["id1","id2"],"day-2":["id3"]},"excluded":[{"placeId":"id","reason":"סיבה"}],"recommendations":["המלצה 1"],"summary":"סיכום קצר"}',
    ].join('\n');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) text = jsonMatch[1].trim();
    res.json(JSON.parse(text));
  } catch (e) {
    console.error('AI plan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── AI: chat ──────────────────────────────────────────────────────────────────

app.post('/api/trips/:tripId/ai/chat', requireAuth, async (req, res) => {
  try {
    const genAI = getGeminiClient();
    const { message, history, places, hotel, dayPlans, tripConfig, flights, visitedIds } = req.body;
    const systemContext = buildTripContext({ places, hotel, dayPlans, tripConfig, flights, visitedIds });
    const systemPrompt = [
      'אתה עוזר טיולים חכם ואישי. יש לך גישה לכל המידע על הטיול.',
      'ענה תמיד בעברית. היה קצר, ברור ומועיל. אפשר להשתמש ב-emoji.',
      '',
      systemContext,
    ].join('\n');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'הבנתי! אני כאן לעזור עם תכנון הטיול 🗺️' }] },
        ...(history || []).map((msg) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        })),
      ],
    });
    const result = await chat.sendMessage(message);
    res.json({ reply: result.response.text() });
  } catch (e) {
    console.error('AI chat error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Legacy AI routes
app.post('/api/ai/plan', async (req, res) => res.status(400).json({ error: 'use /api/trips/:tripId/ai/plan' }));
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  try {
    const genAI = getGeminiClient();
    const { message, history, places, hotel, dayPlans, tripConfig, flights, visitedIds } = req.body;
    const systemContext = buildTripContext({ places, hotel, dayPlans, tripConfig, flights, visitedIds });
    const systemPrompt = ['אתה עוזר טיולים חכם ואישי. יש לך גישה לכל המידע על הטיול.', 'ענה תמיד בעברית. היה קצר, ברור ומועיל. אפשר להשתמש ב-emoji.', '', systemContext].join('\n');
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const chat = model.startChat({ history: [{ role: 'user', parts: [{ text: systemPrompt }] }, { role: 'model', parts: [{ text: 'הבנתי! אני כאן לעזור עם תכנון הטיול 🗺️' }] }, ...(history || []).map((msg) => ({ role: msg.role === 'user' ? 'user' : 'model', parts: [{ text: msg.content }] }))] });
    const result = await chat.sendMessage(message);
    res.json({ reply: result.response.text() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Chat sessions ─────────────────────────────────────────────────────────────

app.get('/api/chat/sessions', async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.id, s.title, s.created_at, s.updated_at,
             (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) AS last_message,
             (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id)::int AS message_count
      FROM chat_sessions s
      ORDER BY s.updated_at DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat/sessions', async (req, res) => {
  try {
    const id = uuidv4();
    const title = req.body?.title || 'שיחה חדשה';
    const { rows } = await query(
      `INSERT INTO chat_sessions (id, title) VALUES ($1, $2) RETURNING *`,
      [id, title]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chat/sessions/:id/messages', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, session_id, role, content, meta, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/chat/sessions/:id', async (req, res) => {
  try {
    const { title } = req.body;
    await query(`UPDATE chat_sessions SET title = $2, updated_at = now() WHERE id = $1`, [req.params.id, title]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/chat/sessions/:id', async (req, res) => {
  try {
    await query(`DELETE FROM chat_sessions WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Persist a plan result as a chat message (called after AI plan)
app.post('/api/chat/sessions/:id/plan-message', async (req, res) => {
  try {
    const { userMessage, assistantText, planData } = req.body;
    const sessionId = req.params.id;
    const userMsgId = uuidv4();
    const asstMsgId = uuidv4();
    await query(
      `INSERT INTO chat_messages (id, session_id, role, content) VALUES ($1,$2,'user',$3)`,
      [userMsgId, sessionId, userMessage]
    );
    await query(
      `INSERT INTO chat_messages (id, session_id, role, content, meta) VALUES ($1,$2,'assistant',$3,$4)`,
      [asstMsgId, sessionId, assistantText, JSON.stringify({ planData })]
    );
    await query(
      `UPDATE chat_sessions SET updated_at = now(), title = CASE WHEN title = 'שיחה חדשה' THEN $2 ELSE title END WHERE id = $1`,
      [sessionId, 'תכנון AI אוטומטי']
    );
    res.json({ ok: true, userMsgId, asstMsgId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── start ─────────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const PORT = process.env.PORT || 3001;

initSchema()
  .then(() => {
    const httpServer = app.listen(PORT, () =>
      console.log(`🚀 fledz-api running on http://localhost:${PORT}`)
    );
    httpServer.on('error', (err) => {
      console.error('Server listen error:', err.message);
      process.exit(1);
    });
    // Keep the event loop alive
    setInterval(() => {}, 1 << 30);
  })
  .catch((e) => {
    console.error('Failed to init schema:', e);
    console.error(e.stack);
    process.exit(1);
  });
