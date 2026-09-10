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
/**
 * `variant`
 *
 * <p>`qr` (default) is the ticket case this was built for: a small white panel
 * with the code, its caption, and the instruction to hold it up at the gate.
 *
 * <p>`media` is for looking at a picture. The caption, subtitle and gate hint
 * are all suppressed and the panel chrome disappears, leaving the image on the
 * backdrop with a close button. Those three lines are written for a ticket -
 * shown under event artwork, "show this at the gate" is simply wrong - and a
 * 30rem panel sized around a square QR is far too small for a 16:9 photo.
 */
export default function QrLightbox({ open, onClose, children, caption, subtitle, variant = 'qr' }) {
  const media = variant === 'media'
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
      aria-label={caption || (media ? 'Image' : 'Ticket QR code')}
      // Only a click on the backdrop itself closes. Without the target check,
      // a drag that ends outside the panel dismisses the code mid-scan.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className={`qr-lightbox-panel${media ? ' is-media' : ''}`}>
        <button
          ref={closeRef}
          type="button"
          className="qr-lightbox-close"
          onClick={onClose}
          aria-label={km ? 'បិទ' : 'Close'}
        >
          <Icon name="xCircle" size={22} />
        </button>

        <div className={`qr-lightbox-code${media ? ' is-media' : ''}`}>{children}</div>

        {!media && caption && <p className="qr-lightbox-caption">{caption}</p>}
        {!media && subtitle && <p className="qr-lightbox-sub">{subtitle}</p>}

        {!media && (
          <p className="qr-lightbox-hint">
            {km
              ? 'បង្កើនពន្លឺអេក្រង់ ហើយបង្ហាញកូដនេះនៅមាត់ទ្វារ'
              : 'Turn your screen brightness up and show this at the gate'}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
