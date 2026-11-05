# ECU Lab — Engineering Audit (2026-11-03)

Scope: branch `claude/physics-ui-handoff-rpk2n3` (identical tree to `claude/garage-visual-polish-ijhet7`, which contains `claude/physics-fixes`). 184 source files, ~43,900 lines of JS/JSX. Audited: the core physics (`src/sim`), ECU emulation (`src/sim/ecu`), state/persistence, the build → stand → dyno → log → score workflow, career entry, Electron shell. **Not audited in depth:** the 3D scene code (`src/ui/world`, `shopScene.js`), audio synthesis beyond the newest pop code, career job generation and grading, the tutorial content, every TUNE sub-page.

Evidence types are marked: **[RUN]** executed this session, **[TEST]** the repo's own test suite (executed this session), **[CODE]** inspection only.

**Disclosure:** the auditor also authored recent changes on these branches (build flow, landscape layout, the 8×6 default, advisor convergence, the overrun burble). Those changes are audited here with the same standard. Several findings below are against that work.

---

## 1. Executive summary

ECU Lab is a substantially physics-based single-zone/two-zone cycle simulator with an ECU emulator around it, not a horsepower calculator. The combustion, heat-transfer, knock and friction cores use recognised published correlations with their published constants. The model passes its own first-principles identity checks to <1%, and lands on 13 factory power ratings with a 1.8% mean absolute error **[RUN]**. Gates are green: 2519/2519 tests on the physics branch, 864/864 UI tests, lint and typecheck clean **[TEST][RUN]**.

The weakest scientific link is **airflow (VE)**. It is an empirically shaped table with bolt-on bonuses, not a gas-dynamics model, and the project's own notes (#15, #19) say its curve shape is wrong for NA engines. Several calibration constants are fitted to the factory engines rather than measured: knock timescale, burn rate and late-spark quench. That is legitimate, but it limits how far from those engines the model can be trusted.

The largest product problems:

| Problem | Severity |
|---|---|
| A sandbox build and tune are lost on page reload. | High |
| The dyno's "throttle %" keys are really manifold-pressure targets (misleading). | Medium |
| Main-thread stalls of 7–10 s on devices without usable WebGL. | Medium |
| The first-run tour's highlight is too weak to notice (user-reported; consistent with the code). | Medium |

Not release-ready as an "engineering-grade" tool until persistence and the airflow model are addressed. It is credible today as a teaching simulator, provided its documented limits are shown.

---

## 2. Code quality and architecture findings

