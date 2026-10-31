import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../lib/store.jsx";
import L from "leaflet";
import {
  MAP_TILE_URL,
  MAP_ATTRIBUTION,
  BD_CENTER,
  BD_BOUNDS,
  UPAZILA_BOUNDS_URL,
  UPAZILA_MIN_ZOOM,
} from "../config.js";
import { haversineKm, formatKm } from "../lib/geo.js";
import { categoryLabel, bn } from "../lib/format.js";

/**
 * হালকা বেসম্যাপে (CARTO Positron) রঙগুলো বেশি স্পষ্ট ফোটে,
 * তাই আগের তুলনায় ফিল-অপাসিটি একটু কমানো হয়েছে।
 */
const FILL = {
  none: { color: "#9fb6ae", weight: 1, fillColor: "#175c49", fillOpacity: 0.07 },
  wishlist: { color: "#c98a1e", weight: 1.3, fillColor: "#e5ad52", fillOpacity: 0.38 },
  visited: { color: "#0f4637", weight: 1.6, fillColor: "#1f8a6b", fillOpacity: 0.55 },
  selected: { color: "#d99a2b", weight: 3, fillColor: "#175c49", fillOpacity: 0.26 },
};

const HOVER = { weight: 2.4, fillOpacity: 0.42 };

/** উপজেলার সীমানার স্টাইল — সরু সাদা রেখা, যাতে ভেতরের ভাগ দেখা যায় */
const UPAZILA_STYLE = {
  color: "#ffffff",
  weight: 0.7,
  opacity: 0.75,
  fill: false,
  interactive: false,
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
  const upazilaLayer = useRef(null);
  const labelLayer = useRef(null);
  const placeLayer = useRef(null);
  const liveLayer = useRef(null);
  const shapes = useRef(new Map());
  const upazilaLoaded = useRef(false);

  const districts = content?.districts || [];
  const places = content?.places || [];
  const boundaries = content?.boundaries;

  /* উপজেলার সীমানা কী অবস্থায় আছে — ব্যবহারকারীকে জানানোর জন্য */
  const [detailOn, setDetailOn] = useState(false);

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

    /* উপজেলার সীমানা জেলার নিচে থাকবে, তাই আগে যোগ করা হয় */
    upazilaLayer.current = L.layerGroup().addTo(m);

    districtLayer.current = L.geoJSON(null, {
      style: () => FILL.none,
      onEachFeature: (feature, layer) => {
        const id = String(feature.properties.id);
        shapes.current.set(id, layer);
        layer.on("click", () => selectRef.current?.(id));
        layer.bindTooltip(() => districtTooltip(id), { sticky: true, direction: "top" });
        layer.on("mouseover", function () {
          const base = currentStyle(id);
          this.setStyle({ ...base, ...HOVER });
          if (this.bringToFront) this.bringToFront();
        });
        layer.on("mouseout", function () {
          this.setStyle(currentStyle(id));
        });
      },
    }).addTo(m);

    /* জেলার নামের লেবেল — হালকা বেসম্যাপে পরিষ্কার ফোটে */
    labelLayer.current = L.layerGroup().addTo(m);

    placeLayer.current = L.layerGroup().addTo(m);
    liveLayer.current = L.layerGroup().addTo(m);

    /* জুম বাড়লে উপজেলার বিস্তারিত সীমানা একবারই লোড হয় */
    const onZoom = () => {
      const z = m.getZoom();
      setDetailOn(z >= UPAZILA_MIN_ZOOM);
      if (z >= UPAZILA_MIN_ZOOM) loadUpazilas();
      paintLabels();
    };
    m.on("zoomend", onZoom);

    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(holder.current);

    return () => {
      ro.disconnect();
      m.off("zoomend", onZoom);
      m.remove();
      map.current = null;
      shapes.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * কোন জেলার বর্তমান রঙ কী হওয়া উচিত।
   *
   * গুরুত্বপূর্ণ: Leaflet-এর mouseover/mouseout হ্যান্ডলার মানচিত্র তৈরির সময়
   * একবারই বাঁধা হয়, তাই সরাসরি selectedId/visited ধরলে প্রথম রেন্ডারের
   * পুরনো (stale) মান আটকে যেত। সেজন্য সর্বশেষ মান রিফে রাখা হয়।
   */
  const styleState = useRef({ selectedId, visited, wishlist });
  styleState.current = { selectedId, visited, wishlist };

  const currentStyle = (id) => {
    const st = styleState.current;
    if (st.selectedId != null && id === String(st.selectedId)) return FILL.selected;
    if (st.visited[id]) return FILL.visited;
    if (st.wishlist[id]) return FILL.wishlist;
    return FILL.none;
  };

  /** উপজেলার বিস্তারিত সীমানা — ১ MB ফাইল, তাই শুধু একবার ও প্রয়োজনে লোড */
  async function loadUpazilas() {
    if (upazilaLoaded.current || !upazilaLayer.current) return;
    upazilaLoaded.current = true;
    try {
      const res = await fetch(UPAZILA_BOUNDS_URL);
      if (!res.ok) throw new Error(String(res.status));
      const geo = await res.json();
      const layer = L.geoJSON(geo, {
        style: UPAZILA_STYLE,
        interactive: false,
        // ক্যানভাসে আঁকা হয়, তাই ৫৪৪টি পলিগনও মসৃণ থাকে
        renderer: L.canvas({ padding: 0.4 }),
      });
      upazilaLayer.current.clearLayers();
      upazilaLayer.current.addLayer(layer);
      // উপজেলার রেখা যেন জেলার রঙের নিচে না চাপা পড়ে
      for (const [, l] of shapes.current) if (l.bringToFront) l.bringToFront();
    } catch (err) {
      upazilaLoaded.current = false; // পরের জুমে আবার চেষ্টা করা যাবে
      console.warn("উপজেলার সীমানা লোড করা যায়নি:", err?.message || err);
    }
  }

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
    // addData পরে বাঁধা টুলটিপ/ক্লিক/হোভার আবার যুক্ত করা দরকার
    districtLayer.current.eachLayer((layer) => {
      const id = String(layer.feature?.properties?.id);
      shapes.current.set(id, layer);
      layer.on("click", () => selectRef.current?.(id));
      layer.unbindTooltip();
      layer.bindTooltip(() => districtTooltip(id), { sticky: true, direction: "top" });
      layer.on("mouseover", function () {
        this.setStyle({ ...currentStyle(id), ...HOVER });
        if (this.bringToFront) this.bringToFront();
      });
      layer.on("mouseout", function () {
        this.setStyle(currentStyle(id));
      });
    });
    paintDistricts();
    paintLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundaries, districts.length]);

  /* ---------- রঙ হালনাগাদ ---------- */
  function paintDistricts() {
    for (const [id, layer] of shapes.current) {
      layer.setStyle(currentStyle(id));
      if (selectedId != null && id === String(selectedId) && layer.bringToFront) layer.bringToFront();
    }
  }

  /* ---------- জেলার নামের লেবেল ----------
     হালকা বেসম্যাপে নাম স্পষ্ট ফোটে; জুম কমালে বড় জেলাগুলোই শুধু দেখায়,
     যাতে ৬৪টি নাম একসাথে জট না পাকায়। */
  function paintLabels() {
    const m = map.current;
    const group = labelLayer.current;
    if (!m || !group) return;
    group.clearLayers();
    const zoom = m.getZoom();

    for (const [id, layer] of shapes.current) {
      const d = districts.find((x) => String(x.id) === id);
      if (!d || !layer.getBounds) continue;
      // জুম কম থাকলে কম গন্তব্যযুক্ত জেলার লেবেল বাদ — ভিড় কমে
      if (zoom <= 7 && (d.place_count || 0) < 2) continue;

      const c = layer.getBounds().getCenter();
      const icon = L.divIcon({
        className: "map-label",
        html: `<span>${escapeHtml(d.bn_name)}</span>`,
        iconSize: null,
      });
      L.marker(c, { icon, interactive: false, keyboard: false }).addTo(group);
    }
  }

  useEffect(() => {
    paintDistricts();
    paintLabels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, visited, wishlist, boundaries, districts.length]);

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
      ${p.locality ? `<span class="popup-meta">${escapeHtml(p.locality)}</span>` : ""}
      ${
        p.dist_from_hq_km != null
          ? `<span class="popup-dist">জেলা শহর থেকে ${formatKm(p.dist_from_hq_km)}</span>`
          : ""
      }
      ${dist != null ? `<span class="popup-dist">আপনার অবস্থান থেকে ${formatKm(dist)}</span>` : ""}
      ${p.verified === false ? `<span class="popup-warn">তথ্য যাচাই বাকি</span>` : ""}
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
      <div className={`map-detail-hint${detailOn ? " on" : ""}`} aria-live="polite">
        {detailOn ? "উপজেলার সীমানা দেখানো হচ্ছে" : "জুম করলে উপজেলার সীমানা দেখা যাবে"}
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
