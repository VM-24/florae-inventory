import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigationType } from 'react-router-dom';

// Going back from an item page must land on the same spot of the list, not on top.
// Two pieces: the last loaded rows are kept in memory (so the list renders at full height
// at once, without a spinner) and the window scroll position is remembered per list URL.

const rowsCache = new Map<string, unknown>();
const scrollPositions = new Map<string, number>();

// Rows loaded for this exact list URL earlier in the session, if any.
export function cachedRows<T>(key: string): T | undefined {
  return rowsCache.get(key) as T | undefined;
}

export function cacheRows<T>(key: string, rows: T) {
  rowsCache.set(key, rows);
}

// Remembers the scroll of the list at `key`; after a "back" navigation (POP) restores it
// as soon as the rows are rendered (`ready`). A fresh visit (menu, link) starts at the top.
export function useScrollRestore(key: string, ready: boolean) {
  const navigationType = useNavigationType();
  const restored = useRef(false);

  useEffect(() => {
    const save = () => scrollPositions.set(key, window.scrollY);
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key]);

  useLayoutEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    const y = navigationType === 'POP' ? scrollPositions.get(key) : undefined;
    if (y) scrollToWhenTallEnough(y); else window.scrollTo(0, 0);
  }, [ready, key, navigationType]);
}

// The page may still grow right after the first render (e.g. on phones the table switches to
// taller cards once the breakpoint is measured), and the browser clamps a scroll beyond the end.
// Retry for a few frames until the position sticks.
function scrollToWhenTallEnough(y: number) {
  let frames = 0;
  const tick = () => {
    window.scrollTo(0, y);
    if (Math.abs(window.scrollY - y) > 2 && frames++ < 30) requestAnimationFrame(tick);
  };
  tick();
}

// For detail pages: open at the top when navigated to (PUSH/REPLACE); on "back" the list restores itself.
export function useScrollTopOnEnter() {
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// Opened from the list (state set by the list's row click) → breadcrumb acts as "back".
export const FROM_LIST = { fromList: true } as const;
export const cameFromList = (state: unknown) =>
  Boolean(state && typeof state === 'object' && (state as { fromList?: boolean }).fromList);
