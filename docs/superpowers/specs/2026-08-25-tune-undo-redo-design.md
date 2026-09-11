# Undo/redo for calibration edits — design

Issue: [#60](https://github.com/DNiev/ecu-lab/issues/60) (first of three PRs)
Date: 2026-08-25
Status: approved

## Problem

There is no undo anywhere in ECU Lab. Every calibration edit is permanent the moment it
lands, and the only way back to a known state is `RESET TO STOCK`, which throws away
*everything* rather than the last thing you did.

That is already bad. Issue #60's later PRs make it dangerous: bulk operations over a
selected rectangle (±delta, scale %, set, interpolate, smooth) are exactly the feature
that turns a slip into a wrecked 6×8 table. The issue's own words — "a mis-drag on a 6×8
table is currently unrecoverable" — describe a hazard that does not fully exist yet.

So undo ships **before** the thing it protects against, not alongside it.

### What issue #60 got right

All five claims verify against the code:

| Claim | Verdict |
|---|---|
| `TuningGrid` holds one `{type:'cell'\|'row'\|'col'}`, no range selection | **Valid.** `TuningGrid.jsx:19` |
| No undo/redo anywhere in the app | **Valid.** `ACTIONS` has 15 entries, none a history op |
| No diff-vs-stock overlay | **Valid.** `TuningGrid` colours by `heat(val, min, max)` only |
| Pure grid transforms belong in `src/sim/tables.js` | **Valid.** It already owns the tables, axes and `SPARK_MIN_DEG`/`SPARK_MAX_DEG`; `CONTRIBUTING.md:27` forbids engineering maths in `src/ui/` |
| The reducer-backed store makes an edit log natural | **Valid.** `SET_TABLE` is the single funnel for all three calibration tables |

### What the issue missed

**Changing the `Selection` shape breaks the advisor panel merged in #87.**
`advisorReports.js` reads `selection.type === 'row'`, `selection.row` and `selection.col`
in all three report functions, and `countIn()` (`:37`) branches on exactly those.
`TuningGrid`, `SelectionDock`, `EcuLab.jsx:258`, the `initialState.js:60` typedef and
their tests read the same shape. That is a migration, not an addition — and it is why
selection work is deferred to PR 4b rather than bundled here.

**#60 is five features, not one.** Range selection, bulk operations, undo/redo, keyboard
navigation and a diff overlay. Only two are coupled (bulk ops and keyboard both need the
new selection). Undo and the overlay are independent of it.

## Scope

Issue #60 is split into three PRs. **This spec covers 4a only.**

| PR | Contents | Depends on |
|---|---|---|
| **4a** | Undo/redo | — |
| 4b | Selection rectangle, bulk ops, keyboard tuning | 4a |
| 4c | Diff-vs-stock overlay | — |

### Undoable

- `SET_TABLE` — any VE / spark / AFR edit
- `APPLY_PRESET` — loading a factory preset over the current tune
- `RESET_TO_STOCK`

`APPLY_PRESET` and `RESET_TO_STOCK` are included deliberately. Loading a preset over
hand-tuned tables is the most destructive single act in the app, and it already carries a
confirmation prompt (`presetPrompt`), which is the codebase agreeing that the danger is
real. Undo that covers the small mistake but not the large one teaches players not to
trust it.

### Not undoable

Hardware changes (turbo, injectors, octane, bolt-ons), dyno pulls and scores, the
live-engine model, navigation, and grid selection. Every hardware control already
displays its own current value, so it is self-reversing; and undo must not become a time
machine over banked career progress.

**Correction, made during implementation.** "Not undoable" above means *does not push a
history entry* — it does NOT mean undo leaves hardware alone. The snapshot is the union
of every field an undoable action can touch, and that includes thirteen build fields, so
undoing a preset load or a reset restores the hardware as it was at that moment. A
hardware change made *after* an undoable action is therefore reversed by undoing that
action, silently, even though the hardware change pushed nothing itself.

That is the correct behaviour — undoing a preset load means returning to the state before
it, and a partial restore would be worse. But it makes the wording of BUILD's offer
load-bearing: the Note must say that undo restores tables **and hardware**, or it
promises a smaller click than the one it performs. The original sentence named only the
three tables, which was false; the review caught it, and the human chose to keep the
behaviour and fix the sentence.

## Design

### The `history` slice

A fourth top-level slice beside `build`, `tune` and `session`:

```js
history: { past: [], future: [] }   // entries: { label, before }
```

`before` is a **uniform snapshot** — the union of every field any undoable action can
touch, rather than a per-action shape:

- from `build`: `engineConfig`, `mods`, `turboOn`, `boostCurve`, `turbineIdx`,
  `turbineCount`, `compressorIdx`, `injIdx`, `ecuInjectorCc`, `octaneIdx`,
  `exhaustDiaIdx`, `mafScalar`, `presetId`
- from `tune`: `ve`, `timing`, `afr`, `tablesDirty`

One shape means one `snapshot()`. A per-action *capture* shape would mean a fourth
undoable action added later could snapshot too little and produce a half-restored state
that no test thought to cover.

**Correction, made during the final review.** This section originally extended that
argument to `restore()` as well — one shape, one restore path. That half was wrong, and
the review proved it: `SET_TABLE` writes only `build.presetId` on the build side, so
restoring all thirteen build fields when undoing a table edit reverts hardware the player
installed *after* that edit. Turn the turbo on, then press undo on a VE edit, and the
turbo silently comes off under the label "Undo VE edit".

Capture stays uniform; **restore is now scoped to what the undone action actually wrote**.
Undoing a `SET_TABLE` restores `presetId` and the tune fields and leaves the other twelve
build fields alone. `APPLY_PRESET` and `RESET_TO_STOCK` still restore everything, because
undoing a preset load genuinely does mean returning to the state before it. The entry
carries the scope so `restore` does not have to import the action types.

The same review found the matching gap on the other side: only undoable actions cleared
`future`, so a redo could replay a snapshot over hardware built since the undo and destroy
it. Any build- or tune-writing action now clears the redo stack. `LIVE_STEP` is excluded —
at 20 Hz it would empty `future` before a player could reach the button.

`label` names what would be undone — `"VE edit"`, `"Preset · N54 Twin Turbo"`,
`"Reset to stock"`. It is load-bearing twice over: it gives the buttons a real
`aria-label` instead of a bare glyph, and it is how BUILD decides whether the top of the
stack is a preset load worth offering to reverse.

Depth is capped at **50** entries via `slice(-50)` on push. A snapshot is roughly 1 KB
(144 table numbers plus scalars), so 50 is ~50 KB — irrelevant, since only career stats
(`{best, total, pulls}`) reach storage and the state tree itself is never persisted. The
cap exists because an array that only ever grows is a leak with a long fuse, and because
"unlimited" is not a promise the UI can show honestly.

### Why undo does not restore dyno results

`APPLY_PRESET` clears `session.result` and `prevResult` so that "a factory rating from the
newly loaded engine must never sit next to a pull logged on whatever was running before
it" (`reducer.js:393-397`). Undo restores hardware and calibration but leaves the results
cleared.

This is a deliberate asymmetry, not an oversight. The result is lost either way — undo
does not make it worse than the path without undo — whereas re-showing a banked score
beside a build that was just reverted is the direction that states something false.

### Reducer changes

`ACTIONS` gains `UNDO` and `REDO`. Every existing case is untouched; recording wraps them:

```js
const UNDOABLE = new Set([ACTIONS.SET_TABLE, ACTIONS.APPLY_PRESET, ACTIONS.RESET_TO_STOCK]);
```

- An undoable action pushes `snapshot(state)` — the state *before* it — onto `past`,
  capped at 50, and clears `future`.
- `UNDO` pops `past`, pushes the current snapshot onto `future`, and restores.
- `REDO` mirrors it.
- Either with an empty stack returns `state` unchanged rather than throwing.

The reducer stays a pure function of `(state, action)`: no clock, no coalescing keys, no
merge logic. That purity is what the commit-on-release decision below buys, and the
existing reducer tests depend on it.

No `src/sim` change of any kind, so the behavioural fingerprint is untouched by this PR.
The history stack is state bookkeeping, not engineering maths, so `CONTRIBUTING.md:27`
keeps it in `src/ui/state/`. PR 4b is where `tables.js` gains the grid transforms.

### Commit-on-release, and why it is required

`SelectionDock.jsx:127` is `<input type="range" onChange={...}>`, and React maps `onChange`
on a range input to the `input` event — so it fires continuously during a drag. Dragging
timing from 12° to 30° dispatches roughly **18** `SET_TABLE`s today. Recorded naively,
undo would walk back one slider pixel at a time and be worthless.

The fix is at the source rather than in the history: the slider holds a local draft value,
`onChange` updates only the draft, and `onPointerUp`/`onKeyUp` commits exactly one
`SET_TABLE`. The draft resets when the selection changes. The steppers are unchanged — one
click, one entry.

Cost: the grid's heat tint updates on release rather than continuously. The dock's own
large readout still tracks the input live, so the value feedback a player actually watches
while dragging is unchanged.

The two alternatives were rejected for concrete reasons. Merging entries by an edit key
adds a field to the action plus merge logic, and still mis-merges two separate edits to
the same cell with nothing in between unless the dock also tracks gesture boundaries.
Merging by a time window puts a clock inside a reducer whose purity its tests rely on, and
makes undo depth depend on how fast the player happened to drag.

### Components

**`src/ui/components/UndoControls.jsx` + `.module.css`** (new) — the ↶ ↷ pair. Each button
is disabled when its stack is empty and takes its `aria-label` from the entry it would
reverse ("Undo VE edit"). Mounted in the grid header on TUNE's AIRFLOW, SPARK and FUEL.
**Correction, made during implementation.** This section originally called for a
`React.memo`'d leaf, reasoning that `LIVE_STEP` dispatches at 20 Hz and the store is a
single context, so every consumer re-renders on every action (`AppShell.jsx`, "THE 20 Hz
PROBLEM"). That reasoning was wrong about what `memo` does. The review measured it: five
unrelated dispatches took the component's render count from 1 to 6 with the wrapper in
place. `React.memo` only blocks re-renders driven by a parent's props; a component
reading context re-renders whenever the context value changes, which is exactly the 20 Hz
case. The wrapper is gone, and the component's header says so, because the next reader
would otherwise copy it. The real fix for the 20 Hz problem is splitting the context —
out of scope here, and not something two buttons and two string reads justify.

**`src/ui/components/SelectionDock.jsx`** — the draft-value slider described above.

**BUILD** — after a preset load or a reset, a `Note` offering `UNDO`, shown when the top of
`past` is a preset or reset entry. Placing it at the hazard rather than in the app header
keeps HOME and DYNO free of a control that would be inert on both, which is what the
overhaul's "more pages, less things on a page" brief asks for.

**`src/ui/EcuLab.jsx`** — the Cmd/Ctrl+Z and Cmd+Shift+Z / Ctrl+Y handler. It goes here,
not in `AppShell`, whose header states that the shell owns chrome only and "never
dispatches to the store directly". A global key handler is app behaviour, not chrome. It
is ignored while focus is in an `input`, `textarea`, `select`, or a contenteditable
element.

## Testing

The load-bearing test, because it proves the cross-slice restore end to end:

> load a preset → edit a cell (the header falls back to `3.0L I6`) → undo → **the header
> claims the preset again**

That fails for any implementation which restores the 48 numbers but forgets `presetId` —
the exact defect a table-only history would ship.

Alongside it:

- Pure reducer tests: depth capped at 50; `future` cleared by a new edit; undo and redo on
  an empty stack are no-ops; `tablesDirty` restored; `UNDO` after `APPLY_PRESET` restores
  the build fields.
- Slider: three `change` events followed by one `pointerUp` produce exactly **one** history
  entry. Asserting the count is the point — asserting only the final value would pass just
  as well with 18 entries recorded.
- `UndoControls`: disabled states, and labels drawn from the entry.

`tests/ui/characterisation.test.jsx` stays byte-identical. It drives the dock's `+1`
stepper, not the slider, and no existing test touches the TUNE slider at all — only
BUILD's boost slider (`build-store.test.jsx:503`), which this PR does not change.

## Out of scope

Selection rectangles, bulk operations, keyboard tuning and the diff overlay — PRs 4b and
4c. Undoing hardware changes. Persisting history across a reload.
