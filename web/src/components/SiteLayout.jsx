import { NavLink, Outlet } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { bn } from "../lib/format.js";
import Notice from "./Notice.jsx";
import AuthPanel from "./AuthPanel.jsx";
import LoadingScreen from "./LoadingScreen.jsx";
import { useState } from "react";

const NAV = [
  { to: "/", label: "হোম", end: true },
  { to: "/districts", label: "৬৪ জেলা" },
  { to: "/places", label: "গন্তব্য" },
  { to: "/distance", label: "দূরত্ব" },
  { to: "/my-travel", label: "আমার ভ্রমণ" },
];

export default function SiteLayout() {
  const { counts, user, profile, settings, content, loading, loadError } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  const site = settings?.site || {};
  const prefs = settings?.prefs || {};
  const showFooterStats = prefs.showFooterStats !== false;
  const title = site.title || "পথচিত্র";
  const tagline = site.tagline || "বাংলাদেশ, আপনার পথে";

  const stats = content
    ? [
        { n: content.districts.length, w: "জেলা" },
        { n: content.upazilas.length, w: "উপজেলা" },
        { n: content.places.length, w: "গন্তব্য" },
      ]
    : [];

  return (
    <div className="site">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="28" height="28">
                <rect width="64" height="64" rx="18" fill="#175c49" />
                <path d="M32 10c-10 0-18 8-18 18 0 13 18 27 18 27s18-14 18-27c0-10-8-18-18-18Z" fill="#fff" />
                <path d="m23 35 9-17 9 17-9-5Z" fill="#e5ad52" />
                <circle cx="32" cy="28" r="3" fill="#175c49" />
              </svg>
            </span>
            <span className="brand-text">
              <strong>{title}</strong>
              <small>{tagline}</small>
            </span>
          </NavLink>

          <nav className={`nav ${menuOpen ? "open" : ""}`} aria-label="প্রধান নেভিগেশন">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {item.label}
                {item.to === "/my-travel" && counts.visited > 0 && (
                  <span className="pill">{bn(counts.visited)}</span>
                )}
              </NavLink>
            ))}
            <NavLink to="/admin" className="nav-admin" onClick={() => setMenuOpen(false)}>
              এডমিন
            </NavLink>
          </nav>

          <div className="topbar-actions">
            {user ? (
              <span className="who" title={user.email}>
                {profile?.display_name || user.email?.split("@")[0]}
                {profile?.role === "admin" && <em className="role-tag">এডমিন</em>}
              </span>
            ) : (
              <button className="btn ghost sm" onClick={() => setAuthOpen(true)}>
                লগইন
              </button>
            )}
            <button
              className="btn icon-only menu-btn"
              aria-label="মেনু"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      <Notice />
      {loading ? (
        <LoadingScreen />
      ) : loadError && !content ? (
        <main className="page">
          <div className="card notice-card">
            <h2>তথ্য লোড করা যায়নি</h2>
            <p>{loadError}</p>
            <button className="btn primary" onClick={() => window.location.reload()}>
              আবার চেষ্টা করুন
            </button>
          </div>
        </main>
      ) : (
        <Outlet />
      )}

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <strong>{title}</strong>
            <p>বাংলাদেশের ৬৪ জেলার মানচিত্র, গন্তব্য আর নিজের ভ্রমণের হিসাব।</p>
          </div>
          {showFooterStats && (
            <div className="footer-stats">
              {stats.map((s) => (
                <span key={s.w}>
                  <b>{bn(s.n)}</b> {s.w}
                </span>
              ))}
            </div>
          )}
          <nav className="footer-links">
            <NavLink to="/districts">জেলা</NavLink>
            <NavLink to="/places">গন্তব্য</NavLink>
            <NavLink to="/distance">দূরত্ব মাপুন</NavLink>
            <NavLink to="/my-travel">আমার ভ্রমণ</NavLink>
            <NavLink to="/admin">এডমিন প্যানেল</NavLink>
          </nav>
          <p className="footer-note">
            {site.updatedLabel ? `${site.updatedLabel} · ` : ""}ভ্রমণের আগে স্থানীয় কর্তৃপক্ষের সর্বশেষ
            তথ্য যাচাই করে নিন।
          </p>
        </div>
      </footer>

      {authOpen && <AuthPanel onClose={() => setAuthOpen(false)} />}
    </div>
  );
}
