/**
 * seed-content — সাইটের কনটেন্ট GitHub থেকে পড়ে ডেটাবেসে সিড করে।
 *
 * কেন এটি দরকার: ২৮০ গন্তব্যের ডেটা প্রায় ৫১৭ KB (১০৬টিতে গড়ে ২,২৬২ অক্ষরের
 * ইতিহাস)। এত বড় ডেটা সরাসরি SQL হিসেবে পাঠানো সম্ভব নয়, তাই ফেচ ও
 * ইনসার্ট সার্ভার-সাইডেই করা হয়।
 *
 * চালানোর নিয়ম (স্যান্ডবক্স থেকে supabase.co পৌঁছানো যায় না, তাই ডেটাবেসের
 * pg_net দিয়ে ট্রিগার করতে হয়):
 *
 *   CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
 *   SELECT net.http_post(
 *     url := 'https://<project-ref>.supabase.co/functions/v1/seed-content',
 *     headers := '{"x-seed-token": "<SEED_TOKEN>"}'::jsonb,
 *     body := '{}'::jsonb,
 *     timeout_milliseconds := 120000);
 *   -- ফলাফল: SELECT * FROM net._http_response ORDER BY id DESC LIMIT 1;
 *
 * তিনটি বাগ এড়ানোর জন্য এই সংস্করণে যা করা হয়েছে:
 *  ১. কোনো বাহ্যিক মডিউল ইমপোর্ট নেই। supabase-js (esm.sh) দিয়ে লিখলে
 *     ফাংশনটি BOOT_ERROR দিত — মডিউল লোডই হতো না। তাই সরাসরি
 *     PostgREST-এ fetch করা হয়।
 *  ২. প্রতিটি সারির কী-সেট হুবহু একই। PostgREST বাল্ক ইনসার্টে ভিন্ন ভিন্ন কী
 *     থাকলে PGRST102 "All object keys must match" দিয়ে ব্যর্থ হয়। আগে শুধু
 *     অ-নাল ঘর পাঠানো হতো, ফলে ইতিহাস-ছাড়া ১৭৪টি গন্তব্যে `history` কী
 *     অনুপস্থিত ছিল। এখন NOT NULL ঘরে ডিফল্ট ও নাল-যোগ্য ঘরে null বসিয়ে
 *     একটি অভিন্ন আকার তৈরি করা হয়।
 *  ৩. সারি গণনায় HEAD অনুরোধ। আগে সব টেবিলে `select=id` ব্যবহার হতো,
 *     কিন্তু pc_boundaries-এর প্রাইমারি কী district_id — ফলে গণনা ০ দেখাত
 *     অথচ ডেটা ঠিকই ঢুকেছিল। HEAD + select=* যেকোনো টেবিলে কাজ করে এবং
 *     বডি ফেরত না দেওয়ায় বিশাল geojson নামানোর অপচয়ও হয় না।
 *
 * নিরাপত্তা: কেবল SEED_TOKEN মিললে চলে এবং নির্দিষ্ট পাবলিক রিপোর নির্দিষ্ট
 * ব্রাঞ্চ থেকে ডেটা নেয়। কোনো ইনপুট পেলোড গ্রহণ করে না, তাই বাইরে থেকে
 * কনটেন্ট ঢোকানোর সুযোগ নেই। টোকেনটি Supabase Secrets-এ SEED_TOKEN নামে আছে।
 */
