import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * The group pass, grouped the way the tickets actually differ.
 *
 * <p>A booking can mix assigned seats with general admission, and the two are
 * not the same kind of thing:
 *
 * <ul>
 *   <li><b>Zone tickets are interchangeable.</b> Any Standing Area ticket is any
 *       other, so "three of us are here" is a complete instruction and a stepper
 *       is the honest control.</li>
 *   <li><b>Seats are not.</b> Row C seat 1 and row E seat 4 are different
 *       people. "Admit three seats" is a guess at which three are present, so
 *       each is picked by hand.</li>
 * </ul>
 *
 * <p>Either way the server is told <em>ids</em>. The stepper is a convenience
 * this component expands, because the client is the side that knows which rows
 * are interchangeable.
 *
 * <p>Nothing here admits anyone: it reads a preview, which takes no lock and
 * consumes nothing. Cancel really cancels.
 */
export default function GroupPassModal({ open, party, busy, error, onConfirm, onClose }) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const closeRef = useRef(null)

  /*
   * Grouped by TIER, not by booking line.
   *
   * Line was the obvious key and it was wrong: every assigned seat is its own
   * line with qty 1, so three VIP seats produced three separate "VIP" blocks
   * each holding one row. A steward reads tiers, not line ids.
   *
   * `assigned` is part of the key because it decides the control the block
   * gets, and a tier that somehow spanned both would need splitting anyway.
   */
  const groups = useMemo(() => {
    const byTier = new Map()
    for (const t of party?.tickets ?? []) {
      const key = `${t.tier_name}|${t.assigned ? 'seat' : 'zone'}`
      if (!byTier.has(key)) {
        byTier.set(key, { id: key, tier: t.tier_name, assigned: t.assigned, tickets: [] })
      }
      byTier.get(key).tickets.push(t)
    }
    return [...byTier.values()]
  }, [party])

  const [picked, setPicked] = useState(() => new Set())
  // Which tiers have their already-admitted rows expanded. Collapsed by
  // default: a ticket that is already in is not a row the steward can act on,
  // and three of them push the ones they CAN act on off the screen.
  const [showUsed, setShowUsed] = useState(() => new Set())

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open || !party) return null

  const freeOf = (g) => g.tickets.filter((t) => !t.checked_in)
  const usedOf = (g) => g.tickets.filter((t) => t.checked_in)

  const toggleUsed = (id) =>
    setShowUsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const pickedIn = (g) => freeOf(g).filter((t) => picked.has(t.ticket_id)).length

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  /* A stepper for a zone line: the steward names a NUMBER and this picks that
     many ids off the free list. Which ones is genuinely arbitrary — that is
     what "interchangeable" means — and the server still receives ids. */
  const setZoneCount = (g, n) =>
    setPicked((prev) => {
      const next = new Set(prev)
      const free = freeOf(g)
      free.forEach((t) => next.delete(t.ticket_id))
      free.slice(0, n).forEach((t) => next.add(t.ticket_id))
      return next
    })

  const selectAll = () => {
    const next = new Set()
    for (const g of groups) freeOf(g).forEach((t) => next.add(t.ticket_id))
    setPicked(next)
  }

  const total = party.total ?? 0
  const admitted = party.checked_in ?? 0
  const remaining = party.remaining ?? 0
  const count = picked.size

  return createPortal(
    <div
      className="gp-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={km ? 'សំបុត្រក្រុម' : 'Group pass'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="panel gp-panel">
        <div className="panel-head gp-head">
          <div className="gp-title">
            <span className="icon-chip">
              <Icon name="users" size={18} />
            </span>
            <div>
              <h2>{km ? 'សំបុត្រក្រុម' : 'Group pass'}</h2>
              <span className="gp-ref">{party.booking?.booking_ref}</span>
            </div>
          </div>
          <span className={`badge ${remaining > 0 ? 's-confirmed' : 's-used'}`}>
            {remaining > 0
              ? km
                ? `នៅសល់ ${remaining} នាក់`
                : `${remaining} still outside`
              : km
                ? 'ចូលគ្រប់គ្នា'
                : 'All inside'}
          </span>
        </div>

        <div className="panel-body stack-sm">
          <div className="gp-topline">
            <b>{party.booking?.buyer_name}</b>
            <span className="gp-topline-counts">
              {admitted}/{total} {km ? 'បានចូល' : 'admitted'}
            </span>
          </div>

          {groups.map((g) => {
            const free = freeOf(g)
            const chosen = pickedIn(g)
            return (
              <div key={g.id} className="gp-group">
                <div className="gp-group-head">
                  <div>
                    <b>{g.tier}</b>
                    <span className="gp-group-kind">
                      {g.assigned
                        ? km
                          ? 'កៅអីកំណត់'
                          : 'Assigned seats'
                        : km
                          ? 'ចូលទូទៅ'
                          : 'General admission'}
                    </span>
                  </div>

                  {free.length === 0 ? (
                    <span className="gp-group-done">{km ? 'ចូលអស់' : 'all in'}</span>
                  ) : g.assigned ? (
                    <button
                      type="button"
                      className="gp-mini"
                      onClick={() =>
                        chosen === free.length
                          ? setZoneCount(g, 0)
                          : setZoneCount(g, free.length)
                      }
                    >
                      {chosen === free.length
                        ? km
                          ? 'ដកចេញ'
                          : 'Clear'
                        : km
                          ? 'ជ្រើសទាំងអស់'
                          : 'Select all'}
                    </button>
                  ) : (
                    /* Interchangeable, so a count is the whole interaction. */
                    <div className="gp-stepper">
                      <button
                        type="button"
                        onClick={() => setZoneCount(g, Math.max(0, chosen - 1))}
                        disabled={chosen === 0}
                        aria-label={km ? 'តិច' : 'Fewer'}
                      >
                        −
                      </button>
                      <span>{chosen}</span>
                      <button
                        type="button"
                        onClick={() => setZoneCount(g, Math.min(free.length, chosen + 1))}
                        disabled={chosen >= free.length}
                        aria-label={km ? 'ច្រើន' : 'More'}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                {/* Free rows always: those are the decision. Used ones fold
                    away behind a count, because a tier that is entirely inside
                    otherwise costs three lines to say "nothing to do here". */}
                <div className="gp-rows">
                  {free.map((t) =>
                    g.assigned ? (
                      <button
                        key={t.ticket_id}
                        type="button"
                        className={`gp-row seat ${picked.has(t.ticket_id) ? 'on' : ''}`}
                        onClick={() => toggle(t.ticket_id)}
                      >
                        <Icon
                          name={picked.has(t.ticket_id) ? 'checkCircle' : 'ticket'}
                          size={14}
                        />
                        <span className="gp-row-name">{t.seat_location ?? t.tier_name}</span>
                      </button>
                    ) : (
                      <div
                        key={t.ticket_id}
                        className={`gp-row ${picked.has(t.ticket_id) ? 'on' : ''}`}
                      >
                        <Icon name="ticket" size={14} />
                        <span className="gp-row-name">
                          {t.tier_name} · #{t.unit_seq}
                        </span>
                      </div>
                    ),
                  )}

                  {usedOf(g).length > 0 && (
                    <>
                      <button
                        type="button"
                        className="gp-row gp-used-toggle"
                        onClick={() => toggleUsed(g.id)}
                        aria-expanded={showUsed.has(g.id)}
                      >
                        <Icon
                          name="chevronRight"
                          size={13}
                          className={showUsed.has(g.id) ? 'gp-chev open' : 'gp-chev'}
                        />
                        <span className="gp-row-name">
                          {usedOf(g).length} {km ? 'បានចូលរួចហើយ' : 'already in'}
                        </span>
                      </button>

                      {showUsed.has(g.id) &&
                        usedOf(g).map((t) => (
                          <div key={t.ticket_id} className="gp-row in">
                            <Icon name="checkCircle" size={14} />
                            <span className="gp-row-name">
                              {t.seat_location ?? `${t.tier_name} · #${t.unit_seq}`}
                            </span>
                            <span className="gp-row-state">{km ? 'បានចូល' : 'in'}</span>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {remaining > 1 && (
            <button type="button" className="gp-selectall" onClick={selectAll}>
              <Icon name="users" size={14} />
              {km ? `ជ្រើសទាំង ${remaining} នាក់` : `Select all ${remaining}`}
            </button>
          )}
        </div>

        {/* Inside the panel, not on the page behind it. An error rendered
            under the overlay is an error nobody sees, and a failed admit then
            looks exactly like a successful one that did nothing. */}
        {error && (
          <div className="gp-error">
            <Icon name="alert" size={15} />
            <span>{error}</span>
          </div>
        )}

        <div className="gp-foot">
          <button
            ref={closeRef}
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {km ? 'បោះបង់' : 'Cancel'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || count < 1}
            onClick={() => onConfirm([...picked])}
          >
            {busy
              ? km
                ? 'កំពុងដំណើរការ…'
                : 'Admitting…'
              : count < 1
                ? km
                  ? 'ជ្រើសអ្នកចូល'
                  : 'Pick who is here'
                : km
                  ? `អនុញ្ញាត ${count} នាក់`
                  : `Admit ${count}`}
            {count > 0 && <Icon name="arrowRight" size={15} />}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
