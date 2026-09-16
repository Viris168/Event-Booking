/**
 * Turn what an applicant typed into a link an admin can safely click.
 *
 * Telegram and Facebook both arrive as free text from the person under review,
 * and both end up in an href on an admin screen. The server checks length and
 * nothing else - @Size is the only constraint on OrganizerApplicationRequest -
 * so the shape and, more importantly, the scheme are settled here.
 *
 * Each returns null rather than a best-effort link when the value cannot be
 * made into one. A caller that renders nothing is being honest; a button that
 * navigates somewhere unintended is not.
 */

/** Telegram usernames are 5-32 characters of [A-Za-z0-9_]. */
const HANDLE = /^[a-z0-9_]{5,32}$/i

/** Labels and at least one dot, and nothing that had to be percent-encoded. */
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i

/**
 * "@sokha", "sokha", "t.me/sokha" and "https://t.me/sokha" all reach this from
 * the same one-line field, and the form's "@" prefix is decoration - it is not
 * part of the stored value, so it cannot be relied on either way.
 */
export function telegramUrl(raw) {
  const handle = String(raw ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(?:t\.me|telegram\.me)\//i, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '')
  return HANDLE.test(handle) ? `https://t.me/${handle}` : null
}

export function facebookUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null

  /*
   * The form asks for "facebook.com/yourpage", so most values arrive with no
   * scheme - and a schemeless href is a RELATIVE one. Left as typed it sent the
   * admin to /admin/applications/facebook.com/yourpage, which is why the old
   * "Open page" link went nowhere.
   */
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`

  let url
  try {
    url = new URL(absolute)
  } catch {
    return null
  }

  /*
   * Anything but http(s) is refused. `javascript:` and `data:` are typeable
   * into a 500-character text field, survive the server untouched, and would
   * run in the reviewing admin's own session on click - the applicant chooses
   * the string, the admin clicks it, so this is the boundary that has to say no.
   */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  /*
   * And the host has to look like a host. Prefixing a scheme makes new URL()
   * accept almost any prose - "not a url at all" parses happily as the hostname
   * not%20a%20url%20at%20all - so a link built that way points nowhere while
   * looking exactly like one that works.
   */
  return DOMAIN.test(url.hostname) ? url.href : null
}
