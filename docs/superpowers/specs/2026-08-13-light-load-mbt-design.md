# Light-load MBT, the spark advisor, and two datalog sentinels

**Issue:** #4 — "Datalog surfaces two physically meaningless values at light load"
**Date:** 2026-08-13
**Status:** approved, awaiting CaribouTuning's read on the physics before merge

## Why this is not the issue as filed

Issue #4 describes two cosmetic display defects. The values are real and reproduce, but
the issue is wrong about where they surface, and the first one is not cosmetic.

**Neither value is rendered in the datalog.** The DATALOG tab (`EcuLab.jsx:2071-2091`)
shows Airflow, Timing, Mixture, Injectors and Heat. `git log -S"threshold" -- src/ui/EcuLab.jsx`
returns no commits: it has never been displayed there. `bsfc` likewise appears nowhere
in the UI. The cited location `point.js:129-131` is also stale — that code moved to
`knock.js:61-63` when the threshold was extracted for the presets work.

**The knock threshold reaches the player through the spark advisor instead.**
`advisors.js:103` computes suggested timing directly from it:

```
20 kPa /  800 RPM: 14deg -> suggested 165.5deg
20 kPa / 1500 RPM: 34deg -> suggested 144.0deg
underAdvanced count: 24 of 32
```

With 24 of 32 cells flagged, the SPARK screen (`EcuLab.jsx:1792-1794`) tells the player
*"Timing left on the table. 24 cells are more than 3° below what this build would
tolerate — you are giving away torque"* about a correct stock calibration. That is a
teaching defect, not a display defect, and the fix proposed in the issue (clamp the
reported field, leave the calculation untouched) would not touch it.

## Root cause

Three parts of the model disagree about light-load timing at 20 kPa / 2500 RPM:

| Source | Says | |
|---|---|---|
| Knock model (`knock.js`) | 124° is tolerable | absurdly high |
| MBT model (`mbtTiming`) | peak torque at 24.8° | too low against real practice |
| Shipped stock table | 40° | matches real factory maps |

`knock.js:60`'s own comment defends the stock table — *"factory cruise maps carry 40-50
deg of advance and never complain"* — while `mbtTiming` punishes exactly that: the
shipped 40° drops `timingEff` to 0.63, and the shipped 47° pins it to the 0.55 floor.

The cause is that `mbtTiming`'s load term spans only 6° across the entire 0→101 kPa
range:

```js
return 24 + ((rpm - 1500) / 6000) * 12 - (mapKpa / BARO_KPA) * 6;
```

A dilute light-load charge burns slowly, so real MBT climbs to 40-50° at cruise. A 6°
span cannot represent that. The 165° advisor suggestion and the timing-efficiency
contradiction are the same defect seen from two ends.

## Design

### 1. MBT as burn duration (`knock.js`, `coefficients.js`)

MBT is really "start the burn early enough that half the charge has burned just after
TDC, where the expansion stroke can use the pressure". Model that directly:

```js
theta50 = (BURN_REF_DEG + ((rpm - 1500) / 6000) * BURN_RPM_GAIN)
        * Math.pow(1 / Math.max(mapKpa / BARO_KPA, 0.05), BURN_DILUTION_EXP)
mbt     = clamp(theta50 - MFB50_ATDC_DEG, MBT_MIN_DEG, MBT_MAX_DEG)
```

`theta50` is the crank interval from spark to 50% mass-fraction-burned. It grows with
RPM (less time per crank degree) and grows as the charge thins, which is the mechanism
the old linear term was missing.

New coefficients, all in `coefficients.js` with comments, per CONTRIBUTING's rule that
no bare magic numbers live outside it:

| Coefficient | Value | Meaning |
|---|---|---|
| `BURN_REF_DEG` | 26.5 | spark-to-50%-MFB interval at 1500 RPM, atmospheric |
| `BURN_RPM_GAIN` | 12 | extra crank degrees per 6000 RPM |
| `BURN_DILUTION_EXP` | 0.36 | how fast a thinning charge slows the burn |
| `MFB50_ATDC_DEG` | 8.5 | where 50% MFB should land, degrees ATDC |
| `MBT_MIN_DEG` / `MBT_MAX_DEG` | 10 / 50 | no production calibration falls outside this |

Calibration anchors:

| Point | Old | New | Real-world target |
|---|---|---|---|
| WOT, 5500 RPM, 101 kPa | 26.0 | **26.0** | ~26, deliberately identical |
| Cruise, 2500 RPM, 20 kPa | 24.8 | **42.6** | 40-50 |
| Boost, 5500 RPM, 200 kPa | 20.2 | **18.5** | ~18 |

