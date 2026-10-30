import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp } from "../lib/store.jsx";
import { PlaceCard } from "../components/Cards.jsx";
import PlaceDetail from "../components/PlaceDetail.jsx";
import { CATEGORY_ORDER, categoryLabel, bn } from "../lib/format.js";
import { haversineKm } from "../lib/geo.js";

/** সব গন্তব্য — ধরন, জেলা, উপজেলা ও খোঁজ দিয়ে ফিল্টার */
export default function Places() {
  const { content, live } = useApp();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [districtId, setDistrictId] = useState("all");
  const [upazila, setUpazila] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [openPlace, setOpenPlace] = useState(null);

  const places = content?.places || [];
  const districts = content?.districts || [];

  /* ?focus=<placeId> থেকে সরাসরি বিস্তারিত খোলা */
  useEffect(() => {
    const focus = params.get("focus");
    if (!focus) return;
    const found = places.find((p) => p.id === focus);
    if (found) setOpenPlace(found);
    const next = new URLSearchParams(params);
    next.delete("focus");
    setParams(next, { replace: true });
  }, [params, places, setParams]);

  const upazilaOptions = useMemo(() => {
    if (districtId === "all") return [];
    const set = new Set(
      places.filter((p) => p.district_id === districtId).map((p) => p.upazila_bn).filter(Boolean),
    );
    return [...set].sort((a, b) => a.localeCompare(b, "bn"));
  }, [places, districtId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = places.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (districtId !== "all" && p.district_id !== districtId) return false;
      if (upazila !== "all" && (p.upazila_bn || "") !== upazila) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.name_en || "").toLowerCase().includes(q) ||
        (p.district_bn || "").toLowerCase().includes(q) ||
        (p.summary || "").toLowerCase().includes(q)
      );
    });

    if (sortBy === "distance" && live) {
      return list.sort(
        (a, b) =>
          (haversineKm([live.lat, live.lng], [a.lat, a.lon]) ?? 1e9) -
          (haversineKm([live.lat, live.lng], [b.lat, b.lon]) ?? 1e9),
      );
    }
    if (sortBy === "district") {
      return list.sort(
        (a, b) =>
          (a.district_bn || "").localeCompare(b.district_bn || "", "bn") ||
          a.name.localeCompare(b.name, "bn"),
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "bn"));
  }, [places, query, category, districtId, upazila, sortBy, live]);

  const reset = () => {
    setQuery("");
    setCategory("all");
    setDistrictId("all");
    setUpazila("all");
  };

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>গন্তব্যের তালিকা</h1>
          <p>{bn(filtered.length)}টি গন্তব্য দেখানো হচ্ছে · মোট {bn(places.length)}টি</p>
        </div>
      </header>

      <section className="filters-bar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম বা জেলা দিয়ে খুঁজুন"
          aria-label="গন্তব্য খুঁজুন"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="গন্তব্যের ধরন">
          <option value="all">সব ধরন</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        <select
          value={districtId}
          onChange={(e) => {
            setDistrictId(e.target.value);
            setUpazila("all");
          }}
          aria-label="জেলা"
        >
          <option value="all">সব জেলা</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.bn_name}
            </option>
          ))}
        </select>
        {upazilaOptions.length > 0 && (
          <select value={upazila} onChange={(e) => setUpazila(e.target.value)} aria-label="উপজেলা">
            <option value="all">সব উপজেলা</option>
            {upazilaOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="সাজান">
          <option value="name">নাম অনুযায়ী</option>
          <option value="district">জেলা অনুযায়ী</option>
          <option value="distance" disabled={!live}>
            দূরত্ব অনুযায়ী {live ? "" : "(লাইভ লোকেশন দরকার)"}
          </option>
        </select>
        <button className="btn ghost sm" onClick={reset}>
          ফিল্টার মুছুন
        </button>
      </section>

      {filtered.length === 0 ? (
        <div className="empty">
          <p>এই ফিল্টারে কোনো গন্তব্য নেই।</p>
          <button className="btn ghost sm" onClick={reset}>
            সব গন্তব্য দেখুন
          </button>
        </div>
      ) : (
        <section className="pgrid">
          {filtered.map((p) => (
            <PlaceCard key={p.id} place={p} live={live} onOpen={setOpenPlace} />
          ))}
        </section>
      )}

      {openPlace && <PlaceDetail place={openPlace} onClose={() => setOpenPlace(null)} />}
    </main>
  );
}
