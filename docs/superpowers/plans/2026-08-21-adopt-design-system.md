# Adopt the Design System (PR 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `src/ui/EcuLab.jsx` use the nine primitives PR 1 built for it, delete the eight duplicate components it still defines instead, and fix the four findings PR 1's review carried forward — all inside one file, with no structural movement.

**Architecture:** Pure substitution. Each task swaps one duplicate component for its primitive across every call site, deletes the copy, and runs the behavioural suites. The render stays monolithic; splitting it into screens is #59.

**Tech Stack:** React 18, CSS Modules, Vitest + @testing-library/react, JSDoc types checked by `tsc --checkJs`. No new dependencies.

## Global Constraints

- **Node 20 or 22 only — never 26.** `.nvmrc` pins 22. Newer V8 shifts float results and invalidates the fingerprint hash.
- **`tests/fingerprint.test.js` must stay green and must NEVER be regenerated.** Never run `npm run test:fingerprint:update`.
- **No changes to `src/sim/`, `tests/fixtures/`, `package.json` or `package-lock.json`.**
- **No new dependencies.**
- **`tests/ui/characterisation.test.jsx` must stay byte-identical and green.** It has been unchanged since it was written and pins the flows this PR touches.
- In `tests/ui/build-store.test.jsx` and `tests/ui/session-store.test.jsx`, setup may change if a migration genuinely invalidates a precondition; **assertions may not.**
- `src/ui/EcuLab.jsx` carries `@ts-nocheck`; `src/ui/primitives/`, `src/ui/state/` and `tests/` ARE typechecked. `npm run typecheck` must exit 0.
- No vitest globals and no setup file: import every helper explicitly from `vitest`; component tests call `afterEach(cleanup)`; jsdom is opt-in via `// @vitest-environment jsdom` as the literal first line.
- ESLint `no-undef` and `no-unused-vars` are active; `npm run lint` must exit 0. Deleting a component orphans its imports — expect lint to catch that and fix it in the same task.
- **NEVER run a bare `git stash` in this repo.** `node_modules` is tracked as a self-referential symlink; stashing deletes the real installed directory and breaks vitest and tsc. Use `cp` to a scratch path.
- `git status` permanently shows ` D node_modules`. **Never stage it.** `git add` explicit paths only, never `git add -A`.
- macOS: BSD `sed` has no `\b`. Prefer explicit edits over `sed` on this file.
- Capture exit codes on the line **after** the command, never after a pipe.
- Branch is `feat/74-adopt-design-system`. Never commit to `main`.
- Every commit message ends with the repo's `Co-Authored-By:` and `Claude-Session:` trailers.

## The rule this PR is enforcing

PR 1 established it and this file still breaks it in three places:

> **The accent is never a status, and a status is never decoration.**

A status colour (`ok`/`warn`/`danger`) means something is healthy, marginal or wrong. Using one because it looks nice — a chart series, a stepper button — teaches the player to ignore it, which is exactly when a real alarm stops working.

## What this PR is NOT

Not the screen split. Not routing. Not the sidebar shell. The component stays one file and the render does not move. That is #59, and it depends on this landing first.

## The visual-regression problem, stated up front

The behavioural suites pin behaviour, not pixels. **Nothing in this repo catches a visual regression, and nobody has loaded the app in a browser during the overhaul.** Every task here changes how something looks.

Two mitigations, both mandatory:

1. **One primitive per commit.** A reviewer can hold "did Panel's 15 sites survive" in their head; they cannot hold "did 100 substitutions survive".
2. **Every deliberate visual change gets recorded in the task's report** — not just the ones this plan predicts. If a migration changes spacing, weight, or colour anywhere, say so. An unrecorded visual change is indistinguishable from a mistake at review time.

## Known deliberate visual changes

These are intended. Anything else you find is a finding.

| Where | Change | Why |
|---|---|---|
| Intercooler toggle | loses its cyan switch, becomes accent like every other toggle | `Toggle` has no `color` prop, and a series colour decorating one control is the rule above being broken |
| AFR + timing chart series | `T.ok`/`T.warn` → `T.cyan`/`T.violet` | permanent chart lines must not wear alarm colours |
| Duty-cycle preview | inline bands → `Bar` with `higherIsBetter={false}` | deletes the second copy of `utilisationColor`'s thresholds |

## Primitive APIs (verified against `src/ui/primitives/` on `main`)

