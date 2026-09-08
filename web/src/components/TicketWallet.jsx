import { useState } from 'react'
import Icon from './Icon.jsx'
import QrGlyph from './QrGlyph.jsx'
import QrLightbox from './QrLightbox.jsx'
import TicketCard from './TicketCard.jsx'
import TicketQr from './TicketQr.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * A booking's tickets, with one of them made obviously the one to show.
 *
 * <p>Every ticket used to get an equal card, so a party of six arrived at the
 * door thumbing through six of them wondering which mattered. None of them does
 * individually: the gate resolves the whole booking from <em>any</em> code on
 * it, so one is enough and the other five are noise at exactly the moment
 * noise is expensive.
 *
 * <p>The rest stay one tap away rather than deleted. A guest travelling
 * separately genuinely needs their own QR on their own phone, and that is a
 * real case rather than an edge one.
 *
 * <p>This is deliberately <b>not</b> a "group QR" feature. No new token is
 * minted and nothing new is signed - it is the same per-ticket code the
 * customer always had, shown at the size the moment deserves. A token that
 * meant "admit six" would turn one forwarded screenshot into six admissions.
 */
export default function TicketWallet({ tickets, bookingRef, event, venue, labelFor }) {
  const { t, locale, dateTime } = useLocale()
  const km = locale === 'km'

  const [expanded, setExpanded] = useState(false)
  const [zoomed, setZoomed] = useState(false)

  const total = tickets.length
  const used = tickets.filter((x) => x.checked_in ?? !!x.checked_in_at).length
  const remaining = total - used

  // The first UNUSED one. Which it is does not matter to the gate, but showing
  // a spent code starts an argument at the door that the customer cannot win.
  const hero = tickets.find((x) => !(x.checked_in ?? !!x.checked_in_at)) ?? tickets[0]
  if (!hero) return null

  const isMock = Boolean(hero.qr_token)
  const heroLabel = labelFor?.(hero) ?? hero.seat_location ?? hero.tier_name ?? ''

  return (
    <div className="wallet">
      <div className="wallet-head">
        <span className="wallet-count">
          {used}/{total} {km ? 'បានចូល' : 'admitted'}
        </span>
      </div>

      {remaining === 0 ? (
        /* Nobody is left to admit, so a QR here would only invite a scan that
           comes back "already used". */
        <div className="wallet-done">
          <Icon name="checkCircle" size={26} />
          <b>{km ? 'អ្នកទាំងអស់បានចូលរួច' : 'Everyone on this booking is inside'}</b>
          <span className="small muted">
            {km ? 'សំបុត្រទាំងអស់ត្រូវបានប្រើ' : `All ${total} tickets have been used`}
          </span>
        </div>
      ) : (
        <div className="wallet-hero">
          <span className="wallet-hero-label">
            {km ? 'បង្ហាញកូដនេះនៅមាត់ទ្វារ' : 'Show this at the gate'}
          </span>

          <button
            type="button"
            className="wallet-hero-qr"
            onClick={() => setZoomed(true)}
            aria-label={km ? 'ពង្រីកកូដ QR' : 'Enlarge QR code for scanning'}
          >
            {isMock ? (
              <QrGlyph token={hero.qr_token} label={`Ticket ${heroLabel}`} />
            ) : (
              <TicketQr ticketId={hero.id} label={`Ticket ${heroLabel}`} size={320} />
            )}
          </button>

          <span className="wallet-ref">{bookingRef}</span>

          {/* The sentence that stops someone hunting for five more codes.
              Nothing on this screen used to say one was enough. */}
          <span className="wallet-opens">
            {total > 1
              ? km
                ? `កូដនេះបើកសំបុត្រទាំង ${total} · នៅសល់ ${remaining} នាក់`
                : `Opens all ${total} · ${remaining} still to enter`
              : heroLabel}
          </span>

          <span className="wallet-tap">
            <Icon name="qr" size={13} />
            {km ? 'ចុចដើម្បីពង្រីក' : 'Tap to enlarge'}
          </span>

          {/* Says the quiet part out loud: one code is the whole booking. */}
          {total > 1 && <p className="wallet-hint">{t('groupQrHint')}</p>}
        </div>
      )}

      {total > 1 && (
        <>
          <button
            type="button"
            className="wallet-toggle"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <Icon
              name="chevronRight"
              size={14}
              className={expanded ? 'wallet-chev open' : 'wallet-chev'}
            />
            {km ? `សំបុត្រទាំង ${total}` : `All ${total} tickets`}
          </button>

          {/* The old list, unchanged. A guest arriving separately needs their
              own code on their own phone. */}
          {expanded && (
            <div className="stack-sm wallet-all">
              {tickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  label={labelFor?.(ticket)}
                  event={event}
                  venue={venue}
                />
              ))}
            </div>
          )}
        </>
      )}

      <QrLightbox
        open={zoomed}
        onClose={() => setZoomed(false)}
        caption={bookingRef}
        subtitle={
          total > 1
            ? km
              ? `បើកសំបុត្រទាំង ${total}`
              : `Opens all ${total} tickets`
            : heroLabel
        }
      >
        {isMock ? (
          <QrGlyph token={hero.qr_token} label={`Ticket ${heroLabel}`} />
        ) : (
          <TicketQr ticketId={hero.id} label={`Ticket ${heroLabel}`} size={512} />
        )}
      </QrLightbox>

      {used > 0 && remaining > 0 && (
        <p className="tiny muted wallet-note">
          {km
            ? `មាន ${used} នាក់បានចូលរួចហើយ`
            : `${used} already went in${
                hero.checked_in_at ? ` · last at ${dateTime(hero.checked_in_at)}` : ''
              }`}
        </p>
      )}
    </div>
  )
}
