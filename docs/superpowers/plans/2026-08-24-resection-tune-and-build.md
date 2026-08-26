# Re-section TUNE and BUILD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move controls to the screens they belong on — TUNE goes from four views to five, BUILD's `boltons` section dissolves and a Fuel System section appears — so that each screen holds one concern.

**Architecture:** PR 3b (#59) moved markup into screen files *without changing what is on which screen*, which is why `tests/ui/characterisation.test.jsx` stayed byte-identical through seven merged PRs. This issue is the opposite: nothing structural changes, but content crosses screen boundaries. `ROUTES` in `src/ui/routing.js` grows a fifth TUNE section and renames BUILD's; four controls move between tabs; and the characterisation tests change their **queries** for the first time since they were written.

**Tech Stack:** React 18, Vite, CSS Modules, vitest + @testing-library/react, JSDoc-typed JS (no TypeScript source files).

## Global Constraints

- **Node v20.x or v22.x only.** Node 26 changes V8 float formatting and silently moves the physics fingerprint. Check `node --version` before trusting any test run.
- **Never run `npm run test:fingerprint:update`.** This is a UI-only change. `tests/fixtures/fingerprint.sha256` must stay byte-identical.
- **`src/sim/` must not change.** No physics, no catalogue edits. Verify with `git diff origin/main --stat -- src/sim/` returning empty.
- **Run vitest as `npx vitest run --pool=forks --poolOptions.forks.singleFork`.** This box has a non-deterministic tinypool worker crash that is not a defect in your change.
- **Do not use a total test count as a baseline.** `tests/no-hardcoded-colours.test.js` generates one test per source file, so adding files raises the total on its own. Per-file counts are the stable measure.
- **Never a bare `git stash`, and never `git rebase --autostash`.** `node_modules` is a tracked self-referential symlink; stashing pops the symlink over the real directory and breaks the toolchain. `git status` showing ` D node_modules` is a known pre-existing condition — never stage it, never "fix" it.
- **Never `git checkout --` a file with uncommitted work.** `cp` to a scratch file first. This destroyed an entire task's work earlier in this project.
- **Prefer script files over inline `python3 -c`** for multi-line source edits. A badly-quoted inline edit once corrupted a JSX attribute 300 lines from the edit site.
- **New files are typed.** `EcuLab.jsx` no longer carries `@ts-nocheck` — it was removed in PR 3b and the file is typechecked. Do not reintroduce it.
- **Primitive prop passthrough is uneven.** `Button`, `Panel` and `Select` merge a caller's `className` onto their own classes. `Seg`, `Toggle`, `Bar`, `StatTile`, `Eyebrow` and `Note` accept nothing extra. If a screen needs `style`/`className` on one of those, add the passthrough following `Panel`'s pattern — a named props typedef intersected with the element's HTML attributes — **with a test**, not a wrapper div and not `@ts-ignore` (issue #80).
- **Design tokens:** use a token for any value on the ramp; leave off-ramp values raw with a short "why" comment. Forcing an off-ramp value onto the nearest token is a real visual regression.
- **The one breakpoint is 560px**, recorded as a comment at `src/ui/tokens.css` with a hand-maintained list of every file that uses it. Any new stylesheet with a media query must be added to that list.
- **An advisor reports the gap, it never closes it** (`CONTRIBUTING.md`). Nothing in this plan predicts a result; only a dyno pull measures anything.

---

## The decisions this plan implements

Recorded on issue #83 and settled before planning. Do not re-derive them.

**Injectors split along hardware vs calibration:**

| Screen | Holds |
|---|---|
| **BUILD > Fuel System** (new) | The physical injectors fitted, and the fuel in the tank (octane/E85) |
| **TUNE > Injectors** (new) | What the ECU *believes* is fitted: ECU injector scaling, the duty preview, RESCALE |
| **TUNE > Sensors** (new) | The MAF scalar and its recalibration warning |

This makes `RESCALE ECU TO ###cc` meaningful rather than incidental: it exists precisely because the fitted hardware and the ECU's calibration can disagree, and after this change they live on different tabs.

**The store already agrees.** `injIdx` (`EcuScreen.jsx:74`) and `octaneIdx` (`:66`) both dispatch `SET_BUILD_FIELD`. They have been build state rendered on the tune tab all along. This is UI placement catching up with the reducer's slice assignment — **not a state migration**. No reducer change is needed for the move itself.

**BUILD's `boltons` section dissolves.** There are exactly three bolt-ons (`MOD_INFO`, `src/sim/hardware.js:222`): `intake` (Cold Air Intake), `exhaust` (Cat-Back Exhaust), `headers` (Long-Tube Headers). Today's "Bolt-On Parts" groups them by how you buy them rather than by what they do, which is why the target IA has no slot for it. Each card goes to the section that owns its physics:

- `intake` → **Induction**
- `exhaust` (cat-back) → **Exhaust**
- `headers` → **Exhaust**

---

## Target route shape

`src/ui/routing.js` today:

```js
build: ['engine', 'boltons', 'turbo', 'exhaust'],
tune: ['ve', 'timing', 'afr', 'ecu'],
```

After this plan:

```js
build: ['engine', 'induction', 'fuel', 'exhaust'],
tune: ['airflow', 'spark', 'fuel', 'injectors', 'sensors'],
```

**Section ids are renamed, not just relabelled.** `ve` → `airflow`, `timing` → `spark`, `afr` → `fuel`, and `ecu` splits into `injectors` + `sensors`; `boltons` disappears and `turbo` → `induction`. The ids appear in the URL (`#/tune/spark`), so this is a user-visible change to deep links — call it out in the PR.

`parseRoute` already handles an unknown section by landing on the tab with `section: null` (verified in `tests/ui/routing.test.js`), so an old bookmark like `#/tune/ve` degrades to the TUNE tab rather than rendering blank. **That existing behaviour is what makes the rename safe** — do not add redirect mapping for old ids; the graceful degradation is the design.

Note `fuel` appears under **both** tabs. That is intentional and unambiguous because sections are namespaced by tab (`#/build/fuel` vs `#/tune/fuel`), and `parseRoute` reads the tab segment first. `ROUTES` is a `Record<string, string[]>` keyed by tab, so there is no collision.

---

## File structure

**Created:**

| File | Responsibility |
|---|---|
| `src/ui/screens/build/FuelSystemScreen.jsx` + `.module.css` | Physical injector size, fuel octane/E85, and the octane explainer |
| `src/ui/screens/tune/InjectorsScreen.jsx` + `.module.css` | ECU injector scaling, RESCALE, duty preview, both injector explainers |
| `src/ui/screens/tune/SensorsScreen.jsx` + `.module.css` | MAF scalar, recalibration warning, trim panel, both MAF explainers |

**Renamed (git mv, so history follows):**

| From | To |
|---|---|
| `src/ui/screens/tune/VeScreen.jsx` | `AirflowScreen.jsx` |
| `src/ui/screens/tune/TimingScreen.jsx` | `SparkScreen.jsx` |
| `src/ui/screens/tune/AfrScreen.jsx` | `FuelScreen.jsx` |
| `src/ui/screens/build/TurboScreen.jsx` | `InductionScreen.jsx` |

**Deleted:**

| File | Why |
|---|---|
| `src/ui/screens/tune/EcuScreen.jsx` + `.module.css` | Splits into `InjectorsScreen` and `SensorsScreen`; its two halves already carry separate `Eyebrow` headings |
| `src/ui/screens/build/BoltonsScreen.jsx` + `.module.css` | Dissolves; its three cards move to Induction and Exhaust |

**Modified:** `src/ui/routing.js`, `src/ui/EcuLab.jsx`, `src/ui/screens/build/ExhaustScreen.jsx`, `tests/ui/characterisation.test.jsx`, `tests/ui/build-store.test.jsx`, `tests/ui/tune-screens.test.jsx`, `tests/ui/build-screens.test.jsx`, `tests/ui/button-call-sites.test.jsx`.

---

## What breaks by design, and how to fix each

These will go red. **Every one is fixed by re-pointing, never by weakening.**

**1. `tests/ui/characterisation.test.jsx` — the first legitimate change since it was written.**

Two assertions reference the old IA:

```js
// line 85 — the TUNE tab-body marker
TUNE: () => screen.getByRole('button', { name: 'AIR' }), // TUNE_VIEWS sub-tab
// line 88 — the BUILD tab-body marker
BUILD: () => screen.getByText('Garage'),
```

`'AIR'` becomes the new Airflow sub-tab label. `'Garage'` is the BUILD tab's `Eyebrow` in `EcuLab.jsx:838` and is **not** part of the re-sectioning — verify it still renders and leave that line alone.

**Change the query, never the assertion.** A test that asserted a control is on the ECU screen is *wrong* once that control lives on Sensors — that is a query fix. A test whose assertion gets vaguer (`getByText` → `queryByText`, an exact string → a loose regex, an equality → a truthiness check) is a weakened test and is not acceptable. If a flow genuinely no longer exists, **say so explicitly in the PR body** rather than deleting the test quietly.

**2. `tests/ui/build-store.test.jsx:569` — `expect(total).toBe(8)`.**

The test walks tabs counting `<Seg>` call sites that show exactly one pressed option. The eight today are: `EngineScreen` ×3, `TurboScreen` ×1, `ExhaustScreen` ×1, `EcuScreen` ×2 (Fuel Octane, ECU Injector Scaling), `EcuLab.jsx:906` ×1 (DYNO's manifold-pressure picker).

After this change the two `EcuScreen` Segs land on different tabs — Fuel Octane on BUILD > Fuel System, ECU Injector Scaling on TUNE > Injectors. **The navigation walk at `:558-564` must be rewritten to reach the new locations, and the total re-counted.** The count should still be 8 (no Seg is added or removed, only relocated) — but derive that from the code, do not assume it. **Never relax to `toBeGreaterThan(0)`.**

**3. `tests/ui/button-call-sites.test.jsx` — floor `toBeGreaterThanOrEqual(23)`.**

Globs `EcuLab.jsx` + `AppShell.jsx` + `src/ui/screens/**` + `src/ui/components/**`. Every file in this plan stays inside that glob, so the count should not move. **Re-measure anyway and raise the floor if it rises; never lower it.** The scanner matches the literal `<Button` prefix and at least one call site breaks the line right after the tag name, so `grep '<Button '` undercounts by one — use `grep -oh '<Button'`.

**4. `tests/ui/tune-screens.test.jsx` and `tests/ui/build-screens.test.jsx`** import screens by path and mount them directly. Renamed and split files break those imports. Re-point them.

---

### Task 1: Re-shape the routes

**Files:**
- Modify: `src/ui/routing.js`
- Test: `tests/ui/routing.test.js`

**Interfaces:**
- Produces: `ROUTES.build = ['engine', 'induction', 'fuel', 'exhaust']` and `ROUTES.tune = ['airflow', 'spark', 'fuel', 'injectors', 'sensors']`. Every later task reads section ids from here.

This task changes only the route table. The screens still render under their old conditions and **the app will be visibly broken between this task and Task 6** — that is expected and is why the tasks commit separately. Do not try to keep the app working mid-sequence.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/routing.test.js`:

```js
it('routes the five TUNE sections and the four BUILD sections', () => {
  expect(ROUTES.tune).toEqual(['airflow', 'spark', 'fuel', 'injectors', 'sensors']);
  expect(ROUTES.build).toEqual(['engine', 'induction', 'fuel', 'exhaust']);
});

it('namespaces `fuel` by tab so the two never collide', () => {
  // `fuel` is a section of BOTH tabs. They are distinct routes because the tab
  // segment is read first — this is what makes the shared id safe rather than a bug.
  expect(parseRoute('#/build/fuel')).toEqual({ view: 'app', tab: 'build', section: 'fuel' });
  expect(parseRoute('#/tune/fuel')).toEqual({ view: 'app', tab: 'tune', section: 'fuel' });
});

it('degrades a stale deep link to the tab instead of rendering blank', () => {
  // `#/tune/ve` was a real URL before this change. A bookmark must not break the app.
  expect(parseRoute('#/tune/ve')).toEqual({ view: 'app', tab: 'tune', section: null });
  expect(parseRoute('#/build/boltons')).toEqual({ view: 'app', tab: 'build', section: null });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/routing.test.js --pool=forks --poolOptions.forks.singleFork`

Expected: FAIL — the first test reports the old arrays, and the stale-deep-link test currently *passes for the wrong reason* (`ve` is still a valid section, so it returns `section: 've'` not `null`).

- [ ] **Step 3: Change the route table**

In `src/ui/routing.js`, replace the two lines:

```js
export const ROUTES = {
  dash: ['live', 'stats', 'health', 'learn'],
  build: ['engine', 'induction', 'fuel', 'exhaust'],
  tune: ['airflow', 'spark', 'fuel', 'injectors', 'sensors'],
  dyno: ['result', 'data', 'log', 'score'],
};
```

- [ ] **Step 4: Run the routing suite**

Run: `npx vitest run tests/ui/routing.test.js --pool=forks --poolOptions.forks.singleFork`

Expected: PASS, all of them. The rest of the UI suite will now be red — that is expected until Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/ui/routing.js tests/ui/routing.test.js
git commit -m "Re-shape the route table for the new sections"
```

---

### Task 2: Rename the three TUNE screens that only change name

**Files:**
- Rename: `src/ui/screens/tune/VeScreen.jsx` → `AirflowScreen.jsx` (+ `.module.css`)
- Rename: `src/ui/screens/tune/TimingScreen.jsx` → `SparkScreen.jsx` (+ `.module.css`)
- Rename: `src/ui/screens/tune/AfrScreen.jsx` → `FuelScreen.jsx` (+ `.module.css`)
- Modify: `src/ui/EcuLab.jsx` (imports and mount conditions), `tests/ui/tune-screens.test.jsx`

**Interfaces:**
- Consumes: `ROUTES.tune` from Task 1.
- Produces: `AirflowScreen`, `SparkScreen`, `FuelScreen` — same props as the components they rename, no signature change.

**No markup changes in this task.** Only the file name, the component name, the exported symbol, the import sites, and the mount condition's section id. Keeping the rename mechanical means a failure in Task 3 has one candidate cause.

- [ ] **Step 1: Rename with `git mv` so history follows**

```bash
cd /Users/danny/Desktop/Projects/cariboutuning
git mv src/ui/screens/tune/VeScreen.jsx src/ui/screens/tune/AirflowScreen.jsx
git mv src/ui/screens/tune/VeScreen.module.css src/ui/screens/tune/AirflowScreen.module.css
git mv src/ui/screens/tune/TimingScreen.jsx src/ui/screens/tune/SparkScreen.jsx
git mv src/ui/screens/tune/TimingScreen.module.css src/ui/screens/tune/SparkScreen.module.css
git mv src/ui/screens/tune/AfrScreen.jsx src/ui/screens/tune/FuelScreen.jsx
git mv src/ui/screens/tune/AfrScreen.module.css src/ui/screens/tune/FuelScreen.module.css
```

- [ ] **Step 2: Rename the components and their stylesheet imports**

In each renamed `.jsx`: change the exported function name (`VeScreen` → `AirflowScreen`, `TimingScreen` → `SparkScreen`, `AfrScreen` → `FuelScreen`), the `styles` import path to the renamed `.module.css`, and the leading docblock's `TUNE > AIR` style heading to the new section name.

- [ ] **Step 3: Re-point the imports and mount conditions in `EcuLab.jsx`**

Update the three import statements, and change each mount condition's section id:

```jsx
{tab === 'tune' && tuneView === 'airflow' && <AirflowScreen … />}
{tab === 'tune' && tuneView === 'spark' && <SparkScreen … />}
{tab === 'tune' && tuneView === 'fuel' && <FuelScreen … />}
```

Keep every prop exactly as it is. **Preserve the mutually-exclusive conditional-render shape** — TUNE is not an accordion, exactly one view is mounted at a time, and when `tuneView` is null none of them render. `tests/ui/session-store.test.jsx` asserts exactly one element captioned "RPM" exists, which only holds because tab bodies render conditionally.

- [ ] **Step 4: Re-point `tests/ui/tune-screens.test.jsx` imports**

Change the three import paths and component names. **Do not change any assertion.**

- [ ] **Step 5: Run the tune tests**

Run: `npx vitest run tests/ui/tune-screens.test.jsx --pool=forks --poolOptions.forks.singleFork`

Expected: the three renamed screens' tests PASS. `EcuScreen`'s tests still fail — it has not been split yet.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui/screens/tune src/ui/EcuLab.jsx tests/ui/tune-screens.test.jsx
git commit -m "Rename TUNE's three unchanged screens to their new section names"
```

---

### Task 3: Split `EcuScreen` into `InjectorsScreen` and `SensorsScreen`

**Files:**
- Create: `src/ui/screens/tune/InjectorsScreen.jsx` + `InjectorsScreen.module.css`
- Create: `src/ui/screens/tune/SensorsScreen.jsx` + `SensorsScreen.module.css`
- Delete: `src/ui/screens/tune/EcuScreen.jsx` + `EcuScreen.module.css`
- Modify: `src/ui/EcuLab.jsx`
- Test: `tests/ui/tune-screens.test.jsx`

**Interfaces:**
- Consumes: `ROUTES.tune` from Task 1.
- Produces:
  - `InjectorsScreen({ dutyPreview, injectorCc })` — `dutyPreview` and `injectorCc` are the shell's multi-consumer derivations, passed as props exactly as `EcuScreen` took them.
  - `SensorsScreen({ needsMafRecal, chartData, result })` — same, unchanged from `EcuScreen`'s props.

**The seam already exists.** `EcuScreen.jsx` carries two `Eyebrow` headings — `Fuel System` at `:61` and `Fuel Control & MAF Scaling` at `:122`. Everything from `:122` to the end is Sensors; everything before it is split between Injectors and (in Task 4) BUILD.

**What goes where:**

| `EcuScreen.jsx` region | Destination |
|---|---|
| Fuel Octane `Seg` + its `ExpandableInfo` (`:65-71`) | **Task 4** — BUILD > Fuel System |
| Physical injector `PickList` (`:74`) | **Task 4** — BUILD > Fuel System |
| ECU Injector Scaling `Seg`, RESCALE `Button`, duty `Panel`, the two injector `ExpandableInfo`s (`:75-120`) | `InjectorsScreen` |
| `Fuel Control & MAF Scaling` `Eyebrow` onward — MAF panel, trim panel, both MAF `ExpandableInfo`s (`:122`-end) | `SensorsScreen` |

**Move the markup verbatim first, then adjust.** Copy the JSX across unchanged, get tests green, and only then reconcile the stylesheets. Two changes at once in a 150-line block means every failure has two candidate causes. This discipline found three wrong pixel values and a near-miss token substitution across PR 3b's four extractions.

`dutyDangerous` is computed inside `EcuScreen` (`:57`) off the shared `dutyPreview` and has exactly one reader — the duty panel. It moves to `InjectorsScreen` with that panel.

The two `Note`s at `:62-63` reference turbo state and read as fuel-side framing. They belong with `InjectorsScreen`; reword only if the text names a screen that no longer exists, and say so in the report if you do.

- [ ] **Step 1: Create both screens with markup moved verbatim**

Split the file at the second `Eyebrow`. Each new screen reads the store for itself:

```jsx
const [build, dispatch] = useBuild();
```

Do not thread domain state through props — the store exists so screens do not have to. The exception is the shell's multi-consumer derivations named in **Interfaces** above.

- [ ] **Step 2: Mount both in `EcuLab.jsx`, delete the old mount**

```jsx
{tab === 'tune' && tuneView === 'injectors' && <InjectorsScreen dutyPreview={dutyPreview} injectorCc={injectorCc} />}
{tab === 'tune' && tuneView === 'sensors' && <SensorsScreen needsMafRecal={needsMafRecal} chartData={chartData} result={result} />}
```

Remove the `EcuScreen` import and its mount line. Delete `EcuScreen.jsx` and `EcuScreen.module.css` with `git rm`.

- [ ] **Step 3: Run the tune tests and confirm only the expected failures**

Run: `npx vitest run tests/ui/tune-screens.test.jsx --pool=forks --poolOptions.forks.singleFork`

Expected: FAIL, on the `EcuScreen` import that no longer resolves. That is the signal to move to Step 4, not a defect.

- [ ] **Step 4: Re-point the `EcuScreen` tests onto the two new screens**

Split the existing `EcuScreen` describe block in two. Each assertion follows the control it was testing. **Do not weaken any assertion while moving it** — if a test seeded `injectorCc={12345}` to prove the screen uses the passed prop rather than deriving its own, it must still seed a fabricated value the component cannot compute itself.

- [ ] **Step 5: Add a test that the two screens are genuinely separate**

```js
it('keeps the MAF scalar off the injectors screen', () => {
  // The whole point of the split: `ecu` held two concerns. If the MAF controls
  // came along with the injector markup, the split did not happen — it renamed.
  mount(<InjectorsScreen dutyPreview={50} injectorCc={550} />);
  expect(screen.queryByText(/MAF/i)).toBeNull();
});

it('keeps injector scaling off the sensors screen', () => {
  mount(<SensorsScreen needsMafRecal={false} chartData={[]} result={null} />);
  expect(screen.queryByRole('button', { name: /RESCALE ECU/ })).toBeNull();
});
```

**Prove these bite:** temporarily render `SensorsScreen`'s body inside `InjectorsScreen`, confirm the first test goes red, restore from a scratch copy. Report what the failure said. A `queryBy…toBeNull()` on markup that was never there is the exact shape of an unfailable assertion, and this project has shipped eight of those.

- [ ] **Step 6: Reconcile the stylesheets, then audit against the verbatim commit**

Split `EcuScreen.module.css` into the two new stylesheets, dropping rules whose markup went to the other screen. Then diff the result against the pre-split commit by hand, value by value: every length, colour, weight, radius, gap, line-height and transition. Report what the audit found.

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run --pool=forks --poolOptions.forks.singleFork`

Expected: tune-screens PASS; `characterisation.test.jsx` and `build-store.test.jsx` still red — Tasks 4 and 6 fix those.

- [ ] **Step 8: Commit**

```bash
git add -A src/ui/screens/tune src/ui/EcuLab.jsx tests/ui/tune-screens.test.jsx
git commit -m "Split the ECU screen into Injectors and Sensors"
```

---

### Task 4: Create BUILD's Fuel System screen and move octane and injector hardware onto it

**Files:**
- Create: `src/ui/screens/build/FuelSystemScreen.jsx` + `FuelSystemScreen.module.css`
- Modify: `src/ui/screens/tune/InjectorsScreen.jsx` (remove the moved controls), `src/ui/EcuLab.jsx`
- Test: `tests/ui/build-screens.test.jsx`

**Interfaces:**
- Consumes: `InjectorsScreen` from Task 3; `ROUTES.build` from Task 1.
- Produces: `FuelSystemScreen({ active, onToggle })` — a `BuildSection` accordion screen, same prop shape as `EngineScreen`/`ExhaustScreen`.

**BUILD is an accordion, TUNE is not.** BUILD's sections stay mounted and hide with `max-height: 0` via `BuildSection`; `tests/ui/build-store.test.jsx` reaches a boost slider inside a *collapsed* section and `tests/ui/routing-shell.test.jsx` reads the inline `maxHeight` to tell open from closed. Follow `EngineScreen`'s shape, not `InjectorsScreen`'s. **Do not convert `BuildSection`'s inline styles to a stylesheet.**

**No reducer change.** Both controls already dispatch `SET_BUILD_FIELD` — they were build state on the tune tab. Moving them changes where they render, nothing else.

- [ ] **Step 1: Create the screen with the two controls moved verbatim**

Move from `InjectorsScreen` (originally `EcuScreen.jsx:65-74`): the Fuel Octane `Seg` and its `ExpandableInfo`, and the physical injector `PickList`. Wrap them in a `BuildSection` with `icon={Fuel} label="Fuel System"`.

Keep the dispatches exactly as written — `SET_BUILD_FIELD` on `octaneIdx` and `injIdx`, with the same `findIndex` lookups against `OCTANE_OPTS` and `INJECTOR_OPTS`.

- [ ] **Step 2: Remove those controls from `InjectorsScreen`**

`InjectorsScreen` keeps ECU injector scaling, RESCALE, the duty preview and the injector explainers. It must no longer render the octane picker or the physical injector `PickList`.

- [ ] **Step 3: Mount it in `EcuLab.jsx`'s BUILD block**

```jsx
<FuelSystemScreen active={buildSection === 'fuel'} onToggle={toggleBuildSection} />
```

Place it between Induction and Exhaust to match `ROUTES.build` order.

- [ ] **Step 4: Write the tests**

```js
it('sets the fuel octane on the build slice', () => {
  mount(<FuelSystemScreen active onToggle={noop} />);
  fireEvent.click(screen.getByRole('button', { name: '100' }));
  expect(screen.getByRole('button', { name: '100' }).getAttribute('aria-pressed')).toBe('true');
});

it('does not carry the ECU-side injector scaling across with the hardware', () => {
  // The hardware/calibration split is the whole point: what is FITTED lives here,
  // what the ECU BELIEVES is fitted lives on TUNE > Injectors. If the scaling Seg
  // came along with the PickList, the move flattened the distinction it exists for.
  mount(<FuelSystemScreen active onToggle={noop} />);
  expect(screen.queryByRole('button', { name: /RESCALE ECU/ })).toBeNull();
  expect(screen.queryByText('ECU Injector Scaling')).toBeNull();
});
```

**Prove the second one bites** by temporarily rendering the scaling `Seg` inside `FuelSystemScreen` and confirming it goes red. Report the failure text.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/ui/build-screens.test.jsx tests/ui/tune-screens.test.jsx --pool=forks --poolOptions.forks.singleFork`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui/screens/build src/ui/screens/tune src/ui/EcuLab.jsx tests/ui/build-screens.test.jsx
git commit -m "Give BUILD a Fuel System section and move the fuel hardware onto it"
```

---

### Task 5: Dissolve `boltons` into Induction and Exhaust

**Files:**
- Rename: `src/ui/screens/build/TurboScreen.jsx` → `InductionScreen.jsx` (+ `.module.css`)
- Delete: `src/ui/screens/build/BoltonsScreen.jsx` + `BoltonsScreen.module.css`
- Modify: `src/ui/screens/build/ExhaustScreen.jsx`, `src/ui/EcuLab.jsx`
- Test: `tests/ui/build-screens.test.jsx`

**Interfaces:**
- Consumes: `ROUTES.build` from Task 1.
- Produces: `InductionScreen({ active, onToggle })` — same prop shape `TurboScreen` had.

**The three bolt-ons and where each goes** (`MOD_INFO`, `src/sim/hardware.js:222`):

| Key | Label | Destination |
|---|---|---|
| `intake` | Cold Air Intake | `InductionScreen` |
| `exhaust` | Cat-Back Exhaust | `ExhaustScreen` |
| `headers` | Long-Tube Headers | `ExhaustScreen` |

**The card markup is not a `Button`.** `BoltonsScreen` uses a plain `<button disabled={mods[key]}>` where `disabled` means *installed*, styled via `data-installed`. That is not a `Button` variant state — **move the markup as it is** and do not convert it.

The cards iterate `Object.keys(MOD_INFO)`. After the split each destination renders only its own subset, so replace the full iteration with an explicit per-screen list. **Keep `MOD_INFO` as the source of label and blurb** — do not copy strings out of it, or the catalogue stops being the single source of truth.

- [ ] **Step 1: Rename Turbo to Induction**

```bash
git mv src/ui/screens/build/TurboScreen.jsx src/ui/screens/build/InductionScreen.jsx
git mv src/ui/screens/build/TurboScreen.module.css src/ui/screens/build/InductionScreen.module.css
```

Rename the component and its `styles` import; change the `BuildSection` label from `Forced Induction` to `Induction`. Re-point the import and mount condition in `EcuLab.jsx` to `buildSection === 'induction'`.

- [ ] **Step 2: Move the `intake` card into `InductionScreen`, the other two into `ExhaustScreen`**

Extract the card markup from `BoltonsScreen.jsx:59-70` verbatim. Give each destination a small local list of the keys it owns:

```jsx
const MODS_HERE = ['intake'];              // InductionScreen
const MODS_HERE = ['exhaust', 'headers'];  // ExhaustScreen
```

and iterate that instead of `Object.keys(MOD_INFO)`, still reading `MOD_INFO[key].label` and `.blurb`.

- [ ] **Step 3: Add a test that every bolt-on still has a home**

```js
it('leaves no bolt-on without a screen', () => {
  // `boltons` dissolved into Induction and Exhaust. A fourth mod added to MOD_INFO
  // later would otherwise be installable by nothing — this fails the day that happens.
  mount(<InductionScreen active onToggle={noop} />);
  const onInduction = Object.keys(MOD_INFO).filter((k) => screen.queryByText(MOD_INFO[k].label));
  cleanup();
  mount(<ExhaustScreen active onToggle={noop} idealExhaustDia={2.5} />);
  const onExhaust = Object.keys(MOD_INFO).filter((k) => screen.queryByText(MOD_INFO[k].label));
  expect([...onInduction, ...onExhaust].sort()).toEqual(Object.keys(MOD_INFO).sort());
});
```

This is the guard that makes dissolving the section safe: it fails if a mod is orphaned *or* if one is rendered on both screens.

- [ ] **Step 4: Delete `BoltonsScreen` and its mount**

```bash
git rm src/ui/screens/build/BoltonsScreen.jsx src/ui/screens/build/BoltonsScreen.module.css
```

Remove the import and the `<BoltonsScreen …/>` line from `EcuLab.jsx`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/ui/build-screens.test.jsx --pool=forks --poolOptions.forks.singleFork`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A src/ui/screens/build src/ui/EcuLab.jsx tests/ui/build-screens.test.jsx
git commit -m "Dissolve Bolt-On Parts into the sections that own each part's physics"
```

---

### Task 6: Re-point the sub-tab switcher, the characterisation tests, and the Seg walk

**Files:**
- Modify: `src/ui/EcuLab.jsx` (`TUNE_VIEWS`), `tests/ui/characterisation.test.jsx`, `tests/ui/build-store.test.jsx`, `tests/ui/button-call-sites.test.jsx`

**Interfaces:**
- Consumes: every screen from Tasks 2-5.

This is the task where the app becomes coherent again and the two long-frozen tests change.

- [ ] **Step 1: Rewrite `TUNE_VIEWS` in `EcuLab.jsx`**

```jsx
const TUNE_VIEWS = [
  { id: 'airflow', label: 'AIRFLOW', icon: Grid3x3 },
  { id: 'spark', label: 'SPARK', icon: Zap },
  { id: 'fuel', label: 'FUEL', icon: Droplets },
  { id: 'injectors', label: 'INJECTORS', icon: Fuel },
  { id: 'sensors', label: 'SENSORS', icon: Activity },
];
```

Five items in a row that fitted four will crowd at narrow widths. Check it wraps or scrolls rather than overflowing, and if you add a media query, add the file to the breakpoint list in `src/ui/tokens.css`. `Activity` is already imported in `EcuLab.jsx` for the DYNO nav icon — reuse it rather than adding an import.

- [ ] **Step 2: Update the characterisation tests' queries — and only their queries**

At `tests/ui/characterisation.test.jsx:85`:

```js
TUNE: () => screen.getByRole('button', { name: 'AIRFLOW' }), // TUNE_VIEWS sub-tab
```

Line 88's `screen.getByText('Garage')` is the BUILD `Eyebrow` in `EcuLab.jsx:838` and is untouched by the re-sectioning — **verify it still renders and leave it alone.**

Then update the file's header comment. It currently says these tests pin behaviour "before its state moves" for PR 2. Add a line recording that this is the first change since they were written, what changed (queries only, because sections were renamed), and that the assertions are untouched.

- [ ] **Step 3: Prove the characterisation tests still bite**

Their whole value is that they were frozen. Having edited them, demonstrate they still fail for the right reasons: break the tab switch in `EcuLab.jsx` (make `changeTab` a no-op), confirm the navigation test goes red, restore from a scratch copy. Report the failure text.

- [ ] **Step 4: Rewrite `build-store.test.jsx`'s Seg walk**

The walk at `:558-564` clicks `TUNE` then `ECU`. `ECU` no longer exists. Fuel Octane is now on BUILD > Fuel System (an accordion section, reachable without a sub-tab click) and ECU Injector Scaling is on TUNE > Injectors.

Rewrite the navigation to reach both, re-count, and set the total from what the code actually contains. Expect 8 — three `EngineScreen`, one `InductionScreen`, one `ExhaustScreen`, one `FuelSystemScreen`, one `InjectorsScreen`, one `EcuLab.jsx:906` — but **derive it, do not assume it.** Update the comment that says "Eight is the count of `<Seg>` call sites in EcuLab.jsx today", which was already stale before this task.

- [ ] **Step 5: Re-measure the Button floor**

```bash
grep -oh '<Button' src/ui/EcuLab.jsx src/ui/AppShell.jsx $(find src/ui/screens src/ui/components -name '*.jsx') | wc -l
```

Set `toBeGreaterThanOrEqual` to that number if it rose. **Never lower it.**

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run --pool=forks --poolOptions.forks.singleFork`

Expected: everything green. Per-file counts to sanity-check: `characterisation.test.jsx` **8**, `session-store.test.jsx` **14**, `routing-shell.test.jsx` **9**, `button-call-sites.test.jsx` **5**.

- [ ] **Step 7: Commit**

```bash
git add -A src/ui/EcuLab.jsx tests/
git commit -m "Re-point the sub-tab switcher and the tests onto the new sections"
```

---

### Task 7: Sweep, verify, and open the PR

**Files:** none changed unless the sweep finds something.

- [ ] **Step 1: Prove no string was dropped**

Four screens' worth of markup moved between tabs. PR 3b lost the app's branding this way and no test caught it, because static text with no test attached is invisible to test-based grading.

Extract user-visible string literals (JSXText plus `title`/`aria-label`/`alt`/`placeholder`/`label` attributes) from `git show origin/main:src/ui/screens/tune/EcuScreen.jsx` and `BoltonsScreen.jsx`, and from the new screens. Diff the sets. Investigate every string present before and absent now.

Expect legitimate absences — a heading that was deliberately reworded, text that moved into a `.module.css`. **Report each difference and your judgement on it**, rather than assuming all or none are bugs.

- [ ] **Step 2: Prove the physics never moved**

```bash
git diff origin/main --stat -- src/sim/ tests/fixtures/ tests/fingerprint.test.js package.json package-lock.json
```

Expected: **no output.**

- [ ] **Step 3: The full gate**

```bash
node --version    # v20.x or v22.x
npx vitest run --pool=forks --poolOptions.forks.singleFork
npm run lint && npm run typecheck && npm run build
```

- [ ] **Step 4: Re-sync and re-run**

```bash
git fetch origin
git rebase origin/main
```

**Do not use `--autostash`** — it pops the tracked `node_modules` symlink over the real directory. If the working tree is dirty, commit deliberately first. A pre-rebase green says nothing about the post-rebase tree, so re-run Step 3 in full afterwards.

- [ ] **Step 5: Open the PR**

State: the new route shape and that section **ids** changed, so old deep links like `#/tune/ve` now degrade to the tab (and why that is the designed behaviour rather than a break); the hardware-vs-calibration split and why `RESCALE` is what makes it legible; that `boltons` dissolved rather than being renamed, and where each of the three parts went; **that `characterisation.test.jsx` changed for the first time since it was written, that only queries changed, and the evidence it still bites**; the re-counted Seg total and Button floor; and that nobody has loaded this app in a browser — recommend a manual pass, naming TUNE's five-item switcher at narrow widths as the thing most likely to look wrong.

Close #83, reference #6, note that #85 (the advisor panel) depends on this.

- [ ] **Step 6: Confirm no auto-merge is queued**

```bash
gh pr view --json autoMergeRequest
```

Expected `null`. **Do not merge this PR.**

---

## Notes for the implementer

**`characterisation.test.jsx` is the safety net for content movement, and this is the PR where it stops being frozen.** It has been byte-identical through seven merged PRs. Change queries, never assertions. A weakened assertion here removes the only evidence that the four extractions of PR 3b did not silently move content.

**Move markup before restyling it.** Verbatim first, tests green, then stylesheets. This found three wrong pixel values and a near-miss token substitution across PR 3b's four extractions — it is not ceremony.

**Line numbers in this plan are from `1bb4fea` and will drift as you delete markup.** Locate by content — the section label, the heading text. Three tasks in this project were handed stale line numbers and all three correctly ignored them.

**Eight assertions that could not fail have shipped during this overhaul**, twice inside fixes written to close a previous one. Two recent traps: jsdom's `getAllByRole` finds elements hidden by `max-height:0`/`opacity:0` (it excludes only `display:none`, `hidden` and `aria-hidden`), so a "clicking revealed X" test is unfailable unless it asserts on the open/closed marker; and a test that computes its expected value from the same formula and inputs the store's defaults produce cannot detect a screen that re-derives internally. For anything you add: break what it guards, watch it fail, restore. If you cannot make it bite, report that rather than shipping it.
