// server.js — fledz-travel REST API
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { query, initSchema } = require('./db');

const app = express();
app.use(cors({ origin: ['http://localhost:4173', 'http://localhost:5173'] }));
app.use(express.json({ limit: '4mb' }));

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

// ── visited ───────────────────────────────────────────────────────────────────

app.get('/api/visited', async (_req, res) => {
  try {
    const result = await query('SELECT place_id FROM visited_places');
    res.json(result.rows.map((r) => r.place_id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/visited', async (req, res) => {
  try {
    const ids = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'expected array' });
    await query('DELETE FROM visited_places');
    for (const id of ids) {
      await query('INSERT INTO visited_places (place_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
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
    res.json(result.rows.map((r) => ({
      id: r.id,
      title: r.title,
      placeIds: r.place_ids,
      pinnedPlaceIds: r.pinned_place_ids ?? [],
    })));
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
        `INSERT INTO day_plans (id,title,place_ids,pinned_place_ids,sort_order) VALUES ($1,$2,$3,$4,$5)`,
        [p.id, p.title, JSON.stringify(p.placeIds ?? []), JSON.stringify(p.pinnedPlaceIds ?? []), i]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── trip config ───────────────────────────────────────────────────────────────

app.get('/api/trip-config', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM trip_config WHERE id=1');
    if (!result.rows[0]) return res.json({ tripName: 'הטיול שלנו', dayStartHour: 9, dayEndHour: 21, lunchBreakStart: 13, lunchBreakEnd: 15, destination: '' });
    const r = result.rows[0];
    res.json({ tripName: r.trip_name, dayStartHour: r.day_start_hour, dayEndHour: r.day_end_hour, lunchBreakStart: r.lunch_break_start, lunchBreakEnd: r.lunch_break_end, destination: r.destination });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/trip-config', async (req, res) => {
  try {
    const { tripName, dayStartHour, dayEndHour, lunchBreakStart, lunchBreakEnd, destination } = req.body;
    await query(
      `INSERT INTO trip_config (id,trip_name,day_start_hour,day_end_hour,lunch_break_start,lunch_break_end,destination)
       VALUES (1,$1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET trip_name=$1, day_start_hour=$2, day_end_hour=$3, lunch_break_start=$4, lunch_break_end=$5, destination=$6`,
      [tripName ?? 'הטיול שלנו', dayStartHour ?? 9, dayEndHour ?? 21, lunchBreakStart ?? 13, lunchBreakEnd ?? 15, destination ?? '']
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── flights ───────────────────────────────────────────────────────────────────

app.get('/api/flights', async (_req, res) => {
  try {
    const result = await query('SELECT * FROM flights ORDER BY flight_date ASC, flight_time ASC');
    res.json(result.rows.map((r) => ({ id: r.id, type: r.type, flightDate: r.flight_date, flightTime: r.flight_time, airport: r.airport, flightNumber: r.flight_number || undefined, transferMinutes: r.transfer_minutes, notes: r.notes })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/flights', async (req, res) => {
  try {
    const f = req.body;
    const id = f.id || `flight-${uuidv4().slice(0, 8)}`;
    await query(
      `INSERT INTO flights (id,type,flight_date,flight_time,airport,flight_number,transfer_minutes,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET type=$2, flight_date=$3, flight_time=$4, airport=$5, flight_number=$6, transfer_minutes=$7, notes=$8`,
      [id, f.type, f.flightDate, f.flightTime, f.airport ?? '', f.flightNumber ?? '', f.transferMinutes ?? 45, f.notes ?? '']
    );
    res.status(201).json({ id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/flights/:id', async (req, res) => {
  try {
    await query('DELETE FROM flights WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI: plan ──────────────────────────────────────────────────────────────────

app.post('/api/ai/plan', async (req, res) => {
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
      '9. מקומות מעוגנים (pinned) — שמור ביום שלהם',
      '10. אם יש 2 מקומות דומים מאוד — ציין בהמלצות',
      '',
      systemContext,
      '',
      'החזר JSON בלבד (ללא markdown, ללא טקסט נוסף):',
      '{"plan":{"day-1":["id1","id2"],"day-2":["id3"]},"excluded":[{"placeId":"id","reason":"סיבה"}],"recommendations":["המלצה 1"],"summary":"סיכום קצר"}',
    ].join('\n');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

app.post('/api/ai/chat', async (req, res) => {
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
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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

// ── health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── start ─────────────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const PORT = process.env.PORT || 3001;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 fledz-api running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to init schema:', e);
    process.exit(1);
  });
