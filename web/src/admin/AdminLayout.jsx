import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { hasBackend } from "../lib/supabase.js";
import { claimAdmin } from "./adminApi.js";
import AdminDashboard from "./AdminDashboard.jsx";
import AdminDistricts from "./AdminDistricts.jsx";
import AdminPlaces from "./AdminPlaces.jsx";
import AdminUpazilas from "./AdminUpazilas.jsx";
import AdminUsers from "./AdminUsers.jsx";
import AdminSettings from "./AdminSettings.jsx";
import AdminData from "./AdminData.jsx";

const ADMIN_NAV = [
  { to: "/admin", label: "ড্যাশবোর্ড", end: true },
  { to: "/admin/districts", label: "জেলা" },
  { to: "/admin/places", label: "গন্তব্য" },
  { to: "/admin/upazilas", label: "উপজেলা" },
  { to: "/admin/users", label: "ব্যবহারকারী" },
  { to: "/admin/data", label: "ইমপোর্ট / এক্সপোর্ট" },
  { to: "/admin/settings", label: "সেটিংস" },
];

/** এডমিন প্যানেল — আলাদা লেআউট, আলাদা লগইন গেট */
export default function AdminLayout() {
  const { user, profile, signIn, signUp, signOut, authBusy, notify, hasBackend: backendOn } = useApp();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState("");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "signin") await signIn({ email, password });
      else await signUp({ email, password, displayName: name });
    } catch (err) {
      setError(err?.message || "লগইন করা যায়নি।");
    }
  }

  async function onClaim() {
    setClaiming(true);
    setClaimMsg("");
    const res = await claimAdmin();
    setClaiming(false);
    if (res.ok) {
      notify("এডমিন অ্যাক্সেস চালু হয়েছে।");
      window.location.reload();
      return;
    }
    if (res.code === "already-has-admin")
      setClaimMsg("এই সাইটে আগেই একজন এডমিন আছেন। তাঁর কাছে থেকে আপনার ইমেইল এডমিন তালিকায় যোগ করান।");
    else setClaimMsg(res.error || "এডমিন দাবি করা যায়নি।");
  }

  if (!backendOn || !hasBackend) {
    return (
      <Shell>
        <div className="card notice-card">
          <h2>ব্যাকএন্ড সংযুক্ত নেই</h2>
          <p>এডমিন প্যানেল ব্যবহারের জন্য Supabase সংযোগ দরকার।</p>
          <Link className="btn primary" to="/">
            সাইটে ফিরুন
          </Link>
        </div>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell>
        <div className="auth-gate">
          <h1>এডমিন প্যানেল</h1>
          <p className="muted">পথচিত্রের কনটেন্ট, ব্যবহারকারী ও সেটিংস নিয়ন্ত্রণ করতে লগইন করুন।</p>

          <div className="tabs two">
            <button className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>
              লগইন
            </button>
            <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
              নতুন অ্যাকাউন্ট
            </button>
          </div>

          <form className="form" onSubmit={submit}>
            {mode === "signup" && (
              <label className="field">
                <span>নাম</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="আপনার নাম" />
              </label>
            )}
            <label className="field">
              <span>ইমেইল</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label className="field">
              <span>পাসওয়ার্ড</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="row">
              <button className="btn primary" type="submit" disabled={authBusy}>
                {authBusy ? "অপেক্ষা করুন…" : mode === "signin" ? "লগইন" : "অ্যাকাউন্ট খুলুন"}
              </button>
              <Link className="btn ghost" to="/">
                সাইটে ফিরুন
              </Link>
            </div>
            {mode === "signup" && (
              <p className="hint">
                নতুন সাইটে প্রথম অ্যাকাউন্টই এডমিন হয় — অ্যাকাউন্ট খোলার পর «এডমিন দাবি করুন» বোতাম
                আসবে।
              </p>
            )}
          </form>
        </div>
      </Shell>
    );
  }

  if (!profile) {
    return (
      <Shell>
        <div className="auth-gate">
          <h1>প্রোফাইল লোড হচ্ছে…</h1>
        </div>
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell>
        <div className="auth-gate">
          <h1>এডমিন অ্যাক্সেস দরকার</h1>
          <p className="muted">
            লগইন হয়েছে: <strong>{user.email}</strong> — কিন্তু ভূমিকা «{profile.role}»।
          </p>
          <div className="row wrap">
            <button className="btn primary" onClick={onClaim} disabled={claiming}>
              {claiming ? "চেষ্টা করা হচ্ছে…" : "এডমিন দাবি করুন"}
            </button>
            <button className="btn ghost" onClick={signOut}>
              লগআউট
            </button>
            <Link className="btn ghost" to="/">
              সাইটে ফিরুন
            </Link>
          </div>
          {claimMsg && <p className="error">{claimMsg}</p>}
          <p className="hint">
            «এডমিন দাবি করুন» শুধু তখনই কাজ করে যখন সিস্টেমে একজনও এডমিন নেই। একজন এডমিন তৈরি
            হওয়ার পর নতুন এডমিন যোগ করতে সেটিংসের <code>admin_emails</code> তালিকা ব্যবহার হয়।
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <div className="admin">
      <aside className="admin-side">
        <div className="admin-brand">
          <strong>পথচিত্র</strong>
          <small>এডমিন প্যানেল</small>
        </div>
        <nav>
          {ADMIN_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-side-foot">
          <span className="who">{profile.display_name || user.email}</span>
          <Link className="btn ghost sm" to="/">
            সাইট দেখুন
          </Link>
          <button className="btn ghost sm" onClick={signOut}>
            লগআউট
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <Routes>
          <Route index element={<AdminDashboard />} />
          <Route path="districts" element={<AdminDistricts />} />
          <Route path="places" element={<AdminPlaces />} />
          <Route path="upazilas" element={<AdminUpazilas />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="data" element={<AdminData />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </div>
    </div>
  );
}

function Shell({ children }) {
  return <div className="admin-shell">{children}</div>;
}
