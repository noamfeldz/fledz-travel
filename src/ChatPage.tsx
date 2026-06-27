import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { deriveLocationBias, importPlacesLibrary } from "./googleMapsLoader";

const API = "/api";
async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export type ChatSession = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
  message_count: number;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  meta?: { planData?: Record<string, unknown>; planPreview?: boolean; intentAction?: IntentAction; intentCandidates?: IntentLookupCandidate[] } | null;
  created_at: string;
};

type TripContext = {
  places: unknown[];
  hotels: unknown[];
  dayPlans: unknown[];
  tripConfig: unknown;
  flights: unknown[];
  visitedIds: string[];
};

export type ScheduleItem = {
  time: string;
  kind: "place" | "flight" | "transit" | "break";
  placeId?: string;
  label: string;
  note?: string;
};

export type AiPlanResult = {
  plan: Record<string, string[]>;
  schedule?: Record<string, ScheduleItem[]>;
  excluded: Array<{ placeId: string; reason: string }>;
  issues?: string[];
  recommendations: string[];
  summary: string;
};

type TripPlaceSummary = {
  id: string;
  name: string;
  address?: string;
};

type IntentLookupCandidate = {
  id: string;
  name: string;
  address: string;
  area?: string;
  rating?: number;
  openingHours?: string[];
  imageUrl?: string;
  googleMapsUrl?: string;
  websiteUrl?: string;
  draft: Record<string, unknown>;
};

type IntentLookupState =
  | { status: "loading"; message: string }
  | { status: "existing"; message: string; place: TripPlaceSummary }
  | { status: "candidates"; message: string; candidates: IntentLookupCandidate[] }
  | { status: "error"; message: string };

type IntentType = "info" | "replan" | "add_place" | "set_time" | "mark_visited" | "edit_place" | "reschedule" | "add_transit";
type IntentStepId =
  | "check_place_exists"
  | "search_google_places"
  | "add_place_if_missing"
  | "save_place"
  | "move_place_to_day"
  | "pin_place_time"
  | "open_flight_editor"
  | "recompute_plan"
  | "mark_place_visited"
  | "update_place_field"
  | "save_transit";

export type IntentAction = {
  intent: IntentType;
  params?: Record<string, unknown>;
  steps?: IntentStepId[];
};

const ACTIONABLE_INTENTS: IntentType[] = ["replan", "add_place", "set_time", "mark_visited", "edit_place", "reschedule", "add_transit"];
const ALLOWED_STEP_IDS: IntentStepId[] = [
  "check_place_exists",
  "search_google_places",
  "add_place_if_missing",
  "save_place",
  "move_place_to_day",
  "pin_place_time",
  "open_flight_editor",
  "recompute_plan",
  "mark_place_visited",
  "update_place_field",
  "save_transit",
];

const DEFAULT_INTENT_STEPS: Record<Exclude<IntentType, "info">, IntentStepId[]> = {
  replan: ["recompute_plan"],
  add_place: ["search_google_places", "save_place"],
  set_time: ["check_place_exists", "add_place_if_missing", "move_place_to_day", "pin_place_time"],
  mark_visited: ["mark_place_visited"],
  edit_place: ["update_place_field"],
  reschedule: ["open_flight_editor", "recompute_plan"],
  add_transit: ["save_transit"],
};

const STEP_LABELS: Record<IntentStepId, string> = {
  check_place_exists: "בודק אם המקום כבר קיים ברשימה",
  search_google_places: "מחפש את המקום דרך Google Places",
  add_place_if_missing: "אם חסר, פותח הוספת מקום ושומר אותו",
  save_place: "שומר את המקום עם הפרטים שנמשכו",
  move_place_to_day: "משבץ או מעביר את המקום ליום המתאים",
  pin_place_time: "מעדכן עיגון ליום ולשעה שנבחרו",
  open_flight_editor: "פותח את מסך עדכון הטיסה או האילוץ",
  recompute_plan: "מחשב מחדש תוכנית בהתאם לשינוי",
  mark_place_visited: "מסמן את המקום כביקור",
  update_place_field: "מעדכן את שדות המקום הרלוונטיים",
  save_transit: "שומר את הנסיעה ביומן (כולל חזור אם רלוונטי)",
};

function normalizePlaceLookup(value: string) {
  return value
    .toLowerCase()
    .replace(/['’`"]/g, "")
    .replace(/[.,/#!$%^&*;:{}=\-_~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAreaFromAddressComponents(components: Array<{ long_name: string; types: string[] }> | undefined) {
  if (!components) return "";
  const priorityTypes = ["locality", "sublocality", "sublocality_level_1", "neighborhood", "administrative_area_level_2", "administrative_area_level_1"];
  for (const type of priorityTypes) {
    const match = components.find((component) => component.types.includes(type));
    if (match) return match.long_name;
  }
  return "";
}

function isIntentType(value: unknown): value is IntentType {
  return typeof value === "string" && ["info", ...ACTIONABLE_INTENTS].includes(value);
}

function normalizeIntentSteps(intent: IntentType, steps: unknown): IntentStepId[] | undefined {
  const candidates = Array.isArray(steps)
    ? steps
    : typeof steps === "string"
    ? [steps]
    : [];
  const normalized = candidates
    .map((step) => typeof step === "string" ? step.trim() : "")
    .filter((step): step is IntentStepId => ALLOWED_STEP_IDS.includes(step as IntentStepId));
  if (normalized.length) return Array.from(new Set(normalized));
  return intent === "info" ? undefined : DEFAULT_INTENT_STEPS[intent];
}

function buildIntentAction(intent: unknown, params: unknown, steps?: unknown): IntentAction | undefined {
  if (!isIntentType(intent) || intent === "info") return undefined;
  return {
    intent,
    params: params && typeof params === "object" ? params as Record<string, unknown> : {},
    steps: normalizeIntentSteps(intent, steps),
  };
}

function normalizeMessageMeta(meta: unknown): ChatMessage["meta"] {
  if (!meta || typeof meta !== "object") return null;
  const rawMeta = meta as Record<string, unknown>;
  const nestedIntentAction =
    rawMeta.intentAction && typeof rawMeta.intentAction === "object"
      ? rawMeta.intentAction as Record<string, unknown>
      : null;
  const intentAction = buildIntentAction(
    nestedIntentAction?.intent ?? rawMeta.intent,
    nestedIntentAction?.params ?? rawMeta.params,
    nestedIntentAction?.steps ?? rawMeta.steps,
  );

  return {
    planData: rawMeta.planData && typeof rawMeta.planData === "object" ? rawMeta.planData as Record<string, unknown> : undefined,
    planPreview: rawMeta.planPreview === true,
    intentAction,
    intentCandidates: Array.isArray(rawMeta.intentCandidates) ? rawMeta.intentCandidates as IntentLookupCandidate[] : undefined,
  };
}

function normalizeMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    meta: normalizeMessageMeta(message.meta),
  };
}

type Props = {
  tripContext: TripContext;
  onApplyPlan?: (plan: AiPlanResult) => void;
  onAction?: (intent: string, params: Record<string, unknown>) => void;
  onSetPriority?: (placeId: string, priority: number) => void;
  triggerPlan?: boolean;
};

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "עכשיו";
  if (diffMins < 60) return `לפני ${diffMins} דק'`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  const diffDays = Math.floor(diffHours / 24);
  return `לפני ${diffDays} ימים`;
}

function extractDisplayContent(content: string) {
  const trimmed = content.trim();
  const candidates = [
    trimmed,
    trimmed.startsWith('"reply"') ? `{${trimmed}}` : null,
  ].filter(Boolean) as string[];

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      let parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === "object" && "reply" in parsed) {
        const reply = (parsed as { reply?: unknown }).reply;
        if (typeof reply === "string") return reply;
      }
    } catch {
      continue;
    }
  }

  // JSON.parse failed (e.g. unescaped Hebrew gershayim inside the reply string)
  // — recover the reply text with a loose match instead of showing raw JSON.
  if (trimmed.includes('"reply"')) {
    const looseMatch =
      trimmed.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,\s*"(?:intent|params|steps)"/) ||
      trimmed.match(/"reply"\s*:\s*"([\s\S]*?)"\s*\}?\s*$/);
    if (looseMatch?.[1]) return looseMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
  }

  return content;
}

