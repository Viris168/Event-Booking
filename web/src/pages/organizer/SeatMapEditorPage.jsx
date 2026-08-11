import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { Alert, Field } from '../../components/ui.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  deleteSeatSection,
  generateSeatBlock,
  getVenue,
  provinceName,
  useStore,
  venueSeatsOf,
} from '../../mock/store.js'

/** Read-only render of venue_seat positions, grouped by section. */
function SeatMapPreview({ seats }) {
  const { width, height } = useMemo(() => {
    if (!seats.length) return { width: 400, height: 120 }
    return {
      width: Math.max(...seats.map((s) => s.pos_x)) + 60,
      height: Math.max(...seats.map((s) => s.pos_y)) + 50,
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
      <svg className="seatmap" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <rect className="stage" x={width / 2 - 100} y="6" width="200" height="18" rx="6" />
        <text className="stage-text" x={width / 2} y="20" textAnchor="middle">
          Stage
        </text>
        {sections.map(([label, list]) => (
          <g key={label}>
            <text
              className="section-label"
              x={Math.min(...list.map((s) => s.pos_x)) - 8}
              y={Math.min(...list.map((s) => s.pos_y)) - 12}
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
      </svg>
    </div>
  )
}

export default function SeatMapEditorPage() {
  const { id } = useParams()
  useStore()
  const { t, locale } = useLocale()
  const toast = useToast()

  const [section, setSection] = useState('')
  const [rows, setRows] = useState(8)
  const [cols, setCols] = useState(12)

  const venue = getVenue(id)
  const seats = venueSeatsOf(id)

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

  if (!venue) {
    return (
      <div className="container">
        <Alert tone="danger" title="Venue not found">
          <Link to="/organizer/venues" className="with-icon">
            <Icon name="arrowLeft" size={15} />
            {t('venues')}
          </Link>
        </Alert>
      </div>
    )
  }

  function generate(e) {
    e.preventDefault()
    const label = section.trim()
    if (!label) return
    if (rows < 1 || rows > 26 || cols < 1 || cols > 40) {
      toast('Rows 1–26, seats per row 1–40', 'error')
      return
    }
    const result = generateSeatBlock(venue.id, { section_label: label, rows: Number(rows), cols: Number(cols) })
    if (result.error === 'SECTION_EXISTS') {
      toast(locale === 'km' ? 'ផ្នែកនេះមានរួចហើយ' : 'That section already exists', 'error')
      return
    }
    toast(
      `${result.created.length} ${locale === 'km' ? 'កៅអីត្រូវបានបង្កើត' : 'seats generated'}`,
      'success',
    )
    setSection('')
  }

  return (
    <div className="container container-wide">
      <div className="breadcrumb">
        <Link to="/organizer/venues">{t('venues')}</Link> /{' '}
        {locale === 'km' ? venue.name_km : venue.name_en}
      </div>

      <div className="page-head">
        <div>
          <h1>{t('seatMap')}</h1>
          <p>
            {locale === 'km' ? venue.name_km : venue.name_en} ·{' '}
            {provinceName(venue.province_code, locale)} · {seats.length}{' '}
            {locale === 'km' ? 'កៅអី' : 'seats'}
          </p>
        </div>
      </div>

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
              <button className="btn btn-primary btn-block" type="submit" disabled={!section.trim()}>
                <Icon name="grid" size={15} />
                {locale === 'km' ? 'បង្កើតកៅអី' : 'Generate seats'}
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
            <div className="table-wrap">
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
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => {
                            deleteSeatSection(venue.id, s.label)
                            toast(`${s.label} ${locale === 'km' ? 'ត្រូវបានលុប' : 'removed'}`, 'info')
                          }}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
