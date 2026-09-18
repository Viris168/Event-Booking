import { usd } from "./format.js";

// Minimal EN/KM dictionary for UI chrome. Content strings (event titles,
// venue names, zone names) come from the data as _en/_km pairs instead.

export const LOCALES = ["en", "km"];

const dict = {
  // nav / chrome
  brand: { en: "CamboBook", km: "CamboBook" },
  home: { en: "Home", km: "ទំព័រដើម" },
  events: { en: "Events", km: "ព្រឹត្តិការណ៍" },
  myBookings: { en: "My Bookings", km: "ការកក់របស់ខ្ញុំ" },
  organizer: { en: "Organizer", km: "អ្នករៀបចំកម្មវិធី" },
  admin: { en: "Admin", km: "អ្នកគ្រប់គ្រង" },
  becomeOrganizer: { en: "Become an organizer", km: "ក្លាយជាអ្នករៀបចំ" },
  login: { en: "Log in", km: "ចូលគណនី" },
  register: { en: "Sign up", km: "បង្កើតគណនី" },
  logout: { en: "Log out", km: "ចាកចេញ" },
  darkMode: { en: "Dark mode", km: "ទម្រង់ងងឹត" },
  lightMode: { en: "Light mode", km: "ទម្រង់ភ្លឺ" },
  checkIn: { en: "Check-in", km: "ពិនិត្យសំបុត្រចូល" },
  // The two static pages. In the dictionary rather than inline in the pages
  // themselves because the footer and the nav drawer both render these labels;
  // the prose ON those pages stays in the pages, the way Footer.jsx keeps its
  // own strapline. A dictionary of UI chrome is not a content management
  // system, and two pages of copy is where that line sits.
  // aboutUs, not `about` - that key is already taken further down by "About
  // this event", which the event detail page renders. Two keys one word apart
  // is worth the awkwardness: a duplicate literal key in this object would not
  // be an error, the later one would simply win, and the page that lost would
  // start quietly rendering the wrong heading.
  aboutUs: { en: "About", km: "អំពីយើង" },
  contactUs: { en: "Contact", km: "ទំនាក់ទំនង" },

  // browse
  heroTitle: {
    en: "Live events across Cambodia",
    km: "ព្រឹត្តិការណ៍ផ្ទាល់នៅទូទាំងប្រទេសកម្ពុជា",
  },
  // Split so the last word can carry the accent treatment in the hero.
  heroTitleLead: {
    /*
     * The Khmer is shorter than a literal translation, deliberately. It used to
     * read "ព្រឹត្តិការណ៍ផ្ទាល់នៅទូទាំងប្រទេស កម្ពុជា" - "live events across the
     * country Cambodia" - which names the country twice and, at 19.4em in Moul
     * against the Latin's 12, could not be held to one line without shrinking
     * to about 15px on a phone.
     *
     * Shortening the line is what buys the single line, so the two belong
     * together: changing this string means re-measuring the divisor in the
     * html[lang='km'] .hero h1 rule.
     */
    en: "Live events across",
    km: "ព្រឹត្តិការណ៍ផ្ទាល់ទូទាំង",
  },
  /*
   * ប្រទេសកម្ពុជា, not the bare កម្ពុជា - the full name, as it is said.
   *
   * The lead above drops its own ទូទាំងប្រទេស so that this can carry ប្រទេស
   * instead of the line saying it twice, which is what the original wording
   * did. The two strings are therefore a pair: shortening one is what pays for
   * the other.
   */
  heroTitleAccent: { en: "Cambodia", km: "ប្រទេសកម្ពុជា" },
  heroSub: {
    en: "Concerts, festivals and conferences. Pick a seat or buy general admission, and show your QR at the door.",
    km: "ការប្រគំតន្ត្រី ពិធីបុណ្យ និងសន្និសីទ។ ជ្រើសរើសកៅអី ឬទិញសំបុត្រចូលទូទៅ រួចបង្ហាញ QR កូដនៅច្រកចូល។",
  },
  search: { en: "Search events", km: "ស្វែងរកព្រឹត្តិការណ៍" },
  searchLabel: { en: "Search", km: "ស្វែងរក" },
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
  priceRange: { en: "Price range", km: "ជួរតម្លៃ" },
  // Now the accessible names of the two slider thumbs rather than field labels,
  // so they read as "lowest price" / "highest price" to a screen reader.
  minPrice: { en: "Lowest price", km: "តម្លៃទាបបំផុត" },
  maxPrice: { en: "Highest price", km: "តម្លៃខ្ពស់បំផុត" },
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
  seatHint: {
    en: "Tap an available seat to pick it. The number inside is the seat number.",
    km: "ចុចលើកៅអីទំនេរដើម្បីជ្រើសរើស។ លេខនៅខាងក្នុងគឺជាលេខកៅអី។",
  },
  legend: { en: "Legend", km: "ចំណាំ" },
  available: { en: "Available", km: "ទំនេរ" },
  heldByOthers: { en: "Held by others", km: "មានអ្នកកំពុងកក់" },
  sold: { en: "Sold", km: "លក់រួចហើយ" },
  yourSelection: { en: "Selected", km: "បានជ្រើសរើស" },
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
  payway: { en: "ABA PayWay", km: "ABA PayWay" },
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

  // ABA PayWay checkout — the flow at developer.payway.com.kh
  checkoutPay: { en: "Checkout & pay", km: "ទូទាត់ប្រាក់" },
  firstName: { en: "First name", km: "នាមខ្លួន" },
  lastName: { en: "Last name", km: "នាមត្រកូល" },
  pay: { en: "Pay", km: "ទូទាត់" },
  close: { en: "Close", km: "បិទ" },
  paywayHandoff: {
    en: "You pay inside ABA PayWay's secure checkout.",
    km: "អ្នកទូទាត់នៅក្នុងផ្ទាំងសុវត្ថិភាពរបស់ ABA PayWay។",
  },
  openCheckout: { en: "Open PayWay checkout", km: "បើកការទូទាត់ PayWay" },
  completeWithin: { en: "Complete within", km: "សូមបញ្ចប់ក្នុងរយៈពេល" },
  checkingTransaction: {
    en: "Checking transaction with PayWay…",
    km: "កំពុងពិនិត្យប្រតិបត្តិការជាមួយ PayWay…",
  },
  contactingBank: { en: "Contacting your bank…", km: "កំពុងភ្ជាប់ទៅធនាគាររបស់អ្នក…" },
  completingPayment: { en: "Completing payment…", km: "កំពុងបញ្ចប់ការទូទាត់…" },
  paymentCancelled: { en: "Payment cancelled", km: "ការទូទាត់ត្រូវបានបោះបង់" },
  transactionExpired: {
    en: "Transaction expired — start a new one",
    km: "ប្រតិបត្តិការផុតកំណត់ — សូមចាប់ផ្តើមម្តងទៀត",
  },
  chargedInUsd: {
    en: "Charged in USD by ABA PayWay",
    km: "គិតជាប្រាក់ដុល្លារ (USD) ដោយ ABA PayWay",
  },

  // bookings
  bookingRef: { en: "Booking reference", km: "លេខកូដយោងការកក់" },
  status: { en: "Status", km: "ស្ថានភាព" },
  yourTickets: { en: "Your tickets", km: "សំបុត្ររបស់អ្នក" },
  groupQr: { en: "Group QR", km: "កូដ QR ជាក្រុម" },
  groupQrTitle: { en: "Group entry", km: "ចូលជាក្រុម" },
  groupQrHint: {
    en: "One code for the whole booking — the steward scans it once and admits your party.",
    km: "កូដតែមួយសម្រាប់ការកក់ទាំងមូល — បុគ្គលិកស្កេនម្តង ហើយអនុញ្ញាតឱ្យក្រុមរបស់អ្នកចូល។",
  },
  ticketsAfterPayment: {
    en: "Tickets appear here once payment is confirmed.",
    km: "សំបុត្រនឹងបង្ហាញនៅទីនេះ បន្ទាប់ពីការទូទាត់ប្រាក់ត្រូវបានបញ្ជាក់។",
  },
  cancelBooking: { en: "Cancel booking", km: "បោះបង់ការកក់" },
  payNow: { en: "Pay now", km: "ទូទាត់ប្រាក់ឥឡូវនេះ" },
  // Deliberately not "Pay again": re-opening the same provider hands back the
  // SAME QR and reference, so nobody is charged twice.
  resumePayment: { en: "Reopen payment", km: "បើកការទូទាត់ម្តងទៀត" },
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
  // auth pages
  showPassword: { en: "Show password", km: "បង្ហាញពាក្យសម្ងាត់" },
  hidePassword: { en: "Hide password", km: "លាក់ពាក្យសម្ងាត់" },
  passwordHint: {
    en: "At least 8 characters",
    km: "យ៉ាងតិច ៨ តួអក្សរ",
  },
  backHome: { en: "Back to Home", km: "ត្រឡប់ទៅទំព័រដើម" },
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
  myAccount: { en: "My account", km: "គណនីរបស់ខ្ញុំ" },
  displayName: { en: "Display name", km: "ឈ្មោះបង្ហាញ" },
  preferredLanguage: { en: "Preferred language", km: "ភាសាដែលអ្នកចង់ប្រើ" },

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
  // The event form's footer. These mirror the organiser's own transitions in
  // EventTransition, so the button text and the server's available_actions
  // describe the same three moves.
  saveDraft: { en: "Save draft", km: "រក្សាទុកជាសេចក្ដីព្រាង" },
  submitForReview: { en: "Submit for review", km: "ដាក់ស្នើដើម្បីត្រួតពិនិត្យ" },
  // The same action, shortened for the dashboard row where the full label wraps
  // onto two lines and drags the row's height with it. The menu and the event
  // form's footer both have the room, and keep the longer wording.
  submitShort: { en: "Submit", km: "ដាក់ស្នើ" },
  withdraw: { en: "Withdraw", km: "ដកសំណើវិញ" },
  // The organiser's own take-down. Worded as the effect rather than as
  // "Take down", which is the admin's moderation action and a different thing.
  takeOffSale: { en: "Take off sale", km: "ដកចេញពីការលក់" },
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
  payouts: { en: "Payouts", km: "ការទូទាត់ជូនអ្នករៀបចំ" },
  moderation: { en: "Event moderation", km: "ការត្រួតពិនិត្យព្រឹត្តិការណ៍" },
  reviewQueue: { en: "Review queue", km: "បញ្ជីរង់ចាំត្រួតពិនិត្យ" },
  organizerApplications: {
    en: "Organiser applications",
    km: "ពាក្យសុំធ្វើជាអ្នករៀបចំ",
  },
  // The support inbox. "Messages" and not "Contact", which is what the PUBLIC
  // page is called - an admin opening this is reading what was sent, not
  // looking for a way to send something.
  supportInbox: { en: "Messages", km: "សារ" },
  disable: { en: "Disable", km: "បិទដំណើរការ" },
  enable: { en: "Enable", km: "បើកដំណើរការ" },
  takeDown: { en: "Take down", km: "ដកចេញពីប្រព័ន្ធ" },
  edit: { en: "Edit", km: "កែសម្រួល" },
  // The undo for takeDown. "Open again" rather than "Restore" because the
  // event was never deleted - it stopped selling, and this starts it again.
  openAgain: { en: "Open again", km: "បើកលក់ឡើងវិញ" },
  // Deliberately not "Delete": the item sits next to Take down, and the whole
  // point of the pair is that one is reversible and this one is not. Kept to a
  // single word so it does not wrap in the actions menu - the confirmation
  // dialog is where "permanently" is spelled out, which is the moment it
  // actually matters.
  removeForever: { en: "Remove", km: "លុបចោល" },
  reconciliation: {
    en: "Needs reconciliation",
    km: "ទាមទារការផ្ទៀងផ្ទាត់ទិន្នន័យ",
  },
  stuckPayments: {
    en: "Payments pending too long",
    km: "ការទូទាត់ប្រាក់ជាប់គាំងយូរ",
  },

  // notifications
  notifications: { en: "Notifications", km: "ការជូនដំណឹង" },
  notificationsAll: { en: "All", km: "ទាំងអស់" },
  notificationsUnread: { en: "Unread", km: "មិនទាន់អាន" },
  markAllRead: { en: "Mark all read", km: "សម្គាល់ថាបានអានទាំងអស់" },
  noNotifications: {
    en: "Nothing to catch up on",
    km: "គ្មានដំណឹងថ្មីទេ",
  },
  noUnreadNotifications: {
    en: "You are all caught up",
    km: "អ្នកបានអានទាំងអស់ហើយ",
  },
  viewAllNotifications: { en: "See all", km: "មើលទាំងអស់" },

  // misc
  loading: { en: "Loading…", km: "កំពុងដំណើរការ…" },
  notFoundTitle: { en: "Page not found", km: "រកមិនឃើញទំព័រ" },
  notFoundSub: {
    en: "The page you are looking for does not exist.",
    km: "ទំព័រដែលអ្នកកំពុងស្វែងរកមិនមានទេ។",
  },
  /*
   * Shown only after a redirect from a page that needed an account, so it says
   * what happened rather than what to do. "Log in to continue" was the third
   * instruction in a column that already reads "Welcome back" and "Log in with
   * your phone or email" - the one thing this line knows and those two do not
   * is WHY the person is suddenly looking at a login form.
   */
  loginRequired: {
    en: "That page needs an account. Sign in and we will take you back to it.",
    km: "ទំព័រនោះត្រូវការគណនី។ សូមចូល ហើយយើងនឹងនាំអ្នកត្រឡប់ទៅវិញ។",
  },
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
  EXPIRED: { en: "Expired", km: "ផុតកំណត់" },
  CANCELLED: { en: "Cancelled", km: "បានបោះបង់" },
  DRAFT: { en: "Draft", km: "សេចក្តីព្រាង" },
  PENDING_REVIEW: { en: "Pending review", km: "រង់ចាំការត្រួតពិនិត្យ" },
  CHANGES_REQUESTED: { en: "Changes requested", km: "ត្រូវការកែប្រែ" },
  APPROVED: { en: "Approved", km: "បានអនុម័ត" },
  REJECTED: { en: "Rejected", km: "បានបដិសេធ" },
  PUBLISHED: { en: "Published", km: "បានផ្សព្វផ្សាយ" },
  // Not an EventStatus. A finished event keeps status PUBLISHED in the
  // database - finishing is not a decision anybody made - but showing
  // "Published" on a row the public can no longer reach is a plain
  // contradiction, so the badge says what is true instead.
  FINISHED: { en: "Finished", km: "បានបញ្ចប់" },
  TAKEN_DOWN: { en: "Taken down", km: "បានដកចេញ" },
  CREATED: { en: "Created", km: "បានបង្កើត" },
  PENDING: { en: "Pending", km: "កំពុងរង់ចាំ" },
  SUCCESS: { en: "Success", km: "ជោគជ័យ" },
  FAILED: { en: "Failed", km: "បរាជ័យ" },
  ACTIVE: { en: "Active", km: "សកម្ម" },
  CONSUMED: { en: "Consumed", km: "បានប្រើប្រាស់រួច" },
  RELEASED: { en: "Released", km: "បានដកការកក់" },
  // Payout lifecycle (V29). APPROVED is already above and reads correctly for
  // a payout too - a second entry would be a second answer to the same
  // question, free to drift from the first.
  REQUESTED: { en: "Requested", km: "បានស្នើសុំ" },
  PAID: { en: "Paid", km: "បានទូទាត់" },
};

