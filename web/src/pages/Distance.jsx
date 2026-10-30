import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { useApp } from "../lib/store.jsx";
import { MAP_TILE_URL, MAP_ATTRIBUTION, BD_CENTER, BD_BOUNDS } from "../config.js";
import { haversineKm, formatKm, roadDistanceKm, compassLabel, bearingDeg } from "../lib/geo.js";
import { bn } from "../lib/format.js";

/**
 * দূরত্ব মাপা — দুই বিন্দুর সরলরেখার দূরত্ব,
 * চাইলে সড়কপথের আনুমানিক দূরত্বও।
 */
export default function Distance() {
  const { content, live, liveError, locateOnce } = useApp();

  const districts = content?.districts || [];
  const places = content?.places || [];

  const [fromKind, setFromKind] = useState("district");
  const [fromId, setFromId] = useState(districts[0]?.id || "");
  const [toKind, setToKind] = useState("district");
  const [toId, setToId] = useState(districts[1]?.id || "");
  const [pins, setPins] = useState({ from: null, to: null });
  const [road, setRoad] = useState(null);
  const [roadBusy, setRoadBusy] = useState(false);
  const [roadMsg, setRoadMsg] = useState("");
  const [picking, setPicking] = useState(null); // 'from' | 'to' | null

  const holder = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  /* ডেটা লোড হলে ডিফল্ট বাছাই ঠিক করা */
  useEffect(() => {
    if (districts.length && !fromId) setFromId(districts[0].id);
    if (districts.length > 1 && !toId) setToId(districts[1].id);
  }, [districts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- মানচিত্র ---------- */
  useEffect(() => {
    if (!holder.current || map.current) return;
    const m = L.map(holder.current, {
      center: BD_CENTER,
      zoom: 7,
      attributionControl: false,
      preferCanvas: true,
    });
    L.tileLayer(MAP_TILE_URL, { maxZoom: 19, attribution: MAP_ATTRIBUTION }).addTo(m);
    L.control.attribution({ prefix: false }).addTo(m);
    m.fitBounds(BD_BOUNDS);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  const resolvePoint = (kind, id, pin) => {
    if (pin) return pin;
    if (kind === "live" && live) return [live.lat, live.lng];
    if (kind === "district") {
      const d = districts.find((x) => x.id === id);
      return d ? [d.lat, d.lon] : null;
    }
    const p = places.find((x) => x.id === id);
    return p ? [p.lat, p.lon] : null;
  };

  const labelOf = (kind, id, pin) => {
    if (pin) return "মানচিত্রে বাছা বিন্দু";
    if (kind === "live") return "আমার বর্তমান অবস্থান";
    if (kind === "district") return districts.find((x) => x.id === id)?.bn_name || "—";
    return places.find((x) => x.id === id)?.name || "—";
  };

  const fromPt = useMemo(() => resolvePoint(fromKind, fromId, pins.from), [fromKind, fromId, pins.from, districts, places, live]);
  const toPt = useMemo(() => resolvePoint(toKind, toId, pins.to), [toKind, toId, pins.to, districts, places, live]);

  const straightKm = fromPt && toPt ? haversineKm(fromPt, toPt) : null;
  const dir = fromPt && toPt ? compassLabel(bearingDeg(fromPt, toPt)) : null;

  /* ---------- মানচিত্রে লাইন ও মার্কার ---------- */
  useEffect(() => {
    if (!layer.current || !map.current) return;
    layer.current.clearLayers();
    if (!fromPt || !toPt) return;

    const a = L.latLng(fromPt[0], fromPt[1]);
    const b = L.latLng(toPt[0], toPt[1]);

    L.circleMarker(a, { radius: 8, color: "#fff", weight: 3, fillColor: "#175c49", fillOpacity: 1 })
      .bindTooltip("শুরু: " + labelOf(fromKind, fromId, pins.from), { direction: "top" })
      .addTo(layer.current);
    L.circleMarker(b, { radius: 8, color: "#fff", weight: 3, fillColor: "#e5ad52", fillOpacity: 1 })
      .bindTooltip("শেষ: " + labelOf(toKind, toId, pins.to), { direction: "top" })
      .addTo(layer.current);
    L.polyline([a, b], { color: "#175c49", weight: 3, dashArray: "6 6", opacity: 0.85 }).addTo(
      layer.current,
    );
    map.current.fitBounds(L.latLngBounds([a, b]), { padding: [40, 40], maxZoom: 12 });
  }, [fromPt, toPt, fromKind, toKind, fromId, toId, pins]);

  /* ---------- মানচিত্রে ক্লিক করে বিন্দু বাছা ---------- */
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const handler = (e) => {
      if (!picking) return;
      const pt = [e.latlng.lat, e.latlng.lng];
      setPins((p) => ({ ...p, [picking]: pt }));
      setPicking(null);
      if (picking === "from") setFromKind("pin");
      else setToKind("pin");
    };
    m.on("click", handler);
    return () => m.off("click", handler);
  }, [picking]);

  /* ---------- সড়কপথ ---------- */
  const abortRef = useRef(null);
  async function fetchRoad() {
    if (!fromPt || !toPt) return;
    setRoadBusy(true);
    setRoadMsg("");
    setRoad(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const res = await roadDistanceKm(fromPt, toPt, abortRef.current.signal);
    setRoadBusy(false);
    if (res) setRoad(res);
    else setRoadMsg("সড়কপথের তথ্য এখন পাওয়া যায়নি। সরলরেখার দূরত্ব দেখানো হচ্ছে।");
  }

  async function useMyLocation(which) {
    try {
      const pt = await locateOnce();
      setPins((p) => ({ ...p, [which]: null }));
      if (which === "from") {
        setFromKind("live");
      } else {
        setToKind("live");
        setToId("");
      }
    } catch {
      /* বার্তা নোটিশে দেখানো হয় */
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>দূরত্ব মাপুন</h1>
          <p>দুটি বিন্দু বেছে নিন — সরলরেখার দূরত্ব সাথে সাথে, চাইলে সড়কপথের আনুমানিক দূরত্বও।</p>
        </div>
      </header>

      <section className="block dist-grid">
        <div className="dist-panel">
          <PointPicker
            title="কোথা থেকে"
            kind={fromKind}
            id={fromId}
            onKind={setFromKind}
            onId={setFromId}
            districts={districts}
            places={places}
            live={live}
            onPick={() => setPicking("from")}
            picking={picking === "from"}
            onUseMyLocation={() => useMyLocation("from")}
            onClear={() => setPins((p) => ({ ...p, from: null }))}
            hasPin={Boolean(pins.from)}
            accent="start"
          />

          <div className="swap">
            <button
              className="btn ghost sm"
              onClick={() => {
                const k = fromKind;
                const i = fromId;
                const p = pins.from;
                setFromKind(toKind);
                setFromId(toId);
                setPins((s) => ({ ...s, from: pins.to }));
                setToKind(k);
                setToId(i);
                setPins((s) => ({ ...s, to: p }));
              }}
            >
              ⇅ অদলবদল
            </button>
          </div>

          <PointPicker
            title="কোথায় যাবেন"
            kind={toKind}
            id={toId}
            onKind={setToKind}
            onId={setToId}
            districts={districts}
            places={places}
            live={live}
            onPick={() => setPicking("to")}
            picking={picking === "to"}
            onUseMyLocation={() => useMyLocation("to")}
            onClear={() => setPins((p) => ({ ...p, to: null }))}
            hasPin={Boolean(pins.to)}
            accent="end"
          />

          <div className="dist-result">
            <div>
              <span className="muted">সরলরেখার দূরত্ব</span>
              <strong className="big">{formatKm(straightKm)}</strong>
              {dir && <em className="muted">{dir} দিকে</em>}
            </div>
            <button className="btn primary" onClick={fetchRoad} disabled={!fromPt || !toPt || roadBusy}>
              {roadBusy ? "খোঁজা হচ্ছে…" : "সড়কপথের দূরত্ব দেখুন"}
            </button>
          </div>

          {road && (
            <p className="road-note">
              সড়কপথে প্রায় <strong>{formatKm(road.km)}</strong>
              {road.minutes != null && <> · গাড়িতে আনুমানিক {bn(Math.round(road.minutes))} মিনিট</>}
            </p>
          )}
          {roadMsg && <p className="hint">{roadMsg}</p>}
          {liveError && <p className="error">{liveError}</p>}
          <p className="hint">এটি সড়ক বা নৌপথের প্রকৃত দূরত্ব নয় — নদী ও পাহাড়ে পথ অনেক বদলায়।</p>
        </div>

        <div className="map-wrap dist-map" style={{ height: "58vh" }}>
          <div className="map-holder" ref={holder} />
          {picking && <div className="map-hint">মানচিত্রে ক্লিক করে বিন্দু বেছে নিন</div>}
        </div>
      </section>
    </main>
  );
}

function PointPicker({
  title, kind, id, onKind, onId, districts, places, live,
  onPick, picking, onUseMyLocation, onClear, hasPin, accent,
}) {
  return (
    <div className={`picker ${accent}`}>
      <h3>{title}</h3>
      <div className="picker-row">
        <select
          value={kind}
          onChange={(e) => {
            onKind(e.target.value);
            onClear();
          }}
          aria-label={`${title} — ধরন`}
        >
          <option value="district">জেলা</option>
          <option value="place">গন্তব্য</option>
          <option value="live" disabled={!live}>
            আমার বর্তমান অবস্থান {live ? "" : "(লাইভ লোকেশন দরকার)"}
          </option>
          <option value="pin">মানচিত্রে বাছা বিন্দু</option>
        </select>

        {(kind === "district" || kind === "place") && (
          <select value={id} onChange={(e) => onId(e.target.value)} aria-label={`${title} — নাম`}>
            <option value="">নির্বাচন করুন</option>
            {(kind === "district" ? districts : places).map((x) => (
              <option key={x.id} value={x.id}>
                {kind === "district" ? x.bn_name : `${x.name} (${x.district_bn})`}
              </option>
            ))}
          </select>
        )}

        {kind === "pin" && (
          <button className={`btn sm ${picking ? "primary" : "ghost"}`} onClick={onPick}>
            {picking ? "মানচিত্রে ক্লিক করুন…" : hasPin ? "আবার বাছুন" : "বিন্দু বাছুন"}
          </button>
        )}
        {kind === "live" && !live && (
          <button className="btn ghost sm" onClick={onUseMyLocation}>
            লোকেশন চালু করুন
          </button>
        )}
      </div>
    </div>
  );
}
