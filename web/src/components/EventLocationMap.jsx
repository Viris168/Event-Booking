import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const ZOOM = 15;
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

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

  // Initialize Map
  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true,
    }).setView([lat, lng], ZOOM);

    // OpenStreetMap base tiles. Dark theme is applied seamlessly via CSS filter on .leaflet-tile-pane,
    // preserving full road networks, Khmer script, rivers, and landmarks with high legibility.
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution: TILE_ATTRIBUTION,
    }).addTo(map);

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

  return <div ref={hostRef} className="evloc-map-canvas" />;
}
