import { useEffect, useState } from "react";
import { getSetting, setSetting } from "./adminApi.js";
import { useApp } from "../lib/store.jsx";

/** সাইটের সাধারণ সেটিংস ও এডমিন তালিকা */
export default function AdminSettings() {
  const { notify } = useApp();
  const [site, setSite] = useState({ title: "পথচিত্র", tagline: "বাংলাদেশ, আপনার পথে", updatedLabel: "" });
  const [prefs, setPrefs] = useState({ mapAttribution: true, showFooterStats: true });
  const [adminEmails, setAdminEmails] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const [s, p, a] = await Promise.all([getSetting("site"), getSetting("prefs"), getSetting("admin_emails")]);
      if (s) setSite((prev) => ({ ...prev, ...s }));
      if (p) setPrefs((prev) => ({ ...prev, ...p }));
      if (Array.isArray(a)) setAdminEmails(a);
    })();
  }, []);

  async function save() {
    setBusy(true);
    setMsg("");
    setError("");
    const r1 = await setSetting("site", site);
    const r2 = await setSetting("prefs", prefs);
    const r3 = await setSetting("admin_emails", adminEmails);
    setBusy(false);
    if (!r1.ok || !r2.ok || !r3.ok) {
      setError((r1.error || r2.error || r3.error)?.message || "সংরক্ষণ হয়নি");
      return;
    }
    setMsg("সেটিংস সংরক্ষিত হয়েছে।");
    notify("সেটিংস হালনাগাদ হয়েছে।");
  }

  function addEmail() {
    const e = newEmail.trim().toLowerCase();
    if (!e.includes("@")) return setError("সঠিক ইমেইল দিন।");
    if (adminEmails.includes(e)) return setError("এই ইমেইল আগেই আছে।");
    setAdminEmails([...adminEmails, e]);
    setNewEmail("");
    setError("");
  }

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>সেটিংস</h1>
          <p>সাইটের শিরোনাম, মানচিত্রের আচরণ আর এডমিন তালিকা।</p>
        </div>
        <button className="btn primary sm" onClick={save} disabled={busy}>
          {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ"}
        </button>
      </header>

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="two-col">
        <div className="card">
          <h3>সাইটের পরিচয়</h3>
          <div className="form-grid">
            <label className="field span2">
              <span>শিরোনাম</span>
              <input value={site.title || ""} onChange={(e) => setSite({ ...site, title: e.target.value })} />
            </label>
            <label className="field span2">
              <span>ট্যাগলাইন</span>
              <input value={site.tagline || ""} onChange={(e) => setSite({ ...site, tagline: e.target.value })} />
            </label>
            <label className="field span2">
              <span>হালনাগাদের নোট</span>
              <input
                value={site.updatedLabel || ""}
                onChange={(e) => setSite({ ...site, updatedLabel: e.target.value })}
                placeholder="তথ্য হালনাগাদ: অক্টোবর ২০২৬"
              />
            </label>
          </div>
        </div>

        <div className="card">
          <h3>মানচিত্র ও ফুটার</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.mapAttribution}
              onChange={(e) => setPrefs({ ...prefs, mapAttribution: e.target.checked })}
            />
            মানচিত্রের কোণায় টাইল-প্রদানকারীর ছোট কৃতিত্ব লাইন দেখান
          </label>
          <p className="hint">
            মানচিত্রের টাইল বাইরে থেকে আসে, তাই এই লাইনটি রাখা প্রদানকারীর শর্ত। বাকি সব
            তথ্যসূত্র/লাইসেন্স অংশ সাইট থেকে সরানো হয়েছে।
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.showFooterStats}
              onChange={(e) => setPrefs({ ...prefs, showFooterStats: e.target.checked })}
            />
            ফুটারে সংখ্যা দেখান
          </label>
        </div>

        <div className="card span2">
          <h3>এডমিন তালিকা</h3>
          <p className="muted">
            এই ইমেইল দিয়ে নতুন অ্যাকাউন্ট খুললে সেটি সরাসরি এডমিন ভূমিকা পাবে। আগে থেকে থাকা
            অ্যাকাউন্টের ভূমিকা «ব্যবহারকারী» পেজ থেকে বদলাতে হবে।
          </p>
          <div className="row">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="admin@example.com"
              aria-label="নতুন এডমিন ইমেইল"
              onKeyDown={(e) => e.key === "Enter" && addEmail()}
            />
            <button className="btn ghost sm" onClick={addEmail}>
              যোগ করুন
            </button>
          </div>
          <ul className="tag-list">
            {adminEmails.map((e) => (
              <li key={e}>
                <span className="mono small">{e}</span>
                <button
                  className="remove"
                  aria-label={`${e} সরান`}
                  onClick={() => setAdminEmails(adminEmails.filter((x) => x !== e))}
                >
                  ✕
                </button>
              </li>
            ))}
            {adminEmails.length === 0 && <li className="muted small">তালিকা খালি</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
