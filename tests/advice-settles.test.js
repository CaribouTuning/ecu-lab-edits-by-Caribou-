/**
 * Following TUNE's advice settles in one sitting: type the number under each marked cell and
 * the next look asks for nothing more, and a typed cell's number never moves under it.
 *
 * From a play test: a turbo VQ35DE Rev-Up at 5 psi with an intercooler, injectors and MAF set
 * as the guide asked. Its 150 kPa cell at 1500 RPM was marked 4.5; typed (as -0.49, the
 * slider's nearest) it was still "2.3 deg past the knock limit" with a new number, -4.5, and
 * so on down. The advisor charged a pull point's whole knock to each of the four cells the
 * ECU blends there; it now sets each cell from the knock limit the pull met where the cell is
 * in force, which does not depend on what the cell holds.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { safeBaseMap } from '../src/ui/state/safeBaseMap.js';
import { guidedSteps } from '../src/ui/state/tuneStart.js';
import { advice, pull } from './guidedPlayer.js';

const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const KNOCK = ['knock', 'unheardknock', 'knockprot'];

/** The play test's build, with the guide's injector and MAF steps done as it reads them. */
function turboRevUp(psi, cc) {
  let st = reducer(makeInitialState({ blank: true }), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById('vq35de-revup')) });
  st = set(st, 'turboOn', true);
  st = set(st, 'boostCurve', st.build.boostCurve.map((b, i) => (i >= 2 ? psi : b)));
  st = set(st, 'mods', { ...st.build.mods, intercooler: true });
  if (cc) st = set(st, 'injIdx', S.INJECTOR_OPTS.findIndex((o) => o.cc === cc));
  const made = safeBaseMap(st);
  const g = guidedSteps({ build: st.build, tune: st.tune, target: made.action, samples: made.samples });
  const inj = g.find((x) => x.id === 'injectors');
  if (inj) st = set(st, 'ecuInjectorCc', Number(/to (\d+)/.exec(inj.text)[1]));
  const maf = g.find((x) => x.id === 'maf');
  if (maf) st = set(st, 'mafScalar', Number(/scalar to (\d+\.\d+)/.exec(maf.text)[1]));
  return { st, made };
}
const withCell = (st, table, ri, ci, v) => {
  const t = st.tune[table].map((r) => [...r]);
  t[ri][ci] = v;
  return { ...st, tune: { ...st.tune, [table]: t } };
};

describe('the idle column at full throttle', () => {
  it('is never marked when no pull ran it: the dyno sweeps from 1500 RPM, and the log says nothing there either', () => {
    // From a play test: a turbo VQ35DE's 100 kPa cell at 800 RPM was marked down to -1 degrees,
    // charged for the 150 kPa cell above it. Full throttle at idle speed is a tip-in.
    const { st } = turboRevUp(5, 550);
    const axes = S.layoutById(st.tune.layout).timing;
    const ri = axes.load.indexOf(100); const ci = axes.rpm.indexOf(800);
    const hot = withCell(st, 'timing', ri, ci, 40);
    const p = pull(hot);
    const a = advice(hot, p);
    expect(a.overAdvanced.some((c) => c.ri === ri && c.ci === ci)).toBe(false);
    expect(p.points.every((q) => q.rpm >= 1500)).toBe(true);
  }, 300_000);
});

describe('following the advice settles', () => {
  it('a marked cell keeps its number when typed, is never asked for more when typed lower, and drops off the list', () => {
    const { st } = turboRevUp(5, 550);
    const a0 = advice(st, pull(st));
    const marked = a0.overAdvanced.find((c) => !c.beyondReach && c.knockingOnPull);
    expect(marked, 'a cell the pull knocked on').toBeTruthy();
    for (const c of a0.overAdvanced) expect(Number.isInteger(c.suggested), `${c.rpm} RPM`).toBe(true);
    for (const typed of [marked.suggested, marked.suggested - 0.49, marked.suggested - 3]) {
      const a1 = advice(withCell(st, 'timing', marked.ri, marked.ci, typed), pull(withCell(st, 'timing', marked.ri, marked.ci, typed)));
      const again = a1.spark.find((c) => c.ri === marked.ri && c.ci === marked.ci);
      // Typed at its number, the number stays. Typed lower, the cell is done: never asked for
      // more retard, never marked again. (Its row partner is held by the knock limit carried to
      // its own row, not to this one's, so taking more out here can leave the point clean, and
      // a clean cell's number is what the pull measured room for, if it ran the cell's row.)
      if (typed === marked.suggested) expect(again.suggested, `typed ${typed}`).toBe(marked.suggested);
      expect(again.suggested, `typed ${typed}`).toBeGreaterThanOrEqual(typed);
      expect(a1.overAdvanced.some((c) => c.ri === marked.ri && c.ci === marked.ci), `typed ${typed}`).toBe(false);
    }
  }, 300_000);

  it('every mark typed at once leaves a clean pull, nothing more to type, and the guide step done', () => {
    let { st, made } = turboRevUp(5, 550);
    const a0 = advice(st, pull(st));
    expect(a0.overAdvanced.length).toBeGreaterThan(0);
    for (const c of a0.overAdvanced) st = withCell(st, 'timing', c.ri, c.ci, c.suggested);
    for (const c of a0.wrongMix) if (c.suggested != null) st = withCell(st, 'afr', c.ri, c.ci, c.suggested);
    const p = pull(st);
    const a1 = advice(st, p);
    expect(a1.overAdvanced).toEqual([]);
    expect(p.events.filter((e) => KNOCK.includes(e.type)).map((e) => e.msg)).toEqual([]);
    const spark = guidedSteps({ build: st.build, tune: st.tune, target: made.action, samples: made.samples, advice: a1 }).find((x) => x.id === 'spark');
    expect(spark.done).toBe(true);
  }, 300_000);

  it('never chases fuel the injectors cannot spray through the AFR table', () => {
    // Stock injectors at 8 psi run out up top: the pull log names the injectors. A FUEL cell
    // there is marked only if its target itself is wrong for its boost, with best power for its
    // row (the same whatever the injectors deliver), and once typed it is not marked again.
    // Scaled by what was delivered instead, a turbo VQ's 6500 RPM cell was asked 12.2, 10.5, 9,
    // 7.7, 6.6 while the engine took 14.1:1 every time.
    let { st } = turboRevUp(8, null);
    st = set(set(st, 'compressorIdx', 1), 'octaneIdx', 1);
    const p = pull(st);
    expect(p.events.some((e) => e.type === 'fuel')).toBe(true);
    const a = advice(st, p);
    for (const c of a.wrongMix) {
      expect(c.suggested, `${c.map} kPa at ${c.rpm} RPM`).toBe(S.afrTargetVerdict({ value: c.current, kpa: c.map, direct: false }).suggested);
    }
    const typed = { ...st, tune: { ...st.tune, afr: st.tune.afr.map((r) => [...r]) } };
    for (const c of a.wrongMix) typed.tune.afr[c.ri][c.ci] = c.suggested;
    const again = advice(typed, pull(typed));
    for (const c of again.wrongMix) expect(a.wrongMix.some((x) => x.ri === c.ri && x.ci === c.ci), `${c.map} kPa at ${c.rpm} RPM marked again`).toBe(false);
  }, 300_000);
});
