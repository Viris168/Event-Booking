import { useDocumentTitle } from '../../lib/useDocumentTitle.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Field } from '../../components/ui.jsx'
import { Skeleton, SkeletonRegion } from '../../components/Skeleton.jsx'
import GroupPassModal from '../../components/GroupPassModal.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { scanTicket, previewGroup, confirmGroup } from '../../api/tickets.js'
import { mapScanResult, mapGroupPreview, mapGroupConfirm } from '../../api/adapters.js'
import { getOrganizerEvents } from '../../api/events.js'
import { mapEvent } from '../../api/adapters.js'

/**
 * The gate.
 *
 * Talks to the real `POST /tickets/scan`. Three things about that endpoint
 * shape this page:
 *
 * 1. It answers **200 for every verdict**, including a forged or already-used
 *    code. A rejected promise here is never "bad ticket" — it is a bad request
 *    or a bad operator, and it must not be rendered in the red the steward
 *    reads as "turn this person away".
 * 2. `event_id` is **required**. A scan that names no event used to admit every
 *    event's tickets. That is why this page cannot scan until a gate is chosen.
 * 3. The caller must be the organiser of that event, so the selector only ever
 *    offers events the server would accept.
 */

/**
 * Seven server outcomes, three colours a steward can act on at a glance.
 *
 * Deliberately not one row per outcome: under queue pressure the only decisions
 * are let-them-in, stop-and-talk, and turn-away. The precise outcome is still
 * printed underneath for anyone who needs it.
 */
const TONE = {
  VALID: 'ok',
  ALREADY_CHECKED_IN: 'warn',
  BOOKING_NOT_CONFIRMED: 'warn',
  WRONG_EVENT: 'warn',
  MALFORMED: 'bad',
  BAD_SIGNATURE: 'bad',
  UNKNOWN_TICKET: 'bad',
  REQUESTED_MORE_THAN_REMAINING: 'warn',
  TICKET_NOT_IN_PARTY: 'warn',
}

const ICON = { ok: 'checkCircle', warn: 'alert', bad: 'xCircle' }

const HEADLINE = {
  VALID: { en: 'Valid — admit', km: 'សំបុត្រត្រឹមត្រូវ — អនុញ្ញាតឲ្យចូល' },
  ALREADY_CHECKED_IN: { en: 'Already used', km: 'សំបុត្រនេះបានប្រើរួចហើយ' },
  BOOKING_NOT_CONFIRMED: { en: 'Booking not confirmed', km: 'ការកក់មិនទាន់បញ្ជាក់' },
  WRONG_EVENT: { en: 'Wrong event', km: 'ព្រឹត្តិការណ៍មិនត្រូវ' },
  MALFORMED: { en: 'Not a ticket', km: 'មិនមែនជាសំបុត្រ' },
  BAD_SIGNATURE: { en: 'Tampered code', km: 'កូដត្រូវបានកែប្រែ' },
  UNKNOWN_TICKET: { en: 'Not found', km: 'រកមិនឃើញសំបុត្រនេះទេ' },
  REQUESTED_MORE_THAN_REMAINING: { en: 'Too many', km: 'ច្រើនជាងចំនួននៅសល់' },
  TICKET_NOT_IN_PARTY: { en: 'Selection out of date — rescan', km: 'ជម្រើសផុតកំណត់ — សូមស្កេនម្តងទៀត' },
}

/**
 * The headline a steward reads first, and often the only thing they read.
 *
 * ALREADY_CHECKED_IN is the one outcome whose plain label can cause the wrong
 * action. A party that shares one phone sends its latecomer to the door holding
 * a code the others already walked in on: that code IS spent, so the server is
 * right to refuse it — but somebody on that booking is still owed entry, and
 * the group panel below offers to admit them.
 *
 * "Already used" on its own reads as "turn this person away", and under queue
 * pressure the button underneath does not get noticed. So when the booking has
 * people outstanding, the headline says so instead.
 */
function headlineFor(result, locale) {
  const outstanding = result.booking?.remaining ?? 0

  // A preview answers VALID for "real booking at the right gate" and admits
  // nobody. Rendering that as "Valid — admit" would tell a steward someone had
  // just been let in when nothing was spent.
  if (result.outcome === 'VALID' && !result.admitted) {
    return outstanding > 0
      ? locale === 'km'
        ? `ក្រុម — ជ្រើសអ្នកដែលមកដល់ (${outstanding})`
        : `Group booking — pick who is here (${outstanding})`
      : locale === 'km'
        ? 'អ្នកទាំងអស់បានចូលរួច'
        : 'Everyone on this booking is already inside'
  }

  if (result.outcome === 'ALREADY_CHECKED_IN' && outstanding > 0) {
    return locale === 'km'
      ? `សំបុត្រនេះប្រើរួច — នៅសល់ ${outstanding} នាក់ទៀតត្រូវចូល`
      : `Ticket used — ${outstanding} more still owed entry`
  }
  return HEADLINE[result.outcome]?.[locale] ?? result.outcome
}

