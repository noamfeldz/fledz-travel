// ai-utils.test.js — offline tests for the AI chat intent pipeline.
// Uses recorded Gemini responses (fixtures/chat-intent-responses.json) so no
// AI calls are made. Re-record with: node scripts/record-ai-fixtures.mjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { parseAiResponse, buildChatSystemPrompt, buildTripContext, buildPlaceEnrichmentPrompt } = require('../ai-utils');

const FIXTURES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'chat-intent-responses.json'), 'utf8'),
);

// Mirrors of the frontend contract (src/ChatPage.tsx) — if these change there,
// the AI prompt and these tests must change together.
const ACTIONABLE_INTENTS = ['replan', 'add_place', 'set_time', 'mark_visited', 'edit_place', 'reschedule'];
const ALLOWED_STEP_IDS = [
  'check_place_exists', 'search_google_places', 'add_place_if_missing', 'save_place',
  'move_place_to_day', 'pin_place_time', 'open_flight_editor', 'recompute_plan',
  'mark_place_visited', 'update_place_field',
];
const REQUIRED_PARAMS_BY_INTENT = {
  add_place: ['name', 'query'],
  set_time: ['placeName', 'time'],
  mark_visited: ['placeName'],
  edit_place: ['placeName', 'field', 'value'],
  replan: ['reason'],
  reschedule: ['detail'],
};

// ── parseAiResponse: raw model output shapes ─────────────────────────────────

test('parseAiResponse parses plain JSON', () => {
  const out = parseAiResponse('{"reply":"שלום","intent":"info","params":{}}');
  assert.equal(out.reply, 'שלום');
  assert.equal(out.intent, 'info');
  assert.deepEqual(out.steps, []);
});

test('parseAiResponse strips markdown code fences', () => {
  const out = parseAiResponse('```json\n{"reply":"היי","intent":"replan","params":{"reason":"גשם"},"steps":["recompute_plan"]}\n```');
  assert.equal(out.reply, 'היי');
  assert.equal(out.intent, 'replan');
  assert.deepEqual(out.params, { reason: 'גשם' });
  assert.deepEqual(out.steps, ['recompute_plan']);
});

test('parseAiResponse handles JSON embedded in surrounding text', () => {
  const out = parseAiResponse('הנה התשובה: {"reply":"טוב","intent":"mark_visited","params":{"placeName":"London Eye"}} תודה');
  assert.equal(out.intent, 'mark_visited');
  assert.equal(out.params.placeName, 'London Eye');
});

test('parseAiResponse unwraps nested reply JSON', () => {
  const inner = JSON.stringify({ reply: 'פנימי', intent: 'info', params: {} });
  const out = parseAiResponse(JSON.stringify({ reply: inner, intent: 'info', params: {} }));
  assert.equal(out.reply, 'פנימי');
});

test('parseAiResponse handles bare "reply" without braces', () => {
  const out = parseAiResponse('"reply":"חסר סוגריים","intent":"info","params":{}');
  assert.equal(out.reply, 'חסר סוגריים');
});

test('parseAiResponse falls back to info + raw text for non-JSON', () => {
  const out = parseAiResponse('סתם טקסט חופשי בלי JSON');
  assert.equal(out.intent, 'info');
  assert.equal(out.reply, 'סתם טקסט חופשי בלי JSON');
  assert.deepEqual(out.params, {});
});

test('parseAiResponse recovers reply from JSON broken by unescaped Hebrew quotes', () => {
  // Real failure observed 2026-06-12: gershayim inside the reply string broke JSON.parse
  const raw = '{"reply":"וימבלדון זה רעיון מצוין! 🎾 יש מקום כזה ברשימת האטרקציות. באיזה יום תרצו שנשבץ אותו ל"סשיין של אחה"צ"?","intent":"info","params":{}}';
  const out = parseAiResponse(raw);
  assert.equal(out.intent, 'info');
  assert.ok(out.reply.startsWith('וימבלדון זה רעיון מצוין'), 'reply text must be extracted');
  assert.ok(!out.reply.includes('"intent"'), 'reply must not contain JSON scaffolding');
});

test('parseAiResponse recovers actionable intent + params from broken JSON', () => {
  const raw = '{"reply":"נעגן את ה"לונדון איי" ליום 3","intent":"set_time","params":{"placeName":"London Eye","time":"10:00","dayTitle":"יום 3"},"steps":["pin_place_time"]}';
  const out = parseAiResponse(raw);
  assert.equal(out.intent, 'set_time');
  assert.equal(out.params.placeName, 'London Eye');
  assert.deepEqual(out.steps, ['pin_place_time']);
  assert.ok(out.reply.includes('לונדון איי'));
});

test('parseAiResponse drops non-string steps', () => {
  const out = parseAiResponse('{"reply":"x","intent":"replan","params":{},"steps":["recompute_plan", 5, null]}');
  assert.deepEqual(out.steps, ['recompute_plan']);
});

// ── recorded fixtures: intent classification + params contract ───────────────

