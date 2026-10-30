import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { DistrictCard } from "../components/Cards.jsx";
import { bn } from "../lib/format.js";
import { useDocumentMeta, breadcrumbLd, metaDescription } from "../lib/seo.js";

/** ৬৪ জেলার তালিকা — বিভাগ অনুযায়ী, খোঁজ ও ফিল্টারসহ */
export default function Districts() {
  const { content, travel, counts } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("all");
  const [onlyVisited, setOnlyVisited] = useState(false);

  const districts = content?.districts || [];
  useDocumentMeta({
    title: "৬৪ জেলার তালিকা — দর্শনীয় স্থান ও মানচিত্র",
    description: metaDescription(
      "বাংলাদেশের ৬৪ জেলার সম্পূর্ণ তালিকা। প্রতিটি জেলার দর্শনীয় স্থান, উপজেলা, মানচিত্র ও জেলা শহর থেকে দূরত্ব। বিভাগ অনুযায়ী খুঁজুন।",
    ),
    path: "/districts",
    jsonLd: breadcrumbLd([
      { name: "হোম", path: "/" },
      { name: "৬৪ জেলা", path: "/districts" },
    ]),
  });

  const divisions = useMemo(() => {
    const map = new Map();
    for (const d of districts) {
      const key = d.division || d.division_en || "অন্যান্য";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return [...map.entries()];
  }, [districts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return districts.filter((d) => {
      if (division !== "all" && (d.division || d.division_en) !== division) return false;
      if (onlyVisited && !travel?.visitedDistricts?.[d.id]) return false;
      if (!q) return true;
      return (
        d.bn_name.toLowerCase().includes(q) ||
        d.name.toLowerCase().includes(q) ||
        (d.famous || "").toLowerCase().includes(q)
      );
    });
  }, [districts, query, division, onlyVisited, travel]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of filtered) {
      const key = d.division || d.division_en || "অন্যান্য";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>জেলায় জেলায় বাংলাদেশ</h1>
          <p>
            {bn(districts.length)} জেলা · আপনি ঘুরেছেন {bn(counts.visited)}টি · যেতে চান{" "}
            {bn(counts.wishlist)}টি
          </p>
        </div>
        <div className="filters">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="জেলার নাম লিখুন"
            aria-label="জেলার নাম"
          />
          <select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="বিভাগ">
            <option value="all">সব বিভাগ</option>
            {divisions.map(([name]) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label className="check">
            <input type="checkbox" checked={onlyVisited} onChange={(e) => setOnlyVisited(e.target.checked)} />
            শুধু ঘোরা জেলা
          </label>
        </div>
      </header>

      {grouped.length === 0 && (
        <div className="empty">
          <p>এই ফিল্টারে কোনো জেলা নেই।</p>
          <button
            className="btn ghost sm"
            onClick={() => {
              setQuery("");
              setDivision("all");
              setOnlyVisited(false);
            }}
          >
            ফিল্টার মুছুন
          </button>
        </div>
      )}

      {grouped.map(([divName, list]) => (
        <section className="block" key={divName}>
          <div className="block-head tight">
            <h2>{divName}</h2>
            <span className="muted">{bn(list.length)} জেলা</span>
          </div>
          <div className="dgrid">
            {list.map((d) => (
              <DistrictCard key={d.id} district={d} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
