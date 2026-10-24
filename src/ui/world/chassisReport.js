/**
 * What a chassis setup does, measured on the vehicle model: the most sideways grip the car
 * finds on a skidpad, which end lets go first at that limit, and how far it takes to stop from
 * highway speed. Plain numbers, so the tuning panel can show them and a test can hold them.
 */

import { G, tireRadiusM } from '../../sim/index.js';

import { STEP_S, makeVehicle, stepVehicle } from './driving.js';

/**
 * @param {import('./driving.js').Powertrain} pt
 * @returns {{skidpadG: number, balance: 'understeer'|'neutral'|'oversteer', bias: number, brakeM: number}}
 */
export function chassisReport(pt) {
  const r = tireRadiusM(pt.car);
  // A steady turn: wind the steering on slowly at 18 m/s and keep the best sideways grip.
  const v = makeVehicle();
  v.vx = 18;
  v.wR = v.wF = 18 / r;
  v.gear = 3;
  let peak = 0;
  let fAtPeak = 0;
  let rAtPeak = 0;
  // Grip is read over a quarter of a second, as a g-meter would show it: the instant-to-instant
  // ripple (traction control cutting sparks, the tyres settling) is not grip.
  let ayAvg = 0;
  const k = STEP_S / 0.25;
  for (let t = 0; t < 7; t += STEP_S) {
    stepVehicle(v, pt, { throttle: v.vx < 18 ? 0.5 : 0.12, brake: 0, steer: -Math.min(1, t / 6) });
    ayAvg += (Math.abs(v.ay) - ayAvg) * k;
    if (t > 1 && ayAvg > peak) { peak = ayAvg; fAtPeak = v.slipF; rAtPeak = v.slipR; }
  }
  const bias = (fAtPeak - rAtPeak) / Math.max(0.01, fAtPeak + rAtPeak);
  // Stopping from 100 km/h in a straight line.
  const b = makeVehicle();
  b.vx = 100 / 3.6;
  b.wR = b.wF = b.vx / r;
  b.gear = 4;
  for (let t = 0; t < 12 && b.vx > 0.2; t += STEP_S) stepVehicle(b, pt, { throttle: 0, brake: 1, steer: 0 });
  return { skidpadG: peak / G, balance: bias > 0.12 ? 'understeer' : bias < -0.12 ? 'oversteer' : 'neutral', bias, brakeM: b.z };
}