export default function CheckInPage() {
  const { t, locale, dateTime } = useLocale()
  useDocumentTitle(t('checkIn'))

  const [events, setEvents] = useState([])
  // The gate list is the one thing that must arrive before anything can be
  // scanned, so its wait is shown rather than left as an empty dropdown.
  const [eventsLoading, setEventsLoading] = useState(true)
  const [eventId, setEventId] = useState('')
  const [code, setCode] = useState('')
  const [last, setLast] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [recent, setRecent] = useState([])
  const [cameraOn, setCameraOn] = useState(false)
  // The party behind the last scanned code, and the payload that found them —
  // confirm takes the QR, never a booking id, so a scanner cannot admit
  // somebody else's party by naming it.
  const [party, setParty] = useState(null)
  const [partyPayload, setPartyPayload] = useState(null)

  const km = locale === 'km'

  // Only events this organiser owns — the server would 403 anything else, so
  // offering a wider list would only produce failures at the door.
  useEffect(() => {
    let cancelled = false
    getOrganizerEvents()
      .then((list) => {
        if (cancelled) return
        const mapped = (list || []).map(mapEvent).filter(Boolean)
        setEvents(mapped)
        if (mapped.length === 1) setEventId(String(mapped[0].id))
      })
      .catch(() => !cancelled && setEvents([]))
      .finally(() => !cancelled && setEventsLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const scan = useCallback(
    async (raw) => {
      const value = (raw || '').trim()
      if (!value || !eventId || busy) return

      setBusy(true)
      setError(null)
      setParty(null)
      setPartyPayload(null)
      try {
        /*
         * PREVIEW FIRST, always. It takes no lock and consumes nothing.
         *
         * Scanning straight into /tickets/scan admits whichever ticket the code
         * belongs to — and since the customer now shows ONE code for the whole
         * booking, that is very often not the ticket the person in front is
         * actually holding. A Regular guest presenting the party's shared code
         * would be admitted against a VIP seat, and the real VIP holder refused
         * an hour later.
         *
         * So on a mixed or multi-ticket booking nothing is spent until the
         * steward says who is here.
         */
        const preview = mapGroupPreview(await previewGroup(value, Number(eventId)))
        setCode('')

        if (!preview.booking) {
          // Malformed, forged, or unknown — nothing to choose from.
          setLast({
            admitted: false,
            outcome: preview.outcome,
            message: preview.message,
            ticket: null,
            booking: null,
            previous_check_in_at: null,
          })
          return
        }

        if (preview.total === 1) {
          // One ticket on the booking: there is nothing to pick, so the fast
          // path stays fast and the steward taps once.
          const result = mapScanResult(await scanTicket(value, Number(eventId)))
          setLast(result)
          if (result.ticket) {
            setRecent((prev) => [{ ...result, at: new Date().toISOString() }, ...prev].slice(0, 8))
          }
          return
        }

        // A party. Show it and admit nobody yet.
        setLast({
          admitted: false,
          outcome: preview.outcome,
          message: preview.message,
          ticket: preview.booking && {
            buyer_name: preview.booking.buyer_name,
            booking_ref: preview.booking.booking_ref,
            tier_name: null,
            seat_location: null,
          },
          booking: {
            total: preview.total,
            checked_in: preview.checked_in,
            remaining: preview.remaining,
          },
          previous_check_in_at: null,
        })

        if (preview.admissible) {
          setParty(preview)
          setPartyPayload(value)
        }
      } catch (e) {
        // Never rendered as a scan verdict. A 403 here means the operator is
        // wrong, not the ticket, and showing red would turn away a valid guest.
        const status = e?.response?.status
        setError(
          status === 403
            ? km
              ? 'គណនីនេះមិនមែនជាអ្នករៀបចំព្រឹត្តិការណ៍នេះទេ'
              : 'This account is not the organiser of this event.'
            : status === 400
              ? km
                ? 'សំណើមិនត្រឹមត្រូវ — សូមជ្រើសរើសព្រឹត្តិការណ៍'
                : 'Bad request — check the gate selection.'
              : km
                ? 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេ'
                : 'Could not reach the server.',
        )
        setLast(null)
      } finally {
        setBusy(false)
      }
    },
    [eventId, busy, km],
  )

  const admitParty = useCallback(
    async (howMany) => {
      if (!partyPayload || busy) return
      setBusy(true)
      setError(null)
      try {
        const result = mapGroupConfirm(
          await confirmGroup(partyPayload, Number(eventId), howMany),
        )
        setLast({
          admitted: result.admitted,
          outcome: result.outcome,
          message: result.message,
          ticket: result.booking && {
            buyer_name: result.booking.buyer_name,
            booking_ref: result.booking.booking_ref,
            tier_name:
              result.admitted_count > 0
                ? `${result.admitted_count} admitted`
                : result.tickets[0]?.tier_name,
            seat_location: result.tickets.map((t) => t.seat_location).filter(Boolean).join(', ') || null,
          },
          booking: {
            total: result.total,
            checked_in: result.total - result.remaining,
            remaining: result.remaining,
          },
          previous_check_in_at: null,
        })
        // A completed admission CLOSES the dialog. Re-prompting for whoever is
        // still outside asks a question nobody has: those people are not at the
        // door yet, and they will present their own codes when they are. Holding
        // it open only forces the steward to dismiss a modal before they can
        // scan the next person in the queue.
        //
        // The one exception is asking for more than are free - nothing was
        // admitted there, so the dialog stays with the corrected count and the
        // steward re-offers it in a single tap.
        if (
          result.outcome === 'REQUESTED_MORE_THAN_REMAINING' ||
          result.outcome === 'TICKET_NOT_IN_PARTY'
        ) {
          setParty((p) => (p ? { ...p, remaining: result.remaining } : p))
        } else {
          setParty(null)
          setPartyPayload(null)
        }
      } catch {
        setError(km ? 'មិនអាចភ្ជាប់ទៅម៉ាស៊ីនមេ' : 'Could not reach the server.')
      } finally {
        setBusy(false)
      }
    },
    [partyPayload, eventId, busy, km],
  )

  // An un-admitted VALID is a prompt, not a green light.
  const tone = last
    ? last.outcome === 'VALID' && !last.admitted
      ? 'warn'
      : (TONE[last.outcome] ?? 'bad')
    : null

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('checkIn')}</h1>
          <p>
            {km
              ? 'ស្កេន QR នៅមាត់ទ្វារ។ សំបុត្រមួយអាចប្រើបានតែម្តង។'
              : 'Scan tickets at the door. Each ticket admits exactly once.'}
          </p>
        </div>
      </div>

      <div className="split">
        <div className="stack">
          {/* Verdict FIRST. A steward scans and looks up: the answer has to
              be the top of the column, not below a camera viewport. The
              earlier order put it ~600px down, so a scan looked like it did
              nothing at all. */}
          {error && (
            <div className="scan-result warn">
              <span className="icon" aria-hidden="true">
                <Icon name="alert" size={30} strokeWidth={2} />
              </span>
              <div>
                <b>{km ? 'បញ្ហាឧបករណ៍ស្កេន' : 'Scanner problem'}</b>
                <span>{error}</span>
              </div>
            </div>
          )}

          {last && (
            <div className={`scan-result ${tone}`}>
              <span className="icon" aria-hidden="true">
                <Icon name={ICON[tone]} size={30} strokeWidth={2} />
              </span>
              <div>
                <b>{headlineFor(last, locale)}</b>

                {last.ticket && (
                  <span>
                    {last.ticket.buyer_name} · {last.ticket.booking_ref} ·{' '}
                    {last.ticket.tier_name}
                    {last.ticket.seat_location ? ` · ${last.ticket.seat_location}` : ''}
                  </span>
                )}

                {/* The rest of the party. A steward scanning the third of four
                    codes otherwise has no idea anyone else is still outside. */}
                {last.booking && last.booking.total > 1 && (
                  <span>
                    {km ? 'ក្រុមនេះ' : 'This booking'}: {last.booking.checked_in}/
                    {last.booking.total} {km ? 'បានចូល' : 'admitted'}
                    {last.booking.remaining > 0 &&
                      ` · ${last.booking.remaining} ${km ? 'នៅសល់' : 'still outside'}`}
                  </span>
                )}

                {last.outcome === 'ALREADY_CHECKED_IN' && last.previous_check_in_at && (
                  <span>
                    {km ? 'ស្កេនដំបូង' : 'First scanned'} {dateTime(last.previous_check_in_at)}
                  </span>
                )}

                {!last.ticket && <span>{last.message}</span>}
              </div>
            </div>
          )}
          {/* The party is a MODAL, not a panel further down the column.
              Admitting four people off one code is a judgement, and a judgement
              should interrupt — an inline card competes with the scanner and
              gets tapped past. */}
          <GroupPassModal
            // Keyed on the booking alone. The selection is per-visit, and a
            // dialog that re-mounted mid-pick would throw it away.
            key={party?.booking?.booking_id ?? 'none'}
            open={!!party}
            party={party}
            busy={busy}
            error={error}
            onConfirm={admitParty}
            onClose={() => {
              // Cancel really cancels: nobody is admitted, and the code still
              // scans. The preview took no lock, so there is nothing to release.
              setParty(null)
              setPartyPayload(null)
              setError(null)
            }}
          />

          <div className="panel">
            <div className="panel-head">
              <h2>{t('scanTicket')}</h2>
            </div>
            <div className="panel-body stack-sm">
              <Field
                label={km ? 'ព្រឹត្តិការណ៍' : 'Gate'}
                hint={
                  km
                    ? 'ត្រូវជ្រើសរើស — សំបុត្រត្រូវផ្ទៀងផ្ទាត់ជាមួយព្រឹត្តិការណ៍នេះ'
                    : 'Required — tickets are checked against this event'
                }
              >
                {eventsLoading ? (
                  /* Sized to the select it replaces, so the panel does not
                     resize under the steward's thumb when the list lands. */
                  <SkeletonRegion label={km ? 'កំពុងផ្ទុក…' : 'Loading events…'}>
                    {/* 42px and a 10px radius are the `.input` metrics, not
                        round numbers — matched so the swap is invisible. */}
                    <Skeleton className="h-10.5 w-full rounded-[10px]" />
                  </SkeletonRegion>
                ) : (
                  <select
                    className="input"
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  >
                    <option value="">{km ? 'ជ្រើសរើសព្រឹត្តិការណ៍…' : 'Choose an event…'}</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {km ? ev.title_km : ev.title_en}
                      </option>
                    ))}
                  </select>
                )}
              </Field>

              <Scanner
                active={cameraOn && !!eventId}
                onDecode={scan}
                onError={() => setCameraOn(false)}
              />

              {/* The page's primary control, and the one pressed most often
                  while standing at a door holding a phone in one hand. It was
                  btn-sm btn-ghost: the lightest weight in the system at 32px
                  tall, under the 44px a thumb reliably hits. btn-lg is 48px,
                  and btn-block puts the whole panel width behind it — no new
                  style, just the sizes the system already has. */}
              <button
                className="btn btn-lg btn-block btn-outline"
                onClick={() => setCameraOn((v) => !v)}
                disabled={!eventId}
              >
                <Icon name="scan" size={18} />
                {cameraOn
                  ? km
                    ? 'បិទកាមេរ៉ា'
                    : 'Stop camera'
                  : km
                    ? 'បើកកាមេរ៉ា'
                    : 'Start camera'}
              </button>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  scan(code)
                }}
              >
                <Field label={t('manualEntry')} hint="EBT1.42.ARaBt9WwSFCg1I2WcHYqLA.pfBnW1S…">
                  <div className="row">
                    <input
                      className="input flex-auto min-w-0"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="EBT1.…"
                    />
                    <button
                      className="btn btn-primary"
                      type="submit"
                      disabled={!code.trim() || !eventId || busy}
                    >
                      <Icon name="scan" size={15} />
                      {busy ? t('loading') : km ? 'ពិនិត្យ' : 'Check'}
                    </button>
                  </div>
                </Field>
              </form>

              {!eventId && (
                <p className="muted small">
                  {km
                    ? 'ជ្រើសរើសព្រឹត្តិការណ៍មុននឹងស្កេន។'
                    : 'Choose a gate before scanning.'}
                </p>
              )}
            </div>
          </div>

          {/* An operator/config failure, deliberately styled apart from a
              ticket verdict — the steward must not read it as "turn away". */}
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{km ? 'ការស្កេនថ្មីៗ' : 'Recent scans'}</h3>
          </div>
          <div className="panel-body">
            {recent.length ? (
              <ul className="timeline">
                {recent.map((r, i) => (
                  <li key={`${r.ticket?.ticket_id}-${i}`}>
                    <div>
                      <b>
                        {r.ticket?.buyer_name} · {r.ticket?.tier_name}
                      </b>
                      <div className="small muted">
                        {r.ticket?.booking_ref} ·{' '}
                        {HEADLINE[r.outcome]?.[locale] ?? r.outcome}
                      </div>
                      <div className="small muted">{dateTime(r.at)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">
                {km ? 'មិនទាន់មានការស្កេន' : 'Nothing scanned yet.'}
              </p>
            )}
            <p className="muted small">
              {km
                ? 'បញ្ជីនេះរក្សាទុកតែក្នុងឧបករណ៍នេះ។'
                : 'This list is this device only — it clears on reload.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Camera capture, mounted only while `active`.
 *
 * html5-qrcode is loaded lazily so the decoder — which is not small — stays out
 * of the initial bundle for every page that never scans anything.
 *
 * The decoder fires continuously while a code is in frame, so `seen` swallows
 * repeats: without it, one ticket held up to the lens is scanned, admitted,
 * and then immediately re-scanned as ALREADY_CHECKED_IN.
 */
function Scanner({ active, onDecode, onError }) {
  const { locale } = useLocale()
  const holder = useRef(null)
  const seen = useRef({ value: null, at: 0 })

  // The callbacks live in refs so the effect below depends on `active` ALONE.
  // Listing them as deps tore the camera down and rebuilt it on every scan:
  // `scan` is a useCallback over `busy`, which flips twice per scan, so each
  // read restarted the video stream mid-queue.
  const decodeRef = useRef(onDecode)
  const errorRef = useRef(onError)

  // No dep array on purpose: this runs after every render, which is what keeps
  // the refs pointing at the current callbacks without making the camera effect
  // below depend on them.
  useEffect(() => {
    decodeRef.current = onDecode
    errorRef.current = onError
  })

  useEffect(() => {
    if (!active) return undefined

    let instance = null
    let stopped = false

    import('html5-qrcode')
      .then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
        if (stopped || !holder.current) return
        instance = new Html5Qrcode(holder.current.id, {
          // The browser's native detector where it exists (Chrome, Android
          // WebView) instead of the library's WASM decode. This is the single
          // biggest difference in how quickly a code is picked up; the library
          // falls back on its own when the API is absent.
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        })
        return instance.start(
          { facingMode: 'environment' },
          {
            // 10 was a third of a second between looks. A ticket held up for a
            // moment could pass through several frames unread.
            fps: 24,
            // A function, not fixed pixels: 240x240 against whatever resolution
            // the camera happened to pick is what made the scan region a
            // lopsided rectangle. This tracks the viewfinder and stays square.
            qrbox: (w, h) => {
              const side = Math.floor(Math.min(w, h) * 0.72)
              return { width: side, height: side }
            },
            // Square stream, so the box the steward aims with matches the box
            // being decoded.
            aspectRatio: 1,
            // Tickets are never shown mirrored. Skipping the flipped pass
            // halves the work per frame.
            disableFlip: true,
          },
          (text) => {
            const now = Date.now()
            if (seen.current.value === text && now - seen.current.at < 3000) return
            seen.current = { value: text, at: now }
            decodeRef.current?.(text)
          },
          () => {
            // Per-frame decode misses are the normal case, not an error.
          },
        )
      })
      .catch((e) => errorRef.current?.(e))

    return () => {
      stopped = true
      // stop() THROWS SYNCHRONOUSLY - it does not reject - when the scanner
      // never started, which is what happens on a denied or absent camera.
      // An uncaught throw inside a cleanup function tears down the whole React
      // tree, and the page goes white. That is not a hypothetical: it is the
      // blank check-in screen this try/catch exists to prevent.
      try {
        instance?.stop().then(() => instance?.clear()).catch(() => {})
      } catch {
        // Never started, so there is nothing to stop.
      }
    }
  }, [active])

  // Collapsed to a strip when off. `.scanner` is aspect-[4/3], which at panel
  // width is ~620px of empty box — enough to push the scan verdict clean off a
  // laptop screen, so a successful scan looked like nothing had happened.
  if (!active) {
    return (
      <div className="scanner-idle">
        <Icon name="qr" size={16} />
        <span>{locale === 'km' ? 'កាមេរ៉ាបិទ' : 'Camera off'}</span>
      </div>
    )
  }

  // NOT .scanner/.scan-frame: those were built for a decorative stub - a 58%
  // wide square with a border and a 100vmax shadow - and squeezing a real video
  // into them is what made the viewfinder lopsided and the region off-centre.
  return <div id="gate-scanner" ref={holder} className="scan-live" />
}
