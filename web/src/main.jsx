import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LocaleProvider } from './context/LocaleContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import { NotificationProvider } from './context/NotificationContext.jsx'
import { hideSplash } from './lib/splash.js'
import './styles/index.css'

// Hides the index.html splash once the app has rendered, without waiting for
// a saved session to resume. Public pages do not need /auth/me to draw, and
// the two places that do cover the gap themselves: ProtectedRoute renders a
// page skeleton and the navbar holds a placeholder avatar, so neither a blank
// frame nor a flash of "Log in" is uncovered. splash.js still keeps it up for
// its minimum, so a warm load does not flash the logo.
function SplashGate() {
  React.useEffect(() => {
    hideSplash()
  }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LocaleProvider>
        <ToastProvider>
          <AuthProvider>
            {/* Inside AuthProvider: the inbox is per-user, and the poller has to
                stop the moment there is no session to poll for. */}
            <NotificationProvider>
              <SplashGate />
              <App />
            </NotificationProvider>
          </AuthProvider>
        </ToastProvider>
        </LocaleProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
