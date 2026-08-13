# BMW B58 presets and a grouped engine picker

**Status:** approved, ready for implementation plan
**Branch:** `feat/5-b58-presets`
**Date:** 2026-08-13
**Issue:** #5

## Problem

Issue #5 asks for BMW support and says nothing else — the title is "Bmw" and the body
is empty. The reporter was asked which motor and never answered. The maintainer
resolved it directly: add the B58.

The app already ships one BMW, the N54, so this is not "BMW support" from nothing. It
is the next engine in a family the app already teaches, and the B58 is the interesting
one to put beside the N54: ten years later, single twin-scroll turbo instead of twins,
11.0:1 compression instead of 10.2:1.

A second problem surfaces as soon as the list grows. The picker is a vertical stack of
full-width buttons. Four presets plus "Custom build" is five rows; six presets plus
Custom is seven, on a panel that already scrolls. The list needs to become a dropdown
before it grows, not after.

## Goal

Ship both common B58 variants as factory presets that validate against their published
figures through the shared physics, and replace the picker with a dropdown grouped by
manufacturer.

## Non-goals

- **Compressor tier rework.** Real OEM small turbos run well past the 20 psi ceiling
  `COMPRESSOR_OPTS` gives the Medium tier — a stock IS38 can be calibrated to 29 psi.
  That is a real defect and it is already filed as issue #9. It is excluded here
  because raising a ceiling changes physics under every boosted preset already
  shipped, and that deserves its own review rather than riding along with a preset
  addition.
- **Issue #13** ("Custom (based on N54)" instead of "Custom build"). The picker is
  being touched, but that label change is a separate filed issue.
- **Issue #6**, the UI overhaul. This changes one control, not the design language.
- Any new physics. Both presets must be reachable with the model as it stands.

---

## The two presets

| | B58B30M0 | B58B30M1 |
|---|---|---|
| id | `b58-m0` | `b58-m1` |
| Manufacturer | BMW | BMW |
| Years / car | 2016-2018, 340i / M240i | 2019+, M340i / Z4 M40i |
| Layout | I6 | I6 |
| Bore x stroke, mm | 82.0 x 94.6 | 82.0 x 94.6 |
| Displacement | 3.00 L | 3.00 L |
| Compression | 11.0:1 | 11.0:1 |
| Induction | single twin-scroll, ~13 psi | single twin-scroll, ~17 psi |
| Block / head | aluminium / aluminium | aluminium / aluminium |
| Factory power | 320 hp @ 5500-6500 | 382 hp @ 5800 |
| Factory torque | 330 lb-ft @ 1380-5000 | 369 lb-ft @ 1800-5000 |
| Redline | 7000 | 7000 |

Sources go inline in `presets.js` beside each figure, as the existing four do.

The M0 is plateau-rated on power and the M1 is point-rated, so `factory.crankHpRpm`
holds a `[lo, hi]` band for the first and a number for the second. Both forms are
already handled by `tests/presets.test.js` — no new assertion shape is needed.

### Why both

The pair carries the same lesson the EA888.3 GTI/Golf R pair does — one short block,
two turbochargers, two very different cars — on an engine family the app already has a
member of. Against the N54 it teaches the other axis: what a decade of direct
injection and combustion development bought, at a compression ratio a 2006 turbo
engine could not have run.

### Displacement check

Through the existing `deriveEngine` formula, 82.0 x 94.6 mm across six cylinders lands
at 2.998 L against a real 2998 cc.

### What is published and what is fitted

Bore, stroke, compression, redline and the published power and torque ratings are
facts and do not move. `camDuration` and `springRate` are not published by BMW, so
they are where each preset absorbs model error — the same arrangement the VQ35HR
comment documents. The boost curve is fitted in shape, bounded by the real peak-boost
figure.

Fitting happens through `scripts/analyze_presets.py`, which already exists for exactly
this loop: adjust preset data, re-measure the whole curve, repeat. Nothing in
`coefficients.js` is touched, and no per-engine multiplier is introduced. A preset
that cannot be fitted honestly gets reported, not forced.

