import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring, useTransform } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type TripKey = "Tokyo" | "Iceland" | "Paris";

const trips: Record<TripKey, { img: string }> = {
  Tokyo: { img: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=1200" },
  Iceland: { img: "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&q=80&w=1200" },
  Paris: { img: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&q=80&w=1200" },
};

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dashboardRef = useRef<HTMLElement | null>(null);
  const [activeTrip, setActiveTrip] = useState<TripKey>("Tokyo");
  const { scrollYProgress } = useScroll();

  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  const heroScale = useTransform(smoothProgress, [0, 0.2], [1, 1.18]);
  const heroOpacity = useTransform(smoothProgress, [0, 0.15], [1, 0]);
  const dashboardY = useTransform(smoothProgress, [0.12, 0.38], [140, 0]);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  return (
    <div className="os-homepage" dir="rtl" ref={containerRef}>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .os-homepage {
              min-height: 100vh;
              background: #020202;
              color: #ffffff;
              overflow-x: hidden;
              font-family: "Assistant", sans-serif;
              position: relative;
            }
            .os-homepage * { box-sizing: border-box; }
            .os-homepage a { color: inherit; text-decoration: none; }
            .os-homepage button { font-family: inherit; }
            .os-homepage::before,
            .os-homepage::after {
              content: "";
              position: fixed;
              pointer-events: none;
              z-index: 0;
              border-radius: 999px;
              filter: blur(110px);
              opacity: 0.18;
            }
            .os-homepage::before {
              width: 28rem;
              height: 28rem;
              top: -8rem;
              right: -8rem;
              background: rgba(249, 115, 22, 0.65);
            }
            .os-homepage::after {
              width: 24rem;
              height: 24rem;
              bottom: -6rem;
              left: -6rem;
              background: rgba(255, 255, 255, 0.14);
            }
            .os-shell {
              position: relative;
              z-index: 1;
            }
            .os-font-heebo {
              font-family: "Heebo", sans-serif;
            }
            .os-glass {
              background: rgba(0, 0, 0, 0.7);
              backdrop-filter: blur(25px);
              -webkit-backdrop-filter: blur(25px);
              border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .os-text-outline {
              -webkit-text-stroke: 1px rgba(255,255,255,0.3);
              color: transparent;
            }
            .os-gradient-orange {
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
            }
            .os-nav {
              position: fixed;
              top: 0;
              inset-inline: 0;
              z-index: 100;
              padding: 2rem clamp(1rem, 3vw, 2.5rem);
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 1rem;
              mix-blend-mode: difference;
            }
            .os-nav-brand {
              display: flex;
              align-items: center;
              gap: 1rem;
            }
            .os-nav-logo {
              width: 3rem;
              height: 3rem;
              border-radius: 1rem;
              display: grid;
              place-items: center;
              box-shadow: 0 0 30px rgba(249, 115, 22, 0.22);
            }
            .os-nav-title {
              font-size: clamp(1.8rem, 3vw, 2.25rem);
              font-weight: 900;
              letter-spacing: -0.06em;
            }
            .os-nav-links {
              display: flex;
              gap: 3rem;
              font-size: 0.68rem;
              font-weight: 900;
              letter-spacing: 0.3em;
              text-transform: uppercase;
            }
            .os-nav-links a {
              opacity: 0.72;
              transition: opacity 180ms ease, color 180ms ease;
            }
            .os-nav-links a:hover {
              color: #f97316;
              opacity: 1;
            }
            .os-pill-button,
            .os-pill-button-secondary,
            .os-icon-button {
              appearance: none;
              border: 0;
              cursor: pointer;
              transition: transform 180ms ease, background-color 180ms ease, color 180ms ease, border-color 180ms ease;
            }
            .os-pill-button {
              padding: 0.95rem 1.75rem;
              border-radius: 999px;
              background: #ffffff;
              color: #111111;
              font-weight: 900;
              font-size: 0.8rem;
              letter-spacing: 0.16em;
              text-transform: uppercase;
            }
            .os-pill-button:hover {
              background: #f97316;
              color: #ffffff;
              transform: scale(1.04);
            }
            .os-pill-button-secondary {
              padding: 1.05rem 2rem;
              border-radius: 999px;
              background: transparent;
              color: #ffffff;
              font-weight: 900;
              font-size: 1.05rem;
              letter-spacing: 0.08em;
              border: 1px solid rgba(255,255,255,0.2);
            }
            .os-pill-button-secondary:hover {
              background: rgba(255,255,255,0.06);
              transform: scale(1.03);
            }
            .os-hero {
              position: relative;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .os-hero-media {
              position: absolute;
              inset: 0;
            }
            .os-hero-media::after {
              content: "";
              position: absolute;
              inset: 0;
              background: linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0.18) 38%, #020202 100%);
            }
            .os-hero-image {
              width: 100%;
              height: 100%;
              object-fit: cover;
              filter: grayscale(18%);
            }
            .os-hero-content {
              position: relative;
              z-index: 2;
              text-align: center;
              padding: 0 1.5rem;
            }
            .os-eyebrow {
              display: inline-block;
              margin-bottom: 2rem;
              color: #f97316;
              font-size: 0.78rem;
              font-weight: 900;
              letter-spacing: 0.48em;
              text-transform: uppercase;
            }
            .os-hero-title {
              margin: 0;
              font-size: clamp(4.5rem, 15vw, 13rem);
              line-height: 0.75;
              font-weight: 900;
              letter-spacing: -0.08em;
              text-transform: uppercase;
              font-style: italic;
            }
            .os-hero-copy {
              margin: 2.8rem auto 0;
              max-width: 42rem;
              font-size: clamp(1.2rem, 2.5vw, 2rem);
              line-height: 1.75;
              color: rgba(255,255,255,0.68);
              font-weight: 300;
            }
            .os-scroll-indicator {
              position: absolute;
              bottom: 3rem;
              left: 50%;
              transform: translateX(-50%);
              opacity: 0.34;
              cursor: pointer;
              z-index: 2;
            }
            .os-section {
              padding: 8rem 1.5rem;
              position: relative;
              z-index: 1;
            }
            .os-container {
              max-width: 1400px;
              margin: 0 auto;
            }
            .os-two-column {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr);
              gap: clamp(2rem, 7vw, 8rem);
              align-items: center;
            }
            .os-chip {
              display: inline-flex;
              align-items: center;
              gap: 0.5rem;
              padding: 0.7rem 1rem;
              border-radius: 999px;
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.1);
              color: #f97316;
              font-size: 0.64rem;
              font-weight: 900;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            .os-h2 {
              margin: 1.25rem 0 0;
              font-size: clamp(3rem, 7vw, 5.25rem);
              line-height: 0.92;
              font-weight: 900;
              letter-spacing: -0.07em;
            }
            .os-h2-accent {
              color: #f97316;
              font-style: italic;
            }
            .os-lead {
              margin: 1.8rem 0 0;
              color: #a1a1aa;
              font-size: clamp(1.15rem, 2vw, 1.8rem);
              line-height: 1.8;
              font-weight: 300;
            }
            .os-feature-list {
              display: grid;
              gap: 1.4rem;
              margin-top: 2.5rem;
            }
            .os-feature-item {
              display: flex;
              gap: 1.25rem;
              align-items: flex-start;
            }
            .os-feature-icon {
              flex: none;
              width: 3rem;
              height: 3rem;
              border-radius: 1rem;
              display: grid;
              place-items: center;
              background: rgba(249, 115, 22, 0.1);
              color: #f97316;
            }
            .os-feature-title {
              margin: 0 0 0.35rem;
              font-size: 1.3rem;
              font-weight: 800;
            }
            .os-feature-copy {
              margin: 0;
              color: #71717a;
              line-height: 1.75;
            }
            .os-media-card {
              position: relative;
            }
            .os-media-glow {
              position: absolute;
              inset: 0;
              background: rgba(249, 115, 22, 0.22);
              filter: blur(120px);
              border-radius: 999px;
            }
            .os-media-frame {
              position: relative;
              aspect-ratio: 1 / 1;
              border-radius: 4rem;
              overflow: hidden;
              box-shadow: 0 0 40px rgba(0,0,0,0.5);
            }
            .os-media-frame img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }
            .os-media-overlay {
              position: absolute;
              inset: 0;
              background: linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.85) 100%);
            }
            .os-floating-card {
              position: absolute;
              top: 2.5rem;
              right: 2.5rem;
              width: min(16rem, calc(100% - 4rem));
              padding: 1.25rem;
              border-radius: 2rem;
              box-shadow: 0 24px 60px rgba(0,0,0,0.35);
            }
            .os-floating-topline {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 1rem;
              font-size: 0.62rem;
              font-weight: 900;
              letter-spacing: 0.22em;
              text-transform: uppercase;
              color: rgba(255,255,255,0.48);
            }
            .os-floating-route {
              font-size: 1.7rem;
              font-weight: 900;
              letter-spacing: -0.05em;
            }
            .os-floating-status {
              margin-top: 0.55rem;
              font-size: 0.62rem;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              color: rgba(255,255,255,0.7);
            }
            .os-dashboard {
              padding-top: 3rem;
            }
            .os-dashboard-frame {
              overflow: hidden;
              border-radius: 4rem;
              box-shadow: 0 40px 100px rgba(0,0,0,0.42);
            }
            .os-dashboard-grid {
              display: grid;
              grid-template-columns: minmax(250px, 0.9fr) minmax(0, 2.1fr);
              min-height: 850px;
            }
            .os-dashboard-sidebar {
              padding: 2.5rem;
              border-left: 1px solid rgba(255,255,255,0.06);
              background: rgba(0,0,0,0.5);
              display: flex;
              flex-direction: column;
            }
            .os-caption {
              font-size: 0.64rem;
              font-weight: 900;
              letter-spacing: 0.3em;
              text-transform: uppercase;
              color: rgba(255,255,255,0.34);
            }
            .os-trip-list {
              display: grid;
              gap: 1rem;
              margin-top: 2rem;
              flex: 1;
            }
            .os-trip-button {
              appearance: none;
              width: 100%;
              border: 0;
              border-radius: 1.25rem;
              padding: 1rem 1.1rem;
              display: flex;
              align-items: center;
              justify-content: space-between;
              cursor: pointer;
              color: #a1a1aa;
              background: transparent;
              transition: transform 180ms ease, background-color 180ms ease, color 180ms ease;
            }
            .os-trip-button:hover {
              background: rgba(255,255,255,0.06);
              color: #ffffff;
              transform: translateY(-2px);
            }
            .os-trip-button.is-active {
              background: #ea580c;
              color: #ffffff;
              box-shadow: 0 20px 48px rgba(234, 88, 12, 0.22);
            }
            .os-trip-button-label {
              font-size: 1.15rem;
              font-weight: 800;
            }
            .os-ai-status {
              margin-top: auto;
              padding: 1.4rem;
              border-radius: 2rem;
              background: rgba(249, 115, 22, 0.1);
              border: 1px solid rgba(249, 115, 22, 0.2);
            }
            .os-ai-status-top {
              display: flex;
              align-items: center;
              gap: 0.5rem;
              color: #f97316;
              margin-bottom: 0.55rem;
            }
            .os-ai-status-copy {
              margin: 0;
              color: #a1a1aa;
              line-height: 1.75;
              font-size: 0.95rem;
            }
            .os-dashboard-main {
              padding: clamp(1.5rem, 4vw, 4rem);
              position: relative;
            }
            .os-dashboard-content {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr);
              gap: clamp(1.5rem, 4vw, 4rem);
              height: 100%;
            }
            .os-trip-meta {
              color: #71717a;
              font-size: 0.68rem;
              font-weight: 800;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              margin-top: 0.5rem;
            }
            .os-itinerary-list {
              display: grid;
              gap: 1rem;
              margin-top: 2rem;
            }
            .os-itinerary-item {
              display: flex;
              align-items: center;
              gap: 1rem;
              padding: 1.3rem;
              border-radius: 1.6rem;
              background: rgba(255,255,255,0.05);
              border: 1px solid rgba(255,255,255,0.06);
              transition: border-color 180ms ease, transform 180ms ease;
            }
            .os-itinerary-item:hover {
              border-color: rgba(249,115,22,0.3);
              transform: translateY(-4px);
            }
            .os-itinerary-time {
              color: #f97316;
              font-weight: 900;
              font-size: 0.82rem;
            }
            .os-itinerary-task {
              flex: 1;
              font-weight: 700;
            }
            .os-itinerary-tag {
              padding: 0.35rem 0.7rem;
              border-radius: 999px;
              border: 1px solid rgba(255,255,255,0.09);
              color: #71717a;
              font-size: 0.58rem;
              font-weight: 900;
              letter-spacing: 0.18em;
              text-transform: uppercase;
            }
            .os-full-button {
              width: 100%;
              margin-top: 1.5rem;
              padding: 1.3rem 1.5rem;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 0.75rem;
              border: 0;
              border-radius: 1.8rem;
              background: #ffffff;
              color: #111111;
              font-weight: 900;
              font-size: 0.86rem;
              letter-spacing: 0.16em;
              text-transform: uppercase;
              cursor: pointer;
              transition: transform 180ms ease, background-color 180ms ease, color 180ms ease;
            }
            .os-full-button:hover {
              background: #f97316;
              color: #ffffff;
              transform: scale(1.03);
            }
            .os-visual-column {
              display: flex;
              flex-direction: column;
              gap: 1.5rem;
              min-height: 100%;
            }
            .os-preview-image {
              position: relative;
              flex: 1;
              min-height: 24rem;
              overflow: hidden;
              border-radius: 3rem;
              box-shadow: 0 24px 70px rgba(0,0,0,0.4);
            }
            .os-preview-image img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              transition: transform 700ms ease;
            }
            .os-preview-image:hover img {
              transform: scale(1.05);
            }
            .os-preview-actions {
              position: absolute;
              right: 2rem;
              bottom: 2rem;
              display: flex;
              gap: 0.75rem;
            }
            .os-icon-button {
              width: 3.5rem;
              height: 3.5rem;
              border-radius: 1.1rem;
              display: grid;
              place-items: center;
            }
            .os-icon-button.light {
              background: #ffffff;
              color: #111111;
            }
            .os-icon-button.dark {
              background: rgba(0,0,0,0.6);
              color: #ffffff;
              backdrop-filter: blur(18px);
              -webkit-backdrop-filter: blur(18px);
            }
            .os-advice-card {
              padding: 1.6rem;
              border-radius: 2.5rem;
            }
            .os-advice-title {
              display: flex;
              align-items: center;
              gap: 0.65rem;
              margin-bottom: 0.9rem;
              font-size: 1.2rem;
              font-weight: 800;
            }
            .os-advice-copy {
              margin: 0;
              color: #a1a1aa;
              line-height: 1.85;
              font-weight: 300;
              font-style: italic;
            }
            .os-cta {
              padding: 12rem 1.5rem;
              text-align: center;
              position: relative;
            }
            .os-cta::before {
              content: "";
              position: absolute;
              inset: 0;
              background: linear-gradient(180deg, transparent 0%, rgba(249,115,22,0.1) 50%, transparent 100%);
            }
            .os-cta-inner {
              position: relative;
              z-index: 1;
              max-width: 72rem;
              margin: 0 auto;
            }
            .os-cta-title {
              margin: 0 0 2rem;
              font-size: clamp(3rem, 9vw, 8rem);
              line-height: 0.9;
              font-weight: 900;
              letter-spacing: -0.08em;
              text-transform: uppercase;
            }
            .os-cta-actions {
              display: flex;
              gap: 1rem;
              justify-content: center;
              align-items: center;
              flex-wrap: wrap;
            }
            .os-footer {
              padding: 5rem 1.5rem 2.5rem;
              border-top: 1px solid rgba(255,255,255,0.05);
            }
            .os-footer-grid {
              max-width: 1400px;
              margin: 0 auto;
              display: grid;
              grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr));
              gap: 2rem;
            }
            .os-footer-copy {
              max-width: 22rem;
              color: #71717a;
              line-height: 1.85;
              margin: 0;
            }
            .os-footer-title {
              color: #a1a1aa;
              font-size: 0.64rem;
              letter-spacing: 0.32em;
              text-transform: uppercase;
              margin-bottom: 1rem;
              font-weight: 900;
            }
            .os-footer-links {
              display: grid;
              gap: 0.75rem;
              font-weight: 700;
            }
            .os-footer-bottom {
              max-width: 1400px;
              margin: 3.5rem auto 0;
              padding-top: 2rem;
              border-top: 1px solid rgba(255,255,255,0.05);
              display: flex;
              justify-content: space-between;
              gap: 1rem;
              color: #3f3f46;
              font-size: 0.64rem;
              font-weight: 900;
              letter-spacing: 0.3em;
              text-transform: uppercase;
              flex-wrap: wrap;
            }
            .os-footer-bottom-links {
              display: flex;
              gap: 2rem;
              flex-wrap: wrap;
            }
            @media (max-width: 1100px) {
              .os-nav-links { display: none; }
              .os-two-column,
              .os-dashboard-content,
              .os-dashboard-grid,
              .os-footer-grid {
                grid-template-columns: 1fr;
              }
              .os-dashboard-sidebar {
                border-left: 0;
                border-bottom: 1px solid rgba(255,255,255,0.06);
              }
            }
            @media (max-width: 767px) {
              .os-nav {
                padding: 1.25rem 1rem;
              }
              .os-nav-title {
                font-size: 1.4rem;
              }
              .os-nav-logo {
                width: 2.6rem;
                height: 2.6rem;
              }
              .os-pill-button {
                padding: 0.8rem 1rem;
                font-size: 0.68rem;
              }
              .os-hero-copy {
                font-size: 1.1rem;
              }
              .os-section,
              .os-dashboard {
                padding-top: 5rem;
                padding-bottom: 5rem;
              }
              .os-dashboard-frame {
                border-radius: 2.4rem;
              }
              .os-dashboard-sidebar,
              .os-dashboard-main {
                padding: 1.35rem;
              }
              .os-preview-image {
                border-radius: 2rem;
                min-height: 20rem;
              }
              .os-floating-card {
                top: 1rem;
                right: 1rem;
                width: calc(100% - 2rem);
              }
              .os-cta {
                padding-top: 7rem;
                padding-bottom: 7rem;
              }
              .os-footer-bottom,
              .os-footer-bottom-links {
                gap: 1rem;
              }
            }
          `,
        }}
      />

      <div className="os-shell">
        <nav className="os-nav">
          <div className="os-nav-brand">
            <motion.div whileHover={{ scale: 1.1, rotate: 15 }} className="os-nav-logo os-gradient-orange">
              <PlaneIcon />
            </motion.div>
            <span className="os-nav-title os-font-heebo">TRAVLER</span>
          </div>

          <div className="os-nav-links">
            {["Explore", "My OS", "AI Concierge", "Pricing"].map((item) => (
              <a key={item} href="#">{item}</a>
            ))}
          </div>

          <button className="os-pill-button" onClick={() => { window.location.href = "/auth/google"; }}>
            הצטרפו לבטא
          </button>
        </nav>

        <section className="os-hero">
          <motion.div style={{ scale: heroScale, opacity: heroOpacity }} className="os-hero-media">
            <img
              src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=2200"
              alt="Travel background"
              className="os-hero-image"
            />
          </motion.div>

          <div className="os-hero-content">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
            >
              <span className="os-eyebrow">Automated Travel Intelligence</span>
              <h1 className="os-hero-title os-font-heebo">
                Travler
                <br />
                <span className="os-text-outline">OS_01</span>
              </h1>
              <p className="os-hero-copy">
                המקום שבו ההשראה פוגשת ביצוע. תכנון, ניהול ותמיכה - הכל ב-OS אחד חכם.
              </p>
            </motion.div>
          </div>

          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="os-scroll-indicator"
            onClick={() => dashboardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            <ChevronDownIcon />
          </motion.div>
        </section>

        <section className="os-section">
          <div className="os-container os-two-column">
            <div>
              <div className="os-chip">
                <SparklesIcon />
                <span>Intelligence Layer</span>
              </div>
              <h2 className="os-h2 os-font-heebo">
                יותר מיומן,
                <br />
                <span className="os-h2-accent">זאת מערכת.</span>
              </h2>
              <p className="os-lead">
                Travler מרכז עבורך את כל חלקי הטיול: כרטיסי טיסה, הזמנות מלונות, המלצות AI ומסלולים מותאמים אישית - מסונכרנים לכל המכשירים שלך.
              </p>

              <div className="os-feature-list">
                {[
                  { title: "ייעוץ ותמיכה 24/7", desc: "ה-AI שלנו זמין לכל שינוי, המלצה או פתרון בעיות בזמן אמת." },
                  { title: "ניהול מסמכים חכם", desc: "כל מה שצריך לטיול בתיקייה דיגיטלית אחת מאובטחת." },
                ].map((item) => (
                  <div key={item.title} className="os-feature-item">
                    <div className="os-feature-icon">
                      <ZapIcon />
                    </div>
                    <div>
                      <h4 className="os-feature-title os-font-heebo">{item.title}</h4>
                      <p className="os-feature-copy">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              className="os-media-card"
            >
              <div className="os-media-glow" />
              <div className="os-media-frame">
                <img
                  src="https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&q=80&w=1200"
                  alt="Travler concept"
                />
                <div className="os-media-overlay" />

                <motion.div
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity }}
                  className="os-floating-card os-glass"
                >
                  <div className="os-floating-topline">
                    <span>Next Flight</span>
                    <PlaneIcon small />
                  </div>
                  <div className="os-floating-route os-font-heebo">TLV → HND</div>
                  <div className="os-floating-status">BOARDING IN 4H 20M</div>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="os-section os-dashboard" ref={dashboardRef}>
          <div className="os-container">
            <motion.div style={{ y: dashboardY }} className="os-dashboard-frame os-glass">
              <div className="os-dashboard-grid">
                <div className="os-dashboard-sidebar">
                  <h3 className="os-caption">Active Journeys</h3>
                  <div className="os-trip-list">
                    {(Object.keys(trips) as TripKey[]).map((name) => (
                      <button
                        key={name}
                        onClick={() => setActiveTrip(name)}
                        className={`os-trip-button${activeTrip === name ? " is-active" : ""}`}
                      >
                        <span className="os-trip-button-label os-font-heebo">{name}</span>
                        <ArrowRightIcon />
                      </button>
                    ))}
                  </div>

                  <div className="os-ai-status">
                    <div className="os-ai-status-top">
                      <SparklesIcon />
                      <span className="os-caption" style={{ color: "inherit" }}>AI Status</span>
                    </div>
                    <p className="os-ai-status-copy">
                      המערכת ניתחה את מזג האוויר ב-{activeTrip} וממליצה על שינוי בלו"ז ביום ג'.
                    </p>
                  </div>
                </div>

                <div className="os-dashboard-main">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTrip}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="os-dashboard-content"
                    >
                      <div>
                        <div>
                          <h2 className="os-h2 os-font-heebo" style={{ fontStyle: "italic", fontSize: "clamp(3rem, 6vw, 5rem)" }}>
                            {activeTrip}
                          </h2>
                          <p className="os-trip-meta">7 Days • Family Trip • Spring 2024</p>
                        </div>

                        <div className="os-itinerary-list">
                          {[
                            { time: "09:00", task: "Breakfast at Tsukiji", cat: "Food" },
                            { time: "11:30", task: "TeamLab Borderless", cat: "Art" },
                            { time: "15:00", task: "Shibuya Sky Sunset", cat: "Sightseeing" },
                          ].map((item) => (
                            <div key={item.time} className="os-itinerary-item">
                              <div className="os-itinerary-time os-font-heebo">{item.time}</div>
                              <div className="os-itinerary-task">{item.task}</div>
                              <div className="os-itinerary-tag">{item.cat}</div>
                            </div>
                          ))}
                        </div>

                        <button className="os-full-button">
                          <PlusIcon />
                          הוסף פריט חדש
                        </button>
                      </div>

                      <div className="os-visual-column">
                        <div className="os-preview-image">
                          <img src={trips[activeTrip].img} alt={activeTrip} />
                          <div className="os-media-overlay" />
                          <div className="os-preview-actions">
                            <button className="os-icon-button light" aria-label="Open gallery">
                              <CameraIcon />
                            </button>
                            <button className="os-icon-button dark" aria-label="Open map">
                              <MapIcon />
                            </button>
                          </div>
                        </div>

                        <div className="os-advice-card os-glass">
                          <div className="os-advice-title os-font-heebo">
                            <MessageIcon />
                            AI Advice
                          </div>
                          <p className="os-advice-copy">
                            "ביום הזה צפוי גשם קל בצהריים. העברתי את הביקור במוזיאון לשעה 12:00 כדי שתישאר יבש. נשאר לך זמן לקינוח בשיבויה בערב."
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="os-cta">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            className="os-cta-inner"
          >
            <h2 className="os-cta-title os-font-heebo">
              The world is
              <br />
              <span style={{ color: "#f97316", fontStyle: "italic" }}>Calling_</span>
            </h2>
            <div className="os-cta-actions">
              <button className="os-pill-button" style={{ fontSize: "1.25rem", padding: "1.25rem 2.25rem" }} onClick={() => { window.location.href = "/auth/google"; }}>
                מתחילים עכשיו
              </button>
              <button className="os-pill-button-secondary">
                צפה בדמו
              </button>
            </div>
          </motion.div>
        </section>

        <footer className="os-footer">
          <div className="os-footer-grid">
            <div>
              <div className="os-nav-brand" style={{ marginBottom: "1.5rem" }}>
                <div className="os-nav-logo os-gradient-orange" style={{ width: "2.5rem", height: "2.5rem", borderRadius: "0.9rem", transform: "rotate(3deg)" }}>
                  <PlaneIcon />
                </div>
                <span className="os-nav-title os-font-heebo" style={{ fontSize: "1.8rem" }}>TRAVLER</span>
              </div>
              <p className="os-footer-copy">
                מגדירים מחדש את הדרך שבה אנשים מתכננים וחווים את העולם. הצטרפו למהפכת ה-Travel OS.
              </p>
            </div>

            <div>
              <div className="os-footer-title">Social</div>
              <div className="os-footer-links">
                <a href="#">Instagram</a>
                <a href="#">Twitter</a>
                <a href="#">LinkedIn</a>
              </div>
            </div>

            <div>
              <div className="os-footer-title">Contact</div>
              <div className="os-footer-links">
                <span>hello@travler.ai</span>
                <span style={{ color: "#71717a", fontSize: "0.72rem", letterSpacing: "0.18em", textTransform: "uppercase" }}>Available 24/7</span>
              </div>
            </div>
          </div>

          <div className="os-footer-bottom">
            <span>© 2024 TRAVLER TECHNOLOGIES LTD.</span>
            <div className="os-footer-bottom-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function PlaneIcon({ small = false }: { small?: boolean }) {
  return (
    <svg width={small ? 14 : 22} height={small ? 14 : 22} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 16.5 22 12 2 7.5l5.5 4.5L2 16.5Z" fill="currentColor" opacity="0.95" />
      <path d="m9.5 12-3-7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="m9.5 12-3 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 14.2 8.8 21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2L12 2Z" fill="currentColor" />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2 5 13h5l-1 9 8-11h-5l1-9Z" fill="currentColor" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m12 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M9 6 10.5 4h3L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 4v14" stroke="currentColor" strokeWidth="2" />
      <path d="M15 6v14" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 18.2V5.8A2.8 2.8 0 0 1 7.8 3h8.4A2.8 2.8 0 0 1 19 5.8v6.4A2.8 2.8 0 0 1 16.2 15H10l-5 3.2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
