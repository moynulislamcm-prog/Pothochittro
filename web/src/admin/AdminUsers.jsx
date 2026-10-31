import { useEffect, useMemo, useState } from "react";
import { TABLES, listRows, updateRow } from "./adminApi.js";
import { bn, bnDateTime } from "../lib/format.js";
import { Modal } from "../components/AuthPanel.jsx";

/** ব্যবহারকারী, তাঁদের ভূমিকা ও ভ্রমণতালিকার পরিসংখ্যান */
export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [visited, setVisited] = useState([]);
  const [marks, setMarks] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const [p, v, m, d] = await Promise.all([
      listRows(TABLES.profiles, { order: { column: "created_at", ascending: false } }),
      listRows(TABLES.visited),
      listRows(TABLES.placeMarks),
      listRows(TABLES.districts),
    ]);
    if (!p.ok) setError(p.error?.message || "ব্যবহারকারী আনা যায়নি");
    setUsers(p.data || []);
    setVisited(v.data || []);
    setMarks(m.data || []);
    setDistricts(d.data || []);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, []);

  const stats = useMemo(() => {
    const map = new Map();
    for (const u of users) {
      map.set(u.id, {
        visited: visited.filter((v) => v.user_id === u.id && v.status === "visited").length,
        wishlist: visited.filter((v) => v.user_id === u.id && v.status === "wishlist").length,
        places: marks.filter((v) => v.user_id === u.id).length,
      });
    }
    return map;
  }, [users, visited, marks]);

  async function toggleRole(u) {
    setBusy(true);
    const next = u.role === "admin" ? "traveler" : "admin";
    const res = await updateRow(TABLES.profiles, "id", u.id, { role: next });
    setBusy(false);
    if (!res.ok) setError(res.error?.message || "ভূমিকা বদলানো যায়নি");
    else {
      setMsg(next === "admin" ? "এডমিন বানানো হয়েছে।" : "ভ্রমণকারী করা হয়েছে।");
      reload();
    }
  }

  const dName = (id) => districts.find((d) => d.id === String(id))?.bn_name || id;

  function openDetail(u) {
    const rows = visited.filter((v) => v.user_id === u.id);
    setDetail({ user: u, rows });
  }

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>ব্যবহারকারী</h1>
          <p>{bn(users.length)} জন নিবন্ধিত · ভূমিকা বদলান ও ভ্রমণতালিকা দেখুন।</p>
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
                <th>নাম / আইডি</th>
                <th>ভূমিকা</th>
                <th>ঘোরা জেলা</th>
                <th>যেতে চান</th>
                <th>গন্তব্য মার্ক</th>
                <th>যোগ দিয়েছেন</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const s = stats.get(u.id) || { visited: 0, wishlist: 0, places: 0 };
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-name">
                        <strong>{u.display_name || "—"}</strong>
                        <span className="mono small">{u.id.slice(0, 8)}…</span>
                      </div>
                    </td>
                    <td>
                      <span className={`role-tag ${u.role}`}>{u.role === "admin" ? "এডমিন" : "ভ্রমণকারী"}</span>
                    </td>
                    <td>{bn(s.visited)}</td>
                    <td>{bn(s.wishlist)}</td>
                    <td>{bn(s.places)}</td>
                    <td className="small muted">{bnDateTime(u.created_at)}</td>
                    <td className="actions">
                      <button className="btn ghost xs" onClick={() => openDetail(u)}>
                        তালিকা
                      </button>
                      <button className="btn ghost xs" onClick={() => toggleRole(u)} disabled={busy}>
                        {u.role === "admin" ? "ভ্রমণকারী করুন" : "এডমিন করুন"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Modal
          title={`${detail.user.display_name || "ব্যবহারকারী"} — ভ্রমণতালিকা`}
          onClose={() => setDetail(null)}
          wide
        >
          {detail.rows.length === 0 ? (
            <p className="muted">এখনো কোনো জেলা মার্ক করা হয়নি।</p>
          ) : (
            <ul className="mini-list">
              {detail.rows
                .sort((a, b) => String(a.status).localeCompare(String(b.status)))
                .map((r) => (
                  <li key={`${r.district_id}-${r.status}`}>
                    <span>
                      {dName(r.district_id)}
                      {r.note ? <em className="muted"> — {r.note}</em> : null}
                    </span>
                    <b className={r.status === "wishlist" ? "amber-text" : ""}>
                      {r.status === "wishlist" ? "যেতে চান" : "ঘুরেছেন"}
                    </b>
                  </li>
                ))}
            </ul>
          )}
        </Modal>
      )}
    </section>
  );
}
