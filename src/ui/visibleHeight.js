/** The height of the page a viewer can actually see, as the CSS variable `--app-h`. */
export function trackVisibleHeight() {
  if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') return;
  const root = document.documentElement;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:100%;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(probe);
  const thresholds = Array.from({ length: 201 }, (_, i) => i / 200);
  const apply = (entry) => {
    const full = window.innerHeight;
    const bottom = entry.isIntersecting ? entry.intersectionRect.bottom : full;
    // Only a real cut counts: under a few pixels is rounding, and nothing visible at all
    // (the frame scrolled off, or not laid out yet) says nothing about its height.
    if (entry.isIntersecting && full - bottom > 4 && bottom > full * 0.4) {
      root.style.setProperty('--app-h', `${Math.floor(bottom)}px`);
    } else {
      root.style.removeProperty('--app-h');
    }
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
