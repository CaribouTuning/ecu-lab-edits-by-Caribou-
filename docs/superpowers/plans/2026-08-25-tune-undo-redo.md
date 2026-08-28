# Undo/redo for calibration edits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ECU Lab an undo/redo stack covering every calibration edit, preset load and reset-to-stock, before PR 4b adds the bulk operations that make a slip catastrophic.

**Architecture:** A fourth top-level store slice, `history: {past, future}`, holding uniform snapshots of the fields any undoable action can touch. The existing reducer becomes `baseReducer`; a thin `reducer` wrapper records a snapshot for the three undoable action types and handles `UNDO`/`REDO`. No `src/sim` change of any kind.

**Tech Stack:** React 18, `useReducer` + one context (`StoreProvider.jsx`), CSS Modules with design tokens, vitest + @testing-library/react, jsdom per-file via `// @vitest-environment jsdom`.

**Spec:** `docs/superpowers/specs/2026-08-25-tune-undo-redo-design.md`

## Global Constraints

- **Node 20 or 22 only.** Currently v22.23.2. Never run `npm run test:fingerprint:update`.
- **No `src/sim/` changes in this PR.** The behavioural fingerprint must stay untouched. If a task seems to need one, stop and escalate.
- **No engineering maths in `src/ui/`** (`CONTRIBUTING.md:27`). A history stack is state bookkeeping, not maths, so it belongs in `src/ui/state/`. PR 4b is where `tables.js` gains grid transforms.
- **No hard-coded colours.** Every colour resolves to a token; `tests/no-hardcoded-colours.test.js` enforces it. That test generates 2–3 cases per source file, so a raw test total is not a stable baseline — compare per-file.
- **Scope `[data-*]` selectors to a hashed class** (`.panel[data-open='true']`, never bare `[data-open]`). Repo convention.
- **`tests/ui/characterisation.test.jsx` must stay byte-identical.** It drives the dock's `+1` stepper, not the slider. If a change to it seems necessary, stop and escalate.
- **History depth is 50**, capped with `.slice(-HISTORY_LIMIT)`.
- **The reducer stays pure.** No `Date.now()`, no coalescing keys, no merge logic inside it.
- **Never `git stash`** in any form, never `git add -A`/`git add .`, never `git add node_modules`. ` D node_modules` in `git status` is a known pre-existing condition — leave it. Stage explicit paths only.
- Run tests as `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork <path>`.
- Full check suite before the PR: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/state/history.js` **(new)** | The snapshot data model alone: `HISTORY_LIMIT`, `snapshot()`, `restore()`. No React, no action types — importing `ACTIONS` here would make a cycle with `reducer.js`. |
| `src/ui/state/reducer.js` | Existing `reducer` renamed to `baseReducer`; new `reducer` wrapper records history and handles `UNDO`/`REDO`. Owns `labelFor()`, because that needs `ACTIONS` and `presetById`. |
| `src/ui/state/initialState.js` | Adds the `history` slice and its typedef. |
| `src/ui/state/StoreProvider.jsx` | Adds `useHistory()` beside the three existing slice hooks. |
| `src/ui/components/UndoControls.jsx` + `.module.css` **(new)** | The ↶ ↷ pair. Reads `history`, dispatches `UNDO`/`REDO`. |
| `src/ui/components/SelectionDock.jsx` | Slider becomes commit-on-release. |
| `src/ui/screens/tune/{Airflow,Spark,Fuel}Screen.jsx` + `.module.css` | Mount `UndoControls` in a `.gridHead` row beside the `Eyebrow`. |
| `src/ui/screens/build/EngineScreen.jsx` + `.module.css` | The post-preset/post-reset UNDO `Note`. |
| `src/ui/EcuLab.jsx` | The Cmd/Ctrl+Z key handler. |
| `src/ui/components/README.md` | Documents `UndoControls`. |

**Known duplication, accepted deliberately:** the `.gridHead` flex row is four lines of identical CSS in three screen stylesheets. A shared `GridHeader` component to avoid it would be more machinery than the problem deserves, and each screen's header already differs in icon and label. Do not extract it; do not flag it as an oversight.

## Blast radius — read before Task 1

Two existing tests pin the store's shape and **will fail** the moment `history` exists. Both updates are correct and expected, not workarounds:

1. `tests/ui/state/reducer.test.js:95` — `expect(Object.keys(s).sort()).toEqual(['build', 'session', 'tune'])`. Becomes four slices.
2. `tests/ui/state/reducer.test.js:489` — APPLY_PRESET's "changes exactly the 21 documented fields" test. Recording history makes `history.past` and `history.future` change too, so the expected list grows by exactly those two entries.

`makeSentinelState()` (`:37`) seeds every field of every slice with a sentinel *string*. That trick does not work for `history`, whose fields are arrays the reducer spreads — `[...'SENTINEL::history.past']` would silently produce a 24-element array of characters. Task 1 gives `history` a real empty structure instead.

Nothing else in the repo asserts the store's slice list.

---

### Task 1: The history slice, snapshot/restore, and UNDO/REDO in the reducer

**Files:**
- Create: `src/ui/state/history.js`
- Modify: `src/ui/state/initialState.js`
- Modify: `src/ui/state/reducer.js`
- Modify: `src/ui/state/StoreProvider.jsx`
- Test: `tests/ui/state/reducer.test.js`

**Interfaces:**
- Produces: `HISTORY_LIMIT: number` (50), `snapshot(state: StoreState): Snapshot`, `restore(state: StoreState, before: Snapshot): StoreState` from `src/ui/state/history.js`; `ACTIONS.UNDO`, `ACTIONS.REDO`; `useHistory(): [HistoryState, React.Dispatch<StoreAction>]` from `StoreProvider.jsx`.
- `HistoryState` is `{past: HistoryEntry[], future: HistoryEntry[]}`; `HistoryEntry` is `{label: string, before: Snapshot}`.
- Later tasks rely on: `useHistory`, `ACTIONS.UNDO`, `ACTIONS.REDO`, and the entry `label` strings `'VE edit'`, `'Spark edit'`, `'Fuel edit'`, `'Reset to stock'`, and `` `Preset · ${name}` ``.

- [ ] **Step 1: Create the snapshot module**

Create `src/ui/state/history.js`:

```js
/**
 * The undo stack's data model: what one snapshot contains, and how it goes back.
 *
 * Deliberately holds NO action types. `reducer.js` imports this, so importing
 * `ACTIONS` back from there would be a cycle — which is also why `labelFor()`
 * lives in the reducer rather than here.
 *
 * The snapshot is UNIFORM: it captures the union of every field any undoable
 * action can overwrite, not the subset a particular action happens to touch. One
 * shape means one restore path. A per-action shape would mean three, and a fourth
 * undoable action added later could produce a half-restored state that no test
 * thought to cover.
 */

