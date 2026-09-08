import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { Alert, Field, ResponsiveTable } from './ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  SEAT_PITCH,
  createVenueSeats,
  generateSeatGrid,
  getVenue,
  getVenueSeatMap,
} from '../api/venues.js'
import { mapVenue } from '../api/adapters.js'

/**
 * The server returns a seat map either flat or grouped into sections; both
 * shapes carry the same rows. Flattened once here so nothing downstream has to
 * care which it got.
 */
function normaliseSeats(map) {
  const raw = map?.seats ?? map?.sections?.flatMap((x) => x.seats ?? []) ?? []
  return raw.map((s) => ({
    id: s.id,
    section_label: s.sectionLabel ?? s.section_label,
    row_label: s.rowLabel ?? s.row_label,
    seat_number: s.seatNumber ?? s.seat_number,
    pos_x: Number(s.posX ?? s.pos_x ?? 0),
    pos_y: Number(s.posY ?? s.pos_y ?? 0),
  }))
}

/*
 * Room above the seats for the stage band AND for a section's own label. The
 * label used to be drawn 12 units above its first row, which for a section
 * starting at y=0 put it straight through the STAGE text - the first section's
 * name was unreadable on every map.
 */
const STAGE_BAND = 26
const LABEL_ROOM = 22
const PAD_TOP = STAGE_BAND + LABEL_ROOM
const PAD_BOTTOM = 24

function SeatMapPreview({ seats }) {
  const { width, height } = useMemo(() => {
    if (!seats.length) return { width: 400, height: 120 }
    return {
      width: Math.max(...seats.map((s) => s.pos_x)) + 46,
      // Includes the offset the content is translated by; without it the last
      // row was pushed past the bottom edge and clipped.
      height: Math.max(...seats.map((s) => s.pos_y)) + PAD_TOP + PAD_BOTTOM,
    }
  }, [seats])

  const sections = useMemo(() => {
    const map = new Map()
    for (const s of seats) {
      if (!map.has(s.section_label)) map.set(s.section_label, [])
      map.get(s.section_label).push(s)
    }
    return [...map.entries()]
  }, [seats])

  return (
    <div className="seatmap-wrap">
      {/* No width/height attributes: the viewBox alone drives it, so the map
          scales to whatever container it lands in. It used to render at exactly
          its own coordinate extent (1 unit = 1px) with a 520px CSS floor, which
          stretched a small venue into a mostly-empty box and made a large one
          scroll sideways. Venues differ by ASPECT RATIO - a stadium bowl is
          near square, a hall is wide - so a fixed width is the wrong dial. */}
      <svg className="seatmap" viewBox={`0 0 ${width} ${height}`} role="img">
        <rect className="stage" x={width / 2 - 100} y="6" width="200" height="18" rx="6" />
        <text className="stage-text" x={width / 2} y="20" textAnchor="middle">
          Stage
        </text>
        <g transform={`translate(0, ${PAD_TOP})`}>
        {sections.map(([label, list]) => (
          <g key={label}>
            <text
              className="section-label"
              x={Math.min(...list.map((s) => s.pos_x)) - 8}
              y={Math.min(...list.map((s) => s.pos_y)) - 14}
            >
              {label}
            </text>
            {list.map((s) => (
              <rect
                key={s.id}
                x={s.pos_x - 11}
                y={s.pos_y - 11}
                width="22"
                height="22"
                rx="6"
                className="seat"
                fill="#4054c8"
              >
                <title>{`${s.section_label} ${s.row_label}${s.seat_number}`}</title>
              </rect>
            ))}
          </g>
        ))}
        </g>
      </svg>
    </div>
  )
}

/**
 * The venue's seat map, editable wherever it is rendered.
 *
 * <p><b>This edits the VENUE, not an event.</b> {@code venue_seat} rows are the
 * physical seats in a building and every event held there points at them, so a
 * section deleted here disappears from other shows too - including ones with
 * tickets already sold against those seats.
 *
 * <p>Extracted from its page so the event form can open it in a drawer. The
 * workflow it fixes is real: hitting a venue with no seat map used to mean
 * abandoning a half-filled event form, building the map, and navigating back.
 * The warning above is why it stays visibly venue-level rather than being
 * folded into the event's own fields.
 */
