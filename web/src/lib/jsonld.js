/**
 * JSON-LD ও মেটা তৈরির বিশুদ্ধ (pure) নিয়ম।
 *
 * এখানে React নেই, তাই দুই জায়গা থেকেই ব্যবহার হয়:
 *  - ব্রাউজারে src/lib/seo.js (useDocumentMeta)
 *  - বিল্ডের সময় scripts/prerender.mjs (স্থির HTML তৈরি)
 * একই নিয়ম দুই জায়গায় চলার ফলে ক্রলার ও ব্রাউজার একই তথ্য পায়।
 */
import { SITE_URL } from "../config.js";

export const SITE_NAME = "পথচিত্র";

/** পরম URL — SITE_URL-এর সাথে পাথ যোগ */
export function absoluteUrl(path) {
  const base = String(SITE_URL || "").replace(/\/+$/, "");
  const p = String(path || "/").replace(/^\/+/, "/");
  return `${base}${p}`;
}

/**
 * meta description-এর জন্য উপযুক্ত দৈর্ঘ্যে ছাঁটা।
 * Google সাধারণত ১৫০-১৬০ অক্ষর দেখায়; শব্দের মাঝখানে কাটা হয় না।
 * Array.from ব্যবহার করা হয়েছে যাতে বাংলা যুক্তাক্ষর ভেঙে না যায়।
 */
export function metaDescription(text, max = 158) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;
  let cut = chars.slice(0, max).join("");
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) cut = cut.slice(0, lastSpace);
  return `${cut.replace(/[।,;:!?\-]+$/, "")}…`;
}

/** ব্রেডক্রাম্ব */
export function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: absoluteUrl(it.path),
    })),
  };
}

/** একটি গন্তব্য — TouristAttraction হিসেবে */
export function placeLd(place, district) {
  const node = {
    "@context": "https://schema.org",
    "@type": "TouristAttraction",
    name: place.name,
    description: place.summary || place.description || place.history || undefined,
    url: absoluteUrl(`/places/${place.slug || place.id}`),
    address: {
      "@type": "PostalAddress",
      addressLocality: place.upazila_bn || place.locality || undefined,
      addressRegion: district?.bn_name || place.district_bn || undefined,
      addressCountry: "BD",
    },
  };
  if (place.name_en) node.alternateName = place.name_en;
  if (place.lat != null && place.lon != null) {
    node.geo = { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lon };
  }
  if (place.image) node.image = absoluteUrl(place.image);
  return node;
}

/** একটি জেলা — AdministrativeArea, ভেতরের গন্তব্যসহ */
export function districtLd(district, places) {
  return {
    "@context": "https://schema.org",
    "@type": "AdministrativeArea",
    name: district.bn_name,
    alternateName: district.name || undefined,
    description: district.summary || district.famous || undefined,
    url: absoluteUrl(`/districts/${district.slug || district.id}`),
    containedInPlace: { "@type": "Country", name: "বাংলাদেশ" },
    ...(district.lat != null
      ? { geo: { "@type": "GeoCoordinates", latitude: district.lat, longitude: district.lon } }
      : {}),
    ...(places?.length
      ? {
          containsPlace: places.slice(0, 100).map((p) => ({
            "@type": "TouristAttraction",
            name: p.name,
            url: absoluteUrl(`/places/${p.slug || p.id}`),
          })),
        }
      : {}),
  };
}

/** সাইটের মূল পরিচয় */
export function siteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: absoluteUrl("/"),
    inLanguage: "bn",
    description: "বাংলাদেশের ৬৪ জেলার দর্শনীয় স্থান, ইতিহাস, মানচিত্র ও ভ্রমণ নির্দেশিকা।",
    publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteUrl("/") },
  };
}

/** দুই বা তৈরি বেশি নোডকে একত্রে @graph হিসেছে মোড়ানো */
export function graphLd(nodes) {
  const clean = nodes.filter(Boolean).map((n) => {
    const { "@context": _ctx, ...rest } = n;
    return rest;
  });
  if (clean.length === 1) return { ...nodes.find(Boolean) };
  return { "@context": "https://schema.org", "@graph": clean };
}
