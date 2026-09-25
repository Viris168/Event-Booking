import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useDocumentTitle } from "../lib/useDocumentTitle.js";
import { getProvinces } from "../api/provinces.js";
import { getEvents } from "../api/events.js";

/*
 * Why the copy on this page is bilingual inline rather than in lib/i18n.js.
 *
 * That dictionary is for UI chrome - labels, buttons, statuses - and it earns
 * its keep because those strings are rendered from a dozen places each. Page
 * prose is rendered from exactly one, and lifting it out would put two pages of
 * text into a file whose job is to keep the navbar consistent. Footer.jsx made
 * the same call for its strapline and the organiser columns, so this follows
 * the pattern already in the tree rather than inventing a second one.
 */

/**
 * How buying a ticket actually goes, in the order it happens.
 *
 * <p>A numbered list and not a row of icon tiles. The steps are sequential -
 * you cannot show a QR code you have not paid for - and a three-across grid of
 * boxes says the opposite: that these are three independent features. The
 * numbers are the content.
 */
const STEPS = [
  {
    en: {
      title: "Find something on",
      body: "Browse by province, date or price. Every event listed has been checked by a platform admin before it could sell a single ticket.",
    },
    km: {
      title: "ស្វែងរកព្រឹត្តិការណ៍",
      body: "រកមើលតាមខេត្ត កាលបរិច្ឆេទ ឬតម្លៃ។ រាល់ព្រឹត្តិការណ៍ក្នុងបញ្ជីត្រូវបានពិនិត្យដោយអ្នកគ្រប់គ្រងប្រព័ន្ធ មុននឹងអាចលក់សំបុត្របាន។",
    },
  },
  {
    en: {
      title: "Pick a seat, or just go",
      body: "Some venues sell a numbered seat from a map of the room. Others sell general admission to a zone. The event page tells you which, before you commit to anything.",
    },
    km: {
      title: "ជ្រើសកៅអី ឬចូលទូទៅ",
      body: "ទីកន្លែងខ្លះលក់កៅអីមានលេខតាមប្លង់បន្ទប់។ ខ្លះទៀតលក់សំបុត្រចូលទូទៅតាមតំបន់។ ទំព័រព្រឹត្តិការណ៍ប្រាប់អ្នកជាមុន។",
    },
  },
  {
    en: {
      title: "Your seat is held while you pay",
      body: "Choosing a seat takes it off the map for everyone else for a few minutes, so nobody sells it out from under you at the payment screen. If you walk away, it goes back.",
    },
    km: {
      title: "កៅអីត្រូវបានកក់ទុករង់ចាំការទូទាត់",
      body: "ពេលអ្នកជ្រើសកៅអី វាត្រូវដកចេញពីប្លង់សម្រាប់អ្នកដទៃមួយរយៈ ដូច្នេះគ្មាននរណាលក់វាមុនអ្នកទេ។ បើអ្នកចាកចេញ វាត្រឡប់មកវិញ។",
    },
  },
  {
    en: {
      title: "Pay with ABA PayWay or KHQR",
      body: "The rails people here already use. Scan with your banking app; the ticket is issued the moment the payment settles, not the next morning.",
    },
    km: {
      title: "ទូទាត់តាម ABA PayWay ឬ KHQR",
      body: "មធ្យោបាយដែលអ្នកប្រើប្រាស់ស្គាល់ស្រាប់។ ស្កេនដោយកម្មវិធីធនាគាររបស់អ្នក ហើយសំបុត្រចេញភ្លាមនៅពេលការទូទាត់ជោគជ័យ។",
    },
  },
  {
    en: {
      title: "Show the QR at the door",
      body: "Your ticket lives in your account and works offline once it has loaded. The organiser scans it on the way in, and a scanned ticket cannot be scanned twice.",
    },
    km: {
      title: "បង្ហាញ QR នៅច្រកចូល",
      body: "សំបុត្ររបស់អ្នកនៅក្នុងគណនី ហើយដំណើរការសូម្បីគ្មានអ៊ីនធឺណិត។ អ្នករៀបចំស្កេនវានៅច្រកចូល ហើយសំបុត្រមួយស្កេនបានតែម្តង។",
    },
  },
];

