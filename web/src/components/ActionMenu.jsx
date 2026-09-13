import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * The row-actions kebab: one button that opens the actions for its row.
 *
 * <p>Replaces a row of buttons per table row. Four of them - Edit, Take down,
 * Open again, Remove - made the moderation table's last column wider than the
 * event title next to it, and the two destructive ones sat in the open where a
 * mis-click costs a live listing.
 *
 * <p>Items are passed as data rather than as children so the menu owns the
 * keyboard and dismissal behaviour for all of them at once, and so a caller
 * cannot accidentally put something in here that does not close the menu when
 * clicked. `tone: 'danger'` colours an item; `hidden` drops it, which is what
 * lets a caller write the whole list out and let each row's own state decide;
 * `hint` is a short muted note on the right, for saying why a disabled item is
 * disabled without lengthening its label into a second line.
 *
 * <p><b>The panel is portalled to the body and positioned fixed.</b> Not a
 * preference - an absolutely-positioned panel is clipped here. Every table on
 * these screens sits in ResponsiveTable's `.table-wrap`, which sets
 * `overflow-x: auto`, and CSS computes the other axis to `auto` as soon as one
 * of them is not `visible`. So the wrapper scrolls vertically too, and a
 * dropdown on any row near the bottom was cut off by it rather than overlaying
 * the page.
 *
 * <p>That is also why it closes on scroll. A fixed panel does not travel with
 * the row it belongs to, so leaving it open while the page moves would leave it
 * pointing at a different row - closing is both simpler and more honest than
 * tracking the trigger.
 */
export default function ActionMenu({ items, label, disabled = false }) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const menuId = useId()

  const visible = items.filter((i) => i && !i.hidden)

  /*
   * Anchor the panel under the trigger, right edges aligned - the actions
   * column is the last one, so a panel growing rightwards would run off the
   * screen. Flips above the trigger when there is not enough room below, which
   * is the ordinary case for the last row of a long table.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const height = popRef.current?.offsetHeight ?? 0
    const below = window.innerHeight - r.bottom
    const flip = height > 0 && below < height + 12 && r.top > height + 12
    setPos({
      top: flip ? r.top - height - 6 : r.bottom + 6,
      right: Math.max(8, window.innerWidth - r.right),
    })
  }, [])

  // Before paint, so the panel never appears at 0,0 for a frame first.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const close = () => setOpen(false)
    // Pointerdown rather than click: a click listener fires after the trigger
    // has already toggled the menu, so the same gesture would open and
    // immediately close it.
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    // Capture, so a scroll inside the table wrapper closes it too - that one
    // does not bubble.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  // A row whose every action is hidden renders nothing rather than a menu that
  // opens onto a blank panel.
  if (visible.length === 0) return null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-sm btn-ghost action-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label ?? (km ? 'សកម្មភាព' : 'Actions')}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="moreVertical" size={16} />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            className="action-menu-pop"
            id={menuId}
            role="menu"
            // Hidden until placed, so the first paint is never in the corner.
            style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }}
          >
            {visible.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={`action-menu-item${item.tone === 'danger' ? ' danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.icon && <Icon name={item.icon} size={15} />}
                <span>{item.label}</span>
                {item.hint && <span className="action-menu-hint">{item.hint}</span>}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
