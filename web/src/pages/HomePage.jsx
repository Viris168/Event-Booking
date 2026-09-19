import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EventCard from "../components/EventCard.jsx";
import Icon from "../components/Icon.jsx";
import { EventGridSkeleton } from "../components/Skeleton.jsx";
import { Empty, IconSelect, SearchInput } from "../components/ui.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useProvinces } from "../lib/useProvinces.js";
import { getEvents } from "../api/events.js";

/* Hero backdrop, served from web/public. If the file is missing the banner
   falls back to its gradient rather than breaking, so swapping the art is just
   a change to this one constant. */
const HERO_IMAGE = "/event.jpeg";

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

/**
 * A decorative panel standing in for photography that does not exist.
 *
 * The wireframe's image slots are stock illustration; CamboBook has no product
 * screenshots ready for a homepage and no stock photo budget. The nine
 * `.cover-*` gradients already do this job for an event with no uploaded art
 * (see eventArt.js), so reusing them here keeps every "photo" on the page
 * drawn from the same, already-real, already-brand system rather than
 * introducing a new decorative language for three boxes.
 */
function FeaturePanel({ icon, tone }) {
  return (
    <div className={`home-panel cover-${tone}`} aria-hidden="true">
      <Icon name={icon} size={56} strokeWidth={1.2} />
    </div>
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
      {/* ---------------------------------------------------------- hero ---
          Banner photo behind, one floating card in front - the wireframe's
          "illustrated background + centred white card" shape, kept in the
          site's own dark-jade banner rather than borrowing the mock's hills
          and clouds. The card's one CTA is the real search form: a button
          that just says "Call to Action" on a ticketing homepage is a button
          to nowhere. */}
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
        <div className="hero-inner">
          <div className="hero-card">
            <h1>
              {t("heroTitleLead")}{" "}
              <span className="hero-card-accent">{t("heroTitleAccent")}</span>
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
          <FeaturePanel icon="qr" tone="teal" />
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
          <FeaturePanel icon="building" tone="plum" />
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
          <FeaturePanel icon="info" tone="indigo" />
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
