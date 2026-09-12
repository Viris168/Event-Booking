import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../context/LocaleContext.jsx'

/*
 * Google's own button, rendered by Google's own script.
 *
 * Not a button of ours that calls an SDK. Google Identity Services renders the
 * control inside a cross-origin iframe and hands back an ID token through the
 * callback - a look-alike we styled ourselves could not obtain one, and the
 * branding rules do not allow it anyway.
 *
 * The script is loaded here rather than in index.html so a deployment with no
 * client id never contacts Google at all: nothing renders, nothing is fetched,
 * and the sign-in screens simply have one fewer option.
 */

const SRC = 'https://accounts.google.com/gsi/client'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

/** One shared load. Two screens mounting at once must not inject two scripts. */
let loader = null
function loadGis() {
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const el = document.createElement('script')
    el.src = SRC
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => {
      // Let a later mount try again - this is usually a blocked network rather
      // than a permanent condition.
      loader = null
      reject(new Error('Could not load Google sign-in'))
    }
    document.head.appendChild(el)
  })
  return loader
}

/**
 * @param {(idToken: string) => void} onToken receives the credential to POST to
 *        /auth/google. This component never talks to our API itself.
 */
export default function GoogleSignInButton({ onToken, disabled = false }) {
  const { locale } = useLocale()
  const km = locale === 'km'
  const hostRef = useRef(null)
  const [failed, setFailed] = useState(false)

  /*
   * The callback has to survive re-renders without re-initialising Google's
   * widget, so it lives in a ref that the (stable) callback below reads.
   * Passing onToken straight to initialize would re-run this effect on every
   * parent render and flicker the button.
   */
  const onTokenRef = useRef(onToken)
  onTokenRef.current = onToken

  useEffect(() => {
    if (!CLIENT_ID || !hostRef.current) return undefined
    let cancelled = false

    loadGis()
      .then(() => {
        if (cancelled || !hostRef.current) return
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (response) => onTokenRef.current?.(response.credential),
        })
        window.google.accounts.id.renderButton(hostRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          locale: km ? 'km' : 'en',
        })
      })
      .catch(() => !cancelled && setFailed(true))

    return () => {
      cancelled = true
    }
  }, [km])

  // Nothing at all when the deployment has no client id. An "unavailable"
  // message would be telling users about a feature that does not exist here.
  if (!CLIENT_ID) return null

  if (failed) {
    return (
      <p className="small muted">
        {km ? 'មិនអាចផ្ទុកការចូលដោយ Google បានទេ។' : 'Google sign-in could not load.'}
      </p>
    )
  }

  return (
    <div className="gsi-wrap" aria-busy={disabled}>
      <div className="gsi-sep">
        <span>{km ? 'ឬ' : 'or'}</span>
      </div>
      {/* Google draws into this node. Height is reserved so the form does not
          jump when the widget arrives a moment after the page. */}
      <div ref={hostRef} className="gsi-host" />
      <style>{`
        .gsi-wrap { display: flex; flex-direction: column; gap: .75rem; align-items: center; }
        .gsi-sep { display: flex; align-items: center; gap: .75rem; width: 100%;
                   color: var(--color-muted); font-size: .8rem; }
        .gsi-sep::before, .gsi-sep::after { content: ''; flex: 1;
                                            border-top: 1px solid var(--color-line); }
        .gsi-host { min-height: 44px; display: flex; justify-content: center; width: 100%; }
      `}</style>
    </div>
  )
}
