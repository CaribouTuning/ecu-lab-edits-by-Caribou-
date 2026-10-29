# Physics, factory calibrations and the tuning screens they need

**Branch:** `CaribouTuning:claude/physics-fixes` → `DNiev:main`. Up to date with `main`, no merge conflicts.
**Merge this one first.** The interface PR (`claude/shop-ui`) is built on top of it.

## What this changes

### The simulator (`src/sim`)
- **Breathing from measured data.** This adds:
  - part-load VE from the ideal gas-exchange process, at any breakpoint;
  - low-speed breathing and overlap backflow;
  - turbine pulse energy;
  - valve area in breathing, and a second spark plug that shortens the burn.
- **Combustion.** Two changes:
  - Rich-flame chemistry and dissociation.
  - Molar expansion in the cycle: burning a rich mixture makes more moles of gas than it consumed. That puts best power near lambda 0.90, as on a real engine.
- **Friction** from the engine's geometry and valvetrain (cam bearings, followers, valves per cylinder), plus a friction level for older and newer engines.
- **Knock.** Real injection types (port and direct), an octane index from RON and MON, and stock spark that is knock-limited. Pistons wear only for knock that actually happened.
- **Bottom ends** are rated by mean piston speed, and redline goes up to 11,000 rpm on an assembly rated for it.
- **Forced induction.** Twin turbos with twin compressors, compressor sizing by airflow, and saner nitrous advice.
- **Bolt-ons and factory figures.** The audit's fixes: bolt-ons at their real size, factory spark at MBT, factory MAF calibration, and underboost.

### Factory engines and their calibrations
- **Six new pushrod V8 presets:** GM LS1, LS6, LQ4, LM7, LR4, and the Chrysler 6.4 HEMI.
- **Tables on each engine computer's own breakpoints.** GM P01/P59 and Chrysler GPEC2 use their own breakpoints (`src/sim/layouts.js`); the rest are engine-sized.
- **Factory fuel tables** follow each engine's own strategy (`src/sim/factoryFuel.js`):
  - closed loop at 14.7 at cruise;
  - enrichment ramped in from the open-loop threshold;
  - a full-load lambda that changes with rpm.

  GM's full-load values match the stock Power Enrichment tables in 26 stock P01/P59 calibrations. The others cite their sources and say how confident each is.
- **Advisor.** Its mixture band ramps its lean edge in with load, so a stock calibration is clean on TUNE at every load. The pull log overrules the breakpoints between them.
- **Refits.** The LR4 and HEMI cams are refitted so they peak before their limiters. The VQ35HR runs a 0.85 full-load lambda so its stock injectors keep headroom.

### What the screens needed for it
- **TUNE** works on engine-sized tables and offers a table-layout switch. It has a 3D view with a simulated pull across it.
- **The pull log** speaks tuner language, in working order. A MAF that under-reads is lean, not rich.
- **SANDBOX opens with no engine.** Pick a factory engine or enter your own; your own engine's calibration is generated from the physics.
- **Tutorial and Learn.** A five-minute tutorial with real game screens and worked numbers. The in-depth lessons become the Tuning Course in Learn, with practice missions.
- **The flat career.**
  - A tuning shop separate from SANDBOX.
  - Procedurally generated customers and engine-building jobs.
  - Pacing that takes weeks.
  - Every check says how to see it.

## Accuracy (`docs/accuracy.md`, `docs/factory-calibrations.md`, `docs/physics-validation.md`)
- **Power:** all 13 factory engines make their published crank power within 5% (mean 1.8%, `node scripts/validate-physics.js`).
- **VE against GM's stock tables:** within 5% on four of five GM engines. The LS1 reads 13% high below 4000 rpm.
- **Spark against GM's stock tables:** 3–4° mean error. This is **not yet within 5%**, and the docs say so.
- **Nissan, BMW and VW** have no stock calibration file behind them. Their fuel strategies are cited estimates, labelled as such.

## The fingerprint
The fingerprint moves, by design. Following CLAUDE.md's control procedure:
1. On a clean `upstream/main`, `node scripts/update-fingerprint.js --report` reproduced `main`'s hash. `tests/fixtures/fingerprint.sha256` stayed unchanged, so the toolchain matches.
2. On this branch the regenerated hash matches the committed fixture.
3. **Every report section moves:** `deriveEngine`, `computeHardwareVE`, `evaluatePoint`, `simulateSweep`, `factoryCalibration`, `calibrationAdvice`, `simulateDragRun`, `helpers` and `constants`.

   That is expected for this change. The engine description gains fields (valvetrain, friction, injection, bottom end) and the constants change. Breathing, the cycle, the factory tables and the advisor all change too. So no section is byte-identical, and the section split cannot isolate one effect here.

## Merging with `main`
- `main`'s screen-reader work (#81) is kept: accordions, disclosures and the sound toggle announce their state, and the TUNE switcher marks its page.
- So is the `--ink3` text guard (#79). Text this branch added in `--ink3` takes `--ink2`.

## Checks
- The full `vitest` suite passes on Node 22, fingerprint test included.
- `npm run lint` and `npm run typecheck` are clean.
- CI runs Node 20 and 22.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_011yB5vgB3XCafpiKPgWSGHR
