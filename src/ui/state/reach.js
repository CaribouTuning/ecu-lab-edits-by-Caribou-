/**
 * Which cells of a table the engine reaches: TUNE greys the rest, so boost rows past what
 * the engine makes at a speed are not mistaken for cells it runs.
 *
 * The rule is the advisor's (sim/advisors.js `reachKpaAt`): what the last full-throttle
 * pull made at each speed, never more than the boost asked for, and the boost asked for
 * where a protection cut it. Until a pull is made, a turbo reaches its target and a
 * supercharger what its pulley makes (`blowerCurve`).
 */

import React from 'react';

import { blowerCurve, reachKpaAt, tankFuel } from '../../sim/index.js';
import { useBuild, useSession } from './StoreProvider.jsx';

/**
 * The most manifold pressure the engine reaches at each speed, kPa absolute.
 * @param {import('./initialState.js').StoreState['build']} build
 * @param {object|null} result the last dyno pull, if it was at full throttle
 * @returns {(rpm: number) => number}
 */
export function reachOf(build, result) {
  if (result?.points?.length) return reachKpaAt({ turboOn: build.turboOn, boostCurve: build.boostCurve, pull: result });
  const wot = build.blowerId ? blowerCurve(build, tankFuel(build)) : [];
  return reachKpaAt({ turboOn: build.turboOn, boostCurve: build.boostCurve, pull: wot.length ? { points: wot } : null });
}

/**
 * The cells (`row:col`) above the first load breakpoint at or past what the engine reaches
 * at that column's speed. The breakpoint just above the pressure is still read (the ECU
 * interpolates between the two either side), so it is reached; everything above it is not.
 * Only for a table on manifold pressure.
 * @param {import('../../sim/layouts.js').TableAxes} axes
 * @param {(rpm: number) => number} reach
 * @returns {string[]}
 */
export function unreachedCells(axes, reach) {
  if (axes.loadUnit !== 'kPa') return [];
  const keys = [];
  axes.rpm.forEach((rpm, ci) => {
    const kpa = reach(rpm);
    const at = axes.load.filter((l) => l >= kpa - 0.5);
    const edge = at.length ? Math.min(...at) : Math.max(...axes.load);
    axes.load.forEach((load, ri) => { if (load > edge + 0.5) keys.push(`${ri}:${ci}`); });
  });
  return keys;
}

/**
 * `unreachedCells` for the build on the bench and its last full-throttle pull.
 * @param {import('../../sim/layouts.js').TableAxes} axes
 * @returns {string[]}
 */
export function useUnreached(axes) {
  const [build] = useBuild();
  const [session] = useSession();
  const result = session.loadKpa === 100 ? session.result : null;
  return React.useMemo(() => unreachedCells(axes, reachOf(build, result)), [axes, build, result]);
}
