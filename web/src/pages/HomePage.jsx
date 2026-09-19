import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard.jsx";
import Icon, { CATEGORY_ICON } from "../components/Icon.jsx";
import { EventGridSkeleton, SpotlightSkeleton } from "../components/Skeleton.jsx";
import { Empty, IconSelect, Money, SearchInput } from "../components/ui.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useProvinces } from "../lib/useProvinces.js";
import { eventArt } from "../lib/eventArt.js";
import { getEvents } from "../api/events.js";

/* Hero backdrop, served from web/public. If the file is missing the banner
   falls back to its gradient rather than breaking, so swapping the art is just
   a change to this one constant. */
const HERO_IMAGE = "/event.jpeg";

// One tap into the searches people actually run.
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

/** Is this event taking money right now? */
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
 * over it, rather than a picture stacked on a white body.
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
 * while the pointer is over the rail and while focus is inside it.
 */
function HeroRail({ events }) {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = events.length;

  const active = count ? index % count : 0;

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
 * Redesigned around a wireframe the team supplied (Home 1 of three): a
 * banner-and-card hero, a bulleted claim beside an image, a three-step row, a
 * bio-style card for the other audience, a plain centred proof section, an
 * accordion beside an image, and a second banner-and-card band closing the
 * page. The section ORDER and SHAPE follow that wireframe; the CONTENT is
 * CamboBook's own throughout - every line below is a claim the code backs.
 *
 * Two deliberate departures from the wireframe, both because the literal
 * version would be dishonest or useless here:
 *   - The hero's single generic button becomes the real search form. A
 *     ticketing homepage with a button that goes nowhere in particular is
 *     worse than one with no button at all.
 *   - A "featured events" grid is inserted right after the hero, which the
 *     wireframe (built for a service business, not a storefront) has no slot
 *     for. Following the wireframe to the letter would ship a ticketing site
 *     with no tickets visible on it.
 */

/** The "why book" bullets - what buying a ticket actually gets you. */
const WHY_BOOK = [
  {
    icon: "qr",
    en: "Pay with KHQR from any Bakong app",
    km: "ទូទាត់ដោយ KHQR ពីកម្មវិធី Bakong ណាមួយ",
  },
  {
    icon: "ticket",
    en: "One QR code gets you through the gate",
    km: "កូដ QR មួយសម្រាប់ចូលទ្វារ",
  },
  {
    icon: "seat",
    en: "Pick your exact seat, or buy into a zone",
    km: "ជ្រើសកៅអីពិតប្រាកដ ឬទិញតាមតំបន់",
  },
  {
    icon: "clock",
    en: "Your seats are held while you pay",
    km: "កៅអីត្រូវបានទុកឱ្យពេលអ្នកទូទាត់",
  },
];

/** The three-step row: what actually happens between deciding and getting in. */
const HOW_STEPS = [
  {
    icon: "search",
    titleEn: "Find your event",
    titleKm: "ស្វែងរកព្រឹត្តិការណ៍",
    bodyEn: "Browse by province, category or date, then pick a seat or a zone.",
    bodyKm: "រុករកតាមខេត្ត ប្រភេទ ឬកាលបរិច្ឆេទ រួចជ្រើសកៅអី ឬតំបន់។",
  },
  {
    icon: "qr",
    titleEn: "Pay with KHQR",
    titleKm: "ទូទាត់ដោយ KHQR",
    bodyEn: "Scan from any Bakong-linked banking app. No new account needed.",
    bodyKm: "ស្កេនពីកម្មវិធីធនាគារណាមួយដែលភ្ជាប់ Bakong។ មិនចាំបាច់បង្កើតគណនីថ្មីទេ។",
  },
  {
    icon: "ticket",
    titleEn: "Show your QR at the door",
    titleKm: "បង្ហាញ QR នៅច្រកចូល",
    bodyEn: "Gate staff scan your ticket and you're in.",
    bodyKm: "បុគ្គលិកនៅច្រកចូលស្កេនសំបុត្ររបស់អ្នក រួចអ្នកចូលបាន។",
  },
];

/** FAQ accordion. Every answer is checked against the code, not aspirational. */
const FAQ_ITEMS = [
  {
    qEn: "How do I get my ticket?",
    qKm: "តើខ្ញុំទទួលបានសំបុត្រដោយរបៀបណា?",
    aEn: "Once your KHQR payment settles, your ticket appears in My Bookings with a QR code - there is nothing to download or print.",
    aKm: "ពេលការទូទាត់ KHQR ជោគជ័យ សំបុត្ររបស់អ្នកនឹងបង្ហាញនៅក្នុង My Bookings ជាមួយកូដ QR។ មិនចាំបាច់ទាញយក ឬបោះពុម្ពទេ។",
  },
  {
    qEn: "Do I need an ABA or Wing account specifically?",
    qKm: "តើខ្ញុំត្រូវការគណនី ABA ឬ Wing ជាក់លាក់ដែរឬទេ?",
    aEn: "No. KHQR works with any Cambodian banking app connected to Bakong, including ABA, Wing and ACLEDA.",
    aKm: "ទេ។ KHQR ដំណើរការជាមួយកម្មវិធីធនាគារកម្ពុជាណាមួយដែលភ្ជាប់ Bakong រួមទាំង ABA, Wing និង ACLEDA។",
  },
  {
    qEn: "Can I run my own event?",
    qKm: "តើខ្ញុំអាចរៀបចំព្រឹត្តិការណ៍ផ្ទាល់ខ្លួនបានទេ?",
    aEn: "Yes - apply from Become an organizer. Once approved you can list events, draw your own seat map and check people in at the door.",
    aKm: "បាន — ដាក់ពាក្យស្នើសុំពី \u200bក្លាយជាអ្នករៀបចំ\u200b។ នៅពេលអនុម័ត អ្នកអាចចុះបញ្ជីព្រឹត្តិការណ៍ គូសផែនទីកៅអីផ្ទាល់ខ្លួន និងពិនិត្យអ្នកចូល។",
  },
];

/** How often the feature panels advance to their next photo, in ms. */
const PHOTO_ROTATE_MS = 6000;

/**
 * Licensed photos standing in for the wireframe's stock illustration slots -
 * real photography (Wikimedia Commons, verified against AI-stock lookalikes
 * that turn up in the same searches) rather than screenshots of the product
 * itself or an invented graphic. All CC BY-SA/CC BY, which conditions reuse
 * on carrying the credit with the image - hence FeatureSlider's caption
 * rather than a bare `alt` doing that job silently. One folder per slot
 * under web/public/home/ so a photo can be swapped without touching code.
 */
const WHY_BOOK_PHOTOS = [
  {
    src: "/home/why-book/1.webp",
    alt: {
      en: "A concertgoer filming a fireworks display at a night show",
      km: "អ្នកទស្សនាថតវីដេអូការបាញ់ភ្លើងក្នុងកម្មវិធីពេលយប់",
    },
    creditName: "Vivu Vietnam",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Audience_impressed_by_Danang_International_Firework_Festival.jpg",
  },
  {
    src: "/home/why-book/2.webp",
    alt: {
      en: "A festival crowd raising their hands under crossing stage lights",
      km: "បណ្តាជនក្នុងមហោស្រពលើកដៃឡើងក្រោមពន្លឺឆាកកាត់គ្នា",
    },
    creditName: "PinkBeachPlanet",
    creditUrl:
      "https://commons.wikimedia.org/wiki/File:Beach-Please-2022-crowd-stage-lights-night-performance.jpg",
  },
];

const ORGANIZER_PHOTOS = [
  {
    src: "/home/organizer/1.webp",
    alt: {
      en: "A digital mixing console mid-show, channel faders lit blue",
      km: "តុលាយសំឡេងឌីជីថលកំពុងដំណើរការ ជាមួយគ្រាប់ចុចពន្លឺខៀវ",
    },
    creditName: "Lchader",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Audio_mixer_wide_shot.jpg",
  },
  {
    src: "/home/organizer/2.webp",
    alt: {
      en: "A close-up of mixing console channel faders and meters",
      km: "រូបភាពជិតនៃគ្រាប់ចុចតុលាយសំឡេង និងឧបករណ៍វាស់កម្រិត",
    },
    creditName: "Lchader",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Audio_mixer_close_up.jpg",
  },
];

const FAQ_PHOTOS = [
  {
    src: "/home/faq/1.webp",
    alt: {
      en: "A DJ silhouetted in stage light above a cheering crowd in the rain",
      km: "DJ ក្នុងស្រមោលពន្លឺឆាកនៅខាងលើបណ្តាជនកំពុងលើកដៃក្នុងភ្លៀង",
    },
    creditName: "Shane Selig",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Lights_on_the_Lawn_2015.jpg",
  },
  {
    src: "/home/faq/2.webp",
    alt: {
      en: "Performers in traditional Cambodian dress at a cultural show",
      km: "សិល្បករស្លៀកពាក់ប្រពៃណីខ្មែរក្នុងកម្មវិធីវប្បធម៌មួយ",
    },
    creditName: "Kalicja",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Concert_Cambodia.jpg",
  },
];

/**
 * A slot that cross-fades between a few licensed photos, echoing the hero
 * rail rather than introducing a second carousel pattern. Pauses on hover
 * and focus for the same reason HeroRail does (WCAG 2.2.2) - a photo tile is
 * lower stakes than the hero, but the rule doesn't get cheaper to violate for
 * that.
 */
function FeatureSlider({ photos }) {
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = photos.length;
  const active = count ? index % count : 0;
  const current = photos[active];

  useEffect(() => {
    if (paused || count < 2) return undefined;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % count),
      PHOTO_ROTATE_MS,
    );
    return () => clearTimeout(id);
  }, [active, paused, count]);

  const hold = useCallback(() => setPaused(true), []);
  const release = useCallback(() => setPaused(false), []);

  return (
    <figure
      className="home-panel home-photo"
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
    >
      {photos.map((p, i) => (
        <img
          key={p.src}
          className={`home-shot${i === active ? " is-active" : ""}`}
          src={p.src}
          alt={i === active ? (locale === "km" ? p.alt.km : p.alt.en) : ""}
          loading={i === 0 ? "eager" : "lazy"}
          decoding="async"
          aria-hidden={i !== active}
        />
      ))}
      {count > 1 && (
        <div className="home-photo-dots">
          {photos.map((p, i) => (
            <button
              key={p.src}
              type="button"
              className={`home-photo-dot${i === active ? " on" : ""}`}
              aria-current={i === active}
              aria-label={`${locale === "km" ? "រូបភាព" : "Photo"} ${i + 1}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
      <figcaption className="tiny muted">
        Photo:{" "}
        <a href={current.creditUrl} target="_blank" rel="noopener noreferrer">
          {current.creditName}
        </a>{" "}
        (CC BY-SA 4.0)
      </figcaption>
    </figure>
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
   * Best sellers first, for the hero rail.
   *
   * filter() copies, so the sort below never mutates `published` - `featured`
   * still reads it in the API's own date order.
   */
  const rail = published
    .filter(isOnSale)
    .sort((a, b) => soldCount(b) - soldCount(a) || startMs(a) - startMs(b))
    .slice(0, RAIL_SIZE);
  const featured = published.slice(0, 4);

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
        {/* --------------------------------------------------- on sale now ---
            The wireframe has no events grid - it was built for a practice
            with one thing to sell, not a catalogue. Inserted here so a
            first-time visitor sees actual tickets before anything else. */}
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
            <div className="grid grid-cards">
              {featured.map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          ) : (
            <Empty title={t("noEvents")} />
          )}
        </section>

        {/* ---------------------------------------------- why book, split ---
            Text-and-bullets left, image right - the wireframe's "Outcome"
            section verbatim. The bullets are checkCircle rather than plain
            dots: the wireframe's own bullet character, drawn in the icon set
            the rest of the product already uses instead of introducing one. */}
        <section className="home-split">
          <div className="home-split-text">
            <h2>
              {locale === "km"
                ? "ហេតុអ្វីត្រូវកក់សំបុត្រជាមួយ CamboBook"
                : "Why book with CamboBook"}
            </h2>
            <p>
              {locale === "km"
                ? "រាល់ព្រឹត្តិការណ៍ទាំងអស់ដំណើរការតាមដំណើរការទូទាត់តែមួយ ដូច្នេះការទិញសំបុត្រធ្វើដូចគ្នាទោះជាអ្នករៀបចំណាមួយក៏ដោយ។"
                : "Every event on the platform runs through the same checkout, so buying a ticket works the same way no matter who is organising it."}
            </p>
            <ul className="home-bullets">
              {WHY_BOOK.map((item) => (
                <li key={item.icon}>
                  <Icon name="checkCircle" size={17} />
                  <span>{locale === "km" ? item.km : item.en}</span>
                </li>
              ))}
            </ul>
            <Link className="btn btn-primary" to="/events">
              {locale === "km" ? "រកមើលព្រឹត្តិការណ៍" : "Browse events"}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          <FeatureSlider photos={WHY_BOOK_PHOTOS} />
        </section>

        {/* ------------------------------------------------- three steps ---
            The wireframe's "Next Steps" row: centred heading, three numbered
            items, one CTA underneath. Numbered and joined by a rule rather
            than three bare icon boxes - the same three-in-a-row shape
            CLAUDE.md flags as a generic default, done deliberately here
            because this wireframe explicitly calls for it, and distinguished
            by treating it as a sequence (a real one - find, pay, scan) rather
            than an unordered feature grid. */}
        <section className="home-steps-section">
          <div className="home-steps-head">
            <h2>
              {locale === "km"
                ? "របៀបទិញសំបុត្រ"
                : "How buying a ticket works"}
            </h2>
          </div>
          <ol className="home-steps">
            {HOW_STEPS.map((s, i) => (
              <li key={s.icon}>
                <span className="home-step-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon name={s.icon} size={22} />
                <h3>{locale === "km" ? s.titleKm : s.titleEn}</h3>
                <p>{locale === "km" ? s.bodyKm : s.bodyEn}</p>
              </li>
            ))}
          </ol>
          <div className="home-steps-cta">
            <Link className="btn btn-primary" to="/events">
              {locale === "km" ? "រកមើលព្រឹត្តិការណ៍" : "Browse events"}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </section>

        {/* --------------------------------------------- for organizers ---
            The wireframe's "Your Name" bio card, same text-left/image-right
            order as the section above it. An outline "Learn More" rather than
            a solid button, matching the wireframe's own distinction between
            its primary CTAs and this one. */}
        <section className="home-split">
          <div className="home-split-text">
            <h2>
              {locale === "km"
                ? "រៀបចំព្រឹត្តិការណ៍នៅកម្ពុជាមែនទេ?"
                : "Running an event in Cambodia?"}
            </h2>
            <p>
              {locale === "km"
                ? "ចុះបញ្ជីកម្មវិធីរបស់អ្នក លក់កៅអីកក់ទុក ឬសំបុត្រទូទៅ ហើយពិនិត្យអ្នកចូលនៅទ្វារពីកម្មវិធីរុករកលើទូរស័ព្ទណាមួយ។ ពាក្យស្នើសុំត្រូវបានពិនិត្យមុននឹងផ្សាយ។"
                : "List your show, sell reserved seats or general admission, and check people in at the door from any phone browser. Applications are reviewed before anything goes live."}
            </p>
            <Link className="btn btn-outline" to="/become-an-organizer">
              {locale === "km" ? "ស្វែងយល់បន្ថែម" : "Learn more"}
            </Link>
          </div>
          <FeatureSlider photos={ORGANIZER_PHOTOS} />
        </section>

        {/* ------------------------------------------------------- proof ---
            The wireframe's testimonials slot: centred, plain, no card. There
            are no customer quotes to put there yet, so it holds the numbers
            the page already computes instead of an invented quote - real
            social proof rather than placeholder praise. */}
        <section className="home-proof">
          <h2>
            {locale === "km" ? "CamboBook ជាលេខ" : "CamboBook, in numbers"}
          </h2>
          <div className="home-proof-stats">
            <div>
              <b>{totalLive}</b>
              <span>{locale === "km" ? "ព្រឹត្តិការណ៍ផ្សាយ" : "live events"}</span>
            </div>
            <div>
              <b>{ticketsSold.toLocaleString()}</b>
              <span>{locale === "km" ? "សំបុត្រលក់រួច" : "tickets sold"}</span>
            </div>
            <div>
              <b>{provinces.length}</b>
              <span>
                {locale === "km" ? "ខេត្ត/ក្រុងគ្របដណ្តប់" : "provinces covered"}
              </span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ FAQ ---
            The wireframe's accordion section - image on the LEFT this time,
            text on the right, matching that one section's own reversed order
            in the source rather than repeating the split above unchanged. */}
        <section className="home-split home-split-reverse">
          <FeatureSlider photos={FAQ_PHOTOS} />
          <div className="home-split-text">
            <h2>
              {locale === "km" ? "សំណួរដែលសួរញឹកញាប់" : "Common questions"}
            </h2>
            <div className="home-faq">
              {FAQ_ITEMS.map((item) => (
                <details className="home-faq-item" key={item.qEn}>
                  <summary>
                    {locale === "km" ? item.qKm : item.qEn}
                    <Icon name="chevronDown" size={16} />
                  </summary>
                  <p>{locale === "km" ? item.aKm : item.aEn}</p>
                </details>
              ))}
            </div>
            <Link className="btn btn-primary" to="/contact">
              {locale === "km" ? "ទាក់ទងមកយើង" : "Contact us"}
            </Link>
          </div>
        </section>
      </div>

      {/* --------------------------------------------------- final band ---
          The wireframe closes on a second banner-and-card, mirroring the
          hero - the same treatment bookends the page. One button, as the
          wireframe has, pointed at the single most useful next step. */}
      <section className="home-final">
        <div className="hero-inner">
          <div className="home-final-card">
            <h2>
              {locale === "km"
                ? "ត្រៀមរួចរាល់ស្វែងរកព្រឹត្តិការណ៍បន្ទាប់របស់អ្នកហើយឬនៅ?"
                : "Ready to find your next event?"}
            </h2>
            <p>
              {locale === "km"
                ? "រុករកមើលអ្វីដែលកំពុងលក់ទូទាំងប្រទេស ហើយកក់ក្នុងប៉ុន្មានចុចប៉ុណ្ណោះ។"
                : "Browse what's on across the country and book in a few taps."}
            </p>
            <Link className="btn btn-primary" to="/events">
              {locale === "km" ? "មើលអ្វីកំពុងលក់" : "See what's on"}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
