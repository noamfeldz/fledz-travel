
import { CSSProperties, FormEvent, JSX, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import { useAuth } from "./context/AuthContext";
import ChatPage from "./ChatPage";
import type { AiPlanResult as ChatAiPlanResult } from "./ChatPage";
import { deriveLocationBias, importPlacesLibrary } from "./googleMapsLoader";

type PlaceType = "אטרקציה" | "מוזיאון" | "פארק" | "אוכל" | "ילדים" | "אירוע";
type TransportMode = "הליכה" | "אוטובוס" | "רכבת תחתית" | "שילוב";
type ViewKey = "home" | "hotel" | "map" | "planner" | "chat" | "settings";
type Place = { id: string; name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; rating?: number; tips: string[]; imageUrl: string; sourceUrl?: string; instagramUrl?: string; station?: string; lat: number; lng: number; websiteUrl?: string; phoneNumber?: string; googleMapsUrl?: string; googlePlaceId?: string; businessStatus?: string; priority?: number; visitDurationMinutes?: number; entryCost?: number; aiNotes?: string; };
type PlaceDraft = { name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; imageUrl: string; sourceUrl: string; instagramUrl: string; station: string; tips: string; lat: string; lng: string; websiteUrl: string; phoneNumber: string; googleMapsUrl: string; googlePlaceId: string; businessStatus: string; priority: string; visitDurationMinutes: string; entryCost: string; aiNotes: string; eventDayId: string; eventTime: string; };
type AddPlaceIntentSeed = { name: string; query: string; type?: PlaceType; area?: string; addressHint?: string; visitDurationMinutes?: number; shortDescription?: string; };
type PendingPinRequest = AddPlaceIntentSeed & { dayTitle?: string; time?: string; };
type PlaceSearchCandidate = {
  id: string;
  name: string;
  address: string;
  area?: string;
  rating?: number;
  openingHours?: string;
  imageUrl?: string;
  googleMapsUrl?: string;
  draft: Partial<PlaceDraft>;
};
type Hotel = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  checkInDate?: string;
  checkOutDate?: string;
  checkInTime?: string;
  checkOutTime?: string;
  imageUrl?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  websiteUrl?: string;
  phoneNumber?: string;
  rating?: number;
};
type HotelDraft = { name: string; address: string; lat: string; lng: string; checkInDate: string; checkInTime: string; checkOutDate: string; checkOutTime: string; imageUrl: string; googlePlaceId: string; googleMapsUrl: string; websiteUrl: string; phoneNumber: string; rating: string; };
type DayPlan = { id: string; title: string; placeIds: string[]; pinnedPlaceIds: string[]; pinnedTimes?: Record<string, string>; dayEndHour?: number; };
type TripConfig = { tripName: string; dayStartHour: number; dayEndHour: number; lunchBreakStart: number; lunchBreakEnd: number; destination: string; startDate?: string; numDays?: number; };
type Flight = { id: string; type: "arrival" | "departure"; flightDate: string; flightTime: string; airport: string; flightNumber?: string; transferMinutes: number; notes: string; };
type PlannerFlightPhase = "outbound" | "return";
type PlannerDayFlightEntry = { flight: Flight; phase: PlannerFlightPhase; startHour: number; endHour: number; dayPart: string; };
type PlannerDayFlightContext = { flights: PlannerDayFlightEntry[]; availableStartHour: number; availableEndHour: number; hasOutboundFlight: boolean; };
type PlannerTimelineEntry =
  | { kind: "flight"; flight: Flight; phase: PlannerFlightPhase; startHour: number; endHour: number; startLabel: string; endLabel: string; dayPart: string; durationMinutes: number; idleBeforeMinutes: number; }
  | { kind: "hotel"; hotel: Hotel; subKind: "checkin" | "checkout"; startHour: number; endHour: number; startLabel: string; endLabel: string; dayPart: string; durationMinutes: number; idleBeforeMinutes: number; }
  | { kind: "place"; place: Place; startHour: number; endHour: number; startLabel: string; endLabel: string; dayPart: string; durationMinutes: number; travelMode: TransportMode; travelMinutes: number; isTight: boolean; leadInLabel: string; idleBeforeMinutes: number; };
type ChatMessage = { role: "user" | "assistant"; content: string; };
type AiPlanResult = { plan: Record<string, string[]>; excluded: Array<{ placeId: string; reason: string }>; recommendations: string[]; summary: string; };
type GooglePlacePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};
type MapMarkerKind = PlaceType | "hotel";
const STORAGE_KEYS = { places: "fledz-places", hotels: "fledz-hotels", plans: "fledz-plans", tripConfig: "fledz-trip-config", flights: "fledz-flights", visited: "fledz-visited" };
const API = "/api";
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const defaultPlaceImage = "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80";
const emptyPlaceDraft: PlaceDraft = { name: "", shortDescription: "", address: "", openingHours: "", type: "אטרקציה", area: "", imageUrl: "", sourceUrl: "", instagramUrl: "", station: "", tips: "", lat: "", lng: "", websiteUrl: "", phoneNumber: "", googleMapsUrl: "", googlePlaceId: "", businessStatus: "", priority: "3", visitDurationMinutes: "", entryCost: "", aiNotes: "", eventDayId: "", eventTime: "" };
const emptyHotelDraft: HotelDraft = { name: "", address: "", lat: "", lng: "", checkInDate: "", checkInTime: "", checkOutDate: "", checkOutTime: "", imageUrl: "", googlePlaceId: "", googleMapsUrl: "", websiteUrl: "", phoneNumber: "", rating: "" };
const defaultTripConfig: TripConfig = { tripName: "הטיול שלנו", dayStartHour: 9, dayEndHour: 21, lunchBreakStart: 13, lunchBreakEnd: 15, destination: "", startDate: "", numDays: 7 };
const defaultHotel: Hotel = { id: "default-hotel", name: "Park Plaza Victoria London", address: "239 Vauxhall Bridge Road, London SW1V 1EQ", lat: 51.4952, lng: -0.1439 };
const WEEK_DAY_COUNT = 7;
function createWeekPlan(index: number): DayPlan {
  return { id: `day-${index + 1}`, title: `יום ${index + 1}`, placeIds: [], pinnedPlaceIds: [] };
}
function normalizeDayPlans(plans: DayPlan[] | null | undefined): DayPlan[] {
  const basePlans = Array.from({ length: WEEK_DAY_COUNT }, (_, index) => createWeekPlan(index));
  const existingPlans = Array.isArray(plans) ? plans.filter(Boolean) : [];
  const seenPlaceIds = new Set<string>();
  const normalized = basePlans.map((basePlan, index) => {
    const currentPlan = existingPlans[index];
    if (!currentPlan) return basePlan;
    const uniquePlaceIds = (currentPlan.placeIds || []).filter((placeId) => {
      if (!placeId || seenPlaceIds.has(placeId)) return false;
      seenPlaceIds.add(placeId);
      return true;
    });
    const validPinnedTimes: Record<string, string> = {};
    Object.entries(currentPlan.pinnedTimes || {}).forEach(([placeId, time]) => { if (uniquePlaceIds.includes(placeId)) validPinnedTimes[placeId] = time; });
    return {
      id: currentPlan.id || basePlan.id,
      title: currentPlan.title?.trim() || basePlan.title,
      placeIds: uniquePlaceIds,
      pinnedPlaceIds: Array.from(new Set((currentPlan.pinnedPlaceIds || []).filter((placeId) => uniquePlaceIds.includes(placeId)))),
      pinnedTimes: validPinnedTimes,
    };
  });

  if (existingPlans.length <= WEEK_DAY_COUNT) return normalized;

  return normalized.concat(
    existingPlans.slice(WEEK_DAY_COUNT).map((plan, index) => ({
      id: plan.id || `extra-day-${index + 1}`,
      title: plan.title?.trim() || `יום נוסף ${index + 1}`,
      placeIds: Array.from(new Set((plan.placeIds || []).filter((placeId) => {
        if (!placeId || seenPlaceIds.has(placeId)) return false;
        seenPlaceIds.add(placeId);
        return true;
      }))),
      pinnedPlaceIds: Array.from(new Set((plan.pinnedPlaceIds || []).filter(Boolean))),
      pinnedTimes: plan.pinnedTimes || {},
    })),
  ).map((plan) => ({
    ...plan,
    pinnedPlaceIds: plan.pinnedPlaceIds.filter((placeId) => plan.placeIds.includes(placeId)),
  }));
}
const defaultPlans: DayPlan[] = normalizeDayPlans([
  { id: "day-1", title: "יום 1", placeIds: ["london-eye", "hyde-park"], pinnedPlaceIds: [] },
  { id: "day-2", title: "יום 2", placeIds: ["natural-history", "camden-market"], pinnedPlaceIds: [] },
]);
const seededPlaces: Place[] = [
  { id: "london-eye", name: "London Eye", shortDescription: "גלגל ענק עם תצפית מרשימה על נהר התמזה ומרכז העיר.", address: "Riverside Building, County Hall, London SE1 7PB", openingHours: "11:00-18:00", type: "אטרקציה", area: "South Bank", rating: 4.7, tips: ["כדאי להזמין מראש", "עמוס בשעות אחר הצהריים", "מתאים גם לילדים"], imageUrl: "https://images.unsplash.com/photo-1526129318478-62ed807ebdf9?auto=format&fit=crop&w=1200&q=80", sourceUrl: "https://www.londoneye.com/", instagramUrl: "https://www.instagram.com/explore/tags/londoneye/", station: "Waterloo Station", lat: 51.5033, lng: -0.1196 },
  { id: "hyde-park", name: "Hyde Park", shortDescription: "פארק גדול ונעים להליכה, מנוחה, פיקניק ושיט רגוע.", address: "Hyde Park, London W2 2UH", openingHours: "05:00-00:00", type: "פארק", area: "Central London", rating: 4.8, tips: ["מצוין לבוקר רגוע", "כדאי לשלב עם Kensington", "נוח עם עגלות"], imageUrl: "https://images.unsplash.com/photo-1473773508845-188df298d2d1?auto=format&fit=crop&w=1200&q=80", sourceUrl: "https://www.royalparks.org.uk/visit/parks/hyde-park", instagramUrl: "https://www.instagram.com/explore/tags/hydepark/", station: "Hyde Park Corner", lat: 51.5073, lng: -0.1657 },
  { id: "natural-history", name: "Natural History Museum", shortDescription: "מוזיאון מפורסם עם תצוגות דינוזאורים, חלל וטבע.", address: "Cromwell Rd, South Kensington, London SW7 5BD", openingHours: "10:00-17:50", type: "מוזיאון", area: "South Kensington", rating: 4.8, tips: ["פופולרי מאוד למשפחות", "שווה להגיע מוקדם", "חינם ברוב הימים"], imageUrl: "https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?auto=format&fit=crop&w=1200&q=80", sourceUrl: "https://www.nhm.ac.uk/", instagramUrl: "https://www.instagram.com/explore/tags/naturalhistorymuseum/", station: "South Kensington", lat: 51.4967, lng: -0.1764 },
  { id: "camden-market", name: "Camden Market", shortDescription: "אזור שוק תוסס עם אוכל, חנויות, מוזיקה ואווירה צעירה.", address: "Camden Lock Pl, London NW1 8AF", openingHours: "10:00-18:00", type: "אוכל", area: "Camden", rating: 4.6, tips: ["מעולה לצהריים", "אפשר לשלב עם Regent's Canal", "עמוס בסופי שבוע"], imageUrl: "https://images.unsplash.com/photo-1533929736458-ca588d08c8be?auto=format&fit=crop&w=1200&q=80", sourceUrl: "https://www.camdenmarket.com/", instagramUrl: "https://www.instagram.com/explore/tags/camdenmarket/", station: "Camden Town", lat: 51.5416, lng: -0.1455 },
];
const placeTypes: PlaceType[] = ["אטרקציה", "מוזיאון", "פארק", "אוכל", "ילדים", "אירוע"];
function normalizeIntentPlaceType(value: unknown): PlaceType | undefined {
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const normalized = raw.toLowerCase();
  if (raw === "אטרקציה" || normalized === "attraction") return "אטרקציה";
  if (raw === "מוזיאון" || normalized === "museum") return "מוזיאון";
  if (raw === "פארק" || normalized === "park") return "פארק";
  if (raw === "אוכל" || normalized === "food" || normalized === "restaurant" || normalized === "cafe") return "אוכל";
  if (raw === "ילדים" || normalized === "kids" || normalized === "children" || normalized === "family") return "ילדים";
  if (raw === "אירוע" || normalized === "event" || normalized === "concert" || normalized === "show" || normalized === "match" || normalized === "game") return "אירוע";
  return undefined;
}
function parseIntentVisitDuration(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}
function buildAddPlaceIntentSeed(params: Record<string, unknown>): AddPlaceIntentSeed | null {
  const name = typeof params.name === "string" ? params.name.trim() : "";
  const explicitQuery = typeof params.query === "string" ? params.query.trim() : "";
  const area = typeof params.area === "string" ? params.area.trim() : "";
  const addressHint = typeof params.addressHint === "string" ? params.addressHint.trim() : "";
  const shortDescription = typeof params.shortDescription === "string" ? params.shortDescription.trim() : "";
  const query = explicitQuery || [name, area || addressHint].filter(Boolean).join(", ");
  if (!name && !query) return null;
  return {
    name: name || query,
    query: query || name,
    type: normalizeIntentPlaceType(params.type),
    area: area || undefined,
    addressHint: addressHint || undefined,
    visitDurationMinutes: parseIntentVisitDuration(params.visitDurationMins ?? params.visitDurationMinutes),
    shortDescription: shortDescription || undefined,
  };
}
function buildPendingPinRequest(params: Record<string, unknown>): PendingPinRequest | null {
  const placeName = typeof params.placeName === "string" ? params.placeName.trim() : "";
  const seed = buildAddPlaceIntentSeed({
    name: placeName || params.name,
    query: params.query,
    type: params.type,
    area: params.area,
    addressHint: params.addressHint,
    visitDurationMins: params.visitDurationMins ?? params.visitDurationMinutes,
    shortDescription: params.shortDescription,
  });
  if (!seed && !placeName) return null;
  return {
    ...(seed ?? {
      name: placeName,
      query: placeName,
    }),
    dayTitle: typeof params.dayTitle === "string" ? params.dayTitle.trim() : undefined,
    time: typeof params.time === "string" ? params.time.trim() : undefined,
  };
}
function normalizePlaceLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function buildSearchCandidateFromGooglePlace(place: any, seed: AddPlaceIntentSeed): PlaceSearchCandidate {
  const displayName = place.displayName?.toString?.() || place.displayName || seed.name;
  const formattedAddress = place.formattedAddress || seed.addressHint || "";
  const latitude = place.location?.lat?.();
  const longitude = place.location?.lng?.();
  const photoUrl =
    place.photos?.[0]?.getURI?.({ maxWidth: 1200, maxHeight: 800 }) ||
    place.photos?.[0]?.getUrl?.({ maxWidth: 1200, maxHeight: 800 }) ||
    "";
  const area = extractAreaFromAddressComponents(place.addressComponents) || seed.area || "";
  const openingHours = place.regularOpeningHours?.weekdayDescriptions?.join(" | ") || "";
  return {
    id: place.id || `${displayName}-${formattedAddress}`,
    name: displayName,
    address: formattedAddress,
    area: area || undefined,
    rating: typeof place.rating === "number" ? place.rating : undefined,
    openingHours: openingHours || undefined,
    imageUrl: photoUrl || undefined,
    googleMapsUrl: place.googleMapsURI || undefined,
    draft: {
      name: displayName,
      shortDescription: seed.shortDescription || "נמשך מ-Google Places",
      address: formattedAddress,
      openingHours,
      type: seed.type || emptyPlaceDraft.type,
      area,
      imageUrl: photoUrl,
      sourceUrl: place.googleMapsURI || "",
      websiteUrl: place.websiteURI || "",
      phoneNumber: place.nationalPhoneNumber || "",
      googleMapsUrl: place.googleMapsURI || "",
      googlePlaceId: place.id || "",
      businessStatus: place.businessStatus || "",
      lat: Number.isFinite(latitude) ? formatCoordinate(latitude) : "",
      lng: Number.isFinite(longitude) ? formatCoordinate(longitude) : "",
      visitDurationMinutes: seed.visitDurationMinutes ? String(seed.visitDurationMinutes) : "",
    },
  };
}
const placeTypeMeta: Record<string, { emoji: string; cls: string }> = {
  "אטרקציה": { emoji: "🎡", cls: "chip--attraction" },
  "מוזיאון":  { emoji: "🏛️", cls: "chip--museum" },
  "פארק":     { emoji: "🌳", cls: "chip--park" },
  "אוכל":     { emoji: "🍽️", cls: "chip--food" },
  "ילדים":    { emoji: "🎠", cls: "chip--kids" },
  "אירוע":    { emoji: "🎫", cls: "chip--event" },
};
function TypeChip({ type }: { type: string }) {
  const meta = placeTypeMeta[type];
  return <span className={`chip ${meta?.cls ?? ""}`}>{meta ? `${meta.emoji} ` : ""}{type}</span>;
}
const baseAreas = ["הכול", "South Bank", "Central London", "South Kensington", "Camden"];
function makeTripPaths(slug: string): Record<ViewKey, string> {
  const base = slug ? `/${slug}` : "";
  return { home: `${base}/places`, hotel: `${base}/hotel`, map: `${base}/map`, planner: `${base}/planner`, chat: `${base}/chat`, settings: `${base}/settings` };
}
const routeItems = [{ key: "home", label: "מקומות" }, { key: "map", label: "מפה" }, { key: "planner", label: "ימים" }, { key: "chat", label: "AI" }, { key: "settings", label: "הגדרות" }] as const;
function getViewFromPathname(pathname: string, tripId: string): ViewKey | null {
  const vp = makeTripPaths(tripId);
  // legacy paths (for old sessions without tripId)
  const legacyMap: Record<string, ViewKey> = { "/": "home", "/hotel": "hotel", "/map": "map", "/planner": "planner", "/chat": "chat" };
  const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
  if (normalized.startsWith(vp.chat)) return "chat";
  if (normalized.startsWith("/chat")) return "chat";
  const tripMatch = (Object.entries(vp) as [ViewKey, string][]).find(([, path]) => path === normalized);
  if (tripMatch) return tripMatch[0];
  return legacyMap[normalized] ?? null;
}
function getLegacyPathFromHash(hash: string, tripId: string) { const key = hash.replace(/^#/, "") as ViewKey; const vp = makeTripPaths(tripId); return vp[key] ?? null; }
function getPlaceIdFromPathname(pathname: string) { return decodeURIComponent(pathname.replace(/\/+$/, "").match(/(?:\/places\/|\/place\/)([^/]+)$/)?.[1] ?? ""); }
function getPlacePath(placeId: string, slug: string) { return slug ? `/${slug}/places/${encodeURIComponent(placeId)}` : `/places/${encodeURIComponent(placeId)}`; }
const mapMarkerMeta: Record<MapMarkerKind, { glyph: string; label: string; color: string; accent: string }> = {
  hotel: { glyph: "🏨", label: "מלון", color: "#d97706", accent: "#fef3c7" },
  "אטרקציה": { glyph: "🎡", label: "אטרקציה", color: "#2563eb", accent: "#dbeafe" },
  "מוזיאון": { glyph: "🏛️", label: "מוזיאון", color: "#7c3aed", accent: "#ede9fe" },
  "פארק": { glyph: "🌳", label: "פארק", color: "#059669", accent: "#d1fae5" },
  "אוכל": { glyph: "🍽️", label: "אוכל", color: "#dc2626", accent: "#fee2e2" },
  "ילדים": { glyph: "🎠", label: "ילדים", color: "#ea580c", accent: "#ffedd5" },
  "אירוע": { glyph: "🎫", label: "אירוע", color: "#db2777", accent: "#fce7f3" },
};
const markerIconCache = new Map<MapMarkerKind, L.DivIcon>();
function createMarkerIcon(kind: MapMarkerKind) {
  const marker = mapMarkerMeta[kind];
  return L.divIcon({
    className: "map-marker-icon",
    html: `<div class="map-marker-pin" style="--marker-color:${marker.color};--marker-accent:${marker.accent};"><span class="map-marker-glyph" aria-hidden="true">${marker.glyph}</span></div>`,
    iconSize: [38, 50],
    iconAnchor: [19, 50],
    popupAnchor: [0, -42],
  });
}
function getMarkerIcon(kind: MapMarkerKind) {
  const cached = markerIconCache.get(kind);
  if (cached) return cached;
  const next = createMarkerIcon(kind);
  markerIconCache.set(kind, next);
  return next;
}
function getPlaceMarkerIcon(place: Pick<Place, "type">) {
  return getMarkerIcon(place.type);
}
const hotelMarkerIcon = getMarkerIcon("hotel");
function readLocalStorage<T>(key: string, fallback: T): T { const stored = window.localStorage.getItem(key); if (!stored) return fallback; try { return JSON.parse(stored) as T; } catch { return fallback; } }
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) { const r = 6371; const toRad = (v: number) => (v * Math.PI) / 180; const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng); const lat1 = toRad(a.lat); const lat2 = toRad(b.lat); const angle = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2); return 2 * r * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle)); }
function estimateTransport(distanceKm: number): { mode: TransportMode; minutes: number } { if (distanceKm < 1.2) return { mode: "הליכה", minutes: Math.max(8, Math.round(distanceKm * 14)) }; if (distanceKm < 5) return { mode: "אוטובוס", minutes: Math.round(distanceKm * 8 + 8) }; if (distanceKm < 8) return { mode: "רכבת תחתית", minutes: Math.round(distanceKm * 5 + 10) }; return { mode: "שילוב", minutes: Math.round(distanceKm * 5 + 18) }; }
function formatDistance(distanceKm: number) { return `${distanceKm.toFixed(1)} ק"מ`; }
function plannerComfort(placeIds: string[], places: Place[]) { if (placeIds.length < 2) return { label: "יום רגוע", tone: "good" as const }; const tripDistances = placeIds.map((placeId, index) => { if (!index) return 0; const prev = places.find((p) => p.id === placeIds[index - 1]); const current = places.find((p) => p.id === placeId); return prev && current ? haversineKm(prev, current) : 0; }).slice(1); const average = tripDistances.reduce((sum, value) => sum + value, 0) / tripDistances.length; if (average < 2.5) return { label: "סדר יום נוח", tone: "good" as const }; if (average < 5) return { label: "יום סביר עם קצת נסיעות", tone: "ok" as const }; return { label: "כדאי לקרב בין המקומות", tone: "warn" as const }; }
function stopEventPropagation(event: React.SyntheticEvent) { event.stopPropagation(); }
function isCardActivationKey(event: React.KeyboardEvent) { return event.key === "Enter" || event.key === " "; }
function getVisitDurationHours(type: PlaceType, visitDurationMinutes?: number) {
  if (visitDurationMinutes && visitDurationMinutes > 0) return visitDurationMinutes / 60;
  switch (type) {
    case "מוזיאון": return 2.5;
    case "פארק": return 1.5;
    case "אוכל": return 1.25;
    case "ילדים": return 2;
    case "אירוע": return 3;
    default: return 2;
  }
}
function parseOpeningStartHour(openingHours: string) {
  const match = openingHours.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}
