import { Outlet } from 'react-router-dom'
import RoleSubnav from '../../components/RoleSubnav.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'
import { Alert } from '../../components/ui.jsx'

export default function OrganizerLayout() {
  const { t } = useLocale()
  const { organizerProfile, isAdmin } = useAuth()

  return (
    <>
      <RoleSubnav
        links={[
          { to: '/organizer', label: t('myEvents'), end: true },
          { to: '/organizer/venues', label: t('venues') },
          { to: '/organizer/check-in', label: t('checkIn') },
        ]}
      />
      {!organizerProfile && isAdmin && (
        <div className="container pt-0!" style={{ paddingBottom: 0 }}>
          <Alert tone="info" title="Viewing as platform admin">
            You have no organizer profile of your own, so these screens show every organizer's
            events and venues.
          </Alert>
        </div>
      )}
      <Outlet />
    </>
  )
}
