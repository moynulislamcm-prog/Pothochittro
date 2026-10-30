import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, STANDALONE } from "../config.js";

export const hasBackend = !STANDALONE && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = hasBackend
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

/** ব্যাকএন্ড না থাকলে সব কল নিরাপদে খালি ফলাফল দেয় */
export async function trySupabase(fn) {
  if (!supabase) return { ok: false, data: null, error: "no-backend" };
  try {
    const { data, error } = await fn(supabase);
    if (error) return { ok: false, data: null, error };
    return { ok: true, data, error: null };
  } catch (err) {
    return { ok: false, data: null, error: err?.message || String(err) };
  }
}