/** @typedef {import('./initialState.js').StoreState} StoreState */
/** @typedef {{build: object, tune: object}} Snapshot */

/**
 * How many undo steps are kept. A snapshot is roughly 1 KB (144 table numbers plus
 * scalars), so the cap is not about memory — it is that an array which only ever
 * grows is a leak with a long fuse.
 */
export const HISTORY_LIMIT = 50;

/**
 * BUILD fields an undoable action can overwrite. APPLY_PRESET writes all thirteen;
 * RESET_TO_STOCK writes three; SET_TABLE writes one. The snapshot carries the union
 * so `restore` never has to know which action it is undoing.
 */
const BUILD_KEYS = [
  'engineConfig', 'mods', 'turboOn', 'boostCurve', 'turbineIdx', 'turbineCount',
  'compressorIdx', 'injIdx', 'ecuInjectorCc', 'octaneIdx', 'exhaustDiaIdx',
  'mafScalar', 'presetId',
];

/**
 * TUNE fields an undoable action can overwrite.
 *
 * `selection` is deliberately absent: it is a cursor, not calibration. Restoring it
 * would make undo move the player's highlight around, and the grid's dimensions never
 * change, so a selection is always still valid after a restore.
 */
const TUNE_KEYS = ['ve', 'timing', 'afr', 'tablesDirty'];

/**
 * Captures the undoable projection of a state tree.
 * @param {StoreState} state
 * @returns {Snapshot}
 */
export function snapshot(state) {
  /** @type {any} */
  const build = {};
  /** @type {any} */
  const tune = {};
  for (const key of BUILD_KEYS) build[key] = /** @type {any} */ (state.build)[key];
  for (const key of TUNE_KEYS) tune[key] = /** @type {any} */ (state.tune)[key];
  return { build, tune };
}

/**
 * Puts a snapshot back, leaving every field it does not carry alone — `session`
 * entirely, and `tune.selection`.
 * @param {StoreState} state
 * @param {Snapshot} before
 * @returns {StoreState}
 */
export function restore(state, before) {
  return {
    ...state,
    build: { ...state.build, ...before.build },
    tune: { ...state.tune, ...before.tune },
  };
}
```

- [ ] **Step 2: Add the slice to initial state**

In `src/ui/state/initialState.js`, add the typedef next to the other slice typedefs:

```js
/**
 * The undo stack. `past` is oldest-first, so the next thing UNDO reverses is the LAST
 * element; `future` is newest-first, so REDO takes element 0.
 *
 * Each entry holds the state BEFORE its action ran, and a `label` naming what would be
 * undone. The label is load-bearing twice: it gives the undo buttons a real
 * `aria-label` instead of a bare glyph, and it is how BUILD decides whether the top of
 * the stack is a preset load worth offering to reverse.
 *
 * @typedef {object} HistoryState
 * @property {{label: string, before: import('./history.js').Snapshot}[]} past
 * @property {{label: string, before: import('./history.js').Snapshot}[]} future
 */
```

Add to the `StoreState` typedef:

```js
 * @property {HistoryState} history
```

And in `makeInitialState()`'s returned object, after the `session` block:

```js
    history: { past: [], future: [] },
```

- [ ] **Step 3: Write the failing reducer tests**

In `tests/ui/state/reducer.test.js`, first fix the two shape assertions the new slice breaks.

At `:95`, change the slice list:

```js
  it('returns the four slices', () => {
    const s = makeInitialState();
    expect(Object.keys(s).sort()).toEqual(['build', 'history', 'session', 'tune']);
  });
```

In `makeSentinelState()` (`:37`), give `history` a real structure instead of sentinel strings — the reducer spreads `history.past`, and spreading a string yields its characters:

```js
  for (const slice of Object.keys(init)) {
    // `history` is structural, not scalar: the reducer spreads `past`, and
    // `[...'SENTINEL::history.past']` would silently become 24 single characters.
    // A real empty stack still starts unequal to anything a write produces, which is
    // all `changedFieldKeys` needs.
    if (slice === 'history') {
      state[slice] = { past: [], future: [] };
      continue;
    }
    const sliceState = /** @type {any} */ ({});
    for (const field of Object.keys(/** @type {any} */ (init)[slice])) {
      sliceState[field] = `SENTINEL::${slice}.${field}`;
    }
    state[slice] = sliceState;
  }
