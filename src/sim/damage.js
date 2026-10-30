/**
 * Engine damage: what a worn part does to the engine, how parts wear while it runs, and
 * how it fails.
 *
 * Health is three numbers, percent of life left: the pistons and rings, the bearings
 * (crank and rod), and the valves. They are worn by the conditions that wear the real
 * parts, all of them quantities the model already solves: knock that happened, a lean or
 * rich mixture under load, peak cylinder pressure past what the parts carry, and on the
 * live engine oil starvation, overspeed past the bottom end's rating and boiling coolant.
 *
 * A worn part changes the engine through the physics, never by docking power:
 *   pistons and rings  blow-by. Part of the trapped charge, air and fuel together, escapes
 *                      past the rings into the crankcase before it burns. The breather
 *                      returns it to the intake, so the MAF and the wideband read the
 *                      same mixture as before; the cylinder simply burns less of it. A
 *                      worn-out ring pack loses about 1% of the charge this way: worn
 *                      rings show far more as smoke and crankcase pressure than as power.
 *   valves             a burnt valve leaks its cylinder's charge back into the port, and
 *                      past a point that cylinder stops firing. Either way it is one
 *                      cylinder's work lost, never more.
 *   bearings           opened clearances pass more oil (Poiseuille flow, the cube of the
 *                      clearance), so the pump makes less pressure below its relief
 *                      valve: low oil pressure at hot idle. They do not add friction.
 *
 * At zero a part has failed and the engine with it: the failure is a state, not a
 * number. A failed engine does not run until it is rebuilt.
 *
 * Every number, with its source or marked as a calibration: docs/damage-model.md.
 */

import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

/** @typedef {{piston: number, bearing: number, valve: number}} Health */
/** @typedef {'piston'|'bearing'|'valve'} Part */

/** The three parts, in the order a tie between them is broken. */
export const DAMAGE_PARTS = /** @type {Part[]} */ (['bearing', 'piston', 'valve']);

/**
 * How each part fails when its life runs out: what happens inside the engine.
 * @type {Record<Part, {title: string, cause: string}>}
 */
export const FAILURE_MODES = {
  piston: {
    title: 'Holed piston',
    cause: 'A piston crown melted through and its ring lands fractured: what knock, a lean mixture or too much boost does to a piston (MAHLE, piston damage §2.1.2 and §3.2). Combustion blew straight into the crankcase and pressurised it, pushing oil out past the seals and the breather. The cylinder has no compression and the engine is not fit to run.',
  },
  bearing: {
    title: 'Spun rod bearing, rod through the block',
    cause: 'A rod bearing lost its oil film. Its overlay melted and welded to the crank journal, and the shell spun in the rod (MAHLE, bearing damage §6.8). The rod overheated and broke, and the loose rod punched through the side of the block.',
  },
  valve: {
    title: 'Burnt-through exhaust valve',
    cause: 'An exhaust valve that no longer sealed could not pass its heat to the seat: it cracked, and a wedge of its head melted away (MAHLE, valve damage §5.7). The cylinder has no compression, and pieces of the valve are loose in the chamber, where running on would wreck the piston and the head.',
  },
};

/** Full health. @returns {Health} */
export const healthyEngine = () => ({ piston: 100, bearing: 100, valve: 100 });

/**
 * The part that has failed, if one has: the first at zero.
 * @param {Health|null|undefined} health
 * @returns {Part|null}
 */
export function failedPart(health) {
  if (!health) return null;
  return DAMAGE_PARTS.find((p) => health[p] <= 0) ?? null;
}

/**
 * Health after wear: each part's life less what it wore, never below zero.
 * @param {Health} health
 * @param {Health} wear
 * @returns {Health}
 */
export function applyWear(health, wear) {
  // Wear only takes life: a negative figure (a bad input, never a rate) must not heal a part.
  const take = (part) => clamp(health[part] - Math.max(0, wear[part]), 0, 100);
  return { piston: take('piston'), bearing: take('bearing'), valve: take('valve') };
}

/**
 * What the wear does to the running engine, as the physical quantities `evaluatePoint`
 * takes (its `wear` input). A healthy engine returns null: nothing to apply.
 *
 *   ringLeakFrac   share of every cylinder's trapped charge lost past the rings
 *   cylLossFrac    share of the engine's work lost to the burnt valve's cylinder: what
 *                  leaks out of it, and all of it once it stops firing (counted once)
 *   deadFrac       share of the engine's firing events that no longer fire (the log's
 *                  misfire column)
 * @param {Health|null|undefined} health
 * @param {number} cyl cylinders
 *   oilConductance how much more freely the oil system leaks than when new (1 new): the
 *                  pump's pressure below its relief valve divides by it
 * @returns {{ringLeakFrac: number, cylLossFrac: number, deadFrac: number, oilConductance: number}|null}
 */
