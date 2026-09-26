import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import NotificationGroup from '../components/NotificationGroup.jsx'
import { Empty } from '../components/ui.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { useNotifications } from '../context/NotificationContext.jsx'
import { getNotifications } from '../api/notifications.js'
import { groupByType } from '../lib/notifications.js'
import { useDocumentTitle } from '../lib/useDocumentTitle.js'

const PAGE_SIZE = 20

/**
 * The whole inbox, newest first, loaded 20 at a time.
 *
 * "Show older" rather than numbered pages. Rows are grouped by type, so a page
 * of 20 used to collapse into three cards, and a busy type was split across
 * pages - "15 more like this" on page 1 and the same group again on page 2.
 * Appending keeps every loaded row in one list, so a group only ever grows.
 *
 * Keeps its own rows rather than reading the context's list. The context holds
 * the fifteen the dropdown shows; this page holds page N of everything, and
 * sharing one array would mean opening the bell truncated the page behind it.
 * Marking read still goes through the context, because the badge is shared and
 * has to stay right.
 */
export default function NotificationsPage() {
  const { t, locale } = useLocale()
  useDocumentTitle(t('notifications'))

  const { unread, markRead, markAllRead, refreshCount } = useNotifications()

  const [rows, setRows] = useState([])
  // The last page loaded (0-indexed, as the API counts) and how many exist.
  const [pageInfo, setPageInfo] = useState({ page: 0, pages: 1, total: 0 })
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const listRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    return getNotifications({ filter, page: 0, size: PAGE_SIZE })
      .then((data) => {
        setRows(data.content || [])
        setPageInfo({ page: 0, pages: Math.max(1, data.total_pages || 1), total: data.total_elements ?? 0 })
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }, [filter])

  useEffect(() => {
    load()
  }, [load])

  function loadMore() {
    if (loadingMore) return
    const next = pageInfo.page + 1
    setLoadingMore(true)
    getNotifications({ filter, page: next, size: PAGE_SIZE })
      .then((data) => {
        // Offsets shift when something new arrives at the top, so the next
        // page can repeat a row already on screen. Skip any id we hold.
        setRows((list) => {
          const seen = new Set(list.map((n) => n.id))
          return [...list, ...(data.content || []).filter((n) => !seen.has(n.id))]
        })
        setPageInfo({ page: next, pages: Math.max(1, data.total_pages || 1), total: data.total_elements ?? 0 })
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }

  function showLess() {
    setRows((list) => list.slice(0, PAGE_SIZE))
    setPageInfo((info) => ({ ...info, page: 0 }))
    // Collapsing from far down would leave you in the footer.
    listRef.current?.scrollIntoView({ block: 'start' })
  }

  const hasMore = pageInfo.page + 1 < pageInfo.pages
  const left = Math.max(0, pageInfo.total - rows.length)

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
    if (filter !== 'ALL') load()
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
        <div className="notif-page-list" ref={listRef}>
          {groupByType(rows).map((group) => (
            <NotificationGroup key={group.type} group={group} onOpen={openRow} />
          ))}
        </div>
      )}

      {!loading && (hasMore || pageInfo.page > 0) && (
        <div className="list-more notif-more">
          {hasMore && (
            <button type="button" className="btn btn-outline" onClick={loadMore} disabled={loadingMore}>
              <Icon name="chevronDown" size={15} />
              {loadingMore
                ? t('loading')
                : locale === 'km'
                  ? `បង្ហាញចាស់ៗ · នៅសល់ ${left}`
                  : `Show older · ${left} left`}
            </button>
          )}
          {pageInfo.page > 0 && (
            <button type="button" className="btn btn-ghost" onClick={showLess}>
              <Icon name="chevronUp" size={15} />
              {locale === 'km' ? 'បង្ហាញតិច' : 'Show less'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