```

At `:489`, APPLY_PRESET now also writes history. Extend the expected set and the title:

```js
  it('changes exactly the 21 documented fields, plus the two history fields', () => {
```

and add to `expected`, after `'session.result', 'session.prevResult',`:

```js
      // APPLY_PRESET is undoable, so it records a snapshot in the same pass. These two
      // belong in the exact-write-surface contract like any other field it touches.
      'history.past', 'history.future',
```

Now append the new suites at the end of the file:

```js
describe('UNDO / REDO', () => {
  /** A state with one hand VE edit already applied. */
  const edited = () => reducer(
    makeInitialState(),
    { type: ACTIONS.SET_TABLE, table: 've', value: [[42]] },
  );

  it('records the state BEFORE an edit, not after', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.SET_TABLE, table: 've', value: [[42]] });
    expect(after.history.past).toHaveLength(1);
    expect(after.history.past[0].before.tune.ve).toBe(before.tune.ve);
    expect(after.history.past[0].label).toBe('VE edit');
  });

  it('puts the table back', () => {
    // One `start`, threaded through both dispatches, so this can assert reference
    // equality: restore must hand back the SAME array the snapshot captured, not a
    // recomputed one that merely looks equal. Two independent `makeInitialState()`
    // calls would defeat that — the function's own header documents that it returns a
    // fresh object graph every time, and `ve` is recomputed by `computeHardwareVE`.
    const start = makeInitialState();
    const edit = reducer(start, { type: ACTIONS.SET_TABLE, table: 've', value: [[42]] });
    const s = reducer(edit, { type: ACTIONS.UNDO });
    expect(s.tune.ve).toBe(start.tune.ve);
    expect(s.history.past).toHaveLength(0);
    expect(s.history.future).toHaveLength(1);
  });

  it('restores tablesDirty, not just the numbers', () => {
    // A history that carried only the table would leave the player's unsaved-work flag
    // stuck true after undoing their only edit.
    expect(edited().tune.tablesDirty).toBe(true);
    expect(reducer(edited(), { type: ACTIONS.UNDO }).tune.tablesDirty).toBe(false);
  });

  it('restores presetId, because SET_TABLE cleared it', () => {
    // The reason the snapshot is a projection of BOTH slices. SET_TABLE clears
    // presetId in the same pass it writes the table; undo has to put the label back or
    // the header goes on disowning a preset the player never actually left.
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const dirty = reducer(loaded, { type: ACTIONS.SET_TABLE, table: 'timing', value: [[9]] });
    expect(dirty.build.presetId).toBeNull();
    expect(reducer(dirty, { type: ACTIONS.UNDO }).build.presetId).toBe('n54');
  });

  it('restores the build fields APPLY_PRESET overwrote', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(after.build.turboOn).toBe(true);
    const undone = reducer(after, { type: ACTIONS.UNDO });
    expect(undone.build.turboOn).toBe(false);
    expect(undone.build.engineConfig).toBe(before.build.engineConfig);
    expect(undone.build.presetId).toBeNull();
  });

  it('labels a preset load with the preset name', () => {
    const after = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(after.history.past[0].label).toBe('Preset · BMW N54');
  });

  it('labels a reset', () => {
    const after = reducer(makeInitialState(), { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(after.history.past[0].label).toBe('Reset to stock');
  });

  it('redo puts the edit back', () => {
    const undone = reducer(edited(), { type: ACTIONS.UNDO });
    const redone = reducer(undone, { type: ACTIONS.REDO });
    expect(redone.tune.ve).toEqual([[42]]);
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toHaveLength(0);
  });

  it('a new edit clears the redo stack', () => {
    // Otherwise redo would jump the player onto a branch they had already left.
    const undone = reducer(edited(), { type: ACTIONS.UNDO });
    expect(undone.history.future).toHaveLength(1);
    const branched = reducer(undone, { type: ACTIONS.SET_TABLE, table: 've', value: [[7]] });
    expect(branched.history.future).toHaveLength(0);
  });

  it('caps the stack at 50 and drops the OLDEST entry', () => {
    let s = makeInitialState();
    for (let i = 0; i < 60; i += 1) {
      s = reducer(s, { type: ACTIONS.SET_TABLE, table: 've', value: [[i]] });
    }
    expect(s.history.past).toHaveLength(50);
    // Entry 0 must be the snapshot taken before edit #10 — i.e. holding edit #9's
    // value. Asserting the LENGTH alone would pass just as well for a cap that
    // discarded the newest entries, which is the opposite of what undo needs.
    expect(s.history.past[0].before.tune.ve).toEqual([[9]]);
  });

  it('undo and redo on an empty stack return the SAME object', () => {
    // Reference equality, not deep equality: React's useReducer bails out of the
    // re-render only when the reducer returns the identical object.
    const s = makeInitialState();
    expect(reducer(s, { type: ACTIONS.UNDO })).toBe(s);
    expect(reducer(s, { type: ACTIONS.REDO })).toBe(s);
  });

  it('does not record actions that are not undoable', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true });
    expect(s.history.past).toHaveLength(0);
  });

  it('does not restore dyno results', () => {
    // A deliberate asymmetry, spec'd: undo brings back hardware and calibration, but
    // re-showing a banked score beside a build that was just reverted would state
    // something false.
    const withResult = { ...makeInitialState() };
    withResult.session = { ...withResult.session, result: { peakHp: 400 } };
    const loaded = reducer(withResult, { type: ACTIONS.APPLY_PRESET, preset: N54_PRESET });
    expect(loaded.session.result).toBeNull();
    expect(reducer(loaded, { type: ACTIONS.UNDO }).session.result).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests and watch them fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/reducer.test.js`

Expected: the `UNDO / REDO` suite fails — `ACTIONS.UNDO` is `undefined`, so every dispatch hits the reducer's `default` case and returns state unchanged, and `s.history` is `undefined`. The `makeInitialState` and APPLY_PRESET shape tests should already pass once Step 2 landed.

- [ ] **Step 5: Wire the reducer**

In `src/ui/state/reducer.js`:

Add to the imports (`presetById` for the label, and the snapshot module):

```js
import { clamp, clone2D, DEFAULT_AFR, DEFAULT_MODS, DEFAULT_TIMING, liveStep, presetById } from '../../sim/index.js';

import { HISTORY_LIMIT, restore, snapshot } from './history.js';
```

Add to `ACTIONS`, after `LIVE_PATCH`:

```js
  UNDO: 'UNDO',
  REDO: 'REDO',
```

Rename the existing exported reducer — `export function reducer(state, action) {` becomes:

```js
/**
 * Every case except UNDO/REDO. Wrapped by `reducer` below, which is what callers use.
 */
function baseReducer(state, action) {
```

Then append, after `baseReducer`'s closing brace:

```js
/**
 * The three actions that destroy calibration the player cannot otherwise get back.
 *
 * Hardware writes are deliberately absent: every hardware control already displays its
 * own current value, so it is self-reversing, and undo must not become a time machine
 * over banked career progress.
 */
const UNDOABLE = new Set([ACTIONS.SET_TABLE, ACTIONS.APPLY_PRESET, ACTIONS.RESET_TO_STOCK]);

/**
 * Names what an undoable action did, for the undo button's `aria-label` and BUILD's
 * post-load offer. Lives here rather than in history.js because it needs `ACTIONS` and
 * the preset catalogue, and history.js must not import this module.
 * @param {any} action
 * @returns {string}
 */
function labelFor(action) {
  switch (action.type) {
    case ACTIONS.SET_TABLE:
      return { ve: 'VE edit', timing: 'Spark edit', afr: 'Fuel edit' }[action.table];
    case ACTIONS.APPLY_PRESET: {
      const preset = presetById(action.preset.presetId);
      return `Preset · ${preset ? preset.name : 'factory calibration'}`;
    }
    default:
      return 'Reset to stock';
  }
}

/**
 * The store's reducer: `baseReducer` plus the undo stack.
 *
 * Recording is a WRAPPER rather than a line inside each undoable case, so the three
 * existing cases stay exactly as they were and a fourth undoable action is one entry in
 * `UNDOABLE` rather than a fourth place to remember. It stays a pure function of
 * `(state, action)` — no clock, no coalescing keys, no merge logic. The dock's slider
 * commits once on release instead (see SelectionDock.jsx), which is what keeps a drag
 * from becoming eighteen undo steps without any of that machinery.
 *
 * @param {StoreState} state
 * @param {any} action
 * @returns {StoreState}
 */
export function reducer(state, action) {
  if (action.type === ACTIONS.UNDO) {
    const { past, future } = state.history;
    if (past.length === 0) return state;
    const entry = past[past.length - 1];
    return {
      ...restore(state, entry.before),
      history: {
        past: past.slice(0, -1),
        future: [{ label: entry.label, before: snapshot(state) }, ...future],
      },
    };
  }

  if (action.type === ACTIONS.REDO) {
    const { past, future } = state.history;
    if (future.length === 0) return state;
    const entry = future[0];
    return {
      ...restore(state, entry.before),
      history: {
        past: [...past, { label: entry.label, before: snapshot(state) }].slice(-HISTORY_LIMIT),
        future: future.slice(1),
      },
    };
  }

  const next = baseReducer(state, action);
  if (!UNDOABLE.has(action.type)) return next;
  return {
    ...next,
    history: {
      past: [...state.history.past, { label: labelFor(action), before: snapshot(state) }]
        .slice(-HISTORY_LIMIT),
      // A new edit abandons the redo branch: keeping it would let redo jump the player
      // onto a timeline they had already left.
      future: [],
    },
  };
}
```

- [ ] **Step 6: Add the `useHistory` hook**

In `src/ui/state/StoreProvider.jsx`, add the typedef beside the others:

```js
/** @typedef {import('./initialState.js').HistoryState} HistoryState */
```

and the hook after `useSession`:

```js
/**
 * The HISTORY slice: the undo and redo stacks.
 * @returns {[HistoryState, React.Dispatch<StoreAction>]}
 */
export function useHistory() {
  const [state, dispatch] = useStore();
  return [state.history, dispatch];
}
```

- [ ] **Step 7: Run the tests and watch them pass**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/reducer.test.js`
Expected: PASS, all suites.

Then run the whole suite — the store shape changed, so anything reading it is in scope:

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`
Expected: PASS. If anything outside `reducer.test.js` fails, report it rather than editing that test — the Blast Radius section says only two tests should have needed changes, so a third is a finding.

- [ ] **Step 8: Verify the cap test can actually fail**

A test that cannot fail is worse than no test. Temporarily change `.slice(-HISTORY_LIMIT)` in the `UNDOABLE` branch to `.slice(0, HISTORY_LIMIT)` (keep oldest, drop newest — the plausible wrong version).

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/state/reducer.test.js -t 'caps the stack'`
Expected: FAIL on the `past[0].before.tune.ve` assertion.

Revert the change and re-run to confirm PASS.

- [ ] **Step 9: Commit**

```bash
git add src/ui/state/history.js src/ui/state/reducer.js src/ui/state/initialState.js src/ui/state/StoreProvider.jsx tests/ui/state/reducer.test.js
git commit -m "Add an undo stack to the store"
```

---

### Task 2: The undo/redo buttons on TUNE

**Files:**
- Create: `src/ui/components/UndoControls.jsx`, `src/ui/components/UndoControls.module.css`
- Modify: `src/ui/screens/tune/AirflowScreen.jsx`, `SparkScreen.jsx`, `FuelScreen.jsx` and their three `.module.css` files
- Modify: `src/ui/components/README.md`
- Test: `tests/ui/undo-controls.test.jsx` (new)

**Interfaces:**
- Consumes: `useHistory()` and `ACTIONS.UNDO`/`ACTIONS.REDO` from Task 1; entry labels `'VE edit'`, `'Spark edit'`, `'Fuel edit'`.
- Produces: `<UndoControls />` — takes no props, reads the store itself.

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/undo-controls.test.jsx`:

```jsx
// @vitest-environment jsdom

/**
 * The undo/redo pair on TUNE's table screens.
 *
 * The load-bearing test here is the last one: it drives the REAL app through a preset
 * load, a table edit and a click on the real button, and asserts the header goes back
 * to claiming the preset. That fails for any implementation which restores the 48
 * numbers but forgets `presetId` — the exact defect a table-only history would ship.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { UndoControls } from '../../src/ui/components/UndoControls.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useTune } from '../../src/ui/state/StoreProvider.jsx';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;

afterEach(cleanup);

/** Dispatches one VE edit, so the undo stack is non-empty. */
function EditOnce() {
  const [, dispatch] = useTune();
  return (
    <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: [[42]] })}>
      EDIT
    </button>
  );
}

function mount() {
  return render(
    <StoreProvider>
      <UndoControls />
      <EditOnce />
    </StoreProvider>,
  );
}

const undoBtn = () => screen.getByRole('button', { name: /^(Undo|Nothing to undo)/ });
const redoBtn = () => screen.getByRole('button', { name: /^(Redo|Nothing to redo)/ });

describe('UndoControls', () => {
  it('starts with both buttons disabled', () => {
    mount();
    expect(/** @type {HTMLButtonElement} */ (undoBtn()).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(true);
  });

  it('names what it would undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(undoBtn().getAttribute('aria-label')).toBe('Undo VE edit');
  });

  it('enables redo only after an undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(true);
    fireEvent.click(undoBtn());
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(false);
    expect(redoBtn().getAttribute('aria-label')).toBe('Redo VE edit');
  });

  it('puts the preset label back when a table edit is undone', () => {
    // The whole point of a snapshot spanning both slices, driven through the real app.
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));

    const picker = /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
      .find((el) => el.querySelector('optgroup'));
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    // Loading over an untouched default asks for no confirmation, so the preset is on.
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/^\d\.\dL /);

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    const grid = within(screen.getByTestId('tuning-grid'));
    const cells = grid.getAllByRole('button')
      .filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent));
    fireEvent.click(cells[Math.floor(cells.length / 2)]);
    fireEvent.click(within(screen.getByTestId('selection-dock')).getByRole('button', { name: '+1' }));

    // The edit disowned the preset: the header falls back to the derived "3.0L I6".
    expect(screen.getByTestId('build-line').textContent).toMatch(/^\d\.\dL /);

    fireEvent.click(undoBtn());

    // ...and undo gives it back.
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/^\d\.\dL /);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx`
Expected: FAIL — `Failed to resolve import ".../UndoControls.jsx"`.

- [ ] **Step 3: Write the component**

Create `src/ui/components/UndoControls.jsx`:

```jsx
/**
 * The undo/redo pair for TUNE's calibration tables.
 *
 * Chrome only: it reads the two stack lengths and dispatches. What is undoable, and
 * what a snapshot contains, belongs to the reducer — see `src/ui/state/history.js`.
 *
 * Each button takes its accessible name from the entry it would reverse ("Undo VE
 * edit"), so the control is not a bare glyph to a screen reader, and the disabled
 * state carries its own reason ("Nothing to undo") rather than going silent.
 *
 * `React.memo` would NOT help here and is deliberately absent. The store is a single
 * context, so every consumer re-renders on every dispatch — including LIVE_STEP at
 * 20 Hz — regardless of the slice it reads (see AppShell.jsx, "THE 20 Hz PROBLEM").
 * memo only blocks re-renders driven by a parent's props. Two buttons and two string
 * reads is cheap; the fix for the 20 Hz problem is splitting the context, not
 * memoising its consumers.
 */

