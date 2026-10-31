import { useEffect, useMemo, useState } from "react";
import { TABLES, listRows, upsertRow, deleteRow, insertRow } from "./adminApi.js";
import { bn } from "../lib/format.js";
import { Modal } from "../components/AuthPanel.jsx";

const BLANK = {
  id: "",
  division_id: "",
  bn_name: "",
  name: "",
  lat: "",
  lon: "",
  famous: "",
  summary: "",
  is_published: true,
};

export default function AdminDistricts() {
  const [rows, setRows] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const [d, v] = await Promise.all([
      listRows(TABLES.districts, { order: { column: "id" } }),
      listRows(TABLES.divisions, { order: { column: "sort" } }),
    ]);
    if (!d.ok) setError(d.error?.message || "জেলা আনা যায়নি");
    setRows(d.data || []);
    setDivisions(v.data || []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.bn_name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function save() {
    if (!editing.bn_name.trim() || !editing.name.trim()) {
      setError("বাংলা ও ইংরেজি নাম দুটোই দরকার।");
      return;
    }
    setBusy(true);
    setError("");
    const payload = {
      id: String(editing.id).trim(),
      division_id: editing.division_id || null,
      bn_name: editing.bn_name.trim(),
      name: editing.name.trim(),
      lat: editing.lat === "" ? null : Number(editing.lat),
      lon: editing.lon === "" ? null : Number(editing.lon),
      famous: editing.famous || "",
      summary: editing.summary || "",
      is_published: Boolean(editing.is_published),
    };
    const isNew = !rows.some((r) => r.id === payload.id);
    const res = isNew
      ? await insertRow(TABLES.districts, payload)
      : await upsertRow(TABLES.districts, payload, "id");
    setBusy(false);
    if (!res.ok) {
      setError(res.error?.message || "সংরক্ষণ হয়নি");
      return;
    }
    setMsg(isNew ? "নতুন জেলা যোগ হয়েছে।" : "জেলা হালনাগাদ হয়েছে।");
    setEditing(null);
    reload();
  }

  async function remove(row) {
    if (!window.confirm(`${row.bn_name} জেলা মুছে ফেলবেন? এর গন্তব্য ও উপজেলাও মুছে যাবে।`)) return;
    const res = await deleteRow(TABLES.districts, "id", row.id);
    if (!res.ok) setError(res.error?.message || "মুছে ফেলা যায়নি");
    else {
      setMsg("জেলা মুছে ফেলা হয়েছে।");
      reload();
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>জেলা</h1>
          <p>{bn(rows.length)}টি জেলা · নাম, স্থানাঙ্ক ও পরিচিতি এখান থেকে বদলান।</p>
        </div>
        <div className="row">
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="খুঁজুন"
            aria-label="জেলা খুঁজুন"
          />
          <button className="btn primary sm" onClick={() => setEditing({ ...BLANK })}>
            + নতুন জেলা
          </button>
        </div>
      </header>

      {msg && <p className="ok">{msg}</p>}
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="muted">লোড হচ্ছে…</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>আইডি</th>
                <th>নাম (বাংলা)</th>
                <th>নাম (ইংরেজি)</th>
                <th>বিভাগ</th>
                <th>স্থানাঙ্ক</th>
                <th>প্রকাশ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.id}</td>
                  <td>{r.bn_name}</td>
                  <td className="muted">{r.name}</td>
                  <td>{divisions.find((d) => d.id === r.division_id)?.bn_name || "—"}</td>
                  <td className="mono small">
                    {r.lat?.toFixed?.(3)}, {r.lon?.toFixed?.(3)}
                  </td>
                  <td>{r.is_published ? "হ্যাঁ" : "না"}</td>
                  <td className="actions">
                    <button className="btn ghost xs" onClick={() => setEditing({ ...r })}>
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
        <Modal
          title={rows.some((r) => r.id === editing.id) ? `জেলা এডিট — ${editing.bn_name}` : "নতুন জেলা"}
          onClose={() => setEditing(null)}
          wide
        >
          <div className="form-grid">
            <label className="field">
              <span>আইডি</span>
              <input
                value={editing.id}
                onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                disabled={rows.some((r) => r.id === editing.id)}
                placeholder="১ থেকে ৬৪ এর মধ্যে সংখ্যা"
              />
            </label>
            <label className="field">
              <span>বিভাগ</span>
              <select
                value={editing.division_id || ""}
                onChange={(e) => setEditing({ ...editing, division_id: e.target.value })}
              >
                <option value="">—</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.bn_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>নাম (বাংলা)</span>
              <input value={editing.bn_name} onChange={(e) => setEditing({ ...editing, bn_name: e.target.value })} />
            </label>
            <label className="field">
              <span>নাম (ইংরেজি)</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="field">
              <span>অক্ষাংশ</span>
              <input value={editing.lat ?? ""} onChange={(e) => setEditing({ ...editing, lat: e.target.value })} />
            </label>
            <label className="field">
              <span>দ্রাঘিমাংশ</span>
              <input value={editing.lon ?? ""} onChange={(e) => setEditing({ ...editing, lon: e.target.value })} />
            </label>
            <label className="field span2">
              <span>পরিচিতি লাইন</span>
              <input
                value={editing.famous}
                onChange={(e) => setEditing({ ...editing, famous: e.target.value })}
                placeholder="মুঘল স্থাপত্য · জামদানি"
              />
            </label>
            <label className="field span2">
              <span>বিস্তারিত</span>
              <textarea
                rows={4}
                value={editing.summary}
                onChange={(e) => setEditing({ ...editing, summary: e.target.value })}
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
