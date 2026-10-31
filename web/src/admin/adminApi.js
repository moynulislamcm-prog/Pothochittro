import { supabase, hasBackend, trySupabase } from "../lib/supabase.js";

/** এডমিন প্যানেলের সব ডেটা অপারেশন এক জায়গায় */

export const TABLES = {
  divisions: "pc_divisions",
  districts: "pc_districts",
  upazilas: "pc_upazilas",
  places: "pc_places",
  boundaries: "pc_boundaries",
  profiles: "pc_profiles",
  visited: "pc_visited",
  placeMarks: "pc_place_marks",
  settings: "pc_settings",
};

export async function claimAdmin() {
  if (!hasBackend) return { ok: false, error: "ব্যাকএন্ড সংযুক্ত নেই" };
  const { data, error } = await supabase.rpc("pc_claim_admin");
  if (error) return { ok: false, error: error.message };
  return { ok: data === "ok", code: data };
}

export async function adminStats() {
  const { data, error } = await supabase.rpc("pc_admin_stats");
  if (error) throw error;
  return data;
}

export async function listRows(table, { order, limit } = {}) {
  const res = await trySupabase((sb) => {
    let q = sb.from(table).select("*");
    if (order) q = q.order(order.column || order, { ascending: order.ascending ?? true });
    if (limit) q = q.limit(limit);
    return q;
  });
  return res;
}

export async function upsertRow(table, row, onConflict) {
  return trySupabase((sb) =>
    sb.from(table).upsert(row, onConflict ? { onConflict } : undefined),
  );
}

export async function deleteRow(table, column, value) {
  return trySupabase((sb) => sb.from(table).delete().eq(column, value));
}

export async function insertRow(table, row) {
  return trySupabase((sb) => sb.from(table).insert(row));
}

export async function updateRow(table, pk, pkValue, patch) {
  return trySupabase((sb) => sb.from(table).update(patch).eq(pk, pkValue));
}

/* ---------- সেটিংস ---------- */

export async function getSetting(key) {
  const res = await trySupabase((sb) => sb.from(TABLES.settings).select("value").eq("key", key).maybeSingle());
  return res.ok ? res.data?.value ?? null : null;
}

export async function setSetting(key, value) {
  return trySupabase((sb) =>
    sb.from(TABLES.settings).upsert({ key, value }, { onConflict: "key" }),
  );
}

/* ---------- বাল্ক ইমপোর্ট (সিড) ---------- */

/**
 * বান্ডিলের স্থির JSON থেকে পুরো কনটেন্ট Supabase-এ তোলা।
 * ব্রাউজার থেকে চলে বলে অনেক ডেটা একসাথে পাঠানো যায়,
 * আবার একই বোতাম দুইবার চাপলেও ডুপ্লিকেট হয় না (upsert)।
 */
