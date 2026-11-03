/**
 * BREATHING: the gas exchange of one cylinder, crank angle by crank angle.
 *
 * Volumetric efficiency is not looked up. It is what is left in the cylinder when the
 * intake valve closes, from the engine's own geometry and the pressures around it:
 *
 *   - the EXHAUST VALVE, an orifice between the cylinder and the exhaust manifold, open from
 *     EVO to EVC. Gas flows whichever way the pressures push it: out on the exhaust stroke,
 *     and back in during overlap when the manifold sits above the cylinder (a throttled
 *     engine, or a turbine holding pressure upstream of itself);
 *   - the INTAKE VALVE, an orifice whose area follows the lift, open from IVO to IVC;
 *   - the INTAKE RUNNER, a column of air with mass. Pressure difference accelerates it,
 *     the valve's restriction slows it. Late in the intake stroke the moving column keeps
 *     packing air in against a rising piston (ram), and at low speed the rising piston
 *     pushes charge back out past a valve that is still open. Both come out of the one
 *     equation, as the speed changes; neither is a fitted term;
 *   - the CYLINDER, one zone, its mass and temperature from the first law with the piston
 *     moving (slider-crank, the cycle's own rod ratio) and the walls heating the charge.
 *
 * The trapped FRESH charge at IVC, against the plenum's density times the displacement, is
 * the volumetric efficiency on the speed-density basis the ECU's VE table uses. The burned
 * gas still in the cylinder is the residual.
 *
 * Equations: compressible orifice flow, Heywood, Internal Combustion Engine Fundamentals
 * (McGraw-Hill, 1988), Appendix C, used for both valves; the valve open area is the lesser
 * of the curtain area pi*Dv*L and the port throat; the gas-exchange heat transfer is
 * Woschni's correlation with his gas-exchange velocity constant (SAE 670931; Heywood ch. 12).
 * The runner is the lumped-inertia (Helmholtz) intake of Engelman's tuned-manifold analysis,
 * and of the "filling and emptying" class of engine models (Heywood ch. 14): one mode of the
 * runner's acoustics, not the full wave action of a 1-D code. What that leaves out is said
 * where it matters, below.
 */

import { BARO_KPA, R_AIR } from './constants.js';
import { COEFF } from './coefficients.js';
import { clamp } from './math.js';

const DEG = Math.PI / 180;
const GAMMA = 1.4;
const CV = R_AIR / (GAMMA - 1);
const CP = CV + R_AIR;

/**
 * Mass flow through an orifice, compressible, either direction (Heywood App. C, C.8-C.9).
 * @param {number} cdA effective area, m^2
 * @param {number} pUp upstream pressure, Pa
 * @param {number} tUp upstream temperature, K
 * @param {number} pDown downstream pressure, Pa
 * @returns {number} kg/s, from up to down (>= 0)
 */
export function orificeFlow(cdA, pUp, tUp, pDown) {
  if (cdA <= 0 || pUp <= pDown) return 0;
  const pr = Math.max(pDown / pUp, ORIFICE_CRITICAL_PR);
  const psi = Math.sqrt((2 * GAMMA / (GAMMA - 1)) * (pr ** (2 / GAMMA) - pr ** ((GAMMA + 1) / GAMMA)));
  return (cdA * pUp / Math.sqrt(R_AIR * tUp)) * psi;
}
/** The pressure ratio at which an orifice chokes, for gamma 1.4: (2/(gamma+1))^(gamma/(gamma-1)). */
const ORIFICE_CRITICAL_PR = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));

/**
 * Valve lift at a point in its event, as a share of the maximum: a raised cosine, zero at
 * opening and closing with a smooth peak at the middle (the idealised lift curve).
 * @param {number} phase 0 at opening, 1 at closing
 * @returns {number} 0..1
 */
export function liftShare(phase) {
  if (phase <= 0 || phase >= 1) return 0;
  const s = Math.sin(Math.PI * phase);
  return s * s;
}

/** Lift at which cam duration is quoted: 0.050 inch, the industry's standard checking height. */
export const DURATION_CHECK_LIFT_M = 0.050 * 0.0254;

