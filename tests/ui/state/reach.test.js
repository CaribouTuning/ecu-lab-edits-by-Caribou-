/**
 * TUNE fades the cells the engine does not reach (state/reach.js): above the first load
 * breakpoint at or past the boost it makes at that column's speed.
 */

import { describe, expect, it } from 'vitest';

import { pullDescribes, reachOf, unreachedCells } from '../../../src/ui/state/reach.js';

/** @type {import('../../../src/sim/layouts.js').TableAxes} */
const axes = { loadUnit: 'kPa', load: [200, 150, 100, 70, 40], rpm: [1000, 3000, 6000] };
const turbo = { turboOn: true, boostCurve: Array(8).fill(10), blowerId: null };

describe('which cells the engine reaches', () => {
  it('fades every row above the one the engine interpolates into at each speed', () => {
    // 50 kPa at 1000 rpm, 140 at 3000, 185 at 6000.
    const reach = (rpm) => ({ 1000: 50, 3000: 140, 6000: 185 })[rpm];
    expect(unreachedCells(axes, reach).sort()).toEqual(['0:0', '0:1', '1:0', '2:0'].sort());
  });

  it('reads the boost the last full-throttle pull made, never more than the target', () => {
    const asked = [{ label: 'Base target (BUILD curve)', value: 10 }];
    const pull = { points: [{ rpm: 1500, boostPsi: 1, boostSteps: asked }, { rpm: 3000, boostPsi: 10, boostSteps: asked }, { rpm: 6000, boostPsi: 10, boostSteps: asked }] };
    const reach = reachOf(/** @type {any} */ (turbo), pull);
    expect(reach(1500)).toBeLessThan(120);
    expect(reach(6000)).toBeGreaterThan(165);
  });

  it('a pull an engine protection cut is judged at the boost asked for', () => {
    const asked = [{ label: 'Base target (BUILD curve)', value: 10 }];
    const pull = { points: [{ rpm: 1500, boostPsi: 2, protect: ['knock'], boostSteps: asked }, { rpm: 6000, boostPsi: 2, protect: ['knock'], boostSteps: asked }] };
    expect(reachOf(/** @type {any} */ (turbo), pull)(4000)).toBeGreaterThan(165);
  });

  it('only for a table on manifold pressure', () => {
    expect(unreachedCells({ ...axes, loadUnit: 'g/cyl' }, () => 0)).toEqual([]);
  });

  it('does not trust a pull made on a different boost target or a different kind of induction', () => {
    const asked = (v) => [{ label: 'Base target (BUILD curve)', value: v }];
    const pull = (v) => ({ points: [1500, 3000, 6000].map((rpm) => ({ rpm, boostPsi: v, boostSteps: asked(v) })) });
    expect(pullDescribes(/** @type {any} */ (turbo), pull(10))).toBe(true);
    // The player has since turned the boost up: the pull says nothing of the new target.
    expect(pullDescribes(/** @type {any} */ ({ ...turbo, boostCurve: Array(8).fill(14) }), pull(10))).toBe(false);
    // A pull of a turbo says nothing of an engine that is now naturally aspirated, and the reverse.
    expect(pullDescribes(/** @type {any} */ ({ turboOn: false, boostCurve: Array(8).fill(0), blowerId: null }), pull(10))).toBe(false);
    expect(pullDescribes(/** @type {any} */ ({ turboOn: false, boostCurve: [], blowerId: null }), { points: [{ rpm: 3000, boostPsi: 0, boostSteps: [] }] })).toBe(true);
    expect(pullDescribes(/** @type {any} */ (turbo), null)).toBe(false);
    // A stale pull falls back to the target: the engine is judged by what it is asked for.
    expect(reachOf(/** @type {any} */ ({ ...turbo, boostCurve: Array(8).fill(14) }), pull(2))(4000)).toBeGreaterThan(190);
  });
});
