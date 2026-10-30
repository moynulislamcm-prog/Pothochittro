import { trySupabase, hasBackend } from "./supabase.js";

/**
 * কনটেন্ট লোড করার কৌশল:
 *  ১. প্রথমে বান্ডিলের স্থির JSON (দ্রুত, অফলাইনেও চলে)
 *  ২. এরপর Supabase থেকে হালনাগাদ কনটেন্ট এলে সেটাই ব্যবহার হয়
 *     (এডমিন প্যানেল থেকে যা বদলানো যায়)
 *
 * ফলে এডমিন প্যানেল থেকে করা প্রতিটি পরিবর্তন সাথে সাথে সাইটে দেখা যায়,
 * আবার ব্যাকএন্ডে সমস্যা হলেও সাইট অচল হয়ে পড়ে না।
 */

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function loadStatic() {
  const [divisions, districts, upazilas, places, boundaries] = await Promise.all([
    fetchJson("/data/divisions.json"),
    fetchJson("/data/districts.json"),
    fetchJson("/data/upazilas.json"),
    fetchJson("/data/places.json"),
    fetchJson("/data/boundaries.geojson"),
  ]);
  return { divisions, districts, upazilas, places, boundaries, source: "static" };
}

function toBoundaries(rows) {
  return {
    type: "FeatureCollection",
    features: rows
      .filter((r) => r?.geojson?.geometry)
      .map((r) => ({
        type: "Feature",
        properties: {
          id: String(r.district_id),
          name: r.geojson.properties?.name || "",
          name_en: r.geojson.properties?.name_en || "",
        },
        geometry: r.geojson.geometry,
      })),
  };
}

/** Supabase থেকে কনটেন্ট; টেবিল খালি বা ত্রুটি হলে null */
async function loadFromSupabase() {
  if (!hasBackend) return null;

  const [divRes, disRes, upaRes, plaRes, bndRes] = await Promise.all([
    trySupabase((sb) => sb.from("pc_divisions").select("*").order("sort")),
    trySupabase((sb) => sb.from("pc_districts").select("*").order("id")),
    trySupabase((sb) => sb.from("pc_upazilas").select("*")),
    trySupabase((sb) => sb.from("pc_places").select("*")),
    trySupabase((sb) => sb.from("pc_boundaries").select("district_id,geojson")),
  ]);

  if (!disRes.ok || !Array.isArray(disRes.data) || disRes.data.length === 0) return null;

  const districts = disRes.data.map((d) => ({
    id: String(d.id),
    division_id: d.division_id ? String(d.division_id) : "",
    bn_name: d.bn_name,
    name: d.name,
    division: "",
    division_en: "",
    lat: d.lat,
    lon: d.lon,
    famous: d.famous || "",
    summary: d.summary || "",
    place_count: 0,
  }));

  const places = (plaRes.ok ? plaRes.data || [] : []).map((p) => ({
    // প্রথমে ডেটাবেসের সম্পূর্ণ সারি ছড়িয়ে দেওয়া হয়, তারপর পরিচিত ঘরগুলো
    // স্বাভাবিকীকরণ করা হয়।
    //
    // কেন এটি জরুরি: আগে এখানে একটি নির্দিষ্ট কলাম তালিকা ম্যাপ করা হতো,
    // যেখানে slug, history, dist_from_hq_km, locality, how_to_go, best_time,
    // coord_source ও verified ছিল না। অন্যদিকে mergeRemoteOverBase রিমোট
    // ডেটাকে স্থির ডেটার ওপর পুরোপুরি বসিয়ে দেয় ({ ...remote })। অর্থাৎ
    // ব্যাকএন্ড সিড করার মুহূর্তেই সাইট থেকে সব ইতিহাস ও জেলা-শহর থেকে
    // দূরত্ব নীরবে মুছে যেত এবং slug না থাকায় /places/:slug রাউটিং ভেঙে
    // যেত। ছড়িয়ে দেওয়ার ফলে ভবিষ্যতে ডেটাবেসে নতুন কলাম যোগ হলে সেটি
    // নিজে থেকেই ফ্রন্টএন্ডে প্রবাহিত হবে — একই বাগ আর ফিরবে না।
    ...p,
    id: String(p.id),
    district_id: String(p.district_id),
    district_bn: p.district_bn || "",
    district_en: p.district_en || "",
    name: p.name,
    name_en: p.name_en || "",
    category: p.category || "heritage",
    upazila_id: p.upazila_id ? String(p.upazila_id) : null,
    upazila_bn: p.upazila_bn || "",
    locality: p.locality || "",
    summary: p.summary || "",
    description: p.description || "",
    history: p.history || "",
    how_to_go: p.how_to_go || "",
    best_time: p.best_time || "",
    coord_source: p.coord_source || "",
    dist_from_hq_km: p.dist_from_hq_km ?? null,
    verified: p.verified ?? true,
    image: p.image || null,
  }));

  const upazilas = (upaRes.ok ? upaRes.data || [] : []).map((u) => ({
    id: String(u.id),
    district_id: String(u.district_id),
    district_en: "",
    name: u.name || "",
    bn_name: u.bn_name,
  }));

  const divisions = divRes.ok
    ? (divRes.data || []).map((v) => ({ id: String(v.id), bn_name: v.bn_name, name: v.name }))
    : [];

  const boundaries =
    bndRes.ok && Array.isArray(bndRes.data) && bndRes.data.length
      ? toBoundaries(bndRes.data)
      : null;

  return { divisions, districts, upazilas, places, boundaries, source: "supabase" };
}

