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
 * Clean modal dialog allowing organizers to connect/disconnect the Telegram bot.
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

  // Auto-poll while deepLink is waiting for the user to tap "Start" in Telegram
  useEffect(() => {
    if (!open || !deepLink || connected) return undefined;
    const timer = setInterval(() => {
      getTelegramStatus()
        .then((s) => {
          if (s?.connected) {
            setConnected(true);
            onStatusChange?.(true);
            setDeepLink(null);
            toast(
              km
                ? "បានភ្ជាប់ Telegram ដោយជោគជ័យ!"
                : "Telegram connected successfully!",
              "success",
            );
          }
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [open, deepLink, connected, km, onStatusChange, toast]);

  // Lock scroll and handle Escape
  useEffect(() => {
    if (!open) return undefined;
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
            ? "Telegram Bot មិនទាន់បានរៀបចំនៅលើម៉ាស៊ីនមេទេ។"
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
      toast(
        km ? "បានផ្តាច់ Telegram Bot" : "Telegram bot disconnected",
        "success",
      );
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
        className="bg-surface border border-line rounded-hero shadow-pop p-6 max-w-[440px] w-full mx-4 relative"
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
        <div className="flex items-center gap-3.5 mb-5">
          <span className="w-11 h-11 rounded-2xl bg-[#24A1DE]/10 text-[#24A1DE] border border-[#24A1DE]/20 flex items-center justify-center shrink-0">
            <Icon name="telegram" size={22} />
          </span>
          <div>
            <h2
              id="telegram-modal-title"
              className="text-lg font-bold text-ink m-0"
            >
              {km ? "Telegram Bot" : "Telegram Bot"}
            </h2>
            <p className="text-tiny text-muted m-0 mt-0.5">
              {km
                ? "ការជូនដំណឹងរហ័សពេលលក់សំបុត្រ ឬអនុម័ត"
                : "Real-time alerts for ticket sales & event updates"}
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
                  {km ? "បានភ្ជាប់រួចរាល់" : "Connected"}
                </div>
                <p className="text-tiny text-ink-2 m-0 mt-1">
                  {km
                    ? "គណនីរបស់អ្នកបានភ្ជាប់ជាមួយ Telegram Bot រួចរាល់។ អ្នកនឹងទទួលបានសារជូនដំណឹងរាល់ពេលមានការកក់សំបុត្រ ឬអនុម័តព្រឹត្តិការណ៍។"
                    : "Your account is connected to the Telegram bot. You receive real-time alerts for ticket bookings and event updates."}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                className="btn btn-ghost text-small"
                onClick={onClose}
              >
                {km ? "បិទ" : "Close"}
              </button>
              <button
                type="button"
                className="btn btn-outline text-danger hover:bg-danger/10 border-danger/30 text-small inline-flex items-center gap-1.5"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                <Icon name="logout" size={14} />
                {km ? "ផ្តាច់" : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-4 rounded-card border border-line-2 bg-surface-2 text-ink-2 text-small flex items-start gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-muted mt-1.5 shrink-0" />
              <div>
                <div className="text-small font-bold text-ink">
                  {km ? "មិនទាន់បានភ្ជាប់" : "Not connected"}
                </div>
                <p className="text-tiny text-muted m-0 mt-0.5">
                  {km
                    ? "ភ្ជាប់ជាមួយ Telegram Bot ដើម្បីទទួលដំណឹងភ្លាមៗនៅពេលមានការលក់សំបុត្រ ឬអនុម័តព្រឹត្តិការណ៍។"
                    : "Connect with the Telegram bot to receive instant alerts when tickets sell or events are approved."}
                </p>
              </div>
            </div>

            {deepLink ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-card border border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-200 text-tiny">
                  {km
                    ? "ជំហានបន្ទាប់៖ សូមចុច «Start» ក្នុង Telegram រួចចុច «ពិនិត្យការតភ្ជាប់» ខាងក្រោម។"
                    : "Next step: Click 'Start' in Telegram, then click 'Check connection' below."}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={deepLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline text-small inline-flex items-center gap-1.5"
                  >
                    <Icon name="telegram" size={15} />
                    {km ? "បើក Telegram" : "Open Telegram"}
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
                  {km ? "បោះបង់" : "Cancel"}
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
                      ? "ភ្ជាប់"
                      : "Connect"}
                </button>
              </div>
            )}
          </div>
        )}

        <ConfirmDialog
          open={confirmDisconnect}
          tone="warn"
          busy={busy}
          title={km ? "ផ្តាច់ Telegram Bot?" : "Disconnect Telegram Bot?"}
          confirmLabel={km ? "ផ្តាច់" : "Disconnect"}
          cancelLabel={km ? "បោះបង់" : "Cancel"}
          onConfirm={doDisconnect}
          onClose={() => setConfirmDisconnect(false)}
        >
          <p className="small muted">
            {km
              ? "អ្នកនឹងឈប់ទទួលសារភ្លាមៗតាម Telegram Bot ប៉ុន្តែការជូនដំណឹងក្នុងកម្មវិធីនៅតែបន្តដដែល។"
              : "You'll stop receiving instant Telegram messages, but in-app notifications keep working as before."}
          </p>
        </ConfirmDialog>
      </div>
    </div>,
    document.body,
  );
}
