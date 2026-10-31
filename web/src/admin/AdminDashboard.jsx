import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { adminStats } from "./adminApi.js";
import { bn } from "../lib/format.js";
import { useApp } from "../lib/store.jsx";

export default function AdminDashboard() {
  const { content } = useApp();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminStats()
      .then(setStats)
      .catch((e) => setError(e?.message || "পরিসংখ্যান আনা যায়নি"));
  }, []);

  const cards = stats
    ? [
        { label: "জেলা", value: stats.districts, to: "/admin/districts" },
        { label: "উপজেলা", value: stats.upazilas, to: "/admin/upazilas" },
        { label: "গন্তব্য", value: stats.places, to: "/admin/places" },
        { label: "সীমানা", value: stats.boundaries, to: "/admin/data" },
        { label: "ব্যবহারকারী", value: stats.users, to: "/admin/users" },
        { label: "এডমিন", value: stats.admins, to: "/admin/users" },
        { label: "জেলা মার্ক", value: stats.visited_marks, to: "/admin/users" },
        { label: "গন্তব্য মার্ক", value: stats.place_marks, to: "/admin/users" },
      ]
    : [];

  return (
    <section className="admin-page">
      <header className="admin-head">
        <div>
          <h1>ড্যাশবোর্ড</h1>
          <p>সাইটের সব কনটেন্ট ও ব্যবহারকারীর সংক্ষিপ্ত চিত্র।</p>
        </div>
        <Link className="btn primary sm" to="/admin/data">
          ডেটা ইমপোর্ট / সিড
        </Link>
      </header>

      {error && <p className="error">{error}</p>}
      {!stats && !error && <p className="muted">লোড হচ্ছে…</p>}

      {stats && (
        <>
          <div className="stat-grid">
            {cards.map((c) => (
              <Link key={c.label} className="stat-card" to={c.to}>
                <strong>{bn(c.value)}</strong>
                <span>{c.label}</span>
              </Link>
            ))}
          </div>

          <div className="two-col">
            <div className="card">
              <h3>সবচেয়ে বেশি ঘোরা জেলা</h3>
              {stats.most_visited?.length ? (
                <ul className="mini-list">
                  {stats.most_visited.map((m) => {
                    const d = content?.districts?.find((x) => x.id === String(m.district_id));
                    return (
                      <li key={m.district_id}>
                        <span>{d?.bn_name || m.district_id}</span>
                        <b>{bn(m.n)}</b>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="muted">এখনো কেউ জেলা মার্ক করেননি।</p>
              )}
            </div>

            <div className="card">
              <h3>দ্রুত কাজ</h3>
              <ul className="quick-actions">
                <li>
                  <Link to="/admin/places">নতুন গন্তব্য যোগ করুন</Link>
                </li>
                <li>
                  <Link to="/admin/districts">জেলার নাম বা স্থানাঙ্ক বদলান</Link>
                </li>
                <li>
                  <Link to="/admin/upazilas">উপজেলা ঠিক করুন</Link>
                </li>
                <li>
                  <Link to="/admin/data">পুরো ডেটা এক্সপোর্ট করুন</Link>
                </li>
                <li>
                  <Link to="/admin/settings">সাইটের শিরোনাম ও এডমিন তালিকা</Link>
                </li>
              </ul>
              {stats.districts === 0 && (
                <p className="warn">
                  ডেটাবেসে এখনো কনটেন্ট নেই। <Link to="/admin/data">ইমপোর্ট / সিড</Link> পেজ থেকে এক
                  ক্লিকে পুরো ডেটা ঢুকিয়ে নিন।
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
