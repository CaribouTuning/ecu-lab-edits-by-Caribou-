# State Extraction (PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 34 pieces of domain state out of `src/ui/EcuLab.jsx` into a tested store, without changing a single observable behaviour — so PR 3 can split the component into screens.

**Architecture:** One root reducer over three slices (`build`, `tune`, `session`), exposed through three hooks — `useBuild()`, `useTune()`, `useSession()` — so consumers see the three-way split the design doc specifies. The render stays monolithic; only state moves.

**Tech Stack:** React 18 `useReducer` + context, Vitest, `@testing-library/react`, JSDoc types checked by `tsc --checkJs`. No new dependencies.

## Global Constraints

- **Node 20 or 22 only — never 26.** `.nvmrc` pins 22. Newer V8 shifts float results and invalidates the fingerprint hash.
- **`tests/fingerprint.test.js` must stay green and must NOT be regenerated.** No task here touches physics. Never run `npm run test:fingerprint:update`.
- **No changes to `src/sim/`.**
- **No new dependencies**, of any kind.
- **No observable behaviour change.** This is a refactor. If a characterisation test needs editing to pass, the refactor is wrong — not the test.
- Test files import assertions explicitly from `vitest` — there are no globals, and no setup file, so component tests need `afterEach(cleanup)`.
- Under `@vitest-environment jsdom` the global `URL` is jsdom's, which `fs.readFileSync` rejects. Use `import { URL as NodeURL } from 'node:url'` for source-text assertions.
- `no-undef` and `no-unused-vars` are active in ESLint.
- `git status` permanently shows ` D node_modules` — a tracked self-referential symlink replaced by a real directory. **Never stage it.** Always `git add` explicit paths.
- macOS: BSD `sed` has no `\b`.
- Capture exit codes on the line **after** the command, never after a pipe.
- Branch is `feat/58-state-contexts`. Never commit to `main`.
- Every commit message ends with the repo's `Co-Authored-By:` and `Claude-Session:` trailers.

## Why one reducer and not three contexts

The design doc says "three contexts". Three *hooks* is what consumers get, and that part is unchanged. Internally this is one reducer, because the operations that matter cross every boundary:

`applyEnginePreset` currently makes **21 sequential `setState` calls** spanning hardware, calibration tables and run results. Its own comment warns that routing its writes through the invalidating setters "would make that order-dependent". `resetToStock` makes six writes and documents that "the last call pins `tablesDirty` back to false". `withTableEdit` writes a **tune** table, then clears `presetId` (**build**), then sets `tablesDirty` (**tune**).

Three independent contexts would turn each of those into cross-context choreography, preserving the ordering hazards and adding provider-nesting rules to remember. A reducer computes the next state in one pass, so `APPLY_PRESET` becomes atomic and the hazard disappears rather than being documented.

It also makes PR 4's undo natural: one ordered action log instead of three.

## What is deliberately NOT extracted

Seven pieces of **view** state (six in `EcuLab`, one in `ExpandableInfo`) stay as local `useState` in `EcuLab.jsx`:

`appView`, `tab`, `tuneView`, `dynoView`, `dashSection`, `buildSection`, and `ExpandableInfo`'s local `open`.

Every one of those becomes **route** state in PR 3 when hash routing lands. Extracting them now is work PR 3 would immediately undo. `journeyStep` is not view state — it is onboarding progress that must survive navigation — so it goes in `session`.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/state/initialState.js` | The three slices' starting values, and the defaults they derive from |
| `src/ui/state/reducer.js` | The root reducer and its action types |
| `src/ui/state/StoreProvider.jsx` | The provider plus `useBuild`/`useTune`/`useSession` hooks |
| `tests/ui/characterisation.test.jsx` | Behavioural tests written **before** any state moves |
| `tests/ui/state/reducer.test.js` | Pure reducer tests, no DOM |

## Slice membership

**build** (15): `engineConfig`, `mods`, `turboOn`, `boostCurve`, `octaneIdx`, `injIdx`, `mafScalar`, `turbineIdx`, `turbineCount`, `compressorIdx`, `exhaustDiaIdx`, `ecuInjectorCc`, `presetId`, `presetPrompt`, `boostSel`

**tune** (5): `ve`, `timing`, `afr`, `tablesDirty`, `selection`

**session** (14): `running`, `result`, `prevResult`, `revealCount`, `bestScore`, `totalScore`, `pullCount`, `health`, `histogram`, `live`, `throttleInput`, `loadKpa`, `soundOn`, `journeyStep`

---

### Task 1: Pin the behaviour before moving anything

**Files:**
- Create: `tests/ui/characterisation.test.jsx`

**Interfaces:**
- Consumes: `EcuLab` default export from `src/ui/EcuLab.jsx`, unchanged.
- Produces: nothing importable. Produces the safety net every later task depends on.

This task exists because the 408 existing tests cover physics, tokens and primitives — **almost nothing exercises `EcuLab`'s behaviour.** A mis-wired setter in Task 4 would compile, typecheck, build and pass CI while silently breaking the app. These tests are the only thing that will notice.

Write them against the CURRENT code. They must pass before you change anything.

- [ ] **Step 1: Read the flows before testing them**

Open `src/ui/EcuLab.jsx` and find how the app reaches each screen. Note in particular: the start screen dispatches on `appView`, the preset picker uses a `<select>`, and the overwrite-confirmation prompt keys off `hasTuningWork()`. Do not guess at the DOM — read it.

- [ ] **Step 2: Write the characterisation tests**

Create `tests/ui/characterisation.test.jsx`:

```jsx
// @vitest-environment jsdom

