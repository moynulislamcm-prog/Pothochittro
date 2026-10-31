/**
 * উপজেলা-স্তরের সীমানা তৈরির পাইপলাইন
 * ---------------------------------------------------------------
 * উৎস: bd-geojson (npm) → geoBoundaries gbOpen Bangladesh ADM3, CC BY 4.0
 *
 * সমস্যা: ৫৪৪টি ফিচারের মধ্যে ১১৮টির district_id/upazila_id খালি
 * (বেশিরভাগ সিটি কর্পোরেশনের থানা — আদাবর, বাড্ডা, বংশাল ইত্যাদি)।
 * সমাধান: খালিগুলোর কেন্দ্রবিন্দু বের করে আমাদের নিজের ৬৪ জেলা
 * পলিগনের ভেতরে কোনটিতে পড়ে তা দিয়ে জেলা নির্ধারণ করা হয়।
 *
 * আউটপুট: web/public/data/upazila-boundaries.geojson
 * (জেলার সীমানা boundaries.geojson আগের মতোই থাকে — ওভারভিউয়ের জন্য হালকা,
 *  উপজেলার বিস্তারিত সীমানা শুধু জুম করলে লোড হয়)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import simplify from "simplify-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "web", "node_modules", "bd-geojson", "src", "data", "bangladesh.geojson");
const OUT = path.join(root, "web", "public", "data", "upazila-boundaries.geojson");

const districts = JSON.parse(fs.readFileSync(path.join(root, "web", "public", "data", "districts.json"), "utf8"));
const districtBounds = JSON.parse(fs.readFileSync(path.join(root, "web", "public", "data", "boundaries.geojson"), "utf8"));

const districtById = new Map(districts.map((d) => [String(d.id), d]));
const canon = (s) => (typeof s === "string" ? s.normalize("NFC").trim() : "");

/* ------------------------------------------------------------------ */
/* জ্যামিতি সাহায্যকারী                                                */
/* ------------------------------------------------------------------ */
function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function pointInGeometry(pt, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates || [];
    if (!rings.length || !pointInRing(pt, rings[0])) return false;
    return rings.slice(1).every((hole) => !pointInRing(pt, hole));
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((poly) => {
      if (!poly.length || !pointInRing(pt, poly[0])) return false;
      return poly.slice(1).every((hole) => !pointInRing(pt, hole));
    });
  }
  return false;
}