| # | Sev | Location | Issue | Why it matters | Recommendation |
|---|---|---|---|---|---|
| C1 | High | `src/ui/EcuLab.jsx:800-835`, `src/storage.js` | SANDBOX persists only score stats (`saveCareer({best,total,pulls,runs,pinnedRunId})`). The engine (`build`), tables (`tune`) and layout are memory-only. **[CODE+RUN]**: after a reload the sandbox showed "No engine chosen yet". | A player loses an entire build and tune on refresh, tab discard (iOS does this often) or crash. | Persist `build` + `tune` (versioned, debounced, through the existing `storage.js` adapter). Add a migration path. |
| C2 | Medium | `src/ui/EcuLab.jsx` (1,862 lines) | One component owns routing, audio frame building, live-engine loop wiring, persistence effects and every tab's JSX. | It is the highest-risk file to change; review and onboarding cost is high. | Extract the audio-frame builder, the persistence effects and the per-tab views into hooks or modules. No behaviour change. |
| C3 | Medium | `src/ui/desk/Consoles.jsx` (`LOAD_SUB`, key labels), `src/sim/sweep.js` | The dyno keys are labelled "Throttle, %" (100/70/40), but the value drives `loadKpa`, a **manifold-pressure** target. 40 "%" is 40 kPa MAP, not 40% throttle angle; on a real engine 40% blade at 6000 rpm gives far more than 40 kPa. Introduced by the auditor's relabel. | It teaches a wrong mapping between throttle and load, which is the opposite of the tool's purpose. | Label the keys "Load (MAP kPa)", or convert a real throttle angle to MAP through the airflow model. |
| C4 | Medium | `src/ui/world/stage.js:37`, `render3d.js` | With no usable WebGL, entering the shop blocked the main thread **10.3 s**, with long tasks up to **7.3 s**, before falling back. With WebGL available the same click took 115 ms **[RUN]**. Repeated `WebGLRenderer` context-creation errors were logged (likely the `failIfMajorPerformanceCaveat` probe; a context leak is **UNVERIFIED**). | Low-end or GPU-blocklisted laptops freeze on first entry. | Run the capability probe before building the scene, and fall back without retrying. |
| C5 | Low | `src/ui/routing.js:23`, `BuildBench.jsx` | The route id `exhaust` is now the "Bolt-ons" stage (auditor's change, kept for link stability). | Name and contents disagree for the next developer. | Rename the id with a redirect from the old one. |
| C6 | Low | about 25 exports (e.g. `layoutSwitch.js` `moveTables`, `airmassConversion`; `gfx.js` `loft`, `patternMaterial`; `shop.js` `migrateCareer`) | Exported but used only in their own file. | Widens the apparent API surface. | Drop the `export`s. Not dead code. |
| C7 | Low | `src/sim/liveCore.js:54`, `src/sim/ecu/liveEcu.js:513` | `Math.random()` in sensor noise and in false knock retard. Documented. | The live engine is not reproducible without stubbing. | Inject a seeded RNG through config. |
| C8 | Low | `docs/physics-validation.md` | Stale. It says MAE 3.7% and peak brake efficiency 31.8%; the script now prints 1.8% and 35.2% **[RUN]**. | Docs disagree with the code they describe. | Regenerate from `scripts/validate-physics.js` in CI. |

Positive, verified:
- **Electron** (`electron/main.js:110-129`): `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, and external links routed to the OS browser.
- **No injection paths:** no `innerHTML`, `dangerouslySetInnerHTML`, `eval` or `new Function` in `src`.
- **Defensive storage:** every `localStorage` access is in try/catch, and there is an `ErrorBoundary` at the root.
- **Physics stays separate from UI:** physics lives in `src/sim`, which has no UI imports.
- **Test fingerprint:** the regression hash, with per-section evidence, is a strong control.
- **Dependencies:** six runtime dependencies, all used.

---

## 3. Physics and engineering accuracy findings

| Area | What the code implements | Principle | Correct? | Limits |
|---|---|---|---|---|
| Trapped air (`cycle.js` `trappedAirGrams`) | m = VE·p·V/(R·T) | Ideal gas | Yes. Identity holds to 0.49% over 669 points **[RUN]**. | VE is an input; see airflow below. |
| Combustion (`cycle.js` `runCycle`) | Wiebe mass-fraction burned, a=5, m=2, through a crank-angle first-law integration in 2° steps | Wiebe function; standard form | Form is correct. | Burn duration (`BURN_DURATION_BASE_DEG`=42, dilution and λ penalties) is **fitted**, not sourced. |
| Wall heat (`cycle.js:290-310`) | Woschni: h=3.26·B^-0.2·p^0.8·T^-0.55·w^0.8, C1=2.28, C2=3.24e-3 | Woschni 1967 | Constants match the published correlation. | `WALL_TEMP_K`=450 is fixed and does not follow coolant temperature. |
| Knock (`cycle.js:386-398`) | Livengood–Wu integral of a Douaud–Eyzat delay τ=17.68(ON/100)^3.402·p^-1.7·e^(3800/T) | DE 1978, LW 1955 | Published constants reproduced. | `KNOCK_TAU_SCALE`=1.3 and `ENDGAS_FLAME_COUPLING`=0.035 are **fitted** to factory knock limits. The Kalghatgi K octane index is applied; its bounds are stated in code. |
| Friction (`friction.js`) | Component-wise FMEP after Sandoval & Heywood (revision of Patton–Nitschke–Heywood) | Published SI friction model | Structure matches the cited model. Constants could not be checked line by line against the paper here (**UNVERIFIED** values). | |
| Pumping (`friction.js:182`) | PMEP = (EMP − MAP) | Gas-exchange work, idealised | Correct first-order form. | |
| Torque and power | T = BMEP·Vd/4π; hp = T·rpm/5252 | Four-stroke definition | Holds to <1% **[RUN]**. | Drivetrain is a flat 0.85 (`DRIVETRAIN_EFF`) at every speed and load; real losses vary with both. |
| MBT and spark sensitivity | MBT from burn phasing (`mbtFromBurn`) | Peak torque near MFB50 ≈ 8–10° ATDC (Heywood) | Retard 5/10/20° gives −1.0/−3.3/−12.9% against Heywood's curve of about −1/−4/−15% **[RUN]**. | |
| Altitude | Density scaling | SAE J1349 | −11.0% for 101→90 kPa, inside J1349's −11 to −13% **[RUN]**. | |
| Intake temperature | Density | J1349 | **Off.** +10 °C costs −4.3% against J1349's −1.9% **[RUN]**; the project documents this. | |
| λ for best power | Dissociation of CO₂/H₂O/OH only | Heywood: best power λ≈0.85–0.9 | Partly. −2.9% each way from λ 0.87 **[RUN]**; documented that best power sits leaner than real. | |
| **Airflow / VE** (`airflow.js`, `tables.js DEFAULT_VE`, `hardware.js MOD_BONUS`) | Base VE table shaped by bore/stroke, cam and Mach multipliers; bolt-ons add fixed VE points per RPM column (e.g. headers +6.5 at the top) | **Not a gas-dynamics model** | **Partly verified at best.** Peak power matches the ratings because presets are fitted; whole-curve shape is known wrong (issues #15, #19). | The single largest accuracy gap. |
| Turbo gain | Compressor and turbine maps, backpressure, knock-limited spark | | Turbo VQ35DE at 6 psi, 91 octane, tuned knock-free: 244→292 whp (+20%) **[RUN]**. | Plausible but **UNVERIFIED** against a controlled dataset. |
| Damage | EGT, pressure, knock-erosion and bearing models (`docs/damage-model.md`) | Mixed sources | Covered by tests **[TEST]**; not independently re-derived here. | |
| Overrun burble (new) | Wiebe unburned-at-EVO + `lateSparkQuench` → afterfire, EGT | Late spark → post-EVO oxidation (catalyst-heating practice) | Behaves monotonically and consistently on all 13 engines (§7). | **Constants are the auditor's estimates, UNVERIFIED** (§5). |

---

## 4. Verified sources and references

Listed only where the reference is well established and the code's use matches its published content. Paper numbers can be looked up at sae.org. DOIs are not given, because they were not verified this session.

1. **Heywood, J. B.**, *Internal Combustion Engine Fundamentals*, McGraw-Hill, 1988. Covers the ideal-gas charge, Wiebe burn, Woschni heat transfer, friction, MBT and spark-retard sensitivity.
2. **Woschni, G.**, "A Universally Applicable Equation for the Instantaneous Heat Transfer Coefficient in the Internal Combustion Engine," SAE 670931, 1967. Constants 3.26 / 2.28 / 3.24e-3.
3. **Douaud, A. M.; Eyzat, P.**, "Four-Octane-Number Method for Predicting the Anti-Knock Behavior of Fuels and Engines," SAE 780080, 1978. τ = 17.68(ON/100)^3.402 p^-1.7 exp(3800/T).
4. **Livengood, J. C.; Wu, P. C.**, "Correlation of Autoignition Phenomena in Internal Combustion Engines and Rapid Compression Machines," *Fifth Symposium (International) on Combustion*, 1955.
5. **Vibe (Wiebe), I. I.**, *Brennverlauf und Kreisprozess von Verbrennungsmotoren*, VEB Verlag Technik, 1970.
6. **Patton, K. J.; Nitschke, R. G.; Heywood, J. B.**, "Development and Evaluation of a Friction Model for Spark-Ignition Engines," SAE 890836, 1989.
7. **Sandoval, D.; Heywood, J. B.**, "An Improved Friction Model for Spark-Ignition Engines," SAE 2003-01-0725, 2003.
8. **Kalghatgi, G. T.**, "Fuel Anti-Knock Quality – Part I. Engine Studies," SAE 2001-01-3584, 2001.
9. **SAE J1349**, Engine Power Test Code — Spark Ignition and Compression Ignition — As Installed Net Power Rating.
10. **Aquino, C. F.**, "Transient A/F Control Characteristics of the 5 Liter Central Fuel Injection Engine," SAE 810494, 1981. The port wall-film X–τ model in `ecuCoefficients.js`.

**Cited in the code but not verified this session:**
- Marwaha & Subramanian, *IJASTech* 6(1), 2022 (friction coefficients);
- SAE 2020-28-0338 (bearing oil share);
- Chandra, SAE 940452 (dual plug);
- Toyota T-SB-0030-15 (bearing service limit);
- Wyszynski, Stone & Kalghatgi, SAE 2002-01-0839 (DI volumetric efficiency);
- the University of Danang 2023 twin-plug study.

They may be correct; they were not checked.

---

## 5. Unverified assumptions and potential guesswork

| Item | Location | Known | Unknown | Evidence needed |
|---|---|---|---|---|
| VE base table and shaping multipliers | `tables.js DEFAULT_VE`, `airflow.js`, `engine.js` | Peaks match the factory engines after fitting. | Whether the curve shape is right for any engine; the NA peak sits at redline (#15). | Measured VE or airflow curves for several engines (flow-bench data or published dyno airflow). |
| Bolt-on VE bonuses (intake +2.5, exhaust +3, headers +6.5 VE points) | `hardware.js:410` | Direction is right. | Magnitudes; no source in code. | Before/after dyno sweeps on matched engines. |
| `KNOCK_TAU_SCALE` 1.3, `ENDGAS_FLAME_COUPLING` 0.035 | `coefficients.js` | Fitted so the factory calibrations sit near their knock limit. | Transfer to engines unlike the presets. | Measured knock-limited spark (KLSA) against MAP and IAT for non-preset engines. |
| Burn duration: base 42°, residual penalty 3.8, λ penalties | `coefficients.js:150-166` | Plausible magnitudes. | Not sourced; they set MBT and knock directly. | Cylinder-pressure-derived 10–90% burn data. |
| `DRIVETRAIN_EFF` 0.85, flat | `constants.js` | A common rule of thumb. | Load and speed dependence. | Chassis-dyno against engine-dyno pairs. |
| `WALL_TEMP_K` 450, `EXHAUST_PORT_NTU` 1.0 | `coefficients.js` | Reasonable. | Unsourced; they move EGT and heat loss. | Measured EGT against λ and spark. |
| **Late-spark quench** (onset 5° ATDC, span 30°, max 0.55) and `AFTERBURN_RISE_C` 260 | `coefficients.js`, `ecuCoefficients.js` | Direction is right: late spark leaves charge unburned at EVO and raises EGT. | **Magnitudes are the auditor's estimates, not fitted to data.** | Exhaust temperature and HC under spark retard (catalyst-heating studies). |
| Overrun burble EGT result (+250–370 °C) | `point.js` | Monotonic in spark. | Absolute values. | Pre-turbine EGT logs from a burble calibration. |
| Turbo +20% at 6 psi on a VQ35DE | output | Knock-limited on 91 octane. | Real kits are commonly advertised higher; no controlled source verified. | A published dyno of a known kit with known boost, fuel and spark. |
| Rich-mixture invariant test edit | `tests/physics-invariants.test.js` | Changed this round to skip knock-limited cells. | — | Review: this narrows a test, and needs a reviewer's agreement. |

---

## 6. Product and UX findings

| Sev | Finding |
|---|---|
| High | **Sandbox work is not saved** (C1). No warning is shown before it is lost. |
| Medium | **Dyno "throttle" keys are MAP targets** (C3). |
| Medium | **Tour highlight is weak.** The next station is marked by a lit 3D marker and a label (`ShopBackdrop.jsx:264`, `data-next`). The user reports it is easy to miss. There is no full outline of the station. |
| Medium | **Freeze without WebGL** (C4). |
| Medium | **Airflow limits are not stated in-app.** The app says it teaches "real engine management", but nothing in the UI warns that VE curve shape is approximate (#15, #19). |
| Low | **New features have no guided path.** Burble settings sit on TUNE › Spark › Overrun burble with help text, but no lesson or mission covers them. The same is true of turbo tuning. |
| Low | **Placeholder clipped.** The custom engine form's "Cylinder diameter" placeholder is cut off at phone landscape width. |

What works well **[RUN]**:
- A clear start menu.
- The bench flow: an engine choice lands on Short block, and invalid custom inputs give specific errors ("Between 75 and 105 mm…", "Enter a number.").
- A safe base map for a custom engine, with an honest note.
- Stand start with cold-start enrichment.
- The dyno pull with curves, datalog and scorecard.
- Landscape and portrait phone layouts.
- No page errors in the run.

The product does not claim to connect to a real vehicle ECU; nothing found implements that, and nothing in the UI says it does.

---

## 7. Actual playtest results

| # | Test | How | Result | Correct? |
|---|---|---|---|---|
| 1 | Launch as a new user | Chromium, 1440×900 | Start menu with Career, Sandbox, Tutorial and v1.10.0 | Yes |
| 2 | Enter SANDBOX | click | 3D shop with a 6-step tour. Without WebGL, a 10 s freeze. | Yes / **C4** |
| 3 | Custom engine, empty submit | form | "Choose the cylinder layout. / Required.×4" | Yes |
| 4 | Invalid inputs (250 mm, −3, "abc", 99999) | form | Range errors per field | Yes |
| 5 | Valid custom V6 | form | Lands on Short block. Assumed values listed. "Safe base map loaded" after a bore change. | Yes |
| 6 | Start on the stand (VQ35DE preset) | click | 958 rpm, warm-up enrichment λ 0.76 at 23 °C coolant | Plausible |
| 7 | Dyno pull, 100 | click | 244 whp / 221 lb-ft. Log: clean. Tuning 100, Engineer 100. | Yes |
| 8 | Pull at the "40%" key | click | 49 whp, clean | Runs; label misleading (C3) |
| 9 | Turbo VQ tuned from the advice, 3 throttles | test harness | 244→292 whp; clean at 100/70/40; score 100 | Yes |
| 10 | Burble, all 13 factory engines | test harness | Off: fuel cut, 175 °C. −15°: 11% of the charge burning in the exhaust, EGT ~420–480 °C. −25°: ~31%, ~480–550 °C. No stalls. Returns to idle about 900 rpm. | Consistent (magnitudes unverified, §5) |
| 11 | Reload page | browser | Sandbox engine and tune **lost** | **No (C1)** |
| 12 | Enter CAREER | click | Shop, messages tour, job board present | Entered; a job was not completed this session |
| 13 | Landscape iPhone 844×390 and 932×430, portrait 390×844, Mac 1440×900 | screenshots | Station screen and console side by side; controls reachable | Yes |
| 14 | Engine damage | — | Not playtested in the UI. Covered only by the test suite **[TEST]**. | — |
| 15 | Save and load of career | — | Not playtested to completion. | — |

Gates **[RUN]**:

| Gate | Result |
|---|---|
| Physics branch tests | 2519/2519 |
| UI tests | 864/864 |
| Lint | 0 warnings |
| Typecheck | 0 errors |
| Production build | OK |
| `validate-physics.js` | Identities < 1%; MAE 1.8% |

---

## 8. Critical bugs and release blockers

1. **C1:** sandbox build and tune are lost on reload or tab discard.
2. **C3:** the throttle label teaches the wrong throttle-to-MAP relationship.
3. **C4:** a multi-second freeze where WebGL is unavailable.

No crashes, page errors or failing tests were found.

---

## 9. Recommended improvements, prioritised

- **P0**
  - Persist sandbox `build` and `tune` (C1).
  - Fix the dyno load labelling (C3).
- **P1**
  - Avoid the no-WebGL stall (C4).
  - A full outline or pulse on the tutorial's next station.
  - In-app disclosure of model limits (airflow shape, intake-temperature sensitivity, burble magnitudes).
  - Regenerate `docs/physics-validation.md` from the script in CI (C8).
  - A reviewer to confirm the narrowed rich-mixture invariant.
- **P2**
  - Split `EcuLab.jsx` (C2).
  - Seeded RNG (C7).
  - A lesson or mission for turbo tuning and for the burble.
  - Rename the `exhaust` route (C5).
  - Trim exports (C6).
- **P3**
  - Replace the empirical VE model with a 1-D or quasi-steady breathing model (#15, #19).
  - Load- and speed-dependent drivetrain loss.
  - Calibrate the late-spark quench and afterburn against published data.
  - Validate the turbo gain against a controlled dataset.

---

## 10. Overall assessment

| Dimension | Assessment | Evidence |
|---|---|---|
| Software engineering | **Good.** Clear sim/UI split, heavy tests, regression fingerprint, safe Electron, defensive storage. Weak spots: one god component and missing sandbox persistence. | §2; gates green |
| Physics accuracy and verification | **Mixed.** Combustion, heat transfer, knock and friction rest on published correlations with published constants. Identities hold. Factory ratings within 1.8% MAE. Airflow is empirical and fitted; several key constants are fitted or estimated. | §3, §5; script output |
| Product completeness | **Moderate.** The full build → run → pull → tune → score loop works. Career and tutorial exist. Persistence and guided content for advanced topics are missing. | §6, §7 |
| User experience | **Moderate to good.** Coherent flow and good error messages. Misleading load labels, a weak tour highlight and the lost-work risk. | §6 |
| Runtime stability | **Good** with WebGL: no errors, no stalls of the engine model. **Poor** without WebGL (10 s freeze). | §7 |
| Release readiness | **Not yet.** P0 items block a public release. As an "engineering-grade" claim, airflow verification is the gap. | §8 |