/**
 * Characterisation tests: what the app DOES today, pinned before its state moves.
 *
 * PR 2 is a pure refactor — 34 pieces of state leave EcuLab.jsx for a store, and by
 * definition nothing observable should change. The problem is that a refactor with no
 * behavioural tests is unverifiable: a setter wired to the wrong slice still compiles,
 * still typechecks, still builds, and still passes 408 tests about physics and buttons.
 *
 * These do not describe what the app SHOULD do. They describe what it does now, so the
 * refactor has something to preserve. If one of these fails after the extraction, the
 * extraction is wrong — do not edit the test to match the new behaviour.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';

afterEach(cleanup);

/** Renders the app and clicks past the start screen into the build tab. */
function launch() {
  const view = render(<EcuLab />);
  fireEvent.click(screen.getByRole('button', { name: 'START' }));
  return view;
}

describe('entry', () => {
  it('opens on the start screen', () => {
    render(<EcuLab />);
    expect(screen.getByRole('button', { name: 'START' })).toBeTruthy();
  });

  it('enters the app on START and lands on BUILD', () => {
    launch();
    expect(screen.getByRole('button', { name: /BUILD/ })).toBeTruthy();
  });

  it('opens the tutorial and comes back', () => {
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    expect(screen.getByText(/TUTORIAL · 1\//)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }));
    expect(screen.getByRole('button', { name: /BUILD/ })).toBeTruthy();
  });
});

describe('navigation', () => {
  it('moves between the four tabs', () => {
    launch();
    for (const tab of ['TUNE', 'DYNO', 'HOME', 'BUILD']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(tab) }));
      expect(screen.getByRole('button', { name: new RegExp(tab) })).toBeTruthy();
    }
  });
});

describe('the header reflects the build', () => {
  it('names the current engine and fuel', () => {
    launch();
    // The header line is `${engineName} · ${turbo} · ${octane} oct · ${injector} · ${version}`.
    // Pin that it renders at all and carries an octane figure; the exact preset name is
    // not the point.
    expect(screen.getByText(/oct/)).toBeTruthy();
  });
});
```

**Then add the three flows that matter most.** These queries were derived by reading the current DOM, not guessed — but verify each still matches before trusting it.

The facts they rest on, all confirmed in `EcuLab.jsx` at time of writing:
- The header line (`:1142`) renders `` `${engineName} · ${turbo} · ${octane} oct · ${injector} · ${version}` ``.
- `engineName` (`:1093`) is the preset's name when one is loaded, and otherwise falls back to `` `${displacementL.toFixed(1)}L ${configuration}` `` — e.g. `3.0L I6`. **That fallback is how you detect preset invalidation from the DOM.**
- The preset picker is the only `<select>` carrying `<optgroup>` elements — `GroupedSelect` (`:127`, used at `:1443`). It has no accessible name, so `getByRole('combobox', {name})` will not find it.
- Table cells are plain `<button>`s whose text is the formatted cell value (`:358`).
- `SelectionDock` (`:407`) renders delta buttons labelled `+1`, `-1` and so on (`{d > 0 ? '+' : ''}{d}`).
- The dyno button reads `RUN DYNO PULL`, or `SWEEPING…` while running (`:2012`).
- The reveal is a `setInterval` (`:883`) that clears itself and sets `running` false when done.

```jsx
/** The preset picker is the only select with optgroups. */
function presetPicker() {
  return screen.getAllByRole('combobox').find((el) => el.querySelector('optgroup'));
}

describe('loading a preset', () => {
  it('rewrites the header to name that preset', () => {
    // Exercises applyEnginePreset's 23 writes across all three slices in one go.
    launch();
    const picker = presetPicker();
    expect(picker).toBeTruthy();
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    // With a preset loaded the header shows its NAME, not the "3.0L I6" fallback.
    expect(screen.getByText(/oct/).textContent).not.toMatch(/^\d\.\dL /);
  });
});

