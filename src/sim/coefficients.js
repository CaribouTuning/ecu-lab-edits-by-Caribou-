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

  // --- Engine cycle: geometry and integration (see cycle.js) ---
  // Crank-angle step for the cycle integration. 2 degrees over the ~265 degree closed
  // period is 133 steps. Halving it to 1 degree moves indicated work by under 0.2% and
  // doubles the cost of every logged point, every table cell of every generated factory
  // calibration, and every knock-limit search — it is not worth it.
  CYCLE_STEP_DEG: 2,
  // Connecting rod length ÷ crank radius. Production petrol engines run 1.5-1.9; 1.75
  // is mid-band. Not currently player-editable, but the cycle reads it from here rather
  // than assuming an infinitely long rod, which would misplace the piston near TDC by
  // enough to matter to peak pressure.
  ROD_RATIO: 1.75,
  // Intake valve close, degrees after BDC, and how it moves with camshaft duration.
  // IVC is what sets EFFECTIVE compression: the piston does not start compressing until
  // the valve shuts, so every engine's effective ratio is below its static one. A longer
  // cam shuts later, which is exactly why a big cam tolerates more static compression
  // than its number suggests, and why it gives away low-RPM cylinder pressure to get it.
  IVC_BASE_ABDC: 45,
  IVC_CAM_REF_DURATION: 210,
  IVC_PER_CAM_DEG: 0.5,
  // Ratio of specific heats, unburned charge and burned products. Air at chamber
  // temperatures is near 1.35; combustion products are polyatomic and store energy in
  // vibrational modes, so gamma falls toward 1.25-1.30. The cycle blends between the two
  // with mass fraction burned. Holding gamma at the unburned value would overstate peak
  // pressure by roughly 15%.
  GAMMA_UNBURNED: 1.35,
  GAMMA_BURNED: 1.27,
  // Fraction of released heat that goes into the chamber walls instead of the piston,
  // lumped into one number. A Woschni heat-transfer correlation is the principled
  // replacement and would make this vary with speed, size and charge motion; this is the
  // single largest simplification left in the cycle model.
  CYCLE_HEAT_LOSS_FRAC: 0.133,
  // Standard atmosphere in Pa — the pressure unit the Douaud-Eyzat correlation is
  // written in.
  ATM_PA: 101325,

  // --- Engine cycle: combustion (Wiebe) ---
  // Wiebe efficiency and form factors. a = 5 puts 99.3% of the mass burned by the end of
  // the nominal duration; m = 2 gives the S-curve shape that matches measured
  // mass-fraction-burned traces for a homogeneous-charge spark-ignition engine.
  WIEBE_A: 5,
  WIEBE_M: 2,
  // Crank degrees between the spark event and the start of appreciable heat release,
  // while the flame kernel forms. Real engines show 5-15 degrees depending on charge
  // motion and mixture.
  FLAME_DEVELOPMENT_DEG: 8,
  // Burn duration at the reference condition, crank degrees, and what moves it.
  // Duration in CRANK degrees is roughly speed-independent — turbulence scales with
  // piston speed, so the flame speeds up about as fast as the crank does — which is why
  // BURN_PER_RPM is small and not, say, proportional.
  BURN_DURATION_BASE_DEG: 42,
  BURN_RPM_REF: 4000,
  BURN_PER_RPM: 0.00004,
  // Lambda that burns fastest. Flame speed peaks slightly rich of stoichiometric, near
  // lambda 0.9, which is a large part of why best-torque mixture is rich of stoich.
  BURN_FASTEST_LAMBDA: 0.9,
  BURN_LAMBDA_PENALTY: 1.4,
  // Residual burned gas carries no oxygen and soaks up heat, so it slows the flame
  // sharply. This is the mechanism behind a big cam's lumpy idle: overlap traps
  // residuals, the burn drags out, and combustion becomes unstable.
  //
  // Sized against the light-load MBT work: a cruise charge at 20 kPa is about a quarter
  // residual here, which stretches the burn past 80 crank degrees and puts cruise MBT in
  // the 40-50 degree band real factory maps carry. That was the defect that work was
  // written to fix, and the integrated burn has to reproduce its conclusion — through
  // dilution, which is the actual mechanism, rather than through a pressure-ratio term.
  BURN_RESIDUAL_PENALTY: 3.8,

  // --- Engine cycle: autoignition (Douaud & Eyzat) ---
  // Ignition delay correlation: tau[ms] = A · (ON/100)^B · p[atm]^-N · exp(E/T[K]),
  // integrated per Livengood-Wu until the accumulated fraction reaches 1. These are the
  // published coefficients of the correlation, not fitted values — the whole point of
  // moving to this form is that the knock model is now a cited correlation with fuel
  // octane as a real input, rather than a stack of additive corrections in degrees.
  // The one fitted number in the autoignition model: a multiplier on the ignition
  // delay. The correlation's published coefficients were derived on a specific engine
  // with a specific chamber, and every implementation of it carries a scale factor for
  // the engine it is being applied to. This is that factor, and it is anchored on the
  // shipped production engines: it is set so each preset's real factory calibration
  // sits just under its knock limit, which is what a factory calibration is BY
  // DEFINITION. `tests/presets.test.js` fails if that stops being true.
  //
  // It also absorbs, honestly and in one place, what the cycle still does not model:
  // chamber shape and turbulence, and the difference between a port-injected and a
  // direct-injected charge. Eight separate hand-fitted corrections in degrees became one
  // fitted multiplier on a published correlation — that is the trade, and it is a good
  // one.
  //
  // Fitted against two anchors at once: the boosted presets must reach their published
  // output without their factory calibration knocking, AND a stock 10.3:1 engine on 91
  // octane must still run out of knock margin at wide-open throttle in the mid thirties,
  // which is where a real one does. At 1.7, paired with the flame-heating term below, it
  // lands at 36.4 degrees at best-power mixture. Higher values pass
  // the presets more comfortably but push the naturally aspirated limit past anything
  // the app can command, which would quietly delete the most basic lesson in the
  // tutorial — that you can over-advance an engine on pump gas.
  KNOCK_TAU_SCALE: 1.7,
  KNOCK_DE_A: 17.68,
  KNOCK_DE_B: 3.402,
  KNOCK_DE_N: 1.7,
  KNOCK_DE_E: 3800,
  // End-gas heating from the flame, as a function of mixture.
  //
  // A single-zone trace derives end-gas temperature from PRESSURE alone, which misses
  // the other thing heating it: radiation and conduction from the burned gas right
  // behind the flame front. Burned-gas temperature peaks slightly LEAN of
  // stoichiometric — near lambda 1.05, where there is just enough oxygen to burn
  // everything and no surplus fuel or air left over to absorb heat.
  //
  // Without this term the model got lean mixtures backwards: less fuel means less heat
  // release and a lower peak pressure, so a lean charge looked SAFER, when in reality
  // lean-under-load is one of the fastest ways to hole a piston. This restores that,
  // and it is why the rich mixture a tuner commands at wide-open throttle is a
  // knock-control measure and not just insurance.
  //
  // A two-zone model tracking burned-gas temperature properly is the real answer; this
  // is a one-coefficient stand-in for it, applied to the end gas as a temperature
  // multiplier peaking at the lambda where flame temperature does.
  ENDGAS_FLAME_TEMP_GAIN: 0.07,
  FLAME_TEMP_PEAK_LAMBDA: 1.05,
  FLAME_TEMP_WIDTH: 0.28,
  // Stop accumulating once this much of the charge has burned: past it there is
  // essentially no unburned end gas left to autoignite.
  KNOCK_ENDGAS_BURN_LIMIT: 0.95,
  // Bracket and tolerance for the knock-limit search. The lower bound is the most
  // retarded spark the search will report; the upper bound is past any timing the app
  // can command, so a mixture that simply cannot knock reports the ceiling.
  KNOCK_SEARCH_MIN_BTDC: -10,
  KNOCK_SEARCH_MAX_BTDC: 45,
  // What to report when nothing in the searchable range makes this mixture knock — a
  // cylinder in deep vacuum, essentially. Reporting the search CEILING instead would be
  // a lie with consequences: the spark advisor would read it as a hard limit and call a
  // stock cruise cell carrying 47 degrees dangerous, which is precisely the false alarm
  // the light-load MBT work removed. Far above anything a spark table can hold, so
  // whatever else binds — MBT, always, at light load — is correctly the lower ceiling.
  KNOCK_UNBOUNDED_BTDC: 90,
  KNOCK_SEARCH_TOL_DEG: 0.25,

  // --- Charge cooling from fuel evaporation ---
  // Liquid fuel takes its heat of vaporisation out of the charge as it evaporates, so a
  // richer mixture arrives at the cylinder colder. This is a first-order knock input the
  // model had no term for at all, and it is most of why E85 resists knock: its latent
  // heat is roughly double gasoline's AND it needs about 1.4 times the fuel mass for the
  // same lambda, so it can drop charge temperature by 80-90 K where pump gasoline manages
  // 25-30. Without it, the model made LEAN mixtures look knock-safe — they release less
  // heat — which is backwards, and exactly the mistake that gets real engines killed.
  //
  // Latent heat of vaporisation, J/kg. Gasoline is ~350 kJ/kg; ethanol ~840, so an E85
  // blend lands near 760.
  FUEL_LATENT_HEAT_GASOLINE: 350000,
  FUEL_LATENT_HEAT_ETHANOL: 760000,
  // Stoichiometric ratio below which a fuel is treated as an ethanol blend.
  FUEL_ETHANOL_STOICH_MAX: 12,
  // Specific heat of the charge at constant pressure, J/(kg·K).
  CHARGE_CP: 1005,
  // How much of the fuel evaporates in the cylinder rather than in the port. Port
  // injection loses much of the cooling to the intake runner walls and the back of the
  // valve; direct injection puts nearly all of it into the trapped charge. The model has
  // no injection-type input yet (issue #24), so this is the blended middle.
  FUEL_EVAP_IN_CYLINDER: 0.6,

  // --- Residual gas ---
  // Burned gas left in the cylinder from the previous cycle. It dilutes the fresh
  // charge, slows the burn, and — because it arrives at exhaust temperature — raises the
  // temperature the fresh charge starts compression from, which is a first-order knock
  // input the model previously had no term for at all.
  //
  // The clearance volume sets the floor: at BDC the chamber still holds one clearance
  // volume of exhaust at roughly exhaust pressure. Overlap and low load raise it, boost
  // lowers it because the fresh charge scavenges the chamber out.
  RESIDUAL_BASE: 0.04,
  RESIDUAL_PER_OVERLAP_DEG: 0.004,
  RESIDUAL_LOAD_EXP: 1.15,
  RESIDUAL_MAX: 0.35,
  // Temperature the residual fraction is mixed in at, K. Exhaust gas in the chamber at
  // the end of blowdown, not peak in-cylinder temperature.
  RESIDUAL_TEMP_K: 1050,

  // --- Exhaust manifold pressure ---
  // What the piston pushes against on the exhaust stroke. Naturally aspirated, this is
  // barometric plus a small system backpressure that rises with flow. With a turbine in
  // the stream it is far higher, and THAT is the real cost of boost the previous model
  // omitted entirely — it clamped pumping work to zero above atmospheric, so a boosted
  // engine paid nothing at all for its own backpressure.
  //
  // Published exhaust-manifold-to-boost pressure ratios run about 1.0-2.0 depending on
  // how well the turbine is matched. This sits mid-band, bounded from above by the three
  // boosted presets: they are real production engines with published output, and a
  // harsher ratio puts them under their ratings. The housing-size relief below then
  // moves a given build either side of it.
  // Engine speed the exhaust flow term is normalised against, so `flowFrac` is about
  // 1.0 at full load near the top of a typical powerband.
  EMP_FLOW_REF_RPM: 6000,
  EMP_NA_PER_FLOW: 9000,
  EMP_TURBINE_RATIO: 1.3,
  // How much of the turbine's backpressure a larger housing relieves, per step of
  // turbine size away from medium.
  EMP_TURBINE_SIZE_RELIEF: 0.18,

  // --- Retired: the additive knock envelope ---
  // Twenty-one coefficients used to live here: a base timing table plus separate
  // hand-fitted corrections in degrees for charge index, mixture, charge temperature,
  // overboost, exhaust work, cylinder size, head material and compression, a pair of
  // pressure-factor clamps, and a five-term plane for MBT.
  //
  // They are gone because `cycle.js` now integrates a pressure trace and reads the knock
  // limit off an autoignition integral, so every one of those effects arrives through
  // the physics rather than through a number fitted to stand in for it. What replaced
  // twenty-one fitted coefficients is one: KNOCK_TAU_SCALE, above, on a published
  // correlation.
  //
  // Two of them were never corrections and survive as physical properties instead:
  // BORE_FLAME_REF_MM (flame travel distance) and IRON_HEAD_CHAMBER_K (chamber heat).
  // --- Burn duration, which is what MBT actually tracks ---
  // MBT is not a curve fitted to a dyno; it is the advance that puts 50% of the mass
  // fraction burned just after TDC, where the expansion stroke can still use the
  // pressure. So model the burn and derive the timing from it.
  //
  // RETIRED: the burn-duration CORRELATION — spark-to-50%-burn as a formula in RPM and
  // pressure ratio, with a floor to stop the inverse law running away. Its conclusion is
  // kept in full, including the light-load end it was written to fix; what replaced it is
  // the burn the cycle actually integrates, so dilution, mixture, bore and engine speed
  // move it through the mechanism instead of through an exponent. See
  // BURN_DURATION_BASE_DEG and the terms around it.
  MFB50_ATDC_DEG: 8.5,
  // The range a production spark table could actually command. The burn model is an
  // extrapolation at its extremes; these stop it producing timing no calibration would
  // ever contain.
  MBT_MIN_DEG: 10,
  MBT_MAX_DEG: 50,

  MAX_KNOCK_RETARD: 18,        // most a real ECU will accumulate before giving up
  // Bore the burn-duration model is written for, mm. Flame travel scales with bore: a
  // big cylinder takes longer to burn through, which is why a large-bore V8 is more
  // knock-prone than a small four at the same compression — the end gas spends longer
  // being compressed and heated before the flame reaches it. This replaces the old
  // additive per-cylinder-size bonus, and does more than it could: moving burn duration
  // also moves MBT and the shape of the whole pressure trace.
  BORE_FLAME_REF_MM: 92,
  // Chamber heat a cast iron head adds to the charge, K. Iron conducts about a third of
  // what aluminium does, so the chamber and the charge sitting in it run hotter. Feeding
  // this into trapped charge temperature — rather than subtracting degrees of margin —
  // is what makes it reach the autoignition integral the way it does in reality.
  IRON_HEAD_CHAMBER_K: 22,



  // Peak cylinder pressure a stock bottom end — cast pistons, powdered-metal rods,
  // production rod bolts — survives indefinitely. Above it, damage accumulates whether
  // or not the mixture ever detonates.
  //
  // Anchored on THIS MODEL's pressure scale, not on a literature figure, and the
  // difference matters enough to state plainly: published failure thresholds for
  // production internals sit around 110-130 bar, but a single-zone cycle with a lumped
  // heat-loss fraction reads lower than a real indicator trace, so borrowing that number
  // directly would make the overload unreachable. The anchor instead is the shipped
  // presets: the most heavily boosted factory engine here (the Golf R's EA888.3 at 17
  // psi) peaks at 69 bar on its own factory calibration, and builds that stack big static
  // compression on big boost reach 105-111. 100 sits between them, so a production
  // engine is always clear and an abusive build always trips.
  // `tests/presets.test.js` asserts the clearance, so the anchor cannot drift silently.
  PEAK_PRESSURE_LIMIT_BAR: 100,

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
  // Calibrated to leave the wear numbers roughly where they have always been for the
  // builds that already existed — a stock naturally aspirated pull at wide-open throttle
  // still costs about 0.15, and the N54 preset still costs about 0.6 — so what the move
  // to pressure-based wear changed is the RELATIONSHIP to compression, not the rate.
  //
  // Refitted when the crank-angle cycle replaced the empirical peak-pressure estimate.
  // Peak pressure is now measured off the trace rather than approximated, and it sits on
  // a different scale, so the threshold and the rate both moved to keep a stock pull
  // costing about what it always did. Ordering is what these numbers are for: a stock
  // naturally aspirated pull is nearly free, a factory turbo engine costs a few tenths,
  // and a build stacking compression on boost costs whole points per pull.
  // One case does move: a part-throttle pull now costs nothing at all, where the old
  // boost-based expression charged a flat 0.05. That is deliberate. Below this
  // threshold the bearings are inside what their oil film carries indefinitely, and an
  // engine held at 40 kPa is not spending bearing life in any way worth modelling.
  BEARING_PRESSURE_FREE_BAR: 55,
  WEAR_BEARING_PER_BAR: 0.075,
  // Average peak pressure above which the pull log raises the bottom-end advisory.
  // Above what a healthy naturally aspirated engine puts through its bearings at
  // wide-open throttle (about 65 bar averaged over a pull), so the advisory means "this
  // is boosted-engine loading now", not "you drove it".
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
  // steep discount off the model's own physics currency, not a fresh guess. When this
  // was set, compression was priced at a flat 2 degrees of knock margin per point, so
  // E85's +14 degree bonus was worth 7 points of compression in that same currency.
  //
  // THAT EXCHANGE RATE NO LONGER EXISTS as a constant. The crank-angle cycle produces
  // compression's knock cost emergently, and it is not a fixed rate — it steepens with
  // boost and charge heat, which is the whole point of modelling it. These discounts are
  // inherited from the flat-rate era and are due a revalidation against the cycle; they
  // are left as they are here because changing them is a scoring decision, not a physics
  // one, and belongs in its own change with its own review. Paying out the full 7 here would bill the octane decision
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
  // margin — 2.78 points of compression at the flat 2-degrees-per-point rate that
  // applied when this was set (see the note above: the cycle no longer works in that
  // currency). Paying
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