/** বিভাগের নাম ও জেলার নাম প্রতিটি গন্তব্যে যুক্ত করে নেওয়া */
export function enrich(content) {
  const districtById = new Map(content.districts.map((d) => [d.id, d]));
  const divisionById = new Map((content.divisions || []).map((v) => [v.id, v]));

  for (const d of content.districts) {
    const div = divisionById.get(d.division_id);
    if (div) {
      d.division = d.division || div.bn_name;
      d.division_en = d.division_en || div.name;
    }
    d.place_count = content.places.filter((p) => p.district_id === d.id).length;
  }
  for (const p of content.places) {
    const d = districtById.get(p.district_id);
    if (d) {
      p.district_bn = p.district_bn || d.bn_name;
      p.district_en = p.district_en || d.name;
      p.division = d.division;
    }
  }
  for (const u of content.upazilas) {
    const d = districtById.get(u.district_id);
    if (d) {
      u.district_en = u.district_en || d.name;
      u.district_bn = d.bn_name;
    }
  }
  return content;
}

/** নির্দিষ্ট সময়ের মধ্যে ফলাফল, না হলে টাইমআউট */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} টাইমআউট`)), ms)),
  ]);
}

/**
 * বান্ডিলের স্থির ডেটা — সাথে সাথে ফেরে, তাই সাইট কখনো লোডিং স্ক্রিনে আটকে থাকে না।
 */
export async function loadStaticContent() {
  const base = enrich(await loadStatic());
  return { ...base, online: false };
}

/**
 * Supabase থেকে হালনাগাদ কনটেন্ট। ব্যাকএন্ড না চললে, ডেটাবেস খালি থাকলে,
 * বা ধীর হলে null ফেরে — তখন স্থির ডেটাতেই সাইট চলতে থাকে।
 */
export async function loadRemoteContent({ timeoutMs = 8000 } = {}) {
  if (!hasBackend) return null;
  try {
    const remote = await withTimeout(loadFromSupabase(), timeoutMs, "ব্যাকএন্ড");
    if (!remote) return null;
    return { ...enrich(remote), online: true };
  } catch (err) {
    console.warn("ব্যাকএন্ড থেকে কনটেন্ট আনা যায়নি:", err?.message || err);
    return null;
  }
}

/** স্থির + ব্যাকএন্ড একসাথে (পুরনো কলারের জন্য রাখা) */
export async function loadContent() {
  let base = null;
  try {
    base = await loadStaticContent();
  } catch (err) {
    console.warn("স্থির ডেটা লোড করা যায়নি:", err);
  }

  const remote = await loadRemoteContent();
  if (!remote) {
    if (!base) throw new Error("কোনো ডেটা লোড করা যায়নি");
    return base;
  }
  return mergeRemoteOverBase(base, remote);
}

/** ব্যাকএন্ডের ডেটায় যা নেই (যেমন সীমানা) সেটি বান্ডিল থেকে পূরণ */
export function mergeRemoteOverBase(base, remote) {
  const out = { ...remote };
  if (!out.boundaries?.features?.length && base?.boundaries) out.boundaries = base.boundaries;
  if (!out.divisions?.length && base?.divisions?.length) out.divisions = base.divisions;
  return enrich(out);
}

/** সাইট সেটিংস (এডমিন প্যানেল থেকে বদলানো যায়) */
export async function loadSettings() {
  const res = await trySupabase((sb) => sb.from("pc_settings").select("key,value"));
  const out = {};
  if (res.ok && Array.isArray(res.data)) {
    for (const row of res.data) out[row.key] = row.value;
  }
  return out;
}