export function statusLabel(status, locale) {
  const entry = STATUS_LABELS[status];
  if (!entry) return status;
  return entry[locale] || entry.en;
}

/**
 * The wording for every notification type, in both languages.
 *
 * The server stores a type and a bag of nouns, never a sentence — so this is
 * where a row becomes words, at render time, in whichever language the viewer
 * has selected. Flipping the toggle re-reads history rather than only affecting
 * what arrives next.
 *
 * Placeholders are filled from the row's `params`:
 *   {title}   the event, in the reader's language (titleEn / titleKm)
 *   {ref}     booking reference
 *   {org}     organisation name (orgNameEn / orgNameKm)
 *   {reason}  the admin's message or note — the part a refusal is owed
 */
export const NOTIFICATION_TEXT = {
  // ---------------------------------------------------------------- customer
  BOOKING_CONFIRMED: {
    en: { title: "Booking confirmed", body: "Your tickets for {title} are ready to show at the door." },
    km: {
      title: "ការកក់ត្រូវបានបញ្ជាក់",
      body: "សំបុត្ររបស់អ្នកសម្រាប់ {title} រួចរាល់សម្រាប់បង្ហាញនៅច្រកចូល។",
    },
  },
  BOOKING_PAYMENT_FAILED: {
    en: { title: "Payment did not go through", body: "Nothing was charged for {ref}. You can try paying again." },
    km: {
      title: "ការទូទាត់មិនបានសម្រេច",
      body: "មិនមានការកាត់ប្រាក់សម្រាប់ការកក់ {ref} ទេ។ អ្នកអាចព្យាយាមទូទាត់ម្តងទៀត។",
    },
  },
  BOOKING_CANCELLED: {
    en: { title: "Booking cancelled", body: "{ref} for {title} was cancelled." },
    km: { title: "ការកក់ត្រូវបានបោះបង់", body: "ការកក់ {ref} សម្រាប់ {title} ត្រូវបានបោះបង់។" },
  },
  BOOKING_EXPIRED: {
    en: {
      title: "Booking expired",
      body: "{ref} ran out of time before payment, and the seats went back on sale.",
    },
    km: {
      title: "ការកក់ផុតកំណត់",
      body: "ការកក់ {ref} ផុតកំណត់មុនពេលទូទាត់ ហើយកៅអីត្រូវបានដាក់លក់វិញ។",
    },
  },
  ORGANIZER_APPLICATION_APPROVED: {
    en: { title: "You can now run events", body: "{org} was approved. The organiser area is open." },
    km: {
      title: "អ្នកអាចរៀបចំព្រឹត្តិការណ៍បានហើយ",
      body: "{org} ត្រូវបានអនុម័ត។ ផ្ទាំងអ្នករៀបចំបើកឱ្យប្រើហើយ។",
    },
  },
  ORGANIZER_APPLICATION_REJECTED: {
    en: { title: "Application turned down", body: "{org} was not approved. {reason}" },
    km: { title: "ពាក្យស្នើសុំមិនត្រូវបានអនុម័ត", body: "{org} មិនត្រូវបានអនុម័តទេ។ {reason}" },
  },

  // --------------------------------------------------------------- organizer
  EVENT_APPROVED: {
    en: { title: "Event approved", body: "{title} cleared review. You can publish it now." },
    km: {
      title: "ព្រឹត្តិការណ៍ត្រូវបានអនុម័ត",
      body: "{title} បានឆ្លងកាត់ការត្រួតពិនិត្យ។ អ្នកអាចផ្សព្វផ្សាយវាបានហើយ។",
    },
  },
  EVENT_REJECTED: {
    en: { title: "Event rejected", body: "{title} was turned down. {reason}" },
    km: { title: "ព្រឹត្តិការណ៍ត្រូវបានបដិសេធ", body: "{title} មិនត្រូវបានទទួលយកទេ។ {reason}" },
  },
  EVENT_CHANGES_REQUESTED: {
    en: { title: "Changes requested", body: "{title} needs edits before it can go live. {reason}" },
    km: { title: "ត្រូវការកែប្រែ", body: "{title} ត្រូវការកែប្រែមុនពេលអាចដាក់ផ្សាយ។ {reason}" },
  },
  EVENT_TAKEN_DOWN: {
    en: { title: "Event taken down", body: "{title} was removed from the catalogue by a platform admin." },
    km: {
      title: "ព្រឹត្តិការណ៍ត្រូវបានដកចេញ",
      body: "{title} ត្រូវបានដកចេញពីបញ្ជីដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ។",
    },
  },
  EVENT_RESTORED: {
    en: { title: "Event back on sale", body: "{title} was put back in the catalogue by a platform admin." },
    km: {
      title: "ព្រឹត្តិការណ៍លក់ឡើងវិញ",
      body: "{title} ត្រូវបានដាក់ចូលបញ្ជីវិញដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ។",
    },
  },
  EVENT_TICKETS_SOLD: {
    en: { title: "Tickets sold", body: "{ref} was paid for {title}." },
    km: { title: "លក់សំបុត្របាន", body: "ការកក់ {ref} បានទូទាត់រួចសម្រាប់ {title}។" },
  },

  // ------------------------------------------------------------------- admin
  EVENT_SUBMITTED_FOR_REVIEW: {
    en: { title: "Event waiting for review", body: "{title} is in the review queue." },
    km: { title: "ព្រឹត្តិការណ៍រង់ចាំការត្រួតពិនិត្យ", body: "{title} កំពុងនៅក្នុងបញ្ជីរង់ចាំត្រួតពិនិត្យ។" },
  },
  ORGANIZER_APPLICATION_SUBMITTED: {
    en: { title: "New organiser application", body: "{org} applied to run events." },
    km: { title: "ពាក្យស្នើសុំធ្វើជាអ្នករៀបចំថ្មី", body: "{org} បានស្នើសុំរៀបចំព្រឹត្តិការណ៍។" },
  },
  PAYOUT_REQUESTED: {
    en: {
      title: "Payout requested",
      body: "{org} asked for {amount} for {title}. Invoice {invoice}.",
    },
    km: {
      title: "សំណើសុំទូទាត់ប្រាក់",
      body: "{org} បានស្នើសុំ {amount} សម្រាប់ {title}។ វិក្កយបត្រ {invoice}។",
    },
  },

  // ------------------------------------------------------ organizer payouts
  PAYOUT_APPROVED: {
    en: {
      title: "Payout approved",
      body: "{amount} for {title} was approved. The transfer is being arranged.",
    },
    km: {
      title: "ការទូទាត់ត្រូវបានអនុម័ត",
      body: "{amount} សម្រាប់ {title} ត្រូវបានអនុម័ត។ ការផ្ទេរប្រាក់កំពុងរៀបចំ។",
    },
  },
  PAYOUT_PAID: {
    // The reference leads the body rather than trailing it: this is the message
    // somebody re-reads when the money has not appeared, and it is the only
    // thing in it their bank can look up.
    en: {
      title: "You have been paid",
      body: "{amount} for {title} was sent. Reference {reference}.",
    },
    km: {
      title: "អ្នកបានទទួលប្រាក់",
      body: "{amount} សម្រាប់ {title} ត្រូវបានផ្ញើ។ លេខយោង {reference}។",
    },
  },
};

