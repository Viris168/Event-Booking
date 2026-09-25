import { useEffect, useState } from "react";
import Icon from "./Icon.jsx";
import { useLocale } from "../context/LocaleContext.jsx";
import { usd } from "../lib/format.js";

/**
 * The event page's buy bar, pinned to the bottom of a phone screen.
 *
 * Once .split stacks (<= 900px) the seat picker sits under the description,
 * the map and the venue layout, and the Reserve button under all of those -
 * two thousand pixels or so of scrolling before the page offers the one thing
 * it is for. This keeps the price and the next step in reach the whole way.
 *
 * It gets out of the way once the real controls are on screen: hidden when
 * the selection panel is visible (or scrolled past, so it never sits on the
 * footer), and hidden over the picker until something has been picked - a
 * "Choose seats" button on top of the seats is noise. Mid-pick, with the
 * picker in view and seats chosen, it shows the running subtotal and Reserve,
 * which is the moment a long seat map most needs it.
 *
 * Wider screens never see it: the selection panel is sticky beside the
 * content there, so the CSS hides this outright.
 */
export default function MobileBuyBar({
  pickerId,
  summaryId,
  fromCents,
  hasSelection,
  totalCents,
  reserving,
  onReserve,
}) {
  const { t, locale } = useLocale();
  const [pickerInView, setPickerInView] = useState(false);
  const [summaryReached, setSummaryReached] = useState(false);

  useEffect(() => {
    const picker = document.getElementById(pickerId);
    const summary = document.getElementById(summaryId);
    const pickerIo = new IntersectionObserver(([e]) =>
      setPickerInView(e.isIntersecting),
    );
    /* The panel only counts once it is well into the screen, not when its
       top edge peeks over the bottom - its Reserve button sits under the
       selected lines, and the bar should not leave before that is showing. */
    const summaryIo = new IntersectionObserver(
      ([e]) => setSummaryReached(e.isIntersecting || e.boundingClientRect.top < 0),
      { rootMargin: "0px 0px -40% 0px" },
    );
    if (picker) pickerIo.observe(picker);
    if (summary) summaryIo.observe(summary);
    return () => {
      pickerIo.disconnect();
      summaryIo.disconnect();
    };
  }, [pickerId, summaryId]);

  const visible = !summaryReached && (hasSelection || !pickerInView);

  function jumpToPicker() {
    document
      .getElementById(pickerId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`buybar${visible ? " is-visible" : ""}`} inert={!visible}>
      {(hasSelection || Number.isFinite(fromCents)) && (
        <div className="buybar-price">
          <span className="tiny">
            {hasSelection ? t("subtotal") : t("from_price")}
          </span>
          <b>{usd(hasSelection ? totalCents : fromCents)}</b>
        </div>
      )}
      {hasSelection ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={reserving}
          onClick={onReserve}
        >
          {reserving ? t("reserving") : `${t("reserve")} · 10:00`}
        </button>
      ) : (
        <button type="button" className="btn btn-primary" onClick={jumpToPicker}>
          {locale === "km" ? "ជ្រើសសំបុត្រ" : "Choose tickets"}
          <Icon name="arrowDown" size={15} />
        </button>
      )}
    </div>
  );
}
