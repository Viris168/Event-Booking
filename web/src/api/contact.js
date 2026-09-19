import client from './client.js'

/**
 * The public contact form, and the admin inbox it fills.
 *
 * Both halves live here rather than split the way organizerApplications.js is
 * split from the admin review calls. The reason that one is split does not
 * apply: there, the two audiences use genuinely different endpoints with
 * different shapes. Here the admin half is three calls against one table, and
 * a module of three functions is not worth the second file.
 *
 * Every field crosses the wire in snake_case - the API sets
 * property-naming-strategy: SNAKE_CASE, which applies to request bodies as
 * well as responses.
 */

/**
 * Send a message to platform support. 201 with a receipt.
 *
 * The one write in this API that works with no token. If the sender happens to
 * be signed in the interceptor attaches theirs and the server records the
 * account alongside the message - but nothing here depends on that, and the
 * call must keep working for a visitor who has never had an account, because
 * that is most of who uses it.
 *
 * The response is deliberately small: an id to quote and the time it landed.
 * It is NOT the stored row - a public endpoint that echoed back what it kept
 * would be a way to probe what the server retained.
 *
 * Fails with 429 TOO_MANY_CONTACT_MESSAGES when this address or this reply-to
 * has been over the limit, carrying details.retry_after_seconds.
 */
export const sendContactMessage = (data) =>
  client
    .post('/contact', {
      sender_name: data.sender_name,
      reply_to: data.reply_to,
      telegram_username: data.telegram_username || null,
      topic: data.topic,
      subject: data.subject,
      body: data.body,
      booking_ref: data.booking_ref || null,
    })
    .then((r) => r.data)

/**
 * One page of the admin inbox, newest first.
 *
 * `status` null means every status, which is a different endpoint rather than
 * an omitted parameter: /contact-messages defaults to NEW, so leaving the
 * parameter out already means something there.
 *
 * The page carries counts_by_status for every status including the zeros, so
 * the tab row renders without testing each key.
 */
export const getContactInbox = ({ status = 'NEW', page = 0, size = 20 } = {}) =>
  client
    .get(status ? '/admin/contact-messages' : '/admin/contact-messages/all', {
      params: status ? { status, page, size } : { page, size },
    })
    .then((r) => r.data)

/**
 * Move a message to OPEN, CLOSED or SPAM, with an optional internal note.
 *
 * NEW is refused by the server with 400 INVALID_CONTACT_STATUS: it means
 * nobody has looked at the message, and this request is somebody looking. OPEN
 * is what puts one back in the queue.
 *
 * The note is never shown to the sender, which is what lets it hold
 * "duplicate of #412".
 */
export const handleContactMessage = (id, { status, admin_note }) =>
  client
    .patch(`/admin/contact-messages/${id}`, {
      status,
      admin_note: admin_note || null,
    })
    .then((r) => r.data)
