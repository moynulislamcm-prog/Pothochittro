import { supabase, hasBackend, trySupabase } from "./supabase";

/** অ্যাকাউন্ট ও ভূমিকা (এডমিন প্যানেলের জন্য role = 'admin' দরকার) */

export async function getSession() {
  if (!hasBackend) return { user: null, profile: null };
  const res = await trySupabase((sb) => sb.auth.getSession());
  return { user: res.ok ? res.data?.session?.user || null : null };
}

export async function getProfile(userId) {
  if (!userId) return null;
  const res = await trySupabase((sb) =>
    sb.from("pc_profiles").select("id,display_name,role,created_at").eq("id", userId).maybeSingle(),
  );
  return res.ok ? res.data : null;
}

export async function signUp({ email, password, displayName }) {
  if (!hasBackend) throw new Error("ব্যাকএন্ড সংযুক্ত নেই");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName || "" } },
  });
  if (error) throw error;
  return data;
}

export async function signIn({ email, password }) {
  if (!hasBackend) throw new Error("ব্যাকএন্ড সংযুক্ত নেই");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  if (!hasBackend) return;
  await supabase.auth.signOut();
}

export async function updateDisplayName(userId, name) {
  if (!userId) return { ok: false, error: "no-user" };
  return trySupabase((sb) =>
    sb.from("pc_profiles").update({ display_name: name }).eq("id", userId),
  );
}

/** নিজের অ্যাকাউন্ট এডমিন করা যায় কি না যাচাই (শুধু তথ্যের জন্য) */
export async function refreshProfile(userId) {
  return getProfile(userId);
}

export function onAuthChange(cb) {
  if (!hasBackend) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user || null);
  });
  return () => data?.subscription?.unsubscribe?.();
}

/** এডমিন কিনা */
export function isAdmin(profile) {
  return profile?.role === "admin";
}