import { Redo2, Undo2 } from 'lucide-react';
import React from 'react';

import { ACTIONS } from '../state/reducer.js';
import { useHistory } from '../state/StoreProvider.jsx';

import styles from './UndoControls.module.css';

/** @returns {React.ReactElement} */
export function UndoControls() {
  const [history, dispatch] = useHistory();
  const { past, future } = history;
  const undoLabel = past.length ? `Undo ${past[past.length - 1].label}` : 'Nothing to undo';
  const redoLabel = future.length ? `Redo ${future[0].label}` : 'Nothing to redo';
  return (
    <div className={styles.row}>
      <button
        type="button" className={styles.btn} disabled={past.length === 0}
        aria-label={undoLabel} title={undoLabel}
        onClick={() => dispatch({ type: ACTIONS.UNDO })}
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button" className={styles.btn} disabled={future.length === 0}
        aria-label={redoLabel} title={redoLabel}
        onClick={() => dispatch({ type: ACTIONS.REDO })}
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
}
```

Create `src/ui/components/UndoControls.module.css`:

```css
.row {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel2);
  color: var(--ink2);
  cursor: pointer;
}

.btn:hover:not(:disabled) {
  border-color: var(--line-hi);
  color: var(--ink);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
}
```

Confirm `--line-hi` is the real token name before using it: `grep -n 'line-hi\|lineHi' src/ui/tokens.css`. If the CSS custom property is spelled differently there, use the spelling `tokens.css` actually defines.

- [ ] **Step 4: Mount it in the three screens**

In each of `AirflowScreen.jsx`, `SparkScreen.jsx` and `FuelScreen.jsx`, add the import:

```js
import { UndoControls } from '../../components/UndoControls.jsx';
```

and wrap the existing `<Eyebrow …>` line in a header row. For `SparkScreen.jsx` the `<Eyebrow icon={Zap}>Ignition Timing</Eyebrow>` line becomes:

```jsx
          <div className={styles.gridHead}>
            <Eyebrow icon={Zap}>Ignition Timing</Eyebrow>
            <UndoControls />
          </div>
