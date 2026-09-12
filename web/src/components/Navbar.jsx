import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import Icon from './Icon.jsx'
import NotificationBell from './NotificationBell.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { countdown } from '../lib/format.js'

const ROLE_LABEL = {
  CUSTOMER: 'Customer',
  ORGANIZER: 'Organizer',
  PLATFORM_ADMIN: 'Platform admin',
}

export default function Navbar({ onOpenAccount }) {
  const { isAuthenticated, user, role, isOrganizer, isAdmin } = useAuth()
  const { t, locale, setLocale } = useLocale()
  const { isDark, toggle: toggleTheme } = useTheme()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef(null)

  // Close both panels on navigation, on Escape, and on an outside click.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onClick = (e) => {
      if (!navRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [menuOpen])

  const [hold, setHold] = useState(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setHold(null)
      return
    }
    import('../api/holds.js').then(({ getMyActiveHold }) => {
      const fetchHold = () => {
        getMyActiveHold()
          .then((holds) => setHold(holds && holds.length > 0 ? holds[0] : null))
          .catch(() => setHold(null))
      }
      fetchHold()
      const poll = setInterval(fetchHold, 10000)
      return () => clearInterval(poll)
    })
  }, [isAuthenticated, user?.id])

  // A live hold is the most time-critical thing on screen: surface it globally,
  // at every width — it stays outside the drawer so it is never hidden.
  const holdMsLeft = hold ? new Date(hold.expires_at || hold.expiresAt).getTime() - now : 0
  const showHold = hold && holdMsLeft > 0

  /*
   * Two lists, because the bar and the drawer are answering different
   * questions.
   *
   * The bar is what you reach for repeatedly, and every permanent item in it
   * costs the ones beside it some attention. So it carries only destinations:
   * Home is not one, because the brand lockup to its left already goes there,
   * and "Become an organizer" is not one either - it is a thing you do once,
   * which is why it now lives in the account panel.
   *
   * The drawer has room and no such competition, so it keeps both: there is no
   * brand link to press inside it, and a phone user should not have to know the
   * account panel exists to find the organiser application.
   */
  const links = [
    { to: '/events', label: t('events'), icon: 'calendar', show: true },
    { to: '/my-bookings', label: t('myBookings'), icon: 'ticket', show: isAuthenticated },
    { to: '/organizer', label: t('organizer'), icon: 'building', show: isOrganizer },
    { to: '/admin', label: t('admin'), icon: 'shield', show: isAdmin },
  ].filter((l) => l.show)

  const drawerLinks = [
    { to: '/', label: t('home'), icon: 'home', end: true, show: true },
    ...links,
    // Never shown beside the /organizer link: isOrganizer covers ORGANIZER and
    // PLATFORM_ADMIN, so exactly one of these two rows is ever visible and they
    // can share the building icon without ambiguity.
    {
      to: '/become-an-organizer',
      label: t('becomeOrganizer'),
      icon: 'building',
      show: isAuthenticated && !isOrganizer,
    },
  ].filter((l) => l.show)

  const displayPrefs = (
    <div className="pref-group">
      <div className="lang-toggle" role="group" aria-label="Language">
        <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
          EN
        </button>
        <button aria-pressed={locale === 'km'} onClick={() => setLocale('km')} className="km">
          ខ្មែរ
        </button>
      </div>
      <button
        className="nav-icon-btn theme-toggle"
        onClick={toggleTheme}
        title={isDark ? t('lightMode') : t('darkMode')}
        aria-label={isDark ? t('lightMode') : t('darkMode')}
        aria-pressed={isDark}
      >
        <Icon name={isDark ? 'sun' : 'moon'} size={17} />
      </button>
    </div>
  )

  return (
    <nav className="nav" ref={navRef}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand" aria-label={t('brand')}>
          <img className="nav-mark" src="/logo/CB-mark.png" alt="" width="280" height="320" aria-hidden="true" />
          <span className="nav-brand-text">{t('brand')}</span>
        </Link>

        {/* ------------------------------------------------ wide-screen bar */}
        <div className="nav-links">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className="nav-link">
              {l.label}
            </NavLink>
          ))}

          {showHold && (
            <Link to={`/events/${hold.eventId || hold.event_id}`} className="nav-link nav-hold">
              <Icon name="clock" size={14} />
              {countdown(holdMsLeft)}
            </Link>
          )}

          <span className="nav-sep" aria-hidden="true" />

          {/* Only for visitors with no account to keep them in. Signed in, both
              of these live in the account panel: they are set once and then
              never touched, and two permanent controls in the bar for that is
              most of what made it feel crowded. */}
          {!isAuthenticated && displayPrefs}

          {isAuthenticated ? (
            <>
              <NotificationBell />

              {/* Your own name and face are the way into your account -
                  clicking them is what people try first, and a chip that
                  looks like a person but does nothing reads as broken.
                  A button, not a link: it opens a panel over the page you are
                  already on rather than navigating anywhere. */}
              <button
                type="button"
                className="nav-user"
                onClick={onOpenAccount}
                title={t('myAccount')}
              >
                <span className="avatar" aria-hidden="true">
                  {user.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="nav-who">
                  {user.display_name}
                  <span>{ROLE_LABEL[role]}</span>
                </span>
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className="nav-link">
                {t('login')}
              </NavLink>
              <Link to="/register" className="btn btn-sm btn-accent">
                {t('register')}
              </Link>
            </>
          )}

        </div>

        {/* --------------------------------------------------- narrow screens */}
        <div className="nav-compact">
          {/* Outside the drawer, like the hold countdown: a badge folded behind
              a burger cannot tell you there is anything to open it for. */}
          {isAuthenticated && <NotificationBell />}
          {showHold && (
            <Link to={`/events/${hold.eventId || hold.event_id}`} className="nav-link nav-hold" aria-label={t('holdActive')}>
              <Icon name="clock" size={14} />
              {countdown(holdMsLeft)}
            </Link>
          )}
          <button
            className={`nav-icon-btn nav-burger ${menuOpen ? 'on' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="nav-drawer"
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={18} />
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
                  title={t('myAccount')}
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
                  {t('login')}
                </Link>
                <Link className="btn btn-accent btn-block" to="/register">
                  {t('register')}
                </Link>
              </div>
            )}

            <div className="drawer-links">
              {drawerLinks.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.end} className="drawer-link">
                  <Icon name={l.icon} size={17} />
                  {l.label}
                  <Icon name="chevronRight" size={15} className="ml-auto" />
                </NavLink>
              ))}
            </div>

            <div className="drawer-foot">
              {displayPrefs}
            </div>
          </div>
        </div>
      )}

    </nav>
  )
}