/**
 * The valve events, crank degrees from TDC of the gas-exchange stroke (0 = TDC overlap):
 * the exhaust opens before the bottom of the power stroke and closes after TDC, the intake
 * opens before TDC and closes after the bottom of the intake stroke. IVO and EVO negative.
 *
 * Duration is the cam's duration at 0.050 inch lift, as cams are specified, and the intake
 * closes at that height where the cycle already has it (cycle.js `ivcAfterBdcDeg`, moved by
 * a phaser's advance). The valve itself is open longer, from its seat: with the raised-
 * cosine lift curve, the share of the seat-to-seat event spent above the checking height
 * follows from the maximum lift, so the seat events come out of the same curve. The exhaust
 * lobe mirrors the intake about TDC, moved by an exhaust phaser's retard.
 *
 * @param {{ivcAbdc: number, durationDeg: number, exhaustRetardDeg?: number, maxLiftM?: number}} cam
 * @returns {{ivo: number, ivc: number, evo: number, evc: number}} seat-to-seat events
 */
export function valveEvents({ ivcAbdc, durationDeg, exhaustRetardDeg = 0, maxLiftM = 0 }) {
  // Share of the event at each end spent below the checking height (raised cosine).
  const below = maxLiftM > DURATION_CHECK_LIFT_M
    ? Math.asin(Math.sqrt(DURATION_CHECK_LIFT_M / maxLiftM)) / Math.PI : 0;
  const seat = durationDeg / (1 - 2 * below);
  const ivcCheck = 180 + ivcAbdc;
  const centre = ivcCheck - durationDeg / 2;
  const ivo = centre - seat / 2;
  const ivc = centre + seat / 2;
  const evc = -ivo + exhaustRetardDeg;
  const evo = evc - seat;
  return { ivo, ivc, evo, evc };
}

/**
 * @typedef {object} BreathingGeometry
 * @property {number} boreM
 * @property {number} strokeM
 * @property {number} compression static compression ratio
 * @property {number} rodRatio rod length / crank radius
 * @property {number} intakeValves per cylinder
 * @property {number} intakeValveM head diameter, m
 * @property {number} exhaustValves per cylinder
 * @property {number} exhaustValveM head diameter, m
 * @property {number} liftPerDia maximum lift / valve diameter
 * @property {number} runnerLengthM intake runner, plenum to valve, m
 * @property {number} runnerAreaM2 runner cross-section, m^2
 * @property {{ivo: number, ivc: number, evo: number, evc: number}} events
 */

/**
 * @typedef {object} BreathingResult
 * @property {number} ve fresh charge trapped at IVC, % of plenum density x displacement
 * @property {number} residualFrac burned gas in the trapped charge, share of its mass
 * @property {number} trappedK charge temperature at IVC, K
 * @property {number} freshKg fresh charge trapped, kg per cylinder per cycle
 * @property {number} backflowShare intake charge pushed back out before IVC, share of the fresh air taken in
 */

/**
 * One cylinder's gas exchange at a steady speed and pressures.
 *
 * Integrated from bottom dead centre of the power stroke (the blowdown is assumed done: the
 * cylinder starts at the exhaust manifold's pressure and temperature) through the exhaust
 * stroke, overlap and the intake stroke, to IVC.
 *
 * @param {BreathingGeometry} g
 * @param {object} op
 * @param {number} op.rpm
 * @param {number} op.plenumKpa intake plenum (manifold) pressure, kPa absolute
 * @param {number} op.intakeK charge temperature in the plenum, K
 * @param {number} op.exhaustKpa exhaust manifold pressure, kPa absolute
 * @param {number} op.exhaustK exhaust gas temperature, K
 * @returns {BreathingResult}
 */
