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
 *   pistons and rings  blow-by. Part of the trapped charge escapes past the rings, so
 *                      the cylinder holds less air than its VE says, and the ECU, fuelling
 *                      for the air it believes in, runs it rich.
 *   valves             a burnt valve leaks one cylinder's charge back into a port, and
 *                      past a point that cylinder stops firing.
 *   bearings           wiped bearings rub, which is friction, and their opened clearances
 *                      bleed oil, so oil pressure falls at every speed.
 *
 * At zero a part has failed and the engine with it: the failure is a state, not a
 * number. A failed engine does not run until it is rebuilt.
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
    cause: 'A piston crown burned through and its ring lands cracked. Combustion blew straight into the crankcase, pressurised it, and pushed the oil out past the seals and the breather: the cylinder has no compression and the engine will not run.',
  },
  bearing: {
    title: 'Spun rod bearing, rod through the block',
    cause: 'A rod bearing lost its oil film, seized to the crank and spun. The rod overheated, stretched and broke, and the loose rod punched through the side of the block.',
  },
  valve: {
    title: 'Dropped valve',
    cause: 'A burnt valve head broke off its stem at speed and was hammered between the piston and the head, wrecking both. The cylinder is open to the port and the engine will not run.',
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
 * What the wear does to the running engine, as the physical quantities `evaluatePoint`
 * takes (its `wear` input). A healthy engine returns null: nothing to apply.
 * @param {Health|null|undefined} health
 * @param {number} cyl cylinders
 * @returns {{leakFrac: number, deadFrac: number, bearingFmepPa: number, oilPressureFactor: number}|null}
 */
export function wearEffects(health, cyl) {
  if (!health) return null;
  const lost = (p) => clamp(1 - health[p] / 100, 0, 1);
  const ring = lost('piston');
  const valve = lost('valve');
  const bearing = lost('bearing');
  if (ring === 0 && valve === 0 && bearing === 0) return null;
  // Blow-by grows faster than linearly: the first wear seats the rings, the last opens gaps.
  const ringLeak = COEFF.DAMAGE_RING_LEAK_MAX * ring ** 1.5;
  // One burnt valve, so one cylinder's worth of the engine.
  const valveLeak = (COEFF.DAMAGE_VALVE_LEAK_MAX * valve ** 1.5) / cyl;
  const deadFrac = health.valve < COEFF.DAMAGE_VALVE_DEAD_BELOW
    ? (1 - clamp(health.valve, 0, 100) / COEFF.DAMAGE_VALVE_DEAD_BELOW) / cyl : 0;
  return {
    leakFrac: clamp(ringLeak + valveLeak, 0, 0.9),
    deadFrac,
    bearingFmepPa: COEFF.DAMAGE_BEARING_FMEP_PA * bearing ** 2,
    oilPressureFactor: 1 - COEFF.DAMAGE_BEARING_OIL_LOSS * bearing,
  };
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
  // Knock nobody corrected: the ECU could not hear it, so it ran on, and it is charged
  // at twice the rate of knock the controller caught and pulled.
  if (p.knockUnheard > 0) piston += p.knockUnheard * COEFF.WEAR_KNOCK * 2;
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
 * @returns {{index: number, part: Part}|null}
 */
export function sweepFailure(points, wear, health, bearingFreeBar) {
  const already = failedPart(health);
  if (already) return { index: 0, part: already };
  if (!points.length) return null;
  const per = points.map(pointWear);
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
    for (const part of DAMAGE_PARTS) {
      spent[part] += wear[part] * share[part](i);
      if (wear[part] > 0 && spent[part] >= health[part] - 1e-9) return { index: i, part };
    }
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
 * @param {number} input.coolantC
 * @param {number} input.ratedRpm the bottom end's rated speed
 * @param {number} input.bearingFreeBar the bottom end's free threshold
 * @param {number} input.bearingWearMult the block's bearing wear multiplier
 * @param {number} input.pointSeconds how long one logged dyno point lasts
 * @param {number} input.pullSeconds how long a dyno pull lasts
 * @returns {Health} wear this step
 */
export function liveWear({ pt, dt, rpm, oilKpa, coolantC, ratedRpm, bearingFreeBar, bearingWearMult, pointSeconds, pullSeconds }) {
  const w = pointWear(pt);
  const k = dt / pointSeconds;
  let piston = w.piston * k;
  let valve = w.valve * k;
  // A dyno pull charges its average peak pressure over the threshold once; a second of
  // running at it costs that over the pull's length.
  let bearing = Math.max(0, pt.peakPressure - bearingFreeBar) * COEFF.WEAR_BEARING_PER_BAR * bearingWearMult * (dt / pullSeconds);
  // Oil starvation: the film needs pressure that grows with speed (the old rule of ten
  // psi a thousand RPM); short of it, the bearing runs metal to metal.
  const needKpa = Math.max(COEFF.DAMAGE_OIL_FILM_MIN_KPA, (rpm / 1000) * COEFF.DAMAGE_OIL_FILM_KPA_PER_KRPM);
  if (rpm > 300 && oilKpa < needKpa) bearing += COEFF.DAMAGE_OIL_STARVE_PER_S * (1 - oilKpa / needKpa) * dt;
  // Overspeed: inertia load on the rod grows with the square of engine speed.
  if (ratedRpm > 0 && rpm > ratedRpm) bearing += COEFF.DAMAGE_OVERSPEED_PER_S * ((rpm / ratedRpm) ** 2 - 1) * dt;
  // Boiling coolant: the head and the bores lose their cooling and scuff and burn.
  const hot = coolantC - COEFF.DAMAGE_OVERHEAT_C;
  if (hot > 0) {
    piston += COEFF.DAMAGE_OVERHEAT_PER_C_S * hot * dt;
    valve += COEFF.DAMAGE_OVERHEAT_PER_C_S * hot * dt;
  }
  return { piston, bearing, valve };
}
