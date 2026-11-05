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

let hardwareGl = /** @type {boolean|null} */ (null);

/**
 * Whether this machine draws WebGL in hardware: asked once, of a scratch canvas, with
 * `failIfMajorPerformanceCaveat`, which a software renderer (hardware acceleration off, a
 * blocklisted GPU) refuses. Every 3D view checks it before building a scene: drawn in
 * software, even the small engine views held the page for seconds at a time.
 * @returns {boolean}
 */
export function hasHardwareGl() {
  if (hardwareGl != null) return hardwareGl;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      ?? c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    hardwareGl = !!gl;
    /** @type {any} */ (gl)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    hardwareGl = false;
  }
  return hardwareGl;
}
