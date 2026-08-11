import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Money, Progress, ResponsiveTable, Stat } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import { getVenue, listBookings, salesSummary, useStore } from '../../mock/store.js'

const STATES = [
  'PENDING_PAYMENT',
  'AWAITING_CONFIRMATION',
  'PAYMENT_FAILED',
  'CONFIRMED',
  'REFUND_REQUESTED',
  'REFUNDED',
  'EXPIRED',
  'CANCELLED',
]

export default function EventSalesPage() {
  const { id } = useParams()
  useStore()
  const { t, locale, dateTime } = useLocale()

  const summary = salesSummary(id)
  const event = summary.event

  if (!event) {
    return (
      <div className="container">
        <Alert tone="danger" title="Event not found">
          <Link to="/organizer" className="with-icon">
            <Icon name="arrowLeft" size={15} />
            {t('myEvents')}
          </Link>
        </Alert>
      </div>
    )
  }

  const venue = getVenue(event.venue_id)
  const bookings = listBookings({ eventId: event.id })

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/organizer">{t('myEvents')}</Link> /{' '}
        {locale === 'km' ? event.title_km : event.title_en}
      </div>

      <div className="page-head">
        <div>
          <h1>{t('sales')}</h1>
          <p>
            {locale === 'km' ? event.title_km : event.title_en} ·{' '}
            {locale === 'km' ? venue?.name_km : venue?.name_en} · {dateTime(event.starts_at)}
          </p>
        </div>
        <div className="row">
          <Badge status={event.status} />
          <Link className="btn btn-sm btn-outline" to={`/organizer/events/${event.id}/edit`}>
            {t('editEvent')}
          </Link>
          <Link className="btn btn-sm btn-ghost" to={`/events/${event.id}`}>
            {locale === 'km' ? 'មើលទំព័រសាធារណៈ' : 'View public page'}
          </Link>
        </div>
      </div>

      <div className="stats" style={{ marginBottom: '1.4rem' }}>
        <Stat
          icon="wallet"
          tone="green"
          label={t('revenue')}
          value={usd(summary.revenue_usd_cents)}
          sub={<Money cents={summary.revenue_usd_cents} />}
        />
        <Stat
          icon="ticket"
          label={t('ticketsSold')}
          value={summary.sold.toLocaleString()}
          sub={`${t('capacity')} ${summary.capacity.toLocaleString()} · ${
            summary.capacity ? Math.round((summary.sold / summary.capacity) * 100) : 0
          }%`}
        />
        <Stat icon="scan" label={t('checkIn')} value={summary.checkedIn.toLocaleString()} sub={locale === 'km' ? 'បានស្កេន' : 'scanned'} />
        <Stat
          icon="chart"
          label={locale === 'km' ? 'ការកក់' : 'Bookings'}
          value={bookings.length}
          sub={`${summary.stateCounts.CONFIRMED || 0} ${t('status').toLowerCase()}: CONFIRMED`}
        />
      </div>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h2>{locale === 'km' ? 'តាមតំបន់ និងតម្លៃ' : 'By seat class & zone'}</h2>
          </div>
          <ResponsiveTable>
            <table className="table">
              <thead>
                <tr>
                  <th>{locale === 'km' ? 'ឈ្មោះ' : 'Tier'}</th>
                  <th>Type</th>
                  <th className="num">{locale === 'km' ? 'តម្លៃ' : 'Price'}</th>
                  <th className="num">{t('ticketsSold')}</th>
                  <th style={{ minWidth: 140 }}>{t('capacity')}</th>
                  <th className="num">{t('revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.lines.map((line) => (
                  <tr key={`${line.kind}-${line.id}`}>
                    <td>
                      <div className="font-bold">{locale === 'km' ? line.name_km : line.name_en}</div>
                      <div className={locale === 'km' ? 'small muted' : 'small muted km'}>
                        {locale === 'km' ? line.name_en : line.name_km}
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-mode">{line.kind === 'SEAT' ? 'Seated' : 'GA'}</span>
                    </td>
                    <td className="num">{usd(line.price_usd_cents)}</td>
                    <td className="num font-bold">
                      {line.sold}
                      {line.held ? <span className="muted"> +{line.held}</span> : null}
                    </td>
                    <td>
                      <div className="small muted">
                        {line.sold} / {line.capacity}
                      </div>
                      <Progress sold={line.sold} held={line.held} capacity={line.capacity} />
                    </td>
                    <td className="num font-bold">{usd(line.revenue_usd_cents)}</td>
                  </tr>
                ))}
                {!summary.lines.length && (
                  <tr>
                    <td colSpan="6" className="muted small">
                      {locale === 'km' ? 'មិនទាន់មានតម្លៃ' : 'No pricing tiers configured yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
</ResponsiveTable>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>{locale === 'km' ? 'ស្ថានភាពការកក់' : 'Booking states'}</h3>
            </div>
            <div className="panel-body stack-sm">
              {STATES.filter((s) => summary.stateCounts[s]).map((s) => (
                <div className="spread" key={s}>
                  <Badge status={s} />
                  <span className="font-bold">{summary.stateCounts[s]}</span>
                </div>
              ))}
              {!Object.keys(summary.stateCounts).length && (
                <p className="muted small">{locale === 'km' ? 'គ្មានការកក់' : 'No bookings yet.'}</p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>{locale === 'km' ? 'ការកក់ថ្មីៗ' : 'Recent bookings'}</h3>
            </div>
            <ResponsiveTable>
              <table className="table" style={{ minWidth: 0 }}>
                <tbody>
                  {bookings.slice(0, 8).map((b) => (
                    <tr key={b.id}>
                      <td>
                        <Link className="mono small" to={`/bookings/${b.id}`}>
                          {b.booking_ref}
                        </Link>
                        <div className="small muted">{b.buyer_name}</div>
                      </td>
                      <td>
                        <Badge status={b.state} />
                      </td>
                      <td className="num font-bold">{usd(b.total_usd_cents)}</td>
                    </tr>
                  ))}
                  {!bookings.length && (
                    <tr>
                      <td className="muted small">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
</ResponsiveTable>
          </div>
        </div>
      </div>
    </div>
  )
}
