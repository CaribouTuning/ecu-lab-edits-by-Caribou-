/**
 * TUNE fades the cells the engine does not reach (state/reach.js): above the first load
 * breakpoint at or past the boost it makes at that column's speed.
 */

import { describe, expect, it } from 'vitest';

import { reachOf, unreachedCells } from '../../../src/ui/state/reach.js';

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
    const pull = { points: [{ rpm: 1500, boostPsi: 1 }, { rpm: 3000, boostPsi: 10 }, { rpm: 6000, boostPsi: 10 }] };
    const reach = reachOf(/** @type {any} */ (turbo), pull);
    expect(reach(1500)).toBeLessThan(120);
    expect(reach(6000)).toBeGreaterThan(165);
  });

  it('a pull an engine protection cut is judged at the boost asked for', () => {
    const pull = { points: [{ rpm: 1500, boostPsi: 2, protect: ['knock'] }, { rpm: 6000, boostPsi: 2, protect: ['knock'] }] };
    expect(reachOf(/** @type {any} */ (turbo), pull)(4000)).toBeGreaterThan(165);
  });

  it('only for a table on manifold pressure', () => {
    expect(unreachedCells({ ...axes, loadUnit: 'g/cyl' }, () => 0)).toEqual([]);
  });
});
