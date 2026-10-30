/**
 * পথচিত্র — রেন্ডার স্মোক টেস্ট
 *
 * প্রতিটি পেজ jsdom-এ আসল React রেন্ডার থেকে চালানো হয়। উদ্দেশ্য:
 * বিল্ড পাস করলেও রানটাইমে ভাঙা প্রপ/ডি স্ট্রাকচারিং বা undefined অ্যাক্সেস
 * আছে কি না ধরা। চালানো: `npm run smoke`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

/* ---------- jsdom ও গ্লোবাল সেটআপ ---------- */
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const { window } = dom;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverStub;
window.URL.createObjectURL = () => "blob:stub";
window.URL.revokeObjectURL = () => {};
window.scrollTo = () => {};
window.confirm = () => false;

// Supabase ও OSRM এখানে পৌঁছাবে না — ইচ্ছাকৃতভাবে ব্যর্থ হতে দেওয়া,
// যাতে স্থির JSON ফলব্যাক পথটাও পরীক্ষা হয়।
const realFetch = window.fetch?.bind(window);
window.fetch = async (input) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("/data/")) {
    const file = path.join(publicDir, url.replace(/^\//, ""));
    if (fs.existsSync(file)) {
      const body = fs.readFileSync(file, "utf8");
      return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
    }
  }
  throw new Error("network disabled in smoke test: " + url);
};

for (const key of [
  "window", "document", "navigator", "location", "localStorage", "sessionStorage",
  "HTMLElement", "HTMLCanvasElement", "Element", "Node", "Event", "CustomEvent",
  "MouseEvent", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame",
  "ResizeObserver", "fetch", "URL", "Blob", "Image",
]) {
  if (window[key] === undefined) continue;
  // Node-এ navigator/location-এর মতো কিছু গ্লোবাল শুধু getter — সরাসরি
  // বসানো যায় না, তাই defineProperty দিয়ে লেখা যায় এমন করা হয়।
  try {
    globalThis[key] = window[key];
  } catch {
    Object.defineProperty(globalThis, key, {
      value: window[key],
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
}
try {
  globalThis.self = window;
} catch {
  Object.defineProperty(globalThis, "self", { value: window, writable: true, configurable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Leaflet-এর কিছু পরিমাপ jsdom-এ ০ আসে; ভুয়া মান দিয়ে দিই
/* jsdom-এ canvas 2D context নেই; MapView-তে preferCanvas চালু থাকায় Leaflet
   canvas রেন্ডারার নেয় এবং jsdom-এ ব্যর্থ হয় (আসল ব্রাউজারে এটি প্রয়োজন হয় না)।
   তাই একটি নিষ্ক্রিয় মক বসানো হয়, যাতে বাকি পেজ রেন্ডার পরীক্ষা করা যায়। */
function makeGradientStub() {
  return { addColorStop() {} };
}
function make2dContext(canvas) {
  const state = {};
  const noop = () => undefined;
  return new Proxy(state, {
    get(target, prop) {
      if (prop === "canvas") return canvas;
      if (prop in target) return target[prop];
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return makeGradientStub;
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (prop === "createPattern") return () => null;
      return noop;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
    has() {
      return true;
    },
  });
}
if (window.HTMLCanvasElement) {
  window.HTMLCanvasElement.prototype.getContext = function getContext(type) {
    return String(type).includes("2d") ? make2dContext(this) : null;
  };
}

window.HTMLElement.prototype.getBoundingClientRect = function () {
  return { width: 900, height: 500, top: 0, left: 0, right: 900, bottom: 500, x: 0, y: 0 };
};
window.HTMLElement.prototype.scrollIntoView = function () {};

/* ---------- কনসোল এরর ধরা ---------- */
const problems = [];
const origError = console.error;
const origWarn = console.warn;
console.error = (...args) => {
  const text = args.map(String).join(" ");
  // React-এর act ও jsdom-এর পরিচিত নয়েজ বাদে সব ধরা হয়
  if (!/not wrapped in act|Not implemented: HTMLCanvas|Could not parse CSS/i.test(text)) {
    problems.push("error: " + text.slice(0, 400));
  }
  origError(...args);
};
console.warn = (...args) => {
  const text = args.map(String).join(" ");
  if (!/useLayoutEffect does nothing on the server/i.test(text)) problems.push("warn: " + text.slice(0, 300));
  origWarn(...args);
};

process.on("unhandledRejection", (e) => problems.push("unhandled: " + String(e?.message || e).slice(0, 300)));

/* ---------- পেজ চালানো ---------- */
const { mount, unmount } = await import("../.smoke/entry.js");

const ROUTES = [
  { path: "/", expect: ["বাংলাদেশটা দেখুন", "মানচিত্রে অন্বেষণ", "আমি যে জেলাগুলো ঘুরেছি"] },
  { path: "/districts", expect: ["জেলায় জেলায় বাংলাদেশ"] },
  { path: "/districts/1", expect: ["ঢাকা"] },
  { path: "/places", expect: ["গন্তব্যের তালিকা"] },
  { path: "/distance", expect: ["দূরত্ব মাপুন", "সরলরেখার দূরত্ব"] },
  { path: "/my-travel", expect: ["আমার ভ্রমণ"] },
  { path: "/admin", expect: ["এডমিন প্যানেল"] },
];

let failed = 0;
for (const route of ROUTES) {
  problems.length = 0;
  let result;
  try {
    result = await mount(route.path);
  } catch (err) {
    console.log(`✗ ${route.path.padEnd(16)} mount ব্যর্থ: ${err?.message || err}`);
    // act() একাধিক এরর AggregateError-এ মোড়কে — ভেতরের আসল কারণ বের করা
    const causes = err?.errors?.length ? err.errors : [err];
    for (const c of causes) {
      console.log(`   ↳ ${c?.name || "Error"}: ${c?.message || c}`);
      console.log(String(c?.stack || "").split("\n").slice(1, 6).join("\n"));
    }
    failed++;
    continue;
  }
  const html = result.container.innerHTML;

  const missing = route.expect.filter((needle) => !html.includes(needle));
  if (missing.length) {
    console.log(`✗ ${route.path.padEnd(16)} পাওয়া যায়নি: ${missing.join(", ")}`);
    failed++;
  } else {
    console.log(`✓ ${route.path.padEnd(16)} রেন্ডার ঠিক (${(html.length / 1024).toFixed(0)} KB DOM)`);
  }

  if (problems.length) {
    console.log(`  ⚠ ${route.path} — কনসোল সমস্যা:`);
    for (const p of [...new Set(problems)].slice(0, 6)) console.log(`    ${p}`);
    failed++;
  }

  await unmount(result.root);
  result.container.remove();
}

/* ---------- ভ্রমণতালিকা লজিক ---------- */
problems.length = 0;
const travel = await import("../src/lib/travel.js");
const t0 = { ...travel.emptyTravel };
const t1 = await travel.setDistrictStatus(t0, "1", "wishlist");
const t2 = await travel.setDistrictStatus(t1, "1", "visited");
const t3 = await travel.setDistrictStatus(t2, "1", null);
const counts = [
  Object.keys(t1.wishlistDistricts).length,
  Object.keys(t2.visitedDistricts).length,
  Object.keys(t3.visitedDistricts).length + Object.keys(t3.wishlistDistricts).length,
];
if (counts[0] === 1 && counts[1] === 1 && counts[2] === 0) {
  console.log("✓ ভ্রমণতালিকা            মার্ক → পরিবর্তন → মুছে ফেলা ঠিক আছে");
} else {
  console.log(`✗ ভ্রমণতালিকা            প্রত্যাশা [1,1,0], পেলাম [${counts}]`);
  failed++;
}

const merged = travel.mergeTravel(
  { ...travel.emptyTravel, visitedDistricts: { "5": { note: "স্থানীয়", at: "2026-01-01" } } },
  { ...travel.emptyTravel, visitedDistricts: { "9": { note: "", at: "2026-02-01" } }, wishlistDistricts: { "3": { note: "", at: "" } } },
);
const okMerge =
  Object.keys(merged.visitedDistricts).length === 2 &&
  Object.keys(merged.wishlistDistricts).length === 1 &&
  merged.visitedDistricts["5"].note === "স্থানীয়";
console.log(okMerge ? "✓ মার্জ                   দুই পক্ষের তালিকা এক হয়েছে, নোট অক্ষত" : "✗ মার্জ ব্যর্থ");
if (!okMerge) failed++;

/* ---------- ভূগোল লজিক ---------- */
const geo = await import("../src/lib/geo.js");

const b = JSON.parse(fs.readFileSync(path.join(publicDir, "data", "boundaries.geojson"), "utf8"));
const districts = JSON.parse(fs.readFileSync(path.join(publicDir, "data", "districts.json"), "utf8"));

let inside = 0;
for (const d of districts) {
  const f = b.features.find((x) => x.properties.id === d.id);
  if (f && geo.pointInGeometry([d.lon, d.lat], f.geometry)) inside++;
}
console.log(inside === 64 ? `✓ ভূগোল                 ৬৪টি জেলা-সদরই নিজের সীমানার ভেতরে` : `✗ ভূগোল: ${inside}/64`);
if (inside !== 64) failed++;

const km = geo.haversineKm([23.7115, 90.4111], [21.4431, 91.9734]);
const kmOk = km > 290 && km < 320;
console.log(kmOk ? `✓ দূরত্ব                 ঢাকা→কক্সবাজার ${geo.formatKm(km)} (প্রত্যাশিত ~৩০০ কিমি)` : `✗ দূরত্ব: ${km}`);
if (!kmOk) failed++;

const det = geo.findDistrictAt({ lat: 23.7115, lng: 90.4111 }, b);
console.log(det?.name === "ঢাকা" ? `✓ লাইভ শনাক্তকরণ       ঢাকার স্থানাঙ্ক → ${det.name}` : `✗ শনাক্তকরণ: ${det?.name}`);
if (det?.name !== "ঢাকা") failed++;

console.log("");
console.log(failed === 0 ? "সব যাচাই পাস করেছে।" : `${failed}টি সমস্যা পাওয়া গেছে।`);
process.exit(failed === 0 ? 0 : 1);
