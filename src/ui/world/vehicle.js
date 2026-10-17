/**
 * From a built and tuned car to something the world can drive.
 *
 * The engine is measured the way the dyno measures it: a full pull on the simulator with
 * the car's own hardware and calibration. That pull's torque curve is what pushes the car
 * (driving.js), its measured points say whether it is knocking or running lean at the revs
 * you are holding, and its power curve feeds the dash. So a bad tune is something you feel,
 * hear and see warning lights for, not just a number on a ticket.
 */

import {
  CAR_BODIES, COMPRESSOR_OPTS, DEFAULT_CAR, EXHAUST_DIA_OPTS, acousticDrive, exhaustGeometry, simulateSweep, torqueCurveFromSweep,
} from '../../sim/index.js';
import { makeInitialState } from '../state/initialState.js';
import { pullInputs } from '../state/pullInputs.js';

import { powertrainOf } from './driving.js';

/**
 * Weight, shape and layout of each body the world draws, in the same terms as the strip's
 * CAR_BODIES, which it borrows where a body exists there. A hatchback and a wagon are not
 * on the strip, so they get honest figures of their own.
 */
const EXTRA_BODIES = {
  hatch: { massKg: 1280, cd: 0.32, frontalAreaM2: 2.1, cgHeightM: 0.52, wheelbaseM: 2.62, rearFrac: 0.40 },
  wagon: { massKg: 1650, cd: 0.31, frontalAreaM2: 2.3, cgHeightM: 0.57, wheelbaseM: 2.9, rearFrac: 0.46 },
  muscle: { massKg: 1700, cd: 0.34, frontalAreaM2: 2.1, cgHeightM: 0.52, wheelbaseM: 2.75, rearFrac: 0.48 },
  suv: { massKg: 1950, cd: 0.36, frontalAreaM2: 2.9, cgHeightM: 0.68, wheelbaseM: 2.95, rearFrac: 0.45 },
  kei: { massKg: 850, cd: 0.36, frontalAreaM2: 2.0, cgHeightM: 0.55, wheelbaseM: 2.2, rearFrac: 0.42 },
  roadster: { massKg: 1150, cd: 0.34, frontalAreaM2: 1.9, cgHeightM: 0.46, wheelbaseM: 2.4, rearFrac: 0.5 },
};
const FROM_STRIP = { coupe: 0, supercar: 1, sedan: 2, van: 3, pickup: 4 };

/**
 * The strip's description of a car, for a body the world draws.
 * @param {string} body a models/car.js body key
 * @param {Partial<import('../../sim/index.js').DragCar>} [over] changes to gearing, tyres and so on
 * @returns {import('../../sim/index.js').DragCar}
 */
export function dragCarFor(body, over = {}) {
  const i = FROM_STRIP[body];
  const b = i != null ? CAR_BODIES[i] : EXTRA_BODIES[body] ?? CAR_BODIES[0];
  return {
    ...DEFAULT_CAR,
    bodyIdx: i ?? 0,
    massKg: b.massKg, cd: b.cd, frontalAreaM2: b.frontalAreaM2, cgHeightM: b.cgHeightM, wheelbaseM: b.wheelbaseM, rearFrac: b.rearFrac,
    ...over,
  };
}

/**
 * @typedef {object} DriveSetup
 * @property {import('./driving.js').Powertrain} pt
 * @property {import('../../sim/index.js').DragCar} car
 * @property {number} peakHp
 * @property {number} peakTq
 * @property {number} redline
 * @property {(rpm: number) => any} pointAt the measured full-throttle point nearest an engine speed
 * @property {(rpm: number, throttle: number) => number} boostAt psi
 * @property {(rpm: number) => number} hpAt
 * @property {(rpm: number, load: number, cut: boolean) => object} soundFrame for engineAudio
 * @property {object} result the dyno pull
 */

const cache = new Map();

/** A signature for the hardware and calibration, so the same car is measured once. @param {any} build @param {any} tune */
function signature(build, tune, body, over) {
  return JSON.stringify([build, tune.ve, tune.timing, tune.afr, tune.ecu ? JSON.stringify(tune.ecu).length : 0, tune.layout, body, over ?? null]);
}

/**
 * Measure a car and set it up to drive.
 *
 * @param {{build: any, tune: any}} car the car as it stands on the lift or in the garage
 * @param {{body: string, drag?: Partial<import('../../sim/index.js').DragCar>}} opts
 * @returns {DriveSetup}
 */
export function driveSetup(car, { body, drag }) {
  const key = signature(car.build, car.tune, body, drag);
  const hit = cache.get(key);
  if (hit) return hit;
  const base = makeInitialState();
  const state = { ...base, build: car.build, tune: car.tune };
  const inputs = pullInputs(state);
  const result = simulateSweep(inputs.args);
  const torque = torqueCurveFromSweep(result);
  const d = inputs.derived;
  const dragCar = dragCarFor(body, drag);
  const redline = d.redline ?? 7000;
  const peak = result.points.reduce((a, p) => (p.hp > a.hp ? p : a), result.points[0]);
  const pt = powertrainOf(dragCar, torque, redline, { displacementL: d.displacementL, peakHpRpm: peak.rpm });
  const pts = result.points;
  const pointAt = (rpm) => {
    let best = pts[0];
    let bd = Infinity;
    for (const p of pts) { const dd = Math.abs(p.rpm - rpm); if (dd < bd) { bd = dd; best = p; } }
    return best;
  };
  const b = car.build;
  const cfg = b.engineConfig;
  const setup = {
    pt, car: dragCar, peakHp: result.peakHp, peakTq: result.peakTq, redline, result,
    pointAt,
    hpAt: (rpm) => pointAt(rpm).hp,
    boostAt: (rpm, thr) => (b.turboOn || b.blowerId ? pointAt(rpm).boostPsi * Math.max(0, Math.min(1, thr)) : 0),
    derived: d,
    soundFrame: (rpm, load, cut) => {
      const point = pointAt(rpm);
      const drive = acousticDrive({
        rpm, derived: d, point, turboOn: !!b.turboOn, compressor: COMPRESSOR_OPTS[b.compressorIdx], throttle: load, fuelCut: cut,
      });
      return {
        drive,
        geometry: exhaustGeometry({
          displacementL: d.displacementL, cyl: d.cyl, bore: cfg.bore, compression: cfg.compression, configuration: cfg.configuration,
          pipeDiaIn: EXHAUST_DIA_OPTS[b.exhaustDiaIdx].dia, gasTempK: drive.gasTempK, headers: !!b.mods?.headers, turboFitted: !!b.turboOn,
        }),
        rpm, configuration: cfg.configuration, load, audible: true, cut, cranking: false,
        openExhaust: !!(b.mods?.exhaust || b.mods?.headers), intakeFitted: !!b.mods?.intake,
        boostPsi: b.turboOn ? point.boostPsi * load : 0, volume: 1,
      };
    },
  };
  if (cache.size > 12) cache.delete(cache.keys().next().value);
  cache.set(key, setup);
  return setup;
}
