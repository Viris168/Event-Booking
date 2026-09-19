/**
 * Which events can be drawn on a map.
 *
 * Its own module, away from EventsMap.jsx, precisely because EventsMap is
 * lazy-loaded: importing this from there would pull Leaflet into the main
 * bundle through the side door and undo the split.
 */
export function plottable(events) {
  return (events ?? []).filter((e) => {
    const v = e.venue
    return v && v.lat != null && v.lng != null && Number.isFinite(+v.lat) && Number.isFinite(+v.lng)
  })
}
