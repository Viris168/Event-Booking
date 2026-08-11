import { useMemo } from 'react'
import { useLocale } from '../context/LocaleContext.jsx'
import { usd } from '../lib/format.js'

// Seat classes are coloured by tier so price is readable straight off the map.
const CLASS_COLORS = ['#4054c8', '#0d9488', '#c2410c', '#7e22ce', '#0f766e']

/**
 * Interactive seat map driven by venue_seat pos_x/pos_y, grouped by section and
 * row. Seats held by another shopper or already sold are visibly dead.
 */
export default function SeatMap({ seats, seatClasses, selected, onToggle, disabled = false }) {
  const { t, locale } = useLocale()

  const colorByClass = useMemo(() => {
    const map = {}
    seatClasses.forEach((c, i) => {
      map[c.id] = CLASS_COLORS[i % CLASS_COLORS.length]
    })
    return map
  }, [seatClasses])

  const { width, height, sections } = useMemo(() => {
    const maxX = Math.max(120, ...seats.map((s) => s.pos_x))
    const maxY = Math.max(120, ...seats.map((s) => s.pos_y))
    const bySection = new Map()
    for (const seat of seats) {
      if (!bySection.has(seat.section_label)) bySection.set(seat.section_label, [])
      bySection.get(seat.section_label).push(seat)
    }
    return {
      width: maxX + 60,
      height: maxY + 70,
      sections: [...bySection.entries()].map(([label, list]) => ({
        label,
        list,
        minY: Math.min(...list.map((s) => s.pos_y)),
        minX: Math.min(...list.map((s) => s.pos_x)),
        rows: [...new Set(list.map((s) => s.row_label))].sort(),
      })),
    }
  }, [seats])

  /**
   * Only AVAILABLE seats get a fill attribute (their price-tier colour). Every
   * other state — sold, held, blocked, selected — is painted by the stylesheet
   * so it can follow the light/dark tokens.
   */
  function fillFor(seat) {
    if (seat.status !== 'AVAILABLE') return undefined
    return colorByClass[seat.seat_class_id] || '#4054c8'
  }

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
      <div className="seatmap-wrap">
        <svg
          className="seatmap"
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="group"
          aria-label={t('pickSeats')}
        >
          {/* Stage marker so the map has an orientation. */}
          <rect className="stage" x={width / 2 - 110} y="6" width="220" height="20" rx="6" />
          <text className="stage-text" x={width / 2} y="21" textAnchor="middle">
            Stage
          </text>

          {sections.map((section) => (
            <g key={section.label}>
              <text className="section-label" x={section.minX - 8} y={section.minY - 12}>
                {section.label}
              </text>
              {section.rows.map((row) => {
                const first = section.list.find((s) => s.row_label === row)
                return (
                  <text key={row} className="row-label" x={section.minX - 22} y={first.pos_y + 4}>
                    {row}
                  </text>
                )
              })}
            </g>
          ))}

          {seats.map((seat) => {
            const isSelectable = seat.status === 'AVAILABLE' && !disabled
            const isSelected = selected.includes(seat.id)
            return (
              <rect
                key={seat.id}
                x={seat.pos_x - 11}
                y={seat.pos_y - 11}
                width="22"
                height="22"
                rx="6"
                className={`seat ${
                  isSelected
                    ? 'seat-selected'
                    : seat.status === 'AVAILABLE'
                      ? 'seat-available'
                      : `seat-${seat.status.toLowerCase()}`
                }`}
                fill={fillFor(seat)}
                onClick={isSelectable || isSelected ? () => onToggle(seat) : undefined}
                tabIndex={isSelectable || isSelected ? 0 : -1}
                role="checkbox"
                aria-checked={isSelected}
                aria-disabled={!isSelectable && !isSelected}
                onKeyDown={(e) => {
                  if ((isSelectable || isSelected) && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onToggle(seat)
                  }
                }}
              >
                <title>{labelFor(seat)}</title>
              </rect>
            )
          })}
        </svg>
      </div>

      <div className="legend">
        {seatClasses.map((c, i) => (
          <span key={c.id}>
            <i className="swatch" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
            {locale === 'km' ? c.name_km : c.name_en} · {usd(c.price_usd_cents)}
          </span>
        ))}
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
      </div>
    </div>
  )
}
