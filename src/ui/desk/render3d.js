/**
 * Whether the 3D shop is drawn at all. A player can turn it off (the shop becomes the flat
 * list of places), and it turns itself off for good on a machine that could not draw it:
 * a shader that would not compile. No WebGL, a software renderer (hardware acceleration off)
 * or a lost context show the flat shop for that visit. Kept in this browser only; a private window just asks again.
 */

const KEY = 'ecu-lab:3d';

/** @returns {'on'|'off'|'force'} what the player or a failed start chose; 'force' skips the software-renderer check */
export function read3d() {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'off' || v === 'force' ? v : 'on';
  } catch { return 'on'; }
}

/** @param {'on'|'off'|'force'} v */
export function write3d(v) {
  try {
    if (v === 'on') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, v);
  } catch { /* private window: it is just for this visit */ }
}
