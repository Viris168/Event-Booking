import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * The ticket's QR, filling the screen, for the moment it is actually scanned.
 *
 * Not decoration. `QrRenderer` targets roughly 4 pixels per module for a
 * reliable read, and the 256px card thumbnail sits close to that floor — under
 * a dim gate light, behind a phone case, at whatever brightness the holder's
 * screen happens to be on, it is the difference between one beep and a queue.
 * Opening it large is the single cheapest thing this app can do for the person
 * at the door.
 *
 * The SVG is re-rendered at the larger size rather than CSS-scaled: it is
 * vector, so this costs one small request and gives a genuinely sharp symbol
 * instead of an interpolated one.
 *
 * Rendered through a portal so no `overflow: hidden` or stacking context on an
 * ancestor ticket card can clip it — the usual way a modal ends up trapped
 * inside the component that opened it.
 */
export default function QrLightbox({ open, onClose, children, caption, subtitle }) {
  const { locale } = useLocale()
  const closeRef = useRef(null)
  const km = locale === 'km'

  // Escape closes, and the body must not scroll behind the overlay: a phone
  // held up to a scanner should not drift because a thumb brushed the screen.
  useEffect(() => {
    if (!open) return undefined

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    // Focus lands on Close so a keyboard user is not stranded behind the modal.
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="qr-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={caption || 'Ticket QR code'}
      // Only a click on the backdrop itself closes. Without the target check,
      // a drag that ends outside the panel dismisses the code mid-scan.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="qr-lightbox-panel">
        <button
          ref={closeRef}
          type="button"
          className="qr-lightbox-close"
          onClick={onClose}
          aria-label={km ? 'បិទ' : 'Close'}
        >
          <Icon name="xCircle" size={22} />
        </button>

        <div className="qr-lightbox-code">{children}</div>

        {caption && <p className="qr-lightbox-caption">{caption}</p>}
        {subtitle && <p className="qr-lightbox-sub">{subtitle}</p>}

        <p className="qr-lightbox-hint">
          {km
            ? 'បង្កើនពន្លឺអេក្រង់ ហើយបង្ហាញកូដនេះនៅមាត់ទ្វារ'
            : 'Turn your screen brightness up and show this at the gate'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