export function wearEffects(health, cyl) {
  if (!health) return null;
  const lost = (p) => clamp(1 - health[p] / 100, 0, 1);
  const ring = lost('piston');
  const valve = lost('valve');
  const bearing = lost('bearing');
  if (ring === 0 && valve === 0 && bearing === 0) return null;
  // Blow-by goes with the gap the rings leave: a ring's end gap opens by 2π times its
  // radial wear, so the leak path grows in proportion to the wear.
  const ringLeakFrac = COEFF.DAMAGE_RING_LEAK_MAX * ring;
  // One burnt valve: within its cylinder, the share of the charge it leaks, and whether
  // the cylinder still fires at all.
  const valveLeak = COEFF.DAMAGE_VALVE_LEAK_MAX * valve ** 1.5;
  const valveDead = health.valve < COEFF.DAMAGE_VALVE_DEAD_BELOW
    ? 1 - clamp(health.valve, 0, 100) / COEFF.DAMAGE_VALVE_DEAD_BELOW : 0;
  return {
    ringLeakFrac,
    cylLossFrac: (1 - (1 - valveLeak) * (1 - valveDead)) / cyl,
    deadFrac: valveDead / cyl,
    oilConductance: oilConductance(bearing),
  };
}

/**
 * How much more freely the oil system leaks with the crank bearings worn by `wear` (0 new,
 * 1 worn to the service limit): their clearance opens linearly with wear, and their
 * Poiseuille flow goes with its cube. 1 when new.
 * @param {number} wear
 * @returns {number}
 */
export function oilConductance(wear) {
  const k = 1 + (COEFF.DAMAGE_BEARING_CLEARANCE_WORN - 1) * clamp(wear, 0, 1);
  return (1 - COEFF.DAMAGE_BEARING_OIL_SHARE) + COEFF.DAMAGE_BEARING_OIL_SHARE * k ** 3;
}

/**
 * Wear one solved operating point does to the pistons and valves, in the units of a
 * dyno pull's logged points. The dyno charges this per logged point; the live engine
 * charges it per the seconds a logged point stands for (`liveWear`).
 * @param {object} p an `evaluatePoint` record
 * @returns {{piston: number, valve: number}}
 */
export function pointWear(p) {
  let piston = 0, valve = 0;
  // Only knock that happened wears the piston. When the retard came from valvetrain
  // noise read as knock (the controller sits at the larger of the two, see
  // knockRetard in point.js), the engine ran further from its limit, not into it: that
  // costs power, which the pull log reports as false knock, but it hammers nothing.
  // It was once charged as detonation, so a big cam with the factory knock threshold
  // lost half its pistons to a noise.
  // `knockFalse` is logged to a tenth of a degree and `knockPull` is not, so the
  // comparison allows for that rounding.
  const realKnockDeg = p.knockPull > (p.knockFalse ?? 0) + 0.05 ? p.knockPull : 0;
  if (p.knock) piston += realKnockDeg * COEFF.WEAR_KNOCK;
  if (p.leanRisk) {
    if (p.valveRisk) valve += COEFF.WEAR_VALVE_LEAN_BOOST;
    else piston += COEFF.WEAR_LEAN;
  }
  // Bore wash: unburnt fuel stripping the cylinder film is a ring/bore wear mode.
  if (p.richRisk) piston += (COEFF.RICH_DAMAGE_LAMBDA - p.lambda) * COEFF.WEAR_RICH_BORE_WASH;
  // Mechanical overload: past a certain peak cylinder pressure the piston crown, the
  // ring lands and the rod are simply out of strength. This is a SEPARATE failure
  // mode from knock — a tune can be perfectly knock-free and still be pounding the
  // bottom end apart, which is what happens when a high-octane fuel is used to make
  // high static compression survivable under boost.
  if (p.pressureRisk) piston += (p.peakPressure - COEFF.PEAK_PRESSURE_LIMIT_BAR) * COEFF.WEAR_PISTON_PER_BAR;
  // Knock nobody corrected: the ECU could not hear it, so it ran on. This is the knock
  // that destroys pistons, charged far above knock the controller caught and pulled.
  if (p.knockUnheard > 0) piston += p.knockUnheard * COEFF.WEAR_KNOCK_UNHEARD;
  return { piston, valve };
}

/**
 * Where in a dyno pull an engine that started it at `health` fails, if it does.
 *
 * The pull's wear is charged as it always is; this spreads each part's share along the
 * pull by where it was earned (pistons and valves point by point, bearings by each
 * point's peak pressure over the bottom end's free threshold) and finds the first point
 * at which a part's life runs out.
 * @param {object[]} points the pull's records
 * @param {Health} wear what the whole pull costs each part
 * @param {Health} health each part's life at the start of the pull
 * @param {number} bearingFreeBar the bottom end's free threshold
 * @param {{piston: number, valve: number}[]} [per] each point's `pointWear`, if the
 *   caller already has it
 * @returns {{index: number, part: Part, spent: Health}|null} where it fails, and what
 *   the pull to there cost each part
 */
