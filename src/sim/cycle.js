/**
 * The closed part of the engine cycle, solved on a crank-angle grid.
 *
 * This is the physics core. Everything the old model approximated with a fitted
 * multiplier — indicated work, peak pressure, MBT timing, the knock limit — is
 * produced here by integrating one cylinder from intake valve close to exhaust valve
 * open, and reading the answers off the resulting pressure trace.
 *
 * WHY A PRESSURE TRACE
 * The previous model computed torque as fuel energy times three efficiency scalars,
 * with spark timing entering through a parabola centred on a correlated MBT. That
 * cannot express the thing every tuner is actually trading: burn PHASING. Spark does
 * not scale the work done, it moves WHEN the heat arrives relative to the piston, and
 * the piston is in a different place at every crank angle. Too early and the rising
 * pressure fights the piston still coming up — real negative work, and the highest
 * peak pressures. Too late and the burn happens into a cylinder that is already
 * expanding, so the pressure has less leverage and more of the heat goes out of the
 * exhaust valve. MBT is not a formula: it is the timing where those two losses balance,
 * and here it falls out of the integration instead of being asserted.
 *
 * WHAT THIS MODEL IS
 * A TWO-ZONE, finite-heat-release cycle. Burned and unburned gas share a pressure but
 * carry their own temperatures, which is what lets the model say anything honest about
 * end-gas heating and exhaust temperature:
 *
 *   - Volume from the slider-crank equation, so rod length and stroke matter.
 *   - Heat release from a Wiebe function, the empirical S-curve that real mass-fraction-
 *     burned traces follow closely.
 *   - Pressure from the first law over both zones: dp = (γ-1)/V · dQ − γ · p/V · dV.
 *   - Work by trapezoidal integration of p dV, giving gross indicated MEP directly.
 *   - UNBURNED zone compressed isentropically by that pressure, less its wall loss.
 *   - BURNED zone from an open-system enthalpy balance: charge crosses the flame at the
 *     unburned temperature, brings its fuel energy, then does displacement work and
 *     loses heat to the wall.
 *   - Wall heat transfer from the Woschni correlation, per crank degree, against a
 *     chamber area that grows as the piston uncovers the liner.
 *   - Crevice volume as real geometry, and blowby as real lost mass.
 *
 * THE END GAS, AND WHY ENGINE SPEED MATTERS TWICE
 * The unburned charge ahead of the flame is compressed by the pressure the burned gas is
 * generating, so it gets hotter than piston compression alone would make it. That is the
 * gas that autoignites, which is why knock is a pressure-AND-TIME problem rather than a
 * timing threshold: the Livengood-Wu integral accumulates in milliseconds, so a 1900 RPM
 * cycle gives the end gas nearly three times the dwell of a 5500 RPM one.
 *
 * But it also gives it three times as long to shed heat into a 450 K head, and the end
 * gas is NOT adiabatic. Modelling only the dwell side made the knock limit collapse at
 * low speed — a B58B30M1 at 11:1 and 16.6 psi came out unable to take any advance at all
 * at 1900 RPM, where the real engine makes its rated torque on pump gas. Both halves of
 * that trade are here now.
 *
 * WHAT IT IS NOT
 * Not CFD. There is no flame-front geometry, so how much of the burned zone's heat the
 * end gas feels is one coefficient (ENDGAS_FLAME_COUPLING) rather than a radiation view
 * factor. The two zones are well-stirred: no boundary layer, no temperature profile
 * within either. Composition is frozen apart from the two gammas, so dissociation is a
 * fixed effective gamma plus a ceiling rather than an equilibrium solve.
 */

import { COEFF } from './coefficients.js';
import { BARO_KPA, KPA_PER_BAR, R_AIR } from './constants.js';
import { clamp } from './math.js';
import { evaporativeCoolingK, residualFraction, trappedChargeK } from './thermo.js';

/** Crank angle at which the exhaust valve opens, degrees after TDC firing. */
const EVO_ATDC = 180 - 50;

