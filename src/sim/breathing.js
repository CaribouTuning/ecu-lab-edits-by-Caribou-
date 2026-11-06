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
  // pr^(2/g) - pr^((g+1)/g) is a(a - pr) with a = pr^(1/g): the same flow function with one
  // power instead of two. This runs thousands of times per engine cycle.
  const a = pr ** INV_GAMMA;
  const psi = Math.sqrt(ORIFICE_PSI_K * a * (a - pr));
  return (cdA * pUp / Math.sqrt(R_AIR * tUp)) * psi;
}
const INV_GAMMA = 1 / GAMMA;
const ORIFICE_PSI_K = (2 * GAMMA) / (GAMMA - 1);
/** The pressure ratio at which an orifice chokes, for gamma 1.4: (2/(gamma+1))^(gamma/(gamma-1)). */
const ORIFICE_CRITICAL_PR = (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1));

/**
 * Valve lift at a point in its event, as a share of the maximum. A production cam lifts the
 * valve in two parts. First the opening ramp: a stretch of constant, gentle velocity that
 * takes up the valve train's lash (or a hydraulic lifter's bleed-down) and sets the valve off
 * its seat without a hammer blow, up to about a quarter of a millimetre. Then the flank,
 * which accelerates the valve to full lift and back down to the closing ramp. The ramps are
 * why a cam's seat-to-seat duration runs some 45-60 degrees longer than its duration at
 * 0.050 inch, and why the exhaust valve is still off its seat at TDC through the overlap.
 * The flank is sin(pi * x)^COEFF.BREATH_LIFT_SHAPE_EXP across its own share of the event.
 * @param {number} phase 0 at the seat opening, 1 at the seat closing
 * @param {{rampShare?: number, rampLiftShare?: number}} [ramp] each ramp's share of the
 *   seat-to-seat event, and the lift it reaches as a share of the maximum
 * @returns {number} 0..1
 */
