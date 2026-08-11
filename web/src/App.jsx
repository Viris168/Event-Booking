import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import ProtectedRoute from './routes/ProtectedRoute.jsx'

import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import EventDetailPage from './pages/EventDetailPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import PaymentPage from './pages/PaymentPage.jsx'
import BookingDetailPage from './pages/BookingDetailPage.jsx'
import MyBookingsPage from './pages/MyBookingsPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

import OrganizerLayout from './pages/organizer/OrganizerLayout.jsx'
import OrganizerDashboardPage from './pages/organizer/OrganizerDashboardPage.jsx'
import OrganizerVenuesPage from './pages/organizer/OrganizerVenuesPage.jsx'
import SeatMapEditorPage from './pages/organizer/SeatMapEditorPage.jsx'
import EventFormPage from './pages/organizer/EventFormPage.jsx'
import EventSalesPage from './pages/organizer/EventSalesPage.jsx'
import CheckInPage from './pages/organizer/CheckInPage.jsx'

import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx'
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx'
import AdminEventsPage from './pages/admin/AdminEventsPage.jsx'
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage.jsx'

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          {/* ------------------------------------------------ public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />

          {/* ---------------------------------- any logged-in customer */}
          <Route element={<ProtectedRoute />}>
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/checkout/:bookingId/pay" element={<PaymentPage />} />
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/my-bookings" element={<MyBookingsPage />} />
          </Route>

          {/* -------------------------------- ORGANIZER (+ admin) area */}
          <Route element={<ProtectedRoute roles={['ORGANIZER']} />}>
            <Route path="/organizer" element={<OrganizerLayout />}>
              <Route index element={<OrganizerDashboardPage />} />
              <Route path="venues" element={<OrganizerVenuesPage />} />
              <Route path="venues/:id/seat-map" element={<SeatMapEditorPage />} />
              <Route path="events/new" element={<EventFormPage />} />
              <Route path="events/:id/edit" element={<EventFormPage />} />
              <Route path="events/:id/sales" element={<EventSalesPage />} />
              <Route path="check-in" element={<CheckInPage />} />
            </Route>
          </Route>

          {/* --------------------------------- PLATFORM_ADMIN area */}
          <Route element={<ProtectedRoute roles={['PLATFORM_ADMIN']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route path="events" element={<AdminEventsPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
