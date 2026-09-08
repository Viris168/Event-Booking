import { useState } from 'react'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import QrGlyph from './QrGlyph.jsx'
import TicketQr from './TicketQr.jsx'
import QrLightbox from './QrLightbox.jsx'

/**
 * One ticket = one admission unit. A seat line has exactly one; a GA line with
 * qty 3 renders three of these, each independently scannable.
 *
 * Takes either shape: a ticket issued by the API (real, server-signed QR) or
 * one from the prototype store (placeholder glyph). `qr_token` is what tells
 * them apart — the API never sends one, because its bearer secret is the signed
 * payload behind the QR image.
 */
export default function TicketCard({ ticket, label, event, venue }) {
  const { t, locale, dateTime } = useLocale()
  const [zoomed, setZoomed] = useState(false)
  const used = ticket.checked_in ?? !!ticket.checked_in_at
  const isMock = Boolean(ticket.qr_token)

  // A real ticket carries its own event and seat details, so it stays correct
  // even where the page could not load the event separately.
  const title = locale === 'km'
    ? (ticket.event_title_km ?? event?.title_km)
    : (ticket.event_title_en ?? event?.title_en)
  const startsAt = ticket.event_starts_at ?? event?.starts_at
  const seatLabel =
    label ??
    ticket.seat_location ??
    (ticket.tier_name
      ? `${ticket.tier_name}${ticket.units_in_line > 1 ? ` · #${ticket.unit_seq}` : ''}`
      : '—')

  return (
    <div className={`ticket ${used ? 'used' : ''}`}>
      <div className="ticket-stub">
        {/* A button, not a div with onClick: this is the control that makes a
            ticket scannable, so it has to be reachable by keyboard and announce
            itself. Disabled once used — enlarging a spent code helps nobody. */}
        <button
          type="button"
          className="qr-zoom-trigger"
          onClick={() => setZoomed(true)}
          disabled={used}
          aria-label={
            locale === 'km' ? 'ពង្រីកកូដ QR' : 'Enlarge QR code for scanning'
          }
        >
          {isMock ? (
            <QrGlyph token={ticket.qr_token} label={`Ticket ${seatLabel}`} />
          ) : (
            <TicketQr ticketId={ticket.id} label={`Ticket ${seatLabel}`} />
          )}
          {!used && (
            <span className="qr-zoom-badge" aria-hidden="true">
              <Icon name="qr" size={13} />
              {locale === 'km' ? 'ពង្រីក' : 'Tap to enlarge'}
            </span>
          )}
        </button>

        <QrLightbox
          open={zoomed}
          onClose={() => setZoomed(false)}
          caption={seatLabel}
          subtitle={title}
        >
          {/* Re-fetched at 512 rather than CSS-scaled: the SVG is vector, so a
              second small request buys a genuinely sharp symbol. */}
          {isMock ? (
            <QrGlyph token={ticket.qr_token} label={`Ticket ${seatLabel}`} />
          ) : (
            <TicketQr ticketId={ticket.id} label={`Ticket ${seatLabel}`} size={512} />
          )}
        </QrLightbox>
        <span className="tiny with-icon">
          <Icon name={used ? 'xCircle' : 'checkCircle'} size={12} />
          {used ? t('alreadyUsed') : t('admitOne')}
        </span>
      </div>
      <div className="ticket-info">
        <span className="tiny">{title}</span>
        <span className="ticket-seat">{seatLabel}</span>
        {ticket.seat_location && ticket.tier_name && (
          <span className="tiny muted">{ticket.tier_name}</span>
        )}
        <span className="meta-row">
          <Icon name="mapPin" size={14} />
          <span>{locale === 'km' ? venue?.name_km : venue?.name_en}</span>
        </span>
        <span className="meta-row">
          <Icon name="calendar" size={14} />
          <span>{dateTime(startsAt)}</span>
        </span>
        {used && (
          <span className="badge s-EXPIRED" style={{ alignSelf: 'flex-start' }}>
            {t('alreadyUsed')} · {dateTime(ticket.checked_in_at)}
          </span>
        )}
        {/* The booking reference is what a steward can look up by hand; the
            signed payload behind the QR is a bearer secret and is never shown. */}
        <span className="qr-token">{ticket.qr_token ?? ticket.booking_ref}</span>
      </div>
    </div>
  )
}
