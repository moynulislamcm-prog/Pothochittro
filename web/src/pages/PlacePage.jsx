import { useMemo } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import MapView from "../components/MapView.jsx";
import { bn, categoryLabel } from "../lib/format.js";
import { formatKm, haversineKm, compassLabel, bearingDeg } from "../lib/geo.js";
import {
  useDocumentMeta,
  placeLd,
  breadcrumbLd,
  metaDescription,
} from "../lib/seo.js";
import { findPlace, findDistrict, districtPath as dPath, placePath } from "../lib/links.js";

/**
 * একটি গন্তব্যের নিজস্ব পৃষ্ঠা।
 *
 * SEO-র জন্য প্রতিটি গন্তব্যের আলাদা URL, আলাদা title/description,
 * structured data (TouristAttraction + BreadcrumbList) এবং ভেতরের লিংক দরকার —
 * মোডালে সেটা সম্ভব নয়, তাই আলাদা পৃষ্ঠা।
 */
export default function PlacePage() {
  const { slug } = useParams();
  const { content, travel, live, setPlaceStatus } = useApp();

  /* পুরনো লিংক যাতে না ভাঙে, id দিয়েও খোঁজা হয় */
  const place = useMemo(() => findPlace(content?.places, slug), [content, slug]);

  const district = useMemo(
    () => (place ? findDistrict(content?.districts, place.district_id) : null),
    [content, place],
  );

  /* ভেতরের লিংক — একই জেলার আরও গন্তব্য */
  const siblings = useMemo(() => {
    if (!place) return [];
    return (content?.places || [])
      .filter((p) => p.district_id === place.district_id && p.id !== place.id)
      .slice(0, 8);
  }, [content, place]);

  const visited = Boolean(travel?.visitedPlaces?.[place?.id]);
  const wished = Boolean(travel?.wishlistPlaces?.[place?.id]);

  const fromLive =
    live && place?.lat != null ? haversineKm([live.lat, live.lng], [place.lat, place.lon]) : null;
  const direction =
    live && place?.lat != null ? compassLabel(bearingDeg([live.lat, live.lng], [place.lat, place.lon])) : null;

  const historyParas = useMemo(() => {
    const h = place?.history || "";
    return h
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [place]);

  const path = place ? placePath(place) : "/places";
  const districtUrl = dPath(district);

  const jsonLd = useMemo(() => {
    if (!place) return null;
    const pNode = placeLd(place, district);
    const cNode = breadcrumbLd([
      { name: "হোম", path: "/" },
      { name: "গন্তব্যের তালিকা", path: "/places" },
      ...(district ? [{ name: district.bn_name, path: districtUrl }] : []),
      { name: place.name, path },
    ]);
    delete pNode["@context"];
    delete cNode["@context"];
    return { "@context": "https://schema.org", "@graph": [pNode, cNode] };
  }, [place, district, path, districtUrl]);

  useDocumentMeta({
    title: place
      ? `${place.name} — ${district?.bn_name || place.district_bn} জেলার দর্শনীয় স্থান`
      : "গন্তব্য",
    description: place
      ? metaDescription(place.summary || place.description)
      : "বাংলাদেশের দর্শনীয় স্থানের তালিকা",
    path,
    image: place?.image || null,
    jsonLd,
  });

  if (!content) {
    return (
      <main className="page">
        <p className="muted">তথ্য লোড হচ্ছে…</p>
      </main>
    );
  }
  if (!place) return <Navigate to="/places" replace />;

  return (
    <main className="page">
      <nav className="crumbs" aria-label="breadcrumb">
        <Link to="/">হোম</Link> › <Link to="/places">গন্তব্য</Link> ›{" "}
        {district && (
          <>
            <Link to={districtUrl}>{district.bn_name}</Link> ›{" "}
          </>
        )}
        <span>{place.name}</span>
      </nav>

      <article>
        <header className="page-head">
          <div>
            <span className="kicker">
              {place.division_bn ? `${place.division_bn} বিভাগ · ` : ""}
              {district?.bn_name || place.district_bn}
              {place.upazila_bn ? ` · ${place.upazila_bn}` : ""}
            </span>
            <h1>{place.name}</h1>
            <div className="pd-meta">
              <span className="chip">{categoryLabel(place.category)}</span>
              {place.district_id && (
                <Link className="chip" to={districtUrl}>
                  {district?.bn_name || place.district_bn}
                </Link>
              )}
              {place.upazila_bn && <span className="chip">{place.upazila_bn}</span>}
              {place.locality && <span className="chip">{place.locality}</span>}
            </div>
            <div className="pd-verify">
              <span className={`verify-flag ${place.verified === false ? "" : "ok"}`}>
                {place.verified === false ? "তথ্য যাচাই বাকি" : "তথ্য যাচাইকৃত"}
              </span>
              {place.dist_from_hq_km != null && district && (
                <span className="muted small">
                  {district.bn_name} শহর থেকে {formatKm(place.dist_from_hq_km)}
                </span>
              )}
            </div>
            <div className="pd-actions row wrap">
              <button
                className={`btn ${visited ? "primary" : "ghost"} sm`}
                onClick={() => setPlaceStatus(place.id, visited ? null : "visited")}
              >
                {visited ? "দেখেছি ✓" : "দেখেছি"}
              </button>
              <button
                className={`btn ${wished ? "amber" : "ghost"} sm`}
                onClick={() => setPlaceStatus(place.id, wished ? null : "wishlist")}
              >
                {wished ? "যেতে চাই ♡" : "যেতে চাই"}
              </button>
            </div>
          </div>
        </header>

        {place.image && (
          <div className="pd-hero">
            <img src={place.image} alt={`${place.name}, ${district?.bn_name || place.district_bn}`} loading="lazy" />
          </div>
        )}

        {place.summary && (
          <section className="block">
            <p className="summary-text">{place.summary}</p>
          </section>
        )}

        {historyParas.length > 0 && (
          <section className="block">
            <h2>ইতিহাস</h2>
            {historyParas.map((para, i) => (
              <p key={i} className={i === 0 ? "lead" : undefined}>
                {para}
              </p>
            ))}
          </section>
        )}

        {place.description && (
          <section className="block">
            <h2>বিস্তারিত</h2>
            <p>{place.description}</p>
          </section>
        )}

        {!historyParas.length && !place.description && (
          <section className="block">
            <p className="muted">
              এই গন্তব্যের বিস্তারিত বিবরণ এখনো যোগ করা হয়নি। এডমিন প্যানেল → গন্তব্য → এডিট থেকে যোগ করা যাবে।
            </p>
          </section>
        )}

        {(place.how_to_go || place.best_time) && (
          <section className="block">
            {place.how_to_go && (
              <div className="pd-block">
                <h2>কীভাবে যাবেন</h2>
                <p>{place.how_to_go}</p>
              </div>
            )}
            {place.best_time && (
              <div className="pd-block">
                <h2>কখন গেলে ভালো</h2>
                <p>{place.best_time}</p>
              </div>
            )}
          </section>
        )}

        <section className="block">
          <h2>দূরত্ব ও অবস্থান</h2>
          <dl className="dist-list">
            <div>
              <dt>জেলা শহর থেকে</dt>
              <dd>{place.dist_from_hq_km != null ? formatKm(place.dist_from_hq_km) : "—"}</dd>
            </div>
            <div>
              <dt>আপনার অবস্থান থেকে</dt>
              <dd>
                {fromLive != null ? (
                  <>
                    {formatKm(fromLive)} {direction && <em>· {direction} দিকে</em>}
                  </>
                ) : (
                  <span className="muted">লাইভ লোকেশন চালু করুন</span>
                )}
              </dd>
            </div>
            <div>
              <dt>এলাকা</dt>
              <dd>
                {[place.upazila_bn, district?.bn_name, place.division_bn].filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt>স্থানাঙ্ক</dt>
              <dd className="mono">
                {place.lat?.toFixed?.(4)}, {place.lon?.toFixed?.(4)}
              </dd>
            </div>
          </dl>
          <p className="hint">
            জেলা শহর থেকে দূরত্ব সরলরেখায় মাপা — সড়ক বা নৌপথের প্রকৃত দূরত্ব কিছুটা বেশি হতে পারে।
            অবস্থানের উৎস: {place.coord_source || "—"}
          </p>
        </section>

        <section className="block">
          <h2>মানচিত্রে অবস্থান</h2>
          <MapView
            content={content}
            travel={travel}
            live={live}
            selectedId={place.district_id}
            showPlaces
            height="42vh"
            flyTo={{ center: [place.lat, place.lon], zoom: 12 }}
          />
        </section>

        {siblings.length > 0 && (
          <aside className="block">
            <h2>{district?.bn_name || place.district_bn} জেলার আরও দর্শনীয় স্থান</h2>
            <div className="pgrid">
              {siblings.map((s) => (
                <Link className="card link-card" to={placePath(s)} key={s.id}>
                  <strong>{s.name}</strong>
                  <span className="muted small">
                    {categoryLabel(s.category)}
                    {s.dist_from_hq_km != null ? ` · জেলা শহর থেকে ${formatKm(s.dist_from_hq_km)}` : ""}
                  </span>
                </Link>
              ))}
            </div>
            <p className="muted small">
              {district && (
                <Link to={districtUrl}>
                  {district.bn_name} জেলার সবগুলো গন্তব্য দেখুন ({bn(district.place_count || siblings.length + 1)}টি)
                </Link>
              )}
            </p>
          </aside>
        )}
      </article>
    </main>
  );
}
