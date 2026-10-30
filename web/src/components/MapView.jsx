import { useEffect, useMemo, useRef } from "react";
import { useApp } from "../lib/store.jsx";
import L from "leaflet";
import { MAP_TILE_URL, MAP_ATTRIBUTION, BD_CENTER, BD_BOUNDS } from "../config.js";
import { haversineKm, formatKm } from "../lib/geo.js";
import { categoryLabel, bn } from "../lib/format.js";

const FILL = {
  none: { color: "#175c49", weight: 1, fillColor: "#175c49", fillOpacity: 0.05 },
  wishlist: { color: "#c98a1e", weight: 1.4, fillColor: "#e5ad52", fillOpacity: 0.34 },
  visited: { color: "#0f4637", weight: 1.6, fillColor: "#1f8a6b", fillOpacity: 0.5 },
  selected: { color: "#e5ad52", weight: 3, fillColor: "#175c49", fillOpacity: 0.22 },
};

/**
 * মানচিত্র — জেলার সীমানা, ঘোরা/যেতে-চাই রঙ, গন্তব্যের বিন্দু আর লাইভ লোকেশন।
 */
export default function MapView({
  content,
  travel,
  live,
  selectedId,
  onSelectDistrict,
  showPlaces = true,
  onOpenPlace,
  height = "60vh",
  className = "",
  flyTo,
  attribution,
}) {
  const { settings } = useApp();
  const showAttribution = attribution ?? settings?.prefs?.mapAttribution !== false;
  const holder = useRef(null);
  const map = useRef(null);
  const districtLayer = useRef(null);
  const placeLayer = useRef(null);
  const liveLayer = useRef(null);
  const shapes = useRef(new Map());

  const districts = content?.districts || [];
  const places = content?.places || [];
  const boundaries = content?.boundaries;

  /* মানচিত্র একবারই তৈরি হয়, তাই সর্বশেষ কলব্যাক রিফে রাখা হয় —
     না হলে প্রথম রেন্ডারের পুরনো (stale) ফাংশন ধরা পড়ত */
  const selectRef = useRef(onSelectDistrict);
  selectRef.current = onSelectDistrict;
  const openPlaceRef = useRef(onOpenPlace);
  openPlaceRef.current = onOpenPlace;

  const visited = travel?.visitedDistricts || {};
  const wishlist = travel?.wishlistDistricts || {};

  /* ---------- মানচিত্র তৈরি (একবারই) ---------- */
  useEffect(() => {
    if (!holder.current || map.current) return;
    const m = L.map(holder.current, {
      center: BD_CENTER,
      zoom: 7,
      minZoom: 6,
      maxZoom: 17,
      zoomControl: true,
      attributionControl: false,
      preferCanvas: true,
    });
    L.tileLayer(MAP_TILE_URL, {
      maxZoom: 19,
      attribution: showAttribution ? MAP_ATTRIBUTION : "",
    }).addTo(m);
    if (showAttribution) L.control.attribution({ prefix: false }).addTo(m);
    m.fitBounds(BD_BOUNDS);
    map.current = m;

    districtLayer.current = L.geoJSON(null, {
      style: () => FILL.none,
      onEachFeature: (feature, layer) => {
        const id = String(feature.properties.id);
        shapes.current.set(id, layer);
        layer.on("click", () => selectRef.current?.(id));
        layer.bindTooltip(() => districtTooltip(id), { sticky: true, direction: "top" });
      },
    }).addTo(m);

    placeLayer.current = L.layerGroup().addTo(m);
    liveLayer.current = L.layerGroup().addTo(m);

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
      shapes.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function districtTooltip(id) {
    const d = districts.find((x) => x.id === id);
    if (!d) return "";
    const status = visited[id] ? "ঘুরেছেন" : wishlist[id] ? "যেতে চান" : "";
    const el = document.createElement("div");
    el.className = "map-tip";
    el.innerHTML = `<strong>${escapeHtml(d.bn_name)}</strong>` +
      (d.place_count ? `<span>${bn(d.place_count)}টি গন্তব্য</span>` : "") +
      (status ? `<em>${status}</em>` : "");
    return el;
  }

  /* ---------- সীমানা লোড ---------- */
  useEffect(() => {
    if (!boundaries?.features?.length || !districtLayer.current) return;
    districtLayer.current.clearLayers();
    shapes.current.clear();
    districtLayer.current.addData(boundaries);
    // addData পরে বাঁধা টুলটিপ/ক্লিক আবার যুক্ত করা দরকার
    districtLayer.current.eachLayer((layer) => {
      const id = String(layer.feature?.properties?.id);
      shapes.current.set(id, layer);
      layer.on("click", () => selectRef.current?.(id));
      layer.unbindTooltip();
      layer.bindTooltip(() => districtTooltip(id), { sticky: true, direction: "top" });
    });
    paintDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaries, districts.length]);

  /* ---------- রঙ হালনাগাদ ---------- */
  function paintDistricts() {
    for (const [id, layer] of shapes.current) {
      const style =
        id === selectedId ? FILL.selected : visited[id] ? FILL.visited : wishlist[id] ? FILL.wishlist : FILL.none;
      layer.setStyle(style);
      if (id === selectedId && layer.bringToFront) layer.bringToFront();
    }
  }

  useEffect(() => {
    paintDistricts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, visited, wishlist, boundaries]);

  /* ---------- নির্বাচিত জেলায় উড়ে যাওয়া ---------- */
  useEffect(() => {
    if (!map.current || !selectedId) return;
    const layer = shapes.current.get(String(selectedId));
    if (layer?.getBounds) {
      map.current.flyToBounds(layer.getBounds(), { padding: [30, 30], duration: 0.6, maxZoom: 10 });
    }
  }, [selectedId]);

  /* ---------- বাইরের নির্দেশে ফ্লাই ---------- */
  useEffect(() => {
    if (!map.current || !flyTo) return;
    if (flyTo.bounds) map.current.flyToBounds(flyTo.bounds, { padding: [30, 30], duration: 0.6 });
    else if (flyTo.center) map.current.flyTo(flyTo.center, flyTo.zoom ?? 12, { duration: 0.7 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyTo?.center?.[0], flyTo?.center?.[1], flyTo?.zoom, flyTo?.bounds]);

  /* ---------- গন্তব্যের বিন্দু ---------- */
  useEffect(() => {
    if (!placeLayer.current || !map.current) return;
    placeLayer.current.clearLayers();
    if (!showPlaces) return;

    const zoom = map.current.getZoom();
    // খুব জুম-আউট করলে শুধু জেলাভিত্তিক গোছা দেখানো হয় না, তবে বিন্দু ছোট রাখা হয়
    const radius = zoom >= 9 ? 5 : 3.5;

    for (const p of places) {
      if (p.lat == null || p.lon == null) continue;
      const marker = L.circleMarker([p.lat, p.lon], {
        radius,
        color: "#fff",
        weight: 1,
        fillColor: "#e5ad52",
        fillOpacity: 0.95,
      });
      marker.bindPopup(() => placePopup(p), { maxWidth: 280, className: "pc-popup" });
      marker.addTo(placeLayer.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, showPlaces, selectedId]);

  function placePopup(p) {
    const el = document.createElement("div");
    const dist = live ? haversineKm([live.lat, live.lng], [p.lat, p.lon]) : null;
    el.className = "popup";
    el.innerHTML = `
      <strong>${escapeHtml(p.name)}</strong>
      <span class="popup-meta">${escapeHtml(p.district_bn || "")}${
        p.upazila_bn ? " · " + escapeHtml(p.upazila_bn) : ""
      }</span>
      <span class="popup-cat">${escapeHtml(categoryLabel(p.category))}</span>
      ${dist != null ? `<span class="popup-dist">আপনার অবস্থান থেকে ${formatKm(dist)}</span>` : ""}
      ${p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" />` : ""}
    `;
    if (onOpenPlace) {
      const btn = document.createElement("button");
      btn.className = "btn primary sm";
      btn.textContent = "বিস্তারিত দেখুন";
      btn.onclick = () => {
        map.current?.closePopup();
        openPlaceRef.current?.(p);
      };
      el.appendChild(btn);
    }
    return el;
  }

  /* ---------- লাইভ লোকেশন ---------- */
  useEffect(() => {
    if (!liveLayer.current || !map.current) return;
    liveLayer.current.clearLayers();
    if (!live) return;

    const point = L.latLng(live.lat, live.lng);

    if (live.accuracy && live.accuracy < 20000) {
      L.circle(point, {
        radius: live.accuracy,
        color: "#2f7de1",
        weight: 1,
        fillColor: "#2f7de1",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(liveLayer.current);
    }

    L.circleMarker(point, {
      radius: 8,
      color: "#fff",
      weight: 3,
      fillColor: "#2f7de1",
      fillOpacity: 1,
    })
      .bindTooltip("আপনি এখানে", { direction: "top", offset: [0, -8] })
      .addTo(liveLayer.current);
  }, [live]);

  /* এডমিন সেটিংস বদলালে মানচিত্রের অ্যাট্রিবিউশন সাথে সাথে চালু/বন্ধ */
  const attrControl = useRef(null);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (showAttribution && !attrControl.current) {
      attrControl.current = L.control.attribution({ prefix: false });
      attrControl.current.addTo(m);
    } else if (!showAttribution && attrControl.current) {
      attrControl.current.remove();
      attrControl.current = null;
    }
  }, [showAttribution]);

  const stats = useMemo(() => ({ visited: Object.keys(visited).length }), [visited]);

  return (
    <div className={`map-wrap ${className}`} style={{ height }}>
      <div className="map-holder" ref={holder} />
      <div className="map-legend" aria-hidden="true">
        <span>
          <i className="sw visited" /> ঘুরেছেন ({bn(stats.visited)})
        </span>
        <span>
          <i className="sw wishlist" /> যেতে চান
        </span>
        <span>
          <i className="sw place" /> গন্তব্য
        </span>
        {live && (
          <span>
            <i className="sw live" /> আপনি
          </span>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