/**
 * The organiser's side of the same story, in the order they will live it.
 *
 * <p>Each step is a real screen: the application form, the venue editor, the
 * review queue, the sales page, the check-in scanner and the payout invoice.
 * A paragraph used to carry all six, and a sentence with six clauses in it is
 * where an organiser deciding whether to apply stops reading.
 */
const ORGANIZER_STEPS = [
  {
    en: {
      title: "Apply once",
      body: "Tell us who you are and what you put on. A platform admin reads every application before an account can sell anything.",
    },
    km: {
      title: "ដាក់ពាក្យម្តង",
      body: "ប្រាប់យើងថាអ្នកជានរណា និងរៀបចំព្រឹត្តិការណ៍អ្វី។ អ្នកគ្រប់គ្រងប្រព័ន្ធពិនិត្យរាល់ពាក្យស្នើសុំ មុននឹងគណនីអាចលក់បាន។",
    },
  },
  {
    en: {
      title: "Draw the venue, then reuse it",
      body: "Lay out numbered seats or general-admission zones one time. Every later event at that venue starts from the same map.",
    },
    km: {
      title: "គូរប្លង់ទីកន្លែង ហើយប្រើឡើងវិញ",
      body: "រៀបចំកៅអីមានលេខ ឬតំបន់ចូលទូទៅតែម្តង។ ព្រឹត្តិការណ៍ក្រោយៗនៅទីកន្លែងនោះចាប់ផ្តើមពីប្លង់ដដែល។",
    },
  },
  {
    en: {
      title: "Price it and send it for review",
      body: "Set a price per seat class or zone. The event goes on sale once an admin has approved it, and you hear back either way.",
    },
    km: {
      title: "កំណត់តម្លៃ ហើយផ្ញើឲ្យពិនិត្យ",
      body: "កំណត់តម្លៃតាមប្រភេទកៅអី ឬតំបន់។ ព្រឹត្តិការណ៍ចាប់ផ្តើមលក់ក្រោយពេលអ្នកគ្រប់គ្រងអនុម័ត ហើយអ្នកនឹងទទួលដំណឹងទោះជាលទ្ធផលយ៉ាងណាក៏ដោយ។",
    },
  },
  {
    en: {
      title: "Watch it sell",
      body: "Sales and transactions update as payments settle, and export to a spreadsheet when you need them somewhere else.",
    },
    km: {
      title: "តាមដានការលក់",
      body: "ការលក់ និងប្រតិបត្តិការធ្វើបច្ចុប្បន្នភាពនៅពេលការទូទាត់ជោគជ័យ ហើយអាចនាំចេញជាតារាងបាន។",
    },
  },
  {
    en: {
      title: "Scan people in",
      body: "The check-in scanner runs in a phone browser, so there is nothing to install. A ticket that has been scanned will not scan again.",
    },
    km: {
      title: "ស្កេនអ្នកចូលរួម",
      body: "កម្មវិធីស្កេនដំណើរការក្នុងកម្មវិធីរុករកលើទូរស័ព្ទ គ្មានអ្វីត្រូវដំឡើងទេ។ សំបុត្រដែលបានស្កេនរួច មិនអាចស្កេនម្តងទៀតបានទេ។",
    },
  },
  {
    en: {
      title: "Get paid",
      body: "Request a payout from your dashboard and receive an invoice for it, with the fee shown before you ask.",
    },
    km: {
      title: "ទទួលប្រាក់",
      body: "ស្នើសុំទទួលប្រាក់ពីផ្ទាំងគ្រប់គ្រងរបស់អ្នក ហើយទទួលវិក្កយបត្រ ដោយបង្ហាញថ្លៃសេវាមុនពេលអ្នកស្នើ។",
    },
  },
];

/**
 * One numbered sequence, drawn as a timeline.
 *
 * <p>Shared by the buyer's steps and the organiser's so the two read as the
 * same kind of thing on the page. The rail between the numerals is CSS only;
 * the <ol> is what tells a screen reader these come in order.
 */
