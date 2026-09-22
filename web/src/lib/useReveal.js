import { useEffect, useRef } from "react";

/**
 * Reveal an element the first time it is scrolled into view.
 *
 * <p>The hook only ever sets a data attribute - `armed` once it is watching,
 * `in` when the element has been seen - and every visual consequence of that
 * lives in CSS. Nothing here knows what the animation is.
 *
 * <p>Three things this deliberately gets right, because the usual version of
 * this hook gets them wrong:
 *
 * <ul>
 *   <li><b>It cannot hide content permanently.</b> The hidden state is written
 *       by the hook at runtime, never by the stylesheet's resting rules, so a
 *       page whose JavaScript failed to run, or that is being read by a
 *       crawler, shows every section. A CSS-first version of this pattern
 *       ships a blank page whenever the observer does not fire.
 *   <li><b>It gives up rather than hiding.</b> If the observer somehow never
 *       fires - a zero-height element, a scroll container it cannot see out of
 *       - the timeout reveals everything anyway.
 *   <li><b>It arms after the first paint.</b> useEffect runs once the element
 *       is already laid out, and only content below the fold is still
 *       unrevealed by then, so arming it is invisible. Anything already on
 *       screen intersects immediately and reveals on the same frame.
 * </ul>
 *
 * <p>Honouring prefers-reduced-motion is CSS's half of the deal: the armed
 * state is only given an opacity under `no-preference`, so a reader who has
 * asked for less motion never has anything hidden from them in the first
 * place.
 */
export function useReveal({ threshold = 0.15, rootMargin = "0px 0px -10% 0px" } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    // No observer (older browser, SSR-ish environment): leave the element in
    // its resting, visible state rather than arming something we cannot undo.
    if (typeof IntersectionObserver === "undefined") return undefined;

    const show = () => {
      el.dataset.reveal = "in";
    };

    el.dataset.reveal = "armed";
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          show();
          io.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    io.observe(el);

    // Safety net - see the class comment. Long enough that it never pre-empts
    // a real scroll, short enough that a stuck section is not stuck for long.
    const bail = setTimeout(show, 2500);

    return () => {
      clearTimeout(bail);
      io.disconnect();
    };
  }, [threshold, rootMargin]);

  return ref;
}
