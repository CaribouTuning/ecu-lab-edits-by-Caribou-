/** The height of the page a viewer can actually see, as the CSS variable `--app-h`. */

/** An iPhone's home-indicator inset, in CSS px (Apple HIG: 34 pt upright, 21 pt on its side). */
const HOME_INDICATOR_PX = { portrait: 34, landscape: 21 };

/**
 * The part of the frame's foot a host draws over: embedded on an iPhone with a home indicator,
 * the frame runs to the screen's foot and the host's own bar covers the inset there. Nothing
 * inside the frame can see that bar (an IntersectionObserver sees clipping, not covering), and
 * `env(safe-area-inset-bottom)` is zero inside a frame, so it is reckoned from the device.
 * @param {{embedded: boolean, ios: boolean, screenW: number, screenH: number, upright: boolean, visibleH: number}} d
 *   `screenW`/`screenH` as iOS gives them (the same either way up); `upright` from the window;
 *   `visibleH` how tall the frame shows, in CSS px
 * @returns {number} px to keep clear at the foot
 */
export function coveredFoot({ embedded, ios, screenW, screenH, upright, visibleH }) {
  if (!embedded || !ios) return 0;
  const longSide = Math.max(screenW, screenH);
  // Every iPhone with a home indicator is at least 812 pt tall; those with a button are shorter.
  if (longSide < 812) return 0;
  const inset = upright ? HOME_INDICATOR_PX.portrait : HOME_INDICATOR_PX.landscape;
  // Only a frame that reaches the screen's foot is covered there: one that ends above a host's
  // toolbar is shorter than the screen by more than a header's height.
  const screenTall = upright ? longSide : Math.min(screenW, screenH);
  return visibleH > screenTall - 160 ? inset : 0;
}

/** @returns {boolean} an iPhone or iPad, whatever the browser says it is */
function isIos() {
  const n = typeof navigator === 'undefined' ? null : navigator;
  if (!n) return false;
  return /iPhone|iPad|iPod/.test(n.userAgent) || (n.platform === 'MacIntel' && (n.maxTouchPoints ?? 0) > 1);
}

/** @returns {boolean} the device held upright: its own report where it gives one, else the window's shape */
function isUpright() {
  const type = window.screen?.orientation?.type;
  if (typeof type === 'string') return type.startsWith('portrait');
  const deg = /** @type {any} */ (window).orientation;
  if (typeof deg === 'number') return deg === 0 || deg === 180;
  return window.innerHeight >= window.innerWidth;
}

/** @returns {boolean} drawn inside another page's frame */
function isEmbedded() {
  try { return window.self !== window.top; } catch { return true; }
}

export function trackVisibleHeight() {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') return;
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100%;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(probe);
  const thresholds = Array.from({ length: 201 }, (_, i) => i / 200);
  const embedded = isEmbedded();
  const ios = isIos();
  const apply = (entry) => {
    const full = window.innerHeight;
    // Only a real cut counts: under a few pixels is rounding, and nothing visible at all
    // (the frame scrolled off, or not laid out yet) says nothing about its height.
    const cut = entry.isIntersecting && full - entry.intersectionRect.bottom > 4 && entry.intersectionRect.bottom > full * 0.4;
    const shown = cut ? entry.intersectionRect.bottom : full;
    const foot = coveredFoot({ embedded, ios, screenW: window.screen?.width ?? 0, screenH: window.screen?.height ?? 0, upright: isUpright(), visibleH: shown });
    if (cut || foot) root.style.setProperty('--app-h', `${Math.floor(shown - foot)}px`);
    else root.style.removeProperty('--app-h');
  };
  let io = null;
  const observe = () => {
    io?.disconnect();
    io = new window.IntersectionObserver((entries) => apply(entries[entries.length - 1]), { threshold: thresholds });
    io.observe(probe);
  };
  observe();
  // A new frame size or orientation starts the measurement again (observe reports at once).
  window.addEventListener('resize', observe);
}
