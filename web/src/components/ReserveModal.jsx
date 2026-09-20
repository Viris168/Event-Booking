import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { usd, countdown } from "../lib/format.js";

export default function ReserveModal({
  hold,
  event,
  seats = [],
  zoneLines = [],
  subtotalUsdCents = 0,
  onRelease,
  onRemoveItem,
  checkoutTo,
}) {
  const { t, locale } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  const [dismissedHoldId, setDismissedHoldId] = useState(null);

  useEffect(() => {
    if (!hold?.expires_at) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hold?.expires_at]);

  // Handle Escape key to dismiss modal without canceling the hold
  useEffect(() => {
    if (!hold || dismissedHoldId === hold.id) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        setDismissedHoldId(hold.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hold, dismissedHoldId]);

  if (!hold || dismissedHoldId === hold.id) return null;

  const msLeft = hold ? new Date(hold.expires_at).getTime() - now : 0;
  if (msLeft <= 0) return null;

  const warn = msLeft < 2 * 60 * 1000;

  let totalQty = seats.length;
  for (const z of zoneLines) {
    totalQty += z.qty;
  }
  const ticketLabel =
    locale === "km"
      ? `${totalQty} សំបុត្រ`
      : `${totalQty} ticket${totalQty === 1 ? "" : "s"}`;

  const eventTitle = event
    ? locale === "km"
      ? event.title_km || event.title
      : event.title_en || event.title
    : null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setDismissedHoldId(hold.id);
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-modal-title"
    >
      <div className="modal-container reserve-modal">
        {/* Header */}
        <div className="reserve-head">
          <div className="reserve-head-left">
            <div className="reserve-head-icon">
              <Icon name="ticket" size={20} />
            </div>
            <div className="reserve-head-meta">
              <h3 id="reserve-modal-title" className="reserve-title">
                {locale === "km" ? "សង្ខេបការកក់" : "Order summary"}
              </h3>
              {eventTitle && (
                <div className="reserve-event-name">{eventTitle}</div>
              )}
            </div>
          </div>

          <button
            className="reserve-quit"
            type="button"
            onClick={() => setDismissedHoldId(hold.id)}
            aria-label={locale === "km" ? "បិទផ្ទាំងនេះ" : "Close"}
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        {/* Urgency Status Banner */}
        <div className={`reserve-status-banner ${warn ? "warn" : ""}`}>
          <div className="reserve-status-left">
            <span className="reserve-status-dot" />
            <Icon name="clock" size={14} />
            <span className="reserve-status-text">
              {t("holdActive")} · {t("holdExpiresIn")}{" "}
              <strong className="reserve-status-clock">
                {countdown(msLeft)}
              </strong>
            </span>
          </div>
          <span className="reserve-status-pill">{ticketLabel}</span>
        </div>

        {/* Order Details Body */}
        <div className="modal-body reserve-modal-body">
          <div className="reserve-items">
            {seats.map((s) => (
              <div
                className="reserve-item-row"
                key={s.id || s.event_seat_id || s.seat_number}
              >
                <div className="reserve-item-mark">
                  <Icon name="seat" size={16} />
                </div>
                <div className="reserve-item-info">
                  <div className="reserve-item-title">
                    {s.section_label || "Seat"} · {s.seat_number}
                  </div>
                  <div className="reserve-item-sub">
                    {locale === "km"
                      ? s.seat_class?.name_km
                      : s.seat_class?.name_en}
                  </div>
                </div>
                <div className="reserve-item-actions">
                  <span className="reserve-item-price">
                    {usd(s.price_usd_cents ?? s.seat_class?.price_usd_cents)}
                  </span>
                  {onRemoveItem && (
                    <button
                      type="button"
                      className="btn-item-remove"
                      onClick={() =>
                        onRemoveItem("seat", s.id || s.event_seat_id)
                      }
                      aria-label={locale === "km" ? "ដកកៅអីចេញ" : "Remove seat"}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {zoneLines.map((l) => (
              <div
                className="reserve-item-row"
                key={l.event_zone_id || l.zone?.id}
              >
                <div className="reserve-item-mark">
                  <Icon name="ticket" size={16} />
                </div>
                <div className="reserve-item-info">
                  <div className="reserve-item-title">
                    {(locale === "km" ? l.zone?.name_km : l.zone?.name_en) ||
                      l.zone?.name_en ||
                      l.zone?.name_km ||
                      "General Admission"}
                  </div>
                  <div className="reserve-item-sub">
                    {l.qty} × {usd(l.zone?.price_usd_cents)}
                  </div>
                </div>
                <div className="reserve-item-actions">
                  <span className="reserve-item-price">
                    {usd(
                      l.lineTotalCents ??
                        l.qty * (l.zone?.price_usd_cents || 0),
                    )}
                  </span>
                  {onRemoveItem && (
                    <button
                      type="button"
                      className="btn-item-remove"
                      onClick={() =>
                        onRemoveItem("zone", l.event_zone_id || l.zone?.id)
                      }
                      aria-label={
                        locale === "km" ? "ដកតំបន់ចេញ" : "Remove zone"
                      }
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Clean Receipt Breakdown */}
          <div className="reserve-breakdown">
            <div className="reserve-breakdown-row">
              <span className="reserve-breakdown-label">
                {locale === "km" ? "តម្លៃសំបុត្រ" : "Subtotal"} ({ticketLabel})
              </span>
              <span className="reserve-breakdown-val">
                {usd(subtotalUsdCents)}
              </span>
            </div>
            <div className="reserve-breakdown-divider" />
            <div className="reserve-breakdown-total">
              <span className="reserve-total-label">{t("total")}</span>
              <span className="reserve-total-val">{usd(subtotalUsdCents)}</span>
            </div>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="modal-footer reserve-modal-footer">
          {checkoutTo && (
            <Link className="btn-checkout-primary" to={checkoutTo}>
              <span>{t("goToCheckout")}</span>
              <Icon name="arrowRight" size={16} />
            </Link>
          )}

          <div className="reserve-footer-meta">
            {onRelease && (
              <button
                type="button"
                className="btn-release-link"
                onClick={onRelease}
              >
                <Icon name="trash" size={13} />
                <span>{t("releaseHold")}</span>
              </button>
            )}
            <span className="reserve-guarantee-note">
              <Icon name="lock" size={12} />
              <span>{t("notYoursYet")}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
