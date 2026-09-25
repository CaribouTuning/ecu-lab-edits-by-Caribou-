/**
 * The career's customers, held to the real simulator: every job fails as the customer
 * delivers it, and passes once the actual fault is fixed the way a tuner would fix it.
 * A job that passes untouched would be a free payout; one no fix can pass would be a
 * wall. Both are bugs, and this is where they show up.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { customerCar } from '../src/ui/career/cars.js';
import { evaluateJob } from '../src/ui/career/evaluate.js';
import { JOBS, jobById } from '../src/ui/career/jobs.js';
import * as shop from '../src/ui/career/shop.js';
import { START_MONEY } from '../src/ui/career/shop.js';
import { pullInputs } from '../src/ui/state/pullInputs.js';

const pull = (st) => S.simulateSweep(pullInputs(st).args);
const setBuild = (st, patch) => ({ ...st, build: { ...st.build, ...patch } });
const setCal = (st, path, v) => ({ ...st, tune: { ...st.tune, ecu: S.setCal(st.tune.ecu, path, v) } });
const getCal = (st, path) => S.getCal(st.tune.ecu, path);
/** VE corrected from the pull's own log, `passes` times, the way AIRFLOW's panel does it. */
const veFromLogs = (st, passes = 3) => {
  let s = st;
  for (let i = 0; i < passes; i += 1) {
    const { ratio } = S.veCorrections(S.veSamplesFromPull(pull(s).points));
    s = { ...s, tune: { ...s.tune, ve: S.applyVeCorrections(s.tune.ve, ratio, 1) } };
  }
  return s;
};
/** The last VE column, which a pull to a 7000 RPM redline cannot log, extended by hand. */
const extendTopColumn = (st, f) => {
  const c = S.RPM.length - 1;
  return { ...st, tune: { ...st.tune, ve: st.tune.ve.map((row, ri) => row.map((v, ci) => (ci === c && S.LOAD[ri] >= 70 ? v * f : v))) } };
};
/** Spark out of the boost rows (about 4° per 20 kPa) and the boost rows richer. */
const boostSparkAndFuel = (st, degPer20 = 4, afr = 12.0) => ({
  ...st,
  tune: {
    ...st.tune,
    timing: st.tune.timing.map((row, ri) => row.map((v) => (S.LOAD[ri] > 100 ? v - ((S.LOAD[ri] - 100) / 20) * degPer20 : v))),
    afr: st.tune.afr.map((row, ri) => row.map((v) => (S.LOAD[ri] > 100 ? afr : v))),
  },
});
const zmul = (st, path, f) => { const t = getCal(st, path); return setCal(st, path, { ...t, z: t.z.map((v) => v * f) }); };

/** How each job is really fixed. Every one uses only controls the job's training opens. */
const FIXES = {
  'intake-maf': (s) => setBuild(s, { mafScalar: 1.11 }),
  'injector-scaling': (s) => setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc }),
  'headers-lean': (s) => extendTopColumn(veFromLogs(s, 2), 1.16),
  'idle-hunt': (s) => setCal(s, 'idle.damp', 0.04),
  'cam-swap': (s) => veFromLogs(s, 3),
  e85: (s) => setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc }),
  'retarded-timing': (s) => ({ ...s, tune: { ...s.tune, timing: customerCar({ preset: 'vq35hr' }).tune.timing } }),
  'turbo-kit': (s) => boostSparkAndFuel(s),
  'full-session': (s) => zmul(veFromLogs(setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc, mafScalar: 1.11 })), 'ignition.knockThreshold', 1.4),
  'blower-power': (s) => boostSparkAndFuel(s, 3, 11.8),
  nitrous: (s) => setCal(setCal(s, 'nitrous.fuelTrimPct', getCal(s, 'nitrous.fuelTrimPct') - 25), 'nitrous.retardDeg', 10),
  'walkin-intake-hr': (s) => setBuild(s, { mafScalar: 1.11 }),
  'walkin-injectors-v6': (s) => setBuild(s, { ecuInjectorCc: S.INJECTOR_OPTS[s.build.injIdx].cc }),
  'walkin-idle-v6': (s) => setCal(s, 'idle.damp', 0.04),
};

const failures = (v) => v.results.filter((x) => !x.pass).map((x) => `${x.check.label}: ${x.measured}`);

describe.each(JOBS.map((j) => [j.id, j]))('%s', (_id, job) => {
  it('does not pass as the customer delivers it', () => {
    const v = evaluateJob(job, customerCar(job.car));
    expect(v.verdict, 'an unfixed car must not be a free payout').not.toBe('pass');
  });

  it('passes once the real fault is fixed', () => {
    const fixed = FIXES[job.id](customerCar(job.car));
    const v = evaluateJob(job, fixed);
    expect({ verdict: v.verdict, failing: failures(v) }).toEqual({ verdict: 'pass', failing: [] });
  });
});

