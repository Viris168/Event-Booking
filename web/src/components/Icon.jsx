/**
 * Inline stroke-icon set (no icon-font, no dependency, no network request).
 * Icons inherit `currentColor` and the surrounding font size by default, so
 * they sit on the text baseline of whatever they label.
 */

const PATHS = {
  // wayfinding
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4.2-4.2',
  filter: 'M4 5h16M7 12h10M10 19h4',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  arrowLeft: 'M20 12H5M11 18 5 12l6-6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronDown: 'M6 9l6 6 6-6',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',

  // domain
  ticket:
    'M4 9V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2a2.5 2.5 0 0 0 0 5v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a2.5 2.5 0 0 0 0-5ZM14 6v12',
  seat: 'M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M4 12h16v5H4zM6 17v3M18 17v3',
  calendar: 'M4 7h16v13H4zM4 11h16M8 3v4M16 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3.5 2',
  mapPin: 'M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  card: 'M3 7h18v11H3zM3 11h18M7 15h3',
  bank: 'M4 10 12 4l8 6M6 10v9M18 10v9M4 20h16M10 20v-5h4v5',
  wallet: 'M4 8h16v11H4zM4 8V6a1 1 0 0 1 1-1h11v3M16 13.5h2',
  chart: 'M5 20V11M12 20V5M19 20v-6M3.5 20h17',
  trending: 'M4 16l5-5 3.5 3.5L20 7M20 7h-4M20 7v4',
  building: 'M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M3.5 21h17M8 8h4M8 12h4M8 16h4',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',

  // people & auth
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5',
  users:
    'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c0-3 2.9-5 6.5-5s6.5 2 6.5 5M16 5.5a3.5 3.5 0 0 1 0 7M18 15.2c2.1.7 3.5 2.2 3.5 4.3',
  logout: 'M15 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M11 8 7 12l4 4M7 12h9',
  login: 'M9 5H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M14 8l4 4-4 4M18 12H9',
  shield: 'M12 21s7-3.2 7-9V6l-7-3-7 3v6c0 5.8 7 9 7 9ZM9 12l2 2 4-4',
  settings:
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM12 3v2.4M12 18.6V21M4.2 7.5l2 1.2M17.8 15.3l2 1.2M4.2 16.5l2-1.2M17.8 8.7l2-1.2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3Z',
  phone: 'M7 3h3l1.5 4-2 1.5a11 11 0 0 0 5 5L16 11.5 20 13v3a2 2 0 0 1-2.2 2A15 15 0 0 1 5 5.2 2 2 0 0 1 7 3Z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',

  // status
  check: 'M4.5 12.5 9.5 17.5 20 7',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8 12.2l2.6 2.6L16 9.5',
  alert: 'M12 3.5 21 19H3L12 3.5ZM12 9.5v4.5M12 16.6v.4',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v6M12 7.6v.4',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9 9l6 6M15 9l-6 6',
  refresh: 'M20 11a8 8 0 0 0-13.7-4.7L4 8.5M4 5v3.5h3.5M4 13a8 8 0 0 0 13.7 4.7L20 15.5M20 19v-3.5h-3.5',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  edit: 'M5 19h3l10-10-3-3L5 16v3ZM14.5 6.5l3 3',
  trash: 'M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13',
  eye: 'M2.5 12S6 6.5 12 6.5S21.5 12 21.5 12S18 17.5 12 17.5S2.5 12 2.5 12ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',

  // categories
  music: 'M9 18V6l11-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM20 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z',
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3ZM7 11a5 5 0 0 0 10 0M12 17v4M9 21h6',
  festival: 'M12 3v3M5 21V10l7-4 7 4v11M5 21h14M9.5 21v-5h5v5M4 10h16',
  culture:
    'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3ZM18 15.5l.85 2.15 2.15.85-2.15.85L18 21.5l-.85-2.15L15 18.5l2.15-.85L18 15.5Z',
  sport:
    'M7 4h10v4a5 5 0 0 1-10 0V4ZM7 6H4v1a4 4 0 0 0 3.2 3.9M17 6h3v1a4 4 0 0 1-3.2 3.9M12 13v4M8.5 20.5h7M9.5 20.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5',
  comedy: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8M9 10h.01M15 10h.01',
  conference: 'M4 6h16v9H4zM9 19h6M12 15v4M8.5 10.5 11 12.5l4-4',
}

export default function Icon({ name, size = 18, strokeWidth = 1.75, className = '', title }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={`M${seg}`} />
      ))}
    </svg>
  )
}

/** Category glyph used on event covers and cards. */
export const CATEGORY_ICON = {
  music: 'music',
  festival: 'festival',
  conference: 'conference',
  culture: 'culture',
  sport: 'sport',
  comedy: 'comedy',
}
