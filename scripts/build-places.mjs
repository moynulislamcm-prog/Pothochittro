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

/** ইংরেজি নামের তুলনা-কী: ছোট হরফ, শুধু ইংরেজি অক্ষর ও সংখ্যা */
const ekey = (s) => key(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/** ইংরেজি নামের টোকেন সেট — আংশিক মিলের জন্য */
const etokens = (s) => new Set(String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));

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

/* উপজেলা পলিগনের সূচি — জেলা অনুযায়ী */
const upazilaFeaturesByDistrict = new Map(); // districtId -> [feature]
const upazilaFeatureByName = new Map(); // "districtId|key(name)" -> feature
if (upazilaBounds) {
  for (const f of upazilaBounds.features) {
    const did = String(f.properties.district_id);
    const nm = key(f.properties.bn_name || f.properties.name);
    // কেন্দ্রবিন্দু বের না হলে (অবক্ষয়িত পলিগন) পুরো পলিগনটিই বাদ পড়ে —
    // এই গার্ডটি সূচিতে কোন কোন পলিগন ঢুকবে তা ঠিক করে, তাই রাখা জরুরি।
    // কেন্দ্রবিন্দু পরে cachedCentroid() দিয়ে অলসভাবে হিসাব হয়।
    if (!nm || !centroid(f.geometry)) continue;
    // একই নামে একাধিক পলিগন থাকলে প্রথমটিই রাখা হয়, যাতে ক্রম নির্ণায়ক থাকে।
    if (!upazilaFeatureByName.has(`${did}|${nm}`)) upazilaFeatureByName.set(`${did}|${nm}`, f);
    if (!upazilaFeaturesByDistrict.has(did)) upazilaFeaturesByDistrict.set(did, []);
    upazilaFeaturesByDistrict.get(did).push(f);
  }
}

/* আমার উপজেলা তালিকার কেন্দ্রবিন্দু (পলিগনে না মিললে নাম মিলিয়ে) */
const upazilaById = new Map(upazilas.map((u) => [String(u.id), u]));

/* --- ইংরেজি নামে উপজেলা পলিগন মেলানো -------------------------------------
   geojson-এর ১১৮টি পলিগনে bn_name খালি (নাম ইংরেজিতে, inferred:true)। ফলে
   upazilaFeatureByName-এর কী হয়ে যায় ইংরেজি নাম, অথচ খোঁজ চলে বাংলা নাম
   দিয়ে — কখনোই মেলে না। এতে ১৩০টি উপজেলা "পলিগনবিহীন" মনে হতো, অথচ আসলে
   ৭৬টির পলিগন ইংরেজি নামে বা ভিন্ন বানানে ঠিকই আছে:
     কুমিল্লা সদর → Comilla Adarsha Sadar | হাটহাজারী → হাঠহাজারী
     লোহাগাড়া → লোহাগারা | মীরসরাই → মিরসরাই | কক্সবাজার সদর → Cox's Bazar Sadar
   তাই upazilas.json-এর ইংরেজি নাম দিয়েও মেলানো হয়। এতে ওইসব উপজেলার
   নতুন গন্তব্য জেলা-কেন্দ্রের আসন্ন মানের বদলে নিজের উপজেলার ভেতরেই পড়ে।

   নিরাপত্তা: একই জেলায় একই ইংরেজি কী একাধিক পলিগনে মিললে সেটি অস্পষ্ট
   ধরে বাতিল করা হয় (সিলেটে দুটি "Companiganj" পলিগন আছে)। ভুল উপজেলার
   পলিগনে গন্তব্য বসানোর চেয়ে আসন্ন মান ভালো — ভুল মিল নীরবে ডেটা নষ্ট করে।
   ------------------------------------------------------------------------- */