```

Do the same in the other two, keeping each screen's own icon and label text exactly as it is now — do not retype the labels from memory, wrap the line that is already there.

Add to all three `.module.css` files:

```css
.gridHead {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
}
```

- [ ] **Step 5: Document it**

Add to `src/ui/components/README.md`, after the `TuneAdvisory` paragraph:

```markdown
`UndoControls` is the ordinary shared-component reason again: AIRFLOW, SPARK and FUEL
each mount one above their grid. It takes no props and reads `history` from the store
itself, because the stacks are global — undoing a spark edit from the FUEL screen is
correct behaviour, not a bug. What is undoable lives in `src/ui/state/reducer.js`
(`UNDOABLE`); what a snapshot carries lives in `src/ui/state/history.js`.
```

- [ ] **Step 6: Run the tests**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx`
Expected: PASS, 4 tests.

Then: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/`
Expected: PASS. `button-call-sites.test.jsx` sweeps every rendered `.button` class — `UndoControls` uses its own class, not `Button`, so it should not appear there. If that test fails, report it rather than editing it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/UndoControls.jsx src/ui/components/UndoControls.module.css src/ui/components/README.md src/ui/screens/tune tests/ui/undo-controls.test.jsx
git commit -m "Put undo and redo above the tuning grid"
```

---

### Task 3: Commit the slider on release

**Files:**
- Modify: `src/ui/components/SelectionDock.jsx`
- Test: `tests/ui/undo-controls.test.jsx` (append one suite)

**Interfaces:**
- Consumes: nothing new. `SelectionDock`'s props are unchanged.
- Produces: no new exports. The behaviour change is that dragging the slider dispatches `SET_TABLE` once, on release, instead of on every intermediate value.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/undo-controls.test.jsx`:

```jsx
describe('the dock slider commits once, on release', () => {
  /** Reports the undo depth into the DOM so a test can read it. */
  function Depth() {
    const [history] = useHistory();
    return <output data-testid="depth">{history.past.length}</output>;
  }

  it('records ONE history entry for a drag, not one per intermediate value', () => {
    // React maps onChange on a range input to the `input` event, so a real drag fires
    // it continuously — roughly 18 times from 12 to 30 degrees. Recorded naively, undo
    // would walk back one slider pixel at a time.
    //
    // Asserting the DEPTH is the point. Asserting only the final table value would
    // pass just as well with eighteen entries recorded.
    render(
      <StoreProvider>
        <Depth />
        <EcuLabTuneHarness />
      </StoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'SELECT' }));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '20' } });
    fireEvent.change(slider, { target: { value: '25' } });
    fireEvent.change(slider, { target: { value: '30' } });

    // Mid-drag: nothing committed yet.
    expect(screen.getByTestId('depth').textContent).toBe('0');

    fireEvent.pointerUp(slider);

    expect(screen.getByTestId('depth').textContent).toBe('1');
    // ...and it must commit the LAST draft, not the first. Depth alone cannot tell
    // those apart: an implementation that commits the value it saw when the drag
    // started records exactly one entry too, and would silently write 20 where the
    // player released at 30.
    expect(screen.getByTestId('cell').textContent).toBe('30');
  });

  it('commits on key release too, so the slider is usable from the keyboard', () => {
    // A keyboard user arrows the slider instead of dragging it. If only onPointerUp
    // commits, their edit is held in the draft forever and never reaches the table —
    // the control looks like it works and silently discards every change.
    render(
      <StoreProvider>
        <Depth />
        <EcuLabTuneHarness />
      </StoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'SELECT' }));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '22' } });
    expect(screen.getByTestId('depth').textContent).toBe('0');

    fireEvent.keyUp(slider, { key: 'ArrowRight' });

    expect(screen.getByTestId('depth').textContent).toBe('1');
    expect(screen.getByTestId('cell').textContent).toBe('22');
  });

  it('drops an uncommitted draft when the selection moves to another cell', () => {
    // The draft is per-cell. Without the reset, selecting a new cell keeps showing the
    // previous cell's abandoned value, and the next release would write that stale
    // number into a cell the player never dragged.
    render(
      <StoreProvider>
        <Depth />
        <EcuLabTuneHarness />
      </StoreProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'SELECT' }));
    const slider = screen.getByRole('slider');
    const before = screen.getByTestId('cell').textContent;
    fireEvent.change(slider, { target: { value: '40' } });
    expect(screen.getByRole('slider').value).toBe('40');

    // Move to a different cell without releasing: the abandoned 40 must not follow.
    fireEvent.click(screen.getByRole('button', { name: 'SELECT OTHER' }));

    expect(screen.getByRole('slider').value).not.toBe('40');
    // Nothing was ever committed, and the first cell still holds its original value.
    expect(screen.getByTestId('depth').textContent).toBe('0');
    expect(screen.getByTestId('cell').textContent).toBe(before);
  });
});
```

and add the harness beside the other helpers near the top of the file:

```jsx
/** A bare SelectionDock over the store's timing table, with a cell pre-selectable. */
function EcuLabTuneHarness() {
  const [tune, dispatch] = useTune();
  return (
    <>
      <button onClick={() => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: { type: 'cell', row: 0, col: 0 } })}>
        SELECT
      </button>
      <button onClick={() => dispatch({ type: ACTIONS.SET_TUNE_FIELD, field: 'selection', value: { type: 'cell', row: 1, col: 1 } })}>
        SELECT OTHER
      </button>
      {/* The cell the first SELECT targets, so a test can assert WHICH value was
          committed rather than only how many entries were recorded. */}
      <output data-testid="cell">{tune.timing[0][0]}</output>
      <SelectionDock
        data={tune.timing}
        setData={(value) => dispatch({ type: ACTIONS.SET_TABLE, table: 'timing', value })}
        selection={tune.selection} min={-5} max={50} decimals={0} unit="°"
        onClose={() => {}} kind="timing"
      />
    </>
  );
}
```

with the imports it needs added to the file's import block:

```js
import { SelectionDock } from '../../src/ui/components/SelectionDock.jsx';
import { StoreProvider, useHistory, useTune } from '../../src/ui/state/StoreProvider.jsx';
```

(replacing the earlier `StoreProvider, useTune` import line — one import statement per module.)

- [ ] **Step 2: Run and watch it fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx -t 'commits once'`
Expected: FAIL — depth reads `3` after the three `change` events and before any `pointerUp`.

