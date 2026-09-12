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

/**
 * The seat map, drawn the way the customer-facing map draws one.
 *
 * This used to be an SVG plotted straight from pos_x / pos_y. That faithfully
 * rendered the stored geometry and was the wrong thing to show: an organiser
 * checking a generated block wants to read row B seat 7, and a grid of
 * unlabelled squares scaled to fit its container answers a question nobody
 * asked. Worse, it was a second seat vocabulary - different sizes, different
 * spacing, no numbers - for the same object the buyer sees.
 *
 * So it reuses SeatMap's own markup and classes (.rows / .row / .row-label /
 * .seats / .seat). Positions come back to what they are in a seated venue: an
 * ORDER, not coordinates. Rows sort alphabetically and seats numerically, which
 * is what the stored pitch was encoding anyway.
 *
 * The one thing coordinates still decide is the order of the SECTIONS down the
 * page, since a section's y is the only record of whether it sits in front of
 * or behind another.
 */
function SeatMapPreview({ seats }) {
  const sections = useMemo(() => {
    const bySection = new Map()
    for (const s of seats) {
      if (!bySection.has(s.section_label)) bySection.set(s.section_label, [])
      bySection.get(s.section_label).push(s)
    }

    return [...bySection.entries()]
      .map(([label, list]) => {
        const byRow = new Map()
        for (const s of list) {
          if (!byRow.has(s.row_label)) byRow.set(s.row_label, [])
          byRow.get(s.row_label).push(s)
        }
        const rows = [...byRow.keys()]
          .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
          .map((rowLabel) => ({
            label: rowLabel,
            // Numeric collation, so seat 10 follows seat 9 rather than seat 1.
            seats: byRow
              .get(rowLabel)
              .slice()
              .sort((a, b) =>
                String(a.seat_number).localeCompare(String(b.seat_number), undefined, {
                  numeric: true,
                }),
              ),
          }))
        return { label, rows, top: Math.min(...list.map((s) => s.pos_y)) }
      })
      .sort((a, b) => a.top - b.top)
  }, [seats])

  if (!seats.length) return null

  return (
    <div className="seatmap-wrap">
      <div className="seatmap-stage">Stage</div>
      {sections.map((section) => (
        <div key={section.label} className="seatmap-section">
          <div className="section-name">{section.label}</div>
          <div className="rows">
            {section.rows.map((row) => (
              <div key={row.label} className="row">
                <span className="row-label">{row.label}</span>
                <div className="seats">
                  {row.seats.map((s) => (
                    /* A span, not a button: nothing here is selectable, and a
                       row of disabled buttons reads to a screen reader as a
                       set of dead controls rather than as a diagram. */
                    <span
                      key={s.id}
                      className="seat seat-plain"
                      title={`${s.section_label} ${s.row_label}${s.seat_number}`}
                    >
                      {s.seat_number}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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