/**
 * Cylinder volume at a crank angle, from the slider-crank geometry.
 *
 * Rod ratio matters and is not cosmetic: a short rod moves the piston away from TDC
 * faster just after the burn starts, which changes how much of the heat release lands
 * where it can do work.
 *
 * @param {number} thetaDeg crank angle, degrees after TDC firing (negative = before)
 * @param {number} clearanceM3 volume above the piston at TDC
 * @param {number} sweptM3 displacement of one cylinder
 * @param {number} rodRatio connecting rod length ÷ crank radius
 * @returns {number} cylinder volume, m³
 */
export function cylinderVolumeM3(thetaDeg, clearanceM3, sweptM3, rodRatio) {
  const th = (thetaDeg * Math.PI) / 180;
  const s = Math.sin(th);
  // Piston displacement from TDC, in crank radii.
  const x = rodRatio + 1 - Math.cos(th) - Math.sqrt(Math.max(0, rodRatio * rodRatio - s * s));
  return clearanceM3 + (sweptM3 / 2) * x;
}

/**
 * Crank angle at which the intake valve closes, degrees after BDC.
 *
 * A longer-duration camshaft holds the intake valve open later, which is why a big cam
 * loses low-RPM cylinder pressure: some of the charge is pushed back out before the
 * valve shuts. It is also why EFFECTIVE compression is always lower than the static
 * ratio stamped on the piston, and why a cammed engine tolerates more static
 * compression than its number suggests.
 *
 * @param {number} camDuration crank degrees
 * @returns {number} IVC, degrees after BDC
 */
export function ivcAfterBdcDeg(camDuration) {
  return COEFF.IVC_BASE_ABDC + (camDuration - COEFF.IVC_CAM_REF_DURATION) * COEFF.IVC_PER_CAM_DEG;
}

/**
 * Burn duration — the crank angle the Wiebe function spans, from the end of the flame
 * development delay to essentially complete combustion.
 *
 * This is the TOTAL duration, not the 10-90% figure usually quoted in the literature.
 * With `WIEBE_A = 5` and `WIEBE_M = 2` the 10-90% window is very close to half of it, so
 * a 42-degree total here is a ~21-degree 10-90%, which is where a production engine sits.
 *
 * Burn duration in CRANK degrees is roughly constant with engine speed, because
 * turbulence intensity scales with piston speed and the flame speeds up in proportion.
 * It is not exactly constant, and the residual dilution and mixture terms below are the
 * two things a tuner can actually move it with.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.lambda delivered lambda
 * @param {number} input.residualFrac burned gas left over from the previous cycle, 0..1
 * @param {number} [input.boreFlameFactor] flame travel scaling from bore, 1 at reference
 * @returns {number} burn duration, crank degrees
 */
export function burnDurationDeg({ rpm, lambda, residualFrac, boreFlameFactor = 1 }) {
  // Mixture: fastest a little rich of stoichiometric, slower in both directions — but
  // NOT symmetrically. Laminar flame speed falls away far faster on the lean side, where
  // there is surplus air to heat and nothing extra burning to heat it, than on the rich
  // side, where the surplus fuel at least keeps the flame temperature up. Treating the
  // two the same made a lean charge burn almost as fast as a rich one, which is what let
  // the model conclude that lean-under-load was SAFER — the burn stayed short, so the end
  // gas had no more time to light itself. It is not safer, and the asymmetry is why.
  const lambdaOff = lambda - COEFF.BURN_FASTEST_LAMBDA;
  const penalty = lambdaOff > 0 ? COEFF.BURN_LAMBDA_PENALTY_LEAN : COEFF.BURN_LAMBDA_PENALTY_RICH;
  const mixtureFactor = 1 + lambdaOff * lambdaOff * penalty;
  // Dilution: residual burned gas has no oxygen and absorbs heat, so the flame crawls.
  const dilutionFactor = 1 + residualFrac * COEFF.BURN_RESIDUAL_PENALTY;
  const speedFactor = 1 + (rpm - COEFF.BURN_RPM_REF) * COEFF.BURN_PER_RPM;
  return COEFF.BURN_DURATION_BASE_DEG * boreFlameFactor
    * mixtureFactor * dilutionFactor * clamp(speedFactor, 0.7, 1.6);
}

