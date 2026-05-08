// server.js — fledz-travel REST API
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { query, initSchema } = require('./db');

const app = express();
app.use(cors({ origin: ['http://localhost:4173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '2mb' }));

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
  ];
}

// ── places ───────────────────────────────────────────────────────────────────

app.get('/api/places', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM places ORDER BY created_at ASC');
    res.json(result.rows.map(rowToPlace));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
          phone_number,google_maps_url,google_place_id,business_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, short_description=$3, address=$4, opening_hours=$5, type=$6,
         area=$7, rating=$8, tips=$9, image_url=$10, source_url=$11,
         instagram_url=$12, station=$13, lat=$14, lng=$15, website_url=$16,
         phone_number=$17, google_maps_url=$18, google_place_id=$19,
         business_status=$20, updated_at=now()`,
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
          phone_number,google_maps_url,google_place_id,business_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       ON CONFLICT (id) DO UPDATE SET
         name=$2, short_description=$3, address=$4, opening_hours=$5, type=$6,
         area=$7, rating=$8, tips=$9, image_url=$10, source_url=$11,
         instagram_url=$12, station=$13, lat=$14, lng=$15, website_url=$16,
         phone_number=$17, google_maps_url=$18, google_place_id=$19,
         business_status=$20, updated_at=now()`,
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
            phone_number,google_maps_url,google_place_id,business_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
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

app.get('/api/saved', async (_req, res) => {
  try {
    const result = await query('SELECT place_id FROM saved_places');
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/saved/:id', async (req, res) => {
  try {
    await query(
      'INSERT INTO saved_places (place_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/saved/:id', async (req, res) => {
  try {
    await query('DELETE FROM saved_places WHERE place_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Replace entire saved set atomically
app.put('/api/saved', async (req, res) => {
  try {
    const ids = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM saved_places');
    for (const id of ids) {
      await query('INSERT INTO saved_places (place_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── hotel ─────────────────────────────────────────────────────────────────────

app.get('/api/hotel', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM hotel WHERE id=1');
    res.json(result.rows[0] ?? null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/hotel', async (req, res) => {
  try {
    const { name, address, lat, lng } = req.body;
    await query(
      `INSERT INTO hotel (id,name,address,lat,lng) VALUES (1,$1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=$1, address=$2, lat=$3, lng=$4`,
      [name, address, lat, lng]
    );
    res.json({ name, address, lat, lng });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── day plans ─────────────────────────────────────────────────────────────────

app.get('/api/plans', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM day_plans ORDER BY sort_order ASC');
    res.json(result.rows.map((r) => ({ id: r.id, title: r.title, placeIds: r.place_ids })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/plans', async (req, res) => {
  try {
    const plans = req.body;
    if (!Array.isArray(plans)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM day_plans');
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      await query(
        `INSERT INTO day_plans (id,title,place_ids,sort_order) VALUES ($1,$2,$3,$4)`,
        [p.id, p.title, JSON.stringify(p.placeIds ?? []), i]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 fledz-api running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to init schema:', e);
    process.exit(1);
  });
