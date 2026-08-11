import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { pick as pickField, statusLabel, translate } from '../lib/i18n.js'
import { formatDate, formatDateTime, formatTime } from '../lib/format.js'

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(() => localStorage.getItem('locale') || 'en')

  useEffect(() => {
    localStorage.setItem('locale', locale)
    // Drives the Khmer font stack + taller line-height in the stylesheet.
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      isKm: locale === 'km',
      t: (key) => translate(key, locale),
      pick: (record, field) => pickField(record, field, locale),
      status: (s) => statusLabel(s, locale),
      date: (iso) => formatDate(iso, locale),
      time: (iso) => formatTime(iso, locale),
      dateTime: (iso) => formatDateTime(iso, locale),
    }),
    [locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}

/** Renders a bilingual pair, keeping the secondary line visible but quiet. */
export function useBilingual() {
  const { locale } = useLocale()
  return useCallback(
    (record, field) => {
      const primary = record?.[`${field}_${locale}`] || record?.[`${field}_en`] || ''
      const other = locale === 'en' ? record?.[`${field}_km`] : record?.[`${field}_en`]
      return { primary, secondary: other && other !== primary ? other : '', otherIsKm: locale === 'en' }
    },
    [locale],
  )
}
