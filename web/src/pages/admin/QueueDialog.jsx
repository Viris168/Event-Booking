import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from '../../components/Icon.jsx'

/**
 * The detail for one row of an admin queue, as a modal.
 *
 * <p>Shared by the review queue and the organiser applications screen, which
 * queueStyles.js already calls the same screen doing different work. The
 * navigation, the counter and the keyboard handling are identical in both; only
 * what goes inside differs.
 *
 * <p>A dialog rather than another use of ConfirmDialog: that one is built for a
 * question - a fixed icon, one sentence, focus parked on Cancel so a stray
 * Enter does nothing. This holds a whole submission, needs to scroll, and its
 * primary control is Approve. Teaching ConfirmDialog both shapes would fork its
 * layout, its width and its focus rule on a boolean.
 *
 * <p>Escape and the backdrop close it, matching every other overlay in the
 * product. The decision dialogs open on top of this one and keep their own
 * higher z-index, so approving from in here still asks first.
 */
export default function QueueDialog({ km, onClose, label, position, total, onPrev, onNext, canPrev, canNext, children }) {
  const closeRef = useRef(null)

  /*
   * onClose/onNext/onPrev arrive as inline props that are new on every render
   * of the caller - which re-renders on every keystroke in the Reject/Changes
   * textarea one dialog up, since that value is lifted state. Naming them in
   * this effect's dependency array would re-run it, and hence re-run
   * closeRef.current?.focus(), on every character typed - stealing focus off
   * that textarea mid-word. Refs let the effect depend only on mount/unmount
   * while the keydown handler still calls whatever the latest callback is.
   */
  const callbacksRef = useRef({ onClose, onNext, onPrev })
  useEffect(() => {
    callbacksRef.current = { onClose, onNext, onPrev }
  }, [onClose, onNext, onPrev])

  useEffect(() => {
    const onKey = (e) => {
      // Only when this is the top overlay. A decision dialog open above it owns
      // Escape - otherwise one keypress would dismiss both, losing the half-
      // typed reason with them.
      if (document.querySelector('.confirm-overlay')) return
      if (e.key === 'Escape') callbacksRef.current.onClose()
      // Arrows step the queue. Only when focus is not in a field - the reject
      // dialog's textarea is a sibling overlay, but a stray listener here would
      // still hijack arrow keys inside any input this panel grows later.
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') callbacksRef.current.onNext?.()
      if (e.key === 'ArrowLeft') callbacksRef.current.onPrev?.()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return createPortal(
    <div
      className="rq-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="rq-dialog">
        {/* A bar rather than a floating close button.
            The dialog used to advance to the next submission with nothing to
            say so - same layout, same buttons, a different show - which on a
            screen whose primary action is an irreversible Approve is a mis-click
            waiting to happen. The counter is what makes the change legible, and
            the arrows are what let you pass on one without ruling on it. */}
        <div className="rq-dialog-bar">
          <div className="rq-dialog-nav">
            <button
              type="button"
              className="rq-dialog-step"
              onClick={onPrev}
              disabled={!canPrev}
              aria-label={km ? 'មុន' : 'Previous submission'}
              title={km ? 'មុន' : 'Previous'}
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <button
              type="button"
              className="rq-dialog-step"
              onClick={onNext}
              disabled={!canNext}
              aria-label={km ? 'បន្ទាប់' : 'Next submission'}
              title={km ? 'បន្ទាប់ (រំលង)' : 'Next (skip)'}
            >
              <Icon name="chevronRight" size={16} />
            </button>
            {position != null && (
              <span className="rq-dialog-pos" aria-live="polite">
                {km ? `${position} ក្នុង ${total}` : `${position} of ${total}`}
              </span>
            )}
          </div>

          <button
            ref={closeRef}
            type="button"
            className="rq-dialog-close"
            onClick={onClose}
            aria-label={km ? 'បិទ' : 'Close'}
            title={km ? 'បិទ' : 'Close'}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
