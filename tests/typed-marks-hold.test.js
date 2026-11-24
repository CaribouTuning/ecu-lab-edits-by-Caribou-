/**
 * A number typed as TUNE marks it stays typed: the next pull never asks for that cell again.
 * Two builds once did. On a B58 with a point more compression, a cell's mark was capped by
 * its neighbour's untyped suggestion (`capRows`, advisors.js), so typing the row changed the
 * number. On an EA888 with 4 psi more boost, a cell the pull had not yet reached at its full
 * pressure was marked from the model, about 8° more cautious than the pull's own measured
 * limit carried along the boost (`carriedAt`), and the next pull raised it again.
 */

import { describe, expect, it } from 'vitest';

import * as S from '../src/sim/index.js';
import { makeInitialState } from '../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../src/ui/state/reducer.js';
import { safeBaseMap } from '../src/ui/state/safeBaseMap.js';
import { guidedSteps } from '../src/ui/state/tuneStart.js';
import { advice, pull } from './guidedPlayer.js';

const preset = (id) => reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: S.applyPreset(S.presetById(id)) });
const set = (s, field, value) => reducer(s, { type: ACTIONS.SET_BUILD_FIELD, field, value });
const engine = (st, patch) => reducer(st, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch });
const KNOCK = ['knock', 'unheardknock', 'knockprot'];

const BUILDS = {
  'B58 (M1), a point more compression on 93': () => {
    const st = preset('b58-m1');
    return set(engine(st, { compression: st.build.engineConfig.compression + 1 }), 'octaneIdx', 1);
  },
  'EA888 GTI, 4 psi more boost': () => {
    const st = preset('ea888-gti');
    return set(st, 'boostCurve', st.build.boostCurve.map((b) => (b > 0 ? b + 4 : b)));
  },
};

/** The guide's order: its setup steps, then the marks typed exactly as shown, a sitting at a time. */
function followTheMarks(st0) {
  let st = st0;
  const made = safeBaseMap(st);
  const g = guidedSteps({ build: st.build, tune: st.tune, target: made.action, samples: made.samples });
  const inj = g.find((x) => x.id === 'injectors');
  if (inj) st = set(st, 'ecuInjectorCc', Number(/set ECU Injector Scaling to (\d+)/.exec(inj.text)[1]));
  const maf = g.find((x) => x.id === 'maf');
  if (maf) st = set(st, 'mafScalar', Number(/set the MAF scalar to (\d+\.\d+)/.exec(maf.text)[1]));
  const typed = new Map();
  const changed = [];
  const sitting = (kind) => {
    const a = advice(st, pull(st));
    const marks = kind === 'afr' ? a.wrongMix.filter((c) => c.suggested != null) : a.overAdvanced.filter((c) => !c.sparkCannotFix);
    for (const c of marks) {
      const was = typed.get(`${kind}|${c.ri}|${c.ci}`);
      if (was != null && (kind === 'timing' ? c.suggested < was - 0.01 : Math.abs(c.suggested - was) > 0.05)) changed.push(`${kind} ${c.ri},${c.ci}: typed ${was}, now ${c.suggested}`);
    }
    if (!marks.length) return 0;
    st = { ...st, tune: { ...st.tune, [kind]: st.tune[kind].map((r) => [...r]) } };
    for (const c of marks) { st.tune[kind][c.ri][c.ci] = c.suggested; typed.set(`${kind}|${c.ri}|${c.ci}`, c.suggested); }
    return marks.length;
  };
  sitting('afr'); sitting('afr');
  const spark = [sitting('timing'), sitting('timing')];
  // Then Correct VE from logs from a full-throttle pull, twice, as the log asks next; and spark
  // looked at once more with the fuelling right.
  const axes = S.layoutById(st.tune.layout).ve;
  for (let i = 0; i < 2; i += 1) {
    const { ratio } = S.veCorrections(S.veSamplesFromPull(pull(st).points), axes);
    st = { ...st, tune: { ...st.tune, ve: S.applyVeCorrections(st.tune.ve, ratio, 1) } };
  }
  sitting('afr'); spark.push(sitting('timing'));
  const p = pull(st);
  const a = advice(st, p);
  const step = guidedSteps({ build: st.build, tune: st.tune, target: made.action, samples: made.samples, advice: a }).find((x) => x.id === 'spark');
  return { changed, spark, p, a, step };
}

/**
 * TUNE's marks both ways (spark to take out, and room to add), every one typed as shown, pull
 * after pull from the factory tune: which typed numbers the next pull marks again the other way.
 */
function typeEveryMark(st0) {
  let st = st0;
  const typed = new Map();
  const reversed = [];
  for (let round = 0; round < 6; round += 1) {
    const a = advice(st, pull(st));
    const spark = [...a.overAdvanced, ...a.underAdvanced].filter((c) => !c.sparkCannotFix);
    const mix = a.wrongMix.filter((c) => c.suggested != null);
    for (const c of spark) {
      const was = typed.get(`${c.ri}|${c.ci}`);
      if (!was || was.round !== round - 1 || was.value !== c.current) continue;
      const now = Math.sign(c.suggested - c.current);
      // Adding timing a step at a time is ordinary tuning; anything else moved a typed number.
      if (!(was.dir > 0 && now > 0)) reversed.push(`${c.ri},${c.ci}: typed ${c.current}, now ${c.suggested}`);
    }
    if (!spark.length && !mix.length) return { reversed, rounds: round };
    st = { ...st, tune: { ...st.tune, timing: st.tune.timing.map((r) => [...r]), afr: st.tune.afr.map((r) => [...r]) } };
    for (const c of spark) {
      st.tune.timing[c.ri][c.ci] = c.suggested;
      typed.set(`${c.ri}|${c.ci}`, { value: c.suggested, round, dir: Math.sign(c.suggested - c.current) });
    }
    for (const c of mix) st.tune.afr[c.ri][c.ci] = c.suggested;
  }
  return { reversed, rounds: 6 };
}

describe('a number typed as TUNE marks it stays typed', { timeout: 120000 }, () => {
  for (const [name, make] of Object.entries(BUILDS)) {
    it(`${name}: every mark typed as shown, pull after pull, none reversed`, () => {
      const { reversed, rounds } = typeEveryMark(make());
      expect(reversed).toEqual([]);
      expect(rounds).toBeLessThan(6);
    });
  }

  for (const [name, make] of Object.entries(BUILDS)) {
    it(name, () => {
      const { changed, spark, p, a, step } = followTheMarks(make());
      expect(changed).toEqual([]);
      // One sitting of spark marks, and nothing after it.
      expect(spark.slice(1).every((n) => n === 0)).toBe(true);
      expect(a.overAdvanced.filter((c) => !c.sparkCannotFix)).toEqual([]);
      expect(p.events.filter((e) => KNOCK.includes(e.type)).map((e) => e.msg)).toEqual([]);
      expect(step.done).toBe(true);
    });
  }
});
