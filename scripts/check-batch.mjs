/**
 * লেখকের গন্তব্য-ব্যাচ যাচাইকারী
 *
 * কেন দরকার: ভলিউম পর্যায়ে শ শ ব্যাচ ফাইল লেখা হয়, এবং প্রতিটিতে একই
 * ধরনের ভুল বারবার হওয়ার ঝুঁকি থাকে। বিল্ডের পরে ভুল ধরা পড়লে লেখা
 * নীরবে বাদ পড়ে (নাম না মিললে enrichPlace এড়িয়ে যায়) বা বিদেশি লিপি
 * সাইটে চলে আসে। তাই বিল্ডের "আগে" যাচাই করা হয়।
 *
 * চালানো:  node scripts/check-batch.mjs <ফাইল.json> [...]
 *          আর্গুমেন্ট না দিলে scripts/places/*.json সবগুলো যাচাই হয়।
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const DATA = path.join(ROOT, "web", "public", "data");
const PLACES_DIR = path.join(here, "places");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const canon = (s) =>
  typeof s === "string" ? s.normalize("NFC").trim().replace(/[\u200c\u200d]/g, "").replace(/\s+/g, " ") : "";
const key = (s) => canon(s).replace(/[\sঃ.\-–—]/g, "");

const districts = read(path.join(DATA, "districts.json"));
const upazilas = read(path.join(DATA, "upazilas.json"));
const divisions = read(path.join(DATA, "divisions.json"));
const existing = read(path.join(DATA, "places.json"));

const districtById = new Map(districts.map((d) => [String(d.id), d]));
const divById = new Map(divisions.map((v) => [String(v.id), v]));
const upazilaSet = new Set(upazilas.map((u) => `${u.district_id}|${key(u.bn_name)}`));
/* "নগর এলাকা" একটি বৈধ প্রচলিত মান — মেট্রোপলিটন থানার বদলে ব্যবহৃত হয় */
const UPANAME_EXCEPTIONS = new Set(["নগর এলাকা"]);

/* ------------------------------------------------------------------ *
 *  লিপি ও ভাষা যাচাই
 *
 *  গুরুত্বপূপূর্ণ: দেবনাগরীর জন্য /[\u0900-\u097F]/ ব্যবহার করা যাবে না —
 *  বাংলা দাঁড়ি (।) ও ডবল দাঁড়ি (॥) ওই ব্লকেই থাকে, ফলে হাজার হাজার মিথ্যা
 *  সতর্কবার্তা আসে এবং আসল ভুল চাপা পড়ে যায়। আগে এমনই হয়েছিল: ৬,৪৭০টি
 *  মিথ্যা হিটের ভেতরে ৮টি আসল দেবনাগরি অক্ষর লুকিয়ে ছিল।
 *  তাই ব্লকলিস্টের বদলে সুনির্দিষ্ট রেঞ্জ ব্যবহার করা হয়েছে।
 * ------------------------------------------------------------------ */
const SCRIPT_CHECKS = [
  { name: "দেবনাগরি", re: /[\u0904-\u0939\u093C-\u094F\u0958-\u0963\u0966-\u096F]/g },
  { name: "চৈনিক/জাপানি/কোরিয়ান", re: /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g },
  { name: "শূন্য-প্রস্থ অক্ষর", re: /[\u200B-\u200F\uFEFF]/g },
  { name: "লাতিন সংযুক্ত চিহ্ন (তুর্কি/ভিয়েতনামি ইত্যাদি)", re: /[\u00C0-\u024F]/g },
  { name: "তীর ও অন্যান্য প্রতীক", re: /[\u2190-\u21FF\u2700-\u27BF]/g },
  { name: "গ্রিক/সিরিলিক", re: /[\u0370-\u04FF]/g },
];

/** বিল্ড-স্ক্রিপ্টে অনুমোদিত বিদেশি শব্দ — তুলনামূলক বিবরণীতে বৈধ */
const FOREIGN_ALLOWLIST = ["FOREIGN_SCRIPT", "override_coords", "verified", "coord_source", "en-exact", "bn-substr", "en-tokens"];

/* বিস্তারিত লেখার ঘরগুলো — এগুলোতেই ভাষা-ভুল ঢোকে */
const PROSE_FIELDS = ["summary", "description", "history", "how_to_go", "best_time", "locality", "name"];
/* ইংরেজি নাম ও ক্যাটাগরিতে লাতিন অক্ষর থাকা স্বাভাবিক, তাই বাদ */
const REQUIRED = ["name", "district_id", "category", "upazila_bn", "locality", "summary", "history", "how_to_go", "best_time"];

let errors = 0;
let warnings = 0;
const err = (m) => { console.log("  ✗ " + m); errors++; };
const warn = (m) => { console.log("  ⚠ " + m); warnings++; };

const args = process.argv.slice(2);
let files = args;
if (files.length === 0) {
  files = fs.readdirSync(PLACES_DIR).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(PLACES_DIR, f));
}

