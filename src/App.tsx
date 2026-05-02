
import { FormEvent, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { useLocation, useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";

type PlaceType = "אטרקציה" | "מוזיאון" | "פארק" | "אוכל" | "ילדים";
type TransportMode = "הליכה" | "אוטובוס" | "רכבת תחתית" | "שילוב";
type ViewKey = "home" | "saved" | "hotel" | "map" | "planner";
type Place = { id: string; name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; rating?: number; tips: string[]; imageUrl: string; sourceUrl?: string; instagramUrl?: string; station?: string; lat: number; lng: number; };
type PlaceDraft = { name: string; shortDescription: string; address: string; openingHours: string; type: PlaceType; area: string; imageUrl: string; sourceUrl: string; instagramUrl: string; station: string; tips: string; lat: string; lng: string; };
type Hotel = { name: string; address: string; lat: number; lng: number; };
type DayPlan = { id: string; title: string; placeIds: string[]; };
const STORAGE_KEYS = { places: "fledz-places", saved: "fledz-saved", hotel: "fledz-hotel", plans: "fledz-plans" };
const defaultPlaceImage = "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=80";
const emptyPlaceDraft: PlaceDraft = { name: "", shortDescription: "", address: "", openingHours: "", type: "אטרקציה", area: "", imageUrl: "", sourceUrl: "", instagramUrl: "", station: "", tips: "", lat: "", lng: "" };
const defaultHotel: Hotel = { name: "Park Plaza Victoria London", address: "239 Vauxhall Bridge Road, London SW1V 1EQ", lat: 51.4952, lng: -0.1439 };
const defaultPlans: DayPlan[] = [{ id: "day-1", title: "יום 1: מרכז העיר", placeIds: ["london-eye", "hyde-park"] }, { id: "day-2", title: "יום 2: מוזיאון ושוק", placeIds: ["natural-history", "camden-market"] }];
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
async function geocodeAddress(address: string) { const encoded = encodeURIComponent(address); const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encoded}`, { headers: { Accept: "application/json" } }); if (!response.ok) throw new Error("failed"); const data = (await response.json()) as Array<{ lat: string; lon: string }>; if (!data.length) throw new Error("not-found"); return { lat: Number(data[0].lat), lng: Number(data[0].lon) }; }
function buildPlaceId(name: string) { return `${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "place"}-${Date.now()}`; }
function placeToDraft(place: Place): PlaceDraft { return { name: place.name, shortDescription: place.shortDescription, address: place.address, openingHours: place.openingHours, type: place.type, area: place.area, imageUrl: place.imageUrl === defaultPlaceImage ? "" : place.imageUrl, sourceUrl: place.sourceUrl || "", instagramUrl: place.instagramUrl || "", station: place.station || "", tips: place.tips.join(", "), lat: String(place.lat), lng: String(place.lng) }; }
function formatCoordinate(value: number) { return String(Number(value.toFixed(6))); }
function decodeLinkText(value: string) { return decodeURIComponent(value).replace(/\+/g, " ").replace(/[_-]+/g, " ").trim(); }
function extractCoordinatesFromText(value: string) { const atMatch = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/); if (atMatch) return { lat: Number(atMatch[1]), lng: Number(atMatch[2]) }; const markerMatch = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/); if (markerMatch) return { lat: Number(markerMatch[1]), lng: Number(markerMatch[2]) }; return null; }
function extractCoordinatesFromParam(value: string) { const pairMatch = value.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/); return pairMatch ? { lat: Number(pairMatch[1]), lng: Number(pairMatch[2]) } : null; }
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
  const [dayPlans, setDayPlans] = useState<DayPlan[]>(() => readLocalStorage(STORAGE_KEYS.plans, defaultPlans));
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("הכול");
  const [areaFilter, setAreaFilter] = useState<string>("הכול");
  const [hotelLookupState, setHotelLookupState] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [placeDraft, setPlaceDraft] = useState<PlaceDraft>(emptyPlaceDraft);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [placeFormState, setPlaceFormState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [importUrl, setImportUrl] = useState("");
  const [linkImportState, setLinkImportState] = useState<{ tone: "idle" | "loading" | "success" | "error"; message: string }>({ tone: "idle", message: "" });
  const [isAddingPlace, setIsAddingPlace] = useState(false);
  const [isEditingHotel, setIsEditingHotel] = useState(false);
  const selectedPlaceId = getPlaceIdFromPathname(location.pathname);
  const selectedPlace = useMemo(() => selectedPlaceId ? places.find((place) => place.id === selectedPlaceId) ?? null : null, [places, selectedPlaceId]);
  const activeView = selectedPlaceId ? null : getViewFromPathname(location.pathname);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.places, JSON.stringify(places)); }, [places]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(savedIds)); }, [savedIds]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.hotel, JSON.stringify(hotel)); }, [hotel]);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEYS.plans, JSON.stringify(dayPlans)); }, [dayPlans]);
  useEffect(() => { const legacyPath = getLegacyPathFromHash(location.hash); if (legacyPath && legacyPath !== location.pathname) { navigate(legacyPath, { replace: true }); return; } const isKnownPath = getViewFromPathname(location.pathname) || selectedPlaceId; if (!isKnownPath) navigate("/", { replace: true }); }, [location.hash, location.pathname, navigate, selectedPlaceId]);
  const savedPlaces = useMemo(() => places.filter((place) => savedIds.includes(place.id)), [places, savedIds]);
  const filteredPlaces = useMemo(() => places.filter((place) => { const q = query.toLowerCase(); const matchesQuery = !query.trim() || place.name.toLowerCase().includes(q) || place.shortDescription.toLowerCase().includes(q) || place.address.toLowerCase().includes(q); const matchesType = typeFilter === "הכול" || place.type === typeFilter; const matchesArea = areaFilter === "הכול" || place.area === areaFilter; return matchesQuery && matchesType && matchesArea; }), [areaFilter, places, query, typeFilter]);
  const areaOptions = useMemo(() => baseAreas.concat(places.map((place) => place.area).filter(Boolean)).filter((area, index, all) => all.indexOf(area) === index), [places]);
  const resetPlaceEditor = () => { setPlaceDraft(emptyPlaceDraft); setEditingPlaceId(null); setImportUrl(""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); };
  const updatePlaceDraft = <K extends keyof PlaceDraft>(key: K, value: PlaceDraft[K]) => setPlaceDraft((current) => ({ ...current, [key]: value }));
  const toggleSave = (placeId: string) => setSavedIds((current) => current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]);
  const startAddingPlace = () => { resetPlaceEditor(); setIsAddingPlace(true); navigate("/"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cancelAddingPlace = () => { resetPlaceEditor(); setIsAddingPlace(false); };
  const startEditingPlace = (place: Place) => { setEditingPlaceId(place.id); setPlaceDraft(placeToDraft(place)); setImportUrl(place.sourceUrl || place.instagramUrl || ""); setPlaceFormState({ tone: "idle", message: "" }); setLinkImportState({ tone: "idle", message: "" }); setIsAddingPlace(false); navigate(getPlacePath(place.id)); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const stopEditingPlace = () => resetPlaceEditor();
  async function handleImportLink() {
    if (!importUrl.trim()) { setLinkImportState({ tone: "error", message: "צריך להדביק קודם לינק." }); return; }
    try {
      setLinkImportState({ tone: "loading", message: "מנסה למשוך פרטים מהלינק..." });
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
    const nextPlace: Place = { id: existingPlace?.id || buildPlaceId(name), name, shortDescription: placeDraft.shortDescription.trim() || "נוסף ידנית", address, openingHours: placeDraft.openingHours.trim(), type: placeDraft.type, area: placeDraft.area.trim(), rating: existingPlace?.rating, tips: placeDraft.tips.split(",").map((item) => item.trim()).filter(Boolean), imageUrl: placeDraft.imageUrl.trim() || existingPlace?.imageUrl || defaultPlaceImage, sourceUrl: placeDraft.sourceUrl.trim() || undefined, instagramUrl: placeDraft.instagramUrl.trim() || undefined, station: placeDraft.station.trim() || undefined, lat, lng };
    setPlaces((current) => editingPlaceId ? current.map((place) => place.id === editingPlaceId ? nextPlace : place) : [nextPlace, ...current]);
    setPlaceFormState({ tone: "success", message: editingPlaceId ? "השינויים נשמרו." : "המקום נוסף לרשימה." });
    setLinkImportState({ tone: "idle", message: "" });
    if (editingPlaceId) { setPlaceDraft(placeToDraft(nextPlace)); setImportUrl(nextPlace.sourceUrl || nextPlace.instagramUrl || ""); navigate(getPlacePath(nextPlace.id)); }
    else { resetPlaceEditor(); setIsAddingPlace(false); navigate(getPlacePath(nextPlace.id)); }
  }
  const addPlanDay = () => setDayPlans((current) => [...current, { id: `day-${Date.now()}`, title: `יום ${current.length + 1}`, placeIds: [] }]);
  const addPlaceToDay = (dayId: string, placeId: string) => { if (!placeId) return; setDayPlans((current) => current.map((day) => day.id === dayId && !day.placeIds.includes(placeId) ? { ...day, placeIds: [...day.placeIds, placeId] } : day)); };
  const movePlace = (dayId: string, index: number, direction: -1 | 1) => setDayPlans((current) => current.map((day) => { if (day.id !== dayId) return day; const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= day.placeIds.length) return day; const reordered = [...day.placeIds]; [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]]; return { ...day, placeIds: reordered }; }));
  const removePlaceFromDay = (dayId: string, placeId: string) => setDayPlans((current) => current.map((day) => day.id === dayId ? { ...day, placeIds: day.placeIds.filter((id) => id !== placeId) } : day));
  const placeTransport = selectedPlace ? estimateTransport(haversineKm(hotel, selectedPlace)) : null;
  const renderPlaceForm = (title: string, description: string, submitLabel: string, cancelAction?: () => void) => (
    <section className="panel">
      <div className="section-head"><div><h2>{title}</h2><span>{description}</span></div>{cancelAction && <button className="secondary-button" type="button" onClick={cancelAction}>ביטול</button>}</div>
      <div className="link-import"><input value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="הדבקת לינק של Google Maps או Instagram" /><button type="button" onClick={handleImportLink}>ייבוא פרטים</button></div>
      {linkImportState.tone !== "idle" && <p className={`form-message ${linkImportState.tone}`}>{linkImportState.message}</p>}
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
          <label>טיפים<textarea rows={3} value={placeDraft.tips} onChange={(event) => updatePlaceDraft("tips", event.target.value)} placeholder="מופרדים בפסיקים" /></label>
          <label>קו רוחב<input value={placeDraft.lat} onChange={(event) => updatePlaceDraft("lat", event.target.value)} /></label>
          <label>קו אורך<input value={placeDraft.lng} onChange={(event) => updatePlaceDraft("lng", event.target.value)} /></label>
        </div>
        {placeFormState.tone !== "idle" && <p className={`form-message ${placeFormState.tone}`}>{placeFormState.message}</p>}
        <div className="inline-actions"><button type="submit">{submitLabel}</button></div>
      </form>
    </section>
  );
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
        {selectedPlace && <><section className="panel place-detail-hero"><img src={selectedPlace.imageUrl || defaultPlaceImage} alt={selectedPlace.name} className="place-detail-image" /><div className="place-detail-content"><div className="section-head"><div><div className="place-topline"><span className="chip">{selectedPlace.type}</span><span className="chip soft">{selectedPlace.area || "ללא אזור"}</span></div><h2>{selectedPlace.name}</h2><p className="detail-summary">{selectedPlace.shortDescription || "ללא תיאור"}</p></div><button className="secondary-button" type="button" onClick={() => navigate("/")}>חזרה למקומות</button></div><div className="inline-actions"><button type="button" onClick={() => toggleSave(selectedPlace.id)}>{savedIds.includes(selectedPlace.id) ? "הסרה משמורים" : "שמירת מקום"}</button><button className="secondary-button" type="button" onClick={() => startEditingPlace(selectedPlace)}>עריכת מקום</button></div><dl className="detail-grid"><div><dt>כתובת</dt><dd>{selectedPlace.address}</dd></div><div><dt>שעות פתיחה</dt><dd>{selectedPlace.openingHours || "לא הוזן"}</dd></div><div><dt>תחנה קרובה</dt><dd>{selectedPlace.station || "לא הוזן"}</dd></div><div><dt>דירוג</dt><dd>{selectedPlace.rating ? selectedPlace.rating.toFixed(1) : "חדש"}</dd></div><div><dt>מרחק מהמלון</dt><dd>{formatDistance(haversineKm(hotel, selectedPlace))}</dd></div><div><dt>הגעה משוערת</dt><dd>{placeTransport?.mode} | {placeTransport?.minutes} דק'</dd></div><div><dt>קו רוחב</dt><dd>{selectedPlace.lat.toFixed(5)}</dd></div><div><dt>קו אורך</dt><dd>{selectedPlace.lng.toFixed(5)}</dd></div></dl>{!!selectedPlace.tips.length && <section className="sub-panel"><h3>טיפים</h3><div className="tips-row">{selectedPlace.tips.map((tip) => <span key={tip} className="tip-pill">{tip}</span>)}</div></section>}{(selectedPlace.sourceUrl || selectedPlace.instagramUrl) && <section className="sub-panel"><h3>קישורים</h3><div className="inline-links">{selectedPlace.sourceUrl && <a href={selectedPlace.sourceUrl} target="_blank" rel="noreferrer">לינק למקום</a>}{selectedPlace.instagramUrl && <a href={selectedPlace.instagramUrl} target="_blank" rel="noreferrer">Instagram</a>}</div></section>}</div></section>{editingPlaceId === selectedPlace.id && renderPlaceForm("עריכת מקום", "כאן אפשר לערוך את כל המידע הרלוונטי של המקום.", "שמירת שינויים", stopEditingPlace)}</>}
        {!selectedPlaceId && activeView === "home" && <><section className="action-panel"><div className="section-head"><h2>המקומות שלי</h2><button type="button" onClick={startAddingPlace}>הוספת מקום</button></div></section>{isAddingPlace && renderPlaceForm("הוספת מקום", "אפשר להוסיף ידנית או למשוך פרטים מלינק קיים.", "שמירת מקום", cancelAddingPlace)}<section className="filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי שם, תיאור או כתובת" /><div className="filters-row"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="הכול">כל הסוגים</option>{placeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select><select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>{areaOptions.map((area) => <option key={area} value={area}>{area === "הכול" ? "כל האזורים" : area}</option>)}</select></div></section><section className="place-grid">{filteredPlaces.map((place) => { const isSaved = savedIds.includes(place.id); return <article key={place.id} className="place-card place-card-clickable" onClick={() => navigate(getPlacePath(place.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(getPlacePath(place.id)); } }} role="button" tabIndex={0}><img src={place.imageUrl || defaultPlaceImage} alt={place.name} className="place-image" /><div className="place-body"><div className="place-topline"><span className="chip">{place.type}</span><span className="chip soft">{place.area || "ללא אזור"}</span></div><h2>{place.name}</h2><p>{place.shortDescription || "ללא תיאור"}</p><div className="place-basic-meta"><span>{place.station || "תחנה לא הוזנה"}</span><span>{place.rating ? `⭐ ${place.rating.toFixed(1)}` : "חדש"}</span></div><div className="card-actions"><button type="button" onClick={(event) => { event.stopPropagation(); toggleSave(place.id); }}>{isSaved ? "הסרה משמורים" : "שמירת מקום"}</button><button className="secondary-button" type="button" onClick={(event) => { event.stopPropagation(); startEditingPlace(place); }}>עריכה</button></div></div></article>; })}</section></>}
        {!selectedPlaceId && activeView === "saved" && <section><div className="section-head"><h2>מקומות שמורים</h2><span>{savedPlaces.length} נשמרו</span></div><div className="saved-list">{savedPlaces.map((place) => { const distanceKm = haversineKm(hotel, place); const travel = estimateTransport(distanceKm); return <div key={place.id} className="saved-item"><div><strong>{place.name}</strong><p>{travel.mode} | {travel.minutes} דק' | {place.station || "תחנה תתווסף בהמשך"}</p></div><div className="inline-actions"><button className="secondary-button" type="button" onClick={() => navigate(getPlacePath(place.id))}>פתיחה</button><button type="button" onClick={() => toggleSave(place.id)}>הסר</button></div></div>; })}{!savedPlaces.length && <p>עדיין לא שמרת מקומות. אפשר לחזור למסך המקומות ולבחור.</p>}</div></section>}
        {!selectedPlaceId && activeView === "hotel" && <section><div className="section-head"><div><h2>המלון שלך</h2><span>מכאן מחושבים המרחקים וזמני ההגעה</span></div><button type="button" onClick={() => setIsEditingHotel((current) => !current)}>{isEditingHotel ? "סגירת עריכה" : "עריכת מלון"}</button></div><button className="secondary-button" type="button" onClick={applyDefaultHotel} style={{marginBottom: "1rem"}}>שימוש במלון שלנו: Park Plaza Victoria London</button><div className="hotel-status"><strong>{hotel.name}</strong><p>{hotel.address}</p><p>מיקום שמור: {hotel.lat.toFixed(4)}, {hotel.lng.toFixed(4)}</p>{hotelLookupState === "loading" && <p>מחפש את המיקום לפי הכתובת...</p>}{hotelLookupState === "done" && <p>המלון נשמר והמרחקים עודכנו.</p>}{hotelLookupState === "error" && <p>לא הצלחנו למצוא את הכתובת אוטומטית. אפשר לשמור קווי אורך ורוחב ידנית.</p>}</div>{isEditingHotel && <form className="form-layout" style={{marginTop: "1.5rem"}} onSubmit={handleHotelSubmit}><div className="form-stack"><label>שם המלון<input name="name" defaultValue={hotel.name} /></label><label>כתובת<input name="address" defaultValue={hotel.address} /></label><label>קו רוחב<input name="lat" defaultValue={hotel.lat} /></label><label>קו אורך<input name="lng" defaultValue={hotel.lng} /></label></div><div className="inline-actions"><button type="submit">שמירת מלון</button></div></form>}</section>}
        {!selectedPlaceId && activeView === "map" && <section className="map-panel"><div className="section-head"><h2>מפת המקומות</h2><span>מציגה את המלון ואת המקומות ששמרת</span></div><MapContainer center={[hotel.lat, hotel.lng]} zoom={12} scrollWheelZoom={false} className="map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Marker position={[hotel.lat, hotel.lng]} icon={hotelMarkerIcon}><Popup><strong>{hotel.name}</strong><div>{hotel.address}</div></Popup></Marker>{savedPlaces.map((place) => { const trip = estimateTransport(haversineKm(hotel, place)); return <Marker key={place.id} position={[place.lat, place.lng]} icon={markerIcon}><Popup><strong>{place.name}</strong><div>{place.address}</div><div>{trip.mode} | {trip.minutes} דק'</div></Popup></Marker>; })}</MapContainer><div className="map-legend"><div className="legend-row"><span className="legend-chip hotel">Hotel</span><span className="legend-chip place">Places</span></div>{savedPlaces.map((place) => <div key={place.id} className="saved-item compact"><div><strong>{place.name}</strong><p>{place.station || "ללא תחנה שמורה"}</p></div></div>)}</div></section>}
        {!selectedPlaceId && activeView === "planner" && <section className="planner-stack"><div className="section-head"><div><h2>תכנון יומי</h2><span>אפשר לבנות ימים ולבדוק אם סדר המקומות נוח</span></div><button type="button" onClick={addPlanDay}>הוספת יום</button></div>{dayPlans.map((day) => { const comfort = plannerComfort(day.placeIds, places); return <article key={day.id} className="panel"><div className="day-head"><div><h3>{day.title}</h3><span className={`comfort ${comfort.tone}`}>{comfort.label}</span></div><select defaultValue="" onChange={(event) => addPlaceToDay(day.id, event.target.value)}><option value="" disabled>הוספת מקום ליום</option>{places.map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></div><div className="day-places">{day.placeIds.map((placeId, index) => { const place = places.find((item) => item.id === placeId); if (!place) return null; return <div key={place.id} className="day-place"><div><strong>{index + 1}. {place.name}</strong><p>{place.area || "ללא אזור"} | {place.station || "ללא תחנה"}</p></div><div className="day-actions"><button type="button" onClick={() => movePlace(day.id, index, -1)}>למעלה</button><button type="button" onClick={() => movePlace(day.id, index, 1)}>למטה</button><button type="button" onClick={() => removePlaceFromDay(day.id, place.id)}>הסר</button></div></div>; })}{!day.placeIds.length && <p>עדיין אין מקומות ביום הזה. אפשר להתחיל להוסיף.</p>}</div></article>; })}</section>}
      </main>
    </div>
  );
}

export default App;
