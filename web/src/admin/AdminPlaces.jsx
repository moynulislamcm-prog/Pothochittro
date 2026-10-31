import { useEffect, useMemo, useState } from "react";
import { TABLES, listRows, upsertRow, deleteRow, insertRow } from "./adminApi.js";
import { bn, CATEGORY_ORDER, categoryLabel } from "../lib/format.js";
import { Modal } from "../components/AuthPanel.jsx";

const BLANK = {
  id: "",
  district_id: "",
  upazila_bn: "",
  name: "",
  name_en: "",
  category: "heritage",
  lat: "",
  lon: "",
  summary: "",
  description: "",
  image: "",
  is_published: true,
};

export default function AdminPlaces() {
  const [rows, setRows] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const [p, d] = await Promise.all([listRows(TABLES.places), listRows(TABLES.districts)]);
    if (!p.ok) setError(p.error?.message || "গন্তব্য আনা যায়নি");
    setRows(p.data || []);
    setDistricts(d.data || []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (districtFilter !== "all" && r.district_id !== districtFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.name_en || "").toLowerCase().includes(q) ||
        (r.upazila_bn || "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, districtFilter]);

  function openNew() {
    setEditing({ ...BLANK, district_id: districtFilter !== "all" ? districtFilter : "" });
    setIsNew(true);
  }

  function openEdit(row) {
    setEditing({ ...row, lat: row.lat ?? "", lon: row.lon ?? "", image: row.image || "" });
    setIsNew(false);
  }

  async function save() {
    if (!editing.name.trim()) return setError("নাম দিতে হবে।");
    if (!editing.district_id) return setError("জেলা বেছে নিন।");
    setBusy(true);
    setError("");
    const payload = {
      ...editing,
      name: editing.name.trim(),
      name_en: editing.name_en || "",
      upazila_bn: editing.upazila_bn || "",
      summary: editing.summary || "",
      description: editing.description || "",
      image: editing.image || null,
      lat: editing.lat === "" ? null : Number(editing.lat),
      lon: editing.lon === "" ? null : Number(editing.lon),
      is_published: Boolean(editing.is_published),
      updated_at: new Date().toISOString(),
    };
    const res = isNew
      ? await insertRow(TABLES.places, payload)
      : await upsertRow(TABLES.places, payload, "id");
    setBusy(false);
    if (!res.ok) return setError(res.error?.message || "সংরক্ষণ হয়নি");
    setMsg(isNew ? "নতুন গন্তব্য যোগ হয়েছে।" : "গন্তব্য হালনাগাদ হয়েছে।");
    setEditing(null);
    reload();
  }

  async function remove(row) {
    if (!window.confirm(`«${row.name}» মুছে ফেলবেন?`)) return;
    const res = await deleteRow(TABLES.places, "id", row.id);
    if (!res.ok) setError(res.error?.message || "মুছে ফেলা যায়নি");
    else {
      setMsg("গন্তব্য মুছে ফেলা হয়েছে।");
      reload();
    }
  }

  const dName = (id) => districts.find((d) => d.id === id)?.bn_name || id;

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>গন্তব্য</h1>
          <p>
            {bn(rows.length)}টি গন্তব্য · দেখানো হচ্ছে {bn(filtered.length)}টি। শুধু পরিচিতি, স্থানাঙ্ক ও
            দূরত্ব — হোটেল/খাবার/ভাড়ার কোনো ঘর নেই।
          </p>
        </div>
        <button className="btn primary sm" onClick={openNew}>
          + নতুন গন্তব্য
        </button>
      </header>

      <div className="filters-bar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম দিয়ে খুঁজুন"
          aria-label="গন্তব্য খুঁজুন"
        />
        <select
          value={districtFilter}
          onChange={(e) => setDistrictFilter(e.target.value)}
          aria-label="জেলা ফিল্টার"
        >
          <option value="all">সব জেলা</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.bn_name}
            </option>
          ))}
        </select>
      </div>

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">লোড হচ্ছে…</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>নাম</th>
                <th>জেলা</th>
                <th>উপজেলা</th>
                <th>ধরন</th>
                <th>স্থানাঙ্ক</th>
                <th>প্রকাশ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="cell-name">
                      {r.image && <img src={r.image} alt="" className="thumb" />}
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td>{dName(r.district_id)}</td>
                  <td className="muted">{r.upazila_bn || "—"}</td>
                  <td>{categoryLabel(r.category)}</td>
                  <td className="mono small">
                    {r.lat?.toFixed?.(3)}, {r.lon?.toFixed?.(3)}
                  </td>
                  <td>{r.is_published ? "হ্যাঁ" : "না"}</td>
                  <td className="actions">
                    <button className="btn ghost xs" onClick={() => openEdit(r)}>
                      এডিট
                    </button>
                    <button className="btn danger xs" onClick={() => remove(r)}>
                      মুছুন
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={isNew ? "নতুন গন্তব্য" : `এডিট — ${editing.name}`} onClose={() => setEditing(null)} wide>
          <div className="form-grid">
            <label className="field span2">
              <span>নাম (বাংলা)</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">
              <span>নাম (ইংরেজি)</span>
              <input value={editing.name_en} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} />
            </label>
            <label className="field">
              <span>ধরন</span>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>জেলা</span>
              <select
                value={editing.district_id}
                onChange={(e) => setEditing({ ...editing, district_id: e.target.value })}
              >
                <option value="">বেছে নিন</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.bn_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>উপজেলা / এলাকা</span>
              <input
                value={editing.upazila_bn}
                onChange={(e) => setEditing({ ...editing, upazila_bn: e.target.value })}
              />
            </label>
            <label className="field">
              <span>অক্ষাংশ</span>
              <input value={editing.lat} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} />
            </label>
            <label className="field">
              <span>দ্রাঘিমাংশ</span>
              <input value={editing.lon} onChange={(e) => setEditing({ ...editing, lon: e.target.value })} />
            </label>
            <label className="field span2">
              <span>ছবির পাথ বা লিংক</span>
              <input
                value={editing.image || ""}
                onChange={(e) => setEditing({ ...editing, image: e.target.value })}
                placeholder="/images/1-q1801226.webp অথবা https://…"
              />
            </label>
            {editing.image && (
              <div className="span2 preview-img">
                <img src={editing.image} alt="" />
              </div>
            )}
            <label className="field span2">
              <span>সংক্ষিপ্ত পরিচিতি</span>
              <input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="মুঘল স্থাপত্য"
              />
            </label>
            <label className="field span2">
              <span>বিস্তারিত</span>
              <textarea
                rows={5}
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
              />
            </label>
            <label className="field">
              <span>আইডি</span>
              <input
                value={editing.id}
                onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                disabled={!isNew}
                placeholder="1-q1801226"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={Boolean(editing.is_published)}
                onChange={(e) => setEditing({ ...editing, is_published: e.target.checked })}
              />
              প্রকাশিত
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ"}
            </button>
            <button className="btn ghost" onClick={() => setEditing(null)}>
              বাতিল
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