export function gasExchange(g, op) {
  const { rpm, intakeK, exhaustK } = op;
  const pPlenum = op.plenumKpa * 1000;
  const pExh = op.exhaustKpa * 1000;
  const swept = (Math.PI / 4) * g.boreM * g.boreM * g.strokeM;
  const clearance = swept / (g.compression - 1);
  const volume = (deg) => {
    const th = deg * DEG;
    const s = Math.sin(th);
    return clearance + (swept / 2) * (g.rodRatio + 1 - Math.cos(th) - Math.sqrt(Math.max(0, g.rodRatio ** 2 - s * s)));
  };
  // Open area of one valve set at a crank angle: the curtain while the valve is low, the
  // port throat once it is high; times its discharge coefficient.
  const valveArea = (deg, open, close, n, dia) => {
    const lift = g.liftPerDia * dia * liftShare((deg - open) / (close - open));
    if (lift <= 0) return 0;
    const curtain = Math.PI * dia * lift;
    const throat = (Math.PI / 4) * (COEFF.BREATH_THROAT_SHARE * dia) ** 2;
    return n * COEFF.BREATH_VALVE_CD * Math.min(curtain, throat);
  };
  const { ivo, ivc, evo, evc } = g.events;
  const step = COEFF.BREATH_STEP_DEG;
  const dt = step / (6 * Math.max(rpm, 60));
  const rhoPlenum = pPlenum / (R_AIR * intakeK);
  const boreArea = (Math.PI / 4) * g.boreM * g.boreM;
  const meanPistonSpeed = 2 * g.strokeM * (rpm / 60);
  const wallK = COEFF.WALL_TEMP_K;

  // Start: bottom of the power stroke, blown down to the exhaust manifold.
  let theta = -180;
  let v = volume(theta);
  let t = exhaustK;
  let m = pExh * v / (R_AIR * t);
  let fresh = 0;
  // The runner's air column: velocity toward the cylinder, and any burned gas overlap has
  // pushed back into it, which is breathed in again first.
  let u = 0;
  let runnerBurned = 0;
  let taken = 0;
  let pushedBack = 0;

  while (theta < ivc) {
    const next = Math.min(theta + step, ivc);
    const vNext = volume(next);
    const p = m * R_AIR * t / v;
    const mid = (theta + next) / 2;

    // EXHAUST VALVE: out on the exhaust stroke, back in when the manifold is higher.
    let dmEx = 0; // + into the cylinder
    let hEx = 0;
    if (mid > evo && mid < evc) {
      const a = valveArea(mid, evo, evc, g.exhaustValves, g.exhaustValveM);
      if (p > pExh) { dmEx = -orificeFlow(a, p, t, pExh) * dt; hEx = CP * t; } else { dmEx = orificeFlow(a, pExh, exhaustK, p) * dt; hEx = CP * exhaustK; }
      dmEx = Math.max(dmEx, -0.9 * m);
    }

    // INTAKE: the runner column, driven by plenum-to-cylinder pressure, held back by the
    // valve. Implicit in its velocity, so a closing valve stops it however short the step:
    //   rho L du/dt = (pPlenum - p) - k u|u|,  k = rho Ar^2 / (2 (Cd Av)^2)
    let dmIn = 0;
    let hIn = 0;
    if (mid > ivo && mid < ivc) {
      const a = valveArea(mid, ivo, ivc, g.intakeValves, g.intakeValveM);
      const inertia = rhoPlenum * g.runnerLengthM * (g.columnShare ?? COEFF.BREATH_COLUMN_SHARE) / dt;
      // Losses on the column's dynamic pressure: the valve's restriction, the runner's wall
      // friction (Darcy, f L/D) and the entrance from the plenum.
      const runnerD = Math.sqrt((4 * g.runnerAreaM2) / Math.PI);
      const pipeLoss = (rhoPlenum * (COEFF.BREATH_RUNNER_FRICTION * g.runnerLengthM / runnerD + COEFF.BREATH_RUNNER_ENTRY_K)) / 2;
      const k = a > 0 ? (rhoPlenum * g.runnerAreaM2 ** 2) / (2 * a * a) + pipeLoss : Infinity;
      const drive = (pPlenum - p) + inertia * u;
      if (!Number.isFinite(k)) u = 0;
      else {
        // k u|u| + inertia u - drive = 0, solved for the sign drive gives.
        const sgn = drive >= 0 ? 1 : -1;
        u = sgn * (-inertia + Math.sqrt(inertia * inertia + 4 * k * Math.abs(drive))) / (2 * k);
      }
      // Never faster than the valve can pass: choked flow at the upstream state.
      let mdot = rhoPlenum * g.runnerAreaM2 * u;
      const choke = u >= 0 ? orificeFlow(a, pPlenum, intakeK, 0) : orificeFlow(a, p, t, 0);
      if (Math.abs(mdot) > choke) { mdot = Math.sign(mdot) * choke; u = mdot / (rhoPlenum * g.runnerAreaM2); }
      dmIn = mdot * dt;
      if (dmIn > 0) { taken += dmIn; hIn = CP * intakeK; } else { pushedBack -= dmIn; hIn = CP * t; dmIn = Math.max(dmIn, -0.9 * m); }
    } else u = 0;

    // Wall heat: Woschni's correlation with his gas-exchange velocity, 6.18 x mean piston speed.
    const area = 2 * boreArea + Math.PI * g.boreM * ((v - clearance) / boreArea);
    const h = COEFF.WOSCHNI_K * g.boreM ** -0.2 * (p / 1000) ** 0.8 * t ** -0.55 * (COEFF.WOSCHNI_GAS_EXCHANGE_C1 * meanPistonSpeed) ** 0.8;
    const q = h * area * (wallK - t) * dt;

    // First law, one zone: m cv dT = sum(dm_in (h_in - cv T)) - sum(dm_out R T) - p dV + q
    const mOld = m;
    const inEnergy = (dmEx > 0 ? dmEx * (hEx - CV * t) : -dmEx * (-R_AIR * t))
      + (dmIn > 0 ? dmIn * (hIn - CV * t) : -dmIn * (-R_AIR * t));
    m = mOld + dmEx + dmIn;
    t = Math.max(200, t + (inEnergy - p * (vNext - v) + q) / (m * CV));

    // What the charge is made of: fresh air in from the runner (burned gas the runner holds
    // goes in first), burned gas in from the exhaust; out goes the mixture as it stands.
    const freshShare = clamp(fresh / Math.max(mOld, 1e-12), 0, 1);
    if (dmIn > 0) {
      const burnedIn = Math.min(runnerBurned, dmIn);
      runnerBurned -= burnedIn;
      fresh += dmIn - burnedIn;
    } else if (dmIn < 0) {
      fresh += dmIn * freshShare;
      runnerBurned += -dmIn * (1 - freshShare);
    }
    if (dmEx < 0) fresh += dmEx * freshShare;
    fresh = clamp(fresh, 0, m);

    theta = next;
    v = vNext;
  }

  const freshKg = fresh;
  return {
    ve: (100 * freshKg) / (rhoPlenum * swept),
    residualFrac: clamp(1 - freshKg / Math.max(m, 1e-12), 0, 1),
    trappedK: t,
    freshKg,
    backflowShare: taken > 0 ? pushedBack / taken : 0,
  };
}