- [ ] **Step 3: Make the slider hold a draft**

In `src/ui/components/SelectionDock.jsx`:

**Hooks must be declared before the early return.** The function currently opens with `if (!selection) return null;`. A `useState` placed after that would run conditionally and break the Rules of Hooks — React would throw on the render where a selection first appears. Restructure the top of the component to:

```jsx
export function SelectionDock({ data, setData, selection, min, max, decimals, unit, onClose, kind }) {
  // The slider's in-flight value. React maps onChange on a range input to the `input`
  // event, so a drag fires it continuously; committing each one would turn a single
  // drag into eighteen undo steps. The draft holds the value while the finger is down
  // and commits exactly once on release.
  const [draft, setDraft] = React.useState(/** @type {number|null} */ (null));

  // A new selection is a new cell: drop any draft left over from the last one, or the
  // slider would open showing the previous cell's in-flight value.
  const selKey = selection
    ? `${selection.type}:${selection.row ?? ''}:${selection.col ?? ''}`
    : '';
  React.useEffect(() => { setDraft(null); }, [selKey]);

  if (!selection) return null;
  let current;
```

Leave the rest of the `current`/`apply`/`setAbs` block exactly as it is, then add below `setAbs`:

```jsx
  // What the slider and the big readout show: the finger's position while dragging,
  // the table's committed value otherwise.
  const shown = draft === null ? current : draft;
  const commitDraft = () => {
    if (draft === null) return;
    setAbs(draft);
    setDraft(null);
  };
```

Change the readout to use `shown` — the line currently reading

```jsx
            {decimals ? current.toFixed(decimals) : Math.round(current)}<span style={{ fontSize: 12, color: T.ink2, marginLeft: 4 }}>{unit}</span>
```

becomes

```jsx
            {decimals ? shown.toFixed(decimals) : Math.round(shown)}<span style={{ fontSize: 12, color: T.ink2, marginLeft: 4 }}>{unit}</span>
```

and replace the slider (`SelectionDock.jsx:127`) with:

```jsx
      <input
        type="range" min={min} max={max} step={smallStep} value={shown}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={commitDraft}
        onKeyUp={commitDraft}
        style={{ width: '100%', accentColor: T.acc }}
      />
```

Leave `cellReference` and the four stepper buttons untouched: a stepper click is already one discrete edit, so it stays one history entry.

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx`
Expected: PASS, 5 tests.

Then: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork`
Expected: PASS. `characterisation.test.jsx` must still pass **unmodified** — it drives the `+1` stepper, not the slider.

- [ ] **Step 5: Verify the test can fail**

Temporarily change `onChange={(e) => setDraft(Number(e.target.value))}` back to `onChange={(e) => setAbs(Number(e.target.value))}`.

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx -t 'commits once'`
Expected: FAIL at the mid-drag assertion, depth `3` instead of `0`.

Revert and re-run to confirm PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/components/SelectionDock.jsx tests/ui/undo-controls.test.jsx
git commit -m "Commit the dock slider on release, not on every drag frame"
```

---

### Task 4: The undo offer on BUILD

**Files:**
- Modify: `src/ui/screens/build/EngineScreen.jsx`, `src/ui/screens/build/EngineScreen.module.css`
- Test: `tests/ui/build-screens.test.jsx` (append one suite)

**Interfaces:**
- Consumes: `useHistory()`, `ACTIONS.UNDO`, and the label prefixes `'Preset · '` and `'Reset to stock'` from Task 1.
- Produces: nothing other tasks depend on.

