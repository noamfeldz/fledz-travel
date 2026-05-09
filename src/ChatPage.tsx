import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

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
  meta?: { planData?: Record<string, unknown> } | null;
  created_at: string;
};

type TripContext = {
  places: unknown[];
  hotel: unknown;
  dayPlans: unknown[];
  tripConfig: unknown;
  flights: unknown[];
  visitedIds: string[];
};

export type AiPlanResult = {
  plan: Record<string, string[]>;
  excluded: Array<{ placeId: string; reason: string }>;
  recommendations: string[];
  summary: string;
};

type Props = {
  tripContext: TripContext;
  onApplyPlan?: (plan: AiPlanResult) => void;
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

function renderMessageContent(content: string, meta?: ChatMessage["meta"]) {
  // Simple markdown-ish rendering: bold, newlines, bullet lists
  const lines = content.split("\n");
  return (
    <div className="chat-msg-text">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) return <h3 key={i}>{line.slice(3)}</h3>;
        if (line.startsWith("### ")) return <h4 key={i}>{line.slice(4)}</h4>;
        if (line.startsWith("- ") || line.startsWith("• "))
          return <li key={i}>{line.slice(2)}</li>;
        if (line.startsWith("**") && line.endsWith("**"))
          return <strong key={i}>{line.slice(2, -2)}</strong>;
        if (line === "") return <br key={i} />;
        // Inline bold
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i}>
            {parts.map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : (
                part
              )
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function ChatPage({ tripContext, onApplyPlan, triggerPlan }: Props) {
  const navigate = useNavigate();
  const { sessionId: paramSessionId } = useParams<{ sessionId?: string }>();
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const planTriggeredRef = useRef(false);

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
      .then((data) => setMessages(data))
      .catch(() => setMessages([]));
  }, [activeSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-trigger plan if requested
  useEffect(() => {
    const shouldTriggerPlan = triggerPlan || searchParams.get("trigger") === "plan";
    if (!shouldTriggerPlan || planTriggeredRef.current) return;
    planTriggeredRef.current = true;
    handleTriggerPlan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, sessions]);

  const createSession = async (title = "שיחה חדשה") => {
    const session: ChatSession = await apiFetch("/chat/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    navigate(`/chat/${session.id}`, { replace: true });
    return session;
  };

  const handleNewSession = async () => {
    await createSession();
    setShowSidebar(false);
  };

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id);
    navigate(`/chat/${id}`, { replace: true });
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
      navigate("/chat", { replace: true });
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

  const ensureActiveSession = async (): Promise<string> => {
    if (activeSessionId) return activeSessionId;
    const session = await createSession();
    return session.id;
  };

  const sendMessage = async (messageText?: string) => {
    const msg = (messageText ?? input).trim();
    if (!msg || loading) return;
    setInput("");

    const sessionId = await ensureActiveSession();

    const optimisticUserMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      session_id: sessionId,
      role: "user",
      content: msg,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);
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
      }) as { reply: string };

      const assistantMsg: ChatMessage = {
        id: `tmp-${Date.now()}-a`,
        session_id: sessionId,
        role: "assistant",
        content: result.reply,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update sessions list (title may have been auto-updated)
      await loadSessions();
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
      setLoading(false);
    }
  };

  const handleTriggerPlan = async () => {
    if (planLoading) return;
    setPlanLoading(true);

    const sessionId = await ensureActiveSession();

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
      const planResult = await apiFetch("/ai/plan", {
        method: "POST",
        body: JSON.stringify(tripContext),
      }) as AiPlanResult;

      const totalPlaces = Object.values(planResult.plan).reduce((s, ids) => s + ids.length, 0);
      const planText = [
        `✨ **תוכנית AI מוכנה!** שובצו ${totalPlaces} מקומות`,
        "",
        planResult.summary,
        "",
        ...(planResult.recommendations?.length
          ? ["**המלצות:**", ...planResult.recommendations.map((r) => `• ${r}`), ""]
          : []),
        ...(planResult.excluded?.length
          ? [`**לא נכנסו לתוכנית:** ${planResult.excluded.length} מקומות (חסר זמן או ביקרנו)`, ""]
          : []),
        "_לחץ **החל תוכנית** כדי לשבץ את המקומות בלו\"ז_",
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
    } finally {
      setPlanLoading(false);
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
          <span className="chat-sidebar-title">שיחות</span>
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
            className="chat-header-btn"
            onClick={() => setShowSidebar((v) => !v)}
            title="שיחות"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="chat-header-title">
            <span className="chat-header-label">
              {activeSession ? activeSession.title : "💬 צ'אט AI"}
            </span>
          </div>
          <div className="chat-header-actions">
            <button
              type="button"
              className="chat-header-btn plan-btn"
              onClick={handleTriggerPlan}
              disabled={planLoading}
              title="בנה תוכנית AI"
            >
              {planLoading ? "⏳" : "🤖"} תכנון AI
            </button>
            <button
              type="button"
              className="chat-header-btn"
              onClick={() => navigate("/planner")}
              title="חזרה לתכנון"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="chat-messages-area">
          {!activeSessionId && !messages.length && (
            <div className="chat-empty-state">
              <div className="chat-empty-icon">💬</div>
              <h2>שאל/י כל שאלה על הטיול</h2>
              <p>ה-AI מכיר את כל המקומות, הימים, הטיסות וההגדרות שלך.</p>
              <div className="chat-suggestions">
                {[
                  "מה הכי מומלץ לבוקר הראשון?",
                  "איך לחלק את הימים בצורה הכי חכמה?",
                  "מה הזמן הטוב ביותר לבקר ב...",
                  "🤖 בנה לי תוכנית שבועית מיטבית לטיול",
                ].map((suggestion) => (
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
                {renderMessageContent(msg.content, msg.meta)}
                {msg.meta?.planData && onApplyPlan && (
                  <button
                    type="button"
                    className="chat-apply-plan-btn"
                    onClick={() => {
                      onApplyPlan(msg.meta!.planData as unknown as AiPlanResult);
                      navigate("/planner");
                    }}
                  >
                    ✅ החל תוכנית ועבור לתכנון
                  </button>
                )}
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

        {/* Input bar */}
        <div className="chat-input-bar">
          <div className="chat-input-wrap">
            <textarea
              ref={textareaRef}
              className="chat-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="שאל/י שאלה על הטיול... (Enter לשליחה, Shift+Enter לשורה חדשה)"
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
          <p className="chat-input-hint">Shift+Enter לשורה חדשה • שיחות נשמרות אוטומטית</p>
        </div>
      </div>
    </div>
  );
}
