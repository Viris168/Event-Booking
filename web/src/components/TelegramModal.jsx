import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.jsx";
import ConfirmDialog from "./ConfirmDialog.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { useToast } from "../context/ToastContext.jsx";
import {
  disconnectTelegram,
  getTelegramConnectLink,
  getTelegramStatus,
} from "../api/organizerTelegram.js";

/**
 * Modal dialog allowing organizers to connect/disconnect their Telegram account
 * and receive real-time notifications for ticket sales and event approvals.
 */
export default function TelegramModal({ open, onClose, onStatusChange }) {
  const { locale } = useLocale();
  const km = locale === "km";
  const toast = useToast();

  const [connected, setConnected] = useState(null);
  const [deepLink, setDeepLink] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    getTelegramStatus()
      .then((s) => {
        if (!live) return;
        const isConn = Boolean(s?.connected);
        setConnected(isConn);
        onStatusChange?.(isConn);
      })
      .catch(() => {
        if (!live) return;
        setConnected(false);
      });
    return () => {
      live = false;
    };
  }, [open, onStatusChange]);

  // Lock scroll and handle Escape
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => {
      if (e.key === "Escape" && !busy && !confirmDisconnect) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, confirmDisconnect, onClose]);

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
            : "Telegram bot is not configured on this server yet."
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
      const isConn = Boolean(s?.connected);
      setConnected(isConn);
      onStatusChange?.(isConn);
      if (isConn && !wasConnected) {
        toast(
          km
            ? "បានភ្ជាប់ Telegram ដោយជោគជ័យ!"
            : "Telegram connected successfully!",
          "success",
        );
        setDeepLink(null);
      } else if (!isConn) {
        toast(
          km
            ? "មិនទាន់ឃើញការតភ្ជាប់ទេ។ សូមចុច Start ក្នុង Telegram។"
            : "Not connected yet. Please press Start in the Telegram bot.",
          "info",
        );
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
      onStatusChange?.(false);
      toast(km ? "បានផ្តាច់ Telegram" : "Telegram disconnected", "success");
    } catch {
      toast(km ? "ផ្តាច់មិនបានសម្រេច" : "Could not disconnect", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-overlay"
      style={{ backdropFilter: "blur(4px)" }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="telegram-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="bg-surface border border-line rounded-hero shadow-pop p-6 max-w-[480px] w-full mx-4 relative"
      >
        {/* Close Button */}
        <button
          type="button"
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors"
          onClick={onClose}
          aria-label={km ? "បិទ" : "Close"}
        >
          <Icon name="close" size={16} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3.5 mb-4">
          <span className="w-11 h-11 rounded-2xl bg-[#24A1DE]/10 text-[#24A1DE] border border-[#24A1DE]/20 flex items-center justify-center shrink-0">
            <Icon name="telegram" size={22} />
          </span>
          <div>
            <h2
              id="telegram-modal-title"
              className="text-lg font-bold text-ink m-0"
            >
              {km ? "ការជូនដំណឹងតាម Telegram" : "Telegram notifications"}
            </h2>
            <p className="text-tiny text-muted m-0 mt-0.5">
              {km
                ? "ទទួលដំណឹងភ្លាមៗពេលមានការលក់សំបុត្រ ឬអនុម័ត"
                : "Instant alerts for ticket sales & event updates"}
            </p>
          </div>
        </div>

        {/* Modal Body */}
        {connected === null ? (
          <div className="py-8 text-center text-muted text-small">
            {km ? "កំពុងពិនិត្យស្ថានភាព…" : "Checking connection status…"}
          </div>
        ) : connected ? (
          <div className="space-y-4">
            <div className="p-4 rounded-card border border-success/25 bg-success-soft flex items-start gap-3">
              <span className="text-success shrink-0 mt-0.5">
                <Icon name="checkCircle" size={18} />
              </span>
              <div>
                <div className="text-small font-bold text-success">
                  {km ? "បានភ្ជាប់រួចរាល់" : "Connected & Active"}
                </div>
                <p className="text-tiny text-ink-2 m-0 mt-1">
                  {km
                    ? "អ្នកនឹងទទួលបានសារភ្លាមៗតាម Telegram រាល់ពេលដែលមានអតិថិជនកក់សំបុត្រ ឬព្រឹត្តិការណ៍ត្រូវបានអនុម័ត។"
                    : "You will receive real-time Telegram alerts the moment an attendee books tickets or an event gets approved."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-outline text-danger hover:bg-danger/10 border-danger/30 text-small"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                <Icon name="logout" size={14} />
                {km ? "ផ្តាច់ Telegram" : "Disconnect"}
              </button>
              <button
                type="button"
                className="btn btn-primary text-small"
                onClick={onClose}
              >
                {km ? "រួចរាល់" : "Done"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-card border border-line-2 bg-surface-2 text-ink-2 text-small">
              <p className="m-0 font-medium text-ink">
                {km
                  ? "ភ្ជាប់ bot Telegram របស់ CamboBook ដើម្បី:"
                  : "Connect the CamboBook Telegram bot to:"}
              </p>
              <ul className="m-0 mt-2 pl-5 space-y-1 text-tiny text-muted list-disc">
                <li>
                  {km
                    ? "ទទួលដំណឹងភ្លាមៗពេលមានការលក់សំបុត្រថ្មី"
                    : "Get notified immediately when a new ticket is sold"}
                </li>
                <li>
                  {km
                    ? "ទទួលបានសាររំលឹក និងការអនុម័តព្រឹត្តិការណ៍"
                    : "Receive event approval & schedule reminders"}
                </li>
                <li>
                  {km
                    ? "មិនបាច់ចូលមកពិនិត្យផ្ទាំងគ្រប់គ្រងរាល់ពេលទេ"
                    : "No need to constantly refresh the dashboard"}
                </li>
              </ul>
            </div>

            {deepLink ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-card border border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200 text-tiny">
                  {km
                    ? "ជំហានបន្ទាប់៖ បង្អួច Telegram ត្រូវបានបើក។ សូមចុចប៊ូតុង «Start» ក្នុង Telegram រួចចុច «ពិនិត្យការតភ្ជាប់» ខាងក្រោម។"
                    : "Next step: Telegram was opened. Click 'Start' in the bot, then click 'Check connection' below."}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline text-small inline-flex items-center gap-1.5"
                  >
                    <Icon name="telegram" size={15} />
                    {km ? "បើក Telegram ឡើងវិញ" : "Reopen Telegram"}
                  </a>
                  <button
                    type="button"
                    className="btn btn-primary text-small"
                    disabled={busy}
                    onClick={checkAgain}
                  >
                    <Icon
                      name="refresh"
                      size={14}
                      className={busy ? "animate-spin" : ""}
                    />
                    {km ? "ពិនិត្យការតភ្ជាប់" : "Check connection"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-ghost text-small"
                  onClick={onClose}
                  disabled={busy}
                >
                  {km ? "ពេលក្រោយ" : "Maybe later"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary text-small inline-flex items-center gap-1.5"
                  disabled={busy}
                  onClick={connect}
                >
                  <Icon name="telegram" size={16} />
                  {busy
                    ? km
                      ? "កំពុងតភ្ជាប់…"
                      : "Connecting…"
                    : km
                      ? "ភ្ជាប់ Telegram ឥឡូវនេះ"
                      : "Connect Telegram now"}
                </button>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmDisconnect}
          tone="warn"
          busy={busy}
          title={km ? "ផ្តាច់ Telegram?" : "Disconnect Telegram?"}
          confirmLabel={km ? "ផ្តាច់" : "Disconnect"}
          cancelLabel={km ? "បោះបង់" : "Cancel"}
          onConfirm={doDisconnect}
          onClose={() => setConfirmDisconnect(false)}
        >
          <p className="small muted">
            {km
              ? "អ្នកនឹងឈប់ទទួលសារភ្លាមៗតាម Telegram ប៉ុន្តែការជូនដំណឹងក្នុងកម្មវិធីនៅតែបន្តដដែល។"
              : "You'll stop receiving instant Telegram messages, but in-app notifications keep working as before."}
          </p>
        </ConfirmDialog>
      </div>
    </div>,
    document.body,
  );
}
