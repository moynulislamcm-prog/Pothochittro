/**
 * sitemap.xml ও robots.txt তৈরি
 * ---------------------------------------------------------------
 * বিল্ডের আগে চলে (npm run build এর প্রথম ধাপ), আউটপুট web/public/ এ
 * লেখে — Vite সেগুলো dist/ এ কপি করে দেয়।
 *
 * ডোমেইন: VITE_SITE_URL env, না দিলে src/config.js এর ডিফল্ট।
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(root, "web", "public", "data");
const PUBLIC = path.join(root, "web", "public");

/* config.js এর ডিফল্টের সাথে মিল রাখা হয় */
const cfg = fs.readFileSync(path.join(root, "web", "src", "config.js"), "utf8");
const defaultUrl = /VITE_SITE_URL \|\| "([^"]+)"/.exec(cfg)?.[1] || "https://pothochittro.netlify.app";
const SITE_URL = String(process.env.VITE_SITE_URL || defaultUrl).replace(/\/+$/, "");

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const districts = read("districts.json");
const places = read("places.json");

const today = new Date().toISOString().slice(0, 10);
const abs = (p) => `${SITE_URL}${String(p).replace(/^\/+/, "/")}`;
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ */
/* sitemap.xml                                                        */
/* ------------------------------------------------------------------ */
/** কোন পৃষ্ঠায় গন্তব্যের নিজস্ব URL আছে কি না */
const placeUrl = (p) => `/places/${p.slug || p.id}`;
const districtUrl = (d) => `/districts/${d.slug || d.id}`;

const entries = [];
const add = (loc, { priority = "0.6", changefreq = "monthly", lastmod = today } = {}) =>
  entries.push({ loc: abs(loc), priority, changefreq, lastmod });

/* স্থির পৃষ্ঠা */
add("/", { priority: "1.0", changefreq: "weekly" });
add("/districts", { priority: "0.9", changefreq: "weekly" });
add("/places", { priority: "0.9", changefreq: "weekly" });
add("/distance", { priority: "0.5" });

/* প্রতিটি জেলা */
for (const d of districts) add(districtUrl(d), { priority: "0.8", changefreq: "weekly" });

/* প্রতিটি গন্তব্য — long-tail SEO এর মূল ভরসা */
for (const p of places) add(placeUrl(p), { priority: "0.7", changefreq: "monthly" });

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
for (const e of entries) {
  xml += `  <url>\n    <loc>${esc(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n`;
  xml += `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>\n`;
}
xml += `</urlset>\n`;
fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), xml);

/* ------------------------------------------------------------------ */
/* robots.txt                                                         */
/* ------------------------------------------------------------------ */
const robots = `# পথচিত্র — সব ক্রলারকে স্বাগত
User-agent: *
Allow: /

# ব্যক্তিগত ও প্রশাসনিক অংশ — সূচিভুক্ত করার দরকার নেই
Disallow: /admin
Disallow: /my-travel

# মানচিত্রের বড় ফাইলগুলো সূচিভুক্ত করার প্রয়োজন নেই
Disallow: /data/upazila-boundaries.geojson

Sitemap: ${SITE_URL}/sitemap.xml
`;
fs.writeFileSync(path.join(PUBLIC, "robots.txt"), robots);

const size = (f) => (fs.statSync(path.join(PUBLIC, f)).size / 1024).toFixed(1);
console.log("— SEO ফাইল তৈরি —");
console.log("ডোমেইন      :", SITE_URL);
console.log("sitemap.xml :", `${entries.length}টি URL (${size("sitemap.xml")} KB)`);
console.log("  জেলা      :", districts.length, "| গন্তব্য:", places.length, "| স্থির পৃষ্ঠা: 4");
console.log("robots.txt  :", `${size("robots.txt")} KB`);
if (!process.env.VITE_SITE_URL) {
  console.log("\n⚠ VITE_SITE_URL দেওয়া নেই — ডিফল্ট ডোমেইন ব্যবহার হয়েছে।");
  console.log("  আসল ডোমেইন হলে Netlify → Environment variables এ VITE_SITE_URL বসান।");
}
