import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard.jsx";
import Icon, { CATEGORY_ICON } from "../components/Icon.jsx";
import {
  EventGridSkeleton,
  SpotlightSkeleton,
} from "../components/Skeleton.jsx";
import { Empty, IconSelect, Money, SearchInput } from "../components/ui.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useProvinces } from "../lib/useProvinces.js";
import { eventArt } from "../lib/eventArt.js";
import { getEvents } from "../api/events.js";

// One tap into the searches people actually run.
//
// Province codes are the numeric ones the API returns ("12" = Phnom Penh), not
// the two-letter abbreviations the retired mock store used. Those old 'PP' /
// 'SR' values matched no row once the filter started hitting the real
// endpoint, so both chips returned an empty grid.
/* Hero backdrop, served from web/public. If the file is missing the banner
   falls back to its gradient rather than breaking, so swapping the art is just
   a change to this one constant. */
const HERO_IMAGE = "/event.jpeg";

const QUICK_SEARCHES = [
  {
    q: "pp",
    en: "Phnom Penh",
    km: "ភ្នំពេញ",
    icon: "building",
    params: { province: "12" },
  },
  {
    q: "sr",
    en: "Siem Reap",
    km: "សៀមរាប",
    icon: "temple",
    params: { province: "17" },
  },
  {
    q: "concert",
    en: "Concerts",
    km: "ការប្រគំតន្ត្រី",
    icon: "music",
    params: { q: "concert" },
  },
  {
    q: "festival",
    en: "Festivals",
    km: "មហោស្រព",
    icon: "festival",
    params: { q: "festival" },
  },
  {
    q: "cheap",
    en: "Under $20",
    km: "ក្រោម $20",
    icon: "wallet",
    params: { maxUsd: "20" },
  },
];

/** How often the hero rail advances, in ms. */
const ROTATE_MS = 5000;
/** Cards in the rail. More than this and the dots stop being scannable. */
const RAIL_SIZE = 5;

/** Tickets sold, across both field spellings the API and the mapper produce. */
function soldCount(e) {
  return e.totalSold ?? e.total_sold ?? 0;
}

function startMs(e) {
  const v = e.startsAt ?? e.starts_at;
  return v ? new Date(v).getTime() : Infinity;
}

/**
 * Is this event taking money right now?
 *
 * <p>The rail is a buy-now surface, and ranking by tickets sold quietly works
 * against that: an event whose sales window has already closed has had the whole
 * window to accumulate sales, so it outranks everything still open almost by
 * construction. The old date ordering hid that — the closed event had to also be
 * the next one up to reach the front. Ranking by sales puts it there by default,
 * which is how the home page ended up led by a card reading "sales closed".
 *
 * <p>Past events need no check here: the public catalogue already lists from
 * today onward, so they never reach this page.
 */
function isOnSale(e) {
  const now = Date.now();
  const at = (v) => (v ? new Date(v).getTime() : null);
  const opens = at(e.salesOpenAt ?? e.sales_open_at);
  const closes = at(e.salesCloseAt ?? e.sales_close_at);
  if (opens && opens > now) return false;
  if (closes && closes < now) return false;
  return true;
}

function getMinPriceCents(event) {
  let min = Infinity;
  const classes = event.seatClasses ?? event.seat_classes ?? [];
  classes.forEach(
    (c) => (min = Math.min(min, c.priceUsdCents ?? c.price_usd_cents ?? 0)),
  );
  const zones = event.zones ?? [];
  zones.forEach(
    (z) => (min = Math.min(min, z.priceUsdCents ?? z.price_usd_cents ?? 0)),
  );
  return min === Infinity ? 0 : min;
}

/**
 * The rail's card. Deliberately NOT the grid's EventCard: this one sits on a
 * photographic banner, so it is a single piece of artwork with the detail laid
 * over it, rather than a picture stacked on a white body. That also makes it
 * shorter, which is what lets it sit beside the headline without crowding.
 */