```
Button   ({ children, variant='primary'|'ghost'|'danger'|'quiet', size='md', block=false, type='button', ...rest })
Panel    ({ children, tight=false, as='div', ...rest })          // rest spreads onto the element
Eyebrow  ({ children, icon })
Note     ({ children, tone='info'|'warn'|'danger' })
StatTile ({ label, value, unit, tone='neutral'|'acc'|'ok'|'warn'|'danger' })
Bar      ({ label, value, max=100, higherIsBetter=true })
Seg      ({ label, options: [{id,label,icon?}], value, onChange, equal=false })
Select   ({ label, groups: [{label, options:[{value,label}]}], extra=[], value, onChange })
Toggle   ({ label, sub, checked, onChange })
```

## Call-site inventory (measured on `main`, `3544b11`)

| Duplicate in EcuLab.jsx | Primitive | Sites | Complication |
|---|---|---|---|
| `Eyebrow` (:59) | `Eyebrow` | 11 | none — identical shape |
| `Note` (:73) | `Note` | 8 | none — primitive adds a `danger` tone the copy lacked |
| `Panel` (:67) | `Panel` | 15 | **14 pass `style`** |
| `StatTile` (:194) | `StatTile` | 10 | all 10 pass `color`; enum has no value for 3 of them |
| `HealthBar` (:203) | `Bar` | 3 | plus 2 inline duty-band copies to fold in |
| `Seg` (:103) | `Seg` | 8 | `{value,label}` → `{id,label}`; 1 passes `wrap` |
| `GroupedSelect` (:145) | `Select` | 1 | needs an accessible `label` |
| `ToggleRow` (:180) | `Toggle` | 2 | 1 passes `color={T.cyan}` |
| raw `<button>` | `Button` | 34 | 15 carry `width: '100%'` |

`PickList` (:121, 2 sites) has **no** primitive equivalent and stays. Do not invent one.

---

### Task 1: Eyebrow and Note — prove the pattern

**Files:**
- Modify: `src/ui/EcuLab.jsx`

**Interfaces:**
- Consumes: `Eyebrow`, `Note` from `src/ui/primitives/`.
- Produces: the migration pattern every later task repeats.

These two are first because their shapes are identical to the copies, so nothing but the import changes. If a suite goes red here, the problem is the harness, not the migration — sort that out before Task 2 rather than debugging it under a real transform.

- [ ] **Step 1: Confirm the shapes really are identical**

```bash
sed -n '59,66p;73,83p' src/ui/EcuLab.jsx
sed -n '/export function Eyebrow/,/^}/p' src/ui/primitives/Eyebrow.jsx
sed -n '/export function Note/,/^}/p' src/ui/primitives/Note.jsx
```

`Note`'s copy handles `info` and `warn` and silently falls back to `info` for anything else. The primitive adds `danger` and puts `role="alert"` on it. No call site passes `danger` today, so this is additive — but check that claim rather than trusting it:

```bash
grep -n '<Note' src/ui/EcuLab.jsx | grep -c 'danger'
```
Expected: **0**.

- [ ] **Step 2: Import the primitives and delete the copies**

Add to the import block near the top of `EcuLab.jsx`:

```jsx
import { Eyebrow } from './primitives/Eyebrow.jsx';
import { Note } from './primitives/Note.jsx';
```

Delete the local `const Eyebrow = ...` (:59-65) and `const Note = ...` (:73-83). Leave every call site untouched — that is the point of going first with these two.

- [ ] **Step 3: Let lint find the orphans**

```bash
npm run lint > /tmp/lint.txt 2>&1; echo "EXIT=$?"
```

Deleting `Note` orphans the `Info` icon import from `lucide-react` if nothing else uses it. Check before removing it — `Info` may well appear elsewhere:

```bash
grep -n '<Info' src/ui/EcuLab.jsx
```

Remove only what is genuinely unused. Lint must exit 0.

- [ ] **Step 4: Run the behavioural suites**

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
```
Expected: PASS. `characterisation.test.jsx` must not be edited.

- [ ] **Step 5: Commit**

```bash
git add src/ui/EcuLab.jsx
git commit -m "Use the Eyebrow and Note primitives instead of local copies"
```

---

### Task 2: Panel — and the fourteen style overrides

**Files:**
- Modify: `src/ui/EcuLab.jsx`

**Interfaces:**
- Consumes: `Panel` from `src/ui/primitives/Panel.jsx`.

The copy is `({children, style, tight})` and merges `...style` **last**, so a call site can override the panel's own background, border and radius. The primitive is `({children, tight, as, ...rest})` and sets its look in CSS — an inline `style` still wins, because inline beats a class.

So the mechanical swap works. That is the trap: it works while leaving fourteen inline overrides in place, several of which exist only to restate what the panel already does. Migrating without reading them ships the duplication into #59, where it gets copied into fourteen screen files.

- [ ] **Step 1: Read all fifteen call sites and classify each**

```bash
python3 - <<'PY'
import re
s = open('src/ui/EcuLab.jsx').read()
for m in re.finditer(r'<Panel(?=[\s/>])', s):
    i, depth = m.end(), 0
    while i < len(s):
        c = s[i]
        if c == '{': depth += 1
        elif c == '}': depth -= 1
        elif c == '>' and depth == 0:
            print(f"line {s[:m.start()].count(chr(10))+1}: {' '.join(s[m.start():i+1].split())}")
            break
        i += 1
