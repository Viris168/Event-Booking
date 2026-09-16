import { useMemo, useState } from 'react'

/**
 * Client-side paging for a table whose rows are already in the browser.
 *
 * Deliberately NOT what OrganizerTransactionsPage does. That screen asks the
 * server for one page at a time, because an organiser's booking history grows
 * with every checkout and there is no upper bound on it. The admin tables this
 * hook serves are a different shape: they already hold every row in order to
 * compute what they show - the moderation table derives its "Finished" filter
 * from each row's date, the payout and application queues count their own
 * status tabs from the full set - so the rows are here regardless, and paging
 * them on the server would mean moving all of that into SQL to fetch data the
 * page has anyway.
 *
 * The bar it feeds is the same one either way: TablePager is presentational and
 * does not care which side of the wire the slicing happened on.
 *
 * <p>Nothing here runs in an effect. Both corrections below are derived while
 * rendering, which is what React asks for when state depends on props: an
 * effect would render the wrong page once, commit it, then render again - a
 * visible flash of an empty table on the way to "no results".
 *
 * @param rows        every row, already filtered and sorted by the caller.
 * @param resetKey    the caller's filter state, as a string. Changing it goes
 *                    back to page 1.
 * @param initialSize rows per page before anyone touches the control.
 */
export function usePaging(rows, resetKey = '', initialSize = 25) {
  const [pageSize, setPageSize] = useState(initialSize)
  const [page, setPage] = useState(1)

  /*
   * A filter change goes back to page 1.
   *
   * Without this, narrowing a search while on page 4 leaves you on page 4 of a
   * result that now has two - which renders as an empty table rather than as
   * "no matches", the worst of both readings. Storing the last key and
   * comparing during render is React's own pattern for this; the key is a
   * string so callers can join whatever their controls are without this hook
   * knowing any of them.
   */
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setPage(1)
  }

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  /*
   * Clamped rather than stored, so the page in hand can never point past the
   * end. That case does not only come from filtering - deleting the last row of
   * the last page and refreshing gets there too, and a stored page would have
   * to be corrected after the fact by every caller that can shorten the list.
   */
  const current = Math.min(page, pageCount)

  const visible = useMemo(
    () => rows.slice((current - 1) * pageSize, current * pageSize),
    [rows, current, pageSize],
  )

  /** Changing the page size keeps you near what you were reading, not at row 1. */
  function changePageSize(size) {
    const firstRow = (current - 1) * pageSize
    setPageSize(size)
    setPage(Math.floor(firstRow / size) + 1)
  }

  return {
    page: current,
    setPage: (n) => setPage(Math.max(1, Math.min(n, pageCount))),
    pageSize,
    setPageSize: changePageSize,
    pageCount,
    visible,
    total,
  }
}
