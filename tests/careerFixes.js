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
    const { ratio } = S.veCorrections(S.veSamplesFromPull(pull(s).points), axesOf(s, 've'));
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

/** The breakpoints one of the tune's tables sits on. @param {any} st @param {'ve'|'timing'|'afr'} t */
const axesOf = (st, t) => S.layoutById(st.tune.layout)[t];

/** The ECU told the injector size that is fitted. */
export const scaleFix = (st) => setBuild(st, { ecuInjectorCc: S.INJECTOR_OPTS[st.build.injIdx].cc });

/** The knock threshold raised a tenth at a time until the log reports no false knock. */
export const quietKnock = (st) => {
  let s = st;
  for (let i = 0; i < 12; i += 1) {
    if (!pull(s).events.some((e) => e.type === 'falseknock')) return s;
    const t = S.getCal(s.tune.ecu, 'ignition.knockThreshold');
    s = { ...s, tune: { ...s.tune, ecu: S.setCal(s.tune.ecu, 'ignition.knockThreshold', { ...t, z: t.z.map((v) => v * 1.1) }) } };
  }
  return s;
};

/** Spark out of the full-load rows a degree at a time until the log has no knock. */
export const sparkClean = (st) => {
  let s = st;
  for (let i = 0; i < 20; i += 1) {
    if (!pull(s).events.some((e) => e.type === 'knock')) return s;
    s = { ...s, tune: { ...s.tune, timing: s.tune.timing.map((row, ri) => row.map((v) => (axesOf(s, 'timing').load[ri] >= 90 ? v - 1 : v))) } };
  }
  return s;
};

/**
 * Timing put back where the pull log says it was left on the table, the way its advice
 * reads: a degree at a time in the full-load and boost rows, pulling again each time, and a
 * degree back out at the first sign of knock.
 */
export const sparkToLog = (st) => {
  let s = st;
  const step = (x, d) => ({ ...x, tune: { ...x.tune, timing: x.tune.timing.map((row, ri) => row.map((v) => (axesOf(x, 'timing').load[ri] >= 100 ? v + d : v))) } });
  for (let i = 0; i < 20; i += 1) {
    const ev = pull(s).events;
    if (ev.some((e) => e.type === 'knock')) return step(s, -1);
    if (!ev.some((e) => e.type === 'timing')) return s;
    s = step(s, 1);
  }
  return s;
};

/** Spark out of the boost rows (degrees per 20 kPa) and the boost rows richer. */
export const boostSparkAndFuel = (st, degPer20 = 4, afr = 12.0) => ({
  ...st,
  tune: {
    ...st.tune,
    timing: st.tune.timing.map((row, ri) => row.map((v) => (axesOf(st, 'timing').load[ri] > 100 ? v - ((axesOf(st, 'timing').load[ri] - 100) / 20) * degPer20 : v))),
    afr: st.tune.afr.map((row, ri) => row.map((v) => (axesOf(st, 'afr').load[ri] > 100 ? afr : v))),
  },
});

/** Scaling, then airflow, then mixture: the order a tuner works in. */
const airAndFuel = (st) => veFix(mafFix(veFix(mafFix(scaleFix(st)), 2)), 2);

/**
 * The full-load rows taken to best power where the factory ran them richer. Factory fuel
 * goes to about lambda 0.82 near redline for component protection (src/sim/factoryFuel.js);
 * with a bigger cam that much fuel runs stock injectors out of time at the top, and the
 * tuner's answer is the one that also makes power: best-power mixture, about 12.8:1.
 */
export const bestPowerTop = (st, afr = 12.8) => ({
  ...st,
  tune: { ...st.tune, afr: st.tune.afr.map((row, ri) => row.map((v) => (axesOf(st, 'afr').load[ri] >= 95 && v < afr ? afr : v))) },
});

