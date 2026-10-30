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

import { blowerCurve, curveAt, reachKpaAt, tankFuel } from '../../sim/index.js';
import { useBuild, useSession } from './StoreProvider.jsx';

/**
 * Whether a pull was made on the induction the build has now, so what it measured of the
 * boost still describes this engine: a turbo on the same boost target, a supercharger, or
 * neither. (A pull's own signature includes the tables, which would make the fade flicker
 * on every cell edit; the boost does not depend on those.) A turbine swapped for another
 * of the same target is not seen until the next pull; the target it asked for is.
 * @param {import('./initialState.js').StoreState['build']} build
 * @param {{points?: any[]}|null} result
 * @returns {boolean}
 */
export function pullDescribes(build, result) {
  const pts = result?.points;
  if (!pts?.length) return false;
  if (build.turboOn) {
    return pts.every((p) => {
      const asked = p.boostSteps?.[0]?.value;
      return typeof asked === 'number' && Math.abs(asked - curveAt(build.boostCurve, p.rpm)) < 0.06;
    });
  }
  if (build.blowerId) return pts.some((p) => p.blowerRpm != null);
  return !pts.some((p) => p.boostSteps?.length || p.blowerRpm != null);
}

/**
 * The most manifold pressure the engine reaches at each speed, kPa absolute.
 * @param {import('./initialState.js').StoreState['build']} build
 * @param {object|null} result the last dyno pull, if it was at full throttle
 * @returns {(rpm: number) => number}
 */
export function reachOf(build, result) {
  if (pullDescribes(build, /** @type {any} */ (result))) return reachKpaAt({ turboOn: build.turboOn, boostCurve: build.boostCurve, pull: /** @type {any} */ (result) });
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