export async function seedFromBundle(onProgress) {
  if (!hasBackend) throw new Error("ব্যাকএন্ড সংযুক্ত নেই");

  const step = (label, pct) => onProgress?.({ label, pct });

  step("ফাইল পড়া হচ্ছে", 5);
  const [divisions, districts, upazilas, places, boundaries] = await Promise.all([
    fetch("/data/divisions.json").then((r) => r.json()),
    fetch("/data/districts.json").then((r) => r.json()),
    fetch("/data/upazilas.json").then((r) => r.json()),
    fetch("/data/places.json").then((r) => r.json()),
    fetch("/data/boundaries.geojson").then((r) => r.json()),
  ]);

  const CHUNK = 50;
  async function pushChunked(table, rows, map, label, base) {
    const mapped = rows.map(map).filter(Boolean);
    for (let i = 0; i < mapped.length; i += CHUNK) {
      const slice = mapped.slice(i, i + CHUNK);
      const { error } = await supabase.from(table).upsert(slice);
      if (error) throw new Error(`${label}: ${error.message}`);
      onProgress?.({ label, pct: base + Math.round((i / mapped.length) * 20) });
    }
    return mapped.length;
  }

  step("বিভাগ", 10);
  await pushChunked(
    TABLES.divisions,
    divisions.map((d, i) => ({ ...d, sort: i })),
    (d) => d,
    "বিভাগ",
    10,
  );

  step("জেলা", 20);
  const nDistricts = await pushChunked(
    TABLES.districts,
    districts,
    (d) => ({
      id: d.id,
      division_id: d.division_id || null,
      bn_name: d.bn_name,
      name: d.name,
      lat: d.lat,
      lon: d.lon,
      famous: d.famous || "",
      summary: d.summary || "",
      is_published: true,
    }),
    "জেলা",
    20,
  );

  step("উপজেলা", 35);
  const nUpazilas = await pushChunked(
    TABLES.upazilas,
    upazilas,
    (u) => ({ id: u.id, district_id: u.district_id, bn_name: u.bn_name, name: u.name || "" }),
    "উপজেলা",
    35,
  );

  step("গন্তব্য", 50);
  const nPlaces = await pushChunked(
    TABLES.places,
    places,
    (p) => ({
      // প্রথমে পুরো গন্তব্য ছড়িয়ে দেওয়া হয়, তারপর পরিচিত ঘর স্বাভাবিকীকরণ।
      //
      // কেন: আগে এখানে একটি নির্দিষ্ট কলাম তালিকা ছিল, যেখানে slug, history,
      // how_to_go, best_time, locality, coord_source, dist_from_hq_km ও
      // verified ছিল না। ফলে এডমিন প্যানেল থেকে সিড করলে ডেটাবেসে সব
      // ইতিহাস NULL হয়ে যেত — এবং লোড করার সময় রিমোট ডেটা স্থির ডেটাকে
      // প্রতিস্থাপন করায় সাইট থেকে ইতিহাস ও দূরত্ব মুছে যেত।
      // district_bn/district_en/division_bn ইচ্ছাকৃতভাবে পাঠানো হয় না:
      // সেগুলো api.js-এর enrich() জয়েন থেকে ক্লায়েন্ট সাইডেই বানিয়ে নেয়।
      ...p,
      id: p.id,
      district_id: p.district_id,
      upazila_id: p.upazila_id || null,
      upazila_bn: p.upazila_bn || "",
      name: p.name,
      name_en: p.name_en || "",
      category: p.category || "heritage",
      lat: p.lat,
      lon: p.lon,
      locality: p.locality || null,
      summary: p.summary || "",
      description: p.description || "",
      history: p.history || null,
      how_to_go: p.how_to_go || null,
      best_time: p.best_time || null,
      dist_from_hq_km: p.dist_from_hq_km ?? null,
      coord_source: p.coord_source || null,
      coord_verified: p.coord_verified === true,
      verified: p.verified !== false,
      image: p.image || null,
      is_published: true,
    }),
    "গন্তব্য",
    50,
  );

  step("সীমানা", 70);
  // সীমানা বড় বলে ছোট ছোট ভাগে পাঠানো হয়
  const features = boundaries?.features || [];
  const rows = features.map((f) => ({
    district_id: String(f.properties.id),
    geojson: { type: "Feature", properties: f.properties, geometry: f.geometry },
  }));
  for (let i = 0; i < rows.length; i += 5) {
    const { error } = await supabase
      .from(TABLES.boundaries)
      .upsert(rows.slice(i, i + 5), { onConflict: "district_id" });
    if (error) throw new Error(`সীমানা: ${error.message}`);
    onProgress?.({ label: "সীমানা", pct: 70 + Math.round((i / rows.length) * 25) });
  }

  step("সম্পন্ন", 100);
  return { districts: nDistricts, upazilas: nUpazilas, places: nPlaces, boundaries: rows.length };
}

/** সাইটের বর্তমান কনটেন্ট JSON হিসেবে নামানো */
export async function exportContent() {
  const [divisions, districts, upazilas, places, boundaries] = await Promise.all([
    listRows(TABLES.divisions, { order: { column: "sort" } }),
    listRows(TABLES.districts, { order: { column: "id" } }),
    listRows(TABLES.upazilas),
    listRows(TABLES.places),
    listRows(TABLES.boundaries),
  ]);

  return {
    exported_at: new Date().toISOString(),
    divisions: divisions.data || [],
    districts: districts.data || [],
    upazilas: upazilas.data || [],
    places: places.data || [],
    boundaries: {
      type: "FeatureCollection",
      features: (boundaries.data || []).map((b) => b.geojson),
    },
  };
}

/** JSON ফাইল থেকে কনটেন্ট ইমপোর্ট */
export async function importContent(payload, onProgress) {
  if (!hasBackend) throw new Error("ব্যাকএন্ড সংযুক্ত নেই");
  const step = (label, pct) => onProgress?.({ label, pct });

  if (payload.divisions?.length) {
    step("বিভাগ", 10);
    await supabase.from(TABLES.divisions).upsert(payload.divisions);
  }
  if (payload.districts?.length) {
    step("জেলা", 25);
    for (let i = 0; i < payload.districts.length; i += 50) {
      const { error } = await supabase
        .from(TABLES.districts)
        .upsert(payload.districts.slice(i, i + 50));
      if (error) throw new Error(`জেলা: ${error.message}`);
    }
  }
  if (payload.upazilas?.length) {
    step("উপজেলা", 45);
    for (let i = 0; i < payload.upazilas.length; i += 100) {
      const { error } = await supabase
        .from(TABLES.upazilas)
        .upsert(payload.upazilas.slice(i, i + 100));
      if (error) throw new Error(`উপজেলা: ${error.message}`);
    }
  }
  if (payload.places?.length) {
    step("গন্তব্য", 65);
    for (let i = 0; i < payload.places.length; i += 25) {
      const { error } = await supabase.from(TABLES.places).upsert(payload.places.slice(i, i + 25));
      if (error) throw new Error(`গন্তব্য: ${error.message}`);
    }
  }
  const features = payload.boundaries?.features || [];
  if (features.length) {
    step("সীমানা", 85);
    const rows = features.map((f) => ({
      district_id: String(f.properties?.id),
      geojson: f,
    }));
    for (let i = 0; i < rows.length; i += 5) {
      const { error } = await supabase
        .from(TABLES.boundaries)
        .upsert(rows.slice(i, i + 5), { onConflict: "district_id" });
      if (error) throw new Error(`সীমানা: ${error.message}`);
    }
  }
  step("সম্পন্ন", 100);
  return true;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
