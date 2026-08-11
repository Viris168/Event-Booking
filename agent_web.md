# Web frontend — change guide

The `web/` app is a **UI prototype**: React 19 + Vite + React Router 7, plain CSS,
**no API calls**. Everything on screen comes from an in-memory mock backend that
mirrors `api/src/main/resources/db/migration/V1__schema.sql` field for field, so
swapping in the real API later is a matter of replacing one file's functions.

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into web/dist
```

Demo logins (password `password` for all), or use the gear icon in the navbar to
switch roles without logging out:

| Login | Role |
|---|---|
| `dara@example.com` / `+85512345678` | `CUSTOMER` |
| `organizer@example.com` | `ORGANIZER` |
| `admin@example.com` | `PLATFORM_ADMIN` |

---

## 1. Where things live

```
web/src
├── main.jsx                  provider stack: Router > Locale > Toast > Auth > App
├── App.jsx                   ALL routes (public / customer / organizer / admin)
├── styles/index.css          the whole design system (tokens at the top)
├── lib/
│   ├── format.js             money (USD+KHR), dates, countdown, phone regex
│   └── i18n.js               EN/KM dictionary + status labels
├── mock/
│   ├── seed.js               the fake data itself (users, venues, events, bookings)
│   └── store.js              the fake "backend": every read/write the UI performs
├── context/
│   ├── AuthContext.jsx       session + role flags (isOrganizer / isAdmin)
│   ├── LocaleContext.jsx     locale, t(), pick(), date helpers
│   └── ToastContext.jsx      toast(message, 'info' | 'success' | 'error')
├── components/               Icon, Navbar, EventCard, SeatMap, ZonePicker,
│                             HoldBar, QrGlyph, TicketCard, ui.jsx (shared bits)
├── routes/ProtectedRoute.jsx role guard
└── pages/
    ├── (public + customer)   Home, Events, EventDetail, Checkout, Payment,
    │                         BookingDetail, MyBookings, Login, Register, NotFound
    ├── organizer/            Layout, Dashboard, Venues, SeatMapEditor,
    │                         EventForm, EventSales, CheckIn
    └── admin/                Layout, Dashboard, Users, Events, Payments
```

---

## 2. Common changes

### Colors, spacing, shadows
Everything is a token at the top of [web/src/styles/index.css](web/src/styles/index.css)
under `:root` — `--brand-*`, `--gold-*`, `--ink`, `--line`, `--r*` (radii),
`--shadow*`. Change a token, the whole app follows.

Booking-status colors are the `.s-<STATE>` classes in the same file. Each of the
eight booking states has its own pair; **don't collapse two states into one
color** — the brief requires distinct treatments.

### Icons
[web/src/components/Icon.jsx](web/src/components/Icon.jsx) is a self-contained
stroke-icon set (no icon font, no CDN). Add one by dropping an SVG path into
`PATHS`:

```js
const PATHS = { myIcon: 'M4 12h16M12 4v16' }   // then: <Icon name="myIcon" size={16} />
```

Multi-subpath icons just concatenate (`'M… M…'`) — the component splits on `M`.
Category icons for event covers are mapped in `CATEGORY_ICON` at the bottom.

### Text and translations
All UI chrome text is in the `dict` object in
[web/src/lib/i18n.js](web/src/lib/i18n.js):

```js
myKey: { en: 'Save changes', km: 'រក្សាទុកការផ្លាស់ប្តូរ' },
```

then `const { t } = useLocale()` → `t('myKey')`. Status labels (booking, event,
payment) live in `STATUS_LABELS` in the same file.

Content text (event titles, venue names, zone names) is **not** in the
dictionary — it comes from the data as `_en` / `_km` field pairs. Render it with
`pick(record, 'title')`, `<BiTitle record={event} field="title" />`, or a
`locale === 'km' ? x.title_km : x.title_en` ternary.

Khmer runs taller than Latin: `html[lang="km"]` switches the font stack and
line-height automatically. Add the `km` class to any single element that shows
Khmer while the UI is in English.

### Prices
The API speaks cents. Never print raw cents:

```jsx
import { usd, dualPrice } from '../lib/format.js'
usd(4500)                                  // "$45.00"
<Money cents={4500} />                     // "$45.00 · ៛184,500"
<Money cents={4500} stacked />             // USD over KHR (card footers)
```

The FX rate is `FX_RATE_KHR_PER_USD` in `lib/format.js`; bookings store their own
`fx_rate_khr_per_usd`, so pass `rate={booking.fx_rate_khr_per_usd}` when showing
a historical total.

### Fake data
[web/src/mock/seed.js](web/src/mock/seed.js) builds the world on page load.

- **Add an event** → another `addEvent({...})` call. `classes` = seated pricing
  per venue section, `zones` = general-admission tiers, `soldRatio` controls how
  full the seat map looks, `cover` picks a gradient (`.cover-*` in the CSS),
  `category` picks the icon.
- **Add a venue** → `addVenue({...}, [{ label: 'Zone A', rows: 6, cols: 12 }])`;
  the second argument generates the seat grid and `pos_x`/`pos_y`.
- **Add a booking** → `seedBooking({...})`; it wires up hold → booking → items →
  tickets → payment attempts → status history and moves the inventory to match.
- Data is **in memory only**: a page refresh resets it. Only the session
  (`mockUserId`) and locale persist in `localStorage`.

### Routes
All routes are in [web/src/App.jsx](web/src/App.jsx). To add a guarded page:

```jsx
<Route element={<ProtectedRoute roles={['ORGANIZER']} />}>
  <Route path="/organizer/reports" element={<ReportsPage />} />
