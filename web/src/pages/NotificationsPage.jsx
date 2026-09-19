import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import NotificationGroup from '../components/NotificationGroup.jsx'
import { Empty, Pager } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useNotifications } from '../context/NotificationContext.jsx'
import { getNotifications } from '../api/notifications.js'
import { groupByType } from '../lib/notifications.js'
import { useDocumentTitle } from '../lib/useDocumentTitle.js'

const PAGE_SIZE = 20

/**
 * The whole inbox, paged.
 *
 * Keeps its own rows rather than reading the context's list. The context holds
 * the fifteen the dropdown shows; this page holds page N of everything, and
 * sharing one array would mean opening the bell truncated the page behind it.
 * Marking read still goes through the context, because the badge is shared and
 * has to stay right.
 */
export default function NotificationsPage() {
  const { t } = useLocale()
  useDocumentTitle(t('notifications'))

  const { unread, markRead, markAllRead, refreshCount } = useNotifications()

  const [rows, setRows] = useState([])
  const [pageInfo, setPageInfo] = useState({ page: 1, pages: 1 })
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)

  const load = useCallback(
    (page) => {
      setLoading(true)
      // The API is 0-indexed; Pager is 1-indexed. Converting here keeps the
      // off-by-one in one place instead of at every call site.
      return getNotifications({ filter, page: page - 1, size: PAGE_SIZE })
        .then((data) => {
          setRows(data.content || [])
          setPageInfo({ page, pages: Math.max(1, data.total_pages || 1) })
        })
        .catch(() => setRows([]))
        .finally(() => setLoading(false))
    },
    [filter],
  )

  useEffect(() => {
    load(1)
  }, [load])

  const openRow = (item) => {
    if (item.read_at) return
    markRead(item.id)
    setRows((list) =>
      list.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n)),
    )
  }

  const clearAll = () => {
    const now = new Date().toISOString()
    markAllRead()
    // Both filtered tabs have just stopped describing their contents - Unread
    // is now empty and Read has gained everything - so refetch rather than
    // leaving rows under a tab that says they are something else.
    if (filter !== 'ALL') load(1)
    else setRows((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })))
  }

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{t('notifications')}</h1>
          <p>{unread > 0 ? `${unread} ${t('notificationsUnread').toLowerCase()}` : t('noUnreadNotifications')}</p>
        </div>

        {unread > 0 && (
          <button type="button" className="btn btn-sm btn-outline" onClick={clearAll}>
            <Icon name="check" size={15} />
            {t('markAllRead')}
          </button>
        )}
      </div>

      <div className="notif-tabs page" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'ALL'}
          onClick={() => {
            setFilter('ALL')
            refreshCount()
          }}
        >
          {t('notificationsAll')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'UNREAD'}
          onClick={() => setFilter('UNREAD')}
        >
          {t('notificationsUnread')}
          {unread > 0 && <span className="notif-tab-count">{unread}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'READ'}
          onClick={() => {
            setFilter('READ')
            refreshCount()
          }}
        >
          {t('notificationsRead')}
        </button>
      </div>

      {loading && <p className="muted small">{t('loading')}</p>}

      {!loading && rows.length === 0 && (
        <Empty
          icon="bell"
          title={
            filter === 'UNREAD'
              ? t('noUnreadNotifications')
              : filter === 'READ'
                ? t('noReadNotifications')
                : t('noNotifications')
          }
        />
      )}

      {!loading && rows.length > 0 && (
        <div className="notif-page-list">
          {groupByType(rows).map((group) => (
            <NotificationGroup key={group.type} group={group} onOpen={openRow} />
          ))}
        </div>
      )}

      <Pager page={pageInfo.page} pages={pageInfo.pages} onChange={load} />
    </div>
  )
}
