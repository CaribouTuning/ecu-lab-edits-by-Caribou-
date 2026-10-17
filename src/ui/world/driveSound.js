/**
 * The sound of the car you are driving: the same physical exhaust-pulse model the LIVE
 * and DRAG screens use, fed from the world's own engine speed and throttle.
 */

import {
  createEngineAudio, setEngineAudioActive, shiftEngineAudio, silenceEngineAudio, updateEngineAudio,
} from '../audio/engineAudio.js';

/** @type {any} */
let audio = null;

/** Make the audio graph on first use (it has to start from a tap or key press). */
export function ensureDriveAudio() {
  if (audio) return audio;
  const Ctx = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx) return null;
  try { audio = createEngineAudio(new Ctx()); } catch { audio = null; }
  return audio;
}

/**
 * One frame of sound.
 * @param {{soundFrame: (rpm: number, load: number, cut: boolean) => any}} setup
 * @param {{rpm: number, throttle: number, limiter: boolean, gear: number}} t telemetry
 * @param {{on: boolean, volume?: number}} o
 * @param {{gear: number}} mem remembers the last gear, to hear a shift
 */
export function driveSoundFrame(setup, t, o, mem) {
  const a = ensureDriveAudio();
  if (!a) return;
  if (!o.on) { setEngineAudioActive(a, false); return; }
  setEngineAudioActive(a, true);
  const frame = setup.soundFrame(Math.max(900, t.rpm), t.throttle, t.limiter);
  frame.volume = o.volume ?? 0.8;
  updateEngineAudio(a, frame);
  if (t.gear > mem.gear && mem.gear > 0) shiftEngineAudio(a, { automatic: false });
  mem.gear = t.gear;
}

export function silenceDriveSound() {
  if (audio) { silenceEngineAudio(audio); setEngineAudioActive(audio, false); }
}
