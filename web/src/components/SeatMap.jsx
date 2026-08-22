import { useMemo } from 'react'
import { useLocale } from '../context/LocaleContext.jsx'
import { usd } from '../lib/format.js'

const CLASS_COLORS = ['#4054c8', '#0d9488', '#c2410c', '#7e22ce', '#0f766e']

export default function SeatMap({ seats, seatClasses, selected, onToggle, disabled = false }) {
  const { t, locale } = useLocale()

  const classIndices = useMemo(() => {
    const map = {}
    seatClasses.forEach((c, i) => {
      map[c.id] = i % 5
    })
    return map
  }, [seatClasses])

  const rows = useMemo(() => {
    const byRow = new Map()
    for (const seat of seats) {
      if (!byRow.has(seat.row_label)) byRow.set(seat.row_label, [])
      byRow.get(seat.row_label).push(seat)
    }
    // Sort rows alphabetically, then seats numerically
    const sortedRows = [...byRow.keys()].sort()
    for (const row of sortedRows) {
      byRow.get(row).sort((a, b) => {
        return a.seat_number.localeCompare(b.seat_number, undefined, { numeric: true })
      })
    }
    return sortedRows.map(label => ({
      label,
      seats: byRow.get(label)
    }))
  }, [seats])

  function labelFor(seat) {
    const cls = seatClasses.find((c) => c.id === seat.seat_class_id)
    const state =
      seat.status === 'AVAILABLE'
        ? t('available')
        : seat.status === 'HELD'
          ? t('heldByOthers')
          : seat.status === 'SOLD'
            ? t('sold')
            : t('blocked')
    return `${seat.section_label} ${seat.row_label}${seat.seat_number} · ${
      cls ? (locale === 'km' ? cls.name_km : cls.name_en) : ''
    } ${cls ? usd(cls.price_usd_cents) : ''} · ${state}`
  }

  return (
    <div className="stack-sm">
      <div className="seatmap-scroll">
        <div className="rows" role="group" aria-label={t('pickSeats')}>
          {rows.map((row) => (
            <div key={row.label} className="row">
              <span className="row-label">{row.label}</span>
              <div className="seats">
                {row.seats.map((seat) => {
                  const isSelectable = seat.status === 'AVAILABLE' && !disabled
                  const isSelected = selected.includes(seat.id)
                  
                  let clsName = 'seat'
                  if (isSelected) clsName += ' selected'
                  else if (seat.status === 'AVAILABLE') clsName += ` tier-${classIndices[seat.seat_class_id] || 0}`
                  else clsName += ` ${seat.status.toLowerCase()}`

                  const showNumber = seat.status === 'AVAILABLE' || isSelected
                  
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      className={clsName}
                      disabled={!isSelectable && !isSelected}
                      onClick={() => onToggle(seat)}
                      title={labelFor(seat)}
                      aria-checked={isSelected}
                      role="checkbox"
                    >
                      {showNumber ? seat.seat_number : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!disabled && <p className="hint mt-2">{t('seatHint')}</p>}

      <div className="legend">
        <span className="legend-group">
          <b className="legend-cap">{t('available')}</b>
          {seatClasses.map((c, i) => (
            <span key={c.id}>
              <i className="swatch" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
              {locale === 'km' ? c.name_km : c.name_en} · {usd(c.price_usd_cents)}
            </span>
          ))}
        </span>

        <span className="legend-group">
          <span>
            <i className="swatch swatch-selected" />
            {t('yourSelection')}
          </span>
          <span>
            <i className="swatch swatch-held" />
            {t('heldByOthers')}
          </span>
          <span>
            <i className="swatch swatch-sold" />
            {t('sold')}
          </span>
          {seats.some((s) => s.status === 'BLOCKED') && (
            <span>
              <i className="swatch swatch-blocked" />
              {t('blocked')}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
