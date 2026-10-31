import { useEffect, useMemo, useState } from "react";
import { useApp } from "../lib/store.jsx";
import { findDistrictAt, haversineKm, formatKm } from "../lib/geo.js";
import { bn, bnDateTime } from "../lib/format.js";

/**
 * লাইভ লোকেশন কন্ট্রোল।
 * চালু থাকলে GPS ওয়াচ করে — মানচিত্রে নীল বিন্দু + নির্ভুলতার বৃত্ত দেখায়,
 * আর কোন জেলায় আছেন তা সীমানা থেকে শনাক্ত করে।
 */
export default function LiveLocation({ content, compact = false, onDistrictDetected }) {
  const { live, liveOn, liveError, startLive, stopLive, locateOnce, setDistrictStatus, travel } = useApp();
  const [detecting, setDetecting] = useState(false);

  const boundaries = content?.boundaries;
  const districts = content?.districts || [];

  const detected = useMemo(() => {
    if (!live || !boundaries?.features) return null;
    return findDistrictAt({ lat: live.lat, lng: live.lng }, boundaries);
  }, [live, boundaries]);

  useEffect(() => {
    if (detected?.id) onDistrictDetected?.(detected);
  }, [detected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearest = useMemo(() => {
    if (!live || !districts.length) return null;
    let best = null;
    for (const d of districts) {
      if (d.lat == null || d.lon == null) continue;
      const km = haversineKm([live.lat, live.lng], [d.lat, d.lon]);
      if (km != null && (!best || km < best.km)) best = { district: d, km };
    }
    return best;
  }, [live, districts]);

  async function toggle() {
    if (liveOn) {
      stopLive();
      return;
    }
    setDetecting(true);
    try {
      await locateOnce();
      startLive();
    } catch {
      /* বার্তা store থেকেই দেখানো হয় */
    } finally {
      setDetecting(false);
    }
  }

  const detectedDistrict = detected ? districts.find((d) => d.id === String(detected.id)) : null;
  const alreadyMarked = detectedDistrict ? Boolean(travel?.visitedDistricts?.[detectedDistrict.id]) : false;

  if (compact) {
    return (
      <button
        className={`btn ${liveOn ? "primary live-on" : "ghost"} sm`}
        onClick={toggle}
        disabled={detecting}
        title="লাইভ লোকেশন"
      >
        <span className="dot" aria-hidden="true" />
        {detecting ? "খোঁজা হচ্ছে…" : liveOn ? "লাইভ চালু" : "লাইভ লোকেশন"}
      </button>
    );
  }

  return (
    <div className={`live-card ${liveOn ? "on" : ""}`}>
      <div className="live-head">
        <div>
          <h3>
            <span className="dot" aria-hidden="true" /> লাইভ লোকেশন
          </h3>
          <p>
            {liveOn
              ? "চালু আছে — অবস্থান বদলালে মানচিত্র হালনাগাদ হবে।"
              : "চালু করলে মানচিত্রে আপনার অবস্থান ও কাছের জেলা দেখা যাবে।"}
          </p>
        </div>
        <button className={`btn ${liveOn ? "danger" : "primary"} sm`} onClick={toggle} disabled={detecting}>
          {detecting ? "খোঁজা হচ্ছে…" : liveOn ? "বন্ধ করুন" : "চালু করুন"}
        </button>
      </div>

      {liveError && <p className="error">{liveError}</p>}

      {live && (
        <dl className="live-facts">
          <div>
            <dt>অক্ষাংশ</dt>
            <dd>{live.lat.toFixed(5)}</dd>
          </div>
          <div>
            <dt>দ্রাঘিমাংশ</dt>
            <dd>{live.lng.toFixed(5)}</dd>
          </div>
          <div>
            <dt>নির্ভুলতা</dt>
            <dd>± {bn(Math.round(live.accuracy || 0))} মিটার</dd>
          </div>
          <div>
            <dt>সময়</dt>
            <dd>{bnDateTime(live.at)}</dd>
          </div>
        </dl>
      )}

      {detectedDistrict && (
        <div className="live-detected">
          <div>
            <strong>আপনি এখন {detectedDistrict.bn_name} জেলায়</strong>
            {nearest && <span>জেলা সদর থেকে {formatKm(nearest.km)}</span>}
          </div>
          <button
            className={`btn ${alreadyMarked ? "ghost" : "primary"} sm`}
            disabled={alreadyMarked}
            onClick={() => setDistrictStatus(detectedDistrict.id, "visited")}
          >
            {alreadyMarked ? "ঘোরা হয়েছে ✓" : "ঘুরেছি হিসেবে মার্ক করুন"}
          </button>
        </div>
      )}

      {!detectedDistrict && live && boundaries?.features && (
        <p className="hint">
          {nearest
            ? `সীমানার বাইরে — সবচেয়ে কাছের জেলা ${nearest.district.bn_name} (${formatKm(nearest.km)})।`
            : "এখনো জেলা শনাক্ত করা যায়নি।"}
        </p>
      )}
    </div>
  );
}