const REPO = "moynulislamcm-prog/Pothochittro";
const BRANCH = "arena/e82b25e3-pothochittro";
const BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/web/public/data`;

const jsonOut = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

Deno.serve(async (req) => {
  const want = Deno.env.get("SEED_TOKEN");
  const got = req.headers.get("x-seed-token") ?? new URL(req.url).searchParams.get("token") ?? "";
  if (!want || got !== want) return jsonOut({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return jsonOut({ error: "সার্ভিস কী পাওয়া যায়নি" }, 500);

  const REST = `${url}/rest/v1`;
  const auth: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  const report: Record<string, unknown> = { started_at: new Date().toISOString() };

  const upsert = async (table: string, rows: any[], chunk = 50) => {
    for (let i = 0; i < rows.length; i += chunk) {
      const res = await fetch(`${REST}/${table}`, {
        method: "POST",
        headers: { ...auth, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(rows.slice(i, i + chunk)),
      });
      if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
    }
    return rows.length;
  };

  const count = async (table: string, extra = "") => {
    const res = await fetch(`${REST}/${table}?select=*&limit=1${extra}`, {
      method: "HEAD",
      headers: { ...auth, Prefer: "count=exact" },
    });
    return Number((res.headers.get("content-range") || "").split("/")[1] ?? 0);
  };

  try {
    const getJson = async (name: string) => {
      const r = await fetch(`${BASE}/${name}`);
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      return await r.json();
    };

    const [divisions, districts, upazilas, places, boundaries] = await Promise.all([
      getJson("divisions.json"),
      getJson("districts.json"),
      getJson("upazilas.json"),
      getJson("places.json"),
      getJson("boundaries.geojson"),
    ]);

    // বিভাগ → জেলা → উপজেলা → গন্তব্য → সীমানা (FK ক্রম গুরুত্বপূর্ণ)
    report.divisions = await upsert(
      "pc_divisions",
      (divisions as any[]).map((d, i) => ({
        id: String(d.id),
        bn_name: d.bn_name ?? "",
        name: d.name ?? "",
        sort: d.sort ?? i,
      })),
    );

    report.districts = await upsert(
      "pc_districts",
      (districts as any[]).map((d) => ({
        id: String(d.id),
        division_id: d.division_id ? String(d.division_id) : null,
        bn_name: d.bn_name ?? "",
        name: d.name ?? "",
        lat: d.lat ?? null,
        lon: d.lon ?? null,
        famous: d.famous ?? "",
        summary: d.summary ?? "",
        is_published: true,
      })),
    );

    const districtIds = new Set((districts as any[]).map((d) => String(d.id)));

    // জেলার সাথে না মেলা উপজেলা বাদ — নাহলে FK ইনসার্ট ব্যর্থ করবে
    report.upazilas = await upsert(
      "pc_upazilas",
      (upazilas as any[])
        .filter((u) => districtIds.has(String(u.district_id)))
        .map((u) => ({
          id: String(u.id),
          district_id: String(u.district_id),
          bn_name: u.bn_name ?? "",
          name: u.name ?? "",
        })),
    );

    const upazilaIds = new Set((upazilas as any[]).map((u) => String(u.id)));
    let nullified = 0;
    const prows = (places as any[])
      .filter((p) => districtIds.has(String(p.district_id)))
      .map((p) => {
        // খালি স্ট্রিং বা অজানা upazila_id → null, নাহলে FK ইনসার্ট ব্যর্থ করবে
        const raw = p.upazila_id ? String(p.upazila_id) : null;
        const ok = raw && upazilaIds.has(raw) ? raw : null;
        if (raw && !ok) nullified++;
        return {
          id: String(p.id),
          district_id: String(p.district_id),
          upazila_id: ok,
          upazila_bn: p.upazila_bn ?? "",
          name: p.name ?? "",
          name_en: p.name_en ?? "",
          category: p.category ?? "heritage",
          lat: p.lat ?? null,
          lon: p.lon ?? null,
          summary: p.summary ?? "",
          description: p.description ?? "",
          image: p.image ?? null,
          slug: p.slug ?? null,
          history: p.history ?? null,
          how_to_go: p.how_to_go ?? null,
          best_time: p.best_time ?? null,
          locality: p.locality ?? null,
          dist_from_hq_km: p.dist_from_hq_km ?? null,
          coord_source: p.coord_source ?? null,
          coord_verified: p.coord_verified === true,
          verified: p.verified !== false,
          source: p.source ?? null,
          is_published: true,
        };
      });
    report.places = await upsert("pc_places", prows);
    report.skipped_places_bad_district = (places as any[]).length - prows.length;
    report.nullified_upazila_id = nullified;

    // সীমানা বড়, তাই ছোট ভাগে
    const features = (boundaries as any)?.features ?? [];
    report.boundaries = await upsert(
      "pc_boundaries",
      features
        .filter((f: any) => districtIds.has(String(f.properties?.id)))
        .map((f: any) => ({
          district_id: String(f.properties.id),
          geojson: { type: "Feature", properties: f.properties, geometry: f.geometry },
        })),
      5,
    );

    // ডেটাবেসে আসলে কী ঢুকল তার নিরপেক্ষ যাচাই (রিপোর্ট নয়, সরাসরি গণনা)
    report.db_rows = {
      pc_divisions: await count("pc_divisions"),
      pc_districts: await count("pc_districts"),
      pc_upazilas: await count("pc_upazilas"),
      pc_places: await count("pc_places"),
      pc_boundaries: await count("pc_boundaries"),
    };
    report.db_places_with_history = await count("pc_places", "&history=not.is.null");
    report.db_places_with_slug = await count("pc_places", "&slug=not.is.null");
    report.db_places_unverified = await count("pc_places", "&verified=eq.false");

    report.finished_at = new Date().toISOString();
    return jsonOut(report);
  } catch (err) {
    report.error = (err as Error)?.message || String(err);
    report.failed_at = new Date().toISOString();
    return jsonOut(report, 500);
  }
});