export function liftShare(phase, ramp = {}) {
  if (phase <= 0 || phase >= 1) return 0;
  const r = ramp.rampShare ?? 0;
  const h = ramp.rampLiftShare ?? 0;
  const x = Math.min(phase, 1 - phase);
  if (x < r) return (h * x) / r;
  return h + (1 - h) * Math.sin((Math.PI * (phase - r)) / (1 - 2 * r)) ** COEFF.BREATH_LIFT_SHAPE_EXP;
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
 * a phaser's advance). The valve itself is open longer, from its seat: the flank's share of
 * the event below the checking height follows from the maximum lift on the flank's curve,
 * and each ramp adds its own length (`COEFF.BREATH_RAMP_LIFT_M` at
 * `COEFF.BREATH_RAMP_VELOCITY_M_PER_DEG`). The exhaust lobe mirrors the intake about TDC,
 * moved by an exhaust phaser's retard; each lobe has its own duration, as real cams do.
 *
 * @param {{ivcAbdc: number, durationDeg: number, exhaustDurationDeg?: number, exhaustRetardDeg?: number,
 *   maxLiftM?: number, exhaustMaxLiftM?: number, iclDeg?: number|null, lsaDeg?: number|null}} cam each lobe's duration at 0.050 inch and
 *   its valve's maximum lift; the exhaust lobe is the intake's where not given
 * @returns {{ivo: number, ivc: number, evo: number, evc: number, rampShare: number, rampLiftShare: number,
 *   exhaustRampShare: number, exhaustRampLiftShare: number}} seat-to-seat events, and each
 *   lobe's ramps as `liftShare` takes them
 */
export function valveEvents({ ivcAbdc, durationDeg, exhaustDurationDeg = durationDeg, exhaustRetardDeg = 0, maxLiftM = 0, exhaustMaxLiftM = maxLiftM, iclDeg = null, lsaDeg = null }) {
  /** One lobe from its duration at 0.050 inch: its seat-to-seat length and its ramps. */
  const lobe = (dur, maxLift) => {
    const rampLift = Math.min(COEFF.BREATH_RAMP_LIFT_M, 0.5 * DURATION_CHECK_LIFT_M);
    const hasLift = maxLift > DURATION_CHECK_LIFT_M;
    const rampDeg = hasLift ? rampLift / COEFF.BREATH_RAMP_VELOCITY_M_PER_DEG : 0;
    // Share of the flank at each end spent below the checking height, on the flank's curve.
    const below = hasLift
      ? Math.asin(((DURATION_CHECK_LIFT_M - rampLift) / (maxLift - rampLift)) ** (1 / COEFF.BREATH_LIFT_SHAPE_EXP)) / Math.PI : 0;
    const seat = dur / (1 - 2 * below) + 2 * rampDeg;
    return { seat, rampShare: rampDeg / seat, rampLiftShare: hasLift ? rampLift / maxLift : 0 };
  };
  const inLobe = lobe(durationDeg, maxLiftM);
  const exLobe = lobe(exhaustDurationDeg, exhaustMaxLiftM);
  // The intake lobe's centre, from where it closes at the checking height; the exhaust's
  // mirrors it about TDC, moved by an exhaust phaser's retard.
  // A cam card's figures place both where it gives them: the intake centreline after TDC as
  // installed, and the lobe separation, the angle between the two centrelines in cam degrees,
  // which puts the exhaust centreline 2 * LSA - ICL before TDC (crank degrees). Without them,
  // a lobe pair ground symmetric about TDC: the lobe separation equal to the centreline.
  const centre = iclDeg != null ? iclDeg : 180 + ivcAbdc - durationDeg / 2;
  const exCentre = -(lsaDeg != null ? 2 * lsaDeg - centre : centre) + exhaustRetardDeg;
  return {
    ivo: centre - inLobe.seat / 2,
    ivc: centre + inLobe.seat / 2,
    evo: exCentre - exLobe.seat / 2,
    evc: exCentre + exLobe.seat / 2,
    rampShare: inLobe.rampShare, rampLiftShare: inLobe.rampLiftShare,
    exhaustRampShare: exLobe.rampShare, exhaustRampLiftShare: exLobe.rampLiftShare,
  };
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
 * @property {number} [exhaustPrimaryM] exhaust primary pipe, port to collector, m
 * @property {number} [exhaustPrimaryAreaM2] its cross-section, m^2
 * @property {number} [exhaustReflection] pressure reflection coefficient where the primary
 *   meets its collector, (A1 - A2)/(A1 + A2): negative into a larger area
 * @property {number} [exhaustPortAreaM2] the exhaust port's effective flow area per cylinder, m^2,
 *   from its flow-bench figure
 * @property {number} [intakeLiftM] intake valve lift where the cam card gives it, m
 * @property {number} [exhaustLiftM] exhaust valve lift where the cam card gives it, m
 * @property {number} [intakePortAreaM2] the intake port's effective flow area per cylinder
 *   from a flow bench, m^2; without it the throat times the universal Cd
 * @property {number} [runnerReflection] pressure reflection coefficient where the intake
 *   runner opens into the plenum, (A1 - A2)/(A1 + A2): close to -1, the plenum being large
 * @property {{ivo: number, ivc: number, evo: number, evc: number, rampShare?: number, rampLiftShare?: number,
 *   exhaustRampShare?: number, exhaustRampLiftShare?: number}} events
 */

/**
 * @typedef {object} BreathingResult
 * @property {number} ve fresh charge trapped at IVC, % of plenum density x displacement
 * @property {number} residualFrac burned gas in the trapped charge, share of its mass
 * @property {number} trappedK charge temperature at IVC, K
 * @property {number} freshKg fresh charge trapped, kg per cylinder per cycle
 * @property {number} backflowShare intake charge pushed back out before IVC, share of the fresh air taken in
 * @property {number[]} runnerWaves the waves leaving the intake valve over the last round trip
 *   of the runner before IVC, Pa: pass as the next cycle's `op.runnerWaves`
 */

/**
 * One cylinder's gas exchange at a steady speed and pressures.
 *
 * Integrated from exhaust valve opening (the blowdown included) through the exhaust stroke,
 * overlap and the intake stroke, to IVC.
 *
 * @param {BreathingGeometry} g
 * @param {object} op
 * @param {number} op.rpm
 * @param {number} op.plenumKpa intake plenum (manifold) pressure, kPa absolute
 * @param {number} op.intakeK charge temperature in the plenum, K
 * @param {number} op.exhaustKpa exhaust manifold pressure, kPa absolute
 * @param {number} op.exhaustK exhaust gas temperature, K
 * @param {number[]} [op.runnerWaves] the runner's waves left by the cycle before (its
 *   `runnerWaves`); without them the runner starts quiet
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
  const exhaustRamp = { rampShare: g.events.exhaustRampShare ?? g.events.rampShare, rampLiftShare: g.events.exhaustRampLiftShare ?? g.events.rampLiftShare };
  /**
   * @param {number} deg @param {number} open @param {number} close @param {number} n @param {number} dia
   * @param {{rampShare?: number, rampLiftShare?: number}} [ramp] @param {number} [portAreaM2]
   * @param {number} [maxLiftM] the lobe's lift at the valve, where the cam card gives it;
   *   otherwise the usual share of the valve's diameter
   */
  const valveArea = (deg, open, close, n, dia, ramp = g.events, portAreaM2 = 0, maxLiftM = 0) => {
    const lift = (maxLiftM > 0 ? maxLiftM : g.liftPerDia * dia) * liftShare((deg - open) / (close - open), ramp);
    if (lift <= 0) return 0;
    const curtain = n * COEFF.BREATH_VALVE_CD * Math.PI * dia * lift;
    // The port behind the seat: its flow-bench area where the head has been measured,
    // otherwise the throat with the universal discharge coefficient.
    const port = portAreaM2 > 0 ? portAreaM2 : n * COEFF.BREATH_VALVE_CD * (Math.PI / 4) * (COEFF.BREATH_THROAT_SHARE * dia) ** 2;
    return Math.min(curtain, port);
  };
  const { ivo, ivc, evo, evc } = g.events;
  const step = COEFF.BREATH_STEP_DEG;
  const dt = step / (6 * Math.max(rpm, 60));
  const rhoPlenum = pPlenum / (R_AIR * intakeK);
  const boreArea = (Math.PI / 4) * g.boreM * g.boreM;
  const meanPistonSpeed = 2 * g.strokeM * (rpm / 60);
  const wallK = COEFF.WALL_TEMP_K;

  // Start: the exhaust valve opening, the cylinder at the pressure the expansion stroke has
  // left (the cycle's own ratio to the intake pressure, turbo.js `exhaustPulsePressureKpa`)
  // and the burned gas at the temperature that blows down to the manifold's. With a primary
  // pipe the blowdown is what sets its column moving.
  let theta = evo;
  let v = volume(theta);
  // Each valve's flow at the last step, where its next solve starts.
  let lastEx = null; let lastIn = null;
  const pEvo = Math.max(pExh * 1.05, pPlenum * clamp(COEFF.EVO_PRESSURE_RATIO_AT_0 + COEFF.EVO_PRESSURE_RATIO_PER_RPM * rpm, 3.5, 6.2));
  let t = exhaustK * (pEvo / pExh) ** ((COEFF.GAMMA_BURNED - 1) / COEFF.GAMMA_BURNED);
  let m = pEvo * v / (R_AIR * t);
  let fresh = 0;
  // THE EXHAUST PRIMARY AS AN ACOUSTIC LINE. The pipe carries a forward wave (from the
  // valve to the collector) and a backward one (its reflection, returning). Gas pushed out
  // of the port launches a forward wave of amplitude (a / A) * mdot, the plane-wave relation
  // dp = rho * a * u; at the collector it reflects with coefficient (A1 - A2)/(A1 + A2),
  // negative into the collector's larger area, so it comes back as suction, attenuated by
  // the pipe; at the valve end it reflects again, by the valve's open area against the
  // pipe's, and goes round once more. The valve pushes against the collector's pressure plus
  // both waves. Timed so suction sits at the port through overlap, the train draws the
  // cylinder below the collector: how long primaries scavenge at the speeds they are tuned to.
  const sound = Math.sqrt(COEFF.GAMMA_BURNED * R_AIR * exhaustK);
  const primaryArea = g.exhaustPrimaryAreaM2 ?? 0;
  const impedance = primaryArea > 0 ? sound / primaryArea : 0;
  const delaySteps = primaryArea > 0 ? ((2 * g.exhaustPrimaryM) / sound) * 6 * Math.max(rpm, 60) / step : Infinity;
  const collectorR = (g.exhaustReflection ?? 0) * COEFF.EXH_WAVE_ATTENUATION;
  /** Forward-wave amplitude leaving the port at each step, Pa. */
  const forward = [];
  /** The backward wave arriving at the port now: the forward wave of 2L/a ago, reflected. */
  const backwardNow = () => {
    const at = forward.length - delaySteps;
    if (!(at >= 0)) return 0;
    const n = Math.floor(at); const f = at - n;
    const f0 = forward[n] ?? 0; const f1 = forward[n + 1] ?? f0;
    return collectorR * (f0 + (f1 - f0) * f);
  };
  // THE INTAKE RUNNER AS AN ACOUSTIC LINE, the same way: the valve drawing air launches a
  // suction wave, -(a / A) * mdot, up the runner; at the plenum, much larger than the
  // runner, it reflects inverted (nearly an open end, by the area ratio: g.runnerReflection),
  // so it comes back as a pressure wave 2L/a later. Where that return lands before the valve shuts the
  // runner rams charge in past what the plenum alone would push: the tuning that places an
  // engine's torque peak, at a speed set by the runner's length. A shut valve is a closed
  // end and sends the wave straight back. The steady losses (the runner's wall friction,
  // Darcy f L/D, and the entrance from the plenum) are taken on the flow's dynamic pressure.
  const soundIn = Math.sqrt(GAMMA * R_AIR * intakeK);
  const impedanceIn = soundIn / g.runnerAreaM2;
  const delayStepsIn = ((2 * g.runnerLengthM) / soundIn) * 6 * Math.max(rpm, 60) / step;
  const plenumR = g.runnerReflection ?? -1;
  const runnerD = Math.sqrt((4 * g.runnerAreaM2) / Math.PI);
  const runnerLossK = COEFF.BREATH_RUNNER_FRICTION * g.runnerLengthM / runnerD + COEFF.BREATH_RUNNER_ENTRY_K;
  /** Wave amplitude leaving the valve end up the runner at each step, Pa. */
  const outgoing = [];
  /** The wave arriving at the valve now: the one sent 2L/a ago, reflected at the plenum. */
  const returningNow = () => {
    const at = outgoing.length - delayStepsIn;
    if (!(at >= 0)) return 0;
    const n = Math.floor(at); const f = at - n;
    const f0 = outgoing[n] ?? 0; const f1 = outgoing[n + 1] ?? f0;
    return plenumR * (f0 + (f1 - f0) * f);
  };
  // What the runner still holds from the cycle before: the waves left ringing when its intake
  // valve shut (op.runnerWaves, the steps up to IVC), carried round the closed valve, a
  // closed end, to this cycle's EVO. The valve slamming shut on a moving column launches the
  // strongest wave of the cycle, and the ringing it leaves is much of what a tuned runner
  // does, so a cycle that started from a quiet runner would miss it.
  if (op.runnerWaves?.length) {
    outgoing.push(...op.runnerWaves);
    const closedSteps = Math.round((720 - (ivc - evo)) / step);
    for (let n = 0; n < closedSteps; n++) outgoing.push(returningNow());
  }
  // Burned gas overlap has pushed back into the runner, breathed in again first.
  let runnerBurned = 0;
  let taken = 0;
  let pushedBack = 0;

  while (theta < ivc) {
    const next = Math.min(theta + step, ivc);
    const vNext = volume(next);
    const p = m * R_AIR * t / v;
    const mid = (theta + next) / 2;

    // EXHAUST VALVE: out on the exhaust stroke, back in when the port is higher.
    let dmEx = 0; // + into the cylinder
    let hEx = 0;
    // A shut valve is a closed end: the backward wave goes straight round again.
    let fwd = backwardNow();
    if (mid > evo && mid < evc) {
      const a = valveArea(mid, evo, evc, g.exhaustValves, g.exhaustValveM, exhaustRamp, g.exhaustPortAreaM2 ?? 0, g.exhaustLiftM ?? 0);
      const b = backwardNow();
      // The backward wave reflects off the valve end: a nearly shut valve is a closed end
      // (+1), a wide one passes most of it into the cylinder.
      const valveR = primaryArea > 0 ? (primaryArea - a) / (primaryArea + a) : 0;
      const waveBack = b * (1 + valveR);
      // Out of the cylinder (negative: back in), with the port pressure it raises: solved by
      // bisection, the flow being monotonic in itself through the wave it launches.
      const flowAt = (mdot) => {
        const port = pExh + waveBack + impedance * mdot;
        return p > port ? orificeFlow(a, p, t, port) : -orificeFlow(a, port, exhaustK, p);
      };
      const out = solveFlow(flowAt,
        -orificeFlow(a, Math.max(p, pExh) * 2, exhaustK, 0) - 1e-9,
        orificeFlow(a, Math.max(p, pExh) * 2, t, 0) + 1e-9, lastEx);
      lastEx = out;
      fwd = impedance * out + valveR * b;
      dmEx = Math.max(-out * dt, -0.9 * m);
      hEx = dmEx < 0 ? CP * t : CP * exhaustK;
    }
    forward.push(fwd);

    // INTAKE: the valve between the runner's end and the cylinder; the runner's end at the
    // plenum's pressure plus the wave arriving, less the wave the flow itself launches and
    // the runner's losses. Solved by bisection, as the exhaust is.
    let dmIn = 0;
    let hIn = 0;
    let out = returningNow();
    if (mid > ivo && mid < ivc) {
      const a = valveArea(mid, ivo, ivc, g.intakeValves, g.intakeValveM, g.events, g.intakePortAreaM2 ?? 0, g.intakeLiftM ?? 0);
      const b = returningNow();
      const valveR = (g.runnerAreaM2 - a) / (g.runnerAreaM2 + a);
      const waveBack = b * (1 + valveR);
      // Into the cylinder positive.
      const flowAt = (mdot) => {
        const port = pPlenum + waveBack - impedanceIn * mdot
          - (runnerLossK * mdot * Math.abs(mdot)) / (2 * rhoPlenum * g.runnerAreaM2 ** 2);
        return port > p ? orificeFlow(a, port, intakeK, p) : -orificeFlow(a, p, t, port);
      };
      const mdot = solveFlow(flowAt,
        -orificeFlow(a, Math.max(p, pPlenum) * 2, t, 0) - 1e-9,
        orificeFlow(a, Math.max(p, pPlenum) * 2, intakeK, 0) + 1e-9, lastIn);
      lastIn = mdot;
      out = -impedanceIn * mdot + valveR * b;
      dmIn = mdot * dt;
      if (dmIn > 0) { taken += dmIn; hIn = CP * intakeK; } else { pushedBack -= dmIn; hIn = CP * t; dmIn = Math.max(dmIn, -0.9 * m); }
    }
    outgoing.push(out);
    // Through a long overlap at low speed both valves can drain the cylinder in the same
    // step; no step may take out more than the cylinder holds.
    const outflow = Math.max(0, -dmEx) + Math.max(0, -dmIn);
    if (outflow > 0.9 * m) {
      const s = (0.9 * m) / outflow;
      if (dmEx < 0) dmEx *= s;
      if (dmIn < 0) { pushedBack += dmIn * (1 - s); dmIn *= s; }
    }

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
  // The last round trip's worth of waves at IVC, for the next cycle (op.runnerWaves).
  const keep = Math.ceil(delayStepsIn) + 2;
  return {
    runnerWaves: Number.isFinite(keep) ? outgoing.slice(-keep) : [],
    ve: (100 * freshKg) / (rhoPlenum * swept),
    residualFrac: clamp(1 - freshKg / Math.max(m, 1e-12), 0, 1),
    trappedK: t,
    freshKg,
    backflowShare: taken > 0 ? pushedBack / taken : 0,
  };
}

/** The valve solves stop when the bracket is narrower than this share of where it started. */
const FLOW_SOLVE_TOL = 1e-9;
/** And never take more evaluations than this, the cost of 40 halvings. */
const FLOW_SOLVE_MAX = 40;

/**
 * The valve flow that is its own answer: `flowAt(mdot) = mdot`, with `flowAt(mdot) - mdot`
 * falling through zero between `lo` and `hi` (a flow raises the port pressure that opposes
 * it). Bracketed false position with the Illinois modification, the method cycle.js searches
 * the knock limit with: it keeps a bracket around the root as bisection does, but steps to
 * where the line through the bracket's ends crosses zero, halving the weight of an end that
 * stays put so it cannot stall. The flow function is smooth and monotonic, so it closes to a
 * billionth of the bracket in a handful of evaluations, where twenty halvings stopped at a
 * millionth.
 * @param {(mdot: number) => number} flowAt
 * @param {number} lo flow at which flowAt(lo) > lo
 * @param {number} hi flow at which flowAt(hi) < hi
 * @returns {number}
 */
function solveFlow(flowAt, lo, hi, guess = null) {
  const tol = (hi - lo) * FLOW_SOLVE_TOL;
  let gLo; let gHi;
  // From the last step's flow, which the valve and the waves move only a little in two crank
  // degrees: bracket outward from it, doubling the reach, rather than from the ends of the
  // possible range. Either way the bracket holds the root and closes to the same tolerance.
  if (guess != null && guess > lo && guess < hi) {
    const g0 = flowAt(guess) - guess;
    if (g0 === 0) return guess;
    let reach = Math.max(Math.abs(guess) * 0.02, (hi - lo) * 1e-4);
    let x = guess; let gx = g0;
    for (;;) {
      const y = g0 > 0 ? Math.min(hi, x + reach) : Math.max(lo, x - reach);
      const gy = y === hi || y === lo ? null : flowAt(y) - y;
      if (gy === null) { if (g0 > 0) { lo = x; gLo = gx; } else { hi = x; gHi = gx; } break; }
      if ((gy > 0) === (g0 > 0) && gy !== 0) { x = y; gx = gy; reach *= 2; continue; }
      if (g0 > 0) { lo = x; gLo = gx; hi = y; gHi = gy; } else { hi = x; gHi = gx; lo = y; gLo = gy; }
      break;
    }
  }
  if (gLo === undefined) gLo = flowAt(lo) - lo;
  if (gHi === undefined) gHi = flowAt(hi) - hi;
  if (!(gLo > 0) || !(gHi < 0)) return (lo + hi) / 2;
  let side = 0;
  for (let it = 0; it < FLOW_SOLVE_MAX && hi - lo > tol; it++) {
    let x = lo + ((hi - lo) * gLo) / (gLo - gHi);
    // A step that lands on an end does not shrink the bracket: halve instead.
    if (!(x > lo && x < hi)) x = (lo + hi) / 2;
    const gx = flowAt(x) - x;
    if (gx === 0) return x;
    if (gx > 0) { lo = x; gLo = gx; if (side === 1) gHi /= 2; side = 1; } else { hi = x; gHi = gx; if (side === -1) gLo /= 2; side = -1; }
  }
  return lo + ((hi - lo) * gLo) / (gLo - gHi);
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
 * @param {{headers?: boolean, exhaust?: boolean, catalyst?: 'ceramic'|'metallic'|'none'}} [input.mods]
 * @param {number} [input.baroKpa]
 * @returns {number} the pressure drop, kPa
 */
export function exhaustSystemDropKpa({ flowKgS, exhaustK, pipeDiaIn, mods = {}, baroKpa = BARO_KPA }) {
  if (!(flowKgS > 0)) return 0;
  const area = (Math.PI / 4) * (pipeDiaIn * 0.0254) ** 2;
  const k = (mods.headers ? COEFF.EXH_K_HEADERS : COEFF.EXH_K_MANIFOLD) + COEFF.EXH_K_CATALYST * catalystLossShare(mods.catalyst)
    + (mods.exhaust ? COEFF.EXH_K_CATBACK_FREE : COEFF.EXH_K_CATBACK);
  // Density at the tailpipe end, near atmospheric: the drop is small against it.
  const rho = (baroKpa * 1000) / (R_AIR * exhaustK);
  const u = flowKgS / (rho * area);
  return (k * rho * u * u) / 2 / 1000;
}

/**
 * How hard a catalyst is to push through, against the OEM ceramic's (1). Its substrate is a
 * honeycomb of square channels a millimetre or so across, and the flow in them is laminar,
 * so the drop goes as Hagen-Poiseuille's: viscosity times length times the channel speed over
 * the channel's hydraulic diameter squared. For the same converter size and flow, the
 * channel speed goes as one over the open frontal area, so the drop goes as
 * 1 / (open area * d_h^2), from the cell density and the wall thickness: the cell pitch is
 * 1 / sqrt(cells per square inch), the channel the pitch less one wall, the open area the
 * channel over the pitch squared. A 200-cell metallic substrate on thin foil comes out at
 * about a third of the 400-cell ceramic's. No converter (a test pipe) costs nothing here.
 * @param {'ceramic'|'metallic'|'none'|undefined} catalyst absent is the OEM ceramic
 * @returns {number}
 */
export function catalystLossShare(catalyst) {
  if (catalyst === 'none') return 0;
  if (catalyst !== 'metallic') return 1;
  const resistance = (cpsi, wallIn) => {
    const pitch = 1 / Math.sqrt(cpsi);
    const channel = pitch - wallIn;
    return 1 / (((channel / pitch) ** 2) * channel * channel);
  };
  return resistance(COEFF.CAT_METALLIC_CPSI, COEFF.CAT_METALLIC_WALL_IN) / resistance(COEFF.CAT_CERAMIC_CPSI, COEFF.CAT_CERAMIC_WALL_IN);
}
