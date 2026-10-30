import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import MapView from "../components/MapView.jsx";
import LiveLocation from "../components/LiveLocation.jsx";
import PlaceDetail from "../components/PlaceDetail.jsx";
import { bn } from "../lib/format.js";

const BADGES = [
  { at: 1, label: "প্রথম পদচিহ্ন" },
  { at: 8, label: "জেলা অন্বেষক" },
  { at: 16, label: "পথিক" },
  { at: 32, label: "অর্ধেক বাংলাদেশ" },
  { at: 64, label: "৬৪ জেলার বন্ধু" },
];

/** ল্যান্ডিং পেজ — হিরো + মানচিত্র (লাইভ লোকেশন) + আমার ঘোরা জেলা */
export default function Home() {
  const { content, travel, counts, setDistrictStatus, live } = useApp();

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [openPlace, setOpenPlace] = useState(null);
  const [flyTo, setFlyTo] = useState(null);

  const districts = content?.districts || [];
  const places = content?.places || [];

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    for (const d of districts) {
      if (d.bn_name.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
        hits.push({ type: "জেলা", label: d.bn_name, sub: d.division, id: d.id });
    }
    for (const p of places) {
      if (p.name.toLowerCase().includes(q) || (p.name_en || "").toLowerCase().includes(q))
        hits.push({ type: "গন্তব্য", label: p.name, sub: p.district_bn, place: p });
    }
    return hits.slice(0, 6);
  }, [query, districts, places]);

  const selected = districts.find((d) => d.id === selectedId) || null;

  const visitedList = useMemo(
    () =>
      Object.keys(travel?.visitedDistricts || {})
        .map((id) => districts.find((d) => d.id === id))
        .filter(Boolean),
    [travel, districts],
  );
  const wishlistList = useMemo(
    () =>
      Object.keys(travel?.wishlistDistricts || {})
        .map((id) => districts.find((d) => d.id === id))
        .filter(Boolean),
    [travel, districts],
  );

  const nextBadge = BADGES.find((b) => b.at > counts.visited) || null;
  const progress = Math.round((counts.visited / 64) * 100);

  function pickDistrict(id) {
    setSelectedId(id);
    const d = districts.find((x) => x.id === id);
    if (d?.lat != null) setFlyTo({ center: [d.lat, d.lon], zoom: 9 });
  }

  function chooseSuggestion(s) {
    setQuery("");
    if (s.place) {
      pickDistrict(s.place.district_id);
      setOpenPlace(s.place);
    } else {
      pickDistrict(s.id);
    }
  }

  return (
    <main className="page home">
      {/* ---------- ১. হিরো ---------- */}
      <section className="hero">
        <div className="hero-text">
          <span className="kicker">বাংলাদেশের {bn(64)} জেলা · {bn(places.length)} গন্তব্য</span>
          <h1>
            বাংলাদেশটা দেখুন, <em>নিজের পথে।</em>
          </h1>
          <p>
            মানচিত্রে নিজের অবস্থান দেখুন, ঘোরা জেলা মার্ক করুন, আর যেকোনো দুই বিন্দুর দূরত্ব মেপে
            নিন — এক জায়গায়।
          </p>

          <div className="search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="জেলা বা গন্তব্য খুঁজুন — যেমন সাজেক, রাঙামাটি…"
              aria-label="জেলা বা গন্তব্য খুঁজুন"
            />
            <button className="btn primary" onClick={() => suggestions[0] && chooseSuggestion(suggestions[0])}>
              খুঁজুন
            </button>
            {suggestions.length > 0 && (
              <ul className="suggest" role="listbox">
                {suggestions.map((s, i) => (
                  <li key={`${s.type}-${i}`}>
                    <button onClick={() => chooseSuggestion(s)}>
                      <span>{s.label}</span>
                      <em>
                        {s.type} · {s.sub}
                      </em>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="hero-links">
            <Link className="btn ghost" to="/districts">
              ৬৪ জেলা দেখুন
            </Link>
            <Link className="btn ghost" to="/distance">
              দূরত্ব মাপুন
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- ২. মানচিত্র + লাইভ লোকেশন ---------- */}
      <section className="block map-block">
        <div className="block-head">
          <div>
            <h2>মানচিত্রে অন্বেষণ</h2>
            <p>জেলায় ক্লিক করে মার্ক করুন, লাইভ লোকেশন চালু করে দেখুন আপনি কোথায়।</p>
          </div>
          <LiveLocation content={content} compact />
        </div>

        <div className="map-grid">
          <MapView
            content={content}
            travel={travel}
            live={live}
            selectedId={selectedId}
            onSelectDistrict={pickDistrict}
            showPlaces
            onOpenPlace={setOpenPlace}
            flyTo={flyTo}
            height="58vh"
          />

          <aside className="map-side">
            <LiveLocation content={content} onDistrictDetected={(d) => pickDistrict(String(d.id))} />

            {selected ? (
              <div className="side-card">
                <header>
                  <h3>{selected.bn_name}</h3>
                  <span className="muted">
                    {selected.division} বিভাগ · {bn(selected.place_count || 0)} গন্তব্য
                  </span>
                </header>
                {selected.famous && <p className="famous">{selected.famous}</p>}
                <div className="row wrap">
                  <button
                    className={`btn ${travel?.visitedDistricts?.[selected.id] ? "primary" : "ghost"} sm`}
                    onClick={() =>
                      setDistrictStatus(selected.id, travel?.visitedDistricts?.[selected.id] ? null : "visited")
                    }
                  >
                    {travel?.visitedDistricts?.[selected.id] ? "ঘুরেছেন ✓" : "ঘুরেছি"}
                  </button>
                  <button
                    className={`btn ${travel?.wishlistDistricts?.[selected.id] ? "amber" : "ghost"} sm`}
                    onClick={() =>
                      setDistrictStatus(
                        selected.id,
                        travel?.wishlistDistricts?.[selected.id] ? null : "wishlist",
                      )
                    }
                  >
                    {travel?.wishlistDistricts?.[selected.id] ? "যেতে চাই ♡" : "যেতে চাই"}
                  </button>
                  <Link className="btn ghost sm" to={`/districts/${selected.id}`}>
                    নির্দেশিকা
                  </Link>
                </div>
              </div>
            ) : (
              <div className="side-card quiet">
                <h3>একটি জেলা বেছে নিন</h3>
                <p>মানচিত্রে যেকোনো জেলায় ক্লিক করলে এখানে তার তথ্য ও মার্ক করার বোতাম আসবে।</p>
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* ---------- ৩. আমার ঘোরা জেলা ---------- */}
      <section className="block travel-block">
        <div className="block-head">
          <div>
            <h2>আমি যে জেলাগুলো ঘুরেছি</h2>
            <p>আপনার ভ্রমণের অগ্রগতি এই ব্রাউজারে সংরক্ষিত থাকে; লগইন করলে অ্যাকাউন্টেও জমা হয়।</p>
          </div>
          <Link className="btn ghost sm" to="/my-travel">
            আমার ভ্রমণ খুলুন →
          </Link>
        </div>

        <div className="progress-card">
          <div className="progress-head">
            <strong>
              {bn(counts.visited)} / {bn(64)} জেলা
            </strong>
            <span>{bn(progress)}%</span>
          </div>
          <div className="bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="badges">
            {BADGES.map((b) => (
              <span key={b.at} className={`badge ${counts.visited >= b.at ? "earned" : ""}`}>
                {b.label}
                <em>{bn(b.at)}+</em>
              </span>
            ))}
          </div>
          {nextBadge && (
            <p className="hint">
              আর {bn(nextBadge.at - counts.visited)}টি জেলা ঘুরলেই «{nextBadge.label}» ব্যাজ।
            </p>
          )}
        </div>

        {visitedList.length === 0 && wishlistList.length === 0 ? (
          <div className="empty">
            <p>এখনো কোনো জেলা মার্ক করা হয়নি। মানচিত্র থেকে শুরু করুন।</p>
          </div>
        ) : (
          <div className="travel-cols">
            <div>
              <h4>ঘুরেছেন ({bn(visitedList.length)})</h4>
              <ul className="tag-list">
                {visitedList.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => pickDistrict(d.id)}>{d.bn_name}</button>
                    <span
                      className="remove"
                      role="button"
                      tabIndex={0}
                      aria-label={`${d.bn_name} থেকে সরান`}
                      onClick={() => setDistrictStatus(d.id, null)}
                      onKeyDown={(e) => e.key === "Enter" && setDistrictStatus(d.id, null)}
                    >
                      ✕
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4>যেতে চান ({bn(wishlistList.length)})</h4>
              <ul className="tag-list amber">
                {wishlistList.map((d) => (
                  <li key={d.id}>
                    <button onClick={() => pickDistrict(d.id)}>{d.bn_name}</button>
                    <span
                      className="remove"
                      role="button"
                      tabIndex={0}
                      aria-label={`${d.bn_name} থেকে সরান`}
                      onClick={() => setDistrictStatus(d.id, null)}
                      onKeyDown={(e) => e.key === "Enter" && setDistrictStatus(d.id, null)}
                    >
                      ✕
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {openPlace && <PlaceDetail place={openPlace} onClose={() => setOpenPlace(null)} />}
    </main>
  );
}
