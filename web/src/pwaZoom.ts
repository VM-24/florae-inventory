// Disables zoom when the app runs installed (PWA, standalone window). In a normal browser
// tab zoom stays available — it is an accessibility feature.
//
// Three layers, because no single one works everywhere:
//   1. viewport meta maximum-scale=1 / user-scalable=no — Android Chrome;
//   2. CSS touch-action: pan-x pan-y on <html> — blocks pinch and double-tap zoom in Chrome/Edge;
//   3. iOS Safari ignores both since iOS 10, so its pinch gestures are cancelled in JS.
// Input-focus zoom on iOS is avoided separately: inputs use 16px font on touch screens (styles.css).

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function disableZoomInStandalone(): void {
  if (!isStandalone()) return;

  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport) {
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }
  document.documentElement.classList.add('pwa-standalone');

  const prevent = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, prevent, { passive: false });
  }
  // Two fingers moving = pinch.
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
}