// Inline markdown: **bold** and [text](url) links. Internal links (starting with
// "/") navigate within the SPA via onNavigate instead of a full page reload.
function renderInline(text: string, onNavigate?: (path: string) => void): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      const label = match[1];
      const url = match[2];
      nodes.push(
        <a
          key={`a${k}`}
          href={url}
          className="chat-msg-link"
          onClick={(e) => {
            if (onNavigate && url.startsWith("/")) {
              e.preventDefault();
              onNavigate(url);
            }
          }}
        >
          {label}
        </a>
      );
    } else if (match[3] !== undefined) {
      nodes.push(<strong key={`b${k}`}>{match[3]}</strong>);
    }
    last = regex.lastIndex;
    k++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function renderMessageContent(content: string, meta?: ChatMessage["meta"], onNavigate?: (path: string) => void) {
  const displayContent = extractDisplayContent(content);
  // Simple markdown-ish rendering: bold, links, newlines, bullet lists
  const lines = displayContent.split("\n");
  return (
    <div className="chat-msg-text">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i}>{renderInline(line.slice(3), onNavigate)}</h3>;
        if (line.startsWith("### ")) return <h4 key={i}>{renderInline(line.slice(4), onNavigate)}</h4>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return <li key={i}>{renderInline(line.slice(2), onNavigate)}</li>;
        if (line.startsWith("**") && line.endsWith("**") && !line.includes("]("))
          return <strong key={i}>{line.slice(2, -2)}</strong>;
        if (line === "") return <br key={i} />;
        return <p key={i}>{renderInline(line, onNavigate)}</p>;
      })}
    </div>
  );
}

// ── Plan-preview model ────────────────────────────────────────────────────────
// The "what the AI knows" preview is built once into a structured model, used
// both to persist a markdown snapshot (history/fallback) and to render a LIVE,
// interactive panel (clickable priority stars).
type PreviewLink = { label: string; path: string };
type PreviewPlace = { id: string; name: string; priority: number; pinned: boolean; when: string; visited: boolean; path: string };
type PreviewGroup = { type: string; places: PreviewPlace[] };
type PreviewModel = {
  setupLine: string;
  settingsPath: string;
  flights: PreviewLink[];
  hotels: PreviewLink[];
  transits: PreviewLink[];
  groups: PreviewGroup[];
  counts: { flights: number; hotels: number; transits: number; places: number };
};

function buildPreviewModel(tripContext: TripContext, slug: string): PreviewModel {
  const flights = (tripContext.flights as Array<Record<string, unknown>>) || [];
  const places = (tripContext.places as Array<Record<string, unknown>>) || [];
  const dayPlans = (tripContext.dayPlans as Array<Record<string, unknown>>) || [];
  const hotels = (tripContext.hotels as Array<Record<string, unknown>>) || [];
  const transits = ((tripContext as { transits?: unknown[] }).transits as Array<Record<string, unknown>>) || [];
  const visitedIds = new Set((tripContext.visitedIds as string[]) || []);
  const cfg = (tripContext.tripConfig as Record<string, unknown>) || {};

  const settingsPath = `/${slug}/settings`;
  const hotelPath = `/${slug}/hotel`;
  const plannerPath = `/${slug}/planner`;
  const placePath = (id: string) => `/${slug}/places/${encodeURIComponent(id)}`;

  const pinnedInfo = new Map<string, { dayTitle: string; time?: string }>();
  for (const day of dayPlans) {
    const pinned = (day.pinnedPlaceIds as string[]) || [];
    const times = (day.pinnedTimes as Record<string, string>) || {};
    for (const placeId of pinned) pinnedInfo.set(placeId, { dayTitle: String(day.title || ''), time: times[placeId] });
  }

  const flightLinks: PreviewLink[] = flights.map((f) => {
    const type = f.type === 'arrival' ? '🛬 נחיתה' : '🛫 המראה';
    const date = String(f.flightDate || '');
    const time = f.flightTime ? ` בשעה ${f.flightTime}` : '';
    const airport = f.airport ? ` — ${f.airport}` : '';
    return { label: `${type}: ${date}${time}${airport}`, path: settingsPath };
  });
  const hotelLinks: PreviewLink[] = hotels.map((h) => {
    const name = String(h.name || 'מלון');
    const ci = h.checkInDate ? `כניסה ${h.checkInDate}${h.checkInTime ? ` ${h.checkInTime}` : ''}` : '';
    const co = h.checkOutDate ? `יציאה ${h.checkOutDate}${h.checkOutTime ? ` ${h.checkOutTime}` : ''}` : '';
    const dates = [ci, co].filter(Boolean).join(' · ');
    return { label: `🏨 ${name}${dates ? ` — ${dates}` : ''}`, path: hotelPath };
  });
  const transitLinks: PreviewLink[] = transits.map((t) => {
    const day = dayPlans.find((d) => d.id === t.dayId);
    const when = t.departTime ? ` ${t.departTime}` : '';
    return { label: `🚆 ${t.fromLabel || '?'} → ${t.toLabel || '?'}${when}${day?.title ? ` (${day.title})` : ''}`, path: plannerPath };
  });

  const typeOrder = ['אטרקציה', 'מוזיאון', 'פארק', 'אוכל', 'ילדים', 'אירוע'];
  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const p of places) {
    const t = String(p.type || 'אחר');
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(p);
  }
  const orderedTypes = [
    ...typeOrder.filter((t) => byType.has(t)),
    ...[...byType.keys()].filter((t) => !typeOrder.includes(t)),
  ];
  const groups: PreviewGroup[] = orderedTypes.map((t) => {
    const group = [...byType.get(t)!];
    group.sort((a, b) => {
      const aPinned = pinnedInfo.has(String(a.id)) ? 1 : 0;
      const bPinned = pinnedInfo.has(String(b.id)) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return ((b.priority as number) ?? 3) - ((a.priority as number) ?? 3);
    });
    return {
      type: t,
      places: group.map((p) => {
        const pin = pinnedInfo.get(String(p.id));
        return {
          id: String(p.id),
          name: String(p.name),
          priority: (p.priority as number) ?? 3,
          pinned: !!pin,
          when: pin ? `${pin.dayTitle}${pin.time ? ` ${pin.time}` : ''}` : '',
          visited: visitedIds.has(String(p.id)),
          path: placePath(String(p.id)),
        };
      }),
    };
  });

  const setupLine = [
    cfg.destination ? `יעד: ${cfg.destination}` : '',
    cfg.startDate ? `מ-${cfg.startDate}` : '',
    cfg.numDays ? `${cfg.numDays} ימים` : '',
    `שעות ${cfg.dayStartHour ?? 9}:00–${cfg.dayEndHour ?? 21}:00`,
    `צהריים ${cfg.lunchBreakStart ?? 13}:00–${cfg.lunchBreakEnd ?? 15}:00`,
  ].filter(Boolean).join(' · ');

  return {
    setupLine, settingsPath,
    flights: flightLinks, hotels: hotelLinks, transits: transitLinks, groups,
    counts: { flights: flights.length, hotels: hotels.length, transits: transits.length, places: places.length },
  };
}

