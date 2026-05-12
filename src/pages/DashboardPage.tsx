import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type Trip = {
  id: string;
  slug?: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  cover_image_url: string | null;
};

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", destination: "", start_date: "", end_date: "" });
  const [menuOpen, setMenuOpen] = useState(false);
  const [openTripMenu, setOpenTripMenu] = useState<string | null>(null);
  const tripMenuRef = useRef<HTMLDivElement | null>(null);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editForm, setEditForm] = useState({ name: "", destination: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/trips", { credentials: "include" })
      .then((r) => r.json())
      .then(setTrips)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!openTripMenu) return;
    const handleClick = () => setOpenTripMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openTripMenu]);

  function openEditTrip(trip: Trip) {
    setEditingTrip(trip);
    setEditForm({
      name: trip.name,
      destination: trip.destination || "",
      start_date: trip.start_date || "",
      end_date: trip.end_date || "",
    });
    setOpenTripMenu(null);
  }

  async function saveEditTrip() {
    if (!editingTrip || !editForm.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/trips/${editingTrip.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editForm),
      });
      const updated = await res.json();
      setTrips((prev) => prev.map((t) => (t.id === editingTrip.id ? { ...t, ...updated } : t)));
      setEditingTrip(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrip(id: string) {
    setDeleting(true);
    try {
      await fetch(`/api/trips/${id}`, { method: "DELETE", credentials: "include" });
      setTrips((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  }

  async function createTrip() {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const trip = await res.json();
      navigate(`/${trip.slug || trip.id}/places`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  function formatDates(start: string | null, end: string | null) {
    if (!start) return "";
    const fmt = (d: string) => new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
    return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
  }

  const upcomingTrips = trips.filter((trip) => trip.start_date).length;
  const destinations = new Set(trips.map((trip) => trip.destination).filter(Boolean)).size;

  return (
    <div className="dashboard-page" dir="rtl">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <span className="dashboard-logo">✈️ פלדז טיולים</span>
          <div className="dashboard-user" onClick={() => setMenuOpen((v) => !v)}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="dashboard-avatar" />
            ) : (
              <div className="dashboard-avatar-placeholder">{user?.name?.[0] ?? "?"}</div>
            )}
            <span className="dashboard-user-name">{user?.name}</span>
            {menuOpen && (
              <div className="dashboard-user-menu">
                <button onClick={logout}>התנתק</button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <motion.section
          className="dashboard-hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="dashboard-hero-copy">
            <span className="dashboard-eyebrow">Travel OS</span>
            <h1>מרכז הפיקוד של כל הטיולים שלכם</h1>
            <p className="dashboard-hero-text">
              יוצרים טיול חדש, חוזרים למסלולים קיימים, ומנהלים את כל היעדים, התאריכים והמעברים מאותו מקום.
            </p>
            <div className="dashboard-hero-actions">
              <button className="dashboard-new-btn" onClick={() => setShowCreate(true)}>
                טיול חדש
              </button>
              <span className="dashboard-hero-note">שיתוף, AI, מקומות, מפה וימים באותו workflow</span>
            </div>
          </div>

          <div className="dashboard-hero-stats" aria-label="סיכום טיולים">
            <div className="dashboard-hero-stat">
              <strong>{trips.length}</strong>
              <span>טיולים</span>
            </div>
            <div className="dashboard-hero-stat">
              <strong>{upcomingTrips}</strong>
              <span>עם תאריכים</span>
            </div>
            <div className="dashboard-hero-stat">
              <strong>{destinations}</strong>
              <span>יעדים שונים</span>
            </div>
          </div>
        </motion.section>

        <div className="dashboard-title-row">
          <div>
            <span className="dashboard-eyebrow">Journey Library</span>
            <h1>הטיולים שלי</h1>
          </div>
        </div>

        {loading ? (
          <div className="trip-cards-grid" aria-label="טוען טיולים">
            {[0, 1, 2].map((item) => (
              <div key={item} className="trip-card trip-card-skeleton">
                <div className="trip-card-image" />
                <div className="trip-card-body">
                  <span />
                  <span />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="trip-cards-grid">
            {trips.map((trip, index) => (
              <motion.article
                key={trip.id}
                className="trip-card"
                onClick={() => navigate(`/${trip.slug || trip.id}/places`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") navigate(`/${trip.slug || trip.id}/places`); }}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.04 }}
                whileHover={{ y: -8 }}
              >
                <div className="trip-card-image" style={trip.cover_image_url ? { backgroundImage: `url(${trip.cover_image_url})` } : {}}>
                  {!trip.cover_image_url && <span className="trip-card-image-placeholder" aria-hidden="true">F</span>}
                  <div className="trip-card-overlay" />
                  {(trip.start_date || trip.end_date) && (
                    <span className="trip-card-date-chip">{formatDates(trip.start_date, trip.end_date)}</span>
                  )}
                </div>
                <div className="trip-card-body">
                  <h3 className="trip-card-name">{trip.name}</h3>
                  {trip.destination && <p className="trip-card-dest">{trip.destination}</p>}
                  <p className="trip-card-caption">Places, planner, AI, share</p>
                </div>
                <div className="trip-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="trip-card-btn-primary" onClick={() => navigate(`/${trip.slug || trip.id}/places`)}>
                    כנס
                  </button>
                  <div className="trip-card-menu-wrap" ref={openTripMenu === trip.id ? tripMenuRef : null}>
                    <button
                      className="trip-card-menu-btn"
                      type="button"
                      aria-label="אפשרויות"
                      onClick={(e) => { e.stopPropagation(); setOpenTripMenu((prev) => (prev === trip.id ? null : trip.id)); }}
                    >
                      ⋯
                    </button>
                    {openTripMenu === trip.id && (
                      <div className="trip-context-menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => openEditTrip(trip)}>✏️ עריכה</button>
                        <button type="button" className="danger" onClick={() => { setConfirmDeleteId(trip.id); setOpenTripMenu(null); }}>🗑️ מחיקה</button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.article>
            ))}

            {trips.length === 0 && (
              <article className="trip-card trip-card-empty" onClick={() => setShowCreate(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setShowCreate(true); }}>
                <div className="trip-card-image">
                  <span className="trip-card-image-placeholder" aria-hidden="true">+</span>
                </div>
                <div className="trip-card-body">
                  <h3 className="trip-card-name">צור טיול חדש</h3>
                  <p className="trip-card-dest">שם, יעד ותאריכים מספיקים כדי להתחיל.</p>
                </div>
              </article>
            )}
          </div>
        )}
      </main>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-card" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h2>טיול חדש</h2>
            <label>
              שם הטיול *
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="לונדון 2026"
                autoFocus
              />
            </label>
            <label>
              יעד
              <input
                type="text"
                value={form.destination}
                onChange={(e) => setForm({ ...form, destination: e.target.value })}
                placeholder="לונדון, בריטניה"
              />
            </label>
            <div className="modal-row-2">
              <label>
                תאריך יציאה
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </label>
              <label>
                תאריך חזרה
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>ביטול</button>
              <button className="btn-primary" onClick={createTrip} disabled={creating || !form.name.trim()}>
                {creating ? "יוצר..." : "צור טיול"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTrip && (
        <div className="modal-overlay" onClick={() => setEditingTrip(null)}>
          <div className="modal-card" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h2>עריכת טיול</h2>
            <label>
              שם הטיול *
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                autoFocus
              />
            </label>
            <label>
              יעד
              <input
                type="text"
                value={editForm.destination}
                onChange={(e) => setEditForm({ ...editForm, destination: e.target.value })}
                placeholder="לונדון, בריטניה"
              />
            </label>
            <div className="modal-row-2">
              <label>
                תאריך יציאה
                <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
              </label>
              <label>
                תאריך חזרה
                <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingTrip(null)}>ביטול</button>
              <button className="btn-primary" onClick={saveEditTrip} disabled={saving || !editForm.name.trim()}>
                {saving ? "שומר..." : "שמור שינויים"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-card modal-card-narrow" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <h2>מחיקת טיול</h2>
            <p>האם למחוק את הטיול הזה? פעולה זו אינה הפיכה.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDeleteId(null)}>ביטול</button>
              <button className="btn-danger" onClick={() => deleteTrip(confirmDeleteId)} disabled={deleting}>
                {deleting ? "מוחק..." : "מחק טיול"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