PY
```

Sort each `style` prop into one of three buckets and record the classification in your report:

1. **Restates the panel's own look** (`background: T.panel2`, `border: 1px solid ${T.line}`, `borderRadius: 12`, the default padding) — **delete it.** The primitive already does this.
2. **Layout the panel does not own** (`marginTop`, `flex`, `display`, `gap`, `minWidth`) — **keep it**, passed through `...rest`.
3. **Deliberately different from the primitive** (a different background for emphasis, say) — **keep it, and say so in your report.** This is the bucket that hides real visual intent, so do not collapse one into bucket 1 because it looks close.

- [ ] **Step 2: Import the primitive, delete the copy, apply the classification**

```jsx
import { Panel } from './primitives/Panel.jsx';
```

Delete the local `const Panel = ...` (:67-71). Apply your bucket decisions.

- [ ] **Step 3: Verify nothing lost its box**

A panel whose style you emptied should still render as a panel. Confirm the primitive's class is actually applied:

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
npm run lint > /tmp/l.txt 2>&1; echo "EXIT=$?"
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/EcuLab.jsx
git commit -m "Use the Panel primitive, dropping styles that restated its own look"
```

---

### Task 3: StatTile — and the two tones the enum is missing

**Files:**
- Modify: `src/ui/primitives/StatTile.jsx`, `src/ui/primitives/StatTile.module.css`
- Modify: `src/ui/theme.js`
- Modify: `src/ui/EcuLab.jsx`
- Test: `tests/ui/readouts.test.jsx` (holds `describe('StatTile')` and `describe('Bar')`), `tests/theme.test.js` (note: NOT under `tests/ui/`)

**Interfaces:**
- Produces: `StatTile`'s `tone="alt"`; `statusTone(v)` exported from `src/ui/theme.js`.

**Two defects in the primitive itself, found while planning. Fix these FIRST — migrating
before you do would ship an accessibility regression on ten tiles.**

**Correction to an earlier draft of this section:** I first measured these against
`panel2`, the *local copy's* background. The primitive's `.tile` is `var(--panel)`
(`#131824`), so those are the numbers that matter. The conclusion is unchanged — the label
still fails AA — but the figures below are the correct ones.

| Element | Local copy (on panel2) | Primitive (on **panel**) | Verdict | Needs |
|---|---|---|---|---|
| `.label` (~9.5px, **small text**) | `T.ink2` 5.14:1 | `--ink3` **3.17:1** | **FAILS AA** | 4.5:1 |
| `.acc .value` (large text) | `T.accInk` 8.69:1 | `--acc` 6.46:1 | passes | 3:1 |

With `.label` on `--ink2` the primitive measures 5.67:1, and `.acc .value` on `--acc-ink`
measures 9.57:1.

1. **`.label` must not use `--ink3`.** At 2.87:1 it fails WCAG AA for small text; the copy
   it replaces passed at 5.14:1. Change `.label` to `var(--ink2)`. This is the same class
   of defect PR 1's own review found when RUN DYNO PULL rendered at 1.14:1 — a token
   chosen for hierarchy without checking it against the surface it lands on.

2. **`.acc .value` should use `var(--acc-ink)`, not `var(--acc)`.** Every call site passes
   `T.accInk` today. `accInk` is the readable-on-dark variant and exists for exactly this;
   `--acc` is the interactive accent. Using it here both dims the figure (8.69 → 5.86)
   and spends the interactive colour on something that is not interactive — the rule this
   PR enforces, in its quieter form. Compare `Note`, which correctly uses `warnInk` for
   text on a warn surface.

Both are primitive-level fixes with primitive-level tests, and they belong here because
this is the task that first puts `StatTile` on screen. Add a contrast assertion so neither
can regress:

```js
it('keeps the label readable on the surface it sits on', () => {
  // ~9.5px is small text: WCAG AA wants 4.5:1. This failed at 2.87:1 with --ink3,
  // which is a hierarchy token, not a legibility one.
  expect(Number(contrast(tokens.ink2, tokens.panel2))).toBeGreaterThanOrEqual(4.5);
});
```

