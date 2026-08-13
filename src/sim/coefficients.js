/**
 * Calibration coefficients.
 *
 * Every empirically-tuned number in the simulation lives here, in one place, so a
 * contributor can find and adjust the model without hunting through formulas.
 * Each is annotated with what it represents and roughly why it has the value it has.
 *
 * No other file in `src/sim/` should contain a bare magic number. If you are adding
 * physics and need a fudge factor, put it here with a comment explaining it — that
 * rule is what keeps the model auditable.
 *
 * Changing anything here will move the dyno numbers, which means the behavioural
 * fingerprint tests in `tests/` will fail. That is intentional: review the diff,
 * confirm the new numbers are what you meant, then refresh the fixture with
 * `npm run test:fingerprint:update`.
 */
export const COEFF = {
  // --- Friction & pumping (mean effective pressures, Pa) ---
  RUBBING_BASE_PA: 45000,      // rubbing FMEP at zero RPM
  RUBBING_PER_RPM: 6.5,        // rubbing FMEP rise per RPM
  SPRING_FMEP_PER_RATE: 190,   // extra FMEP per point of valve spring rate above stock
  SPRING_RPM_BIAS: 0.6,        // how much of spring drag scales with RPM (rest is constant)
  // Extra rubbing FMEP per main bearing beyond the V6 baseline of four.
  // Anchored arithmetically rather than guessed: total rubbing FMEP at 6000 RPM is
  // about 84 kPa, published breakdowns put the crankshaft group near 15% of friction
  // (~12.6 kPa), and the baseline carries four mains — so roughly 3 kPa each.
  FMEP_PER_MAIN_BEARING_PA: 3000,
  // Fraction of rubbing friction added by a balance shaft pair. The National
  // Academies' fuel-economy report records a measured 6% friction reduction when
  // Ford deleted the balance shaft from its 1.0 L three-cylinder. That measurement
  // is a SINGLE shaft on a 1.0 L I3; this coefficient is applied here to TWIN-shaft
  // 1.8 L+ I4s (see hasBalanceShafts in hardware.js), which is an extrapolation
  // beyond the source, not a like-for-like figure.
  FMEP_BALANCE_SHAFT_FRAC: 0.06,

  // --- Combustion efficiency roll-off ---
  // Torque falls as a parabola either side of MBT. 0.0016 gives roughly a 4% loss at
  // 5 deg from MBT, which matches published spark-sweep curves closely enough.
  TIMING_FALLOFF: 0.0016,
  // Same idea for mixture: ~2% loss one full AFR point off best power.
  AFR_FALLOFF: 0.022,
  EFFICIENCY_FLOOR: 0.55,      // neither term is allowed to drive output below this

  // --- Burn duration, which is what MBT actually tracks ---
  // MBT is not a curve fitted to a dyno; it is the advance that puts 50% of the mass
  // fraction burned just after TDC, where the expansion stroke can still use the
  // pressure. So model the burn and derive the timing from it.
  //
  // The interval from spark to 50% MFB, in crank degrees, at 1500 rpm and atmospheric
  // pressure. Combined with MFB50_ATDC_DEG below this reproduces the old model's
  // wide-open-throttle numbers exactly, which is deliberate: the light-load end was
  // wrong, the WOT end was not, and NA dyno power must not move.
  BURN_REF_DEG: 26.5,
  // Extra crank degrees of burn per 6000 rpm. Turbulence speeds the burn up in real
  // time as the engine spins faster, but not fast enough to keep pace with the crank,
  // so the burn occupies more DEGREES the higher you rev.
  BURN_RPM_GAIN: 12,
  // How sharply a thinning charge slows the burn, as an exponent on the inverse
  // pressure ratio. A part-throttle charge is dilute and low in turbulence, so its
  // flame travels slowly and must be lit much earlier — which is exactly why factory
  // cruise maps carry 40-50 deg of advance and never complain. 0.36 puts 20 kPa cruise
  // at ~43 deg while leaving atmospheric untouched.
  BURN_DILUTION_EXP: 0.36,
  // Lowest pressure ratio the burn model will extrapolate to. Below this the inverse
  // law runs away, and no engine operates there under power anyway.
  BURN_RATIO_FLOOR: 0.05,
  // Where 50% of the charge should have burned, in degrees AFTER top dead center.
  // Textbook optimum is 8-10 deg ATDC across a wide range of engines.
  MFB50_ATDC_DEG: 8.5,
  // The range a production spark table could actually command. The burn model is an
  // extrapolation at its extremes; these stop it producing timing no calibration would
  // ever contain.
  MBT_MIN_DEG: 10,
  MBT_MAX_DEG: 50,

  // --- Knock envelope (all in crank degrees) ---
  KNOCK_CHARGE_GAIN: 14,       // deg of margin gained/lost per unit of charge index
  KNOCK_CHARGE_RATIO_GAIN: 10, // deg gained as charge falls below reference (inverse law)
  KNOCK_CHARGE_REF: 0.90,      // charge index treated as the calibration reference point
  KNOCK_LEAN_PENALTY: 2.5,     // deg lost per AFR point leaner than best power
  KNOCK_RICH_BONUS: 1.0,       // deg gained per AFR point richer (capped)
  KNOCK_RICH_CAP: 2,
  KNOCK_IAT_PER_C: 0.08,       // deg lost per degree C of charge temp above ambient
  KNOCK_OVERBOOST_PENALTY: 1.5,// deg lost per psi past the compressor's efficient range
  MAX_KNOCK_RETARD: 18,        // most a real ECU will accumulate before giving up

  // --- Wear rates (percent of component life per pull) ---
  WEAR_KNOCK: 0.06,            // per degree of retard, per logged point
  WEAR_LEAN: 0.15,
  WEAR_VALVE_LEAN_BOOST: 0.4,
  WEAR_RICH_BORE_WASH: 0.9,    // per unit of lambda below the rich threshold
  WEAR_BEARING_PER_PSI: 0.10,

  // --- Camshaft & valvetrain ---
  CAM_PEAK_SHIFT_PER_DEG: 32,  // RPM the VE peak moves per degree of extra duration
  CAM_OVERLAP_PER_DEG: 0.55,   // overlap degrees gained per degree of duration
  CAM_FLOW_GAIN_PER_DEG: 0.0015,
  FLOAT_BASE_RPM: 7950,        // float speed at stock cam and stock springs
  FLOAT_PER_SPRING_RATE: 58,
  FLOAT_PER_CAM_DEG: 14,
  FLOAT_COLLAPSE_RPM: 1100,    // RPM band over which filling collapses past float
  FLOAT_COLLAPSE_FLOOR: 0.30,

  // --- Mixture targets ---
  BEST_AFR_NA: 12.85,          // lambda ~0.87, mid of the published best-torque band
  BEST_AFR_BOOST_SHIFT: 0.08,  // AFR richer per psi of boost
  BEST_AFR_BOOST_CAP: 0.65,    // richest the target is allowed to shift (lambda ~0.83)
  RICH_DAMAGE_LAMBDA: 0.75,    // below this under load, unburnt fuel starts causing harm
  LEAN_DAMAGE_AFR: 15.2,

  // --- Idle control (live engine) ---
  IDLE_AIR_GAIN_UP: 0.012,     // air is added far faster than removed (dashpot)
  IDLE_AIR_GAIN_DOWN: 0.0008,
  IDLE_AIR_DAMP: 0.004,
  IDLE_SPARK_GAIN: 0.022,      // spark gives instant torque authority; air is slow
  IDLE_SPARK_LIMIT: 14,
  IDLE_BLEED_RATE: 0.06,       // how fast the idle valve returns to base off-idle

  // --- Volumetric efficiency modifiers ---
  VE_PER_COMPRESSION_POINT: 0.005, // less clearance volume = less residual dilution
  VE_ALUMINIUM_HEAD_GAIN: 1.015,   // cooler chamber = denser incoming charge
  VE_E85_CHARGE_COOLING: 1.03,     // high latent heat of vaporisation densifies charge
  VE_EXHAUST_UNDERSIZE: 0.08,      // top-end VE lost per inch undersized
  VE_EXHAUST_OVERSIZE: 0.05,       // low-end VE lost per inch oversized (scavenging)
  VE_TURBINE_BACKPRESSURE: 0.97,   // baseline cost of having a turbine in the stream

  // --- Fuel trims ---
  STFT_GAIN: 42,
  LTFT_LEARN_RATE: 0.004,
  TRIM_LIMIT: 25,

  // --- MAF measurement error ---
  // A bigger intake housing or turbo plumbing changes the airflow profile across the
  // sensor, so a MAF calibrated for stock hardware under-reads once either is fitted.
  // Values are illustrative of the real-world magnitude tuners correct for with a MAF
  // scalar or transfer-function rescale, not measurements of a specific part.
  MAF_ERROR_INTAKE: 0.90,
  MAF_ERROR_TURBO: 0.92,

  // --- Manifold vacuum model ---
  // RPM normalisation datum for the engine-speed term in the manifold vacuum model
  // (`live.js`'s `nFrac`, how hard the engine pulls vacuum through a given throttle
  // opening). This is DELIBERATELY a fixed absolute RPM, not the per-engine redline:
  // it calibrates how fast a generic engine pumps air, which does not change just
  // because a build has a taller or shorter rev limit. Do not wire this to
  // `derived.redline`.
  //
  // Today's max shippable redline (7500, see `DEFAULT_REDLINE_RPM` in `engine.js` and
  // the RPM axis in `tables.js`) equals this datum, so the resulting `nFrac` never
  // exceeds 1.0 in practice — the 1.2 clamp ceiling around it in `live.js` is
  // currently unreachable headroom, not a live limit.
  MANIFOLD_VACUUM_RPM_NORM: 7500,

  // --- Engineer Score: static compression under boost ---
  // Static compression a boosted build carries on 91 octane with no charge cooling
  // before the Engineer Score calls the combination incoherent.
  //
  // Factory direct-injection turbo engines ship across a 10.2-11.0 band (BMW N54 10.2,
  // BMW B58 11.0, Toyota/BMW 2.0 T 11.0). This base clears the BOTTOM of that band on
  // its own; the top of it is cleared by the octane and charge-cooling credits below,
  // not by this number. 10.8 + 0.3 (93 octane) + 0.4 (intercooler) = 11.5, which is how
  // a B58 as actually sold comes out unpenalised. Strip the intercooler and drop it to
  // 91 and it is charged 2 points — deliberately, because that combination is a
  // genuinely compromised build rather than a factory one.
  //
  // The band sits high because direct injection, at the wide-open-throttle homogeneous-
  // charge conditions this rule grades, sprays fuel into the cylinder early in the
  // intake stroke while the valve is still open, giving it time to mix. The fuel
  // evaporates INSIDE the cylinder instead of in the intake port, so its latent heat is
  // pulled from the TRAPPED charge rather than from the port walls and the back of the
  // intake valve, and that buys real knock margin — precisely why those engines can run
  // compression that would have been reckless on a port-injected engine. (Spraying after
  // the intake valve closes is stratified lean-burn, used at light load to save fuel;
  // doing that at full load would starve the mixture of time to prepare and ruin it.)
  // This model has no separate term for that, so the base carries it implicitly and
  // imprecisely: a port-injected engine gets the same allowance, which it has not
  // earned. Issue #24 tracks modelling injection type properly; once it lands, this
  // should key off it instead of averaging over it.
  //
  // This headroom is deliberately boost-LEVEL-independent: `computeEngineerScore` gates
  // the whole rule on whether the build is making any boost at all (`peakBoostPsi > 0`),
  // but does not scale the headroom by how much. A build making 3 psi and one making 24
  // psi are judged by the same ceiling here — that is a known simplification, not an
  // oversight, and scaling headroom with boost level is deferred to a separate issue.
  COMPRESSION_BOOST_BASE: 10.8,
  // Extra static compression supported per degree of octane knock bonus. Deliberately a
  // steep discount off the model's own physics currency, not a fresh guess: engine.js's
  // `compressionKnockAdj = (10.3 - CR) * 2.0` prices one point of compression at 2
  // degrees of knock margin, so E85's +14 degree bonus is worth 7 points of compression
  // in that same currency. Paying out the full 7 here would bill the octane decision
  // twice — once in the physics, which already retimes the tune and logs knock events
  // for it, and again in the Engineer Score. At 0.1, E85 buys back only 1.4 points, about
  // a 5x discount, on purpose.
  COMPRESSION_PER_OCTANE_DEG: 0.1,
  // Extra static compression supported by intercooler charge cooling, in points.
  // Discounted on the same principle as COMPRESSION_PER_OCTANE_DEG — the physics
  // already charges for this once, so the score should not bill it again at full price
  // — but not by the same factor. At 15 psi, `chargeTempK` (thermo.js) takes charge
  // temperature from 397.23 K with no intercooler to 327.77 K with one, a 69.46 °C
  // delta, which at COEFF.KNOCK_IAT_PER_C (0.08 deg per °C) is 5.56 degrees of knock
  // margin — 2.78 points of compression in the physics' own currency (2 degrees per
  // compression point, the same rate `compressionKnockAdj` in engine.js uses). Paying
  // the full 2.78 here would bill the intercooler decision twice, once in the physics
  // and once in the score, so 0.4 pays out about a seventh of it instead — roughly a 7x
  // discount, steeper than COMPRESSION_PER_OCTANE_DEG's 5x (1.4 of 7).
  COMPRESSION_INTERCOOLER_GAIN: 0.4,
  // Engineer Score points charged per point of compression past that headroom, and the
  // most this rule will ever deduct. The cap equals the flat penalty this rule replaced,
  // so the new rule is never harsher than its predecessor — it only stops charging that
  // maximum to builds that did not earn it.
  COMPRESSION_PENALTY_PER_POINT: 10,
  COMPRESSION_PENALTY_CAP: 15,
};
