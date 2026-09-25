import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Animate a number toward `target` whenever it changes.
 *
 * <p>Counts from wherever the display currently is, not from zero, so a value
 * that arrives in two steps (provinces, then events) climbs once to each
 * rather than resetting between them. Ease-out, so the digits settle rather
 * than stop dead.
 *
 * <p>Under prefers-reduced-motion it returns `target` untouched - the number
 * is the content, and a reader who asked for less motion still gets it on
 * the first frame.
 */
export function useCountUp(target, duration = 900) {
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const from = shownRef.current;
    if (from === target) return undefined;

    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (target - from) * eased);
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return prefersReducedMotion() ? target : shown;
}
