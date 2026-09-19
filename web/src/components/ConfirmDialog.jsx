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
  /*
   * Hold the confirm button shut while the dialog's own body says the answer is
   * not ready yet - a reason not typed, a file not downloaded.
   *
   * Separate from `busy` rather than folded into it, because the two mean
   * opposite things to the person looking at the button. `busy` says the action
   * is under way and renders "Working…"; this says it has not been asked for
   * yet, and the label must keep naming what the button will do so they know
   * what they are working towards.
   */
  confirmDisabled = false,
  onConfirm,
  onClose,
}) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const cancelRef = useRef(null)

  /*
   * onClose and busy come from the caller as inline props, recreated on every
   * render - and the caller re-renders on every keystroke in this dialog's own
   * Reason textarea, since that's lifted state one level up. A dependency
   * array naming onClose/busy directly would re-run the effect below on every
   * character typed, and cancelRef.current?.focus() would drag focus off the
   * textarea and onto Cancel mid-word. Refs sidestep that: the effect depends
   * only on `open`, so it runs once per open/close, while the keydown handler
   * still always reads the latest onClose/busy through the ref.
   */
  const onCloseRef = useRef(onClose)
  const busyRef = useRef(busy)
  useEffect(() => {
    onCloseRef.current = onClose
    busyRef.current = busy
  }, [onClose, busy])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyRef.current) onCloseRef.current()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

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
            disabled={busy || confirmDisabled}
          >
            {busy ? (km ? 'កំពុងដំណើរការ…' : 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
