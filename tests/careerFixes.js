/**
 * How a tuner really fixes each generated job, for the tests to hold the generator to.
 *
 * Every fix uses only what the game shows the player: the MAF scalar the pull log names,
 * the VE correction from the log (with the top column extended by its trend, where a
 * pull cannot log past redline), the injector size on the part, the factory value of a
 * setting someone broke, and spark pulled a degree at a time until the log shows no knock.
 */

import * as S from '../src/sim/index.js';
import { customerCar } from '../src/ui/career/cars.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';

export const pull = (st) => S.simulateSweep(pullInputs(st).args);
export const setBuild = (st, patch) => ({ ...st, build: { ...st.build, ...patch } });
const setCal = (st, path, v) => ({ ...st, tune: { ...st.tune, ecu: S.setCal(st.tune.ecu, path, v) } });

/** Each row's corrections carried on past the last cell the log reached. */
const extendTrend = (ratio) => ratio.map((row) => {
  let last = null;
  return row.map((r) => (r == null ? last : (last = r)));
});

/** VE corrected from the pull's log, `passes` times, trend extended to redline. */
export const veFix = (st, passes = 3) => {
  let s = st;
  for (let i = 0; i < passes; i += 1) {
    const { ratio } = S.veCorrections(S.veSamplesFromPull(pull(s).points));
    s = { ...s, tune: { ...s.tune, ve: S.applyVeCorrections(s.tune.ve, extendTrend(ratio), 1) } };
  }
  return s;
};

/** The MAF scalar the pull log's MAF entry names, applied. */
export const mafFix = (st) => {
  const e = pull(st).events.find((x) => x.type === 'maf');
  const m = e && /to about ([0-9.]+), which cancels/.exec(e.fix);
  return m ? setBuild(st, { mafScalar: Number(m[1]) }) : st;
};

/** The ECU told the injector size that is fitted. */
export const scaleFix = (st) => setBuild(st, { ecuInjectorCc: S.INJECTOR_OPTS[st.build.injIdx].cc });

/** Spark out of the full-load rows a degree at a time until the log has no knock. */
export const sparkClean = (st) => {
  let s = st;
  for (let i = 0; i < 10; i += 1) {
    if (!pull(s).events.some((e) => e.type === 'knock')) return s;
    s = { ...s, tune: { ...s.tune, timing: s.tune.timing.map((row, ri) => row.map((v) => (S.LOAD[ri] >= 90 ? v - 1 : v))) } };
  }
  return s;
};

/** Spark out of the boost rows (degrees per 20 kPa) and the boost rows richer. */
export const boostSparkAndFuel = (st, degPer20 = 4, afr = 12.0) => ({
  ...st,
  tune: {
    ...st.tune,
    timing: st.tune.timing.map((row, ri) => row.map((v) => (S.LOAD[ri] > 100 ? v - ((S.LOAD[ri] - 100) / 20) * degPer20 : v))),
    afr: st.tune.afr.map((row, ri) => row.map((v) => (S.LOAD[ri] > 100 ? afr : v))),
  },
});

/** Scaling, then airflow, then mixture: the order a tuner works in. */
const airAndFuel = (st) => veFix(mafFix(veFix(mafFix(scaleFix(st)), 2)), 2);

/** @type {Record<string, (s: any, job: any) => any>} */
export const TEMPLATE_FIXES = {
  // MAF first, then the VE table: on a car that blends MAF with speed-density, the
  // intake's better breathing leaves the VE table stale too.
  intake: (s) => veFix(mafFix(mafFix(s)), 2),
  injectors: (s) => scaleFix(s),
  idle: (s, job) => setCal(s, 'idle.damp', customerCar({ preset: job.car.preset }).tune.ecu.idle.damp),
  headers: (s) => veFix(s, 3),
  cam: (s) => veFix(s, 3),
  retarded: (s, job) => ({ ...s, tune: { ...s.tune, timing: customerCar({ preset: job.car.preset }).tune.timing } }),
  e85: (s) => scaleFix(s),
  turbo: (s) => boostSparkAndFuel(s),
  pair: (s) => airAndFuel(s),
  'build-na': (s, job) => {
    const b = s.build;
    const built = setBuild(s, {
      octaneIdx: job.params.octaneIdx, injIdx: 1, ecuInjectorCc: S.INJECTOR_OPTS[1].cc,
      mods: { ...b.mods, intake: true, exhaust: true, headers: true },
      engineConfig: {
        ...b.engineConfig, camDuration: 240, springRate: 72,
        ...(job.params.redline ? { redline: Math.min(b.engineConfig.redline, job.params.redline) } : {}),
      },
    });
    return sparkClean(airAndFuel(built));
  },
  'build-boost': (s, job) => {
    const e85 = job.params.octaneIdx === 3;
    const inj = e85 ? 4 : 3;
    const psi = 8;
    const built = setBuild(s, {
      octaneIdx: job.params.octaneIdx, turboOn: true, turbineIdx: 2, compressorIdx: 1,
      boostCurve: [0, 0, 3, 6, psi, psi, psi, psi], injIdx: inj, ecuInjectorCc: S.INJECTOR_OPTS[inj].cc,
      mods: { ...s.build.mods, intercooler: true, intake: true, exhaust: true, headers: true },
    });
    return sparkClean(boostSparkAndFuel(airAndFuel(built), e85 ? 2 : 4, e85 ? 11.5 : 11.8));
  },
};
