import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import RoleSubnav from '../../components/RoleSubnav.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { getPlatformStats } from '../../api/admin.js'
import { getContactInbox } from '../../api/contact.js'

/**
 * The admin shell, and the queue depths on its tabs.
 *
 * <p>Four tabs carry a number and one carries a dot, and the difference is
 * whether the size of it changes what you do. Three pending reviews means clear
 * them before lunch and forty means block out the afternoon, so the number is
 * the plan and it is worth the width. A stuck payment is not like that: one or
 * five, you go and look at all of them, so that tab gets a mark that says
 * "something is wrong here" and nothing more precise.
 *
 * <p>Users, Event moderation and the dashboard get nothing. Users is a total
 * rather than a backlog - nobody is waiting in it - and /admin/events is the
 * directory, the searchable every-status table, while /admin/review is the
 * inbox. AdminReviewPage's own header draws that line; a count on both would
 * rub it out.
 *
 * <p>Counts are quiet - neutral, at the label's weight - and only the stuck
 * dot is red. Eight red badges on one strip means none of them is urgent.
 */

const NO_COUNTS = { review: 0, applications: 0, payouts: 0, messages: 0, stuck: 0 }

export default function AdminLayout() {
  const { t } = useLocale()
  const { pathname } = useLocation()
  const [counts, setCounts] = useState(NO_COUNTS)

  /*
   * Re-read on every move between admin screens.
   *
   * A count is a claim, and one read once when the shell mounted is false for
   * the rest of the session - an admin who just approved the last four
   * submissions would sit in front of a tab still saying 4. Navigation is also
   * exactly when the claim is most likely to have changed, because working a
   * queue is what changes it.
   *
   * This layout stays mounted across /admin/*, so the effect re-runs on the
   * pathname rather than remounting. Not a poll: admin.js's note on
   * getEventStatusCounts is right that this payload is too broad to run on a
   * timer, and it is not run on one. If the two requests here ever start being
   * felt, the fix is a narrow /admin/queue-counts endpoint, not less freshness.
   */
  useEffect(() => {
    let live = true
    Promise.all([
      getPlatformStats(),
      // size: 1 because the page of messages is thrown away - counts_by_status
      // is what this is for, and it rides along on every inbox response.
      getContactInbox({ status: 'NEW', page: 0, size: 1 }),
    ])
      .then(([s, inbox]) => {
        if (!live) return
        setCounts({
          review: s?.pending_review ?? 0,
          applications: s?.pending_applications ?? 0,
          payouts: s?.payouts_to_send ?? 0,
          messages: inbox?.counts_by_status?.NEW ?? 0,
          stuck: s?.stuck_payments ?? 0,
        })
      })
      /*
       * A badge is an extra; the tabs are the screen. If the counts cannot be
       * read the strip still navigates - and it falls back to no badges rather
       * than to zeros, because a 0 is not the absence of a claim, it is the
       * claim that nothing is waiting.
       */
      .catch(() => {
        if (live) setCounts(NO_COUNTS)
      })
    return () => {
      live = false
    }
  }, [pathname])

  // Zero renders nothing at all: a tab reading "Payouts 0" all week is how you
  // teach someone to stop reading the badges.
  const queue = (n) => (n > 0 ? { count: n, badgeLabel: `${n} ${t('waiting')}` } : null)

  return (
    <>
      <RoleSubnav
        links={[
          { to: '/admin', label: t('adminDashboard'), end: true },
          { to: '/admin/users', label: t('users') },
          { to: '/admin/review', label: t('reviewQueue'), ...queue(counts.review) },
          { to: '/admin/applications', label: t('organizerApplications'), ...queue(counts.applications) },
          { to: '/admin/events', label: t('moderation') },
          {
            to: '/admin/payments',
            label: t('payments'),
            ...(counts.stuck > 0 ? { alert: true, badgeLabel: t('needsAttention') } : null),
          },
          { to: '/admin/payouts', label: t('payouts'), ...queue(counts.payouts) },
          { to: '/admin/contact-messages', label: t('supportInbox'), ...queue(counts.messages) },
        ]}
      />
      <Outlet />
    </>
  )
}