// Markdown snapshot persisted to chat history (display uses the live panel below).
function previewModelToMarkdown(model: PreviewModel): string {
  const stars = (n: number) => '⭐'.repeat(Math.max(1, Math.min(5, n)));
  const locationLines: string[] = [];
  for (const g of model.groups) {
    locationLines.push(`**${g.type} (${g.places.length})**`);
    for (const p of g.places) {
      const visitedTag = p.visited ? ' · ✓ ביקרנו' : '';
      const link = `[${p.name}](${p.path})`;
      if (p.pinned) locationLines.push(`📌 ${link} — ${p.when}${visitedTag}`);
      else locationLines.push(`${stars(p.priority)} ${link}${visitedTag}`);
    }
    locationLines.push('');
  }
  if (locationLines[locationLines.length - 1] === '') locationLines.pop();
  return [
    '## 📋 מה ה-AI יודע לפני שמתחיל לתכנן',
    '',
    '### 📅 הגדרות הטיול',
    `[${model.setupLine || 'לא הוגדרו'}](${model.settingsPath})`,
    '',
    `### ✈️ טיסות (${model.counts.flights})`,
    ...(model.flights.length ? model.flights.map((f) => `[${f.label}](${f.path})`) : ['לא הוזנו טיסות']),
    '',
    `### 🏨 מלונות (${model.counts.hotels})`,
    ...(model.hotels.length ? model.hotels.map((h) => `[${h.label}](${h.path})`) : ['לא הוזנו מלונות']),
    '',
    `### 🚆 נסיעות מתוזמנות (${model.counts.transits})`,
    ...(model.transits.length ? model.transits.map((t) => `[${t.label}](${t.path})`) : ['אין נסיעות מתוזמנות']),
    '',
    `### 📍 כל המקומות (${model.counts.places})`,
    ...(locationLines.length ? locationLines : ['לא הוזנו מקומות']),
    '',
    '_עברו על הרשימה. שנו עדיפות בלחיצה על הכוכבים. עיגון/מקום חסר — תקנו בעמוד המקום. כשהכל מוכן — לחצו להתחיל תכנון._',
  ].join('\n');
}

// Clickable 5-star priority control.
function PriorityStars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span className="prio-stars" role="group" aria-label="עדיפות">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`prio-star${n <= value ? " filled" : ""}`}
          onClick={() => onChange?.(n)}
          aria-label={`עדיפות ${n}`}
          title={`קבע עדיפות ${n}`}
          disabled={!onChange}
        >
          ★
        </button>
      ))}
    </span>
  );
}

// Live interactive render of the plan preview (priority editable via stars).
function renderPlanPreviewPanel(
  model: PreviewModel,
  onNavigate: (path: string) => void,
  onSetPriority?: (placeId: string, priority: number) => void,
) {
  const link = (l: PreviewLink, key?: number) => (
    <a
      key={key}
      href={l.path}
      className="chat-msg-link"
      onClick={(e) => { e.preventDefault(); onNavigate(l.path); }}
    >
      {l.label}
    </a>
  );
  const section = (items: PreviewLink[], empty: string) =>
    items.length ? items.map((l, i) => <p key={i}>{link(l, i)}</p>) : <p>{empty}</p>;

  return (
    <div className="chat-msg-text plan-preview">
      <h3>📋 מה ה-AI יודע לפני שמתחיל לתכנן</h3>

      <h4>📅 הגדרות הטיול</h4>
      <p>{link({ label: model.setupLine || "לא הוגדרו", path: model.settingsPath })}</p>

      <h4>✈️ טיסות ({model.counts.flights})</h4>
      {section(model.flights, "לא הוזנו טיסות")}

      <h4>🏨 מלונות ({model.counts.hotels})</h4>
      {section(model.hotels, "לא הוזנו מלונות")}

      <h4>🚆 נסיעות מתוזמנות ({model.counts.transits})</h4>
      {section(model.transits, "אין נסיעות מתוזמנות")}

      <h4>📍 כל המקומות ({model.counts.places})</h4>
      {model.groups.map((g) => (
        <div key={g.type} className="prio-group">
          <strong className="prio-group-title">{g.type} ({g.places.length})</strong>
          {g.places.map((p) => (
            <div key={p.id} className="prio-row">
              {p.pinned ? (
                <span className="prio-pin" title="מעוגן — חייב לקרות">📌</span>
              ) : (
                <PriorityStars value={p.priority} onChange={onSetPriority ? (n) => onSetPriority(p.id, n) : undefined} />
              )}
              <a
                href={p.path}
                className="chat-msg-link"
                onClick={(e) => { e.preventDefault(); onNavigate(p.path); }}
              >
                {p.name}
              </a>
              {p.pinned && <span className="prio-when">— {p.when}</span>}
              {p.visited && <span className="prio-visited">· ✓ ביקרנו</span>}
            </div>
          ))}
        </div>
      ))}

      <p className="prio-hint"><em>עברו על הרשימה. שנו עדיפות בלחיצה על הכוכבים. עיגון/מקום חסר — תקנו בעמוד המקום. כשהכל מוכן — לחצו להתחיל תכנון.</em></p>
    </div>
  );
}

