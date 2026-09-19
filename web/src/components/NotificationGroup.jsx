import { useState } from 'react'
import Icon from './Icon.jsx'
import NotificationItem from './NotificationItem.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

/**
 * Several notifications of one type, collapsed into the newest of them.
 *
 * Closed, it is the newest row with the others implied behind it - the same
 * shape a phone's notification shade uses, and for the same reason: the count
 * is the useful part until you decide it is not. Open, it is the rows
 * themselves, unchanged, because a group is a way of showing the list and not
 * a different kind of thing in it.
 *
 * A group of one renders as a plain row with no toggle. Wrapping it in a
 * control that expands to reveal what is already visible would be a button
 * that does nothing.
 */
export default function NotificationGroup({ group, onOpen }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)

  const { items } = group
  if (items.length === 1) {
    return <NotificationItem notification={items[0]} onOpen={onOpen} />
  }

  const unread = items.filter((n) => !n.read_at).length

  return (
    <div className={`notif-group ${open ? 'is-open' : ''} ${items.length === 2 ? 'is-pair' : ''}`}>
      {open ? (
        items.map((n) => <NotificationItem key={n.id} notification={n} onOpen={onOpen} />)
      ) : (
        /* The shoulders are drawn by .notif-stack in CSS rather than by
           rendering the rows underneath at a smaller scale: the ones behind are
           never read, and mounting them only to hide them would make a stack of
           twenty cost twenty rows to show one. */
        <div className="notif-stack">
          <NotificationItem notification={items[0]} onOpen={onOpen} />
        </div>
      )}

      <button
        type="button"
        className="notif-group-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {/* One glyph, turned. Icon.jsx has no chevronUp and adding one to a set
            the whole app shares, for a single caller, is the more expensive of
            the two edits. */}
        <Icon name="chevronDown" size={13} />
        {open
          ? t('notificationsCollapse')
          : /* length - 1, because the newest is the card above this button and
               is not among what opening it reveals. */
            `${items.length - 1} ${t('notificationsMore')}${unread > 0 ? ` · ${unread} ${t('notificationsUnread').toLowerCase()}` : ''}`}
      </button>
    </div>
  )
}
