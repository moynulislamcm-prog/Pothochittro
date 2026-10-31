/**
 * পথচিত্র — কনফিগ
 *
 * publishable/anon কী পাবলিক; ব্রাউজারে থাকা নিরাপদ।
 * আসল নিরাপত্তা Supabase-এর Row Level Security নীতিতে (supabase/schema.sql)।
 */
const env = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const SUPABASE_URL =
  env.VITE_SUPABASE_URL || "https://oxziyvshobedekqobyyo.supabase.co";

export const SUPABASE_ANON_KEY =
  env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_wuHnyuPIThfzbjSvnn8oPA_Zow9ceYb";

/** সুবিধা না থাকলে (অফলাইন ডেমো) ডেটা শুধু বান্ডিল থেকে আসবে */
export const STANDALONE =
  env.VITE_PATHCHITRO_STANDALONE === "true" ||
  (typeof window !== "undefined" && window.__PATHCHITRO_STANDALONE__ === true);

export const SITE = {
  name: "পথচিত্র",
  tagline: "বাংলাদেশ, আপনার পথে",
};

/* ------------------------------------------------------------------ */
/* মানচিত্রের টাইল                                                      */
/* ------------------------------------------------------------------ */
/**
 * হালকা বেসম্যাপ (CARTO Positron) — জেলার রঙ স্পষ্ট ফুটে ওঠে।
 * আগের OSM স্ট্যান্ডার্ড টাইল খুব ব্যস্ত ছিল, তাই সীমানার রঙ চাপা পড়ে যেত।
 */
export const MAP_TILE_URL = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

/**
 * টাইল ও সীমানার কৃতিত্ব। CARTO বেসম্যাপ ও geoBoundaries সীমানা —
 * দুটোই CC BY / ODbL শর্তে উৎস উল্লেখ বাধ্যতামূলক করে, তাই এটি রাখা হয়েছে।
 * এডমিন → সেটিংস → prefs.mapAttribution দিয়ে বন্ধ করা যায়।
 */
export const MAP_ATTRIBUTION =
  "&copy; OpenStreetMap অবদানকারী &copy; CARTO | সীমানা: geoBoundaries (CC BY 4.0)";

/** উপজেলার বিস্তারিত সীমানা — বড় ফাইল, তাই শুধু জুম করলে লোড হয় */
export const UPAZILA_BOUNDS_URL = "/data/upazila-boundaries.geojson";
export const UPAZILA_MIN_ZOOM = 9;

/* ------------------------------------------------------------------ */
/* বাংলাদেশের প্রাথমিক ভিউ                                             */
/* ------------------------------------------------------------------ */
export const BD_CENTER = [23.685, 90.3563];
export const BD_BOUNDS = [
  [20.5, 88.0],
  [26.7, 92.8],
];

/** সড়কপথের দূরত্ব (ঐচ্ছিক; না চললে সরলরেখার দূরত্বই দেখানো হয়) */
export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

/** সাইটের ক্যানোনিকাল ঠিকানা — SEO (sitemap, canonical, Open Graph) এর জন্য */
export const SITE_URL = env.VITE_SITE_URL || "https://pothochittro.netlify.app";
