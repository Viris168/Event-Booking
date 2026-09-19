import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import Footer from './components/Footer.jsx'
import ProtectedRoute from './routes/ProtectedRoute.jsx'
import AccountPanel from './components/AccountPanel.jsx'
import PhoneGate from './components/PhoneGate.jsx'

import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import EventsPage from './pages/EventsPage.jsx'
import EventDetailPage from './pages/EventDetailPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import PaymentPage from './pages/PaymentPage.jsx'
import BookingDetailPage from './pages/BookingDetailPage.jsx'
import MyBookingsPage from './pages/MyBookingsPage.jsx'
import BecomeOrganizerPage from './pages/BecomeOrganizerPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import ContactPage from './pages/ContactPage.jsx'
import NotFoundPage from './pages/NotFoundPage.jsx'

import OrganizerLayout from './pages/organizer/OrganizerLayout.jsx'
import OrganizerDashboardPage from './pages/organizer/OrganizerDashboardPage.jsx'
import OrganizerVenuesPage from './pages/organizer/OrganizerVenuesPage.jsx'
import SeatMapEditorPage from './pages/organizer/SeatMapEditorPage.jsx'
import EventFormPage from './pages/organizer/EventFormPage.jsx'
import EventSalesPage from './pages/organizer/EventSalesPage.jsx'
import OrganizerTransactionsPage from './pages/organizer/OrganizerTransactionsPage.jsx'
import OrganizerPayoutsPage from './pages/organizer/OrganizerPayoutsPage.jsx'
import PayoutInvoicePage from './pages/organizer/PayoutInvoicePage.jsx'
import CheckInPage from './pages/organizer/CheckInPage.jsx'

import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboardPage from './pages/admin/AdminDashboardPage.jsx'
import AdminUsersPage from './pages/admin/AdminUsersPage.jsx'
import AdminEventsPage from './pages/admin/AdminEventsPage.jsx'
import AdminReviewPage from './pages/admin/AdminReviewPage.jsx'
import AdminApplicationsPage from './pages/admin/AdminApplicationsPage.jsx'
import AdminPaymentsPage from './pages/admin/AdminPaymentsPage.jsx'
import AdminPayoutsPage from './pages/admin/AdminPayoutsPage.jsx'
import AdminContactPage from './pages/admin/AdminContactPage.jsx'

export default function App() {
  /*
   * The account panel lives here rather than in Navbar because it is portalled
   * to <body> and overlays every route - it is the shell's, not the nav's. The
   * nav only owns the thing you click to open it.
   */
  const [accountOpen, setAccountOpen] = useState(false)

  return (
    <>
      {/* Keyboard users should not have to tab through the whole nav. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollToTop />
      <Navbar onOpenAccount={() => setAccountOpen(true)} />
      <main id="main" tabIndex={-1}>
        <Routes>
          {/* ------------------------------------------------ public */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          {/* Public on purpose, and it is the one page where that matters
              most: the reason somebody writes in is often that they cannot
              sign in, so putting the contact form behind a login would close
              the door to exactly the people knocking on it. POST /contact is
              permitted without a token for the same reason - see
              SecurityConfig. */}
          <Route path="/contact" element={<ContactPage />} />

          {/* ---------------------------------- any logged-in customer */}
          <Route element={<ProtectedRoute />}>
            {/* A Google account has no phone number, and a ticket is collected
                against one. Gated here rather than at sign-in so browsing stays
                open and only paying is interrupted. */}
            <Route
              path="/checkout"
              element={
                <PhoneGate>
                  <CheckoutPage />
                </PhoneGate>
              }
            />
            <Route path="/checkout/:bookingId/pay" element={<PaymentPage />} />
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/my-bookings" element={<MyBookingsPage />} />
            {/* Not under /organizer or /admin: one inbox serves all three
                roles, and what you were sent is what you see. */}
            <Route path="/notifications" element={<NotificationsPage />} />
            {/* Not under /organizer: that subtree needs the ORGANIZER role,
                and everyone this page is for does not have it yet. */}
            <Route path="/become-an-organizer" element={<BecomeOrganizerPage />} />
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
              <Route path="transactions" element={<OrganizerTransactionsPage />} />
              {/* What the organiser is owed, vs. transactions, which is what
                  customers paid. Different money moving in different
                  directions, so a tab each. */}
              <Route path="payouts" element={<OrganizerPayoutsPage />} />
              {/* The printable invoice. Under the organiser subtree because the
                  ownership check is the same one; it just renders for paper. */}
              <Route path="payouts/:id" element={<PayoutInvoicePage />} />
              <Route path="check-in" element={<CheckInPage />} />
            </Route>
          </Route>

          {/* --------------------------------- PLATFORM_ADMIN area */}
          <Route element={<ProtectedRoute roles={['PLATFORM_ADMIN']} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              {/* The queue you work through, vs. /admin/events which is the
                  directory you browse. Different sort, default and action. */}
              <Route path="review" element={<AdminReviewPage />} />
              {/* Applications gate who may run events at all; /admin/review
                  judges what an already-trusted organiser submitted. */}
              <Route path="applications" element={<AdminApplicationsPage />} />
              <Route path="events" element={<AdminEventsPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              {/* /admin/payments is money coming in from customers;
                  /admin/payouts is money going out to organisers. Neither
                  screen's filters or actions make sense on the other. */}
              <Route path="payouts" element={<AdminPayoutsPage />} />
              {/* The same invoice the organiser gets, fetched through the
                  admin endpoint - see PayoutInvoicePage. The admin is the one
                  making the transfer and had no way to print the document it
                  is made against. */}
              <Route path="payouts/:id" element={<PayoutInvoicePage />} />
              {/* The other end of /contact. Under the admin prefix, which
                  SecurityConfig closes to PLATFORM_ADMIN - the public half
                  takes anonymous writes, and the two sides of one table sit
                  on opposite sides of the strongest rule in the chain. */}
              <Route path="contact-messages" element={<AdminContactPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />
      <Footer />
    </>
  )
}