function centroid(geometry) {
  let sumLon = 0, sumLat = 0, n = 0;
  const walk = (arr) => {
    if (typeof arr[0] === "number") { sumLon += arr[0]; sumLat += arr[1]; n++; return; }
    arr.forEach(walk);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return n ? [sumLon / n, sumLat / n] : null;
}

/** আমাদের জেলা পলিগনগুলো থেকে কোন জেলায় পড়ে তা খোঁজে */
const featureById = new Map(districtBounds.features.map((f) => [String(f.properties.id), f]));
function districtForPoint(pt) {
  for (const f of districtBounds.features) {
    if (pointInGeometry(pt, f.geometry)) return String(f.properties.id);
  }
  // পলিগনের বাইরে পড়লে (সীমান্ত/দ্বীপ) নিকটতম জেলা-কেন্দ্র
  let best = null, bestD = Infinity;
  for (const d of districts) {
    const dd = (d.lat - pt[1]) ** 2 + (d.lon - pt[0]) ** 2;
    if (dd < bestD) { bestD = dd; best = String(d.id); }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* জ্যামিতি সরলীকরণ                                                   */
/* ------------------------------------------------------------------ */
function simplifyRing(ring, tol) {
  const pts = ring.map(([x, y]) => ({ x, y }));
  const out = simplify(pts, tol, true);
  // বদ্ধ রিং বজায় রাখা ও ন্যূনতম ৪ বিন্দু নিশ্চিত করা
  const closed = out.length && (out[0].x !== out[out.length - 1].x || out[0].y !== out[out.length - 1].y)
    ? [...out, out[0]]
    : out;
  return closed.length >= 4 ? closed.map((p) => [round6(p.x), round6(p.y)]) : null;
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;

function simplifyGeometry(geom, tol) {
  if (geom.type === "Polygon") {
    const rings = geom.coordinates.map((r) => simplifyRing(r, tol)).filter(Boolean);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = geom.coordinates
      .map((poly) => poly.map((r) => simplifyRing(r, tol)).filter(Boolean))
      .filter((poly) => poly.length);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
}

function countPoints(geom) {
  let n = 0;
  const walk = (a) => { if (typeof a[0] === "number") { n++; return; } a.forEach(walk); };
  if (geom?.coordinates) walk(geom.coordinates);
  return n;
}

/* ------------------------------------------------------------------ */
/* মূল কাজ                                                             */
/* ------------------------------------------------------------------ */
const raw = JSON.parse(fs.readFileSync(SRC, "utf8"));
const TOL = Number(process.argv[2] || 0.0018);

let assigned = 0, byPolygon = 0, byNearest = 0, skipped = 0, emptyId = 0;
const upazilaNames = new Set();
const features = [];

for (const f of raw.features) {
  const p = f.properties || {};
  let districtId = String(p.district_id || "").trim();
  let upazilaId = String(p.upazila_id || "").trim();

  // আইডি খালি হলে কেন্দ্রবিন্দু দিয়ে জেলা নির্ধারণ
  if (!districtId) {
    emptyId++;
    const c = centroid(f.geometry);
    if (!c) { skipped++; continue; }
    const found = districtForPoint(c);
    if (found) {
      districtId = found;
      const hit = pointInGeometry(c, featureById.get(found)?.geometry);
      hit ? byPolygon++ : byNearest++;
      assigned++;
    } else { skipped++; continue; }
  }

  if (!districtById.has(districtId)) { skipped++; continue; }

  const geom = simplifyGeometry(f.geometry, TOL);
  if (!geom) { skipped++; continue; }

  const d = districtById.get(districtId);
  const name = canon(p.name) || canon(p.source_name);
  const bnName = canon(p.bn_name);
  if (bnName) upazilaNames.add(bnName);

  features.push({
    type: "Feature",
    properties: {
      upazila_id: upazilaId || null,
      district_id: districtId,
      district_bn: d.bn_name,
      name,
      bn_name: bnName,
      // যেগুলো মূল ডেটায় জেলা আইডি ছিল না, সেগুলো আমাদের হিসাব করা
      inferred: emptyId > 0 && !String(p.district_id || "").trim(),
    },
    geometry: geom,
  });
}

const out = {
  type: "FeatureCollection",
  // লাইসেন্স শর্ত অনুযায়ী উৎস উল্লেখ (CC BY 4.0)
  attribution: "সীমানা: geoBoundaries (CC BY 4.0), মূল উপাত্ত বাংলাদেশ পরিসংখ্যান ব্যুরো",
  meta: {
    source: "geoBoundaries gbOpen Bangladesh ADM3 (simplified)",
    license: "CC BY 4.0",
    simplifyTolerance: TOL,
    generated: new Date().toISOString().slice(0, 10),
    features: features.length,
  },
  features,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));

const bytes = fs.statSync(OUT).size;
const totalPts = features.reduce((n, f) => n + countPoints(f.geometry), 0);

/* প্রতি জেলায় কয়টি উপজেলা পলিগন পড়ল — কভারেজ যাচাই */
const perDistrict = new Map();
for (const f of features) {
  const id = f.properties.district_id;
  perDistrict.set(id, (perDistrict.get(id) || 0) + 1);
}
const missing = districts.filter((d) => !perDistrict.has(String(d.id)));
const thin = [...perDistrict.entries()].filter(([, n]) => n < 4).map(([id, n]) => `${districtById.get(id)?.bn_name}=${n}`);

console.log(`✓ উপজেলা সীমানা তৈরি: ${features.length}টি ফিচার`);
console.log(`  সহনশীলতা: ${TOL}° | স্থানাঙ্ক-বিন্দু: ${totalPts.toLocaleString("en-US")}`);
console.log(`  ফাইল: ${(bytes / 1024).toFixed(0)} KB (${(bytes / 1048576).toFixed(2)} MB)`);
console.log(`  আইডি ছিল না, নির্ধারণ করা হয়েছে: ${assigned}টি (পলিগন দিয়ে ${byPolygon}, নিকটতম কেন্দ্র দিয়ে ${byNearest})`);
console.log(`  বাদ পড়েছে: ${skipped}টি | অনন্য উপজেলা নাম: ${upazilaNames.size}`);
console.log(`  জেলা কভারেজ: ${perDistrict.size}/৬৪${missing.length ? ` — নেই: ${missing.map((d) => d.bn_name).join(", ")}` : ""}`);
if (thin.length) console.log(`  কম পলিগনযুক্ত জেলা: ${thin.join(", ")}`);
