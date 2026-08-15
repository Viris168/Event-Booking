import { useEffect } from 'react'

const SUFFIX = 'Event Booking Cambodia'

/**
 * Per-page browser title. Without it every tab, bookmark and history entry
 * reads the same, which makes several open tabs impossible to tell apart.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX
  }, [title])
}