const AMBIGUOUS = Symbol("ambiguous-upazila");
const upazilaFeatureByEn = new Map(); // "districtId|ekey(name)" -> feature | AMBIGUOUS
if (upazilaBounds) {
  for (const f of upazilaBounds.features) {
    const ek = ekey(f.properties.name || "");
    if (!ek) continue;
    const k2 = `${f.properties.district_id}|${ek}`;
    if (upazilaFeatureByEn.has(k2)) upazilaFeatureByEn.set(k2, AMBIGUOUS);
    else upazilaFeatureByEn.set(k2, f);
  }
}
/* upazilas.json-এর রেকর্ড (ইংরেজি নাম বের করতে) — জেলা+বাংলা নাম দিয়ে সূচি */
const upazilaByDistBn = new Map();
for (const u of upazilas) {
  const kb = key(u.bn_name || "");
  if (!kb) continue;
  const k2 = `${u.district_id}|${kb}`;
  if (!upazilaByDistBn.has(k2)) upazilaByDistBn.set(k2, u);
}
/** উপজেলা রেকর্ড খোঁজে — আইডি দিয়ে, নাহলে জেলা+বাংলা নাম দিয়ে */
function upazilaRecordFor(districtId, upazilaName, upazilaId) {
  if (upazilaId) {
    const u = upazilaById.get(String(upazilaId));
    if (u && String(u.district_id) === String(districtId)) return u;
  }
  if (upazilaName) return upazilaByDistBn.get(`${districtId}|${key(upazilaName)}`) || null;
  return null;
}

/* কেন্দ্রবিন্দুর ক্যাশ — একই পলিগনের জন্য বারবার গণনা এড়াতে */
const centroidCache = new WeakMap();
function cachedCentroid(geometry) {
  if (!geometry) return null;
  let c = centroidCache.get(geometry);
  if (c === undefined) {
    c = centroid(geometry);
    centroidCache.set(geometry, c);
  }
  return c;
}

/* ---------------------------------------------------------------------------
   নতুন গন্তব্যের জন্য উপজেলার পলিগনের ভেতরে পৃথক বিন্দু ছড়ানো
   ---------------------------------------------------------------------------
   কেন দরকার: নতুন গন্তব্যে lat/lon না দিলে আগে সবগুলো উপজেলার হুবহু একই
   কেন্দ্রবিন্দু পেত। প্রতি জেলায় ~৩০টি গন্তব্য যোগ করলে সদর উপজেলায় এক
   ডজনের বেশি গন্তব্য একই বিন্দুতে গাদা হতো — ম্যাপে মার্কার অকেজো, সবার
   দূরত্ব হুবহু এক, এবং "দুটি ভিন্ন গন্তব্যের স্থানাঙ্ক এক নয়" অভেদটি ভাঙত।
   এটি সেই একই বাগ-শ্রেণী যা আগে ছেঁড়া দ্বীপ/শাহপরীর দ্বীপ/সাবরাংকে
   এক বিন্দুতে গুঁজে দিয়েছিল।

   গুরুত্বপূর্ণ: বীজ স্থানটির নিজের নাম থেকে নেওয়া হয়, প্রসেসিং ক্রম থেকে
   নয় — তাই আউটপুট নির্ণায়ক (deterministic) এবং পাইপলাইনের byte-idempotency
   অটুট থাকে। নাম বদলালে বিন্দু বদলায়, তাই নামই এখানে স্থিতিশীল চাবি।

   সততার সীমা: এই বিন্দুগুলো আসল অবস্থান নয়, উপজেলা-স্তরের আসন্ন মান
   মাত্র। তাই coord_source "উপজেলা-কেন্দ্র" এবং coord_verified false-ই থাকে,
   যাতে সাইটে এটি যাচাই-অপেক্ষমাণ হিসেবে চিহ্নিত থাকে।
--------------------------------------------------------------------------- */