/**
 * Render one notification into { title, body }.
 *
 * An unknown type falls back to the type name rather than throwing: the server
 * can ship a new NotificationType before the client learns the wording for it,
 * and an inbox that renders a bare constant is recoverable, while one that
 * throws takes the whole list down with it.
 */
export function notificationText(type, params, locale) {
  const entry = NOTIFICATION_TEXT[type];
  if (!entry) return { title: type, body: "" };

  const copy = entry[locale] || entry.en;
  const p = params || {};

  // params keys stay camelCase: the API's SNAKE_CASE strategy renames record
  // fields, not the contents of a JSON object.
  const fills = {
    "{title}": (locale === "km" ? p.titleKm : p.titleEn) || p.titleEn || "",
    "{ref}": p.bookingRef || "",
    "{org}": (locale === "km" ? p.orgNameKm : p.orgNameEn) || p.orgNameEn || "",
    "{reason}": p.message || p.note || "",
    // Payout params. Formatted here rather than by the caller because these
    // rows are rendered by the bell, the inbox and nothing else - and cents
    // reaching a person's screen is the one thing format.js exists to prevent.
    "{amount}": p.netUsdCents == null ? "" : usd(p.netUsdCents),
    "{invoice}": p.invoiceNo || "",
    "{reference}": p.reference || "",
  };

  const fill = (s) =>
    Object.entries(fills)
      .reduce((out, [token, value]) => out.split(token).join(value), s)
      // {reason} is often absent, which leaves a double space and a dangling
      // full stop where the sentence used to continue.
      .replace(/\s+/g, " ")
      .trim();

  return { title: fill(copy.title), body: fill(copy.body) };
}