</Route>
```

Roles are the backend enum values only: `CUSTOMER`, `ORGANIZER`,
`PLATFORM_ADMIN`. (`PLATFORM_ADMIN` automatically inherits `ORGANIZER` access.)
There is no `ADMIN` role — the old stub used one, it was wrong.

### Search / filters
The hero search is in `HomePage.jsx` (`QUICK_SEARCHES` holds the popular chips);
the full search panel is in `EventsPage.jsx`. Filters live in the URL query
string, so every filtered view is linkable. To add a filter: add it to `EMPTY`
in `EventsPage.jsx`, render a control that calls `update({ key: value })`, push a
chip into `chips`, and handle the key in `listEvents()` in `mock/store.js`.

Reusable pieces: `<SearchInput>`, `<IconSelect>`, `<ActiveFilters>` in
[web/src/components/ui.jsx](web/src/components/ui.jsx).

---

## 3. Rules the UI must keep (they mirror DB guarantees)

These are not stylistic preferences — the backend enforces them, so the UI must
not imply otherwise:

1. **A hold is not a purchase.** While a hold exists, its countdown must be
   visible (`<HoldBar>`; the navbar also shows a live pill). Seats are only the
   customer's once the booking is `CONFIRMED`.
2. **Holds expire loudly.** When one lapses, say so and return the picker to its
   normal state — never fail silently. See `expiredNotice` in `EventDetailPage`.
3. **One active hold per user per event.** On `HOLD_ALREADY_ACTIVE`, offer
   "Resume your hold", never a generic error.
4. **No double submit.** Disable Reserve / Pay on click. Backend idempotency is a
   backstop, not the first line of defence.
5. **Eight booking states, eight visual treatments** — see `.s-*` classes.
6. **Low inventory stays vague.** Under ~20 GA spots left, show "Almost full"
   rather than an exact number (`scarcity()` / `remainingCopy()`), but still cap
   the stepper at what actually remains.
7. **Every price in USD and KHR.**

---

## 4. Swapping the mock for the real API

The real client already exists in `web/src/api/` (axios instance + JWT
interceptor) and is currently unused. To go live:

1. Keep the function names in [web/src/mock/store.js](web/src/mock/store.js) —
   pages import them by name (`listEvents`, `createHold`, `createBooking`,
   `resolvePayment`, `checkInTicket`, …). Replace their bodies with API calls, or
   add a `src/api/`-backed module exporting the same names and change the imports.
2. Replace `useStore()` (a 1-second re-render tick that keeps countdowns live)
   with your data-fetching layer's subscription. Keep a ticking re-render
   somewhere, or the hold countdowns freeze.
3. Point `AuthContext` at `POST /auth/login` + `/auth/register` and decode the
   JWT for `role`; drop the `switchTo()` demo helper and the navbar gear button.
4. Delete the "Demo controls" block in `PaymentPage.jsx` — the real provider
   webhook drives those transitions.
5. Replace `QrGlyph` with a real QR encoder fed by the Bakong KHQR payload /
   ticket `qr_token`. It currently renders a deterministic QR-shaped placeholder
   that encodes nothing.
6. Wire `CheckInPage`'s camera (the frame is styled; capture is stubbed).

Everything else — layout, states, copy, validation — already matches the schema.

---

## 5. Known gaps (deliberate, per the brief)

- Seat-map authoring is a grid generator, not drag-and-drop.
- Event artwork is CSS gradients + a category icon; no image upload.
- No push/SMS/Telegram notifications.
- Pagination and filtering happen client-side over the mock data set.
