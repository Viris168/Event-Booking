import { useEffect, useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  disconnectTelegram,
  getTelegramConnectLink,
  getTelegramStatus,
} from "../api/organizerTelegram.js";

/**
 * The organiser's own half of "Connect Telegram" - modeled on AccountPanel's
 * GoogleLinkCard (connected state with Disconnect behind a confirm dialog,
 * not-connected state with an explanation and a connect action), but there
 * is no OAuth callback to hook into here: connecting means opening a deep
 * link and pressing Start *in Telegram*, which this tab has no way to be
 * told about automatically. "Check again" re-polls status instead.
 */
export default function TelegramConnectCard({ inAccount = false }) {
  const { locale } = useLocale();
  const km = locale === "km";
  const toast = useToast();

  // null while the first status check is in flight - rendering nothing
  // until then avoids a flash of "Connect Telegram" on every page load for
  // an organiser who already has been.
  const [connected, setConnected] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  function refresh() {
    return getTelegramStatus()
      .then((s) => setConnected(Boolean(s.connected)))
      .catch(() => setConnected(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function connect() {
    setBusy(true);
    try {
      const { deepLink: link } = await getTelegramConnectLink();
      setDeepLink(link);
      window.open(link, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast(
        e?.response?.status === 409
          ? km
            ? "Telegram មិនទាន់បានរៀបចំនៅលើម៉ាស៊ីនមេទេ។"
            : "Telegram is not set up on this server yet."
          : km
            ? "ចាប់ផ្តើមភ្ជាប់មិនបាន"
            : "Could not start connecting",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setBusy(true);
    try {
      const wasConnected = connected;
      const s = await getTelegramStatus();
      setConnected(Boolean(s.connected));
      if (s.connected && !wasConnected) {
        toast(km ? "បានភ្ជាប់ Telegram" : "Telegram connected", "success");
        setDeepLink(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function doDisconnect() {
    setBusy(true);
    try {
      await disconnectTelegram();
      setConnected(false);
      setDeepLink(null);
      setConfirmDisconnect(false);
      toast(km ? "បានផ្តាច់ Telegram" : "Telegram disconnected", "success");
    } catch {
      toast(km ? "ផ្តាច់មិនបានសម្រេច" : "Could not disconnect", "error");
    } finally {
      setBusy(false);
    }
  }

  if (inAccount) {
    if (connected === null) {
      return (
        <section className="acct-card">
          <h2>{km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"}</h2>
          <p className="muted small">{km ? "កំពុងផ្ទុក…" : "Loading…"}</p>
        </section>
      );
    }

    return (
      <section className="acct-card">
        <h2>{km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"}</h2>

        {connected ? (
          <>
            <div className="acct-signin">
              <span
                className="acct-signin-icon"
                aria-hidden="true"
                style={{ color: "var(--color-primary, #10b981)" }}
              >
                <Icon name="checkCircle" size={18} />
              </span>
              <div>
                <div className="acct-signin-name">
                  {km ? "បានភ្ជាប់ Telegram" : "Telegram connected"}
                </div>
                <div className="small muted">
                  {km
                    ? "អ្នកនឹងទទួលសារនៅពេលព្រឹត្តិការណ៍ត្រូវបានអនុម័ត ឬសំបុត្រលក់បាន។"
                    : "You'll get a message the moment an event is approved or a ticket sells."}
                </div>
              </div>
            </div>

            <div className="acct-actions">
              <button
                type="button"
                className="acct-btn acct-btn-quiet"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                {km ? "ផ្តាច់" : "Disconnect"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="muted small acct-note">
              {km
                ? "ភ្ជាប់ Telegram ដើម្បីទទួលដំណឹងភ្លាមៗនៅពេលមានការទិញសំបុត្រ ឬព្រឹត្តិការណ៍ត្រូវបានអនុម័ត ដោយមិនបាច់ចូលមកពិនិត្យផ្ទាំងគ្រប់គ្រងរហូតទេ។"
                : "Connect Telegram to get notified instantly when tickets sell or events are approved — no need to keep checking the dashboard."}
            </p>

            <div
              className="acct-actions"
              style={{ gap: "0.6rem", flexWrap: "wrap" }}
            >
              {deepLink ? (
                <>
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="acct-btn acct-btn-primary"
                    style={{
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    }}
                  >
                    <Icon name="telegram" size={15} />
                    {km ? "បើក Telegram" : "Open Telegram"}
                  </a>
                  <button
                    type="button"
                    className="acct-btn acct-btn-quiet"
                    disabled={busy}
                    onClick={checkAgain}
                  >
                    {km ? "ពិនិត្យម្តងទៀត" : "Check again"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="acct-btn acct-btn-primary"
                  disabled={busy}
                  onClick={connect}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.4rem",
                  }}
                >
                  <Icon name="telegram" size={15} />
                  {km ? "ភ្ជាប់ Telegram" : "Connect Telegram"}
                </button>
              )}
            </div>
          </>
        )}

        <ConfirmDialog
          open={confirmDisconnect}
          tone="warn"
          busy={busy}
          title={km ? "ផ្តាច់ Telegram?" : "Disconnect Telegram?"}
          confirmLabel={km ? "ផ្តាច់" : "Disconnect"}
          onConfirm={doDisconnect}
          onClose={() => setConfirmDisconnect(false)}
        >
          <p className="small muted">
            {km
              ? "អ្នកនឹងឈប់ទទួលសារភ្លាមៗ ប៉ុន្តែការជូនដំណឹងក្នុងកម្មវិធីនៅតែបន្តដដែល។"
              : "You'll stop getting instant messages, but in-app notifications keep working as before."}
          </p>
        </ConfirmDialog>
      </section>
    );
  }

  if (connected === null) return null;

  return (
    <section className="bg-surface border border-line rounded-card shadow-card p-5 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <span className="w-10 h-10 rounded-full bg-surface-2 border border-line-2 flex items-center justify-center text-muted shrink-0">
          <Icon name="bell" size={18} />
        </span>
        <div className="min-w-0">
          <div className="font-bold text-ink">
            {km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"}
          </div>
          <p className="small muted m-0">
            {connected
              ? km
                ? "អ្នកនឹងទទួលសារនៅពេលព្រឹត្តិការណ៍ត្រូវបានអនុម័ត ឬសំបុត្រលក់បាន។"
                : "You'll get a message the moment an event is approved or a ticket sells."
              : km
                ? "ភ្ជាប់ Telegram ដើម្បីទទួលដំណឹងភ្លាមៗ ដោយមិនចាំបាច់ចូលមកមើលទំព័រនេះទេ។"
                : "Connect Telegram to get notified the instant it happens — no need to keep checking this page."}
          </p>
        </div>
      </div>

      {connected ? (
        <button
          type="button"
          className="btn btn-sm btn-outline whitespace-nowrap"
          disabled={busy}
          onClick={() => setConfirmDisconnect(true)}
        >
          {km ? "ផ្តាច់" : "Disconnect"}
        </button>
      ) : deepLink ? (
        <div className="flex items-center gap-2">
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-primary whitespace-nowrap"
          >
            {km ? "បើក Telegram" : "Open Telegram"}
          </a>
          <button
            type="button"
            className="btn btn-sm btn-outline whitespace-nowrap"
            disabled={busy}
            onClick={checkAgain}
          >
            {km ? "ពិនិត្យម្តងទៀត" : "Check again"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-primary whitespace-nowrap"
          disabled={busy}
          onClick={connect}
        >
          {km ? "ភ្ជាប់ Telegram" : "Connect Telegram"}
        </button>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        tone="warn"
        busy={busy}
        title={km ? "ផ្តាច់ Telegram?" : "Disconnect Telegram?"}
        confirmLabel={km ? "ផ្តាច់" : "Disconnect"}
        onConfirm={doDisconnect}
        onClose={() => setConfirmDisconnect(false)}
      >
        <p className="small muted">
          {km
            ? "អ្នកនឹងឈប់ទទួលសារភ្លាមៗ ប៉ុន្តែការជូនដំណឹងក្នុងកម្មវិធីនៅតែបន្តដដែល។"
            : "You'll stop getting instant messages, but in-app notifications keep working as before."}
        </p>
      </ConfirmDialog>
    </section>
  );
}
