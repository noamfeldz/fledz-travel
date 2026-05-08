
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer } from "react-leaflet";
import { useLocation, useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";

type PlaceType = "אטרקציה" | "מוזיאון" | "פארק" | "אוכל" | "ילדים";
type TransportMode = "הליכה" | "אוטובוס" | "רכבת תחתית" | "שילוב";
type ViewKey = "home" | "saved" | "hotel" | "map" | "planner";
type Place = { id: string; name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; rating?: number; tips: string[]; imageUrl: string; sourceUrl?: string; instagramUrl?: string; station?: string; lat: number; lng: number; websiteUrl?: string; phoneNumber?: string; googleMapsUrl?: string; googlePlaceId?: string; businessStatus?: string; };
type PlaceDraft = { name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; imageUrl: string; sourceUrl: string; instagramUrl: string; station: string; tips: string; lat: string; lng: string; websiteUrl: string; phoneNumber: string; googleMapsUrl: string; googlePlaceId: string; businessStatus: string; };
type Hotel = { name: string; address: string; lat: number; lng: number; };
type DayPlan = { id: string; title: string; placeIds: string[]; pinnedPlaceIds: string[]; };
type GooglePlacePrediction = {
  place_id: string;
  description: string;
  structured_formatting?: { main_text?: string; secondary_text?: string };
};
const STORAGE_KEYS = { places: "fledz-places", saved: "fledz-saved", hotel: "fledz-hotel", plans: "fledz-plans" };
const API = "/api";
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
const defaultPlaceImage = "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80";
const emptyPlaceDraft: PlaceDraft = { name: "", shortDescription: "", address: "", openingHours: "", type: "אטרקציה", area: "", imageUrl: "", sourceUrl: "", instagramUrl: "", station: "", tips: "", lat: "", lng: "", websiteUrl: "", phoneNumber: "", googleMapsUrl: "", googlePlaceId: "", businessStatus: "" };
const defaultHotel: Hotel = { name: "Park Plaza Victoria London", address: "239 Vauxhall Bridge Road, London SW1V 1EQ", lat: 51.4952, lng: -0.1439 };
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
    return {
      id: currentPlan.id || basePlan.id,
      title: currentPlan.title?.trim() || basePlan.title,
      placeIds: uniquePlaceIds,
      pinnedPlaceIds: Array.from(new Set((currentPlan.pinnedPlaceIds || []).filter((placeId) => uniquePlaceIds.includes(placeId)))),
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
const placeTypes: PlaceType[] = ["אטרקציה", "מוזיאון", "פארק", "אוכל", "ילדים"];
const baseAreas = ["הכול", "South Bank", "Central London", "South Kensington", "Camden"];
const viewPaths: Record<ViewKey, string> = { home: "/", saved: "/saved", hotel: "/hotel", map: "/map", planner: "/planner" };
const routeItems = [{ key: "home", label: "מקומות" }, { key: "saved", label: "שמורים" }, { key: "hotel", label: "מלון" }, { key: "map", label: "מפה" }, { key: "planner", label: "ימים" }] as const;
function getViewFromPathname(pathname: string): ViewKey | null { const normalized = pathname === "/" ? "/" : pathname.replace(/\/+$/, ""); const match = (Object.entries(viewPaths) as Array<[ViewKey, string]>).find(([, path]) => path === normalized); return match?.[0] ?? null; }
function getLegacyPathFromHash(hash: string) { const key = hash.replace(/^#/, "") as ViewKey; return viewPaths[key] ?? null; }
function getPlaceIdFromPathname(pathname: string) { return decodeURIComponent(pathname.replace(/\/+$/, "").match(/^\/places\/([^/]+)$/)?.[1] ?? ""); }
function getPlacePath(placeId: string) { return `/places/${encodeURIComponent(placeId)}`; }
function createMarkerIcon(color: string) { const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41"><path fill="${color}" stroke="#ffffff" stroke-width="2" d="M12.5 1C6.6 1 2 5.6 2 11.5c0 8.9 10.5 28.5 10.5 28.5S23 20.4 23 11.5C23 5.6 18.4 1 12.5 1z"/><circle cx="12.5" cy="11.5" r="4.5" fill="#ffffff"/></svg>`; return new L.Icon({ iconUrl: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png", iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] }); }
const markerIcon = createMarkerIcon("#2b6cb0"); const hotelMarkerIcon = createMarkerIcon("#d97706");
function readLocalStorage<T>(key: string, fallback: T): T { const stored = window.localStorage.getItem(key); if (!stored) return fallback; try { return JSON.parse(stored) as T; } catch { return fallback; } }
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) { const r = 6371; const toRad = (v: number) => (v * Math.PI) / 180; const dLat = toRad(b.lat - a.lat); const dLng = toRad(b.lng - a.lng); const lat1 = toRad(a.lat); const lat2 = toRad(b.lat); const angle = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2); return 2 * r * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle)); }
function estimateTransport(distanceKm: number): { mode: TransportMode; minutes: number } { if (distanceKm < 1.2) return { mode: "הליכה", minutes: Math.max(8, Math.round(distanceKm * 14)) }; if (distanceKm < 5) return { mode: "אוטובוס", minutes: Math.round(distanceKm * 8 + 8) }; if (distanceKm < 8) return { mode: "רכבת תחתית", minutes: Math.round(distanceKm * 5 + 10) }; return { mode: "שילוב", minutes: Math.round(distanceKm * 5 + 18) }; }
function formatDistance(distanceKm: number) { return `${distanceKm.toFixed(1)} ק"מ`; }
function plannerComfort(placeIds: string[], places: Place[]) { if (placeIds.length < 2) return { label: "יום רגוע", tone: "good" as const }; const tripDistances = placeIds.map((placeId, index) => { if (!index) return 0; const prev = places.find((p) => p.id === placeIds[index - 1]); const current = places.find((p) => p.id === placeId); return prev && current ? haversineKm(prev, current) : 0; }).slice(1); const average = tripDistances.reduce((sum, value) => sum + value, 0) / tripDistances.length; if (average < 2.5) return { label: "סדר יום נוח", tone: "good" as const }; if (average < 5) return { label: "יום סביר עם קצת נסיעות", tone: "ok" as const }; return { label: "כדאי לקרב בין המקומות", tone: "warn" as const }; }
function stopEventPropagation(event: React.SyntheticEvent) { event.stopPropagation(); }
function isCardActivationKey(event: React.KeyboardEvent) { return event.key === "Enter" || event.key === " "; }
function getVisitDurationHours(type: PlaceType) {
  switch (type) {
    case "מוזיאון": return 2.5;
    case "פארק": return 1.5;
    case "אוכל": return 1.25;
    case "ילדים": return 2;
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
  if (place.type === "אטרקציה" && dayPart === "ערב") return "אטרקציית ערב";
  return `${dayPart} של ${place.type}`;
}
function getDayMapPath(day: DayPlan, places: Place[], hotel: Hotel) {
  const dayPlaces = day.placeIds.map((placeId) => places.find((place) => place.id === placeId)).filter(Boolean) as Place[];
  return [hotel, ...dayPlaces].map((point) => [point.lat, point.lng] as [number, number]);
}
function buildDayTimeline(day: DayPlan, places: Place[], hotel: Hotel) {
  const dayPlaces = day.placeIds.map((placeId) => places.find((place) => place.id === placeId)).filter(Boolean) as Place[];
  let currentHour = 9;
  let previousStop: Place | Hotel = hotel;
  return dayPlaces.map((place) => {
    const travelMinutes = estimateTransport(haversineKm(previousStop, place)).minutes;
    const openingStart = parseOpeningStartHour(place.openingHours);
    const suggestedStart = currentHour + travelMinutes / 60;
    const startHour = openingStart ? Math.max(suggestedStart, openingStart) : suggestedStart;
    const endHour = startHour + getVisitDurationHours(place.type);
    previousStop = place;
    currentHour = endHour;
    return {
      place,
      startLabel: formatHourLabel(startHour),
      endLabel: formatHourLabel(endHour),
      dayPart: getDayPartLabel(startHour),
      travelMinutes,
      isTight: endHour > 19.5,
    };
  });
}
function sortPlacesForPlanner(places: Place[], hotel: Hotel) {
  return [...places].sort((left, right) => {
    const areaCompare = (left.area || "zzz").localeCompare(right.area || "zzz");
    if (areaCompare !== 0) return areaCompare;
    return haversineKm(hotel, left) - haversineKm(hotel, right);
  });
}
function autoDistributeWeek(dayPlans: DayPlan[], places: Place[], hotel: Hotel) {
  const normalizedPlans = normalizeDayPlans(dayPlans);
  const placeById = new Map(places.map((place) => [place.id, place]));
  const pinnedPlaceIds = new Set(normalizedPlans.flatMap((day) => day.pinnedPlaceIds));
  const nextPlans = normalizedPlans.map((day) => ({
    ...day,
    placeIds: day.placeIds.filter((placeId) => day.pinnedPlaceIds.includes(placeId) && placeById.has(placeId)),
    pinnedPlaceIds: day.pinnedPlaceIds.filter((placeId) => placeById.has(placeId)),
  }));
  const candidates = sortPlacesForPlanner(places.filter((place) => !pinnedPlaceIds.has(place.id)), hotel);

  for (const place of candidates) {
    const bestDay = nextPlans.reduce<{ index: number; score: number } | null>((best, day, index) => {
      const assignedPlaces = day.placeIds.map((placeId) => placeById.get(placeId)).filter(Boolean) as Place[];
      const lastPlace = assignedPlaces[assignedPlaces.length - 1] || null;
      const tripDistance = lastPlace ? haversineKm(lastPlace, place) : haversineKm(hotel, place);
      const sameAreaCount = assignedPlaces.filter((assignedPlace) => assignedPlace.area && assignedPlace.area === place.area).length;
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
function placeToDraft(place: Place): PlaceDraft { return { name: place.name, shortDescription: place.shortDescription, address: place.address, openingHours: place.openingHours, type: place.type, area: place.area, imageUrl: place.imageUrl === defaultPlaceImage ? "" : place.imageUrl, sourceUrl: place.sourceUrl || "", instagramUrl: place.instagramUrl || "", station: place.station || "", tips: place.tips.join(", "), lat: String(place.lat), lng: String(place.lng), websiteUrl: place.websiteUrl || "", phoneNumber: place.phoneNumber || "", googleMapsUrl: place.googleMapsUrl || "", googlePlaceId: place.googlePlaceId || "", businessStatus: place.businessStatus || "" }; }
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
    case "saved": return <svg width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
    case "hotel": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d="M10 22v-6.57"/><path d="M12 11h.01"/><path d="M12 7h.01"/><path d="M14 15.43V22"/><path d="M15 16a5 5 0 0 0-6 0"/><path d="M16 11h.01"/><path d="M16 7h.01"/><path d="M8 11h.01"/><path d="M8 7h.01"/><rect x="4" y="2" width="16" height="20" rx="2"/></svg>;
    case "map": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>;
    case "planner": return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>;
    default: return null;
  }
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [places, setPlaces] = useState<Place[]>(() => readLocalStorage(STORAGE_KEYS.places, seededPlaces));
  const [savedIds, setSavedIds] = useState<string[]>(() => readLocalStorage(STORAGE_KEYS.saved, ["london-eye", "hyde-park"]));
  const [hotel, setHotel] = useState<Hotel>(() => readLocalStorage(STORAGE_KEYS.hotel, defaultHotel));
  const [dayPlans, setDayPlans] = useState<DayPlan[]>(() => normalizeDayPlans(readLocalStorage(STORAGE_KEYS.plans, defaultPlans)));
  const [dbReady, setDbReady] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("הכול");
  const [areaFilter, setAreaFilter] = useState<string>("הכול");
  const [hotelLookupState, setHotelLookupState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft>(emptyPlaceDraft);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeFormState, setPlaceFormState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
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
  const [isEditingHotel, setIsEditingHotel] = useState(false);
  const [modalPlaceId, setModalPlaceId] = useState<string | null>(null);
  const placeAutocompleteHostRef = useRef<HTMLDivElement | null>(null);
  const googleMapsLoaderRef = useRef<Promise<void> | null>(null);
  const [addPlaceMode, setAddPlaceMode] = useState<"search" | "link" | "manual">("search");
  const [autocompleteSelected, setAutocompleteSelected] = useState(false);
  const [draggedPlace, setDraggedPlace] = useState<{ placeId: string; sourceDayId: string | null } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ dayId: string; targetPlaceId: string | null } | null>(null);
  const [openPlaceMenu, setOpenPlaceMenu] = useState<string | null>(null);
  useEffect(() => { if (!openPlaceMenu) return; const close = () => setOpenPlaceMenu(null); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [openPlaceMenu]);
  const selectedPlaceId = getPlaceIdFromPathname(location.pathname);
  const selectedPlace = useMemo(() => selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null, [places, selectedPlaceId]);
  const modalPlace = useMemo(() => modalPlaceId ? places.find((place) => place.id === modalPlaceId) ?? null : null, [modalPlaceId, places]);
  const activeView = selectedPlaceId ? null : getViewFromPathname(location.pathname);
  // ── sync localStorage (fast cache) ──────────────────────────────────────
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.places, JSON.stringify(places)); }, [places]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.hotel, JSON.stringify(hotel)); }, [hotel]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.plans, JSON.stringify(dayPlans)); }, [dayPlans]);  // ── track whether initial DB load has completed ───────────────────────────
  const dbInitDone = useRef(false);
  useEffect(() => {
    if (dbReady && !dbInitDone.current) { dbInitDone.current = true; }
  }, [dbReady]);
  // ── sync saved ids to DB after every mutation ────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch("/saved", { method: "PUT", body: JSON.stringify(savedIds) }).catch(() => {});
  }, [savedIds]);
  // ── sync hotel to DB after every mutation ────────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch("/hotel", { method: "PUT", body: JSON.stringify(hotel) }).catch(() => {});
  }, [hotel]);
  // ── sync day plans to DB after every mutation ────────────────────────────
  useEffect(() => {
    if (!dbInitDone.current) return;
    apiFetch("/plans", { method: "PUT", body: JSON.stringify(dayPlans) }).catch(() => {});
  }, [dayPlans]);  // ── load from DB on mount ─────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/health").then(async () => {
      const [dbPlaces, dbSaved, dbHotel, dbPlans] = await Promise.all([
        apiFetch("/places"),
        apiFetch("/saved"),
        apiFetch("/hotel"),
        apiFetch("/plans"),
      ]);
      if (Array.isArray(dbPlaces) && dbPlaces.length > 0) setPlaces(dbPlaces as Place[]);
      if (Array.isArray(dbSaved)) setSavedIds(dbSaved as string[]);
      if (dbHotel) setHotel(dbHotel as Hotel);
      if (Array.isArray(dbPlans)) setDayPlans(normalizeDayPlans(dbPlans as DayPlan[]));
      setDbReady(true);
    }).catch(() => {
      // API not available — continue with localStorage only
      setDbReady(false);
    });
  }, []);
  useEffect(() => { const legacyPath = getLegacyPathFromHash(location.hash); if (legacyPath && legacyPath !== location.pathname) { navigate(legacyPath, { replace: true }); return; } const isKnownPath = getViewFromPathname(location.pathname) || selectedPlaceId; if (!isKnownPath) navigate("/", { replace: true }); }, [location.hash, location.pathname, navigate, selectedPlaceId]);
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
        if (!googleMapsLoaderRef.current) {
          googleMapsLoaderRef.current = new Promise<void>((resolve, reject) => {
            if (window.google?.maps?.importLibrary) {
              resolve();
              return;
            }

            const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-maps-js="true"]');
            if (existingScript) {
              existingScript.addEventListener("load", () => resolve(), { once: true });
              existingScript.addEventListener("error", () => reject(new Error("script-load-failed")), { once: true });
              return;
            }

            (window as any).__codexGoogleMapsInit = () => resolve();
            const script = document.createElement("script");
            script.dataset.googleMapsJs = "true";
            script.async = true;
            script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&loading=async&libraries=places&v=weekly&callback=__codexGoogleMapsInit`;
            script.onerror = () => reject(new Error("script-load-failed"));
            document.head.appendChild(script);
          }).finally(() => {
            delete (window as any).__codexGoogleMapsInit;
          });
        }

        await googleMapsLoaderRef.current;
        const google = window.google as any;
        const placesLibrary = await google.maps.importLibrary("places");
        if (cancelled) return;

        const { PlaceAutocompleteElement } = placesLibrary as {
          PlaceAutocompleteElement: new (options?: { includedRegionCodes?: string[]; locationBias?: { center: { lat: number; lng: number }; radius: number } }) => HTMLElement;
        };
        const host = placeAutocompleteHostRef.current;
        if (!host) return;

        host.innerHTML = "";
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ["gb"],
          locationBias: { center: { lat: 51.5074, lng: -0.1278 }, radius: 50000 },
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
              shortDescription: current.shortDescription || "נמשך מ-Google Places",
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
    };
  }, [isAddingPlace, editingPlaceId]);
  const savedPlaces = useMemo(() => places.filter((place) => savedIds.includes(place.id)), [places, savedIds]);
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
  const timelineByDayId = useMemo(() => dayPlans.reduce<Record<string, ReturnType<typeof buildDayTimeline>>>((result, day) => {
    result[day.id] = buildDayTimeline(day, places, hotel);
    return result;
  }, {}), [dayPlans, hotel, places]);
  const resetPlaceEditor = () => { setPlaceDraft(emptyPlaceDraft); setEditingPlaceId(null); setImportUrl(""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); setAddPlaceMode("search"); setAutocompleteSelected(false); };
  const updatePlaceDraft = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => setPlaceDraft((current) => ({ ...current, [key]: value }));
  const toggleSave = (placeId: string) => setSavedIds((current) => current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]);
  const openPlaceModal = (placeId: string) => setModalPlaceId(placeId);
  const openPlacePage = (placeId: string) => {
    closePlaceModal();
    navigate(getPlacePath(placeId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const closePlaceModal = () => setModalPlaceId(null);
  const startAddingPlace = () => { resetPlaceEditor(); setIsAddingPlace(true); navigate("/"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelAddingPlace = () => { resetPlaceEditor(); setIsAddingPlace(false); };
  const startEditingPlace = (place: Place) => { setModalPlaceId(null); setEditingPlaceId(place.id); setPlaceDraft(placeToDraft(place)); setImportUrl(place.sourceUrl || place.instagramUrl || ""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); setIsAddingPlace(false); navigate(getPlacePath(place.id)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const stopEditingPlace = () => resetPlaceEditor();
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
  function applyDefaultHotel() { setHotel(defaultHotel); setHotelLookupState("done"); setIsEditingHotel(false); }
  async function handleHotelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || ""); const address = String(formData.get("address") || "");
    const latValue = String(formData.get("lat") || ""); const lngValue = String(formData.get("lng") || "");
    if (!name || !address) return;
    if (latValue && lngValue) { setHotel({ name, address, lat: Number(latValue), lng: Number(lngValue) }); setHotelLookupState("done"); setIsEditingHotel(false); return; }
    try { setHotelLookupState("loading"); const coordinates = await geocodeAddress(address); setHotel({ name, address, ...coordinates }); setHotelLookupState("done"); setIsEditingHotel(false); }
    catch { setHotel({ name, address, lat: hotel.lat, lng: hotel.lng }); setHotelLookupState("error"); }
  }
  async function handlePlaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = placeDraft.name.trim(); const address = placeDraft.address.trim();
    if (!name || !address) { setPlaceFormState({ tone: "error", message: "צריך לפחות שם וכתובת כדי לשמור מקום." }); return; }
    let lat = placeDraft.lat.trim() ? Number(placeDraft.lat) : Number.NaN; let lng = placeDraft.lng.trim() ? Number(placeDraft.lng) : Number.NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      try { setPlaceFormState({ tone: "loading", message: "מחפש מיקום לפי הכתובת..." }); const coordinates = await geocodeAddress(address); lat = coordinates.lat; lng = coordinates.lng; }
      catch { setPlaceFormState({ tone: "error", message: "לא הצלחתי לאתר את המיקום מהכתובת. אפשר להוסיף ידנית קו רוחב וקו אורך." }); return; }
    }
    const existingPlace = editingPlaceId ? places.find((place) => place.id === editingPlaceId) : undefined;
    const nextPlace: Place = { id: existingPlace?.id || buildPlaceId(name), name, shortDescription: placeDraft.shortDescription.trim() || "נוסף ידנית", address, openingHours: placeDraft.openingHours.trim(), type: placeDraft.type, area: placeDraft.area.trim(), rating: existingPlace?.rating, tips: placeDraft.tips.split(",").map((item) => item.trim()).filter(Boolean), imageUrl: placeDraft.imageUrl.trim() || existingPlace?.imageUrl || defaultPlaceImage, sourceUrl: placeDraft.sourceUrl.trim() || undefined, instagramUrl: placeDraft.instagramUrl.trim() || undefined, station: placeDraft.station.trim() || undefined, lat, lng, websiteUrl: placeDraft.websiteUrl.trim() || existingPlace?.websiteUrl || undefined, phoneNumber: placeDraft.phoneNumber.trim() || existingPlace?.phoneNumber || undefined, googleMapsUrl: placeDraft.googleMapsUrl.trim() || existingPlace?.googleMapsUrl || undefined, googlePlaceId: placeDraft.googlePlaceId.trim() || existingPlace?.googlePlaceId || undefined, businessStatus: placeDraft.businessStatus.trim() || existingPlace?.businessStatus || undefined };
    setPlaces((current) => editingPlaceId ? current.map((place) => place.id === editingPlaceId ? nextPlace : place) : [nextPlace, ...current]);
    apiFetch("/places", { method: "POST", body: JSON.stringify(nextPlace) }).catch(() => {});
    setPlaceFormState({ tone: "success", message: editingPlaceId ? "השינויים נשמרו." : "המקום נוסף לרשימה." });
    setLinkImportState({ tone: "idle", message: "" });
    if (editingPlaceId) { setPlaceDraft(placeToDraft(nextPlace)); setImportUrl(nextPlace.sourceUrl || nextPlace.instagramUrl || ""); navigate(getPlacePath(nextPlace.id)); }
    else { resetPlaceEditor(); setIsAddingPlace(false); navigate(getPlacePath(nextPlace.id)); }
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
  const removePlaceFromDay = (dayId: string, placeId: string) => setDayPlans((current) => current.map((day) => day.id === dayId ? { ...day, placeIds: day.placeIds.filter((id) => id !== placeId), pinnedPlaceIds: day.pinnedPlaceIds.filter((id) => id !== placeId) } : day));
  const clearPlaceAssignment = (placeId: string) => setDayPlans((current) => current.map((day) => day.placeIds.includes(placeId) || day.pinnedPlaceIds.includes(placeId) ? { ...day, placeIds: day.placeIds.filter((id) => id !== placeId), pinnedPlaceIds: day.pinnedPlaceIds.filter((id) => id !== placeId) } : day));
  const clearDayPlan = (dayId: string) => setDayPlans((current) => current.map((day) => day.id === dayId ? { ...day, placeIds: [], pinnedPlaceIds: [] } : day));
  const togglePlacePin = (dayId: string, placeId: string) => setDayPlans((current) => current.map((day) => {
    if (day.id !== dayId || !day.placeIds.includes(placeId)) return day;
    const isPinned = day.pinnedPlaceIds.includes(placeId);
    return { ...day, pinnedPlaceIds: isPinned ? day.pinnedPlaceIds.filter((id) => id !== placeId) : [...day.pinnedPlaceIds, placeId] };
  }));
  const autoFillWeek = () => setDayPlans((current) => autoDistributeWeek(current, places, hotel));
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
  const renderPlaceDetails = (place: Place, options?: { isModal?: boolean; onClose?: () => void }) => {
    const transport = estimateTransport(haversineKm(hotel, place));
    const isModal = options?.isModal;
    return (
      <section className={`panel place-detail-hero${isModal ? " place-detail-modal-card" : ""}`}>
        <img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="place-detail-image" />
        <div className="place-detail-content">
          <div className="section-head">
            <div>
              <div className="place-topline">
                <span className="chip">{place.type}</span>
                <span className="chip soft">{place.area || "ללא אזור"}</span>
              </div>
              <h2>{place.name}</h2>
              <p className="detail-summary">{place.shortDescription || "ללא תיאור"}</p>
            </div>
            {isModal ? <button className="secondary-button" type="button" onClick={options?.onClose}>סגירה</button> : <button className="secondary-button" type="button" onClick={() => navigate("/")}>חזרה למקומות</button>}
          </div>
          <div className="inline-actions">
            <button type="button" onClick={() => toggleSave(place.id)}>{savedIds.includes(place.id) ? "הסרה משמורים" : "שמירת מקום"}</button>
            <button className="secondary-button" type="button" onClick={() => startEditingPlace(place)}>עריכת מקום</button>
            {isModal && <button className="secondary-button" type="button" onClick={() => { closePlaceModal(); navigate(getPlacePath(place.id)); }}>עמוד מלא</button>}
          </div>
          <dl className="detail-grid">
            <div><dt>כתובת</dt><dd>{place.address}</dd></div>
            <div><dt>שעות פתיחה</dt><dd>{place.openingHours || "לא הוזן"}</dd></div>
            <div><dt>תחנה קרובה</dt><dd>{place.station || "לא הוזן"}</dd></div>
            <div><dt>דירוג</dt><dd>{place.rating ? place.rating.toFixed(1) : "חדש"}</dd></div>
            <div><dt>טלפון</dt><dd>{place.phoneNumber || "לא הוזן"}</dd></div>
            <div><dt>אתר</dt><dd>{place.websiteUrl ? <a href={place.websiteUrl} target="_blank" rel="noreferrer">פתיחת אתר</a> : "לא הוזן"}</dd></div>
            <div><dt>Google Maps</dt><dd>{place.googleMapsUrl ? <a href={place.googleMapsUrl} target="_blank" rel="noreferrer">פתיחה בגוגל מפות</a> : "לא הוזן"}</dd></div>
            <div><dt>סטטוס</dt><dd>{place.businessStatus || "לא הוזן"}</dd></div>
            <div><dt>מרחק מהמלון</dt><dd>{formatDistance(haversineKm(hotel, place))}</dd></div>
            <div><dt>הגעה משוערת</dt><dd>{transport.mode} | {transport.minutes} דק'</dd></div>
            <div><dt>קו רוחב</dt><dd>{place.lat.toFixed(5)}</dd></div>
            <div><dt>קו אורך</dt><dd>{place.lng.toFixed(5)}</dd></div>
          </dl>
          {!!place.tips.length && <section className="sub-panel"><h3>טיפים</h3><div className="tips-row">{place.tips.map((tip) => <span key={tip} className="tip-pill">{tip}</span>)}</div></section>}
          {(place.sourceUrl || place.instagramUrl) && <section className="sub-panel"><h3>קישורים</h3><div className="inline-links">{place.sourceUrl && <a href={place.sourceUrl} target="_blank" rel="noreferrer">לינק למקום</a>}{place.instagramUrl && <a href={place.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}</div></section>}
        </div>
      </section>
    );
  };
  const renderPlaceForm = (title: string, description: string, submitLabel: string, cancelAction?: () => void) => (
    <section className="panel">
      <div className="section-head"><div><h2>{title}</h2><span>{description}</span></div>{cancelAction && <button className="secondary-button" type="button" onClick={cancelAction}>ביטול</button>}</div>
      <div className="import-section">
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
      <form className="form-layout" onSubmit={handlePlaceSubmit}>
        <div className="form-stack">
          <label>שם המקום<input value={placeDraft.name} onChange={(event) => updatePlaceDraft("name", event.target.value)} /></label>
          <label>תיאור קצר<textarea rows={3} value={placeDraft.shortDescription} onChange={(event) => updatePlaceDraft("shortDescription", event.target.value)} /></label>
          <label>כתובת<input value={placeDraft.address} onChange={(event) => updatePlaceDraft("address", event.target.value)} /></label>
          <label>שעות פתיחה<input value={placeDraft.openingHours} onChange={(event) => updatePlaceDraft("openingHours", event.target.value)} placeholder="לדוגמה 10:00-18:00" /></label>
          <label>סוג<select value={placeDraft.type} onChange={(event) => updatePlaceDraft("type", event.target.value as PlaceType)}>{placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>אזור<input value={placeDraft.area} onChange={(event) => updatePlaceDraft("area", event.target.value)} /></label>
          <label>תחנה קרובה<input value={placeDraft.station} onChange={(event) => updatePlaceDraft("station", event.target.value)} /></label>
          <label>תמונה<input value={placeDraft.imageUrl} onChange={(event) => updatePlaceDraft("imageUrl", event.target.value)} /></label>
          <label>לינק למקום<input value={placeDraft.sourceUrl} onChange={(event) => updatePlaceDraft("sourceUrl", event.target.value)} /></label>
          <label>אינסטגרם<input value={placeDraft.instagramUrl} onChange={(event) => updatePlaceDraft("instagramUrl", event.target.value)} /></label>
          <label>אתר<input value={placeDraft.websiteUrl} onChange={(event) => updatePlaceDraft("websiteUrl", event.target.value)} placeholder="אתר העסק או השאר ריק" /></label>
          <label>טלפון<input value={placeDraft.phoneNumber} onChange={(event) => updatePlaceDraft("phoneNumber", event.target.value)} placeholder="מספר טלפון אם יש" /></label>
          <label>טיפים<textarea rows={3} value={placeDraft.tips} onChange={(event) => updatePlaceDraft("tips", event.target.value)} placeholder="מופרדים בפסיקים" /></label>
          <label>קו רוחב<input value={placeDraft.lat} onChange={(event) => updatePlaceDraft("lat", event.target.value)} /></label>
          <label>קו אורך<input value={placeDraft.lng} onChange={(event) => updatePlaceDraft("lng", event.target.value)} /></label>
        </div>
        {placeFormState.tone !== "idle" && <p className={`form-message ${placeFormState.tone}`}>{placeFormState.message}</p>}
        <div className="inline-actions"><button type="submit">{submitLabel}</button></div>
      </form>
    </section>
  );
  const renderPlannerDay = (day: DayPlan) => {
    const comfort = plannerComfort(day.placeIds, places);
    const dayPlaces = day.placeIds.map((placeId) => places.find((item) => item.id === placeId)).filter(Boolean) as Place[];
    const dayMapPath = getDayMapPath(day, places, hotel);
    const dayMapCenter = dayPlaces[0] ? [dayPlaces[0].lat, dayPlaces[0].lng] as [number, number] : [hotel.lat, hotel.lng] as [number, number];

    return (
      <article key={day.id} className="planner-day">
        <div className="day-head">
          <div>
            <h3>{day.title}</h3>
            <span className={`comfort ${comfort.tone}`}>{comfort.label}</span>
          </div>
          <div className="day-head-actions">
            <select value="" onChange={(event) => addPlaceToDay(day.id, event.target.value)}>
              <option value="">הוספת מקום ליום</option>
              {places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}
            </select>
            <button className="secondary-button" type="button" onClick={() => clearDayPlan(day.id)} disabled={!day.placeIds.length}>ניקוי יום</button>
          </div>
        </div>
        <div className="planner-day-layout">
          {!!dayPlaces.length && (
            <section className="day-map-panel">
              <div className="section-head compact">
                <div>
                  <h3>מפת היום</h3>
                  <span>המלון וכל התחנות של היום</span>
                </div>
              </div>
              <MapContainer key={`day-map-${day.id}-${day.placeIds.join("-")}`} center={dayMapCenter} zoom={12} scrollWheelZoom={false} className="day-mini-map">
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[hotel.lat, hotel.lng]} icon={hotelMarkerIcon}>
                  <Popup><strong>{hotel.name}</strong><div>{hotel.address}</div></Popup>
                </Marker>
                {dayPlaces.map((place) => (
                  <Marker key={place.id} position={[place.lat, place.lng]} icon={markerIcon}>
                    <Popup><strong>{place.name}</strong><div>{place.address}</div></Popup>
                  </Marker>
                ))}
                {dayMapPath.length > 1 && <Polyline positions={dayMapPath} pathOptions={{ color: "#2b6cb0", weight: 4, opacity: 0.65 }} />}
              </MapContainer>
            </section>
          )}
          <div className={`planner-image-grid day-drop-zone${dragTarget?.dayId === day.id && !dragTarget.targetPlaceId ? " active" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragTarget({ dayId: day.id, targetPlaceId: null }); }} onDrop={(event) => { event.preventDefault(); handleDayDrop(day.id, null); }}>
            <div className="planner-drop-hint">גרור מקום לכאן כדי לשבץ או לשנות סדר</div>
            {day.placeIds.map((placeId, index) => {
              const place = places.find((item) => item.id === placeId);
              if (!place) return null;
              const isPinned = day.pinnedPlaceIds.includes(place.id);
              return (
                <article key={place.id} className={`planner-place-card planner-place-card-clickable${isPinned ? " is-pinned" : ""}${dragTarget?.dayId === day.id && dragTarget.targetPlaceId === place.id ? " drag-target" : ""}`} draggable onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} onDragStart={() => handlePlaceDragStart(day.id, place.id)} onDragEnd={handlePlaceDragEnd} onDragOver={(event) => { event.preventDefault(); setDragTarget({ dayId: day.id, targetPlaceId: place.id }); }} onDrop={(event) => { event.preventDefault(); handleDayDrop(day.id, place.id); }} role="button" tabIndex={0}>
                  <div className="place-menu-wrap">
                    <button className="place-menu-btn" type="button" aria-label="אפשרויות" onClick={(e) => { e.stopPropagation(); const key = `${day.id}:${place.id}`; setOpenPlaceMenu((prev) => prev === key ? null : key); }} onKeyDown={stopEventPropagation}>⋯</button>
                    {openPlaceMenu === `${day.id}:${place.id}` && <div className="place-context-menu" onClick={(e) => e.stopPropagation()}><button type="button" onClick={() => { movePlace(day.id, index, -1); setOpenPlaceMenu(null); }}>⬆ למעלה</button><button type="button" onClick={() => { movePlace(day.id, index, 1); setOpenPlaceMenu(null); }}>⬇ למטה</button><button type="button" onClick={() => { togglePlacePin(day.id, place.id); setOpenPlaceMenu(null); }}>{isPinned ? "🔓 שחרור עיגון" : "📌 עיגון"}</button><button type="button" className="danger" onClick={() => { removePlaceFromDay(day.id, place.id); setOpenPlaceMenu(null); }}>✕ הסר</button></div>}
                  </div>
                  <img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="planner-place-image" />
                  <div className="planner-place-content">
                    <div className="planner-place-top">
                      <strong>{index + 1}. {place.name}</strong>
                    </div>
                    <p>{place.area || "ללא אזור"} | {place.station || "ללא תחנה"}</p>
                    {isPinned && <span className="pin-indicator">מעוגן ולא יוזז אוטומטית</span>}
                  </div>
                </article>
              );
            })}
            {!day.placeIds.length && <p>עדיין אין מקומות ביום הזה. אפשר להתחיל להוסיף או לגרור לכאן.</p>}
          </div>
        </div>
      </article>
    );
  };
  return (
    <div className="app-shell">

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
        {selectedPlaceId && !selectedPlace && <section className="panel"><div className="section-head"><div><h2>המקום לא נמצא</h2><span>יכול להיות שהוא נמחק או שכתובת העמוד לא תקינה.</span></div><button type="button" onClick={() => navigate("/")}>חזרה למקומות</button></div></section>}
        {selectedPlace && <>{renderPlaceDetails(selectedPlace)}{editingPlaceId === selectedPlace.id && renderPlaceForm("עריכת מקום", "כאן אפשר לערוך את כל המידע הרלוונטי של המקום.", "שמירת שינויים", stopEditingPlace)}</>}
        {!selectedPlaceId && activeView === "home" && <><section className="action-panel"><div className="section-head"><h2>המקומות שלי</h2><button type="button" onClick={startAddingPlace}>הוספת מקום</button></div></section><section className="filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, תיאור או כתובת" /><div className="filters-row"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="הכול">כל הסוגים</option>{placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>{areaOptions.map((area) => <option key={area} value={area}>{area === "הכול" ? "כל האזורים" : area}</option>)}</select></div></section><section className="place-grid">{filteredPlaces.map((place) => { const isSaved = savedIds.includes(place.id); const assignedDayId = assignedDayByPlaceId[place.id] || ""; const isPinned = Boolean(pinnedDayByPlaceId[place.id]); return <article key={place.id} className="place-card place-card-clickable" onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} role="button" tabIndex={0}><img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="place-image" /><div className="place-body"><div className="place-topline"><span className="chip">{place.type}</span><span className="chip soft">{place.area || "ללא אזור"}</span></div><h2>{place.name}</h2><p>{place.shortDescription || "ללא תיאור"}</p><div className="place-basic-meta"><span>{place.station || "תחנה לא הוזנה"}</span><span>{place.rating ? `⭐ ${place.rating.toFixed(1)}` : "חדש"}</span></div><div className="planner-assignment" onClick={stopEventPropagation} onKeyDown={stopEventPropagation}><label>שיבוץ ליום<select value={assignedDayId} onChange={(event) => { const nextDayId = event.target.value; if (!nextDayId) { clearPlaceAssignment(place.id); return; } addPlaceToDay(nextDayId, place.id); }}><option value="">עדיין לא שובץ</option>{dayPlans.map((day) => <option key={day.id} value={day.id}>{day.title}</option>)}</select></label>{isPinned && <span className="pin-indicator">מעוגן ליום</span>}</div><div className="card-actions"><button type="button" onClick={(event) => { event.stopPropagation(); toggleSave(place.id); }}>{isSaved ? "הסרה משמורים" : "שמירת מקום"}</button><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); startEditingPlace(place); }}>עריכה</button></div></div></article>; })}</section></>}
        {!selectedPlaceId && activeView === "saved" && <section><div className="section-head"><h2>מקומות שמורים</h2><span>{savedPlaces.length} נשמרו</span></div><div className="saved-list">{savedPlaces.map((place) => { const distanceKm = haversineKm(hotel, place); const travel = estimateTransport(distanceKm); const assignedDayId = assignedDayByPlaceId[place.id] || ""; const isPinned = Boolean(pinnedDayByPlaceId[place.id]); return <div key={place.id} className="saved-item saved-item-clickable" onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} role="button" tabIndex={0}><div><strong>{place.name}</strong><p>{travel.mode} | {travel.minutes} דק' | {place.station || "תחנה תתווסף בהמשך"}</p>{isPinned && <span className="pin-indicator">מעוגן ליום</span>}</div><div className="saved-item-tools" onClick={stopEventPropagation} onKeyDown={stopEventPropagation}><label>שיבוץ<select value={assignedDayId} onChange={(event) => { const nextDayId = event.target.value; if (!nextDayId) { clearPlaceAssignment(place.id); return; } addPlaceToDay(nextDayId, place.id); }}><option value="">ללא יום</option>{dayPlans.map((day) => <option key={day.id} value={day.id}>{day.title}</option>)}</select></label><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => openPlacePage(place.id)}>פתיחה</button><button type="button" onClick={() => toggleSave(place.id)}>הסר</button></div></div></div>; })}{!savedPlaces.length && <p>עדיין לא שמרת מקומות. אפשר לחזור למסך המקומות ולבחור.</p>}</div></section>}
        {!selectedPlaceId && activeView === "hotel" && <section><div className="section-head"><div><h2>המלון שלך</h2><span>מכאן מחושבים המרחקים וזמני ההגעה</span></div><button type="button" onClick={() => setIsEditingHotel((current) => !current)}>{isEditingHotel ? "סגירת עריכה" : "עריכת מלון"}</button></div><button className="secondary-button" type="button" onClick={applyDefaultHotel} style={{marginBottom: "1rem"}}>שימוש במלון שלנו: Park Plaza Victoria London</button><div className="hotel-status"><strong>{hotel.name}</strong><p>{hotel.address}</p><p>מיקום שמור: {hotel.lat.toFixed(4)}, {hotel.lng.toFixed(4)}</p>{hotelLookupState === "loading" && <p>מחפש את המיקום לפי הכתובת...</p>}{hotelLookupState === "done" && <p>המלון נשמר והמרחקים עודכנו.</p>}{hotelLookupState === "error" && <p>לא הצלחנו למצוא את הכתובת אוטומטית. אפשר לשמור קווי אורך ורוחב ידנית.</p>}</div>{isEditingHotel && <form className="form-layout" style={{marginTop: "1.5rem"}} onSubmit={handleHotelSubmit}><div className="form-stack"><label>שם המלון<input name="name" defaultValue={hotel.name} /></label><label>כתובת<input name="address" defaultValue={hotel.address} /></label><label>קו רוחב<input name="lat" defaultValue={hotel.lat} /></label><label>קו אורך<input name="lng" defaultValue={hotel.lng} /></label></div><div className="inline-actions"><button type="submit">שמירת מלון</button></div></form>}</section>}
        {!selectedPlaceId && activeView === "map" && <section className="map-panel"><div className="section-head"><h2>מפת המקומות</h2><span>מציגה את המלון ואת כל המקומות</span></div><MapContainer center={[hotel.lat, hotel.lng]} zoom={12} scrollWheelZoom={false} className="map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[hotel.lat, hotel.lng]} icon={hotelMarkerIcon}><Popup><strong>{hotel.name}</strong><div>{hotel.address}</div></Popup></Marker>{places.map((place) => { const trip = estimateTransport(haversineKm(hotel, place)); return <Marker key={place.id} position={[place.lat, place.lng]} icon={markerIcon}><Popup><strong>{place.name}</strong><div>{place.address}</div><div>{trip.mode} | {trip.minutes} דק'</div></Popup></Marker>; })}</MapContainer><div className="map-legend"><div className="legend-row"><span className="legend-chip hotel">Hotel</span><span className="legend-chip place">Places</span></div>{places.map((place) => <div key={place.id} className="saved-item saved-item-clickable compact" onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} role="button" tabIndex={0}><div><strong>{place.name}</strong><p>{place.station || "ללא תחנה שמורה"}</p></div></div>)}</div></section>}
        {!selectedPlaceId && activeView === "planner" && <section className="planner-stack"><div className="section-head"><div><h2>לו"ז לשבוע</h2><span>אפשר לשבץ ידנית, לגרור עם תמונות, לעגן מקומות ספציפיים, ואז לחלק אוטומטית את כל השאר</span></div><div className="planner-toolbar"><span>{activeDaysCount} ימים פעילים</span><button type="button" onClick={autoFillWeek}>חלוקה אוטומטית</button></div></div><div className="planner-summary-grid"><article className="planner-summary-card"><strong>{plannedPlacesCount}</strong><span>מקומות שובצו</span></article><article className="planner-summary-card"><strong>{unplannedPlaces.length}</strong><span>עדיין בלי יום</span></article><article className="planner-summary-card"><strong>{pinnedPlacesCount}</strong><span>מקומות מעוגנים</span></article><article className="planner-summary-card"><strong>{places.length}</strong><span>סה"כ מקומות</span></article></div>{!!unplannedPlaces.length && <article className="panel"><div className="section-head"><div><h3>עדיין לא שובצו</h3><span>אפשר לגרור אותם ליום מתאים או לתת לחלוקה האוטומטית לשבץ</span></div></div><div className="planner-image-grid unplanned-image-grid">{unplannedPlaces.map((place) => <article key={place.id} className="planner-place-card planner-place-card-clickable planner-place-card-compact" draggable onClick={() => openPlacePage(place.id)} onKeyDown={(event) => { if (isCardActivationKey(event)) { event.preventDefault(); openPlacePage(place.id); } }} onDragStart={() => handlePlaceDragStart(null, place.id)} onDragEnd={handlePlaceDragEnd} role="button" tabIndex={0}><img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="planner-place-image" /><div className="planner-place-content"><strong>{place.name}</strong><p>{place.area || "ללא אזור"} | {place.station || "ללא תחנה"}</p></div></article>)}</div></article>}{dayPlans.map(renderPlannerDay)}</section>}
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
    </div>
  );
}

export default App;