**There is no contrast helper in this repo** — I checked. PR 1's contrast findings, including
the 1.14:1 one, were all caught by human review, which is exactly why this pair survived
into a shipped primitive. Write a small one in the test file you are already editing:
relative luminance per WCAG, then `(lighter + 0.05) / (darker + 0.05)`. Roughly fifteen
lines.

Keep it to the two pairs this task needs. Sweeping every token combination in the design
system is a real and worthwhile job, but it is not this task — if you notice other failing
pairs while you are in there, **report them rather than fixing them**, and they will be
triaged.

---

All ten call sites pass a raw `color`. The primitive takes a semantic `tone` of `neutral|acc|ok|warn|danger`. Three of the ten cannot be expressed:

```
:1288  CAREER TOTAL  color={T.cyan}
:1295  PEAK TORQUE   color={T.cyan}
:2040  PEAK TQ       color={T.cyan}
```

Read those three in context before deciding anything. Each sits **beside** a figure in `T.accInk` — `PEAK WHP` next to `PEAK TQ`, `BEST PULL` next to `CAREER TOTAL`. The cyan is a *pairing* device: two related quantities, told apart at a glance. It is not a status and it is not arbitrary.

`neutral` would erase the pairing. `acc` would erase it harder, by making both tiles identical.

**Add a fifth tone, `alt`.** Name it for what it means — the second quantity in a paired readout — not for the colour it happens to use. Document it in the primitive's JSDoc as never being a status.

The other two are dynamic:

```
:1299  TUNING     color={statusColor(scores.tuning.score)}
:1300  ENGINEER   color={statusColor(scores.engineer.score)}
```

Do **not** inline the thresholds as `score >= 90 ? 'ok' : ...`. `theme.js` already warns that duplicated bands drift apart, and this PR exists partly to delete one such duplicate. Add a `statusTone` beside `statusColor`, deriving from the same comparison so the two cannot disagree.

- [ ] **Step 1: Write the failing tests**

Append to `tests/theme.test.js` — it already imports `T, heat, statusColor, utilisationColor`, so extend that import with `statusTone`:

```js
describe('statusTone', () => {
  it('names the same band statusColor paints', () => {
    // The point of having both is that a caller who needs a token and a caller who
    // needs a semantic name cannot end up on different sides of a threshold.
    const cases = [100, 95, 90, 89, 60, 55, 54, 20, 0];
    const map = { ok: T.ok, warn: T.warn, danger: T.danger };
    cases.forEach((v) => {
      expect(map[statusTone(v)]).toBe(statusColor(v));
    });
  });

  it('returns exactly the three status names', () => {
    expect(new Set([100, 60, 10].map(statusTone))).toEqual(new Set(['ok', 'warn', 'danger']));
  });
});
```

Append to `describe('StatTile')` in `tests/ui/readouts.test.jsx`:

```jsx
it('gives the alt tone its own class, distinct from the partner it sits beside', () => {
  // `alt` marks the second quantity in a paired readout — torque beside power. If it
  // resolved to the same colour as its partner the pairing would be invisible, which
  // is the whole reason the tone exists.
  const { container } = render(<StatTile label="PEAK TQ" value={300} tone="alt" />);
  expect(container.querySelector(`.${tileStyles.alt}`)).toBeTruthy();
  expect(container.querySelector(`.${tileStyles.acc}`)).toBeNull();
});
```

That follows the file's existing pattern — `applies the tone it is given` queries
`` `.${tileStyles.warn}` `` off the imported stylesheet object rather than reading a hashed
className off the DOM node. Use the same import that test uses.

- [ ] **Step 2: Run them and watch them fail**

```bash
npx vitest run tests/theme.test.js tests/ui/readouts.test.jsx > /tmp/t.txt 2>&1; echo "EXIT=$?"
```
Expected: FAIL — `statusTone is not defined`, and `tone="alt"` producing no distinct class.

- [ ] **Step 3: Implement**

In `src/ui/theme.js`, beside `statusColor`:

```js
/**
 * The NAME of the band `statusColor` paints, for consumers that take a semantic tone
 * rather than a colour — `StatTile`, and anything else with a token-driven variant.
 *
 * Derived from the same comparison as `statusColor` rather than repeating its
 * thresholds, because two copies of a band drift apart and then disagree about
 * whether the same number is a warning.
 *
 * @param {number} v 0-100
 * @returns {'ok'|'warn'|'danger'}
 */
export const statusTone = (v) => (v >= 90 ? 'ok' : v >= 55 ? 'warn' : 'danger');
```

In `StatTile.module.css`, add an `.alt` rule using `var(--cyan)`. In `StatTile.jsx`, add `'alt'` to the tone union in the JSDoc and note what it is for.

- [ ] **Step 4: Migrate the ten call sites**

