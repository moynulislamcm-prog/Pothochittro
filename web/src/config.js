/**
 * পথচিত্র — কনফিগ
 *
 * publishable/anon কী পাবলিক; ব্রাউজারে থাকা নিরাপদ।
 * আসল নিরাপত্তা Supabase-এর Row Level Security নীতিতে (supabase/schema.sql)।
 */
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || "https://oxziyvshobedekqobyyo.supabase.co";

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_wuHnyuPIThfzbjSvnn8oPA_Zow9ceYb";

/** সুবিধা না থাকলে (অফলাইন ডেমো) ডেটা শুধু বান্ডিল থেকে আসবে */
export const STANDALONE =
  import.meta.env.VITE_PATHCHITRO_STANDALONE === "true" ||
  (typeof window !== "undefined" && window.__PATHCHITRO_STANDALONE__ === true);

export const SITE = {
  name: "পথচিত্র",
  tagline: "বাংলাদেশ, আপনার পথে",
};

/** মানচিত্রের টাইল */
export const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const MAP_ATTRIBUTION = '&copy; OpenStreetMap';

/** বাংলাদেশের প্রাথমিক ভিউ */
export const BD_CENTER = [23.685, 90.3563];
export const BD_BOUNDS = [
  [20.5, 88.0],
  [26.7, 92.8],
];

/** সড়কপথের দূরত্ব (ঐচ্ছিক; না চললে সরলরেখার দূরত্বই দেখানো হয়) */
export const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
