/**
 * What counts as "a different car" — pure, no DOM.
 *
 * The banked scores from a pull are only honest if something notices when the build
 * they were measured on stops being the build on screen. This is that something, and
 * the tests below are about its two failure directions, which are NOT symmetric:
 *
 * - Missing a real change is the serious one. It puts a stale score on screen with no
 *   warning, which is the whole bug (#29) wearing a different hat.
 * - Reporting a change that did not happen is merely annoying: a "build has changed"
 *   banner over numbers that are in fact current, cleared by running a pull.
 *
 * So the coverage is asymmetric on purpose: every measured input gets a test that it
 * is NOT ignored, and the fields that must not trigger it get one test between them.
 */

import { describe, expect, it } from 'vitest';

import { clone2D } from '../../../src/sim/index.js';
import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { pullSignature } from '../../../src/ui/state/pullSignature.js';

/**
 * Signs a state tree, optionally with one slice patched.
 * @param {object} [patch] `{build?, tune?, session?}` fields to override
 * @returns {string}
 */
function sign(patch = {}) {
  const s = makeInitialState();
  const build = { ...s.build, ...(/** @type {any} */ (patch).build ?? {}) };
  const tune = { ...s.tune, ...(/** @type {any} */ (patch).tune ?? {}) };
  const session = { ...s.session, ...(/** @type {any} */ (patch).session ?? {}) };
  return pullSignature(build, tune, session.loadKpa);
}

describe('pullSignature', () => {
  it('is stable for a configuration that has not moved', () => {
    expect(sign()).toBe(sign());
  });

  // Every field the sweep or the Engineer Score reads. A `.forEach` rather than one
  // test with twelve assertions so a regression names the field it dropped.
  /** @type {Array<[string, object]>} */
  const measuredBuildChanges = [
    ['engineConfig', { engineConfig: { ...makeInitialState().build.engineConfig, bore: 90 } }],
    ['mods', { mods: { intake: true, exhaust: false, headers: false, intercooler: false } }],
    ['turboOn', { turboOn: true }],
    ['boostCurve', { boostCurve: makeInitialState().build.boostCurve.map((b) => b + 1) }],
    ['octaneIdx', { octaneIdx: 1 }],
    ['injIdx', { injIdx: 1 }],
    ['mafScalar', { mafScalar: 0.9 }],
    ['turbineIdx', { turbineIdx: 0 }],
    ['turbineCount', { turbineCount: 2 }],
    ['compressorIdx', { compressorIdx: 0 }],
    ['exhaustDiaIdx', { exhaustDiaIdx: 0 }],
    ['ecuInjectorCc', { ecuInjectorCc: 550 }],
  ];
  for (const [field, build] of measuredBuildChanges) {
    it(`changes when ${field} does`, () => {
      expect(sign({ build })).not.toBe(sign());
    });
  }

  // The tables are the reason this exists as a module rather than a list of hardware
  // fields. In a tuning simulator, editing a table IS the change a player makes
  // between two pulls — a signature that watched hardware alone would report the
  // scorecard as current on the one screen it matters most.
  for (const table of ['ve', 'timing', 'afr']) {
    it(`changes when the ${table} table is edited`, () => {
      const base = makeInitialState().tune;
      const edited = clone2D(/** @type {any} */ (base)[table]);
      edited[0][0] += 1;
      expect(sign({ tune: { [table]: edited } })).not.toBe(sign());
    });
  }

  it('changes when the dyno is run at a different manifold load', () => {
    // `loadKpa` is fed straight into simulateSweep, so 40 kPa and 100 kPa are two
    // different measurements of the same car — and the scores from one are not the
    // scores of the other.
    expect(sign({ session: { loadKpa: 40 } })).not.toBe(sign());
  });

  it('ignores labels and cursors, which cannot change a number', () => {
    // A signature that moved on any of these would put a "build has changed" banner up
    // for clicking a grid cell or opening a dialog. None of them reaches the
    // simulation: `presetId` names a build rather than being part of one, and the
    // other four are UI state.
    expect(sign({
      build: { presetId: 'n54', presetPrompt: { id: 'k20' }, boostSel: 7 },
      tune: { tablesDirty: true, selection: { type: 'cell', row: 1, col: 1 } },
    })).toBe(sign());
  });

  it('ignores the pull\'s own output, so banking a result cannot invalidate it', () => {
    // The trap this closes: sign the whole session slice and every banked pull would
    // instantly stale ITSELF, because BANK_PULL writes result/health/career totals in
    // the same pass the scores are banked in.
    expect(sign({
      session: {
        result: { peakHp: 410 }, prevResult: { peakHp: 380 }, revealCount: 40,
        bestScore: 500, totalScore: 900, pullCount: 3,
        health: { piston: 90, bearing: 95, valve: 99 },
      },
    })).toBe(sign());
  });

  it('ignores the live engine, which runs at 20 Hz beside the dyno', () => {
    // `session.live` changes twenty times a second while the engine idles. Signing it
    // would make a banked score go stale within one tick of pressing START, on a car
    // nobody had touched.
    expect(sign({ session: { live: { rpm: 3200, running: true }, throttleInput: 100 } }))
      .toBe(sign());
  });
});
