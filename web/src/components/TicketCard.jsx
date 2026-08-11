import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import QrGlyph from './QrGlyph.jsx'

/**
 * One ticket = one admission unit. A seat line has exactly one; a GA line with
 * qty 3 renders three of these, each independently scannable.
 */
export default function TicketCard({ ticket, label, event, venue }) {
  const { t, locale, dateTime } = useLocale()
  const used = !!ticket.checked_in_at

  return (
    <div className={`ticket ${used ? 'used' : ''}`}>
      <div className="ticket-stub">
        <QrGlyph token={ticket.qr_token} label={`Ticket ${label}`} />
        <span className="tiny with-icon">
          <Icon name={used ? 'xCircle' : 'checkCircle'} size={12} />
          {used ? t('alreadyUsed') : t('admitOne')}
        </span>
      </div>
      <div className="ticket-info">
        <span className="tiny">{locale === 'km' ? event?.title_km : event?.title_en}</span>
        <span className="ticket-seat">{label}</span>
        <span className="meta-row">
          <Icon name="mapPin" size={14} />
          <span>{locale === 'km' ? venue?.name_km : venue?.name_en}</span>
        </span>
        <span className="meta-row">
          <Icon name="calendar" size={14} />
          <span>{dateTime(event?.starts_at)}</span>
        </span>
        {used && (
          <span className="badge s-EXPIRED" style={{ alignSelf: 'flex-start' }}>
            {t('alreadyUsed')} · {dateTime(ticket.checked_in_at)}
          </span>
        )}
        <span className="qr-token">{ticket.qr_token}</span>
      </div>
    </div>
  )
}
