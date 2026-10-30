import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { PlaceCard } from "../components/Cards.jsx";
import PlaceDetail from "../components/PlaceDetail.jsx";
import MapView from "../components/MapView.jsx";
import { bn } from "../lib/format.js";
import { haversineKm, formatKm } from "../lib/geo.js";

/** এক জেলার নির্দেশিকা — গন্তব্য, উপজেলা ও দূরত্ব */
export default function DistrictDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { content, travel, live, setDistrictStatus } = useApp();
  const [query, setQuery] = useState("");
  const [upazila, setUpazila] = useState("all");
  const [tab, setTab] = useState("places");
  const [openPlace, setOpenPlace] = useState(null);

  const district = content?.districts?.find((d) => d.id === id);

  const places = useMemo(
    () => (content?.places || []).filter((p) => p.district_id === id),
    [content, id],
  );
  const upazilas = useMemo(
    () => (content?.upazilas || []).filter((u) => u.district_id === id),
    [content, id],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => {
      if (upazila !== "all" && (p.upazila_bn || "") !== upazila) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || (p.summary || "").toLowerCase().includes(q);
    });
  }, [places, query, upazila]);

  if (!district) {
    return (
      <main className="page">
        <div className="card notice-card">
          <h2>জেলা পাওয়া যায়নি</h2>
          <Link className="btn primary" to="/districts">
            জেলার তালিকায় ফিরুন
          </Link>
        </div>
      </main>
    );
  }

  const visited = Boolean(travel?.visitedDistricts?.[district.id]);
  const wished = Boolean(travel?.wishlistDistricts?.[district.id]);

  const sorted = [...filtered].sort((a, b) => {
    if (!live) return a.name.localeCompare(b.name, "bn");
    const da = haversineKm([live.lat, live.lng], [a.lat, a.lon]);
    const db = haversineKm([live.lat, live.lng], [b.lat, b.lon]);
    return (da ?? 1e9) - (db ?? 1e9);
  });

  const upazilaNames = [...new Set(places.map((p) => p.upazila_bn).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "bn"),
  );

  return (
    <main className="page">
      <nav className="crumbs">
        <Link to="/">হোম</Link> › <Link to="/districts">৬৪ জেলা</Link> › <span>{district.bn_name}</span>
      </nav>

      <header className="page-head district-head">
        <div>
          <span className="kicker">
            {district.division} বিভাগ · {bn(upazilas.length)}টি উপজেলা
          </span>
          <h1>{district.bn_name}</h1>
          {district.famous && <p className="famous">{district.famous}</p>}
          <div className="row wrap">
            <button
              className={`btn ${visited ? "primary" : "ghost"} sm`}
              onClick={() => setDistrictStatus(district.id, visited ? null : "visited")}
            >
              {visited ? "ঘুরেছেন ✓" : "ঘুরেছি"}
            </button>
            <button
              className={`btn ${wished ? "amber" : "ghost"} sm`}
              onClick={() => setDistrictStatus(district.id, wished ? null : "wishlist")}
            >
              {wished ? "যেতে চাই ♡" : "যেতে চাই"}
            </button>
          </div>
        </div>
        <dl className="fact-grid">
          <div>
            <dt>গন্তব্য</dt>
            <dd>{bn(places.length)}</dd>
          </div>
          <div>
            <dt>উপজেলা</dt>
            <dd>{bn(upazilas.length)}</dd>
          </div>
          <div>
            <dt>জেলা সদর</dt>
            <dd className="mono">
              {district.lat?.toFixed?.(3)}, {district.lon?.toFixed?.(3)}
            </dd>
          </div>
          {live && (
            <div>
              <dt>আপনি এখান থেকে</dt>
              <dd>{formatKm(haversineKm([live.lat, live.lng], [district.lat, district.lon]))}</dd>
            </div>
          )}
        </dl>
      </header>

      {district.summary && (
        <section className="block">
          <p className="summary-text">{district.summary}</p>
        </section>
      )}

      <section className="block">
        <MapView
          content={content}
          travel={travel}
          live={live}
          selectedId={district.id}
          onSelectDistrict={(d) => navigate(`/districts/${d}`)}
          showPlaces
          onOpenPlace={setOpenPlace}
          height="42vh"
        />
      </section>

      <div className="tabs two">
        <button className={tab === "places" ? "active" : ""} onClick={() => setTab("places")}>
          উপজেলা ও স্থান
        </button>
        <button className={tab === "upazilas" ? "active" : ""} onClick={() => setTab("upazilas")}>
          উপজেলার তালিকা
        </button>
      </div>

      {tab === "places" && (
        <section className="block">
          <div className="filters">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="এই জেলায় স্থান খুঁজুন"
              aria-label="স্থান খুঁজুন"
            />
            <select value={upazila} onChange={(e) => setUpazila(e.target.value)} aria-label="উপজেলা">
              <option value="all">সব উপজেলা / এলাকা</option>
              {upazilaNames.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            {live && <span className="muted small">আপনার অবস্থান অনুযায়ী কাছেরটা আগে সাজানো</span>}
          </div>

          {sorted.length === 0 ? (
            <div className="empty">
              <p>এই উপজেলায় এখনো স্থান যোগ হয়নি।</p>
            </div>
          ) : (
            <div className="pgrid">
              {sorted.map((p) => (
                <PlaceCard key={p.id} place={p} live={live} onOpen={setOpenPlace} />
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "upazilas" && (
        <section className="block">
          <ul className="upazila-list">
            {upazilas.map((u) => (
              <li key={u.id}>
                <strong>{u.bn_name}</strong>
                <span className="muted">{u.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openPlace && <PlaceDetail place={openPlace} onClose={() => setOpenPlace(null)} />}
    </main>
  );
}