```
color={T.accInk}                    → tone="acc"
color={T.ink}                       → (drop it — neutral is the default)
color={T.cyan}                      → tone="alt"
color={statusColor(scores.x.score)} → tone={statusTone(scores.x.score)}
```

- [ ] **Step 5: Delete the copy and verify**

Delete the local `function StatTile` (:194-201). Then:

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
npm run lint > /tmp/l.txt 2>&1; echo "EXIT=$?"
npm run typecheck > /tmp/tc.txt 2>&1; echo "EXIT=$?"
```

`typecheck` matters here: `StatTile.jsx` is typechecked and you widened a union.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme.js src/ui/primitives/StatTile.jsx src/ui/primitives/StatTile.module.css src/ui/EcuLab.jsx tests/theme.test.js tests/ui/readouts.test.jsx
git commit -m "Give StatTile a paired-quantity tone, and name the status bands once"
```

---

### Task 4: Bar — and deleting the second copy of the duty bands

**Files:**
- Modify: `src/ui/EcuLab.jsx`
- Modify: `src/ui/theme.js` (comment only)
- Test: `tests/ui/readouts.test.jsx`

**Interfaces:**
- Consumes: `Bar` from `src/ui/primitives/Bar.jsx`, `utilisationColor` from `src/ui/theme.js`.

Two different readouts collapse into one primitive here, and they point in opposite directions.

`HealthBar` (3 sites) shows component wear: **high is good**, so `higherIsBetter` defaults to true and those sites need no extra prop.

The injector duty preview is the opposite: **high is dangerous**. It is currently drawn inline, twice, with its own copy of the thresholds:

```
:312   const zoneColor = pct > 0.9 ? T.danger : pct > 0.75 ? T.warn : T.ok;   // 0-1 scale
:1961  background: dutyPreview > 90 ? T.danger : dutyPreview > 75 ? T.warn : T.ok   // 0-100
```

`theme.js`'s `utilisationColor` carries exactly those bands and its docstring says, in as many words, that the inline copy must be changed together with it *until that panel moves onto `Bar`*. This is that moment. `Bar` already calls `utilisationColor` when `higherIsBetter={false}`.

**Read `:312` before assuming it is the same thing.** It is on a 0-1 scale and belongs to `DialMark`, a gauge, not a bar. It may not be a `Bar` at all. If it is not, leave the markup alone but still route its colour through `utilisationColor(pct * 100)` so the thresholds live in one place — and say in your report which of the two you did and why.

- [ ] **Step 1: Confirm `Bar` already has the direction right — do not add a test**

`describe('Bar')` in `tests/ui/readouts.test.jsx` already pins this, in three tests better
than one would be: `inverts the scale when a high value is the dangerous end`, `reads an
ordinary duty cycle as healthy, not as an alarm` (60% duty must NOT be a warning), and
`reads a duty cycle with no headroom left as dangerous`.

Read them, satisfy yourself the primitive is correct, and move on. **Adding another
direction test here would be duplicate coverage.** Note the pattern those tests use —
`container.querySelector('[data-fill]')`, a data attribute rather than a hashed CSS Module
class — if you need to query a fill anywhere.

- [ ] **Step 2: Migrate the three HealthBar sites**

```jsx
import { Bar } from './primitives/Bar.jsx';
```

`<HealthBar label="Piston" value={health.piston} />` → `<Bar label="Piston" value={health.piston} />`.

Delete the local `function HealthBar` (:203-216).

- [ ] **Step 3: Move the duty preview onto Bar**

Replace the hand-rolled bar at `:1961` with `<Bar label={...} value={dutyPreview} higherIsBetter={false} />`. Keep whatever surrounding text the panel has — only the bar itself moves.

`:1963` colours a caption with `dutyPreview > 90 ? T.dangerInk : T.inkSoft`. That is a *third* copy of the 90 threshold. Route it through `utilisationColor` too, or leave it and say why in your report — but do not leave it unexamined.

- [ ] **Step 4: Update theme.js's now-stale instruction**

`utilisationColor`'s docstring tells the reader the inline copy exists and must be kept in sync. Once it does not, that comment is a lie that will send someone hunting. Rewrite it to say the bands now live here alone.

- [ ] **Step 5: Verify the thresholds really are gone**

