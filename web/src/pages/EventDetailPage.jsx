import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import HoldBar from '../components/HoldBar.jsx'
import Icon, { CATEGORY_ICON } from '../components/Icon.jsx'
import SeatMap from '../components/SeatMap.jsx'
import ZonePicker from '../components/ZonePicker.jsx'
import { Alert, Badge, BiTitle, Money, Progress } from '../components/ui.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { seatLabel, usd } from '../lib/format.js'
import {
  createHold,
  eventSeatsOf,
  extendHold,
  getActiveHold,
  getEvent,
  getHold,
  getVenue,
  holdContents,
  inventorySummary,
  provinceName,
  releaseHold,
  seatClassesOf,
  useStore,
  zonesOf,
} from '../mock/store.js'

export default function EventDetailPage() {
  const { id } = useParams()
  useStore()
  const { t, locale, dateTime, date, time } = useLocale()
  const { isAuthenticated, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [selectedSeats, setSelectedSeats] = useState([])
  const [zoneQty, setZoneQty] = useState({})
  const [reserving, setReserving] = useState(false)
  const [expiredNotice, setExpiredNotice] = useState(false)
  const [conflictHoldId, setConflictHoldId] = useState(null)

  const event = getEvent(id)
  const venue = event ? getVenue(event.venue_id) : null
  const classes = event ? seatClassesOf(event.id) : []
  const zones = event ? zonesOf(event.id) : []
  const seats = event ? eventSeatsOf(event.id) : []
  const hold = event && isAuthenticated ? getActiveHold(event.id, user.id) : null
  const summary = event ? inventorySummary(event.id) : null

  // A hold that vanishes while the page is open expired — say so, don't fail silently.
  const lastHoldId = useRef(hold?.id || null)
  useEffect(() => {
    if (hold?.id) {
      lastHoldId.current = hold.id
      setExpiredNotice(false)
      return
    }
    if (lastHoldId.current) {
      const previous = getHold(lastHoldId.current)
      if (previous?.status === 'EXPIRED') {
        setExpiredNotice(true)
        setSelectedSeats([])
        setZoneQty({})
      }
      lastHoldId.current = null
    }
  }, [hold?.id])

  const held = hold ? holdContents(hold.id) : null

  const selectionTotal = useMemo(() => {
    const seatTotal = selectedSeats.reduce((sum, seatId) => {
      const seat = seats.find((s) => s.id === seatId)
      const cls = classes.find((c) => c.id === seat?.seat_class_id)
      return sum + (cls?.price_usd_cents || 0)
    }, 0)
    const zoneTotal = Object.entries(zoneQty).reduce((sum, [zoneId, qty]) => {
      const zone = zones.find((z) => z.id === Number(zoneId))
      return sum + (zone?.price_usd_cents || 0) * qty
    }, 0)
    return seatTotal + zoneTotal
  }, [selectedSeats, zoneQty, seats, classes, zones])

  if (!event) {
    return (
      <div className="container">
        <Alert tone="danger" title="Event not found">
          <Link to="/events" className="with-icon">
            <Icon name="arrowLeft" size={15} />
            {t('events')}
          </Link>
        </Alert>
      </div>
    )
  }

  const showSeats = ['SEATED', 'MIXED'].includes(event.inventory_mode) && seats.length > 0
  const showZones = ['ZONED', 'MIXED'].includes(event.inventory_mode) && zones.length > 0
  const hasSelection = selectedSeats.length > 0 || Object.values(zoneQty).some((q) => q > 0)

  function toggleSeat(seat) {
    if (hold) return
    setSelectedSeats((prev) =>
      prev.includes(seat.id) ? prev.filter((s) => s !== seat.id) : [...prev, seat.id],
    )
  }

  function onReserve() {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/events/${event.id}` } })
      return
    }
    if (reserving) return
    setReserving(true) // disabled immediately: never allow a double submit
    const result = createHold({
      eventId: event.id,
      userId: user.id,
      seatIds: selectedSeats,
      zoneQty,
    })
    setReserving(false)

    if (result.error === 'HOLD_ALREADY_ACTIVE') {
      setConflictHoldId(result.hold.id)
      return
    }
    if (result.error === 'SEAT_UNAVAILABLE') {
      toast(
        locale === 'km'
          ? 'កៅអីមួយចំនួនត្រូវបានកក់ដោយអ្នកផ្សេងទៅហើយ។'
          : 'Someone took one of those seats first — your selection was cleared.',
        'error',
      )
      setSelectedSeats([])
      return
    }
    if (result.error === 'ZONE_CAPACITY') {
      toast(
        locale === 'km' ? 'កន្លែងនៅសល់មិនគ្រប់គ្រាន់ទេ។' : 'Not enough GA capacity left for that quantity.',
        'error',
      )
      return
    }
    if (result.error) {
      toast(`Could not reserve (${result.error})`, 'error')
      return
    }
    setSelectedSeats([])
    setZoneQty({})
    toast(locale === 'km' ? 'កៅអីត្រូវបានកក់ទុក ១០ នាទី។' : 'Held for 10 minutes — finish checkout to keep them.', 'success')
  }

  function onExtend() {
    const result = extendHold(hold.id)
    if (result.error) toast(t('extended'), 'info')
  }

  function onRelease() {
    releaseHold(hold.id)
    toast(locale === 'km' ? 'បានលែងកៅអីវិញ។' : 'Hold released.', 'info')
  }

  // Seats belonging to our own hold read as "selected", not as "held by others".
  const ownHeldSeatIds = hold ? seats.filter((s) => s.hold_id === hold.id).map((s) => s.id) : []
  const mapSelected = hold ? ownHeldSeatIds : selectedSeats

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/events">{t('events')}</Link> / {locale === 'km' ? event.title_km : event.title_en}
      </div>

      <div className={`event-hero cover-${event.cover}`}>
        <Icon
          name={CATEGORY_ICON[event.category] || 'ticket'}
          size={76}
          strokeWidth={1.2}
          className="hero-cat"
        />
        <div className="row row-tight">
          <span className="badge badge-solid badge-mode">
            <Icon name={event.inventory_mode === 'ZONED' ? 'users' : 'seat'} size={12} />
            {event.inventory_mode}
          </span>
          {event.status !== 'PUBLISHED' && <Badge status={event.status} className="badge-solid" />}
        </div>
        <BiTitle record={event} field="title" />
        <div className="small with-icon" style={{ color: 'rgba(255,255,255,0.9)' }}>
          <Icon name="mapPin" size={15} />
          <span>
            {locale === 'km' ? venue?.name_km : venue?.name_en} · {venue?.street_address},{' '}
            {venue?.sangkat_commune}, {venue?.khan_district},{' '}
            {provinceName(venue?.province_code, locale)}
          </span>
        </div>
      </div>

      {expiredNotice && (
        <div style={{ marginTop: '1rem' }}>
          <Alert
            tone="warn"
            title={locale === 'km' ? 'ការកក់ផុតកំណត់' : 'Hold expired'}
            actions={
              <button className="btn btn-sm btn-outline" onClick={() => setExpiredNotice(false)}>
                {locale === 'km' ? 'យល់ព្រម' : 'Got it'}
              </button>
            }
          >
            {t('holdExpired')}
          </Alert>
        </div>
      )}

      {conflictHoldId && (
        <div style={{ marginTop: '1rem' }}>
          <Alert
            tone="info"
            title={t('holdAlreadyActive')}
            actions={
              <>
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setConflictHoldId(null)
                    document.getElementById('hold-summary')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                >
                  {t('resumeHold')}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setConflictHoldId(null)}>
                  {t('cancel')}
                </button>
              </>
            }
          >
            {locale === 'km'
              ? 'អ្នកអាចមានការកក់សកម្មតែមួយក្នុងមួយព្រឹត្តិការណ៍។'
              : 'You can only hold one set of tickets per event at a time.'}
          </Alert>
        </div>
      )}

      {hold && (
        <div style={{ marginTop: '1rem' }}>
          <HoldBar
            hold={hold}
            onExtend={onExtend}
            onRelease={onRelease}
            checkoutTo={`/checkout?hold=${hold.id}`}
          />
        </div>
      )}

      <div className="split" style={{ marginTop: '1.4rem' }}>
        <div className="stack">
          <div className="panel">
            <div className="panel-body">
              <div className="event-facts">
                <div className="fact">
                  <div className="tiny">{t('doorsOpen')}</div>
                  <b>{time(event.doors_open_at)}</b>
                </div>
                <div className="fact">
                  <div className="tiny">{t('starts')}</div>
                  <b>{dateTime(event.starts_at)}</b>
                </div>
                <div className="fact">
                  <div className="tiny">{t('salesClose')}</div>
                  <b>{date(event.sales_close_at)}</b>
                </div>
                <div className="fact">
                  <div className="tiny">{t('from_price')}</div>
                  <b>
                    <Money
                      cents={
                        [...classes, ...zones].length
                          ? Math.min(...[...classes, ...zones].map((x) => x.price_usd_cents))
                          : 0
                      }
                    />
                  </b>
                </div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('about')}</h2>
            </div>
            <div className="panel-body stack-sm">
              <p>{locale === 'km' ? event.description_km : event.description_en}</p>
              <p className={locale === 'km' ? 'small muted' : 'small muted km'}>
                {locale === 'km' ? event.description_en : event.description_km}
              </p>
            </div>
          </div>

          {showSeats && (
            <div className="panel">
              <div className="panel-head">
                <h2>{t('pickSeats')}</h2>
                <span className="small muted">
                  {summary.remaining} / {summary.capacity} {t('available').toLowerCase()}
                </span>
              </div>
              <div className="panel-body">
                <SeatMap
                  seats={seats}
                  seatClasses={classes}
                  selected={mapSelected}
                  onToggle={toggleSeat}
                  disabled={!!hold}
                />
                {hold && (
                  <p className="hint" style={{ marginTop: '0.7rem' }}>
                    {locale === 'km'
                      ? 'ការជ្រើសរើសត្រូវបានចាក់សោនៅពេលកក់។ សូមលែងវិញ ដើម្បីជ្រើសម្តងទៀត។'
                      : 'Your selection is locked while the hold is live. Release it to pick different seats.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {showZones && (
            <div className="panel">
              <div className="panel-head">
                <h2>{t('pickZones')}</h2>
              </div>
              <div className="panel-body">
                <ZonePicker
                  zones={zones}
                  qty={hold ? Object.fromEntries((held?.zoneLines || []).map((l) => [l.event_zone_id, l.qty])) : zoneQty}
                  onChange={(zoneId, qty) => setZoneQty((prev) => ({ ...prev, [zoneId]: qty }))}
                  disabled={!!hold}
                />
              </div>
            </div>
          )}
        </div>

        {/* ------------------------------------------------- selection panel */}
        <div className="summary" id="hold-summary">
          <div className="panel">
            <div className="panel-head">
              <h3>{hold ? t('holdActive') : t('yourSelection')}</h3>
            </div>
            <div className="panel-body">
              {hold ? (
                <>
                  <div className="stack-sm">
                    {held.seats.map((s) => (
                      <div className="line" key={s.id}>
                        <span>
                          <span className="line-title">{seatLabel(s)}</span>
                          <div className="line-sub">
                            {locale === 'km' ? s.seat_class?.name_km : s.seat_class?.name_en}
                          </div>
                        </span>
                        <span>{usd(s.seat_class?.price_usd_cents)}</span>
                      </div>
                    ))}
                    {held.zoneLines.map((l) => (
                      <div className="line" key={l.id}>
                        <span>
                          <span className="line-title">
                            {locale === 'km' ? l.zone?.name_km : l.zone?.name_en}
                          </span>
                          <div className="line-sub">
                            {l.qty} × {usd(l.zone?.price_usd_cents)}
                          </div>
                        </span>
                        <span>{usd(l.qty * (l.zone?.price_usd_cents || 0))}</span>
                      </div>
                    ))}
                  </div>
                  <div className="totals">
                    <div className="total-row big">
                      <span>{t('total')}</span>
                      <b>{usd(held.subtotalUsdCents)}</b>
                    </div>
                    <div className="total-row">
                      <span className="small muted">KHR</span>
                      <Money cents={held.subtotalUsdCents} className="total-khr" />
                    </div>
                  </div>
                  <Link
                    className="btn btn-accent btn-lg btn-block"
                    to={`/checkout?hold=${hold.id}`}
                    style={{ marginTop: '0.9rem' }}
                  >
                    {t('goToCheckout')}
                    <Icon name="arrowRight" size={16} />
                  </Link>
                  <p className="hint text-center" style={{ marginTop: '0.5rem' }}>
                    <Icon name="clock" size={13} /> {t('notYoursYet')}
                  </p>
                </>
              ) : (
                <>
                  {hasSelection ? (
                    <div className="stack-sm">
                      {selectedSeats.map((seatId) => {
                        const seat = seats.find((s) => s.id === seatId)
                        const cls = classes.find((c) => c.id === seat.seat_class_id)
                        return (
                          <div className="line" key={seatId}>
                            <span>
                              <span className="line-title">{seatLabel(seat)}</span>
                              <div className="line-sub">{locale === 'km' ? cls?.name_km : cls?.name_en}</div>
                            </span>
                            <span>{usd(cls?.price_usd_cents)}</span>
                          </div>
                        )
                      })}
                      {Object.entries(zoneQty)
                        .filter(([, qty]) => qty > 0)
                        .map(([zoneId, qty]) => {
                          const zone = zones.find((z) => z.id === Number(zoneId))
                          return (
                            <div className="line" key={zoneId}>
                              <span>
                                <span className="line-title">
                                  {locale === 'km' ? zone.name_km : zone.name_en}
                                </span>
                                <div className="line-sub">
                                  {qty} × {usd(zone.price_usd_cents)}
                                </div>
                              </span>
                              <span>{usd(qty * zone.price_usd_cents)}</span>
                            </div>
                          )
                        })}
                    </div>
                  ) : (
                    <p className="muted small">{t('nothingSelected')}</p>
                  )}

                  <div className="totals">
                    <div className="total-row big">
                      <span>{t('subtotal')}</span>
                      <b>{usd(selectionTotal)}</b>
                    </div>
                    <div className="total-row">
                      <span className="small muted">KHR</span>
                      <Money cents={selectionTotal} className="total-khr" />
                    </div>
                  </div>

                  <button
                    className="btn btn-primary btn-lg btn-block"
                    style={{ marginTop: '0.9rem' }}
                    disabled={!hasSelection || reserving}
                    onClick={onReserve}
                  >
                    {reserving ? t('reserving') : `${t('reserve')} · 10:00`}
                  </button>
                  <p className="hint text-center" style={{ marginTop: '0.5rem' }}>
                    {locale === 'km'
                      ? 'ការកក់ទុករយៈពេល ១០ នាទី។ សំបុត្រជារបស់អ្នកបន្ទាប់ពីបង់ប្រាក់ជោគជ័យ។'
                      : 'Reserving holds them for 10 minutes. They are only yours once payment clears.'}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="panel" style={{ marginTop: '1rem' }}>
            <div className="panel-body stack-sm">
              <div className="spread">
                <span className="tiny">{t('capacity')}</span>
                <span className="small font-bold">
                  {summary.sold} / {summary.capacity}
                </span>
              </div>
              <Progress sold={summary.sold} held={summary.held} capacity={summary.capacity} />
              <div className="legend small">
                <span>
                  <i className="swatch bg-brand-500" />
                  {t('sold')}
                </span>
                <span>
                  <i className="swatch bg-gold-500" />
                  {t('heldByOthers')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
