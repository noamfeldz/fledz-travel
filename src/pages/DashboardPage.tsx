import { useEffect, useRef, useState } from "react";
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
  // Trip context menu
  const [openTripMenu, setOpenTripMenu] = useState<string | null>(null);
  const tripMenuRef = useRef<HTMLDivElement | null>(null);
  // Edit trip
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [editForm, setEditForm] = useState({ name: "", destination: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);
  // Delete trip
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/trips", { credentials: "include" })
      .then((r) => r.json())
      .then(setTrips)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Close trip context menu on outside click
  useEffect(() => {
    if (!openTripMenu) return;
    const handleClick = () => setOpenTripMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [openTripMenu]);

  function openEditTrip(trip: Trip) {
    setEditingTrip(trip);
    setEditForm({ name: trip.name, destination: trip.destination || "", start_date: trip.start_date || "", end_date: trip.end_date || "" });
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
      setTrips((prev) => prev.map((t) => t.id === editingTrip.id ? { ...t, ...updated } : t));
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

  return (
    <div className="dashboard-page" dir="rtl">
      {/* ── Header ── */}
      <header className="dashboard-header">
        <span className="dashboard-logo">✈️ פלדז טיולים</span>
        <div className="dashboard-user" onClick={() => setMenuOpen((v) => !v)}>
          {user?.avatarUrl
            ? <img src={user.avatarUrl} alt={user.name} className="dashboard-avatar" />
            : <div className="dashboard-avatar-placeholder">{user?.name?.[0] ?? "?"}</div>}
          <span className="dashboard-user-name">{user?.name}</span>
          {menuOpen && (
            <div className="dashboard-user-menu">
              <button onClick={logout}>התנתק</button>
            </div>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="dashboard-main">
        <div className="dashboard-title-row">
          <h1>הטיולים שלי</h1>
          <button className="dashboard-new-btn" onClick={() => setShowCreate(true)}>
            + טיול חדש
          </button>
        </div>

        {loading ? (
          <div className="dashboard-loading">טוען...</div>
        ) : (
          <div className="trip-cards-grid">
            {trips.map((trip) => (
              <div key={trip.id} className="trip-card" onClick={() => navigate(`/${trip.slug || trip.id}/places`)}>
                <div className="trip-card-image" style={trip.cover_image_url ? { backgroundImage: `url(${trip.cover_image_url})` } : {}}>
                  {!trip.cover_image_url && <span className="trip-card-image-placeholder">🗺️</span>}
                </div>
                <div className="trip-card-body">
                  <h3 className="trip-card-name">{trip.name}</h3>
                  {trip.destination && <p className="trip-card-dest">{trip.destination}</p>}
                  {(trip.start_date || trip.end_date) && (
                    <p className="trip-card-dates">{formatDates(trip.start_date, trip.end_date)}</p>
                  )}
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
                      onClick={(e) => { e.stopPropagation(); setOpenTripMenu((prev) => prev === trip.id ? null : trip.id); }}
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
              </div>
            ))}

            {/* Empty state */}
            {trips.length === 0 && (
              <div className="trip-card trip-card-empty" onClick={() => setShowCreate(true)}>
                <div className="trip-card-image">
                  <span className="trip-card-image-placeholder">+</span>
                </div>
                <div className="trip-card-body">
                  <h3>צור טיול חדש</h3>
                  <p>לחץ כדי להתחיל לתכנן</p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Create trip modal ── */}
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

      {/* ── Edit trip modal ── */}
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

      {/* ── Delete confirmation modal ── */}
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