describe('editing a calibration table', () => {
  it('stops the header claiming the factory preset', () => {
    // The single most important behaviour in this PR: withTableEdit crosses the
    // build/tune boundary, clearing presetId (build) and setting tablesDirty (tune).
    // If the extraction drops that link, the header goes on claiming a factory
    // calibration the player has just edited away from.
    launch();
    const picker = presetPicker();
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    // Any grid cell; the first numeric-labelled button inside the grid will do.
    const cells = screen.getAllByRole('button').filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent));
    fireEvent.click(cells[Math.floor(cells.length / 2)]);
    fireEvent.click(screen.getByRole('button', { name: '+1' }));

    // Header falls back to the derived "3.0L I6" form once the preset is invalidated.
    expect(screen.getByText(/oct/).textContent).toMatch(/^\d\.\dL /);
  });
});

describe('running a dyno pull', () => {
  it('produces a result', async () => {
    launch();
    fireEvent.click(screen.getByRole('button', { name: /DYNO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'RUN DYNO PULL' }));
    // The reveal is a setInterval that ends by setting running false, so the button
    // returns to its idle label. Real timers + waitFor is less brittle here than fake
    // timers, which would need act() wrapping around every tick.
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'RUN DYNO PULL' })).toBeTruthy(),
      { timeout: 10000 },
    );
  });
});
```

Add `waitFor` and `within` to the `@testing-library/react` import as needed.

If a flow proves genuinely untestable in jsdom (canvas, Web Audio, `requestAnimationFrame`), **report that rather than deleting the test** — an untestable flow is a finding the controller needs, and it tells PR 3 where the risk is. Likewise if the dyno pull needs Web Audio stubbing: `ensureAudio()` is called on user gesture, so it may need a `window.AudioContext` stub. Report what you had to stub.

- [ ] **Step 3: Run them against unmodified code**

```bash
npm test -- tests/ui/characterisation.test.jsx
```
Expected: **PASS**. These describe current behaviour, so they must be green before anything moves. If one fails, either your query is wrong or you have found a real bug — investigate and report which.

- [ ] **Step 4: Prove they can fail**

Temporarily break something small and real in `EcuLab.jsx` — for example, make `changeTab` a no-op — and confirm the navigation test fails. Restore it. **Report which test caught it.** A characterisation suite that passes against a broken app is worthless, and this is the only chance to check.

- [ ] **Step 5: Run the full gate and commit**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

```bash
git add tests/ui/characterisation.test.jsx
git commit -m "Pin EcuLab's behaviour before its state moves

408 tests cover physics, tokens and primitives; almost nothing exercises the
app's own flows. A state extraction that mis-wires a setter would compile,
typecheck, build and pass CI while silently breaking the app.

These describe what the app does today, not what it should do. If one fails
after the extraction, the extraction is wrong.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 2: The store — initial state, reducer, provider

**Files:**
- Create: `src/ui/state/initialState.js`
- Create: `src/ui/state/reducer.js`
- Create: `src/ui/state/StoreProvider.jsx`
- Test: `tests/ui/state/reducer.test.js`
- Modify: `tsconfig.json` (add `src/ui/state` to `include`)

**Interfaces:**
- Consumes: `DEFAULT_ENGINE_CONFIG`, `DEFAULT_MODS`, `DEFAULT_TIMING`, `DEFAULT_AFR`, `DEFAULT_BOOST`, `EXHAUST_DIA_OPTS`, `computeHardwareVE`, `makeLiveState`, `clone2D` — all already imported by `EcuLab.jsx`; copy its import list.
- Produces:
  - `makeInitialState(): {build, tune, session}`
  - `reducer(state, action): state`
  - `StoreProvider({children})`, `useBuild()`, `useTune()`, `useSession()` — each hook returns `[slice, dispatch]`.
  - Action types as a frozen `ACTIONS` object.

- [ ] **Step 1: Write the failing reducer test**

Create `tests/ui/state/reducer.test.js`:

