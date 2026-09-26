import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon.jsx";
import Flag from "./Flag.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { Alert, Field } from "./ui.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  changePassword,
  linkGoogle,
  setPassword,
  setPhone,
  unlinkGoogle,
  updateProfile,
} from "../api/auth.js";
import { toLocalPhone } from "../lib/format.js";
import { telegramUrl } from "../lib/contactLinks.js";
import GoogleSignInButton from "./GoogleSignInButton.jsx";
import TelegramConnectCard from "./TelegramConnectCard.jsx";
import { getTelegramStatus } from "../api/organizerTelegram.js";

/** Must match the .is-closing animation in ACCT_CSS below. */
const CLOSE_MS = 180;

/*
 * Your own account, as a panel over whatever you were doing.
 *
 * Not a page. Editing your display name is a thirty-second errand, and sending
 * someone to a full screen for it throws away the context they were in - the
 * event they were reading, the queue they were working - and makes them
 * navigate back to it afterwards. A panel returns them to exactly where they
 * stood, because they never left.
 *
 * Same reasoning as ConfirmDialog, and the same machinery: portalled to body so
 * no ancestor's overflow or stacking context can clip it, Escape and backdrop
 * both close, and the page behind is locked from scrolling while it is open.
 * Focus moves in on open and returns to the chip that opened it on close, which
 * ConfirmDialog does not do and should.
 */

export default function AccountPanel({ open, onClose }) {
  const { t, locale } = useLocale();
  const km = locale === "km";
  const toast = useToast();
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  /* Which screen the panel is showing. The forms were all stacked on one
     scroll before; as a menu they are two taps from anywhere and the panel
     opens on something readable rather than on three sets of inputs. */
  const [view, setView] = useState("menu");
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const closeRef = useRef(null);
  const openerRef = useRef(null);

  /*
   * Exit animation needs the panel to outlive `open`, so closing is its own
   * state: the class changes, the CSS runs, and a timer unmounts. Going
   * straight from open to gone reads as the panel vanishing rather than
   * sliding away, which is the sort of thing that feels broken without anyone
   * being able to say why.
   *
   * A timer rather than onAnimationEnd. That event is the obvious choice and it
   * does not survive contact with this component: the panel is portalled out of
   * the React root, an animation that is interrupted or never starts fires
   * nothing at all, and prefers-reduced-motion shortens it to a hair. Any one
   * of those leaves the panel wedged half-closed with no way back. The timer
   * fires whatever the CSS does.
   */
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  const beginClose = useCallback(() => {
    if (timerRef.current) return; // already on the way out
    setClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setClosing(false);
      onClose();
      // Restore focus after the panel is gone, or the browser moves it back to
      // an element that is about to be unmounted.
      const opener = openerRef.current;
      if (opener && document.contains(opener)) opener.focus();
    }, CLOSE_MS);
  }, [onClose]);

  // A panel unmounted mid-close (a route change, a sign-out) must not leave a
  // timer to fire onClose against a component that is gone.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return undefined;
    // Remember who opened us so focus can go back there. Without this, closing
    // dumps focus on <body> and a keyboard user restarts from the top of the page.
    openerRef.current = document.activeElement;
    setClosing(false);
    setView("menu");
    setConfirmSignOut(false);

    const onKey = (e) => {
      if (e.key === "Escape") beginClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, beginClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`acct-overlay${closing ? " is-closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) beginClose();
      }}
    >
      <aside
        className={`acct-panel${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={km ? "គណនីរបស់ខ្ញុំ" : "My account"}
      >
        <style>{ACCT_CSS}</style>

        <header className="acct-head">
          {/* One slot on each side keeps the title optically centred whether or
              not a back button is present. */}
          <div className="acct-head-slot">
            {view !== "menu" && (
              <button
                type="button"
                className="acct-close"
                onClick={() => setView("menu")}
                aria-label={km ? "ត្រឡប់ក្រោយ" : "Back"}
              >
                <Icon name="arrowLeft" size={18} />
              </button>
            )}
          </div>

          <h1>{titleFor(view, km)}</h1>

          <div className="acct-head-slot acct-head-slot-end">
            <button
              ref={closeRef}
              type="button"
              className="acct-close"
              onClick={beginClose}
              aria-label={km ? "បិទ" : "Close"}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </header>

        <div className="acct-body">
          {!user ? (
            <p className="muted small">{km ? "កំពុងផ្ទុក…" : "Loading…"}</p>
          ) : view === "menu" ? (
            <AccountMenu
              user={user}
              km={km}
              t={t}
              onGo={setView}
              onLeave={(path) => {
                onClose();
                navigate(path);
              }}
            />
          ) : view === "details" ? (
            /*
             * Keyed on the SAVED values, so the form remounts - and its
             * useState initialisers re-run - whenever the server record
             * actually changes. That is the same job an effect full of
             * setState would do, without the cascading render.
             */
            <DetailsForm
              key={`${user.display_name}|${user.email}|${user.telegram_username}`}
              user={user}
              km={km}
              t={t}
              toast={toast}
              refreshUser={refreshUser}
              onSaved={() => setView("menu")}
              onCancel={() => setView("menu")}
            />
          ) : view === "telegram" ? (
            <TelegramConnectCard inAccount />
          ) : view === "signin" ? (
            <GoogleLinkCard
              km={km}
              user={user}
              toast={toast}
              refreshUser={refreshUser}
            />
          ) : /*
           * A Google account has no password_hash, so changePassword
           * refuses it outright. Showing the form anyway means asking for a
           * current password that never existed and answering "that is not
           * your current password" - confusing, and untrue. Offer to create
           * one instead: it is the only second way into the account, and
           * there is no password reset here to fall back on.
           */
          user.has_password ? (
            <PasswordForm
              km={km}
              toast={toast}
              onCancel={() => setView("menu")}
            />
          ) : (
            <SetPasswordForm
              km={km}
              user={user}
              toast={toast}
              refreshUser={refreshUser}
              onCancel={() => setView("menu")}
            />
          )}
        </div>

        {view === "menu" && user && (
          <footer className="acct-foot">
            {/* The way out, down where the thumb already is. The close button
                sits in the top corner, which on a tall phone is the one place
                a one-handed reader cannot reach. Same action as it - on the
                menu there is nowhere further back to go than the page. */}
            <button
              type="button"
              className="acct-btn acct-btn-back"
              onClick={beginClose}
            >
              <Icon name="arrowLeft" size={15} />
              {km ? "ត្រឡប់ក្រោយ" : "Back"}
            </button>
            <button
              type="button"
              className="acct-btn acct-btn-signout"
              onClick={() => setConfirmSignOut(true)}
            >
              <Icon name="logout" size={15} />
              {km ? "ចេញពីគណនី" : "Sign out"}
            </button>
          </footer>
        )}
      </aside>

      <ConfirmDialog
        open={confirmSignOut}
        title={km ? "ចេញពីគណនី?" : "Sign out?"}
        confirmLabel={km ? "ចេញពីគណនី" : "Sign out"}
        cancelLabel={km ? "បោះបង់" : "Cancel"}
        tone="danger"
        onClose={() => setConfirmSignOut(false)}
        onConfirm={() => {
          // Close first: signing out unmounts the chip this panel would
          // otherwise try to hand focus back to, and re-renders the shell
          // underneath. No exit animation on a session change.
          setConfirmSignOut(false);
          onClose();
          logout();
          navigate("/");
        }}
      >
        {km
          ? "អ្នកនឹងត្រូវចូលប្រើម្តងទៀតនៅលើឧបករណ៍នេះ។"
          : "You'll need to sign in again on this device."}
      </ConfirmDialog>
    </div>,
    document.body,
  );
}

