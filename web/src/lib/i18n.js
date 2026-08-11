// Minimal EN/KM dictionary for UI chrome. Content strings (event titles,
// venue names, zone names) come from the data as _en/_km pairs instead.
// Minimal EN/KM dictionary for UI chrome. Content strings (event titles,
// venue names, zone names) come from the data as _en/_km pairs instead.

export const LOCALES = ["en", "km"];

const dict = {
  // nav / chrome
  brand: { en: "Event Booking", km: "កក់សំបុត្រ" },
  home: { en: "Home", km: "ទំព័រដើម" },
  events: { en: "Events", km: "ព្រឹត្តិការណ៍" },
  myBookings: { en: "My Bookings", km: "ការកក់របស់ខ្ញុំ" },
  organizer: { en: "Organizer", km: "អ្នករៀបចំកម្មវិធី" },
  admin: { en: "Admin", km: "អ្នកគ្រប់គ្រង" },
  login: { en: "Log in", km: "ចូលគណនី" },
  register: { en: "Sign up", km: "បង្កើតគណនី" },
  logout: { en: "Log out", km: "ចាកចេញ" },
  checkIn: { en: "Check-in", km: "ពិនិត្យសំបុត្រចូល" },

  // browse
  heroTitle: {
    en: "Live events across Cambodia",
    km: "ព្រឹត្តិការណ៍ផ្ទាល់នៅទូទាំងប្រទេសកម្ពុជា",
  },
  heroSub: {
    en: "Concerts, festivals and conferences — reserve your seat, pay with Bakong or ABA, show your QR at the door.",
    km: "ការប្រគំតន្ត្រី ពិធីបុណ្យ និងសន្និសីទ — កក់កៅអី ទូទាត់ប្រាក់តាមរយៈបាគង ឬ ABA រួចបង្ហាញ QR កូដនៅច្រកចូល។",
  },
  search: { en: "Search events", km: "ស្វែងរកព្រឹត្តិការណ៍" },
  province: { en: "Province", km: "ខេត្ត/ក្រុង" },
  allProvinces: { en: "All provinces", km: "គ្រប់ខេត្ត/ក្រុង" },
  featured: {
    en: "Featured this month",
    km: "ព្រឹត្តិការណ៍លេចធ្លោប្រចាំខែនេះ",
  },
  upcoming: { en: "Upcoming events", km: "ព្រឹត្តិការណ៍នាពេលខាងមុខ" },
  viewAll: { en: "View all", km: "មើលទាំងអស់" },
  filters: { en: "Filters", km: "តម្រង" },
  reset: { en: "Reset", km: "កំណត់ឡើងវិញ" },
  sort: { en: "Sort", km: "តម្រៀប" },
  soonest: { en: "Date · soonest", km: "កាលបរិច្ឆេទ · ខិតជិតមកដល់" },
  priceLow: { en: "Price · low to high", km: "តម្លៃ · ពីទាបទៅខ្ពស់" },
  priceHigh: { en: "Price · high to low", km: "តម្លៃ · ពីខ្ពស់ទៅទាប" },
  from: { en: "From", km: "ចាប់ពី" },
  to: { en: "To", km: "ដល់" },
  minPrice: { en: "Min $", km: "តម្លៃទាបបំផុត $" },
  maxPrice: { en: "Max $", km: "តម្លៃខ្ពស់បំផុត $" },
  noEvents: {
    en: "No events match your filters",
    km: "រកមិនឃើញព្រឹត្តិការណ៍ដែលត្រូវនឹងតម្រងរបស់អ្នកទេ",
  },
  from_price: { en: "From", km: "ចាប់ពី" },
  seatsLeft: { en: "seats left", km: "កៅអីនៅសល់" },
  spotsLeft: { en: "spots left", km: "កន្លែងនៅសល់" },
  almostFull: { en: "Almost full", km: "ជិតពេញ" },
  soldOut: { en: "Sold out", km: "លក់អស់ហើយ" },
  fillingFast: { en: "Filling fast", km: "ជិតអស់កៅអីហើយ" },

  // event detail
  doorsOpen: { en: "Doors open", km: "ម៉ោងបើកច្រកចូល" },
  starts: { en: "Starts", km: "ម៉ោងចាប់ផ្តើម" },
  salesClose: { en: "Sales close", km: "បិទលក់សំបុត្រ" },
  about: { en: "About this event", km: "អំពីព្រឹត្តិការណ៍នេះ" },
  pickSeats: { en: "Choose your seats", km: "ជ្រើសរើសកៅអីរបស់អ្នក" },
  pickZones: { en: "General admission", km: "សំបុត្រចូលទូទៅ" },
  legend: { en: "Legend", km: "ចំណាំ" },
  available: { en: "Available", km: "ទំនេរ" },
  heldByOthers: { en: "Held by someone else", km: "មានអ្នកកំពុងកក់" },
  sold: { en: "Sold", km: "លក់រួចហើយ" },
  yourSelection: { en: "Your selection", km: "កៅអីដែលអ្នកបានជ្រើសរើស" },
  blocked: { en: "Not for sale", km: "មិនដាក់លក់ទេ" },
  reserve: { en: "Reserve", km: "កក់សំបុត្រ" },
  reserving: { en: "Reserving…", km: "កំពុងកក់…" },
  nothingSelected: {
    en: "Select a seat or a GA quantity to continue",
    km: "សូមជ្រើសរើសកៅអី ឬចំនួនសំបុត្រទូទៅ ដើម្បីបន្ត",
  },
  subtotal: { en: "Subtotal", km: "សរុបរង" },
  total: { en: "Total", km: "សរុប" },
  qty: { en: "Qty", km: "ចំនួន" },
  each: { en: "each", km: "ក្នុងមួយសំបុត្រ" },

  // holds
  holdActive: { en: "Seats held for you", km: "កៅអីកំពុងរក្សាទុកជូនអ្នក" },
  holdExpiresIn: { en: "Released in", km: "នឹងផុតកំណត់ក្នុងរយៈពេល" },
  notYoursYet: {
    en: "Not yours until payment clears",
    km: "កៅអីមិនទាន់បានបញ្ជាក់ទេ រហូតទាល់តែការទូទាត់ប្រាក់បានសម្រេច",
  },
  extendHold: { en: "Extend hold", km: "បន្ថែមម៉ោងកក់" },
  extended: { en: "Extended once", km: "បានបន្ថែមម៉ោងម្ដងរួចហើយ" },
  releaseHold: { en: "Release", km: "បោះបង់ការកក់" },
  goToCheckout: { en: "Go to checkout", km: "បន្តទៅទូទាត់ប្រាក់" },
  holdExpired: {
    en: "Your hold expired and the seats were released back to the map.",
    km: "ការកក់របស់អ្នកបានផុតកំណត់ ហើយកៅអីត្រូវបានទម្លាក់ចូលក្នុងប្រព័ន្ធវិញ។",
  },
  holdAlreadyActive: {
    en: "You already have seats held for this event.",
    km: "អ្នកកំពុងមានកៅអីដែលបានរក្សាទុករួចហើយ សម្រាប់ព្រឹត្តិការណ៍នេះ។",
  },
  resumeHold: { en: "Resume your hold", km: "បន្តការកក់របស់អ្នក" },

  // checkout / payment
  checkout: { en: "Checkout", km: "ទូទាត់ប្រាក់" },
  orderSummary: { en: "Order summary", km: "សេចក្តីសង្ខេបការកក់" },
  buyerDetails: { en: "Buyer details", km: "ព័ត៌មានអ្នកទិញ" },
  fullName: { en: "Full name", km: "ឈ្មោះពេញ" },
  phone: { en: "Phone", km: "លេខទូរស័ព្ទ" },
  email: { en: "Email", km: "អ៊ីមែល" },
  optional: { en: "optional", km: "ជាជម្រើស" },
  paymentMethod: { en: "Payment method", km: "វិធីសាស្ត្រទូទាត់ប្រាក់" },
  khqr: { en: "Bakong KHQR", km: "បាគង KHQR" },
  khqrHint: {
    en: "Scan with any Cambodian banking app",
    km: "ស្កេនទូទាត់តាមរយៈកម្មវិធីធនាគារក្នុងស្រុកទាំងអស់",
  },
  payway: { en: "ABA PayWay", km: "ABA PayWay" },
  paywayHint: {
    en: "Card or ABA account, opens ABA",
    km: "កាត ឬគណនី ABA (ភ្ជាប់ទៅកាន់កម្មវិធី ABA ដោយផ្ទាល់)",
  },
  placeOrder: { en: "Continue to payment", km: "បន្តទៅទូទាត់ប្រាក់" },
  fxNote: {
    en: "Rate used for this booking",
    km: "អត្រាប្តូរប្រាក់សម្រាប់ការកក់នេះ",
  },
  scanToPay: { en: "Scan to pay", km: "ស្កេនដើម្បីទូទាត់ប្រាក់" },
  waitingForPayment: {
    en: "Waiting for payment…",
    km: "កំពុងរង់ចាំការទូទាត់ប្រាក់…",
  },
  paymentReceived: { en: "Payment received", km: "ទទួលបានការទូទាត់ប្រាក់ហើយ" },
  paymentFailedMsg: {
    en: "Payment failed. You can try again.",
    km: "ការទូទាត់ប្រាក់បរាជ័យ។ សូមសាកល្បងម្ដងទៀត។",
  },
  tryAgain: { en: "Try again", km: "សាកល្បងម្ដងទៀត" },
  openPayway: { en: "Open ABA PayWay", km: "បើក ABA PayWay" },
  simulate: { en: "Demo controls", km: "ការគ្រប់គ្រងសាកល្បង" },
  simulateSuccess: { en: "Simulate success", km: "សាកល្បង (ជោគជ័យ)" },
  simulateFail: { en: "Simulate failure", km: "សាកល្បង (បរាជ័យ)" },

  // bookings
  bookingRef: { en: "Booking reference", km: "លេខកូដយោងការកក់" },
  status: { en: "Status", km: "ស្ថានភាព" },
  yourTickets: { en: "Your tickets", km: "សំបុត្ររបស់អ្នក" },
  ticketsAfterPayment: {
    en: "Tickets appear here once payment is confirmed.",
    km: "សំបុត្រនឹងបង្ហាញនៅទីនេះ បន្ទាប់ពីការទូទាត់ប្រាក់ត្រូវបានបញ្ជាក់។",
  },
  cancelBooking: { en: "Cancel booking", km: "បោះបង់ការកក់" },
  requestRefund: { en: "Request refund", km: "ស្នើសុំប្រាក់ត្រឡប់មកវិញ" },
  payNow: { en: "Pay now", km: "ទូទាត់ប្រាក់ឥឡូវនេះ" },
  noBookings: {
    en: "You have no bookings yet",
    km: "អ្នកមិនទាន់មានប្រវត្តិការកក់សំបុត្រទេ",
  },
  browseEvents: { en: "Browse events", km: "ស្វែងរកព្រឹត្តិការណ៍" },
  allStatuses: { en: "All statuses", km: "គ្រប់ស្ថានភាព" },
  paymentHistory: { en: "Payment attempts", km: "ប្រវត្តិទូទាត់ប្រាក់" },
  timeline: { en: "Timeline", km: "កាលប្បវត្តិ" },
  admitOne: { en: "Admit one", km: "សំបុត្រសម្រាប់ចូលម្នាក់" },

  // auth
  loginTitle: { en: "Welcome back", km: "សូមស្វាគមន៍ការត្រឡប់មកវិញ" },
  loginSub: {
    en: "Log in with your phone or email",
    km: "ចូលគណនីតាមរយៈលេខទូរស័ព្ទ ឬអ៊ីមែល",
  },
  phoneOrEmail: { en: "Phone or email", km: "លេខទូរស័ព្ទ ឬអ៊ីមែល" },
  password: { en: "Password", km: "ពាក្យសម្ងាត់" },
  noAccount: { en: "No account yet?", km: "មិនទាន់មានគណនីមែនទេ?" },
  haveAccount: { en: "Already have an account?", km: "មានគណនីរួចហើយមែនទេ?" },
  registerTitle: { en: "Create your account", km: "បង្កើតគណនីរបស់អ្នក" },
  displayName: { en: "Display name", km: "ឈ្មោះបង្ហាញ" },
  preferredLanguage: { en: "Preferred language", km: "ភាសាដែលអ្នកចង់ប្រើ" },
  demoAccounts: { en: "Demo accounts", km: "គណនីសាកល្បង" },

  // organizer
  organizerDashboard: {
    en: "Organizer dashboard",
    km: "ផ្ទាំងគ្រប់គ្រងសម្រាប់អ្នករៀបចំកម្មវិធី",
  },
  myEvents: { en: "My events", km: "ព្រឹត្តិការណ៍របស់ខ្ញុំ" },
  createEvent: { en: "Create event", km: "បង្កើតព្រឹត្តិការណ៍" },
  editEvent: { en: "Edit event", km: "កែសម្រួលព្រឹត្តិការណ៍" },
  venues: { en: "Venues", km: "ទីតាំងរៀបចំ" },
  seatMap: { en: "Seat map", km: "ប្លង់កៅអី" },
  sales: { en: "Sales", km: "របាយការណ៍លក់" },
  publish: { en: "Publish", km: "ផ្សព្វផ្សាយ" },
  unpublish: { en: "Take down", km: "ផ្អាកការផ្សព្វផ្សាយ" },
  save: { en: "Save", km: "រក្សាទុក" },
  cancel: { en: "Cancel", km: "បោះបង់" },
  revenue: { en: "Revenue", km: "ប្រាក់ចំណូល" },
  ticketsSold: { en: "Tickets sold", km: "សំបុត្រដែលបានលក់" },
  capacity: { en: "Capacity", km: "ចំនួនអ្នកចូលរួមសរុប" },
  scanTicket: { en: "Scan a ticket", km: "ស្កេនសំបុត្រ" },
  manualEntry: {
    en: "Or enter the ticket code",
    km: "ឬវាយបញ្ចូលលេខកូដសំបុត្រ",
  },
  validAdmit: { en: "Valid — admit", km: "សំបុត្រត្រឹមត្រូវ — អនុញ្ញាតឲ្យចូល" },
  alreadyUsed: { en: "Already used", km: "សំបុត្រនេះបានប្រើរួចហើយ" },
  notFound: { en: "Not found", km: "រកមិនឃើញសំបុត្រនេះទេ" },

  // admin
  adminDashboard: { en: "Platform admin", km: "ផ្ទាំងអ្នកគ្រប់គ្រងប្រព័ន្ធ" },
  users: { en: "Users", km: "អ្នកប្រើប្រាស់" },
  payments: { en: "Payments", km: "ប្រតិបត្តិការទូទាត់ប្រាក់" },
  moderation: { en: "Event moderation", km: "ការត្រួតពិនិត្យព្រឹត្តិការណ៍" },
  disable: { en: "Disable", km: "បិទដំណើរការ" },
  enable: { en: "Enable", km: "បើកដំណើរការ" },
  takeDown: { en: "Take down", km: "ដកចេញពីប្រព័ន្ធ" },
  reconciliation: {
    en: "Needs reconciliation",
    km: "ទាមទារការផ្ទៀងផ្ទាត់ទិន្នន័យ",
  },
  stuckPayments: {
    en: "Payments pending too long",
    km: "ការទូទាត់ប្រាក់ជាប់គាំងយូរ",
  },

  // misc
  loading: { en: "Loading…", km: "កំពុងដំណើរការ…" },
  back: { en: "Back", km: "ត្រឡប់ក្រោយ" },
  notFoundTitle: { en: "Page not found", km: "រកមិនឃើញទំព័រ" },
  notFoundSub: {
    en: "The page you are looking for does not exist.",
    km: "ទំព័រដែលអ្នកកំពុងស្វែងរកមិនមានទេ។",
  },
  loginRequired: { en: "Log in to continue", km: "សូមចូលគណនីដើម្បីបន្ត" },
};