### Known risk

The 382 hp fit is the harder of the two. It needs roughly 17 psi and may press the
injector duty wall. If it cannot land inside the suite's envelope on cam, spring and
boost shape alone, that gets raised with real numbers rather than resolved by widening
a tolerance.

---

## Injector catalogue

`INJECTOR_OPTS` currently stops at 850cc. Append 1000cc and 1400cc, with a comment
noting these are port-injection sizes of the kind run alongside OEM direct injection
on a modern boosted engine.

Appending is inert for everything already in the app: every consumer reads the
catalogue by index or by label lookup, and nothing derives from its length or its
maximum. No existing preset's hardware changes.

This is not required by either B58 fit at their published ratings. It is added because
the catalogue's top end is unrealistically low for the engines the app now ships, and
it gives the M1 headroom if duty turns out to bind.

---

## Grouped picker

### Data

A new export from `src/sim/presets.js`:

```
PRESET_GROUPS: { manufacturer: string, presets: Preset[] }[]
```

Built from the `manufacturer` field, which every preset has already carried since they
shipped and which nothing has ever read. Manufacturers are ordered by first appearance
in `ENGINE_PRESETS` (Nissan, BMW, Volkswagen) and presets keep their `ENGINE_PRESETS`
order within a group, so the single source of ordering stays the preset array itself
and a reordering there cannot leave the picker disagreeing with it.

The grouping lives in the sim module rather than in JSX for the reason `applyPreset`
states in its own docstring — behaviour that can be asserted without React. The
component consumes the shape; it does not compute it.

### Control

The `PickList` at the top of the Engine Architecture section becomes a native
`<select>`, styled to the dark theme:

- one `<optgroup>` per manufacturer, labelled with the manufacturer name
- options labelled `<name> · <crankHp> hp`, where the name no longer repeats the
  manufacturer carried by the group heading
- `Custom build` as a final option outside any group

Native is chosen over a custom dropdown for keyboard and screen-reader behaviour that
comes for free, and for rendering as the platform picker on mobile. The cost is that
`optgroup` label styling is only partly controllable across browsers, which is
acceptable for a group heading.

Everything downstream of the control is unchanged: the blurb and factory-rating panel,
the "this replaces your current tune" confirmation, and the `choosePreset` flow behave
exactly as they do now. `PickList` itself stays — the turbine and injector pickers
still use it.

---

## Testing

**Preset validation** (`tests/presets.test.js`). The count and id assertions go from
four to six. Every existing per-preset loop then covers the B58s with no new code:
slider ranges, real part indices, true displacement from bore and stroke, redline
inside the RPM axis, power within ±5%, torque within ±10%, peak-RPM placement, zero
knock events, injector duty under 90%.

**Grouping.** New assertions that every preset appears exactly once across
`PRESET_GROUPS`, and that group order is stable.

**Advisor consistency** (`tests/physics.test.js`). The existing loop over
`ENGINE_PRESETS` extends automatically, so both B58s must also avoid having their own
factory spark table called wasteful.

**Fingerprint.** `tests/fingerprint.js` walks `ENGINE_PRESETS` and hashes every
preset's generated VE, spark and fuel surface, so the hash necessarily moves. It is
regenerated once, at the end, and the report diff is read before committing. The
expected diff is two added `factoryCalibration` entries plus the changed
`INJECTOR_OPTS` constant, with **no changed rows**. A row moving that this change did
not add is a bug in the change, not a fixture to bless.

**Full gate before the PR:** `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`.

---

## Definition of done

- `b58-m0` and `b58-m1` ship, both validating against published figures through the
  shared physics with no new coefficients and no per-engine multiplier
- `INJECTOR_OPTS` carries 1000cc and 1400cc
- The picker is a manufacturer-grouped dropdown covering every preset plus Custom
- `PRESET_GROUPS` is exported and asserted
- Fingerprint regenerated deliberately, with the diff reviewed and explained in the PR
- All four checks green, and a PR open against `main` closing issue #5
