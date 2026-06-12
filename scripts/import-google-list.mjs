/**
 * import-google-list.mjs
 *
 * Imports the "לונדון 2026" Google Maps saved list into the fledz-travel app format.
 * Uses the same Google Places API (New) that the frontend uses.
 *
 * Usage:
 *   node scripts/import-google-list.mjs          # import all 39 places
 *   node scripts/import-google-list.mjs --test   # import only first place (Borough Market)
 *
 * Output:
 *   scripts/imported-places.json  — Place[] array ready to paste into localStorage
 *
 * To load into the app, open DevTools on localhost and run:
 *   (function(){const d=__IMPORTED__;const cur=JSON.parse(localStorage.getItem('fledz-places')||'[]');const ids=new Set(cur.map(p=>p.id));localStorage.setItem('fledz-places',JSON.stringify([...cur,...d.filter(p=>!ids.has(p.id))]));location.reload()})()
 * (the script prints the ready-to-paste snippet at the end)
 */

import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Read API key ────────────────────────────────────────────────────────────
const envContent = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
const API_KEY = envContent.match(/VITE_GOOGLE_MAPS_API_KEY=([^\s]+)/)?.[1];
if (!API_KEY) {
  console.error('ERROR: VITE_GOOGLE_MAPS_API_KEY not found in .env.local');
  process.exit(1);
}

// ─── All 39 places from the "לונדון 2026" list ───────────────────────────────
// type is pre-set to match the app's PlaceType: אטרקציה | מוזיאון | פארק | אוכל | ילדים
// notes are the Hebrew notes saved in Google Maps
const PLACES_LIST = [
  { search: 'Borough Market London',                type: 'אוכל',     notes: [] },
  { search: 'Piccadilly Circus London',             type: 'אטרקציה',  notes: [] },
  { search: 'Science Museum London',                type: 'מוזיאון',  notes: [] },
  { search: 'Kensington Gardens London',            type: 'פארק',     notes: [] },
  { search: 'Shoreditch High Street station London',type: 'אטרקציה',  notes: [] },
  { search: 'Hyde Park London',                     type: 'פארק',     notes: [] },
  { search: 'London Eye',                           type: 'אטרקציה',  notes: [] },
  { search: 'Natural History Museum London',        type: 'מוזיאון',  notes: [] },
  { search: 'Hamleys London',                       type: 'ילדים',    notes: [] },
  { search: 'Buckingham Palace London',             type: 'אטרקציה',  notes: [] },
  { search: 'Tower of London',                      type: 'אטרקציה',  notes: [] },
  { search: 'Tower Bridge London',                  type: 'אטרקציה',  notes: [] },
  { search: 'London Zoo',                           type: 'ילדים',    notes: [] },
  { search: 'Old Spitalfields Market London',       type: 'אוכל',     notes: [] },
  { search: 'story deli London',                    type: 'אוכל',     notes: ['פיצרייה מיוחדת ביותר. להתקשר לפני הגעה'] },
  { search: 'Eccleston Yards London',               type: 'אטרקציה',  notes: [] },
  { search: 'Camden Market London',                 type: 'אוכל',     notes: [] },
  { search: 'SEA LIFE London Aquarium',             type: 'ילדים',    notes: [] },
  { search: 'London Transport Museum',              type: 'מוזיאון',  notes: [] },
  { search: 'Sky Garden London',                    type: 'אטרקציה',  notes: [] },
  { search: 'CA Japanese Pancakes London',          type: 'אוכל',     notes: [] },
  { search: 'Kyoto Garden Holland Park London',     type: 'פארק',     notes: [] },
  { search: 'Pophams bakery London',                type: 'אוכל',     notes: [] },
  { search: 'Arôme Bakery Duke Street London',      type: 'אוכל',     notes: [] },
  { search: 'Monmouth Coffee Company London',       type: 'אוכל',     notes: [] },
  { search: 'The Wolseley Piccadilly London',       type: 'אוכל',     notes: [] },
  { search: 'Peggy Porschen Belgravia London',      type: 'אוכל',     notes: [] },
  { search: 'Skuna Sauna Canary Wharf London',      type: 'אטרקציה',  notes: [] },
  { search: 'Outernet London',                      type: 'אטרקציה',  notes: [] },
  { search: 'Holland Park London',                  type: 'פארק',     notes: [] },
  { search: 'Babylon Park London',                  type: 'ילדים',    notes: [] },
  { search: 'Mundo Pixar Experience London',        type: 'ילדים',    notes: [] },
  { search: 'One Aldwych restaurant London',        type: 'ילדים',    notes: ['מסעדה מדליקה לילדים בסגנון ווילי וונקה'] },
  { search: 'Hans and Gretel restaurant London',    type: 'ילדים',    notes: [] },
  { search: 'Brick Stop cafe London',               type: 'ילדים',    notes: ['בית קפה שניתן להרכיב סט של לגו'] },
  { search: 'Daunt Books Marylebone London',        type: 'אטרקציה',  notes: ['חנות ספרים מדליקה'] },
  { search: 'Wimbledon All England Club London',    type: 'אטרקציה',  notes: [] },
  { search: 'Emirates Air Line cable car London',   type: 'אטרקציה',  notes: [] },
];

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.businessStatus',
  'places.regularOpeningHours',
  'places.photos',
  'places.types',
  'places.addressComponents',
].join(',');

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractArea(components) {
  const priority = ['sublocality_level_1', 'sublocality', 'neighborhood', 'locality', 'administrative_area_level_2'];
  for (const type of priority) {
    const comp = components?.find((c) => c.types?.includes(type));
    if (comp?.longText) return comp.longText;
  }
  return 'London';
}

