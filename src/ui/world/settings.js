/**
 * The world's own settings: how big the pixels are, units, sound. Kept per device, in
 * localStorage, and never required: the world draws fine if storage is blocked.
 */

const KEY = 'ecu-lab-world-settings';

/** @typedef {{quality: 'chunky'|'normal'|'fine', units: 'mph'|'kph', sound: boolean, touch: 'auto'|'on'|'off', shake: boolean, hints: boolean, view: '3d'|'flat'}} WorldSettings */

/** @type {WorldSettings} */
export const DEFAULT_SETTINGS = { quality: 'normal', units: 'mph', sound: true, touch: 'auto', shake: true, hints: true, view: '3d' };

/** Camera shake starts off for anyone who asked their device for less motion. @returns {WorldSettings} */
function defaults() {
  let calm = false;
  try { calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media queries */ }
  return { ...DEFAULT_SETTINGS, shake: !calm };
}

/** @returns {WorldSettings} */
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && typeof raw === 'object') return { ...defaults(), ...raw };
  } catch { /* storage blocked or corrupt: use the defaults */ }
  return defaults();
}

/** @param {WorldSettings} s */
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* not worth stopping for */ }
}
