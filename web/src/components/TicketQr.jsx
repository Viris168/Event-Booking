import { useEffect, useState } from 'react'
import { getTicketQrSvg } from '../api/tickets.js'

/**
 * The real, scannable QR for an issued ticket, drawn by the server.
 *
 * Deliberately not QrGlyph: that renders a QR-*shaped* placeholder that encodes
 * nothing, which is harmless in a prototype and actively dangerous on a real
 * ticket — it looks scannable and turns the holder away at the gate. If the
 * fetch fails this shows the failure rather than a decorative substitute, for
 * the same reason.
 */
export default function TicketQr({ ticketId, label, size = 256 }) {
  const [svg, setSvg] = useState(null)
  const [failed, setFailed] = useState(false)
  // Bumping this re-runs the fetch. A code is only ever requested when someone
  // is about to show it, so a single blip - the API restarting under a page
  // that has been open a while, a dropped connection - used to strand the
  // holder at the gate with nothing but "reload the page".
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    let retry = null
    setSvg(null)
    setFailed(false)

    getTicketQrSvg(ticketId, size)
      .then((markup) => {
        if (active) setSvg(markup)
      })
      .catch(() => {
        if (!active) return
        // One silent retry first: the common failure here is transient, and a
        // second request a moment later usually just works.
        if (attempt === 0) {
          retry = setTimeout(() => {
            if (active) setAttempt(1)
          }, 700)
          return
        }
        setFailed(true)
      })

    return () => {
      active = false
      if (retry) clearTimeout(retry)
    }
  }, [ticketId, size, attempt])

  if (failed) {
    return (
      // A div rather than a button on purpose: on a ticket card this sits
      // inside the "tap to enlarge" button, and a button inside a button is
      // invalid markup the browser will unnest. stopPropagation keeps the
      // retry from also opening the lightbox.
      <div
        className="qr-canvas qr-failed"
        onClick={(e) => {
          e.stopPropagation()
          setAttempt((n) => n + 1)
        }}
        style={{ gap: '0.35rem', cursor: 'pointer' }}
      >
        <span className="tiny muted">QR unavailable</span>
        <span className="tiny" style={{ textDecoration: 'underline' }}>
          Tap to try again
        </span>
      </div>
    )
  }

  if (!svg) {
    return <div className="qr-canvas qr-loading" aria-hidden="true" />
  }

  // The markup is an SVG document this API generated from the ticket id; it
  // carries no user-supplied content.
  return (
    <div
      className="qr-canvas"
      role="img"
      aria-label={label || 'Ticket QR code'}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
