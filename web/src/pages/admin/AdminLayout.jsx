import { Outlet } from 'react-router-dom'
import RoleSubnav from '../../components/RoleSubnav.jsx'
import { useLocale } from '../../context/LocaleContext.jsx'

export default function AdminLayout() {
  const { t } = useLocale()
  return (
    <>
      <RoleSubnav
        links={[
          { to: '/admin', label: t('adminDashboard'), end: true },
          { to: '/admin/users', label: t('users') },
          { to: '/admin/events', label: t('moderation') },
          { to: '/admin/payments', label: t('payments') },
        ]}
      />
      <Outlet />
    </>
  )
}
