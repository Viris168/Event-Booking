import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Badge, Money, Progress, ResponsiveTable, Stat } from '../../components/ui.jsx'
import { EventSalesSkeleton } from '../../components/Skeleton.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { usd } from '../../lib/format.js'
import { getOrganizerEvents, getSeatClasses } from '../../api/events.js'
import { getVenue } from '../../api/venues.js'
import { getSeatAvailability, getZoneAvailability } from '../../api/availability.js'
import { getOrganizerTransactions } from '../../api/bookings.js'
import { getCheckInStats } from '../../api/tickets.js'
import { mapEvent, mapVenue, mapZone } from '../../api/adapters.js'

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

/**
 * One page of transactions is enough for the recent list and the state
 * breakdown at this dataset's size, and `total_elements` still gives the true
 * count regardless. If an event ever outgrows this, the page says so rather
 * than quietly reporting the first 200 as if they were all of them.
 */
const TX_PAGE = 200

/**
 * Aggregate the per-seat availability rows into one line per pricing tier.
 *
 * <p>Seats carry their own status, so sold and held are counted rather than
 * read off a column - and a tier with no seats assigned yet still gets a line,
 * because "you priced this and never filled it" is exactly what an organiser
 * needs to see here.
 */
function seatLines(seatClasses, seats) {
  const byClass = new Map()
  for (const s of seats) {
    const key = s.seatClassId ?? s.seat_class_id
    if (key == null) continue
    const e = byClass.get(key) || { capacity: 0, sold: 0, held: 0 }
    e.capacity += 1
    const status = String(s.status || '').toUpperCase()
    if (status === 'SOLD' || status === 'BOOKED') e.sold += 1
    else if (status === 'HELD') e.held += 1
    byClass.set(key, e)
  }
  return seatClasses.map((c) => {
    const agg = byClass.get(c.id) || { capacity: 0, sold: 0, held: 0 }
    return {
      kind: 'SEAT',
      id: c.id,
      name_en: c.name_en,
      name_km: c.name_km,
      price_usd_cents: c.price_usd_cents || 0,
      ...agg,
      revenue_usd_cents: agg.sold * (c.price_usd_cents || 0),
    }
  })
}

function zoneLines(zones) {
  return zones.map((z) => ({
    kind: 'ZONE',
    id: z.id,
    name_en: z.name_en,
    name_km: z.name_km,
    price_usd_cents: z.price_usd_cents || 0,
    capacity: z.capacity || 0,
    sold: z.sold_qty || 0,
    held: z.held_qty || 0,
    revenue_usd_cents: (z.sold_qty || 0) * (z.price_usd_cents || 0),
  }))
}

