import { Link } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { bn } from "../lib/format.js";
import { categoryLabel } from "../lib/format.js";
import { haversineKm, formatKm } from "../lib/geo.js";

/** জেলার কার্ড — মানচিত্রে মার্ক করার বোতামসহ */
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
      <button className="dcard-main" onClick={() => onOpen?.(district)}>
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
      </button>
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

/** গন্তব্যের কার্ড — শুধু দূরত্ব দেখায় (হোটেল/খাবার/ভাড়া নেই) */
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
        <div className="pcard-img">
          <img src={place.image} alt={place.name} loading="lazy" />
        </div>
      )}
      <div className="pcard-body">
        <header>
          <h4>{place.name}</h4>
          <span className="muted">
            {place.district_bn}
            {place.upazila_bn ? ` · ${place.upazila_bn}` : ""}
          </span>
        </header>
        {place.summary && <p className="clamp2">{place.summary}</p>}
        <div className="pcard-tags">
          <span className="chip">{categoryLabel(place.category)}</span>
          {km != null && (
            <span className="chip dist" title="আপনার বর্তমান অবস্থান থেকে সরলরেখার দূরত্ব">
              {formatKm(km)} দূরে
            </span>
          )}
        </div>
        <div className="pcard-actions">
          {onOpen ? (
            <button className="btn ghost sm" onClick={() => onOpen(place)}>
              বিস্তারিত
            </button>
          ) : (
            <Link className="btn ghost sm" to={`/places?focus=${encodeURIComponent(place.id)}`}>
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
