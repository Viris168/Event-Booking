import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { pick as pickField, statusLabel, translate } from '../lib/i18n.js'
import { formatDate, formatDateTime, formatTime } from '../lib/format.js'
import { withViewTransition } from '../lib/viewTransition.js'

const LocaleContext = createContext(null)

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => localStorage.getItem('locale') || 'en')

  useEffect(() => {
    localStorage.setItem('locale', locale)
    // Drives the Khmer font stack + taller line-height in the stylesheet.
    document.documentElement.lang = locale
  }, [locale])

  // Every user-driven switch (navbar toggle, Account panel) goes through here,
  // the same way setTheme does. Khmer runs taller than Latin, so the page
  // genuinely changes height; fading old page out and new page in covers that
  // with one soft change instead of a visible jump, without the reload that
  // would lose a half-filled form or a scroll position.
  //
  // `lang` is written here rather than left to the effect above: the effect
  // runs after the new text has painted, which showed Khmer in the Latin font
  // for a frame and then reflowed it a second time. Setting it inside the
  // transition puts the words and the font stack in the same "after" frame.
  const setLocale = useCallback((next) => {
    if (next === document.documentElement.lang) return
    withViewTransition(() => {
      document.documentElement.lang = next
      setLocaleState(next)
    }, 'locale')
  }, [])

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
    [locale, setLocale],
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
