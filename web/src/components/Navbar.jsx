import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import Icon from './Icon.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLocale } from '../context/LocaleContext.jsx'
import { activeHoldsForUser, useStore } from '../mock/store.js'
import { countdown } from '../lib/format.js'

const ROLE_LABEL = {
  CUSTOMER: 'Customer',
  ORGANIZER: 'Organizer',
  PLATFORM_ADMIN: 'Platform admin',
}

export default function Navbar() {
  const { isAuthenticated, user, role, isOrganizer, isAdmin, logout, switchTo } = useAuth()
  const { t, locale, setLocale } = useLocale()
  const navigate = useNavigate()
  useStore() // keeps the hold pill counting down
  const [showSwitcher, setShowSwitcher] = useState(false)
  const switcherRef = useRef(null)

  useEffect(() => {
    if (!showSwitcher) return
    const onClick = (e) => {
      if (!switcherRef.current?.contains(e.target)) setShowSwitcher(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showSwitcher])

  // A live hold is the most time-critical thing on screen: surface it globally.
  const hold = isAuthenticated ? activeHoldsForUser(user.id)[0] : null
  const holdMsLeft = hold ? new Date(hold.expires_at).getTime() - Date.now() : 0

  function onLogout() {
    logout()
    navigate('/')
  }

  return (
    <nav className="nav" ref={switcherRef}>
      <div className="nav-inner">
        <Link to="/" className="nav-brand">
          <span className="nav-mark" aria-hidden="true">
            <Icon name="ticket" size={17} strokeWidth={2} />
          </span>
          {t('brand')}
        </Link>

        <div className="nav-links">
          <NavLink to="/" end className="nav-link">
            {t('home')}
          </NavLink>
          <NavLink to="/events" className="nav-link">
            {t('events')}
          </NavLink>
          {isAuthenticated && (
            <NavLink to="/my-bookings" className="nav-link">
              {t('myBookings')}
            </NavLink>
          )}
          {isOrganizer && (
            <NavLink to="/organizer" className="nav-link">
              {t('organizer')}
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className="nav-link">
              {t('admin')}
            </NavLink>
          )}

          {hold && holdMsLeft > 0 && (
            <Link to={`/events/${hold.event_id}`} className="nav-link nav-hold">
              <Icon name="clock" size={14} />
              {countdown(holdMsLeft)}
            </Link>
          )}

          <span className="nav-sep" aria-hidden="true" />

          <div className="lang-toggle" role="group" aria-label="Language">
            <button aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
              EN
            </button>
            <button aria-pressed={locale === 'km'} onClick={() => setLocale('km')} className="km">
              ខ្មែរ
            </button>
          </div>

          {isAuthenticated ? (
            <>
              <div className="nav-user">
                <span className="avatar" aria-hidden="true">
                  {user.display_name.slice(0, 1).toUpperCase()}
                </span>
                <span className="nav-who">
                  {user.display_name}
                  <span>{ROLE_LABEL[role]}</span>
                </span>
              </div>
              <button className="nav-icon-btn" onClick={onLogout} title={t('logout')} aria-label={t('logout')}>
                <Icon name="logout" size={17} />
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

          {/* Demo affordance: the design has three role experiences, and this
              prototype has no real auth to switch between them. */}
          <button
            className={`nav-icon-btn ${showSwitcher ? 'on' : ''}`}
            onClick={() => setShowSwitcher((v) => !v)}
            title="Demo: switch role"
            aria-label="Demo: switch role"
            aria-expanded={showSwitcher}
          >
            <Icon name="settings" size={17} />
          </button>
        </div>
      </div>

      {showSwitcher && (
        <div className="role-switch">
          <div className="role-switch-inner">
            <span className="tiny">
              <Icon name="shield" size={13} /> Demo role switch
            </span>
            <button className="chip" onClick={() => { switchTo(1); setShowSwitcher(false) }}>
              <Icon name="user" size={13} /> Dara Sok · Customer
            </button>
            <button className="chip" onClick={() => { switchTo(2); setShowSwitcher(false) }}>
              <Icon name="building" size={13} /> Chantha Meas · Organizer
            </button>
            <button className="chip" onClick={() => { switchTo(3); setShowSwitcher(false) }}>
              <Icon name="shield" size={13} /> Platform Admin
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