Both `APPLY_PRESET` (`EngineScreen.jsx:81`) and `RESET_TO_STOCK` (`EngineScreen.jsx:255`, via the `onResetToStock` prop) fire from this one screen, so this is a single surface, not two.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/build-screens.test.jsx`, inside the existing `describe('EngineScreen', …)` block if there is one, otherwise as a new top-level suite:

```jsx
describe('EngineScreen — the undo offer', () => {
  /** The prop bundle this file already uses for EngineScreen, at :47. */
  const props = {
    engineDerived, activePreset: null, veAdvice, onResetToStock: noop,
  };

  it('offers nothing before anything destructive has happened', () => {
    mount(<EngineScreen active onToggle={noop} {...props} />);
    expect(screen.queryByRole('button', { name: /^Undo / })).toBeNull();
  });

  it('offers to undo a preset load, naming the preset', () => {
    mount(<EngineScreen active onToggle={noop} {...props} />);
    const picker = /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
      .find((el) => el.querySelector('optgroup'));
    const was = picker.value;
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    expect(picker.value).toBe(target);

    fireEvent.click(screen.getByRole('button', { name: /^Undo Preset · / }));

    // The offer going away is NOT sufficient evidence: a button that dispatches
    // nothing and merely hides the Note passes that assertion too. Assert the preset
    // load was actually reversed.
    expect(picker.value).toBe(was);
    // Undone: the offer goes with it, because the top of the stack is gone.
    expect(screen.queryByRole('button', { name: /^Undo Preset · / })).toBeNull();
  });

  it('offers to undo a reset to stock, naming it', () => {
    // The Note appears for a preset load OR a reset — both are the destructive acts
    // this offer exists for. Testing only the preset case would let an implementation
    // that matches on `Preset · ` alone pass while leaving the reset, which throws
    // away EVERYTHING, with no offer at all.
    //
    // `onResetToStock` is a PROP, so the shared `props` object's `noop` would dispatch
    // nothing and this test would pass without a reset ever happening. Wire a real one
    // the way EcuLab.jsx does. `ve` is supplied by the caller, not the reducer — the
    // current table is fine here, since what is under test is the history entry, not
    // which numbers a reset computes.
    function WithRealReset() {
      const [tune, dispatch] = useTune();
      return (
        <EngineScreen
          active onToggle={noop} {...props}
          onResetToStock={() => dispatch({ type: ACTIONS.RESET_TO_STOCK, ve: tune.ve })}
        />
      );
    }
    mount(<WithRealReset />);
    const picker = /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
      .find((el) => el.querySelector('optgroup'));
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    expect(picker.value).toBe(target);

    fireEvent.click(screen.getByRole('button', { name: /^RESET TO STOCK$/i }));
    // The reset cleared presetId, so the picker no longer names the preset.
    expect(picker.value).not.toBe(target);

    fireEvent.click(screen.getByRole('button', { name: 'Undo Reset to stock' }));

    // The reset is reversed, so the preset it wiped is selected again.
    expect(picker.value).toBe(target);
  });

  it('withdraws the offer once a later edit sits on top of the preset load', () => {
    // The offer reads the TOP of the stack — `past[past.length - 1]`. Every other test
    // here creates at most ONE entry before looking, so `past[0]` would satisfy all of
    // them while reversing the wrong thing. This is the discriminator: after a table
    // edit lands on top, the top is a 'VE edit', the button would no longer undo the
    // preset load, and offering it would be a lie about what the click does.
    function WithTableEdit() {
      const [tune, dispatch] = useTune();
      return (
        <>
          <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: tune.ve })}>
            EDIT VE
          </button>
          <EngineScreen active onToggle={noop} {...props} />
        </>
      );
    }
    mount(<WithTableEdit />);
    const picker = /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
      .find((el) => el.querySelector('optgroup'));
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    // The offer is up, so its disappearance below cannot be a false negative.
    expect(screen.getByRole('button', { name: /^Undo Preset · / })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'EDIT VE' }));

    expect(screen.queryByRole('button', { name: /^Undo / })).toBeNull();
  });

  it('does not offer undo for a plain hardware change', () => {
    // Hardware writes are not undoable, so an offer here would be a lie about what the
    // button does. "Block Material" is a Seg on this screen (`EngineScreen.jsx:242`)
    // that dispatches SET_ENGINE_CONFIG_PATCH — a hardware write, not a calibration one.
    mount(<EngineScreen active onToggle={noop} {...props} />);
    const materials = within(screen.getByRole('group', { name: 'Block Material' }));
    fireEvent.click(materials.getByRole('button', { name: 'Cast Iron' }));
    expect(screen.queryByRole('button', { name: /^Undo / })).toBeNull();
  });
});
```

This reuses the file's existing `mount` (`:36`), `noop` (`:40`), `engineDerived` (`:41`) and `veAdvice` (`:42`) — do not define a second set. Add `within` to the `@testing-library/react` import if it is not there already, and add `useTune` to the existing `StoreProvider.jsx` import plus an `ACTIONS` import from `../../src/ui/state/reducer.js` — the reset test needs both. `MATERIAL_OPTS` is `['Cast Iron', 'Aluminum']` (`src/sim/hardware.js:45`) and the default block is `Aluminum`, so clicking `Cast Iron` is a real change rather than a no-op the reducer would skip.

- [ ] **Step 2: Run and watch it fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/build-screens.test.jsx -t 'undo offer'`
Expected: FAIL — no such button.

- [ ] **Step 3: Add the offer**

In `src/ui/screens/build/EngineScreen.jsx`, add the imports:

```js
import { useHistory } from '../../state/StoreProvider.jsx';
```

(`Note` and `Button` are likely imported already — check before adding a duplicate import line.)

Inside the component, beside the existing `useBuild()` call:

```js
  const [history, dispatch] = useHistory();
  // Only the two acts that replace the whole calibration get an offer here. A table
  // edit is undoable too, but its undo lives above the grid on TUNE, where the edit
  // happened — an offer on BUILD for something the player did on another tab would be
  // a control with no visible cause.
  const top = history.past[history.past.length - 1];
  const undoable = top && (top.label.startsWith('Preset · ') || top.label === 'Reset to stock');
```

and render it immediately after the `{presetPrompt && (…)}` block:

```jsx
      {undoable && (
        <Note tone="warn">
          <span className={styles.undoRow}>
            <span>{top.label} replaced your VE, spark and fuel tables.</span>
            <Button
              variant="quiet" size="sm"
              aria-label={`Undo ${top.label}`}
              onClick={() => dispatch({ type: ACTIONS.UNDO })}
            >
              UNDO
            </Button>
          </span>
        </Note>
      )}
```

Add to `src/ui/screens/build/EngineScreen.module.css`:

```css
.undoRow {
  display: flex;
  align-items: center;
  gap: var(--sp-sm);
  justify-content: space-between;
}
```

