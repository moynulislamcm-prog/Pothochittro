/**
 * গন্তব্য তৈরি ও সমৃদ্ধকরণ পাইপলাইন
 * ---------------------------------------------------------------
 * কাজ:
 *  ১. বিদ্যমান গন্তব্য + নতুন লেখা গন্তব্য মেশানো
 *  ২. প্রতিটির জন্য জেলা শহর থেকে দূরত্ব হিসাব (haversine)
 *  ৩. স্থানাঙ্ক যাচাই — উপজেলার পলিগনের ভেতরে পড়ে কি না
 *  ৪. পলিগনের বাইরে পড়লে উপজেলার কেন্দ্রবিন্দুতে স্ন্যাপ করা
 *
 * নতুন গন্তব্য লেখার নিয়ম: scripts/places/*.json ফাইলে যোগ করুন।
 * প্রতিটি ফাইল একটি বিভাগ বা জেলার গন্তব্য ধরে।
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(root, "web", "public", "data");
const AUTHORED = path.join(root, "scripts", "places");

const canon = (s) =>
  typeof s === "string"
    ? s.normalize("NFC").trim().replace(/\u200c|\u200d/g, "").replace(/\s+/g, " ")
    : "";
const key = (s) => canon(s).replace(/[\sঃ.\-–—]/g, "");

/** SEO-বান্ধব URL অংশ — ইংরেজি নাম থেকে, ছোট হরফে, ড্যাশ যুক্ত */
function slugify(value, fallback) {
  const base = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || String(fallback || "place").replace(/[^a-z0-9]+/g, "-");
}

/* ------------------------------------------------------------------ */
/* ভূগোল                                                              */
/* ------------------------------------------------------------------ */
const R = 6371.0088;
const rad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const [lat1, lon1] = a, [lat2, lon2] = b;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad(1)) * Math.cos(lat2 * rad(1)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
  let sx = 0, sy = 0, n = 0;
  const walk = (a) => {
    if (typeof a[0] === "number") { sx += a[0]; sy += a[1]; n++; return; }
    a.forEach(walk);
  };
  if (geometry?.coordinates) walk(geometry.coordinates);
  return n ? [sy / n, sx / n] : null; // [lat, lon]
}

/* ------------------------------------------------------------------ */
/* ডেটা লোড                                                            */
/* ------------------------------------------------------------------ */
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

const districts = read(path.join(DATA, "districts.json"));
const upazilas = read(path.join(DATA, "upazilas.json"));
const districtBounds = read(path.join(DATA, "boundaries.geojson"));
const upazilaBoundsFile = path.join(DATA, "upazila-boundaries.geojson");
const upazilaBounds = fs.existsSync(upazilaBoundsFile) ? read(upazilaBoundsFile) : null;

const districtById = new Map(districts.map((d) => [String(d.id), d]));
const districtNameToId = new Map();
for (const d of districts) {
  districtNameToId.set(key(d.bn_name), String(d.id));
  districtNameToId.set(key(d.name), String(d.id));
}

/* জেলা পলিগনের কেন্দ্রবিন্দু (জেলা শহরের স্থানাঙ্ক না থাকলে ব্যবহার হয়) */
const districtCentroid = new Map();
for (const f of districtBounds.features) {
  const c = centroid(f.geometry);
  if (c) districtCentroid.set(String(f.properties.id), c);
}

/** জেলা শহরের অবস্থান — ডেটায় থাকা lat/lon, না থাকলে পলিগনের কেন্দ্র */
function districtHq(id) {
  const d = districtById.get(String(id));
  if (!d) return null;
  if (typeof d.lat === "number" && typeof d.lon === "number") return [d.lat, d.lon];
  return districtCentroid.get(String(id)) || null;
}

