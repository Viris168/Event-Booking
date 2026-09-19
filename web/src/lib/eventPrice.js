/**
 * The lowest price an event can be bought at, in cents, or null.
 *
 * One copy, because there were three: the card, the map pin and the price
 * filter each reduced over the same two arrays with slightly different
 * spellings and slightly different answers for an event that has no tiers at
 * all (Infinity in one, 0 in another).
 *
 * Both key spellings are accepted for the reason adapters.js carries both -
 * the API serialises snake_case, and a mapped event and a raw response both
 * reach these call sites.
 */
export function minPriceCents(event) {
  if (!event) return null
  const tiers = [
    ...(event.seat_classes ?? event.seatClasses ?? []),
    ...(event.zones ?? []),
  ]
  const cents = tiers
    .map((t) => t.price_usd_cents ?? t.priceUsdCents)
    .filter((n) => Number.isFinite(n))
  return cents.length ? Math.min(...cents) : null
}

/** The same figure in whole dollars, for the price filter's buckets. */
export function minPriceUsd(event) {
  const cents = minPriceCents(event)
  return cents == null ? null : cents / 100
}