/**
 * @typedef {object} CycleInput
 * @property {number} rpm engine speed
 * @property {number} sparkBtdc commanded spark advance, degrees before TDC
 * @property {number} trappedPa cylinder pressure at intake valve close
 * @property {number} trappedK charge temperature at intake valve close
 * @property {number} heatJ chemical energy released by the burn, joules
 * @property {number} clearanceM3 volume above the piston at TDC
 * @property {number} sweptM3 one cylinder's displacement
 * @property {number} rodRatio connecting rod length ÷ crank radius
 * @property {number} ivcAbdc intake valve close, degrees after BDC
 * @property {number} burnDeg burn duration, crank degrees
 * @property {number} boreM cylinder bore, metres — sets heat-transfer area
 * @property {number} strokeM stroke, metres — sets piston speed and liner area
 * @property {number} trappedMassKg total mass in the cylinder, for the gas-law temperature
 * @property {number} octaneNumber fuel antiknock index
 * @property {number} [lambda] delivered lambda; sets how hot the flame behind the
 *   front runs, which heats the end gas on top of compression
 */

/**
 * @typedef {object} CycleResult
 * @property {number} imepGrossPa gross indicated MEP over the closed period
 * @property {number} peakPressurePa highest cylinder pressure reached
 * @property {number} peakPressureDeg crank angle of that peak, degrees ATDC
 * @property {number} peakEndGasK hottest the unburned end gas got
 * @property {number} peakBurnedK hottest the burned zone got — the flame temperature
 * @property {number} exhaustK gas temperature at the port, after blowdown
 * @property {number} blowbyFrac charge lost past the rings over the closed period
 * @property {number} knockIntegral Livengood-Wu autoignition integral; ≥ 1 means knock
 * @property {number} mfb50Deg crank angle of 50% mass burned, degrees ATDC
 */

/**
 * Integrates one closed cycle and reports what the pressure trace says.
 *
 * @param {CycleInput} input
 * @returns {CycleResult}
 */
