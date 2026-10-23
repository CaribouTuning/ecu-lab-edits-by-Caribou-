# Where the factory tables come from

Every factory engine loads with tables the app generates (`factoryCalibration` in
`src/sim/presets.js`). This page says where each table's numbers come from, what they were
checked against, and how close they are. It holds only derived figures: no stock
calibration is copied into this repository.

## Fuel (AFR target)

Written from each engine's own fuel strategy, `src/sim/factoryFuel.js`, which cites its
sources engine by engine. The shape is what production ECUs do: lambda 1 in closed loop at
cruise, enrichment ramping in with load from the open-loop threshold (85 kPa, or off
boost on a turbo engine), and a full-load target that changes with rpm.

| Engine | Full load, lambda | Confidence | Source |
|---|---|---|---|
| GM LS1, LS6, LQ4, LM7, LR4 | GM's stock Power Enrichment by rpm (0.75–0.92) | validated | 26 stock P01/P59 calibrations, read through definitions matched by each image's OS number (ECU Lab Pro, `data/calibrations/gm-benchmark.json`) |
| BMW B58 (M0, M1) | 1.0 to 4500 rpm, 0.90 by 7000 | logged | Bimmerpost B58 log threads; HP Academy on the stock B58's closed-loop wideband |
| VW EA888.3 GTI | 1.0 to 4000 rpm, 0.92 by redline | logged | Stratified Auto, MK7 GTI stock fuelling |
| VW EA888.3 Golf R | as the GTI | family | the GTI's sources |
| BMW N54 | 1.0 off boost, 0.78–0.81 under boost | reported | JB4 N54 logging guide; COBB N54 tuning guide |
| Nissan VQ35DE Rev-Up | 0.88 low, 0.82 at 7000 | reported | UpRev Nissan Tuning Guide (table structure); my350z.com owner logs |
| Nissan VQ35HR | 0.88 low, 0.85 at 7500 | reported | as the DE |
| Chrysler 6.4 HEMI | 0.88 low, 0.82 at 6500 | reported | ZackTuned HEMI guide; CherokeeSRT8 forum |

"Validated" is read out of stock calibrations; "logged" is stock-car logs from more than
one source agreeing; "reported" is documented structure with owners' and tuners' numbers;
"family" borrows a sibling's. The GM figures match the stock files exactly at full load.
Nothing else has a stock file behind it: a stock calibration export (UpRev, HP Tuners,
MHD, EcuTek) for those engines is what would move them to "validated".

## VE and spark

Not copied from any calibration: they are the physics' own breathing (`computeHardwareVE`)
and best spark (the lower of best-torque spark and the knock limit, less a 2-degree factory
margin). They are checked against GM's stock tables by ECU Lab Pro's benchmark, which fits
each GM engine's cam to its published power and compares cell by cell.

Measured on this code (October 2026), physics alone, against GM's tables:

| | LQ4 | LM7 | LR4 | LS6 | LS1 |
|---|---:|---:|---:|---:|---:|
| VE, mean error, % of GM's value | 4.6 | 4.4 | 4.0 | 4.5 | 10.0 |
| Spark, mean error, degrees | 3.1 | 4.0 | 3.1 | 3.5 | 3.5 |

VE is within 5% on four of the five; the LS1 reads 13% high below 4000 rpm. Part of every
VE difference is definitional: GM's VE is relative to the ECU's own charge-temperature
estimate, which the definitions do not expose. Spark is within 3–4 degrees on average, the
physics running 2.5–4.5 degrees more advance than GM above 4000 rpm and 2–6 less between
2000 and 4000; GM's tables also carry emissions and drivability choices a best-spark
calculation does not.

## Power

With these tables all thirteen factory engines make their published crank power within
5% (mean 1.8%, `node scripts/validate-physics.js`).
