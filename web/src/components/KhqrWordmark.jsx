/**
 * The KHQR wordmark: KH · a QR glyph standing in for the Q · R.
 *
 * <p>Drawn rather than set in type because the Q is not a letter — it is a
 * miniature QR symbol with the Q's tail, and typing "KHQR" in a bold sans is
 * visibly not the mark a Cambodian customer is looking for on a payment screen.
 * Recognising it at a glance is the whole job of a payment brand.
 *
 * <p>Everything is stroked and filled in {@code currentColor}, so the mark
 * takes the colour of whatever it sits on — white on the red header today,
 * correct anywhere else without a second asset.
 *
 * <p><b>This is a faithful reconstruction, not the official asset.</b> NBC
 * publishes the real KHQR logo with brand guidelines covering clear space and
 * minimum size; for production artwork — print, anything co-branded — use their
 * file. This exists so the screen does not ship a bare text label.
 */
export default function KhqrWordmark({ height = 22, className = '' }) {
  return (
    <svg
      className={className}
      height={height}
      viewBox="0 0 132 40"
      role="img"
      aria-label="KHQR"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* K H — drawn as paths so the mark keeps its proportions at any size and
          never depends on a font being present. */}
      <path
        d="M4 6h6.4v12.2L21.4 6h8.1L18.2 18.4 30.2 34h-8L13 21.6l-2.6 2.9V34H4V6Z"
        fill="currentColor"
      />
      <path d="M34 6h6.4v11h11.2V6H58v28h-6.4V22.7H40.4V34H34V6Z" fill="currentColor" />

      {/* The Q: a QR symbol. Three finder squares and a scatter of modules,
          which is what makes it read as a code rather than a rounded letter. */}
      <g transform="translate(64 6)">
        <rect
          x="1"
          y="1"
          width="26"
          height="26"
          rx="5"
          stroke="currentColor"
          strokeWidth="2.6"
        />
        {/* finder patterns — top-left, top-right, bottom-left */}
        <rect x="5.5" y="5.5" width="6.5" height="6.5" rx="1.4" fill="currentColor" />
        <rect x="16" y="5.5" width="6.5" height="6.5" rx="1.4" fill="currentColor" />
        <rect x="5.5" y="16" width="6.5" height="6.5" rx="1.4" fill="currentColor" />
        {/* data modules */}
        <rect x="16" y="16" width="2.6" height="2.6" fill="currentColor" />
        <rect x="19.9" y="19.9" width="2.6" height="2.6" fill="currentColor" />
        <rect x="16" y="19.9" width="2.6" height="2.6" fill="currentColor" opacity="0.55" />
        {/* the Q's tail */}
        <path
          d="M20.5 24.5 27.5 31.5"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
      </g>

      {/* R */}
      <path
        d="M98 6h12.6c6.6 0 10.6 3.7 10.6 9.4 0 4.2-2.2 7.2-5.9 8.5L122.6 34h-7.4l-6.2-9.2h-4.6V34H98V6Zm6.4 5.4v8.2h5.6c3 0 4.7-1.5 4.7-4.1s-1.7-4.1-4.7-4.1h-5.6Z"
        fill="currentColor"
      />
    </svg>
  )
}
