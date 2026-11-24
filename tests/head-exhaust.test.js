/**
 * The head, cam card and exhaust as parts a player sets: each optional figure, typed in at
 * the value the model already uses, changes nothing; set past it, each pulls the way it does
 * on a real engine. And a cam phaser moves only its own lobe.
 */
import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';

const base = S.applyPreset(S.presetById('vq35de-revup')).engineConfig;
const RPMS = [2000, 3500, 5000, 6500];
/** A full set of bolt-ons, the stock ones unless named. @param {object} [m] */
const M = (m = {}) => ({ ...S.DEFAULT_MODS, ...m });
const veRow = (cfg, mods = {}, kpa = 100) => {
  const at = S.hardwareVeAt(cfg, M(mods), { exhaustDia: 3.0 });
  return RPMS.map((r) => at(r, kpa));
};

describe('the defaults are the model itself', () => {
  it('typing in the figure the model already uses changes no cell', () => {
    const d = S.headDefaultsOf(base);
    const explicit = {
      ...base, intakeLiftMm: d.intakeLiftMm, exhaustLiftMm: d.exhaustLiftMm, exhaustValveMm: d.exhaustValveMm,
      exhaustPortCfm: d.exhaustPortCfm, lsaDeg: d.lsaDeg, iclDeg: d.iclDeg, runnerMm: d.runnerMm,
    };
    for (const kpa of [40, 100]) {
      const a = veRow(base, {}, kpa); const b = veRow(explicit, {}, kpa);
      a.forEach((v, k) => expect(b[k]).toBeCloseTo(v, 0));
    }
    const hdr = { headers: true, exhaust: true };
    expect(veRow({ ...base, headerPrimaryMm: d.headerPrimaryMm, headerPrimaryIdMm: d.headerPrimaryIdMm }, hdr)).toEqual(veRow(base, hdr));
    expect(S.deriveEngine(explicit).overlapDeg).toBeCloseTo(S.deriveEngine(base).overlapDeg, 6);
  });
});

describe('each part pulls the way it does on a real engine', () => {
  it('more lift fills better at speed', () => {
    const d = S.headDefaultsOf(base);
    const more = veRow({ ...base, intakeLiftMm: d.intakeLiftMm + 2, exhaustLiftMm: d.exhaustLiftMm + 2 });
    expect(more[3]).toBeGreaterThan(veRow(base)[3]);
  });

  it('a choked exhaust port leaves more burned gas in the cylinder at speed', () => {
    // A restrictive exhaust port mostly costs pumping work on the exhaust stroke, not filling:
    // what the gas exchange shows of it is the residual the stroke cannot push out.
    const res = (cfg) => S.gasExchangeTrace(cfg, {}, { exhaustDia: 3.0 }, 6500, 100).residualFrac;
    expect(res({ ...base, exhaustPortCfm: 90 })).toBeGreaterThan(res(base));
  });

  it('a tighter lobe separation adds two degrees of overlap a degree', () => {
    const d = S.headDefaultsOf(base);
    const o = (lsa) => S.deriveEngine({ ...base, lsaDeg: lsa }).overlapDeg;
    expect(o(d.lsaDeg - 6) - o(d.lsaDeg - 2)).toBeCloseTo(8, 6);
  });

  it('advancing the cam moves the torque down the rev range', () => {
    const d = S.headDefaultsOf(base);
    const adv = veRow({ ...base, lsaDeg: d.lsaDeg, iclDeg: d.iclDeg - 10 });
    const std = veRow(base);
    expect(adv[0]).toBeGreaterThan(std[0]);
    expect(adv[3]).toBeLessThan(std[3]);
  });

  it('the catalyst: a high-flow substrate passes about a third of the drop, a test pipe none', () => {
    expect(S.catalystLossShare(undefined)).toBe(1);
    expect(S.catalystLossShare('metallic')).toBeGreaterThan(0.25);
    expect(S.catalystLossShare('metallic')).toBeLessThan(0.4);
    expect(S.catalystLossShare('none')).toBe(0);
    const drop = (catalyst) => S.exhaustSystemDropKpa({ flowKgS: 0.2, exhaustK: 900, pipeDiaIn: 2.5, mods: { catalyst } });
    expect(drop('none')).toBeLessThan(drop('metallic'));
    expect(drop('metallic')).toBeLessThan(drop(undefined));
  });

  it('on a cammed engine, longer header primaries build low-end filling', () => {
    const ls = { ...S.applyPreset(S.presetById('ls1')).engineConfig, camDuration: 224, exhaustCamDuration: 228, lsaDeg: 112, iclDeg: 108 };
    const at = (mm) => S.hardwareVeAt({ ...ls, headerPrimaryMm: mm }, M({ headers: true, exhaust: true }), { exhaustDia: 3.0 })(2500, 100);
    expect(at(1300)).toBeGreaterThan(at(500));
  });
});

describe('cam phasers', () => {
  it('an intake phaser moves the intake lobe only', () => {
    const parked = S.breathingGeometry(base, {}).events;
    const advanced = S.breathingGeometry(base, { intakeCamAdvanceDeg: 20 }).events;
    expect(advanced.ivo).toBeCloseTo(parked.ivo - 20, 6);
    expect(advanced.ivc).toBeCloseTo(parked.ivc - 20, 6);
    expect(advanced.evo).toBeCloseTo(parked.evo, 6);
    expect(advanced.evc).toBeCloseTo(parked.evc, 6);
  });

  it('an exhaust phaser moves the exhaust lobe only', () => {
    const parked = S.breathingGeometry(base, {}).events;
    const retarded = S.breathingGeometry(base, { exhaustCamRetardDeg: 15 }).events;
    expect(retarded.evo).toBeCloseTo(parked.evo + 15, 6);
    expect(retarded.ivo).toBeCloseTo(parked.ivo, 6);
  });
});

describe('the Physics page reads the model, not a picture of it', () => {
  it('the trace covers the gas exchange and its exhaust drop adds up', () => {
    const x = S.gasExchangeTrace(base, {}, { exhaustDia: 2.5 }, 5000, 100);
    expect(x.trace.deg.length).toBeGreaterThan(100);
    expect(x.ve).toBeCloseTo(S.hardwareVeAt(base, M(), { exhaustDia: 2.5 })(5000, 100), 0);
    const sum = x.exhaustDropKpa.manifold + x.exhaustDropKpa.catalyst + x.exhaustDropKpa.catback + x.exhaustDropKpa.turbine;
    expect(sum).toBeCloseTo(x.empKpa - 101.325, 0);
    for (const k of ['cylKpa', 'exPortKpa', 'inPortKpa', 'exFlowGs', 'inFlowGs']) expect(x.trace[k].every(Number.isFinite)).toBe(true);
  });
});
