import { useEffect, useMemo, useState } from "react";
import { TABLES, listRows, upsertRow, deleteRow, insertRow } from "./adminApi.js";
import { bn } from "../lib/format.js";
import { Modal } from "../components/AuthPanel.jsx";

const BLANK = { id: "", district_id: "", bn_name: "", name: "" };

export default function AdminUpazilas() {
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
    const [u, d] = await Promise.all([listRows(TABLES.upazilas), listRows(TABLES.districts)]);
    if (!u.ok) setError(u.error?.message || "উপজেলা আনা যায়নি");
    setRows(u.data || []);
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
      return r.bn_name.toLowerCase().includes(q) || (r.name || "").toLowerCase().includes(q);
    });
  }, [rows, query, districtFilter]);

  const dName = (id) => districts.find((d) => d.id === id)?.bn_name || id;

  async function save() {
    if (!editing.bn_name.trim()) return setError("বাংলা নাম দিতে হবে।");
    if (!editing.district_id) return setError("জেলা বেছে নিন।");
    if (!String(editing.id).trim()) return setError("আইডি দিতে হবে।");
    setBusy(true);
    setError("");
    const payload = {
      id: String(editing.id).trim(),
      district_id: editing.district_id,
      bn_name: editing.bn_name.trim(),
      name: (editing.name || "").trim(),
    };
    const res = isNew ? await insertRow(TABLES.upazilas, payload) : await upsertRow(TABLES.upazilas, payload, "id");
    setBusy(false);
    if (!res.ok) return setError(res.error?.message || "সংরক্ষণ হয়নি");
    setMsg(isNew ? "উপজেলা যোগ হয়েছে।" : "উপজেলা হালনাগাদ হয়েছে।");
    setEditing(null);
    reload();
  }

  async function remove(row) {
    if (!window.confirm(`${row.bn_name} উপজেলা মুছে ফেলবেন?`)) return;
    const res = await deleteRow(TABLES.upazilas, "id", row.id);
    if (!res.ok) setError(res.error?.message || "মুছে ফেলা যায়নি");
    else {
      setMsg("উপজেলা মুছে ফেলা হয়েছে।");
      reload();
    }
  }

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>উপজেলা</h1>
          <p>{bn(rows.length)}টি উপজেলা · বানান ঠিক করতে বা নতুন যোগ করতে এখান থেকে করুন।</p>
        </div>
        <button
          className="btn primary sm"
          onClick={() => {
            setEditing({ ...BLANK, district_id: districtFilter !== "all" ? districtFilter : "" });
            setIsNew(true);
          }}
        >
          + নতুন উপজেলা
        </button>
      </header>

      <div className="filters-bar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="উপজেলার নাম"
          aria-label="উপজেলা খুঁজুন"
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
                <th>আইডি</th>
                <th>নাম (বাংলা)</th>
                <th>নাম (ইংরেজি)</th>
                <th>জেলা</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mono small">{r.id}</td>
                  <td>{r.bn_name}</td>
                  <td className="muted">{r.name || "—"}</td>
                  <td>{dName(r.district_id)}</td>
                  <td className="actions">
                    <button
                      className="btn ghost xs"
                      onClick={() => {
                        setEditing({ ...r });
                        setIsNew(false);
                      }}
                    >
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
        <Modal title={isNew ? "নতুন উপজেলা" : `এডিট — ${editing.bn_name}`} onClose={() => setEditing(null)}>
          <div className="form-grid">
            <label className="field">
              <span>আইডি</span>
              <input
                value={editing.id}
                onChange={(e) => setEditing({ ...editing, id: e.target.value })}
                disabled={!isNew}
              />
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
              <span>নাম (বাংলা)</span>
              <input value={editing.bn_name} onChange={(e) => setEditing({ ...editing, bn_name: e.target.value })} />
            </label>
            <label className="field">
              <span>নাম (ইংরেজি)</span>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
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
