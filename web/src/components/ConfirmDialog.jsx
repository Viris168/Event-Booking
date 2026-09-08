import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * Ask before doing something that is hard to walk back.
 *
 * <p>Replaces {@code window.confirm}, which was wrong here for two reasons. It
 * is rendered by the browser and looks nothing like the rest of the product -
 * and, more seriously, Firefox and Chrome both offer <em>"don't allow this site
 * to prompt you again"</em>. Once ticked, {@code confirm()} returns false
 * immediately and forever, so the action it guards silently stops working with
 * no error and nothing to tell the user why. A confirmation the user can
 * permanently disable is not a confirmation.
 *
 * <p>Escape and the backdrop both cancel; nothing but the confirm button
 * proceeds. Focus lands on <b>Cancel</b>, not the destructive action - a stray
 * Enter should do nothing.
 */
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  onConfirm,
  onClose,
}) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const cancelRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
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
      <div className="panel confirm-panel">
        <div className="confirm-body">
          <span className={`confirm-icon ${tone}`}>
            <Icon name="alert" size={20} />
          </span>
          <div>
            <h2>{title}</h2>
            <div className="confirm-text">{children}</div>
          </div>
        </div>

        <div className="confirm-foot">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel ?? (km ? 'បោះបង់' : 'Cancel')}
          </button>
          <button
            type="button"
            className={`btn ${tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (km ? 'កំពុងដំណើរការ…' : 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