/* উপজেলা পলিগনের কেন্দ্রবিন্দু — জেলা অনুযায়ী সূচি */
const upazilaCentroid = new Map(); // "districtId|key(name)" -> [lat,lon]
const upazilaFeaturesByDistrict = new Map(); // districtId -> [feature]
if (upazilaBounds) {
  for (const f of upazilaBounds.features) {
    const did = String(f.properties.district_id);
    const nm = key(f.properties.bn_name || f.properties.name);
    const c = centroid(f.geometry);
    if (!nm || !c) continue;
    upazilaCentroid.set(`${did}|${nm}`, c);
    if (!upazilaFeaturesByDistrict.has(did)) upazilaFeaturesByDistrict.set(did, []);
    upazilaFeaturesByDistrict.get(did).push(f);
  }
}

/* আমার উপজেলা তালিকার কেন্দ্রবিন্দু (পলিগনে না মিললে নাম মিলিয়ে) */
const upazilaById = new Map(upazilas.map((u) => [String(u.id), u]));

/** উপজেলার কেন্দ্রবিন্দু খোঁজে — পলিগন থেকে, না পেলে জেলার কেন্দ্র */
function upazilaCenter(districtId, upazilaName, upazilaId) {
  const did = String(districtId);
  if (upazilaName) {
    const direct = upazilaCentroid.get(`${did}|${key(upazilaName)}`);
    if (direct) return { point: direct, exact: true };
  }
  if (upazilaId) {
    const u = upazilaById.get(String(upazilaId));
    if (u) {
      const byId = upazilaCentroid.get(`${did}|${key(u.bn_name)}`);
      if (byId) return { point: byId, exact: true };
    }
  }
  // আংশিক মিল (বানানের ভিন্নতা সামলাতে)
  if (upazilaName) {
    const want = key(upazilaName);
    const feats = upazilaFeaturesByDistrict.get(did) || [];
    for (const f of feats) {
      const nm = key(f.properties.bn_name || f.properties.name);
      if (!nm) continue;
      if (nm.includes(want) || want.includes(nm)) {
        const c = centroid(f.geometry);
        if (c) return { point: c, exact: false };
      }
    }
  }
  const dc = districtCentroid.get(did);
  return dc ? { point: dc, exact: false } : { point: null, exact: false };
}

