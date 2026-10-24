/**
 * Small interface sounds: a blip for a tap, a chime for good news, a low buzz for bad.
 * Plain oscillators with a quick envelope, made on first use (a browser only lets audio
 * start from a tap or key press) and silent wherever there is no Web Audio.
 */

/** @type {AudioContext|null} */
let ctx = null;

function context() {
  if (ctx) return ctx;
  const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx) return null;
  try { ctx = new Ctx(); } catch { ctx = null; }
  return ctx;
}

/**
 * @param {AudioContext} a
 * @param {number} freq Hz
 * @param {number} at seconds from now
 * @param {number} len seconds
 * @param {OscillatorType} type
 * @param {number} gain
 */
function note(a, freq, at, len, type, gain) {
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.02);
}

/** Notes (Hz, start, length, wave, gain) for each sound.
 * @type {Record<string, [number, number, number, OscillatorType, number][]>} */
const SOUNDS = {
  tap: [[660, 0, 0.06, 'square', 0.04]],
  ok: [[523, 0, 0.1, 'triangle', 0.09], [784, 0.09, 0.16, 'triangle', 0.09]],
  cash: [[988, 0, 0.07, 'square', 0.05], [1319, 0.07, 0.2, 'square', 0.05]],
  warn: [[196, 0, 0.18, 'sawtooth', 0.05], [147, 0.12, 0.22, 'sawtooth', 0.05]],
  door: [[110, 0, 0.12, 'triangle', 0.12], [82, 0.05, 0.16, 'triangle', 0.1]],
  win: [[523, 0, 0.12, 'triangle', 0.09], [659, 0.1, 0.12, 'triangle', 0.09], [784, 0.2, 0.12, 'triangle', 0.09], [1047, 0.3, 0.3, 'triangle', 0.1]],
};

/**
 * @param {string} name
 * @param {boolean} [on] false mutes it
 */
export function sfx(name, on = true) {
  if (!on) return;
  const a = context();
  if (!a) return;
  try {
    if (a.state === 'suspended') a.resume();
    for (const [f, at, len, type, gain] of SOUNDS[name] ?? SOUNDS.tap) note(a, f, at, len, type, gain);
  } catch { /* a sound is never worth a crash */ }
}

/** Which sound a toast of a given tone gets. @param {string|undefined} tone */
export function toastSound(tone) {
  return tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : 'tap';
}
