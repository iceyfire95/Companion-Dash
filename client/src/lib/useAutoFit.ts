import { useEffect, useRef } from 'react';

/**
 * Auto-fit text to the bounds of its outer container.
 *
 * Behavior:
 *  - Binary-searches for the largest integer font-size where the inner
 *    element's scrollWidth/scrollHeight still fit inside the outer element's
 *    clientWidth/clientHeight.
 *  - Hard caps at MAX_PX so very large panels don't go absurd.
 *  - Hard floors at MIN_PX so text never becomes unreadable.
 *  - The `baseFontSize` prop is no longer a cap; it is only used as a
 *    seed/hint. Text grows past it when the panel is large.
 *  - Re-runs on baseFontSize change, content change, and ResizeObserver fires.
 */
export function useAutoFit(
  baseFontSize: number,
  deps: ReadonlyArray<unknown>
): { outerRef: React.RefObject<HTMLDivElement>; innerRef: React.RefObject<HTMLDivElement> } {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    // baseFontSize acts as a floor: text never shrinks below this unless
    // the container is too small to contain any text at that size, in which
    // case we fall back to MIN_PX. Text grows freely up to MAX_PX.
    const FLOOR = Math.max(6, Math.floor(baseFontSize));
    const MIN_PX = 6;
    const MAX_PX = 512;

    let raf = 0;
    const fit = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const maxW = outer.clientWidth;
        const maxH = outer.clientHeight;
        if (maxW <= 0 || maxH <= 0) return;

        const fits = (px: number): boolean => {
          inner.style.fontSize = `${px}px`;
          return inner.scrollWidth <= maxW && inner.scrollHeight <= maxH;
        };

        // If empty content, just use floor.
        const text = inner.textContent ?? '';
        if (text.trim().length === 0) {
          inner.style.fontSize = `${FLOOR}px`;
          return;
        }

        // Binary search over [FLOOR, MAX_PX] for the largest fitting size.
        let lo = FLOOR;
        let hi = MAX_PX;
        let best = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (fits(mid)) { best = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        if (best >= FLOOR) {
          inner.style.fontSize = `${best}px`;
          return;
        }
        // Even FLOOR didn't fit. Search [MIN_PX, FLOOR-1] for the largest
        // that does fit. This is the "shrink-only" fallback for tiny cells.
        lo = MIN_PX; hi = FLOOR - 1; best = MIN_PX;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (fits(mid)) { best = mid; lo = mid + 1; }
          else { hi = mid - 1; }
        }
        inner.style.fontSize = `${best}px`;
      });
    };

    fit();
    const roOuter = new ResizeObserver(fit);
    roOuter.observe(outer);
    // Also observe inner — content changes (text resolved from variables) shift size.
    const roInner = new ResizeObserver(fit);
    roInner.observe(inner);
    return () => {
      roOuter.disconnect();
      roInner.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFontSize, ...deps]);

  return { outerRef, innerRef };
}
