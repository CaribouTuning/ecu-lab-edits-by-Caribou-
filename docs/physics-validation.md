# Checking the physics from outside it

`docs/accuracy.md` holds the model to sourced ranges, and the test suite enforces them.
This page asks different questions and takes nothing from the model on trust. Run the
check yourself:

```
node scripts/validate-physics.js
```

Figures below are from that script on this branch (October 2026).

## 1. Its numbers obey the laws they claim to

On all 669 points of the thirteen factory pulls, recomputed from first principles:

| Identity | Worst error |
|---|---|
| hp = torque × rpm ÷ 5252 | 0.99% (the readouts are rounded to whole numbers) |
| charge = VE × MAP ÷ (R·T) × cylinder volume (ideal gas) | 0.49% |
| MAF = charge × cylinders × rpm ÷ 120 | 0.20% |
| wheel torque = BMEP × displacement ÷ 4π × 0.85 drivetrain | 0.30% |
| BSFC = (MAF ÷ AFR) ÷ crank horsepower | 0.74% |

No point turns more of its fuel into work than the ideal air-standard Otto cycle at the
same compression. Brake thermal efficiency peaks at 31.8% and sits at a median of 28.6%
above 3000 rpm; real spark-ignition engines at full load run about 30 to 38%.

## 2. The factory engines land on their ratings

Mean absolute error on peak crank power is 3.7% across the thirteen. Eight are within 5%.
The misses are recorded in `tests/presets.test.js` with their causes (the VQ35DE's −9%,
the B58 M1's −7%, the GTI's torque −10%).

## 3. Its sensitivities match references it was not fitted to

VQ35DE Rev-Up at 5000 rpm, full throttle:

| Change | Model | Reference |
|---|---|---|
| Barometer 101 → 90 kPa (about 1000 m) | −11.1% | charge density alone −11.2%; SAE J1349 about −11 to −13% |
| Spark 5 / 10 / 20° retarded from MBT | −1.0 / −3.5 / −12.6% | Heywood's torque-against-spark curve, about −1 / −4 / −15% |
| Compression 10.3 → 11.3, race fuel | +2.0% | air-standard Otto +2.4%; real engines about +2 to 3% |
| λ 0.87 → 0.75 | −6.0% | power falls away rich of best |

## 4. Where it is off

Two results disagree with real engines. Both are left as the physics gives them, not tuned to match:

- **Intake heat costs too much.** 10 °C hotter air takes 4.0% of power. Held at the same
  spark it is 3.5%, which is the 3.3% the charge loses in density: the model scales power
  with density. SAE J1349, whose correction was fitted to engine tests, scales it with the
  square root of temperature and predicts 1.9%. The last half point is the knock limit
  pulling a degree of spark from the hotter charge, which real engines also do.
- **Stoichiometric costs too little.** Going from λ 0.87 to 1.00 loses 0.5%, where a real
  engine loses a few percent. `docs/accuracy.md` already records this: best power sits at
  λ ≈ 0.94 in the model against 0.86 to 0.91 in real engines, because dissociation is
  computed only for CO₂, water and hydroxyl.

## 5. Nothing adds horsepower

No part carries a power bonus. Bolt-ons add airflow (VE points, `MOD_BONUS` in
`src/sim/hardware.js`) fitted to chassis-dyno results on a 3.5 L V6, and `airflow.js`
states the rule outright: "never as a bonus multiplier on power". Power comes out of the
air, fuel and cycle physics. The empirical constants (about 200) live in
`src/sim/coefficients.js`, each with a comment saying where it comes from.