/** FNV-1a হ্যাশ — স্থিতিশীল বীজ তৈরির জন্য */
function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — ছোট, দ্রুত এবং সম্পূর্ণ নির্ণায়ক ছদ্ম-এলোমেলো জেনারেটর */
function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ছড়ানোর বলয় সংখ্যা। প্রতি বলয় ~২৪৫ মিটার।
   SCATTER_MAX_RINGS (৪৮) ≈ ১১.৮ কিমি — উপজেলার নিজের পলিগনের ভেতরে,
   তাই পুরো উপজেলা জুড়ে ছড়ানো নিরাপদ।
   DISTRICT_FALLBACK_RINGS (১০) ≈ ২.৫ কিমি — উপজেলার পলিগন না মিললে
   ইচ্ছাকৃতভাবে ছোট রাখা হয়: উপজেলার আসল অবস্থান তখন জানাই নেই, তাই
   পুরো জেলায় ছড়ালে জেলা শহর থেকে ভুল দূরত্ব দেখাত। ছোট ব্যাসার্ধে
   গন্তব্যগুলো আলাদা মার্কার পায় কিন্তু "জেলা-কেন্দ্র" দাবিটিও সত্য থাকে। */
const SCATTER_MAX_RINGS = 48;
const DISTRICT_FALLBACK_RINGS = 10;

/**
 * পলিগনের ভেতরে কেন্দ্র থেকে ছড়িয়ে একটি পৃথক বিন্দু খোঁজে।
 * ক্রমবর্ধমান ব্যাসার্ধের বলয়ে খোঁজে এবং প্রথম বিন্দুটিই নেয় যা
 * pointInGeometry যাচাইয়ে পাস করে — ফলে বিন্দুটি সবসময় সেই উপজেলার
 * সীমানার ভেতরেই থাকে, ভুল উপজেলা বা জেলায় পড়ে না।
 * ভেতরে জায়গা না পেলে কেন্দ্রেই ফিরে আসে (তখন গাদা লাগলেও ভুল অবস্থান নয়)।
 */
function scatterInGeometry(geometry, center, seedStr, maxRings = SCATTER_MAX_RINGS) {
  if (!center) return null;
  if (!geometry) return center;
  const rnd = mulberry32(seedFrom(seedStr));
  const baseAngle = rnd() * Math.PI * 2;
  const ring = 0.0022; // প্রতি বলয়ে ~২৪৫ মিটার
  // দ্রাঘিমাংশকে cos(অক্ষাংশ) দিয়ে ভাগ করলে ছড়ানোটি বাস্তব দূরত্বে
  // প্রায় বৃত্তাকার হয় — না করলে পূর্ব-পশ্চিমে সংকুচিত দেখাত।
  const lonStretch = 1 / Math.max(0.35, Math.cos(rad(center[0])));
  for (let r = 1; r <= maxRings; r++) {
    const steps = Math.min(8 + r * 2, 56);
    for (let s = 0; s < steps; s++) {
      const angle = baseAngle + (s / steps) * Math.PI * 2;
      const d = ring * r;
      const lat = center[0] + d * Math.cos(angle);
      const lon = center[1] + d * Math.sin(angle) * lonStretch;
      if (pointInGeometry([lon, lat], geometry)) return [lat, lon];
    }
  }
  return center;
}

/**
 * উপজেলার পলিগন খোঁজার একটিমাত্র সমাধান-ক্রম।
 *
 * কেন একটি ফাংশনে: আগে কেন্দ্রবিন্দু (upazilaCenter) ও পলিগন
 * (upazilaFeatureFor) দুটি আলাদা ক্রম অনুসরণ করত। দুটো ভিন্ন পলিগন বেছে
 * নিলে কেন্দ্রবিন্দু এক উপজেলার আর ছড়ানো হতো অন্য উপজেলার ভেতরে —
 * ফলাফল হতো সীমানার বাইরের বিন্দু। এখন দুটোই এখান থেকেই আসে।
 *
 * ফেরত: { f, kind } — kind ∈ "bn-exact" | "en-exact" | "bn-substr" |
 * "en-tokens" | null (কোনো পলিগন মেলেনি)।
 */
