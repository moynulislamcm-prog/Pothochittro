import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import MapView from "../components/MapView.jsx";
import AuthPanel from "../components/AuthPanel.jsx";
import { downloadBackup } from "../lib/travel.js";
import { bn } from "../lib/format.js";
import { readLocal } from "../lib/travel.js";

/** আমার ভ্রমণ — ঘোরা জেলা, যেতে চাই, গন্তব্য, নোট, ব্যাকআপ */
export default function MyTravel() {
  const { content, travel, counts, user, profile, setDistrictStatus, setPlaceStatus, saveNote, resetTravel, syncNow } =
    useApp();
  const [tab, setTab] = useState("districts");
  const [selectedId, setSelectedId] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const districts = content?.districts || [];
  const places = content?.places || [];

  const visitedDistricts = useMemo(
    () =>
      Object.entries(travel?.visitedDistricts || {})
        .map(([id, meta]) => ({ d: districts.find((x) => x.id === id), meta }))
        .filter((x) => x.d)
        .sort((a, b) => a.d.bn_name.localeCompare(b.d.bn_name, "bn")),
    [travel, districts],
  );

  const wishlistDistricts = useMemo(
    () =>
      Object.entries(travel?.wishlistDistricts || {})
        .map(([id, meta]) => ({ d: districts.find((x) => x.id === id), meta }))
        .filter((x) => x.d)
        .sort((a, b) => a.d.bn_name.localeCompare(b.d.bn_name, "bn")),
    [travel, districts],
  );

  const visitedPlaces = useMemo(
    () =>
      Object.entries(travel?.visitedPlaces || {})
        .map(([id, meta]) => ({ p: places.find((x) => x.id === id), meta }))
        .filter((x) => x.p),
    [travel, places],
  );
  const wishlistPlaces = useMemo(
    () =>
      Object.entries(travel?.wishlistPlaces || {})
        .map(([id, meta]) => ({ p: places.find((x) => x.id === id), meta }))
        .filter((x) => x.p),
    [travel, places],
  );

  const byDivision = useMemo(() => {
    const map = new Map();
    for (const { d } of visitedDistricts) {
      const key = d.division || "অন্যান্য";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [visitedDistricts]);

  const progress = Math.round((counts.visited / 64) * 100);

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>আমার ভ্রমণ</h1>
          <p>
            {user
              ? `অ্যাকাউন্ট: ${profile?.display_name || user.email}`
              : "গেস্ট মোড — তালিকা এই ব্রাউজারে সংরক্ষিত আছে। লগইন করলে অ্যাকাউন্টে জমা হবে।"}
          </p>
        </div>
        <div className="row wrap">
          {!user && (
            <button className="btn primary sm" onClick={() => setAuthOpen(true)}>
              লগইন / অ্যাকাউন্ট
            </button>
          )}
          {user && (
            <button className="btn ghost sm" onClick={syncNow}>
              সার্ভারে সংরক্ষণ
            </button>
          )}
          <button className="btn ghost sm" onClick={() => downloadBackup(readLocal())}>
            ব্যাকআপ ডাউনলোড
          </button>
          <button className="btn danger sm" onClick={() => setConfirmReset(true)}>
            তালিকা মুছুন
          </button>
        </div>
      </header>

      <section className="block">
        <div className="progress-card">
          <div className="progress-head">
            <strong>
              {bn(counts.visited)} / {bn(64)} জেলা ঘোরা হয়েছে
            </strong>
            <span>{bn(progress)}%</span>
          </div>
          <div className="bar">
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="stat-row">
            <span>
              গন্তব্য দেখা হয়েছে <b>{bn(counts.placesVisited)}</b>
            </span>
            <span>
              যেতে চান <b>{bn(counts.placesWishlist)}</b> গন্তব্য · <b>{bn(counts.wishlist)}</b> জেলা
            </span>
          </div>
          {byDivision.length > 0 && (
            <div className="division-bar">
              {byDivision.map(([name, n]) => (
                <span key={name} className="chip">
                  {name}: {bn(n)}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="tabs three">
        <button className={tab === "districts" ? "active" : ""} onClick={() => setTab("districts")}>
          জেলা ({bn(visitedDistricts.length + wishlistDistricts.length)})
        </button>
        <button className={tab === "places" ? "active" : ""} onClick={() => setTab("places")}>
          গন্তব্য ({bn(visitedPlaces.length + wishlistPlaces.length)})
        </button>
        <button className={tab === "map" ? "active" : ""} onClick={() => setTab("map")}>
          মানচিত্রে দেখুন
        </button>
      </div>

      {tab === "districts" && (
        <section className="block">
          {visitedDistricts.length === 0 && wishlistDistricts.length === 0 ? (
            <div className="empty">
              <p>এখনো কোনো জেলা মার্ক করা হয়নি। মানচিত্র থেকে শুরু করুন।</p>
              <Link className="btn primary sm" to="/">
                মানচিত্রে যান
              </Link>
            </div>
          ) : (
            <div className="travel-cols">
              <ListColumn
                title={`ঘুরেছেন (${bn(visitedDistricts.length)})`}
                items={visitedDistricts}
                kind="visited-district"
                onRemove={(id) => setDistrictStatus(id, null)}
                onNote={saveNote}
                onSelect={setSelectedId}
              />
              <ListColumn
                title={`যেতে চান (${bn(wishlistDistricts.length)})`}
                items={wishlistDistricts}
                kind="wishlist-district"
                tone="amber"
                onRemove={(id) => setDistrictStatus(id, null)}
                onNote={saveNote}
                onSelect={setSelectedId}
              />
            </div>
          )}
        </section>
      )}

      {tab === "places" && (
        <section className="block">
          {visitedPlaces.length === 0 && wishlistPlaces.length === 0 ? (
            <div className="empty">
              <p>পছন্দের গন্তব্যে হার্ট চিহ্নে ক্লিক করে এখানে জমা করুন।</p>
              <Link className="btn primary sm" to="/places">
                গন্তব্যের তালিকা
              </Link>
            </div>
          ) : (
            <div className="travel-cols">
              <ListColumn
                title={`দেখেছি (${bn(visitedPlaces.length)})`}
                items={visitedPlaces.map(({ p, meta }) => ({ d: { id: p.id, bn_name: p.name, division: p.district_bn }, meta }))}
                kind="visited-place"
                onRemove={(id) => setPlaceStatus(id, null)}
                onNote={saveNote}
                linkTo="/places"
              />
              <ListColumn
                title={`যেতে চাই (${bn(wishlistPlaces.length)})`}
                items={wishlistPlaces.map(({ p, meta }) => ({ d: { id: p.id, bn_name: p.name, division: p.district_bn }, meta }))}
                kind="wishlist-place"
                tone="amber"
                onRemove={(id) => setPlaceStatus(id, null)}
                onNote={saveNote}
                linkTo="/places"
              />
            </div>
          )}
        </section>
      )}

      {tab === "map" && (
        <section className="block">
          <MapView
            content={content}
            travel={travel}
            live={null}
            selectedId={selectedId}
            onSelectDistrict={setSelectedId}
            showPlaces
            height="60vh"
          />
        </section>
      )}

      {confirmReset && (
        <div className="modal-backdrop" onClick={() => setConfirmReset(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <h3>তালিকা মুছে ফেলবেন?</h3>
            </div>
            <div className="modal-body">
              <p>সব ভিজিট, সেভ ও নোট মুছে যাবে। আগে ব্যাকআপ নিয়েছেন?</p>
              <div className="row">
                <button className="btn ghost sm" onClick={() => downloadBackup(readLocal())}>
                  ব্যাকআপ নিন
                </button>
                <button
                  className="btn danger sm"
                  onClick={async () => {
                    await resetTravel();
                    setConfirmReset(false);
                  }}
                >
                  হ্যাঁ, মুছে ফেলুন
                </button>
                <button className="btn ghost sm" onClick={() => setConfirmReset(false)}>
                  বাতিল
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {authOpen && <AuthPanel onClose={() => setAuthOpen(false)} />}
    </main>
  );
}

function ListColumn({ title, items, kind, tone = "", onRemove, onNote, onSelect, linkTo }) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState("");

  return (
    <div>
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="muted small">কিছু নেই।</p>
      ) : (
        <ul className={`note-list ${tone}`}>
          {items.map(({ d, meta }) => (
            <li key={d.id}>
              <div className="note-head">
                {linkTo ? (
                  <Link to={`${linkTo}?focus=${encodeURIComponent(d.id)}`}>{d.bn_name}</Link>
                ) : (
                  <button className="link-btn" onClick={() => onSelect?.(d.id)}>
                    {d.bn_name}
                  </button>
                )}
                {d.division && <span className="muted small">{d.division}</span>}
                <button className="remove" aria-label="সরান" onClick={() => onRemove(d.id)}>
                  ✕
                </button>
              </div>
              {editing === d.id ? (
                <div className="note-edit">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    placeholder="যেমন: ভোরের আলোয় জায়গাটা অসাধারণ লাগল…"
                  />
                  <div className="row">
                    <button
                      className="btn primary sm"
                      onClick={() => {
                        onNote(kind, d.id, draft);
                        setEditing(null);
                      }}
                    >
                      সংরক্ষণ
                    </button>
                    <button className="btn ghost sm" onClick={() => setEditing(null)}>
                      বাতিল
                    </button>
                  </div>
                </div>
              ) : (
                <button className="note-toggle" onClick={() => { setEditing(d.id); setDraft(meta?.note || ""); }}>
                  {meta?.note ? meta.note : "নোট যোগ করুন"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