describe('grading', () => {
  it('big power with knock is unsafe, not a success', () => {
    const job = jobById('turbo-kit');
    // Leave the knock in and turn the boost rows richer only: fast, and knocking.
    const s = customerCar(job.car);
    const v = evaluateJob(job, { ...s, tune: { ...s.tune, afr: s.tune.afr.map((row, ri) => row.map((x) => (S.LOAD[ri] > 100 ? 11.8 : x))) } });
    expect(v.verdict).toBe('unsafe');
    expect(v.pay).toBe(0);
    expect(v.rep).toBeLessThan(0);
  });

  it('bending the fuel targets instead of fixing the cause is only partly paid', () => {
    const job = jobById('injector-scaling');
    const s = customerCar(job.car);
    const cc = S.INJECTOR_OPTS[s.build.injIdx].cc;
    const fixedByScaling = setBuild(s, { ecuInjectorCc: cc });
    // Scale it right, then also lean every target out: the customer asked for neither.
    const bent = { ...fixedByScaling, tune: { ...fixedByScaling.tune, afr: fixedByScaling.tune.afr.map((row) => row.map((x) => x + 0.6)) } };
    const v = evaluateJob(job, bent);
    expect(v.verdict).toBe('partial');
    expect(v.pay).toBe(Math.round(job.pay * 0.5));
  });

  it('pays for quality: a cleaner calibration earns at least the quoted price', () => {
    const job = jobById('intake-maf');
    const v = evaluateJob(job, FIXES['intake-maf'](customerCar(job.car)));
    expect(v.pay).toBeGreaterThanOrEqual(job.pay);
  });
});

describe('the shop', () => {
  const { accept, blockers, board, buy, cannotBuy, cannotTrain, capacity, deliver, newCareer, pageUnlocked, reviveCareer, storeCar, train } = /** @type {any} */ (shop);

  it('starts small: a little money, no reputation, fuel basics only, one lift, no dyno', () => {
    const c = newCareer();
    expect(c.money).toBe(START_MONEY);
    expect(c.rep).toBe(0);
    expect(capacity(c)).toBe(1);
    expect(c.owned).not.toContain('dyno');
    expect(['airflow', 'fuel', 'injectors', 'sensors'].every((p) => pageUnlocked(c, p))).toBe(true);
    expect(['spark', 'idle', 'boost', 'vvt', 'nitrous'].some((p) => pageUnlocked(c, p))).toBe(false);
  });

  it('a first customer is waiting, and one the shop is not ready for says what it needs', () => {
    const c = newCareer();
    const waiting = board(c);
    expect(waiting.some((j) => blockers(c, j).length === 0)).toBe(true);
    const idle = jobById('idle-hunt');
    expect(blockers(c, idle)).toContain('Idle control training');
  });

  it('the whole loop: take the car, fix it, hand it back, get paid, and the car leaves', () => {
    let c = accept(newCareer(), 'intake-maf');
    expect(c.lifts).toHaveLength(1);
    expect(c.working).toBe('intake-maf');
    // The work happens on the car on the lift.
    const lift = c.lifts[0];
    const car = { ...customerCar(jobById('intake-maf').car), build: { ...lift.car.build, mafScalar: 1.11 }, tune: lift.car.tune };
    c = storeCar(c, 'intake-maf', { build: car.build, tune: car.tune });
    const v = evaluateJob(jobById('intake-maf'), car);
    c = deliver(c, 'intake-maf', v);
    expect(v.verdict).toBe('pass');
    expect(c.money).toBe(START_MONEY + v.pay);
    expect(c.rep).toBe(jobById('intake-maf').rep);
    expect(c.lifts).toHaveLength(0);
    expect(c.done['intake-maf']).toBe(1);
    expect(c.day).toBe(2);
    expect(c.milestones).toContain('first-job');
    expect(board(c).some((j) => j.id === 'intake-maf')).toBe(false);
  });

  it('an unfixed car stays in the shop to be worked on, pays nothing, and costs a little standing', () => {
    let c = { ...newCareer(), rep: 10 };
    c = accept(c, 'intake-maf');
    const v = evaluateJob(jobById('intake-maf'), customerCar(jobById('intake-maf').car));
    c = deliver(c, 'intake-maf', v);
    expect(v.verdict).toBe('fail');
    expect(c.lifts).toHaveLength(1);
    expect(c.money).toBe(START_MONEY);
    expect(c.rep).toBe(8);
    expect(c.day).toBe(1);
  });

  it('one lift holds one car: a second customer waits until you buy another', () => {
    let c = accept({ ...newCareer(), money: 10000, rep: 20 }, 'intake-maf');
    expect(blockers(c, jobById('injector-scaling'))).toContain('A free lift');
    c = buy(c, 'lift2');
    expect(capacity(c)).toBe(2);
    expect(blockers(c, jobById('injector-scaling'))).toEqual([]);
  });

  it('money is a decision: you cannot buy what you cannot afford, and buying spends it', () => {
    const c = { ...newCareer(), rep: 20 };
    expect(cannotBuy(c, 'dyno')).toMatch(/\$5,000 short/);
    const rich = buy({ ...c, money: 7000 }, 'dyno');
    expect(rich.owned).toContain('dyno');
    expect(rich.money).toBe(1000);
    expect(rich.milestones).toContain('dyno');
  });

  it('training costs money, needs its prerequisites, and opens the real pages', () => {
    let c = { ...newCareer(), money: 5000, rep: 30 };
    expect(cannotTrain(c, 'knock')).toMatch(/After Ignition timing/);
    c = train(c, 'spark');
    expect(pageUnlocked(c, 'spark')).toBe(true);
    expect(c.money).toBe(5000 - 600);
    expect(cannotTrain(c, 'knock')).toBeNull();
  });

  it('a save that is missing, corrupt or from another version starts a new career instead of breaking', () => {
    expect(reviveCareer(null).money).toBe(START_MONEY);
    expect(reviveCareer({ v: 999, money: 5 }).money).toBe(START_MONEY);
    const kept = reviveCareer({ ...newCareer(), money: 4321, lifts: [{ jobId: 'no-such-job', car: {} }] });
    expect(kept.money).toBe(4321);
    expect(kept.lifts).toEqual([]);
  });
});