function RailCard({ event }) {
  const { t, locale } = useLocale();
  const art = eventArt(event, "banner");
  const venue = event.venue;
  const price = getMinPriceCents(event);
  const start = new Date(event.startsAt ?? event.starts_at);
  const title =
    locale === "km"
      ? (event.titleKm ?? event.title_km)
      : (event.titleEn ?? event.title_en);
  const venueName =
    locale === "km"
      ? (venue?.nameKm ?? venue?.name_km)
      : (venue?.nameEn ?? venue?.name_en);

  return (
    <Link
      to={`/events/${event.id}`}
      className={`rail-card ${art.className}${art.hasImage ? " has-photo" : ""}`}
    >
      {art.hasImage ? (
        <img
          className="ev-photo"
          src={art.url}
          alt=""
          decoding="async"
          onError={(e) => {
            e.currentTarget.remove();
          }}
        />
      ) : (
        <Icon
          name={CATEGORY_ICON[event.category] || "ticket"}
          size={44}
          strokeWidth={1.3}
          className="rail-icon"
        />
      )}

      <span className="rail-date">
        {start.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()}
        <b>{start.getDate()}</b>
      </span>

      <div className="rail-body">
        <strong>{title}</strong>
        {venueName && (
          <span className="rail-meta">
            <Icon name="mapPin" size={13} />
            {venueName}
          </span>
        )}
        <div className="rail-foot">
          <span className="rail-price">
            {t("from_price")}{" "}
            <b>
              <Money cents={price} />
            </b>
          </span>
          <span className="rail-go" aria-hidden="true">
            <Icon name="arrowRight" size={13} strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}

/**
 * The best-selling events, one card at a time, advancing on its own.
 *
 * Auto-advancing content has to be stoppable (WCAG 2.2.2), so the timer pauses
 * while the pointer is over the rail and while focus is inside it — otherwise
 * the card can slide out from under someone mid-click or mid-read. The dots are
 * real buttons, so there is a manual way through regardless.
 */
function HeroRail({ events }) {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = events.length;

  // Derived, not stored: if the list shrinks, a stale index would otherwise
  // translate the track into empty space. Wrapping here beats correcting it in
  // an effect, which would cost an extra render every time.
  const active = count ? index % count : 0;

  // Re-keyed on `active` too, so choosing a dot restarts the full interval
  // instead of inheriting whatever was left of the previous one.
  useEffect(() => {
    if (paused || count < 2) return undefined;
    const id = setTimeout(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(id);
  }, [active, paused, count]);

  const hold = useCallback(() => setPaused(true), []);
  const release = useCallback(() => setPaused(false), []);

  if (!count) return null;

  return (
    <div
      className="hero-rail"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      aria-roledescription="carousel"
      aria-label={
        locale === "km" ? "ព្រឹត្តិការណ៍លក់ដាច់បំផុត" : "Top selling events"
      }
    >
      <div className="hero-rail-head">
        <span className="rail-pill-badge">
          <Icon name="trending" size={12} />{" "}
          {locale === "km" ? "លក់ដាច់បំផុត" : "Top selling"}
        </span>
      </div>

      <div className="hero-viewport">
        <div
          className="hero-track"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {events.map((e, i) => (
            /* Off-screen slides keep their links in the tab order unless they
               are inerted — the classic carousel focus trap, where tabbing
               walks into cards nobody can see. */
            <div
              className="hero-slide"
              key={e.id}
              inert={i !== active ? "" : undefined}
            >
              <RailCard event={e} />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="hero-dots">
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className={`hero-dot${i === active ? " on" : ""}`}
              aria-current={i === active}
              aria-label={`${locale === "km" ? "ព្រឹត្តិការណ៍" : "Event"} ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/*
 * What the product actually does, between the last event card and the footer.
 *
 * Every line here is a claim about CamboBook that the code backs: KHQR through
 * PayWay, a scannable code per booking, SEATED/ZONED/MIXED inventory, and the
 * Telegram connection an organiser makes on /become-an-organizer. Nothing about
 * wallets, native apps or settlement speed - a storefront that promises what
 * the gate cannot do is a support ticket waiting at the door.
 */
const HOW_IT_WORKS = [
  {
    icon: "qr",
    serial: "01",
    en: "KHQR and ABA PayWay",
    km: "KHQR និង ABA PayWay",
    bodyEn:
      "Pay from ABA Mobile, Wing, ACLEDA or any Bakong app. The booking confirms itself once the payment settles.",
    bodyKm:
      "ទូទាត់ពី ABA Mobile, Wing, ACLEDA ឬកម្មវិធី Bakong ណាមួយ។ ការកក់បញ្ជាក់ដោយខ្លួនឯងពេលការទូទាត់ជោគជ័យ។",
  },
  {
    icon: "ticket",
    serial: "02",
    en: "A QR ticket at the door",
    km: "សំបុត្រ QR នៅទ្វារចូល",
    bodyEn:
      "Every booking carries its own code. Gate staff scan it and it checks in on the spot.",
    bodyKm:
      "រាល់ការកក់មានកូដរៀងៗខ្លួន។ បុគ្គលិកនៅទ្វារស្កេន ហើយចូលបានភ្លាម។",
  },
  {
    icon: "seat",
    serial: "03",
    en: "Reserved seats or zoned entry",
    km: "កៅអីកក់ទុក ឬចូលតាមតំបន់",
    bodyEn:
      "Pick an exact seat from the map, or buy into a zone. Each event decides which it sells.",
    bodyKm:
      "ជ្រើសកៅអីពិតប្រាកដពីផែនទី ឬទិញតាមតំបន់។ ព្រឹត្តិការណ៍នីមួយៗសម្រេចដោយខ្លួនឯង។",
  },
  {
    icon: "telegram",
    serial: "04",
    en: "Told on Telegram",
    km: "ដំណឹងតាម Telegram",
    bodyEn:
      "Organisers connect a Telegram account and hear about each sale there as well as in the inbox here.",
    bodyKm:
      "អ្នករៀបចំភ្ជាប់គណនី Telegram ហើយទទួលដំណឹងរាល់ការលក់នៅទីនោះផងដែរ។",
  },
];

function HowItWorks({ locale }) {
  return (
    /* A band rather than another block in the column: this section is the one
       place the page explains itself, and changing the ground under it says so
       once, at the size of the whole section, instead of four times over on
       four cards. Outer/inner is the split .footer and .hero-base already use. */
    <section className="home-band">
      <div className="home-band-inner">
      <div className="section-head">
        <h2>
          {locale === "km"
            ? "សំបុត្ររបស់អ្នក ពីការទូទាត់ដល់ទ្វារចូល"
            : "Your ticket, from payment to the gate"}
        </h2>
      </div>
      <p className="home-strip-lede">
        {locale === "km"
          ? "ទូទាត់ដោយកម្មវិធីធនាគារដែលអ្នកមានស្រាប់ ហើយកូដ QR សម្រាប់ចូលមកដល់ពេលការទូទាត់ជោគជ័យ។"
          : "Pay with the banking app you already have, and the code that gets you in arrives as soon as the payment clears."}
      </p>

      <div className="grid grid-cards">
        {HOW_IT_WORKS.map((f) => (
          <article className="card home-feature" key={f.icon}>
            {/* The stub half. Fixed height, because the notches punched into
                the two edges are positioned against it and a stub that grew
                with its icon would drag them out of line with the tear. */}
            <div className="home-feature-stub">
              <Icon name={f.icon} size={18} />
              <span className="home-feature-serial">{f.serial}</span>
            </div>
            <div className="card-body">
              <h3>{locale === "km" ? f.km : f.en}</h3>
              <p>{locale === "km" ? f.bodyKm : f.bodyEn}</p>
            </div>
          </article>
        ))}
      </div>
      </div>
    </section>
  );
}

function OrganizerCta({ locale }) {
  return (
    <section className="home-strip">
      <div className="card home-cta">
        <div className="card-body">
          <div>
            <h2>
              {locale === "km"
                ? "រៀបចំព្រឹត្តិការណ៍នៅកម្ពុជាមែនទេ?"
                : "Running an event in Cambodia?"}
            </h2>
            <p>
              {locale === "km"
                ? "ចុះបញ្ជីកម្មវិធីរបស់អ្នក លក់កៅអីកក់ទុក ឬសំបុត្រទូទៅ ហើយពិនិត្យអ្នកចូលនៅទ្វារពីកម្មវិធីរុករកលើទូរស័ព្ទណាក៏បាន។"
                : "List your show, sell reserved seats or general admission, and check people in at the door from any phone browser."}
            </p>
          </div>

          <div className="home-cta-actions">
            <Link className="btn btn-primary" to="/become-an-organizer">
              {locale === "km" ? "ក្លាយជាអ្នករៀបចំ" : "Become an organizer"}
              <Icon name="arrowRight" size={15} />
            </Link>
            <Link className="btn btn-outline" to="/about">
              {locale === "km" ? "មើលរបៀបដំណើរការ" : "See how it works"}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  const { t, locale } = useLocale();
  const { provinces } = useProvinces();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [province, setProvince] = useState("");

  const [published, setPublished] = useState([]);
  // The catalogue-wide count, which the loaded page of 12 cannot give on its own.
  const [totalLive, setTotalLive] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvents({ size: 12, sort: "startsAt,asc" })
      .then((page) => {
        setPublished(page.content || []);
        setTotalLive(
          page.total_elements ??
            page.totalElements ??
            (page.content || []).length,
        );
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  /*
   * Best sellers first.
   *
   * Sorted here rather than by the server because there is nothing to sort on:
   * EventSort offers soonest and the two price directions only, and totalSold is
   * derived in EventMapper from the zone and seat-class rows rather than stored
   * on the event, so there is no column to order by. This therefore ranks the
   * page already fetched (12 events), not the whole catalogue — the same honest
   * ceiling the hero's `ticketsSold` counter settles for just below, and for the
   * same reason.
   *
   * filter() copies, so the sort below never mutates `published` — `featured`
   * and `upcoming` still read it in the API's own date order.
   */
  const rail = published
    .filter(isOnSale)
    .sort((a, b) => soldCount(b) - soldCount(a) || startMs(a) - startMs(b))
    .slice(0, RAIL_SIZE);
  const featured = published.slice(0, 4);
  const upcoming = published.slice(4, 12);

  /**
   * Hero counters, from the API instead of the retired mock store.
   *
   * `live` and `provinces` are exact - one is the page's total_elements, the
   * other the length of the reference list. `sold` is summed over the events
   * actually loaded (at most 12), so on a catalogue larger than one page it
   * under-reports. Shown anyway because there is no aggregate endpoint for it,
   * and an honest floor beats a number invented in the browser.
   */
  const ticketsSold = published.reduce(
    (sum, e) => sum + (e.total_sold ?? e.totalSold ?? 0),
    0,
  );

  function submit(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (province) params.set("province", province);
    navigate(`/events?${params.toString()}`);
  }

  return (
    <>
      <section className="hero">
        {/* Decorative backdrop, so it carries no alt text. The gradient beneath
            is what shows while this decodes — and what remains if the file is
            missing, since the image removes itself on error. That fallback is
            the reason the banner still looks finished with no art in place. */}
        <img
          className="hero-bg"
          src={HERO_IMAGE}
          alt=""
          fetchPriority="high"
          decoding="async"
          onError={(e) => {
            e.currentTarget.remove();
          }}
        />
        <div className="hero-inner hero-grid">
          <div className="hero-copy">
            <h1>
              {t("heroTitleLead")}{" "}
              <span className="hero-accent">{t("heroTitleAccent")}</span>
            </h1>
            <p>{t("heroSub")}</p>

            <form className="searchbar" onSubmit={submit} role="search">
              <span className="sb-cell">
                <SearchInput
                  value={q}
                  onChange={setQ}
                  placeholder={
                    locale === "km"
                      ? "ស្វែងរកព្រឹត្តិការណ៍ សិល្បករ ឬទីកន្លែង"
                      : "Search events, artists or venues"
                  }
                  ariaLabel={t("search")}
                />
              </span>
              <span className="sb-cell">
                <IconSelect
                  icon="mapPin"
                  value={province}
                  onChange={setProvince}
                  ariaLabel={t("province")}
                >
                  <option value="">{t("allProvinces")}</option>
                  {provinces.map((p) => (
                    <option key={p.code} value={p.code}>
                      {locale === "km" ? p.name_km : p.name_en}
                    </option>
                  ))}
                </IconSelect>
              </span>
              <button className="btn btn-primary" type="submit">
                <Icon name="search" size={16} />
                {t("searchLabel")}
              </button>
            </form>

            {/* Straight into the most common intents, no typing required. */}
            <div className="quick-links">
              <span className="tiny">
                {locale === "km" ? "ពេញនិយម" : "Popular"}
              </span>
              {QUICK_SEARCHES.map((s) => (
                <Link
                  key={s.q}
                  className="quick-chip"
                  to={`/events?${new URLSearchParams(s.params)}`}
                >
                  <Icon name={s.icon} size={13} />
                  {locale === "km" ? s.km : s.en}
                </Link>
              ))}
            </div>
          </div>

          {loading ? <SpotlightSkeleton /> : <HeroRail events={rail} />}
        </div>

        {/* The numbers sit on a rule at the foot of the banner. They used to
            trail off the bottom of the copy column, which left the hero with no
            base and the right half empty below the card. */}
        <div className="hero-base">
          <div className="hero-inner hero-base-inner">
            <div className="hero-stats">
              <div>
                <b>{totalLive}</b>
                {locale === "km" ? "ព្រឹត្តិការណ៍ផ្សាយ" : "live events"}
              </div>
              <div>
                <b>{ticketsSold.toLocaleString()}</b>
                {locale === "km" ? "សំបុត្រលក់រួច" : "tickets sold"}
              </div>
              <div>
                <b>{provinces.length}</b>
                {locale === "km" ? "ខេត្ត/ក្រុង" : "provinces covered"}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container">
        <section>
          <div className="section-head">
            <h2>{t("featured")}</h2>
            <Link to="/events" className="with-icon">
              {t("viewAll")}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          {loading ? (
            <EventGridSkeleton count={4} />
          ) : featured.length ? (
            <div className="grid grid-cards grid-one-row">
              {featured.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <Empty title={t("noEvents")} />
          )}
        </section>

        <section style={{ marginTop: "2.5rem" }}>
          <div className="section-head">
            <h2>{t("upcoming")}</h2>
            <Link to="/events" className="with-icon">
              {t("viewAll")}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          {loading ? (
            <EventGridSkeleton count={4} />
          ) : (
            <div className="grid grid-cards grid-one-row">
              {upcoming.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          )}
        </section>

      </div>

      <HowItWorks locale={locale} />

      {/* The CTA stays on the page's own ground. The footer below it is
          already a band, and a second one butted against it leaves two
          coloured strips with a muddy seam between them - this way the CTA
          is the breather that separates them. */}
      <div className="container">
        <OrganizerCta locale={locale} />
      </div>
    </>
  );
}
