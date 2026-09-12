import client from './client.js'

/**
 * The signed-in user's inbox, newest first. Returns a Spring Page, so the
 * caller reads `.content` and `.total_elements`.
 *
 * Rows carry a `type` and a `params` object, never a finished sentence - see
 * notificationText() in lib/i18n.js, which is what turns the pair into words in
 * whichever language the viewer has selected.
 */
export const getNotifications = (params) =>
  client.get('/notifications', { params }).then((r) => r.data)

/**
 * Just the badge number.
 *
 * Separate from the list because this is the one that runs on a timer: fetching
 * a page of rows to count them would cost twenty records a minute per open tab,
 * for a number the server reads off a partial index.
 */
export const getUnreadCount = () =>
  client.get('/notifications/unread-count').then((r) => r.data.unread)

/** Idempotent - clicking an already-read notification is not an error. */
export const markNotificationRead = (id) =>
  client.patch(`/notifications/${id}/read`).then((r) => r.data)

export const markAllNotificationsRead = () =>
  client.post('/notifications/read-all').then((r) => r.data.marked)