```bash
grep -n '> 90 ?\|> 75 ?\|> 0.9 ?\|> 0.75 ?' src/ui/EcuLab.jsx
```
Anything left must be deliberate and explained in your report.

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
npm run lint > /tmp/l.txt 2>&1; echo "EXIT=$?"
```

- [ ] **Step 6: Commit**

```bash
git add src/ui/EcuLab.jsx src/ui/theme.js tests/ui/readouts.test.jsx
git commit -m "Move health and duty readouts onto Bar, deleting the duplicated bands"
```

---

### Task 5: Seg and Select

**Files:**
- Modify: `src/ui/EcuLab.jsx`

**Interfaces:**
- Consumes: `Seg`, `Select` from `src/ui/primitives/`.

`Seg`'s options shape changed and every one of the 8 sites needs a real transform:

```
copy:      options={[{ value, label }]}   value={selected}  onChange  wrap
primitive: options={[{ id, label, icon? }]}  value={selected}  onChange  equal  label (REQUIRED)
```

`label` is new and mandatory — it is the group's accessible name, which the copy never had. **Do not pass a placeholder.** Each Seg is a real choice with a real name; read the surrounding markup and use the label the player already sees (the section heading, the field caption). A generic `label="options"` is worse than useless: it makes the a11y tree lie while looking done.

Exactly one site passes `wrap` — the injector-size picker. That becomes `equal`, which is the primitive's name for the same intent (equal-width, wrapping).

`GroupedSelect` → `Select` is a single site, the engine preset picker, and also needs a `label`.

- [ ] **Step 1: List the sites and their real names**

```bash
grep -n '<Seg' src/ui/EcuLab.jsx
grep -n '<GroupedSelect' src/ui/EcuLab.jsx
```

For each, read the enclosing block and write down the human name of the choice. Put that table in your report — a reviewer cannot check an accessible name they cannot see.

- [ ] **Step 2: Migrate**

The options transform is mechanical but must be done per site, because several build their options inline from a catalogue:

```jsx
// before
<Seg options={OCTANE_OPTS.map((o) => ({ label: o.label, value: o.label }))} value={...} onChange={...} />
// after
<Seg label="Fuel octane" options={OCTANE_OPTS.map((o) => ({ label: o.label, id: o.label }))} value={...} onChange={...} />
```

Delete the local `function Seg` (:103-119) and `function GroupedSelect` (:145-178).

**`PickList` (:121) stays.** It has no primitive and this PR does not create one.

- [ ] **Step 2b: Pin the transform at the call sites, not just in the primitive**

Task 4's review proved the hole this closes: it set `higherIsBetter={true}` on the duty
`Bar` — a 95%-duty injector painted bright green — and **all 179 tests passed**. `Bar`'s
three direction tests render the primitive in isolation and say nothing about the props
the app hands it.

`Seg` has the same hole, and a nastier failure. If a call site keeps the old
`{value, label}` shape, every option gets `id: undefined`, so:

- `aria-pressed={undefined === value}` is false for **every** option — no selection shows
- `onClick={() => onChange(undefined)}` — clicking a choice writes `undefined` into the
  build, and the sim gets garbage

It renders. It looks nearly right. Nothing in lint or typecheck can see it, because
`EcuLab.jsx` carries `@ts-nocheck`.

**Write one test that covers all eight sites and cannot drift**, rather than eight tests
naming them. Render the app, walk every `role="group"` the screen exposes, and assert each
has exactly one option with `aria-pressed="true"`:

```jsx
it('every segmented control shows exactly one option as selected', () => {
  // A Seg still passed the old {value,label} shape renders every option with
  // id: undefined, so aria-pressed is false on all of them and onChange fires with
  // undefined. The control looks almost right and silently writes garbage. Counting
  // pressed options catches that without naming a single call site — so a ninth Seg
  // added later is covered the day it appears.
  launch();
  const groups = screen.getAllByRole('group');
  expect(groups.length).toBeGreaterThan(0);   // guard: prove we actually found Segs
  groups.forEach((group) => {
    const pressed = within(group).getAllByRole('button', { pressed: true });
    expect(pressed).toHaveLength(1);
  });
});
```

Segs live on several tabs, so one `launch()` will not reveal all eight. Visit each tab that
holds one and run the same check — or write it as a helper called per tab. Say in your
report which tabs you covered and how many groups each revealed, so the total is auditable
against the eight known sites.

**Prove it bites:** revert one call site to `{ value, label }` and confirm the test fails.
Restore.

- [ ] **Step 3: Verify the accessible names exist**

The controls suite already covers `Seg` and `Select` in isolation. What is new is that `EcuLab` now passes real names, so check one end to end:

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
```

`build-store.test.jsx` and `session-store.test.jsx` query several of these controls **by accessible name**. If a query breaks, the name you chose differs from what the test expects — that is a signal about your naming, not a reason to edit the test's assertions. Setup may adapt; assertions may not.

- [ ] **Step 4: Commit**

```bash
git add src/ui/EcuLab.jsx
git commit -m "Move segmented pickers and the preset select onto the primitives"
```

---

### Task 6: Toggle — and the intercooler's cyan switch

