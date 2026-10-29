# Engine damage: what is sourced and what is calibrated

The damage model (`src/sim/damage.js`, the `WEAR_*` and `DAMAGE_*` entries in
`src/sim/coefficients.js`) decides three things:
- what wears each part;
- what a worn part does to the running engine;
- how the engine fails.

This page lists every number and every claim the model makes. Each one is marked:

- **Sourced**: taken from a cited measurement, specification or standard relation.
- **Derived**: worked out from sourced figures. The arithmetic is shown.
- **Calibration**: the model's own choice, where no published figure exists. It is set to give
  the order of magnitude or the behaviour the sources describe. Change these freely when better
  data turns up. Do not cite them as facts.

**What no source gives.** No source gives a rate of wear for a part, such as percent of life per
degree of knock, per second at a lean mixture, or per second overheated. Wear rates depend on the
part, the material, the duty cycle and luck. Every rate in this model is therefore a calibration.
What the sources do give is:
- the mechanisms;
- the thresholds where damage starts;
- the physics of what a worn part does.

Those are what the model is built on.

## What wears each part

| Mechanism | In the model | Status and source |
|---|---|---|
| Knock erodes the piston crown and fractures ring lands and rings | `WEAR_KNOCK` per degree of real knock retard; unheard knock at twice the rate | Mechanism **sourced**: MAHLE [1] §2.1.2 (erosion, fractured ring land) and §3.2 ("A piston ring has fractured due to pressure peaks during knocking"). Rate: **calibration**. |
| Lean mixture under load, low octane or too much boost melts the crown and top land | `WEAR_LEAN` past `LEAN_DAMAGE_AFR` 15.2 at ≥ 85 kPa | Mechanism **sourced**: MAHLE [1] §2.1.2, whose listed causes include insufficient octane, "boost pressure is too high (e.g., due to tuning)" and an "air–fuel mixture that is too lean". Threshold and rate: **calibration**. |
| A lean mixture under boost burns valves | `WEAR_VALVE_LEAN_BOOST` | Mechanism **sourced**: MAHLE [1] §5.7. A valve that runs hot, or no longer seals, cannot shed its heat to the seat, then cracks and melts. Rate: **calibration**. |
| A rich mixture washes the oil off the bore | `WEAR_RICH_BORE_WASH` below λ `RICH_DAMAGE_LAMBDA` 0.75 at ≥ 55 kPa | Mechanism **sourced**: MAHLE [1] §1.2: "If the oil becomes diluted with fuel, wear on the piston, piston rings, and cylinder surface increases dramatically." Threshold and rate: **calibration**. |
| Peak cylinder pressure past what the parts carry | `WEAR_PISTON_PER_BAR` over `PEAK_PRESSURE_LIMIT_BAR` 105 | Threshold: a practitioners' figure of 110–130 bar for production internals, placed on this model's pressure scale (see its comment in `coefficients.js`). It is not primary-sourced, and the comment says so. Rate: **calibration**. |
| Bearing load from peak pressure | `WEAR_BEARING_PER_BAR` over `BEARING_PRESSURE_FREE_BAR` | Mechanism **sourced**: MAHLE [1] §6 (overloading). Thresholds are set from this model's own factory presets so that no factory tune wears its own engine. Rate: **calibration**. |
| Oil starvation (LIVE) | Below max(29 kPa, 0.45 × a healthy pump's pressure at the same speed and oil temperature) | **Sourced**: Toyota's service specifications [2]. At idle the minimum is 29 kPa (0.3 kgf/cm², 4.3 psi) or more. At 3000 rpm the minimum is 245 kPa, against a range that tops out at 490–539 kPa, so the minimum is 45–50% of a healthy engine's pressure. |
| A dry bearing seizes (LIVE) | `DAMAGE_OIL_STARVE_PER_S` 3.6% a second at zero pressure, in proportion to the shortfall | **Sourced**: Nissan's patent US 9,109,627 B2 [3], Comparative Example 4. A motored 2.5 L four-cylinder on conventional bearings seized 28 s after its oil supply was stopped, and 100 / 28 = 3.6. A firing engine under load is harsher, so this is the gentle end. Scaling with the shortfall is a **calibration**. |
| Overspeed past the bottom end's rating (LIVE) | `DAMAGE_OVERSPEED_PER_S` × ((rpm / rated)² − 1) | Load law **sourced**: on a slider crank the reciprocating inertia force is m r ω² (cos θ + cos 2θ / n), so it grows with the square of speed. This is standard kinematics, and it is also used in `bottomEnd.js`. The rated speed comes from mean piston speed (`bottomEnd.js`, with its sources). Rate: **calibration**. |
| Boiling coolant (LIVE) | `DAMAGE_OVERHEAT_C` 129 °C; `DAMAGE_OVERHEAT_PER_C_S` per degree over it | Threshold **sourced**: a 50/50 ethylene glycol coolant under a 15 lb pressure cap boils over at 265 °F (129 °C), per the rating on Prestone's 50/50 premix [4]. Consequence **sourced**: MAHLE [1] §2.2.1 (piston seizure from overheating). Rate: **calibration**. |

## What a worn part does

| Part | Effect | Status and source |
|---|---|---|
| Rings | Blow-by. Part of the trapped charge, air and fuel together, leaves past the rings before it burns. The breather returns it to the intake, so the MAF and the wideband are unchanged. The loss grows linearly with wear, to `DAMAGE_RING_LEAK_MAX` 1% of the charge when worn out. | **Derived** from DieselNet's rules of thumb [5]: maximum blow-by is rated kW / 180 dm³/s for a new engine and kW / 90 for a worn one, so worn is twice new. A gasoline engine at rated power breathes about 1 g/s of air per kW, which is about 0.85 dm³/s. A new engine's blow-by is therefore about 0.5–0.7% of its intake, and wearing it out adds about as much again. The linear growth is because a ring's end gap opens by 2π times its radial wear. MAHLE [1] §1.4 confirms the direction: "Worn pistons, piston rings, and cylinder bores increase the level of blowby gases, resulting in overpressure in the crankcase." **Not used**: leak-down percentages. A leak-down test is static and runs at cranking pressure, while in a running engine the leak has a few milliseconds a cycle. An earlier version of this model took 12% from them, roughly ten times too much. |
| Valves | A burnt valve leaks its own cylinder's charge back into the port, up to `DAMAGE_VALVE_LEAK_MAX` 50% of that cylinder. Below `DAMAGE_VALVE_DEAD_BELOW` 25% health, the cylinder stops firing. The leak and the misfire are combined within one cylinder, so the loss is never more than that cylinder's work. | Mechanism **sourced**: MAHLE [1] §5.7. The fractions are a **calibration**: no source gives a running leak fraction for a burning valve. |
| Bearings | Opened clearance passes more oil. Pressure-fed bearing flow is laminar Poiseuille flow, which goes with the cube of the clearance. The pump is positive-displacement, so below its relief valve the pressure divides by how much more freely the whole system leaks: G = (1 − s) + s k³, where k is the clearance against new, opening linearly with wear. The relief valve still caps the pressure at speed. The result is low pressure at hot idle, a worn engine's classic symptom. | Flow law **sourced**: the MathWorks Simscape pressure-fed journal bearing model [6] (flow ∝ c³ (1 + 1.5 ε²)). s = 0.25 is **sourced**: SAE 2020-28-0338 [7] finds main and rod bearing leakage is about 25% of an engine's total oil flow requirement. k = 2.22 at the limit is **sourced**: Toyota T-SB-0030-15 [8], 2AZ-FE rod bearings, standard 0.024–0.048 mm and maximum 0.08 mm, so 0.08 against the 0.036 mid-point. **Derived**: worn to the limit, G = 0.75 + 0.25 × 2.22³ = 3.5, so the pump makes under a third of its pressure. Below about a third of life left, that drops under the maker's minimum share (above), so the bearings start starving themselves. That is the accelerating last stage of a worn bearing. |
| Bearings, friction | **None.** | **Sourced**: Petroff's law (Shigley's *Mechanical Engineering Design*, journal bearings) gives a friction torque that goes with 1 / clearance. A worn, looser bearing has slightly less viscous friction, not more. An earlier version of this model added friction for worn bearings; it was removed. |