for (const [key, fixture] of Object.entries(FIXTURES)) {
  test(`recorded fixture "${key}": intent + params contract`, () => {
    const { response, expectIntent } = fixture;
    assert.equal(response.intent, expectIntent, `intent should be ${expectIntent}`);
    assert.ok(response.reply && response.reply.length > 0, 'reply must not be empty');

    if (expectIntent === 'info') {
      return; // info carries no action contract
    }

    assert.ok(ACTIONABLE_INTENTS.includes(response.intent), 'intent must be actionable');

    // Steps the model returned must be within the IDs the UI can render
    for (const step of response.steps ?? []) {
      assert.ok(ALLOWED_STEP_IDS.includes(step), `unknown step id: ${step}`);
    }

    // Params the UI buttons depend on must be present
    for (const param of REQUIRED_PARAMS_BY_INTENT[expectIntent] ?? []) {
      assert.ok(
        response.params && response.params[param] !== undefined && response.params[param] !== '',
        `param "${param}" required for ${expectIntent}, got: ${JSON.stringify(response.params)}`,
      );
    }

    // The model must not claim it already performed the action
    for (const forbidden of ['קבעתי', 'עדכנתי בהצלחה', 'הזזתי', 'תכננתי מחדש את']) {
      assert.ok(!response.reply.includes(forbidden), `reply claims completed action ("${forbidden}")`);
    }
  });
}

// ── prompt content: planning constraints present ─────────────────────────────

test('chat system prompt includes all intents and planning principles', () => {
  const prompt = buildChatSystemPrompt('CONTEXT');
  for (const intent of ['info', ...ACTIONABLE_INTENTS]) {
    assert.ok(prompt.includes(`"${intent}"`), `prompt must describe intent ${intent}`);
  }
  assert.ok(prompt.includes('ילדים קטנים'), 'kids pacing principle missing');
  assert.ok(prompt.includes('שתי מסעדות לאותה ארוחה'), 'meal duplication principle missing');
  assert.ok(prompt.includes('זמני נסיעה'), 'transport principle missing');
  assert.ok(prompt.endsWith('CONTEXT'), 'trip context must close the prompt');
});

// ── aiNotes: enrichment prompt + context inclusion ───────────────────────────

test('buildPlaceEnrichmentPrompt includes place, dates, and kids section when relevant', () => {
  const prompt = buildPlaceEnrichmentPrompt(
    { name: 'London Zoo', address: 'Outer Cir, London', websiteUrl: 'https://www.londonzoo.org' },
    { startDate: '2026-06-30', numDays: 8 },
    { hasKids: true },
  );
  assert.ok(prompt.includes('London Zoo'));
  assert.ok(prompt.includes('2026-06-30'));
  assert.ok(prompt.includes('ילדים קטנים'), 'kids context must be stated');
  assert.ok(prompt.includes('התאמה לילדים קטנים'), 'kids section must be requested');
  assert.ok(prompt.includes('מחירי כניסה'), 'prices section must be requested');
  const noKids = buildPlaceEnrichmentPrompt({ name: 'X' }, {}, { hasKids: false });
  assert.ok(!noKids.includes('התאמה לילדים קטנים'), 'kids section omitted without kids');
});

test('buildTripContext includes aiNotes per place and truncates long notes', () => {
  const context = buildTripContext({
    places: [
      { id: 'p1', name: 'A', type: 'אטרקציה', lat: 1, lng: 2, aiNotes: 'מבוגר £30, ילד £15. להגיע לפני 10:00.' },
      { id: 'p2', name: 'B', type: 'פארק', lat: 1, lng: 2, aiNotes: 'x'.repeat(1000) },
      { id: 'p3', name: 'C', type: 'אוכל', lat: 1, lng: 2 },
    ],
    hotels: [], dayPlans: [], tripConfig: {}, flights: [], visitedIds: [],
  });
  assert.ok(context.includes('מבוגר £30'), 'aiNotes content must appear in context');
  assert.ok(!context.includes('x'.repeat(601)), 'long notes must be truncated to 600 chars');
  const parsed = JSON.parse(context.slice(context.indexOf('[', context.indexOf('## המקומות')), context.indexOf(']', context.indexOf('## המקומות')) + 1));
  assert.equal(parsed.find((p) => p.id === 'p3').aiNotes, undefined, 'places without notes get no aiNotes key');
});

// ── buildTripContext: flight usable times + visited flags ────────────────────

test('buildTripContext computes usable times around flights', () => {
  const context = buildTripContext({
    places: [{ id: 'p1', name: 'London Eye', type: 'אטרקציה', lat: 1, lng: 2 }],
    hotels: [{ name: 'מלון', address: 'כתובת' }],
    dayPlans: [{ id: 'day-1', title: 'יום 1', placeIds: ['p1'], pinnedPlaceIds: [], pinnedTimes: {} }],
    tripConfig: { destination: 'London' },
    flights: [
      { id: 'f1', type: 'departure', flightDate: '2026-06-30', flightTime: '12:30', transferMinutes: 60, notes: 'נוחתת 16:00' },
      { id: 'f2', type: 'arrival', flightDate: '2026-07-07', flightTime: '17:10', transferMinutes: 90 },
    ],
    visitedIds: ['p1'],
  });
  assert.ok(context.includes('"usableStartTime": "17:00"'), 'outbound usable start = arrival 16:00 + 60min transfer');
  assert.ok(context.includes('"usableEndTime": "15:40"'), 'return usable end = 17:10 - 90min transfer');
  assert.ok(context.includes('"isVisited": true'), 'visited flag must be in context');
  assert.ok(context.includes('יעד: London'));
});
