/**
 * Resolves what to paint behind an event: an uploaded image when there is
 * one, a gradient when there is not.
 *
 * Why this exists
 * ---------------
 * Two bugs lived in the three places that render event artwork (the listing
 * card, the home spotlight, the detail hero), because each built its own
 * class name inline:
 *
 *   1. They emitted `cover-${event.cover}` - and `cover` is an INTEGER
 *      (1, 2, 3 …) while the stylesheet only defines NAMED covers
 *      (.cover-sunset, .cover-river, …). `cover-1` matches no rule, so the
 *      media box painted nothing at all: an icon floating on the card
 *      background. That is the "looks unfinished" symptom.
 *
 *   2. They ignored cover_image_url / banner_image_url entirely, so an
 *      organiser could upload a poster in the event form and never see it
 *      anywhere on the storefront.
 *
 * Keeping the mapping here means the fix lands once and the three call sites
 * stay declarative.
 */

/** Order matters: an event's `cover` integer indexes into this list. */
const COVERS = [
  'sunset',
  'river',
  'gold',
  'teal',
  'plum',
  'indigo',
  'lime',
  'cyan',
  'rose',
]

/**
 * A stable gradient for an event that has no uploaded art.
 *
 * `cover` indexes COVERS **zero-based**, which is the convention the organiser
 * form already writes and reads (EventFormPage stores
 * `COVERS.indexOf(form.cover)` and renders `COVERS[e.cover]`). Treating the
 * column as 1-based here would have shifted every event one colour away from
 * the swatch its organiser actually picked.
 *
 * Out-of-range values wrap rather than falling off the end, so a row with
 * cover = 99 still gets a colour instead of a blank box.
 *
 * When `cover` is absent the title is hashed instead, so a given event keeps
 * the same colour between renders and two adjacent cards rarely collide.
 */
export function coverClass(event) {
  if (!event) return `cover-${COVERS[0]}`

  const raw = event.cover ?? event.cover_index ?? null
  if (raw != null && Number.isFinite(Number(raw))) {
    const idx = Math.trunc(Number(raw)) % COVERS.length
    return `cover-${COVERS[idx < 0 ? idx + COVERS.length : idx]}`
  }

  const key = String(event.title_en ?? event.titleEn ?? event.id ?? '')
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0
  return `cover-${COVERS[Math.abs(hash) % COVERS.length]}`
}

/**
 * A Cloudinary URL asked for at the size it will actually be drawn.
 *
 * Uploads come back as the original file and were being used untouched, so a
 * card 338px wide was fetching whatever the organiser happened to have: one
 * production event ships a 1600x900 desktop wallpaper at 821kB into a box of
 * 338x190. Eight of those is most of a phone's patience on a Cambodian
 * connection, and none of the detail survives the downscale.
 *
 * `f_auto` lets Cloudinary answer in whatever the browser accepts - AVIF or
 * WebP for anything current - and `q_auto` picks a quality per image rather
 * than a fixed number. `w_` is the only part that needs a decision here.
 *
 * Anything that is not a Cloudinary delivery URL is returned untouched, as is
 * one that already carries a transform, so this cannot double-apply.
 */
const CLOUDINARY_UPLOAD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/

export function sized(url, width) {
  if (!url) return url
  const m = String(url).match(CLOUDINARY_UPLOAD)
  if (!m) return url
  const [, base, rest] = m
  // A transform segment is already there - leave it alone rather than stacking
  // a second one in front of it.
  if (/^[a-z]{1,3}_[^/]+\//.test(rest)) return url
  return `${base}f_auto,q_auto,w_${width}/${rest}`
}

/**
 * The `srcset` pair for a box of `width` CSS pixels.
 *
 * Two entries, not five: the cards are one of two fixed widths and a retina
 * phone is the only case that genuinely needs more pixels than the layout
 * says.
 */
export function sizedSrcSet(url, width) {
  if (!url || !CLOUDINARY_UPLOAD.test(String(url))) return undefined
  return `${sized(url, width)} 1x, ${sized(url, width * 2)} 2x`
}

/**
 * The uploaded artwork for a slot, or null.
 *
 * `which` is 'banner' for the event's actual photograph - used everywhere a
 * picture of the event is wanted: cards, spotlight, the detail hero. 'cover'
 * is the seating chart / venue layout upload (see EventFormPage's "Map
 * image" field and VenueLayoutPanel), which is content, not artwork - never
 * a photo, and a photo is never a substitute for it. The two used to fall
 * back to each other on the theory that any uploaded image beats a blank
 * box; that theory stopped holding the moment 'cover' became a map, because
 * a seating chart standing in for a missing photo is worse than the
 * gradient it would have shown instead.
 */
export function artUrl(event, which = 'banner') {
  if (!event) return null
  if (which === 'cover') return event.cover_image_url ?? event.coverImageUrl ?? null
  return event.banner_image_url ?? event.bannerImageUrl ?? null
}

/**
 * Everything a media box needs, in one call.
 *
 * `className` always carries a gradient even when there is an image, so the
 * box is already the right colour while the photo decodes and stays that
 * colour if the request 404s.
 */
export function eventArt(event, which = 'banner') {
  const url = artUrl(event, which)
  return {
    url,
    hasImage: !!url,
    className: coverClass(event),
  }
}