export default function SeatMapEditor({ venueId, showVenueWarning = false, onChange }) {
  const { t, locale } = useLocale()
  const toast = useToast()

  const [section, setSection] = useState('')
  const [rows, setRows] = useState(8)
  const [cols, setCols] = useState(12)

  // From the SERVER. These used to come from mock/store.js, so seats generated
  // here were written to an in-memory object nothing else read and vanished on
  // reload - the same split that made saved events disappear.
  const [venue, setVenue] = useState(null)
  const [seats, setSeats] = useState([])
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!venueId) return undefined
    let live = true
    Promise.all([getVenue(venueId), getVenueSeatMap(venueId).catch(() => null)])
      .then(([v, map]) => {
        if (!live) return
        setVenue(mapVenue(v))
        setSeats(normaliseSeats(map))
      })
      .catch(() => live && setVenue(null))
    return () => {
      live = false
    }
  }, [venueId, version])

  const sections = useMemo(() => {
    const map = new Map()
    for (const s of seats) {
      const entry = map.get(s.section_label) || { rows: new Set(), count: 0 }
      entry.rows.add(s.row_label)
      entry.count += 1
      map.set(s.section_label, entry)
    }
    return [...map.entries()].map(([label, e]) => ({ label, rows: e.rows.size, count: e.count }))
  }, [seats])

  async function generate(e) {
    e.preventDefault()
    const label = section.trim()
    if (!label || busy) return
    if (rows < 1 || rows > 26 || cols < 1 || cols > 40) {
      toast('Rows 1\u201326, seats per row 1\u201340', 'error')
      return
    }
    // Caught here rather than relying on the server's unique constraint, so the
    // message names the section instead of surfacing a 409 about a database key.
    if (sections.some((x) => x.label.toLowerCase() === label.toLowerCase())) {
      toast(locale === 'km' ? '\u1795\u17d2\u1793\u17c2\u1780\u1793\u17c1\u17c7\u1798\u17b6\u1793\u179a\u17bd\u1785\u17a0\u17be\u1799' : 'That section already exists', 'error')
      return
    }

    setBusy(true)
    try {
      // Below everything already on the map, with a gap for its label — so
      // sections read as separate blocks instead of overlapping at one origin.
      const startY = seats.length
        ? Math.max(...seats.map((s) => s.pos_y)) + SEAT_PITCH * 2
        : 0
      const grid = generateSeatGrid({
        sectionLabel: label,
        rows: Number(rows),
        cols: Number(cols),
        startY,
      })
      await createVenueSeats(venueId, grid)
      toast(
        `${grid.length} ${locale === 'km' ? '\u1780\u17c5\u17a2\u17b8\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f' : 'seats generated'}`,
        'success',
      )
      setSection('')
      setVersion((v) => v + 1)
      onChange?.()
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message
      toast(`${locale === 'km' ? '\u1794\u1784\u17d2\u1780\u17be\u178f\u1798\u17b7\u1793\u1794\u17b6\u1793' : 'Could not add seats'}: ${detail}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!venue) {
    return (
      <Alert tone="danger" title="Venue not found">
        <Link to="/organizer/venues" className="with-icon">
          <Icon name="arrowLeft" size={15} />
          {t('venues')}
        </Link>
      </Alert>
    )
  }

  return (
    <>
      {showVenueWarning && (
        <Alert tone="warn">
          {locale === 'km'
            ? '\u1793\u17c1\u17c7\u1782\u17ba\u1787\u17b6\u1795\u17c2\u1793\u1791\u17b8\u1780\u17c5\u17a2\u17b8\u179a\u1794\u179f\u17cb\u1791\u17b8\u1780\u1793\u17d2\u179b\u17c2\u1784 \u2014 \u1780\u17b6\u179a\u1795\u17d2\u179b\u17b6\u179f\u17cb\u1794\u17d2\u178a\u17bc\u179a\u1793\u17b9\u1784\u1794\u17c9\u17c7\u1796\u17b6\u179b\u17cb\u178a\u179b\u17cb\u1796\u17d2\u179a\u17b9\u178f\u17d2\u178f\u17b7\u1780\u17b6\u179a\u178e\u17cd\u178a\u17ce\u1791\u17c1\u1791\u17c0\u178f\u1795\u1784\u17d2\u178a\u17c2\u179a\u17d4'
            : `This is ${venue.name_en}'s own seat map, shared by every event held there. Changing it affects other events at this venue — including ones with tickets already sold.`}
        </Alert>
      )}
    <div className="split">
      <div className="panel">
        <div className="panel-head">
          <h2>{locale === 'km' ? 'ការមើលជាមុន' : 'Preview'}</h2>
          <span className="small muted">
            {locale === 'km'
              ? 'ទីតាំងកៅអី (pos_x / pos_y)'
              : 'Seat positions (pos_x / pos_y)'}
          </span>
        </div>
        <div className="panel-body">
          {seats.length ? (
            <SeatMapPreview seats={seats} />
          ) : (
            <Alert tone="info">
              {locale === 'km'
                ? 'ទីកន្លែងនេះគ្មានកៅអី — សម្រាប់ព្រឹត្តិការណ៍ចូលទូទៅតែប៉ុណ្ណោះ។'
                : 'This venue has no seats — it can only host general-admission (ZONED) events.'}
            </Alert>
          )}
        </div>
      </div>

      <div className="stack">
        <div className="panel">
          <div className="panel-head">
            <h3>{locale === 'km' ? 'បង្កើតផ្នែកជាក្រឡាចត្រង្គ' : 'Generate a section'}</h3>
          </div>
          <form className="panel-body stack-sm" onSubmit={generate}>
            <Field
              label={locale === 'km' ? 'ឈ្មោះផ្នែក' : 'Section label'}
              hint="e.g. Zone A, Grandstand B"
            >
              <input className="input" value={section} onChange={(e) => setSection(e.target.value)} />
            </Field>
            <div className="row">
              <Field label={locale === 'km' ? 'ជួរ' : 'Rows'} className="flex-auto min-w-0">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="26"
                  value={rows}
                  onChange={(e) => setRows(e.target.value)}
                />
              </Field>
              <Field label={locale === 'km' ? 'កៅអី/ជួរ' : 'Seats per row'} className="flex-auto min-w-0">
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="40"
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                />
              </Field>
            </div>
            <p className="hint">
              {locale === 'km'
                ? `នឹងបង្កើត ${rows * cols} កៅអី (ជួរ A–${String.fromCharCode(64 + Number(rows || 1))})`
                : `Creates ${rows * cols} seats, rows A–${String.fromCharCode(64 + Number(rows || 1))}.`}
            </p>
            <button
              className="btn btn-primary btn-block"
              type="submit"
              disabled={busy || !section.trim()}
            >
              <Icon name="grid" size={15} />
              {busy
                ? locale === 'km'
                  ? 'កំពុងបន្ថែម…'
                  : 'Adding…'
                : locale === 'km'
                  ? 'បង្កើតកៅអី'
                  : 'Generate seats'}
            </button>
            <p className="hint">
              {locale === 'km'
                ? 'កម្មវិធីកែប្លង់ដោយអូសទាញនឹងមកក្នុងជំហានបន្ទាប់។'
                : 'Drag-and-drop authoring is out of scope for v1 — the grid generator covers it.'}
            </p>
          </form>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h3>{locale === 'km' ? 'ផ្នែក' : 'Sections'}</h3>
          </div>
          <ResponsiveTable>
            <table className="table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th>{locale === 'km' ? 'ផ្នែក' : 'Section'}</th>
                  <th className="num">{locale === 'km' ? 'ជួរ' : 'Rows'}</th>
                  <th className="num">{locale === 'km' ? 'កៅអី' : 'Seats'}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.label}>
                    <td className="font-bold">{s.label}</td>
                    <td className="num">{s.rows}</td>
                    <td className="num">{s.count}</td>
                    <td>
                      {/* Disabled, not removed.

                          There is no endpoint for it: DELETE /venue/{id} drops
                          the whole venue, and dropping a section on its own is
                          not a small operation - event_seat rows point at these
                          venue_seat ids, and tickets point at those. A delete
                          that did not first refuse when a seat is sold would
                          take a paying customer's seat out from under them.

                          It used to edit the prototype store, so it looked like
                          it worked and changed nothing on the server. A button
                          that lies is worse than one that is greyed out. */}
                      <button
                        className="btn btn-sm btn-danger"
                        disabled
                        title={
                          locale === 'km'
                            ? 'មិនទាន់អាចលុបបានទេ'
                            : 'Not available yet — deleting seats another event has sold would break those tickets'
                        }
                      >
                        <Icon name="trash" size={14} />
                        {locale === 'km' ? 'លុប' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!sections.length && (
                  <tr>
                    <td colSpan="4" className="muted small">
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
</ResponsiveTable>
        </div>
      </div>
    </div>
    </>
  )
}
