#!/usr/bin/env node
/**
 * পথচিত্র — ডেটা পাইপলাইন
 *
 * কাজ:
 *  ১. পুরনো বিল্ড করা HTML থেকে এমবেডেড ডেটা বের করা
 *  ২. বানান সংশোধন প্রয়োগ করা (scripts/corrections.json)
 *  ৩. হোটেল / খাবার / দাম / যাতায়াত ভাড়া — সব বাদ দেওয়া (শুধু দূরত্ব থাকে)
 *  ৪. উৎস/অ্যাট্রিবিউশন তথ্য সাইটের ডেটা থেকে বাদ দেওয়া
 *  ৫. ছবিগুলো আলাদা .webp ফাইলে লেখা
 *  ৬. ওয়েব + Supabase সিড — দুই জায়গার জন্য পরিষ্কার JSON তৈরি
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_HTML = path.join(root, "legacy", "pathchitro-website-v1.html");
const RAW = path.join(root, ".extract", "raw.json");
const OUT_WEB = path.join(root, "web", "public", "data");
const OUT_IMG = path.join(root, "web", "public", "images");
const OUT_SEED = path.join(root, "data", "seed");

const corrections = JSON.parse(
  fs.readFileSync(path.join(root, "scripts", "corrections.json"), "utf8"),
);

/* ------------------------------------------------------------------ */
/* ১. কাঁচা ডেটা                                                        */
/* ------------------------------------------------------------------ */
function loadRaw() {
  if (fs.existsSync(RAW)) return JSON.parse(fs.readFileSync(RAW, "utf8"));
  const html = fs.readFileSync(SRC_HTML, "utf8");
  const marker = '<script id="pathchitro-data" type="application/json">';
  const i = html.indexOf(marker);
  if (i < 0) throw new Error("এমবেডেড ডেটা ব্লক পাওয়া যায়নি");
  const j = html.indexOf("</script>", i);
  return JSON.parse(html.slice(i + marker.length, j));
}

const raw = loadRaw();

/* ------------------------------------------------------------------ */
/* ২. সাহায্যকারী ফাংশন                                                */
/* ------------------------------------------------------------------ */
/**
 * ক্যানোনিকাল রূপ: NFC + জিরো-উইডথ ক্যারেক্টার বাদ + স্পেস ঠিক করা।
 * বাংলায় "ড়" দুইভাবে এনকোড হতে পারে (U+09DC অথবা U+09A1+U+09BC),
 * তাই তুলনা ও আউটপুট — দুটোই NFC-তে এক করা দরকার।
 */