const TITLES = {
  menu: (km) => (km ? "គណនីរបស់ខ្ញុំ" : "My account"),
  details: (km) => (km ? "ព័ត៌មានរបស់អ្នក" : "Your details"),
  password: (km) => (km ? "ពាក្យសម្ងាត់" : "Password"),
  signin: (km) => (km ? "ការចូលដោយ Google" : "Google sign-in"),
  telegram: (km) => (km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"),
};

/*
 * Every view must have a title, and a missing one used to take the whole panel
 * down: TITLES[view](km) on an unknown view is "undefined is not a function",
 * thrown during render, which React answers by unmounting the tree - a blank
 * page rather than a missing heading. Falling back keeps a typo or a new view
 * added in a hurry to a cosmetic problem.
 */
const titleFor = (view, km) => (TITLES[view] ?? TITLES.menu)(km);

/**
 * One row of the settings list. Static rows show a value instead of a chevron.
 *
 * <p>The icon is drawn bare, not in a tinted square. A settings list is read
 * down the titles; six coloured chips down the left edge compete with them for
 * first attention and turn a list of five plain choices into something that
 * looks like five different kinds of thing. Bare marks at one weight and one
 * colour stay what they are - a hint at what the row is about - and let the
 * row's own hover state be the only thing that changes when you point at it.
 */
function Row({ icon, title, sub, value, onClick }) {
  const body = (
    <>
      <Icon name={icon} size={18} className="acct-row-icon" />
      <span className="acct-row-text">
        <span className="acct-row-title">{title}</span>
        {sub && <span className="acct-row-sub">{sub}</span>}
      </span>
      {value ? (
        <span className="acct-row-value">{value}</span>
      ) : onClick ? (
        <Icon name="chevronRight" size={16} className="acct-row-chev" />
      ) : null}
    </>
  );
  if (!onClick) return <div className="acct-row is-static">{body}</div>;
  return (
    <button type="button" className="acct-row" onClick={onClick}>
      {body}
    </button>
  );
}

/**
 * A two-way choice, shown as the row's value.
 *
 * <p>Both options stay on screen rather than a switch that flips between them.
 * A toggle labelled "Dark" leaves you working out whether that is the state you
 * are in or the one you would get by pressing it; two buttons with one pressed
 * have no such ambiguity, and the same control then handles language, where
 * there is no on and off to lean on at all.
 */
function SegToggle({ options, value, onChange, ariaLabel }) {
  return (
    <span className="acct-seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.className}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </span>
  );
}

/**
 * The panel's home screen: who you are, then what you can change.
 *
 * <p>Phone and role are shown but not editable. The phone number is the login
 * identity and the token's subject - rendering it in a text input beside three
 * fields that do save is a promise the API does not keep.
 */
function AccountMenu({ user, km, t, onGo, onLeave }) {
  const roleLabel = t(user.role) !== user.role ? t(user.role) : user.role;

  const { locale, setLocale } = useLocale();
  const { theme, setTheme } = useTheme();

  // Only a plain customer can apply. An organiser already has the area, and an
  // admin applying would overwrite their own role - OrganizerService refuses it
  // outright, so offering the row here would be an invitation to a 403.
  const canApply = user.role === "CUSTOMER";

  // Stored bare, shown with the @ that people read a handle by.
  const handle = user.telegram_username;
  const handleUrl = telegramUrl(handle);

  const isOrganizerUser = Boolean(
    user?.organizer_profile_id || user?.role === "ORGANIZER",
  );
  const [telegramConnected, setTelegramConnected] = useState(null);

  useEffect(() => {
    if (isOrganizerUser) {
      getTelegramStatus()
        .then((s) => setTelegramConnected(Boolean(s?.connected)))
        .catch(() => setTelegramConnected(false));
    }
  }, [isOrganizerUser]);

  return (
    <>
      <div className="acct-hero">
        <div className="acct-avatar" aria-hidden="true">
          {initials(user.display_name)}
        </div>
        <div className="acct-hero-text">
          <div className="acct-hero-name">{user.display_name}</div>

          {/*
           * Email and Telegram on one line, each behind its own mark. They
           * answer the same question - how this person is reached - and a mark
           * apiece is what lets them share a line without being read as one
           * long string. Either may be absent, and the row simply holds
           * whichever exists; it wraps on a narrow panel rather than pushing
           * the avatar out of shape.
           *
           * The handle links: tapping it opens the account Telegram actually
           * resolves, which is the one thing a handle typed from memory cannot
           * confirm on its own. telegramUrl returns null for anything it
           * cannot build a link from, and a row that predates AuthService's
           * stripping - or was edited straight in psql - is still worth
           * showing, so that case falls back to plain text.
           */}
          {(user.email || handle) && (
            <div className="acct-hero-contact">
              {user.email && (
                <span className="acct-hero-sub">
                  <Icon name="mail" size={13} />
                  {user.email}
                </span>
              )}
              {handle &&
                (handleUrl ? (
                  <a
                    className="acct-hero-sub acct-hero-tg"
                    href={handleUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <Icon name="telegram" size={13} />@{handle}
                  </a>
                ) : (
                  <span className="acct-hero-sub">
                    <Icon name="telegram" size={13} />@{handle}
                  </span>
                ))}
            </div>
          )}

          <span className="acct-role">
            <Icon name="shield" size={12} />
            {roleLabel}
          </span>
        </div>
      </div>

      {/* Only when there is one. An empty "Organisation - none" row on every
          customer's account is noise about something they have not done. */}
      {user.organizer_profile_id && (
        <div className="acct-org">
          <span className="acct-org-mark" aria-hidden="true">
            <Icon name="building" size={18} />
          </span>
          <span className="acct-org-text">
            <span className="acct-org-name">{user.org_name_en}</span>
            {user.org_name_km && (
              <span className="acct-org-alt km">{user.org_name_km}</span>
            )}
          </span>
        </div>
      )}

      <section className="acct-section">
        <h2>{km ? "គណនី" : "Account"}</h2>
        <div className="acct-rows">
          <Row
            icon="user"
            title={km ? "ព័ត៌មានផ្ទាល់ខ្លួន" : "Personal details"}
            sub={km ? "ឈ្មោះ អ៊ីមែល និង Telegram" : "Name, email and Telegram"}
            onClick={() => onGo("details")}
          />
          <Row
            icon="lock"
            title={
              user.has_password
                ? km
                  ? "ពាក្យសម្ងាត់"
                  : "Password"
                : km
                  ? "របៀបដែលអ្នកចូលប្រើ"
                  : "How you sign in"
            }
            sub={
              user.has_password
                ? km
                  ? "ប្តូរពាក្យសម្ងាត់របស់អ្នក"
                  : "Change your password"
                : km
                  ? "ចូលដោយ Google"
                  : "Google"
            }
            onClick={() => onGo("password")}
          />
        </div>
      </section>

      {isOrganizerUser && (
        <section className="acct-section">
          <h2>{km ? "ការជូនដំណឹង" : "Notifications"}</h2>
          <div className="acct-rows">
            <Row
              icon="bell"
              title={km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"}
              sub={
                telegramConnected === true
                  ? km
                    ? "បានភ្ជាប់ · ទទួលសារពេលមានការទិញសំបុត្រ ឬអនុម័ត"
                    : "Connected · Instant alerts on sales & approvals"
                  : telegramConnected === false
                    ? km
                      ? "មិនទាន់ភ្ជាប់ · ភ្ជាប់ដើម្បីទទួលដំណឹងភ្លាមៗ"
                      : "Not connected · Connect for instant alerts"
                    : km
                      ? "ទទួលសារភ្លាមៗពេលមានការទិញសំបុត្រ ឬអនុម័ត"
                      : "Instant alerts when tickets sell or events are approved"
              }
              onClick={() => onGo("telegram")}
            />
          </div>
        </section>
      )}

      {/* Language and appearance used to sit in the navbar. They are settings
          you change once and then never look at again, and two permanent
          controls in the top bar for that is what made it feel crowded. They
          stay in the bar for signed-out visitors, who have no panel to keep
          them in, and in the mobile drawer. */}
      <section className="acct-section">
        <h2>{km ? "ការបង្ហាញ" : "Display"}</h2>
        <div className="acct-rows">
          {/* The flags live in the toggle, where they label the choice you are
              about to make. The row's own mark stays a plain globe, in the same
              stroke and colour as every other mark down the column - a second
              flag here would be the loudest thing on the screen and would only
              repeat what the pressed side of the toggle already says. */}
          <Row
            icon="globe"
            title={km ? "ភាសា" : "Language"}
            value={
              <SegToggle
                ariaLabel={km ? "ភាសា" : "Language"}
                options={[
                  {
                    value: "en",
                    label: (
                      <>
                        <Flag code="en" size={16} />
                        EN
                      </>
                    ),
                  },
                  {
                    value: "km",
                    className: "km",
                    label: (
                      <>
                        <Flag code="km" size={16} />
                        ខ្មែរ
                      </>
                    ),
                  },
                ]}
                value={locale}
                onChange={setLocale}
              />
            }
          />
          {/* Sun or moon, following the theme in force - the same reason the
              language row carries the script you are reading. */}
          <Row
            icon={theme === "dark" ? "moon" : "sun"}
            title={km ? "រូបរាង" : "Appearance"}
            value={
              <SegToggle
                ariaLabel={km ? "រូបរាង" : "Appearance"}
                options={[
                  {
                    value: "light",
                    label: (
                      <>
                        <Icon name="sun" size={13} />
                        {km ? "ភ្លឺ" : "Light"}
                      </>
                    ),
                  },
                  {
                    value: "dark",
                    label: (
                      <>
                        <Icon name="moon" size={13} />
                        {km ? "ងងឹត" : "Dark"}
                      </>
                    ),
                  },
                ]}
                value={theme}
                onChange={setTheme}
              />
            }
          />
        </div>
      </section>

      {canApply && (
        <section className="acct-section">
          <h2>{km ? "អ្នករៀបចំកម្មវិធី" : "Organizing"}</h2>
          <div className="acct-rows">
            <Row
              icon="building"
              title={t("becomeOrganizer")}
              sub={
                km
                  ? "រៀបចំ និងលក់សំបុត្រព្រឹត្តិការណ៍ផ្ទាល់ខ្លួន"
                  : "Run your own events and sell tickets"
              }
              onClick={() => onLeave("/become-an-organizer")}
            />
          </div>
        </section>
      )}

      <section className="acct-section">
        <h2>{km ? "ការចូលប្រើប្រាស់" : "Sign-in"}</h2>
        <div className="acct-rows">
          <Row
            icon="phone"
            title={km ? "លេខទូរស័ព្ទ" : "Phone number"}
            sub={
              km
                ? "លេខសម្រាប់ចូលប្រើ។ ទាក់ទងមកយើង ដើម្បីប្តូរលេខ។"
                : "How you sign in. Contact us to change it."
            }
            value={<span className="mono">{user.phone_e164}</span>}
          />
          {/* Under Sign-in, not buried in the password screen - linking Google
              is a way IN to the account, and this is where someone looks for
              the ways in. */}
          <Row
            icon="login"
            title="Google"
            sub={
              user.google_linked
                ? km
                  ? "ភ្ជាប់រួចហើយ"
                  : "Connected"
                : km
                  ? "ភ្ជាប់ដើម្បីចូលដោយ Google"
                  : "Connect to sign in with Google"
            }
            onClick={() => onGo("signin")}
          />
        </div>
      </section>
    </>
  );
}

/**
 * Display name, email and Telegram - the fields a user owns.
 *
 * <p>A successful save returns to the menu. Staying put leaves someone looking
 * at the same three inputs they just submitted, with a toast as the only sign
 * anything happened and a Save button that has gone quiet again - which reads
 * as "nothing was saved" rather than as "nothing is left to save". The menu
 * shows what was written: the name in the heading, the email under it, the
 * handle beside them. That is the confirmation.
 */
function DetailsForm({ user, km, t, toast, refreshUser, onSaved, onCancel }) {
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [telegram, setTelegram] = useState(user.telegram_username ?? "");
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [telegramError, setTelegramError] = useState("");

  const dirty =
    displayName !== (user.display_name ?? "") ||
    email !== (user.email ?? "") ||
    telegram !== (user.telegram_username ?? "");

  async function save(e) {
    e.preventDefault();
    if (!displayName.trim()) return;
    setBusy(true);
    setEmailError("");
    setTelegramError("");
    try {
      await updateProfile({
        display_name: displayName.trim(),
        email: email.trim(),
        telegram_username: telegram.trim(),
      });
      // The navbar renders the display name, so the context has to re-read or
      // the change is invisible until the next reload.
      await refreshUser();
      toast(km ? "បានរក្សាទុក" : "Saved", "success");
      // After the refresh, so the menu this returns to is already showing the
      // saved record rather than the one from before the submit.
      onSaved();
    } catch (err) {
      const code = err?.response?.data?.errorCode;
      if (code === "EMAIL_ALREADY_REGISTERED") {
        setEmailError(
          km ? "អ៊ីមែលនេះមានគណនីរួចហើយ។" : "That email already has an account.",
        );
      } else if (code === "INVALID_TELEGRAM_USERNAME") {
        setTelegramError(
          km
            ? "ឈ្មោះអ្នកប្រើ Telegram មាន ៥ ដល់ ៣២ តួ៖ អក្សរ លេខ ឬ _ ។"
            : "A Telegram username is 5 to 32 letters, numbers or underscores.",
        );
      } else {
        toast(km ? "រក្សាទុកមិនបានសម្រេច" : "Could not save", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="acct-card" onSubmit={save}>
      <h2>{km ? "ព័ត៌មានរបស់អ្នក" : "Your details"}</h2>

      <Field label={t("displayName")}>
        <input
          className="input"
          value={displayName}
          maxLength={120}
          onChange={(e) => setDisplayName(e.target.value)}
          required
        />
      </Field>

      <Field
        label="Email"
        optional
        error={emailError}
        hint={
          emailError
            ? undefined
            : km
              ? "ប្រើសម្រាប់បង្កាន់ដៃ។ អ្នកក៏អាចប្រើវាជំនួសលេខទូរស័ព្ទ ដើម្បីចូលគណនីបានដែរ។"
              : "Used for receipts. You can also sign in with it instead of your phone number."
        }
      >
        <input
          className="input"
          type="email"
          value={email}
          maxLength={255}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError("");
          }}
        />
      </Field>

      {/*
       * Telegram, because a phone number in Cambodia is a Telegram account
       * more dependably than it is a line anyone picks up. This is how support
       * reaches someone about a payment that stalled or a refund that needs a
       * word - it is contact information, not another way to sign in, and the
       * hint says so before anyone wonders.
       *
       * The "@" sits inside the field rather than in the placeholder, the same
       * arrangement the organiser application form uses: a placeholder vanishes
       * at the first keystroke, taking with it the only cue that the bare
       * handle is what is wanted. Typing it anyway is fine - so is pasting the
       * whole t.me link, which is what the share sheet gives you - because the
       * server strips both before storing.
       */}
      <Field
        label="Telegram"
        optional
        error={telegramError}
        hint={
          telegramError
            ? undefined
            : km
              ? "ដើម្បីឱ្យក្រុមការងារទាក់ទងអ្នកបាន។ មិនមែនជាវិធីចូលប្រើទេ។"
              : "So we can reach you about a booking. Not a way to sign in."
        }
      >
        <span className="acct-prefixed">
          <span className="acct-prefix" aria-hidden="true">
            @
          </span>
          <input
            className="input"
            value={telegram}
            maxLength={64}
            autoComplete="off"
            spellCheck={false}
            placeholder="yourhandle"
            onChange={(e) => {
              setTelegram(e.target.value);
              setTelegramError("");
            }}
          />
        </span>
      </Field>

      <div className="acct-actions">
        {(onCancel || onSaved) && (
          <button
            type="button"
            className="acct-btn acct-btn-quiet"
            disabled={busy}
            onClick={onCancel ?? onSaved}
          >
            {km ? "បោះបង់" : "Cancel"}
          </button>
        )}
        <button
          type="submit"
          className="acct-btn acct-btn-primary"
          disabled={busy || !dirty}
        >
          {busy
            ? km
              ? "កំពុងរក្សាទុក…"
              : "Saving…"
            : km
              ? "រក្សាទុក"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}

/**
 * Changing the password, which is also a session change.
 *
 * <p>The API revokes every refresh token and returns a fresh pair, which
 * api/auth.js stores. So this browser stays signed in and every other device
 * drops out within the access token's 15 minutes - that is the point of the
 * feature, and the form says so before it is submitted rather than after.
 */
function PasswordForm({ km, toast, onCancel }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Checked here as well as on the server: the confirmation field never
  // crosses the wire, so a mismatch is only ever a client-side question.
  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const ready = current && next.length >= 8 && next === confirm;

  async function submit(e) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError("");
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast(
        km
          ? "បានប្តូរពាក្យសម្ងាត់។ ឧបករណ៍ផ្សេងត្រូវបានចេញ។"
          : "Password changed. Other devices signed out.",
        "success",
      );
      if (onCancel) onCancel();
    } catch (err) {
      const code = err?.response?.data?.errorCode;
      setError(
        code === "INVALID_CREDENTIALS"
          ? km
            ? "ពាក្យសម្ងាត់បច្ចុប្បន្នមិនត្រឹមត្រូវទេ។"
            : "That is not your current password."
          : km
            ? "ប្តូរមិនបានសម្រេច។"
            : "Could not change your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="acct-card" onSubmit={submit}>
      <h2>{km ? "ពាក្យសម្ងាត់" : "Password"}</h2>
      <p className="muted small acct-lede">
        {km
          ? "ការប្តូរពាក្យសម្ងាត់នឹងធ្វើឱ្យឧបករណ៍ផ្សេងទៀតទាំងអស់ចេញពីគណនី។ កម្មវិធីរុករកនេះនៅតែចូលដដែល។"
          : "Changing it signs out every other device. This browser stays signed in."}
      </p>

      {error && (
        <Alert tone="danger" title={km ? "មិនបានសម្រេច" : "That didn't work"}>
          <span className="small">{error}</span>
        </Alert>
      )}

      <Field label={km ? "ពាក្យសម្ងាត់បច្ចុប្បន្ន" : "Current password"}>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setError("");
          }}
        />
      </Field>

      <Field
        label={km ? "ពាក្យសម្ងាត់ថ្មី" : "New password"}
        error={
          tooShort ? (km ? "យ៉ាងតិច ៨ តួអក្សរ។" : "At least 8 characters.") : ""
        }
        hint={
          tooShort
            ? undefined
            : km
              ? "យ៉ាងតិច ៨ តួអក្សរ។"
              : "At least 8 characters."
        }
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <Field
        label={km ? "បញ្ជាក់ពាក្យសម្ងាត់ថ្មី" : "Confirm new password"}
        error={mismatch ? (km ? "មិនដូចគ្នាទេ។" : "These do not match.") : ""}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <div className="acct-actions">
        {onCancel && (
          <button
            type="button"
            className="acct-btn acct-btn-quiet"
            disabled={busy}
            onClick={onCancel}
          >
            {km ? "បោះបង់" : "Cancel"}
          </button>
        )}
        <button
          type="submit"
          className="acct-btn acct-btn-primary"
          disabled={busy || !ready}
        >
          <Icon name="lock" size={14} />
          {busy
            ? km
              ? "កំពុងប្តូរ…"
              : "Changing…"
            : km
              ? "ប្តូរពាក្យសម្ងាត់"
              : "Change password"}
        </button>
      </div>
    </form>
  );
}

/**
 * What stands in for the password form on an account that has no password.
 *
 * <p>Saying "you sign in with Google" is not decoration - it answers the
 * question the missing form would otherwise raise, and it tells someone who
 * cannot get in where to go. Their password is Google's problem, changed at
 * Google, and nothing here can help with it.
 */
function NoPasswordCard({ km, user }) {
  return (
    <section className="acct-card">
      <h2>{km ? "របៀបដែលអ្នកចូលប្រើ" : "How you sign in"}</h2>

      <div className="acct-signin">
        <span className="acct-signin-icon" aria-hidden="true">
          <Icon name="lock" size={18} />
        </span>
        <div>
          <div className="acct-signin-name">
            {km ? "ចូលដោយ Google" : "Google"}
          </div>
          {user.email && <div className="small muted">{user.email}</div>}
        </div>
      </div>

      <p className="muted small acct-note">
        {km
          ? "គណនីនេះគ្មានពាក្យសម្ងាត់នៅលើ CamboBook ទេ ដូច្នេះគ្មានអ្វីត្រូវប្តូរនៅទីនេះឡើយ។ ដើម្បីប្តូរពាក្យសម្ងាត់ ឬពិនិត្យសុវត្ថិភាព សូមធ្វើនៅក្នុងគណនី Google របស់អ្នក។"
          : "This account has no CamboBook password, so there is nothing to change here. Your password lives with Google — change it, or review which apps you have connected, in your Google account."}
      </p>
    </section>
  );
}

/**
 * Google as a second way in, for an account that registered with a password.
 *
 * <p>Linking is deliberately an action taken from inside a signed-in session
 * rather than something that happens on its own when a Google sign-in presents
 * a familiar email address. That would be the pre-hijack: anyone able to obtain
 * a token for an address could claim the password account holding it. Here the
 * bearer token proves one half and the ID token proves the other.
 *
 * <p>Unlinking is offered only when something else can sign this person in. The
 * server refuses it otherwise, and the button is hidden rather than left to be
 * clicked and rejected - a control that never works is worse than no control.
 */
function GoogleLinkCard({ km, user, toast, refreshUser }) {
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Google is the only door when there is no password behind it.
  const canUnlink = user.has_password;

  async function onToken(idToken) {
    if (busy) return;
    setBusy(true);
    try {
      await linkGoogle(idToken);
      await refreshUser();
      toast(km ? "បានភ្ជាប់ Google" : "Google connected", "success");
    } catch (e) {
      const code = e?.response?.data?.errorCode;
      toast(
        code === "GOOGLE_ALREADY_LINKED"
          ? km
            ? "គណនី Google នេះត្រូវបានភ្ជាប់រួចហើយ។"
            : "That Google account is already connected to an account here."
          : km
            ? "ភ្ជាប់មិនបានសម្រេច"
            : "Could not connect Google",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function doUnlink() {
    setBusy(true);
    try {
      await unlinkGoogle();
      await refreshUser();
      setConfirmUnlink(false);
      toast(km ? "បានផ្តាច់ Google" : "Google disconnected", "success");
    } catch {
      toast(km ? "ផ្តាច់មិនបានសម្រេច" : "Could not disconnect Google", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="acct-card">
      <h2>{km ? "ការចូលដោយ Google" : "Google sign-in"}</h2>

      {user.google_linked ? (
        <>
          <div className="acct-signin">
            <span className="acct-signin-icon" aria-hidden="true">
              <Icon name="checkCircle" size={18} />
            </span>
            <div>
              <div className="acct-signin-name">
                {km ? "បានភ្ជាប់" : "Connected"}
              </div>
              <div className="small muted">
                {km
                  ? "អ្នកអាចចូលដោយប្រើ Google បាន។"
                  : "You can sign in with Google."}
              </div>
            </div>
          </div>

          {canUnlink ? (
            <div className="acct-actions">
              <button
                type="button"
                className="acct-btn acct-btn-quiet"
                disabled={busy}
                onClick={() => setConfirmUnlink(true)}
              >
                {km ? "ផ្តាច់" : "Disconnect"}
              </button>
            </div>
          ) : (
            <p className="muted small acct-note">
              {km
                ? "នេះជាមធ្យោបាយតែមួយគត់ដើម្បីចូលគណនីនេះ ដូច្នេះមិនអាចផ្តាច់បានទេ។"
                : "This is the only way into this account, so it cannot be disconnected."}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="muted small acct-note">
            {km
              ? "ភ្ជាប់គណនី Google របស់អ្នក ដើម្បីអាចចូលដោយវិធីណាមួយក៏បាន។ លេខទូរស័ព្ទ និងពាក្យសម្ងាត់របស់អ្នកនៅតែដំណើរការដដែល។"
              : "Connect your Google account to sign in either way. Your phone number and password keep working exactly as they do now."}
          </p>
          <GoogleSignInButton disabled={busy} onToken={onToken} />
        </>
      )}

      <ConfirmDialog
        open={confirmUnlink}
        tone="warn"
        busy={busy}
        title={km ? "ផ្តាច់ Google?" : "Disconnect Google?"}
        confirmLabel={km ? "ផ្តាច់" : "Disconnect"}
        onConfirm={doUnlink}
        onClose={() => setConfirmUnlink(false)}
      >
        <p className="small muted">
          {km
            ? "អ្នកនឹងនៅតែចូលបានដោយប្រើលេខទូរស័ព្ទ ឬអ៊ីមែល និងពាក្យសម្ងាត់របស់អ្នក។"
            : "You will still be able to sign in with your phone number or email and password."}
        </p>
      </ConfirmDialog>
    </section>
  );
}

/**
 * The first password on an account that has never had one.
 *
 * <p>Replaces the card that used to just explain the absence. Explaining is
 * accurate but leaves someone signed in through Google with exactly one way
 * into their account - lose it and the bookings are unreachable, and there is
 * no password reset in this product to fall back on.
 *
 * <p>The phone field appears when the account has none, because the API refuses
 * a password without one and the number is what a person signs in with.
 * Collecting it here rather than sending them elsewhere is the difference
 * between a form and a dead end: PhoneGate only fires at checkout, so an
 * account that has never bought a ticket has no other way to add one.
 */
function SetPasswordForm({ km, user, toast, refreshUser, onCancel }) {
  const needsPhone = !user.phone_e164;
  const [phone, setPhoneValue] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mismatch = confirm.length > 0 && next !== confirm;
  const tooShort = next.length > 0 && next.length < 8;
  const ready =
    next.length >= 8 &&
    next === confirm &&
    (!needsPhone || Boolean(toLocalPhone(phone)));

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      /*
       * The phone goes first because the password endpoint refuses without
       * one. Two calls rather than one combined endpoint: setting a phone is
       * its own operation with its own rules - set once, never replaced - and
       * folding it into this form would duplicate them.
       */
      if (needsPhone) await setPhone(toLocalPhone(phone));
      await setPassword(next);
      await refreshUser();
      toast(km ? "បានកំណត់ពាក្យសម្ងាត់" : "Password set", "success");
      if (onCancel) onCancel();
    } catch (err) {
      const code = err?.response?.data?.errorCode;
      setError(
        code === "PHONE_ALREADY_REGISTERED"
          ? km
            ? "លេខនេះមានគណនីរួចហើយ។"
            : "That number already has an account."
          : code === "PASSWORD_ALREADY_SET"
            ? km
              ? "គណនីនេះមានពាក្យសម្ងាត់រួចហើយ។"
              : "This account already has a password."
            : km
              ? "មិនអាចកំណត់ពាក្យសម្ងាត់បានទេ។"
              : "Could not set your password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="acct-card" onSubmit={submit}>
      <h2>{km ? "កំណត់ពាក្យសម្ងាត់" : "Set a password"}</h2>
      <p className="muted small acct-lede">
        {km
          ? "បច្ចុប្បន្នអ្នកចូលដោយ Google តែមួយគត់។ ការកំណត់ពាក្យសម្ងាត់អនុញ្ញាតឱ្យអ្នកចូលដោយលេខទូរស័ព្ទ ឬអ៊ីមែលផងដែរ ហើយអ្នកនឹងមិនជាប់ខាងក្រៅ ប្រសិនបើបាត់គណនី Google។"
          : "Right now Google is the only way into this account. A password lets you sign in with your phone number or email too, so losing your Google account does not lock you out."}
      </p>

      {error && (
        <Alert tone="danger" title={km ? "មិនបានសម្រេច" : "That didn't work"}>
          <span className="small">{error}</span>
        </Alert>
      )}

      {needsPhone && (
        <Field
          label={km ? "លេខទូរស័ព្ទ" : "Phone number"}
          hint={km ? "ឧទាហរណ៍ 012 345 678" : "For example 012 345 678"}
        >
          <input
            className="input"
            value={phone}
            onChange={(e) => {
              setPhoneValue(e.target.value);
              setError("");
            }}
            autoComplete="tel"
            inputMode="tel"
            placeholder="012 345 678"
          />
        </Field>
      )}

      <Field
        label={km ? "ពាក្យសម្ងាត់" : "Password"}
        error={
          tooShort ? (km ? "យ៉ាងតិច ៨ តួអក្សរ។" : "At least 8 characters.") : ""
        }
        hint={
          tooShort
            ? undefined
            : km
              ? "យ៉ាងតិច ៨ តួអក្សរ។"
              : "At least 8 characters."
        }
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>

      <Field
        label={km ? "បញ្ជាក់ពាក្យសម្ងាត់" : "Confirm password"}
        error={mismatch ? (km ? "មិនដូចគ្នាទេ។" : "These do not match.") : ""}
      >
        <input
          className="input"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>

      <div className="acct-actions">
        {onCancel && (
          <button
            type="button"
            className="acct-btn acct-btn-quiet"
            disabled={busy}
            onClick={onCancel}
          >
            {km ? "បោះបង់" : "Cancel"}
          </button>
        )}
        <button
          type="submit"
          className="acct-btn acct-btn-primary"
          disabled={busy || !ready}
        >
          <Icon name="lock" size={14} />
          {busy
            ? km
              ? "កំពុងរក្សាទុក…"
              : "Saving…"
            : km
              ? "កំណត់ពាក្យសម្ងាត់"
              : "Set password"}
        </button>
      </div>
    </form>
  );
}

/** First letters of the first two words, which is all an avatar needs. */
function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/*
 * Scoped to this page and acct- prefixed, the same choice the admin queues made:
 * styles/index.css is edited on another branch, and one screen's layout is not
 * a shared primitive. Colours and radii come from the app's own custom
 * properties, so light and dark follow the theme without a second palette.
 *
 * One 4px spacing scale, as in queueStyles.js.
 */
const ACCT_CSS = `
/*
 * A panel over the page, not a page.
 *
 * 40% of the viewport, pinned to the right edge and full height. Below 860px
 * that would be a 340px column of form fields, so it takes the whole screen
 * there instead - the proportion is the point on a desktop, not on a phone.
 *
 * One 4px spacing scale, as in queueStyles.js.
 */
.acct-overlay { position: fixed; inset: 0; z-index: 60;
                background: rgb(0 0 0 / .45);
                display: flex; justify-content: flex-end;
                animation: acct-fade .18s ease-out both; }
.acct-overlay.is-closing { animation: acct-fade .16s ease-in both reverse; }

.acct-panel { --acct-1: .25rem; --acct-2: .5rem; --acct-3: .75rem; --acct-4: 1rem;
              --acct-5: 1.5rem; --acct-6: 2rem;
              width: min(30rem, 100%); height: 100%;
              background: var(--color-page); color: var(--color-ink);
              border-inline-start: 1px solid var(--color-line);
              box-shadow: -16px 0 40px rgb(0 0 0 / .18);
              display: flex; flex-direction: column;
              animation: acct-in .22s cubic-bezier(.32, .72, 0, 1) both; }
.acct-panel.is-closing { animation: acct-out .18s cubic-bezier(.32, .72, 0, 1) both; }

@media (max-width: 560px) { .acct-panel { width: 100%; } }

@keyframes acct-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes acct-in  { from { transform: translateX(100%) } to { transform: none } }
@keyframes acct-out { from { transform: none } to { transform: translateX(100%) } }

/* A slide is orientation, not decoration - but someone who asks for less
   motion should still get the panel, just without the travel. */
@media (prefers-reduced-motion: reduce) {
  .acct-overlay, .acct-overlay.is-closing,
  .acct-panel, .acct-panel.is-closing { animation-duration: .01ms; }
}

/* Header stays put; only the content scrolls. The close button must never be
   the thing you have to scroll back up to find. */
.acct-head { flex: none; display: grid; align-items: center; gap: var(--acct-3);
             grid-template-columns: 34px 1fr 34px;
             padding: var(--acct-4) var(--acct-4);
             border-bottom: 1px solid var(--color-line);
             background: var(--color-surface); }
.acct-head h1 { margin: 0; font-size: 1.05rem; font-weight: 600;
                letter-spacing: -.02em; text-align: center; }
.acct-head-slot { display: flex; }
.acct-head-slot-end { justify-content: flex-end; }

.acct-close { flex: none; display: grid; place-items: center;
              width: 34px; height: 34px; border-radius: 50%;
              border: 1px solid transparent; background: transparent;
              color: var(--color-ink-2); cursor: pointer;
              transition: background .12s, border-color .12s; }
.acct-close:hover { background: var(--color-surface-2);
                    border-color: var(--color-line); }
.acct-close:focus-visible { outline: 2px solid var(--color-brand-500);
                            outline-offset: 2px; }

.acct-body { flex: 1; min-height: 0; overflow-y: auto;
             padding: var(--acct-5);
             display: flex; flex-direction: column; gap: var(--acct-5); }

/* ----------------------------------------------------------- identity */
.acct-hero { display: flex; align-items: center; gap: var(--acct-4); }
/* The ring is drawn inside rather than as a border so the circle keeps its
   56px and the initials stay centred in it. Mixed from the ink already in the
   tint, so it reads as an edge on the tint in both themes rather than as a
   grey hoop drawn around it. */
.acct-avatar { flex: none; width: 56px; height: 56px; border-radius: 50%;
               display: grid; place-items: center;
               background: var(--color-tint-2); color: var(--color-on-tint);
               box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--color-on-tint) 18%, transparent);
               font-size: 1.15rem; font-weight: 600; letter-spacing: -.02em; }
.acct-hero-text { min-width: 0; display: flex; flex-direction: column;
                  align-items: flex-start; gap: 2px; }
.acct-hero-name { font-size: 1.15rem; font-weight: 600; letter-spacing: -.02em; }
.acct-hero-sub { display: inline-flex; align-items: center; gap: var(--acct-1);
                 min-width: 0; font-size: .85rem; color: var(--color-muted);
                 overflow-wrap: anywhere; }
/* A flex item shrinks; a 13px mark that shrinks with a long address stops
   being the thing that identifies which contact this is. */
.acct-hero-sub svg { flex: none; }

/* Both contacts on one line, each behind its own mark. The gap is wide enough
   that the second mark reads as the start of something new rather than as
   punctuation belonging to the address before it, and the row wraps instead of
   forcing the panel to scroll sideways on a long address. */
.acct-hero-contact { display: flex; flex-wrap: wrap; align-items: center;
                     gap: var(--acct-1) var(--acct-3); }

/* The handle is set exactly like the email beside it: .acct-hero-sub carries
   the size, the colour and the mark's spacing, and this adds only what being a
   link requires. Colour and underline on hover rather than a fade - a link that
   merely dims gives no sign it is one until the pointer is already on it. */
.acct-hero-tg { text-decoration: none; color: inherit;
                transition: color .12s; }
.acct-hero-tg:hover { color: var(--color-brand-600); text-decoration: underline; }
.acct-hero-tg:focus-visible { outline: 2px solid var(--color-brand-500);
                              outline-offset: 2px; border-radius: 4px; }
.acct-role { margin-top: var(--acct-1); display: inline-flex; align-items: center;
             gap: var(--acct-1); padding: 2px var(--acct-2);
             border-radius: 999px; background: var(--color-tint);
             color: var(--color-on-tint); font-size: .72rem; font-weight: 600; }

.acct-org { display: flex; align-items: center; gap: var(--acct-3);
            border: 1px solid var(--color-line);
            border-radius: var(--radius-card, 16px);
            background: var(--color-surface); padding: var(--acct-3) var(--acct-4); }
.acct-org-mark { flex: none; display: grid; place-items: center;
                 color: var(--color-ink-2); }
.acct-org-text { min-width: 0; display: flex; flex-direction: column; }
.acct-org-name { font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }
.acct-org-alt { font-size: .82rem; color: var(--color-muted); }

/* ------------------------------------------------------ settings rows */
.acct-section { display: flex; flex-direction: column; gap: var(--acct-2); }
.acct-section h2 { margin: 0; font-size: .72rem; font-weight: 600;
                   text-transform: uppercase; letter-spacing: .07em;
                   color: var(--color-muted); padding-inline-start: var(--acct-1); }

.acct-rows { border: 1px solid var(--color-line);
             border-radius: var(--radius-card, 16px);
             background: var(--color-surface); overflow: hidden; }

/* The separator stops short of the panel edge and starts where the titles do.
   A rule that runs the full width cuts the card into slices; one that lines up
   with the text reads as a break between two entries of the same list. It is
   drawn on the row rather than as a border so it can be inset. */
.acct-row { position: relative;
            width: 100%; display: flex; align-items: center; gap: var(--acct-3);
            padding: .8rem var(--acct-4); text-align: start;
            font: inherit; color: inherit; background: none; border: 0; }
.acct-row + .acct-row::before { content: ''; position: absolute;
                                inset-inline: calc(var(--acct-4) + 20px + var(--acct-3)) 0;
                                top: 0; height: 1px; background: var(--color-line-2); }
button.acct-row { cursor: pointer; transition: background .12s; }
button.acct-row:hover { background: var(--color-surface-2); }
/* A pressed row should read as pressed on a touch screen too, where there is
   no hover to have told you the row was live in the first place. */
button.acct-row:active { background: var(--color-tint); }
button.acct-row:focus-visible { outline: 2px solid var(--color-brand-500);
                                outline-offset: -2px; border-radius: 2px; }

/* Bare, one weight, one colour - see the note on Row. Aligned on a 20px slot
   so a wide glyph and a narrow one still start their titles at the same x. */
.acct-row-icon { flex: none; width: 20px; color: var(--color-ink-2);
                 transition: color .12s; }
/* --color-link, not --color-brand-600: the brand greens are fixed across both
   themes, so brand-600 on hover would turn the mark a shade darker than the
   dark surface it sits on. The link token is the one that already flips to the
   pale jade in the dark theme. */
button.acct-row:hover .acct-row-icon,
button.acct-row:focus-visible .acct-row-icon { color: var(--color-link); }

.acct-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.acct-row-title { font-size: .92rem; font-weight: 600; letter-spacing: -.01em; }
.acct-row-sub { font-size: .78rem; color: var(--color-muted); line-height: 1.45; }
.acct-row-value { flex: none; font-size: .82rem; color: var(--color-ink-2); }

/* The chevron travels on hover instead of merely darkening: a mark that moves
   towards where it will take you says "this opens" before you have read it. */
.acct-row-chev { flex: none; color: var(--color-placeholder);
                 transition: color .12s, transform .12s ease-out; }
button.acct-row:hover .acct-row-chev,
button.acct-row:focus-visible .acct-row-chev { color: var(--color-ink-2);
                                               transform: translateX(2px); }
@media (prefers-reduced-motion: reduce) {
  button.acct-row:hover .acct-row-chev { transform: none; }
}

/* Both choices visible, one pressed - see the note on SegToggle. Sized to sit
   in a row's value slot without making the row taller than its neighbours. */
.acct-seg { display: inline-flex; flex: none; padding: 3px; gap: 2px;
            border: 1px solid var(--color-line);
            border-radius: 999px; background: var(--color-surface-2); }
.acct-seg button { display: inline-flex; align-items: center; gap: var(--acct-1);
                   border: 0; background: none; cursor: pointer;
                   padding: .25rem .65rem; border-radius: 999px;
                   font: inherit; font-size: .78rem; font-weight: 600;
                   color: var(--color-muted);
                   transition: background .12s, color .12s; }
.acct-seg button:hover { color: var(--color-ink); }
/* The chosen side is filled, not tinted. Pale green on cream told you which
   half was selected only if you looked for it; against the plain half, solid
   brand answers it at a glance - and it is the same green as the panel's
   primary buttons, so "on" means one thing throughout. */
.acct-seg button[aria-pressed='true'] { background: var(--color-brand-600);
                                        color: #fff; }
.acct-seg button[aria-pressed='true']:hover { background: var(--color-brand-700);
                                              color: #fff; }
/* One step lighter in the dark theme. brand-600 is a deep jade chosen to hold
   white text on a pale page; on the dark track it is close enough to the
   surface that the filled half stops announcing itself, which is the one job
   it has. */
:root[data-theme='dark'] .acct-seg button[aria-pressed='true'] { background: var(--color-brand-500); }
:root[data-theme='dark'] .acct-seg button[aria-pressed='true']:hover { background: var(--color-brand-600); }
.acct-seg button:focus-visible { outline: 2px solid var(--color-brand-500);
                                 outline-offset: 2px; }
.acct-seg :is(.icon, .flag) { flex: none; }
/* The shared .flag carries a white ring, which it needs against the navbar's
   near-black bar and which here would draw a pale box around each flag on a
   cream track - and a second box inside the pressed pill. On these surfaces the
   flags have enough edge contrast of their own. */
.acct-seg .flag { box-shadow: none; border-radius: 2px; }

/* Signing out ends the session rather than configuring anything, so it is a
   button, not one more row in a settings list. Pinned cleanly to the foot of
   the panel as a fixed footer so it stays accessible without having to scroll. */
/* Back and Sign out side by side, equal widths, back first: the everyday
   action leads and the one that ends the session is at the far end. The two
   are told apart by colour as well as position, and signing out still stops
   at a confirm dialog, so a missed tap on either costs nothing. */
.acct-foot { flex: none; display: grid; grid-template-columns: 1fr 1fr;
             gap: var(--acct-3);
             padding: var(--acct-3) var(--acct-5) max(var(--acct-4), env(safe-area-inset-bottom, 0px));
             border-top: 1px solid var(--color-line);
             background: var(--color-page);
             box-shadow: 0 -4px 16px rgb(0 0 0 / .04); }
/* Tinted, not white. A surface fill with a --color-line border sat on the
   paper footer at almost no contrast - the red label was the only thing
   saying there was a button there at all. The danger tint gives it a shape
   of its own and says what kind of action it is before it is read; the
   border is the danger tone thinned, so the edge is visible without the
   whole control shouting. Still not a solid red fill: this is a routine
   action, and the confirm dialog behind it is where the weight belongs.
   Every tone here is a theme token, so dark mode follows. */
/* Neutral, but with an edge that holds on the paper footer - the stock
   .acct-btn-quiet (transparent, --color-line border) disappears there the
   same way the old sign-out button did. */
.acct-btn-back { min-height: 44px; font-size: .9375rem;
                 background: var(--color-surface);
                 border-color: color-mix(in oklab, var(--color-ink) 18%, transparent);
                 color: var(--color-ink-2);
                 transition: background .15s, border-color .15s, transform .06s; }
.acct-btn-back:hover { background: var(--color-surface-2);
                       border-color: color-mix(in oklab, var(--color-ink) 30%, transparent);
                       color: var(--color-ink); }
.acct-btn-back:active { transform: translateY(1px); }
.acct-btn-back:focus-visible { outline: 2px solid var(--color-brand-500);
                               outline-offset: 2px; }
.acct-btn-signout { min-height: 44px; font-size: .9375rem;
                    background: var(--color-danger-soft);
                    border-color: color-mix(in oklab, var(--color-danger) 32%, transparent);
                    color: var(--color-danger);
                    transition: background .15s, border-color .15s, transform .06s; }
.acct-btn-signout:hover { background: color-mix(in oklab, var(--color-danger) 8%, var(--color-danger-soft));
                          border-color: color-mix(in oklab, var(--color-danger) 60%, transparent); }
.acct-btn-signout:active { transform: translateY(1px); }
.acct-btn-signout:focus-visible { outline: 2px solid var(--color-danger);
                                  outline-offset: 2px; }

/* How you sign in, when there is no password to change. */
.acct-signin { display: flex; align-items: center; gap: var(--acct-3);
               padding: var(--acct-3); border-radius: var(--radius-ui, 12px);
               background: var(--color-surface-2); }
.acct-signin-icon { flex: none; display: grid; place-items: center;
                    color: var(--color-ink-2); }
.acct-signin-name { font-size: .95rem; font-weight: 600; letter-spacing: -.01em; }

/* --------------------------------------------------------------- forms */
.acct-card { border: 1px solid var(--color-line);
             border-radius: var(--radius-card, 16px);
             background: var(--color-surface);
             padding: var(--acct-5); display: flex; flex-direction: column;
             gap: var(--acct-4); }
.acct-card h2 { margin: 0; font-size: 1.05rem; font-weight: 600;
                letter-spacing: -.015em; }
.acct-lede { margin: calc(var(--acct-3) * -1) 0 0; }

/* The "@" belongs in the field, not in the placeholder that disappears the
   moment someone starts typing their handle. Same arrangement, and the same
   reasoning, as .org-apply-prefixed in styles/index.css. */
.acct-prefixed { position: relative; display: block; }
.acct-prefix { position: absolute; inset-inline-start: .7rem; top: 50%;
               transform: translateY(-50%); pointer-events: none;
               color: var(--color-muted); font-size: .9rem; }
.acct-prefixed .input { padding-inline-start: 1.6rem; }

.acct-actions { display: flex; align-items: center; justify-content: flex-end;
                gap: var(--acct-3);
                padding-top: var(--acct-2);
                border-top: 1px solid var(--color-line-2); }

.acct-btn { display: inline-flex; align-items: center; justify-content: center;
            gap: var(--acct-2); font: inherit; font-size: .875rem; font-weight: 600;
            padding: var(--acct-3) var(--acct-5); border-radius: var(--radius-ui, 12px);
            border: 1px solid transparent; cursor: pointer;
            transition: background .12s, border-color .12s; }
.acct-btn:disabled { opacity: .5; cursor: not-allowed; }
.acct-btn-primary { background: var(--color-brand-600); color: #fff; }
.acct-btn-primary:not(:disabled):hover { background: var(--color-brand-700); }
.acct-btn-quiet { background: transparent; border-color: var(--color-line);
                  color: var(--color-muted); }
.acct-btn-quiet:not(:disabled):hover { background: var(--color-surface-2);
                                       border-color: var(--color-line);
                                       color: var(--color-ink); }

/* ---------------------------------------------------------------- Khmer */
/*
 * Khmer has no case, and its clusters stack above and below the base line.
 * Uppercasing a section heading therefore does nothing at all, and the tracking
 * that gives a Latin micro-caps label its air pushes the marks off the
 * consonants they belong to. The treatment is Latin's, so it stays Latin's.
 */
html[lang='km'] .acct-section h2 { text-transform: none; letter-spacing: 0;
                                   font-size: .82rem; }

/* Room for the stacked marks, which a line-height tuned to Latin clips. */
html[lang='km'] .acct-row-title { line-height: 1.55; }
html[lang='km'] .acct-row-sub { line-height: 1.7; }
html[lang='km'] .acct-hero-name { line-height: 1.45; }
html[lang='km'] .acct-role { padding-block: 3px; }
html[lang='km'] .acct-seg button { padding-block: .3rem; }
`;