```js
/**
 * Reducer tests — pure, no DOM.
 *
 * The reducer exists so that operations spanning several slices happen in ONE pass.
 * EcuLab's applyEnginePreset makes 21 sequential setState calls and its own comment
 * warns the order matters; resetToStock documents that "the last call pins tablesDirty
 * back to false". Those hazards are what this file exists to make impossible.
 */

import { describe, expect, it } from 'vitest';

import { makeInitialState } from '../../../src/ui/state/initialState.js';
import { ACTIONS, reducer } from '../../../src/ui/state/reducer.js';

describe('makeInitialState', () => {
  it('returns the three slices', () => {
    const s = makeInitialState();
    expect(Object.keys(s).sort()).toEqual(['build', 'session', 'tune']);
  });

  it('starts with no preset loaded and clean tables', () => {
    const s = makeInitialState();
    expect(s.build.presetId).toBeNull();
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('returns a fresh object each call, not a shared reference', () => {
    // A shared initial state would let one test's mutation leak into the next, and
    // one player's reset leak into their next build.
    const a = makeInitialState();
    const b = makeInitialState();
    expect(a).not.toBe(b);
    expect(a.tune.ve).not.toBe(b.tune.ve);
  });
});

describe('SET_BUILD_FIELD', () => {
  it('sets the field', () => {
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.build.turboOn).toBe(true);
  });

  it('clears the preset label, because a hand edit is no longer that preset', () => {
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.build.presetId).toBeNull();
  });

  it('does not flag the calibration tables as dirty', () => {
    // Hardware edits invalidate the preset LABEL only. tablesDirty means unsaved
    // player work on the calibration, and is what the overwrite prompt keys off.
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('leaves the other slices untouched by reference', () => {
    const before = makeInitialState();
    const after = reducer(before, {
      type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: true,
    });
    expect(after.session).toBe(before.session);
  });
});

describe('SET_TURBINE', () => {
  it('fits one of the chosen housing, because a twin-turbo count belongs to a preset', () => {
    const twin = { ...makeInitialState() };
    twin.build = { ...twin.build, turbineIdx: 2, turbineCount: 2 };
    const s = reducer(twin, { type: ACTIONS.SET_TURBINE, value: 1 });
    expect(s.build.turbineIdx).toBe(1);
    expect(s.build.turbineCount).toBe(1);
  });
});

describe('SET_TABLE', () => {
  it('sets the table', () => {
    const next = [[1, 2], [3, 4]];
    const s = reducer(makeInitialState(), {
      type: ACTIONS.SET_TABLE, table: 'timing', value: next,
    });
    expect(s.tune.timing).toBe(next);
  });

  it('clears the preset AND flags the tables dirty, in one pass', () => {
    // This is the cross-slice write that three independent contexts could not express
    // atomically: a table edit invalidates a BUILD field and a TUNE field together.
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, {
      type: ACTIONS.SET_TABLE, table: 'timing', value: [[1]],
    });
    expect(s.build.presetId).toBeNull();
    expect(s.tune.tablesDirty).toBe(true);
  });
});

describe('unknown actions', () => {
  it('returns the same state object, so React skips the re-render', () => {
    const before = makeInitialState();
    expect(reducer(before, { type: 'NOT_A_REAL_ACTION' })).toBe(before);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- tests/ui/state/reducer.test.js
```
Expected: FAIL — cannot resolve `../../../src/ui/state/initialState.js`.

- [ ] **Step 3: Write the initial state**

Create `src/ui/state/initialState.js`. Copy every default from `EcuLab.jsx`'s current `useState` initialisers **exactly** — including `EXHAUST_DIA_OPTS.findIndex((o) => o.dia === 3.0)`, which is pinned by diameter rather than position on purpose, and `computeHardwareVE(DEFAULT_ENGINE_CONFIG, DEFAULT_MODS)` for `ve`.

The function must return a **fresh** object every call — clone the 2D tables with `clone2D`, and do not hoist any mutable value to module scope.

Document each slice with a comment saying what belongs in it and what does not.

- [ ] **Step 4: Write the reducer**

Create `src/ui/state/reducer.js`. Export a frozen `ACTIONS` object and a `reducer(state, action)`.

Implement at minimum: `SET_BUILD_FIELD`, `SET_TURBINE`, `SET_TABLE`, `SET_SESSION_FIELD`, `SET_TUNE_FIELD`. The default branch **must return `state` unchanged by reference** so React can skip the render.

Every case must return new objects only for the slices it changes — the other slices keep their identity, which is what the "leaves the other slices untouched by reference" test pins.

Write a file header explaining why this is one reducer over three, referencing the 23-write `applyEnginePreset` and the order hazard.

- [ ] **Step 5: Write the provider and hooks**

Create `src/ui/state/StoreProvider.jsx`. One `useReducer`, one context carrying `[state, dispatch]`, and three hooks that select their slice:

```jsx
export function useBuild() {
  const [state, dispatch] = useStore();
  return [state.build, dispatch];
}
```

Each hook must throw a clear error if used outside the provider — a silent `undefined` here surfaces as an unrelated crash three components away.

- [ ] **Step 6: Run the test, then put the directory under the typechecker**

```bash
npm test -- tests/ui/state/reducer.test.js
```
Expected: PASS.

Add `"src/ui/state"` to `tsconfig.json`'s `include`, after `"src/ui/screens"`. Then `npm run typecheck` must still exit 0.

- [ ] **Step 7: Full gate and commit**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