const canon = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[\u200B-\u200F\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const norm = canon;

/** সংশোধন ম্যাপের কীগুলোও ক্যানোনিকাল রূপে নিয়ে নেওয়া */
function canonMap(map) {
  if (!map) return {};
  const out = {};
  for (const [k, v] of Object.entries(map)) out[canon(k)] = canon(v);
  return out;
}

const DISTRICT_FIX = canonMap(corrections.districts);
const UPAZILA_FIX = canonMap(corrections.upazilas);
const PLACE_FIX = canonMap(corrections.places);
const TEXT_FIXES = (corrections.textFixes || []).map((t) => ({ from: canon(t.from), to: canon(t.to) }));
const UPAZILA_BY_DISTRICT = Object.fromEntries(
  Object.entries(corrections.upazilasByDistrict || {}).map(([d, m]) => [canon(d), canonMap(m)]),
);

const fixLog = [];
function record(kind, from, to, where) {
  const f = norm(from);
  const t = norm(to);
  if (!f || f === t) return t || f;
  fixLog.push({ kind, from: f, to: t, where: where || "" });
  return t;
}

function applyMap(map, value, kind, where) {
  const key = norm(value);
  if (map && Object.prototype.hasOwnProperty.call(map, key)) {
    return record(kind, key, map[key], where);
  }
  return key;
}

/* সাধারণ টেক্সট ফিক্স (বর্ণনা/ট্যাগলাইনের ভেতরে) */
function fixText(value) {
  let out = norm(value);
  for (const { from, to } of TEXT_FIXES) {
    if (from && out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ৩. জেলা                                                             */
/* ------------------------------------------------------------------ */
const districtById = new Map();
const districts = raw.districts.map((d) => {
  const byId = (corrections.districtsById || {})[String(d.id)] || {};
  let bn = applyMap(DISTRICT_FIX, d.bn_name, "জেলা", `id=${d.id}`);
  let en = norm(d.name);
  if (byId.bn_name) bn = record("জেলা", bn, byId.bn_name, `id=${d.id}`);
  if (byId.name) en = record("জেলা (ইংরেজি)", en, byId.name, `id=${d.id}`);

  const clean = {
    id: String(d.id),
    division_id: String(d.division_id ?? ""),
    bn_name: bn,
    name: en,
    division: norm(d.division),
    division_en: norm(d.divisionEn),
    lat: Number(d.lat),
    lon: Number(d.long ?? d.lon),
    famous: fixText(d.famous || ""),
    summary: fixText(d.summary || ""),
  };
  districtById.set(clean.id, clean);
  return clean;
});

/* ------------------------------------------------------------------ */
/* ৪. উপজেলা                                                           */
/* ------------------------------------------------------------------ */
const upazilas = [];
const seenUpazila = new Set();
let droppedDupes = 0;

for (const u of raw.upazilas) {
  const districtEn = norm(u.districtName);
  let bn = applyMap(UPAZILA_FIX, u.bn_name, "উপজেলা", districtEn);
  const scoped = UPAZILA_BY_DISTRICT[districtEn];
  if (scoped) bn = applyMap(scoped, bn, "উপজেলা", districtEn);

  const key = `${u.district_id}|${bn}`;
  if (seenUpazila.has(key)) {
    droppedDupes++;
    continue;
  }
  seenUpazila.add(key);

  upazilas.push({
    id: String(u.id),
    district_id: String(u.district_id),
    district_en: districtEn,
    name: norm(u.name),
    bn_name: bn,
  });
}

/* উপজেলার সংশোধিত নাম জেলায়ও প্রতিফলিত করা */
const upazilaNameByDistrictEn = new Map();
for (const u of upazilas) {
  if (!upazilaNameByDistrictEn.has(u.district_en)) upazilaNameByDistrictEn.set(u.district_en, new Map());
  upazilaNameByDistrictEn.get(u.district_en).set(norm(u.name), u.bn_name);
}

/* ------------------------------------------------------------------ */
/* ৫. ছবি                                                              */
/* ------------------------------------------------------------------ */
fs.rmSync(OUT_IMG, { recursive: true, force: true });
fs.mkdirSync(OUT_IMG, { recursive: true });

const credits = raw["image-credits"] || {};
const licenseRows = [];
let imageCount = 0;

const skippedImages = [];
for (const [placeId, meta] of Object.entries(credits)) {
  if (!meta || typeof meta.file !== "string") continue;
  const m = /^data:image\/(\w+);base64,(.*)$/s.exec(meta.file);
  if (!m) {
    /* বেস৬৪ নয় — পুরনো সাইটের একটি ছবি শুধু পাথ-রেফারেন্স ছিল, ফাইলটি পাওয়া যায়নি */
    skippedImages.push({ placeId, ref: meta.file });
    continue;
  }
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const file = `${placeId}.${ext}`;
  fs.writeFileSync(path.join(OUT_IMG, file), Buffer.from(m[2], "base64"));
  imageCount++;
  licenseRows.push({
    placeId,
    title: meta.title || "",
    artist: meta.artist || "",
    license: meta.license || "",
    licenseUrl: meta.licenseUrl || "",
    sourceUrl: meta.sourceUrl || "",
  });
}

/* ------------------------------------------------------------------ */
/* ৬. গন্তব্য                                                          */
/* ------------------------------------------------------------------ */
const places = raw.places.map((p) => {
  const district = districtById.get(String(p.district)) || {};
  const name = applyMap(PLACE_FIX, p.name, "স্থান", district.bn_name || "");
  const districtEn = norm(p.enDistrict);

  let upazilaName = norm(p.upazilaName);
  const scopedUp = upazilaNameByDistrictEn.get(districtEn);
  if (scopedUp && scopedUp.has(upazilaName)) upazilaName = scopedUp.get(upazilaName);
  else if (UPAZILA_FIX[upazilaName]) upazilaName = UPAZILA_FIX[upazilaName];

  const credit = credits[p.id];
  let image = null;
  if (credit && typeof credit.file === "string") {
    const mm = /^data:image\/(\w+);base64,/s.exec(credit.file);
    if (mm) {
      const ext = mm[1] === "jpeg" ? "jpg" : mm[1];
      if (fs.existsSync(path.join(OUT_IMG, `${p.id}.${ext}`))) image = `/images/${p.id}.${ext}`;
    }
  }

  return {
    id: norm(p.id),
    district_id: String(p.district),
    district_bn: district.bn_name || norm(p.districtName),
    district_en: districtEn,
    name,
    name_en: norm(p.enName),
    category: norm(p.category),
    lat: p.lat == null || p.lat === "null" ? null : Number(p.lat),
    lon: p.lon == null || p.lon === "null" ? null : Number(p.lon),
    upazila_id: norm(p.upazila) === "null" || norm(p.upazila) === "" ? null : norm(p.upazila),
    upazila_bn: upazilaName || null,
    summary: fixText(p.summary || ""),
    description: fixText(p.description || ""),
    image,
  };
});

/* জেলার গন্তব্য সংখ্যা নতুন করে গুনে দেওয়া */
for (const d of districts) {
  d.place_count = places.filter((p) => p.district_id === d.id).length;
}

/* ------------------------------------------------------------------ */
/* ৭. সীমানা                                                           */
/* ------------------------------------------------------------------ */
const boundaries = {
  type: "FeatureCollection",
  features: (raw.boundaries.features || []).map((f) => ({
    type: "Feature",
    properties: {
      id: String(f.properties.id),
      name: fixText(f.properties.name),
      name_en: norm(f.properties.en),
    },
    geometry: f.geometry,
  })),
};

/* সীমানার নামও জেলার সংশোধনের সাথে মেলানো */
for (const f of boundaries.features) {
  const d = districtById.get(f.properties.id);
  if (d) {
    f.properties.name = d.bn_name;
    f.properties.name_en = d.name;
  }
}

/* ------------------------------------------------------------------ */
/* ৮. আউটপুট                                                           */
/* ------------------------------------------------------------------ */
fs.mkdirSync(OUT_WEB, { recursive: true });
fs.mkdirSync(OUT_SEED, { recursive: true });

const divisions = [...new Map(districts.map((d) => [d.division_id, {
  id: d.division_id, bn_name: d.division, name: d.division_en,
}])).values()];

const outFiles = {
  districts,
  divisions,
  places,
  upazilas,
};

for (const [name, value] of Object.entries(outFiles)) {
  fs.writeFileSync(path.join(OUT_WEB, `${name}.json`), JSON.stringify(value));
  fs.writeFileSync(path.join(OUT_SEED, `${name}.json`), JSON.stringify(value, null, 0));
}
fs.writeFileSync(path.join(OUT_WEB, "boundaries.geojson"), JSON.stringify(boundaries));
fs.writeFileSync(path.join(OUT_SEED, "boundaries.json"), JSON.stringify(boundaries.features));

/* বাদ দেওয়া অংশের হিসাব */
const droppedGuides = (raw.guides || []).length;

/* ------------------------------------------------------------------ */
/* ৮ক. স্থানাঙ্ক নিরীক্ষা                                                */
/* ------------------------------------------------------------------ */
/* কোন গন্তব্যের স্থানাঙ্ক তার নিজের জেলার সীমানার বাইরে পড়লে সেটি তালিকাভুক্ত
   হয় — এডমিন প্যানেল থেকে ঠিক করার জন্য। নাম অনুমান করে বদলানো হয় না। */
function pointInRing(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInGeometry(pt, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates || [];
    if (!rings.length || !pointInRing(pt, rings[0])) return false;
    return rings.slice(1).every((h) => !pointInRing(pt, h));
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates || []).some((poly) =>
      poly.length && pointInRing(pt, poly[0]) && poly.slice(1).every((h) => !pointInRing(pt, h)),
    );
  }
  return false;
}

const featureById = new Map(boundaries.features.map((f) => [f.properties.id, f]));
const coordIssues = [];
for (const pl of places) {
  if (pl.lat == null || pl.lon == null) continue;
  const pt = [pl.lon, pl.lat];
  const own = featureById.get(pl.district_id);
  if (own && pointInGeometry(pt, own.geometry)) continue;

  let detected = null;
  for (const f of boundaries.features) {
    if (f.properties.id === pl.district_id) continue;
    if (pointInGeometry(pt, f.geometry)) { detected = f.properties.name; break; }
  }
  coordIssues.push({
    name: pl.name,
    id: pl.id,
    district: pl.district_bn,
    upazila: pl.upazila_bn || "—",
    lat: pl.lat,
    lon: pl.lon,
    detected,
  });
}

/* জল/উপকূল/সীমান্তবর্তী গন্তব্য আলাদা করা — এগুলো সাধারণত স্বাভাবিক */
const watery = /(নদী|সমুদ্র|সৈকত|দ্বীপ|সুন্দরবন|হাওর|বিল|লেক|ঝর্ণা|জলাবন|ঘাট|সেতু|ব্রিজ|খাল)/;
const realSuspects = coordIssues.filter((c) => !watery.test(c.name));

let audit = `# পথচিত্র — স্থানাঙ্ক নিরীক্ষা\n\n`;
audit += `মোট ${places.length}টি গন্তব্যের মধ্যে **${coordIssues.length}**টির স্থানাঙ্ক নিজের জেলার সীমানার বাইরে পড়ে।\n`;
audit += `এর মধ্যে ${coordIssues.length - realSuspects.length}টি নদী/সমুদ্র/দ্বীপ/সীমান্তবর্তী — যেগুলো স্বাভাবিকভাবেই সীমানার বাইরে পড়ে।\n\n`;
audit += `## খতিয়ে দেখার মতো (${realSuspects.length}টি)\n\n`;
audit += `| গন্তব্য | ডেটায় জেলা | উপজেলা | স্থানাঙ্ক | মানচিত্রে পড়ছে |\n|---|---|---|---|---|\n`;
for (const c of realSuspects) {
  audit += `| ${c.name} | ${c.district} | ${c.upazila} | ${c.lat}, ${c.lon} | ${c.detected || "সব সীমানার বাইরে"} |\n`;
}
audit += `\n## স্বাভাবিক (নদী/উপকূল/সীমান্তবর্তী)\n\n`;
audit += `| গন্তব্য | ডেটায় জেলা | পড়ছে |\n|---|---|---|\n`;
for (const c of coordIssues.filter((x) => watery.test(x.name))) {
  audit += `| ${c.name} | ${c.district} | ${c.detected || "সীমানার বাইরে"} |\n`;
}
audit += `\n> এগুলো এডমিন প্যানেল → গন্তব্য → এডিট থেকে ঠিক করা যাবে।\n`;
fs.writeFileSync(path.join(root, "data", "COORDINATE_REVIEW.md"), audit);

/* সংশোধন প্রতিবেদন */
const uniq = new Map();
for (const f of fixLog) {
  const k = `${f.kind}|${f.from}`;
  if (!uniq.has(k)) uniq.set(k, { ...f, count: 1 });
  else uniq.get(k).count++;
}
const rows = [...uniq.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.from.localeCompare(b.from));

let report = `# পথচিত্র — বানান সংশোধন প্রতিবেদন\n\n`;
report += `মোট সংশোধন: **${fixLog.length}** টি জায়গায়, **${rows.length}** রকম নাম।\n\n`;
report += `| ধরন | আগে | পরে | কতবার |\n|---|---|---|---|\n`;
for (const r of rows) report += `| ${r.kind} | ${r.from} | ${r.to} | ${r.count} |\n`;
report += `\n## যেসব নাম আপনার নিজের দেখা দরকার\n\n`;
report += `- **শ্রী শ্রী দয়াময়ী মন্দির** (জামালপুর) — মূল ডেটায় "শ্রী শ্রী রীঁ দয়াময়ী মন্দির" লেখা ছিল, "রীঁ" অংশটি অস্পষ্ট বলে বাদ দেওয়া হয়েছে।\n`;
report += `- **নাটোর** জেলার উপজেলা তালিকায় "নাটোর সদর" ও "বড়াইগ্রাম" দুইবার ছিল — ডুপ্লিকেট বাদ দেওয়া হয়েছে (${droppedDupes} টি)।\n`;
report += `- বাকি যেকোনো নাম এডমিন প্যানেল থেকে সরাসরি বদলানো যাবে।\n`;
fs.writeFileSync(path.join(root, "data", "SPELLING_FIXES.md"), report);

/* ছবির লাইসেন্স রেকর্ড (সাইটে দেখানো হবে না, শুধু রিপোতে থাকবে) */
let lic = `# ছবির লাইসেন্স রেকর্ড\n\n`;
lic += `এই তালিকাটি শুধু রিপোজিটরির রেকর্ড — ওয়েবসাইটে কোথাও দেখানো হয় না।\n\n`;
lic += `মোট ছবি: ${imageCount} টি।\n\n| place id | শিরোনাম | শিল্পী | লাইসেন্স |\n|---|---|---|---|\n`;
for (const r of licenseRows) lic += `| ${r.placeId} | ${r.title} | ${r.artist} | ${r.license} |\n`;
fs.writeFileSync(path.join(root, "data", "IMAGE_LICENSES.md"), lic);

console.log("— পথচিত্র ডেটা তৈরি —");
console.log("জেলা      :", districts.length);
console.log("উপজেলা    :", upazilas.length, `(ডুপ্লিকেট বাদ: ${droppedDupes})`);
console.log("গন্তব্য    :", places.length);
console.log("সীমানা    :", boundaries.features.length);
console.log("ছবি       :", imageCount);
console.log("বাদ দেওয়া  :", droppedGuides, "টি হোটেল/খাবার/ভাড়া রেকর্ড + সব উৎস/অ্যাট্রিবিউশন তথ্য");
if (skippedImages.length)
  console.log("ছবি নেই     :", skippedImages.map((s) => `${s.placeId} (${s.ref})`).join(", "));
console.log("বানান সংশোধন:", fixLog.length, "টি জায়গায়");
console.log("স্থানাঙ্ক নিরীক্ষা:", coordIssues.length, "টি সীমানার বাইরে (খতিয়ে দেখার মতো:", realSuspects.length + ")");
