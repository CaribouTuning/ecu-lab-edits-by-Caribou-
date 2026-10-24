/**
 * Racing in the town: the rivals drive the same car model you do, on the town's own roads,
 * and the clocks count what really happened.
 */

import { describe, expect, it } from 'vitest';

import { RIVALS, TRACK_RIVALS, rivalState } from '../src/ui/career/races.js';
import { engineState } from '../src/ui/career/engines.js';
import { STEP_S, makeVehicle, stepVehicle, tyreMu } from '../src/ui/world/driving.js';
import { CIRCUIT, STRIP, surfaceAt } from '../src/ui/world/levels/townPlan.js';
import { aiDrive, dragDrive, makeDragClock, makeLapCounter, speedProfile } from '../src/ui/world/race.js';
import { driveSetup } from '../src/ui/world/vehicle.js';

const setupOf = (r) => driveSetup(rivalState(r), { body: r.body, drag: r.drag });

/** Drive a rival round the circuit; returns the lap times and the worst moment off the road. */
function lapIt(r, laps = 2, skill = r.skill) {
  const set = setupOf(r);
  const path = CIRCUIT.path;
  const prof = speedProfile(path, tyreMu(set.pt), skill);
  const start = path.at(CIRCUIT.startS - 10);
  const st = makeVehicle({ x: start.x, z: start.z, heading: start.heading });
  const prog = { s: CIRCUIT.startS - 10 };
  const lc = makeLapCounter(path, CIRCUIT.startS);
  let t = 0;
  let worst = 0;
  let k = 0;
  while (lc.lap < laps && t < 400) {
    const surf = surfaceAt(st.x, st.z);
    const inp = aiDrive(st, set.pt, path, prof, prog, surf.grip);
    stepVehicle(st, set.pt, { ...inp, tc: true, gripScale: surf.grip, rollScale: surf.roll });
    t += STEP_S;
    if ((k += 1) % 12 === 0) { lc.update(st.x, st.z, t, CIRCUIT.width); worst = Math.max(worst, path.project(st.x, st.z, prog.s).off); }
  }
  return { laps: lc.laps, worst, t };
}

describe('rivals on the circuit', () => {
  it('drive the whole lap on the tarmac, every lap, and count only full laps', () => {
    const r = lapIt(TRACK_RIVALS[0]);
    expect(r.laps.length).toBe(2);
    expect(r.worst).toBeLessThan(CIRCUIT.width / 2 + 1);
    // A kilometre of corners: well over half a minute, well under two.
    for (const l of r.laps) { expect(l).toBeGreaterThan(30); expect(l).toBeLessThan(120); }
  }, 60000);

  it('lap quicker as the ladder climbs: a better car and a braver driver', () => {
    const first = lapIt(TRACK_RIVALS[0], 1).laps[0];
    const last = lapIt(TRACK_RIVALS[TRACK_RIVALS.length - 1], 1).laps[0];
    expect(last).toBeLessThan(first * 0.85);
  }, 60000);

  it('are slower with less nerve in the same car', () => {
    const brave = lapIt(TRACK_RIVALS[2], 1, 0.95).laps[0];
    const timid = lapIt(TRACK_RIVALS[2], 1, 0.7).laps[0];
    expect(timid).toBeGreaterThan(brave);
  }, 60000);
});

describe('rivals on the strip', () => {
  /** A rival's pass on the town's strip, on the world's car model. */
  function pass(r, rt = 0) {
    const set = setupOf(r);
    const half = 2.2;
    const st = makeVehicle({ x: STRIP.startX - half, z: STRIP.lanes.rival, heading: Math.PI / 2 });
    const clock = makeDragClock(STRIP.startX, STRIP.finishX, half);
    clock.green = 0;
    let t = 0;
    while (!clock.done && t < 40) {
      stepVehicle(st, set.pt, { ...dragDrive(st, set.pt, STRIP.lanes.rival, t >= rt), tc: true });
      t += STEP_S;
      clock.update(st.x, st.vx, t, st);
    }
    return { clock, st, set };
  }

  it('run straight down their lane, and the world’s ET is within reach of the strip model’s', () => {
    for (const r of [RIVALS[0], RIVALS[4], RIVALS[RIVALS.length - 1]]) {
      const { clock, st, set } = pass(r);
      expect(clock.done).toBe(true);
      expect(Math.abs(st.z - STRIP.lanes.rival)).toBeLessThan(1.2);
      const strip = set.strip().et;
      expect(clock.et).toBeGreaterThan(strip * 0.9);
      expect(clock.et).toBeLessThan(strip * 1.2);
    }
  }, 60000);

  it('times reaction from the green and calls a red light on a car that leaves early', () => {
    const { clock } = pass(RIVALS[1], 0.3);
    expect(clock.rt).toBeGreaterThan(0.29);
    expect(clock.foul).toBe(false);
    expect(clock.total()).toBeCloseTo(clock.rt + clock.et, 6);
    const early = makeDragClock(0, 402, 2);
    early.green = 1;
    early.update(-1.5, 2, 0.5);
    expect(early.foul).toBe(true);
  });

  it('the starter car beats the first rung and not the second: the ladder starts where you do', () => {
    const st = engineState('i4-16');
    const mine = driveSetup({ build: { ...st.build, mafScalar: 1.06 }, tune: st.tune }, { body: 'hatch' }).strip().et;
    expect(mine).toBeLessThan(setupOf(RIVALS[0]).strip().et);
    expect(mine).toBeGreaterThan(setupOf(RIVALS[1]).strip().et);
  }, 60000);
});

describe('the town’s roads', () => {
  it('put the strip and the whole circuit on tarmac, and grass between them', () => {
    expect(surfaceAt(STRIP.startX + 100, STRIP.lanes.player).kind).toBe('strip');
    for (let s = 0; s < CIRCUIT.path.length; s += 25) { const p = CIRCUIT.path.at(s); expect(surfaceAt(p.x, p.z).kind).toBe('track'); }
    expect(surfaceAt(-120, 30).kind).toBe('grass');
    expect(surfaceAt(0, 0).kind).toBe('road');
  });
});
