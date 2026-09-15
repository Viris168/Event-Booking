import client from './client.js'

/**
 * "Connect Telegram" - the organiser's own half of the deep-link handshake.
 * The other half (Telegram calling this app back) is a webhook the browser
 * never talks to directly, so it has no client module here.
 */

/** Whether the caller has ever connected a Telegram chat. */
export const getTelegramStatus = () =>
  client.get('/organizer/telegram/status').then((r) => r.data)

/**
 * A fresh 10-minute deep link (`t.me/<bot>?start=<token>`). Calling this
 * again before the previous link is used simply replaces it - there is
 * nothing to clean up on the caller's side.
 *
 * Rejects with 409 if the server has no Telegram bot configured at all.
 */
export const getTelegramConnectLink = () =>
  client.post('/organizer/telegram/connect-link').then((r) => r.data)

export const disconnectTelegram = () =>
  client.post('/organizer/telegram/disconnect').then((r) => r.data)
