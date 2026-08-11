import { Link } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { useLocale } from '../context/LocaleContext.jsx'

export default function NotFoundPage() {
  const { t } = useLocale()
  return (
    <div className="container container-narrow">
      <div className="empty">
        <span className="icon-chip lg plain" style={{ margin: '0 auto 0.8rem' }}>
          <Icon name="ticket" size={22} />
        </span>
        <h1>404 — {t('notFoundTitle')}</h1>
        <p className="muted">{t('notFoundSub')}</p>
        <div className="row" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <Link className="btn btn-primary" to="/">
            {t('home')}
          </Link>
          <Link className="btn btn-outline" to="/events">
            {t('browseEvents')}
          </Link>
        </div>
      </div>
    </div>
  )
}
