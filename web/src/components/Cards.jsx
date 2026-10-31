import { Link } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { bn } from "../lib/format.js";
import { categoryLabel } from "../lib/format.js";
import { haversineKm, formatKm } from "../lib/geo.js";
import { districtPath, placePath } from "../lib/links.js";


/** জেলার কার্ড — শিরোনাম আসল লিংক (SEO), মার্ক করার বোতাম আলাদা */
export function DistrictCard({ district, onOpen }) {
  const { travel, setDistrictStatus } = useApp();
  const visited = Boolean(travel?.visitedDistricts?.[district.id]);
  const wished = Boolean(travel?.wishlistDistricts?.[district.id]);

  const cycle = () => {
    const next = visited ? null : wished ? "visited" : "wishlist";
    setDistrictStatus(district.id, next);
  };

  return (
    <article className={`dcard ${visited ? "visited" : wished ? "wishlist" : ""}`}>
      {/* পুরো কার্ডটি একটি লিংক — ক্রলার ও কীবোর্ড দুটোর জন্যই ভালো */}
      <Link className="dcard-main" to={districtPath(district)} onClick={() => onOpen?.(district)}>
        <header>
          <h4>{district.bn_name}</h4>
          <span className="muted">{district.division || district.division_en}</span>
        </header>
        {district.famous && <p className="famous">{district.famous}</p>}
        <footer>
          <span className="chip">{bn(district.place_count || 0)} গন্তব্য</span>
          {visited && <span className="chip ok">ঘুরেছেন</span>}
          {wished && !visited && <span className="chip soon">যেতে চান</span>}
        </footer>
      </Link>
      <button
        className={`mark-btn ${visited ? "on" : wished ? "wish" : ""}`}
        onClick={cycle}
        title={visited ? "মার্ক সরান" : wished ? "ঘুরেছেন হিসেবে মার্ক" : "যেতে চাই তালিকায় রাখুন"}
        aria-label={visited ? "মার্ক সরান" : "যেতে চাই তালিকায় রাখুন"}
      >
        {visited ? "✓" : "♡"}
      </button>
    </article>
  );
}

/** গন্তব্যের কার্ড — দূরত্ব ও লিংকসহ (হোটেল/খাবার/ভাড়া নেই) */
export function PlaceCard({ place, live, onOpen }) {
  const { travel, setPlaceStatus } = useApp();
  const visited = Boolean(travel?.visitedPlaces?.[place.id]);
  const wished = Boolean(travel?.wishlistPlaces?.[place.id]);

  const km =
    live && place.lat != null && place.lon != null
      ? haversineKm([live.lat, live.lng], [place.lat, place.lon])
      : null;

  return (
    <article className={`pcard ${visited ? "visited" : ""}`}>
      {place.image && (
        <Link className="pcard-img" to={placePath(place)} tabIndex={-1} aria-hidden="true">
          <img src={place.image} alt="" loading="lazy" />
        </Link>
      )}
      <div className="pcard-body">
        <header>
          {/* শিরোনামটি আসল লিংক — প্রতিটি গন্তব্যের নিজস্ব পৃষ্ঠা আছে */}
          <h4>
            <Link to={placePath(place)}>{place.name}</Link>
          </h4>
          <span className="muted">
            {place.district_bn}
            {place.upazila_bn ? ` · ${place.upazila_bn}` : ""}
            {place.locality ? ` · ${place.locality}` : ""}
          </span>
        </header>
        {place.summary && <p className="clamp2">{place.summary}</p>}
        <div className="pcard-tags">
          <span className="chip">{categoryLabel(place.category)}</span>
          {place.dist_from_hq_km != null && (
            <span className="chip dist" title="জেলা শহর থেকে সরলরেখার দূরত্ব">
              জেলা শহর থেকে {formatKm(place.dist_from_hq_km)}
            </span>
          )}
          {km != null && (
            <span className="chip dist" title="আপনার বর্তমান অবস্থান থেকে সরলরেখার দূরত্ব">
              আপনি {formatKm(km)} দূরে
            </span>
          )}
          {place.verified === false && <span className="chip warn">যাচাই বাকি</span>}
        </div>
        <div className="pcard-actions">
          {onOpen ? (
            <button className="btn ghost sm" onClick={() => onOpen(place)}>
              বিস্তারিত
            </button>
          ) : (
            <Link className="btn ghost sm" to={placePath(place)}>
              বিস্তারিত
            </Link>
          )}
          <button
            className={`btn sm ${visited ? "primary" : wished ? "amber" : "ghost"}`}
            onClick={() =>
              setPlaceStatus(place.id, visited ? null : wished ? "visited" : "wishlist")
            }
          >
            {visited ? "দেখেছি ✓" : wished ? "যেতে চাই ♡" : "যেতে চাই"}
          </button>
        </div>
      </div>
    </article>
  );
}