export function runCycle({
  rpm, sparkBtdc, trappedPa, trappedK, heatJ,
  clearanceM3, sweptM3, rodRatio, ivcAbdc, burnDeg, octaneNumber,
  boreM, strokeM, trappedMassKg,
}) {
  const step = COEFF.CYCLE_STEP_DEG;
  const thetaStart = -180 + ivcAbdc;
  const spark = -sparkBtdc;
  // Spark does not light the charge instantly: there is a delay while a kernel forms
  // and grows to a self-sustaining flame. Combustion is therefore phased from the end
  // of that delay, not from the spark event.
  const burnStart = spark + COEFF.FLAME_DEVELOPMENT_DEG;
  const burnEnd = burnStart + burnDeg;
  // Geometry the wall heat-transfer model needs. What reaches the piston is the heat
  // release minus whatever the walls take, and the wall term is computed per step below
  // rather than assumed as a fixed fraction of the fuel.
  const boreAreaM2 = (Math.PI / 4) * boreM * boreM;
  const meanPistonSpeed = 2 * strokeM * (rpm / 60);
  // Motored reference state for the Woschni combustion term: what the pressure would
  // have been at this crank angle with no combustion at all.
  const vIvcRef = cylinderVolumeM3(thetaStart, clearanceM3, sweptM3, rodRatio);
  // Time per crank degree, milliseconds — the clock the autoignition integral runs on.
  const msPerDeg = 1000 / (6 * Math.max(rpm, 1));

  // Constant for the whole cycle, so it is computed once rather than at every step:
  // the octane and scale part of the ignition-delay correlation.
  const tauFuelTerm = COEFF.KNOCK_TAU_SCALE * COEFF.KNOCK_DE_A
    * Math.pow(octaneNumber / 100, COEFF.KNOCK_DE_B);
  // Specific heats for the two zones, from their gammas.
  const cvU = R_AIR / (COEFF.GAMMA_UNBURNED - 1);
  const cpU = cvU + R_AIR;
  const cpB = R_AIR / (COEFF.GAMMA_BURNED - 1) + R_AIR;
  // Energy the fuel releases per kg of charge that burns.
  const qPerKg = trappedMassKg > 0 ? heatJ / trappedMassKg : 0;
  // Crevices: the piston top-land gap and the head gasket bore. Gas pushed in there sits
  // at wall temperature and takes no part in combustion, then comes back out on
  // expansion. This is where most unburnt hydrocarbon actually comes from.
  const creviceM3 = clearanceM3 * COEFF.CREVICE_VOLUME_FRAC;

  let p = trappedPa;
  let v = cylinderVolumeM3(thetaStart, clearanceM3, sweptM3, rodRatio);
  let work = 0;
  let peakPressurePa = p;
  let peakPressureDeg = thetaStart;
  let peakEndGasK = trappedK;
  let peakBurnedK = trappedK;
  let knockIntegral = 0;
  let mfb50Deg = burnStart + burnDeg / 2;
  let prevBurned = 0;
  let crossed50 = false;
  // The two zones. Unburned starts as the whole charge at the trapped state; burned
  // starts empty and is seeded at the first step that burns anything.
  let tU = trappedK;
  let tB = trappedK;
  // Charge blown past the rings, as a fraction of what was trapped. Real and permanent:
  // it never does work on the piston and never comes back.
  let blowbyFrac = 0;
  // Heat the unburned zone has given up to the wall so far, as degrees below adiabatic.
  let endGasCoolK = 0;

  /** Wiebe mass fraction burned at a crank angle. */
  const burnedFraction = (theta) => {
    if (theta <= burnStart) return 0;
    if (theta >= burnEnd) return 1;
    const x = (theta - burnStart) / burnDeg;
    return 1 - Math.exp(-COEFF.WIEBE_A * Math.pow(x, COEFF.WIEBE_M + 1));
  };

  for (let theta = thetaStart; theta < EVO_ATDC; theta += step) {
    const thetaNext = theta + step;
    const vNext = cylinderVolumeM3(thetaNext, clearanceM3, sweptM3, rodRatio);
    const burned = burnedFraction(thetaNext);
    const dQ = (burned - prevBurned) * heatJ;

    // Ratio of specific heats falls as the charge burns — hot combustion products are
    // polyatomic and store energy in vibration. Blending between the two is the cheap
    // stand-in for a real two-zone model, and it matters: holding gamma at its
    // unburned value overstates peak pressure badly.
    const gamma = COEFF.GAMMA_UNBURNED
      + (COEFF.GAMMA_BURNED - COEFF.GAMMA_UNBURNED) * burned;

    // --- WALL HEAT TRANSFER, per step, from the Woschni correlation.
    //
    // This replaces a flat "14% of the heat goes into the walls" assumption, and the
    // difference is not cosmetic: heat loss does not scale with fuel, it scales with
    // surface area, gas temperature and charge motion. A small cylinder has more wall
    // per unit volume and loses proportionally more; a slow-turning engine holds hot gas
    // against the walls for longer and loses more; a boosted engine at high pressure
    // loses more still. Those are real, and a fixed fraction expressed none of them.
    const chargeKg = trappedMassKg * (1 - blowbyFrac);
    const tGas = (p * v) / (chargeKg * R_AIR);
    // Exposed area: head, piston crown, and the liner the piston has uncovered.
    const strokeFrac = Math.max(0, (v - clearanceM3) / sweptM3);
    const areaM2 = 2 * boreAreaM2 + Math.PI * boreM * strokeM * strokeFrac;
    // Woschni's characteristic gas velocity. The second term is the extra motion
    // combustion itself creates, driven by how far pressure has risen above the motored
    // trace — so it only appears once something is burning.
    const pMotoredPa = trappedPa * Math.pow(vIvcRef / v, COEFF.GAMMA_UNBURNED);
    const wGas = COEFF.WOSCHNI_C1 * meanPistonSpeed
      + (burned > 0
        ? COEFF.WOSCHNI_C2 * (sweptM3 * trappedK / (trappedPa * vIvcRef))
          * Math.max(0, p - pMotoredPa)
        : 0);
    const hCoeff = COEFF.WOSCHNI_K * Math.pow(boreM, -0.2)
      * Math.pow(p / 1000, 0.8) * Math.pow(tGas, -0.55) * Math.pow(Math.max(wGas, 0.1), 0.8);
    // Seconds per integration step: a crank turns 6 x rpm degrees per second.
    const dtS = step / (6 * Math.max(rpm, 1));
    const dQwall = hCoeff * areaM2 * (tGas - COEFF.WALL_TEMP_K) * dtS;

    // First law over both zones together: pressure rises with heat added, falls as the
    // volume grows, and falls again with whatever the walls took. Gas hiding in the
    // crevices is at wall temperature and out of the working volume.
    const workingV = Math.max(v - creviceM3, clearanceM3 * 0.1);
    const dp = ((gamma - 1) / workingV) * (dQ - dQwall) - (gamma * p * (vNext - v)) / workingV;
    const pNext = Math.max(1, p + dp);

    // Work on the piston, trapezoidal.
    work += ((p + pNext) / 2) * (vNext - v);

    // --- BLOWBY. Flow past the rings scales with the pressure ratio across them, so it
    // is a peak-pressure phenomenon: negligible at cruise, real at 70 bar. The mass is
    // gone for good, which is why a tired ring pack costs power everywhere at once.
    blowbyFrac += COEFF.BLOWBY_PER_BAR_S * (pNext / (KPA_PER_BAR * 1000)) * dtS;

    // --- THE TWO ZONES.
    //
    // UNBURNED: compressed isentropically by whatever the burned gas is doing to the
    // pressure, less the heat it gives up to the wall. Its share of the wall area and of
    // the mass are both roughly (1 - burned), so those cancel and what is left is the
    // same Woschni coefficient against the unburned charge's own heat capacity.
    tU = trappedK * Math.pow(pNext / trappedPa, (COEFF.GAMMA_UNBURNED - 1) / COEFF.GAMMA_UNBURNED)
      - endGasCoolK;
    endGasCoolK += (hCoeff * areaM2 * Math.max(0, tU - COEFF.WALL_TEMP_K) * dtS)
      / Math.max(1e-9, chargeKg * cvU);
    tU = Math.max(COEFF.WALL_TEMP_K, tU);

    // BURNED: an energy balance on the burned mass. Fresh charge crosses the flame at the
    // unburned temperature and brings its fuel energy with it; the zone then does
    // displacement work as the pressure changes and loses its own share to the wall.
    // This is what the old `flameHeating` coefficient was standing in for — burned-gas
    // temperature really does peak just lean of stoichiometric, and now it does so
    // because there is exactly enough oxygen to burn everything, not because a Gaussian
    // said so.
    if (burned > 0) {
      const dBurned = burned - prevBurned;
      // Seed the zone at the unburned temperature the instant it first has mass in it,
      // so the first step's balance is not dividing into an empty zone.
      if (prevBurned <= 0) tB = tU;
      // Open-system enthalpy balance, per kg of TOTAL charge:
      //   x·cp_b·dT_b = (x·R·T_b/p)·dp + dx·(h_in − h_b) + q_released − q_wall
      // Everything below is that, term by term.
      const flowWork = (burned * R_AIR * tB / Math.max(p, 1)) * (pNext - p);
      const enthalpyIn = dBurned * (cpU * tU - cpB * tB);
      const released = dBurned * qPerKg;
      const qWallB = (hCoeff * areaM2 * burned * Math.max(0, tB - COEFF.WALL_TEMP_K) * dtS)
        / Math.max(1e-9, chargeKg);
      // Heat capacity rises with temperature — vibrational modes and dissociation — which
      // is what keeps flame temperature from collapsing either side of stoichiometric.
      const cpBhot = cpB * (1 + COEFF.CP_BURNED_TEMP_RISE
        * Math.max(0, tB - COEFF.CP_BURNED_REF_K) / 1000);
      tB += (flowWork + enthalpyIn + released - qWallB) / (burned * cpBhot);
      tB = clamp(tB, tU, COEFF.BURNED_GAS_MAX_K);
      if (tB > peakBurnedK) peakBurnedK = tB;
    }

    // --- AUTOIGNITION of what is left unburned. The end gas is heated by compression AND
    // by the burned gas right behind the flame front, which the two-zone temperature now
    // gives directly rather than through a fitted multiplier.
    if (burned < COEFF.KNOCK_ENDGAS_BURN_LIMIT) {
      const endGasK = tU + (tB - tU) * burned * COEFF.ENDGAS_FLAME_COUPLING;
      if (endGasK > peakEndGasK) peakEndGasK = endGasK;
      // Douaud & Eyzat ignition delay: how long this mixture survives at this pressure
      // and temperature before lighting itself. Octane enters here as a fuel property.
      const tau = tauFuelTerm
        * Math.pow(pNext / COEFF.ATM_PA, -COEFF.KNOCK_DE_N)
        * Math.exp(COEFF.KNOCK_DE_E / endGasK);
      // Livengood-Wu: autoignition when the accumulated fraction of the delay reaches 1.
      knockIntegral += (step * msPerDeg) / tau;
    }

    if (pNext > peakPressurePa) { peakPressurePa = pNext; peakPressureDeg = thetaNext; }
    if (!crossed50 && burned >= 0.5) { mfb50Deg = thetaNext; crossed50 = true; }

    p = pNext;
    v = vNext;
    prevBurned = burned;
  }

  // Exhaust temperature, from the cycle's own state at exhaust valve open rather than
  // from a correlation. What leaves the port is the burned zone after blowdown to the
  // manifold: an irreversible expansion from cylinder pressure, which cools it. This is
  // the number the turbine should see; `exhaustTempK` in thermo.js is the estimate used
  // only where the answer is needed BEFORE the cycle can be run.
  const blowdownK = tB * Math.pow(
    Math.max(0.05, BARO_KPA * 1000 / Math.max(p, 1)),
    (COEFF.GAMMA_BURNED - 1) / COEFF.GAMMA_BURNED,
  );

  return {
    imepGrossPa: work / sweptM3,
    peakPressurePa,
    peakPressureDeg,
    peakEndGasK,
    peakBurnedK,
    exhaustK: Math.max(COEFF.WALL_TEMP_K, blowdownK),
    blowbyFrac,
    knockIntegral,
    mfb50Deg,
  };
}

