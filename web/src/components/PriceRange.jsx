import { useMemo } from "react";
import Icon from "./Icon.jsx";

/**
 * The price filter, with the catalogue's own distribution behind it.
 *
 * A bare pair of handles asks the visitor to guess: is $40 a lot here, or is
 * everything $40? The histogram answers that before they drag anything - where
 * the events actually cluster, and how much of the catalogue a given range
 * would cut away. It is the same reason the big travel sites draw one.
 *
 * Bars inside the selection carry the brand colour and the rest fade back, so
 * the range reads off the shape rather than off the two numbers below it.
 *
 * @param {number[]} prices  One entry per event in the current result set,
 *   in whole dollars, ignoring the price filter itself - otherwise dragging a
 *   handle would carve away the very bars that show what is being carved.
 */

/** Enough bars to show a shape, few enough to stay legible at ~320px. */
const BUCKETS = 28;

export default function PriceRange({
  min,
  max,
  step = 1,
  value,
  onChange,
  onReset,
  prices = [],
  lowLabel,
  highLabel,
  locale = "en",
}) {
  const [low, high] = value;
  const pct = (n) => ((n - min) / (max - min)) * 100;

  const bars = useMemo(() => {
    const counts = new Array(BUCKETS).fill(0);
    for (const p of prices) {
      if (!Number.isFinite(p)) continue;
      // Anything at or above the top of the track belongs to the last bucket -
      // the ceiling means "and up", so those events are not off the chart.
      const clamped = Math.min(Math.max(p, min), max);
      const i = Math.min(
        BUCKETS - 1,
        Math.floor(((clamped - min) / (max - min)) * BUCKETS),
      );
      counts[i] += 1;
    }
    const peak = Math.max(...counts, 1);
    return counts.map((n, i) => ({
      // A bucket with events never renders as nothing: a 1px stub says "some"
      // where a proportional height would round it away to "none".
      height: n === 0 ? 0 : Math.max(0.12, n / peak),
      from: min + ((max - min) * i) / BUCKETS,
      to: min + ((max - min) * (i + 1)) / BUCKETS,
      count: n,
    }));
  }, [prices, min, max]);

  const hasShape = prices.length > 0;

  return (
    <div className="pricerange">
      {hasShape && (
        <div className="pricerange-chart" aria-hidden="true">
          {bars.map((b, i) => {
            // A bar counts as selected when any part of its bucket is in range,
            // so the ends of the selection are never a half-lit bar.
            const inRange = b.to > low && b.from < high;
            return (
              <span
                key={i}
                className={`pricerange-bar${inRange ? " is-in" : ""}`}
                style={{ height: `${Math.round(b.height * 100)}%` }}
              />
            );
          })}
        </div>
      )}

      <div className="range pricerange-slider">
        <div className="range-track">
          <div
            className="range-fill"
            style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={lowLabel}
          onChange={(e) =>
            onChange([Math.min(Number(e.target.value), high), high])
          }
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={highLabel}
          onChange={(e) =>
            onChange([low, Math.max(Number(e.target.value), low)])
          }
        />
      </div>

      {/* The two ends spelled out. When filtered, the active chip and reset sit directly on this same line between 0 and 100+. */}
      <div className="pricerange-ends">
        <div className="pricerange-end">
          <output className="pricerange-value">${min}</output>
        </div>
        {low > min || high < max ? (
          <div className="pricerange-mid">
            <span className="filter-pill">
              <Icon name="wallet" size={12} />
              <span>
                ${low} –{" "}
                {high >= max ? (locale === "km" ? "ឡើងទៅ" : "any") : `$${high}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  onChange([min, max]);
                  onReset?.();
                }}
                aria-label={
                  locale === "km" ? "លុបតម្រងតម្លៃ" : "Remove price filter"
                }
              >
                <Icon name="close" size={11} strokeWidth={2.5} />
              </button>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost pricerange-reset-btn"
              onClick={() => {
                onChange([min, max]);
                onReset?.();
              }}
            >
              <Icon name="close" size={13} />
              {locale === "km" ? "កំណត់ឡើងវិញ" : "Reset"}
            </button>
          </div>
        ) : (
          <span className="pricerange-dash" aria-hidden="true" />
        )}
        <div className="pricerange-end">
          <output className="pricerange-value">${max}+</output>
        </div>
      </div>
    </div>
  );
}
