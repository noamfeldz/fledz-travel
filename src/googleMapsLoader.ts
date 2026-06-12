// Single shared loader for the Google Maps JS API.
// All callers (App, ChatPage) must go through this module — loading the API
// from more than one place causes races where google.maps exists without
// importLibrary, or the bootstrap callback is deleted before it fires.
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let bootstrapped = false;

export function ensureGoogleMapsReady(): Promise<void> {
  if (!GOOGLE_MAPS_API_KEY) return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY לא מוגדר"));
  const w = window as unknown as { google?: { maps?: { importLibrary?: unknown } } };
  if (!bootstrapped && !w.google?.maps?.importLibrary) {
    // Official Google Maps inline bootstrap: defines google.maps.importLibrary
    // synchronously; the API script itself is fetched on first importLibrary call.
    /* eslint-disable */
    ((g: Record<string, string>) => {
      let h: Promise<unknown> | undefined; let a: HTMLScriptElement; let k: string;
      const p = "The Google Maps JavaScript API"; const c = "google"; const l = "importLibrary"; const q = "__ib__";
      const m = document; let b: any = window;
      b = b[c] || (b[c] = {});
      const d = b.maps || (b.maps = {}); const r = new Set<string>(); const e = new URLSearchParams();
      const u = () => h || (h = new Promise(async (f, n) => {
        a = m.createElement("script");
        e.set("libraries", [...r] + "");
        for (k in g) e.set(k.replace(/[A-Z]/g, (t) => "_" + t[0].toLowerCase()), g[k]);
        e.set("callback", c + ".maps." + q);
        a.src = `https://maps.googleapis.com/maps/api/js?` + e;
        d[q] = f;
        a.onerror = () => { h = undefined; n(Error(p + " could not load.")); };
        a.nonce = (m.querySelector("script[nonce]") as HTMLScriptElement | null)?.nonce || "";
        m.head.append(a);
      }));
      d[l]
        ? console.warn(p + " only loaded once. Please remove all but one of the calls to bootstrap the API.")
        : (d[l] = (f: string, ...n: unknown[]) => r.add(f) && u().then(() => d[l](f, ...n)));
    })({ key: GOOGLE_MAPS_API_KEY, v: "weekly", language: "he" });
    /* eslint-enable */
    bootstrapped = true;
  }
  return Promise.resolve();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function importPlacesLibrary(): Promise<any> {
  await ensureGoogleMapsReady();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).google.maps.importLibrary("places");
}

export type TripCoordinate = { lat?: number | string | null; lng?: number | string | null };

// Derive a Places search bias from trip data (hotel first, then any place),
// so lookups follow the trip's destination instead of a hardcoded city.
export function deriveLocationBias(
  hotels: TripCoordinate[],
  places: TripCoordinate[],
  fallback = { lat: 51.5074, lng: -0.1278 },
): { center: { lat: number; lng: number }; radius: number } {
  const toNumber = (value: unknown) => {
    const numeric = typeof value === "string" ? Number(value) : (value as number);
    return Number.isFinite(numeric) ? numeric : null;
  };
  for (const source of [...(hotels || []), ...(places || [])]) {
    const lat = toNumber(source?.lat);
    const lng = toNumber(source?.lng);
    if (lat != null && lng != null) return { center: { lat, lng }, radius: 50000 };
  }
  return { center: fallback, radius: 50000 };
}
