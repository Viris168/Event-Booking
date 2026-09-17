import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ConfirmDialog from './ConfirmDialog.jsx'
import Icon from './Icon.jsx'
import { Alert, Field, ResponsiveTable } from './ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import {
  MAX_ROWS,
  SEAT_PITCH,
  createVenueSeats,
  deleteVenueSeatSection,
  generateSeatGrid,
  getVenue,
  getVenueSeatMap,
  parseSeatCounts,
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
  // A string, not a number: '12' is the rectangle, '12, 14' is a VIP block whose
  // second row is wider. Rows that differ are the normal case in a real room.
  const [cols, setCols] = useState('12')
  // Blank means "the next free letter in this section", resolved below. Typed
  // in, it lets a block start wherever the organiser says.
  const [startRow, setStartRow] = useState('')

  // From the SERVER. These used to come from mock/store.js, so seats generated
  // here were written to an in-memory object nothing else read and vanished on
  // reload - the same split that made saved events disappear.
  const [venue, setVenue] = useState(null)
  const [seats, setSeats] = useState([])
  const [busy, setBusy] = useState(false)
  // The section the confirm dialog is asking about, and the one mid-request.
  // Separate: the dialog stays open and busy while the request is in flight.
  const [confirming, setConfirming] = useState(null)
  const [deleting, setDeleting] = useState(null)
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
      const entry = map.get(s.section_label) || { rows: new Set(), count: 0, bottom: -Infinity }
      entry.rows.add(s.row_label)
      entry.count += 1
      entry.bottom = Math.max(entry.bottom, s.pos_y)
      map.set(s.section_label, entry)
    }
    return [...map.entries()].map(([label, e]) => ({
      label,
      rows: e.rows.size,
      count: e.count,
      rowLabels: e.rows,
      bottom: e.bottom,
    }))
  }, [seats])

  /** The section being typed, if it is one that already exists (case-insensitively). */
  const existing = useMemo(
    () => sections.find((x) => x.label.toLowerCase() === section.trim().toLowerCase()) || null,
    [sections, section],
  )

  /**
   * What a blank "start row" means: the first letter this section has not used.
   *
   * Not simply "one past the last row" — a section whose rows are A and C has a
   * free B, and refusing to reuse it would be arbitrary.
   */
  const nextFreeRow = useMemo(() => {
    const taken = existing?.rowLabels ?? new Set()
    for (let i = 0; i < MAX_ROWS; i += 1) {
      const letter = String.fromCharCode(65 + i)
      if (!taken.has(letter)) return letter
    }
    return 'A'
  }, [existing])

  const effectiveStartRow = (startRow.trim().toUpperCase() || nextFreeRow).slice(0, 1)
  const counts = parseSeatCounts(cols)
  // One count per row means the count list IS the row count; the Rows field
  // would be a second, contradicting answer to the same question.
  const perRow = counts && counts.length > 1
  const rowCount = perRow ? counts.length : Number(rows) || 0
  const plannedRows = counts
    ? Array.from({ length: rowCount }, (_, i) => ({
        label: String.fromCharCode(effectiveStartRow.charCodeAt(0) + i),
        count: perRow ? counts[i] : counts[0],
      }))
    : []
  const plannedTotal = plannedRows.reduce((n, r) => n + r.count, 0)

  async function generate(e) {
    e.preventDefault()
    const label = section.trim()
    if (!label || busy) return
    if (!counts) {
      toast(
        locale === 'km'
          ? '\u1780\u17c5\u17a2\u17b8/\u1787\u17bd\u179a \u2014 \u179b\u17c1\u1781\u1796\u17b8 1 \u178a\u179b\u17cb 40 \u1785\u17c6\u178e\u17bb\u1785\u1780\u17b6\u178f\u17cb \u17a1\u17c2\u1780\u178a\u17c4\u1799\u179f\u1789\u17d2\u1789\u17b6 , \u1780\u17d2\u1793\u17bb\u1784\u1780\u179a\u178e\u17b8\u1787\u17bd\u179a\u1798\u17b7\u1793\u179f\u17d2\u1798\u17be\u1782\u17d2\u1793\u17b6'
          : 'Seats per row: 1\u201340, or a comma-separated count per row (e.g. 12, 14)',
        'error',
      )
      return
    }
    if (rowCount < 1 || effectiveStartRow.charCodeAt(0) - 65 + rowCount > MAX_ROWS) {
      toast(
        locale === 'km'
          ? `\u1787\u17bd\u179a\u1798\u17b7\u1793\u17a2\u17b6\u1785\u17a0\u17bc\u179f Z \u1791\u17c1`
          : `Rows run past Z \u2014 start row ${effectiveStartRow} leaves room for ${MAX_ROWS - (effectiveStartRow.charCodeAt(0) - 65)}`,
        'error',
      )
      return
    }
    // Caught here rather than relying on the server's unique constraint, so the
    // message names the rows instead of surfacing a 409 about a database key.
    // The SECTION existing is no longer the problem it once was — adding row C
    // to a section that has A and B is the whole point. A row that is already
    // there still is.
    const taken = plannedRows.filter((r) => existing?.rowLabels.has(r.label)).map((r) => r.label)
    if (taken.length) {
      toast(
        locale === 'km'
          ? `\u1787\u17bd\u179a ${taken.join(', ')} \u1798\u17b6\u1793\u179a\u17bd\u1785\u17a0\u17be\u1799\u1780\u17d2\u1793\u17bb\u1784 ${existing.label}`
          : `${existing.label} already has row${taken.length > 1 ? 's' : ''} ${taken.join(', ')}`,
        'error',
      )
      return
    }

    setBusy(true)
    try {
      // Directly under the rows this section already has when extending one, so
      // an added row sits with its own block. For a NEW section, below
      // everything on the map with a gap for its label — otherwise every section
      // generates at one origin and they overlap into a single blob.
      const startY = existing
        ? existing.bottom + SEAT_PITCH
        : seats.length
          ? Math.max(...seats.map((s) => s.pos_y)) + SEAT_PITCH * 2
          : 0
      const grid = generateSeatGrid({
        // The stored spelling wins when extending, so 'vip' typed into a section
        // called 'VIP' extends it instead of creating a second, near-identical one.
        sectionLabel: existing?.label ?? label,
        seatsPerRow: perRow ? counts : counts[0],
        rows: rowCount,
        startRow: effectiveStartRow,
        startY,
      })
      await createVenueSeats(venueId, grid)
      toast(
        `${grid.length} ${locale === 'km' ? '\u1780\u17c5\u17a2\u17b8\u178f\u17d2\u179a\u17bc\u179c\u1794\u17b6\u1793\u1794\u1784\u17d2\u1780\u17be\u178f' : 'seats generated'}`,
        'success',
      )
      // The section label STAYS. Adding row B right after row A is the common
      // next action, and the refetch below advances the suggested start row to
      // the next free letter on its own.
      setStartRow('')
      setVersion((v) => v + 1)
      onChange?.()
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message
      toast(`${locale === 'km' ? '\u1794\u1784\u17d2\u1780\u17be\u178f\u1798\u17b7\u1793\u1794\u17b6\u1793' : 'Could not add seats'}: ${detail}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function removeSection(label) {
    if (deleting) return

    setDeleting(label)
    try {
      await deleteVenueSeatSection(venueId, label)
      toast(
        locale === 'km' ? `បានលុបផ្នែក ${label}` : `Section ${label} deleted`,
        'success',
      )
      setConfirming(null)
      setVersion((v) => v + 1)
      onChange?.()
    } catch (err) {
      // The 409 carries the events that are using the section, and THAT is the
      // part the organiser can act on - so it is shown rather than flattened
      // into "could not delete". The dialog closes either way: the answer is in
      // the toast, and an open dialog invites a pointless retry.
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message
      toast(`${locale === 'km' ? 'លុបមិនបាន' : 'Could not delete'}: ${detail}`, 'error')
      setConfirming(null)
    } finally {
      setDeleting(null)
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
              hint={
                existing
                  ? locale === 'km'
                    ? `បន្ថែមទៅផ្នែក ${existing.label} ដែលមានស្រាប់`
                    : `Adding to the existing ${existing.label} section`
                  : 'e.g. VIP, Normal, Grandstand B'
              }
            >
              {/* A plain input with a datalist, so an existing section can be
                  picked without being retyped — and typing a new one still
                  works. Extending a section is now ordinary, not an error. */}
              <input
                className="input"
                list="seatmap-sections"
                value={section}
                onChange={(e) => setSection(e.target.value)}
              />
              <datalist id="seatmap-sections">
                {sections.map((x) => (
                  <option key={x.label} value={x.label} />
                ))}
              </datalist>
            </Field>
            <div className="row">
              <Field
                label={locale === 'km' ? 'ជួរចាប់ផ្ដើម' : 'Start row'}
                className="flex-auto min-w-0"
              >
                <input
                  className="input"
                  maxLength="1"
                  placeholder={nextFreeRow}
                  value={startRow}
                  onChange={(e) => setStartRow(e.target.value)}
                />
              </Field>
              <Field
                label={locale === 'km' ? 'ជួរ' : 'Rows'}
                className="flex-auto min-w-0"
              >
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="26"
                  value={perRow ? counts.length : rows}
                  disabled={perRow}
                  title={
                    perRow
                      ? locale === 'km'
                        ? 'កំណត់ដោយចំនួនកៅអីក្នុងមួយជួរ'
                        : 'Set by the per-row seat counts'
                      : undefined
                  }
                  onChange={(e) => setRows(e.target.value)}
                />
              </Field>
              <Field label={locale === 'km' ? 'កៅអី/ជួរ' : 'Seats per row'} className="flex-auto min-w-0">
                {/* Text, not number: '12' is a rectangle, '12, 14' is a block
                    whose second row is wider. The server has always taken
                    explicit rows; only this form insisted on a grid. */}
                <input
                  className="input"
                  inputMode="numeric"
                  value={cols}
                  onChange={(e) => setCols(e.target.value)}
                />
              </Field>
            </div>
            <p className="hint">
              {counts
                ? locale === 'km'
                  ? `នឹងបង្កើត ${plannedTotal} កៅអី — ${plannedRows.map((r) => `${r.label}×${r.count}`).join(', ')}`
                  : `Creates ${plannedTotal} seats \u2014 ${plannedRows.map((r) => `${r.label}\u00d7${r.count}`).join(', ')}.`
                : locale === 'km'
                  ? 'ចំនួនកៅអី៖ 12 ឬ 12, 14'
                  : 'Seats per row: a number, or one count per row \u2014 12, 14'}
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
                : 'Uneven rows are supported \u2014 type one seat count per row. Drag-and-drop authoring is out of scope for v1.'}
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
                      {/* Live, and backed by a server that refuses the unsafe
                          case: DELETE /venue/{id}/seats?section= returns 409
                          naming the events when any event_seat points at these
                          rows. The refusal is the server's to make - it is the
                          side that can see every event at this venue - so this
                          button asks and reports rather than pre-judging.

                          It was disabled before that endpoint existed, and
                          before that it edited a prototype store, so it looked
                          like it worked and changed nothing. */}
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => setConfirming(s.label)}
                        disabled={deleting !== null}
                        title={
                          locale === 'km'
                            ? `លុបផ្នែក ${s.label}`
                            : `Delete section ${s.label} \u2014 refused if any event uses these seats`
                        }
                      >
                        <Icon name="trash" size={14} />
                        {deleting === s.label
                          ? locale === 'km'
                            ? 'កំពុងលុប…'
                            : 'Deleting…'
                          : locale === 'km'
                            ? 'លុប'
                            : 'Delete'}
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

    <ConfirmDialog
      open={Boolean(confirming)}
      tone="danger"
      busy={Boolean(deleting)}
      title={locale === 'km' ? `លុបផ្នែក ${confirming}?` : `Delete section ${confirming}?`}
      confirmLabel={locale === 'km' ? 'លុបចោល' : 'Delete'}
      onConfirm={() => removeSection(confirming)}
      onClose={() => setConfirming(null)}
    >
      <p className="small muted">
        {locale === 'km'
          ? `កៅអីទាំងអស់ក្នុងផ្នែក ${confirming} នឹងត្រូវលុបចេញពីប្លង់របស់ ${venue.name_en} ជាអចិន្ត្រៃយ៍។ បើមានព្រឹត្តិការណ៍ណាប្រើកៅអីទាំងនេះ ការលុបនឹងត្រូវបានបដិសេធ។`
          : `Every seat in ${confirming} is removed from ${venue.name_en}'s map for good. If any event has already been laid out over these seats the server refuses and nothing changes \u2014 it will name the events.`}
      </p>
    </ConfirmDialog>
    </>
  )
}
