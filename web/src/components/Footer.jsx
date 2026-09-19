import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import KhqrWordmark from "./KhqrWordmark.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { getProvinces } from "../api/provinces.js";

/*
 * The platform's social & community channels.
 * Live Telegram bot link connects to @cambobookbot.
 */
const SOCIAL = [
  {
    name: "Telegram",
    icon: "telegram",
    url: "https://t.me/cambobookbot",
    brandColor: "#24A1DE",
  },
  {
    name: "Facebook",
    icon: "facebook",
    url: "https://facebook.com",
    brandColor: "#1877F2",
  },
  {
    name: "Instagram",
    icon: "instagram",
    url: "https://instagram.com",
    brandColor: "#E4405F",
  },
  {
    name: "TikTok",
    icon: "tiktok",
    url: "https://tiktok.com",
    brandColor: "#25F4EE",
  },
];

const isLive = (url) => url && url.startsWith("http");

export default function Footer() {
  const { t, locale } = useLocale();
  const { isAuthenticated, isOrganizer, isAdmin, user, role } = useAuth();
  const km = locale === "km";
  const [provinceCount, setProvinceCount] = useState(null);

  const isOrgUser =
    isOrganizer ||
    role === "ORGANIZER" ||
    user?.role === "ORGANIZER" ||
    Boolean(user?.organizer_profile_id);

  useEffect(() => {
    let active = true;
    getProvinces()
      .then((res) => {
        if (active) setProvinceCount((res || []).length);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* Event category shortcuts for discovery */
  const categories = [
    {
      to: "/events?q=concert",
      label: km ? "ការប្រគំតន្ត្រី" : "Concerts & Live Music",
      icon: "music",
    },
    {
      to: "/events?q=festival",
      label: km ? "មហោស្រព & ពិធីបុណ្យ" : "Festivals & Nightlife",
      icon: "festival",
    },
    {
      to: "/events?q=conference",
      label: km ? "សន្និសីទ & បច្ចេកវិទ្យា" : "Conferences & Tech",
      icon: "conference",
    },
    {
      to: "/events?q=culture",
      label: km ? "សិល្បៈ & វប្បធម៌" : "Arts & Culture",
      icon: "temple",
    },
    {
      to: "/events?q=sport",
      label: km ? "កីឡា & សុខភាព" : "Sports & Marathons",
      icon: "trending",
    },
    {
      to: "/events",
      label: km ? "ព្រឹត្តិការណ៍ទាំងអស់" : "All Upcoming Events",
      icon: "calendar",
    },
  ];

  /* Role-tailored workspace navigation */
  const workspace = isAdmin
    ? {
        label: t("admin"),
        links: [
          { to: "/admin", label: t("adminDashboard") },
          { to: "/admin/review", label: t("reviewQueue") },
          { to: "/admin/events", label: t("moderation") },
          { to: "/admin/payments", label: t("payments") },
          {
            to: "/admin/payouts",
            label: km ? "ការទូទាត់ប្រាក់" : "Payouts Management",
          },
        ],
      }
    : isOrgUser
      ? {
          label: km ? "សម្រាប់អ្នករៀបចំ" : "For Organizers",
          links: [
            { to: "/organizer", label: t("organizerDashboard") },
            { to: "/organizer/venues", label: t("venues") },
            { to: "/organizer/check-in", label: t("checkIn") },
            {
              to: "/organizer/transactions",
              label: km ? "ប្រតិបត្តិការលក់" : "Sales Transactions",
            },
            {
              to: "/organizer/payouts",
              label: km ? "ទូទាត់ចំណូល" : "Payouts & Earnings",
            },
          ],
        }
      : {
          label: km ? "សម្រាប់អ្នករៀបចំ" : "For Organizers",
          links: [
            { to: "/become-an-organizer", label: t("becomeOrganizer") },
            {
              to: "/about",
              label: km
                ? "ប្រព័ន្ធគ្រប់គ្រងកៅអី & ផែនទី"
                : "Seating & Map System",
            },
            {
              to: "/contact",
              label: km ? "ទំនាក់ទំនងសេវាកម្ម" : "Organizer Inquiries",
            },
          ],
        };

  /* General explore & help links */
  const supportLinks = [
    { to: "/", label: t("home") },
    { to: "/events", label: t("events") },
    { to: "/about", label: t("aboutUs") },
    { to: "/contact", label: t("contactUs") },
    ...(isAuthenticated
      ? [{ to: "/my-bookings", label: t("myBookings") }]
      : [{ to: "/register", label: t("register") }]),
  ];

  return (
    <footer className="footer">
      <div className="footer-inner">
        {/* ---------------------------------------------------- Main 4-Col Grid */}
        <div className="footer-grid-4">
          {/* Col 1: Brand, Reach & Contacts */}
          <div className="footer-brand-col">
            <Link to="/" className="footer-lockup" aria-label={t("brand")}>
              <img
                className="footer-mark"
                src="/logo/CB-mark.png"
                alt=""
                width="280"
                height="320"
                loading="lazy"
                aria-hidden="true"
              />
              <span className="footer-brand-text">{t("brand")}</span>
            </Link>

            <p className="footer-brand-desc">
              {km
                ? "កក់សំបុត្រព្រឹត្តិការណ៍ទូទាំងព្រះរាជាណាចក្រកម្ពុជា។ កៅអីកក់ទុក ឬចូលទូទៅ ជាមួយការទូទាត់រហ័ស KHQR និងសំបុត្រ QR នៅមាត់ទ្វារ។"
                : "The Kingdom of Cambodia's premier ticketing platform. Live seat mapping, instant KHQR checkout, and seamless QR entry."}
            </p>

            <p
              className="footer-reach"
              style={
                provinceCount == null ? { visibility: "hidden" } : undefined
              }
            >
              <Icon name="mapPin" size={14} />
              <b>{provinceCount ?? "\u00A0"}</b>
              <span>
                {km ? "ខេត្ត/ក្រុង មានព្រឹត្តិការណ៍" : "provinces covered"}
              </span>
            </p>

            {/* Direct Contact lines */}
            <div className="footer-contact-list">
              <a
                href="mailto:support@cambobook.com"
                className="footer-contact-item"
              >
                <Icon name="mail" size={14} />
                <span>support@cambobook.com</span>
              </a>
              <div className="footer-contact-item">
                <Icon name="building" size={14} />
                <span>
                  {km
                    ? "ភ្នំពេញ, ព្រះរាជាណាចក្រកម្ពុជា"
                    : "Phnom Penh, Cambodia"}
                </span>
              </div>
            </div>

            {/* Social Accounts */}
            <ul
              className="footer-social"
              aria-label={km ? "បណ្តាញសង្គម" : "Social"}
            >
              {SOCIAL.map((s) => (
                <li key={s.name}>
                  {isLive(s.url) ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={s.name}
                      title={s.name}
                      style={{ "--social-accent": s.brandColor }}
                    >
                      <Icon name={s.icon} size={17} />
                    </a>
                  ) : (
                    <span role="img" aria-label={s.name} title={s.name}>
                      <Icon name={s.icon} size={17} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2: Categories */}
          <nav className="footer-col" aria-labelledby="footer-categories">
            <h4 id="footer-categories">
              {km ? "ប្រភេទព្រឹត្តិការណ៍" : "Discover Categories"}
            </h4>
            {categories.map((c) => (
              <Link key={c.to} to={c.to} className="footer-nav-link">
                <Icon name={c.icon} size={14} />
                <span>{c.label}</span>
              </Link>
            ))}
          </nav>

          {/* Col 3: For Organizers & Workspace */}
          <nav className="footer-col" aria-labelledby="footer-workspace">
            <h4 id="footer-workspace">{workspace.label}</h4>
            {workspace.links
              .filter(
                (l) =>
                  !(isOrgUser || isAdmin) ||
                  (!l.to.includes("become-an-organizer") &&
                    l.label !== t("becomeOrganizer")),
              )
              .map((l) => (
                <Link
                  key={l.to + l.label}
                  to={l.to}
                  className="footer-nav-link"
                >
                  <span>{l.label}</span>
                </Link>
              ))}
          </nav>

          {/* Col 4: Explore & Support */}
          <div className="footer-col footer-col-support">
            <h4 id="footer-support">
              {km ? "ស្វែងរក & ជំនួយ" : "Explore & Support"}
            </h4>
            {supportLinks.map((l) => (
              <Link key={l.to} to={l.to} className="footer-nav-link">
                <span>{l.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* ---------------------------------------------------- Bottom Bar */}
        <div className="footer-bottom">
          <div className="footer-copy">
            <span>
              © {new Date().getFullYear()} {t("brand")}.{" "}
              {km ? "រក្សាសិទ្ធិគ្រប់យ៉ាង។" : "All rights reserved."}
            </span>
          </div>

          {/* Payment marks in center */}
          <div className="footer-pay-cluster">
            <span className="footer-pay" title="ABA PayWay Payment Gateway">
              {t("payway")}
            </span>

            <span className="footer-pay" title="National KHQR Payment Standard">
              <KhqrWordmark height={18} />
            </span>
          </div>

          {/* Back to top button on right */}
          <button
            type="button"
            className="footer-back-to-top"
            onClick={scrollToTop}
            title={km ? "ត្រឡប់ទៅលើ" : "Back to top"}
            aria-label={km ? "ត្រឡប់ទៅលើ" : "Back to top"}
          >
            <Icon name="arrowUp" size={13} />
            <span>{km ? "ត្រឡប់ទៅលើ" : "Back to top"}</span>
          </button>
        </div>
      </div>
    </footer>
  );
}