export function translate(key, locale) {
  const entry = dict[key];
  if (!entry) return key;
  return entry[locale] || entry.en;
}

/** Pick the localized field of a record: pick(event, 'title') -> title_km/title_en */
export function pick(record, field, locale) {
  if (!record) return "";
  return record[`${field}_${locale}`] || record[`${field}_en`] || "";
}

export const STATUS_LABELS = {
  PENDING_PAYMENT: { en: "Pending payment", km: "រង់ចាំការទូទាត់" },
  AWAITING_CONFIRMATION: {
    en: "Awaiting confirmation",
    km: "រង់ចាំការបញ្ជាក់",
  },
  PAYMENT_FAILED: { en: "Payment failed", km: "ការទូទាត់បរាជ័យ" },
  CONFIRMED: { en: "Confirmed", km: "បញ្ជាក់រួចរាល់" },
  REFUND_REQUESTED: {
    en: "Refund requested",
    km: "បានស្នើសុំប្រាក់ត្រឡប់មកវិញ",
  },
  REFUNDED: { en: "Refunded", km: "បានសងប្រាក់ត្រឡប់វិញ" },
  EXPIRED: { en: "Expired", km: "ផុតកំណត់" },
  CANCELLED: { en: "Cancelled", km: "បានបោះបង់" },
  DRAFT: { en: "Draft", km: "សេចក្តីព្រាង" },
  PUBLISHED: { en: "Published", km: "បានផ្សព្វផ្សាយ" },
  TAKEN_DOWN: { en: "Taken down", km: "បានដកចេញ" },
  CREATED: { en: "Created", km: "បានបង្កើត" },
  PENDING: { en: "Pending", km: "កំពុងរង់ចាំ" },
  SUCCESS: { en: "Success", km: "ជោគជ័យ" },
  FAILED: { en: "Failed", km: "បរាជ័យ" },
  ACTIVE: { en: "Active", km: "សកម្ម" },
  CONSUMED: { en: "Consumed", km: "បានប្រើប្រាស់រួច" },
  RELEASED: { en: "Released", km: "បានដកការកក់" },
};

export function statusLabel(status, locale) {
  const entry = STATUS_LABELS[status];
  if (!entry) return status;
  return entry[locale] || entry.en;
}