Check `Note`'s props before using `tone="warn"` — read `src/ui/primitives/Note.jsx` and use whatever tone values it actually accepts.

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/build-screens.test.jsx`
Expected: PASS.

Then: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/`
Expected: PASS. `button-call-sites.test.jsx` sweeps `Button` call sites and this adds one — if it reports a new unguarded call site, fix the call site, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens/build/EngineScreen.jsx src/ui/screens/build/EngineScreen.module.css tests/ui/build-screens.test.jsx
git commit -m "Offer undo where a preset load replaced the tune"
```

---

### Task 5: Cmd/Ctrl+Z

**Files:**
- Modify: `src/ui/EcuLab.jsx`
- Test: `tests/ui/undo-controls.test.jsx` (append one suite)

**Interfaces:**
- Consumes: `ACTIONS.UNDO`, `ACTIONS.REDO`.
- Produces: nothing.

The handler goes in `EcuLab.jsx`, not `AppShell.jsx`. The shell's file header states it owns chrome only and "never dispatches to the store directly"; a global key handler is app behaviour. `EcuLab.jsx` already holds five `useEffect`s — add a sixth beside them.

- [ ] **Step 1: Write the failing test**

Append to `tests/ui/undo-controls.test.jsx`:

```jsx
describe('keyboard shortcuts', () => {
  function launchWithEdit() {
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    const grid = within(screen.getByTestId('tuning-grid'));
    const cells = grid.getAllByRole('button')
      .filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent));
    fireEvent.click(cells[0]);
    const dock = within(screen.getByTestId('selection-dock'));
    fireEvent.click(dock.getByRole('button', { name: '+1' }));
    return cells[0].textContent;
  }

  it('undoes on Cmd+Z and redoes on Cmd+Shift+Z', () => {
    const before = launchWithEdit();
    const cell = () => within(screen.getByTestId('tuning-grid'))
      .getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent))[0];
    const edited = cell().textContent;
    expect(edited).not.toBe(before);

    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(cell().textContent).toBe(before);

    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(cell().textContent).toBe(edited);
  });

  it('ignores the shortcut while focus is in a text field', () => {
    // Otherwise the app would steal undo from the field the player is typing in.
    launchWithEdit();
    const cell = () => within(screen.getByTestId('tuning-grid'))
      .getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent))[0];
    const edited = cell().textContent;

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'z', metaKey: true });
    expect(cell().textContent).toBe(edited);
    input.remove();
  });

  it('ignores a bare z with no modifier', () => {
    launchWithEdit();
    const cell = () => within(screen.getByTestId('tuning-grid'))
      .getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent))[0];
    const edited = cell().textContent;
    fireEvent.keyDown(window, { key: 'z' });
    expect(cell().textContent).toBe(edited);
  });

  it('redoes on Ctrl+Y, the Windows spelling', () => {
    // The handler accepts 'y' as well as shift+z. Nothing else asserts it, so the
    // `key !== 'y'` half of the guard could be deleted and every other test here would
    // still pass — leaving Ctrl+Y silently dead for every Windows player.
    const before = launchWithEdit();
    const cell = () => within(screen.getByTestId('tuning-grid'))
      .getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent))[0];
    const edited = cell().textContent;

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(cell().textContent).toBe(before);

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(cell().textContent).toBe(edited);
  });

  it('ignores the shortcut while focus is in a select or a contenteditable', () => {
    // The INPUT case above is the only guard any other test exercises, so the SELECT
    // and isContentEditable halves could both be dropped with the suite still green.
    // SELECT is not hypothetical here: BUILD's preset picker is one, and stealing
    // Cmd+Z from an open picker takes the browser's own behaviour away from it.
    launchWithEdit();
    const cell = () => within(screen.getByTestId('tuning-grid'))
      .getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent))[0];
    const edited = cell().textContent;

    const select = document.createElement('select');
    document.body.appendChild(select);
    fireEvent.keyDown(select, { key: 'z', metaKey: true });
    expect(cell().textContent).toBe(edited);
    select.remove();

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    document.body.appendChild(editable);
    fireEvent.keyDown(editable, { key: 'z', metaKey: true });
    expect(cell().textContent).toBe(edited);
    editable.remove();
  });
});
```

Note on the contenteditable case: jsdom does not implement `isContentEditable`, so
setting `contentEditable = 'true'` leaves the property `undefined` and that assertion
would pass for the wrong reason. Define it on the element explicitly so the guard is
actually exercised:

```jsx
Object.defineProperty(editable, 'isContentEditable', { value: true });
```

Add that line immediately after `editable.contentEditable = 'true';`. Verify it matters
by deleting the `|| (el && el.isContentEditable)` clause from the handler and confirming
this test fails.

- [ ] **Step 2: Run and watch it fail**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx -t 'keyboard shortcuts'`
Expected: FAIL — the cell keeps its edited value after Cmd+Z.

- [ ] **Step 3: Add the handler**

In `src/ui/EcuLab.jsx`, beside the other `useEffect`s:

```jsx
  // Cmd/Ctrl+Z and Cmd+Shift+Z / Ctrl+Y. This lives here rather than in AppShell,
  // whose header is explicit that the shell owns chrome only and never dispatches to
  // the store — a global key handler is app behaviour, not chrome.
  //
  // PR 4b's arrow-key tuning will need this same seam.
  useEffect(() => {
    /** @param {KeyboardEvent} e */
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      // Never steal undo from a field the player is typing in.
      const el = /** @type {HTMLElement|null} */ (e.target);
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
      e.preventDefault();
      const redo = key === 'y' || e.shiftKey;
      dispatch({ type: redo ? ACTIONS.REDO : ACTIONS.UNDO });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);
```

- [ ] **Step 4: Run the tests**

Run: `./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork tests/ui/undo-controls.test.jsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full check suite**

```bash
./node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork
npm run lint
npm run typecheck
npm run build
```

Expected: all four clean. `npm run lint` must report **zero** warnings as well as zero errors — issue #26 records that hook-dependency warnings pass CI silently, and this task adds a hook with a dependency array.

- [ ] **Step 6: Commit**

```bash
git add src/ui/EcuLab.jsx tests/ui/undo-controls.test.jsx
git commit -m "Bind undo and redo to the keyboard"
```

---

## Self-Review

**Spec coverage.** Every section maps to a task: `history` slice and uniform snapshot → Task 1; the 50 cap → Task 1 Step 3; "undo does not restore dyno results" → Task 1's `does not restore dyno results` test; reducer purity → Task 1 Step 5's wrapper; commit-on-release → Task 3; `UndoControls` → Task 2; BUILD's offer → Task 4; keyboard → Task 5; the load-bearing preset-label test → Task 2 Step 1; `characterisation.test.jsx` byte-identical → asserted in Task 3 Step 4 and the Global Constraints.

**Type consistency.** `snapshot`/`restore`/`HISTORY_LIMIT` are defined in Task 1 and used by exactly that spelling in Task 1 Step 5. `useHistory` is defined in Task 1 Step 6 and consumed in Tasks 2 and 4. The entry shape `{label, before}` is written in Task 1 and read in Tasks 2 and 4. Labels `'VE edit'`/`'Spark edit'`/`'Fuel edit'`/`'Reset to stock'`/`` `Preset · ${name}` `` are produced by `labelFor` in Task 1 and matched in Tasks 2 and 4.

**Known soft spots, flagged rather than hidden:**

- Task 4's test reuses helpers from `build-screens.test.jsx` that this plan has not read in full. The step says to read them first and adapt rather than invent — if the prop bundle or the turbo switch is not where the plan assumes, that is a deviation to report, not a blocker.
- `Note`'s accepted `tone` values and the `--line-hi` custom-property spelling are both verify-before-use, called out inline.
- No test in this repo can see a colour: vitest applies no CSS. The three `.gridHead` blocks and `UndoControls.module.css` are unverifiable by the suite, and nobody will have opened this in a browser. Say so in the PR.