**Files:**
- Modify: `src/ui/EcuLab.jsx`

Two sites. The turbo-kit toggle maps across unchanged. The intercooler passes `color={T.cyan}`, and `Toggle` has no `color` prop.

**Drop the colour rather than adding the prop back.** `cyan` is a chart-series token. One toggle wearing it while every other toggle is accent is decoration borrowed from a colour that means something elsewhere — the rule this PR is enforcing. It is a real visual change: record it.

- [ ] **Step 1: Migrate both sites**

```jsx
import { Toggle } from './primitives/Toggle.jsx';
```

`<ToggleRow label="Intercooler" sub="..." checked={mods.intercooler} onChange={...} color={T.cyan} />`
→ `<Toggle label="Intercooler" sub="..." checked={mods.intercooler} onChange={...} />`

Delete the local `function ToggleRow` (:180-192).

- [ ] **Step 2: Check nothing queried the switch by its old shape**

`ToggleRow` rendered an unlabelled `<button>`; `Toggle` is a `role="switch"` with an accessible name. Tests reaching the old shape through DOM traversal will need their **setup** updated — `tests/ui/build-store.test.jsx` has a `toggleFor(label)` helper that walks `parentElement.parentElement.querySelector('button')` precisely because the old one had no name.

That helper can now be a plain `getByRole('switch', { name })`. Simplify it, keep every assertion, and note the change.

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/EcuLab.jsx tests/ui/build-store.test.jsx
git commit -m "Move toggles onto the Toggle primitive, dropping a borrowed series colour"
```

---

### Task 7: Button — 34 raw buttons, 15 of them full-width

**Files:**
- Modify: `src/ui/EcuLab.jsx`

The largest task, and the one where "it still renders" is least reassuring. Work in passes and commit between them.

`Button` is **content-width by default with a `block` opt-in** — the opposite of the current default, which is why 15 buttons carry `width: '100%'`. That inversion is the point: PR 1's review found the app's most important control, RUN DYNO PULL, rendering its label at 1.14:1 contrast while running. Buttons that span the screen because nothing stopped them are the symptom.

Variants: `primary` (the main action), `ghost` (secondary), `danger` (**destructive only** — not an emphasis variant), `quiet` (lowest weight, e.g. RESET ALL TO STOCK).

- [ ] **Step 1: Inventory every raw button and assign a variant**

```bash
grep -n '<button' src/ui/EcuLab.jsx
```

For each, decide `variant` and whether it is genuinely `block`. Put the table in your report. Rules:
- **`danger` is for destructive actions only.** A red-looking button that merely feels important is the rule this PR enforces, broken again.
- **`block` only where the button genuinely spans its container by design** — a primary call to action in a narrow panel. Not "it was 100% before". Several of the 15 are full-width only because nothing stopped them.
- Buttons inside the tuning grid and selection dock are dense controls with their own layout. If `Button` does not fit one, **leave it raw and say why.** Forcing every button through the primitive is not the goal; deleting *unconsidered* markup is.

- [ ] **Step 2: Migrate in passes, committing between them**

Suggested passes: the BUILD tab; the TUNE tab and selection dock; the DYNO tab; the DASH tab and everything left. Run `npx vitest run tests/ui/` after each.

- [ ] **Step 3: Confirm the full-width buttons are gone or deliberate**

```bash
grep -c "width: '100%'" src/ui/EcuLab.jsx
```

Whatever remains must be non-button markup or a documented `block` decision. State the final count and what it is.

- [ ] **Step 4: Full gate**

```bash
npx vitest run tests/ui/ > /tmp/t.txt 2>&1; echo "EXIT=$?"
npm run lint > /tmp/l.txt 2>&1; echo "EXIT=$?"
npm run typecheck > /tmp/tc.txt 2>&1; echo "EXIT=$?"
```

---

### Task 8: The last two findings, then the PR

**Files:**
- Modify: `src/ui/EcuLab.jsx`

- [ ] **Step 1: Take the alarm colours off the chart series**

`EcuLab.jsx:2110-2111`:

```jsx
<Line dataKey="afr" name="AFR actual" stroke={T.ok} ... />
<Line dataKey="timing" name="Timing used" stroke={T.warn} ... />
```

Two permanent series drawn in green and amber. Nothing is healthy or marginal — they are just lines, on screen for every pull. `tokens.js` ships `cyan` and `violet` for exactly this. Switch them, and check the chart's other series for the same problem while you are there.

- [ ] **Step 2: Fix the comparison that asks nothing**

`EcuLab.jsx:296`:

```jsx
stroke={i > 9 ? T.danger : T.line === T.line ? T.ink3 : T.line}
```

`T.line === T.line` is always true, so the third branch is unreachable and the tach's minor ticks are always `T.ink3`. Reduce it to what it actually does:

```jsx
stroke={i > 9 ? T.danger : T.ink3}
```

Do **not** guess at what it was meant to compare and implement that instead — the observable behaviour today is `T.ink3`, and this PR changes nothing observable. Note in the report that the intent is unrecoverable from the code.

Keep `T.danger` here: on a tachometer that is the redline, a genuine warning.

- [ ] **Step 2b: Two more findings, both surfaced by Task 2's review**

**A hand-rolled div that is a `Panel`.** Around `EcuLab.jsx:2276`, inside the score
block, sits:

```jsx
<div style={{ flex: 1, background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14 }}>
```

That is the `Panel` primitive's exact look, written out by hand — and it kept the literal
`padding: 14` while every migrated `Panel` moved to `--sp-lg` (13px). So it now sits 1px
looser than the real `Panel` directly above it in the same block. It was never a `<Panel>`
call, so Task 2's 15-site sweep correctly did not catch it.

Replace it with `<Panel style={{ flex: 1 }}>`. Then look for siblings: any other div
setting `background: T.panel2` **and** a `T.line` border is the same duplication. List what
you find and convert what genuinely is a panel — but do not force a div that merely shares
one property.

**An animation shorthand fighting its own longhand.** `EcuLab.jsx:305-306`:

```jsx
animation: running ? `cylpulse ...s ease-in-out infinite` : 'none',
animationDelay: `${i * (0.5 / cylinders)}s`,
```

React warns about this on every render of the tach. `animation` is a shorthand that resets
`animation-delay`, so declaring the longhand beside it in the same object is order-dependent
and the per-cylinder stagger may not apply at all. Fold the delay into the shorthand — it
takes a delay as its second time value:

```jsx
animation: running ? `cylpulse ${dur}s ${i * (0.5 / cylinders)}s ease-in-out infinite` : 'none',
```

Confirm the console warning is gone afterwards. This is pre-existing, not something this PR
introduced — say so in the PR body rather than implying otherwise.

- [ ] **Step 3: Confirm every duplicate is gone**

```bash
grep -n '^function \|^const [A-Z][A-Za-z]* = ' src/ui/EcuLab.jsx
```

Expected to remain: `ExpandableInfo`, `PickList`, `JourneyBanner`, `BuildSection`, `DialMark`, `Tach`, `TuningGrid`, `cellReference`, `SelectionDock`, `LiveGauge`, `TrimBar`, `EcuLabApp`, `EcuLab`. **Gone:** `Eyebrow`, `Panel`, `Note`, `Seg`, `GroupedSelect`, `ToggleRow`, `StatTile`, `HealthBar`.

- [ ] **Step 4: The full gate**

```bash
node --version    # v20.x or v22.x
npm test
npm run lint
npm run typecheck
npm run build
```

- [ ] **Step 5: Prove the physics and the pinned behaviour never moved**

```bash
git diff origin/main --stat -- src/sim/ tests/fixtures/ tests/fingerprint.test.js package.json package-lock.json
git diff origin/main --stat -- tests/ui/characterisation.test.jsx
```
Both expected: **no output.**

- [ ] **Step 6: Re-sync, then re-run the gate**

```bash
git fetch origin
git rebase origin/main
```
A pre-rebase green says nothing about the post-rebase tree. Re-run step 4 in full.

- [ ] **Step 7: Open the PR**

The body must state: which duplicates were deleted and how many call sites each moved; **every visual change**, the three predicted ones and any others found; which buttons stayed raw and why; and that `characterisation.test.jsx` is byte-identical. Close #74, reference #6, and note that #59 depends on it.

- [ ] **Step 8: Check no auto-merge is queued**

```bash
gh pr view --json autoMergeRequest
```
Expected `null`. **Do not merge this PR.**

---

## Notes for the implementer

**Nothing here catches a visual regression.** The suites pin behaviour. Every task changes appearance, so the report is the only record a reviewer has of what you meant to change. Record every visual delta, including ones this plan did not predict.

**One primitive per commit.** A reviewer can check fifteen Panel sites; nobody can check a hundred substitutions at once.

**`characterisation.test.jsx` is not yours to edit.** It has been byte-identical since it was written and pins the flows this PR touches. If it goes red, the migration is wrong. In `build-store.test.jsx` and `session-store.test.jsx`, setup may adapt to a changed accessible name or DOM shape; **assertions may not.**

**When a primitive does not fit, say so.** `PickList` has no equivalent and stays. Some dense grid buttons may not suit `Button`. Reporting a considered exception is worth more than forcing a bad fit — but leaving markup unexamined is not an exception, it is an omission.