```bash
git add src/ui/state/ tests/ui/state/ tsconfig.json
git commit -m "Add the store: one reducer, three slices, three hooks

Consumers get useBuild/useTune/useSession, which is the three-way split the
design doc specifies. Internally it is one reducer, because the operations
that matter cross every boundary — a table edit clears a build field and sets
a tune flag together, and applyEnginePreset writes 23 fields across all three
in an order its own comment warns about.

Nothing consumes it yet; EcuLab is wired up in the tasks that follow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 3: The cross-cutting actions

**Files:**
- Modify: `src/ui/state/reducer.js`
- Test: `tests/ui/state/reducer.test.js`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces: `ACTIONS.APPLY_PRESET`, `ACTIONS.RESET_TO_STOCK`, `ACTIONS.REPAIR_ENGINE`, `ACTIONS.BANK_PULL` — each atomic.

These are the actions that justify the whole design. Read `applyEnginePreset` and `resetToStock` in `EcuLab.jsx` line by line before writing them; every field they touch must be accounted for.

**Amendment (found during Task 2, decided by the controller).** Task 2 built
`SET_BUILD_FIELD` to always clear `presetId`, faithfully mirroring `withPresetField`
(`EcuLab.jsx:602`). But two of the fifteen build-slice fields are written today WITHOUT
invalidating, and correctly so:

- `boostSel` (`EcuLab.jsx:579`, written at `:1658`) is which RPM column the boost-curve
  editor has selected — a cursor, not hardware. It is the build-side analogue of
  `tune.selection`. Moving the cursor changes nothing about the engine.
- `presetPrompt` (`:566`, written at `:775`, `:785`, `:1514`) is the overwrite-confirmation
  dialog. Opening or dismissing a dialog is not a build change.

Routing either through `SET_BUILD_FIELD` would clear `presetId` and make the header stop
claiming a factory preset because the player clicked a column header or opened a dialog.

**Add two dedicated actions — `ACTIONS.SET_BOOST_SEL` and `ACTIONS.SET_PRESET_PROMPT` —
not one generic non-invalidating setter.** The comment at `EcuLab.jsx:596` says the
`withPresetField` wrapper "is what stops the next field from being forgotten". A generic
`SET_BUILD_FIELD_RAW` would be an escape hatch a future caller could reach for on a
hardware field, silently reintroducing exactly the stale-preset bug the wrapper exists to
prevent. Two narrow, single-purpose actions cannot be misused that way.

Each needs a test asserting `presetId` SURVIVES the write:

```js
describe('non-invalidating build writes', () => {
  it('moving the boost-curve cursor does not disown the preset', () => {
    const loaded = makeInitialState();
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.SET_BOOST_SEL, value: 6 });
    expect(s.build.boostSel).toBe(6);
    expect(s.build.presetId).toBe('n54');
  });

  it('opening the overwrite prompt does not disown the preset', () => {
    const loaded = makeInitialState();
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.SET_PRESET_PROMPT, value: { presetId: 'k20' } });
    expect(s.build.presetPrompt).toEqual({ presetId: 'k20' });
    expect(s.build.presetId).toBe('n54');
  });
});
```

**Also add `ACTIONS.SET_ENGINE_CONFIG_PATCH`** here rather than in Task 4. `setCfg`
(`EcuLab.jsx:738`) is `setEngineConfigInvalidating((c) => ({ ...c, ...patch }))` — a
functional update. The reducer already holds the current state, so the action carries a
plain `patch` object and the reducer does the merge. Do not pass functions through
actions. It DOES invalidate, like every other hardware write:

```js
it('patching the engine config merges and invalidates', () => {
  const loaded = makeInitialState();
  loaded.build = { ...loaded.build, presetId: 'n54' };
  const s = reducer(loaded, { type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { cylinders: 8 } });
  expect(s.build.engineConfig.cylinders).toBe(8);
  expect(s.build.presetId).toBeNull();
});
```

Confirm the merge preserves the config's other fields — a patch that replaces rather than
merges would silently drop displacement, and the app would still render.

**Close the nested-mutation blind spot while you are in this file.** Task 2's reviewer
broke `SET_SESSION_FIELD` by mutating `state.session[action.field] = action.value` in
place instead of spreading, re-ran `tests/ui/state/reducer.test.js`, and **all 16 tests
still passed.** The shipped reducer is correct — every case spreads properly — but the
suite cannot tell. The existing reference tests only assert that the slices you did NOT
touch keep their identity; nothing asserts the slice you DID touch gets a fresh one.

That is the exact bug class this design is meant to be safe against: a nested mutation
survives a shallow equality check, so React skips the re-render and the screen silently
stops matching the state. Task 3 adds several more cases to this reducer, so add the
assertion now and let the new cases inherit it:

```js
describe('every write produces a fresh slice reference', () => {
  it('replaces the changed slice rather than mutating it', () => {
    const before = makeInitialState();
    const after = reducer(before, { type: ACTIONS.SET_SESSION_FIELD, field: 'pullCount', value: 3 });
    expect(after.session).not.toBe(before.session);
    expect(before.session.pullCount).toBe(0); // the input state is untouched
  });
});
```

Apply the same two assertions to at least one build write and one tune write. Prove it
bites: temporarily mutate the state argument in place in the case under test, confirm the
new test fails, restore, and record the output in your report.

- [ ] **Step 1: Write the failing tests**

Append to `tests/ui/state/reducer.test.js`:

```js
describe('APPLY_PRESET', () => {
  const preset = {
    presetId: 'n54', engineConfig: { cylinders: 6 }, mods: { intake: true },
    turboOn: true, boostCurve: [8, 8, 8, 8, 8, 8, 8, 8], turbineIdx: 1,
    turbineCount: 2, compressorIdx: 1, injIdx: 2, ecuInjectorCc: 440,
    octaneIdx: 1, exhaustDiaIdx: 2, ve: [[80]], timing: [[20]], afr: [[12]],
  };

  it('ends with the preset LOADED, not invalidated', () => {
    // The ordering hazard this whole design removes: applying a preset writes the same
    // fields a hand edit would, and a hand edit clears presetId. Done as 23 separate
    // setState calls that is order-dependent; done as one action it cannot race.
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.presetId).toBe('n54');
  });

  it('loads the preset\'s own calibration, not a recomputed one', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.tune.timing).toEqual([[20]]);
  });

  it('leaves the tables clean — a freshly loaded preset is not unsaved work', () => {
    const dirty = { ...makeInitialState() };
    dirty.tune = { ...dirty.tune, tablesDirty: true };
    const s = reducer(dirty, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.tune.tablesDirty).toBe(false);
  });

  it('clears the previous run, which measured a different engine', () => {
    const ran = { ...makeInitialState() };
    ran.session = { ...ran.session, result: { peakHp: 400 }, prevResult: { peakHp: 380 } };
    const s = reducer(ran, { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.session.result).toBeNull();
    expect(s.session.prevResult).toBeNull();
  });

  it('carries the twin-turbo count a preset owns', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.turbineCount).toBe(2);
  });

  it('clears any pending overwrite prompt and cell selection', () => {
    const s = reducer(makeInitialState(), { type: ACTIONS.APPLY_PRESET, preset });
    expect(s.build.presetPrompt).toBeNull();
    expect(s.tune.selection).toBeNull();
  });
});

