// record-ai-fixtures.mjs — capture real /api/ai/chat responses per intent and
// save them as test fixtures, so the test suite replays them without AI calls.
//
// Usage: node scripts/record-ai-fixtures.mjs   (dev server must be running,
// backend in dev mode — OAuth bypass — so no session cookie is needed)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const API = process.env.FLEDZ_API ?? 'http://localhost:6022';
const TRIP = process.env.FLEDZ_TRIP ?? 'london-2026';

const SCENARIOS = [
  { key: 'info', message: 'מה הכי מומלץ לבוקר הראשון?', expectIntent: 'info' },
  { key: 'add_place', message: 'תוסיף את גלריית טייט מודרן לרשימת המקומות', expectIntent: 'add_place' },
  { key: 'set_time', message: 'תעגן את London Eye ליום 3 בשעה 10:00', expectIntent: 'set_time' },
  { key: 'mark_visited', message: 'ביקרנו היום ב-Borough Market, אפשר לסמן שהיינו שם', expectIntent: 'mark_visited' },
  { key: 'edit_place', message: 'תעדכן את משך הביקור ב-Hyde Park ל-45 דקות', expectIntent: 'edit_place' },
  { key: 'replan', message: 'מחר אמור לרדת גשם כל היום, צריך לשנות את התוכנית בהתאם', expectIntent: 'replan' },
  { key: 'reschedule', message: 'הטיסה חזרה שלנו הוקדמה בשלוש שעות, מה עושים?', expectIntent: 'reschedule' },
];

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const [places, hotels, dayPlans, tripConfig, flights, visitedIds] = await Promise.all([
  getJson(`${API}/api/trips/${TRIP}/places`),
  getJson(`${API}/api/trips/${TRIP}/hotel`).then((h) => (Array.isArray(h) ? h : h ? [h] : [])),
  getJson(`${API}/api/trips/${TRIP}/plans`),
  getJson(`${API}/api/trips/${TRIP}/trip-config`),
  getJson(`${API}/api/trips/${TRIP}/flights`),
  getJson(`${API}/api/trips/${TRIP}/visited`),
]);

const context = { places, hotels, dayPlans, tripConfig, flights, visitedIds };
const fixtures = {};

for (const scenario of SCENARIOS) {
  process.stdout.write(`recording ${scenario.key}... `);
  const res = await fetch(`${API}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: scenario.message, history: [], ...context }),
  });
  if (!res.ok) {
    console.log(`FAILED ${res.status}: ${await res.text()}`);
    continue;
  }
  const data = await res.json();
  const match = data.intent === scenario.expectIntent ? 'OK' : `MISMATCH (got ${data.intent})`;
  console.log(`intent=${data.intent} ${match}`);
  fixtures[scenario.key] = {
    message: scenario.message,
    expectIntent: scenario.expectIntent,
    response: { reply: data.reply, intent: data.intent, params: data.params, steps: data.steps },
  };
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'backend', 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'chat-intent-responses.json');
writeFileSync(outPath, JSON.stringify(fixtures, null, 2), 'utf8');
console.log(`\nsaved ${Object.keys(fixtures).length} fixtures -> ${outPath}`);