## How each part fails

| Part | Failure | Source |
|---|---|---|
| Pistons and rings | Holed piston: the crown melted through and the ring lands fractured. Combustion pressurises the crankcase. | MAHLE [1] §2.1.2 ("There is a hole in the piston"; "the piston ring land is fractured"); crankcase overpressure from blow-by, §1.4. |
| Bearings | Spun rod bearing: the overlay melts and welds to the journal, the shell spins, and the rod breaks. | MAHLE [1] §6.8 ("the bearing overlay can melt and the bearing can weld to the bearing journal"; "severely worn and spun bearing"). The rod through the block is the usual consequence of a rod that breaks at speed. |
| Valves | Burnt-through exhaust valve: a wedge of the valve head melted away. The cylinder has no compression, and fragments are loose in the chamber. | MAHLE [1] §5.7 ("A wedge-shaped piece of the valve disk has melted away"). |

A failed engine is a state, not a number. It does not run until it is rebuilt. That is the
game's rule, not a claim about engines. An engine with a burnt-through valve would still turn on
its other cylinders, but it is not fit to run, which is what the failure text says.

## Sources

1. MAHLE Aftermarket, *Engine components. Damage scenarios: causes, remedies, and avoidance*
   (2024 edition). <https://www.mahle-aftermarket.com/media/homepage/facelift/media-center/workshop/damage-brochure/mah-schadensbroschuere-motorenteile-en-241108-screen.pdf>.
   Sections cited: §1.2 Fuel flooding (p. 8); §1.4 Increased oil consumption; §2.1.2 Melting on the top of the piston and top
   land (p. 28); §2.2.1 Piston seizure (overheating); §3.2 Damage to the ring belt due to broken
   piston rings; §5.7 Hole burned through the valve disk (p. 104); §6.8 Seizure marks on bearings
   (p. 128).