describe('RESET_TO_STOCK', () => {
  it('clears the preset label, because a reset is not that preset\'s calibration', () => {
    const loaded = { ...makeInitialState() };
    loaded.build = { ...loaded.build, presetId: 'n54' };
    const s = reducer(loaded, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.build.presetId).toBeNull();
  });

  it('ends with the tables CLEAN — a reset baseline is not unsaved player work', () => {
    // The old code achieved this by ordering setTablesDirty(false) last, after three
    // invalidating setters that each set it true. As one action there is no order to get
    // wrong.
    const dirty = { ...makeInitialState() };
    dirty.tune = { ...dirty.tune, tablesDirty: true };
    const s = reducer(dirty, { type: ACTIONS.RESET_TO_STOCK, ve: [[70]] });
    expect(s.tune.tablesDirty).toBe(false);
  });
});

describe('REPAIR_ENGINE', () => {
  it('restores every component to full health', () => {
    const worn = { ...makeInitialState() };
    worn.session = { ...worn.session, health: { piston: 40, bearing: 55, valve: 70 } };
    const s = reducer(worn, { type: ACTIONS.REPAIR_ENGINE });
    expect(s.session.health).toEqual({ piston: 100, bearing: 100, valve: 100 });
  });
});
```

- [ ] **Step 2: Run and watch it fail**

```bash
npm test -- tests/ui/state/reducer.test.js
```
Expected: FAIL — `ACTIONS.APPLY_PRESET` is undefined.

- [ ] **Step 3: Implement the four actions**

Add them to `src/ui/state/reducer.js`. `APPLY_PRESET` must set every field `applyEnginePreset` sets — go through the function in `EcuLab.jsx` and account for all 23. `RESET_TO_STOCK` takes the recomputed `ve` as part of the action, because computing it needs `computeHardwareVE` with hardware the reducer should not be reaching for.

Comment each action with what the old imperative version had to get right about ordering, and why this version cannot get it wrong.

- [ ] **Step 4: Run, then run the full gate**

```bash
npm test -- tests/ui/state/reducer.test.js
npm test
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/state/reducer.js tests/ui/state/reducer.test.js
git commit -m "Make preset load, reset and repair atomic actions

applyEnginePreset made 21 sequential setState calls and warned in a comment
that routing them through the invalidating setters would make the result
order-dependent. resetToStock made six and documented that the last one had to
pin tablesDirty back to false.

Both are now single actions. The ordering hazard is not documented, it is
absent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 4: Wire the build slice into EcuLab

**Files:**
- Modify: `src/ui/EcuLab.jsx`
- Modify: `src/main.jsx` (wrap in `StoreProvider`)

**Interfaces:**
- Consumes: `useBuild`, `ACTIONS` from Task 2/3.
- Produces: `EcuLab` reading its 15 build fields from the store instead of local state.

This is the first mechanical wiring task. **Work one field at a time and run the characterisation tests between each** — that is what they are for.

**This task is not actually mechanical, and the reason is worth reading before you start.**

Three functions in `EcuLab.jsx` write across slice boundaries: `applyEnginePreset` (21
writes), `resetToStock` (7), and the score-banking tail of `doRun`. Task 4 removes the
build slice's `useState` declarations — so the moment they are gone, those functions have
no `setEngineConfig` to call. You cannot leave them alone, and you cannot fully convert
them either, because `tune` and `session` are still local `useState` until Tasks 5 and 6.