/**
 * The most spark advance this cycle tolerates before the end gas lights itself.
 *
 * Found by solving `runCycle` for the timing at which the autoignition integral
 * reaches 1, rather than by looking the answer up in a table of corrections. Every
 * input that changes the pressure history — compression, boost, charge temperature,
 * mixture, engine speed, cam timing, fuel octane — therefore moves the knock limit
 * automatically and in the right proportion, with no separate term for each.
 *
 * A mixture that cannot be made to knock anywhere in the searchable range — anything at
 * cruise — reports KNOCK_UNBOUNDED_BTDC rather than the ceiling, because the ceiling is
 * an artefact of the search and not a property of the engine.
 *
 * @param {CycleInput} base cycle inputs; `sparkBtdc` is ignored
 * @returns {number} knock-limited spark advance, degrees BTDC
 */
export function knockLimitedSpark(base) {
  const integralAt = (sparkBtdc) => runCycle({ ...base, sparkBtdc }).knockIntegral;
  const lo = COEFF.KNOCK_SEARCH_MIN_BTDC;
  const hi = COEFF.KNOCK_SEARCH_MAX_BTDC;

  // Most logged points cannot be made to knock at all — anything at cruise, and any
  // low-compression engine off boost. Testing the advanced end first answers those in
  // one cycle evaluation instead of a full search, which matters because this runs for
  // every point of every pull.
  if (integralAt(hi) < 1) return COEFF.KNOCK_UNBOUNDED_BTDC;
  if (integralAt(lo) >= 1) return lo;

  // Bisection. The search ceiling is deliberately below the advance at which the
  // autoignition integral stops being monotonic: advance far enough and the charge is
  // almost entirely burned before TDC, so there is little end gas left to accumulate
  // delay and the integral turns back DOWN. Bisecting across that hump would report a
  // "knock limit" well past where the engine actually started detonating. Keeping the
  // ceiling below it means the function is monotonic everywhere it is searched.
  let a = lo;
  let b = hi;
  while (b - a > COEFF.KNOCK_SEARCH_TOL_DEG) {
    const mid = (a + b) / 2;
    if (integralAt(mid) >= 1) b = mid; else a = mid;
  }
  return a;
}

