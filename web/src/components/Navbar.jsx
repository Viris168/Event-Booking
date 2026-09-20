import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon.jsx";
import Flag from "./Flag.jsx";
import NotificationBell from "./NotificationBell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { countdown } from "../lib/format.js";

/*
 * How often the navbar looks for a hold it does not already know about.
 *
 * Only ever used for discovery. Once a hold is on screen the countdown is drawn
 * from its own expires_at against a local clock, and asking the server again
 * every few seconds tells us nothing the browser cannot already work out - so
 * the poll stops for exactly as long as a hold is live, which is when this
 * endpoint is at its most expensive to serve (it fans out over the held seats
 * and zone lines).
 *
 * 30s rather than the 10s it was: nothing on screen is driven by the answer,
 * so the only thing the interval decides is how quickly a hold created in
 * another tab shows up here.
 */
const HOLD_POLL_MS = 30_000;

/*
 * Still here for the drawer, and only for the drawer.
 *
 * The wide bar used to print the role under the display name. It no longer
 * does: the bar's account control is the avatar and nothing else. The drawer
 * keeps both, because a drawer row is a full-width list item with room to
 * spare, and on a phone the account panel is one more tap away than it is on a
 * desktop - so the one place the role is still worth stating is the one place
 * it costs nothing to state.
 */
const ROLE_LABEL = {
  CUSTOMER: "Customer",
  ORGANIZER: "Organizer",
  PLATFORM_ADMIN: "Platform admin",
};