export default function ChatPage({ tripContext, onApplyPlan, onAction, onSetPriority, triggerPlan }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionId: paramSessionId, slug = "" } = useParams<{ sessionId?: string; slug?: string }>();
  const [searchParams] = useSearchParams();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(paramSessionId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingTitle, setEditingTitle] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [pendingInitialSend, setPendingInitialSend] = useState(false);
  const [intentLookups, setIntentLookups] = useState<Record<string, IntentLookupState>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const planTriggeredRef = useRef(false);
  const activeLookupRef = useRef<Set<string>>(new Set());

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      const data = await apiFetch("/chat/sessions");
      setSessions(data);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (!activeSessionId) {
      setMessages([]);
      return;
    }
    apiFetch(`/chat/sessions/${activeSessionId}/messages`)
      .then((data) => setMessages((data as ChatMessage[]).map(normalizeMessage)))
      .catch(() => setMessages([]));
  }, [activeSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const searchIntentCandidates = useCallback(async (messageId: string, intentAction: IntentAction) => {
    if (activeLookupRef.current.has(messageId)) return;
    const params = intentAction.params ?? {};
    const rawName = intentAction.intent === "set_time" ? params.placeName : params.name;
    const name = typeof rawName === "string" ? rawName.trim() : "";
    const query = typeof params.query === "string" && params.query.trim()
      ? params.query.trim()
      : [name, typeof params.area === "string" ? params.area.trim() : ""].filter(Boolean).join(", ");
    if (!name && !query) return;

    const places = (tripContext.places as Array<Record<string, unknown>>).map((place) => ({
      id: String(place.id ?? ""),
      name: String(place.name ?? ""),
      address: typeof place.address === "string" ? place.address : "",
    }));
    const normalizedTarget = normalizePlaceLookup(name || query);
    const existing = places.find((place) => {
      const normalizedPlace = normalizePlaceLookup(place.name);
      return normalizedPlace === normalizedTarget || normalizedPlace.includes(normalizedTarget) || normalizedTarget.includes(normalizedPlace);
    });
    if (existing) {
      setIntentLookups((prev) => ({
        ...prev,
        [messageId]: {
          status: "existing",
          message: `בדקתי, והמקום כבר קיים אצלך ברשימה: ${existing.name}.`,
          place: existing,
        },
      }));
      return;
    }

    activeLookupRef.current.add(messageId);
    setIntentLookups((prev) => ({
      ...prev,
      [messageId]: { status: "loading", message: `מחפש עכשיו את ${query || name} ב-Google Places...` },
    }));

    try {
      const placesLibrary = await importPlacesLibrary();
      const { Place, SearchByTextRankPreference } = placesLibrary as {
        Place: { searchByText: (request: Record<string, unknown>) => Promise<{ places: any[] }> };
        SearchByTextRankPreference?: { RELEVANCE?: string };
      };
      const { places: searchResults = [] } = await Place.searchByText({
        textQuery: query || name,
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
        locationBias: deriveLocationBias(
          tripContext.hotels as Array<{ lat?: number; lng?: number }>,
          tripContext.places as Array<{ lat?: number; lng?: number }>,
        ),
      });
      const candidates: IntentLookupCandidate[] = searchResults.map((place: any) => {
        const displayName = place.displayName?.toString?.() || place.displayName || name;
        const formattedAddress = place.formattedAddress || "";
        const latitude = place.location?.lat?.();
        const longitude = place.location?.lng?.();
        const area = extractAreaFromAddressComponents(place.addressComponents) || "";
        const photoUrl =
          place.photos?.[0]?.getURI?.({ maxWidth: 1200, maxHeight: 800 }) ||
          place.photos?.[0]?.getUrl?.({ maxWidth: 1200, maxHeight: 800 }) ||
          "";
        return {
          id: place.id || `${displayName}-${formattedAddress}`,
          name: displayName,
          address: formattedAddress,
          area: area || undefined,
          rating: typeof place.rating === "number" ? place.rating : undefined,
          openingHours: place.regularOpeningHours?.weekdayDescriptions?.length ? place.regularOpeningHours.weekdayDescriptions : undefined,
          imageUrl: photoUrl || undefined,
          googleMapsUrl: place.googleMapsURI || undefined,
          websiteUrl: place.websiteURI || undefined,
          draft: {
            name: displayName,
            shortDescription: typeof params.shortDescription === "string" ? params.shortDescription : "נמשך מ-Google Places",
            address: formattedAddress,
            openingHours: place.regularOpeningHours?.weekdayDescriptions?.join(" | ") || "",
            type: typeof params.type === "string" ? params.type : "אטרקציה",
            area,
            imageUrl: photoUrl,
            sourceUrl: place.googleMapsURI || "",
            websiteUrl: place.websiteURI || "",
            phoneNumber: place.nationalPhoneNumber || "",
            googleMapsUrl: place.googleMapsURI || "",
            googlePlaceId: place.id || "",
            businessStatus: place.businessStatus || "",
            lat: Number.isFinite(latitude) ? String(Number(latitude.toFixed(6))) : "",
            lng: Number.isFinite(longitude) ? String(Number(longitude.toFixed(6))) : "",
            visitDurationMinutes: params.visitDurationMins ?? params.visitDurationMinutes ?? "",
          },
        };
      });
      setIntentLookups((prev) => ({
        ...prev,
        [messageId]: candidates.length
          ? { status: "candidates", message: `מצאתי ${candidates.length} התאמות אפשריות ב-Google Places.`, candidates }
          : { status: "error", message: "לא מצאתי התאמה ברורה ב-Google Places." },
      }));
      // Persist candidates to DB so refresh doesn't re-search
      if (candidates.length && !messageId.startsWith("tmp-")) {
        apiFetch(`/chat/messages/${messageId}/meta`, {
          method: "PATCH",
          body: JSON.stringify({ patch: { intentCandidates: candidates } }),
        }).catch(() => {/* non-critical */});
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setIntentLookups((prev) => ({
        ...prev,
        [messageId]: { status: "error", message: `חיפוש Google Places נכשל: ${detail}` },
      }));
    } finally {
      activeLookupRef.current.delete(messageId);
    }
  }, [tripContext.hotels, tripContext.places]);

  useEffect(() => {
    messages.forEach((message) => {
      const intentAction = message.meta?.intentAction;
      if (!intentAction || (intentAction.intent !== "add_place" && intentAction.intent !== "set_time")) return;
      if (intentLookups[message.id]) return;
      // If candidates were already saved in meta (from a previous search), use them directly
      if (message.meta?.intentCandidates?.length) {
        setIntentLookups((prev) => ({
          ...prev,
          [message.id]: {
            status: "candidates",
            message: `מצאתי ${message.meta!.intentCandidates!.length} התאמות אפשריות ב-Google Places.`,
            candidates: message.meta!.intentCandidates!,
          },
        }));
        return;
      }
      void searchIntentCandidates(message.id, intentAction);
    });
  }, [intentLookups, messages, searchIntentCandidates]);

  // Auto-trigger plan if requested
  useEffect(() => {
    const shouldTriggerPlan = triggerPlan || searchParams.get("trigger") === "plan";
    if (!shouldTriggerPlan || planTriggeredRef.current) return;
    planTriggeredRef.current = true;
    handleTriggerPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, sessions]);

  const createSessionRecord = async (title = "שיחה חדשה"): Promise<ChatSession> => {
    return apiFetch("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  };

  // Creates a session in the DB and updates local state — does NOT navigate.
  // Use this when you need a session ID before an async operation completes.
  const createSessionSilent = async (title = "שיחה חדשה"): Promise<ChatSession> => {
    const session = await createSessionRecord(title);
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    return session;
  };

  // Creates a session and immediately navigates to its URL.
  const createSession = async (title = "שיחה חדשה") => {
    const session = await createSessionSilent(title);
    navigate(`/${slug}/chat/${session.id}`, { replace: true });
    return session;
  };

  const handleNewSession = async () => {
    await createSession();
    setShowSidebar(false);
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    navigate(`/${slug}/chat/${id}`, { replace: true });
    setShowSidebar(false);
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("למחוק את השיחה?")) return;
    await apiFetch(`/chat/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
      navigate(`/${slug}/chat`, { replace: true });
    }
  };

  const startEditTitle = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitle(session.id);
    setEditTitleValue(session.title);
  };

  const saveTitle = async (id: string) => {
    if (!editTitleValue.trim()) return;
    await apiFetch(`/chat/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: editTitleValue }),
    });
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: editTitleValue } : s))
    );
    setEditingTitle(null);
  };

  const sendMessage = async (messageText?: string) => {
    const msg = (messageText ?? input).trim();
    if (!msg || loading) return;
    setInput("");
    if (!messages.length) setPendingInitialSend(true);

    // If no session yet, create one silently so the component doesn't remount
    // mid-send (navigate happens after the response is persisted).
    let sessionId = activeSessionId;
    let isNewSession = false;
    if (!sessionId) {
      const session = await createSessionRecord();
      sessionId = session.id;
      isNewSession = true;
    }

    const optimisticUserMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);
    setPendingInitialSend(false);
    setLoading(true);

    try {
      // Build history from current messages (excluding the optimistic one)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const result = await apiFetch("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: msg,
          history,
          sessionId,
          ...tripContext,
        }),
      }) as { reply: string; intent?: string; params?: Record<string, unknown>; steps?: string[]; assistantMessageId?: string | null };

      const intentAction = buildIntentAction(result.intent, result.params, result.steps);

      const assistantMsg: ChatMessage = {
        id: result.assistantMessageId || `tmp-${Date.now()}-a`,
        session_id: sessionId,
        role: "assistant",
        content: result.reply,
        meta: intentAction ? { intentAction } : undefined,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update sessions list (title may have been auto-updated)
      await loadSessions();

      // Navigate to the session URL after messages are persisted in DB,
      // so if the component remounts it can load them correctly.
      if (isNewSession) {
        setActiveSessionId(sessionId);
        navigate(`/${slug}/chat/${sessionId}`, { replace: true });
      }
    } catch (e) {
      const errMsg: ChatMessage = {
        id: `tmp-${Date.now()}-err`,
        session_id: sessionId,
        role: "assistant",
        content: `שגיאה: ${e instanceof Error ? e.message : String(e)}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setPendingInitialSend(false);
      setLoading(false);
    }
  };

  const handleShowPlanPreview = async () => {
    if (planLoading) return;

    // Single structured model → persisted markdown snapshot; the on-screen render
    // (priority editable via stars) is rebuilt live from tripContext below.
    const content = previewModelToMarkdown(buildPreviewModel(tripContext, slug));

    let sessionId = activeSessionId;
    let isNewSession = false;
    if (!sessionId) {
      const session = await createSessionSilent('תכנון AI');
      sessionId = session.id;
      isNewSession = true;
    }

    // Persist first, then load from the DB — appending optimistic messages here
    // races with the messages-load effect that fires on session change and
    // wipes them (the preview used to vanish when starting from a new session).
    const userContent = '🤖 הצג לי את האילוצים לפני תכנון';
    try {
      await apiFetch(`/chat/sessions/${sessionId}/message-pair`, {
        method: 'POST',
        body: JSON.stringify({ userMessage: userContent, assistantText: content, meta: { planPreview: true } }),
      });
      const data = await apiFetch(`/chat/sessions/${sessionId}/messages`);
      setMessages((data as ChatMessage[]).map(normalizeMessage));
    } catch {
      // Fallback: show in-memory only
      setMessages((prev) => [
        ...prev,
        { id: `tmp-preview-u-${Date.now()}`, session_id: sessionId!, role: 'user', content: userContent, created_at: new Date().toISOString() },
        { id: `tmp-preview-a-${Date.now()}`, session_id: sessionId!, role: 'assistant', content, meta: { planPreview: true }, created_at: new Date().toISOString() },
      ]);
    }

    if (isNewSession) {
      navigate(`/${slug}/chat/${sessionId}`, { replace: true });
    }
  };

  const handleTriggerPlan = async () => {
    if (planLoading) return;
    setPlanLoading(true);

    let sessionId = activeSessionId;
    let isNewSession = false;
    if (!sessionId) {
      const session = await createSessionSilent("תכנון AI אוטומטי");
      sessionId = session.id;
      isNewSession = true;
    }

    const triggerUserMsg: ChatMessage = {
      id: `tmp-plan-u-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content: "🤖 בנה לי תוכנית שבועית מיטבית לטיול",
      created_at: new Date().toISOString(),
    };
    const loadingAsstMsg: ChatMessage = {
      id: `tmp-plan-loading`,
      session_id: sessionId,
      role: "assistant",
      content: "מחשב תוכנית אופטימלית...",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, triggerUserMsg, loadingAsstMsg]);

    try {
      const planResult = await apiFetch(`/trips/${slug}/ai/plan`, {
        method: "POST",
        body: JSON.stringify(tripContext),
      }) as AiPlanResult;

      const totalPlaces = Object.values(planResult.plan).reduce((s, ids) => s + ids.length, 0);
      const dayPlansCtx = (tripContext.dayPlans as Array<Record<string, unknown>>) || [];
      const dayTitle = (dayId: string) =>
        String(dayPlansCtx.find((d) => d.id === dayId)?.title || dayId);
      const kindIcon: Record<string, string> = {
        flight: "✈️", transit: "🚆", break: "🍽️", place: "📍",
      };

      // Render the timed itinerary day-by-day. Per-item notes appear right under
      // the item; general issues are collected at the end.
      const scheduleLines: string[] = [];
      const schedule = planResult.schedule;
      if (schedule && Object.keys(schedule).length) {
        const orderedDayIds = [
          ...dayPlansCtx.map((d) => String(d.id)).filter((id) => schedule[id]),
          ...Object.keys(schedule).filter((id) => !dayPlansCtx.some((d) => d.id === id)),
        ];
        for (const dayId of orderedDayIds) {
          const items = schedule[dayId] || [];
          if (!items.length) continue;
          scheduleLines.push(`### 📅 ${dayTitle(dayId)}`);
          for (const item of items) {
            const icon = kindIcon[item.kind] || "•";
            scheduleLines.push(`**${item.time}** ${icon} ${item.label}`);
            if (item.note && item.note.trim()) {
              scheduleLines.push(`   ↳ ⚠️ ${item.note.trim()}`);
            }
          }
          scheduleLines.push("");
        }
      }

      const planText = [
        `✨ **תוכנית AI מוכנה!** שובצו ${totalPlaces} מקומות`,
        "",
        planResult.summary,
        "",
        ...scheduleLines,
        ...(planResult.issues?.length
          ? ["**⚠️ הערות ובעיות כלליות:**", ...planResult.issues.map((r) => `• ${r}`), ""]
          : []),
        ...(planResult.recommendations?.length
          ? ["**💡 המלצות:**", ...planResult.recommendations.map((r) => `• ${r}`), ""]
          : []),
        ...(planResult.excluded?.length
          ? [`**לא נכנסו לתוכנית:** ${planResult.excluded.length} מקומות (חסר זמן או ביקרנו)`, ""]
          : []),
        "_לחץ **החל תוכנית** כדי לשבץ את המקומות והשעות בלו\"ז_",
      ].join("\n");

      const assistantMsg: ChatMessage = {
        id: `tmp-plan-a-${Date.now()}`,
        session_id: sessionId,
        role: "assistant",
        content: planText,
        meta: { planData: planResult as unknown as Record<string, unknown> },
        created_at: new Date().toISOString(),
      };

      setMessages((prev) =>
        prev.filter((m) => m.id !== "tmp-plan-loading").concat(assistantMsg)
      );

      // Persist to DB
      await apiFetch(`/chat/sessions/${sessionId}/plan-message`, {
        method: "POST",
        body: JSON.stringify({
          userMessage: triggerUserMsg.content,
          assistantText: planText,
          planData: planResult,
        }),
      });

      await loadSessions();
      if (isNewSession) navigate(`/${slug}/chat/${sessionId}`, { replace: true });
    } catch (e) {
      const errMsg: ChatMessage = {
        id: `tmp-plan-err-${Date.now()}`,
        session_id: sessionId,
        role: "assistant",
        content: `שגיאה בתכנון: ${e instanceof Error ? e.message : String(e)}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) =>
        prev.filter((m) => m.id !== "tmp-plan-loading").concat(errMsg)
      );
      if (isNewSession) navigate(`/${slug}/chat/${sessionId}`, { replace: true });
    } finally {
      setPlanLoading(false);
    }
  };

  const renderIntentLookup = (messageId: string, intentAction: IntentAction) => {
    const lookup = intentLookups[messageId];
    const params = intentAction.params ?? {};
    if (!lookup) return null;
    if (lookup.status === "loading" || lookup.status === "error") {
      return <p className={`chat-intent-lookup ${lookup.status}`}>{lookup.message}</p>;
    }
    if (lookup.status === "existing") {
      return (
        <div className="chat-intent-results">
          <div className="chat-intent-result-card existing">
            <strong className="chat-intent-result-title">המקום כבר קיים ברשימה שלך</strong>
            <p className="chat-intent-result-address">{lookup.place.name}</p>
            {lookup.place.address && <p className="chat-intent-result-address">{lookup.place.address}</p>}
            <div className="chat-intent-result-actions">
              {intentAction.intent === "set_time" ? (
                <button type="button" className="chat-intent-btn chat-intent-btn-primary" onClick={() => onAction?.("set_time", { ...params, placeName: lookup.place.name })}>
                  עגן את המקום הזה
                </button>
              ) : (
                <button type="button" className="chat-intent-btn" onClick={() => navigate(`/${slug}/places/${encodeURIComponent(lookup.place.id)}`)}>
                  פתח מקום קיים
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="chat-intent-results">
        <p className="chat-intent-lookup success">{lookup.message}</p>
        {lookup.candidates.map((candidate) => (
          <article key={candidate.id} className="chat-intent-result-card">
            {candidate.imageUrl && <img src={candidate.imageUrl} alt={candidate.name} className="chat-intent-result-image" />}
            <div className="chat-intent-result-body">
              <strong className="chat-intent-result-title">{candidate.name}</strong>
              <p className="chat-intent-result-address">{candidate.address}</p>
              {candidate.area && <span className="chat-intent-result-tag">{candidate.area}</span>}
            </div>
            <div className="chat-intent-result-actions">
              <button
                type="button"
                className="chat-intent-btn chat-intent-btn-primary"
                onClick={() => onAction?.(intentAction.intent === "set_time" ? "set_time_confirm" : "add_place_confirm", { ...params, candidateDraft: candidate.draft })}
              >
                {intentAction.intent === "set_time" ? "זה המקום, הוסף ועגן" : "זה המקום, הוסף"}
              </button>
              {candidate.googleMapsUrl && (
                <a className="chat-intent-result-link" href={candidate.googleMapsUrl} target="_blank" rel="noreferrer">
                  🗺 פתח בגוגל מפות
                </a>
              )}
              {candidate.websiteUrl && (
                <a className="chat-intent-result-link" href={candidate.websiteUrl} target="_blank" rel="noreferrer">
                  🌐 פתח אתר
                </a>
              )}
            </div>
          </article>
        ))}
      </div>
    );
  };

  const shouldShowManualFallback = (messageId: string, intentAction: IntentAction) => {
    const lookup = intentLookups[messageId];
    if (!lookup) return false;
    return lookup.status === "error";
  };

  const renderIntentPanel = (messageId: string, intentAction: IntentAction) => {
    const params = intentAction.params ?? {};
    const steps = intentAction.steps ?? [];
    const buttonClassName = (tone: "primary" | "secondary" = "secondary") =>
      `chat-intent-btn${tone === "primary" ? " chat-intent-btn-primary" : ""}`;

    const renderButton = (
      label: string,
      onClick: () => void,
      tone: "primary" | "secondary" = "secondary",
      disabled = false,
    ) => (
      <button type="button" className={buttonClassName(tone)} onClick={onClick} disabled={disabled}>
        {label}
      </button>
    );
    const renderSteps = (forMessageId?: string) => {
      if (forMessageId) {
        const lkp = intentLookups[forMessageId];
        if (lkp && (lkp.status === "candidates" || lkp.status === "existing" || lkp.status === "error")) return null;
      }
      return steps.length ? (
        <div className="chat-intent-steps">
          <span className="chat-intent-steps-label">מה יקרה:</span>
          {steps.map((step) => (
            <div key={step} className="chat-intent-step">
              {STEP_LABELS[step]}
            </div>
          ))}
        </div>
      ) : null;
    };

    switch (intentAction.intent) {
      case "replan":
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">נדרש תכנון מחדש</strong>
            <p className="chat-intent-summary">
              {typeof params.reason === "string" && params.reason.trim()
                ? `זוהה שינוי חדש: ${params.reason}.`
                : "זוהה שינוי שמשפיע על הלו״ז."} שום שינוי עוד לא בוצע.
            </p>
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            <div className="chat-intent-actions">
              {renderButton(planLoading ? "⏳ מחשב..." : "🔄 תכנן מחדש", handleTriggerPlan, "primary", planLoading)}
            </div>
          </div>
        );
      case "reschedule":
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">צריך לעדכן שינוי בטיסה או בלו״ז</strong>
            <p className="chat-intent-summary">
              {typeof params.detail === "string" && params.detail.trim()
                ? `${params.detail}.`
                : "זוהה שינוי שמשפיע על הטיול."} העדכון עדיין לא בוצע.
            </p>
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            <div className="chat-intent-actions">
              {renderButton("✈️ פתח עדכון טיסה", () => onAction?.("reschedule", params))}
              {renderButton(planLoading ? "⏳ מחשב..." : "🔄 תכנן מחדש", handleTriggerPlan, "primary", planLoading)}
            </div>
          </div>
        );
      case "mark_visited":
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">אפשר לסמן מקום כביקור</strong>
            <p className="chat-intent-summary">
              {typeof params.placeName === "string" && params.placeName.trim()
                ? `המקום שזוהה: ${params.placeName}.`
                : "המודל זיהה שביקרתם במקום."} הסימון עדיין לא בוצע.
            </p>
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            <div className="chat-intent-actions">
              {renderButton("✅ סמן כביקור", () => onAction?.("mark_visited", params), "primary")}
            </div>
          </div>
        );
      case "add_place": {
        const lookup = intentLookups[messageId];
        const isLoading = !lookup || lookup.status === "loading";
        const hasResults = lookup?.status === "candidates";
        const placeName = typeof params.name === "string" && params.name.trim() ? params.name : null;
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">
              {isLoading
                ? `🔍 מחפש את "${placeName ?? "המקום"}" ב-Google Places...`
                : hasResults
                ? `נמצאו תוצאות — בחר את המקום הנכון`
                : `הוספת מקום`}
            </strong>
            {isLoading && (
              <p className="chat-intent-summary">מחפש ב-Google Places, רק אחרי שתאשר תתבצע ההוספה.</p>
            )}
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            {shouldShowManualFallback(messageId, intentAction) && (
              <div className="chat-intent-actions">
                {renderButton("➕ הוסף ידנית", () => onAction?.("add_place", params), "secondary")}
              </div>
            )}
          </div>
        );
      }
      case "set_time": {
        const lookup = intentLookups[messageId];
        const isLoading = !lookup || lookup.status === "loading";
        const hasResults = lookup?.status === "candidates";
        const placeName = typeof params.placeName === "string" && params.placeName.trim() ? params.placeName : null;
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">
              {isLoading
                ? `🔍 מחפש את "${placeName ?? "המקום"}"...`
                : hasResults
                ? `נמצאו תוצאות — בחר ועגן`
                : `עיגון מקום לזמן`}
            </strong>
            {isLoading && (
              <p className="chat-intent-summary">
                {placeName ? `${placeName}${typeof params.dayTitle === "string" ? `, ${params.dayTitle}` : ""}${typeof params.time === "string" ? ` בשעה ${params.time}` : ""}.` : ""}
                {" "}מחפש ב-Google Places, ורק אחרי אישור תתבצע ההוספה.
              </p>
            )}
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            {shouldShowManualFallback(messageId, intentAction) && (
              <div className="chat-intent-actions">
                {renderButton("📌 פתח טיפול ידני", () => onAction?.("set_time", params), "secondary")}
              </div>
            )}
          </div>
        );
      }
      case "add_transit": {
        const fromLabel = typeof params.fromLabel === "string" ? params.fromLabel : "";
        const toLabel = typeof params.toLabel === "string" ? params.toLabel : "";
        const departTime = typeof params.departTime === "string" ? params.departTime : "";
        const arriveTime = typeof params.arriveTime === "string" ? params.arriveTime : "";
        const mode = typeof params.mode === "string" ? params.mode : "";
        const cost = typeof params.cost === "string" ? params.cost : "";
        const isRoundTrip = params.roundTrip === true;
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">🚆 הוספת נסיעה ליומן</strong>
            <p className="chat-intent-summary">
              {fromLabel && toLabel ? `${fromLabel} ← ${toLabel}` : "נסיעה מתוזמנת"}
              {typeof params.dayTitle === "string" && params.dayTitle ? ` · ${params.dayTitle}` : ""}
              {departTime ? ` · יציאה ${departTime}` : ""}{arriveTime ? `, הגעה ${arriveTime}` : ""}
              {mode ? ` · ${mode}` : ""}{cost ? ` · ${cost}` : ""}
              {isRoundTrip ? " · כולל חזור" : ""}. הנסיעה עדיין לא נשמרה.
            </p>
            {renderSteps(messageId)}
            <div className="chat-intent-actions">
              {renderButton(isRoundTrip ? "🚆 הוסף הלוך ושוב ליומן" : "🚆 הוסף נסיעה ליומן", () => onAction?.("add_transit", params), "primary")}
            </div>
          </div>
        );
      }
      case "edit_place":
        return (
          <div className="chat-intent-panel">
            <span className="chat-intent-kicker">פעולה מוצעת</span>
            <strong className="chat-intent-title">אפשר לעדכן פרטי מקום</strong>
            <p className="chat-intent-summary">
              {typeof params.placeName === "string" && params.placeName.trim()
                ? `המקום: ${params.placeName}${typeof params.field === "string" ? `, שדה: ${params.field}` : ""}.`
                : "המודל זיהה בקשה לעריכת מקום."} העדכון עדיין לא בוצע.
            </p>
            {renderSteps(messageId)}
            {renderIntentLookup(messageId, intentAction)}
            <div className="chat-intent-actions">
              {renderButton("✏️ עדכן מקום", () => onAction?.("edit_place", params), "primary")}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const quickSuggestions = [
    "מה הכי מומלץ לבוקר הראשון?",
    "איך לחלק את הימים בצורה הכי חכמה?",
    "מה הזמן הטוב ביותר לבקר ב...",
    "🤖 בנה לי תוכנית שבועית מיטבית לטיול",
  ];

  return (
    <div className="chat-page">
      {/* Sidebar overlay on mobile */}
      {showSidebar && (
        <div
          className="chat-sidebar-overlay"
          onClick={() => setShowSidebar(false)}
          role="presentation"
        />
      )}

      {/* Sessions sidebar */}
      <aside className={`chat-sidebar${showSidebar ? " open" : ""}`}>
        <div className="chat-sidebar-header">
          <div className="chat-sidebar-header-copy">
            <span className="chat-sidebar-title">שיחות</span>
          </div>
          <button
            type="button"
            className="chat-new-btn"
            onClick={handleNewSession}
            title="שיחה חדשה"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            שיחה חדשה
          </button>
          <button
            type="button"
            className="chat-sidebar-close"
            onClick={() => setShowSidebar(false)}
            title="סגור"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="chat-sessions-list">
          {sessionsLoading && <p className="chat-sessions-empty">טוען...</p>}
          {!sessionsLoading && !sessions.length && (
            <p className="chat-sessions-empty">עדיין אין שיחות</p>
          )}
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`chat-session-item${activeSessionId === session.id ? " active" : ""}`}
              onClick={() => handleSelectSession(session.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") handleSelectSession(session.id); }}
            >
              {editingTitle === session.id ? (
                <input
                  className="chat-session-title-edit"
                  value={editTitleValue}
                  autoFocus
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={() => saveTitle(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle(session.id);
                    if (e.key === "Escape") setEditingTitle(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="chat-session-info">
                    <span className="chat-session-name">{session.title}</span>
                    {session.last_message && (
                      <span className="chat-session-preview">{session.last_message}</span>
                    )}
                    <span className="chat-session-time">{formatRelativeTime(session.updated_at)}</span>
                  </div>
                  <div className="chat-session-actions">
                    <button
                      type="button"
                      className="chat-session-action-btn"
                      title="שינוי שם"
                      onClick={(e) => startEditTitle(session, e)}
                    >✏️</button>
                    <button
                      type="button"
                      className="chat-session-action-btn danger"
                      title="מחיקה"
                      onClick={(e) => handleDeleteSession(session.id, e)}
                    >🗑</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="chat-main">
        {/* Chat header */}
        <header className="chat-header">
          <button
            type="button"
            className="chat-header-btn chat-header-btn-icon"
            onClick={() => setShowSidebar((v) => !v)}
            title="שיחות"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="chat-header-title">
            <span className="chat-header-label">
              {activeSession ? activeSession.title : "צ׳אט AI"}
            </span>
          </div>
          <button
            type="button"
            className="chat-header-btn plan-btn"
            onClick={handleShowPlanPreview}
            disabled={planLoading}
            title="בנה תוכנית AI"
          >
            {planLoading ? "⏳" : "🤖"}
          </button>
        </header>

        <div className="chat-main-stage">
          {/* Messages */}
          <div className="chat-messages-area">
            <div className="chat-messages-track">
          {!messages.length && !pendingInitialSend && (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">💬</div>
              <div className="chat-suggestions">
                {quickSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="chat-suggestion-chip"
                    onClick={() => sendMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-msg chat-msg-${msg.role}`}
            >
              <div className="chat-msg-avatar">
                {msg.role === "user" ? "👤" : "🤖"}
              </div>
              <div className="chat-msg-bubble">
                {msg.meta?.planPreview
                  ? renderPlanPreviewPanel(buildPreviewModel(tripContext, slug), (path) => navigate(path), onSetPriority)
                  : renderMessageContent(msg.content, msg.meta, (path) => navigate(path))}
                {msg.meta?.planData && onApplyPlan && (
                  <button
                    type="button"
                    className="chat-apply-plan-btn"
                    onClick={() => {
                      onApplyPlan(msg.meta!.planData as unknown as AiPlanResult);
                      navigate(location.pathname.replace(/\/chat.*$/, "/planner"));
                    }}
                  >
                    ✅ החל תוכנית ועבור לתכנון
                  </button>
                )}
                {msg.meta?.planPreview && (
                  <button
                    type="button"
                    className="chat-apply-plan-btn"
                    onClick={handleTriggerPlan}
                    disabled={planLoading}
                  >
                    {planLoading ? '⏳ מחשב תוכנית...' : '🚀 כן, התחל תכנון!'}
                  </button>
                )}
                {msg.meta?.intentAction && renderIntentPanel(msg.id, msg.meta.intentAction)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-msg-avatar">🤖</div>
              <div className="chat-msg-bubble">
                <div className="chat-typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {/* Input bar */}
        <div className="chat-input-bar">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="שאלו על מקומות, חלוקת ימים, נסיעות או בקשו תכנון מחדש"
              rows={1}
              disabled={loading}
            />
            <button
              type="button"
              className="chat-send-btn"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              title="שלח"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
