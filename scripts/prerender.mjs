/**
 * প্রি-রেন্ডার — প্রতিটি রাউটের জন্য স্থির HTML তৈরি
 * ---------------------------------------------------------------
 * কেন দরকার: সাইটটি একক-পেজ অ্যাপ, তাই JavaScript না চললে `<div id="root">`
 * ফাঁকা থাকে। Google জাভাস্ক্রিপ্ট চালাতে পারে, কিন্তু ধীর ও কম নির্ভরযোগ্য —
 * প্রতিটি গন্তব্যের আলাদা পৃষ্ঠা সূচিভুক্ত হওয়ার সবচেয়ে ভরসাযোগ্য উপায় হলো
 * বিল্ডের সময়েই আসল কনটেন্ট HTML-এ বসিয়ে দেওয়া।
 *
 * পদ্ধতি: dist/index.html কে টেমপ্লেট ধরে (এতে হ্যাশসহ asset লিংক ঠিক থাকে),
 * প্রতি রাউটের জন্য title/meta/canonical/Open Graph/JSON-LD ও স্থির বডি বসিয়ে
 * dist/<path>/index.html লেখা হয়। Netlify আসল ফাইল আগে দেখে, তাই
 * _redirects এর `/* → /index.html` নিয়মের চেয়ে এগুলোই পরিবেশিত হয়।
 *
 * ব্রাউজারে JS চললে React সেই কনটেন্ট প্রতিস্থাপন করে — ব্যবহারকারী একই
 * পৃষ্ঠা দেখেন, আর ক্রলার JS ছাড়াই পুরো তথ্য পান।
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bn, categoryLabel } from "../web/src/lib/format.js";
import { formatKm } from "../web/src/lib/geo.js";
import {
  SITE_NAME,
  absoluteUrl,
  metaDescription,
  breadcrumbLd,
  placeLd,
  districtLd,
  siteLd,
  graphLd,
} from "../web/src/lib/jsonld.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(root, "web", "dist");
const DATA = path.join(root, "web", "public", "data");

const TEMPLATE_PATH = path.join(DIST, "index.html");
if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error("✗ dist/index.html পাওয়া যায়নি — আগে `vite build` চালাতে হবে।");
  process.exit(1);
}

const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));
const districts = read("districts.json");
const places = read("places.json");
const upazilas = fs.existsSync(path.join(DATA, "upazilas.json")) ? read("upazilas.json") : [];

const districtById = new Map(districts.map((d) => [String(d.id), d]));
const districtPath = (d) => `/districts/${d?.slug || d?.id}`;
const placePath = (p) => `/places/${p?.slug || p?.id}`;

/* প্রতি জেলার গন্তব্য — ভেতরের লিংক তৈরিতে লাগে */
const placesByDistrict = new Map();
for (const p of places) {
  const k = String(p.district_id);
  if (!placesByDistrict.has(k)) placesByDistrict.set(k, []);
  placesByDistrict.get(k).push(p);
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** একাধিক অনুচ্ছেদে ভেঙে <p> তৈরি */
function paras(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${esc(s)}</p>`)
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* বডি তৈরি                                                           */
/* ------------------------------------------------------------------ */
function homeBody() {
  const total = places.length;
  const top = districts
    .slice()
    .sort((a, b) => (b.place_count || 0) - (a.place_count || 0))
    .slice(0, 16);
  return `
<main class="page">
  <section class="hero">
    <span class="kicker">বাংলাদেশের ${bn(64)} জেলা · ${bn(total)} গন্তব্য</span>
    <h1>${esc(SITE_NAME)} — বাংলাদেশের দর্শনীয় স্থান ও ভ্রমণ নির্দেশিকা</h1>
    <p>৬৪টি জেলার প্রত্নস্থল, মসজিদ, মন্দির, জাদুঘর, প্রকৃতি ও সমুদ্র সৈকত — প্রতিটির ইতিহাস,
    অবস্থান আর জেলা শহর থেকে দূরত্বসহ। মানচিত্রে ঘোরা জেলা মার্ক করুন, লাইভ লোকেশন দেখুন।</p>
    <p><a class="btn primary" href="/districts">৬৪ জেলা দেখুন</a>
    <a class="btn ghost" href="/places">গন্তব্যের তালিকা</a></p>
  </section>
  <section class="block">
    <h2>জেলা নির্বাচন করুন</h2>
    <div class="dgrid">${top
      .map(
        (d) => `<a class="dcard" href="${districtPath(d)}">
          <div class="dcard-main"><header><h4>${esc(d.bn_name)}</h4>
          <span class="muted">${esc(d.division || d.division_en || "")}</span></header>
          <footer><span class="chip">${bn(d.place_count || 0)} গন্তব্য</span></footer></div></a>`,
      )
      .join("")}</div>
    <p><a href="/districts">সব ${bn(64)} জেলা দেখুন</a></p>
  </section>
</main>`;
}

function districtsBody() {
  const byDiv = new Map();
  for (const d of districts) {
    const k = d.division || d.division_en || "অন্যান্য";
    if (!byDiv.has(k)) byDiv.set(k, []);
    byDiv.get(k).push(d);
  }
  let out = `<main class="page"><header class="page-head"><div>
    <span class="kicker">বাংলাদেশের ${bn(64)} জেলা</span>
    <h1>জেলায় জেলায় বাংলাদেশ</h1>
    <p>প্রতিটি জেলার দর্শনীয় স্থান, ইতিহাস, উপজেলা ও মানচিত্র।</p></div></header>`;
  for (const [div, list] of byDiv) {
    out += `<section class="block"><h2>${esc(div)} বিভাগ</h2><div class="dgrid">`;
    for (const d of list) {
      out += `<a class="dcard" href="${districtPath(d)}"><div class="dcard-main">
        <header><h4>${esc(d.bn_name)}</h4><span class="muted">${bn(d.place_count || 0)} গন্তব্য</span></header>
        ${d.famous ? `<p class="famous">${esc(d.famous)}</p>` : ""}</div></a>`;
    }
    out += `</div></section>`;
  }
  return out + `</main>`;
}

function placesBody() {
  // পৃষ্ঠা আকার নিয়ন্ত্রণে সীমা; বাকি গন্তব্যগুলো জেলা পৃষ্ঠা থেকে পৌঁছানো যায়।
  // গুরুত্বপূর্ণ: districtBody প্রতিটি জেলার সব গন্তব্য কাটা ছাড়াই লিংক করে,
  // তাই এখানে সীমা ছাড়ালেও পুরো তালিকা ক্রলযোগ্যই থাকে (SEO-র জন্য জরুরি)।
  const CAP = 400;
  if (places.length > CAP) {
    console.warn(
      `⚠ /places পৃষ্ঠায় ${places.length}টি গন্তব্যের মধ্যে প্রথম ${CAP}টি দেখানো হচ্ছে। ` +
        `বাকি ${places.length - CAP}টি শুধু জেলা পৃষ্ঠা থেকে পৌঁছানো যাবে।`,
    );
  }
  let out = `<main class="page"><header class="page-head"><div>
    <span class="kicker">${bn(places.length)}টি দর্শনীয় স্থান</span>
    <h1>গন্তব্যের তালিকা</h1>
    <p>বাংলাদেশের দর্শনীয় স্থান — ইতিহাস, অবস্থান ও জেলা শহর থেকে দূরত্বসহ।</p></div></header>
    <section class="block"><div class="pgrid">`;
  for (const p of places.slice(0, CAP)) {
    const d = districtById.get(String(p.district_id));
    out += `<a class="pcard link-card" href="${placePath(p)}"><div class="pcard-body">
      <header><h4>${esc(p.name)}</h4>
      <span class="muted">${esc(d?.bn_name || p.district_bn || "")}${p.upazila_bn ? " · " + esc(p.upazila_bn) : ""}</span></header>
      ${p.summary ? `<p class="clamp2">${esc(p.summary)}</p>` : ""}
      <div class="pcard-tags"><span class="chip">${esc(categoryLabel(p.category))}</span>
      ${p.dist_from_hq_km != null ? `<span class="chip dist">জেলা শহর থেকে ${esc(formatKm(p.dist_from_hq_km))}</span>` : ""}</div>
      </div></a>`;
  }
  out += `</div></section><section class="block"><h2>জেলা অনুযায়ী সব গন্তব্য</h2><ul>`;
  for (const d of districts) {
    out += `<li><a href="${districtPath(d)}">${esc(d.bn_name)}</a> — ${bn(d.place_count || 0)}টি</li>`;
  }
  return out + `</ul></section></main>`;
}

function distanceBody() {
  return `<main class="page"><header class="page-head"><div>
    <h1>দূরত্ব মাপুন</h1>
    <p>যেকোনো দুই জেলা বা গন্তব্যের মধ্যবর্তী সরলরেখার দূরত্ব ও দিক জেনে নিন।
    লাইভ লোকেশন চালু করলে আপনার বর্তমান অবস্থান থেকে দূরত্বও দেখা যাবে।</p></div></header>
    <section class="block"><h2>জনপ্রিয় জেলা</h2><ul>${districts
      .slice(0, 20)
      .map((d) => `<li><a href="${districtPath(d)}">${esc(d.bn_name)}</a></li>`)
      .join("")}</ul></section></main>`;
}

function districtBody(d) {
  const list = placesByDistrict.get(String(d.id)) || [];
  const ups = upazilas.filter((u) => String(u.district_id) === String(d.id));
  return `<main class="page">
  <nav class="crumbs" aria-label="breadcrumb"><a href="/">হোম</a> ›
    <a href="/districts">৬৪ জেলা</a> › <span>${esc(d.bn_name)}</span></nav>
  <article>
    <header class="page-head district-head"><div>
      <span class="kicker">${esc(d.division || d.division_en || "")} বিভাগ · ${bn(ups.length)}টি উপজেলা</span>
      <h1>${esc(d.bn_name)} জেলার দর্শনীয় স্থান</h1>
      ${d.famous ? `<p class="famous">${esc(d.famous)}</p>` : ""}
    </div>
    <dl class="fact-grid">
      <div><dt>গন্তব্য</dt><dd>${bn(list.length)}</dd></div>
      <div><dt>উপজেলা</dt><dd>${bn(ups.length)}</dd></div>
      <div><dt>বিভাগ</dt><dd>${esc(d.division || d.division_en || "—")}</dd></div>
    </dl></header>
    ${d.summary ? `<section class="block"><p class="summary-text">${esc(d.summary)}</p></section>` : ""}
    <section class="block"><h2>${esc(d.bn_name)} জেলার দর্শনীয় স্থান (${bn(list.length)}টি)</h2>
      <div class="pgrid">${list
        .map(
          (p) => `<a class="pcard link-card" href="${placePath(p)}"><div class="pcard-body">
            <header><h4>${esc(p.name)}</h4><span class="muted">${esc(p.upazila_bn || p.locality || "")}</span></header>
            ${p.summary ? `<p class="clamp2">${esc(p.summary)}</p>` : ""}
            <div class="pcard-tags"><span class="chip">${esc(categoryLabel(p.category))}</span>
            ${p.dist_from_hq_km != null ? `<span class="chip dist">জেলা শহর থেকে ${esc(formatKm(p.dist_from_hq_km))}</span>` : ""}</div>
            </div></a>`,
        )
        .join("")}</div>
    </section>
    ${
      ups.length
        ? `<section class="block"><h2>${esc(d.bn_name)} জেলার উপজেলাসমূহ</h2>
      <ul class="upazila-list">${ups.map((u) => `<li><strong>${esc(u.bn_name)}</strong></li>`).join("")}</ul></section>`
        : ""
    }
  </article></main>`;
}

function placeBody(p) {
  const d = districtById.get(String(p.district_id));
  const siblings = (placesByDistrict.get(String(p.district_id)) || []).filter((x) => x.id !== p.id).slice(0, 10);
  const chips = [
    `<span class="chip">${esc(categoryLabel(p.category))}</span>`,
    d ? `<a class="chip" href="${districtPath(d)}">${esc(d.bn_name)}</a>` : "",
    p.upazila_bn ? `<span class="chip">${esc(p.upazila_bn)}</span>` : "",
    p.locality ? `<span class="chip">${esc(p.locality)}</span>` : "",
  ].filter(Boolean);

  return `<main class="page">
  <nav class="crumbs" aria-label="breadcrumb"><a href="/">হোম</a> ›
    <a href="/places">গন্তব্য</a> ›
    ${d ? `<a href="${districtPath(d)}">${esc(d.bn_name)}</a> ›` : ""}
    <span>${esc(p.name)}</span></nav>
  <article>
    <header class="page-head"><div>
      <span class="kicker">${esc([p.division_bn && `${p.division_bn} বিভাগ`, d?.bn_name, p.upazila_bn].filter(Boolean).join(" · "))}</span>
      <h1>${esc(p.name)}</h1>
      <div class="pd-meta">${chips.join("")}</div>
      <div class="pd-verify">
        <span class="verify-flag ${p.verified === false ? "" : "ok"}">${p.verified === false ? "তথ্য যাচাই বাকি" : "তথ্য যাচাইকৃত"}</span>
        ${p.dist_from_hq_km != null && d ? `<span class="muted small">${esc(d.bn_name)} শহর থেকে ${esc(formatKm(p.dist_from_hq_km))}</span>` : ""}
      </div>
    </div></header>
    ${p.image ? `<div class="pd-hero"><img src="${esc(p.image)}" alt="${esc(p.name)}, ${esc(d?.bn_name || "")}" loading="lazy" /></div>` : ""}
    ${p.summary ? `<section class="block"><p class="summary-text">${esc(p.summary)}</p></section>` : ""}
    ${p.history ? `<section class="block"><h2>ইতিহাস</h2>${paras(p.history)}</section>` : ""}
    ${p.description ? `<section class="block"><h2>বিস্তারিত</h2>${paras(p.description)}</section>` : ""}
    ${p.how_to_go ? `<section class="block"><div class="pd-block"><h2>কীভাবে যাবেন</h2>${paras(p.how_to_go)}</div></section>` : ""}
    ${p.best_time ? `<section class="block"><div class="pd-block"><h2>কখন গেলে ভালো</h2>${paras(p.best_time)}</div></section>` : ""}
    <section class="block"><h2>দূরত্ব ও অবস্থান</h2>
      <dl class="dist-list">
        <div><dt>জেলা শহর থেকে</dt><dd>${p.dist_from_hq_km != null ? esc(formatKm(p.dist_from_hq_km)) : "—"}</dd></div>
        <div><dt>এলাকা</dt><dd>${esc([p.upazila_bn, d?.bn_name, p.division_bn].filter(Boolean).join(", ") || "—")}</dd></div>
        <div><dt>স্থানাঙ্ক</dt><dd class="mono">${p.lat?.toFixed?.(4)}, ${p.lon?.toFixed?.(4)}</dd></div>
      </dl>
      <p class="hint">জেলা শহর থেকে দূরত্ব সরলরেখায় মাপা। অবস্থানের উৎস: ${esc(p.coord_source || "—")}</p>
    </section>
    ${
      siblings.length
        ? `<aside class="block"><h2>${esc(d?.bn_name || "")} জেলার আরও দর্শনীয় স্থান</h2>
      <div class="pgrid">${siblings
        .map(
          (s) => `<a class="card link-card" href="${placePath(s)}"><strong>${esc(s.name)}</strong>
            <span class="muted small">${esc(categoryLabel(s.category))}${s.dist_from_hq_km != null ? ` · জেলা শহর থেকে ${esc(formatKm(s.dist_from_hq_km))}` : ""}</span></a>`,
        )
        .join("")}</div></aside>`
        : ""
    }
  </article></main>`;
}

/* ------------------------------------------------------------------ */
/* HTML সাজানো                                                        */
/* ------------------------------------------------------------------ */
const TEMPLATE = fs.readFileSync(TEMPLATE_PATH, "utf8");

/** টেমপ্লেটে head ও body বসিয়ে সম্পূর্ণ HTML তৈরি */
function buildPage({ title, description, routePath, image, jsonLd, body, noindex }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — বাংলাদেশের দর্শনীয় স্থান ও ভ্রমণ নির্দেশিকা`;
  const desc = description || "";
  const canonical = absoluteUrl(routePath);

  const head = [
    `<title>${esc(fullTitle)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    `<meta property="og:locale" content="bn_BD" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    image ? `<meta property="og:image" content="${esc(absoluteUrl(image))}" />` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    jsonLd ? `<script type="application/ld+json" data-seo="jsonld">${JSON.stringify(jsonLd)}</script>` : "",
  ]
    .filter(Boolean)
    .join("\n    ");

  // টেমপ্লেটের নিজস্ব title/description সরিয়ে ফেলা হয়, যাতে একটাই থাকে।
  // (বদলে দিলে head ব্লকের সাথে মিলে দুটি ট্যাগ হয়ে যেত — Google তখন
  // কোনটা নেবে তা অনিশ্চিত, তাই মুছে একটিই বসানো হচ্ছে।)
  let html = TEMPLATE.replace(/<title>[\s\S]*?<\/title>\s*/, "").replace(
    /<meta\s+name="description"[\s\S]*?\/?>\s*/,
    "",
  );

  // head ট্যাগগুলো </head> এর আগে বসানো
  html = html.replace("</head>", `    ${head}\n  </head>`);
  // ফাঁকা root-এ স্থির কনটেন্ট
  html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  return html;
}

function writeRoute(routePath, html) {
  const rel = routePath === "/" ? "index.html" : path.join(routePath.replace(/^\/+/, ""), "index.html");
  const target = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
}

/* ------------------------------------------------------------------ */
/* রাউট তালিকা                                                        */
/* ------------------------------------------------------------------ */
let count = 0;
const emit = (routePath, opts) => {
  writeRoute(routePath, buildPage({ ...opts, routePath }));
  count++;
};

/* স্থির পৃষ্ঠা */
emit("/", {
  description: metaDescription(
    "বাংলাদেশের ৬৪ জেলার দর্শনীয় স্থান, ইতিহাস, মানচিত্র ও ভ্রমণ নির্দেশিকা। কোন জেলায় কী আছে, জেলা শহর থেকে কত দূর — সব এক জায়গায়।",
  ),
  jsonLd: siteLd(),
  body: homeBody(),
});

emit("/districts", {
  title: "৬৪ জেলার তালিকা — দর্শনীয় স্থান ও মানচিত্র",
  description: metaDescription(
    "বাংলাদেশের ৬৪ জেলার সম্পূর্ণ তালিকা। প্রতিটি জেলার দর্শনীয় স্থান, উপজেলা, মানচিত্র ও জেলা শহর থেকে দূরত্ব। বিভাগ অনুযায়ী খুঁজুন।",
  ),
  jsonLd: graphLd([
    breadcrumbLd([
      { name: "হোম", path: "/" },
      { name: "৬৪ জেলা", path: "/districts" },
    ]),
  ]),
  body: districtsBody(),
});

emit("/places", {
  title: "দর্শনীয় স্থানের তালিকা — ইতিহাস ও দূরত্বসহ",
  description: metaDescription(
    "বাংলাদেশের দর্শনীয় স্থানের সম্পূর্ণ তালিকা — প্রত্নস্থল, মসজিদ, মন্দির, জাদুঘর, প্রকৃতি ও সমুদ্র সৈকত। প্রতিটির ইতিহাস, অবস্থান ও জেলা শহর থেকে দূরত্ব।",
  ),
  jsonLd: graphLd([
    breadcrumbLd([
      { name: "হোম", path: "/" },
      { name: "গন্তব্যের তালিকা", path: "/places" },
    ]),
  ]),
  body: placesBody(),
});

emit("/distance", {
  title: "দূরত্ব মাপুন — জেলা ও গন্তব্যের মধ্যে কিলোমিটার",
  description: metaDescription(
    "বাংলাদেশের যেকোনো দুই জেলা বা দর্শনীয় স্থানের মধ্যবর্তী দূরত্ব ও দিক জেনে নিন। লাইভ লোকেশন থেকে দূরত্বও মাপা যায়।",
  ),
  body: distanceBody(),
});

/* প্রতিটি জেলা */
for (const d of districts) {
  const list = placesByDistrict.get(String(d.id)) || [];
  emit(districtPath(d), {
    title: `${d.bn_name} জেলার দর্শনীয় স্থান — ইতিহাস ও মানচিত্র`,
    description: metaDescription(
      d.summary ||
        `${d.bn_name} জেলার দর্শনীয় স্থান, ইতিহাস ও ভ্রমণ নির্দেশিকা। ${d.division || ""} বিভাগের এই জেলায় ${bn(list.length)}টি গন্তব্য রয়েছে।`,
    ),
    jsonLd: graphLd([
      districtLd(d, list),
      breadcrumbLd([
        { name: "হোম", path: "/" },
        { name: "৬৪ জেলা", path: "/districts" },
        { name: d.bn_name, path: districtPath(d) },
      ]),
    ]),
    body: districtBody(d),
  });
}

/* প্রতিটি গন্তব্য — long-tail SEO এর মূল ভরসা */
for (const p of places) {
  const d = districtById.get(String(p.district_id));
  emit(placePath(p), {
    title: `${p.name} — ${d?.bn_name || p.district_bn || ""} জেলার দর্শনীয় স্থান`,
    description: metaDescription(
      p.summary || p.description || p.history || `${p.name}, ${d?.bn_name || ""} — ইতিহাস, অবস্থান ও জেলা শহর থেকে দূরত্ব।`,
    ),
    image: p.image || null,
    jsonLd: graphLd([
      placeLd(p, d),
      breadcrumbLd([
        { name: "হোম", path: "/" },
        { name: "গন্তব্যের তালিকা", path: "/places" },
        ...(d ? [{ name: d.bn_name, path: districtPath(d) }] : []),
        { name: p.name, path: placePath(p) },
      ]),
    ]),
    body: placeBody(p),
  });
}

/* ------------------------------------------------------------------ */
/* সারাংশ                                                            */
/* ------------------------------------------------------------------ */
const withHistory = places.filter((p) => p.history).length;
console.log("— প্রি-রেন্ডার সম্পূর্ণ —");
console.log("মোট পৃষ্ঠা  :", count);
console.log("  স্থির     : 4 | জেলা:", districts.length, "| গন্তব্য:", places.length);
console.log("ইতিহাসসহ   :", `${withHistory}/${places.length} গন্তব্য`);
console.log("আউটপুট    :", path.relative(root, DIST));