/** @type {Record<string, (s: any, job: any) => any>} */
export const TEMPLATE_FIXES = {
  // MAF first, then the VE table: on a car that blends MAF with speed-density, the
  // intake's better breathing leaves the VE table stale too.
  intake: (s) => veFix(mafFix(mafFix(s)), 2),
  injectors: (s) => scaleFix(s),
  idle: (s, job) => setCal(s, 'idle.damp', customerCar({ preset: job.car.preset }).tune.ecu.idle.damp),
  headers: (s) => veFix(s, 3),
  cam: (s) => veFix(bestPowerTop(s), 3),
  retarded: (s, job) => ({ ...s, tune: { ...s.tune, timing: customerCar({ preset: job.car.preset }).tune.timing } }),
  // E85's charge cooling moves the airflow too, so the real fix ends with a pass from the log.
  e85: (s) => veFix(scaleFix(s), 1),
  // The safe start (spark out of the boost rows, the mixture richer), then the timing a
  // tuner puts back from the log: a blanket pull leaves the power on the table.
  turbo: (s) => sparkToLog(boostSparkAndFuel(s)),
  // Then the spark checked against the log, as on any breathing change: intake and headers
  // add charge, and with a stock VQ35HR's 2-degree factory margin a pull can knock until a
  // degree comes out where the log says.
  pair: (s) => sparkClean(airAndFuel(s)),
  'build-na': (s, job) => {
    const b = s.build;
    const built = setBuild(s, {
      octaneIdx: job.params.octaneIdx, injIdx: 1, ecuInjectorCc: S.INJECTOR_OPTS[1].cc,
      mods: { ...b.mods, intake: true, exhaust: true, headers: true },
      engineConfig: {
        // A street cam a step up from the car's own, as MotoIQ's JWT C2 test on a VQ35DE: the
        // intake manifold stays (manifoldCam), and the springs go up a little with it.
        ...b.engineConfig, camDuration: b.engineConfig.camDuration + 8,
        exhaustCamDuration: (b.engineConfig.exhaustCamDuration ?? b.engineConfig.camDuration) + 8, springRate: 72,
        ...(job.params.redline ? { redline: Math.min(b.engineConfig.redline, job.params.redline) } : {}),
      },
    });
    // A 240 degree cam on stiffer springs rings the knock sensor: the log reports false
    // knock, and the tuner raises the knock threshold until it stops, then checks spark.
    return sparkClean(quietKnock(airAndFuel(built)));
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

// ---------------------------------------------------------------- the story customers

const getCal = (st, path) => S.getCal(st.tune.ecu, path);
/** VE corrected from the pull's own log, `passes` times, the way AIRFLOW's panel does it. */
export const storyVeFromLogs = (st, passes = 3) => {
  let s = st;
  for (let i = 0; i < passes; i += 1) {
    const { ratio } = S.veCorrections(S.veSamplesFromPull(pull(s).points), axesOf(s, 've'));
    s = { ...s, tune: { ...s.tune, ve: S.applyVeCorrections(s.tune.ve, ratio, 1) } };
  }
  return s;
};
const zmul = (st, path, f) => { const t = getCal(st, path); return setCal(st, path, { ...t, z: t.z.map((v) => v * f) }); };

/** How each story job is really fixed. Every one uses only controls the job's training opens. */
export const STORY_FIXES = {
  'intake-maf': (s) => setBuild(s, { mafScalar: 1.11 }),
  'injector-scaling': (s) => setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc }),
  'headers-lean': (s) => storyVeFromLogs(s, 2),
  'idle-hunt': (s) => setCal(s, 'idle.damp', 0.025),
  'cam-swap': (s) => storyVeFromLogs(s, 3),
  // The injectors the ECU is told about, then the fuelling corrected from the log on the new
  // fuel, as an E85 conversion is finished.
  e85: (s) => storyVeFromLogs(setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc }), 2),
  'retarded-timing': (s) => ({ ...s, tune: { ...s.tune, timing: customerCar({ preset: 'vq35hr' }).tune.timing } }),
  'turbo-kit': (s) => boostSparkAndFuel(s),
  'full-session': (s) => zmul(storyVeFromLogs(setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc, mafScalar: 1.11 })), 'ignition.knockThreshold', 1.4),
  'blower-power': (s) => boostSparkAndFuel(s, 3, 12.2),
  nitrous: (s) => setCal(setCal(s, 'nitrous.fuelTrimPct', getCal(s, 'nitrous.fuelTrimPct') - 25), 'nitrous.retardDeg', 12),
};

