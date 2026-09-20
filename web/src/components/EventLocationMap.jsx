import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useTheme } from "../context/ThemeContext.jsx";

const ZOOM = 15;

const TILES = {
  light: {
    base: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    labels: null,
    maxNativeZoom: 19,
  },
  dark: {
    base: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    labels:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
    maxNativeZoom: 16,
  },
};

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createVenuePinIcon(venueName) {
  return L.divIcon({
    className: "evloc-marker-container",
    html: `
      <div class="evloc-pin-wrap">
        ${
          venueName
            ? `<div class="evloc-pin-tag">
                 <span>${escapeHtml(venueName)}</span>
                 <div class="evloc-pin-tag-arrow"></div>
               </div>`
            : ""
        }
        <div class="evloc-pin-badge">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3" fill="currentColor"/>
          </svg>
        </div>
        <div class="evloc-pin-point"></div>
      </div>
    `,
    iconSize: [220, 68],
    iconAnchor: [110, 64],
  });
}

export default function EventLocationMap({
  lat,
  lng,
  venueName,
  addressLine,
  locale = "en",
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const { isDark } = useTheme();

  // Initialize Map
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], ZOOM);

    const marker = L.marker([lat, lng], {
      icon: createVenuePinIcon(venueName),
    }).addTo(map);

    if (addressLine || venueName) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      const btnLabel =
        locale === "km" ? "បើកក្នុង Google Maps" : "Open in Google Maps";
      marker.bindPopup(`
        <div class="evloc-popup">
          <div class="evloc-popup-title">${escapeHtml(venueName || "")}</div>
          ${addressLine ? `<div class="evloc-popup-addr">${escapeHtml(addressLine)}</div>` : ""}
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="evloc-popup-btn">
            ${escapeHtml(btnLabel)} &rarr;
          </a>
        </div>
      `);
    }

    mapRef.current = map;

    // Observe container size to auto-invalidate size
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        map.invalidateSize();
      }
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, venueName, addressLine, locale]);

  // Handle Light / Dark Tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tiles = isDark ? TILES.dark : TILES.light;
    const shared = { maxZoom: 19, maxNativeZoom: tiles.maxNativeZoom };
    const layers = [
      L.tileLayer(tiles.base, {
        ...shared,
        attribution: TILE_ATTRIBUTION,
        zIndex: 1,
      }),
    ];
    if (tiles.labels) {
      layers.push(L.tileLayer(tiles.labels, { ...shared, zIndex: 2 }));
    }
    layers.forEach((layer) => layer.addTo(map));
    return () => layers.forEach((layer) => layer.remove());
  }, [isDark]);

  return <div ref={hostRef} className="evloc-map-canvas" />;
}
