import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * A modal that holds a form, rather than a yes/no question.
 *
 * <p>ConfirmDialog's sibling, and separate from it for one reason that shows up
 * everywhere in the markup: a confirmation has a fixed body - one icon, one
 * sentence - and its safe default is Cancel, so focus lands there and a stray
 * Enter does nothing. A form has arbitrary content, needs to be wider, and its
 * Enter key belongs to the field the cursor is in. Teaching ConfirmDialog both
 * behaviours would have meant a component whose layout, width and focus rules
 * all fork on a boolean.
 *
 * <p>What it does keep is the part that is about being a modal at all: a real
 * <form> so Enter submits and the browser runs its own validation, Escape and
 * backdrop to cancel, the body scroll-locked underneath, and focus moved into
 * the dialog on open - to the first field, because that is where someone who
 * opened an edit form is going.
 *
 * <p>Both halves are disabled while `busy`, including Escape and the backdrop:
 * a save is in flight and dismissing the dialog would leave the screen with no
 * idea what happened to it.
 */
export default function FormDialog({
  open,
  title,
  subtitle,
  children,
  submitLabel,
  cancelLabel,
  busy = false,
  submitDisabled = false,
  onSubmit,
  onClose,
}) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const formRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)

    // The first real control, not the dialog itself. An edit form that opens
    // with nothing focused makes the keyboard user tab in from the top every
    // time, past the close button, to reach the field they came for.
    formRef.current?.querySelector('input, select, textarea')?.focus()

    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open, busy, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <form
        ref={formRef}
        className="panel form-dialog"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy) onSubmit()
        }}
      >
        <div className="form-dialog-head">
          <h2>{title}</h2>
          {subtitle && <p className="small muted">{subtitle}</p>}
        </div>

        <div className="form-dialog-body">{children}</div>

        <div className="confirm-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {cancelLabel ?? (km ? 'បោះបង់' : 'Cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || submitDisabled}>
            {busy ? (km ? 'កំពុងរក្សាទុក…' : 'Saving…') : submitLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  )
}
