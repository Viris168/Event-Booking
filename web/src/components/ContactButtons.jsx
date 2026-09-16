import Icon from './Icon.jsx'
import { facebookUrl, telegramUrl } from '../lib/contactLinks.js'

/**
 * Reach someone on whichever of Telegram or Facebook they gave.
 *
 * Shared by the two admin queues that review a person rather than a thing: the
 * event queue, where the pair comes from the organiser who submitted the event,
 * and the application queue, where it comes from the applicant themselves. The
 * server sends both fields for Audience.ADMIN only, so an organiser never sees
 * a link back to themselves here.
 *
 * A button appears only when its value resolves to a usable link. Both unusable
 * (or both absent) renders nothing at all, which the callers rely on.
 */
export default function ContactButtons({ telegram, facebook, km }) {
  const tg = telegramUrl(telegram)
  const fb = facebookUrl(facebook)
  if (!tg && !fb) return null

  return (
    <div className="contact-btns">
      {tg && (
        <a className="btn btn-sm contact-btn-telegram" href={tg} target="_blank" rel="noopener noreferrer">
          <Icon name="telegram" size={14} />
          {km ? 'ទាក់ទងតាម Telegram' : 'Message on Telegram'}
        </a>
      )}
      {fb && (
        /* noreferrer as well as noopener: this URL was typed by the person
           being reviewed, and an admin session is not a referrer worth handing
           to a stranger's site. */
        <a className="btn btn-sm contact-btn-facebook" href={fb} target="_blank" rel="noopener noreferrer">
          <Icon name="facebook" size={14} />
          {km ? 'ទាក់ទងតាម Facebook' : 'Message on Facebook'}
        </a>
      )}
    </div>
  )
}
