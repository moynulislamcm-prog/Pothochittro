import { Modal } from "../components/AuthPanel.jsx";
import { useApp } from "../lib/store.jsx";
import { bn } from "../lib/format.js";
import { categoryLabel } from "../lib/format.js";
import { haversineKm, formatKm, compassLabel, bearingDeg } from "../lib/geo.js";
import { useState } from "react";

/** গন্তব্যের বিস্তারিত — শুধু পরিচিতি ও দূরত্ব */
export default function PlaceDetail({ place, onClose }) {
  const { travel, setPlaceStatus, live, content } = useApp();
  const [tab, setTab] = useState("about");

  if (!place) return null;

  const visited = Boolean(travel?.visitedPlaces?.[place.id]);
  const wished = Boolean(travel?.wishlistPlaces?.[place.id]);
  const district = content?.districts?.find((d) => d.id === place.district_id);

  const fromLive = live && place.lat != null ? haversineKm([live.lat, live.lng], [place.lat, place.lon]) : null;
  const fromDistrict =
    district?.lat != null && place.lat != null
      ? haversineKm([district.lat, district.lon], [place.lat, place.lon])
      : null;
  const direction =
    live && place.lat != null ? compassLabel(bearingDeg([live.lat, live.lng], [place.lat, place.lon])) : null;

  const siblings = (content?.places || [])
    .filter((p) => p.district_id === place.district_id && p.id !== place.id)
    .slice(0, 4);

  return (
    <Modal onClose={onClose} title={place.name} wide>
      <div className="place-detail">
        {place.image && (
          <div className="pd-hero">
            <img src={place.image} alt={place.name} loading="lazy" />
          </div>
        )}

        <div className="pd-meta">
          <span className="chip">{categoryLabel(place.category)}</span>
          <span className="chip">{place.district_bn}</span>
          {place.upazila_bn && <span className="chip">{place.upazila_bn}</span>}
        </div>

        <div className="pd-actions">
          <button
            className={`btn ${visited ? "primary" : "ghost"}`}
            onClick={() => setPlaceStatus(place.id, visited ? null : "visited")}
          >
            {visited ? "দেখেছি ✓" : "দেখেছি"}
          </button>
          <button
            className={`btn ${wished ? "amber" : "ghost"}`}
            onClick={() => setPlaceStatus(place.id, wished ? null : "wishlist")}
          >
            {wished ? "যেতে চাই ♡" : "যেতে চাই"}
          </button>
        </div>

        <div className="tabs two">
          <button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>
            পরিচিতি
          </button>
          <button className={tab === "distance" ? "active" : ""} onClick={() => setTab("distance")}>
            দূরত্ব
          </button>
        </div>

        {tab === "about" && (
          <div className="pd-body">
            {place.description && <p className="lead">{place.description}</p>}
            {place.summary ? (
              <p>{place.summary}</p>
            ) : (
              <p className="muted">এই গন্তব্যের বিস্তারিত পরিচিতি এখনো যোগ করা হয়নি।</p>
            )}
            {place.name_en && <p className="muted small">{place.name_en}</p>}
          </div>
        )}

        {tab === "distance" && (
          <div className="pd-body">
            <dl className="dist-list">
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
                <dt>জেলা সদর থেকে</dt>
                <dd>{fromDistrict != null ? formatKm(fromDistrict) : "—"}</dd>
              </div>
              <div>
                <dt>স্থানাঙ্ক</dt>
                <dd className="mono">
                  {place.lat?.toFixed?.(4)}, {place.lon?.toFixed?.(4)}
                </dd>
              </div>
            </dl>
            <p className="hint">এটি সরলরেখার দূরত্ব — সড়ক বা নৌপথের প্রকৃত দূরত্ব নয়।</p>
          </div>
        )}

        {siblings.length > 0 && (
          <div className="pd-more">
            <h5>এই জেলার আরও গন্তব্য</h5>
            <ul>
              {siblings.map((s) => (
                <li key={s.id}>{s.name}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
