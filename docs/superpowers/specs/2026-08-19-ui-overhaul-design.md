# UI Overhaul — design

Issue: [#6](https://github.com/DNiev/ecu-lab/issues/6)
Date: 2026-08-19
Status: approved

## Problem

ECU Lab's interface has three defects that reinforce each other.

**It has no styling layer.** The entire UI is one 2365-line component, `src/ui/EcuLab.jsx`,
carrying 439 inline style objects. Inline styles cannot express a media query, a `:hover`,
or a `:focus-visible`. This is not a stylistic complaint — it is why the app has **zero
breakpoints**. Every layout decision that depends on viewport width is currently
inexpressible, so none were made.

**It is a phone layout served to desktop.** The shell is a `100dvh` flex column with a
bottom tab bar. On a monitor, panels and buttons stretch to the full window width because
nothing constrains them. The eight `minWidth`/`maxWidth` hits in the file are all either
`minWidth: '100%'` on a scroll container or `maxWidth: 300` on the start screen.

**Its accent colour is its alarm colour.** `T.amber` (`#ff6a2c`) appears 84 times and
`T.red` 22 times. The wordmark, the active nav tab, the focus ring, primary buttons,
selected table cells and genuine warnings are all the same hot orange-red. An app whose
purpose is reporting engine distress has spent its distress colour on chrome, leaving
nothing to escalate to.

Compounding all three: four tabs carry roughly 300 lines of JSX each, with collapsing
accordions stacked inside them.

### What the issue got right and wrong

Issue #6 lists three bullets. Verified against the code:

| Bullet | Verdict |
|---|---|
| "Make engine selection a dropdown" | **Already done.** `GroupedSelect` at `EcuLab.jsx:125`, used at `:1477` with optgroups. |
| "Allow users to select multiple cells on tuning tables" | **Valid.** `TuningGrid` (`:317`) holds one `{type:'cell'\|'row'\|'col'}`. No range selection. |
| "General modernization of look" | **Valid, underspecified.** Expanded by this document. |

## Goals

- Desktop-first and genuinely responsive, degrading to phone.
- A colour system where the accent has one job and status colours are reserved.
- More pages, each doing less.
- A code structure where the next UI change is cheap.
- Twelve selected features (see Roadmap).

## Non-goals

- **No physics changes.** `src/sim/` behaviour is frozen for this work. See Verification.
- No light theme. This is an instrument; it is dark.
- No new runtime dependencies. The only addition is `@testing-library/react` as a devDependency.

## Visual direction

**Accent: Azure `#4C9EFF`** on a blue-black base. Chosen over cyan (the first preference)
because a blue-black ground makes the red alarm state pop harder than a neutral grey ground
does — which matters in an app whose job is telling you when something is wrong.

```
--bg      #0a0d14     --ink     #e9eef8     --acc     #4c9eff
--panel   #131824     --ink2    #8792a8     --accInk  #8fc2ff
--panel2  #1a2130     --ink3    #5c6880     --accOn   #04162e
--panel3  #212a3c     --line    #262f42     --lineHi  #33405a

--ok #35e08a    --warn #ffb020    --danger #ff4d4d
```

**The rule that makes it work: the accent is never a status, and a status is never
decoration.** Azure means "this is the action" or "this is the live value". Green, amber
and red mean engine state and nothing else. The table heat-map gets its own cool ramp so a
hot cell never competes visually with a real warning.

That discipline is most of the fix. The specific hue is the smaller half.

## Layout

A blend of three directions, each answering a different question:

- **Shell** — icon sidebar for the five sections, plus a slim always-visible status strip
  (engine, boost, octane, health, last pull). Engine state never leaves the screen.
- **Decomposition** — five sections split into roughly fourteen small pages. TUNE becomes
  Airflow / Spark / Fuel / Injectors / Sensors; BUILD becomes Engine / Induction / Fuel
  System / Exhaust. Content is width-capped so nothing spans a 27-inch monitor.
- **Contextual panel, TUNE screens only** — a right-hand panel that reacts to the cells you
  just edited and states what the change implies.

The contextual panel must **report the gap, never close it** — `CONTRIBUTING.md` treats
that as non-negotiable, and it applies here as much as to the advisors. It describes; it
does not predict a result. Only a dyno pull measures anything.

## Architecture

| Layer | Location | Responsibility |
|---|---|---|
| Tokens | `src/ui/tokens.css` | Palette, spacing, type, radii, breakpoints as CSS custom properties |
| Primitives | `src/ui/primitives/` | Button, Panel, StatTile, Bar, Select, Toggle, Field, Note — each with a co-located `.module.css` |
| Screens | `src/ui/screens/` | One file per page |
| Shell | `src/ui/AppShell.jsx` | Sidebar, status strip, content outlet, responsive behaviour |
| State | `src/ui/state/` | `BuildContext`, `TuneContext`, `SessionContext` |
| Table ops | `src/sim/tables.js` | Pure grid transforms: interpolate, smooth, scale, delta |

### Decisions

**CSS Modules over a styling library.** Vite supports `.module.css` natively. No new
dependency, real media queries, real pseudo-classes. Tokens live once, as custom
properties.

**Hand-rolled hash routing (~40 lines) over react-router.** Fourteen pages need real URLs.
`#/tune/spark` deep-links work on GitHub Pages with no server configuration. A router
dependency is not worth it in an app with four production dependencies.

**Three reducer-backed contexts over 40 `useState` calls.** Undo/redo needs an edit log;
a reducer provides one structurally rather than as a bolt-on.

**Bulk table ops live in `src/sim/tables.js`.** `CONTRIBUTING.md` forbids engineering maths
in `src/ui/`. Interpolating a spark table is not physics, but it is maths over calibration
data, and `tables.js` already owns that data, its axes and its clamps. Placing the ops
there also makes them unit-testable without a DOM.

## Verification

**The behavioural fingerprint is the safety net for the whole refactor.** This is a
UI-only change, so `tests/fingerprint.test.js` must stay byte-identical throughout. If it
moves, the change broke physics and the fix is to the change — **not** to rebaseline the
fingerprint. Run on Node 22 (keg-only install); the default Node 26 shifts float results
and invalidates the hash on its own.

Full gate per `CONTRIBUTING.md`, on every PR: `npm test`, `npm run lint`, `npm run
typecheck`, `npm run build`.

**Test strategy.** `tests/` currently holds no UI tests at all. Rather than pretend a
redesign can be snapshot-tested, everything that can be pure will be pure and tested as
such: table ops, the undo reducer, route parsing, share-link encode/decode. A thin layer of
component tests over the primitives uses `@testing-library/react`, added as a
devDependency.

## Roadmap

Seven pull requests. PRs 1–3 are the overhaul; 4–7 are the selected features.

| # | PR | Contents |
|---|---|---|
| 1 | Design system | Tokens, CSS Modules setup, primitives library. No screen changes. |
| 2 | State extraction | Three contexts. Behaviour-preserving; render stays monolithic. |
| 3 | Shell + IA | Sidebar, status strip, routing, `EcuLab.jsx` split into ~14 screens. |
| 4 | Table editing | Multi-cell selection, bulk ops, undo/redo, keyboard navigation, diff-vs-stock overlay |
| 5 | Progress | Run-history timeline, ghost-curve fix, events plotted on the dyno curve, post-pull scrubber |
| 6 | Garage | Multiple saved builds, shareable build links |
| 7 | Extras | Command palette, challenges/scenarios |

Splitting PR 2 from PR 3 is deliberate: moving state and moving markup in one diff produces
a review nobody can perform.

### Feature notes

**Ghost curve already exists** — `EcuLab.jsx:2105` draws `prevHp`/`prevTorque` as dashed
lines in `#3a4149`, a grey dark enough to be nearly invisible, and it remembers only one
pull back. PR 5 makes it legible and lets any run from history be pinned as the comparison.

**There is no undo anywhere in the app.** PR 4 introduces it.

**`storage.js` persists only `{best, total, pulls}`.** Saved builds in PR 6 are new
plumbing, not an extension of existing persistence.

### Process

Issue #6 should become an epic with one sub-issue per PR, so each lands against something
specific. Its first bullet is already implemented and should be noted as such on the issue.

## Risks

| Risk | Mitigation |
|---|---|
| The refactor silently changes physics | Fingerprint must not move; it is checked on every PR |
| PR 3 is too large to review | State (PR 2) and markup (PR 3) are separated; screens land as one file per page |
| Contextual panel becomes noise | Copy is held to the same `msg`/`cause`/`fix` standard as pull-log events |
| Seven PRs stall midway | Each PR is independently shippable; the app stays working after every one |