async function resolvePhotoUrl(photoName) {
  try {
    const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true&key=${API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) return FALLBACK_IMAGE;
    const data = await resp.json();
    return data.photoUri || FALLBACK_IMAGE;
  } catch {
    return FALLBACK_IMAGE;
  }
}

async function searchPlace(textQuery) {
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      locationBias: {
        circle: {
          center: { latitude: 51.5074, longitude: -0.1278 },
          radius: 50000,
        },
      },
      maxResultCount: 1,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Places API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  return data.places?.[0] ?? null;
}

function toAppPlace(apiPlace, listItem) {
  const lat = apiPlace.location?.latitude;
  const lng = apiPlace.location?.longitude;
  const area = extractArea(apiPlace.addressComponents);
  const openingHours = apiPlace.regularOpeningHours?.weekdayDescriptions
    ?.slice(0, 3)
    .join(' | ') ?? '';

  return {
    id: apiPlace.id,
    name: apiPlace.displayName?.text ?? listItem.search,
    shortDescription: '',
    address: apiPlace.formattedAddress ?? '',
    openingHours,
    type: listItem.type,
    area,
    rating: apiPlace.rating ?? undefined,
    tips: listItem.notes,
    imageUrl: FALLBACK_IMAGE, // will be replaced after photo fetch
    sourceUrl: apiPlace.googleMapsUri ?? '',
    googleMapsUrl: apiPlace.googleMapsUri ?? '',
    googlePlaceId: apiPlace.id ?? '',
    websiteUrl: apiPlace.websiteUri ?? '',
    phoneNumber: apiPlace.nationalPhoneNumber ?? '',
    businessStatus: apiPlace.businessStatus ?? '',
    lat,
    lng,
    _photoName: apiPlace.photos?.[0]?.name ?? null, // temp field, removed before output
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const isTest = process.argv.includes('--test');
const limit = isTest ? 1 : PLACES_LIST.length;

console.log(`\nfledz-travel → import-google-list`);
console.log(`API key: ${API_KEY.slice(0, 10)}...`);
console.log(`Mode: ${isTest ? 'TEST (1 place)' : `full (${limit} places)`}\n`);

const results = [];
const failed = [];

for (let i = 0; i < limit; i++) {
  const item = PLACES_LIST[i];
  process.stdout.write(`[${i + 1}/${limit}] ${item.search} ... `);

  try {
    const apiPlace = await searchPlace(item.search);
    if (!apiPlace) {
      console.log('NOT FOUND');
      failed.push(item.search);
      continue;
    }

    const place = toAppPlace(apiPlace, item);

    // Resolve photo URL to a stable CDN URL (no API key in image src)
    if (place._photoName) {
      place.imageUrl = await resolvePhotoUrl(place._photoName);
    }
    delete place._photoName;

    results.push(place);
    console.log(`✓  ${place.name}  (${place.lat?.toFixed(4)}, ${place.lng?.toFixed(4)})`);
  } catch (err) {
    console.log(`ERROR: ${err.message}`);
    failed.push(item.search);
  }

  // Be polite to the API
  if (i < limit - 1) await new Promise((r) => setTimeout(r, 150));
}

// ─── Write output ─────────────────────────────────────────────────────────────

const outPath = resolve(__dirname, 'imported-places.json');
writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');

console.log(`\n✓ Saved ${results.length} places → scripts/imported-places.json`);
if (failed.length) {
  console.log(`✗ Failed (${failed.length}): ${failed.join(', ')}`);
}

// ─── POST to local API ────────────────────────────────────────────────────────
if (results.length > 0) {
  console.log('\n── Sending to local API (http://localhost:3001) ─────────────────────');
  try {
    const apiResp = await fetch('http://localhost:3001/api/places/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    });
    if (apiResp.ok) {
      const json = await apiResp.json();
      console.log(`✓ API accepted ${json.inserted} places`);
    } else {
      console.log(`✗ API responded ${apiResp.status}: ${await apiResp.text()}`);
    }
  } catch (e) {
    console.log(`✗ API not reachable (${e.message}). Start the backend and re-run, or use the browser snippet below.`);
  }
}

// ─── Browser import snippet (fallback) ───────────────────────────────────────
const snippet = `(function(){const d=${JSON.stringify(results)};const cur=JSON.parse(localStorage.getItem('fledz-places')||'[]');const ids=new Set(cur.map(p=>p.id));localStorage.setItem('fledz-places',JSON.stringify([...cur,...d.filter(p=>!ids.has(p.id))]));location.reload();})()`;

console.log('\n── Fallback: browser console snippet ───────────────────────────────');
console.log('(If API import failed, paste this in DevTools at http://localhost:3022)\n');
console.log(snippet);
console.log('\n────────────────────────────────────────────────────────────────────\n');

// Also save snippet to a file for convenience
writeFileSync(resolve(__dirname, 'import-snippet.txt'), snippet, 'utf8');
console.log('(Also saved to scripts/import-snippet.txt)');
