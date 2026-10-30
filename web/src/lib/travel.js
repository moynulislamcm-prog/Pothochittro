import { trySupabase, hasBackend } from "./supabase.js";

/**
 * ভ্রমণতালিকা সংরক্ষণ
 * ----------------------
 * গেস্ট অবস্থায় সব তথ্য এই ব্রাউজারে (localStorage) থাকে।
 * লগইন করলে ব্রাউজারের তালিকা অ্যাকাউন্টে মার্জ হয়,
 * এরপর দুই জায়গাই সমান থাকে — তাই ডিভাইস বদলালেও তালিকা হারায় না।
 */

const KEY = "pothochittro.travel.v1";

export const emptyTravel = {
  visitedDistricts: {}, // { districtId: { note, at } }
  wishlistDistricts: {},
  visitedPlaces: {},
  wishlistPlaces: {},
  updatedAt: null,
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function readLocal() {
  if (typeof localStorage === "undefined") return { ...emptyTravel };
  const raw = safeParse(localStorage.getItem(KEY) || "null");
  if (!raw) return { ...emptyTravel };
  return {
    ...emptyTravel,
    ...raw,
    visitedDistricts: raw.visitedDistricts || {},
    wishlistDistricts: raw.wishlistDistricts || {},
    visitedPlaces: raw.visitedPlaces || {},
    wishlistPlaces: raw.wishlistPlaces || {},
  };
}

export function writeLocal(travel) {
  if (typeof localStorage === "undefined") return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...travel, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

/** অ্যাকাউন্টের তালিকা নামানো */
export async function fetchRemote() {
  if (!hasBackend) return null;
  const [vis, marks] = await Promise.all([
    trySupabase((sb) => sb.from("pc_visited").select("district_id,status,note,updated_at")),
    trySupabase((sb) => sb.from("pc_place_marks").select("place_id,status,note,updated_at")),
  ]);
  if (!vis.ok && !marks.ok) return null;

  const travel = { ...emptyTravel };
  for (const row of vis.ok ? vis.data || [] : []) {
    const bucket = row.status === "wishlist" ? travel.wishlistDistricts : travel.visitedDistricts;
    bucket[String(row.district_id)] = { note: row.note || "", at: row.updated_at };
  }
  for (const row of marks.ok ? marks.data || [] : []) {
    const bucket = row.status === "wishlist" ? travel.wishlistPlaces : travel.visitedPlaces;
    bucket[String(row.place_id)] = { note: row.note || "", at: row.updated_at };
  }
  travel.updatedAt = new Date().toISOString();
  return travel;
}

/**
 * মার্জ: দুই পক্ষের তালিকা এক করা।
 * নতুন তথ্য পুরনোটা সরিয়ে দেয় না — শুধু যোগ হয়।
 */
export function mergeTravel(local, remote) {
  const out = { ...emptyTravel };
  for (const key of ["visitedDistricts", "wishlistDistricts", "visitedPlaces", "wishlistPlaces"]) {
    const a = local?.[key] || {};
    const b = remote?.[key] || {};
    const ids = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const id of ids) {
      const av = a[id];
      const bv = b[id];
      if (av && !bv) out[key][id] = av;
      else if (!av && bv) out[key][id] = bv;
      else {
        const atA = av?.at || "";
        const atB = bv?.at || "";
        const winner = atA >= atB ? av : bv;
        out[key][id] = { note: winner?.note || av?.note || bv?.note || "", at: winner?.at };
      }
    }
  }
  out.updatedAt = new Date().toISOString();
  return out;
}

/** পুরো তালিকা সার্ভারে পাঠানো (upsert) */
export async function pushRemote(travel) {
  if (!hasBackend) return { ok: false, error: "no-backend" };

  const profile = await trySupabase((sb) => sb.from("pc_profiles").select("id").maybeSingle());
  if (!profile.ok || !profile.data) return { ok: false, error: "no-profile" };

  const visitedRows = [];
  const markRows = [];

  for (const [status, bucket] of [
    ["visited", travel.visitedDistricts],
    ["wishlist", travel.wishlistDistricts],
  ]) {
    for (const [district_id, meta] of Object.entries(bucket || {})) {
      visitedRows.push({ district_id, status, note: meta?.note || "" });
    }
  }
  for (const [status, bucket] of [
    ["visited", travel.visitedPlaces],
    ["wishlist", travel.wishlistPlaces],
  ]) {
    for (const [place_id, meta] of Object.entries(bucket || {})) {
      markRows.push({ place_id, status, note: meta?.note || "" });
    }
  }

  const results = [];
  if (visitedRows.length) {
    results.push(
      await trySupabase((sb) =>
        sb.from("pc_visited").upsert(visitedRows, { onConflict: "district_id,status" }),
      ),
    );
  }
  if (markRows.length) {
    results.push(
      await trySupabase((sb) =>
        sb.from("pc_place_marks").upsert(markRows, { onConflict: "place_id,status" }),
      ),
    );
  }
  const failed = results.find((r) => !r.ok);
  return failed ? { ok: false, error: failed.error?.message || "server" } : { ok: true };
}

/* ---------- একক আইটেম বদল ---------- */

export async function setDistrictStatus(travel, districtId, status) {
  const next = {
    ...travel,
    visitedDistricts: { ...travel.visitedDistricts },
    wishlistDistricts: { ...travel.wishlistDistricts },
  };
  delete next.visitedDistricts[districtId];
  delete next.wishlistDistricts[districtId];

  if (status === "visited") next.visitedDistricts[districtId] = { note: "", at: new Date().toISOString() };
  if (status === "wishlist") next.wishlistDistricts[districtId] = { note: "", at: new Date().toISOString() };

  writeLocal(next);
  if (hasBackend) {
    await Promise.all([
      trySupabase((sb) => sb.from("pc_visited").delete().eq("district_id", districtId)),
    ]);
    if (status) {
      const table = "pc_visited";
      await trySupabase((sb) =>
        sb.from(table).upsert(
          { district_id: districtId, status, note: "" },
          { onConflict: "district_id,status" },
        ),
      );
    }
  }
  return next;
}

export async function setPlaceStatus(travel, placeId, status) {
  const next = {
    ...travel,
    visitedPlaces: { ...travel.visitedPlaces },
    wishlistPlaces: { ...travel.wishlistPlaces },
  };
  delete next.visitedPlaces[placeId];
  delete next.wishlistPlaces[placeId];

  if (status === "visited") next.visitedPlaces[placeId] = { note: "", at: new Date().toISOString() };
  if (status === "wishlist") next.wishlistPlaces[placeId] = { note: "", at: new Date().toISOString() };

  writeLocal(next);
  if (hasBackend) {
    await trySupabase((sb) => sb.from("pc_place_marks").delete().eq("place_id", placeId));
    if (status) {
      await trySupabase((sb) =>
        sb.from("pc_place_marks").upsert(
          { place_id: placeId, status, note: "" },
          { onConflict: "place_id,status" },
        ),
      );
    }
  }
  return next;
}

export async function saveNote(travel, kind, id, note) {
  const key =
    kind === "visited-district"
      ? "visitedDistricts"
      : kind === "wishlist-district"
        ? "wishlistDistricts"
        : kind === "visited-place"
          ? "visitedPlaces"
          : "wishlistPlaces";
  const table = key.endsWith("Places") ? "pc_place_marks" : "pc_visited";
  const idCol = table === "pc_visited" ? "district_id" : "place_id";
  const status = key.startsWith("wishlist") ? "wishlist" : "visited";

  const next = { ...travel, [key]: { ...travel[key], [id]: { note, at: new Date().toISOString() } } };
  writeLocal(next);
  if (hasBackend) {
    await trySupabase((sb) =>
      sb
        .from(table)
        .upsert({ [idCol]: id, status, note }, { onConflict: `${idCol},status` }),
    );
  }
  return next;
}

/** পুরো তালিকা মুছে ফেলা */
export async function resetTravel() {
  clearLocal();
  if (hasBackend) {
    await trySupabase((sb) => sb.from("pc_visited").delete().neq("district_id", ""));
    await trySupabase((sb) => sb.from("pc_place_marks").delete().neq("place_id", ""));
  }
  return { ...emptyTravel };
}

/** ব্যাকআপ ফাইল */
export function downloadBackup(travel) {
  const blob = new Blob([JSON.stringify(travel, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pothochittro-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function countTravel(travel) {
  return {
    visited: Object.keys(travel?.visitedDistricts || {}).length,
    wishlist: Object.keys(travel?.wishlistDistricts || {}).length,
    placesVisited: Object.keys(travel?.visitedPlaces || {}).length,
    placesWishlist: Object.keys(travel?.wishlistPlaces || {}).length,
  };
}