export function sweepFailure(points, wear, health, bearingFreeBar, per = points.map(pointWear)) {
  const already = failedPart(health);
  if (already) return { index: 0, part: already, spent: { piston: 0, bearing: 0, valve: 0 } };
  if (!points.length) return null;
  const press = points.map((p) => Math.max(0, p.peakPressure - bearingFreeBar));
  const pressSum = press.reduce((a, b) => a + b, 0);
  const pistonSum = per.reduce((a, w) => a + w.piston, 0);
  const valveSum = per.reduce((a, w) => a + w.valve, 0);
  const share = {
    piston: (i) => (pistonSum > 0 ? per[i].piston / pistonSum : 1 / points.length),
    valve: (i) => (valveSum > 0 ? per[i].valve / valveSum : 1 / points.length),
    bearing: (i) => (pressSum > 0 ? press[i] / pressSum : 1 / points.length),
  };
  const spent = { piston: 0, bearing: 0, valve: 0 };
  for (let i = 0; i < points.length; i += 1) {
    for (const part of DAMAGE_PARTS) spent[part] += wear[part] * share[part](i);
    const part = DAMAGE_PARTS.find((p) => wear[p] > 0 && spent[p] >= health[p] - 1e-9);
    if (part) return { index: i, part, spent };
  }
  return null;
}

/**
 * The live engine's wear over one step, percent of each part's life.
 *
 * The dyno's own rates, per second: a logged dyno point stands for `pointSeconds` of
 * running, so a second at the same point costs the same as on the dyno. Then what only
 * a running engine on the stand can do to itself: run its bearings short of oil, rev
 * past what its bottom end is rated for, and boil its coolant.
 * @param {object} input
 * @param {object} input.pt the step's `evaluatePoint` record
 * @param {number} input.dt seconds
 * @param {number} input.rpm
 * @param {number} input.oilKpa oil pressure
 * @param {number} input.healthyOilKpa what a healthy pump and bearings give at this speed
 *   and oil temperature
 * @param {number} input.coolantC
 * @param {number} input.ratedRpm the bottom end's rated speed
 * @param {number} input.bearingFreeBar the bottom end's free threshold
 * @param {number} input.bearingWearMult the block's bearing wear multiplier
 * @param {number} input.pointSeconds how long one logged dyno point lasts
 * @param {number} input.pullSeconds how long a dyno pull lasts
 * @returns {Health} wear this step
 */
export function liveWear({ pt, dt, rpm, oilKpa, healthyOilKpa, coolantC, ratedRpm, bearingFreeBar, bearingWearMult, pointSeconds, pullSeconds }) {
  const w = pointWear(pt);
  const k = dt / pointSeconds;
  let piston = w.piston * k;
  let valve = w.valve * k;
  // A dyno pull charges its average peak pressure over the threshold once; a second of
  // running at it costs that over the pull's length. The threshold is for a pull's
  // average, so one instant is judged against it plus the spread a stock pull shows
  // between its average and its highest point.
  const pointFreeBar = bearingFreeBar + COEFF.BEARING_LIVE_POINT_SPREAD_BAR;
  let bearing = Math.max(0, pt.peakPressure - pointFreeBar) * COEFF.WEAR_BEARING_PER_BAR * bearingWearMult * (dt / pullSeconds);
  // Oil starvation: the film holds while pressure stays within a share of what this
  // engine's own healthy pump gives at this speed and oil temperature (hot thin oil at
  // idle is normal, not starvation); short of it, the bearing runs metal to metal.
  const needKpa = Math.max(COEFF.DAMAGE_OIL_FILM_MIN_KPA, healthyOilKpa * COEFF.DAMAGE_OIL_FILM_SHARE);
  if (rpm > 300 && oilKpa < needKpa) bearing += COEFF.DAMAGE_OIL_STARVE_PER_S * (1 - oilKpa / needKpa) * dt;
  // Overspeed: inertia load on the rod grows with the square of engine speed. Up to a
  // margin over the rating it is carried without wear: a factory engine is rated at its
  // own limiter, and bouncing off it is not abuse.
  const overLoad = ratedRpm > 0 ? (rpm / ratedRpm) ** 2 - COEFF.DAMAGE_OVERSPEED_FREE_LOAD : 0;
  if (overLoad > 0) bearing += COEFF.DAMAGE_OVERSPEED_PER_S * overLoad * dt;
  // Boiling coolant: the head and the bores lose their cooling and scuff and burn.
  const hot = coolantC - COEFF.DAMAGE_OVERHEAT_C;
  if (hot > 0) {
    piston += COEFF.DAMAGE_OVERHEAT_PER_C_S * hot * dt;
    valve += COEFF.DAMAGE_OVERHEAT_PER_C_S * hot * dt;
  }
  return { piston, bearing, valve };
}
