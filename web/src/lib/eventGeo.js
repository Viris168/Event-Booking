/**
 * Which events can be drawn on a map.
 *
 * Its own module, away from EventsMap.jsx, precisely because EventsMap is
 * lazy-loaded: importing this from there would pull Leaflet into the main
 * bundle through the side door and undo the split.
 */
export function plottable(events) {
  return (events ?? []).filter((e) => {
    const v = e?.venue;
    if (!v) return false;
    const lat = v.lat ?? v.latitude;
    const lng = v.lng ?? v.longitude;
    return (
      lat != null &&
      lng != null &&
      Number.isFinite(+lat) &&
      Number.isFinite(+lng)
    );
  });
}

export function getVenueCoords(venue) {
  if (!venue) return null;
  const lat = venue.lat ?? venue.latitude;
  const lng = venue.lng ?? venue.longitude;
  if (
    lat == null ||
    lng == null ||
    !Number.isFinite(+lat) ||
    !Number.isFinite(+lng)
  ) {
    return null;
  }
  return [+lat, +lng];
}
