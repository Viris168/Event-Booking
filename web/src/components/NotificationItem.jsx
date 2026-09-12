import { Link } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { notificationText } from '../lib/i18n.js'
import { timeAgo } from '../lib/format.js'
import { notificationIcon, notificationTone } from '../lib/notifications.js'

/**
 * One row, shared by the bell's dropdown and the full page.
 *
 * The row is a Link when the server gave it somewhere to go and a plain div
 * when it did not - rather than a Link to "#", which looks clickable, moves
 * focus and scrolls to the top of the page for no reason.
 */
export default function NotificationItem({ notification, onOpen }) {
  const { locale } = useLocale()
  const { title, body } = notificationText(notification.type, notification.params, locale)

  const unread = !notification.read_at
  const tone = notificationTone(notification.type)

  const inner = (
    <>
      <span className={`notif-glyph t-${tone}`} aria-hidden="true">
        <Icon name={notificationIcon(notification.type)} size={15} />
      </span>

      <span className="notif-body">
        <span className="notif-title">{title}</span>
        {body && <span className="notif-text">{body}</span>}
        <time className="notif-when" dateTime={notification.created_at}>
          {timeAgo(notification.created_at, locale)}
        </time>
      </span>

      {/* Marks the row without relying on the background tint alone, which is
          the part that disappears for anyone who cannot separate the two. */}
      {unread && <span className="notif-dot" aria-label="Unread" />}
    </>
  )

  const className = `notif-row ${unread ? 'is-unread' : ''}`

  if (!notification.link_url) {
    return (
      <div className={className} onClick={() => onOpen?.(notification)}>
        {inner}
      </div>
    )
  }

  return (
    <Link className={className} to={notification.link_url} onClick={() => onOpen?.(notification)}>
      {inner}
    </Link>
  )
}