function resolveUpazilaFeature(districtId, upazilaName, upazilaId) {
  const did = String(districtId);

  // ১. বাংলা নামে হুবহু মিল
  if (upazilaName) {
    const f = upazilaFeatureByName.get(`${did}|${key(upazilaName)}`);
    if (f) return { f, kind: "bn-exact" };
  }
  if (upazilaId) {
    const u = upazilaById.get(String(upazilaId));
    if (u) {
      const f = upazilaFeatureByName.get(`${did}|${key(u.bn_name)}`);
      if (f) return { f, kind: "bn-exact" };
    }
  }

  // ২. upazilas.json-এর ইংরেজি নাম দিয়ে — যেসব পলিগনে bn_name খালি
  const rec = upazilaRecordFor(did, upazilaName, upazilaId);
  const en = rec ? ekey(rec.name || "") : "";
  if (en) {
    const hit = upazilaFeatureByEn.get(`${did}|${en}`);
    // AMBIGUOUS হলে ইচ্ছাকৃতভাবে এড়িয়ে যাওয়া হয়: ভুল উপজেলার পলিগনে
    // গন্তব্য বসানোর চেয়ে জেলা-কেন্দ্রের আসন্ন মান ভালো, কারণ ভুল মিল
    // নীরবে ডেটা নষ্ট করে আর ধরাও পড়ে না।
    if (hit && hit !== AMBIGUOUS) return { f: hit, kind: "en-exact" };
  }

  // ৩. বাংলা নামে আংশিক মিল (বানানের ভিন্নতা সামলাতে)
  if (upazilaName) {
    const want = key(upazilaName);
    const feats = upazilaFeaturesByDistrict.get(did) || [];
    for (const f of feats) {
      const nm = key(f.properties.bn_name || f.properties.name);
      if (!nm) continue;
      if (nm.includes(want) || want.includes(nm)) return { f, kind: "bn-substr" };
    }
  }

  // ৪. ইংরেজি টোকেন-উপসেট — শুধু তখনই যখন একমাত্র প্রার্থী
  //    (যেমন Khagrachhari ⊂ "Khagrachhari Sadar")
  const ut = rec ? etokens(rec.name || "") : new Set();
  if (ut.size) {
    const feats = upazilaFeaturesByDistrict.get(did) || [];
    const cands = feats.filter((f) => {
      const ft = etokens(f.properties.name || "");
      if (!ft.size) return false;
      for (const t of ut) if (!ft.has(t)) return false;
      return true;
    });
    if (cands.length === 1) return { f: cands[0], kind: "en-tokens" };
  }

  return { f: null, kind: null };
}

/** উপজেলার পলিগন (না পেলে null) */
function upazilaFeatureFor(districtId, upazilaName, upazilaId) {
  return resolveUpazilaFeature(districtId, upazilaName, upazilaId).f;
}

