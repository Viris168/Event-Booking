import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { PROVINCES } from "../mock/store.js";

export default function Footer() {
  const { t, locale, setLocale } = useLocale();
  const km = locale === "km";

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-grid">
          {/* ------------------------------------------------------- brand */}
          <div className="footer-brand">
            <img
              className="footer-mark"
              src="/logo/EBC-logo.svg"
              alt=""
              width="1110"
              height="504"
              loading="lazy"
              aria-hidden="true"
            />
            <div>
              <strong>{t("brand")}</strong>
              <p>
                {km
                  ? "កក់សំបុត្រព្រឹត្តិការណ៍ទូទាំងព្រះរាជាណាចក្រកម្ពុជា — កៅអីកក់ទុក ឬចូលទូទៅ ជាមួយសំបុត្រ QR។"
                  : "Ticketing for events across the Kingdom of Cambodia — reserved seats or general admission, with a QR ticket at the door."}
              </p>
              <span className="footer-reach">
                <Icon name="mapPin" size={13} />
                {PROVINCES.length} {km ? "ខេត្ត/ក្រុង" : "provinces covered"}
              </span>
            </div>
          </div>

          {/* ------------------------------------------------------ explore */}
          <nav className="footer-col" aria-label={km ? "ស្វែងរក" : "Explore"}>
            <h4>{km ? "ស្វែងរក" : "Explore"}</h4>
            <Link to="/">{t("home")}</Link>
            <Link to="/events">{t("events")}</Link>
            <Link to="/my-bookings">{t("myBookings")}</Link>
            <Link to="/register">{t("register")}</Link>
          </nav>

          {/* --------------------------------------------------- organizers */}
          <nav
            className="footer-col"
            aria-label={km ? "អ្នកចាត់ចែង" : "For organizers"}
          >
            <h4>{km ? "អ្នកចាត់ចែង" : "For organizers"}</h4>
            <Link to="/organizer">{t("organizerDashboard")}</Link>
            <Link to="/organizer/venues">{t("venues")}</Link>
            <Link to="/organizer/check-in">{t("checkIn")}</Link>
          </nav>

          {/* ----------------------------------------------------- payments */}
          <div className="footer-col">
            <h4>{km ? "ការទូទាត់" : "Payments"}</h4>
            <span className="footer-pay">
              <Icon name="bank" size={14} />
              {t("payway")}
            </span>
            <span className="footer-pay">
              <Icon name="qr" size={14} />
              ABA PAY / KHQR
            </span>
            <span className="footer-fx">
              <em>{km ? "តម្លៃទាំងអស់ជា USD" : "Every price shown in USD"}</em>
            </span>
          </div>
        </div>

        {/* -------------------------------------------------------- bottom */}
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} {t("brand")}
          </span>
          <span className="footer-note">
            <Icon name="info" size={13} />
            {km
              ? "គំរូរូបរាង — ទិន្នន័យសាកល្បង គ្មានការហៅ API"
              : "UI prototype — mock data only, no API calls are made"}
          </span>
          <span className="footer-lang" role="group" aria-label="Language">
            <button
              type="button"
              aria-pressed={locale === "en"}
              onClick={() => setLocale("en")}
            >
              English
            </button>
            <button
              type="button"
              className="km"
              aria-pressed={locale === "km"}
              onClick={() => setLocale("km")}
            >
              ភាសាខ្មែរ
            </button>
          </span>
        </div>
      </div>
    </footer>
  );
}
