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

**Efficiency is right except near full load on two-valve pushrod engines.** Against the EPA maps the
game's brake efficiency is within about ±2 points at every load on the two four-valve engines (LCV,
SKYACTIV-G). On the two-valve pushrod LV3 it is right at light load (+1.0) but runs +6.6 points at
9–11 bar and +10 above: the same family whose truck engines the game puts 7–13% over their torque
ratings. A slower burn in a two-valve chamber is the leading suspect; not yet established.

**The engine model makes 1–3 bar too much at full load below about 3000 rpm** on all three EPA
engines. Their cam timing is not published (the comparison uses a 205° cam for each), and low-speed
breathing turns on it, so this is not yet evidence against the physics.

## What is open

- The knock constant: applying it raises every factory turbo engine 17–19% over its torque rating.
  Those ratings are torque limits real engine computers enforce (BMW's and VW's flat plateaus), so the
  factory turbo engines get an engine-computer torque cap, as the real cars have.
- 87 AKI regular fuel, which GM calibrated the LM7, LQ4 and LR4 for; the game offers 91 and up.
- The two-valve full-load efficiency.
- No base LS1 calibration is in the source (its "2004 Corvette" image states 5.7L HO, the Z06's LS6).
