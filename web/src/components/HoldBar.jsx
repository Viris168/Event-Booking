import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { countdown } from '../lib/format.js'

/**
 * The hold countdown. Always visible while a hold exists, on the event page and
 * through checkout and payment — nothing here implies the seats are already the
 * customer's.
 *
 * The clock used to tick by calling useStore(), subscribing to the prototype
 * store purely for its one-second re-render. That made a component rendering
 * live API data depend on the mock store staying in the bundle, and meant the
 * countdown stopped if that store ever went away. It owns its own interval now.
 */
export default function HoldBar({ hold, onExtend, onRelease, checkoutTo }) {
  const { t, locale } = useLocale()
  const toast = useToast()
  const [now, setNow] = useState(() => Date.now())
  const warned = useRef(null)

  // Only ticks while a hold is actually on screen: an interval left running
  // against no hold is a timer nothing reads.
  useEffect(() => {
    if (!hold?.expires_at) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [hold?.expires_at])

  const msLeft = hold ? new Date(hold.expires_at).getTime() - now : 0

  // One nudge as the hold enters its last minute — the countdown alone is easy
  // to miss while filling in the checkout form.
  useEffect(() => {
    if (!hold || msLeft <= 0 || msLeft > 60000) return
    if (warned.current === hold.id) return
    warned.current = hold.id
    toast(
      locale === 'km'
        ? 'កៅអីរបស់អ្នកនឹងលែងវិញក្នុងមួយនាទី។'
        : 'Your seats are released in under a minute.',
      'error',
    )
  }, [hold, msLeft, toast, locale])

  if (!hold) return null
  if (msLeft <= 0) return null
  const warn = msLeft < 2 * 60 * 1000

  return (
    <div className={`holdbar ${warn ? 'warn' : ''}`}>
      <span className="hold-clock" aria-live="off">
        <Icon name="clock" size={17} strokeWidth={2} />
        {countdown(msLeft)}
      </span>
      <div className="hb-copy flex-auto min-w-0">
        <b>{t('holdActive')}</b>
        <span>
          {t('holdExpiresIn')} {countdown(msLeft)} · {t('notYoursYet')}
        </span>
      </div>

      {onExtend && (
        <button
          className="btn btn-sm"
          onClick={onExtend}
          disabled={hold.extended}
          title={hold.extended ? t('extended') : t('extendHold')}
        >
          <Icon name={hold.extended ? 'check' : 'refresh'} size={14} />
          {/*
            No "+5:00" on the label. How much the extension adds is a server
            setting (app.hold.extension-minutes, 3 by default), so a number
            hardcoded here was already wrong and would drift again on any
            config change. The countdown jumps when the call succeeds, which
            tells the customer what they actually got.
          */}
          {hold.extended ? t('extended') : t('extendHold')}
        </button>
      )}
      {onRelease && (
        <button className="btn btn-sm" onClick={onRelease}>
          <Icon name="close" size={14} />
          {t('releaseHold')}
        </button>
      )}
      {checkoutTo && (
        <Link className="btn btn-sm btn-accent" to={checkoutTo}>
          {t('goToCheckout')}
          <Icon name="arrowRight" size={14} />
        </Link>
      )}
    </div>
  )
}
