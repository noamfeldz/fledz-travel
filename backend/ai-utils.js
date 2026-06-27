// ai-utils.js — pure AI prompt/parsing helpers, extracted from server.js so
// they can be unit-tested without starting the server or touching the DB.

function defaultDurationByType(type) {
  switch (type) {
    case 'מוזיאון': return 150;
    case 'פארק': return 90;
    case 'אוכל': return 75;
    case 'ילדים': return 120;
    case 'אירוע': return 180;
    default: return 120;
  }
}

function parseHourValue(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}

function formatHourLabel(hour) {
  if (hour == null || Number.isNaN(hour)) return null;
  const normalized = Math.max(0, hour);
  const wholeHours = Math.floor(normalized);
  const minutes = Math.round((normalized - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function extractArrivalHourFromFlightNotes(notes) {
  if (!notes) return null;
  const regex = /(?:מגיע(?:ה)?|נוחת(?:ת)?|arrival|arrive(?:s|d)?|landing|lands?)\D*(\d{1,2}[:.]\d{2})/gi;
  const matches = [...String(notes).matchAll(regex)];
  if (!matches.length) return null;
  return parseHourValue(matches[matches.length - 1][1]);
}

function sortFlightsChronologically(flights) {
  return [...(flights || [])].sort((left, right) => {
    const leftStamp = `${left.flightDate || ''}T${left.flightTime || '00:00'}`;
    const rightStamp = `${right.flightDate || ''}T${right.flightTime || '00:00'}`;
    return leftStamp.localeCompare(rightStamp);
  });
}

function getFlightPhase(flight, sortedFlights) {
  if (!sortedFlights.length) return 'outbound';
  if (flight.id === sortedFlights[0]?.id) return 'outbound';
  if (flight.id === sortedFlights[sortedFlights.length - 1]?.id) return 'return';
  return flight.type === 'departure' ? 'outbound' : 'return';
}

function buildChatSystemPrompt(systemContext) {
  return [
    'אתה עוזר טיולים חכם ואישי. יש לך גישה לכל המידע על הטיול.',
    'ענה תמיד בעברית. היה קצר, ברור ומועיל. אפשר להשתמש ב-emoji.',
    '',
    'חשוב: ענה תמיד ב-JSON בלבד, ללא markdown wrappers, בפורמט הזה בדיוק:',
    '{"reply":"<תשובה עברית>","intent":"<intent>","params":{},"steps":["step_id"]}',
    'בתוך מחרוזת ה-reply אסור מרכאות כפולות (") לא מסומנות — השתמש בגרש בודד או ב-\\" כדי לא לשבור את ה-JSON. למשל כתוב אחה״צ ולא אחה"צ.',
    '',
    'יש לך גישה לחיפוש Google. כשהשאלה דורשת מידע עדכני שלא נמצא בנתוני הטיול — תאריכי אירועים (טורנירים, הופעות, פסטיבלים), שעות פתיחה עדכניות, מזג אוויר, מחירי כרטיסים — חפש באינטרנט לפני שאתה עונה, ושלב את הממצא בתשובה כולל התאריך/הפרט המדויק.',
    '',
    'חשוב מאוד: אם intent שונה מ-"info", אל תטען שביצעת את הפעולה בפועל.',
    'אל תכתוב "קבעתי", "עדכנתי", "הזזתי", "תכננתי מחדש" או כל ניסוח שמציג ביצוע שכבר קרה.',
    'במקום זה נסח את התשובה כהצעה או כהבנה של הפעולה הנדרשת, כי הביצוע כרגע ידני דרך כפתורים באפליקציה.',
    'אם intent הוא "add_place" או "set_time", החזר params שעוזרים לחפש את המקום ב-Google Places: לפחות name/placeName ו-query, ואם ידוע גם type, area, addressHint, visitDurationMins, shortDescription.',
    'ערכים חוקיים ל-type: אטרקציה, מוזיאון, פארק, אוכל, ילדים, אירוע.',
    'כשהמשתמש מוסיף אירוע בעל שעה קבועה (הופעה, משחק, מופע, טורניר) — השתמש ב-intent "set_time" עם type "אירוע" וכלול dayTitle ו-time אם ידועים.',
    '',
    'intent אפשרי (בחר אחד):',
    '"info" — שאלה/תשובה רגילה, אין שינוי נדרש',
    '"replan" — שינוי/אילוץ חדש שמצריך חישוב מחדש של התוכנית',
    '"add_place" — בקשה להוסיף מקום חדש לרשימה',
    '"set_time" — עיגון מקום בשעה/יום ספציפי',
    '"mark_visited" — דיווח שביקרו במקום',
    '"edit_place" — שינוי פרטי מקום (שעות, משך ביקור וכו\')',
    '"reschedule" — שינוי בטיסה/מלון שמשפיע על התוכנית',
    '"add_transit" — הוספת נסיעה מתוזמנת ללו"ז (תחתית/רכבת/אוטובוס/מונית) — כשמבקשים לבדוק איך מגיעים למקום ולהוסיף את הנסיעה ליומן',
    '',
    'params לפי intent:',
    'replan: {"reason":"סיבת השינוי"}',
    'add_place: {"name":"שם המקום","query":"שם מדויק לחיפוש ב-Google Places","type":"סוג","area":"אזור","addressHint":"כתובת או שכונה אם ידוע","visitDurationMins":90,"shortDescription":"למה שווה להוסיף"}',
    'set_time: {"placeName":"שם","time":"HH:MM","dayTitle":"יום X","query":"שם מדויק לחיפוש ב-Google Places","type":"סוג","area":"אזור","addressHint":"כתובת או שכונה אם ידוע","visitDurationMins":90,"shortDescription":"למה שווה להוסיף אם עדיין לא קיים"}',
    'mark_visited: {"placeName":"שם"}',
    'edit_place: {"placeName":"שם","field":"openingHours","value":"ערך חדש"}',
    '  שדות אפשריים: openingHours, visitDurationMinutes (מספר), entryCost (מספר), shortDescription, area, station, tips (טקסט מופרד בפסיקים), aiNotes (מידע חופשי שמצטבר — מתאים לפרטי הגעה, מחירים, המלצות)',
    'reschedule: {"detail":"פרטי השינוי"}',
    'add_transit: {"fromLabel":"מוצא","toLabel":"יעד","dayTitle":"יום X","departTime":"HH:MM","arriveTime":"HH:MM","mode":"רכבת תחתית","line":"District","cost":"6-18 ליש\\"ט","notes":"הערות","roundTrip":true,"returnDepartTime":"HH:MM","returnArriveTime":"HH:MM"}',
    '  לפני שאתה מחזיר add_transit — חפש באינטרנט את לוח הזמנים והעלות האמיתיים לאותו יום ושעה, ומלא את הפרמטרים מהממצאים. אם המשתמש רוצה גם חזור — מלא roundTrip ושדות ה-return',
    '',
    'steps אפשריים (החזר מערך steps עבור כל intent שאינו info):',
    'check_place_exists, search_google_places, add_place_if_missing, save_place, move_place_to_day, pin_place_time, open_flight_editor, recompute_plan, mark_place_visited, update_place_field, save_transit',
    'דוגמאות:',
    'replan -> ["recompute_plan"]',
    'add_place -> ["search_google_places","save_place"]',
    'set_time -> ["check_place_exists","add_place_if_missing","move_place_to_day","pin_place_time"]',
    'mark_visited -> ["mark_place_visited"]',
    'edit_place -> ["update_place_field"]',
    'reschedule -> ["open_flight_editor","recompute_plan"]',
    'add_transit -> ["save_transit"]',
    '',
    'עקרונות תכנון כשאתה ממליץ או עונה על שאלות:',
    '- לכל מקום יש שדה priority בין 1 (נמוכה) ל-5 (גבוהה), ברירת מחדל 3. כשאתה בוחר אילו מקומות לשבץ או להמליץ עליהם — תן עדיפות למקומות עם priority גבוה יותר ושבץ אותם ראשונים בתוכנית, ורק אז את הנמוכים יותר',
    '- כשאתה ממלא משבצת מסוימת (למשל ארוחת צהריים) — שקול אך ורק מקומות מהסוג המתאים לאותה משבצת (type "אוכל" לארוחה), ומתוכם בחר את בעל ה-priority הגבוה ביותר שעדיין לא שובץ ולא סומן כביקור',
    '- אל תשבץ שוב מקום שכבר נמצא בתוכנית הנוכחית (currentPlan) או ש-isVisited שלו true. כשה-priority שווה בין כמה מקומות — הכרע לפי קרבה גיאוגרפית למה שכבר מתוכנן באותו יום',
    '- לחלק מהמקומות יש שדה aiNotes — מידע שהמשתמש או מחקר אינטרנט הוסיפו (מחירים, המלצות הגעה, התאמה לילדים). תמיד התחשב בו',
    '- אם ברשימה יש מקומות מסוג "ילדים", המשפחה מטיילת עם ילדים קטנים — המלץ על קצב רגוע ואל תעמיס פעילויות באותו יום',
    '- לעולם אל תציע שתי מסעדות לאותה ארוחה באותו יום',
    '- התחשב בזמני נסיעה ובקרבה גיאוגרפית בין מקומות, וציין איך מומלץ להגיע (הליכה/תחתית/אוטובוס)',
    '- כבד מקומות מעוגנים, שעות פתיחה, וזמני טיסות (usableStartTime/usableEndTime)',
    '- מקום מסוג "אירוע" הוא עוגן בשעה נעולה: לעולם אל תציע להזיז אותו, תכנן את שאר היום סביבו כולל זמן הגעה לפניו, והתרע אם הוא מתנגש בטיסה, באירוע אחר או בעיגון קיים',
    '- התכנון גס ולא מדויק לדקה. עגל שעות וזמני מעבר לקפיצות נוחות (10/20/30/45/60 דק׳). שעות עגולות כמו 10:00, 10:20, 13:30 — לא 10:07 או 13:24. גם visitDurationMins צריך להיות מעוגל כך',
    '',
    systemContext,
  ].join('\n');
}

// Last-resort extraction for JSON the model broke with unescaped inner quotes
// (e.g. Hebrew gershayim: {"reply":"...אחה"צ..."} ). Pulls the reply/intent out
// with regexes instead of JSON.parse.
function extractLooseAiResponse(stripped, rawText) {
  const replyMatch =
    stripped.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:intent|params|steps)"/) ||
    stripped.match(/"reply"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
  if (!replyMatch) return null;
  const intentMatch = stripped.match(/"intent"\s*:\s*"([a-z_]+)"/);
  let params = {};
  const paramsMatch = stripped.match(/"params"\s*:\s*(\{[\s\S]*?\})\s*(?:,\s*"steps"|\}\s*$)/);
  if (paramsMatch) {
    try { params = JSON.parse(paramsMatch[1]); } catch (_) {}
  }
  let steps = [];
  const stepsMatch = stripped.match(/"steps"\s*:\s*(\[[\s\S]*?\])/);
  if (stepsMatch) {
    try { steps = JSON.parse(stepsMatch[1]).filter((step) => typeof step === 'string'); } catch (_) {}
  }
  return {
    reply: replyMatch[1] ? replyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : rawText,
    intent: intentMatch ? intentMatch[1] : 'info',
    params,
    steps,
  };
}

function parseAiResponse(rawText) {
  const stripped = rawText.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const candidates = [
    stripped,
    stripped.startsWith('"reply"') ? `{${stripped}}` : null,
    stripped.startsWith("'reply'") ? `{${stripped}}` : null,
  ].filter(Boolean);

  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(stripped.slice(firstBrace, lastBrace + 1));
  }

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    try {
      let parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === 'object') {
        const nestedReply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';
        let reply = typeof parsed.reply === 'string' ? parsed.reply : rawText;
        if ((nestedReply.startsWith('{') || nestedReply.startsWith('"reply"')) && nestedReply.includes('"reply"')) {
          reply = parseAiResponse(nestedReply).reply;
        }
        return {
          reply,
          intent: typeof parsed.intent === 'string' ? parsed.intent : 'info',
          params: (typeof parsed.params === 'object' && parsed.params !== null) ? parsed.params : {},
          steps: Array.isArray(parsed.steps) ? parsed.steps.filter((step) => typeof step === 'string') : [],
        };
      }
    } catch (_) {}
  }
  // JSON.parse failed on every candidate — the model likely emitted unescaped
  // quotes inside a string. Recover what we can instead of showing raw JSON.
  if (stripped.includes('"reply"')) {
    const loose = extractLooseAiResponse(stripped, rawText);
    if (loose) return loose;
  }
  return { reply: rawText, intent: 'info', params: {}, steps: [] };
}

