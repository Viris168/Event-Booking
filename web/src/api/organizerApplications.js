import client from './client.js'

/**
 * Applying to become an organiser.
 *
 * The admin half of this flow (the review queue, approve, reject) lives under
 * /admin and is a separate screen with a separate audience; it belongs in its
 * own module rather than here, so neither side has to read the other's calls to
 * understand its own.
 *
 * Every field crosses the wire in snake_case - the API sets
 * property-naming-strategy: SNAKE_CASE, which applies to request bodies as well
 * as responses.
 */

/**
 * Submit an application. 201 with the created row.
 *
 * No user id parameter: the server takes the applicant from the bearer token.
 * Asking on behalf of someone else is unrepresentable rather than merely
 * refused - the same rule the catalog write endpoints adopted.
 *
 * Fails with 409 ALREADY_AN_ORGANIZER if the caller already has a profile, or
 * 409 ORGANIZER_APPLICATION_ALREADY_PENDING if one is already waiting. Both are
 * reachable by double-submitting, so the caller should handle them rather than
 * assume the page's own state was accurate.
 */
export const applyToBeOrganizer = (data) =>
  client
    .post('/organizer-applications', {
      org_name_en: data.org_name_en,
      org_name_km: data.org_name_km,
      telegram_handle: data.telegram_handle || null,
      facebook_url: data.facebook_url || null,
      event_types: data.event_types || null,
      message: data.message || null,
    })
    .then((r) => r.data)

/**
 * The caller's own applications, newest first.
 *
 * A list, not the latest one. A rejected applicant may apply again, so the
 * screen has to show the rejected attempt beside the new one - otherwise the
 * reason they were turned down vanishes the moment they resubmit.
 *
 * Empty array when they have never applied, which is what the page reads to
 * decide whether to render the form at all.
 */
export const getMyOrganizerApplications = () =>
  client.get('/organizer-applications/me').then((r) => r.data)

/**
 * The one application the page renders, or null.
 *
 * The server already sorts newest first; this names that assumption rather than
 * leaving `[0]` scattered through the component.
 */
export const latestApplication = (applications) =>
  Array.isArray(applications) && applications.length ? applications[0] : null
