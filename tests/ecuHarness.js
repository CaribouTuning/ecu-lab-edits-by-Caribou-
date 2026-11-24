/**
 * Builds engines for the ECU tests exactly the way the app does (EcuLab.jsx), and runs
 * the live engine through a throttle schedule.
 *
 * The assembly itself is `buildRig` in src/sim/rig.js, shared with the Discord bot.
 * `makeEngine` is kept as its name here so the tests read as they always have.
 */

import * as S from '../src/sim/index.js';

/** See `buildRig` in src/sim/rig.js. */
export const makeEngine = S.buildRig;

/**
 * A pull whose first point sits at a manifold pressure: the throttle opening that holds it
 * there, found by bisection. A pull's load is a throttle opening (it stays where it is put, so
 * the pressure falls as the speed rises); a test written for "a pull at 25 kPa" means this.
 *
 * @param {ReturnType<typeof makeEngine>} eng
 * @param {number} kpa the manifold pressure wanted at the first point
 */
export function pullAtKpa(eng, kpa) {
  let lo = 0.5; let hi = 100;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) / 2;
    if (eng.pull(mid).points[0].map < kpa) lo = mid; else hi = mid;
  }
  return eng.pull((lo + hi) / 2);
}

/**
 * Runs the live engine through a throttle schedule, returning every step's log row.
 * @param {ReturnType<typeof makeEngine>} eng
 * @param {object} opts
 * @param {number} opts.seconds
 * @param {(t: number) => number} [opts.pedal] throttle, percent, against time
 * @param {number} [opts.coolantC] starting coolant and oil temperature
 * @param {object} [opts.aux] cockpit switches (lights, A/C, nitrous arming)
 * @param {object} [opts.from] a state to continue from
 * @param {number} [opts.holdRpm] a brake that holds the engine near this speed under
 *   throttle, the way a load-bearing dyno or a car in gear does; without it the engine
 *   free-revs
 */
export function runLive(eng, { seconds, pedal = () => 0, coolantC = 85, aux = {}, from, holdRpm }) {
  const cfg = eng.liveCfg(aux);
  let s = from ?? { ...S.makeLiveState(), cranking: true, coolantC, oilC: coolantC };
  const rows = [];
  let integ = 0;
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    const t = i * 0.05;
    let load = 0;
    if (holdRpm && pedal(t) > 3) {
      const err = s.rpm - holdRpm;
      integ = Math.max(0, integ + err * 0.05);
      load = Math.max(0, 0.4 * err + 0.3 * integ);
    }
    s = S.liveStep(s, 0.05, { throttle: pedal(t), load }, cfg);
    rows.push({ ...s.ecu.log[s.ecu.log.length - 1], running: s.running, protect: s.ecu.protect });
  }
  return { state: s, rows };
}

/** Point of a pull at an RPM. */
export const at = (pull, rpm) => pull.points.find((p) => p.rpm === rpm);
