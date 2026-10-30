/**
 * SEO সহায়ক — প্রতি পৃষ্ঠায় আলাদা title, description, canonical,
 * Open Graph আর JSON-LD structured data।
 *
 * প্রি-রেন্ডার (scripts/prerender.mjs) একই ফাংশন ব্যবহার করে স্থির HTML-এ
 * ট্যাগ বসায়, তাই ক্রলার ও ব্রাউজার — দুই জায়গাতেই একই তথ্য থাকে।
 */
import { useEffect } from "react";
import {
  SITE_NAME,
  absoluteUrl,
  metaDescription,
  breadcrumbLd,
  placeLd,
  districtLd,
  siteLd,
} from "./jsonld.js";

/* বিশুদ্ধ নিয়মগুলো jsonld.js-এ — prerender স্ক্রিপ্টও সেগুলোই ব্যবহার করে */
export { SITE_NAME, absoluteUrl, metaDescription, breadcrumbLd, placeLd, districtLd, siteLd };




/** <head>-এ একটি ট্যাগ নিশ্চিত করা (না থাকলে তৈরি, থাকলে হালনাগাদ) */
function setMeta(selector, attr, key, content) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content || "");
}

function setLink(rel, href) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * পৃষ্ঠার মেটা তথ্য বসায়। prerender স্ক্রিপ্টও একই ডেটা ব্যবহার করে,
 * তাই এখানে শুধু মান তৈরির নিয়ম রাখা হয়েছে (নিচে buildMeta)।
 */
export function useDocumentMeta({ title, description, path, image, jsonLd, noindex }) {
  useEffect(() => {
    const full = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — বাংলাদেশের দর্শনীয় স্থান ও ভ্রমণ নির্দেশিকা`;
    document.title = full;

    setMeta('meta[name="description"]', "name", "description", description || "");
    setMeta('meta[property="og:title"]', "property", "og:title", full);
    setMeta('meta[property="og:description"]', "property", "og:description", description || "");
    setMeta('meta[property="og:type"]', "property", "og:type", "website");
    setMeta('meta[property="og:site_name"]', "property", "og:site_name", SITE_NAME);
    setMeta('meta[property="og:locale"]', "property", "og:locale", "bn_BD");
    if (path) {
      setMeta('meta[property="og:url"]', "property", "og:url", absoluteUrl(path));
      setLink("canonical", absoluteUrl(path));
    }
    if (image) {
      setMeta('meta[property="og:image"]', "property", "og:image", absoluteUrl(image));
      setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
    } else {
      setMeta('meta[name="twitter:card"]', "name", "twitter:card", "summary");
    }
    setMeta('meta[name="robots"]', "name", "robots", noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large");

    /* JSON-LD — একটিমাত্র স্ক্রিপ্ট ট্যাগ রাখা হয়, বারবার যেন না জমে */
    if (typeof document !== "undefined") {
      document.querySelectorAll('script[data-seo="jsonld"]').forEach((n) => n.remove());
      if (jsonLd) {
        const el = document.createElement("script");
        el.type = "application/ld+json";
        el.setAttribute("data-seo", "jsonld");
        el.textContent = JSON.stringify(jsonLd);
        document.head.appendChild(el);
      }
    }
  }, [title, description, path, image, noindex, JSON.stringify(jsonLd || null)]);
}

/* ------------------------------------------------------------------ */
/* JSON-LD তৈরির নিয়ম (prerender স্ক্রিপ্টও এগুলো ব্যবহার করে)          */
/* ------------------------------------------------------------------ */





