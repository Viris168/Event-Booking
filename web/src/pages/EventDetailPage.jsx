import { useDocumentTitle } from '../lib/useDocumentTitle.js'
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
import { getEvent } from '../api/events.js'
import { getSeatMap, getZoneAvailability } from '../api/availability.js'
import { createHold, releaseHold, getHold } from '../api/holds.js'
import { mapEvent, mapSeatMap, mapZone, mapHoldResponse } from '../api/adapters.js'

export default function EventDetailPage() {
  const { id } = useParams()
  const { t, locale, dateTime, date, time } = useLocale()
  const { isAuthenticated, user } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [selectedSeats, setSelectedSeats] = useState([])
  const [zoneQty, setZoneQty] = useState({})
  const [reserving, setReserving] = useState(false)
  const [expiredNotice, setExpiredNotice] = useState(false)
  const [conflictHoldId, setConflictHoldId] = useState(null)

  const [apiEvent, setApiEvent] = useState(null)
  const [apiSeats, setApiSeats] = useState([])
  const [apiZones, setApiZones] = useState([])
  const [apiHoldData, setApiHoldData] = useState(null)

  useEffect(() => {
    let active = true
    if (!id) return
    
    // Fetch Event
    getEvent(id)
      .then((res) => {
        if (active && res) setApiEvent(mapEvent(res))
      })
      .catch((e) => console.error(e))

    // Fetch Seats
    getSeatMap(id)
      .then((res) => {
        if (active && res) {
          const mapped = mapSeatMap(res)
          setApiSeats(mapped.seats)
        }
      })
      .catch((e) => console.error(e))

    // Fetch Zones
    getZoneAvailability(id)
      .then((res) => {
        if (active && Array.isArray(res)) setApiZones(res.map(mapZone))
      })
      .catch((e) => console.error(e))
      
    // Fetch active hold if in session
    const storedHoldId = sessionStorage.getItem(`activeHoldId_${id}`)
    if (storedHoldId && user?.id) {
      getHold(id, storedHoldId, user.id)
        .then((res) => {
          if (active && res) {
            if (res.status === 'EXPIRED') {
              sessionStorage.removeItem(`activeHoldId_${id}`)
              setExpiredNotice(true)
            } else {
              setApiHoldData(mapHoldResponse(res))
            }
          }
        })
        .catch((e) => console.error(e))
    }

    return () => { active = false }
  }, [id, user?.id])

  const event = apiEvent
  const venue = event?.venue
  const classes = event?.seat_classes || []
  const zones = apiZones || []
  const seats = apiSeats || []
  const hold = apiHoldData?.hold
  const held = apiHoldData
  
  // Calculate inventory summary
  const summary = event ? {
    capacity: event.totalCapacity ?? 0,
    sold: event.totalSold ?? 0,
    held: event.totalHeld ?? 0,
    remaining: (event.totalCapacity ?? 0) - (event.totalSold ?? 0) - (event.totalHeld ?? 0)
  } : { capacity: 0, sold: 0, held: 0, remaining: 0 }

  useDocumentTitle(event ? (locale === 'km' ? event.title_km : event.title_en) : null)

  const unifiedZones = useMemo(() => {
    const list = []
    if (classes) {
      classes.forEach(c => list.push({
        id: `class-${c.id}`,
        key: locale === 'km' ? c.name_km : c.name_en,
        kind: 'seated',
        price_usd_cents: c.price_usd_cents,
        refId: c.id
      }))
    }
    if (zones) {
      zones.forEach(z => list.push({
        id: `zone-${z.id}`,
        key: locale === 'km' ? z.name_km : z.name_en,
        kind: 'ga',
        price_usd_cents: z.price_usd_cents,
        refId: z.id
      }))
    }
    return list
  }, [classes, zones, locale])

  const [activeZoneId, setActiveZoneId] = useState(unifiedZones.length > 0 ? unifiedZones[0].id : null)

  useEffect(() => {
    if (unifiedZones.length > 0 && !unifiedZones.find(z => z.id === activeZoneId)) {
      setActiveZoneId(unifiedZones[0].id)
    }
  }, [unifiedZones, activeZoneId])

  // Optional: A hold might vanish while page is open if we were using WebSockets.
  // For now, it only updates on refresh or extension.

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
    setReserving(true)

    createHold(event.id, { 
      seat_ids: selectedSeats, 
      seatIds: selectedSeats, 
      zone_qty: zoneQty, 
      zoneQty: zoneQty 
    }, user.id)
      .then((res) => {
        sessionStorage.setItem(`activeHoldId_${event.id}`, res.id)
        setApiHoldData(mapHoldResponse(res))
        setSelectedSeats([])
        setZoneQty({})
        toast(locale === 'km' ? 'កៅអីត្រូវបានកក់ទុក។' : 'Held successfully — finish checkout to keep them.', 'success')
      })
      .catch((err) => {
        const error = err.response?.data?.message || err.message
        if (err.response?.status === 409) {
          toast(
            locale === 'km'
              ? 'កៅអីមួយចំនួនត្រូវបានកក់ដោយអ្នកផ្សេងទៅហើយ។'
              : 'Someone took one of those seats first — your selection was cleared.',
            'error',
          )
          setSelectedSeats([])
        } else {
          toast(`Could not reserve (${error})`, 'error')
        }
      })
      .finally(() => {
        setReserving(false)
      })
  }

  function onExtend() {
    // Optional: Call real extend endpoint here if it existed.
    toast(t('extended'), 'info')
  }

  function onRelease() {
    if (!hold) return
    releaseHold(event.id, hold.id, user.id).then(() => {
      sessionStorage.removeItem(`activeHoldId_${event.id}`)
      setApiHoldData(null)
      toast(locale === 'km' ? 'បានលែងកៅអីវិញ។' : 'Hold released.', 'info')
    }).catch((err) => {
      toast(`Could not release hold`, 'error')
    })
  }

  // Seats belonging to our own hold read as "selected", not as "held by others".
  const ownHeldSeatIds = hold ? seats.filter((s) => s.hold_id === hold.id).map((s) => s.id) : []
  const mapSelected = hold ? ownHeldSeatIds : selectedSeats

  function countForUnifiedZone(zone) {
    if (zone.kind === 'ga') return zoneQty[zone.refId] || 0
    const selectedInClass = selectedSeats.filter(seatId => {
      const s = seats.find(s => s.id === seatId)
      return s?.seat_class_id === zone.refId
    })
    return selectedInClass.length
  }

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/events">{t('events')}</Link> / {locale === 'km' ? event.title_km : event.title_en}
      </div>

      <div className={`event-hero cover-${event.cover || 1}`}>
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
            {locale === 'km' ? venue?.nameKm : venue?.nameEn} · {venue?.streetAddress},{' '}
            {venue?.sangkatCommune}, {venue?.khanDistrict},{' '}
            {venue?.provinceCode}
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
            checkoutTo={`/checkout?event=${event.id}&hold=${hold.id}`}
          />
        </div>
      )}

      <div className="split" style={{ marginTop: '1.4rem' }}>
        <div className="stack">
          <div className="card">
            <div className="card-body">
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

          <div className="card">
            <div className="card-head">
              <h2>{t('about')}</h2>
            </div>
            <div className="card-body stack-sm">
              <p>{locale === 'km' ? event.description_km : event.description_en}</p>
              <p className={locale === 'km' ? 'small muted' : 'small muted km'}>
                {locale === 'km' ? event.description_en : event.description_km}
              </p>
            </div>
          </div>

          {(showSeats || showZones) && (
            <div className="card">
              <div className="card-head">
                <h2>{t('pickSeats')}</h2>
                <span className="sub">
                  {summary.remaining} / {summary.capacity} {t('available').toLowerCase()}
                </span>
              </div>
              <div className="card-body">
                <div className="zone-radios">
                  {unifiedZones.map(z => {
                    const count = countForUnifiedZone(z)
                    const kind = z.kind === 'ga' ? (locale === 'km' ? 'ទីលានឈរ' : 'General admission') : (locale === 'km' ? 'កៅអីអង្គុយ' : 'Assigned seats')
                    return (
                      <label key={z.id} className={`zone-radio ${activeZoneId === z.id ? 'active' : ''}`}>
                        <input 
                          type="radio" 
                          name="zone" 
                          value={z.id} 
                          checked={activeZoneId === z.id} 
                          onChange={() => setActiveZoneId(z.id)} 
                        />
                        <span className="zr-body">
                          <span className="zr-name">{z.key}</span>
                          <span className="zr-meta">{kind} · {usd(z.price_usd_cents)} {t('each')}</span>
                        </span>
                        <span className={`z-count ${count === 0 ? 'zero' : ''}`}>{count}</span>
                      </label>
                    )
                  })}
                </div>
                
                {(() => {
                  const activeZone = unifiedZones.find(z => z.id === activeZoneId)
                  if (!activeZone) return null
                  
                  if (activeZone.kind === 'ga') {
                    const gaZone = zones.find(z => z.id === activeZone.refId)
                    return (
                      <div className="mt-4 border-t border-line-2 pt-4">
                        <ZonePicker
                          zones={[gaZone]}
                          qty={hold ? Object.fromEntries((held?.zoneLines || []).map((l) => [l.event_zone_id, l.qty])) : zoneQty}
                          onChange={(zoneId, qty) => setZoneQty((prev) => ({ ...prev, [zoneId]: qty }))}
                          disabled={!!hold}
                        />
                      </div>
                    )
                  } else {
                    const activeSeats = seats.filter(s => s.seat_class_id === activeZone.refId)
                    return (
                      <div className="mt-4 border-t border-line-2 pt-4">
                        <div className="mb-4 text-[13px] text-muted">
                          {locale === 'km' 
                            ? 'លេខកៅអីចាប់ផ្តើមពីលេខ 1 ក្នុងគ្រប់តំបន់ — ជ្រើសរើសក្នុងតំបន់នេះ បន្ទាប់មកប្តូរតំបន់ដោយប្រើប៊ូតុងខាងលើ។'
                            : 'Seat numbers restart at 1 in every zone — pick within this zone, then switch zones with the radio buttons.'}
                        </div>
                        <SeatMap
                          seats={activeSeats}
                          seatClasses={classes}
                          selected={mapSelected}
                          onToggle={toggleSeat}
                          disabled={!!hold}
                        />
                      </div>
                    )
                  }
                })()}

                {hold && (
                  <p className="hint mt-[0.7rem]">
                    {locale === 'km'
                      ? 'ការជ្រើសរើសត្រូវបានចាក់សោនៅពេលកក់។ សូមលែងវិញ ដើម្បីជ្រើសម្តងទៀត។'
                      : 'Your selection is locked while the hold is live. Release it to pick different seats.'}
                  </p>
                )}
              </div>
            </div>
          )}

        </div>

        {/* ------------------------------------------------- selection panel */}
        <div className="summary" id="hold-summary">
          <div className="card">
            <div className="card-head">
              <h3>{hold ? t('holdActive') : t('yourSelection')}</h3>
            </div>
            <div className="card-body">
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
                  </div>
                  <Link
                    className="btn btn-accent btn-lg btn-block"
                    to={`/checkout?event=${event.id}&hold=${hold.id}`}
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

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="card-body stack-sm">
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
