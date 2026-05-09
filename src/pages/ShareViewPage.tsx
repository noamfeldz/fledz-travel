import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type TripSnapshot = {
  trip: { id: string; name: string; destination: string; start_date: string | null; end_date: string | null };
  places: unknown[];
  hotel: unknown;
  flights: unknown[];
  plans: unknown[];
  tripConfig: unknown;
};

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("קישור לא תקין או שפג תוקפו");
        return r.json();
      })
      .then(setSnapshot)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function copyTrip() {
    if (!user) {
      // Redirect to login, then back to this share page
      window.location.href = `/auth/google?redirect=/share/${token}`;
      return;
    }
    setCopying(true);
    try {
      const res = await fetch(`/api/share/${token}/copy`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("שגיאה בהעתקת הטיול");
      const { tripId } = await res.json();
      navigate(`/app/trip/${tripId}/places`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setCopying(false);
    }
  }

  if (loading) return <div className="share-loading" dir="rtl">טוען טיול...</div>;
  if (error) return <div className="share-error" dir="rtl">❌ {error}</div>;
  if (!snapshot) return null;

  const { trip, places, hotel, flights } = snapshot;

  return (
    <div className="share-page" dir="rtl">
      <header className="share-header">
        <span className="share-header-logo">✈️ פלדז טיולים</span>
        <button className="share-copy-btn" onClick={copyTrip} disabled={copying}>
          {copying ? "מעתיק..." : "הוסף לטיולים שלי"}
        </button>
      </header>

      <main className="share-main">
        <div className="share-hero">
          <h1 className="share-trip-name">{trip.name}</h1>
          {trip.destination && <p className="share-trip-dest">📍 {trip.destination}</p>}
          {(trip.start_date || trip.end_date) && (
            <p className="share-trip-dates">
              {trip.start_date ? new Date(trip.start_date).toLocaleDateString("he-IL") : ""}
              {trip.start_date && trip.end_date ? " – " : ""}
              {trip.end_date ? new Date(trip.end_date).toLocaleDateString("he-IL") : ""}
            </p>
          )}
        </div>

        <div className="share-stats">
          <div className="share-stat"><span className="share-stat-num">{(places as unknown[]).length}</span><span>מקומות</span></div>
          <div className="share-stat"><span className="share-stat-num">{(flights as unknown[]).length}</span><span>טיסות</span></div>
          {!!hotel && <div className="share-stat"><span className="share-stat-num">✓</span><span>מלון</span></div>}
        </div>

        <div className="share-section">
          <h2>מקומות לביקור</h2>
          {(places as Array<{ name: string; type: string; notes?: string; priority?: number }>).length === 0 ? (
            <p className="share-empty">אין מקומות עדיין</p>
          ) : (
            <ul className="share-places-list">
              {(places as Array<{ name: string; type: string; notes?: string; priority?: number }>).slice(0, 20).map((p, i) => (
                <li key={i} className="share-place-item">
                  <span className="share-place-name">{p.name}</span>
                  {p.type && <span className="share-place-type">{p.type}</span>}
                  {p.priority && <span className="share-place-priority">{"★".repeat(p.priority)}</span>}
                </li>
              ))}
              {(places as unknown[]).length > 20 && (
                <li className="share-places-more">+ {(places as unknown[]).length - 20} מקומות נוספים</li>
              )}
            </ul>
          )}
        </div>

        <div className="share-cta">
          <p>רוצים להעתיק את הטיול הזה לחשבון שלכם?</p>
          <button className="share-copy-btn-large" onClick={copyTrip} disabled={copying}>
            {copying ? "מעתיק..." : user ? "הוסף לטיולים שלי" : "התחבר והוסף לטיולים שלי"}
          </button>
        </div>
      </main>
    </div>
  );
}