/** কোন উপজেলা পলিগনে এই বিন্দুটি পড়ে */
function upazilaAtPoint(districtId, lat, lon) {
  const feats = upazilaFeaturesByDistrict.get(String(districtId)) || [];
  for (const f of feats) {
    if (pointInGeometry([lon, lat], f.geometry)) {
      return f.properties.bn_name || f.properties.name || null;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* নতুন লেখা গন্তব্য সংগ্রহ                                             */
/* ------------------------------------------------------------------ */
let authored = [];
if (fs.existsSync(AUTHORED)) {
  const files = fs.readdirSync(AUTHORED).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const batch = read(path.join(AUTHORED, f));
    const list = Array.isArray(batch) ? batch : batch.places || [];
    for (const p of list) authored.push({ ...p, __file: f });
  }
  console.log(`পড়া হয়েছে: ${files.length}টি ফাইল থেকে ${authored.length}টি নতুন গন্তব্য`);
}

/* ------------------------------------------------------------------ */
/* বিদ্যমান গন্তব্য                                                     */
/* ------------------------------------------------------------------ */
const existing = read(path.join(DATA, "places.json"));

/* বিভাগ ও জেলা নামের সূচি */
const divisions = read(path.join(DATA, "divisions.json"));
const divById = new Map(divisions.map((d) => [String(d.id), d]));

/** লেখকের দেওয়া জেলার নাম থেকে জেলা শনাক্ত */
function resolveDistrict(p) {
  if (p.district_id && districtById.has(String(p.district_id))) return String(p.district_id);
  for (const cand of [p.district, p.district_bn, p.jela]) {
    if (!cand) continue;
    const id = districtNameToId.get(key(cand));
    if (id) return id;
  }
  return null;
}

let idSeq = 10000;
const nextId = () => `pc-${idSeq++}`;

/* ------------------------------------------------------------------ */
/* মেশানো + সমৃদ্ধকরণ                                                 */
/* ------------------------------------------------------------------ */
const byKey = new Map(); // districtId|key(name) -> place
const snapped = [], flagged = [], alreadyApplied = [], enriched = [], outsideKept = [];

function normalizePlace(p, source) {
  const districtId = String(p.district_id);
  const d = districtById.get(districtId);
  if (!d) return null;

  const name = canon(p.name);
  if (!name) return null;

  let lat = typeof p.lat === "number" ? p.lat : null;
  let lon = typeof p.lon === "number" ? p.lon : null;
  let coordSource = p.lat != null ? (source === "authored" ? "লেখক" : "মূল ডেটা") : "উপজেলা-কেন্দ্র";

  // উপজেলার নাম শনাক্ত
  let upazilaName = canon(p.upazila_bn || p.upazila || p.thana || "");

  // স্থানাঙ্ক যাচাই: নিজের জেলার পলিগনে পড়ে কি না
  const feat = districtBounds.features.find((f) => String(f.properties.id) === districtId);
  let inOwnDistrict = lat != null && lon != null && feat ? pointInGeometry([lon, lat], feat.geometry) : false;

  if (lat == null || lon == null) {
    const c = upazilaCenter(districtId, upazilaName, p.upazila_id);
    if (!c.point) return null;
    lat = c.point[0]; lon = c.point[1];
    coordSource = c.exact ? "উপজেলা-কেন্দ্র" : "জেলা-কেন্দ্র";
    inOwnDistrict = true;
  } else if (!inOwnDistrict) {
    // সীমানার বাইরে পড়ছে। উৎসভেদে আচরণ আলাদা:
    //
    // লেখকের স্থানাঙ্ক ইচ্ছাকৃত, তাই সেটা সরানো হয় না। দ্বীপ, সমুদ্র সৈকত,
    // নদীর মোহানা ও সমুদ্রতীরের গন্তব্য সরলীকৃত স্থল-পলিগনের বাইরে পড়াটাই
    // স্বাভাবিক। আগে এগুলোও উপজেলা-কেন্দ্রে স্ন্যাপ হতো, ফলে ছেঁড়া দ্বীপ,
    // শাহপরীর দ্বীপ ও সাবরাং — তিনটি আলাদা দ্বীপ একই বিন্দুতে গাদা হয়ে
    // গিয়েছিল এবং আসল অবস্থান নষ্ট হয়েছিল।
    // স্ন্যাপের বদলে পতাকা তোলা হয়, যাতে ভুল স্থানাঙ্ক মানুষ পর্যালোচনা করতে পারে।
    if (source === "authored") {
      outsideKept.push({ name, district: d.bn_name, lat, lon });
    } else {
      // মূল ডেটার সন্দেহজনক বিন্দু → উপজেলার কেন্দ্রে সরানো হলো, রেকর্ডসহ
      const c = upazilaCenter(districtId, upazilaName, p.upazila_id);
      if (c.point) {
        snapped.push({ name, district: d.bn_name, from: [lat, lon], to: c.point, source });
        lat = c.point[0]; lon = c.point[1];
        coordSource = c.exact ? "উপজেলা-কেন্দ্র (স্ন্যাপ)" : "জেলা-কেন্দ্র (স্ন্যাপ)";
        inOwnDistrict = true;
      } else {
        flagged.push({ name, district: d.bn_name, lat, lon, source, reason: "সীমানার বাইরে, স্ন্যাপ করা যায়নি" });
      }
    }
  }

  // উপজেলার নাম না থাকলে পলিগন থেকে বের করা
  if (!upazilaName) upazilaName = upazilaAtPoint(districtId, lat, lon) || "";

  // জেলা শহর থেকে দূরত্ব
  const hq = districtHq(districtId);
  const distKm = hq ? Math.round(haversineKm(hq, [lat, lon]) * 10) / 10 : null;

  // উপজেলা আইডি মেলানো
  let upazilaId = p.upazila_id || null;
  if (!upazilaId && upazilaName) {
    const hit = upazilas.find(
      (u) => String(u.district_id) === districtId && key(u.bn_name) === key(upazilaName),
    );
    if (hit) upazilaId = String(hit.id);
  }

  return {
    id: p.id || nextId(),
    slug: p.slug || null, // নিচে অনন্য করে দেওয়া হয়
    district_id: districtId,
    district_bn: d.bn_name,
    district_en: d.name,
    division_bn: divById.get(String(d.division_id))?.bn_name || d.division || "",
    name,
    name_en: canon(p.name_en || p.nameEn || "") || null,
    category: canon(p.category || "other") || "other",
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    coord_source: coordSource,
    coord_verified: source === "authored" && p.verified === true ? true : coordSource === "মূল ডেটা" && inOwnDistrict,
    upazila_id: upazilaId,
    upazila_bn: upazilaName || null,
    locality: canon(p.locality || "") || null,
    summary: canon(p.summary || "") || null,
    description: canon(p.description || "") || null,
    history: canon(p.history || "") || null,
    how_to_go: canon(p.how_to_go || p.howToGo || "") || null,
    best_time: canon(p.best_time || p.bestTime || "") || null,
    dist_from_hq_km: distKm,
    image: p.image || null,
    source: source === "authored" ? "লেখক" : "মূল",
    verified: source === "authored" ? p.verified === true : true,
  };
}

const places = [];
for (const p of existing) {
  const n = normalizePlace(p, "existing");
  if (!n) continue;
  const k = `${n.district_id}|${key(n.name)}`;
  if (byKey.has(k)) continue;
  byKey.set(k, n);
  places.push(n);
}
/**
 * লেখকের ডেটা বিদ্যমান গন্তব্যকে সমৃদ্ধ করে — নতুন সারি তৈরি করে না।
 *
 * কেন দরকার: একই জেলায় একই নামের গন্তব্য আগে "ডুপ্লিকেট" ধরে বাদ পড়ত।
 * ফলে মূল ডেটার ২১৫টি গন্তব্যে ইতিহাস/কীভাবে যাবেন যোগ করার কোনো
 * উপায় ছিল না — লেখা চুপচাপ ফেলে দেওয়া হতো।
 *
 * নীতি:
 *  - লেখক যে ঘর স্পষ্টভাবে দিয়েছেন কেবল সেটাই বসে (খালি ঘর মুছে ফেলে না)।
 *  - স্থানাঙ্ক বদলায় শুধু `override_coords: true` দিলে। লেখকের আন্দাজি
 *    স্থানাঙ্ক মূল ডেটার চেয়ে খারাপ হওয়ার সম্ভাবনাই বেশি, তাই এই সতর্কতা।
 *  - নতুন লেখা তথ্য যোগ হলে `verified: false` — ব্যবহারকারীর শর্ত অনুযায়ী
 *    লেখকের তথ্য যাচাই-বাকি হিসেবে চিহ্নিত থাকবে।
 */
const ENRICH_FIELDS = [
  "name_en", "category", "upazila_bn", "upazila_id", "locality",
  "summary", "description", "history", "how_to_go", "best_time", "image",
];

function enrichPlace(target, raw) {
  const touched = [];
  for (const f of ENRICH_FIELDS) {
    const v = raw[f];
    if (v == null || v === "") continue; // লেখক এই ঘর দেননি
    const cv = typeof v === "string" ? canon(v) : v;
    if (!cv) continue;
    if (target[f] === cv) continue; // একই মান, বদলের দরকার নেই
    target[f] = cv;
    touched.push(f);
  }

  if (raw.override_coords === true && typeof raw.lat === "number" && typeof raw.lon === "number") {
    const lat = Math.round(raw.lat * 1e5) / 1e5;
    const lon = Math.round(raw.lon * 1e5) / 1e5;
    if (target.lat !== lat || target.lon !== lon) {
      target.lat = lat;
      target.lon = lon;
      target.coord_source = "লেখক";
      // দূরত্ব স্থানাঙ্ক থেকেই আসে, তাই নতুন করে মাপা হলো
      const hq = districtHq(target.district_id);
      target.dist_from_hq_km = hq ? Math.round(haversineKm(hq, [lat, lon]) * 10) / 10 : null;
      touched.push("স্থানাঙ্ক");
    }
  }

  if (!touched.length) return false;

  if (raw.verified === true) target.verified = true;
  else if (touched.some((f) => f !== "image")) target.verified = false;

  target.source = target.source === "মূল" ? "মূল+লেখক" : target.source;
  target.enriched_fields = touched;
  return true;
}

const existingCount = places.length;

let added = 0;
for (const p of authored) {
  const districtId = resolveDistrict(p);
  if (!districtId) {
    flagged.push({ name: canon(p.name), district: p.district || p.district_bn || "?", reason: "জেলা শনাক্ত হয়নি" });
    continue;
  }
  const n = normalizePlace({ ...p, district_id: districtId }, "authored");
  if (!n) { flagged.push({ name: canon(p.name), district: districtById.get(districtId)?.bn_name, reason: "নাম/স্থানাঙ্ক নেই" }); continue; }
  const k = `${n.district_id}|${key(n.name)}`;
  const prev = byKey.get(k);
  if (prev) {
    // একই জেলায় একই নাম → নতুন সারি নয়, বিদ্যমানটিকেই সমৃদ্ধ করা হয়
    if (enrichPlace(prev, p)) enriched.push(prev.name);
    else alreadyApplied.push(n.name); // আগেই প্রয়োগ হয়ে গেছে (পুনরায় চালালে একই ফল)
    continue;
  }
  byKey.set(k, n);
  places.push(n);
  added++;
}

/* ------------------------------------------------------------------ */
/* slug অনন্য করা                                                     */
/* ------------------------------------------------------------------ */
/**
 * URL-এর জন্য অনন্য slug। একই নাম একাধিক জেলায় থাকতে পারে
 * (যেমন "সুন্দরবন" খুলনা ও সাতক্ষীরা দুটোতেই), তাই সংঘর্ষ হলে
 * জেলার নাম যোগ করা হয়; তবুও মিললে সংখ্যা বসে।
 */
{
  const used = new Set();
  const bySlug = new Map();
  for (const pl of places) {
    let base = pl.slug || slugify(pl.name_en || pl.name, pl.id);
    let candidate = base;
    if (used.has(candidate)) {
      const dEn = slugify(pl.district_en || districtById.get(pl.district_id)?.name || "", "");
      candidate = dEn ? `${base}-${dEn}` : `${base}-2`;
    }
    let n = 2;
    while (used.has(candidate)) candidate = `${base}-${n++}`;
    used.add(candidate);
    pl.slug = candidate;
    bySlug.set(candidate, pl.id);
  }
  // জেলার slug (ইংরেজি নাম থেকে)
  const dUsed = new Set();
  for (const d of districts) {
    let base = slugify(d.name || d.bn_name, d.id);
    let candidate = base;
    let n = 2;
    while (dUsed.has(candidate)) candidate = `${base}-${n++}`;
    dUsed.add(candidate);
    d.slug = candidate;
  }
}

/* ------------------------------------------------------------------ */
/* আউটপুট                                                             */
/* ------------------------------------------------------------------ */
fs.writeFileSync(path.join(DATA, "places.json"), JSON.stringify(places));
fs.writeFileSync(path.join(root, "data", "seed", "places.json"), JSON.stringify(places));

/* জেলাভিত্তিক গণনা হালনাগাদ */
const perDistrict = new Map();
for (const p of places) perDistrict.set(p.district_id, (perDistrict.get(p.district_id) || 0) + 1);
for (const d of districts) d.place_count = perDistrict.get(String(d.id)) || 0;
fs.writeFileSync(path.join(DATA, "districts.json"), JSON.stringify(districts));
fs.writeFileSync(path.join(root, "data", "seed", "districts.json"), JSON.stringify(districts));

/* প্রতিবেদন */
const withDist = places.filter((p) => p.dist_from_hq_km != null).length;
const catCount = new Map();
for (const p of places) catCount.set(p.category, (catCount.get(p.category) || 0) + 1);

let report = `# গন্তব্য তৈরির প্রতিবেদন\n\n`;
report += `মোট গন্তব্য: **${places.length}** (মূল ${existingCount} + নতুন ${added})\n`
report += `সমৃদ্ধ: **${enriched.length}** (বিদ্যমান গন্তব্যে লেখকের তথ্য যোগ হয়েছে)\n\n`;
report += `জেলা শহর থেকে দূরত্ব আছে: ${withDist}/${places.length}\n\n`;
report += `## বিভাগ\n\n`;
for (const c of [...catCount.entries()].sort((a, b) => b[1] - a[1])) report += `- ${c[0]}: ${c[1]}\n`;
if (outsideKept.length) {
  report += `\n## সীমানার বাইরে, তবে লেখকের স্থানাঙ্ক রাখা হয়েছে (${outsideKept.length})\n\n`;
  report += `এগুলো ইচ্ছাকৃতভাবে সরানো হয়নি — দ্বীপ, সৈকত ও সমুদ্রতীরের গন্তব্য সরলীকৃত স্থল-পলিগনের বাইরে পড়াটাই স্বাভাবিক।\nতবু ভুল স্থানাঙ্ক থাকলে এখানে চোখ বোলানো দরকার।\n\n| গন্তব্য | জেলা | স্থানাঙ্ক |\n|---|---|---|\n`;
  for (const o of outsideKept)
    report += `| ${o.name} | ${o.district} | ${o.lat}, ${o.lon} |\n`;
}

if (snapped.length) {
  report += `\n## স্ন্যাপ করা হয়েছে (${snapped.length})\n\n| গন্তব্য | জেলা | আগের স্থানাঙ্ক | নতুন |\n|---|---|---|---|\n`;
  for (const s of snapped.slice(0, 60))
    report += `| ${s.name} | ${s.district} | ${s.from.join(", ")} | ${s.to.map((n) => n.toFixed(4)).join(", ")} |\n`;
}
if (flagged.length) {
  report += `\n## সমস্যা চিহ্নিত (${flagged.length})\n\n| গন্তব্য | জেলা | কারণ |\n|---|---|---|\n`;
  for (const f of flagged.slice(0, 60)) report += `| ${f.name} | ${f.district} | ${f.reason} |\n`;
}
if (alreadyApplied.length) report += `\n## আগেই প্রয়োগ হয়েছে (${alreadyApplied.length})\n\nস্ক্রিপ্টটি পুনরায় চালালে এই গন্তব্যগুলো আবার সমৃদ্ধ হয় না — নতুন তথ্য না পেলে অপরিবর্তিত থাকে।\n\n${alreadyApplied.slice(0, 40).join(", ")}\n`;
fs.writeFileSync(path.join(root, "data", "PLACES_REPORT.md"), report);

console.log("— গন্তব্য তৈরি —");
console.log("মোট        :", places.length, `(মূল ${existingCount} + নতুন ${added})`);
console.log("সমৃদ্ধ     :", enriched.length);
console.log("দূরত্ব যুক্ত :", withDist);
console.log("স্ন্যাপ      :", snapped.length, "| সীমানার বাইরে (রাখা):", outsideKept.length, "| সমস্যা:", flagged.length, "| আগেই প্রয়োগ:", alreadyApplied.length);
const top = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log("বিভাগ      :", top.map(([k, v]) => `${k}=${v}`).join(", "));
