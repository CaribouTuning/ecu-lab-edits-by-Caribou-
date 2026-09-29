/**
 * The career's customer cars, held to the two facts that make a job a job: it FAILS as
 * the customer delivers it, and the fix its brief points at PASSES it.
 *
 * Without the first a job is a free tick; without the second it is a wall the player
 * cannot know is a wall. Neither is visible from the job's text, and both move whenever
 * the physics does, so they are checked against the real sweep and scorer rather than
 * reasoned about.
 *
 * Every fix below is something the game lets a player do: set the ECU's injector size,
 * move the MAF scalar, accept the re-logged VE, edit table rows, fit a cam.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { CAREER_JOBS, hardwareOf, jobCar } from '../src/ui/career.js';
import { makeInitialState } from '../src/ui/state/initialState.js';

/**
 * A 100 kPa dyno pull on a build and calibration, with the inputs `doRun` in EcuLab.jsx
 * derives from the same two slices.
 * @param {any} build
 * @param {any} tune
 */
function pull(build, tune) {
  const fuel = S.OCTANE_OPTS[build.octaneIdx];
  const r = S.simulateSweep({
    loadKpa: 100,
    ve: tune.ve,
    veTruth: truth(build),
    timing: tune.timing,
    afr: tune.afr,
    turboOn: build.turboOn,
    boostCurve: build.boostCurve,
    octaneBonus: fuel.bonus,
    octaneLabel: fuel.label,
    fuel,
    injectorCc: S.INJECTOR_OPTS[build.injIdx].cc,
    ecuInjectorCc: build.ecuInjectorCc,
    injectorLabel: S.INJECTOR_OPTS[build.injIdx].label,
    mods: build.mods,
    mafScalar: build.mafScalar,
    derived: S.deriveEngine(build.engineConfig),
    turbine: S.turbineWithCount(S.TURBINE_OPTS[build.turbineIdx], build.turbineCount),
    compressor: S.COMPRESSOR_OPTS[build.compressorIdx],
  });
  return { r, tuningScore: S.computeTuningScore(r).score };
}

/** What the AIR page's ACCEPT RE-LOGGED VALUES writes: the hardware's true VE. */
const truth = (build) => S.computeHardwareVE(build.engineConfig, build.mods, hardwareOf(build));

/** The car as TAKE_JOB leaves it: the job's build and VE, stock timing and fuel tables. */
function delivered(id) {
  const job = CAREER_JOBS.find((j) => j.id === id);
  const { build, ve } = jobCar(job);
  return { job, build, tune: { ...makeInitialState().tune, ve } };
}

/** Sets every cell of the given load rows. */
const setRows = (table, rows, fn) => table.map((row, i) => (rows.includes(i) ? row.map(fn) : row));

/** The 200 and 150 kPa rows: everything above atmospheric. */
const BOOST_ROWS = [S.LOAD.indexOf(200), S.LOAD.indexOf(150)];

/**
 * The fix each job's brief points at, as the edits a player makes.
 * @type {Record<string, (car: ReturnType<typeof delivered>) => {build: any, tune: any}>}
 */
const FIXES = {
  // TUNE › INJECTORS: tell the ECU what is actually fitted.
  'rich-injectors': ({ build, tune }) => ({
    build: { ...build, ecuInjectorCc: S.INJECTOR_OPTS[build.injIdx].cc }, tune,
  }),
  // TUNE › AIR: accept the re-logged values for the cam that is really in it.
  'stale-ve': ({ build, tune }) => ({ build, tune: { ...tune, ve: truth(build) } }),
  // SENSORS for the MAF under-read, then richer and less spark in the boost rows.
  'untuned-turbo': ({ build, tune }) => ({
    build: { ...build, mafScalar: 1.09 },
    tune: {
      ...tune,
      afr: setRows(tune.afr, BOOST_ROWS, () => 11.8),
      timing: setRows(tune.timing, BOOST_ROWS, (deg) => deg - 12),
    },
  }),
  // SENSORS: the intake's housing reads about 10% low, so scale the MAF back up.
  'lean-intake': ({ build, tune }) => ({ build: { ...build, mafScalar: 1.11 }, tune }),
  // The whole session in order: scaling, then airflow.
  'full-session': ({ build, tune }) => {
    const scaled = { ...build, ecuInjectorCc: S.INJECTOR_OPTS[build.injIdx].cc, mafScalar: 1.11 };
    return { build: scaled, tune: { ...tune, ve: truth(scaled) } };
  },
  // Any clean route to the number. This one is a big cam and a re-logged VE table.
  'power-goal': ({ build, tune }) => {
    const cammed = { ...build, engineConfig: { ...build.engineConfig, camDuration: 268, springRate: 78 } };
    return { build: cammed, tune: { ...tune, ve: truth(cammed) } };
  },
};

describe('career jobs', () => {
  it('has a fix written down for every job, and no fix for a job that is gone', () => {
    expect(Object.keys(FIXES).sort()).toEqual(CAREER_JOBS.map((j) => j.id).sort());
  });

  describe.each(CAREER_JOBS.map((j) => j.id))('%s', (id) => {
    it('fails as the customer delivers it', () => {
      const { job, build, tune } = delivered(id);
      const { r, tuningScore } = pull(build, tune);
      expect(job.goal(r, { tuningScore })).toBe(false);
    });

    it('passes once the fault is fixed', () => {
      const car = delivered(id);
      const { build, tune } = FIXES[id](car);
      const { r, tuningScore } = pull(build, tune);
      expect(car.job.goal(r, { tuningScore })).toBe(true);
    });
  });
});

describe('jobCar', () => {
  it('starts from the whole stock build, so nothing of the player\'s car rides along', () => {
    // TAKE_JOB spreads this over the player's build. Before `jobCar`, the pipe,
    // turbine and compressor were never written, so a customer's car arrived with
    // whatever the player had last fitted.
    const stock = makeInitialState().build;
    for (const job of CAREER_JOBS) {
      const { build } = jobCar(job);
      expect(build.exhaustDiaIdx).toBe(stock.exhaustDiaIdx);
      expect(build.turbineIdx).toBe(stock.turbineIdx);
      expect(build.turbineCount).toBe(stock.turbineCount);
      expect(build.compressorIdx).toBe(stock.compressorIdx);
      expect(build.mafScalar).toBe(1);
    }
  });

  it('hands over a current VE log, except on the jobs whose fault is a stale one', () => {
    // Current means what AIR would call current: the same hardware the shell feeds
    // `computeHardwareVE`, boost included. Without the boost the turbo job arrived
    // with a table the AIR page already called out of date.
    for (const job of CAREER_JOBS) {
      const { build, ve } = jobCar(job);
      if (job.setup.staleVe) {
        const stock = makeInitialState().build;
        expect(ve).toEqual(truth(stock));
        expect(ve).not.toEqual(truth(build));
      } else {
        expect(ve).toEqual(truth(build));
      }
    }
  });
});
