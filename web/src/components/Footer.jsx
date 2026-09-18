import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
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
 * https address is the whole change, and {@link #isLive} then gives that link
 * the outbound attributes a placeholder must not have.
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
        <div className="footer-grid">
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
            <div>
              <p>
                {km
                  ? "កក់សំបុត្រព្រឹត្តិការណ៍ទូទាំងព្រះរាជាណាចក្រកម្ពុជា — កៅអីកក់ទុក ឬចូលទូទៅ ជាមួយសំបុត្រ QR។"
                  : "Ticketing for events across the Kingdom of Cambodia — reserved seats or general admission, with a QR ticket at the door."}
              </p>
              {provinceCount != null && (
                <span className="footer-reach">
                  <Icon name="mapPin" size={13} />
                  {provinceCount} {km ? "ខេត្ត/ក្រុង" : "provinces covered"}
                </span>
              )}
            </div>
          </div>

          {/* ------------------------------------------------------ explore */}
          <nav className="footer-col" aria-label={km ? "ស្វែងរក" : "Explore"}>
            <h4>{km ? "ស្វែងរក" : "Explore"}</h4>
            {explore.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </nav>

          {/* ---------------------------------------- organizer / admin */}
          <nav className="footer-col" aria-label={workspace.label}>
            <h4>{workspace.label}</h4>
            {workspace.links.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </nav>

          {/* ------------------------------------------------------------ help */}
          {/* "Help", not "Company". Nobody scans a footer looking for a
              company - they scan it when something has gone wrong and they
              want a person. The heading should name the reason they are
              reading it, and both links under it answer that reason.

              No `show` filtering, unlike the two columns above: both routes
              are public, so there is no state in which offering them sends
              somebody to a login screen or a 403. */}
          <nav className="footer-col" aria-label={km ? "ជំនួយ" : "Help"}>
            <h4>{km ? "ជំនួយ" : "Help"}</h4>
            <Link to="/about">{t("aboutUs")}</Link>
            <Link to="/contact">{t("contactUs")}</Link>
          </nav>

        </div>

        {/* -------------------------------------------------------- bottom */}
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {t("brand")}
          </span>

          {/* Centre of the closing bar: these are the platform's accounts, not
              the brand column's.

              A "#" entry is drawn as a plate rather than an anchor. It looks
              identical, and that is the point - what it does NOT do is take a
              visitor who clicks it and jump them to the top of the page they
              are already reading, which is where href="#" leads. Put a real
              https URL in SOCIAL above and that same entry becomes a proper
              outbound link with no other change. */}
          {social.length > 0 && (
            <ul className="footer-social" aria-label={km ? "បណ្តាញសង្គម" : "Social"}>
              {social.map((s) => (
                <li key={s.name}>
                  {/* The outbound attributes go only on a link that actually
                      leaves the site. noreferrer as well as noopener, because
                      there is no reason to hand another site this page's URL
                      as a referrer - but on the "#" placeholder
                      target="_blank" would open a second copy of the page the
                      visitor is already reading.

                      Swapping "#" for an https URL in SOCIAL is the entire
                      change: this branch picks the attributes up on its own. */}
                  <a
                    href={s.url}
                    {...(isLive(s.url)
                      ? { target: "_blank", rel: "noreferrer noopener" }
                      : {})}
                    aria-label={s.name}
                    title={s.name}
                  >
                    <Icon name={s.icon} size={17} />
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* The payment marks, which used to hold a nav column of their own
              between Explore and the organiser links. They are a trust signal
              rather than somewhere to go - nothing in that column was
              clickable - and a column of two unclickable words read as a list
              of links that had stopped working. */}
          <span className="footer-pay-row">
            <span className="footer-pay">
              <Icon name="bank" size={14} />
              {t("payway")}
            </span>
            <span className="footer-pay">
              <Icon name="qr" size={14} />
              ABA PAY / KHQR
            </span>
          </span>
        </div>
      </div>
    </footer>
  );
}
