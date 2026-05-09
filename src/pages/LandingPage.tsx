import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="landing-page" dir="rtl">
      {/* ── Header ── */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <span className="landing-logo">✈️ פלדז טיולים</span>
          <a href="/auth/google" className="landing-login-btn">
            <GoogleIcon />
            התחברות עם Google
          </a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="landing-hero">
        <div className="landing-hero-overlay" />
        <div className="landing-hero-content">
          <h1 className="landing-hero-title">הטיול המושלם<br />מתחיל פה</h1>
          <p className="landing-hero-sub">תכנן, שתף ותאם עם חברים ומשפחה — הכל במקום אחד</p>
          <a href="/auth/google" className="landing-cta-btn">
            <GoogleIcon />
            התחל עכשיו — בחינם
          </a>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="landing-features">
        <h2 className="landing-section-title">מה תקבלו?</h2>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🗺️</div>
            <h3>תכנון יום-ביום</h3>
            <p>סדרו מקומות לפי ימים, ראו מסלולים על המפה, וקבלו הצעות AI אוטומטיות</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">🤝</div>
            <h3>שיתוף עם חברים</h3>
            <p>שתפו את הטיול כעורכים או לצפייה בלבד — חברים יכולים להעתיק לחשבון שלהם</p>
          </div>
          <div className="landing-feature-card">
            <div className="landing-feature-icon">✈️</div>
            <h3>הכל במקום אחד</h3>
            <p>טיסות, מלון, מקומות מומלצים, מסלולים — כל פרטי הטיול מסודרים ונגישים</p>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="landing-steps">
        <h2 className="landing-section-title">איך זה עובד?</h2>
        <div className="landing-steps-row">
          <div className="landing-step">
            <div className="landing-step-number">1</div>
            <div className="landing-step-text">
              <strong>צור חשבון</strong>
              <span>התחבר עם Google בלחיצה אחת</span>
            </div>
          </div>
          <div className="landing-step-arrow">←</div>
          <div className="landing-step">
            <div className="landing-step-number">2</div>
            <div className="landing-step-text">
              <strong>הוסף טיול</strong>
              <span>תן שם, יעד ותאריכים לטיול שלך</span>
            </div>
          </div>
          <div className="landing-step-arrow">←</div>
          <div className="landing-step">
            <div className="landing-step-number">3</div>
            <div className="landing-step-text">
              <strong>תכנן ושתף</strong>
              <span>הוסף מקומות, בנה מסלול ושתף עם החבר'ה</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA Footer ── */}
      <section className="landing-cta-footer">
        <h2>מוכנים לצאת לדרך? 🚀</h2>
        <p>הצטרפו אלינו ותכננו את הטיול הבא שלכם</p>
        <a href="/auth/google" className="landing-cta-btn landing-cta-btn-large">
          <GoogleIcon />
          התחברות עם Google
        </a>
      </section>

      <footer className="landing-footer">
        <span>© 2026 פלדז טיולים</span>
      </footer>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
