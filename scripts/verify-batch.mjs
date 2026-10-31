/* ------------------------------------------------------------------ *
 *  ব্যাচ যাচাই — বিল্ডের পরে নতুন গন্তব্যগুলো ঠিকঠাক বসেছে কিনা
 *
 *  ব্যবহার:
 *    node scripts/verify-batch.mjs scripts/places/09-munshiganj-sonarang-a.json
 *    node scripts/verify-batch.mjs <ব্যাচ-ফাইল> [<ব্যাচ-ফাইল> ...]
 *
 *  এই স্ক্রিপ্টটি তৈরি করার কারণ: বিল্ডের পরে "নতুন গন্তব্যগুলো সঠিক
 *  পলিগনের ভেতরে পড়েছে কিনা" যাচাই করতে প্রতিবার হাতে করে একই
 *  point-in-polygon কোড লিখতে হতো, এবং একবার তাতে ভুল হয়েছিল —
 *  ছিদ্রযুক্ত (holed) পলিগনের জন্য `.some((r,i) => i===0 ? inside : !inside)`
 *  যুক্তি ভুল, কারণ কোনো বিন্দু বাইরের রিংয়ের বাইরে কিন্তু ছিদ্রেরও বাইরে
 *  থাকলেও তা সত্য ফেরত দেয়। সেই ভুলের কারণে রাজশাহীর পবা পলিগনকে
 *  সমগ্র জেলা জুড়ে বিস্তৃত মনে হয়েছিল এবং মনে হয়েছিল ইন-পলিগন স্ক্যাটার
 *  ভুল পলিগনে গন্তব্য ফেলছে। বাগটি ছিল ডেটায় নয়, যাচাই কোডে।
 *
 *  সঠিক নিয়ম (even-odd): বিন্দুটিকে বাইরের রিংয়ের ভেতরে থাকতে হবে এবং
 *  কোনো ছিদ্রের (ভেতরের রিং) ভেতরে থাকা যাবে না। MultiPolygon-এর ক্ষেত্রে
 *  যেকোনো একটি অংশে এই শর্ত পূরণ হলেই যথেষ্ট।
 * ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const DATA = path.join(ROOT, "web", "public", "data");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const canon = (s) =>
  typeof s === "string" ? s.normalize("NFC").trim().replace(/[\u200c\u200d]/g, "").replace(/\s+/g, " ") : "";
const key = (s) => canon(s).replace(/[\sঃ.\-–—]/g, "");

/* ------------------------------------------------------------------ *
 *  জ্যামিতি
 * ------------------------------------------------------------------ */