/** Atmospheric, for callers that do not carry a barometer. */
export const BREATH_BARO_KPA = BARO_KPA;

/**
 * Pressure lost through the exhaust system downstream of the ports, kPa: a sum of loss
 * coefficients times the dynamic pressure in the pipe, dp = K * rho * u^2 / 2. The pipe is
 * the player's diameter; K is the manifold (or headers), the catalyst and the cat-back
 * together. Headers and a free-flowing cat-back lower their own share of K; a narrower pipe
 * raises u, which the loss goes with the square of.
 *
 * The split of K is allocated so a stock system passes a factory engine's rated exhaust flow
 * at the backpressure the model carried before it had a pipe (about 19 kPa at 0.21 kg/s for
 * the VQ35DE on its 3.0 inch pipe): manifold 1.8, catalyst 1.5, cat-back 3.5; long-tube
 * headers 0.8 and a performance cat-back 1.5 in their place.
 *
 * @param {object} input
 * @param {number} input.flowKgS exhaust mass flow, kg/s
 * @param {number} input.exhaustK gas temperature, K
 * @param {number} input.pipeDiaIn pipe diameter, inches
 * @param {{headers?: boolean, exhaust?: boolean}} [input.mods]
 * @param {number} [input.baroKpa]
 * @returns {number} the pressure drop, kPa
 */
export function exhaustSystemDropKpa({ flowKgS, exhaustK, pipeDiaIn, mods = {}, baroKpa = BARO_KPA }) {
  if (!(flowKgS > 0)) return 0;
  const area = (Math.PI / 4) * (pipeDiaIn * 0.0254) ** 2;
  const k = (mods.headers ? COEFF.EXH_K_HEADERS : COEFF.EXH_K_MANIFOLD) + COEFF.EXH_K_CATALYST
    + (mods.exhaust ? COEFF.EXH_K_CATBACK_FREE : COEFF.EXH_K_CATBACK);
  // Density at the tailpipe end, near atmospheric: the drop is small against it.
  const rho = (baroKpa * 1000) / (R_AIR * exhaustK);
  const u = flowKgS / (rho * area);
  return (k * rho * u * u) / 2 / 1000;
}