/**
 * Peak cylinder pressure in bar, for display and for the wear model.
 *
 * @param {number} peakPressurePa
 * @returns {number} bar
 */
export const paToBar = (peakPressurePa) => peakPressurePa / (KPA_PER_BAR * 1000);

/**
 * Air actually trapped in one cylinder for one cycle, grams.
 *
 * The ideal gas law against the swept volume, scaled by volumetric efficiency. Exported
 * so the ECU's per-point solve and the factory calibration generator cannot end up with
 * two slightly different ideas of how much air is in the cylinder.
 *
 * @param {object} input
 * @param {number} input.veActual true cylinder filling, percent
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.chargeK incoming charge temperature, K
 * @param {number} input.sweptM3 one cylinder's displacement
 * @returns {number} grams of air
 */
export function trappedAirGrams({ veActual, mapKpa, chargeK, sweptM3 }) {
  const densityKgM3 = (mapKpa * 1000) / (R_AIR * chargeK);
  return (veActual / 100) * sweptM3 * densityKgM3 * 1000;
}

/**
 * Builds the cycle inputs for one operating point.
 *
 * Shared by the ECU's per-point solve and by the factory calibration generator, for the
 * reason every shared formula in this codebase is shared: two copies of this setup would
 * drift, and then the generated calibration would be knock-limited against a slightly
 * different engine than the one the player drives.
 *
 * @param {object} input
 * @param {number} input.rpm engine speed
 * @param {number} input.mapKpa manifold absolute pressure, kPa
 * @param {number} input.empKpa exhaust manifold pressure, kPa
 * @param {number} input.intakeK incoming charge temperature, K
 * @param {number} input.airChargeG air actually trapped per cylinder per cycle, grams
 * @param {number} input.burnedFuelG fuel that finds oxygen to burn, grams
 * @param {number} [input.fuelMassG] fuel delivered, grams — all of it evaporates and
 *   cools the charge, including the part too rich to find oxygen. Defaults to the
 *   burned mass when a caller has no separate figure
 * @param {number} input.lambda delivered lambda
 * @param {{lhv: number, octane: number, stoich: number}} input.fuel
 * @param {import('./engine.js').DerivedEngine} input.derived
 * @returns {CycleInput & {residualFrac: number, trappedK: number, effectiveCr: number}}
 */
