# The Post-Pull Scrubber — Design

**Issue:** #61 (UI overhaul PR 5), sub-issue of #6. This is **PR 5c**, the last of three.

**Goal:** Make DATALOG the pull, explorable at any RPM, instead of seven sampled points
of it.

## Scope

| PR | Contents | Status |
|---|---|---|
| 5a | Run-history timeline, ghost-curve fix, pinning | Merged (#95) |
| 5b | Events plotted at their RPM, clickable through to the log | Merged (#96) |
| **5c** | Post-pull scrubber. **This spec.** | This PR |

Merging this closes #61.

## The finding that shaped this

The issue calls DATALOG "a wall of text". It is closer to the opposite. Verified against
`07288c2`:

`DataScreen.jsx` builds its cards by walking `RPM` from `src/sim/tables.js` —
`[800, 1500, 2500, 3500, 4500, 5500, 6500, 7500]` — and looking up a sweep point at each.
That is the **VE table's axis**, borrowed because the constant was in scope. The sweep
itself runs `SWEEP_START_RPM` to the redline in `SWEEP_STEP_RPM` increments.

| | Points |
|---|---|
| Produced by a default pull (1500 to 7500, step 100) | 61 |
| Rendered by DATALOG | 7 |

`800` is below the sweep's start, so it always renders nothing. Fifty-four points are
already in memory, already carry every field the cards read, and are unreachable.

So the scrubber is not decoration on a crowded screen. It is how the other fifty-four
points become visible, and it removes an arbitrary coupling between the datalog and the
tuning table's grid.

## Decisions

**The scrubber lives on DATALOG, not on CURVES.** The issue's own words are "making the
datalog explorable", and DATALOG is where the missing points are. It also keeps two
pointer gestures apart: 5b just made the CURVES chart a click-to-focus surface for event
bands, and a drag-to-scrub gesture on that same element would have to be disambiguated
from it.

**The seven cards are replaced, not supplemented.** One readout, at the RPM you are on.
Keeping the list as well would put the same six rows on screen twice and make the page
longer rather than more explorable. The overview the list provided is preserved a
different way — see the track below.

**Gauges and asked-to-got rows, with nothing shown twice.** A gauge is the right shape for
a value that stands alone. It is the wrong shape for a value whose whole diagnostic idea
is the *pair*: what was asked against what the engine did.

Today's six rows split cleanly on that test. **Three carry a pair** — cylinder filling
(`veTable` against `ve`), timing (`commandedTiming` against `timing`) and mixture
(`afrCommanded` against `afr`). **Three do not** — injectors, heat and pressure are
standalone readings wearing a row.

So the grid carries the eight standalone readings and the rows carry the three pairs.

The first row is renamed from **Airflow** to **Cylinder filling**. It was never about
airflow in the sensor sense: its pair is the VE table's claim against what the engine
actually flowed, and that is the number the histogram corrects. `AIRFLOW` is now the
gauge showing the MAF reading in g/s, so leaving the row under the same name would put
two different quantities behind one word.

**No comparison run.** Considered and declined. The ghost curve already answers "did my
change help", and the two comparisons currently on screen do not agree with each other:
the delta panel compares against `runs[1]` while the ghost compares against the **pinned**
run. Adding a third reading of that before the disagreement is settled would make the
screens less coherent, not more. Recorded here as a known open question, deliberately not
addressed by this PR.

## Architecture

### 1. `src/ui/components/scrubPoint.js`

New, pure, DOM-free. Follows the `eventBands.js` and `advisorReports.js` precedent for a
pure helper under `components/`. Three decisions live here because each is worth testing
without rendering anything:

```js
/** The sweep point at `rpm`, or the nearest one at or below it. Null if before the first. */
export function pointAt(points, rpm);

/** Where the scrubber opens: the focus RPM if there is one, else peak power's RPM. */
export function initialScrubRpm(points, logFocusRpm);

/** The gauges for one point, as {key, label, value, unit, tone}. */
export function pointGauges(point);
```

`pointAt` falls back to the nearest point **at or below** rather than requiring an exact
hit. The track's own `step` guarantees exact hits, but the seeded RPM does not come from
the track — it comes from `logFocusRpm`, written by a chart click. Tying correctness to
two separate things agreeing is how a screen goes blank in a case nobody rendered.

`initialScrubRpm` is the seeding rule. It has two branches that must both be pinned —
this project's recurring test failure is pinning one side of a pair — and it clamps the
seeded RPM into the pull's own range, so a focus value from outside it cannot park the
scrubber past the data.

`pointGauges` returns the eight readings a single number can carry: **airflow, manifold
pressure, intake air temperature, lambda, duty, pulse width, exhaust temperature and peak
cylinder pressure.** Volumetric efficiency, timing and mixture are deliberately absent;
they belong to the rows, where the asked-to-got pair can be shown. Each gauge's tone comes
from the point's own risk flags, which the sim already computes, or from `utilisationTone`
for duty. It never re-derives a threshold the sim owns.

### 2. `utilisationTone` in `theme.js`

`theme.js` already establishes the pattern: `statusTone(v)` returns a tone name and
`statusColor(v)` is `T[statusTone(v)]`. `utilisationColor` predates that pattern and goes
straight to a colour, so a caller that needs the *name* has no way to ask. `DataScreen`
currently works around it by comparing the returned colour against `T.danger`.

`StatTile` takes a tone name, so this PR adds the missing half and redefines the existing
function through it:

```js
export const utilisationTone = (v) => (v > 90 ? 'danger' : v > 75 ? 'warn' : 'ok');
export const utilisationColor = (v) => T[utilisationTone(v)];
```

The thresholds stay in exactly one place. This is the only change outside the datalog.

### 3. The track

A native `<input type="range">`:

- `min` is the first sweep point's RPM, `max` is the last. Both come from `result.points`,
  never from `SWEEP_START_RPM`/`SWEEP_END_RPM` — a build with a lower redline has a shorter
  pull, and reading the constants would let the scrubber travel past the data.
- `step` is `SWEEP_STEP_RPM`, so every position lands exactly on a point rather than
  between two.
- An `aria-label` naming what it scrubs, and `aria-valuetext` reading the RPM, so it
  announces "5200 RPM" rather than a bare number.

**Native, not a custom drag surface.** Keyboard, touch, pointer and screen-reader support
all come with it. #81 already tracks this project's accessibility debt; a hand-built drag
handle would add to it.

**The event bands sit behind the track.** Same `eventBands(result.events)` the two charts
call, positioned along the track by RPM. This is what replaces the overview the seven
cards gave: trouble is visible on the track before you drag into it, and it is the same
tint, from the same function, as the bands on the charts.

### 4. State

The position is `useState` **inside `DataScreen`**, seeded on mount from
`session.logFocusRpm` through `initialScrubRpm`.

Dragging dispatches nothing. The store is a single `useReducer` behind one context, so
every dispatch re-renders every consumer — that is why `LiveScreen` is a separate file,
and its header says so. A pointer drag is the last thing that should go through that path.

The seeding gives cross-screen continuity for free: 5b's band click sets `logFocusRpm` on
CURVES, so arriving at DATALOG afterwards lands the scrubber on the event that was
clicked. `BANK_PULL` already clears `logFocusRpm`, so a new pull opens at peak power
rather than at the last pull's knock.

No new store field. No new action.

## Verification

Full gate on every commit, on Node 22 (`v22.23.2`): `npm test`, `npm run lint`
(`--max-warnings 0`), `npm run typecheck`, `npm run build`. Tests run as
`./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`.

`src/sim/` is not touched. `tests/fixtures/fingerprint.sha256` and
`tests/ui/characterisation.test.jsx` stay byte-identical to `main`.

### Tests, and the failure mode they are written against

Across 4a, 5a and 5b the same shapes kept shipping: pinning one side of a pair; pinning
each case but not the exclusivity between them; moving two variables at once so neither is
held; asserting a count or a shape but not **which end**; and a harness reading post-state
for its "before". 5b added one more, found in my own new test: **a negative assertion
whose pattern cannot match the string it is meant to exclude proves nothing.**

**Every mutation proof changes exactly one thing**, and must fail the specific test it was
predicted to fail — not merely fail something.

Required:

- **Seeding, both branches.** With a focus RPM the scrubber opens there; with null it
  opens at peak power's RPM. Returning "always the focus" and "always peak" must each
  fail.
- **Peak power's RPM, not peak power.** `result` carries `peakHp` as a *value*; the RPM
  has to be derived from the points. A test where the peak value and the peak RPM are
  different numbers, so returning the wrong one is visible.
- **The track spans the data, not the constants.** A shorter pull, from a lower redline,
  must give a `max` equal to its own last point.
- **The step is the sweep step.** Asserted as a value, not merely present.
- **Gauge tone, at the boundary, both directions.** Just inside a limit is not danger and
  just outside is.
- **The rows keep their pairs.** Cylinder filling, timing and mixture each still render
  asked and got, and none of those six values appears in the gauge grid.
- **The split is asserted as a rule, not as a list.** A test that only checked "three rows
  exist" would pass an implementation that picked the wrong three. The assertion is that
  every row renders a pair and no gauge does.
- **`utilisationColor` is unchanged by its refactor.** Its existing callers must be
  pinned before the redefinition lands.

## Risks

| Risk | Mitigation |
|---|---|
| Replacing the card list loses the at-a-glance overview | The track carries the 5b event bands, so where trouble lies is visible without dragging |
| A drag re-renders the whole app | Position is local state; nothing dispatches during a drag |
| The scrubber travels past the data on a low-redline build | `min`/`max` come from `result.points`, never from the sweep constants, with a test on a short pull |
| Refactoring `utilisationColor` changes an unrelated screen | Its callers are pinned first, and the refactor keeps one definition of the thresholds |
| The gauge grid and the rows drift into showing the same value twice | Asserted directly: a value in the rows must not appear in the grid |