2. Toyota service specifications, engine oil pressure. Hilux:
   <https://hiluxsurf.co.uk/manuals/vehicle-manuals/Toyota-Pickup-Service-Manual/93fsm/engine/56oilpress.pdf>.
   1MZ-FE (2001 Highlander) and 3MZ-FE (2008 Solara) via
   <https://manuals.autorepairshq.com/>.
3. Nissan Motor Co., *Sliding device including sliding bearing*, US 9,109,627 B2. Example 5 and
   Comparative Example 4, the seizure time after the lubricating oil supply is stopped.
   <https://patents.google.com/patent/US9109627B2/en>.
4. Prestone 50/50 prediluted antifreeze/coolant, product rating: boilover +265 °F with a 15 lb
   pressure cap.
5. DieselNet, *Crankcase Ventilation*, Table 1, "Estimates of maximum blowby rates" (refs. 1775,
   1776). <https://dieselnet.com/tech/engine_crank.php>.
6. MathWorks, Simscape Fluids, *Journal Bearing Pressure-Fed*.
   <https://www.mathworks.com/help/hydro/ref/journalbearingpressurefed.html>.
7. SAE 2020-28-0338, *Optimization of the Bearing Oil Supply Concept of a High Power-Density Diesel
   Engine to Minimize Oil Pump Friction*.
   <https://saemobilus.sae.org/papers/optimization-bearing-oil-supply-concept-a-high-power-density-diesel-engine-minimize-oil-pump-friction-2020-28-0338>.
8. Toyota, T-SB-0030-15 Rev1 (2015), *2AZ Engine Oil Consumption Repair Procedure*, connecting
   rod oil clearance. <https://static.nhtsa.gov/odi/tsbs/2015/MC-10111568-9999.pdf>.
