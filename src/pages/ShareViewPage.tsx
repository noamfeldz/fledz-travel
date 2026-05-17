import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type TripSnapshot = {
  trip: { id: string; name: string; destination: string; start_date: string | null; end_date: string | null };
  places: unknown[];
  hotels: unknown[];
  hotel?: unknown; // legacy compat
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
      window.location.href = `/auth/google?redirect=/share/${token}`;
      return;
    }
    setCopying(true);
    try {
      const res = await fetch(`/api/share/${token}/copy`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `שגיאה בהעתקת הטיול (${res.status})`);
      }
      const { tripId } = await res.json();
      navigate(`/${tripId}/places`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "שגיאה לא ידועה");
    } finally {
      setCopying(false);
    }
  }

  if (loading) return <div className="share-loading" dir="rtl">טוען טיול...</div>;
  if (error) return <div className="share-error" dir="rtl">❌ {error}</div>;
  if (!snapshot) return null;

  const { trip, places, hotel, hotels, flights, plans } = snapshot;
  const hotelCount = Array.isArray(hotels) ? hotels.length : (hotel ? 1 : 0);
  const placeList = places as Array<{ name: string; type: string; notes?: string; priority?: number }>;
  const planCount = (plans as unknown[]).length;

  return (
    <div className="share-page" dir="rtl">
      <header className="share-header">
        <span className="share-header-logo">✈️ פלדז טיולים</span>
        <button className="share-copy-btn" onClick={copyTrip} disabled={copying}>
          {copying ? "מעתיק..." : "הוסף לטיולים שלי"}
        </button>
      </header>

      <main className="share-main">
        <motion.section
          className="share-hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="dashboard-eyebrow">Shared Journey</span>
          <h1 className="share-trip-name">{trip.name}</h1>
          {trip.destination && <p className="share-trip-dest">📍 {trip.destination}</p>}
          {(trip.start_date || trip.end_date) && (
            <p className="share-trip-dates">
              {trip.start_date ? new Date(trip.start_date).toLocaleDateString("he-IL") : ""}
              {trip.start_date && trip.end_date ? " – " : ""}
              {trip.end_date ? new Date(trip.end_date).toLocaleDateString("he-IL") : ""}
            </p>
          )}
          <p className="share-hero-copy">
            תצוגה מוכנה לשיתוף של הטיול, עם כל המקומות, הטיסות והבסיס לתכנון. אפשר לצפות, ואז להעתיק אותו לחשבון שלך להמשך עבודה.
          </p>
        </motion.section>

        <div className="share-stats">
          <div className="share-stat">
            <span className="share-stat-num">{placeList.length}</span>
            <span>מקומות</span>
          </div>
          <div className="share-stat">
            <span className="share-stat-num">{(flights as unknown[]).length}</span>
            <span>טיסות</span>
          </div>
          <div className="share-stat">
            <span className="share-stat-num">{planCount}</span>
            <span>ימים</span>
          </div>
          {hotelCount > 0 && (
            <div className="share-stat">
              <span className="share-stat-num">{hotelCount}</span>
              <span>מלון{hotelCount > 1 ? "ות" : ""}</span>
            </div>
          )}
        </div>

        <section className="share-section">
          <h2>מקומות לביקור</h2>
          {placeList.length === 0 ? (
            <p className="share-empty">אין מקומות עדיין</p>
          ) : (
            <ul className="share-places-list">
              {placeList.slice(0, 20).map((p, i) => (
                <li key={i} className="share-place-item">
                  <span className="share-place-name">{p.name}</span>
                  {p.type && <span className="share-place-type">{p.type}</span>}
                  {p.priority && <span className="share-place-priority">{"★".repeat(p.priority)}</span>}
                </li>
              ))}
              {placeList.length > 20 && (
                <li className="share-places-more">+ {placeList.length - 20} מקומות נוספים</li>
              )}
            </ul>
          )}
        </section>

        <section className="share-section">
          <h2>למה להעתיק את הטיול</h2>
          <div className="share-benefits-grid">
            <article className="share-benefit-card">
              <strong>מסלול קיים</strong>
              <p>מתחילים מטיול שיש בו כבר מקומות, כיוון ותאריכים במקום לבנות הכל מאפס.</p>
            </article>
            <article className="share-benefit-card">
              <strong>עריכה מלאה</strong>
              <p>אחרי ההעתקה אפשר לשנות ימים, להוסיף טיסות, לגרור מקומות ולתכנן מחדש עם AI.</p>
            </article>
            <article className="share-benefit-card">
              <strong>אותו workflow</strong>
              <p>ממשיכים ישר למפה, למקומות וללו״ז מתוך חשבון שלך בלי להעביר קבצים או הודעות.</p>
            </article>
          </div>
        </section>

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
