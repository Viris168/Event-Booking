// Fake data shaped exactly like V1__schema.sql, so swapping in the real API
// later is a matter of replacing the store's read/write functions.

import { FX_RATE_KHR_PER_USD, khrFromUsdCents } from '../lib/format.js'

export const PROVINCES = [
  { code: 'PP', name_en: 'Phnom Penh', name_km: 'ភ្នំពេញ' },
  { code: 'SR', name_en: 'Siem Reap', name_km: 'សៀមរាប' },
  { code: 'BB', name_en: 'Battambang', name_km: 'បាត់ដំបង' },
  { code: 'KPT', name_en: 'Kampot', name_km: 'កំពត' },
  { code: 'PSH', name_en: 'Preah Sihanouk', name_km: 'ព្រះសីហនុ' },
  { code: 'KDL', name_en: 'Kandal', name_km: 'កណ្ដាល' },
  { code: 'KPC', name_en: 'Kampong Cham', name_km: 'កំពង់ចាម' },
  { code: 'TKO', name_en: 'Takeo', name_km: 'តាកែវ' },
]

export const HOLD_TTL_MS = 10 * 60 * 1000 // backend default: 10 minutes
export const HOLD_EXTENSION_MS = 5 * 60 * 1000 // one-time extension

// Deterministic RNG so the demo data looks the same on every reload.
function mulberry32(seed) {
  return function rand() {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const now = Date.now()
const days = (n) => new Date(now + n * 86400000).toISOString()
const hours = (n) => new Date(now + n * 3600000).toISOString()
const mins = (n) => new Date(now + n * 60000).toISOString()

function idGen() {
  let n = 0
  return () => ++n
}

export function buildSeed() {
  const nextUserId = idGen()
  const nextOrgId = idGen()
  const nextVenueId = idGen()
  const nextVenueSeatId = idGen()
  const nextEventId = idGen()
  const nextSeatClassId = idGen()
  const nextZoneId = idGen()
  const nextEventSeatId = idGen()
  const nextHoldId = idGen()
  const nextBookingId = idGen()
  const nextItemId = idGen()
  const nextTicketId = idGen()
  const nextPaymentId = idGen()
  const nextHistoryId = idGen()

  // ---------------------------------------------------------------- users
  const users = [
    {
      id: nextUserId(),
      phone_e164: '+85512345678',
      email: 'dara@example.com',
      display_name: 'Dara Sok',
      locale: 'km',
      role: 'CUSTOMER',
      is_disabled: false,
      created_at: days(-120),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85512987654',
      email: 'organizer@example.com',
      display_name: 'Chantha Meas',
      locale: 'en',
      role: 'ORGANIZER',
      is_disabled: false,
      created_at: days(-300),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85510111222',
      email: 'admin@example.com',
      display_name: 'Platform Admin',
      locale: 'en',
      role: 'PLATFORM_ADMIN',
      is_disabled: false,
      created_at: days(-400),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85517443322',
      email: 'sophea@angkorevents.kh',
      display_name: 'Sophea Nou',
      locale: 'km',
      role: 'ORGANIZER',
      is_disabled: false,
      created_at: days(-200),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85596112233',
      email: 'lyhour@example.com',
      display_name: 'Ly Hour',
      locale: 'km',
      role: 'CUSTOMER',
      is_disabled: false,
      created_at: days(-45),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85588554477',
      email: null,
      display_name: 'Srey Mom',
      locale: 'km',
      role: 'CUSTOMER',
      is_disabled: false,
      created_at: days(-20),
      password: 'password',
    },
    {
      id: nextUserId(),
      phone_e164: '+85570998877',
      email: 'spam.buyer@example.com',
      display_name: 'Vuthy Kh',
      locale: 'en',
      role: 'CUSTOMER',
      is_disabled: true,
      created_at: days(-9),
      password: 'password',
    },
  ]

  const organizerProfiles = [
    {
      id: nextOrgId(),
      user_id: 2,
      org_name_en: 'Mekong Live Productions',
      org_name_km: 'ផលិតកម្មមេគង្គឡាយវ៍',
      telegram_chat_id: '-1001234567',
      created_at: days(-300),
    },
    {
      id: nextOrgId(),
      user_id: 4,
      org_name_en: 'Angkor Events Co.',
      org_name_km: 'អង្គរ អ៊ីវេន',
      telegram_chat_id: null,
      created_at: days(-200),
    },
  ]

  // --------------------------------------------------------------- venues
  const venues = []
  const venueSeats = []

  function addVenue(v, sections) {
    const venue = { id: nextVenueId(), created_at: days(-250), ...v }
    venues.push(venue)
    // Grid generator: sections stacked vertically, seats laid out on a
    // 30px pitch so pos_x/pos_y look like a real hall.
    let cursorY = 40
    for (const s of sections) {
      for (let r = 0; r < s.rows; r++) {
        const rowLabel = String.fromCharCode(65 + r)
        for (let c = 0; c < s.cols; c++) {
          venueSeats.push({
            id: nextVenueSeatId(),
            venue_id: venue.id,
            section_label: s.label,
            row_label: rowLabel,
            seat_number: String(c + 1),
            pos_x: 40 + c * 30 + (s.offsetX || 0),
            pos_y: cursorY + r * 30,
          })
        }
      }
      cursorY += s.rows * 30 + 45 // aisle between sections
    }
    return venue
  }

  const chaktomuk = addVenue(
    {
      organizer_id: 1,
      name_en: 'Chaktomuk Conference Hall',
      name_km: 'សាលសន្និសីទចតុមុខ',
      province_code: 'PP',
      khan_district: 'Khan Daun Penh',
      sangkat_commune: 'Sangkat Chey Chumneas',
      street_address: 'Preah Sisowath Quay',
      lat: 11.5621,
      lng: 104.9337,
    },
    [
      { label: 'Zone A', rows: 5, cols: 14 },
      { label: 'Zone B', rows: 7, cols: 16, offsetX: -30 },
    ],
  )

  const olympic = addVenue(
    {
      organizer_id: 1,
      name_en: 'Olympic Stadium Arena',
      name_km: 'ពហុកីឡដ្ឋានជាតិអូឡាំពិក',
      province_code: 'PP',
      khan_district: 'Khan Prampi Makara',
      sangkat_commune: 'Sangkat Veal Vong',
      street_address: 'Preah Sihanouk Blvd',
      lat: 11.5564,
      lng: 104.9142,
    },
    [
      { label: 'Grandstand A', rows: 4, cols: 18 },
      { label: 'Grandstand B', rows: 5, cols: 18 },
    ],
  )

  const kohPich = addVenue(
    {
      organizer_id: 1,
      name_en: 'Koh Pich Convention Centre',
      name_km: 'មជ្ឈមណ្ឌលសន្និសីទកោះពេជ្រ',
      province_code: 'PP',
      khan_district: 'Khan Chamkarmon',
      sangkat_commune: 'Sangkat Tonle Bassac',
      street_address: 'Diamond Island',
      lat: 11.5502,
      lng: 104.9411,
    },
    [{ label: 'Main Floor', rows: 8, cols: 15 }],
  )

  const angkorAmphi = addVenue(
    {
      organizer_id: 2,
      name_en: 'Angkor Amphitheatre',
      name_km: 'រោងមហោស្រពអង្គរ',
      province_code: 'SR',
      khan_district: 'Siem Reap District',
      sangkat_commune: 'Sangkat Sla Kram',
      street_address: 'Charles de Gaulle Rd',
      lat: 13.3671,
      lng: 103.8448,
    },
    [{ label: 'Terrace', rows: 6, cols: 12 }],
  )

  const kampotPark = addVenue(
    {
      organizer_id: 2,
      name_en: 'Kampot Riverside Park',
      name_km: 'សួនច្បារមាត់ទឹកកំពត',
      province_code: 'KPT',
      khan_district: 'Kampot District',
      sangkat_commune: 'Sangkat Kampong Kandal',
      street_address: 'River Road',
      lat: 10.6104,
      lng: 104.1809,
    },
    [],
  )

  const beachArena = addVenue(
    {
      organizer_id: 2,
      name_en: 'Ochheuteal Beach Arena',
      name_km: 'អារេណាឆ្នេរអូរឈើទាល',
      province_code: 'PSH',
      khan_district: 'Sihanoukville',
      sangkat_commune: 'Sangkat Buon',
      street_address: 'Ochheuteal Beach Rd',
      lat: 10.6045,
      lng: 103.5265,
    },
    [{ label: 'VIP Deck', rows: 3, cols: 10 }],
  )

  // --------------------------------------------------------------- events
  const events = []
  const seatClasses = []
  const eventZones = []
  const eventSeats = []

  function addEvent(cfg) {
    const event = {
      id: nextEventId(),
      organizer_id: cfg.organizer_id,
      venue_id: cfg.venue_id,
      inventory_mode: cfg.inventory_mode,
      slug: cfg.slug,
      title_en: cfg.title_en,
      title_km: cfg.title_km,
      description_en: cfg.description_en,
      description_km: cfg.description_km,
      status: cfg.status || 'PUBLISHED',
      starts_at: cfg.starts_at,
      doors_open_at: cfg.doors_open_at,
      sales_open_at: cfg.sales_open_at,
      sales_close_at: cfg.sales_close_at,
      created_at: days(-60),
      cover: cfg.cover,
      category: cfg.category,
    }
    events.push(event)

    const rand = mulberry32(event.id * 7919)

    // Seated inventory: one seat_class per venue section.
    if (cfg.classes) {
      const classByLabel = {}
      for (const c of cfg.classes) {
        const sc = {
          id: nextSeatClassId(),
          event_id: event.id,
          name_en: c.name_en,
          name_km: c.name_km,
          price_usd_cents: c.price_usd_cents,
          section_label: c.section_label,
        }
        seatClasses.push(sc)
        classByLabel[c.section_label] = sc
      }
      const seatsOfVenue = venueSeats.filter((s) => s.venue_id === event.venue_id)
      for (const vs of seatsOfVenue) {
        const sc = classByLabel[vs.section_label]
        if (!sc) continue
        // Sprinkle sold / held / blocked seats so every state is visible.
        const roll = rand()
        let status = 'AVAILABLE'
        let hold_id = null
        let hold_expires_at = null
        if (event.status === 'PUBLISHED') {
          if (roll < (cfg.soldRatio ?? 0.3)) status = 'SOLD'
          else if (roll < (cfg.soldRatio ?? 0.3) + 0.06) {
            status = 'HELD'
            hold_id = -1 // held by another shopper, not by us
            hold_expires_at = mins(1 + Math.floor(rand() * 9))
          } else if (roll > 0.985) status = 'BLOCKED'
        }
        eventSeats.push({
          id: nextEventSeatId(),
          event_id: event.id,
          venue_seat_id: vs.id,
          seat_class_id: sc.id,
          status,
          hold_id,
          hold_expires_at,
          version: 0,
        })
      }
    }

    // Zoned (general admission) inventory.
    if (cfg.zones) {
      for (const z of cfg.zones) {
        eventZones.push({
          id: nextZoneId(),
          event_id: event.id,
          name_en: z.name_en,
          name_km: z.name_km,
          price_usd_cents: z.price_usd_cents,
          capacity: z.capacity,
          held_qty: z.held_qty || 0,
          sold_qty: z.sold_qty || 0,
          version: 0,
        })
      }
    }
    return event
  }

  addEvent({
    organizer_id: 1,
    venue_id: chaktomuk.id,
    inventory_mode: 'SEATED',
    slug: 'sinn-sisamouth-tribute-night',
    title_en: 'Sinn Sisamouth Tribute Night',
    title_km: 'រាត្រីរំលឹកលោក ស៊ិន ស៊ីសាមុត',
    description_en:
      'A full orchestra revisits the golden-era catalogue of Cambodia’s most beloved songwriter, with guest vocalists from Phnom Penh and Battambang. Two hours, no interval.',
    description_km:
      'វង់តន្ត្រីពេញលេញនឹងសម្តែងបទចម្រៀងសម័យមាសរបស់អ្នកនិពន្ធបទចម្រៀងជាទីស្រឡាញ់បំផុតរបស់កម្ពុជា ជាមួយអ្នកចម្រៀងកិត្តិយសមកពីភ្នំពេញ និងបាត់ដំបង។ រយៈពេលពីរម៉ោង គ្មានពេលសម្រាក។',
    starts_at: days(12),
    doors_open_at: new Date(now + 12 * 86400000 - 3600000).toISOString(),
    sales_open_at: days(-30),
    sales_close_at: days(11),
    cover: 'sunset',
    category: 'music',
    classes: [
      { name_en: 'Zone A', name_km: 'តំបន់ ក', price_usd_cents: 4500, section_label: 'Zone A' },
      { name_en: 'Zone B', name_km: 'តំបន់ ខ', price_usd_cents: 2500, section_label: 'Zone B' },
    ],
    soldRatio: 0.34,
  })

  addEvent({
    organizer_id: 2,
    venue_id: kampotPark.id,
    inventory_mode: 'ZONED',
    slug: 'kampot-riverside-festival',
    title_en: 'Kampot Riverside Music Festival',
    title_km: 'មហោស្រពតន្ត្រីមាត់ទឹកកំពត',
    description_en:
      'Three stages on the river bank, eighteen acts, food stalls from across Kampot province. General admission — arrive early for the sunset set.',
    description_km:
      'វេទិកាបីនៅមាត់ទឹក សិល្បករ ១៨ ក្រុម និងហាងម្ហូបពីទូទាំងខេត្តកំពត។ ចូលទូទៅ — សូមមកមុនដើម្បីទស្សនាការសម្តែងពេលថ្ងៃលិច។',
    starts_at: days(21),
    doors_open_at: new Date(now + 21 * 86400000 - 7200000).toISOString(),
    sales_open_at: days(-40),
    sales_close_at: days(20),
    cover: 'river',
    category: 'festival',
    zones: [
      {
        name_en: 'GA Riverbank',
        name_km: 'ចូលទូទៅ មាត់ទឹក',
        price_usd_cents: 1500,
        capacity: 2000,
        held_qty: 34,
        sold_qty: 1180,
      },
      {
        name_en: 'GA Front Field',
        name_km: 'ចូលទូទៅ ទីលានមុខ',
        price_usd_cents: 2800,
        capacity: 600,
        held_qty: 12,
        sold_qty: 571,
      },
    ],
  })

  addEvent({
    organizer_id: 1,
    venue_id: olympic.id,
    inventory_mode: 'MIXED',
    slug: 'khmer-new-year-concert-2026',
    title_en: 'Khmer New Year Concert 2026',
    title_km: 'ការប្រគំតន្ត្រីចូលឆ្នាំថ្មីខ្មែរ ២០២៦',
    description_en:
      'The biggest night of the Choul Chnam Thmey week: reserved grandstand seating plus a standing floor in front of the main stage. Pick a seat or take the floor.',
    description_km:
      'រាត្រីធំបំផុតនៃសប្តាហ៍ចូលឆ្នាំថ្មី៖ មានកៅអីកក់ទុកនៅវេទិកាទស្សនា និងទីលានឈរនៅមុខឆាកធំ។ ជ្រើសកៅអី ឬចូលទីលានឈរ។',
    starts_at: days(38),
    doors_open_at: new Date(now + 38 * 86400000 - 5400000).toISOString(),
    sales_open_at: days(-20),
    sales_close_at: days(37),
    cover: 'gold',
    category: 'music',
    classes: [
      {
        name_en: 'Grandstand A',
        name_km: 'វេទិកាទស្សនា ក',
        price_usd_cents: 3500,
        section_label: 'Grandstand A',
      },
      {
        name_en: 'Grandstand B',
        name_km: 'វេទិកាទស្សនា ខ',
        price_usd_cents: 2000,
        section_label: 'Grandstand B',
      },
    ],
    soldRatio: 0.22,
    zones: [
      {
        name_en: 'GA Floor',
        name_km: 'ទីលានឈរ',
        price_usd_cents: 1200,
        capacity: 3000,
        held_qty: 45,
        sold_qty: 1620,
      },
    ],
  })

  addEvent({
    organizer_id: 1,
    venue_id: kohPich.id,
    inventory_mode: 'SEATED',
    slug: 'cambodia-tech-summit',
    title_en: 'Cambodia Tech Summit',
    title_km: 'សន្និសីទបច្ចេកវិទ្យាកម្ពុជា',
    description_en:
      'A single-track day on payments, logistics and AI in the Mekong region. Ticket includes lunch and the evening rooftop mixer.',
    description_km:
      'កម្មវិធីមួយថ្ងៃស្តីពីការទូទាត់ ដឹកជញ្ជូន និង AI នៅតំបន់មេគង្គ។ សំបុត្ររួមបញ្ចូលអាហារថ្ងៃត្រង់ និងកម្មវិធីជួបជុំពេលល្ងាចនៅដំបូល។',
    starts_at: days(5),
    doors_open_at: new Date(now + 5 * 86400000 - 1800000).toISOString(),
    sales_open_at: days(-50),
    sales_close_at: days(4),
    cover: 'teal',
    category: 'conference',
    classes: [
      {
        name_en: 'Main Floor',
        name_km: 'កម្រាលឥដ្ឋធំ',
        price_usd_cents: 6000,
        section_label: 'Main Floor',
      },
    ],
    soldRatio: 0.72,
  })

  addEvent({
    organizer_id: 2,
    venue_id: angkorAmphi.id,
    inventory_mode: 'SEATED',
    slug: 'apsara-dance-gala',
    title_en: 'Apsara Dance Gala',
    title_km: 'មហោស្រពរបាំអប្សរា',
    description_en:
      'Royal Ballet repertoire performed on the open terrace, with the Angkor silhouette behind the stage. Limited terrace seating.',
    description_km:
      'កម្មវិធីរបាំព្រះរាជទ្រព្យសម្តែងនៅលើដីរាបខាងក្រៅ ដោយមានស្រមោលអង្គរនៅពីក្រោយឆាក។ កៅអីមានកំណត់។',
    starts_at: days(9),
    doors_open_at: new Date(now + 9 * 86400000 - 2700000).toISOString(),
    sales_open_at: days(-25),
    sales_close_at: days(8),
    cover: 'plum',
    category: 'culture',
    classes: [
      { name_en: 'Terrace', name_km: 'ដីរាប', price_usd_cents: 3000, section_label: 'Terrace' },
    ],
    soldRatio: 0.86,
  })

  addEvent({
    organizer_id: 2,
    venue_id: kampotPark.id,
    inventory_mode: 'ZONED',
    slug: 'bassac-riverside-jazz',
    title_en: 'Bassac Riverside Jazz',
    title_km: 'តន្ត្រីជាហ្សមាត់ទឹកបាសាក់',
    description_en:
      'An intimate late set from the Phnom Penh Jazz Collective. Standing room only, 120 tickets total.',
    description_km:
      'កម្មវិធីតន្ត្រីជាហ្សពេលយប់ដ៏កក់ក្តៅពីក្រុមជាហ្សភ្នំពេញ។ មានតែកន្លែងឈរ សំបុត្រសរុប ១២០។',
    starts_at: days(3),
    doors_open_at: new Date(now + 3 * 86400000 - 3600000).toISOString(),
    sales_open_at: days(-14),
    sales_close_at: days(2),
    cover: 'indigo',
    category: 'music',
    zones: [
      {
        name_en: 'GA Standing',
        name_km: 'ចូលទូទៅ ឈរ',
        price_usd_cents: 1800,
        capacity: 120,
        held_qty: 4,
        sold_qty: 109,
      },
    ],
  })

  addEvent({
    organizer_id: 1,
    venue_id: olympic.id,
    inventory_mode: 'ZONED',
    slug: 'water-festival-fun-run',
    title_en: 'Water Festival Fun Run',
    title_km: 'ការរត់សប្បាយបុណ្យអុំទូក',
    description_en:
      'A 5km evening run around the stadium ring, finishing under the Bon Om Touk fireworks. Entry includes a race shirt.',
    description_km:
      'ការរត់ ៥ គីឡូម៉ែត្រពេលល្ងាចជុំវិញពហុកីឡដ្ឋាន បញ្ចប់ក្រោមកំណាត់បាញ់កាំជ្រួចបុណ្យអុំទូក។ ការចូលរួមរួមបញ្ចូលអាវប្រណាំង។',
    starts_at: days(48),
    doors_open_at: new Date(now + 48 * 86400000 - 5400000).toISOString(),
    sales_open_at: days(-5),
    sales_close_at: days(46),
    cover: 'lime',
    category: 'sport',
    zones: [
      {
        name_en: 'GA Runner Entry',
        name_km: 'ចូលរួមរត់',
        price_usd_cents: 1000,
        capacity: 1500,
        held_qty: 8,
        sold_qty: 260,
      },
    ],
  })

  // Draft + taken-down events, for the organizer and admin screens.
  addEvent({
    organizer_id: 2,
    venue_id: beachArena.id,
    inventory_mode: 'MIXED',
    slug: 'sihanoukville-beach-edm',
    title_en: 'Sihanoukville Beach EDM',
    title_km: 'អ៊ីឌីអឹមឆ្នេរព្រះសីហនុ',
    description_en: 'Sunset-to-sunrise beach party. Line-up still being confirmed.',
    description_km: 'ពិធីជប់លៀងឆ្នេរពីថ្ងៃលិចដល់ថ្ងៃរះ។ បញ្ជីសិល្បករកំពុងបញ្ជាក់។',
    status: 'DRAFT',
    starts_at: days(75),
    doors_open_at: new Date(now + 75 * 86400000 - 3600000).toISOString(),
    sales_open_at: days(10),
    sales_close_at: days(74),
    cover: 'cyan',
    category: 'music',
    classes: [
      { name_en: 'VIP Deck', name_km: 'ដេកវីអាយពី', price_usd_cents: 8000, section_label: 'VIP Deck' },
    ],
    zones: [
      {
        name_en: 'GA Beach',
        name_km: 'ចូលទូទៅ ឆ្នេរ',
        price_usd_cents: 2500,
        capacity: 1200,
        held_qty: 0,
        sold_qty: 0,
      },
    ],
  })

  addEvent({
    organizer_id: 1,
    venue_id: chaktomuk.id,
    inventory_mode: 'SEATED',
    slug: 'comedy-night-unverified',
    title_en: 'Late Night Comedy (under review)',
    title_km: 'កម្មវិធីកំប្លែងពេលយប់ (កំពុងត្រួតពិនិត្យ)',
    description_en: 'Taken down pending a content review after audience complaints.',
    description_km: 'ត្រូវបានដកចេញ ដើម្បីរង់ចាំការត្រួតពិនិត្យខ្លឹមសារ បន្ទាប់ពីមានពាក្យបណ្តឹងពីទស្សនិកជន។',
    status: 'TAKEN_DOWN',
    starts_at: days(30),
    doors_open_at: new Date(now + 30 * 86400000 - 3600000).toISOString(),
    sales_open_at: days(-10),
    sales_close_at: days(29),
    cover: 'rose',
    category: 'comedy',
    classes: [
      { name_en: 'Zone A', name_km: 'តំបន់ ក', price_usd_cents: 2000, section_label: 'Zone A' },
      { name_en: 'Zone B', name_km: 'តំបន់ ខ', price_usd_cents: 1200, section_label: 'Zone B' },
    ],
    soldRatio: 0.1,
  })

  // Normalise show times to realistic local hours (the offsets above are
  // relative to "now", which would otherwise put doors open at 14:05).
  for (const event of events) {
    const start = new Date(event.starts_at)
    const hour = event.category === 'conference' ? 9 : event.category === 'sport' ? 16 : 19
    start.setHours(hour, event.category === 'sport' ? 30 : 0, 0, 0)
    event.starts_at = start.toISOString()
    event.doors_open_at = new Date(start.getTime() - 60 * 60000).toISOString()
    event.sales_close_at = new Date(start.getTime() - 60 * 60000).toISOString()
  }

  // ------------------------------------------------------- seeded bookings
  const holds = []
  const bookings = []
  const bookingItems = []
  const tickets = []
  const payments = []
  const bookingHistory = []
  let refCounter = 4820

  function nextRef() {
    return `EB-${refCounter++}-KH`
  }

  /**
   * Creates a consistent booking graph: hold -> booking -> items -> tickets
   * -> payment attempts -> status history, and moves the inventory to match.
   */
  function seedBooking(cfg) {
    const event = events.find((e) => e.id === cfg.eventId)
    const holdStatus =
      cfg.state === 'CONFIRMED' || cfg.state === 'REFUND_REQUESTED' || cfg.state === 'REFUNDED'
        ? 'CONSUMED'
        : cfg.state === 'PENDING_PAYMENT' || cfg.state === 'AWAITING_CONFIRMATION' || cfg.state === 'PAYMENT_FAILED'
          ? 'ACTIVE'
          : cfg.state === 'EXPIRED'
            ? 'EXPIRED'
            : 'RELEASED'

    const hold = {
      id: nextHoldId(),
      event_id: event.id,
      user_id: cfg.userId,
      status: holdStatus,
      expires_at: cfg.holdExpiresAt || new Date(now - 3600000).toISOString(),
      created_at: cfg.createdAt,
      extended: false,
    }
    holds.push(hold)

    const items = []
    let subtotal = 0

    // Seat lines: pull that many AVAILABLE seats of the requested class.
    for (const spec of cfg.seats || []) {
      const cls = seatClasses.find((c) => c.event_id === event.id && c.name_en === spec.className)
      const pool = eventSeats.filter(
        (s) => s.event_id === event.id && s.seat_class_id === cls.id && s.status === 'AVAILABLE',
      )
      for (let i = 0; i < spec.qty; i++) {
        const seat = pool[i]
        if (!seat) break
        if (holdStatus === 'CONSUMED') {
          seat.status = 'SOLD'
        } else if (holdStatus === 'ACTIVE') {
          seat.status = 'HELD'
          seat.hold_id = hold.id
          seat.hold_expires_at = hold.expires_at
        }
        const item = {
          id: nextItemId(),
          booking_id: null,
          event_seat_id: seat.id,
          event_zone_id: null,
          qty: 1,
          unit_price_usd_cents: cls.price_usd_cents,
        }
        items.push(item)
        subtotal += cls.price_usd_cents
      }
    }

    // Zone lines: qty against the GA counters.
    for (const spec of cfg.zones || []) {
      const zone = eventZones.find((z) => z.event_id === event.id && z.name_en === spec.zoneName)
      if (!zone) continue
      if (holdStatus === 'CONSUMED') {
        zone.sold_qty += spec.qty
      } else if (holdStatus === 'ACTIVE') {
        zone.held_qty += spec.qty
      }
      items.push({
        id: nextItemId(),
        booking_id: null,
        event_seat_id: null,
        event_zone_id: zone.id,
        qty: spec.qty,
        unit_price_usd_cents: zone.price_usd_cents,
      })
      subtotal += zone.price_usd_cents * spec.qty
    }

    const booking = {
      id: nextBookingId(),
      booking_ref: nextRef(),
      event_id: event.id,
      user_id: cfg.userId,
      hold_id: hold.id,
      state: cfg.state,
      buyer_name: cfg.buyerName,
      buyer_phone_e164: cfg.buyerPhone,
      buyer_email: cfg.buyerEmail || null,
      subtotal_usd_cents: subtotal,
      total_usd_cents: subtotal,
      fx_rate_khr_per_usd: FX_RATE_KHR_PER_USD,
      total_khr: khrFromUsdCents(subtotal),
      created_at: cfg.createdAt,
      state_changed_at: cfg.stateChangedAt || cfg.createdAt,
    }
    bookings.push(booking)
    for (const it of items) {
      it.booking_id = booking.id
      bookingItems.push(it)
    }

    // Tickets exist only once the booking has been paid for.
    if (['CONFIRMED', 'REFUND_REQUESTED', 'REFUNDED'].includes(cfg.state)) {
      for (const it of items) {
        for (let seq = 1; seq <= it.qty; seq++) {
          tickets.push({
            id: nextTicketId(),
            booking_item_id: it.id,
            unit_seq: seq,
            qr_token: `${booking.booking_ref}-${it.id}-${seq}`.toLowerCase(),
            checked_in_at: cfg.checkedIn && seq === 1 && it === items[0] ? cfg.checkedIn : null,
            checked_in_by: cfg.checkedIn && seq === 1 && it === items[0] ? 2 : null,
            issued_at: cfg.stateChangedAt || cfg.createdAt,
          })
        }
      }
    }

    for (const p of cfg.paymentAttempts || []) {
      payments.push({
        id: nextPaymentId(),
        booking_id: booking.id,
        provider: p.provider,
        provider_ref: p.provider_ref || null,
        idempotency_key: `idem-${booking.booking_ref}-${payments.length + 1}`,
        currency_charged: p.currency_charged || 'USD',
        amount_usd_cents: subtotal,
        amount_khr: khrFromUsdCents(subtotal),
        status: p.status,
        expires_at: p.expires_at || new Date(new Date(cfg.createdAt).getTime() + 900000).toISOString(),
        created_at: p.created_at || cfg.createdAt,
        resolved_at: ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(p.status)
          ? p.resolved_at || cfg.stateChangedAt || cfg.createdAt
          : null,
      })
    }

    for (const h of cfg.history || []) {
      bookingHistory.push({
        id: nextHistoryId(),
        booking_id: booking.id,
        from_state: h.from,
        to_state: h.to,
        changed_by_user_id: h.by ?? null,
        note: h.note || null,
        changed_at: h.at,
      })
    }
    return booking
  }

  // The demo customer's history covers all eight booking states.
  seedBooking({
    eventId: 1,
    userId: 1,
    state: 'CONFIRMED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    buyerEmail: 'dara@example.com',
    createdAt: days(-6),
    stateChangedAt: days(-6),
    seats: [{ className: 'Zone A', qty: 2 }],
    paymentAttempts: [
      { provider: 'BAKONG_KHQR', status: 'SUCCESS', provider_ref: 'BKG-99120031', currency_charged: 'KHR' },
    ],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-6) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, note: 'Bakong webhook BKG-99120031', at: days(-6) },
    ],
  })

  seedBooking({
    eventId: 3,
    userId: 1,
    state: 'PENDING_PAYMENT',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    buyerEmail: 'dara@example.com',
    createdAt: mins(-1),
    holdExpiresAt: mins(9),
    zones: [{ zoneName: 'GA Floor', qty: 3 }],
    paymentAttempts: [{ provider: 'BAKONG_KHQR', status: 'PENDING', provider_ref: 'BKG-99341002' }],
    history: [{ from: null, to: 'PENDING_PAYMENT', by: 1, at: mins(-1) }],
  })

  seedBooking({
    eventId: 4,
    userId: 1,
    state: 'AWAITING_CONFIRMATION',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: hours(-2),
    stateChangedAt: hours(-2),
    seats: [{ className: 'Main Floor', qty: 1 }],
    paymentAttempts: [
      { provider: 'ABA_PAYWAY', status: 'PENDING', provider_ref: 'ABA-TXN-77120', created_at: hours(-2) },
    ],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: hours(-2) },
      { from: 'PENDING_PAYMENT', to: 'AWAITING_CONFIRMATION', by: null, note: 'PayWay returned, no webhook yet', at: hours(-2) },
    ],
  })

  seedBooking({
    eventId: 5,
    userId: 1,
    state: 'PAYMENT_FAILED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: days(-2),
    stateChangedAt: days(-2),
    seats: [{ className: 'Terrace', qty: 2 }],
    paymentAttempts: [
      { provider: 'ABA_PAYWAY', status: 'FAILED', provider_ref: 'ABA-TXN-71880' },
      { provider: 'BAKONG_KHQR', status: 'FAILED', provider_ref: 'BKG-98770012' },
    ],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-2) },
      { from: 'PENDING_PAYMENT', to: 'PAYMENT_FAILED', by: null, note: 'Insufficient funds', at: days(-2) },
    ],
  })

  seedBooking({
    eventId: 2,
    userId: 1,
    state: 'REFUND_REQUESTED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: days(-11),
    stateChangedAt: days(-1),
    zones: [{ zoneName: 'GA Front Field', qty: 2 }],
    paymentAttempts: [{ provider: 'BAKONG_KHQR', status: 'SUCCESS', provider_ref: 'BKG-97110044' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-11) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, at: days(-11) },
      { from: 'CONFIRMED', to: 'REFUND_REQUESTED', by: 1, note: 'Travel plans changed', at: days(-1) },
    ],
  })

  seedBooking({
    eventId: 6,
    userId: 1,
    state: 'REFUNDED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: days(-24),
    stateChangedAt: days(-18),
    zones: [{ zoneName: 'GA Standing', qty: 1 }],
    paymentAttempts: [{ provider: 'ABA_PAYWAY', status: 'SUCCESS', provider_ref: 'ABA-TXN-66120' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-24) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, at: days(-24) },
      { from: 'CONFIRMED', to: 'REFUND_REQUESTED', by: 1, at: days(-20) },
      { from: 'REFUND_REQUESTED', to: 'REFUNDED', by: 3, note: 'Refunded to source', at: days(-18) },
    ],
  })

  seedBooking({
    eventId: 1,
    userId: 1,
    state: 'EXPIRED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: days(-15),
    stateChangedAt: days(-15),
    // Hold already expired, so the seats went back to the map — the line
    // items stay on the booking as a record of what was attempted.
    seats: [{ className: 'Zone A', qty: 2 }],
    paymentAttempts: [{ provider: 'BAKONG_KHQR', status: 'EXPIRED', provider_ref: 'BKG-95510091' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-15) },
      { from: 'PENDING_PAYMENT', to: 'EXPIRED', by: null, note: 'Hold expired before payment', at: days(-15) },
    ],
  })

  seedBooking({
    eventId: 7,
    userId: 1,
    state: 'CANCELLED',
    buyerName: 'Dara Sok',
    buyerPhone: '+85512345678',
    createdAt: days(-8),
    stateChangedAt: days(-8),
    zones: [{ zoneName: 'GA Runner Entry', qty: 2 }],
    paymentAttempts: [{ provider: 'ABA_PAYWAY', status: 'CANCELLED' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 1, at: days(-8) },
      { from: 'PENDING_PAYMENT', to: 'CANCELLED', by: 1, note: 'Cancelled by customer', at: days(-8) },
    ],
  })

  // Bookings from other customers, so admin/organizer tables have volume.
  seedBooking({
    eventId: 1,
    userId: 5,
    state: 'CONFIRMED',
    buyerName: 'Ly Hour',
    buyerPhone: '+85596112233',
    createdAt: days(-4),
    stateChangedAt: days(-4),
    seats: [{ className: 'Zone B', qty: 4 }],
    paymentAttempts: [{ provider: 'BAKONG_KHQR', status: 'SUCCESS', provider_ref: 'BKG-99220110' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 5, at: days(-4) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, at: days(-4) },
    ],
    checkedIn: days(-0.2),
  })

  seedBooking({
    eventId: 4,
    userId: 6,
    state: 'AWAITING_CONFIRMATION',
    buyerName: 'Srey Mom',
    buyerPhone: '+85588554477',
    createdAt: hours(-30),
    stateChangedAt: hours(-29),
    seats: [{ className: 'Main Floor', qty: 2 }],
    paymentAttempts: [
      { provider: 'BAKONG_KHQR', status: 'PENDING', provider_ref: 'BKG-99001177', created_at: hours(-30) },
    ],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 6, at: hours(-30) },
      { from: 'PENDING_PAYMENT', to: 'AWAITING_CONFIRMATION', by: null, note: 'No webhook after 24h', at: hours(-29) },
    ],
  })

  seedBooking({
    eventId: 2,
    userId: 5,
    state: 'CONFIRMED',
    buyerName: 'Ly Hour',
    buyerPhone: '+85596112233',
    createdAt: days(-3),
    stateChangedAt: days(-3),
    zones: [{ zoneName: 'GA Riverbank', qty: 5 }],
    paymentAttempts: [{ provider: 'ABA_PAYWAY', status: 'SUCCESS', provider_ref: 'ABA-TXN-79330' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 5, at: days(-3) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, at: days(-3) },
    ],
  })

  seedBooking({
    eventId: 3,
    userId: 6,
    state: 'CONFIRMED',
    buyerName: 'Srey Mom',
    buyerPhone: '+85588554477',
    createdAt: days(-1),
    stateChangedAt: days(-1),
    seats: [{ className: 'Grandstand A', qty: 3 }],
    zones: [{ zoneName: 'GA Floor', qty: 2 }],
    paymentAttempts: [{ provider: 'BAKONG_KHQR', status: 'SUCCESS', provider_ref: 'BKG-99400221' }],
    history: [
      { from: null, to: 'PENDING_PAYMENT', by: 6, at: days(-1) },
      { from: 'PENDING_PAYMENT', to: 'CONFIRMED', by: null, at: days(-1) },
    ],
  })

  return {
    users,
    organizerProfiles,
    venues,
    venueSeats,
    events,
    seatClasses,
    eventZones,
    eventSeats,
    holds,
    bookings,
    bookingItems,
    tickets,
    payments,
    bookingHistory,
    counters: {
      nextUserId,
      nextOrgId,
      nextVenueId,
      nextVenueSeatId,
      nextEventId,
      nextSeatClassId,
      nextZoneId,
      nextEventSeatId,
      nextHoldId,
      nextBookingId,
      nextItemId,
      nextTicketId,
      nextPaymentId,
      nextHistoryId,
      nextRef,
    },
  }
}
