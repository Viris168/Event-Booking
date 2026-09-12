import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import NotificationItem from './NotificationItem.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useNotifications } from '../context/NotificationContext.jsx'

/**
 * The bell, and the panel behind it.
 *
 * Only the count is polled. The list is fetched when the panel opens and not
 * before: a dropdown nobody has clicked does not need to be up to date, and
 * fetching it on a timer would mean every open tab pulling fifteen rows a
 * minute to render nothing.
 */
export default function NotificationBell() {
  const { t } = useLocale()
  const { unread, items, loading, loadInbox, markRead, markAllRead } = useNotifications()

  const [open, setOpen] = useState(false)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (open) loadInbox(unreadOnly)
  }, [open, unreadOnly, loadInbox])

  // Click-away and Escape. Both, because a panel that only closes on click
  // traps keyboard users in it.
  useEffect(() => {
    if (!open) return

    const onPointer = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const label = unread > 0 ? `${t('notifications')} (${unread})` : t('notifications')

  return (
    <div className="notif-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`nav-icon-btn notif-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          // Capped, because the badge is 18px wide and a genuinely busy admin
          // can reach three digits, at which point the number stops being
          // information and starts being a layout problem.
          <span className="notif-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notifications')}>
          <div className="notif-head">
            <strong>{t('notifications')}</strong>
            {unread > 0 && (
              <button type="button" className="notif-clear" onClick={markAllRead}>
                {t('markAllRead')}
              </button>
            )}
          </div>

          <div className="notif-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={!unreadOnly}
              onClick={() => setUnreadOnly(false)}
            >
              {t('notificationsAll')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={unreadOnly}
              onClick={() => setUnreadOnly(true)}
            >
              {t('notificationsUnread')}
              {unread > 0 && <span className="notif-tab-count">{unread}</span>}
            </button>
          </div>

          <div className="notif-list">
            {loading && <p className="notif-empty">{t('loading')}</p>}

            {!loading && items.length === 0 && (
              <p className="notif-empty">
                {unreadOnly ? t('noUnreadNotifications') : t('noNotifications')}
              </p>
            )}

            {!loading &&
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onOpen={(item) => {
                    if (!item.read_at) markRead(item.id)
                    setOpen(false)
                  }}
                />
              ))}
          </div>

          <Link className="notif-foot" to="/notifications" onClick={() => setOpen(false)}>
            {t('viewAllNotifications')}
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>
      )}
    </div>
  )
}
