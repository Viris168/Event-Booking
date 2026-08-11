import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import Icon from '../components/Icon.jsx'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, tone = 'info', ttl = 4200) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((list) => [...list, { id, message, tone }])
      setTimeout(() => dismiss(id), ttl)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'bad' : t.tone === 'success' ? 'ok' : ''}`}>
            <Icon
              name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'checkCircle' : 'info'}
              size={16}
            />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx.toast
}