/** একটি রিং (বন্ধ বক্ররেখা)-এর সাপেক্ষে বিন্দুটি ভেতরে কিনা — রশ্মি-ছেদ পদ্ধতি */
function pointInRing(pt, ring) {
  const [lng, lat] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** একটি Polygon-এর coordinates অ্যারে (বাইরের রিং + ছিদ্র)-এর সাপেক্ষে পরীক্ষা */
function pointInPolygonCoords(pt, coords) {
  if (!coords || !coords.length) return false;
  if (!pointInRing(pt, coords[0])) return false; // বাইরের রিংয়ের বাইরে
  for (let i = 1; i < coords.length; i++) {
    if (pointInRing(pt, coords[i])) return false; // কোনো ছিদ্রের ভেতরে
  }
  return true;
}

function pointInGeometry(pt, g) {
  if (!g) return false;
  if (g.type === "Polygon") return pointInPolygonCoords(pt, g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some((c) => pointInPolygonCoords(pt, c));
  return false;
}

/** জ্যামিতির কেন্দ্রবিন্দু (শীর্ষবিন্দুগুলোর গড়) — কেবল তুলনামূলক দূরত্ব মাপার জন্য */
function centroid(g) {
  if (!g) return null;
  const rings = g.type === "Polygon" ? [g.coordinates[0]] : (g.coordinates || []).map((c) => c[0]);
  let sx = 0, sy = 0, n = 0;
  for (const r of rings) for (const c of r) { sx += c[0]; sy += c[1]; n++; }
  return n ? [sy / n, sx / n] : null;
}

const kmBetween = (a, b) =>
  Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * Math.cos((a[0] * Math.PI) / 180));

/* ------------------------------------------------------------------ *
 *  ডেটা
 * ------------------------------------------------------------------ */
const places = read(path.join(DATA, "places.json"));
const districts = read(path.join(DATA, "districts.json"));
const upazilas = read(path.join(DATA, "upazilas.json"));
const boundaries = read(path.join(DATA, "boundaries.geojson"));
const upazilaBounds = read(path.join(DATA, "upazila-boundaries.geojson"));

const districtById = new Map(districts.map((d) => [String(d.id), d]));
const upaIndex = new Map(
  upazilas.map((u) => [`${u.district_id}|${key(u.bn_name)}`, u])
);

const args = process.argv.slice(2);
if (!args.length) {
  console.error("ব্যবহার: node scripts/verify-batch.mjs <ব্যাচ-ফাইল> [...]");
  process.exit(2);
}

let checked = 0;
let problems = 0;
const err = (m) => { console.log("  ✗ " + m); problems++; };
const ok = (m) => console.log("  ✓ " + m);

for (const file of args) {
  const rel = path.relative(ROOT, file);
  console.log("\n=== " + rel + " ===");
  let raw;
  try { raw = read(file); } catch (e) { err("JSON পড়া যায়নি: " + e.message); continue; }
  const list = Array.isArray(raw) ? raw : raw.places;
  if (!Array.isArray(list)) { err("ফাইলে places অ্যারে নেই"); continue; }

  const seenCoords = new Map();
  for (const e of list) {
    checked++;
    const did = String(e.district_id);
    const d = districtById.get(did);
    const label = `${e.name || "(নামহীন)"} [${did}]`;
    const p = places.find((x) => String(x.district_id) === did && key(x.name) === key(e.name));
    if (!p) { err(`${label}: places.json-এ পাওয়া যায়নি — বিল্ডে বাদ পড়েছে`); continue; }

    /* আবশ্যক ঘর */
    const missing = ["slug", "history", "locality", "dist_from_hq_km", "upazila_bn"]
      .filter((f) => p[f] == null || (typeof p[f] === "string" && canon(p[f]) === ""));
    if (missing.length) err(`${label}: ঘর অনুপস্থিত → ${missing.join(", ")}`);

    /* যাচাই-বাকি চিহ্ন */
    if (p.verified !== false) err(`${label}: verified:false নয় (পেলাম ${JSON.stringify(p.verified)})`);
    if (p.coord_verified !== false) err(`${label}: coord_verified:false নয় (পেলাম ${JSON.stringify(p.coord_verified)})`);

    /* স্থানাঙ্ক */
    if (typeof p.lat !== "number" || typeof p.lon !== "number") { err(`${label}: স্থানাঙ্ক নেই`); continue; }
    const ck = `${p.lat},${p.lon}`;
    if (seenCoords.has(ck)) err(`${label}: স্থানাঙ্ক "${seenCoords.get(ck)}"-এর সাথে হুবহু এক — স্ক্যাটার ব্যর্থ`);
    else seenCoords.set(ck, e.name);

    /* জেলার সীমানার ভেতরে কিনা */
    const df = boundaries.features.find((f) => String(f.properties.id) === did);
    const inDistrict = pointInGeometry([p.lon, p.lat], df?.geometry);
    if (!inDistrict) err(`${label}: ${d?.bn_name || did} জেলার সীমানার বাইরে`);

    /* কোন কোন উপজেলা পলিগনে পড়ে (একাধিক হতে পারে — উপরিপাতিত সীমানা) */
    const feats = upazilaBounds.features.filter((f) => String(f.properties.district_id) === did);
    const hits = feats
      .filter((f) => pointInGeometry([p.lon, p.lat], f.geometry))
      .map((f) => f.properties.bn_name || f.properties.name);

    /* ঘোষিত উপজেলার পলিগনে পড়েছে কিনা */
    const declared = e.upazila_bn;
    const u = upaIndex.get(`${did}|${key(declared)}`);
    let upaMatch = "n/a";
    if (!u) {
      upaMatch = "তালিকায় নেই";
    } else {
      const ownPoly = feats.find(
        (f) => key(f.properties.bn_name || "") === key(u.bn_name) || key(f.properties.name || "") === key(u.name || "")
      );
      const inOwn = ownPoly ? pointInGeometry([p.lon, p.lat], ownPoly.geometry) : false;
      upaMatch = inOwn ? "✓ নিজের পলিগনে" : (ownPoly ? "✗ নিজের পলিগনে নয়" : "(পলিগন নেই)");
      if (ownPoly && !inOwn) err(`${label}: ঘোষিত উপজেলা "${declared}"-এর পলিগনের ভেতরে পড়েনি`);
      if (p.upazila_id == null) err(`${label}: upazila_id null, অথচ "${declared}" উপজেলা তালিকায় আছে`);
    }

    const c = centroid(df?.geometry);
    console.log(
      `  ${p.name.padEnd(28)} | ${String(p.upazila_bn).padEnd(14)} | ${String(p.coord_source).padEnd(13)}` +
      ` | ${String(p.dist_from_hq_km).padStart(5)} কিমি | জেলায়=${inDistrict ? "✓" : "✗"}` +
      ` | upazila=${upaMatch} | পলিগন: ${hits.join("/") || "(নেই)"}` +
      (c ? ` | জেলা-কেন্দ্র থেকে ${kmBetween([p.lat, p.lon], c).toFixed(1)} কিমি` : "")
    );
  }
  console.log(`  ব্যাচে ${list.length}টি | পৃথক স্থানাঙ্ক ${seenCoords.size}টি`);
  if (seenCoords.size !== list.length) err(`স্থানাঙ্ক পুনরাবৃত্তি: ${list.length - seenCoords.size}টি`);
}

console.log("\n" + "=".repeat(56));
console.log(`গন্তব্য যাচাই ${checked}টি`);
if (problems === 0) console.log("✓ সব যাচাই পাস করেছে।");
else console.log(`${problems}টি সমস্যা পাওয়া গেছে।`);
process.exit(problems ? 1 : 0);