export function cycleInputsFor({
  rpm, mapKpa, empKpa, intakeK, airChargeG, burnedFuelG, fuelMassG, lambda, fuel, derived,
}) {
  const fuelIn = fuelMassG ?? burnedFuelG;
  const sweptM3 = (derived.displacementL / derived.cyl) / 1000;
  const clearanceM3 = sweptM3 / (derived.compression - 1);
  const ivcAbdc = ivcAfterBdcDeg(derived.camDuration);
  const vIvc = cylinderVolumeM3(-180 + ivcAbdc, clearanceM3, sweptM3, COEFF.ROD_RATIO);

  const residualFrac = residualFraction({
    mapKpa, empKpa, overlapDeg: derived.overlapDeg || 0, compression: derived.compression,
  });
  // Fuel evaporating into the charge cools it before anything else happens to it, so a
  // richer mixture starts compression colder and a leaner one starts hotter.
  const cooledK = intakeK - evaporativeCoolingK(fuelIn, airChargeG, fuel);
  const trappedK = trappedChargeK(cooledK, residualFrac) + (derived.chamberOffsetK || 0);

  // Pressure at intake valve close, from the ideal gas law on the fresh charge at the
  // temperature it arrived at. Deriving it rather than assuming it equals manifold
  // pressure is what lets volumetric efficiency above 100% — ram and scavenging — show
  // up as genuinely higher cylinder pressure.
  //
  // Deliberately NOT re-derived at the residual-mixed temperature. The manifold sets the
  // pressure at IVC; hot residual raises the charge TEMPERATURE at that pressure, it
  // does not pressurise the cylinder further. Computing p from the mixed temperature at
  // fixed mass inflated trapped pressure by about a tenth under boost, and since
  // ignition delay goes as pressure to the -1.7 power, that alone made boosted engines
  // far more knock-prone than they are. Pressure comes from the fresh charge; the mixed
  // temperature below is what the thermal history and the end gas run on.
  const trappedPa = ((airChargeG / 1000) * R_AIR * cooledK) / vIvc;

  // Everything in the cylinder that has heat capacity: fresh air, the residual it mixed
  // with, AND the fuel vapour. Counting the fuel matters — it is why a rich mixture burns
  // cooler even though it releases the same heat. Past stoichiometric the extra fuel
  // finds no oxygen, so it adds mass to warm without adding energy, and flame temperature
  // falls. Leave it out and over-fuelling looks thermally free.
  const totalMassKg = ((airChargeG + fuelIn) / 1000) / Math.max(0.05, 1 - residualFrac);

  return {
    rpm,
    sparkBtdc: 0,
    trappedPa,
    boreM: derived.bore / 1000,
    strokeM: derived.stroke / 1000,
    trappedMassKg: totalMassKg,
    trappedK,
    heatJ: (burnedFuelG / 1000) * fuel.lhv * COEFF.COMBUSTION_COMPLETENESS,
    clearanceM3,
    sweptM3,
    rodRatio: COEFF.ROD_RATIO,
    ivcAbdc,
    burnDeg: burnDurationDeg({
      rpm, lambda, residualFrac, boreFlameFactor: derived.boreFlameFactor,
    }),
    octaneNumber: fuel.octane,
    lambda,
    residualFrac,
    effectiveCr: vIvc / clearanceM3,
  };
}

