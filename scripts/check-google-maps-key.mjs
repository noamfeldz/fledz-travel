import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const envPath = resolve(cwd, ".env.local");
if (!existsSync(envPath)) {
  console.error("Missing .env.local");
  process.exit(1);
}

const envText = await readFile(envPath, "utf8");
const match = envText.match(/^VITE_GOOGLE_MAPS_API_KEY=(.+)$/m);
if (!match?.[1]) {
  console.error("Missing VITE_GOOGLE_MAPS_API_KEY in .env.local");
  process.exit(1);
}

const key = match[1].trim();
const referer = process.env.GOOGLE_MAPS_REFERER || "http://localhost:3022/";
const url = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly`;

const response = await fetch(url, {
  headers: {
    Referer: referer,
  },
});

const body = await response.text();
const knownErrors = [
  "ApiNotActivatedMapError",
  "InvalidKeyMapError",
  "RefererNotAllowedMapError",
  "BillingNotEnabledMapError",
  "OverQuotaMapError",
];
const detected = knownErrors.find((token) => body.includes(token));

console.log(`HTTP ${response.status}`);
console.log(`Referer: ${referer}`);
if (detected) {
  console.error(`Detected Google Maps error: ${detected}`);
  process.exit(1);
}

console.log("Google Maps script loaded without a known API error token.");
process.exit(response.ok ? 0 : 1);
