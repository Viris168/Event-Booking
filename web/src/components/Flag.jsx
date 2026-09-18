/**
 * The two flags the language switch is drawn with.
 *
 * <p>Deliberately NOT in {@link ./Icon.jsx}. That set is one stroked path per
 * name, painted in {@code currentColor} so every glyph inherits the colour and
 * size of the text it labels. A flag is the opposite on both counts: it is
 * filled, it is multi-coloured, and its colours are the entire point - a
 * Cambodian flag in the navbar's white would be a white rectangle. Putting
 * these in Icon would mean special-casing half of what Icon does.
 *
 * <p>Drawn rather than fetched. Every other piece of iconography in this
 * product is inline SVG with no network request behind it, and a flag CDN would
 * make the language switch - which is chrome, on every page - depend on a third
 * party being up.
 *
 * <p><b>On using a flag for a language at all.</b> It is a compromise and worth
 * naming. A flag is a country and English is not one country's, which is why
 * the {@code aria-label} on each button says the language in words and the flag
 * is left as the visual shorthand. A screen reader user hears "English", never
 * "United Kingdom".
 *
 * <p>Both are drawn on a 3:2 viewBox so the pair are optically the same size.
 * The real Union Flag is 2:1; at 20px the difference is a pixel and matching
 * heights matters more than a ratio nobody can measure at this size.
 */

/**
 * Simplified for the size it is actually used at.
 *
 * <p>Angkor Wat is three towers and a causeway here. The real silhouette has
 * five towers, a moat and a colonnade, none of which survive being drawn 8px
 * tall - they turn into a grey smudge in the middle of a red band. Three towers
 * is what reads as Angkor Wat at 20px, which is the only size this renders at.
 */
function Cambodia() {
  return (
    <>
      <rect width="30" height="20" fill="#032ea1" />
      <rect y="5" width="30" height="10" fill="#e00025" />
      <g fill="#ffffff">
        {/* centre tower, tallest */}
        <path d="M15 6.1 L16.25 9.3 L16.25 12.4 L13.75 12.4 L13.75 9.3 Z" />
        {/* flanking towers */}
        <path d="M11 8.3 L12 10.7 L12 12.4 L10 12.4 L10 10.7 Z" />
        <path d="M19 8.3 L20 10.7 L20 12.4 L18 12.4 L18 10.7 Z" />
        {/* the causeway the towers stand on */}
        <rect x="8.5" y="12.7" width="13" height="1.2" />
      </g>
    </>
  )
}

/**
 * The Union Flag, built from strokes rather than the real counterchanged
 * geometry.
 *
 * <p>Properly, the red saltire is offset from the white one - rotated
 * counterclockwise on the hoist side - and reproducing that needs clip paths
 * and a dozen polygons. At 20px wide the offset is well under a pixel, so the
 * strokes below are indistinguishable from the correct construction and are a
 * tenth of the markup.
 */
function UnitedKingdom() {
  return (
    <>
      <rect width="30" height="20" fill="#012169" />
      {/*
        fill="none" on every one of these is load-bearing, not tidiness. SVG's
        initial fill is black, and these paths are open strokes - without it
        each one fills the triangle between its own endpoints and the flag
        comes out a black rectangle with coloured edges.
      */}
      {/* diagonals: white first, red laid over the middle of it */}
      <path d="M0 0 L30 20 M30 0 L0 20" fill="none" stroke="#ffffff" strokeWidth="4" />
      <path d="M0 0 L30 20 M30 0 L0 20" fill="none" stroke="#c8102e" strokeWidth="1.8" />
      {/* the cross of St George, drawn last so it sits on top */}
      <path d="M15 0 V20 M0 10 H30" fill="none" stroke="#ffffff" strokeWidth="6.5" />
      <path d="M15 0 V20 M0 10 H30" fill="none" stroke="#c8102e" strokeWidth="3.8" />
    </>
  )
}

const FLAGS = {
  km: Cambodia,
  /*
   * English is drawn with the Union Flag rather than the Stars and Stripes.
   * Neither is right - see the note at the top of this file - and this is the
   * one more commonly used for "English" on Cambodian signage and government
   * sites. Swapping it is this one line plus a UnitedStates() beside the other
   * two; nothing else refers to which flag this is.
   */
  en: UnitedKingdom,
}

/**
 * @param code  a locale from LOCALES: 'en' or 'km'
 * @param size  rendered width in px; height follows the 3:2 box
 */
export default function Flag({ code, size = 20, className = '' }) {
  const Shape = FLAGS[code]
  if (!Shape) return null

  return (
    <svg
      className={`flag ${className}`}
      viewBox="0 0 30 20"
      width={size}
      height={(size / 3) * 2}
      /* Decorative: every caller labels the control itself, in words. A flag
         announced as an image here would have a screen reader read the country
         and then the language, which is the country being wrong out loud. */
      aria-hidden="true"
      focusable="false"
    >
      <Shape />
    </svg>
  )
}