**The interim shape, for each of the three:** dispatch the atomic action AND keep the
still-local setters for the slices that have not moved yet.

```jsx
const applyEnginePreset = (preset) => {
  const p = applyPreset(preset);
  dispatch({ type: ACTIONS.APPLY_PRESET, preset: p });   // build lands in the store
  // tune + session are still local useState until Tasks 5 and 6 — keep writing them.
  setVe(p.ve); setTiming(p.timing); setAfr(p.afr);
  setSelection(null); setTablesDirty(false);
  setResult(null); setPrevResult(null);
};
```

This is safe because nothing reads `state.tune` or `state.session` yet. The store's copies
of those slices are written and simply unread until their task arrives, at which point the
duplicate local setters are deleted. Task 5 removes the tune lines, Task 6 the session
lines. **Do not skip the store dispatch for the not-yet-moved slices** — writing the
store's tune/session now is what makes Task 5 and Task 6 a deletion rather than a rewrite.

**Four traps the review of Task 3 identified. Each produces a plausible-looking wrong
result, not a crash:**

1. **`APPLY_PRESET`'s payload is `applyPreset(rawPreset)`'s OUTPUT, not the raw
   `ENGINE_PRESETS` entry.** Pass the raw entry and `p.engineConfig` is `undefined` — a
   build with no short block.

2. **`RESET_TO_STOCK` takes `ve` in its payload; the reducer does not compute it.** The
   call site must pass `computeHardwareVE(engineConfig, DEFAULT_MODS, hwForVe)` — note the
   asymmetry: `DEFAULT_MODS` for the mods argument, but the **current** `hwForVe`
   (`EcuLab.jsx:665`) for hardware. Resetting the calibration does not un-install the
   turbo. Passing current mods, or a stock `hwForVe`, both yield a table that looks
   entirely reasonable and is wrong.

3. **`boostSel` and `presetPrompt` go through `SET_BOOST_SEL` and `SET_PRESET_PROMPT`
   only.** Routing either through `SET_BUILD_FIELD` clears `presetId`, so the header stops
   claiming the factory preset because the player clicked an RPM column header or opened a
   dialog. Task 1's characterisation tests will not catch this — write a test that does.

4. **`choosePreset` (`EcuLab.jsx:784-787`) branches on `hasTuningWork()`, which reads
   `tablesDirty` — still local in this task.** Keep reading the local one; Task 5 moves it.

**`SET_ENGINE_CONFIG_PATCH` already exists** (added in Task 3) — `setCfg` becomes
`dispatch({ type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch })`. Do not re-add it, and do not
pass the function form through an action.

- [ ] **Step 1: Wrap the app in the provider**

In `src/main.jsx`, wrap `<EcuLab />` in `<StoreProvider>`, inside the existing `<ErrorBoundary>`.

- [ ] **Step 2: Replace the build `useState` calls**

Delete the 15 build `useState` declarations. Add near the top of the component:

```jsx
  const [build, dispatch] = useBuild();
  const { engineConfig, mods, turboOn, boostCurve, octaneIdx, injIdx, mafScalar,
          turbineIdx, turbineCount, compressorIdx, exhaustDiaIdx, ecuInjectorCc,
          presetId, presetPrompt, boostSel } = build;
```

Destructuring keeps every existing read site working unchanged — only the *writes* need rewriting.

- [ ] **Step 3: Replace the invalidating setters**

The `withPresetField` wrapper and its eleven derived setters are now the reducer's job. Delete them, and replace each call site with a dispatch. For example `setTurboOnInvalidating(v)` becomes:

```jsx
dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'turboOn', value: v });
```

`setTurbineIdxInvalidating` becomes `{ type: ACTIONS.SET_TURBINE, value: idx }`.

**Functional updates are already handled.** `setCfg` was
`setEngineConfigInvalidating((c) => ({ ...c, ...patch }))`; it becomes
`dispatch({ type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch })`, which the reducer merges.

- [ ] **Step 4: Run the characterisation tests after every few fields**

```bash
npm test -- tests/ui/characterisation.test.jsx
```
Expected: PASS throughout. **If one fails, you have just broken something — stop and fix it before continuing.** Do not batch up the whole file and debug at the end.

- [ ] **Step 5: Full gate and commit**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Commit with a message describing which slice moved and confirming the characterisation tests stayed green throughout.

---

### Task 5: Wire the tune slice

**Files:**
- Modify: `src/ui/EcuLab.jsx`

Same method as Task 4, for `ve`, `timing`, `afr`, `tablesDirty`, `selection`.

- [ ] **Step 1: Replace the five `useState` calls with `useTune()` and destructuring**

- [ ] **Step 2: Replace `withTableEdit`**

This is the wrapper that crossed the build/tune boundary. `setVeEdited(next)` becomes:

