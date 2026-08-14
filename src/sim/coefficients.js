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
  // --- Knock envelope: margins and penalties (all in crank degrees) ---
  KNOCK_CHARGE_GAIN: 14,       // deg of margin gained/lost per unit of charge index
  KNOCK_CHARGE_RATIO_GAIN: 10, // deg gained as charge falls below reference (inverse law)
  KNOCK_CHARGE_REF: 0.90,      // charge index treated as the calibration reference point
  KNOCK_LEAN_PENALTY: 2.5,     // deg lost per AFR point leaner than best power
  KNOCK_RICH_BONUS: 1.0,       // deg gained per AFR point richer (capped)
  KNOCK_RICH_CAP: 2,
  // Deg lost per degree C of charge temperature above ambient. The datum this counts
  // from is AMBIENT_C (constants.js), not a number of its own: "above ambient" has to
  // mean above the ambient the rest of the model uses, or the two disagree. See the
  // note in knock.js for the 25 °C literal this replaced.
  KNOCK_IAT_PER_C: 0.08,
  KNOCK_OVERBOOST_PENALTY: 1.5,// deg lost per psi past the compressor's efficient range
  MAX_KNOCK_RETARD: 18,        // most a real ECU will accumulate before giving up
  // Knock margin bought by exhaust work, degrees. Headers are worth more than a
  // cat-back because they attack the part that matters — less residual exhaust gas left
  // in the cylinder to preheat the incoming charge, rather than just less restriction
  // downstream of the turbine or cat.
  KNOCK_HEADERS_BONUS: 1.5,
  KNOCK_EXHAUST_BONUS: 0.5,
  // Knock margin from cylinder size. A small cylinder has a shorter flame path from
  // plug to the far side of the bore, so the end gas spends less time being compressed
  // and heated before the flame front reaches it — the reason motorcycle engines run
  // compression ratios a big-bore V8 could not touch. Litres per cylinder, and the
  // margin either side of the band between them.
  KNOCK_SMALL_CYL_L: 0.5,
  KNOCK_LARGE_CYL_L: 0.7,
  KNOCK_SMALL_CYL_BONUS: 1,
  KNOCK_LARGE_CYL_PENALTY: -1,
  // Knock margin lost to a cast iron head, degrees. Iron conducts roughly a third of
  // what aluminium does, so the chamber runs hotter and the end gas with it.
  KNOCK_IRON_HEAD_PENALTY: -1.5,
  // Static compression the base knock table (BASE_KNOCK_LIMIT_91 in tables.js) is
  // written for, and the margin each point of compression above or below it is worth.
  //
  // Two degrees per point is the model's exchange rate between compression and knock
  // margin, and it is quoted by name in the Engineer Score comments below
  // (COMPRESSION_PER_OCTANE_DEG, COMPRESSION_INTERCOOLER_GAIN) to price their own
  // discounts. Changing it moves those two rules as well, even though they do not read
  // it directly — one of the reasons it belongs here rather than inline in engine.js.
  KNOCK_COMPRESSION_REF: 10.3,
  KNOCK_DEG_PER_COMPRESSION_POINT: 2.0,

  // --- Knock envelope: shape of the load and pressure terms (dimensionless) ---
  // Smallest charge index the inverse load law will divide by. At deep vacuum the
  // computed margin runs away toward infinity, which is directionally right — a
  // cruising engine genuinely cannot knock — but needs a floor to stay finite.
  //
  // No operating point the app can reach comes near this: it would take under about
  // 4 kPa of manifold pressure at 100% VE. It is a guard, and it is here rather than
  // inline precisely because an unreachable literal is one a fingerprint diff cannot
  // police. In COEFF it is at least in the constants dump.
  KNOCK_CHARGE_INDEX_FLOOR: 0.04,
  // How hard the mixture terms scale with cylinder pressure. Lean mixtures and rich
  // mixtures only matter for knock when there is real pressure behind them, and the
  // relationship is steeper than linear — hence the 1.5 power of the pressure ratio.
  KNOCK_PRESSURE_EXP: 1.5,
  // Bounds on that pressure factor. The floor is unreachable in the app (it needs
  // manifold pressure under about 14 kPa); the ceiling binds regularly under boost and
  // is what stops a high-boost lean condition from being charged without limit.
  KNOCK_PRESSURE_MIN: 0.05,
  KNOCK_PRESSURE_MAX: 2.6,
  // The rich-mixture bonus is scaled by the same pressure factor but on a narrower
  // band: charge cooling from extra fuel does something even at light load, and does
  // not keep scaling all the way up to the lean penalty's ceiling.
  KNOCK_RICH_PRESSURE_MIN: 0.3,
  KNOCK_RICH_PRESSURE_MAX: 1.5,

  // --- Peak cylinder pressure (see pressure.js) ---
  // Polytropic exponent for the compression stroke. The isentropic value for air is
  // 1.4; real cylinders lose heat to the walls and leak past the rings on the way up,
  // and measured motoring traces sit around 1.30-1.35. 1.32 is the middle of that.
  PEAK_POLYTROPIC_N: 1.32,
  // How much combustion multiplies the motored (compression-only) pressure at MBT
  // spark. Published pressure traces for a wide-open-throttle spark-ignition engine
  // put peak firing pressure at roughly 2x-2.5x the motored peak; 2.2 lands a stock
  // 10.3:1 naturally aspirated engine near 50 bar at wide-open throttle, which is
  // where real measurements put it.
  PEAK_COMBUSTION_RISE: 2.2,
  // Advancing past MBT keeps raising peak pressure while torque falls — about 1.5% per
  // degree, capped, because the burn cannot start before there is a charge to burn.
  PEAK_ADVANCE_RISE_PER_DEG: 0.015,
  PEAK_ADVANCE_CAP_DEG: 10,
  // Retarding from MBT moves the pressure peak later, onto a descending piston in a
  // growing volume. Spark-sweep traces lose roughly 2-3% of peak pressure per degree;
  // the floor is where the burn is so late that it is finishing into the exhaust
  // stroke and peak pressure is barely above the motored value.
  PEAK_RETARD_FALL_PER_DEG: 0.025,
  PEAK_RETARD_FLOOR: 0.45,
  // Peak cylinder pressure a stock bottom end — cast pistons, powdered-metal rods,
  // production rod bolts — survives indefinitely. Above it, damage accumulates whether
  // or not the mixture ever detonates. Anchored against what the shipped presets
  // actually produce: the most heavily boosted factory engine in the app (the Golf R's
  // EA888.3 at 17 psi) peaks at about 95 bar on its own factory calibration, so this
  // sits clear of every production engine here while still catching the builds that
  // stack big static compression on top of big boost.
  PEAK_PRESSURE_LIMIT_BAR: 110,

  // --- Wear rates (percent of component life per pull) ---
  WEAR_KNOCK: 0.06,            // per degree of retard, per logged point
  WEAR_LEAN: 0.15,
  WEAR_VALVE_LEAN_BOOST: 0.4,
  WEAR_RICH_BORE_WASH: 0.9,    // per unit of lambda below the rich threshold
  // Piston, rod and rod-bolt damage per bar of peak pressure past
  // PEAK_PRESSURE_LIMIT_BAR, per logged point. A build sitting 20 bar over the limit
  // across a whole sweep spends about 5% of piston life per pull — serious, but slower
  // than sustained detonation, which is the right ordering: overload cracks a ring land
  // over a season of pulls, knock does it in an afternoon.
  WEAR_PISTON_PER_BAR: 0.004,
  // Rod and main bearings are loaded by peak cylinder pressure on every firing stroke,
  // so their wear tracks the pull's AVERAGE peak pressure rather than boost. Boost was
  // the old proxy for this and it was a bad one: it charged a 9.5:1 engine and a 12.5:1
  // engine the same amount for the same manifold pressure, when the second is putting
  // half again as much load through the same bearings.
  //
  // Calibrated to leave the previous boost-based numbers roughly where they were for
  // the builds that already existed — a stock naturally aspirated pull at wide-open
  // throttle still costs about 0.15, and the N54 preset still costs about 0.6 — so
  // what this change moves is the RELATIONSHIP to compression, not the overall rate.
  // One case does move: a part-throttle pull now costs nothing at all, where the old
  // boost-based expression charged a flat 0.05. That is deliberate. Below this
  // threshold the bearings are inside what their oil film carries indefinitely, and an
  // engine held at 40 kPa is not spending bearing life in any way worth modelling.
  BEARING_PRESSURE_FREE_BAR: 38,
  WEAR_BEARING_PER_BAR: 0.03,
  // Average peak pressure above which the pull log raises the bottom-end advisory.
  // About 40% above what a healthy naturally aspirated engine puts through its
  // bearings at wide-open throttle, so the advisory means "this is boosted-engine
  // loading now", not "you drove it".
  BEARING_EVENT_BAR: 60,

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
  // steep discount off the model's own physics currency, not a fresh guess:
  // KNOCK_DEG_PER_COMPRESSION_POINT above prices one point of compression at 2 degrees
  // of knock margin, so E85's +14 degree bonus is worth 7 points of compression in that
  // same currency. Paying out the full 7 here would bill the octane decision
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
  // margin — 2.78 points of compression in the physics' own currency (again
  // KNOCK_DEG_PER_COMPRESSION_POINT, 2 degrees per point). Paying
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