/** উপজেলার কেন্দ্রবিন্দু খোঁজে — পলিগন থেকে, না পেলে জেলার কেন্দ্র */
function upazilaCenter(districtId, upazilaName, upazilaId) {
  const did = String(districtId);
  const { f, kind } = resolveUpazilaFeature(did, upazilaName, upazilaId);
  if (f) {
    const c = cachedCentroid(f.geometry);
    // bn-substr আংশিক মিল, তাই সেটি এখনও আসন্ন ধরা হয়; বাকি তিনটি
    // কৌশল উপজেলার নিজের পলিগন শনাক্ত করে, তাই exact।
    if (c) return { point: c, exact: kind !== "bn-substr" };
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
/**
 * লেখার ভাষা প্রহরা
 * ------------------------------------------------------------------
 * কেন দরকার: একবার একটি ব্যাচে "সংক্রমণ"-এর বদলে ভুলবশত দেবনাগরী
 * "संक्रमण" মিশে গিয়েছিল। এটি কোনো যাচাইতে ধরা পড়েনি, পাইপলাইন
 * সাফল্যের সাথে চলেছিল, এবং ভুলটি কমিট হয়ে লাইভ সাইটে চলে গিয়েছিল —
 * অর্থাৎ ক্ষতি দুই ধাপ পরে এবং সম্পূর্ণ নীরবে প্রকাশ পেয়েছিল।
 *
 * এই প্রহরা সেই ব্যর্থতা-ধরনটিকে একটি জোরে ব্যর্থতায় পরিণত করে:
 * অনুমোদিত লিপি ছাড়া অন্য কোনো অক্ষর (দেবনাগরী বর্ণ, CJK, কোরীয়,
 * সিরিলিক, গ্রিক ইত্যাদি) থাকলে পাইপলাইন থেমে যাবে এবং ফাইল, গন্তব্য,
 * ঘর ও অক্ষরগুলো নাম ধরে বলবে।
 *
 * অনুমোদিত: বাংলা লিপি, দাঁড়ি/দ্বিদাঁড়ি (Unicode-এ দেবনাগরী ব্লকে থাকলেও
 * বাংলার প্রমুক্ত বিরামচিহ্ন), লাতিন বর্ণ ও সংখ্যা, সাধারণ বিরামচিহ্ন।
 */
const FOREIGN_SCRIPT =
  /[^\s\u0020-\u007E\u00A0-\u00BF\u0964\u0965\u0980-\u09FF\u2010-\u2027\u2030-\u205E\u00D7\u00F7]/g;

function assertScriptClean(list) {
  const bad = [];
  for (const p of list) {
    for (const [field, value] of Object.entries(p)) {
      if (field === "__file" || typeof value !== "string") continue;
      const hits = value.match(FOREIGN_SCRIPT);
      if (!hits) continue;
      const chars = [...new Set(hits)];
      const at = value.search(FOREIGN_SCRIPT);
      bad.push({
        file: p.__file,
        place: p.name || "(নাম নেই)",
        field,
        chars,
        context: value.slice(Math.max(0, at - 25), at + 25).replace(/\s+/g, " "),
      });
    }
  }
  if (!bad.length) return;
  console.error(`\n✗ বিদেশি লিপির অক্ষর পাওয়া গেছে — ${bad.length}টি ঘরে:`);
  for (const b of bad) {
    console.error(`   ${b.file} → ${b.place} [${b.field}]`);
    console.error(`      অক্ষর: ${b.chars.map((c) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase()})`).join(", ")}`);
    console.error(`      প্রসঙ্গ: "…${b.context}…"`);
  }
  console.error(
    "\nবাংলা লেখায় কেবল বাংলা লিপি, দাঁড়ি ও লাতিন বর্ণ/সংখ্যা চলবে।\n" +
    "দেবনাগরী, CJK, কোরীয় বা অন্য লিপির অক্ষর থাকলে তা সরিয়ে আবার চালান।\n",
  );
  process.exit(1);
}

let authored = [];
if (fs.existsSync(AUTHORED)) {
  const files = fs.readdirSync(AUTHORED).filter((f) => f.endsWith(".json")).sort();
  for (const f of files) {
    const batch = read(path.join(AUTHORED, f));
    const list = Array.isArray(batch) ? batch : batch.places || [];
    for (const p of list) authored.push({ ...p, __file: f });
  }
  assertScriptClean(authored);
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

/**
 * নতুন আইডি — বিদ্যমান সর্বোচ্চ আইডির ওপর থেকে শুরু হয়।
 *
 * আগে প্রতিবার ১০০০০ থেকে শুরু হতো। ফলে স্ক্রিপ্ট দ্বিতীয়বার চললে
 * যে গন্তব্যগুলো নতুন যোগ হতো তারা সেই আইডিগুলোই আবার তৈরি করত,
 * যেগুলো places.json-এ ইতিমধ্যে স্থায়ী হয়ে গেছে — অর্থাৎ আইডি সংঘর্ষ।
 * এটি React-এ "two children with the same key" সতর্কবার্তা দিত এবং
 * তালিকা থেকে গন্তব্য বাদ পড়ার ঝুঁকি ছিল (smoke টেস্টে ধরা পড়েছে)।
 */
let idSeq = 10000;
for (const ex of existing) {
  const m = /^pc-(\d+)$/.exec(String(ex.id || ""));
  if (m) idSeq = Math.max(idSeq, Number(m[1]) + 1);
}
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
  // "লেখক" মানটি আঠালো (sticky) রাখা হয়। নাহলে স্ক্রিপ্ট দ্বিতীয়বার চললে
  // গন্তব্যগুলো places.json থেকে "বিদ্যমান" হিসেবে পড়া হতো, source আর
  // "authored" থাকত না, এবং সংরক্ষিত "লেখক" মানটি চুপচাপ "মূল ডেটা"-তে
  // বদলে যেত। ফলে তৃতীয় রানে সুরক্ষা চিহ্ন হারিয়ে দ্বীপগুলো আবার
  // উপজেলা-কেন্দ্রে স্ন্যাপ হতো (১ → ১২ → ৭ এই দোলাচলটাই ঘটছিল)।
  let coordSource =
    p.coord_source === "লেখক" ? "লেখক"
    : p.lat != null ? (source === "authored" ? "লেখক" : "মূল ডেটা")
    : "উপজেলা-কেন্দ্র";

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
    // একই উপজেলার নতুন গন্তব্যগুলো যেন হুবহু একই বিন্দুতে গাদা না হয়।
    // ছড়ানোর সিদ্ধান্ত এখন c.exact-এর বদলে "উপজেলার পলিগন পাওয়া গেছে কি
    // না" তার ওপর — নাহলে বানানের ভিন্নতায় পলিগন মিললেও (bn-substr) ছড়ানো
    // চলত না, আর গন্তব্যগুলো একই বিন্দুতে গাদা হয়ে ম্যাপ অকেজো হতো।
    // বিদ্যমান গন্তব্যে এই শাখা কখনো চলে না, কারণ তাদের lat/lon সংরক্ষিত
    // আছে; আর enrichPlace স্থানাঙ্ক বদলায় না যতক্ষণ override_coords না থাকে।
    const uf = upazilaFeatureFor(districtId, upazilaName, p.upazila_id);
    const seedStr = `${districtId}|${key(upazilaName || "")}|${key(name)}`;
    if (uf) {
      // উপজেলার নিজের পলিগন পাওয়া গেছে → তার ভেতরেই ছড়ানো হয়, তাই
      // বিন্দুটি কখনো ভুল উপজেলায় পড়ে না।
      const s = scatterInGeometry(uf.geometry, [lat, lon], seedStr);
      if (s) { lat = s[0]; lon = s[1]; }
    } else if (feat) {
      // উপজেলার পলিগন মেলেনি (৪৯২টির মধ্যে ৫৬টি) → জেলা-কেন্দ্রের আশপাশে
      // ছোট ব্যাসার্ধে ছড়ানো হয়, যাতে একই উপজেলার গন্তব্যগুলো আলাদা মার্কার
      // পায়। ব্যাসার্ধ ছোট রাখাই ইচ্ছাকৃত — উপজেলার আসল অবস্থান জানা নেই,
      // তাই পুরো জেলায় ছড়ালে জেলা শহর থেকে ভুল দূরত্ব দেখাত।
      const s = scatterInGeometry(feat.geometry, [lat, lon], seedStr, DISTRICT_FALLBACK_RINGS);
      if (s) { lat = s[0]; lon = s[1]; }
    }
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
    // গুরুত্বপূর্ণ: রেকর্ডের নিজের coord_source দেখা হয়, এই পাসের উৎস নয়।
    // কারণ স্ক্রিপ্ট আবার চললে আগের রানের লেখক-গন্তব্যগুলো places.json থেকে
    // "বিদ্যমান" হিসেবেই পড়া হয় — তখন source পরীক্ষা করলে প্রতিবার বিল্ডে
    // একই ৬টি দ্বীপ/সৈকত আবার কেন্দ্রে সরে যেত এবং ডেটা চুপচাপ নষ্ট হতো।
    if (source === "authored" || p.coord_source === "লেখক") {
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
    // সংরক্ষিত মান থাকলে তা আঠালো রাখা হয়। নাহলে প্রতি রানে বিদ্যমান
    // গন্তব্যগুলোর মান নিঃশর্তে রিসেট হয়ে যেত।
    coord_verified:
      p.coord_verified === undefined
        ? (source === "authored" && p.verified === true ? true : coordSource === "মূল ডেটা" && inOwnDistrict)
        : p.coord_verified,
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
    // গুরুত্বপূর্ণ: বিদ্যমান রেকর্ডের সংরক্ষিত source ও verified আঠালো রাখা হয়।
    //
    // আগে এই দুই লাইন বিদ্যমান গন্তব্যের জন্য নিঃশর্তভাবে "মূল"/true বসাত,
    // অর্থাৎ places.json-এ সংরক্ষিত মান মুছে ফেলত। ফলে প্রতি রানে লেখকের
    // লেখা ৬৫টি নতুন গন্তব্য ও সমৃদ্ধ করা গন্তব্যগুলো আবার "মূল"/verified:true
    // হয়ে যেত — এবং সাইটে আমার নিজের লেখা যাচাই-না-করা কনটেন্টের পাশে
    // "তথ্য যাচাইকৃত" দেখাত। এটি coord_source-এর বাগেরই একই শ্রেণী।
    source: source === "authored" ? "লেখক" : (p.source || "মূল"),
    verified:
      source === "authored"
        ? p.verified === true
        : (p.verified === undefined ? true : p.verified),
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

  // verified ও source লেখকের ফাইলের ঘোষণা থেকে নিঃশর্তভাবে নির্ধারিত হয় —
  // "এই রানে কিছু বদলেছে কি না" (touched) তার ওপর নয়।
  //
  // আগে !touched.length হলে এখানেই return হয়ে যেত। ফলে কনটেন্ট আগেই প্রয়োগ
  // হয়ে থাকলে normalizePlace-এর রিসেট করা ভুল মান আর কখনো সংশোধন হতো না।
  // এখন সিদ্ধান্তটি লেখক কোন কোন ঘর ঘোষণা করেছেন তা থেকে আসে, বর্তমান
  // মানের সাথে তুলনা করে নয় — তাই বিল্ড লেখকের ফাইলের একটি বিশুদ্ধ ফাংশন
  // এবং যতবারই চালানো হোক একই ফল দেয়।
  const declaresText = ENRICH_FIELDS.some(
    (f) => f !== "image" && raw[f] != null && String(raw[f]).trim() !== "",
  );
  if (raw.verified === true) target.verified = true;
  else if (declaresText) target.verified = false;

  // "মূল" থেকে "মূল+লেখক"-এ উন্নীত হয় কেবল মূল (legacy) গন্তব্য। বিশুদ্ধ
  // লেখকের গন্তব্য "লেখক"-ই থাকে — আঠালো source-এর কারণে এটি এখন টেকসই।
  if (target.source === "মূল") target.source = "মূল+লেখক";

  if (!touched.length) return false;

  // দ্রষ্টব্য: এখানে আগে `target.enriched_fields = touched;` লেখা হতো।
  // সেটি সরানো হয়েছে, কারণ ঘরটি কখনও টিকত না — normalizePlace প্রতি
  // রানে ঘরগুলোর একটি নির্দিশ্ট তালিকা দিয়ে অবজেক্ট পুনর্গঠন করে এবং
  // enriched_fields সেই তালিকায় ছিল না। ফলে ঘরটি যে রানে লেখা হতো তার
  // পরের রানেই হারিয়ে যেত: ৪টি গন্তব্যে লেখা, তারপর ০টি। এটিই আউটপুটকে
  // বাইট-স্তরে অস্থির করে তুলছিল, যদিও কাউন্টারগুলো স্থিতিশীল দেখাত।
  //
  // আঠালো না করে মুছে ফেলার কারণ: উপরের মন্তব্য অনুযায়ী বিল্ডকে লেখকের
  // ফাইলের একটি বিশুদ্ধ ফাংশন হতে হবে। enriched_fields আঠালো করলে আউটপুট
  // পূর্ববর্তী places.json-এর অবস্থার ওপর নির্ভরশীল হয়ে পড়ত। ঘরটি কোথাও
  // পড়াও হতো না (অ্যাপ, ডেটাবেস, রিপোর্ট — কোনোটিতেই নেই) এবং ডেটাবেসের
  // হোয়াইটলিস্টেও নেই, তাই এটি ছিল নিছক একটি অস্থিরতার উৎস।
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
/* আইডি সংঘর্ষ যাচাই — বিল্ড থামিয়ে দেওয়া হয়, নইলে চুপচাপ ডেটা নষ্ট হয় */
const idSeen = new Set();
const idClash = [];
for (const pl of places) {
  const pid = String(pl.id);
  if (idSeen.has(pid)) idClash.push(pid);
  idSeen.add(pid);
}
if (idClash.length) {
  console.error(`✗ আইডি সংঘর্ষ (${idClash.length}টি): ${[...new Set(idClash)].slice(0, 10).join(", ")}`);
  console.error("  প্রতিটি গন্তব্যের আইডি অনন্য হতে হবে — বিল্ড থামানো হলো।");
  process.exit(1);
}

report += `মোট গন্তব্য: **${places.length}** (মূল ${existingCount} + নতুন ${added})\n`
report += `সমৃদ্ধ: **${enriched.length}** (বিদ্যমান গন্তব্যে লেখকের তথ্য যোগ হয়েছে)\n\n`;
report += `জেলা শহর থেকে দূরত্ব আছে: ${withDist}/${places.length}\n\n`;
report += `## বিভাগ\n\n`;
for (const c of [...catCount.entries()].sort((a, b) => b[1] - a[1])) report += `- ${c[0]}: ${c[1]}\n`;
const outsideKeptUnique = [...new Map(outsideKept.map((o) => [`${o.district}|${o.name}`, o])).values()];
if (outsideKeptUnique.length) {
  report += `\n## সীমানার বাইরে, তবে লেখকের স্থানাঙ্ক রাখা হয়েছে (${outsideKeptUnique.length})\n\n`;
  report += `এগুলো ইচ্ছাকৃতভাবে সরানো হয়নি — দ্বীপ, সৈকত ও সমুদ্রতীরের গন্তব্য সরলীকৃত স্থল-পলিগনের বাইরে পড়াটাই স্বাভাবিক।\nতবু ভুল স্থানাঙ্ক থাকলে এখানে চোখ বোলানো দরকার।\n\n| গন্তব্য | জেলা | স্থানাঙ্ক |\n|---|---|---|\n`;
  for (const o of outsideKeptUnique)
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
console.log("স্ন্যাপ      :", snapped.length, "| সীমানার বাইরে (রাখা):", outsideKeptUnique.length, "| সমস্যা:", flagged.length, "| আগেই প্রয়োগ:", alreadyApplied.length);
const top = [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log("বিভাগ      :", top.map(([k, v]) => `${k}=${v}`).join(", "));