```jsx
dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: next });
```

The reducer clears `presetId` and sets `tablesDirty` in the same pass. Delete `withTableEdit` and all three derived setters.

- [ ] **Step 3: Handle `acceptVe` and any other table writer**

Search for every write to `ve`/`timing`/`afr`, including the VE-acceptance path. Each becomes a `SET_TABLE` dispatch. Miss one and hand edits stop invalidating the preset — which characterisation test 2 exists to catch.

- [ ] **Step 4: Run the characterisation tests, then the full gate**

- [ ] **Step 5: Commit**

---

### Task 6: Wire the session slice

**Files:**
- Modify: `src/ui/EcuLab.jsx`

Same method, for the 14 session fields.

- [ ] **Step 1: Replace the `useState` calls with `useSession()` and destructuring**

- [ ] **Step 2: Take particular care with `live` and `revealCount`**

`live` is driven by an interval in a `useEffect` and updated at high frequency; `revealCount` drives the dyno reveal animation. Both are written from inside effects and refs. **Read those effects fully before changing them** — a stale closure over `dispatch` is not possible (React guarantees dispatch identity is stable), but a stale closure over a *slice value* is. Where an effect reads state to compute the next value, use the functional form via an action the reducer resolves, not a captured variable.

- [ ] **Step 3: Replace `resetToStock` and `repairEngine` with their actions**

`repairEngine` becomes a `REPAIR_ENGINE` dispatch. `resetToStock` becomes a `RESET_TO_STOCK` dispatch carrying the recomputed `ve`.

- [ ] **Step 4: Run the characterisation tests, then the full gate**

- [ ] **Step 5: Commit**

---

### Task 7: Remove the scaffolding, verify, and open the PR

**Files:**
- Modify: `src/ui/EcuLab.jsx`
- Modify: `README.md` / `CONTRIBUTING.md` only if they describe the old structure

- [ ] **Step 1: Confirm the wrappers and their setters are gone**

```bash
grep -c "withPresetField\|withTableEdit\|Invalidating\|setVeEdited\|setTimingEdited\|setAfrEdited" src/ui/EcuLab.jsx
```
Expected: **0**.

- [ ] **Step 2: Confirm only view state remains local**

```bash
grep -n "const \[.*\] = useState" src/ui/EcuLab.jsx
```
Expected: only `appView`, `tab`, `tuneView`, `dynoView`, `dashSection`, `buildSection` — six, plus `ExpandableInfo`'s own `open`, which is a different component. Anything else means a field was missed.

- [ ] **Step 3: Check the docs for stale structural claims**

```bash
grep -rn "one large component\|2365\|2330" README.md CONTRIBUTING.md docs/*.md 2>/dev/null | grep -v superpowers
```
`CONTRIBUTING.md` mentions the UI being one large component pending decomposition. That is still true after this PR — the render did not move — so only correct it if it says something this PR made false. Do not invent documentation changes.

- [ ] **Step 4: Re-sync with the base**

```bash
git fetch origin
git rebase origin/main
```
If anything conflicts, resolve it deliberately and say how in the PR. Then **re-run step 5 in full** — a pre-rebase green says nothing about the post-rebase tree.

- [ ] **Step 5: The full gate, with exit codes captured correctly**

```bash
node --version    # must print v20.x or v22.x
npm test
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 6: Prove the physics never moved**

```bash
git diff origin/main --stat -- tests/fixtures/ tests/fingerprint.test.js src/sim/
```
Expected: **no output.** Any change here means the refactor reached into the physics and the PR must not open until that is understood.

- [ ] **Step 7: Confirm no dependency changed**

```bash
git diff origin/main -- package.json
```
Expected: **no output.** This PR adds nothing.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/58-state-contexts
```

The PR body must state: what moved and what deliberately did not (view state, because PR 3 absorbs it into routing); that the render is unchanged; that `applyEnginePreset`'s 23-write ordering hazard is now absent rather than documented; that the characterisation tests were written first and stayed green throughout; and the fingerprint evidence from step 6. Close #58 and reference #6.

- [ ] **Step 9: Check no auto-merge is queued**

```bash
gh pr view --json autoMergeRequest
```
Expected `null`. If not, `gh pr merge <N> --disable-auto`. **Do not merge this PR.**

---

## Notes for the implementer

**The characterisation tests are the point of this plan.** If one starts failing during Tasks 4–6, the refactor broke something — fix the refactor, never the test. If you find yourself wanting to change an assertion to make it pass, stop and report instead.

**Work one field at a time.** Thirty-four pieces of state moved in one edit, then debugged at the end, is the failure mode this plan is shaped to avoid.

**Do not move the render.** The component stays monolithic; only state moves. Splitting screens is PR 3, and doing both at once produces a diff nobody can review.

**Check your Node version before believing a failure.** `node --version` must be 20 or 22. On 26 the fingerprint fails on an untouched checkout and looks exactly like a physics break.