function Timeline({ steps, km }) {
  return (
    <ol className="about-steps">
      {steps.map((step, i) => {
        const copy = km ? step.km : step.en;
        return (
          <li key={i} className="about-step">
            {/* aria-hidden: the list is already numbered for a screen
                reader by <ol>, and reading "one" twice is worse than not
                drawing it. The marker is a visual device. */}
            <span className="about-step-n" aria-hidden="true">
              {i + 1}
            </span>
            <div className="about-step-body">
              <h3>{copy.title}</h3>
              <p>{copy.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function AboutPage() {
  const { t, locale } = useLocale();
  const { isAuthenticated, isOrganizer } = useAuth();
  const km = locale === "km";

  useDocumentTitle(km ? "អំពីយើង" : "About");

  /*
   * The province count is fetched rather than written into the copy.
   *
   * V17 added every Cambodian province, and a number typed into a sentence here
   * is wrong the first time that table changes and wrong silently. Footer.jsx
   * reads the same endpoint for the same reason, and the line is simply omitted
   * until the answer arrives - a page that renders "covering  provinces" for
   * half a second is worse than one that renders the sentence a beat late.
   */
  const [provinceCount, setProvinceCount] = useState(null);
  // Same source as the homepage counter: total_elements of the public
  // catalogue. A page of one is enough, since only the count is read.
  const [liveCount, setLiveCount] = useState(null);

  useEffect(() => {
    let active = true;
    getProvinces()
      .then((res) => {
        if (active) setProvinceCount((res || []).length);
      })
      .catch(() => {});
    getEvents({ size: 1 })
      .then((page) => {
        const total = page?.total_elements ?? page?.totalElements;
        if (active && total != null) setLiveCount(total);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {/* The header band Contact shares; see .page-band. */}
      <header className="page-band">
        <div className="page-band-inner">
          <h1>{km ? "អំពី CamboBook" : "About CamboBook"}</h1>
          <p className="page-band-lead">
            {km
              ? "CamboBook គឺជាប្រព័ន្ធលក់សំបុត្រសម្រាប់ព្រឹត្តិការណ៍ផ្ទាល់នៅកម្ពុជា៖ ការប្រគំតន្ត្រី ពិធីបុណ្យ សន្និសីទ និងព្រឹត្តិការណ៍កីឡា។ អ្នករៀបចំដាក់លក់សំបុត្រនៅទីនេះ ហើយអ្នកទិញបង់ប្រាក់តាមមធ្យោបាយដែលពួកគេប្រើប្រាស់ជាប្រចាំ។"
              : "CamboBook sells tickets to live events in Cambodia: concerts, festivals, conferences and sport. Organisers list what they are putting on, people buy a seat or a spot, and everyone gets in with a QR code instead of a paper stub and a phone call."}
          </p>

          {/* Each figure renders only once it has arrived. The row as a
              whole waits for at least one, so a failed fetch leaves the band
              as a heading and a paragraph rather than an empty strip. */}
          {(liveCount != null || provinceCount != null) && (
            <dl className="page-band-stats">
              {liveCount != null && (
                <div>
                  <dt>{km ? "ព្រឹត្តិការណ៍កំពុងលក់" : "Events on sale now"}</dt>
                  <dd>{liveCount.toLocaleString()}</dd>
                </div>
              )}
              {provinceCount != null && (
                <div>
                  <dt>
                    {km
                      ? "ខេត្ត/ក្រុងដែលអាចដាក់លក់"
                      : "Provinces that can list events"}
                  </dt>
                  <dd>{provinceCount}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </header>

      <div className="container about">
        {/* ---------------------------------------------------- how it works */}
        <section className="about-row">
          <div className="about-row-head">
            <h2>{km ? "ដំណើរការយ៉ាងដូចម្តេច" : "How buying a ticket works"}</h2>
            <p>
              {km
                ? "ពីការស្វែងរក ដល់ច្រកចូល។ អ្នកមិនចាំបាច់មានកាត ឬបោះពុម្ពអ្វីទេ។"
                : "From finding an event to getting through the door. No card and no printer needed at any point."}
            </p>
            <Link className="about-row-link" to="/events">
              {km ? "មើលព្រឹត្តិការណ៍" : "Browse events"}
              <Icon name="arrowRight" size={15} />
            </Link>
          </div>
          <Timeline steps={STEPS} km={km} />
        </section>

        {/* -------------------------------------------------------- the facts */}
        {/*
          A definition list of things that are checkable, not a row of claims.
          Every value here is a fact about how the product is built - which is
          the only kind of "why us" section worth a visitor's time on a
          platform nobody has heard of yet. The province count moved up into
          the band, where it is a figure rather than a sentence.
        */}
        <section className="about-row">
          <div className="about-row-head">
            <h2>{km ? "ព័ត៌មានជាក់ស្តែង" : "The specifics"}</h2>
            <p>
              {km
                ? "អ្វីដែលអ្នកអាចពិនិត្យដោយខ្លួនឯងបាន។"
                : "The parts you can check for yourself."}
            </p>
          </div>
          <dl className="about-facts">
            <div className="about-fact">
              <dt>{km ? "ការទូទាត់" : "Payment"}</dt>
              <dd>
                <b>ABA PayWay · KHQR</b>
                <span>
                  {km
                    ? "ស្កេនដោយកម្មវិធីធនាគារណាមួយដែលគាំទ្រ KHQR។"
                    : "Scan with any banking app that supports KHQR. No card required."}
                </span>
              </dd>
            </div>
            <div className="about-fact">
              <dt>{km ? "ភាសា" : "Languages"}</dt>
              <dd>
                <b>{km ? "ខ្មែរ និងអង់គ្លេស" : "Khmer and English"}</b>
                <span>
                  {km
                    ? "ព្រឹត្តិការណ៍មានឈ្មោះទាំងពីរភាសា មិនមែនបកប្រែដោយម៉ាស៊ីនទេ។"
                    : "Events carry both names, written by the organiser rather than run through a translator."}
                </span>
              </dd>
            </div>
            <div className="about-fact">
              <dt>{km ? "មុននឹងលក់" : "Before it sells"}</dt>
              <dd>
                <b>
                  {km
                    ? "ត្រួតពិនិត្យរាល់ព្រឹត្តិការណ៍"
                    : "Every event is reviewed"}
                </b>
                <span>
                  {km
                    ? "អ្នកគ្រប់គ្រងប្រព័ន្ធពិនិត្យព្រឹត្តិការណ៍មុននឹងវាបង្ហាញជាសាធារណៈ។"
                    : "A platform admin reads each listing before the public can see it."}
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {/* ------------------------------------------------------ organisers */}
        <section className="about-row">
          <div className="about-row-head">
            <h2>{km ? "សម្រាប់អ្នករៀបចំព្រឹត្តិការណ៍" : "If you run events"}</h2>
            <p>
              {km
                ? "ពីពាក្យស្នើសុំ ដល់ការទទួលប្រាក់ ក្នុងកន្លែងតែមួយ។"
                : "From the application to the payout, in one place and in this order."}
            </p>
            <div className="about-actions">
              {/* Sent where they can actually go. An organiser already has the
                  dashboard; a signed-out visitor gets login, because the
                  application form is behind ProtectedRoute and offering it here
                  would be a link that bounces. Same `show` reasoning Footer.jsx
                  and Navbar use. */}
              {isOrganizer ? (
                <Link className="btn btn-primary" to="/organizer">
                  {t("organizerDashboard")}
                  <Icon name="arrowRight" size={16} />
                </Link>
              ) : (
                <Link
                  className="btn btn-primary"
                  to={isAuthenticated ? "/become-an-organizer" : "/login"}
                >
                  {t("becomeOrganizer")}
                  <Icon name="arrowRight" size={16} />
                </Link>
              )}
            </div>
          </div>
          <Timeline steps={ORGANIZER_STEPS} km={km} />
        </section>

        {/* --------------------------------------------------------- contact */}
        <aside className="about-contact">
          <div>
            <h2>{km ? "មានសំណួរមែនទេ?" : "Something we have not answered?"}</h2>
            <p>
              {km
                ? "សរសេរមកកាន់យើង។ អ្នកមិនចាំបាច់មានគណនីដើម្បីផ្ញើសារទេ។"
                : "Write to us. You do not need an account to send a message, which matters most when the problem is that you cannot get into yours."}
            </p>
          </div>
          <div className="about-contact-actions">
            <Link className="btn btn-outline" to="/contact#faq">
              {km ? "សំណួរញឹកញាប់" : "Common questions"}
            </Link>
            <Link className="btn btn-accent" to="/contact">
              <Icon name="mail" size={16} />
              {t("contactUs")}
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
