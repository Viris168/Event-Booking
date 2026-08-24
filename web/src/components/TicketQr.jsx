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

  useEffect(() => {
    let active = true
    setSvg(null)
    setFailed(false)

    getTicketQrSvg(ticketId, size)
      .then((markup) => {
        if (active) setSvg(markup)
      })
      .catch(() => {
        if (active) setFailed(true)
      })

    return () => {
      active = false
    }
  }, [ticketId, size])

  if (failed) {
    return (
      <div className="qr-canvas qr-failed" role="img" aria-label="QR unavailable">
        <span className="tiny muted">QR unavailable — reload the page</span>
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