function buildTripContext({ places, hotel, hotels, dayPlans, tripConfig, flights, visitedIds, transits }) {
  const visitedSet = new Set(visitedIds || []);
  const destination = tripConfig?.destination || 'יעד לא הוגדר';
  const sortedFlights = sortFlightsChronologically(flights || []);
  // Support both legacy single hotel and new hotels array
  const hotelsArr = hotels || (hotel ? (Array.isArray(hotel) ? hotel : [hotel]) : []);
  const placesInfo = (places || []).map((p) => ({
    id: p.id, name: p.name, type: p.type, area: p.area || 'לא ידוע',
    station: p.station || '', openingHours: p.openingHours || 'לא ידוע',
    visitDurationMins: p.visitDurationMinutes || defaultDurationByType(p.type),
    priority: p.priority || 3,
    entryCost: p.entryCost != null ? `${p.entryCost}` : 'לא ידוע',
    lat: p.lat, lng: p.lng, isVisited: visitedSet.has(p.id),
    ...(p.aiNotes ? { aiNotes: String(p.aiNotes).slice(0, 600) } : {}),
  }));
  const currentPlan = (dayPlans || []).map((d) => ({
    day: d.title, id: d.id, places: d.placeIds || [], pinned: d.pinnedPlaceIds || [],
    pinnedTimes: d.pinnedTimes || {},
  }));
  const flightsInfo = sortedFlights.map((f) => {
    const phase = getFlightPhase(f, sortedFlights);
    const flightHour = parseHourValue(f.flightTime);
    const arrivalHour = extractArrivalHourFromFlightNotes(f.notes);
    const transferHours = Math.max(0, f.transferMinutes || 0) / 60;
    const usableStartTime = phase === 'outbound' && (arrivalHour != null || flightHour != null)
      ? formatHourLabel((arrivalHour ?? flightHour) + transferHours)
      : null;
    const usableEndTime = phase === 'return' && flightHour != null
      ? formatHourLabel(Math.max(0, flightHour - transferHours))
      : null;

    return {
      phase,
      rawType: f.type,
      typeLabel: f.type === 'arrival' ? 'נחיתה' : 'המראה',
      date: f.flightDate,
      time: f.flightTime,
      airport: f.airport,
      flightNumber: f.flightNumber || '',
      transferToHotelMins: f.transferMinutes,
      arrivalTimeFromNotes: arrivalHour != null ? formatHourLabel(arrivalHour) : null,
      usableStartTime,
      usableEndTime,
      notes: f.notes,
    };
  });
  const hotelsInfo = hotelsArr.map((h) => ({
    name: h.name, address: h.address,
    checkIn: h.checkInDate ? `${h.checkInDate} ${h.checkInTime || '15:00'}` : 'לא הוגדר',
    checkOut: h.checkOutDate ? `${h.checkOutDate} ${h.checkOutTime || '11:00'}` : 'לא הוגדר',
  }));
  const startH = tripConfig?.dayStartHour ?? 9;
  const endH = tripConfig?.dayEndHour ?? 21;
  const lunchS = tripConfig?.lunchBreakStart ?? 13;
  const lunchE = tripConfig?.lunchBreakEnd ?? 15;
  return [
    '## מידע על הטיול',
    `יעד: ${destination}`,
    hotelsArr.length === 1
      ? `מלון: ${hotelsArr[0].name} (${hotelsArr[0].address}) צ׳ק-אין: ${hotelsInfo[0].checkIn} צ׳ק-אאוט: ${hotelsInfo[0].checkOut}`
      : `מלונות:\n${JSON.stringify(hotelsInfo, null, 2)}`,
    `שעות פעילות יומי: ${startH}:00-${endH}:00`,
    `הפסקת צהריים: ${lunchS}:00-${lunchE}:00`,
    '',
    '## טיסות',
    flightsInfo.length ? JSON.stringify(flightsInfo, null, 2) : 'לא הוזנו טיסות',
    '',
    '## נסיעות מתוזמנות (transits — עוגנים נעולים בתוך הימים)',
    (transits || []).length ? JSON.stringify(transits, null, 2) : 'אין נסיעות מתוזמנות',
    '',
    `## המקומות (${placesInfo.length} סה"כ)`,
    JSON.stringify(placesInfo, null, 2),
    '',
    '## התוכנית הנוכחית',
    JSON.stringify(currentPlan, null, 2),
  ].join('\n');
}

