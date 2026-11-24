# Realism: the game's engines and tunes against real ones

A tune the game makes, or helps the player make, should look to a working tuner like a real one:
real spark, real mixture, real shapes. This page records what it is checked against, what the
checks found, and what changed because of them. `node scripts/realism-audit.js` runs every check.

**Rule (as for the physics everywhere):** nothing is fitted to a single file. A real calibration or
a measured map can expose a wrong or missing effect; the effect is fixed from its own sources, and
the data is used afterwards to see whether it helped.

## The evidence

| Source | What it is | Used for |
|---|---|---|
| [BoredTruckOwner/LS_Based_Engine_Repository](https://github.com/BoredTruckOwner/LS_Based_Engine_Repository) (revision `aab180f`) | Stock GM Gen III engine-computer images with TunerPro definitions. 21 distinct stock calibrations match a definition by the operating-system number in the image (never by file name), read with ECU Lab Pro's readers (`claude/ecu-lab-pro-v0.1`, `src/calibration/gm.js`). | Spark at full throttle (high-octane table), power-enrichment λ. No licence is stated, so only summary statistics are kept: `data/realism/gm-stock-spark.json`. |
| EPA ALPHA map packages ([index](https://www.epa.gov/vehicle-and-fuel-emissions-testing/combining-data-complete-engine-alpha-maps)) | Engine-dynamometer fuel maps measured by the US EPA National Vehicle and Fuel Emissions Laboratory: speed, torque, fuel rate, efficiency. US Government work. | Brake efficiency at every speed and load: `data/realism/epa/*.csv` (2014 GM 4.3 L LV3, 2013 GM 2.5 L LCV, 2014 Mazda 2.0 L SKYACTIV-G, 2015 Ford 2.7 L EcoBoost). |
| LS1Tech and LS1GTO forced-induction threads ([8–10 psi timing](https://ls1tech.com/forums/forced-induction/1324912-timing-8-10psi.html), [turbo timing](https://www.ls1gto.com/threads/how-much-timing-are-the-turbo-guys-running.134858/), [stock-bottom-end 5.3](https://ls1tech.com/forums/forced-induction/1755182-stock-bottom-end-turbo-5-3-turbo-timing-table-with-holley-hp-advise-needed.html)) | What LS turbo tuners run on 93 with an intercooler: about 18–19° at 7–8 psi, 16° at 10 psi, 14° at 14 psi. Forum figures, but consistent across threads. | Boosted spark. |
| ECU Lab Pro, `docs/STOCK-TUNE-REFERENCE.md` | A stock 2015 6.4 L Hemi (GPEC2) calibration read from its own code. | It found the physics 5–12° more conservative than the factory below 3000 rpm: the same direction as GM's. |

## What it found (on `207b159`, knock constant 1.3)

**Fuel at full throttle is realistic.** GM commands λ 0.81–0.86 in power enrichment (about 12.1–12.6:1);
the game's factory tables run the same.

**Spark is not.** At full throttle the physics' knock limit sits *below* what GM ships on the fuel GM
calibrated for: the physics says GM's own calibrations knock, by up to 10° on the LS6 (premium) and
5–14° on the LM7 and LR4 trucks. A production calibration does not knock on its own fuel, so the knock
model is too cautious. The factory tables follow it: about 10° short of GM on the LS6 below 4000 rpm,
2–8° past it above (where the physics' best-power timing, not knock, sets them). Boosted, the gap is
the same size: an intercooled LS1 on 93 gets 8–16° at 7 psi where tuners run about 19°.

`KNOCK_TAU_SCALE`, the knock model's one fitted constant, was set to an unsourced anchor (a 10.3:1 engine
on 91 "about 4° knock-limited from 1500 to 4500 rpm"). Scanned against these sources it belongs near 2.5:
there GM's premium calibration sits at its knock limit, the trucks are knock-free on 87 with 1–9° in
hand, and the boosted LS1 lands at 18–21° at 7 psi.

**Efficiency is right.** Compared like with like (both engines near stoichiometric, at the EPA's own
speeds and loads), the game's brake efficiency is within about ±1.7 points of the EPA's at every load
band on all three engines, the two-valve pushrod LV3 included. An earlier reading of +6.6 to +10 points
near full load on the LV3 compared the game's stoichiometric part-throttle points with the EPA's
enriched full-load ones: enrichment costs brake efficiency on fuel burned, so that was fuelling
strategy, not combustion. Retracted.

**The engine model makes 1–3 bar too much at full load below about 3000 rpm** on all three EPA
engines. Their cam timing is not published (the comparison uses a 205° cam for each), and low-speed
breathing turns on it, so this is not yet evidence against the physics.

## What changed

- **Knock constant 2.5** (`KNOCK_TAU_SCALE`), anchored to the sources above: GM's premium LS6
  calibration sits at the physics' knock limit, the trucks run knock-free on 87, and an intercooled
  LS1 on 93 gets 18–21° at 7 psi. The game's factory spark is now within about 1° of GM's on the LS6
  below 4000 rpm.
- **Kalghatgi's K rises with engine speed** (`OCTANE_K_PER_RPM`). The knock limit climbed about 6° per
  1000 rpm (the LS6 on 91 from 19° at 1600 rpm to 44° at 5600), steeper than real engines: a knock
  constant fitted to GM at low speed left high speed lenient, and the one fitted to the 6.4 Hemi at high
  speed (ECU Lab Pro) left low speed cautious. Part of the cause was physical: the model placed K (where a
  fuel's effective octane sits between its RON and MON) from charge temperature alone, where Kalghatgi
  found it rising with speed in every engine he measured (SAE 2005-01-0239; slightly positive at
  6000 rpm), and Mittal and Heywood found speed one of the three things K depends on most (SAE
  2008-01-2414). Added at 0.2 per 1000 rpm, zero at 3500, the modelling convention built on those
  measurements (K −0.5, 0 and +0.5 at 1000, 3500 and 6000 rpm). The GM fit holds at `KNOCK_TAU_SCALE`
  2.5 (the LS6's limit 1.1° above GM's most advanced cell), the slope falls by about a third (LS6 38.5°
  at 5600 rpm, B58 24° at 6400 where it was 28°), and the boosted LS1 reads 18°, 20.5° and 24° at
  7 psi (3200, 4000, 4800 rpm) and 17.6° at 10 psi.
- **87 AKI regular** is offered, and the LM7, LQ4 and LR4 run on it, as GM calibrated them.
- **Engine-computer torque caps** on the factory turbo engines (N54, B58, EA888), at the rated torque
  or the rated power's torque, whichever is less: the flat plateaus BMW and VW enforce. The pull log
  shows the cap as a note, never as a fault.
- **Peak cylinder pressure limits by bottom end**: 105 bar naturally aspirated, 130 bar a factory
  boosted engine, 160 bar forged.
- **EA888**: the IS20 and IS38 surge lines and the 1500 rpm boost set from VW's ratings (the GTI makes
  255 lb-ft at 1500 against 258 rated).
- **Idle-column spark** (`IDLE_SPARK_RESERVE_DEG`). Compared on GM's own spark grid, cell by cell at
  the same air charge, light-load spark needs no cap: GM's trucks run 45–58° at the lightest loads, and
  the LS6's flat 40° is a choice in that performance calibration, not a pattern. What every LS family
  shares is the idle column: GM holds 800 rpm at about 20–24° from the lightest row to about
  0.3 g/cylinder, below best power, for idle spark reserve, where the factory rule had written best
  power (31–41°). Each engine's idle columns are now capped at its own MBT at that speed and 40 kPa less
  6°, the reserve fitted across the four LS families (the game minus GM there: 7, 4, 7 and 4°). The
  game's 800 rpm column now sits within about 2–6° of each engine's own GM table.
- **GM's own full-load spark on the stock GM engines** (`GM_STOCK_WOT_SPARK`). The factory rule wrote best
  power wherever knock allowed, 27–31° at full throttle, where GM ships its trucks 8–14° under that
  (LM7 and LQ4 about 14–17° at 3200–4800 rpm), the LR4 3–6° and the LS6 5–7° above 4000 rpm. LS tuners
  find best power at about 26–28° on 91–93 ([LS1Tech](https://ls1tech.com/forums/dynamometer-results-comparisons/282225-how-much-timing-you-seeing-wot-tuned.html),
  [HP Academy](https://www.hpacademy.com/courses/practical-standalone-tuning/holley-terminator-x-step-8-steady-state-ignition-tuning/)),
  where the game's physics puts it, so GM leaves timing on the table on purpose (towing, heat, poor
  fuel, an ageing engine), which is why adding timing to a stock LS makes power. The LS6, LM7, LQ4 and
  LR4 now run, at full load, the mean of their own calibrations' spark (summary data, by rpm, at their
  own air charge) wherever it is under the physics'. The LS1 keeps best power: no base-LS1
  calibration is in the source, and no engine borrows another's.
- **Truck head flow.** That spark took the trucks' horsepower 5.5% under their ratings: the over-
  advanced spark had been hiding top-end breathing the model gave them too little of. The trucks' heads
  had no bench figure, so the model sized their ports from the valve alone (195 cfm on the 706 / 862,
  218 on the 317). The Sloppy Mechanics LS head wiki benches all four stock castings on one table
  ([LSX head cast numbers / flow](https://sites.google.com/site/sloppywiki/everything-ls/lsx-head-cast-numbers-flow-swap-info)):
  706 / 862 226 cfm, 317 240, against the LS1's 241 at 227 and the LS6's 243 at 257. Carried by that
  ratio onto the bench the LS1's 243 cfm comes from: 243 and 257 cfm. Stock now: LM7 291 hp (rated 295),
  LQ4 314 (325), LR4 288 (285).
- **Spool knock split between rows** (`KNOCK_LIMIT_DEG_PER_PSI`). A knock met between two load rows,
  as a turbo spools through 100–150 kPa, came out of both rows to the same number, leaving the
  atmospheric row with a notch (14° at 2500 rpm between 16° and 26° on a turbo LS1). The limit is now
  carried to each row's own pressure at 0.9° per psi, the rate the model's factory turbo tables fall at
  (B58 0.84–0.87, EA888 0.91–0.92, N54 0.65–1.03) and tuners' rule of about a degree per psi; the blend
  at the point that knocked is still held to the measured limit.
- **Full-load rows are monotone**: no full-load row asks for more spark than the row under it, in the
  factory tables and the safe base map; and a boost row a pull crossed too thinly to judge follows the
  row under it, as the rows past the boost already did.
- **Power enrichment from the atmospheric row on turbo builds.** A turbo fitted to a naturally aspirated
  engine, or a turbo engine of the player's, ran λ 1 (14.7:1) in the 100 kPa row, a row it passes
  through at full throttle while the turbo spools. It now enriches there as the naturally aspirated plan
  does (a turbo LS keeps GM's own power enrichment, λ 0.81–0.86) and richer with boost.

## What is open

- **GM truck torque**: with GM's own spark and the bench head flow, the LM7 reads 9% over its torque
  rating, the LQ4 5% and the LR4 15%, peaking 600–800 rpm before the published 4000. Stock LM7 trucks
  measured 253–295 lb-ft at the wheels; no stock LR4 curve was found (tests/presets.test.js, `KNOWN_GAPS`).
- **High-rpm knock limit.** Still above what tuners report: LS tuners on 93 say past about 26–28° at
  full throttle only knocks ([LS1Tech](https://ls1tech.com/forums/dynamometer-results-comparisons/282225-how-much-timing-you-seeing-wot-tuned.html)),
  where the LS6's limit on 91 reads 38.5° at 5600 rpm; a stock B58 logs about 17.5° at 6500 rpm and
  10.5 psi ([Bimmerpost B58 log thread](https://f30.bimmerpost.com/forums/showthread/1648722/b58-log-review-thread)),
  where the B58's limit reads 24°. Neither is a measured knock limit (a tuner stops at best power, BMW's
  stock timing carries its own margin), and the measured knock-limit-against-speed curves are in paywalled
  papers. Best-power timing (about 30–31° up top) caps what a table can usefully hold, so the leniency
  mostly cannot reach a tune.
- **LR4 on 87**: the physics puts its knock limit up to 5° under GM's most advanced LR4 cell, where the LM7,
  the same engine with 9 mm more stroke, has 3.5° in hand.
- **Low-speed part load.** At 1000–2000 rpm and mid load, GM runs 3–5° under the game's spark on every
  LS family, more toward idle. Whether that is emissions and drivability strategy (retard for NOx, tip-in
  feel) or the physics' best-power timing running early at low speed, the data cannot say; nothing was
  changed for it.
- **Part load on a turbo build** runs 3–6° more spark than the same engine naturally aspirated, from
  the exhaust backpressure the turbine adds (more residual gas, a slower burn). Not checked against data.
- **Golf R**: 261 lb-ft at 1800 rpm, where its torque plateau starts; the curve's breakpoints are spaced
  too far apart there.
- No base LS1 calibration is in the source (its "2004 Corvette" image states 5.7L HO, the Z06's LS6).
