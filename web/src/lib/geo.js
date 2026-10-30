import { OSRM_URL } from "../config.js";

const R = 6371.0088; // পৃথিবীর গড় ব্যাসার্ধ (কিমি)
const rad = (d) => (d * Math.PI) / 180;

/** দুই স্থানাঙ্কের সরলরেখার দূরত্ব (কিমি) — Haversine */
export function haversineKm(a, b) {
  if (!a || !b) return null;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  if ([lat1, lon1, lat2, lon2].some((n) => typeof n !== "number" || Number.isNaN(n))) return null;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** দূরত্বকে পাঠযোগ্য রূপে */
export function formatKm(km) {
  if (km == null || Number.isNaN(km)) return "—";
  if (km < 1) return `${Math.round(km * 1000)} মিটার`;
  if (km < 10) return `${km.toFixed(1)} কিমি`;
  return `${Math.round(km)} কিমি`;
}

/**
 * সড়কপথের দূরত্ব (OSRM)। পাবলিক ডেমো সার্ভার — না চললে null ফেরত দেয়,
 * তখন সরলরেখার দূরত্বই দেখানো হয়।
 */
export async function roadDistanceKm(from, to, signal) {
  if (!from || !to) return null;
  try {
    const url = `${OSRM_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const json = await res.json();
    const route = json?.routes?.[0];
    if (!route?.distance) return null;
    return { km: route.distance / 1000, minutes: route.duration ? route.duration / 60 : null };
  } catch {
    return null;
  }
}

/** বিন্দু বহুভুজের ভেতরে কি না (ray casting) */
export function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/** MultiPolygon/Polygon জ্যামিতিতে বিন্দু আছে কি না */
export function pointInGeometry(pt, geometry) {
  if (!geometry) return false;
  const [lon, lat] = pt;
  const p = [lon, lat];

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates || [];
    if (!rings.length) return false;
    if (!pointInRing(p, rings[0])) return false;
    return rings.slice(1).every((hole) => !pointInRing(p, hole));
  }

  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((poly) => {
      if (!poly.length) return false;
      if (!pointInRing(p, poly[0])) return false;
      return poly.slice(1).every((hole) => !pointInRing(p, hole));
    });
  }
  return false;
}

/** স্থানাঙ্ক থেকে জেলা শনাক্ত করা */
export function findDistrictAt(latLng, boundaries) {
  if (!latLng || !boundaries?.features) return null;
  const pt = [latLng.lng ?? latLng.lon, latLng.lat];
  for (const f of boundaries.features) {
    if (pointInGeometry(pt, f.geometry)) return f.properties;
  }
  return null;
}

/** জ্যামিতির কেন্দ্র (সহজ গড়) — মার্কার/লেবেল বসাতে */
export function geometryCentroid(geometry) {
  let sumLon = 0;
  let sumLat = 0;
  let n = 0;
  const walk = (arr) => {
    if (typeof arr[0] === "number") {
      sumLon += arr[0];
      sumLat += arr[1];
      n++;
      return;
    }
    arr.forEach(walk);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  if (!n) return null;
  return [sumLat / n, sumLon / n];
}

/** দুই বিন্দুর মাঝের কোণ/দিশা (কম্পাস) */
export function bearingDeg(from, to) {
  const [lat1, lon1] = from;
  const [lat2, lon2] = to;
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function compassLabel(deg) {
  const dirs = ["উত্তর", "উত্তর-পূর্ব", "পূর্ব", "দক্ষিণ-পূর্ব", "দক্ষিণ", "দক্ষিণ-পশ্চিম", "পশ্চিম", "উত্তর-পশ্চিম"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