// Prompt for the per-place "fetch fresh info" enrichment (uses web grounding).
function buildPlaceEnrichmentPrompt(place, tripConfig, { hasKids = false } = {}) {
  const tripWindow = tripConfig?.startDate
    ? `הטיול מתחיל ב-${tripConfig.startDate} ונמשך ${tripConfig.numDays ?? 7} ימים`
    : 'תאריכי הטיול לא הוגדרו';
  return [
    'אתה עוזר טיולים. חפש באינטרנט מידע עדכני על המקום הבא וסכם אותו בעברית, קצר וענייני.',
    '',
    `המקום: ${place.name}`,
    place.address ? `כתובת: ${place.address}` : null,
    place.websiteUrl ? `אתר רשמי: ${place.websiteUrl}` : null,
    `הקשר: ${tripWindow}.${hasKids ? ' המשפחה מטיילת עם ילדים קטנים.' : ''}`,
    '',
    'כלול אך ורק סעיפים שמצאת להם מידע אמין:',
    '• מחירי כניסה עדכניים (מבוגר/ילד/משפחה, וחינם אם רלוונטי) כולל מטבע',
    '• שעות פתיחה עדכניות לתקופת הטיול',
    '• מתי הכי כדאי להגיע (שעות עומס, ימים מומלצים)',
    '• האם צריך להזמין כרטיסים מראש ואיפה',
    hasKids ? '• התאמה לילדים קטנים: מתקנים, עגלות, גיל מינימלי, משך מומלץ' : null,
    '• הערות עונתיות רלוונטיות לתקופת הטיול (קיץ: צל, מים, אירועים מיוחדים)',
    '',
    'פורמט: שורות קצרות שמתחילות ב-• בלבד, ללא כותרות, ללא markdown אחר, עד 10 שורות.',
    'אם לא מצאת מידע אמין על סעיף — דלג עליו. אל תמציא מחירים או שעות.',
  ].filter(Boolean).join('\n');
}

module.exports = {
  extractLooseAiResponse,
  buildPlaceEnrichmentPrompt,
  defaultDurationByType,
  parseHourValue,
  formatHourLabel,
  extractArrivalHourFromFlightNotes,
  sortFlightsChronologically,
  getFlightPhase,
  buildChatSystemPrompt,
  parseAiResponse,
  buildTripContext,
};