function formatHourLabel(hour: number) {
  const normalized = Math.max(0, hour);
  const wholeHours = Math.floor(normalized);
  const minutes = Math.round((normalized - wholeHours) * 60);
  const safeHours = `${wholeHours}`.padStart(2, "0");
  const safeMinutes = `${minutes}`.padStart(2, "0");
  return `${safeHours}:${safeMinutes}`;
}
// Format an hour value snapped to half-hours as a clock string for pinned times.
function formatClockHalf(hour: number) {
  const wholeHours = Math.floor(hour) % 24;
  const minutes = Math.round((hour - Math.floor(hour)) * 60);
  return `${`${wholeHours}`.padStart(2, "0")}:${`${minutes}`.padStart(2, "0")}`;
}
// Trip planning is coarse — round transit estimates to friendly buckets instead of
// showing exact minutes, and snap computed clock times to the nearest 10 minutes.
const NICE_MINUTE_BUCKETS = [10, 20, 30, 45, 60, 90, 120, 150, 180];
function roundNiceMinutes(minutes: number) {
  if (minutes <= 0) return 0;
  return NICE_MINUTE_BUCKETS.reduce((best, bucket) => (Math.abs(bucket - minutes) < Math.abs(best - minutes) ? bucket : best), NICE_MINUTE_BUCKETS[0]);
}
function roundHourToTenMinutes(hour: number) {
  return Math.round(hour * 6) / 6;
}
function transitIcon(mode: TransportMode) {
  return mode === "הליכה" ? "🚶" : mode === "אוטובוס" ? "🚌" : mode === "רכבת תחתית" ? "🚇" : "🧭";
}
function parseHourValue(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return null;
  return Number(match[1]) + Number(match[2]) / 60;
}
function extractArrivalHourFromFlightNotes(notes: string | null | undefined) {
  if (!notes) return null;
  const regex = /(?:מגיע(?:ה)?|נוחת(?:ת)?|arrival|arrive(?:s|d)?|landing|lands?)\D*(\d{1,2}[:.]\d{2})/gi;
  const matches = [...notes.matchAll(regex)];
  if (!matches.length) return null;
  return parseHourValue(matches[matches.length - 1][1]);
}
function isValidDateKey(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}
function addDaysToDateKey(startDate: string | null | undefined, offset: number) {
  if (!isValidDateKey(startDate)) return null;
  const nextDate = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(nextDate.getTime())) return null;
  nextDate.setDate(nextDate.getDate() + offset);
  return nextDate.toISOString().slice(0, 10);
}
function formatPlannerChipDate(startDate: string | null | undefined, offset: number) {
  const dateKey = addDaysToDateKey(startDate, offset);
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return null;
  return `${day}/${month}`;
}
const CALENDAR_PX_PER_HOUR = 60;
const CALENDAR_MIN_BLOCK_PX = 34;
// Compute the visible hour window for the calendar grid: the active range of the
// day padded by an hour on each side, clamped to a sane default when empty.
function getCalendarBounds(timeline: PlannerTimelineEntry[]) {
  if (!timeline.length) return { startHour: 9, endHour: 21 };
  const minStart = Math.min(...timeline.map((entry) => entry.startHour));
  const maxEnd = Math.max(...timeline.map((entry) => entry.endHour));
  const startHour = Math.max(0, Math.floor(minStart) - 1);
  const endHour = Math.min(28, Math.ceil(maxEnd) + 1);
  return { startHour, endHour: Math.max(endHour, startHour + 4) };
}
// Standard interval-partitioning so overlapping blocks (e.g. a flight that spans a
// place) sit side by side in lanes rather than stacking on top of each other.
function layoutCalendarBlocks(timeline: PlannerTimelineEntry[]) {
  const result: Array<{ entry: PlannerTimelineEntry; lane: number; laneCount: number }> = [];
  let cluster: PlannerTimelineEntry[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placements = cluster.map((entry) => {
      let lane = laneEnds.findIndex((end) => end <= entry.startHour + 1e-6);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(entry.endHour); }
      else laneEnds[lane] = entry.endHour;
      return { entry, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    placements.forEach((placement) => result.push({ ...placement, laneCount }));
    cluster = [];
    clusterEnd = -Infinity;
  };
  timeline.forEach((entry) => {
    if (cluster.length && entry.startHour >= clusterEnd - 1e-6) flush();
    cluster.push(entry);
    clusterEnd = Math.max(clusterEnd, entry.endHour);
  });
  flush();
  return result;
}
function sortFlightsChronologically(flights: Flight[]) {
  return [...flights].sort((left, right) => {
    const leftStamp = `${left.flightDate || ""}T${left.flightTime || "00:00"}`;
    const rightStamp = `${right.flightDate || ""}T${right.flightTime || "00:00"}`;
    return leftStamp.localeCompare(rightStamp);
  });
}
function getFlightPhase(flight: Flight, sortedFlights: Flight[]): PlannerFlightPhase {
  if (!sortedFlights.length) return "outbound";
  if (flight.id === sortedFlights[0]?.id) return "outbound";
  if (flight.id === sortedFlights[sortedFlights.length - 1]?.id) return "return";
  return flight.type === "departure" ? "outbound" : "return";
}
function getFlightsForPlannerDay(dayIndex: number, dayCount: number, tripConfig: TripConfig | undefined, flights: Flight[]) {
  const sortedFlights = sortFlightsChronologically(flights);
  const dayDateKey = addDaysToDateKey(tripConfig?.startDate ?? null, dayIndex);
  if (dayDateKey) {
    const datedFlights = sortedFlights.filter((flight) => flight.flightDate === dayDateKey);
    if (datedFlights.length) return datedFlights;
  }
  const fallbackFlights: Flight[] = [];
  if (dayIndex === 0 && sortedFlights[0]) fallbackFlights.push(sortedFlights[0]);
  if (dayIndex === dayCount - 1 && sortedFlights.length > 1) {
    const lastFlight = sortedFlights[sortedFlights.length - 1];
    if (!fallbackFlights.some((flight) => flight.id === lastFlight.id)) fallbackFlights.push(lastFlight);
  }
  return fallbackFlights;
}
function buildPlannerDayFlightContext(dayIndex: number, dayCount: number, day: DayPlan, tripConfig: TripConfig | undefined, flights: Flight[]): PlannerDayFlightContext {
  const baseStartHour = tripConfig?.dayStartHour ?? 9;
  const baseEndHour = day.dayEndHour ?? tripConfig?.dayEndHour ?? 21;
  const sortedFlights = sortFlightsChronologically(flights);
  const dayFlights = getFlightsForPlannerDay(dayIndex, dayCount, tripConfig, sortedFlights);
  let availableStartHour = baseStartHour;
  let availableEndHour = baseEndHour;

  const flightEntries = dayFlights.map<PlannerDayFlightEntry | null>((flight) => {
    const phase = getFlightPhase(flight, sortedFlights);
    const flightHour = parseHourValue(flight.flightTime);
    if (flightHour == null) return null;
    const arrivalHour = extractArrivalHourFromFlightNotes(flight.notes);
    const transferHours = Math.max(0, flight.transferMinutes || 0) / 60;

    if (phase === "outbound") {
      // On the destination's day calendar the outbound flight should appear when it
      // *lands*, not at the (other-timezone) departure time — otherwise the block
      // stretches across hours that aren't part of the destination day at all.
      const landingHour = arrivalHour ?? flightHour;
      const postFlightStartHour = landingHour + transferHours;
      availableStartHour = Math.max(availableStartHour, postFlightStartHour);
      return {
        flight,
        phase,
        startHour: landingHour,
        endHour: Math.max(landingHour, postFlightStartHour),
        dayPart: getDayPartLabel(landingHour),
      };
    }

    const airportDepartureHour = Math.max(0, flightHour - transferHours);
    availableEndHour = Math.min(availableEndHour, airportDepartureHour);
    return {
      flight,
      phase,
      startHour: airportDepartureHour,
      endHour: Math.max(airportDepartureHour, arrivalHour ?? flightHour),
      dayPart: getDayPartLabel(airportDepartureHour),
    };
  }).filter(Boolean) as PlannerDayFlightEntry[];

  return {
    flights: flightEntries,
    availableStartHour,
    availableEndHour,
    hasOutboundFlight: flightEntries.some((entry) => entry.phase === "outbound"),
  };
}
function getDayPartLabel(hour: number) {
  if (hour < 12) return "בוקר";
  if (hour < 16) return "צהריים";
  return "ערב";
}
function getPlannerPlaceTone(place: Place, dayPart: string) {
  if (place.type === "אוכל") {
    if (dayPart === "בוקר") return "ארוחת בוקר";
    if (dayPart === "צהריים") return "ארוחת צהריים";
    return "ארוחת ערב";
  }
  if (place.type === "פארק" && dayPart === "בוקר") return "פתיחה רגועה";
  if (place.type === "מוזיאון") return dayPart === "בוקר" ? "מוזיאון בוקר" : "תחנת תרבות";
  if (place.type === "ילדים") return "פעילות משפחתית";
  if (place.type === "אירוע") return "אירוע בשעה קבועה";
  if (place.type === "אטרקציה" && dayPart === "ערב") return "אטרקציית ערב";
  return `${dayPart} של ${place.type}`;
}
function getDayMapPath(day: DayPlan, places: Place[], hotel: Hotel) {
  const dayPlaces = day.placeIds.map((placeId) => places.find((place) => place.id === placeId)).filter(Boolean) as Place[];
  return [hotel, ...dayPlaces].map((point) => [point.lat, point.lng] as [number, number]);
}
function FitDayMapBounds({ points }: { points: Array<[number, number]> }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }

    map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
  }, [map, points]);

  return null;
}
function LazyDayMap({
  day,
  dayPlaces,
  dayMapPath,
  dayMapCenter,
  hotel,
}: {
  day: DayPlan;
  dayPlaces: Place[];
  dayMapPath: Array<[number, number]>;
  dayMapCenter: [number, number];
  hotel: Hotel;
}) {
  return (
    <div>
      <MapContainer key={`day-map-${day.id}-${day.placeIds.join("-")}`} center={dayMapCenter} zoom={12} scrollWheelZoom={false} className="day-mini-map">
        <FitDayMapBounds points={dayMapPath} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[hotel.lat, hotel.lng]} icon={hotelMarkerIcon}>
          <Popup><strong>{hotel.name}</strong><div>{hotel.address}</div></Popup>
        </Marker>
        {dayPlaces.map((place) => (
          <Marker key={place.id} position={[place.lat, place.lng]} icon={getPlaceMarkerIcon(place)}>
            <Popup><strong>{place.name}</strong><div>{place.address}</div></Popup>
          </Marker>
        ))}
        {dayMapPath.length > 1 && <Polyline positions={dayMapPath} pathOptions={{ color: "#f97316", weight: 4, opacity: 0.72, dashArray: "10 10" }} />}
      </MapContainer>
    </div>
  );
}
function PlaceFocusMap({
  place,
  nearbyPlaces,
  hotel,
}: {
  place: Place;
  nearbyPlaces: Place[];
  hotel: Hotel;
}) {
  const mapPoints = [[hotel.lat, hotel.lng] as [number, number], [place.lat, place.lng] as [number, number], ...nearbyPlaces.map((item) => [item.lat, item.lng] as [number, number])];
  const routePath: Array<[number, number]> = [[hotel.lat, hotel.lng], [place.lat, place.lng]];
  return (
    <MapContainer key={`place-map-${place.id}-${nearbyPlaces.map((item) => item.id).join("-")}`} center={[place.lat, place.lng]} zoom={13} scrollWheelZoom={false} className="place-focus-map">
      <FitDayMapBounds points={mapPoints} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[hotel.lat, hotel.lng]} icon={hotelMarkerIcon}>
        <Popup><strong>{hotel.name}</strong><div>{hotel.address}</div></Popup>
      </Marker>
      <Marker position={[place.lat, place.lng]} icon={getPlaceMarkerIcon(place)}>
        <Popup><strong>{place.name}</strong><div>{place.address}</div></Popup>
      </Marker>
      {nearbyPlaces.map((item) => (
        <Marker key={item.id} position={[item.lat, item.lng]} icon={getPlaceMarkerIcon(item)}>
          <Popup><strong>{item.name}</strong><div>{item.address}</div></Popup>
        </Marker>
      ))}
      <Polyline positions={routePath} pathOptions={{ color: "#f97316", weight: 5, opacity: 0.9 }} />
    </MapContainer>
  );
}
function getActiveHotelForDay(dayIndex: number, hotels: Hotel[], tripConfig?: TripConfig): Hotel | undefined {
  if (!hotels || hotels.length === 0) return undefined;
  if (!tripConfig?.startDate) return hotels[0];
  const tripStart = new Date(tripConfig.startDate);
  const dayDate = new Date(tripStart);
  dayDate.setDate(tripStart.getDate() + dayIndex);
  const dayStr = dayDate.toISOString().slice(0, 10);
  const active = hotels.find((h) => {
    if (!h.checkInDate && !h.checkOutDate) return true;
    const checkin = h.checkInDate ?? "0000-01-01";
    const checkout = h.checkOutDate ?? "9999-12-31";
    return dayStr >= checkin && dayStr <= checkout;
  });
  return active ?? hotels[0];
}
function buildDayTimeline(day: DayPlan, places: Place[], hotel: Hotel, tripConfig: TripConfig | undefined, flightContext: PlannerDayFlightContext, dayDate?: string) {
  const dayPlaces = day.placeIds.map((placeId) => places.find((place) => place.id === placeId)).filter(Boolean) as Place[];
  const startHour = flightContext.availableStartHour;
  const endHour = flightContext.availableEndHour;
  const lunchStart = tripConfig?.lunchBreakStart ?? 13;
  const lunchEnd = tripConfig?.lunchBreakEnd ?? 15;
  let currentHour = startHour;
  let previousStop: Place | Hotel = hotel;
  const placeEntries = dayPlaces.map<PlannerTimelineEntry>((place, index) => {
    const travel = estimateTransport(haversineKm(previousStop, place));
    const travelMinutes = roundNiceMinutes(travel.minutes);
    const openingStart = parseOpeningStartHour(place.openingHours);
    let suggestedStart = currentHour + travelMinutes / 60;
    // Skip over lunch break
    if (suggestedStart < lunchEnd && suggestedStart + getVisitDurationHours(place.type, place.visitDurationMinutes) > lunchStart) {
      if (place.type !== "אוכל") suggestedStart = Math.max(suggestedStart, lunchEnd);
    }
    // A pinned time is an explicit user anchor — honour it exactly, overriding the auto schedule.
    const pinnedHour = parseHourValue(day.pinnedTimes?.[place.id]);
    const startHourFinal = pinnedHour != null
      ? pinnedHour
      : roundHourToTenMinutes(openingStart ? Math.max(suggestedStart, openingStart) : suggestedStart);
    const duration = getVisitDurationHours(place.type, place.visitDurationMinutes);
    const endHourFinal = roundHourToTenMinutes(startHourFinal + duration);
    previousStop = place;
    currentHour = endHourFinal;
    return {
      kind: "place",
      place,
      startHour: startHourFinal,
      endHour: endHourFinal,
      startLabel: formatHourLabel(startHourFinal),
      endLabel: formatHourLabel(endHourFinal),
      dayPart: getDayPartLabel(startHourFinal),
      durationMinutes: Math.max(30, Math.round((endHourFinal - startHourFinal) * 60)),
      idleBeforeMinutes: 0,
      travelMode: travel.mode,
      travelMinutes,
      isTight: endHourFinal > endHour,
      leadInLabel: !index
        ? (flightContext.hasOutboundFlight ? `אחרי הטיסה • ${travelMinutes} דק׳` : `יציאה מהמלון • ${travelMinutes} דק׳`)
        : `${travel.mode} • ${travelMinutes} דק׳`,
    };
  });

  const flightEntries = flightContext.flights.map<PlannerTimelineEntry>((entry) => ({
    kind: "flight",
    flight: entry.flight,
    phase: entry.phase,
    startHour: entry.startHour,
    endHour: entry.endHour,
    startLabel: formatHourLabel(entry.startHour),
    endLabel: formatHourLabel(entry.endHour),
    dayPart: entry.dayPart,
    durationMinutes: Math.max(45, Math.round((entry.endHour - entry.startHour) * 60)),
    idleBeforeMinutes: 0,
  }));

  const hotelEntries: PlannerTimelineEntry[] = [];
  if (dayDate && hotel.checkInDate === dayDate) {
    const checkinHour = hotel.checkInTime ? parseInt(hotel.checkInTime.split(":")[0]) + parseInt(hotel.checkInTime.split(":")[1]) / 60 : 14;
    hotelEntries.push({ kind: "hotel", hotel, subKind: "checkin", startHour: checkinHour, endHour: checkinHour + 0.5, startLabel: formatHourLabel(checkinHour), endLabel: formatHourLabel(checkinHour + 0.5), dayPart: getDayPartLabel(checkinHour), durationMinutes: 30, idleBeforeMinutes: 0 });
  }
  if (dayDate && hotel.checkOutDate === dayDate) {
    const checkoutHour = hotel.checkOutTime ? parseInt(hotel.checkOutTime.split(":")[0]) + parseInt(hotel.checkOutTime.split(":")[1]) / 60 : 11;
    hotelEntries.push({ kind: "hotel", hotel, subKind: "checkout", startHour: checkoutHour, endHour: checkoutHour + 0.5, startLabel: formatHourLabel(checkoutHour), endLabel: formatHourLabel(checkoutHour + 0.5), dayPart: getDayPartLabel(checkoutHour), durationMinutes: 30, idleBeforeMinutes: 0 });
  }

  const ordered = [...flightEntries, ...hotelEntries, ...placeEntries].sort((left, right) => {
    if (left.startHour !== right.startHour) return left.startHour - right.startHour;
    if (left.kind === right.kind) return 0;
    if (left.kind === "flight") return -1;
    if (right.kind === "flight") return 1;
    if (left.kind === "hotel") return -1;
    if (right.kind === "hotel") return 1;
    return 0;
  });

  // Annotate each entry with the idle ("free") time before it on the shared day axis.
  // For places the inter-stop travel is already surfaced separately, so subtract it
  // to leave only genuine waiting time; flights/hotel use the raw gap.
  let previousEndHour: number | null = null;
  return ordered.map((entry) => {
    const rawGapMinutes = previousEndHour == null ? 0 : Math.round((entry.startHour - previousEndHour) * 60);
    const travelMinutes = entry.kind === "place" ? entry.travelMinutes : 0;
    const idleBeforeMinutes = Math.max(0, rawGapMinutes - travelMinutes);
    previousEndHour = previousEndHour == null ? entry.endHour : Math.max(previousEndHour, entry.endHour);
    return { ...entry, idleBeforeMinutes };
  });
}
function sortPlacesForPlanner(places: Place[], hotel: Hotel) {
  return [...places].sort((left, right) => {
    const areaCompare = (left.area || "zzz").localeCompare(right.area || "zzz");
    if (areaCompare !== 0) return areaCompare;
    return haversineKm(hotel, left) - haversineKm(hotel, right);
  });
}
function autoDistributeWeek(dayPlans: DayPlan[], places: Place[], hotel: Hotel, visitedIds?: string[], tripConfig?: TripConfig, flights: Flight[] = []) {
  const normalizedPlans = normalizeDayPlans(dayPlans);
  const placeById = new Map(places.map((place) => [place.id, place]));
  const visitedSet = new Set(visitedIds || []);
  const pinnedPlaceIds = new Set(normalizedPlans.flatMap((day) => day.pinnedPlaceIds));
  const lunchStart = tripConfig?.lunchBreakStart ?? 13;
  const lunchEnd = tripConfig?.lunchBreakEnd ?? 15;
  const lunchDuration = lunchEnd - lunchStart;

  const nextPlans = normalizedPlans.map((day) => ({
    ...day,
    placeIds: day.placeIds.filter((placeId) => day.pinnedPlaceIds.includes(placeId) && placeById.has(placeId)),
    pinnedPlaceIds: day.pinnedPlaceIds.filter((placeId) => placeById.has(placeId)),
  }));

  // Sort by priority desc, then by area proximity to hotel
  const candidates = sortPlacesForPlanner(
    places.filter((place) => !pinnedPlaceIds.has(place.id) && !visitedSet.has(place.id)),
    hotel,
  ).sort((a, b) => (b.priority ?? 3) - (a.priority ?? 3));

  for (const place of candidates) {
    const placeDurationMins = getVisitDurationHours(place.type, place.visitDurationMinutes) * 60;

    const bestDay = nextPlans.reduce<{ index: number; score: number } | null>((best, day, index) => {
      const assignedPlaces = day.placeIds.map((placeId) => placeById.get(placeId)).filter(Boolean) as Place[];
      const flightContext = buildPlannerDayFlightContext(index, nextPlans.length, day, tripConfig, flights);
      const totalDayMinutes = Math.max(0, (flightContext.availableEndHour - flightContext.availableStartHour - lunchDuration) * 60);
      const usedMins = assignedPlaces.reduce((sum, p) => sum + getVisitDurationHours(p.type, p.visitDurationMinutes) * 60, 0);
      const travelBuffer = assignedPlaces.length * 20; // rough 20 min travel between places
      if (usedMins + travelBuffer + placeDurationMins > totalDayMinutes) return best;

      const lastPlace = assignedPlaces[assignedPlaces.length - 1] || null;
      const tripDistance = lastPlace ? haversineKm(lastPlace, place) : haversineKm(hotel, place);
      const sameAreaCount = assignedPlaces.filter((ap) => ap.area && ap.area === place.area).length;
      const score = day.placeIds.length * 4 + tripDistance - sameAreaCount * 1.25;
      if (!best || score < best.score) return { index, score };
      return best;
    }, null);

    if (bestDay) nextPlans[bestDay.index].placeIds.push(place.id);
  }

  return nextPlans;
}
async function geocodeAddress(address: string) { const encoded = encodeURIComponent(address); const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encoded}`, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error("failed"); const data = (await response.json()) as Array<{ lat: string; lon: string }>; if (!data.length) throw new Error("not-found"); return { lat: Number(data[0].lat), lng: Number(data[0].lon) }; }
function buildPlaceId(name: string) { return `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "place"}-${Date.now()}`; }
function placeToDraft(place: Place): PlaceDraft { return { name: place.name, shortDescription: place.shortDescription, address: place.address, openingHours: place.openingHours, type: place.type, area: place.area, imageUrl: place.imageUrl === defaultPlaceImage ? "" : place.imageUrl, sourceUrl: place.sourceUrl || "", instagramUrl: place.instagramUrl || "", station: place.station || "", tips: place.tips.join(", "), lat: String(place.lat), lng: String(place.lng), websiteUrl: place.websiteUrl || "", phoneNumber: place.phoneNumber || "", googleMapsUrl: place.googleMapsUrl || "", googlePlaceId: place.googlePlaceId || "", businessStatus: place.businessStatus || "", priority: String(place.priority ?? 3), visitDurationMinutes: place.visitDurationMinutes ? String(place.visitDurationMinutes) : "", entryCost: place.entryCost != null ? String(place.entryCost) : "", aiNotes: place.aiNotes || "", eventDayId: "", eventTime: "" }; }
function formatCoordinate(value: number) { return String(Number(value.toFixed(6))); }
function decodeLinkText(value: string) { return decodeURIComponent(value).replace(/\+/g, " ").replace(/[_-]+/g, " ").trim(); }
function extractCoordinatesFromText(value: string) { const atMatch = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/); if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) }; const markerMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/); if (markerMatch) return { lat: Number(markerMatch[1]), lng: Number(markerMatch[2]) }; return null; }
function extractCoordinatesFromParam(value: string) { const pairMatch = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); return pairMatch ? { lat: Number(pairMatch[1]), lng: Number(pairMatch[2]) } : null; }
function extractAreaFromAddressComponents(components: Array<{ long_name: string; types: string[] }> | undefined) {
  if (!components) return "";
  const priorityTypes = ["locality", "sublocality", "sublocality_level_1", "neighborhood", "administrative_area_level_2", "administrative_area_level_1"];
  for (const type of priorityTypes) {
    const match = components.find((component) => component.types.includes(type));
    if (match) return match.long_name;
  }
  return "";
}
function describeGoogleMapsLoadError(detail: string) {
  if (detail.includes("ApiNotActivatedMapError")) return "Google Maps JavaScript API לא הופעל בפרויקט הזה ב-Google Cloud. צריך להפעיל Maps JavaScript API וגם Places API.";
  if (detail.includes("InvalidKeyMapError")) return "המפתח של Google Maps לא תקין.";
  if (detail.includes("RefererNotAllowedMapError")) return "הדומיין/הפורט הנוכחי לא מאושר בהגבלות ה-HTTP referrer של המפתח.";
  if (detail.includes("BillingNotEnabledMapError")) return "Billing לא מופעל בפרויקט של Google Cloud.";
  if (detail.includes("places-namespace-unavailable")) return "Google Maps נטען, אבל ספריית Places לא זמינה עדיין.";
  if (detail.includes("script-load-failed")) return "סקריפט Google Maps לא הצליח להיטען מהרשת.";
  return detail;
}
function parsePlaceLink(rawUrl: string): Partial<PlaceDraft> { const url = new URL(rawUrl.trim()); const parsed: Partial<PlaceDraft> = { sourceUrl: url.toString() }; const hostname = url.hostname.replace(/^www\./, "").toLowerCase(); const decodedPath = decodeLinkText(url.pathname); const decodedHref = decodeURIComponent(url.toString()); const coordinates = extractCoordinatesFromText(decodedHref); if (coordinates) { parsed.lat = formatCoordinate(coordinates.lat); parsed.lng = formatCoordinate(coordinates.lng); } for (const key of ["query", "q", "ll", "sll", "destination", "daddr"]) { const value = url.searchParams.get(key); if (!value) continue; const pair = extractCoordinatesFromParam(value); if (pair && !parsed.lat && !parsed.lng) { parsed.lat = formatCoordinate(pair.lat); parsed.lng = formatCoordinate(pair.lng); continue; } if (!pair) { parsed.address = decodeLinkText(value); parsed.name = decodeLinkText(value).split(",")[0]; break; } } const placePathMatch = decodedPath.match(/\/place\/(.+?)(?:\/|$)/i); if (placePathMatch) { const label = placePathMatch[1].trim(); parsed.name = parsed.name || label.split(",")[0]; parsed.address = parsed.address || label; } const searchPathMatch = decodedPath.match(/\/search\/(.+?)(?:\/|$)/i); if (searchPathMatch && !parsed.name) { parsed.name = searchPathMatch[1].split(",")[0]; parsed.address = parsed.address || searchPathMatch[1]; } if (hostname.includes("instagram.com")) parsed.instagramUrl = url.toString(); if (!parsed.name && hostname.includes("google.") && decodedPath) parsed.name = decodedPath.split("/").filter(Boolean).pop() || ""; return parsed; }

const getIconForRoute = (key: string, isActive: boolean) => {
  const strokeWidth = isActive ? 2.5 : 2;
  const color = "currentColor";
  switch(key) {
    case "home": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;

    case "hotel": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M10 22v-6.57"/><path d="M12 11h.01"/><path d="M12 7h.01"/><path d="M14 15.43V22"/><path d="M15 16a5 5 0 0 0-6 0"/><path d="M16 11h.01"/><path d="M16 7h.01"/><path d="M8 11h.01"/><path d="M8 7h.01"/><rect x="4" y="2" width="16" height="20" rx="2"/></svg>;
    case "map": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>;
    case "planner": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
    case "chat": return <svg width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
    case "settings": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
    default: return null;
  }
};

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handleResize = () => setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  return windowSize;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug = "" } = useParams<{ slug: string }>();
  const tripId = slug; // used as the API path segment (server resolves slug → UUID)
  const { user, logout } = useAuth();
  const viewPaths = makeTripPaths(tripId);

  // Guard: reserved view names are never valid trip slugs — redirect to dashboard
  const RESERVED_SLUGS = new Set(["places", "hotel", "map", "planner", "chat", "settings"]);
  useEffect(() => {
    if (RESERVED_SLUGS.has(slug)) navigate("/dashboard", { replace: true });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLinks, setShareLinks] = useState<{ viewer?: string; editor?: string }>({});
  const [shareLoading, setShareLoading] = useState(false);
  const [mainMenuOpen, setMainMenuOpen] = useState(false);

  const storageKeys = useMemo(() => ({
    places: tripId ? `fledz-${tripId}-places` : STORAGE_KEYS.places,
    hotel: tripId ? `fledz-${tripId}-hotels` : STORAGE_KEYS.hotels,
    plans: tripId ? `fledz-${tripId}-plans` : STORAGE_KEYS.plans,
    tripConfig: tripId ? `fledz-${tripId}-trip-config` : STORAGE_KEYS.tripConfig,
    flights: tripId ? `fledz-${tripId}-flights` : STORAGE_KEYS.flights,
    visited: tripId ? `fledz-${tripId}-visited` : STORAGE_KEYS.visited,
  }), [tripId]);

  const apiBase = tripId ? `/trips/${tripId}` : "";

  async function openShareModal() {
    setShowShareModal(true);
    if (shareLinks.viewer) return; // already generated
    setShareLoading(true);
    try {
      const res = await apiFetch(`${apiBase}/share`, { method: "POST" });
      const origin = window.location.origin;
      setShareLinks({
        viewer: `${origin}/share/${res.viewerToken}`,
        editor: `${origin}/share/${res.editorToken}`,
      });
    } catch {
      setShareLinks({ viewer: "שגיאה ביצירת קישור" });
    } finally {
      setShareLoading(false);
    }
  }
  useEffect(() => {
    setMainMenuOpen(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    if (!mainMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMainMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mainMenuOpen]);
  const [places, setPlaces] = useState<Place[]>(() => readLocalStorage(STORAGE_KEYS.places, seededPlaces));

  const [hotels, setHotels] = useState<Hotel[]>(() => {
    const stored = readLocalStorage<Hotel[] | Hotel | null>(STORAGE_KEYS.hotels, null);
    if (Array.isArray(stored)) return stored;
    if (stored && typeof stored === "object" && "name" in stored) return [{ ...stored as Hotel, id: (stored as Hotel).id ?? "migrated-hotel" }];
    return [defaultHotel];
  });
  const [dayPlans, setDayPlans] = useState<DayPlan[]>(() => normalizeDayPlans(readLocalStorage(STORAGE_KEYS.plans, defaultPlans)));
  const [tripConfig, setTripConfig] = useState<TripConfig>(() => readLocalStorage(STORAGE_KEYS.tripConfig, defaultTripConfig));
  const [flights, setFlights] = useState<Flight[]>(() => readLocalStorage(STORAGE_KEYS.flights, []));
  const [visitedIds, setVisitedIds] = useState<string[]>(() => readLocalStorage(STORAGE_KEYS.visited, []));
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [aiChatLoading, setAiChatLoading] = useState(false);
  const [aiPlanLoading, setAiPlanLoading] = useState(false);
  const [aiPlanResult, setAiPlanResult] = useState<AiPlanResult | null>(null);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showTripSettings, setShowTripSettings] = useState(false);
  const [showFlights, setShowFlights] = useState(false);
  const [pinDialog, setPinDialog] = useState<{ dayId: string; placeId: string; placeName: string } | null>(null);
  const [pinDialogTime, setPinDialogTime] = useState("");
  const [flightDraft, setFlightDraft] = useState<Partial<Flight>>({ type: "arrival", transferMinutes: 45 });
  const [showAddFlightDialog, setShowAddFlightDialog] = useState(false);
  const [showHotelEditDialog, setShowHotelEditDialog] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<TripConfig>(defaultTripConfig);
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dbReady, setDbReady] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("הכול");
  const [areaFilter, setAreaFilter] = useState<string>("הכול");
  const [hotelLookupState, setHotelLookupState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft>(emptyPlaceDraft);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [placeFormState, setPlaceFormState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [enrichingPlaceIds, setEnrichingPlaceIds] = useState<Set<string>>(new Set());
  const [enrichErrors, setEnrichErrors] = useState<Record<string, string>>({});
  const [bulkEnrich, setBulkEnrich] = useState<{ running: boolean; done: number; total: number } | null>(null);
  const [importUrl, setImportUrl] = useState("");
  // Debounce auto-import when user types a link
  useEffect(() => {
    if (!importUrl.trim()) return;
    const timer = setTimeout(() => {
      // Trigger import without requiring button click
      fetchAndSetImport(importUrl);
    }, 800);
    return () => clearTimeout(timer);
  }, [importUrl]);
  const [mapAutocompleteState, setMapAutocompleteState] = useState<{ tone: "idle" | "loading" | "ready" | "error"; message: string }>({ tone: "idle", message: "" });
  const [googleMapsReady, setGoogleMapsReady] = useState(false);
  const [linkImportState, setLinkImportState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [addPlaceIntentSeed, setAddPlaceIntentSeed] = useState<AddPlaceIntentSeed | null>(null);
  const [pendingPinRequest, setPendingPinRequest] = useState<PendingPinRequest | null>(null);
  const [existingIntentPlace, setExistingIntentPlace] = useState<Place | null>(null);
  const [placeSearchCandidates, setPlaceSearchCandidates] = useState<PlaceSearchCandidate[]>([]);
  const [placeSearchState, setPlaceSearchState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [isEditingHotel, setIsEditingHotel] = useState(false);
  const [editingHotelId, setEditingHotelId] = useState<string | null>(null);
  const [hotelDraft, setHotelDraft] = useState<HotelDraft>(emptyHotelDraft);
  const [hotelAutocompleteReady, setHotelAutocompleteReady] = useState(false);
  const hotelAutocompleteHostRef = useRef<HTMLDivElement | null>(null);
  const hotelAutocompleteElementRef = useRef<HTMLElement | null>(null);
  const [modalPlaceId, setModalPlaceId] = useState<string | null>(null);
  const placeAutocompleteHostRef = useRef<HTMLDivElement | null>(null);
  const placeAutocompleteElementRef = useRef<HTMLElement | null>(null);
  const [addPlaceMode, setAddPlaceMode] = useState<"search" | "link" | "manual">("search");
  const [autocompleteSelected, setAutocompleteSelected] = useState(false);
  const [draggedPlace, setDraggedPlace] = useState<{ placeId: string; sourceDayId: string | null } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ dayId: string; targetPlaceId: string | null } | null>(null);
  const [openPlaceMenu, setOpenPlaceMenu] = useState<string | null>(null);
  useEffect(() => { if (!openPlaceMenu) return; const close = () => setOpenPlaceMenu(null); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [openPlaceMenu]);
  const [openDayMenu, setOpenDayMenu] = useState<string | null>(null);
  const [activePlannerDayId, setActivePlannerDayId] = useState<string | null>(null);
  const [calDrag, setCalDrag] = useState<{ dayId: string; placeId: string; pointerStartY: number; baseHour: number; previewHour: number; moved: boolean } | null>(null);
  const plannerDayRefs = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => { if (!openDayMenu) return; const close = () => setOpenDayMenu(null); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [openDayMenu]);
  const selectedPlaceId = getPlaceIdFromPathname(location.pathname);
  const selectedPlace = useMemo(() => selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null, [places, selectedPlaceId]);
  const modalPlace = useMemo(() => modalPlaceId ? places.find((place) => place.id === modalPlaceId) ?? null : null, [modalPlaceId, places]);
  const activeView = selectedPlaceId ? null : getViewFromPathname(location.pathname, tripId);
  const windowSize = useWindowSize();
  const isMobilePlanner = windowSize.width < 768;
  const activePlannerDayKey = activePlannerDayId ?? dayPlans[0]?.id ?? null;
  const activePlannerDayIndex = dayPlans.findIndex((day) => day.id === activePlannerDayKey);
  // Reset settings draft to current saved values whenever settings page is opened
  useEffect(() => { if (activeView === "settings") { setSettingsDraft(tripConfig); setSettingsSaveState("idle"); } }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── sync localStorage (fast cache) ──────────────────────────────────────
  useEffect(() => { window.localStorage.setItem(storageKeys.places, JSON.stringify(places)); }, [places, storageKeys.places]);
  useEffect(() => { window.localStorage.setItem(storageKeys.hotel, JSON.stringify(hotels)); }, [hotels, storageKeys.hotel]);
  useEffect(() => { window.localStorage.setItem(storageKeys.plans, JSON.stringify(dayPlans)); }, [dayPlans, storageKeys.plans]);
  useEffect(() => { window.localStorage.setItem(storageKeys.tripConfig, JSON.stringify(tripConfig)); }, [tripConfig, storageKeys.tripConfig]);
  // ── resize dayPlans when numDays changes ─────────────────────────────────
  useEffect(() => {
    const target = tripConfig.numDays ?? 7;
    setDayPlans((current) => {
      if (current.length === target) return current;
      if (current.length < target) {
        const extras = Array.from({ length: target - current.length }, (_, i) => createWeekPlan(current.length + i));
        return [...current, ...extras];
      }
      return current.slice(0, target);
    });
  }, [tripConfig.numDays]);
  useEffect(() => { window.localStorage.setItem(storageKeys.flights, JSON.stringify(flights)); }, [flights, storageKeys.flights]);
  useEffect(() => { window.localStorage.setItem(storageKeys.visited, JSON.stringify(visitedIds)); }, [visitedIds, storageKeys.visited]);
  // ── track whether initial DB load has completed ───────────────────────────
  const dbInitDone = useRef(false);
  useEffect(() => {
    if (dbReady && !dbInitDone.current) { dbInitDone.current = true; }
  }, [dbReady]);
  // ── sync hotel to DB after every mutation ────────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch(`${apiBase}/hotel`, { method: "PUT", body: JSON.stringify(hotels) }).catch(() => {});
  }, [hotels, apiBase]);
  // ── sync day plans to DB after every mutation ────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch(`${apiBase}/plans`, { method: "PUT", body: JSON.stringify(dayPlans) }).catch(() => {});
  }, [dayPlans, apiBase]);
  // ── sync visited to DB ────────────────────────────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch(`${apiBase}/visited`, { method: "PUT", body: JSON.stringify(visitedIds) }).catch(() => {});
  }, [visitedIds, apiBase]);
  // ── sync trip config to DB ────────────────────────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch(`${apiBase}/trip-config`, { method: "PUT", body: JSON.stringify(tripConfig) }).catch(() => {});
  }, [tripConfig, apiBase]);
  // ── load from DB on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tripId) return;
    dbInitDone.current = false;
    apiFetch("/health").then(async () => {
      const [dbPlaces, dbHotel, dbPlans, dbVisited, dbTripConfig, dbFlights] = await Promise.all([
        apiFetch(`${apiBase}/places`),
        apiFetch(`${apiBase}/hotel`),
        apiFetch(`${apiBase}/plans`),
        apiFetch(`${apiBase}/visited`),
        apiFetch(`${apiBase}/trip-config`),
        apiFetch(`${apiBase}/flights`),
      ]);
      if (Array.isArray(dbPlaces) && dbPlaces.length > 0) setPlaces(dbPlaces as Place[]);
      if (Array.isArray(dbHotel) && dbHotel.length > 0) setHotels(dbHotel as Hotel[]);
      if (Array.isArray(dbPlans)) setDayPlans(normalizeDayPlans(dbPlans as DayPlan[]));
      if (Array.isArray(dbVisited)) setVisitedIds(dbVisited as string[]);
      if (dbTripConfig) setTripConfig(dbTripConfig as TripConfig);
      if (Array.isArray(dbFlights)) setFlights(dbFlights as Flight[]);
      setDbReady(true);
    }).catch(() => {
      // API not available — continue with localStorage only
      setDbReady(false);
    });
  }, [tripId, apiBase]);
  useEffect(() => { const legacyPath = getLegacyPathFromHash(location.hash, tripId); if (legacyPath && legacyPath !== location.pathname) { navigate(legacyPath, { replace: true }); return; } const isKnownPath = getViewFromPathname(location.pathname, tripId) || selectedPlaceId; if (!isKnownPath) navigate(viewPaths.home, { replace: true }); }, [location.hash, location.pathname, navigate, selectedPlaceId, tripId, viewPaths.home]);
  useEffect(() => {
    if (!modalPlaceId) return;
    if (!places.some((place) => place.id === modalPlaceId)) setModalPlaceId(null);
  }, [modalPlaceId, places]);
  useEffect(() => {
    let cancelled = false;
    let widget: HTMLElement | null = null;

    async function setupAutocomplete() {
      if (!GOOGLE_MAPS_API_KEY) {
        setMapAutocompleteState({ tone: "error", message: "כדי לקבל השלמה אוטומטית נדרש VITE_GOOGLE_MAPS_API_KEY." });
        setGoogleMapsReady(false);
        return;
      }

      try {
        const placesLibrary = await importPlacesLibrary();
        if (cancelled) return;

        const { PlaceAutocompleteElement } = placesLibrary as {
          PlaceAutocompleteElement: new (options?: { includedRegionCodes?: string[]; locationBias?: { center: { lat: number; lng: number }; radius: number } }) => HTMLElement;
        };
        const host = placeAutocompleteHostRef.current;
        if (!host) return;

        host.innerHTML = "";
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ["gb"],
          locationBias: deriveLocationBias(hotels, places),
        });
        autocomplete.setAttribute("placeholder", "חיפוש ב-Google Maps לפי שם מקום או כתובת");
        autocomplete.className = "place-autocomplete-widget";

        autocomplete.addEventListener("gmp-select", async (event: any) => {
          const placePrediction = event.placePrediction;
          const place = placePrediction.toPlace();
          try {
            await place.fetchFields({
              fields: [
                "displayName",
                "formattedAddress",
                "location",
                "addressComponents",
                "businessStatus",
                "nationalPhoneNumber",
                "websiteURI",
                "googleMapsURI",
                "regularOpeningHours",
                "rating",
                "photos",
              ],
            });
            const displayName = place.displayName?.toString?.() || place.displayName || "";
            const formattedAddress = place.formattedAddress || "";
            const latitude = place.location?.lat?.();
            const longitude = place.location?.lng?.();
            const photoUrl = place.photos?.[0]?.getUrl?.({ maxWidth: 1400, maxHeight: 900 }) || "";
            const area = extractAreaFromAddressComponents(place.addressComponents);
            const openingHours = place.regularOpeningHours?.weekdayDescriptions?.join(" | ") || "";

            setPlaceDraft((current) => ({
              ...current,
              name: displayName || current.name,
              shortDescription: current.shortDescription,
              address: formattedAddress || current.address,
              openingHours: openingHours || current.openingHours,
              area: area || current.area,
              imageUrl: photoUrl || current.imageUrl,
              sourceUrl: place.googleMapsURI || current.sourceUrl,
              websiteUrl: place.websiteURI || current.websiteUrl,
              phoneNumber: place.nationalPhoneNumber || current.phoneNumber,
              googleMapsUrl: place.googleMapsURI || current.googleMapsUrl,
              googlePlaceId: place.id || current.googlePlaceId,
              businessStatus: place.businessStatus || current.businessStatus,
              lat: Number.isFinite(latitude) ? formatCoordinate(latitude) : current.lat,
              lng: Number.isFinite(longitude) ? formatCoordinate(longitude) : current.lng,
            }));
            setMapAutocompleteState({ tone: "ready", message: "הפרטים נטענו מ-Google Places. אפשר לשמור את המקום." });
            setPlaceFormState({ tone: "success", message: "הפרטים נטענו מ-Google Places. אפשר לשמור את המקום." });
            setAutocompleteSelected(true);
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            setMapAutocompleteState({ tone: "error", message: `נבחר מקום, אבל טעינת הפרטים נכשלה: ${detail}` });
          }
        });

        host.appendChild(autocomplete);
        widget = autocomplete;
        placeAutocompleteElementRef.current = autocomplete;
        setMapAutocompleteState({ tone: "ready", message: "השלמה אוטומטית מוכנה." });
        setGoogleMapsReady(true);
      } catch (error) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.error("Google Maps load failed", error);
        setMapAutocompleteState({ tone: "error", message: `לא הצלחתי לטעון את Google Maps. ${describeGoogleMapsLoadError(detail)}` });
        setGoogleMapsReady(false);
      }
    }

    setupAutocomplete();

    return () => {
      cancelled = true;
      if (widget && widget.parentElement) {
        widget.parentElement.removeChild(widget);
      }
      if (placeAutocompleteElementRef.current === widget) {
        placeAutocompleteElementRef.current = null;
      }
    };
  }, [isAddingPlace, editingPlaceId]);
  useEffect(() => {
    if (!isAddingPlace || addPlaceMode !== "search" || !addPlaceIntentSeed?.query) return;
    const timer = window.setTimeout(() => applyAddPlaceSearchSeed(addPlaceIntentSeed), googleMapsReady ? 120 : 260);
    return () => window.clearTimeout(timer);
  }, [addPlaceIntentSeed, addPlaceMode, googleMapsReady, isAddingPlace]);
  useEffect(() => {
    if (!isAddingPlace || addPlaceMode !== "search" || !addPlaceIntentSeed || existingIntentPlace) return;
    if (placeSearchState.tone === "loading" && placeSearchCandidates.length) return;
    const timer = window.setTimeout(() => {
      searchGooglePlacesForIntent(addPlaceIntentSeed);
    }, googleMapsReady ? 180 : 320);
    return () => window.clearTimeout(timer);
  }, [addPlaceIntentSeed, addPlaceMode, existingIntentPlace, googleMapsReady, isAddingPlace]);
  // Initialize hotelDraft when opening the hotel editor
  useEffect(() => {
    if (!isEditingHotel && !showHotelEditDialog) return;
    const h = editingHotelId ? hotels.find((hotel) => hotel.id === editingHotelId) : null;
    setHotelDraft(h ? {
      name: h.name, address: h.address,
      lat: h.lat != null ? String(h.lat) : "", lng: h.lng != null ? String(h.lng) : "",
      checkInDate: h.checkInDate ?? "", checkInTime: h.checkInTime ?? "",
      checkOutDate: h.checkOutDate ?? "", checkOutTime: h.checkOutTime ?? "",
      imageUrl: h.imageUrl ?? "", googlePlaceId: h.googlePlaceId ?? "",
      googleMapsUrl: h.googleMapsUrl ?? "", websiteUrl: h.websiteUrl ?? "",
      phoneNumber: h.phoneNumber ?? "", rating: h.rating != null ? String(h.rating) : "",
    } : emptyHotelDraft);
  }, [isEditingHotel, showHotelEditDialog, editingHotelId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Set up Google Places autocomplete widget in the hotel form
  useEffect(() => {
    if (!isEditingHotel && !showHotelEditDialog) return;
    if (!GOOGLE_MAPS_API_KEY) return;
    let cancelled = false;
    let widget: HTMLElement | null = null;
    async function setupHotelAutocomplete() {
      try {
        const placesLibrary = await importPlacesLibrary();
        if (cancelled) return;
        const { PlaceAutocompleteElement } = placesLibrary as { PlaceAutocompleteElement: new (options?: object) => HTMLElement };
        const host = hotelAutocompleteHostRef.current;
        if (!host) return;
        host.innerHTML = "";
        const autocomplete = new PlaceAutocompleteElement();
        autocomplete.setAttribute("placeholder", "חיפוש מלון ב-Google Maps");
        autocomplete.className = "place-autocomplete-widget";
        autocomplete.addEventListener("gmp-select", async (event: any) => {
          const placePrediction = event.placePrediction;
          const place = placePrediction.toPlace();
          try {
            await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "nationalPhoneNumber", "websiteURI", "googleMapsURI", "rating", "photos"] });
            const displayName = place.displayName?.toString?.() || place.displayName || "";
            const formattedAddress = place.formattedAddress || "";
            const latitude = place.location?.lat?.();
            const longitude = place.location?.lng?.();
            const photoUrl = place.photos?.[0]?.getUrl?.({ maxWidth: 1400, maxHeight: 900 }) || "";
            setHotelDraft((current) => ({
              ...current,
              name: displayName || current.name,
              address: formattedAddress || current.address,
              lat: Number.isFinite(latitude) ? formatCoordinate(latitude) : current.lat,
              lng: Number.isFinite(longitude) ? formatCoordinate(longitude) : current.lng,
              imageUrl: photoUrl || current.imageUrl,
              websiteUrl: place.websiteURI || current.websiteUrl,
              phoneNumber: place.nationalPhoneNumber || current.phoneNumber,
              googleMapsUrl: place.googleMapsURI || current.googleMapsUrl,
              googlePlaceId: place.id || current.googlePlaceId,
              rating: place.rating != null ? String(place.rating) : current.rating,
            }));
          } catch (error) {
            console.error("Hotel place fetch error", error);
          }
        });
        host.appendChild(autocomplete);
        widget = autocomplete;
        hotelAutocompleteElementRef.current = autocomplete;
        setHotelAutocompleteReady(true);
      } catch (error) {
        console.error("Hotel autocomplete setup failed", error);
      }
    }
    setupHotelAutocomplete();
    return () => {
      cancelled = true;
      if (widget && widget.parentElement) widget.parentElement.removeChild(widget);
      if (hotelAutocompleteElementRef.current === widget) hotelAutocompleteElementRef.current = null;
      setHotelAutocompleteReady(false);
    };
  }, [isEditingHotel, showHotelEditDialog]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredPlaces = useMemo(() => places.filter((place) => { const q = query.toLowerCase(); const matchesQuery = !query.trim() || place.name.toLowerCase().includes(q) || place.shortDescription.toLowerCase().includes(q) || place.address.toLowerCase().includes(q); const matchesType = typeFilter === "הכול" || place.type === typeFilter; const matchesArea = areaFilter === "הכול" || place.area === areaFilter; return matchesQuery && matchesType && matchesArea; }), [areaFilter, places, query, typeFilter]);
  const areaOptions = useMemo(() => baseAreas.concat(places.map((place) => place.area).filter(Boolean)).filter((area, index, all) => all.indexOf(area) === index), [places]);
  const assignedDayByPlaceId = useMemo(() => dayPlans.reduce<Record<string, string>>((result, day) => {
    day.placeIds.forEach((placeId) => {
      if (!result[placeId]) result[placeId] = day.id;
    });
    return result;
  }, {}), [dayPlans]);
  const pinnedDayByPlaceId = useMemo(() => dayPlans.reduce<Record<string, string>>((result, day) => {
    day.pinnedPlaceIds.forEach((placeId) => {
      if (!result[placeId]) result[placeId] = day.id;
    });
    return result;
  }, {}), [dayPlans]);
  const plannedPlacesCount = useMemo(() => Object.keys(assignedDayByPlaceId).length, [assignedDayByPlaceId]);
  const unplannedPlaces = useMemo(() => places.filter((place) => !assignedDayByPlaceId[place.id]), [assignedDayByPlaceId, places]);
  const activeDaysCount = useMemo(() => dayPlans.filter((day) => day.placeIds.length > 0).length, [dayPlans]);
  const pinnedPlacesCount = useMemo(() => Object.keys(pinnedDayByPlaceId).length, [pinnedDayByPlaceId]);
  const flightContextByDayId = useMemo(() => dayPlans.reduce<Record<string, PlannerDayFlightContext>>((result, day, index) => {
    result[day.id] = buildPlannerDayFlightContext(index, dayPlans.length, day, tripConfig, flights);
    return result;
  }, {}), [dayPlans, tripConfig, flights]);
  const timelineByDayId = useMemo(() => dayPlans.reduce<Record<string, ReturnType<typeof buildDayTimeline>>>((result, day, index) => {
    const activeHotel = getActiveHotelForDay(index, hotels, tripConfig) ?? defaultHotel;
    const dayDate = tripConfig?.startDate ? (() => { const d = new Date(tripConfig.startDate); d.setDate(d.getDate() + index); return d.toISOString().slice(0, 10); })() : undefined;
    result[day.id] = buildDayTimeline(day, places, activeHotel, tripConfig, flightContextByDayId[day.id] ?? buildPlannerDayFlightContext(0, dayPlans.length, day, tripConfig, flights), dayDate);
    return result;
  }, {}), [dayPlans, hotels, places, tripConfig, flightContextByDayId, flights]);
  useEffect(() => {
    if (!dayPlans.length) return;
    if (!activePlannerDayId || !dayPlans.some((day) => day.id === activePlannerDayId)) {
      setActivePlannerDayId(dayPlans[0].id);
    }
  }, [activePlannerDayId, dayPlans]);
  const resetPlaceEditor = () => { setPlaceDraft(emptyPlaceDraft); setEditingPlaceId(null); setImportUrl(""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); setAddPlaceMode("search"); setAutocompleteSelected(false); setAddPlaceIntentSeed(null); setPendingPinRequest(null); setExistingIntentPlace(null); setPlaceSearchCandidates([]); setPlaceSearchState({ tone: "idle", message: "" }); };
  const updatePlaceDraft = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => setPlaceDraft((current) => ({ ...current, [key]: value }));
  const updateHotelDraft = <K extends keyof HotelDraft>(key: K, value: HotelDraft[K]) => setHotelDraft((current) => ({ ...current, [key]: value }));

  const openPlaceModal = (placeId: string) => setModalPlaceId(placeId);
  const openPlacePage = (placeId: string) => {
    closePlaceModal();
    navigate(getPlacePath(placeId, tripId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closePlaceModal = () => setModalPlaceId(null);
  const applyAddPlaceSearchSeed = (seed: AddPlaceIntentSeed | null = addPlaceIntentSeed) => {
    const searchText = seed?.query?.trim();
    if (!searchText) return;
    const widget = placeAutocompleteElementRef.current as (HTMLElement & { value?: string; focus?: () => void; shadowRoot?: ShadowRoot | null }) | null;
    try {
      widget?.setAttribute?.("value", searchText);
      if (widget && "value" in widget) widget.value = searchText;
      const shadowInput = widget?.shadowRoot?.querySelector?.("input");
      if (shadowInput instanceof HTMLInputElement) {
        shadowInput.value = searchText;
        shadowInput.dispatchEvent(new Event("input", { bubbles: true }));
        shadowInput.focus();
        shadowInput.select();
      } else {
        widget?.focus?.();
      }
      setMapAutocompleteState({ tone: "ready", message: `ה-AI מציע לחפש: ${searchText}` });
    } catch {
      setMapAutocompleteState({ tone: "ready", message: `ה-AI מציע לחפש: ${searchText}` });
    }
  };
  const searchGooglePlacesForIntent = async (seed: AddPlaceIntentSeed) => {
    if (!GOOGLE_MAPS_API_KEY) {
      setPlaceSearchState({ tone: "error", message: "אין מפתח Google Maps זמין לחיפוש אוטומטי." });
      return;
    }
    try {
      setPlaceSearchState({ tone: "loading", message: `מחפש את ${seed.query} ב-Google Places...` });
      const placesLibrary = await importPlacesLibrary();
      const { Place, SearchByTextRankPreference } = placesLibrary as {
        Place: { searchByText: (request: Record<string, unknown>) => Promise<{ places: any[] }> };
        SearchByTextRankPreference?: { RELEVANCE?: string };
      };
      const { places: searchResults = [] } = await Place.searchByText({
        textQuery: seed.query,
        fields: [
          "id",
          "displayName",
          "formattedAddress",
          "location",
          "addressComponents",
          "businessStatus",
          "nationalPhoneNumber",
          "websiteURI",
          "googleMapsURI",
          "regularOpeningHours",
          "rating",
          "photos",
        ],
        language: "he",
        region: "GB",
        maxResultCount: 3,
        rankPreference: SearchByTextRankPreference?.RELEVANCE ?? "RELEVANCE",
        locationBias: deriveLocationBias(hotels, places),
      });
      const candidates = searchResults.map((place) => buildSearchCandidateFromGooglePlace(place, seed));
      setPlaceSearchCandidates(candidates);
      setPlaceSearchState(
        candidates.length
          ? { tone: "success", message: `מצאתי ${candidates.length} תוצאות רלוונטיות ב-Google Places.` }
          : { tone: "error", message: "לא מצאתי תוצאה ברורה ב-Google Places. אפשר להוסיף ידנית." },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setPlaceSearchCandidates([]);
      setPlaceSearchState({ tone: "error", message: `חיפוש Google Places נכשל: ${detail}` });
    }
  };
  const applyCandidateDraft = (candidate: PlaceSearchCandidate) => {
    setPlaceDraft((current) => ({
      ...current,
      ...candidate.draft,
    }));
    setAutocompleteSelected(true);
    setPlaceFormState({ tone: "success", message: "הפרטים נטענו מ-Google Places. אפשר להוסיף את המקום." });
  };
  const startAddingPlace = (params?: Record<string, unknown>) => {
    const intentSeed = params ? buildAddPlaceIntentSeed(params) : null;
    resetPlaceEditor();
    if (intentSeed) {
      const existing = findExistingPlaceForIntent(intentSeed.name);
      setAddPlaceIntentSeed(intentSeed);
      setPlaceDraft({
        ...emptyPlaceDraft,
        name: intentSeed.name,
        type: intentSeed.type || emptyPlaceDraft.type,
        area: intentSeed.area || "",
        address: intentSeed.addressHint || "",
        shortDescription: intentSeed.shortDescription || "",
        visitDurationMinutes: intentSeed.visitDurationMinutes ? String(intentSeed.visitDurationMinutes) : "",
      });
      setExistingIntentPlace(existing);
      setMapAutocompleteState({ tone: "ready", message: `ה-AI מציע לחפש ב-Google Places: ${intentSeed.query}` });
      setPlaceSearchState(existing
        ? { tone: "success", message: `בדקתי, והמקום כבר קיים אצלך ברשימה: ${existing.name}.` }
        : { tone: "loading", message: `בודק אם ${intentSeed.name} קיים ומחפש התאמות ב-Google Places...` });
      setAddPlaceMode("search");
    }
    setIsAddingPlace(true);
    navigate(viewPaths.home);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelAddingPlace = () => { resetPlaceEditor(); setIsAddingPlace(false); };
  const startEditingPlace = (place: Place) => { setModalPlaceId(null); setEditingPlaceId(place.id); setPlaceDraft(placeToDraft(place)); setImportUrl(place.sourceUrl || place.instagramUrl || ""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); setIsAddingPlace(false); navigate(getPlacePath(place.id, tripId)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const stopEditingPlace = () => resetPlaceEditor();
  // AI enrichment: fetch fresh web info (prices, hours, arrival/kids tips) into place.aiNotes
  const enrichPlace = async (placeId: string) => {
    setEnrichingPlaceIds((prev) => new Set(prev).add(placeId));
    setEnrichErrors((prev) => ({ ...prev, [placeId]: "" }));
    try {
      const result = await apiFetch(`${apiBase}/places/${placeId}/enrich`, { method: "POST" }) as { aiNotes: string };
      setPlaces((current) => current.map((p) => p.id === placeId ? { ...p, aiNotes: result.aiNotes } : p));
      return true;
    } catch (error) {
      setEnrichErrors((prev) => ({ ...prev, [placeId]: `השליפה נכשלה — אפשר לנסות שוב. (${error instanceof Error ? error.message : String(error)})` }));
      return false;
    } finally {
      setEnrichingPlaceIds((prev) => { const next = new Set(prev); next.delete(placeId); return next; });
    }
  };
  const enrichAllPlaces = async () => {
    if (bulkEnrich?.running) return;
    const targets = places.filter((p) => !p.aiNotes);
    if (!targets.length) return;
    setBulkEnrich({ running: true, done: 0, total: targets.length });
    for (const target of targets) {
      await enrichPlace(target.id);
      setBulkEnrich((prev) => prev ? { ...prev, done: prev.done + 1 } : prev);
    }
    setBulkEnrich((prev) => prev ? { ...prev, running: false } : prev);
  };
  const findExistingPlaceForIntent = (placeName: string) => {
    const target = normalizePlaceLookup(placeName);
    if (!target) return null;
    return (
      places.find((place) => normalizePlaceLookup(place.name) === target) ||
      places.find((place) => normalizePlaceLookup(place.name).includes(target)) ||
      places.find((place) => target.includes(normalizePlaceLookup(place.name)))
    ) ?? null;
  };
  const resolveDayIdFromIntent = (dayTitle: string | undefined, placeId?: string) => {
    const normalizedDay = normalizePlaceLookup(dayTitle || "");
    if (normalizedDay) {
      const exact = dayPlans.find((day) => normalizePlaceLookup(day.title) === normalizedDay);
      if (exact) return exact.id;
      const partial = dayPlans.find((day) => normalizePlaceLookup(day.title).includes(normalizedDay) || normalizedDay.includes(normalizePlaceLookup(day.title)));
      if (partial) return partial.id;
      const dayMatch = normalizedDay.match(/\d+/)?.[0];
      if (dayMatch) {
        const indexed = dayPlans.find((day) => day.title.includes(dayMatch) || day.id.endsWith(`-${dayMatch}`));
        if (indexed) return indexed.id;
      }
    }
    if (placeId) {
      const assigned = dayPlans.find((day) => day.placeIds.includes(placeId));
      if (assigned) return assigned.id;
    }
    return dayPlans[0]?.id ?? null;
  };
  const applyPendingPinToPlace = (place: Place, request: PendingPinRequest) => {
    const targetDayId = resolveDayIdFromIntent(request.dayTitle, place.id);
    if (!targetDayId) return false;
    addPlaceToDay(targetDayId, place.id, { pinOnAssign: true });
    setPinWithTime(targetDayId, place.id, request.time || "");
    setActivePlannerDayId(targetDayId);
    navigate(viewPaths.planner);
    return true;
  };
  const startSetTimeFlow = (params: Record<string, unknown>) => {
    const request = buildPendingPinRequest(params);
    if (!request) {
      navigate(viewPaths.planner);
      return;
    }
    const existingPlace = findExistingPlaceForIntent(request.name);
    if (existingPlace) {
      applyPendingPinToPlace(existingPlace, request);
      return;
    }
    resetPlaceEditor();
    setPendingPinRequest(request);
    setAddPlaceIntentSeed(request);
    setPlaceDraft({
      ...emptyPlaceDraft,
      name: request.name,
      type: request.type || emptyPlaceDraft.type,
      area: request.area || "",
      address: request.addressHint || "",
      shortDescription: request.shortDescription || "",
      visitDurationMinutes: request.visitDurationMinutes ? String(request.visitDurationMinutes) : "",
    });
    setMapAutocompleteState({
      tone: "ready",
      message: `המקום לא קיים עדיין. חפש ב-Google Places את ${request.query} ולאחר השמירה נעגן אותו${request.dayTitle ? ` ל-${request.dayTitle}` : ""}${request.time ? ` בשעה ${request.time}` : ""}.`,
    });
    setPlaceFormState({
      tone: "success",
      message: `המקום עדיין לא שמור. אחרי שתוסיף אותו נעדכן לו עיגון${request.dayTitle ? ` ל-${request.dayTitle}` : ""}${request.time ? ` בשעה ${request.time}` : ""}.`,
    });
    setAddPlaceMode("search");
    setAutocompleteSelected(false);
    setIsAddingPlace(true);
    navigate(viewPaths.home);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  async function fetchAndSetImport(url: string) {
    try {
      setLinkImportState({ tone: "loading", message: "מנסה למשוך פרטים מהלינק..." });
      const parsed = parsePlaceLink(url);
      if (parsed.address && (!parsed.lat || !parsed.lng)) {
        try { const coordinates = await geocodeAddress(parsed.address); parsed.lat = formatCoordinate(coordinates.lat); parsed.lng = formatCoordinate(coordinates.lng); } catch {}
      }
      setPlaceDraft((current) => ({ ...current, ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string" && value.trim())) }));
      setLinkImportState({ tone: "success", message: "הפרטים נטענו מהקישור. אפשר לשמור את המקום." });
    } catch {
      setLinkImportState({ tone: "error", message: "כשלון בטעינת הקישור. ודא שהקישור תקין." });
    }
  }
  async function handleImportLink() {
    try {
      const parsed = parsePlaceLink(importUrl);
      if (parsed.address && (!parsed.lat || !parsed.lng)) {
        try { const coordinates = await geocodeAddress(parsed.address); parsed.lat = formatCoordinate(coordinates.lat); parsed.lng = formatCoordinate(coordinates.lng); } catch {}
      }
      setPlaceDraft((current) => ({ ...current, ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === "string" && value.trim())) }));
      setLinkImportState({ tone: "success", message: "הפרטים עודכנו בטופס. אפשר לעבור ולתקן לפני שמירה." });
    } catch {
      setLinkImportState({ tone: "error", message: "הלינק לא בפורמט שזיהיתי. הכי טוב להדביק לינק מלא של Google Maps או Instagram." });
    }
  }
  function applyDefaultHotel() { setHotels([defaultHotel]); setHotelLookupState("done"); setIsEditingHotel(false); }
  async function handleHotelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = hotelDraft.name.trim();
    const address = hotelDraft.address.trim();
    const checkInDate = hotelDraft.checkInDate || undefined;
    const checkOutDate = hotelDraft.checkOutDate || undefined;
    const checkInTime = hotelDraft.checkInTime || undefined;
    const checkOutTime = hotelDraft.checkOutTime || undefined;
    if (!name || !address) return;
    let lat: number; let lng: number;
    if (hotelDraft.lat && hotelDraft.lng) { lat = Number(hotelDraft.lat); lng = Number(hotelDraft.lng); }
    else {
      try { setHotelLookupState("loading"); const coordinates = await geocodeAddress(address); lat = coordinates.lat; lng = coordinates.lng; }
      catch { const fallback = hotels.find((h) => h.id === editingHotelId) ?? defaultHotel; setHotels((current) => editingHotelId ? current.map((h) => h.id === editingHotelId ? { ...h, name, address, checkInDate, checkOutDate, checkInTime, checkOutTime } : h) : [...current, { id: crypto.randomUUID(), name, address, lat: fallback.lat, lng: fallback.lng, checkInDate, checkOutDate, checkInTime, checkOutTime }]); setHotelLookupState("error"); return; }
    }
    const hotelData: Omit<Hotel, "id"> = {
      name, address, lat, lng, checkInDate, checkOutDate, checkInTime, checkOutTime,
      imageUrl: hotelDraft.imageUrl || undefined,
      googlePlaceId: hotelDraft.googlePlaceId || undefined,
      googleMapsUrl: hotelDraft.googleMapsUrl || undefined,
      websiteUrl: hotelDraft.websiteUrl || undefined,
      phoneNumber: hotelDraft.phoneNumber || undefined,
      rating: hotelDraft.rating ? Number(hotelDraft.rating) : undefined,
    };
    if (editingHotelId) { setHotels((current) => current.map((h) => h.id === editingHotelId ? { ...h, ...hotelData } : h)); }
    else { setHotels((current) => [...current, { id: crypto.randomUUID(), ...hotelData }]); }
    setHotelLookupState("done"); setIsEditingHotel(false); setEditingHotelId(null); setShowHotelEditDialog(false);
  }
  async function savePlaceDraft(draftOverride?: PlaceDraft, pendingPinOverride?: PendingPinRequest | null) {
    const draft = draftOverride ?? placeDraft;
    const name = draft.name.trim(); const address = draft.address.trim();
    if (!name || !address) { setPlaceFormState({ tone: "error", message: "צריך לפחות שם וכתובת כדי לשמור מקום." }); return false; }
    const duplicate = !editingPlaceId ? findExistingPlaceForIntent(name) : null;
    if (duplicate) {
      setExistingIntentPlace(duplicate);
      setPlaceFormState({ tone: "success", message: `המקום כבר קיים ברשימה שלך: ${duplicate.name}.` });
      return false;
    }
    let lat = draft.lat.trim() ? Number(draft.lat) : Number.NaN; let lng = draft.lng.trim() ? Number(draft.lng) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      try { setPlaceFormState({ tone: "loading", message: "מחפש מיקום לפי הכתובת..." }); const coordinates = await geocodeAddress(address); lat = coordinates.lat; lng = coordinates.lng; }
      catch { setPlaceFormState({ tone: "error", message: "לא הצלחתי לאתר את המיקום מהכתובת. אפשר להוסיף ידנית קו רוחב וקו אורך." }); return false; }
    }
    const existingPlace = editingPlaceId ? places.find((place) => place.id === editingPlaceId) : undefined;
    const nextPlace: Place = { id: existingPlace?.id || buildPlaceId(name), name, shortDescription: draft.shortDescription.trim(), address, openingHours: draft.openingHours.trim(), type: draft.type, area: draft.area.trim(), rating: existingPlace?.rating, tips: draft.tips.split(",").map((item) => item.trim()).filter(Boolean), imageUrl: draft.imageUrl.trim() || existingPlace?.imageUrl || defaultPlaceImage, sourceUrl: draft.sourceUrl.trim() || undefined, instagramUrl: draft.instagramUrl.trim() || undefined, station: draft.station.trim() || undefined, lat, lng, websiteUrl: draft.websiteUrl.trim() || existingPlace?.websiteUrl || undefined, phoneNumber: draft.phoneNumber.trim() || existingPlace?.phoneNumber || undefined, googleMapsUrl: draft.googleMapsUrl.trim() || existingPlace?.googleMapsUrl || undefined, googlePlaceId: draft.googlePlaceId.trim() || existingPlace?.googlePlaceId || undefined, businessStatus: draft.businessStatus.trim() || existingPlace?.businessStatus || undefined, priority: draft.priority ? Number(draft.priority) : 3, visitDurationMinutes: draft.visitDurationMinutes ? Number(draft.visitDurationMinutes) : undefined, entryCost: draft.entryCost !== "" ? Number(draft.entryCost) : undefined, aiNotes: draft.aiNotes.trim() || existingPlace?.aiNotes || undefined };
    const pendingPin = !editingPlaceId ? (pendingPinOverride ?? pendingPinRequest) : null;
    // Event places get pinned to their day+time straight from the form
    const eventPin = !editingPlaceId && draft.type === "אירוע" && draft.eventDayId ? { dayId: draft.eventDayId, time: draft.eventTime.trim() } : null;
    setPlaces((current) => editingPlaceId ? current.map((place) => place.id === editingPlaceId ? nextPlace : place) : [nextPlace, ...current]);
    apiFetch(`${apiBase}/places`, { method: "POST", body: JSON.stringify(nextPlace) }).catch(() => {});
    setPlaceFormState({ tone: "success", message: editingPlaceId ? "השינויים נשמרו." : "המקום נוסף לרשימה." });
    setLinkImportState({ tone: "idle", message: "" });
    if (editingPlaceId) { resetPlaceEditor(); navigate(getPlacePath(nextPlace.id, tripId)); }
    else if (pendingPin && applyPendingPinToPlace(nextPlace, pendingPin)) { resetPlaceEditor(); setIsAddingPlace(false); }
    else if (eventPin) {
      addPlaceToDay(eventPin.dayId, nextPlace.id, { pinOnAssign: true });
      setPinWithTime(eventPin.dayId, nextPlace.id, eventPin.time);
      setActivePlannerDayId(eventPin.dayId);
      resetPlaceEditor(); setIsAddingPlace(false); navigate(viewPaths.planner);
    }
    else { resetPlaceEditor(); setIsAddingPlace(false); navigate(getPlacePath(nextPlace.id, tripId)); }
    return true;
  }
  async function handlePlaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savePlaceDraft();
  }
  const addPlaceToDay = (dayId: string, placeId: string, options?: { pinOnAssign?: boolean }) => {
    if (!placeId) return;
    const shouldPinOnAssign = Boolean(options?.pinOnAssign);
    setDayPlans((current) => current.map((day) => {
      const wasPinned = day.pinnedPlaceIds.includes(placeId);
      const nextPlaceIds = day.placeIds.filter((id) => id !== placeId);
      const nextPinnedPlaceIds = day.pinnedPlaceIds.filter((id) => id !== placeId);
      if (day.id !== dayId) {
        if (nextPlaceIds.length === day.placeIds.length && nextPinnedPlaceIds.length === day.pinnedPlaceIds.length) return day;
        return { ...day, placeIds: nextPlaceIds, pinnedPlaceIds: nextPinnedPlaceIds };
      }
      return {
        ...day,
        placeIds: [...nextPlaceIds, placeId],
        pinnedPlaceIds: wasPinned || shouldPinOnAssign ? [...nextPinnedPlaceIds, placeId] : nextPinnedPlaceIds,
      };
    }));
  };
  const movePlace = (dayId: string, index: number, direction: -1 | 1) => setDayPlans((current) => current.map((day) => { if (day.id !== dayId) return day; const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= day.placeIds.length) return day; const reordered = [...day.placeIds]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]; return { ...day, placeIds: reordered }; }));
  const removePlaceFromDay = (dayId: string, placeId: string) => setDayPlans((current) => current.map((day) => {
    if (day.id !== dayId) return day;
    const newPinnedTimes = { ...(day.pinnedTimes || {}) };
    delete newPinnedTimes[placeId];
    return { ...day, placeIds: day.placeIds.filter((id) => id !== placeId), pinnedPlaceIds: day.pinnedPlaceIds.filter((id) => id !== placeId), pinnedTimes: newPinnedTimes };
  }));
  const clearPlaceAssignment = (placeId: string) => setDayPlans((current) => current.map((day) => {
    if (!day.placeIds.includes(placeId) && !day.pinnedPlaceIds.includes(placeId)) return day;
    const newPinnedTimes = { ...(day.pinnedTimes || {}) };
    delete newPinnedTimes[placeId];
    return { ...day, placeIds: day.placeIds.filter((id) => id !== placeId), pinnedPlaceIds: day.pinnedPlaceIds.filter((id) => id !== placeId), pinnedTimes: newPinnedTimes };
  }));
  const deletePlace = (placeId: string) => {
    if (!window.confirm("למחוק את המקום הזה?")) return;
    if (editingPlaceId === placeId) resetPlaceEditor();
    setPlaces((current) => current.filter((p) => p.id !== placeId));
    clearPlaceAssignment(placeId);
    apiFetch(`${apiBase}/places/${placeId}`, { method: "DELETE" }).catch(() => {});
    if (selectedPlaceId === placeId) navigate(viewPaths.home);
  };
  const setPlacePriority = (placeId: string, priority: number) => { const place = places.find((p) => p.id === placeId); if (!place) return; const updated = { ...place, priority }; setPlaces((current) => current.map((p) => p.id === placeId ? updated : p)); apiFetch(`${apiBase}/places/${placeId}`, { method: "PUT", body: JSON.stringify(updated) }).catch(() => {}); };
  const clearDayPlan = (dayId: string) => setDayPlans((current) => current.map((day) => day.id === dayId ? { ...day, placeIds: [], pinnedPlaceIds: [] } : day));
  const togglePlacePin = (dayId: string, placeId: string) => setDayPlans((current) => current.map((day) => {
    if (day.id !== dayId || !day.placeIds.includes(placeId)) return day;
    const isPinned = day.pinnedPlaceIds.includes(placeId);
    if (isPinned) {
      const newPinnedTimes = { ...(day.pinnedTimes || {}) };
      delete newPinnedTimes[placeId];
      return { ...day, pinnedPlaceIds: day.pinnedPlaceIds.filter((id) => id !== placeId), pinnedTimes: newPinnedTimes };
    }
    return { ...day, pinnedPlaceIds: [...day.pinnedPlaceIds, placeId] };
  }));
  const setPinWithTime = (dayId: string, placeId: string, time: string) => setDayPlans((current) => current.map((day) => {
    if (day.id !== dayId || !day.placeIds.includes(placeId)) return day;
    const newPinnedTimes = { ...(day.pinnedTimes || {}) };
    if (time) newPinnedTimes[placeId] = time; else delete newPinnedTimes[placeId];
    return { ...day, pinnedPlaceIds: day.pinnedPlaceIds.includes(placeId) ? day.pinnedPlaceIds : [...day.pinnedPlaceIds, placeId], pinnedTimes: newPinnedTimes };
  }));
  const autoFillWeek = () => setDayPlans((current) => autoDistributeWeek(current, places, hotels[0] ?? defaultHotel, visitedIds, tripConfig, flights));
  const toggleVisited = (placeId: string) => setVisitedIds((current) => current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]);
  const addFlight = async () => {
    if (!flightDraft.type || !flightDraft.flightDate || !flightDraft.flightTime) return;
    const newFlight: Flight = { id: `flight-${Date.now()}`, type: flightDraft.type as "arrival" | "departure", flightDate: flightDraft.flightDate!, flightTime: flightDraft.flightTime!, airport: flightDraft.airport || "", flightNumber: flightDraft.flightNumber || undefined, transferMinutes: flightDraft.transferMinutes ?? 45, notes: flightDraft.notes || "" };
    setFlights((current) => [...current, newFlight]);
    apiFetch(`${apiBase}/flights`, { method: "POST", body: JSON.stringify(newFlight) }).catch(() => {});
    setFlightDraft({ type: "arrival", transferMinutes: 45 });
  };
  const removeFlight = (id: string) => {
    setFlights((current) => current.filter((f) => f.id !== id));
    apiFetch(`${apiBase}/flights/${id}`, { method: "DELETE" }).catch(() => {});
  };
  const buildAiContext = () => ({ places, hotels, dayPlans, tripConfig, flights, visitedIds });
  const runAiPlan = async () => {
    setAiPlanLoading(true);
    setAiPlanResult(null);
    try {
      const result = await apiFetch(`/trips/${tripId}/ai/plan`, { method: "POST", body: JSON.stringify(buildAiContext()) }) as AiPlanResult;
      setAiPlanResult(result);
    } catch (e) {
      setAiPlanResult({ plan: {}, excluded: [], recommendations: [], summary: `שגיאה: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setAiPlanLoading(false);
    }
  };
  const applyAiPlan = (result: AiPlanResult | ChatAiPlanResult) => {
    setDayPlans((current) => current.map((day) => {
      const aiPlaceIds = result.plan[day.id];
      if (!aiPlaceIds) return day;
      // Keep pinned places and merge AI suggestions
      const pinned = day.pinnedPlaceIds.filter((id) => day.placeIds.includes(id));
      const merged = [...new Set([...pinned, ...aiPlaceIds])];
      return { ...day, placeIds: merged };
    }));
    setAiPlanResult(null);
  };

  const handleChatAction = (intent: string, params: Record<string, unknown>) => {
    switch (intent) {
      case 'mark_visited': {
        const found = findExistingPlaceForIntent((params.placeName as string) ?? '');
        if (found) toggleVisited(found.id);
        else navigate(viewPaths.home); // place not found — let the user mark it manually
        break;
      }
      case 'add_place':
        startAddingPlace(params);
        break;
      case 'add_place_confirm': {
        const candidateDraft = params.candidateDraft;
        if (candidateDraft && typeof candidateDraft === "object") {
          void savePlaceDraft({ ...emptyPlaceDraft, ...(candidateDraft as Partial<PlaceDraft>) } as PlaceDraft);
        }
        break;
      }
      case 'edit_place': {
        const field = params.field as string;
        const value = params.value;
        // Fields the AI is allowed to update directly
        const ALLOWED_FIELDS: (keyof Place)[] = [
          'openingHours', 'visitDurationMinutes', 'entryCost',
          'shortDescription', 'area', 'station', 'tips',
        ];
        const found = findExistingPlaceForIntent((params.placeName as string) ?? '');
        if (found && field && ALLOWED_FIELDS.includes(field as keyof Place) && value !== undefined) {
          const parsedValue =
            field === 'visitDurationMinutes' || field === 'entryCost'
              ? Number(value)
              : field === 'tips'
              ? (typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value)
              : value;
          const updated = { ...found, [field]: parsedValue } as Place;
          setPlaces((current) => current.map((p) => p.id === found.id ? updated : p));
          apiFetch(`${apiBase}/places/${found.id}`, { method: 'PUT', body: JSON.stringify(updated) }).catch(() => {});
        } else {
          // Can't auto-apply — navigate to planner so user can edit manually
          navigate(viewPaths.planner);
        }
        break;
      }
      case 'set_time':
        startSetTimeFlow(params);
        break;
      case 'set_time_confirm': {
        const candidateDraft = params.candidateDraft;
        const pending = buildPendingPinRequest(params);
        if (candidateDraft && typeof candidateDraft === "object") {
          void savePlaceDraft({ ...emptyPlaceDraft, ...(candidateDraft as Partial<PlaceDraft>) } as PlaceDraft, pending);
        } else {
          startSetTimeFlow(params);
        }
        break;
      }
      case 'reschedule':
        navigate(viewPaths.settings);
        // The button says "open flight update" — land the user on the flights section
        setTimeout(() => document.getElementById('settings-flights')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
        break;
    }
  };
  const sendChatMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || aiChatLoading) return;
    const userMessage: ChatMessage = { role: "user", content: msg };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput("");
    setAiChatLoading(true);
    try {
      const history = chatMessages.map((m) => ({ role: m.role, content: m.content }));
      const result = await apiFetch(`${apiBase}/ai/chat`, { method: "POST", body: JSON.stringify({ message: msg, history, ...buildAiContext() }) }) as { reply: string };
      setChatMessages((current) => [...current, { role: "assistant", content: result.reply }]);
    } catch (e) {
      setChatMessages((current) => [...current, { role: "assistant", content: `שגיאה: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setAiChatLoading(false);
    }
  };
  const movePlaceByDrag = (sourceDayId: string | null, placeId: string, targetDayId: string, targetPlaceId?: string | null) => {
    setDayPlans((current) => {
      const isPinned = current.some((day) => day.pinnedPlaceIds.includes(placeId));
      return current.map((day) => {
        const nextPlaceIds = day.placeIds.filter((id) => id !== placeId);
        const nextPinnedIds = day.pinnedPlaceIds.filter((id) => id !== placeId);
        if (day.id !== targetDayId) {
          if (nextPlaceIds.length === day.placeIds.length && nextPinnedIds.length === day.pinnedPlaceIds.length) return day;
          return { ...day, placeIds: nextPlaceIds, pinnedPlaceIds: nextPinnedIds };
        }
        const insertIndex = targetPlaceId ? Math.max(0, nextPlaceIds.indexOf(targetPlaceId)) : nextPlaceIds.length;
        const reordered = [...nextPlaceIds];
        reordered.splice(insertIndex, 0, placeId);
        return { ...day, placeIds: reordered, pinnedPlaceIds: isPinned ? [...nextPinnedIds, placeId] : nextPinnedIds };
      });
    });
    setDraggedPlace(null);
    setDragTarget(null);
  };
  const handlePlaceDragStart = (sourceDayId: string | null, placeId: string) => setDraggedPlace({ sourceDayId, placeId });
  const handlePlaceDragEnd = () => {
    setDraggedPlace(null);
    setDragTarget(null);
  };
  const handleDayDrop = (targetDayId: string, targetPlaceId?: string | null) => {
    if (!draggedPlace) return;
    movePlaceByDrag(draggedPlace.sourceDayId, draggedPlace.placeId, targetDayId, targetPlaceId);
  };
  const renderPlaceFormBody = (submitLabel: string, cancelAction?: () => void, options?: { inline?: boolean; showImportTools?: boolean }) => (
    <>
      {options?.showImportTools !== false && (
        <div className={`import-section${options?.inline ? " import-section--inline" : ""}`}>
          <div className="import-block">
            <h3 className="import-block-title">חיפוש ב-Google Maps</h3>
            <p className="import-block-desc">הקלד שם מקום או כתובת ובחר מהרשימה — הפרטים יתמלאו אוטומטית.</p>
            <div ref={placeAutocompleteHostRef} className="google-autocomplete-host" />
            {mapAutocompleteState.message && <p className={`form-message ${mapAutocompleteState.tone}`}>{mapAutocompleteState.message}</p>}
          </div>
          <div className="import-divider"><span>או</span></div>
          <div className="import-block">
            <h3 className="import-block-title">ייבוא מלינק</h3>
            <p className="import-block-desc">הדבק קישור של Google Maps או Instagram ולחץ ייבוא.</p>
            <div className="link-import"><input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://maps.google.com/..." /><button type="button" onClick={handleImportLink}>ייבוא פרטים</button></div>
            {linkImportState.tone !== "idle" && <p className={`form-message ${linkImportState.tone}`}>{linkImportState.message}</p>}
          </div>
        </div>
      )}
      <form className={`form-layout${options?.inline ? " form-layout--inline" : ""}`} onSubmit={handlePlaceSubmit}>
        <div className="form-stack">
          <label>שם המקום<input value={placeDraft.name} onChange={(event) => updatePlaceDraft("name", event.target.value)} /></label>
          <label>תיאור קצר<textarea rows={3} value={placeDraft.shortDescription} onChange={(event) => updatePlaceDraft("shortDescription", event.target.value)} /></label>
          <label>כתובת<input value={placeDraft.address} onChange={(event) => updatePlaceDraft("address", event.target.value)} /></label>
          <label>שעות פתיחה<input value={placeDraft.openingHours} onChange={(event) => updatePlaceDraft("openingHours", event.target.value)} placeholder="לדוגמה 10:00-18:00" /></label>
          <label>סוג<select value={placeDraft.type} onChange={(event) => updatePlaceDraft("type", event.target.value as PlaceType)}>{placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          {placeDraft.type === "אירוע" && !editingPlaceId && (
            <>
              <label>יום האירוע<select value={placeDraft.eventDayId} onChange={(event) => updatePlaceDraft("eventDayId", event.target.value)}><option value="">בחר יום (יעוגן אוטומטית)</option>{dayPlans.map((day) => <option key={day.id} value={day.id}>{day.title}</option>)}</select></label>
              <label>שעת האירוע<input type="time" value={placeDraft.eventTime} onChange={(event) => updatePlaceDraft("eventTime", event.target.value)} /></label>
            </>
          )}
          <label>אזור<input value={placeDraft.area} onChange={(event) => updatePlaceDraft("area", event.target.value)} /></label>
          <label>תחנה קרובה<input value={placeDraft.station} onChange={(event) => updatePlaceDraft("station", event.target.value)} /></label>
          <label>תמונה<input value={placeDraft.imageUrl} onChange={(event) => updatePlaceDraft("imageUrl", event.target.value)} /></label>
          <label>לינק למקום<input value={placeDraft.sourceUrl} onChange={(event) => updatePlaceDraft("sourceUrl", event.target.value)} /></label>
          <label>אינסטגרם<input value={placeDraft.instagramUrl} onChange={(event) => updatePlaceDraft("instagramUrl", event.target.value)} /></label>
          <label>אתר<input value={placeDraft.websiteUrl} onChange={(event) => updatePlaceDraft("websiteUrl", event.target.value)} placeholder="אתר העסק או השאר ריק" /></label>
          <label>טלפון<input value={placeDraft.phoneNumber} onChange={(event) => updatePlaceDraft("phoneNumber", event.target.value)} placeholder="מספר טלפון אם יש" /></label>
          <label>טיפים<textarea rows={3} value={placeDraft.tips} onChange={(event) => updatePlaceDraft("tips", event.target.value)} placeholder="מופרדים בפסיקים" /></label>
          <label>מידע ל-AI<textarea rows={4} value={placeDraft.aiNotes} onChange={(event) => updatePlaceDraft("aiNotes", event.target.value)} placeholder="מחירי כניסה, מתי כדאי להגיע, התאמה לילדים, הערות עונתיות — ה-AI מתחשב בזה בתכנון" /></label>
          <label>קו רוחב<input value={placeDraft.lat} onChange={(event) => updatePlaceDraft("lat", event.target.value)} /></label>
          <label>קו אורך<input value={placeDraft.lng} onChange={(event) => updatePlaceDraft("lng", event.target.value)} /></label>
        </div>
        {placeFormState.tone !== "idle" && <p className={`form-message ${placeFormState.tone}`}>{placeFormState.message}</p>}
        <div className="inline-actions">
          <button type="submit">{submitLabel}</button>
          {cancelAction && <button className="secondary-button" type="button" onClick={cancelAction}>ביטול</button>}
        </div>
      </form>
    </>
  );
  const renderPlaceDetails = (place: Place, options?: { isModal?: boolean; onClose?: () => void }) => {
    const transport = estimateTransport(haversineKm(hotels[0] ?? defaultHotel, place));
    const isModal = options?.isModal;
    const isEditingThisPlace = editingPlaceId === place.id;
    const detailMenuKey = isModal ? `modal:${place.id}` : `detail:${place.id}`;
    const assignedDay = assignedDayByPlaceId[place.id] ? dayPlans.find((day) => day.id === assignedDayByPlaceId[place.id]) ?? null : null;
    const pinnedDay = pinnedDayByPlaceId[place.id] ? dayPlans.find((day) => day.id === pinnedDayByPlaceId[place.id]) ?? null : null;
    const pinnedTime = pinnedDay?.pinnedTimes?.[place.id];
    const nearbyPlaces = places
      .filter((item) => item.id !== place.id)
      .map((item) => ({ place: item, distanceKm: haversineKm(place, item) }))
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, 3);

    const getPlaceTypeClass = (t: PlaceType) => {
      switch (t) {
        case "אטרקציה": return "attraction";
        case "מוזיאון": return "museum";
        case "פארק": return "park";
        case "אוכל": return "food";
        case "ילדים": return "kids";
        default: return "attraction";
      }
    };

    return (
      <section className={`panel place-detail-hero${isModal ? " place-detail-modal-card" : ""}`}>
        <div className="place-detail-media-column">
          <img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="place-detail-image" />
          <section className="place-focus-panel">
            <div className="place-focus-panel-head">
              <div>
                <h3>מיקום על המפה</h3>
                <p>{transport.mode} מהמלון · {transport.minutes} דק' · {formatDistance(haversineKm(hotels[0] ?? defaultHotel, place))}</p>
              </div>
            </div>
            <PlaceFocusMap place={place} nearbyPlaces={nearbyPlaces.map((item) => item.place)} hotel={hotels[0] ?? defaultHotel} />
            {!!nearbyPlaces.length && (
              <div className="nearby-places-block">
                <div className="nearby-places-head">
                  <strong>עוד מקומות קרובים מהרשימה</strong>
                  <span>{nearbyPlaces.length} הכי קרובים</span>
                </div>
                <div className="nearby-places-list">
                  {nearbyPlaces.map(({ place: nearbyPlace, distanceKm }) => (
                    <button key={nearbyPlace.id} type="button" className="nearby-place-card" onClick={() => openPlacePage(nearbyPlace.id)}>
                      <div className="nearby-place-card-text">
                        <strong>{nearbyPlace.name}</strong>
                        <span>{nearbyPlace.area || nearbyPlace.station || nearbyPlace.type}</span>
                      </div>
                      <span className="nearby-place-distance">{formatDistance(distanceKm)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {isEditingThisPlace ? (
          <form className="place-detail-content" onSubmit={handlePlaceSubmit}>
            <div className="place-detail-head-wrapper">
              <div className="location-header-meta" style={{ width: "100%", gap: "0.5rem" }}>
                <div className="editable-field-group" style={{ width: "auto" }}>
                  <label>סוג</label>
                  <select
                    className="inline-edit-input inline-edit-select"
                    value={placeDraft.type}
                    onChange={(e) => updatePlaceDraft("type", e.target.value as PlaceType)}
                  >
                    {placeTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="editable-field-group" style={{ flex: 1 }}>
                  <label>אזור / שכונה</label>
                  <input
                    className="inline-edit-input"
                    value={placeDraft.area}
                    onChange={(e) => updatePlaceDraft("area", e.target.value)}
                    placeholder="לדוגמה: Covent Garden"
                  />
                </div>
              </div>
              
              <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div className="editable-field-group">
                  <label>שם המקום</label>
                  <input
                    className="inline-edit-input title-input"
                    value={placeDraft.name}
                    onChange={(e) => updatePlaceDraft("name", e.target.value)}
                    placeholder="שם המקום"
                  />
                </div>
                
                <div className="editable-field-group">
                  <label>תיאור קצר</label>
                  <textarea
                    className="inline-edit-input inline-edit-textarea"
                    value={placeDraft.shortDescription}
                    onChange={(e) => updatePlaceDraft("shortDescription", e.target.value)}
                    placeholder="תיאור קצר של המקום"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <div className="location-info-grid">
              <div className="info-card">
                <span className="info-card-icon">📍</span>
                <div className="info-card-text">
                  <span className="info-card-label">כתובת</span>
                  <input
                    className="inline-edit-input"
                    value={placeDraft.address}
                    onChange={(e) => updatePlaceDraft("address", e.target.value)}
                    placeholder="כתובת מלאה"
                  />
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">🕒</span>
                <div className="info-card-text">
                  <span className="info-card-label">שעות פתיחה</span>
                  <input
                    className="inline-edit-input"
                    value={placeDraft.openingHours}
                    onChange={(e) => updatePlaceDraft("openingHours", e.target.value)}
                    placeholder="לדוגמה: 10:00-18:00"
                  />
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">🚇</span>
                <div className="info-card-text">
                  <span className="info-card-label">תחנה קרובה</span>
                  <input
                    className="inline-edit-input"
                    value={placeDraft.station}
                    onChange={(e) => updatePlaceDraft("station", e.target.value)}
                    placeholder="תחנה קרובה"
                  />
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">💳</span>
                <div className="info-card-text">
                  <span className="info-card-label">עלות וזמן ביקור</span>
                  <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                    <input
                      type="number"
                      className="inline-edit-input"
                      value={placeDraft.entryCost}
                      onChange={(e) => updatePlaceDraft("entryCost", e.target.value)}
                      placeholder="עלות (₪)"
                      style={{ width: "50%" }}
                    />
                    <input
                      type="number"
                      className="inline-edit-input"
                      value={placeDraft.visitDurationMinutes}
                      onChange={(e) => updatePlaceDraft("visitDurationMinutes", e.target.value)}
                      placeholder="זמן (דק')"
                      style={{ width: "50%" }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="advanced-accordion">
              <button
                type="button"
                className="advanced-accordion-trigger"
                onClick={() => setAdvancedOpen(!advancedOpen)}
              >
                <span>⚙️ הגדרות מתקדמות ומיקומים קואורדינטות</span>
                <span>{advancedOpen ? "▲" : "▼"}</span>
              </button>
              {advancedOpen && (
                <div className="advanced-accordion-content">
                  <div className="editable-field-group">
                    <label>עדיפות (1-5)</label>
                    <select
                      className="inline-edit-input inline-edit-select"
                      value={placeDraft.priority}
                      onChange={(e) => updatePlaceDraft("priority", e.target.value)}
                    >
                      <option value="1">1 - נמוכה</option>
                      <option value="2">2</option>
                      <option value="3">3 - רגילה</option>
                      <option value="4">4</option>
                      <option value="5">5 - גבוהה</option>
                    </select>
                  </div>
                  <div className="editable-field-group">
                    <label>סטטוס פעילות עסק</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.businessStatus}
                      onChange={(e) => updatePlaceDraft("businessStatus", e.target.value)}
                      placeholder="לדוגמה: OPERATIONAL"
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>קו רוחב (Latitude)</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.lat}
                      onChange={(e) => updatePlaceDraft("lat", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>קו אורך (Longitude)</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.lng}
                      onChange={(e) => updatePlaceDraft("lng", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group" style={{ gridColumn: "span 2" }}>
                    <label>כתובת תמונה (Image URL)</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.imageUrl}
                      onChange={(e) => updatePlaceDraft("imageUrl", e.target.value)}
                      placeholder="קישור לתמונה"
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>קישור Google Maps</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.googleMapsUrl}
                      onChange={(e) => updatePlaceDraft("googleMapsUrl", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>מזהה Google Place ID</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.googlePlaceId}
                      onChange={(e) => updatePlaceDraft("googlePlaceId", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>אתר אינטרנט</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.websiteUrl}
                      onChange={(e) => updatePlaceDraft("websiteUrl", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>טלפון</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.phoneNumber}
                      onChange={(e) => updatePlaceDraft("phoneNumber", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>קישור אינסטגרם</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.instagramUrl}
                      onChange={(e) => updatePlaceDraft("instagramUrl", e.target.value)}
                    />
                  </div>
                  <div className="editable-field-group">
                    <label>קישור מקור</label>
                    <input
                      className="inline-edit-input"
                      value={placeDraft.sourceUrl}
                      onChange={(e) => updatePlaceDraft("sourceUrl", e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <section className="sub-panel ai-notes-panel" style={{ width: "100%" }}>
              <div className="ai-notes-head">
                <h3>🔮 מידע ל-AI</h3>
              </div>
              <div className="editable-field-group">
                <textarea
                  className="inline-edit-input inline-edit-textarea"
                  value={placeDraft.aiNotes}
                  onChange={(e) => updatePlaceDraft("aiNotes", e.target.value)}
                  rows={4}
                  placeholder="מחירי כניסה, מתי כדאי להגיע, התאמה לילדים, הערות לעונה — ה-AI מתחשב בזה בתכנון"
                />
              </div>
            </section>

            <section className="sub-panel" style={{ width: "100%" }}>
              <div className="editable-field-group">
                <label>💡 טיפים (מופרדים בפסיקים)</label>
                <input
                  className="inline-edit-input"
                  value={placeDraft.tips}
                  onChange={(e) => updatePlaceDraft("tips", e.target.value)}
                  placeholder="לדוגמה: להזמין מראש, להגיע בשקיעה"
                />
              </div>
            </section>

            {placeFormState.tone === "error" && <p className="form-message error">{placeFormState.message}</p>}
            
            <div className="edit-mode-actions">
              <button type="submit" className="quick-action-btn active" disabled={placeFormState.tone === "loading"}>
                {placeFormState.tone === "loading" ? "שומר..." : "שמירת שינויים"}
              </button>
              <button type="button" className="quick-action-btn" onClick={stopEditingPlace}>
                ביטול
              </button>
            </div>
          </form>
        ) : (
          <div className="place-detail-content">
            <div className="place-detail-head-wrapper">
              <div className="location-header-meta">
                <span className={`chip chip--${getPlaceTypeClass(place.type)}`}>{place.type}</span>
                <span className="location-rating-badge">
                  ⭐ {place.rating ? place.rating.toFixed(1) : "חדש"}
                </span>
                {place.area && <span className="location-area-badge">{place.area}</span>}
              </div>
              <div className="section-head place-detail-head" style={{ marginTop: "0.35rem", paddingBottom: "0" }}>
                <div>
                  <h2>{place.name}</h2>
                  {place.shortDescription && <p className="detail-summary">{place.shortDescription}</p>}
                </div>
                <div className="place-detail-actions">
                  <div className="place-menu-wrap place-detail-menu-wrap">
                    <button
                      className="place-menu-btn"
                      type="button"
                      aria-label="אפשרויות מקום"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenPlaceMenu((prev) => prev === detailMenuKey ? null : detailMenuKey);
                      }}
                      onKeyDown={stopEventPropagation}
                    >
                      ⋯
                    </button>
                    {openPlaceMenu === detailMenuKey && (
                      <div className="place-context-menu" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={() => { startEditingPlace(place); setOpenPlaceMenu(null); }}>✏️ עריכה</button>
                        <button type="button" className="danger" onClick={() => { deletePlace(place.id); setOpenPlaceMenu(null); }}>🗑 מחיקה</button>
                        <button type="button" disabled title="בקרוב">🔗 שיתוף בקרוב</button>
                      </div>
                    )}
                  </div>
                  {isModal && <button className="secondary-button" type="button" onClick={options?.onClose}>סגירה</button>}
                </div>
              </div>
            </div>

            {isModal && (
              <div className="inline-actions">
                <button className="secondary-button" type="button" onClick={() => { closePlaceModal(); navigate(getPlacePath(place.id, tripId)); }}>
                  עמוד מלא
                </button>
              </div>
            )}

            <div className="quick-actions-bar">
              <div className="quick-action-select-wrapper">
                <select
                  className="quick-action-select"
                  value={assignedDay?.id || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) {
                      addPlaceToDay(val, place.id);
                    } else {
                      clearPlaceAssignment(place.id);
                    }
                  }}
                >
                  <option value="">📅 {assignedDay ? assignedDay.title : "שיוך למסלול..."}</option>
                  {assignedDay && <option value="">❌ הסרה מהמסלול</option>}
                  {dayPlans.map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.title} {pinnedDayByPlaceId[place.id] && day.id === pinnedDayByPlaceId[place.id] ? "📌" : ""}
                    </option>
                  ))}
                </select>
                <span className="quick-action-select-icon">▼</span>
              </div>

              <a
                className="quick-action-btn"
                href={place.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + " " + place.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                🗺️ מפות
              </a>

              {place.websiteUrl && (
                <a className="quick-action-btn" href={place.websiteUrl} target="_blank" rel="noreferrer">
                  🌐 אתר
                </a>
              )}

              {place.phoneNumber && (
                <a className="quick-action-btn" href={`tel:${place.phoneNumber}`}>
                  📞 טלפון
                </a>
              )}

              <button
                type="button"
                className={`quick-action-btn${visitedIds.includes(place.id) ? " active" : ""}`}
                onClick={() => toggleVisited(place.id)}
              >
                {visitedIds.includes(place.id) ? "✓ ביקרנו" : "☐ לא ביקרנו"}
              </button>

              <button
                type="button"
                className="quick-action-btn"
                onClick={() => startEditingPlace(place)}
              >
                ✏️ עריכה
              </button>
            </div>

            <div className="location-info-grid">
              <div className="info-card">
                <span className="info-card-icon">📍</span>
                <div className="info-card-text">
                  <span className="info-card-label">כתובת</span>
                  <span className="info-card-value">{place.address}</span>
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">🕒</span>
                <div className="info-card-text">
                  <span className="info-card-label">שעות פתיחה</span>
                  <span className="info-card-value">{place.openingHours || "לא הוזן"}</span>
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">🚇</span>
                <div className="info-card-text">
                  <span className="info-card-label">תחנה קרובה</span>
                  <span className="info-card-value">{place.station || "לא הוזן"}</span>
                </div>
              </div>
              <div className="info-card">
                <span className="info-card-icon">💳</span>
                <div className="info-card-text">
                  <span className="info-card-label">עלות וזמן שהות</span>
                  <span className="info-card-value">
                    {place.entryCost !== undefined ? (place.entryCost === 0 ? "חינם" : `${place.entryCost}₪`) : "לא הוזן"}
                    {place.visitDurationMinutes ? ` · ${place.visitDurationMinutes} דק'` : ""}
                  </span>
                </div>
              </div>
              <div className="info-card" style={{ gridColumn: "span 2" }}>
                <span className="info-card-icon">🛣️</span>
                <div className="info-card-text">
                  <span className="info-card-label">הגעה משוערת מהמלון</span>
                  <span className="info-card-value">
                    {transport.mode} · {transport.minutes} דק' · {formatDistance(haversineKm(hotels[0] ?? defaultHotel, place))}
                  </span>
                </div>
              </div>
            </div>

            <section className="sub-panel ai-notes-panel" style={{ width: "100%" }}>
              <div className="ai-notes-head">
                <h3>🔮 מידע ל-AI</h3>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={enrichingPlaceIds.has(place.id)}
                  onClick={() => enrichPlace(place.id)}
                >
                  {enrichingPlaceIds.has(place.id) ? "⏳ שולף מידע..." : place.aiNotes ? "🔄 רענן מידע" : "🔮 שלוף מידע"}
                </button>
              </div>
              {enrichErrors[place.id] && <p className="form-message error">{enrichErrors[place.id]}</p>}
              {place.aiNotes ? (
                <div className="ai-notes-content">
                  {place.aiNotes.split("\n").filter(Boolean).map((line, index) => <p key={index}>{line}</p>)}
                </div>
              ) : (
                <p className="ai-notes-empty">מחירים, מתי כדאי להגיע, התאמה לילדים והערות לעונה — שליפה אוטומטית מהאינטרנט או הוספה ידנית דרך עריכה. ה-AI מתחשב במידע הזה בתכנון.</p>
              )}
            </section>

            {!!place.tips.length && (
              <section className="sub-panel" style={{ width: "100%" }}>
                <h3>טיפים</h3>
                <div className="tips-row">
                  {place.tips.map((tip) => <span key={tip} className="tip-pill">{tip}</span>)}
                </div>
              </section>
            )}

            {(place.sourceUrl || place.instagramUrl) && (
              <section className="sub-panel" style={{ width: "100%" }}>
                <h3>קישורים נוספים</h3>
                <div className="inline-links">
                  {place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer">קישור מקור</a>}
                  {place.instagramUrl && <a href={place.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    );
  };
  const renderPlaceForm = (title: string, description: string, submitLabel: string, cancelAction?: () => void) => (
    <section className="panel">
      <div className="section-head"><div><h2>{title}</h2><span>{description}</span></div></div>
      {renderPlaceFormBody(submitLabel, cancelAction)}
    </section>
  );
  const renderPlannerDay = (day: DayPlan) => {
    const comfort = plannerComfort(day.placeIds, places);
    const dayPlaces = day.placeIds.map((placeId) => places.find((item) => item.id === placeId)).filter(Boolean) as Place[];
    const dayIndex = dayPlans.indexOf(day);
    const activeHotel = getActiveHotelForDay(dayIndex, hotels, tripConfig) ?? defaultHotel;
    const dayMapPath = getDayMapPath(day, places, activeHotel);
    const dayMapCenter = dayPlaces[0] ? [dayPlaces[0].lat, dayPlaces[0].lng] as [number, number] : [activeHotel.lat, activeHotel.lng] as [number, number];
    const dayDateLabel = (() => {
      if (!tripConfig.startDate) return null;
      const base = new Date(tripConfig.startDate + "T12:00:00");
      if (isNaN(base.getTime())) return null;
      base.setDate(base.getDate() + dayIndex);
      return base.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
    })();
    const dayTimeline = timelineByDayId[day.id] ?? [];
    const segmentMeta: Record<string, { icon: string; accentClass: string }> = {
      "בוקר": { icon: "☀️", accentClass: "morning" },
      "צהריים": { icon: "🌇", accentClass: "midday" },
      "ערב": { icon: "🌙", accentClass: "evening" },
    };

    // Shared per-place ⋯ menu — used by both the cards timeline and the calendar (לוח) views
    const renderPlaceMenu = (place: Place) => {
      const placeOrderIndex = day.placeIds.indexOf(place.id);
      const isPinned = day.pinnedPlaceIds.includes(place.id);
      const isVisited = visitedIds.includes(place.id);
      const menuKey = `${day.id}:${place.id}`;
      return (
        <div className="place-menu-wrap" onClick={stopEventPropagation} onKeyDown={stopEventPropagation}>
          <button className="place-menu-btn" type="button" aria-label="אפשרויות" onClick={(e) => { e.stopPropagation(); setOpenPlaceMenu((prev) => prev === menuKey ? null : menuKey); }}>⋯</button>
          {openPlaceMenu === menuKey && (
            <div className="place-context-menu" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => { movePlace(day.id, placeOrderIndex, -1); setOpenPlaceMenu(null); }}>⬆ למעלה</button>
              <button type="button" onClick={() => { movePlace(day.id, placeOrderIndex, 1); setOpenPlaceMenu(null); }}>⬇ למטה</button>
              <button type="button" onClick={() => { if (isPinned) { togglePlacePin(day.id, place.id); setOpenPlaceMenu(null); } else { setOpenPlaceMenu(null); setPinDialogTime(day.pinnedTimes?.[place.id] || ""); setPinDialog({ dayId: day.id, placeId: place.id, placeName: place.name }); } }}>{isPinned ? "🔓 שחרור עיגון" : "📌 עיגון"}</button>
              <button type="button" onClick={() => { toggleVisited(place.id); setOpenPlaceMenu(null); }}>{isVisited ? "↩ בטל ביקור" : "✓ ביקרנו"}</button>
              <div className="context-menu-day-row"><span>⭐ עדיפות</span><select value={place.priority ?? 3} onChange={(e) => { setPlacePriority(place.id, Number(e.target.value)); setOpenPlaceMenu(null); }}><option value={1}>1 — נמוכה</option><option value={2}>2</option><option value={3}>3 — בינונית</option><option value={4}>4</option><option value={5}>5 — גבוהה</option></select></div>
              <button type="button" className="danger" onClick={() => { removePlaceFromDay(day.id, place.id); setOpenPlaceMenu(null); }}>✕ הסר</button>
            </div>
          )}
        </div>
      );
    };

    return (
      <article
        key={day.id}
        className={`planner-day planner-itinerary-day${activePlannerDayId === day.id ? " is-active" : ""}`}
        ref={(node) => { plannerDayRefs.current[day.id] = node; }}
      >
        <div className="day-head">
          <div className="day-head-main">
            <h3>{day.title}{dayDateLabel && <span className="day-date-label">{dayDateLabel}</span>}</h3>
          </div>
          <div className="day-head-actions" onClick={stopEventPropagation} onKeyDown={stopEventPropagation}>
            <span className={`comfort ${comfort.tone}`}>{comfort.label}</span>
            <div className="place-menu-wrap">
              <button className="place-menu-btn" type="button" aria-label="אפשרויות יום" onClick={(e) => { e.stopPropagation(); setOpenDayMenu((prev) => prev === day.id ? null : day.id); }}>⋯</button>
              {openDayMenu === day.id && (
                <div className="place-context-menu day-context-menu" onClick={(e) => e.stopPropagation()}>
                  <div className="context-menu-day-row">
                    <span>➕ הוספת מקום</span>
                    <select value="" onChange={(e) => { addPlaceToDay(day.id, e.target.value); setOpenDayMenu(null); }}>
                      <option value="">בחר מקום...</option>
                      {places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="context-menu-day-row">
                    <span>🌙 שעת סיום</span>
                    <input
                      type="number"
                      min={16}
                      max={30}
                      value={day.dayEndHour ?? tripConfig.dayEndHour}
                      className="day-end-hour-input"
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDayPlans((current) => current.map((d) => d.id === day.id ? { ...d, dayEndHour: val === tripConfig.dayEndHour ? undefined : val } : d));
                      }}
                    />
                    {day.dayEndHour !== undefined && (
                      <button type="button" className="day-end-hour-reset" title="איפוס" onClick={() => setDayPlans((current) => current.map((d) => d.id === day.id ? { ...d, dayEndHour: undefined } : d))}>↺</button>
                    )}
                  </div>
                  <button type="button" className="danger" onClick={() => { clearDayPlan(day.id); setOpenDayMenu(null); }} disabled={!day.placeIds.length}>🗑 ניקוי יום</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="planner-day-layout">
          {!!dayPlaces.length && (
            <section className="day-map-panel">
              <div className="planner-map-header">
                <span className="workspace-eyebrow">Route Map</span>
                <strong>יום {dayIndex + 1} • {dayPlaces.length} תחנות</strong>
              </div>
              <LazyDayMap day={day} dayPlaces={dayPlaces} dayMapPath={dayMapPath} dayMapCenter={dayMapCenter} hotel={activeHotel} />
              <div className="planner-ai-summary">
                <span className="workspace-eyebrow">AI Journey Summary</span>
                <p>היום מסודר לפי סדר נסיעה והמרחקים מחושבים ביחס למלון ולתחנות שכבר שובצו.</p>
              </div>
            </section>
          )}
          {(() => {
            const bounds = getCalendarBounds(dayTimeline);
            const placements = layoutCalendarBlocks(dayTimeline);
            const gridHeight = (bounds.endHour - bounds.startHour) * CALENDAR_PX_PER_HOUR;
            const hours: number[] = [];
            for (let hour = bounds.startHour; hour <= bounds.endHour; hour += 1) hours.push(hour);
            return (
              <div className="planner-calendar-column">
                {!dayTimeline.length ? (
                  <p className="planner-empty-day">עדיין אין מקומות ביום הזה. אפשר לעבור לתצוגת כרטיסים כדי להוסיף.</p>
                ) : (
                  <div className="planner-calendar" style={{ height: `${gridHeight}px` }}>
                    {hours.map((hour) => (
                      <div key={`h-${hour}`} className="planner-cal-hour" style={{ top: `${(hour - bounds.startHour) * CALENDAR_PX_PER_HOUR}px` }}>
                        <span className="planner-cal-hour-label">{`${hour % 24}`.padStart(2, "0")}:00</span>
                        <span className="planner-cal-hour-line" />
                      </div>
                    ))}
                    {placements.map(({ entry, lane, laneCount }) => {
                      const meta = segmentMeta[entry.dayPart] ?? { icon: "•", accentClass: "generic" };
                      const placeId = entry.kind === "place" ? entry.place.id : null;
                      const isDragging = !!placeId && calDrag?.dayId === day.id && calDrag?.placeId === placeId;
                      const durationHours = entry.endHour - entry.startHour;
                      const effectiveStart = isDragging && calDrag ? calDrag.previewHour : entry.startHour;
                      const top = (effectiveStart - bounds.startHour) * CALENDAR_PX_PER_HOUR;
                      const height = Math.max(CALENDAR_MIN_BLOCK_PX, (entry.endHour - entry.startHour) * CALENDAR_PX_PER_HOUR - 4);
                      const width = `calc((100% - var(--cal-gutter)) / ${laneCount})`;
                      const offset = `calc(var(--cal-gutter) + ((100% - var(--cal-gutter)) / ${laneCount}) * ${lane})`;
                      const blockClass =
                        entry.kind === "flight" ? `planner-cal-block planner-cal-block--flight planner-cal-block--${entry.phase}`
                        : entry.kind === "hotel" ? "planner-cal-block planner-cal-block--hotel"
                        : `planner-cal-block planner-cal-block--${meta.accentClass}`;
                      const title =
                        entry.kind === "flight" ? `${entry.phase === "outbound" ? "✈️ טיסת יציאה" : "🛬 טיסת חזרה"}${entry.flight.flightNumber ? ` · ${entry.flight.flightNumber}` : ""}`
                        : entry.kind === "hotel" ? `🏨 ${entry.subKind === "checkin" ? "צ׳ק אין" : "צ׳ק אאוט"} · ${entry.hotel.name}`
                        : entry.place.name;
                      const isShort = height < 52;
                      const clickable = entry.kind === "place";
                      const photoUrl = entry.kind === "place" ? (entry.place.imageUrl || defaultPlaceImage) : null;
                      const isPinned = entry.kind === "place" && day.pinnedPlaceIds.includes(entry.place.id);
                      const pinnedTime = entry.kind === "place" ? day.pinnedTimes?.[entry.place.id] : undefined;
                      const startText = isDragging ? formatClockHalf(effectiveStart) : entry.startLabel;
                      const endText = isDragging ? formatClockHalf(effectiveStart + durationHours) : entry.endLabel;
                      const transitNode = entry.kind === "place" && entry.travelMinutes > 0 && !isDragging ? (
                        <div key={`cal-transit-${entry.place.id}`} className="planner-cal-transit" style={{ top: `${Math.max(0, top - 20)}px`, insetInlineStart: offset, width }} aria-hidden="true">
                          <span className="planner-cal-transit-icon">{transitIcon(entry.travelMode)}</span>
                          <span>{entry.travelMode} · {entry.travelMinutes} דק׳</span>
                        </div>
                      ) : null;
                      return [
                        transitNode,
                        <article
                          key={entry.kind === "flight" ? `cal-flight-${entry.flight.id}` : entry.kind === "hotel" ? `cal-hotel-${entry.subKind}-${entry.hotel.id}` : `cal-place-${entry.place.id}`}
                          className={`${blockClass}${isShort ? " is-short" : ""}${clickable ? " is-clickable is-draggable" : ""}${isDragging ? " is-dragging" : ""}${isPinned ? " is-pinned" : ""}${photoUrl ? " has-photo" : ""}${entry.kind === "place" && openPlaceMenu === `${day.id}:${entry.place.id}` ? " menu-open" : ""}`}
                          style={{ top: `${top}px`, height: `${height}px`, insetInlineStart: offset, width }}
                          onPointerDown={clickable ? (event) => { if (event.button) return; if ((event.target as HTMLElement).closest(".place-menu-wrap")) return; event.currentTarget.setPointerCapture(event.pointerId); setCalDrag({ dayId: day.id, placeId: entry.place.id, pointerStartY: event.clientY, baseHour: entry.startHour, previewHour: entry.startHour, moved: false }); } : undefined}
                          onPointerMove={clickable ? (event) => { setCalDrag((prev) => { if (!prev || prev.placeId !== entry.place.id || prev.dayId !== day.id) return prev; const deltaHours = (event.clientY - prev.pointerStartY) / CALENDAR_PX_PER_HOUR; const snapped = Math.round((prev.baseHour + deltaHours) * 2) / 2; const clamped = Math.min(bounds.endHour - 0.5, Math.max(bounds.startHour, snapped)); const moved = prev.moved || Math.abs(event.clientY - prev.pointerStartY) > 4; if (clamped === prev.previewHour && moved === prev.moved) return prev; return { ...prev, previewHour: clamped, moved }; }); } : undefined}
                          onPointerUp={clickable ? (event) => { event.currentTarget.releasePointerCapture?.(event.pointerId); if (calDrag && calDrag.placeId === entry.place.id && calDrag.dayId === day.id) { const deltaHours = (event.clientY - calDrag.pointerStartY) / CALENDAR_PX_PER_HOUR; const snapped = Math.round((calDrag.baseHour + deltaHours) * 2) / 2; const clamped = Math.min(bounds.endHour - 0.5, Math.max(bounds.startHour, snapped)); if (Math.abs(event.clientY - calDrag.pointerStartY) > 4 && clamped !== calDrag.baseHour) setPinWithTime(day.id, entry.place.id, formatClockHalf(clamped)); else openPlacePage(entry.place.id); } setCalDrag(null); } : undefined}
                          onKeyDown={clickable ? (event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(entry.place.id); } } : undefined}
                          role={clickable ? "button" : undefined}
                          tabIndex={clickable ? 0 : undefined}
                          title={clickable ? `${entry.startLabel} - ${entry.endLabel} · גרור לשינוי השעה` : `${entry.startLabel} - ${entry.endLabel}`}
                        >
                          {photoUrl && <img className="planner-cal-block-img" src={photoUrl} alt="" loading="lazy" draggable={false} onError={(event) => { const target = event.currentTarget; if (!target.dataset.fallback) { target.dataset.fallback = "1"; target.src = defaultPlaceImage; } }} />}
                          {entry.kind === "place" && renderPlaceMenu(entry.place)}
                          {isPinned && <span className="planner-cal-pin" title={`מעוגן${pinnedTime ? ` · ${pinnedTime}` : ""}`}>📌</span>}
                          <span className="planner-cal-block-time">{startText}{!isShort ? ` – ${endText}` : ""}</span>
                          <strong className="planner-cal-block-title">{title}</strong>
                        </article>,
                      ];
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </article>
    );
  };
  const tripContext = { places, hotels, dayPlans, tripConfig, flights, visitedIds };
  const renderTripShellNavigation = () => (
    <>
      <header className="trip-top-bar">
        <button
          className="trip-top-bar-menu"
          type="button"
          aria-label={mainMenuOpen ? "סגירת תפריט ראשי" : "פתיחת תפריט ראשי"}
          aria-expanded={mainMenuOpen}
          aria-controls="trip-main-menu"
          onClick={() => setMainMenuOpen((prev) => !prev)}
        >
          {mainMenuOpen ? "✕" : "☰"}
        </button>
      </header>
      {mainMenuOpen && <button className="trip-main-menu-overlay" type="button" aria-label="סגירת תפריט ראשי" onClick={() => setMainMenuOpen(false)} />}
      <aside id="trip-main-menu" className={mainMenuOpen ? "trip-main-menu open" : "trip-main-menu"} aria-label="תפריט ראשי">
        <div className="trip-main-menu-header">
          <div className="trip-main-menu-top-row">
            <span className="trip-main-menu-eyebrow">תפריט</span>
            <button className="trip-main-menu-close" type="button" aria-label="סגירת תפריט ראשי" onClick={() => setMainMenuOpen(false)}>✕</button>
          </div>
          <div className="trip-main-menu-user">
            {user?.avatarUrl
              ? <img src={user.avatarUrl} alt={user.name} className="trip-user-avatar" />
              : <span className="trip-user-initials">{user?.name?.[0] ?? "?"}</span>}
            <div className="trip-main-menu-user-text">
              <strong>{user?.name || "המשתמש שלי"}</strong>
              <span>{tripConfig.tripName || "הטיול שלי"}</span>
            </div>
          </div>
        </div>
        <div className="trip-main-menu-links">
          <button type="button" className="trip-main-menu-item" onClick={() => { setMainMenuOpen(false); navigate("/dashboard"); }}>הטיולים שלי</button>
          <button type="button" className="trip-main-menu-item" onClick={() => { setMainMenuOpen(false); logout(); }}>התנתק</button>
        </div>
      </aside>
    </>
  );

  // Chat page renders fullscreen (bypasses main content)
  if (activeView === "chat") {
    return (
      <div className="app-shell">
        {renderTripShellNavigation()}
        <nav className="bottom-nav" aria-label="ניווט ראשי">
          <div className="nav-container">
            {routeItems.map((item) => {
              const isActive = activeView === item.key;
              return (
                <button key={item.key} className={isActive ? "nav-item active" : "nav-item"} onClick={() => navigate(viewPaths[item.key])} type="button">
                  {getIconForRoute(item.key, isActive)}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
        <div className="chat-page-wrapper">
          <Routes>
            <Route path="/chat/:sessionId" element={<ChatPage tripContext={tripContext} onApplyPlan={applyAiPlan} onAction={handleChatAction} />} />
            <Route path="/chat" element={<ChatPage tripContext={tripContext} onApplyPlan={applyAiPlan} onAction={handleChatAction} triggerPlan={location.search.includes("trigger=plan")} />} />
          </Routes>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell" dir="rtl">
      {renderTripShellNavigation()}
      <nav className="bottom-nav" aria-label="ניווט ראשי">
        <div className="nav-container">
          {routeItems.map((item) => {
            const isActive = activeView === item.key;
            return (
              <button key={item.key} className={isActive ? "nav-item active" : "nav-item"} onClick={() => navigate(viewPaths[item.key])} type="button">
                {getIconForRoute(item.key, isActive)}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <main className="content-stack">
        {selectedPlaceId && !selectedPlace && <section className="panel"><div className="section-head"><div><h2>המקום לא נמצא</h2><span>יכול להיות שהוא נמחק או שכתובת העמוד לא תקינה.</span></div><button type="button" onClick={() => navigate(viewPaths.home)}>חזרה למקומות</button></div></section>}
        {selectedPlace && renderPlaceDetails(selectedPlace)}
        {!selectedPlaceId && activeView === "home" && (
          <>
            <section className="action-panel workspace-hero-panel">
              <div className="section-head">
                <div>
                  <span className="workspace-eyebrow">Places OS</span>
                  <h2>המקומות שלי</h2>
                  <span>כאן מתחיל כל טיול: איסוף, סינון ושיבוץ של המקומות שבאמת שווים מקום במסלול.</span>
                </div>
                <div className="inline-actions">
                  <button type="button" onClick={() => startAddingPlace()}>הוספת מקום</button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={bulkEnrich?.running || !places.some((p) => !p.aiNotes)}
                    onClick={enrichAllPlaces}
                    title="שולף מהאינטרנט מחירים, שעות והמלצות לכל מקום שעדיין אין לו מידע ל-AI"
                  >
                    {bulkEnrich?.running ? `⏳ שולף מידע... ${bulkEnrich.done}/${bulkEnrich.total}` : "🔮 שלוף מידע לכל המקומות"}
                  </button>
                </div>
              </div>
              <div className="workspace-summary-grid" aria-label="סיכום מקומות">
                <div className="workspace-summary-card">
                  <strong>{places.length}</strong>
                  <span>מקומות שמורים</span>
                </div>
                <div className="workspace-summary-card">
                  <strong>{dayPlans.filter((day) => day.placeIds.length).length}</strong>
                  <span>ימים פעילים</span>
                </div>
                <div className="workspace-summary-card">
                  <strong>{pinnedDayByPlaceId ? Object.keys(pinnedDayByPlaceId).length : 0}</strong>
                  <span>עוגנים קבועים</span>
                </div>
                <div className="workspace-summary-card">
                  <strong>{flights.length}</strong>
                  <span>טיסות שמורות</span>
                </div>
              </div>
            </section>
            <section className="filters">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, תיאור או כתובת" />
              <div className="filters-row">
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                  <option value="הכול">כל הסוגים</option>
                  {placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
                  {areaOptions.map((area) => <option key={area} value={area}>{area === "הכול" ? "כל האזורים" : area}</option>)}
                </select>
              </div>
            </section>
            <section className="place-grid">
              {filteredPlaces.map((place) => {
                const assignedDayId = assignedDayByPlaceId[place.id] || "";
                const isPinned = Boolean(pinnedDayByPlaceId[place.id]);
                return <div key={place.id} className="place-card-wrap"><article className="place-card place-card-clickable" onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} role="button" tabIndex={0}><img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="place-image" /><div className="place-body"><div className="place-topline"><TypeChip type={place.type} /><span className="chip soft">{place.area || "ללא אזור"}</span></div><h2>{place.name}</h2><p>{place.shortDescription || "ללא תיאור"}</p><div className="place-basic-meta"><span>{place.station || "תחנה לא הוזנה"}</span><span>{place.rating ? `⭐ ${place.rating.toFixed(1)}` : "חדש"}</span></div>{isPinned && <span className="pin-indicator">מעוגן ליום</span>}</div></article><div className="place-menu-wrap"><button className="place-menu-btn" type="button" aria-label="אפשרויות" onClick={(e) => { e.stopPropagation(); setOpenPlaceMenu((prev) => prev === `home:${place.id}` ? null : `home:${place.id}`); }} onKeyDown={stopEventPropagation}>⋯</button>{openPlaceMenu === `home:${place.id}` && <div className="place-context-menu" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => { startEditingPlace(place); setOpenPlaceMenu(null); }}>✏️ עריכה</button><div className="context-menu-day-row"><span>⭐ עדיפות</span><select value={place.priority ?? 3} onChange={(e) => { setPlacePriority(place.id, Number(e.target.value)); setOpenPlaceMenu(null); }}><option value={1}>1 — נמוכה</option><option value={2}>2</option><option value={3}>3 — בינונית</option><option value={4}>4</option><option value={5}>5 — גבוהה</option></select></div><div className="context-menu-day-row"><span>📅 שיבוץ ליום</span><select value={assignedDayId} onChange={(event) => { const nextDayId = event.target.value; if (!nextDayId) { clearPlaceAssignment(place.id); } else { addPlaceToDay(nextDayId, place.id); } }}><option value="">ללא יום</option>{dayPlans.map((day) => <option key={day.id} value={day.id}>{day.title}</option>)}</select></div><button type="button" className="danger" onClick={() => { deletePlace(place.id); setOpenPlaceMenu(null); }}>🗑 מחיקה</button></div>}</div></div>;
              })}
            </section>
          </>
        )}
        {!selectedPlaceId && activeView === "hotel" && (
          <section>
            <div className="section-head">
              <div><h2>המלונות שלך</h2><span>מכאן מחושבים המרחקים וזמני ההגעה. אפשר להוסיף כמה מלונות לאורך הטיול.</span></div>
              <button type="button" onClick={() => { setEditingHotelId(null); setIsEditingHotel(true); }}>הוספת מלון</button>
            </div>
            <button className="secondary-button" type="button" onClick={applyDefaultHotel} style={{ marginBottom: "1rem" }}>שימוש במלון הדוגמה</button>
            {hotels.length === 0 && <p>עדיין לא נוסף מלון.</p>}
            {hotels.map((h) => (
              <div key={h.id} className="hotel-status" style={{ marginBottom: "1rem", border: "1px solid var(--border)", borderRadius: "8px", padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong>{h.name}</strong>
                    <p>{h.address}</p>
                    {h.checkInDate && <p>🛎 צ׳ק אין: {h.checkInDate}{h.checkInTime ? ` · ${h.checkInTime}` : ""}</p>}
                    {h.checkOutDate && <p>🚪 צ׳ק אאוט: {h.checkOutDate}{h.checkOutTime ? ` · ${h.checkOutTime}` : ""}</p>}
                    {h.rating && <p>⭐ {h.rating.toFixed(1)}</p>}
                    {h.googleMapsUrl && <a href={h.googleMapsUrl} target="_blank" rel="noreferrer">Google Maps</a>}
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="button" onClick={() => { setEditingHotelId(h.id); setIsEditingHotel(true); }}>✏️</button>
                    <button type="button" className="danger" onClick={() => setHotels((current) => current.filter((item) => item.id !== h.id))}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
            {isEditingHotel && (
              <form className="form-layout" style={{ marginTop: "1.5rem" }} onSubmit={handleHotelSubmit}>
                <div className="form-stack">
                  <label style={{ fontWeight: 600 }}>חיפוש ב-Google Places</label>
                  <div ref={hotelAutocompleteHostRef} className="google-autocomplete-host" />
                  {hotelDraft.name && hotelDraft.googlePlaceId && (
                    <div className="autocomplete-success-banner">
                      ✅ הפרטים נטענו מ-Google Places
                      {hotelDraft.rating && <span> · ⭐ {hotelDraft.rating}</span>}
                      {hotelDraft.imageUrl && <img src={hotelDraft.imageUrl} alt={hotelDraft.name} style={{ display: "block", marginTop: "0.5rem", borderRadius: "6px", maxHeight: "120px", objectFit: "cover", width: "100%" }} />}
                    </div>
                  )}
                  <label>שם המלון<input value={hotelDraft.name} onChange={(e) => updateHotelDraft("name", e.target.value)} required /></label>
                  <label>כתובת<input value={hotelDraft.address} onChange={(e) => updateHotelDraft("address", e.target.value)} required /></label>
                  <label>תאריך צ׳ק אין<input type="date" value={hotelDraft.checkInDate} onChange={(e) => updateHotelDraft("checkInDate", e.target.value)} /></label>
                  <label>שעת צ׳ק אין<input type="time" value={hotelDraft.checkInTime} onChange={(e) => updateHotelDraft("checkInTime", e.target.value)} /></label>
                  <label>תאריך צ׳ק אאוט<input type="date" value={hotelDraft.checkOutDate} onChange={(e) => updateHotelDraft("checkOutDate", e.target.value)} /></label>
                  <label>שעת צ׳ק אאוט<input type="time" value={hotelDraft.checkOutTime} onChange={(e) => updateHotelDraft("checkOutTime", e.target.value)} /></label>
                  <label>קו רוחב (אופציונלי)<input value={hotelDraft.lat} onChange={(e) => updateHotelDraft("lat", e.target.value)} /></label>
                  <label>קו אורך (אופציונלי)<input value={hotelDraft.lng} onChange={(e) => updateHotelDraft("lng", e.target.value)} /></label>
                </div>
                {hotelLookupState === "loading" && <p>מחפש מיקום לפי כתובת...</p>}
                {hotelLookupState === "error" && <p className="form-message error">לא נמצא מיקום. אפשר לבטל ולהוסיף קו רוחב ואורך ידנית.</p>}
                <div className="inline-actions">
                  <button type="submit">{editingHotelId ? "שמירת שינויים" : "הוספת מלון"}</button>
                  <button className="secondary-button" type="button" onClick={() => { setIsEditingHotel(false); setEditingHotelId(null); }}>ביטול</button>
                </div>
              </form>
            )}
          </section>
        )}
        {!selectedPlaceId && activeView === "map" && (
          <section className="map-panel">
            <div className="map-stage">
              <div className="section-head">
                <div>
                  <span className="workspace-eyebrow">Map Layer</span>
                  <h2>מפת המקומות</h2>
                  <span>תמונה אחת של כל הטיול: המלון, כל התחנות, וזמני ההגעה מכל בסיס.</span>
                </div>
              </div>
              <MapContainer center={[hotels[0]?.lat ?? defaultHotel.lat, hotels[0]?.lng ?? defaultHotel.lng]} zoom={12} scrollWheelZoom={false} className="map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{hotels.map((h) => <Marker key={h.id} position={[h.lat, h.lng]} icon={hotelMarkerIcon}><Popup><strong>{h.name}</strong><div>{h.address}</div></Popup></Marker>)}{places.map((place) => { const trip = estimateTransport(haversineKm(hotels[0] ?? defaultHotel, place)); return <Marker key={place.id} position={[place.lat, place.lng]} icon={getPlaceMarkerIcon(place)}><Popup><strong>{place.name}</strong><div>{place.address}</div><div>{trip.mode} | {trip.minutes} דק'</div></Popup></Marker>; })}</MapContainer>
            </div>
            <div className="map-legend">
              <div className="legend-row legend-row--wrap">
                <span className="legend-chip hotel">{mapMarkerMeta.hotel.glyph} {mapMarkerMeta.hotel.label}</span>
                {Array.from(new Set(places.map((place) => place.type))).map((type) => (
                  <span key={type} className="legend-chip place">{mapMarkerMeta[type].glyph} {mapMarkerMeta[type].label}</span>
                ))}
              </div>
              <div className="workspace-summary-grid workspace-summary-grid--compact">
                <div className="workspace-summary-card">
                  <strong>{places.length}</strong>
                  <span>נקודות על המפה</span>
                </div>
                <div className="workspace-summary-card">
                  <strong>{hotels.length}</strong>
                  <span>מלונות פעילים</span>
                </div>
              </div>
              {places.map((place) => <div key={place.id} className="saved-item saved-item-clickable compact" onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} role="button" tabIndex={0}><div><strong>{place.name}</strong><p>{place.station || "ללא תחנה שמורה"}</p></div></div>)}
            </div>
          </section>
        )}
        {!selectedPlaceId && activeView === "planner" && (() => {
          const handleSwipe = (direction: number) => {
            const nextIndex = activePlannerDayIndex + direction;
            if (nextIndex >= 0 && nextIndex < dayPlans.length) {
              const nextDay = dayPlans[nextIndex];
              setActivePlannerDayId(nextDay.id);
            }
          };

          return (
            <section className="planner-stack">
              <div className="section-head">
                <div>
                  <h2>לו"ז לשבוע</h2>
                </div>
                <div className="planner-toolbar">
                  <span>{activeDaysCount} ימים פעילים</span>
                </div>
              </div>
              <div className="planner-day-selector" aria-label="בחירת יום">
                {dayPlans.map((day, index) => {
                  const isActive = (activePlannerDayId ?? dayPlans[0]?.id) === day.id;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      className={`planner-day-chip${isActive ? " active" : ""}`}
                      onClick={() => setActivePlannerDayId(day.id)}
                    >
                      <motion.div
                        className="planner-day-chip-content"
                        initial={false}
                        animate={{ scale: isActive ? 1.05 : 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      >
                        <strong>{day.title}</strong>
                        <span dir="ltr">{formatPlannerChipDate(tripConfig.startDate ?? null, index) ?? "--/--"}</span>
                      </motion.div>
                    </button>
                  );
                })}
              </div>
              {aiPlanResult && <div className="ai-plan-result"><div className="ai-plan-header"><strong>✨ תוכנית AI</strong><button type="button" onClick={() => applyAiPlan(aiPlanResult)}>החל תוכנית</button><button type="button" className="secondary-button" onClick={() => setAiPlanResult(null)}>סגור</button></div>{aiPlanResult.summary && <p className="ai-plan-summary">{aiPlanResult.summary}</p>}{!!aiPlanResult.recommendations?.length && <div className="ai-recommendations"><strong>המלצות:</strong><ul>{aiPlanResult.recommendations.map((rec, i) => <li key={i}>{rec}</li>)}</ul></div>}{!!aiPlanResult.excluded?.length && <div className="ai-excluded"><strong>מוחרגים מהתוכנית:</strong> {aiPlanResult.excluded.map((item) => places.find((p) => p.id === item.placeId)?.name || item.placeId).join(", ")}</div>}</div>}
              <div className="swipe-container">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activePlannerDayKey}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    drag={isMobilePlanner ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                      if (!isMobilePlanner) return;
                      if (info.offset.x > 100) handleSwipe(-1);
                      else if (info.offset.x < -100) handleSwipe(1);
                    }}
                  >
                    {renderPlannerDay(dayPlans[activePlannerDayIndex] || dayPlans[0])}
                  </motion.div>
                </AnimatePresence>
              </div>

              {!!unplannedPlaces.length && (
                <article className="panel" style={{ marginTop: "2rem" }}>
                  <div className="section-head">
                    <div>
                      <h3>עדיין לא שובצו</h3>
                      <span>אפשר לגרור אותם ליום מתאים או לתת לחלוקה האוטומטית לשבץ</span>
                    </div>
                  </div>
                  <div className="planner-image-grid unplanned-image-grid">
                    {unplannedPlaces.map((place) => (
                      <article
                        key={place.id}
                        className="planner-place-card planner-place-card-clickable planner-place-card-compact"
                        draggable
                        onClick={() => openPlacePage(place.id)}
                        onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }}
                        onDragStart={() => handlePlaceDragStart(null, place.id)}
                        onDragEnd={handlePlaceDragEnd}
                        role="button"
                        tabIndex={0}
                      >
                        <img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="planner-place-image" />
                        <div className="planner-place-content">
                          <strong>{place.name}</strong>
                          <p>{place.area || "ללא אזור"} | {place.station || "ללא תחנה"}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              )}
            </section>
          );
        })()}
        {!selectedPlaceId && activeView === "settings" && (
          <section className="settings-page">
            {/* ── Trip info ── */}
            <div className="settings-section panel">
              <div className="settings-section-header">
                <h2>פרטי הטיול</h2>
                <span>שם, יעד ושעות היום</span>
              </div>
              <div className="form-stack">
                <label>שם הטיול
                  <input
                    value={settingsDraft.tripName ?? tripConfig.tripName}
                    onFocus={() => setSettingsDraft(tripConfig)}
                    onChange={(e) => setSettingsDraft((c) => ({ ...c, tripName: e.target.value }))}
                  />
                </label>
                <label>יעד
                  <input
                    value={settingsDraft.destination ?? tripConfig.destination}
                    onFocus={() => setSettingsDraft((c) => c.tripName ? c : tripConfig)}
                    onChange={(e) => setSettingsDraft((c) => ({ ...c, destination: e.target.value }))}
                    placeholder="למשל: London"
                  />
                </label>
                <label>תאריך תחילת הטיול
                  <input
                    type="date"
                    value={settingsDraft.startDate ?? tripConfig.startDate ?? ""}
                    onFocus={() => setSettingsDraft((c) => c.tripName ? c : tripConfig)}
                    onChange={(e) => setSettingsDraft((c) => ({ ...c, startDate: e.target.value }))}
                  />
                </label>
                <label>מספר ימים
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={settingsDraft.numDays ?? tripConfig.numDays ?? 7}
                    onFocus={() => setSettingsDraft((c) => c.tripName ? c : tripConfig)}
                    onChange={(e) => setSettingsDraft((c) => ({ ...c, numDays: Math.max(1, Math.min(60, Number(e.target.value))) }))}
                  />
                </label>
                {(() => {
                  const sd = settingsDraft.startDate ?? tripConfig.startDate;
                  const nd = settingsDraft.numDays ?? tripConfig.numDays ?? 7;
                  if (!sd) return null;
                  const end = new Date(sd + "T12:00:00");
                  if (isNaN(end.getTime())) return null;
                  end.setDate(end.getDate() + nd - 1);
                  return <p className="settings-end-date-hint">תאריך סיום: {end.toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}</p>;
                })()}
              </div>
              <div className="settings-subsection-header"><h3>לוח זמנים יומי</h3></div>
              <div className="form-stack settings-grid-2">
                <label>שעת התחלת יום<input type="number" min={0} max={23} value={settingsDraft.dayStartHour ?? tripConfig.dayStartHour} onFocus={() => setSettingsDraft(tripConfig)} onChange={(e) => setSettingsDraft((c) => ({ ...c, dayStartHour: Number(e.target.value) }))} /></label>
                <label>שעת סיום יום<input type="number" min={0} max={23} value={settingsDraft.dayEndHour ?? tripConfig.dayEndHour} onFocus={() => setSettingsDraft(tripConfig)} onChange={(e) => setSettingsDraft((c) => ({ ...c, dayEndHour: Number(e.target.value) }))} /></label>
                <label>תחילת הפסקת צהריים<input type="number" min={0} max={23} value={settingsDraft.lunchBreakStart ?? tripConfig.lunchBreakStart} onFocus={() => setSettingsDraft(tripConfig)} onChange={(e) => setSettingsDraft((c) => ({ ...c, lunchBreakStart: Number(e.target.value) }))} /></label>
                <label>סוף הפסקת צהריים<input type="number" min={0} max={23} value={settingsDraft.lunchBreakEnd ?? tripConfig.lunchBreakEnd} onFocus={() => setSettingsDraft(tripConfig)} onChange={(e) => setSettingsDraft((c) => ({ ...c, lunchBreakEnd: Number(e.target.value) }))} /></label>
              </div>
              <div className="settings-save-row">
                <button
                  type="button"
                  className="settings-save-btn"
                  disabled={settingsSaveState === "saving"}
                  onClick={async () => {
                    const next = { ...tripConfig, ...settingsDraft };
                    setSettingsSaveState("saving");
                    setTripConfig(next);
                    try {
                      await apiFetch(`${apiBase}/trip-config`, { method: "PUT", body: JSON.stringify(next) });
                      setSettingsSaveState("saved");
                      setTimeout(() => setSettingsSaveState("idle"), 2000);
                    } catch { setSettingsSaveState("idle"); }
                  }}
                >
                  {settingsSaveState === "saving" ? "שומר..." : settingsSaveState === "saved" ? "✓ נשמר" : "שמור שינויים"}
                </button>
              </div>
            </div>

            {/* ── Hotel ── */}
            <div className="settings-section panel">
              <div className="settings-section-header">
                <h2>מלון</h2>
                <span>בסיס לחישוב מרחקים וזמני הגעה</span>
              </div>
              <div className="hotel-status">
                {hotels.length === 0 ? <p>לא הוגדר מלון</p> : hotels.map((h) => (
                  <div key={h.id} style={{ marginBottom: "0.5rem" }}>
                    <strong>{h.name}</strong>
                    <p>{h.address}</p>
                    {h.checkInDate && <p>📅 {h.checkInDate}{h.checkOutDate ? ` → ${h.checkOutDate}` : ""}</p>}
                  </div>
                ))}
              </div>
              <div className="inline-actions" style={{ marginTop: "0.75rem" }}>
                <button type="button" onClick={() => { setEditingHotelId(null); setShowHotelEditDialog(true); }}>➕ הוספת מלון</button>
                <button className="secondary-button" type="button" onClick={applyDefaultHotel}>שחזר ברירת מחדל</button>
              </div>
            </div>

            {/* ── Flights ── */}
            <div id="settings-flights" className="settings-section panel">
              <div className="settings-section-header">
                <h2>טיסות</h2>
                <span>{flights.length ? `${flights.length} טיסות רשומות` : "עדיין לא הוזנו טיסות"}</span>
              </div>
              {!flights.length && <p className="settings-empty">לא הוזנו טיסות עדיין.</p>}
              {flights.map((f) => (
                <div key={f.id} className="flight-item">
                  <span className="flight-icon">{f.type === "arrival" ? "🛬" : "🛫"}</span>
                  <div className="flight-item-body">
                    <strong>{f.type === "arrival" ? "הגעה" : "יציאה"}</strong>
                    <span>{f.flightDate} · {f.flightTime}</span>
                    <span>{f.airport}{f.flightNumber ? ` · ${f.flightNumber}` : ""}</span>
                    {f.notes && <span className="flight-notes">{f.notes}</span>}
                  </div>
                  <button type="button" className="danger icon-btn" onClick={() => removeFlight(f.id)} aria-label="מחק טיסה">✕</button>
                </div>
              ))}
              <div className="settings-add-row">
                <button type="button" onClick={() => { setFlightDraft({ type: "arrival", transferMinutes: 45 }); setShowAddFlightDialog(true); }}>+ הוסף טיסה</button>
              </div>
            </div>

            {/* ── Share ── */}
            <div className="settings-section panel">
              <div className="settings-section-header">
                <h2>שיתוף</h2>
                <span>שתף את הטיול עם אחרים</span>
              </div>
              <div className="inline-actions">
                <button type="button" onClick={openShareModal}>🔗 יצירת קישור שיתוף</button>
              </div>
            </div>
          </section>
        )}
      </main>
      {isAddingPlace && (
        <div className="add-dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) cancelAddingPlace(); }} role="presentation">
          <div className="add-dialog-box" role="dialog" aria-modal="true" aria-label="הוספת מקום">
            <div className="add-dialog-header">
              <h2>הוספת מקום</h2>
              <button type="button" className="add-dialog-close" onClick={cancelAddingPlace} aria-label="סגירה">✕</button>
            </div>
            <div className="add-dialog-tabs">
              <button type="button" className={`add-dialog-tab${addPlaceMode === "search" ? " active" : ""}`} onClick={() => { setAddPlaceMode("search"); setAutocompleteSelected(false); }}>🔍 חיפוש Google</button>
              <button type="button" className={`add-dialog-tab${addPlaceMode === "link" ? " active" : ""}`} onClick={() => setAddPlaceMode("link")}>🔗 הדבק לינק</button>
              <button type="button" className={`add-dialog-tab${addPlaceMode === "manual" ? " active" : ""}`} onClick={() => setAddPlaceMode("manual")}>✏️ ידנית</button>
            </div>
            <div className={`add-dialog-body${addPlaceMode === "manual" ? " scrollable" : ""}`}>
              <form onSubmit={handlePlaceSubmit}>
                <div style={{ display: addPlaceMode === "search" ? "flex" : "none" }} className="add-dialog-section">
                  <p className="add-dialog-hint">הקלד שם מקום ובחר מהרשימה — הפרטים יתמלאו אוטומטית</p>
                  {addPlaceIntentSeed && (
                    <div className="import-confirm add-place-intent-card">
                      <div className="import-confirm-info">
                        <strong className="import-confirm-name">{addPlaceIntentSeed.name}</strong>
                        <span className="import-confirm-addr">ה-AI מציע לחפש ב-Google Places: {addPlaceIntentSeed.query}</span>
                        {pendingPinRequest && (
                          <span className="import-confirm-addr">
                            אחרי השמירה נעדכן עיגון{pendingPinRequest.dayTitle ? ` ל-${pendingPinRequest.dayTitle}` : ""}{pendingPinRequest.time ? ` בשעה ${pendingPinRequest.time}` : ""}.
                          </span>
                        )}
                        {(addPlaceIntentSeed.area || addPlaceIntentSeed.type || addPlaceIntentSeed.visitDurationMinutes) && (
                          <span className="import-confirm-addr">
                            {[addPlaceIntentSeed.area, addPlaceIntentSeed.type, addPlaceIntentSeed.visitDurationMinutes ? `${addPlaceIntentSeed.visitDurationMinutes} דק׳` : ""].filter(Boolean).join(" • ")}
                          </span>
                        )}
                      </div>
                      <div className="import-confirm-actions">
                        <button type="button" className="secondary-button" onClick={() => applyAddPlaceSearchSeed()}>
                          מלא חיפוש
                        </button>
                        {!existingIntentPlace && (
                          <button type="button" className="secondary-button" onClick={() => searchGooglePlacesForIntent(addPlaceIntentSeed)}>
                            חפש עבורי
                          </button>
                        )}
                        <button type="button" className="secondary-button" onClick={() => setAddPlaceMode("manual")}>
                          עריכה ידנית
                        </button>
                      </div>
                    </div>
                  )}
                  {existingIntentPlace && (
                    <div className="import-confirm existing-place-card">
                      <div className="import-confirm-info">
                        <strong className="import-confirm-name">המקום כבר קיים ברשימה שלך</strong>
                        <span className="import-confirm-addr">{existingIntentPlace.name}</span>
                        {existingIntentPlace.address && <span className="import-confirm-addr">{existingIntentPlace.address}</span>}
                      </div>
                      <div className="import-confirm-actions">
                        <button type="button" className="secondary-button" onClick={() => { cancelAddingPlace(); openPlacePage(existingIntentPlace.id); }}>
                          פתח מקום קיים
                        </button>
                        <button type="button" className="secondary-button" onClick={() => setAddPlaceMode("manual")}>
                          הוסף ידנית בכל זאת
                        </button>
                      </div>
                    </div>
                  )}
                  {placeSearchState.tone !== "idle" && !existingIntentPlace && (
                    <p className={`form-message ${placeSearchState.tone}`}>{placeSearchState.message}</p>
                  )}
                  {!existingIntentPlace && placeSearchCandidates.length > 0 && (
                    <div className="place-search-results">
                      {placeSearchCandidates.map((candidate) => (
                        <article key={candidate.id} className="place-search-card">
                          {candidate.imageUrl && <img src={candidate.imageUrl} alt={candidate.name} className="place-search-card-image" />}
                          <div className="place-search-card-body">
                            <strong className="place-search-card-title">{candidate.name}</strong>
                            <p className="place-search-card-address">{candidate.address}</p>
                            <div className="place-search-card-meta">
                              {candidate.area && <span>{candidate.area}</span>}
                              {typeof candidate.rating === "number" && <span>⭐ {candidate.rating.toFixed(1)}</span>}
                            </div>
                            {candidate.openingHours && <p className="place-search-card-hours">{candidate.openingHours}</p>}
                          </div>
                          <div className="place-search-card-actions">
                            <button type="button" onClick={async () => { applyCandidateDraft(candidate); await savePlaceDraft({ ...placeDraft, ...candidate.draft } as PlaceDraft); }}>
                              הוסף את המקום
                            </button>
                            <button type="button" className="secondary-button" onClick={() => { applyCandidateDraft(candidate); setAddPlaceMode("manual"); }}>
                              עריכה ידנית
                            </button>
                            {candidate.googleMapsUrl && (
                              <a href={candidate.googleMapsUrl} target="_blank" rel="noreferrer">
                                פתח בגוגל
                              </a>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <div ref={placeAutocompleteHostRef} className="google-autocomplete-host" />
                  {mapAutocompleteState.tone === "error" && <p className={`form-message ${mapAutocompleteState.tone}`}>{mapAutocompleteState.message}</p>}
                  {autocompleteSelected && placeDraft.name && (
                    <div className="import-confirm">
                      <div className="import-confirm-info">
                        <strong className="import-confirm-name">{placeDraft.name}</strong>
                        {placeDraft.address && <span className="import-confirm-addr">{placeDraft.address}</span>}
                      </div>
                      <div className="import-confirm-actions">
                        <button type="button" className="secondary-button" onClick={() => setAddPlaceMode("manual")}>עריכה ידנית</button>
                        <button type="submit">שמור מקום</button>
                      </div>
                    </div>
                  )}
                </div>
                {addPlaceMode === "link" && (
                  <div className="add-dialog-section">
                    <p className="add-dialog-hint">הדבק קישור של Google Maps</p>
                    <div className="link-import">
                      <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://maps.google.com/..." />
                      <button type="button" onClick={handleImportLink}>ייבוא</button>
                    </div>
                    {linkImportState.tone !== "idle" && <p className={`form-message ${linkImportState.tone}`}>{linkImportState.message}</p>}
                    {linkImportState.tone === "success" && placeDraft.name && (
                      <div className="import-confirm">
                        <div className="import-confirm-info">
                          <strong className="import-confirm-name">{placeDraft.name}</strong>
                          {placeDraft.address && <span className="import-confirm-addr">{placeDraft.address}</span>}
                        </div>
                        <div className="import-confirm-actions">
                          <button type="button" className="secondary-button" onClick={() => setAddPlaceMode("manual")}>עריכה ידנית</button>
                          <button type="submit">שמור מקום</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {addPlaceMode === "manual" && (
                  <div className="add-dialog-section">
                    <div className="form-stack">
                      <label>שם המקום<input value={placeDraft.name} onChange={(e) => updatePlaceDraft("name", e.target.value)} /></label>
                      <label>תיאור קצר<textarea rows={3} value={placeDraft.shortDescription} onChange={(e) => updatePlaceDraft("shortDescription", e.target.value)} /></label>
                      <label>כתובת<input value={placeDraft.address} onChange={(e) => updatePlaceDraft("address", e.target.value)} /></label>
                      <label>שעות פתיחה<input value={placeDraft.openingHours} onChange={(e) => updatePlaceDraft("openingHours", e.target.value)} placeholder="לדוגמה 10:00-18:00" /></label>
                      <label>סוג<select value={placeDraft.type} onChange={(e) => updatePlaceDraft("type", e.target.value as PlaceType)}>{placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                      {placeDraft.type === "אירוע" && (
                        <>
                          <label>יום האירוע<select value={placeDraft.eventDayId} onChange={(e) => updatePlaceDraft("eventDayId", e.target.value)}><option value="">בחר יום (יעוגן אוטומטית)</option>{dayPlans.map((day) => <option key={day.id} value={day.id}>{day.title}</option>)}</select></label>
                          <label>שעת האירוע<input type="time" value={placeDraft.eventTime} onChange={(e) => updatePlaceDraft("eventTime", e.target.value)} /></label>
                        </>
                      )}
                      <label>אזור<input value={placeDraft.area} onChange={(e) => updatePlaceDraft("area", e.target.value)} /></label>
                      <label>תחנה קרובה<input value={placeDraft.station} onChange={(e) => updatePlaceDraft("station", e.target.value)} /></label>
                      <label>תמונה<input value={placeDraft.imageUrl} onChange={(e) => updatePlaceDraft("imageUrl", e.target.value)} /></label>
                      <label>לינק למקום<input value={placeDraft.sourceUrl} onChange={(e) => updatePlaceDraft("sourceUrl", e.target.value)} /></label>
                      <label>אינסטגרם<input value={placeDraft.instagramUrl} onChange={(e) => updatePlaceDraft("instagramUrl", e.target.value)} /></label>
                      <label>אתר<input value={placeDraft.websiteUrl} onChange={(e) => updatePlaceDraft("websiteUrl", e.target.value)} placeholder="אתר העסק או השאר ריק" /></label>
                      <label>טלפון<input value={placeDraft.phoneNumber} onChange={(e) => updatePlaceDraft("phoneNumber", e.target.value)} placeholder="מספר טלפון אם יש" /></label>
                      <label>טיפים<textarea rows={3} value={placeDraft.tips} onChange={(e) => updatePlaceDraft("tips", e.target.value)} placeholder="מופרדים בפסיקים" /></label>
                      <label>קו רוחב<input value={placeDraft.lat} onChange={(e) => updatePlaceDraft("lat", e.target.value)} /></label>
                      <label>קו אורך<input value={placeDraft.lng} onChange={(e) => updatePlaceDraft("lng", e.target.value)} /></label>
                      <label>עדיפות<select value={placeDraft.priority} onChange={(e) => updatePlaceDraft("priority", e.target.value)}><option value="1">1 - נמוכה</option><option value="2">2</option><option value="3">3 - רגילה</option><option value="4">4</option><option value="5">5 - גבוהה</option></select></label>
                      <label>משך ביקור (דקות)<input type="number" value={placeDraft.visitDurationMinutes} onChange={(e) => updatePlaceDraft("visitDurationMinutes", e.target.value)} placeholder="ריק = ברירת מחדל לפי סוג" /></label>
                      <label>עלות כניסה (₪)<input type="number" value={placeDraft.entryCost} onChange={(e) => updatePlaceDraft("entryCost", e.target.value)} placeholder="0 = חינם, ריק = לא ידוע" /></label>
                      <label>מידע ל-AI<textarea rows={4} value={placeDraft.aiNotes} onChange={(e) => updatePlaceDraft("aiNotes", e.target.value)} placeholder="מחירי כניסה, מתי כדאי להגיע, התאמה לילדים, הערות עונתיות — ה-AI מתחשב בזה בתכנון" /></label>
                    </div>
                    {placeFormState.tone !== "idle" && <p className={`form-message ${placeFormState.tone}`}>{placeFormState.message}</p>}
                    <div className="inline-actions" style={{ marginTop: "1rem" }}><button type="submit">שמירת מקום</button></div>
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>
      )}
      {modalPlace && !selectedPlaceId && <div className="modal-backdrop" onClick={closePlaceModal} role="presentation"><div className="modal-shell" onClick={(event) => event.stopPropagation()}>{renderPlaceDetails(modalPlace, { isModal: true, onClose: closePlaceModal })}</div></div>}
      {pinDialog && (
        <div className="modal-backdrop" onClick={() => setPinDialog(null)} role="presentation">
          <div className="modal-shell modal-dialog" style={{ maxWidth: "400px" }} onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><strong>📌 עיגון מקום</strong><button type="button" onClick={() => setPinDialog(null)}>✕</button></div>
            <div className="form-stack" style={{ padding: "1rem" }}>
              <p style={{ margin: 0 }}><strong>{pinDialog.placeName}</strong></p>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.5rem 0 0" }}>מקום מעוגן לא יוזז על ידי החלוקה האוטומטית. אם יש שעת הגעה קבועה (למשל מופע), הוסף אותה כדי שה-AI יתכנן את שאר היום בהתאם.</p>
              <label style={{ marginTop: "0.75rem" }}>
                שעת הגעה נדרשת (אופציונלי)
                <input type="time" value={pinDialogTime} onChange={(e) => setPinDialogTime(e.target.value)} />
              </label>
              <div className="inline-actions" style={{ marginTop: "0.5rem" }}>
                <button type="button" onClick={() => { setPinWithTime(pinDialog.dayId, pinDialog.placeId, pinDialogTime); setPinDialog(null); }}>📌 עגן</button>
                <button type="button" className="secondary-button" onClick={() => setPinDialog(null)}>ביטול</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showTripSettings && (
        <div className="modal-backdrop" onClick={() => setShowTripSettings(false)} role="presentation">
          <div className="modal-shell modal-dialog trip-settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><strong>⚙️ הגדרות הטיול</strong><button type="button" onClick={() => setShowTripSettings(false)}>✕</button></div>
            <div className="form-stack" style={{ padding: "1rem" }}>
              <label>שם הטיול<input value={tripConfig.tripName} onChange={(e) => setTripConfig((c) => ({ ...c, tripName: e.target.value }))} /></label>
              <label>יעד<input value={tripConfig.destination} onChange={(e) => setTripConfig((c) => ({ ...c, destination: e.target.value }))} placeholder="למשל: London" /></label>
              <label>שעת התחלת יום<input type="number" min={0} max={23} value={tripConfig.dayStartHour} onChange={(e) => setTripConfig((c) => ({ ...c, dayStartHour: Number(e.target.value) }))} /></label>
              <label>שעת סיום יום<input type="number" min={0} max={23} value={tripConfig.dayEndHour} onChange={(e) => setTripConfig((c) => ({ ...c, dayEndHour: Number(e.target.value) }))} /></label>
              <label>תחילת הפסקת צהריים<input type="number" min={0} max={23} value={tripConfig.lunchBreakStart} onChange={(e) => setTripConfig((c) => ({ ...c, lunchBreakStart: Number(e.target.value) }))} /></label>
              <label>סוף הפסקת צהריים<input type="number" min={0} max={23} value={tripConfig.lunchBreakEnd} onChange={(e) => setTripConfig((c) => ({ ...c, lunchBreakEnd: Number(e.target.value) }))} /></label>
            </div>
            <div className="inline-actions" style={{ padding: "0 1rem 1rem" }}>
              <button type="button" onClick={() => setShowTripSettings(false)}>שמור וסגור</button>
            </div>
          </div>
        </div>
      )}
      {showFlights && (
        <div className="modal-backdrop" onClick={() => setShowFlights(false)} role="presentation">
          <div className="modal-shell modal-dialog flights-panel" onClick={(e) => e.stopPropagation()}>
            <div className="section-head"><strong>✈️ טיסות</strong><button type="button" onClick={() => setShowFlights(false)}>✕</button></div>
            <div style={{ padding: "0 1rem" }}>
              {flights.map((f) => (
                <div key={f.id} className="flight-item">
                  <span>{f.type === "arrival" ? "🛬 הגעה" : "🛫 יציאה"}</span>
                  <span>{f.flightDate} {f.flightTime}</span>
                  <span>{f.airport}{f.flightNumber ? ` · ${f.flightNumber}` : ""}</span>
                  <button type="button" className="danger" onClick={() => removeFlight(f.id)}>✕</button>
                </div>
              ))}
              {!flights.length && <p>עדיין לא הוזנו טיסות.</p>}
              <div className="flight-add-form form-stack" style={{ marginTop: "1rem" }}>
                <label>סוג<select value={flightDraft.type || "arrival"} onChange={(e) => setFlightDraft((d) => ({ ...d, type: e.target.value as "arrival" | "departure" }))}><option value="arrival">הגעה</option><option value="departure">יציאה</option></select></label>
                <label>תאריך<input type="date" value={flightDraft.flightDate || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightDate: e.target.value }))} /></label>
                <label>שעה<input type="time" value={flightDraft.flightTime || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightTime: e.target.value }))} /></label>
                <label>שדה תעופה<input value={flightDraft.airport || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, airport: e.target.value }))} placeholder="למשל: LHR" /></label>
                <label>מספר טיסה<input value={flightDraft.flightNumber || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightNumber: e.target.value }))} placeholder="למשל: LY315" /></label>
                <label>זמן העברה (דקות)<input type="number" value={flightDraft.transferMinutes ?? 45} onChange={(e) => setFlightDraft((d) => ({ ...d, transferMinutes: Number(e.target.value) }))} /></label>
                <div className="inline-actions"><button type="button" onClick={addFlight}>הוסף טיסה</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ── Add flight dialog (from settings) ── */}
      {showAddFlightDialog && (
        <div className="modal-backdrop" onClick={() => setShowAddFlightDialog(false)} role="presentation">
          <div className="modal-shell modal-dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <strong>✈️ הוספת טיסה</strong>
              <button type="button" onClick={() => setShowAddFlightDialog(false)}>✕</button>
            </div>
            <div className="form-stack settings-dialog-body">
              <label>סוג<select value={flightDraft.type || "arrival"} onChange={(e) => setFlightDraft((d) => ({ ...d, type: e.target.value as "arrival" | "departure" }))}><option value="arrival">🛬 הגעה</option><option value="departure">🛫 יציאה</option></select></label>
              <label>תאריך<input type="date" value={flightDraft.flightDate || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightDate: e.target.value }))} /></label>
              <label>שעה<input type="time" value={flightDraft.flightTime || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightTime: e.target.value }))} /></label>
              <label>שדה תעופה<input value={flightDraft.airport || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, airport: e.target.value }))} placeholder="למשל: LHR" /></label>
              <label>מספר טיסה<input value={flightDraft.flightNumber || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, flightNumber: e.target.value }))} placeholder="למשל: LY315" /></label>
              <label>זמן העברה (דקות)<input type="number" value={flightDraft.transferMinutes ?? 45} onChange={(e) => setFlightDraft((d) => ({ ...d, transferMinutes: Number(e.target.value) }))} /></label>
              <label>הערות<input value={flightDraft.notes || ""} onChange={(e) => setFlightDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="אופציונלי" /></label>
            </div>
            <div className="settings-dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setShowAddFlightDialog(false)}>ביטול</button>
              <button type="button" onClick={() => { addFlight(); setShowAddFlightDialog(false); }}
                disabled={!flightDraft.type || !flightDraft.flightDate || !flightDraft.flightTime}>
                הוסף טיסה
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Hotel edit dialog (from settings) ── */}
      {showHotelEditDialog && (
        <div className="modal-backdrop" onClick={() => setShowHotelEditDialog(false)} role="presentation">
          <div className="modal-shell modal-dialog settings-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="settings-dialog-header">
              <strong>🏨 {editingHotelId ? "עריכת מלון" : "הוספת מלון"}</strong>
              <button type="button" onClick={() => setShowHotelEditDialog(false)}>✕</button>
            </div>
            <form onSubmit={handleHotelSubmit}>
              <div className="form-stack settings-dialog-body">
                <label style={{ fontWeight: 600 }}>חיפוש ב-Google Places</label>
                <div ref={hotelAutocompleteHostRef} className="google-autocomplete-host" />
                {hotelDraft.name && hotelDraft.googlePlaceId && (
                  <div className="autocomplete-success-banner">
                    ✅ הפרטים נטענו מ-Google Places
                    {hotelDraft.rating && <span> · ⭐ {hotelDraft.rating}</span>}
                    {hotelDraft.imageUrl && <img src={hotelDraft.imageUrl} alt={hotelDraft.name} style={{ display: "block", marginTop: "0.5rem", borderRadius: "6px", maxHeight: "120px", objectFit: "cover", width: "100%" }} />}
                  </div>
                )}
                <label>שם המלון<input value={hotelDraft.name} onChange={(e) => updateHotelDraft("name", e.target.value)} required /></label>
                <label>כתובת<input value={hotelDraft.address} onChange={(e) => updateHotelDraft("address", e.target.value)} required /></label>
                <label>תאריך צ׳ק אין<input type="date" value={hotelDraft.checkInDate} onChange={(e) => updateHotelDraft("checkInDate", e.target.value)} /></label>
                <label>שעת צ׳ק אין<input type="time" value={hotelDraft.checkInTime} onChange={(e) => updateHotelDraft("checkInTime", e.target.value)} /></label>
                <label>תאריך צ׳ק אאוט<input type="date" value={hotelDraft.checkOutDate} onChange={(e) => updateHotelDraft("checkOutDate", e.target.value)} /></label>
                <label>שעת צ׳ק אאוט<input type="time" value={hotelDraft.checkOutTime} onChange={(e) => updateHotelDraft("checkOutTime", e.target.value)} /></label>
                <label>קו רוחב (אופציונלי)<input value={hotelDraft.lat} onChange={(e) => updateHotelDraft("lat", e.target.value)} /></label>
                <label>קו אורך (אופציונלי)<input value={hotelDraft.lng} onChange={(e) => updateHotelDraft("lng", e.target.value)} /></label>
                {hotelLookupState === "loading" && <p>מחפש מיקום לפי כתובת...</p>}
                {hotelLookupState === "error" && <p className="form-message error">לא נמצא מיקום. הוסף קו רוחב ואורך ידנית.</p>}
              </div>
              <div className="settings-dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setShowHotelEditDialog(false)}>ביטול</button>
                <button type="submit">{editingHotelId ? "שמור שינויים" : "הוסף מלון"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ── Share modal ── */}
      {showShareModal && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-card share-modal" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>שיתוף הטיול</h2>
              <button className="modal-close" onClick={() => setShowShareModal(false)}>✕</button>
            </div>
            {shareLoading ? (
              <p>יוצר קישורים...</p>
            ) : (
              <div className="share-links">
                <div className="share-link-row">
                  <label>צפייה בלבד</label>
                  <input readOnly value={shareLinks.viewer || "טוען..."} onClick={(e) => (e.target as HTMLInputElement).select()} />
                  <button onClick={() => navigator.clipboard.writeText(shareLinks.viewer || "")}>העתק</button>
                </div>
                {shareLinks.editor && (
                  <div className="share-link-row">
                    <label>עריכה משותפת</label>
                    <input readOnly value={shareLinks.editor} onClick={(e) => (e.target as HTMLInputElement).select()} />
                    <button onClick={() => navigator.clipboard.writeText(shareLinks.editor || "")}>העתק</button>
                  </div>
                )}
                <p className="share-hint">מי שיפתח את קישור הצפייה יוכל לראות את הטיול ולהעתיק אותו לחשבון שלו.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