export default function EventSalesPage() {
  const { id } = useParams()
  const { t, locale, dateTime } = useLocale()

  const [event, setEvent] = useState(null)
  const [venue, setVenue] = useState(null)
  const [lines, setLines] = useState([])
  const [tx, setTx] = useState({ rows: [], total: 0 })
  const [doors, setDoors] = useState(null)
  const [status, setStatus] = useState('loading')
  // See SeatMapEditorPage: tracks which id the state describes, so switching
  // events shows a spinner without setting state from the effect body.
  const [loadedId, setLoadedId] = useState(null)

  useEffect(() => {
    let live = true

    // The organiser's own list, not GET /events/{id}: that one 404s for
    // anything not publicly visible - deliberately, so nobody can walk
    // sequential ids to read drafts - and it has no owner bypass. An organiser
    // opening sales for their own DRAFT would have been told it does not exist.
    getOrganizerEvents()
      .then(async (list) => {
        if (!live) return
        const rows = list?.content ?? list ?? []
        const raw = rows.find((e) => String(e.id) === String(id))
        if (!raw) throw new Error('not found')
        const ev = mapEvent(raw)
        setEvent(ev)

        // Everything below is optional detail: a page that 500s because the
        // door stats endpoint hiccuped would hide the sales figures, which are
        // the reason anyone opened it. Each falls back to empty on its own.
        const [venueRes, zonesRes, classesRes, seatsRes, txRes, doorsRes] = await Promise.all([
          // EventResponse already embeds its venue; only go and fetch one if a
          // response ever arrives without it. The event list is the source
          // here and it always carries the object, so this is normally free.
          ev.venue ? Promise.resolve(ev.venue) : ev.venue_id ? getVenue(ev.venue_id).catch(() => null) : Promise.resolve(null),
          getZoneAvailability(id).catch(() => []),
          getSeatClasses(id).catch(() => []),
          getSeatAvailability(id).catch(() => []),
          getOrganizerTransactions({ eventId: id, size: TX_PAGE }).catch(() => null),
          getCheckInStats(id).catch(() => null),
        ])
        if (!live) return

        setVenue(mapVenue(venueRes))

        const zones = (zonesRes?.content ?? zonesRes ?? []).map(mapZone).filter(Boolean)
        const classes = (classesRes?.content ?? classesRes ?? []).map((c) => ({
          id: c.id,
          name_en: c.name_en ?? c.nameEn,
          name_km: c.name_km ?? c.nameKm,
          price_usd_cents: c.price_usd_cents ?? c.priceUsdCents ?? 0,
        }))
        const seats = seatsRes?.content ?? seatsRes ?? []
        setLines([...seatLines(classes, seats), ...zoneLines(zones)])

        setTx({
          rows: txRes?.content ?? [],
          total: txRes?.total_elements ?? txRes?.totalElements ?? (txRes?.content?.length ?? 0),
        })
        setDoors(doorsRes)
        setStatus('ready')
        setLoadedId(id)
      })
      .catch(() => {
        if (!live) return
        setStatus('missing')
        setLoadedId(id)
      })

    return () => {
      live = false
    }
  }, [id])

  const totals = useMemo(() => {
    const revenue = lines.reduce((n, l) => n + l.revenue_usd_cents, 0)
    return {
      revenue,
      sold: lines.reduce((n, l) => n + l.sold, 0),
      capacity: lines.reduce((n, l) => n + l.capacity, 0),
    }
  }, [lines])

  const stateCounts = useMemo(() => {
    const counts = {}
    for (const r of tx.rows) {
      const s = r.state ?? r.status
      if (s) counts[s] = (counts[s] || 0) + 1
    }
    return counts
  }, [tx.rows])

  if (status === 'loading' || loadedId !== id) {
    return <EventSalesSkeleton />
  }

  if (status === 'missing' || !event) {
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

  const partial = tx.rows.length < tx.total

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
            {locale === 'km' ? event.title_km : event.title_en}
            {venue ? ` · ${locale === 'km' ? venue.name_km : venue.name_en}` : ''} ·{' '}
            {dateTime(event.starts_at)}
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
          value={usd(totals.revenue)}
          sub={<Money cents={totals.revenue} />}
        />
        <Stat
          icon="ticket"
          label={t('ticketsSold')}
          value={totals.sold.toLocaleString()}
          sub={`${t('capacity')} ${totals.capacity.toLocaleString()} · ${
            totals.capacity ? Math.round((totals.sold / totals.capacity) * 100) : 0
          }%`}
        />
        <Stat
          icon="scan"
          label={t('checkIn')}
          value={(doors?.checkedIn ?? doors?.checked_in ?? 0).toLocaleString()}
          sub={locale === 'km' ? 'បានស្កេន' : 'scanned'}
        />
        <Stat
          icon="chart"
          label={locale === 'km' ? 'ការកក់' : 'Bookings'}
          value={tx.total.toLocaleString()}
          sub={`${stateCounts.CONFIRMED || 0} ${t('status').toLowerCase()}: CONFIRMED`}
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
                {lines.map((line) => (
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
                {!lines.length && (
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
              {STATES.filter((s) => stateCounts[s]).map((s) => (
                <div className="spread" key={s}>
                  <Badge status={s} />
                  <span className="font-bold">{stateCounts[s]}</span>
                </div>
              ))}
              {!Object.keys(stateCounts).length && (
                <p className="muted small">{locale === 'km' ? 'គ្មានការកក់' : 'No bookings yet.'}</p>
              )}
              {partial && (
                <p className="hint">
                  {locale === 'km'
                    ? `រាប់ពី ${tx.rows.length} ក្នុងចំណោម ${tx.total} ការកក់ថ្មីបំផុត`
                    : `Counted from the ${tx.rows.length} most recent of ${tx.total} bookings.`}
                </p>
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
                  {tx.rows.slice(0, 8).map((b) => (
                    <tr key={b.bookingId ?? b.booking_id}>
                      <td>
                        <Link className="mono small" to={`/bookings/${b.bookingId ?? b.booking_id}`}>
                          {b.bookingRef ?? b.booking_ref}
                        </Link>
                        <div className="small muted">{b.buyerName ?? b.buyer_name}</div>
                      </td>
                      <td>
                        <Badge status={b.state} />
                      </td>
                      <td className="num font-bold">{usd(b.totalUsdCents ?? b.total_usd_cents)}</td>
                    </tr>
                  ))}
                  {!tx.rows.length && (
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