export default function Navbar({ onOpenAccount }) {
  const { isAuthenticated, user, role, isOrganizer, isAdmin } = useAuth();
  const { t, locale, setLocale } = useLocale();
  const { isDark, toggle: toggleTheme } = useTheme();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef(null);

  // Close menu drawer on navigation, on Escape, and on an outside click.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onClick = (e) => {
      if (navRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  /*
   * Publish the navbar's height as --nav-h, for whatever has to sit under it.
   *
   * The role sub-nav sticks to the bottom edge of this bar, and needs a number
   * to stick at. That number is not a constant: the bar is taller in Khmer,
   * taller again when a live hold countdown appears inside it, and different on
   * a phone - so a hard-coded offset leaves the tab strip either overlapping
   * the navbar or floating below it with a gap of page showing through.
   *
   * Measured rather than computed, and re-measured on resize, because the only
   * thing that reliably knows the height of a wrapping flex row is the browser.
   */
  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const publish = () =>
      document.documentElement.style.setProperty(
        "--nav-h",
        `${el.offsetHeight}px`,
      );
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [hold, setHold] = useState(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // A live hold is the most time-critical thing on screen: surface it globally,
  // at every width — it stays outside the drawer so it is never hidden.
  const holdMsLeft = hold
    ? new Date(hold.expires_at || hold.expiresAt).getTime() - now
    : 0;
  const showHold = Boolean(hold && holdMsLeft > 0);

  /*
   * Split out so the two things that ask for a hold - the discovery poll and
   * the hold:changed listener below - are asking the same question the same
   * way. The import is dynamic because holds.js is only needed by people who
   * are signed in.
   */
  const refreshHold = useCallback(() => {
    if (!isAuthenticated || !user?.id) return;
    import("../api/holds.js").then(({ getMyActiveHold }) =>
      getMyActiveHold()
        .then((holds) => setHold(holds && holds.length > 0 ? holds[0] : null))
        .catch(() => setHold(null)),
    );
  }, [isAuthenticated, user?.id]);

  /*
   * This tab acting on its own hold - releasing it, creating one, spending it
   * on a booking - has to reach the bar immediately. The poll below cannot do
   * it: it is stopped for exactly as long as a hold is on screen, so a released
   * hold would keep counting down against seats already back on sale until its
   * own clock ran out.
   */
  useEffect(() => {
    window.addEventListener("hold:changed", refreshHold);
    return () => window.removeEventListener("hold:changed", refreshHold);
  }, [refreshHold]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setHold(null);
      return undefined;
    }

    /*
     * Nothing to discover while a hold is already counting down, so the timer
     * simply does not exist in that state - showHold is a dependency, and the
     * cleanup below is what stops the poll when it turns true.
     *
     * The clock running out flips it back to false, which re-runs this effect
     * and fetches once: that single request is what confirms the server agrees
     * the hold is gone, rather than leaving the bar to guess from its own
     * clock. Discovery then resumes on the interval.
     */
    if (showHold) return undefined;

    refreshHold();
    const poll = setInterval(refreshHold, HOLD_POLL_MS);
    return () => clearInterval(poll);
  }, [isAuthenticated, user?.id, showHold, refreshHold]);

  /*
   * Two lists, because the bar and the drawer are answering different
   * questions.
   *
   * The bar carries destinations. Home is one of them: the brand lockup goes
   * there too, but people look for a named link and do not all read a logo as
   * a button. "Become an organizer" stays out - it is a thing you do once,
   * which is why it lives in the account panel.
   *
   * The drawer has room and no such competition, so it keeps both: a phone
   * user should not have to know the account panel exists to find the
   * organiser application.
   */
  const links = [
    { to: "/", label: t("home"), icon: "home", end: true, show: true },
    { to: "/events", label: t("events"), icon: "calendar", show: true },
    {
      to: "/my-bookings",
      label: t("myBookings"),
      icon: "ticket",
      show: isAuthenticated,
    },
    // isOrganizer is true for PLATFORM_ADMIN too, so this needs the explicit
    // !isAdmin: an admin's work lives under /admin, and carrying both put two
    // different consoles side by side with nothing to say which was theirs.
    {
      to: "/organizer",
      label: t("organizer"),
      icon: "building",
      show: isOrganizer && !isAdmin,
    },
    { to: "/admin", label: t("admin"), icon: "shield", show: isAdmin },
    /*
     * The two static pages, last in the row on purpose.
     *
     * Everything above them is somewhere you go to DO something - browse,
     * collect a ticket, run your events. These two are somewhere you go when
     * the doing has stopped working, so they sit after the work and before
     * the account controls.
     *
     * They are also the only rows here with no `show`: both routes are
     * public, and Contact in particular has to stay reachable signed out,
     * because not being able to sign in is one of the commonest reasons to
     * need it.
     */
    { to: "/about", label: t("aboutUs"), icon: "info", show: true },
    { to: "/contact", label: t("contactUs"), icon: "mail", show: true },
  ].filter((l) => l.show);

  const drawerLinks = [
    ...links,
    // Never shown beside the /organizer link: isOrganizer covers ORGANIZER and
    // PLATFORM_ADMIN, so exactly one of these two rows is ever visible and they
    // can share the building icon without ambiguity.
    {
      to: "/become-an-organizer",
      label: t("becomeOrganizer"),
      icon: "building",
      show: isAuthenticated && !isOrganizer,
    },
  ].filter((l) => l.show);

  /*
   * The language switch: one flag, the one you are reading in.
   *
   * <p>Not a pair with the inactive one dimmed. A two-flag control spends
   * double the width to show a choice that has already been made, and it has
   * to solve "which of these is selected" with opacity or a ring - a question
   * a single button never raises, because whatever it shows IS the current
   * state.
   *
   * <p>So the flag is the state and the click is the action, which are not the
   * same thing and must not be labelled as if they were. The button shows the
   * current language and says, in words, what pressing it will do: hovering
   * the Union Flag reads "ប្តូរទៅភាសាខ្មែរ". Labelling it "English" would
   * describe the picture and leave the behaviour to be guessed at.
   *
   * <p>No `aria-pressed`. This is an action, not a toggle sitting in an on or
   * off state - there is no sense in which "English" is pressed and "Khmer" is
   * released.
   *
   * <p>The flip below is written for exactly two locales, which is what
   * LOCALES holds. A third would need this to become a menu; there is no
   * sensible one-button gesture for cycling three languages, and dropping one
   * in would silently make the third unreachable.
   */
  const other = locale === "en" ? "km" : "en";
  const switchTo = other === "km" ? "ភាសាខ្មែរ" : "English";
  const langToggle = (
    <button
      type="button"
      className="nav-icon-btn lang-btn"
      onClick={() => setLocale(other)}
      title={locale === "km" ? `ប្តូរទៅ${switchTo}` : `Switch to ${switchTo}`}
      aria-label={
        locale === "km" ? `ប្តូរទៅ${switchTo}` : `Switch to ${switchTo}`
      }
    >
      <Flag code={locale} size={20} />
    </button>
  );

  const themeToggle = (
    <button
      className="nav-icon-btn theme-toggle"
      onClick={toggleTheme}
      title={isDark ? t("lightMode") : t("darkMode")}
      aria-label={isDark ? t("lightMode") : t("darkMode")}
      aria-pressed={isDark}
    >
      <Icon name={isDark ? "sun" : "moon"} size={17} />
    </button>
  );

  const displayPrefs = (
    <div className="pref-group">
      {langToggle}
      {themeToggle}
    </div>
  );

  return (
    <nav className="nav" ref={navRef}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand" aria-label={t("brand")}>
          <img
            className="nav-mark"
            src="/logo/CB-mark.png"
            alt=""
            width="280"
            height="320"
            aria-hidden="true"
          />
          <span className="nav-brand-text">{t("brand")}</span>
        </Link>

        {/* -------------------------------------------- wide bar: the middle */}
        {/*
          Destinations only, and centred by the grid rather than by a margin.
          Everything that is not somewhere to go - the countdown, the
          preferences, the bell, the account - moved out to .nav-right, which
          is what lets this row sit in the optical centre of the bar instead of
          being shoved leftward by however wide the right-hand cluster happens
          to be for this particular signed-in user.
        */}
        <div className="nav-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              {l.label}
            </NavLink>
          ))}
        </div>

        {/* --------------------------------------------- wide bar: the right */}
        <div className="nav-right">
          {/* First in the cluster because it is the only thing here that is
              running out. A live hold is the most time-critical thing on the
              screen and it reads left-to-right before the controls do. */}
          {showHold && (
            <Link
              to={`/checkout?event=${hold.eventId || hold.event_id}&hold=${hold.id}`}
              className="nav-link nav-hold"
            >
              <Icon name="clock" size={14} />
              {countdown(holdMsLeft)}
            </Link>
          )}

          {/* Divider between active reservation hold and navbar controls */}
          {showHold && <span className="nav-sep" aria-hidden="true" />}

          {/* Theme toggle directly in the navbar, replacing search */}
          {themeToggle}

          {!isAuthenticated && langToggle}

          {/* Divider before auth buttons for unauthenticated visitors */}
          {!isAuthenticated && <span className="nav-sep" aria-hidden="true" />}

          {isAuthenticated ? (
            <>
              <NotificationBell />

              {/* The account, as the avatar and nothing else - the same
                  control the narrow bar has always used, promoted to every
                  width.

                  The name and role went with the redesign. They were the
                  widest thing in the bar and the least load-bearing: your own
                  name tells you nothing you did not know, and both are
                  restated at the top of the panel this button opens, next to
                  the settings they actually belong beside.

                  A button, not a link: it opens a panel over the page you are
                  on rather than navigating anywhere. */}
              <button
                type="button"
                className="nav-avatar-btn"
                onClick={onOpenAccount}
                title={t("myAccount")}
                aria-label={t("myAccount")}
              >
                <span className="avatar" aria-hidden="true">
                  {user.display_name.slice(0, 1).toUpperCase()}
                </span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">
                {t("login")}
              </NavLink>
              <Link to="/register" className="btn btn-sm btn-accent">
                {t("register")}
              </Link>
            </>
          )}
        </div>

        {/* --------------------------------------------------- narrow screens */}
        <div className="nav-compact">
          {/* No search icon out here - it is a field at the top of the drawer
              instead. The compact bar is four controls wide already with a
              live hold in it, and search is the one of them that needs
              somewhere to type rather than just somewhere to tap. */}

          {/* Time-critical hold countdown first */}
          {showHold && (
            <Link
              to={`/checkout?event=${hold.eventId || hold.event_id}&hold=${hold.id}`}
              className="nav-link nav-hold"
              aria-label={t("holdActive")}
            >
              <Icon name="clock" size={14} />
              {countdown(holdMsLeft)}
            </Link>
          )}

          {/* Outside the drawer, like the hold countdown: a badge folded behind
              a burger cannot tell you there is anything to open it for. */}
          {isAuthenticated && <NotificationBell />}

          {/* The account, as an initial and nothing else.
              It sat only inside the drawer, which made reaching your own
              account on a phone a two-step guess: open a burger, hope it is in
              there. It is the destination people reach for most after the
              links themselves, so it earns a permanent slot - and at this
              width it can only afford to be one glyph wide, which the avatar
              already is. Same button and same panel as the wide bar; only the
              name and role label are dropped. */}
          {isAuthenticated && (
            <button
              type="button"
              className="nav-avatar-btn"
              onClick={onOpenAccount}
              title={t("myAccount")}
              aria-label={t("myAccount")}
            >
              <span className="avatar" aria-hidden="true">
                {user.display_name.slice(0, 1).toUpperCase()}
              </span>
            </button>
          )}

          <button
            className={`nav-icon-btn nav-burger ${menuOpen ? "on" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="nav-drawer"
          >
            <Icon name={menuOpen ? "close" : "menu"} size={18} />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------ mobile drawer */}
      {menuOpen && (
        <div className="nav-drawer" id="nav-drawer">
          <div className="nav-drawer-inner">
            {isAuthenticated ? (
              <div className="drawer-user">
                <button
                  type="button"
                  className="drawer-who"
                  onClick={onOpenAccount}
                  title={t("myAccount")}
                >
                  <span className="avatar" aria-hidden="true">
                    {user.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="nav-who">
                    {user.display_name}
                    <span>{ROLE_LABEL[role]}</span>
                  </span>
                </button>
              </div>
            ) : (
              <div className="drawer-auth">
                <Link className="btn btn-outline btn-block" to="/login">
                  <Icon name="login" size={16} />
                  {t("login")}
                </Link>
                <Link className="btn btn-accent btn-block" to="/register">
                  {t("register")}
                </Link>
              </div>
            )}

            <div className="drawer-links">
              {drawerLinks.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className="drawer-link"
                >
                  <Icon name={l.icon} size={17} />
                  {l.label}
                  <Icon name="chevronRight" size={15} className="ml-auto" />
                </NavLink>
              ))}
            </div>

            <div className="drawer-foot">{displayPrefs}</div>
          </div>
        </div>
      )}
    </nav>
  );
}