/**
 * MBT for one table cell, from the cycle the rest of the model runs.
 *
 * The spark advisor and the factory calibration generator must not disagree about what
 * good timing looks like — the advisor's own comment says so — so both come through
 * here rather than each estimating MBT their own way.
 *
 * @param {Parameters<typeof cycleInputsFor>[0]} input
 * @returns {number} MBT spark advance, degrees BTDC
 */
export function mbtForCell(input) {
  return mbtFromBurn(cycleInputsFor(input).burnDeg);
}

/**
 * Minimum spark for best torque, derived rather than correlated.
 *
 * MBT is the timing that centres the heat release where the piston can use it: across
 * engine types, best torque lands with 50% of the mass burned at roughly 8-10 degrees
 * after TDC. Given the Wiebe shape, the crank angle of 50% burn is a fixed fraction of
 * the burn duration after ignition, so the timing that puts it there can be written
 * down directly instead of fitted.
 *
 * That makes MBT respond to everything burn duration responds to — mixture, dilution,
 * engine speed — which the previous RPM-and-load correlation could not do.
 *
 * @param {number} burnDeg burn duration, crank degrees
 * @returns {number} MBT spark advance, degrees BTDC
 */
export function mbtFromBurn(burnDeg) {
  // Crank angle of 50% burn, as a fraction of the burn duration: solve the Wiebe
  // function for x where the burned fraction is one half.
  const half = Math.pow(Math.log(2) / COEFF.WIEBE_A, 1 / (COEFF.WIEBE_M + 1));
  // Clamped to the band a spark table can actually hold, which is the guard the
  // light-load MBT work added: a very slow, heavily diluted burn would otherwise ask
  // for advance no calibration would ever write.
  return clamp(
    COEFF.FLAME_DEVELOPMENT_DEG + half * burnDeg - COEFF.MFB50_ATDC_DEG,
    COEFF.MBT_MIN_DEG, COEFF.MBT_MAX_DEG,
  );
}
