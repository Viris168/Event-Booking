import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import KhqrWordmark from "./KhqrWordmark.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { getProvinces } from "../api/provinces.js";

/*
 * The platform's own accounts.
 *
 * <p>"#" is a placeholder, standing in until the real accounts are known. It is
 * the one safe stand-in: a guessed handle would be worse than no link at all,
 * because facebook.com/<something plausible> almost certainly belongs to
 * somebody else and the footer would be sending every visitor to a stranger
 * under this brand's name.
 *
 * <p>Replace each "#" with the real URL and delete any account that does not
 * exist - an entry with an empty url is skipped entirely, so removing the url
 * removes the icon. Everything below "#" is already wired: swapping in an
 * https address is the whole change, and {@link #isLive} then turns that plate
 * into a real outbound link.
 */
const SOCIAL = [
  { name: "Facebook", icon: "facebook", url: "#" },
  { name: "Telegram", icon: "telegram", url: "#" },
  { name: "Instagram", icon: "instagram", url: "#" },
  { name: "TikTok", icon: "tiktok", url: "#" },
];

/** A link that actually leaves the site, as opposed to the "#" placeholder. */
const isLive = (url) => url.startsWith("http");

export default function Footer() {
  // No setLocale: the language switch lives in the navbar and the account
  // panel, which are reachable from every page. A third copy at the bottom of
  // the document was the one nobody scrolled to.
  const { t, locale } = useLocale();
  const { isAuthenticated, isOrganizer, isAdmin } = useAuth();
  const km = locale === "km";
  const social = SOCIAL.filter((s) => s.url);
  const [provinceCount, setProvinceCount] = useState(null);

  useEffect(() => {
    let active = true;
    getProvinces()
      .then((res) => {
        if (active) setProvinceCount((res || []).length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  /*
   * Same `show` pattern the navbar uses, and for the same reason: every link
   * below /my-bookings and /organizer is behind a ProtectedRoute, so offering
   * them to someone who cannot open them turns the footer into a row of
   * bounces. A signed-out visitor was being shown "My bookings" (which
   * redirects to login) and a signed-in one "Sign up"; an ordinary customer got
   * three organiser links that all reject them on arrival.
   */
  const explore = [
    { to: "/", label: t("home"), show: true },
    { to: "/events", label: t("events"), show: true },
    { to: "/my-bookings", label: t("myBookings"), show: isAuthenticated },
    { to: "/register", label: t("register"), show: !isAuthenticated },
  ].filter((l) => l.show);

  /*
   * The third column belongs to whoever is reading it.
   *
   * `isOrganizer` is true for PLATFORM_ADMIN as well, so testing it alone put
   * the organiser's own dashboard, venues and door scanner in front of an admin
   * — screens about one organiser's events, which an admin does not have. The
   * navbar already draws this distinction (`isOrganizer && !isAdmin`); the
   * footer was the way around it. Admins get their own section instead, which
   * is the same information read across every organiser at once.
   */
  const workspace = isAdmin
    ? {
        label: t("admin"),
        links: [
          { to: "/admin", label: t("adminDashboard") },
          { to: "/admin/review", label: t("reviewQueue") },
          { to: "/admin/events", label: t("moderation") },
          { to: "/admin/payments", label: t("payments") },
        ],
      }
    : isOrganizer
      ? {
          label: km ? "អ្នកចាត់ចែង" : "For organizers",
          links: [
            { to: "/organizer", label: t("organizerDashboard") },
            { to: "/organizer/venues", label: t("venues") },
            { to: "/organizer/check-in", label: t("checkIn") },
          ],
        }
      : {
          label: km ? "អ្នកចាត់ចែង" : "For organizers",
          links: [{ to: "/become-an-organizer", label: t("becomeOrganizer") }],
        };

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-top">
          {/* ------------------------------------------------------- brand */}
          <div className="footer-brand">
            {/* Mark and wordmark read as one lockup, which is what they are -
                stacked, the mark looked like an image that happened to sit
                above a heading. */}
            <div className="footer-lockup">
              <img
                className="footer-mark"
                src="/logo/CB-mark.png"
                alt=""
                width="280"
                height="320"
                loading="lazy"
                aria-hidden="true"
              />
              <strong>{t("brand")}</strong>
            </div>

            <p>
              {km
                ? "កក់សំបុត្រព្រឹត្តិការណ៍ទូទាំងព្រះរាជាណាចក្រកម្ពុជា។ កៅអីកក់ទុក ឬចូលទូទៅ ជាមួយសំបុត្រ QR នៅមាត់ទ្វារ។"
                : "Ticketing for events across the Kingdom of Cambodia. Reserved seats or general admission, with a QR ticket at the door."}
            </p>

            {/*
              The reach figure reads as a figure now. As a 13px line with a pin
              in front of it, the one piece of evidence in the whole column was
              set smaller than the sentence above it.

              It stays mounted while the count is in flight, hidden rather than
              absent. Rendering it only once the request lands meant the line
              appeared out of nothing and shoved the invitation and the accounts
              a row down - on a short page the whole footer is on screen from
              the first paint, so that shift is watched rather than missed.
              `visibility` keeps the box and its height while taking the empty
              line out of the accessibility tree.
            */}
            <p
              className="footer-reach"
              style={provinceCount == null ? { visibility: "hidden" } : undefined}
            >
              <b>{provinceCount ?? "\u00A0"}</b>
              <span>{km ? "ខេត្ត/ក្រុង មានព្រឹត្តិការណ៍" : "provinces covered"}</span>
            </p>

            {/* The invitation and the accounts share a row: both are 40px
                plates, and a visitor who has read to the bottom of a page is
                either leaving or looking for the next event. */}
            <div className="footer-actions">
              <Link className="footer-cta" to="/events">
                {km ? "មើលព្រឹត្តិការណ៍" : "See what's on"}
                <Icon name="arrowRight" size={16} />
              </Link>

              {/* These are the platform's accounts.

                  A "#" entry is drawn as a plate rather than an anchor. It
                  looks identical, and that is the point - what it does NOT do
                  is take a visitor who clicks it and jump them to the top of
                  the page they are already reading, which is where href="#"
                  leads. Put a real https URL in SOCIAL above and the same entry
                  becomes a proper outbound link with no other change. */}
              {social.length > 0 && (
                <ul className="footer-social" aria-label={km ? "បណ្តាញសង្គម" : "Social"}>
                  {social.map((s) => (
                    <li key={s.name}>
                      {isLive(s.url) ? (
                        /* noreferrer as well as noopener: there is no reason to
                           hand another site this page's URL as a referrer. */
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          aria-label={s.name}
                          title={s.name}
                        >
                          <Icon name={s.icon} size={17} />
                        </a>
                      ) : (
                        <span role="img" aria-label={s.name} title={s.name}>
                          <Icon name={s.icon} size={17} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* The three navs travel as one block, flush to the page's right
              edge, rather than as three of four equal tracks. */}
          <div className="footer-nav">
            {/* ---------------------------------------------------- explore */}
            {/* aria-labelledby, not aria-label: the heading is already on
                screen naming the section, so pointing at it is both the
                accessible name and one fewer copy of the string. Written out
                twice, the label and the heading were free to drift - and the
                one that drifts is the one nobody can see. */}
            <nav className="footer-col" aria-labelledby="footer-explore">
              <h4 id="footer-explore">{km ? "ស្វែងរក" : "Explore"}</h4>
              {explore.map((l) => (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* -------------------------------------- organizer / admin */}
            <nav className="footer-col" aria-labelledby="footer-workspace">
              <h4 id="footer-workspace">{workspace.label}</h4>
              {workspace.links.map((l) => (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ))}
            </nav>

            {/* -------------------------------------------------------- help */}
            {/* "Help", not "Company". Nobody scans a footer looking for a
                company - they scan it when something has gone wrong and they
                want a person. The heading should name the reason they are
                reading it, and both links under it answer that reason.

                No `show` filtering, unlike the two columns above: both routes
                are public, so there is no state in which offering them sends
                somebody to a login screen or a 403. */}
            <nav className="footer-col" aria-labelledby="footer-help">
              <h4 id="footer-help">{km ? "ជំនួយ" : "Help"}</h4>
              <Link to="/about">{t("aboutUs")}</Link>
              <Link to="/contact">{t("contactUs")}</Link>
            </nav>
          </div>
        </div>

        {/* -------------------------------------------------------- bottom */}
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {t("brand")}
          </span>

          {/* The payment marks. They are a trust signal rather than somewhere
              to go - nothing here is clickable - and the question they answer
              is "can I actually pay on this site", which a visitor settles by
              spotting the mark they already know. So the KHQR mark is drawn
              rather than spelled out. */}
          <span className="footer-pay-row">
            {/* No icon beside it. The plate next door carries the real KHQR
                mark, and a generic bank glyph in front of "ABA PayWay" reads as
                a placeholder for a logo that had not arrived yet. Both plates
                are wordmarks now, which is what a payment mark is. */}
            <span className="footer-pay">{t("payway")}</span>
            <span className="footer-pay">
              <KhqrWordmark height={18} />
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