const seenNames = new Map(); // "districtId|key(name)" -> ফাইল
let totalPlaces = 0;
let totalHistory = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  console.log("\n=== " + rel + " ===");
  let raw;
  try { raw = read(file); } catch (e) { err("JSON পার্স ব্যর্থ: " + e.message); continue; }

  const list = Array.isArray(raw) ? raw : raw.places;
  if (!Array.isArray(list)) { err("ফাইলে places অ্যারে নেই"); continue; }

  let hist = 0;
  for (const p of list) {
    totalPlaces++;
    const label = `${p.name || "(নামহীন)"} [${p.district_id}]`;
    const issuesBefore = errors;

    // ১. আবশ্যক ঘর
    for (const f of REQUIRED) {
      const v = p[f];
      if (v == null || (typeof v === "string" && canon(v) === "")) err(`${label}: আবশ্যক ঘর "${f}" খালি বা নেই`);
    }
    if (errors !== issuesBefore) continue; // বাকি যাচাই অর্থহীন

    // ২. নতুন লেখা অবশ্যই যাচাই-বাকি চিহ্নিত থাকবে
    if (p.verified !== false) err(`${label}: verified:false নয় (পেলাম ${JSON.stringify(p.verified)}) — লেখকের নতুন তথ্য যাচাই-বাকি হিসেবে চিহ্নিত হতে হবে`);

    // ৩. জেলা বৈধ কিনা
    const did = String(p.district_id);
    const d = districtById.get(did);
    if (!d) { err(`${label}: জেলা আইডি ${did} districts.json-এ নেই`); continue; }

    // ৪. উপজেলার নাম বৈধ কিনা
    if (!UPANAME_EXCEPTIONS.has(canon(p.upazila_bn))) {
      if (!upazilaSet.has(`${did}|${key(p.upazila_bn)}`)) {
        const valid = upazilas.filter((u) => String(u.district_id) === did).map((u) => u.bn_name);
        err(`${label}: উপজেলা "${p.upazila_bn}" ${d.bn_name}-তে নেই। বৈধ: ${valid.join(", ")}`);
      }
    }

    // ৫. ক্যাটাগরি বৈধ কিনা
    const CATS = ["nature", "heritage", "beach", "river", "museum", "architecture", "culture"];
    if (!CATS.includes(p.category)) err(`${label}: অজানা category "${p.category}" (বৈধ: ${CATS.join(", ")})`);

    // ৬. স্থানাঙ্ক নীতি — নতুন গন্তব্যে lat/lon দেওয়া নিরুৎসাহিত
    if (typeof p.lat === "number" || typeof p.lon === "number") {
      if (p.override_coords !== true) {
        warn(`${label}: lat/lon দেওয়া আছে কিন্তু override_coords:true নেই — বিদ্যমান গন্তব্য হলে স্থানাঙ্ক বদলাবে না, নতুন হলে পলিগন-ছড়ানো এড়িয়ে যাবে`);
      }
    }

    // ৭. নামের সংঘর্ষ — একই জেলায় দুটি গন্তব্যের এক নাম হলে একটি নীরবে বাদ পড়বে
    const nk = `${did}|${key(p.name)}`;
    if (seenNames.has(nk)) err(`${label}: নামের সংঘর্ষ — আগে ${seenNames.get(nk)}-তে একই নাম আছে`);
    else seenNames.set(nk, rel);
    const clash = existing.find((x) => String(x.district_id) === did && key(x.name) === key(p.name));
    if (clash) warn(`${label}: বিদ্যমান গন্তব্যের সাথে নাম মিলছে — এটি সমৃদ্ধকরণ হিসেবে গণ্য হবে, নতুন সারি তৈরি হবে না`);

    // ৮. লিপি ও ভাষা যাচাই
    for (const f of PROSE_FIELDS) {
      const text = typeof p[f] === "string" ? p[f] : "";
      if (!text) continue;
      for (const c of SCRIPT_CHECKS) {
        const m = text.match(c.re);
        if (m) err(`${label}: "${f}"-এ ${c.name} পাওয়া গেছে → ${[...new Set(m)].join(" ")}`);
      }
      // বিদেশি শব্দ — অনুমোদিত তালিকার বাইরে
      for (const w of FOREIGN_ALLOWLIST) {
        if (text.includes(w)) err(`${label}: "${f}"-এ অনুমোদিত-তালিকার শব্দ "${w}" রয়েছে`);
      }
      // ভাসমান ইংরেজি শব্দ (৩+ অক্ষর) — বৈধ ইংরেজি শব্দ ঢুকে পড়লে ধরা পড়ে
      if (f !== "name" && f !== "locality") {
        const eng = text.match(/[A-Za-z]{3,}/g);
        if (eng) warn(`${label}: "${f}"-এ ইংরেজি শব্দ → ${[...new Set(eng)].slice(0, 6).join(", ")}`);
      }
    }

    // ৯. ইতিহাসের দৈর্ঘ্য — "বিস্তারিত ইতিহাস" শর্তটি খালি না থাকে
    const hl = (p.history || "").length;
    hist += hl;
    if (hl < 1200) warn(`${label}: ইতিহাস মাত্র ${hl} অক্ষর — বিস্তারিত হিসেবে যথেষ্ট নয়`);

    // ১০. অনুচ্ছেদ বিন্যাস
    if (!(p.history || "").includes("\n\n")) warn(`${label}: ইতিহাসে অনুচ্ছেদ ভাঙন (\\n\\n) নেই`);
  }

  totalHistory += hist;
  console.log(`  গন্তব্য ${list.length}টি | মোট ইতিহাস ${(hist / 1024).toFixed(1)} KB | গড় ${Math.round(hist / Math.max(1, list.length))} অক্ষর`);
}

console.log("\n" + "=".repeat(52));
console.log(`মোট ফাইল ${files.length} | গন্তব্য ${totalPlaces}টি | ইতিহাস ${(totalHistory / 1024).toFixed(1)} KB`);
if (errors === 0 && warnings === 0) console.log("✓ সব যাচাই পাস করেছে।");
else console.log(`${errors}টি ত্রুটি, ${warnings}টি সতর্কবার্তা।`);
if (errors > 0) {
  console.log("\nত্রুটি থাকলে পাইপলাইন গন্তব্য নীরবে বাদ দিতে পারে — আগে ঠিক করুন।");
}
process.exit(errors > 0 ? 1 : 0);