The atmospheric row is reproduced exactly by construction, so **NA wide-open-throttle
power does not move at all** — measured 0.00% change in `timingEff` at every RPM
breakpoint. Both existing intent tests (`physics.test.js:438,442`) still hold: MBT rises
with RPM, falls with load.

### 2. Bound the advisor (`advisors.js`)

Suggested spark becomes `clamp(min(knockLimit - 1.5, mbtTiming(...)), 5, 50)` — which is
exactly what the factory calibration generator already does at `presets.js:283`. The
advisor simply never adopted the pattern.

Then split the classification, because the two faults are physically different and one
is dangerous while the other is merely wasteful:

- `overAdvanced` — past the knock limit. Damaging. Keeps the existing red panel.
- `pastMbt` — inside the knock limit but past peak torque. Buys nothing, costs a little
  risk. New informational panel.

Both use the same 1.0° tolerance the current `overAdvanced` filter uses, so a cell must
sit more than a degree past the relevant ceiling before it is called out. A cell past the
knock limit is `overAdvanced` only — it is not also reported as `pastMbt`, since the
dangerous fault is the one worth naming.

The `[5, 50]` clamp bounds are taken from `presets.js:283` rather than reinvented; they
are the spark table's own editable range, so a suggestion outside them could not be
applied anyway.

Without this split the fix trades one wrong number for one wrong label: 16 of 32 stock
cells would trip *"beyond the knock limit"* while sitting 20-30° below it.

### 3. Report the distinction (`EcuLab.jsx`)

Render `pastMbt` in its own panel, worded as what it is — advance past the point where
more advance stops helping. It sits directly beside the existing *"Why timing has a
sweet spot (MBT)"* explainer at line 1808, which already teaches this concept.

### 4. BSFC sentinel (`point.js:150`)

```js
const bsfc = powerW > 0 ? (...) / (powerW / 745.7) : null;
```

Confirmed to fire across the whole 20 kPa row, where the engine is motoring at -2 to
-25 hp. The guard is right; `0` is the lie. Render absent values as `—`, matching how
the live gauges already handle them. `bsfc` is nullable in the returned record, so the
JSDoc and any consumer must accept `number | null`.

## Consequences

- **The fingerprint moves** for boosted and light-load points; NA WOT is unchanged.
  Regenerate with `node scripts/update-fingerprint.js --report` on both sides and explain
  the diff in the PR, per CONTRIBUTING.
- **Light-load `timingEff` rises** from 0.55-0.63 to ~0.99. Cruise stops being modelled
  as catastrophically inefficient, which is the correction.
- **Boosted builds lose a little power** — `timingEff` at 200 kPa / 5500 RPM goes
  0.78 → 0.71, because a dense charge burns fast and genuinely wants less advance.
- **Idle changes.** At 20 kPa / 800 RPM `timingEff` hits the 0.55 floor, recovering to
  0.94 by 70 kPa as the idle valve opens. This is self-correcting — more idle air raises
  MAP, which lowers MBT back toward the commanded value — but it is a live-engine
  behaviour change and must be proven not to stall the engine.
- **Preset fidelity improves as a side effect.** Every factory calibration currently
  writes ~25° into cells where real factory maps carry 40-47°.

## Testing

Intent tests (direction and relationship, not magnitudes):

1. MBT rises as load falls, across the full range — not just the 6° the old term allowed.
2. MBT at cruise (20 kPa) lands in the 40-50° band real calibrations use.
3. MBT at WOT is unchanged from the current model, within a tight tolerance.
4. MBT stays inside `[MBT_MIN_DEG, MBT_MAX_DEG]` at every grid point and beyond it.
5. The advisor never suggests more advance than MBT.
6. The advisor never suggests more than the knock limit minus its safety margin.
7. A stock calibration produces no `overAdvanced` cells — the red panel must not fire on
   the shipped tune.
8. `bsfc` is `null` when power is non-positive, and a positive number otherwise.

Live engine:

9. A `liveStep` idle test: the engine starts, reaches idle, and holds it without
   stalling. `liveStep` currently has **zero** test coverage (issue #8), so this is the
   first one. It is required here because the change moves idle timing efficiency.

Full suite — `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` — plus a
regenerated fingerprint with its report diff.

## Out of scope

- The knock threshold's own inverse law still returns 235° at the 0.04 floor. Nothing
  now consumes that number unbounded, so it is left alone rather than clamped
  speculatively; capping it where it feeds `knockPull` would invent knock that is not
  there.
- Decomposing `EcuLab.jsx`. The panel added here follows the existing local pattern.
