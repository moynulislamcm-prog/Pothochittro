import { useRef, useState } from "react";
import {
  seedFromBundle,
  exportContent,
  importContent,
  downloadJson,
  TABLES,
  listRows,
} from "./adminApi.js";
import { supabase } from "../lib/supabase.js";
import { bn } from "../lib/format.js";

/** সিড / ইমপোর্ট / এক্সপোর্ট — পুরো কনটেন্টের ব্যবস্থাপনা */
export default function AdminData() {
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [counts, setCounts] = useState(null);
  const fileRef = useRef(null);

  async function run(label, fn) {
    setBusy(label);
    setMsg("");
    setError("");
    setProgress(null);
    try {
      const res = await fn();
      setMsg(res || `${label} সম্পন্ন।`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  async function checkCounts() {
    const [d, u, p, b] = await Promise.all([
      listRows(TABLES.districts),
      listRows(TABLES.upazilas),
      listRows(TABLES.places),
      listRows(TABLES.boundaries),
    ]);
    setCounts({
      districts: d.data?.length || 0,
      upazilas: u.data?.length || 0,
      places: p.data?.length || 0,
      boundaries: b.data?.length || 0,
    });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await run("ইমপোর্ট", async () => {
        await importContent(payload, setProgress);
        return "ফাইল থেকে কনটেন্ট ইমপোর্ট হয়েছে।";
      });
    } catch (err) {
      setError(err?.message || "ফাইলটি পড়া যায়নি।");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearContent() {
    if (!window.confirm("পুরো কনটেন্ট মুছে ফেলবেন? এটি ফেরানো যাবে না।")) return;
    await run("মুছে ফেলা", async () => {
      // অপেক্ষাকৃত ছোট টেবিল আগে, তারপর জেলা (ক্যাসকেডে বাকিগুলো মুছে যাবে)
      await supabase.from(TABLES.boundaries).delete().neq("district_id", "");
      await supabase.from(TABLES.places).delete().neq("id", "");
      await supabase.from(TABLES.upazilas).delete().neq("id", "");
      await supabase.from(TABLES.districts).delete().neq("id", "");
      await supabase.from(TABLES.divisions).delete().neq("id", "");
      return "কনটেন্ট মুছে ফেলা হয়েছে। ব্যবহারকারীর ভ্রমণতালিকা অক্ষত আছে।";
    });
  }

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>ইমপোর্ট / এক্সপোর্ট</h1>
          <p>
            পুরো কনটেন্ট এক ক্লিকে ডেটাবেসে তুলুন, JSON হিসেবে নামান, বা নিজের ফাইল থেকে ইমপোর্ট করুন।
          </p>
        </div>
        <button className="btn ghost sm" onClick={checkCounts} disabled={Boolean(busy)}>
          বর্তমান সংখ্যা দেখুন
        </button>
      </header>

      {counts && (
        <div className="stat-grid tight">
          <div className="stat-card">
            <strong>{bn(counts.districts)}</strong>
            <span>জেলা</span>
          </div>
          <div className="stat-card">
            <strong>{bn(counts.upazilas)}</strong>
            <span>উপজেলা</span>
          </div>
          <div className="stat-card">
            <strong>{bn(counts.places)}</strong>
            <span>গন্তব্য</span>
          </div>
          <div className="stat-card">
            <strong>{bn(counts.boundaries)}</strong>
            <span>সীমানা</span>
          </div>
        </div>
      )}

      {progress && (
        <div className="progress-card">
          <div className="progress-head">
            <strong>{progress.label}</strong>
            <span>{bn(progress.pct)}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      <div className="two-col">
        <div className="card">
          <h3>বান্ডিল থেকে সিড</h3>
          <p className="muted">
            রিপোতে থাকা পরিষ্কার ডেটা (৬৪ জেলা, ৪৯২ উপজেলা, ২১৫ গন্তব্য, সীমানা) সরাসরি ডেটাবেসে
            তুলে দেয়। একই বোতাম আবার চাপলেও ডুপ্লিকেট হবে না।
          </p>
          <button
            className="btn primary"
            disabled={Boolean(busy)}
            onClick={() =>
              run("সিড", async () => {
                const r = await seedFromBundle(setProgress);
                return `${bn(r.districts)} জেলা, ${bn(r.upazilas)} উপজেলা, ${bn(r.places)} গন্তব্য ও ${bn(
                  r.boundaries,
                )} সীমানা ঢোকানো হয়েছে।`;
              })
            }
          >
            {busy === "সিড" ? "চলছে…" : "সিড চালান"}
          </button>
        </div>

        <div className="card">
          <h3>এক্সপোর্ট</h3>
          <p className="muted">ডেটাবেসের পুরো কনটেন্ট JSON ফাইলে নামান — ব্যাকআপ বা অন্য সার্ভারে নিতে।</p>
          <button
            className="btn ghost"
            disabled={Boolean(busy)}
            onClick={() =>
              run("এক্সপোর্ট", async () => {
                const data = await exportContent();
                downloadJson(`pothochittro-content-${new Date().toISOString().slice(0, 10)}.json`, data);
                return "এক্সপোর্ট ফাইল ডাউনলোড হয়েছে।";
              })
            }
          >
            {busy === "এক্সপোর্ট" ? "তৈরি হচ্ছে…" : "JSON ডাউনলোড"}
          </button>
        </div>

        <div className="card">
          <h3>ফাইল থেকে ইমপোর্ট</h3>
          <p className="muted">
            আগে এক্সপোর্ট করা (অথবা একই গঠনের) JSON ফাইল বেছে নিন। একই আইডি থাকলে হালনাগাদ হবে, নতুন
            হলে যোগ হবে।
          </p>
          <input ref={fileRef} type="file" accept="application/json" onChange={onFile} disabled={Boolean(busy)} />
        </div>

        <div className="card danger-zone">
          <h3>বিপজ্জনক অঞ্চল</h3>
          <p className="muted">
            সব কনটেন্ট মুছে ফেলে। ব্যবহারকারীর অ্যাকাউন্ট ও ভ্রমণতালিকা মুছবে না, তবে মার্ক করা জেলার
            তথ্য দেখানো যাবে না যতক্ষণ না আবার সিড করা হয়।
          </p>
          <button className="btn danger" disabled={Boolean(busy)} onClick={clearContent}>
            {busy === "মুছে ফেলা" ? "মুছা হচ্ছে…" : "কনটেন্ট মুছে ফেলুন"}
          </button>
        </div>
      </div>
    </section>
  );
}
