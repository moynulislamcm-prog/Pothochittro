import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadStaticContent, loadRemoteContent, mergeRemoteOverBase, loadSettings } from "./api.js";
import { getSession, getProfile, onAuthChange, signIn as doSignIn, signOut as doSignOut, signUp as doSignUp } from "./auth.js";
import {
  countTravel,
  emptyTravel,
  fetchRemote,
  mergeTravel,
  pushRemote,
  readLocal,
  resetTravel as resetTravelData,
  saveNote as saveNoteData,
  setDistrictStatus as setDistrictStatusData,
  setPlaceStatus as setPlaceStatusData,
  writeLocal,
} from "./travel.js";
import { hasBackend } from "./supabase.js";

const AppContext = createContext(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp অবশ্যই AppProvider এর ভেতরে ব্যবহার করতে হবে");
  return ctx;
}

export function AppProvider({ children }) {
  const [content, setContent] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [travel, setTravel] = useState(() => readLocal());
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const [live, setLive] = useState(null); // { lat, lng, accuracy, at }
  const [liveOn, setLiveOn] = useState(false);
  const [liveError, setLiveError] = useState("");
  const watchRef = useRef(null);

  /* ---------- কনটেন্ট ----------
     প্রথমে বান্ডিলের স্থির ডেটা দেখানো হয় (সাইট কখনো আটকে থাকে না),
     এরপর ব্যাকএন্ড থেকে হালনাগাদ কনটেন্ট এলে সেটি বসে যায়। */
  const baseRef = useRef(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const base = await loadStaticContent();
        if (!alive) return;
        baseRef.current = base;
        setContent(base);
      } catch (err) {
        if (alive) setLoadError(err?.message || "তথ্য লোড করা যায়নি। পৃষ্ঠাটি রিফ্রেশ করুন।");
      } finally {
        if (alive) setLoading(false);
      }

      const remote = await loadRemoteContent();
      if (!alive || !remote) return;
      setContent(mergeRemoteOverBase(baseRef.current, remote));
    })();
    loadSettings().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);

  /* ---------- নোটিশ ---------- */
  const notify = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(notify._t);
    notify._t = window.setTimeout(() => setNotice(""), 4200);
  }, []);

  /* ---------- অথ ---------- */
  useEffect(() => {
    if (!hasBackend) return;
    let alive = true;
    (async () => {
      const { user: u } = await getSession();
      if (!alive) return;
      setUser(u || null);
      if (u) setProfile(await getProfile(u.id));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hasBackend) return;
    const unsub = onAuthChange(async (u) => {
      setUser(u);
      setProfile(u ? await getProfile(u.id) : null);
    });
    return unsub;
  }, []);

  /* লগইন হলে ব্রাউজারের তালিকা অ্যাকাউন্টে মার্জ */
  const syncedFor = useRef(null);
  useEffect(() => {
    if (!user || syncedFor.current === user.id) return;
    let alive = true;
    (async () => {
      const remote = await fetchRemote();
      if (!alive) return;
      const local = readLocal();
      const merged = mergeTravel(local, remote || emptyTravel);
      setTravel(merged);
      writeLocal(merged);
      const pushed = await pushRemote(merged);
      if (!alive) return;
      syncedFor.current = user.id;
      notify(
        pushed.ok
          ? "অ্যাকাউন্টের সাথে ভ্রমণতালিকা মিলিয়ে নেওয়া হয়েছে।"
          : "ব্রাউজারের তালিকা দেখা যাচ্ছে; সার্ভারে সংরক্ষণ হয়নি।",
      );
    })();
    return () => {
      alive = false;
    };
  }, [user, notify]);

  const signIn = useCallback(
    async (creds) => {
      setAuthBusy(true);
      try {
        await doSignIn(creds);
        notify("লগইন হয়েছে।");
      } finally {
        setAuthBusy(false);
      }
    },
    [notify],
  );

  const signUp = useCallback(
    async (creds) => {
      setAuthBusy(true);
      try {
        const res = await doSignUp(creds);
        if (!res?.session) notify("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে পাঠানো লিংক থেকে নিশ্চিত করুন।");
        else notify("অ্যাকাউন্ট প্রস্তুত।");
      } finally {
        setAuthBusy(false);
      }
    },
    [notify],
  );

  const signOut = useCallback(async () => {
    await doSignOut();
    syncedFor.current = null;
    notify("লগআউট হয়েছে। ব্রাউজারের তালিকা মুছে যায়নি।");
  }, [notify]);

  /* ---------- ভ্রমণতালিকা ---------- */
  /* স্টেট আপডেটের ভেতরে সাইড-ইফেক্ট চালানো হয় না —
     না হলে StrictMode-এ একই কল দুইবার যেত */
  const setDistrictStatus = useCallback(
    async (districtId, status) => {
      const current = readLocal();
      const next = setLocal(current, "district", districtId, status);
      setTravel(next);
      await setDistrictStatusData(next, districtId, status);
    },
    [],
  );

  const setPlaceStatus = useCallback(async (placeId, status) => {
    const current = readLocal();
    const next = setLocal(current, "place", placeId, status);
    setTravel(next);
    await setPlaceStatusData(next, placeId, status);
  }, []);

  const saveNote = useCallback(async (kind, id, note) => {
    const current = readLocal();
    const next = saveNoteLocal(current, kind, id, note);
    setTravel(next);
    await saveNoteData(next, kind, id, note);
  }, []);

  const resetTravel = useCallback(async () => {
    await resetTravelData();
    setTravel({ ...emptyTravel });
    notify("ভ্রমণের তালিকা মুছে ফেলা হয়েছে।");
  }, [notify]);

  const syncNow = useCallback(async () => {
    if (!user) {
      notify("আগে লগইন করুন, তারপর সার্ভারে সংরক্ষণ হবে।");
      return;
    }
    const res = await pushRemote(readLocal());
    notify(res.ok ? "সার্ভারে সংরক্ষণ হয়েছে।" : "সার্ভারে সংরক্ষণ করা যায়নি।");
  }, [user, notify]);

  /* ---------- লাইভ লোকেশন ---------- */
  const startLive = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLiveError("এই ব্রাউজারে লোকেশন সুবিধা নেই।");
      return;
    }
    setLiveError("");
    setLiveOn(true);
    if (watchRef.current != null) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setLive({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        });
      },
      (err) => {
        setLiveOn(false);
        if (err.code === err.PERMISSION_DENIED)
          setLiveError("লোকেশনের অনুমতি দেওয়া হয়নি। ব্রাউজার সেটিংস থেকে অনুমতি দিন।");
        else if (err.code === err.POSITION_UNAVAILABLE)
          setLiveError("লোকেশন পাওয়া যায়নি। GPS চালু করে আবার চেষ্টা করুন।");
        else setLiveError("লোকেশন আনতে দেরি হচ্ছে। আবার চেষ্টা করুন।");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
  }, []);

  const stopLive = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    setLiveOn(false);
    setLive(null);
    setLiveError("লাইভ লোকেশন বন্ধ করা হয়েছে।");
  }, []);

  /** একবারের জন্য অবস্থান (লাইভ চালু না করে) */
  const locateOnce = useCallback(
    () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("এই ব্রাউজারে লোকেশন সুবিধা নেই।"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const point = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              at: pos.timestamp,
            };
            setLive(point);
            resolve(point);
          },
          (err) => {
            const msg =
              err.code === err.PERMISSION_DENIED
                ? "লোকেশনের অনুমতি দেওয়া হয়নি। ব্রাউজার সেটিংস থেকে অনুমতি দিন।"
                : "লোকেশন পাওয়া যায়নি। GPS চালু করে আবার চেষ্টা করুন।";
            setLiveError(msg);
            reject(new Error(msg));
          },
          { enableHighAccuracy: true, timeout: 20000 },
        );
      }),
    [],
  );

  useEffect(() => {
    return () => {
      if (watchRef.current != null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchRef.current);
      }
    };
  }, []);

  const counts = useMemo(() => countTravel(travel), [travel]);

  const value = useMemo(
    () => ({
      content,
      settings,
      loading,
      loadError,
      hasBackend,
      travel,
      counts,
      user,
      profile,
      authBusy,
      notice,
      notify,
      signIn,
      signUp,
      signOut,
      setDistrictStatus,
      setPlaceStatus,
      saveNote,
      resetTravel,
      syncNow,
      live,
      liveOn,
      liveError,
      startLive,
      stopLive,
      locateOnce,
    }),
    [
      content, settings, loading, loadError, travel, counts, user, profile, authBusy, notice,
      notify, signIn, signUp, signOut, setDistrictStatus, setPlaceStatus, saveNote, resetTravel,
      syncNow, live, liveOn, liveError, startLive, stopLive, locateOnce,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/* ---------- লোকাল আপডেট হেল্পার (সাথে সাথে UI হালনাগাদ) ---------- */

function setLocal(travel, kind, id, status) {
  const keyVisited = kind === "district" ? "visitedDistricts" : "visitedPlaces";
  const keyWish = kind === "district" ? "wishlistDistricts" : "wishlistPlaces";
  const next = {
    ...travel,
    [keyVisited]: { ...travel[keyVisited] },
    [keyWish]: { ...travel[keyWish] },
  };
  delete next[keyVisited][id];
  delete next[keyWish][id];
  if (status) next[status === "wishlist" ? keyWish : keyVisited][id] = { note: "", at: new Date().toISOString() };
  next.updatedAt = new Date().toISOString();
  writeLocal(next);
  return next;
}

function saveNoteLocal(travel, kind, id, note) {
  const key =
    kind === "visited-district" ? "visitedDistricts"
    : kind === "wishlist-district" ? "wishlistDistricts"
    : kind === "visited-place" ? "visitedPlaces"
    : "wishlistPlaces";
  const next = {
    ...travel,
    [key]: { ...travel[key], [id]: { note, at: new Date().toISOString() } },
  };
  next.updatedAt = new Date().toISOString();
  writeLocal(next);
  return next;
}
