# TUNE Advisor Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give TUNE's three grid screens a single contextual advisor surface that reports the gap for whatever the player has selected, and becomes the only home for advisor output on the tab.

**Architecture:** A generic responsive chrome component (`AdvisorPanel`) renders as a right-hand rail at >=560px and a collapsed disclosure below it. A pure report module (`advisorReports.js`) turns `calAdvice`/`veAdvice` plus the current `selection` into a `{tone, headline, state, detail}` record, classifying **only by membership in the advisor's own output arrays** — never by re-deriving a threshold. A single renderer (`TuneAdvisory`) maps that record to prose. The three screens' existing inline banners move into the panel and are deleted from the screen bodies.

**Tech Stack:** React 18, CSS Modules, vitest + @testing-library/react, JSDoc-typed JS checked by `tsc --noEmit`.

## Global Constraints

These bind every task. Copy the exact values.

- **An advisor reports the gap; it never closes it.** No predicted outcomes, no fix-it buttons. The one exception already sanctioned by the codebase is `ACCEPT RE-LOGGED VALUES` on VE, because VE is a *measurement of the hardware*, not a calibration judgement — see the explainer in `SparkScreen.jsx`.
- **Never re-derive an advisor threshold in the UI.** `advisors.js` documents that a spark advisor disagreeing with the generator is the false alarm issue #34 removed. Classify a cell by asking whether it appears in `calAdvice.overAdvanced` / `pastMbt` / `underAdvanced` / `wrongMix`, matching on `ri`/`ci`. Do not compare against `knockCeiling`, `mbt`, or any tolerance yourself.
- **560px is the project's only breakpoint.** `src/ui/tokens.css:83-87` carries a hand-maintained list of every file that uses it. Any new stylesheet with a `@media` query must be added to that list in the same commit.
- **No hard-coded colours.** Every colour resolves to a token. `tests/no-hardcoded-colours.test.js` generates one test per source file and will fail the build otherwise.
- **The store is a single React context.** Every consumer re-renders on every dispatch, including `LIVE_STEP` at 20Hz. `AdvisorPanel`, `TuneAdvisory` and the report functions **read no store at all** — they take props only, and the components are wrapped in `React.memo`.
- **Node 20 or 22 only.** Never run `npm run test:fingerprint:update`.
- **No form of `git stash`**, with or without pathspecs, and never `git rebase --autostash`. `node_modules` is tracked; every stash variant destroys it. Never `git add node_modules` — a ` D node_modules` line in `git status` is a known pre-existing condition.
- Full check suite: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. All four must pass before a task is done.

## File Structure

**Create:**
- `src/ui/components/AdvisorPanel.jsx` — responsive chrome only. Props: `headline`, `tone`, `children`. Knows nothing about tuning.
- `src/ui/components/AdvisorPanel.module.css` — rail at >=560px, disclosure below. **Add to the tokens.css breakpoint list.**
- `src/ui/components/advisorReports.js` — pure: `sparkReport`, `fuelReport`, `veReport`. No React import.
- `src/ui/components/TuneAdvisory.jsx` — maps a report record to prose. All three kinds, one file, because they share a stylesheet.
- `src/ui/components/TuneAdvisory.module.css` — the banner/label/body/cell styling, lifted from the three screens' existing modules.
- `tests/ui/advisor-reports.test.js` — the pure functions, in isolation.
- `tests/ui/advisor-panel.test.jsx` — chrome mechanics and the rendered bodies.

**Modify:**
- `src/ui/screens/tune/AirflowScreen.jsx`, `SparkScreen.jsx`, `FuelScreen.jsx` — two-column layout, mount the panel, delete the inline banners.
- Their three `.module.css` files — remove the now-dead banner classes, add the layout.
- `src/sim/advisors.js` — export `OPEN_LOOP_KPA` (one keyword; see Task 5).
- `src/ui/tokens.css` — breakpoint list.
- `src/ui/components/README.md` — describe the new files, and fix the stale "TUNE's ECU screen" references (that screen was split into `InjectorsScreen`/`SensorsScreen` by PR #86).
- `tests/ui/tune-screens.test.jsx` — re-point the banner assertions at the panel.

## The report record

Every report function returns this shape. `state` selects the prose; `detail` carries the numbers. It is **declared in `advisorReports.js`** (Task 3) and imported by `TuneAdvisory.jsx` (Task 4).

```js
/**
 * @typedef {object} AdvisorReport
 * @property {'ok'|'warn'|'danger'|'info'} tone
 * @property {string} headline plain text, shown on the collapsed summary at <560px
 * @property {string} state which body the renderer should show
 * @property {object} detail numbers and cell records the body needs
 */
```

---

### Task 1: `AdvisorPanel` — the responsive chrome

Build the container and nothing else. It renders a heading, a tone-coloured headline, and `children`. At >=560px it is a right-hand rail; below that it is a disclosure the player taps open, with the headline visible while closed.

**Files:**
- Create: `src/ui/components/AdvisorPanel.jsx`
- Create: `src/ui/components/AdvisorPanel.module.css`
- Modify: `src/ui/tokens.css:83-87` (breakpoint list)
- Test: `tests/ui/advisor-panel.test.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export function AdvisorPanel({ headline, tone, children })` where `tone` is `'ok'|'warn'|'danger'|'info'`. Renders `data-testid="advisor-panel"` on the root and `data-open="true"|"false"` on it too. The root is a `<section aria-label="Advisor">`. Later tasks mount this and pass a body as `children`.

**Why `data-open` and not a real `<details>`:** vitest applies no CSS, so a CSS-collapsed body is still in the DOM and still found by `getByText` — the repo has shipped eight assertions that could not fail for exactly this reason. Tests must assert on the `data-open` attribute, never on whether the body is queryable. A controlled `useState` + attribute also lets one CSS rule force the rail permanently open at >=560px without any JS breakpoint or `matchMedia` stub.

- [ ] **Step 1: Write the failing test**

```jsx
// tests/ui/advisor-panel.test.jsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AdvisorPanel } from '../../src/ui/components/AdvisorPanel.jsx';

afterEach(cleanup);

describe('AdvisorPanel', () => {
  it('starts collapsed and shows the headline while closed', () => {
    render(<AdvisorPanel headline="3.5 deg past the knock limit" tone="danger"><p>body</p></AdvisorPanel>);
    const panel = screen.getByTestId('advisor-panel');
    expect(panel.getAttribute('data-open')).toBe('false');
    expect(screen.getByText('3.5 deg past the knock limit')).toBeTruthy();
  });

  it('toggles data-open when the summary is clicked', () => {
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const panel = screen.getByTestId('advisor-panel');
    fireEvent.click(screen.getByRole('button', { name: /advisor/i }));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /advisor/i }));
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it('reports its open state to a screen reader', () => {
    // #81 is open precisely because BuildSection and ExpandableInfo do NOT do this.
    // A component added after that issue was filed must not repeat the omission.
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const toggle = screen.getByRole('button', { name: /advisor/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('carries the tone as an attribute rather than a colour', () => {
    render(<AdvisorPanel headline="h" tone="warn"><p>body</p></AdvisorPanel>);
    expect(screen.getByTestId('advisor-panel').getAttribute('data-tone')).toBe('warn');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/ui/advisor-panel.test.jsx --pool=forks --poolOptions.forks.singleFork`
Expected: FAIL — cannot resolve `../../src/ui/components/AdvisorPanel.jsx`.

- [ ] **Step 3: Write the component**

```jsx
/**
 * The advisor surface for TUNE's grid screens: a right-hand rail on anything
 * wider than a phone, a tap-to-open disclosure below that.
 *
 * Chrome only. It holds no opinion about tuning — `TuneAdvisory` supplies the
 * body and `advisorReports.js` decides what that body says. Split that way so
 * the responsive mechanics can be tested without fabricating advice objects.
 *
 * Reads no store. The store is one context and every consumer re-renders on
 * every dispatch, `LIVE_STEP` at 20Hz included, so this takes props and is
 * memoised — the panel re-renders when the selection or the advice changes and
 * not when the engine ticks.
 */

import React, { useState } from 'react';

import { ChevronDown } from 'lucide-react';

import styles from './AdvisorPanel.module.css';

/**
 * @param {object} props
 * @param {string} props.headline plain text; the only thing visible while collapsed
 * @param {'ok'|'warn'|'danger'|'info'} props.tone
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
function AdvisorPanelImpl({ headline, tone, children }) {
  // Open state is deliberately NOT width-aware. At >=560px the stylesheet shows
  // the body unconditionally and hides the toggle, so this flag only governs the
  // narrow layout. Doing it in CSS keeps 560px out of the JavaScript, where it
  // would be a second copy of the breakpoint that tokens.css could not track.
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Advisor"
      className={styles.panel}
      data-testid="advisor-panel"
      data-open={open ? 'true' : 'false'}
      data-tone={tone}
    >
      <button
        type="button"
        className={styles.summary}
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.eyebrow}>ADVISOR</span>
        <span className={styles.headline}>{headline}</span>
        <ChevronDown size={15} className={styles.chevron} aria-hidden="true" />
      </button>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export const AdvisorPanel = React.memo(AdvisorPanelImpl);
```

**CORRECTION, applied during Task 1's review.** The markup above shipped and was then
fixed, because it was wrong in a way the plan did not foresee. Wrapping the eyebrow and
headline in the toggle button, and neutralising that button at >=560px with
`pointer-events: none`, meant that on every desktop viewport the panel announced
`aria-expanded="false"` while its body was fully visible — the wrong state, which is worse
than the missing state issue #81 was filed about. It also left a focusable button that did
nothing. jsdom applies no CSS, so the task's own accessibility test never reached the width
where its claim became false.

The shipped shape: eyebrow, headline and chevron live in an always-rendered `.head`; the
toggle is a transparent button positioned over it (`inset: 0`) carrying an `aria-label` and
`aria-expanded`; at >=560px that button gets `display: none`, which removes it from the
accessibility tree along with its now-meaningless state. The headline text therefore exists
in the DOM exactly once at every width. Later tasks depend only on the props
(`headline`, `tone`, `children`) and on `data-testid="advisor-panel"`, neither of which
changed.

- [ ] **Step 4: Write the stylesheet**

Requirements, in tokens only:
- `.panel` — bordered surface, `var(--panel2)` background, `var(--line)` border, `10px` radius, matching the banner treatment already in `SparkScreen.module.css`.
- `.summary` — a full-width unstyled button row: eyebrow, headline, chevron. `.chevron` rotates 180deg when the panel is open.
- `.body` — `display: none` by default; `[data-open="true"] .body { display: block; }`.
- `[data-tone="danger"]` / `"warn"` / `"ok"` / `"info"` set `--advisor-accent` to `var(--danger)` / `var(--warn)` / `var(--ok)` / `var(--cyan)`; `.headline` and the panel's left border read that variable. **A local custom property is the only place tone becomes a colour** — do not write four copies of the headline rule.
- At `@media (min-width: 560px)`: `.summary` gets `pointer-events: none` and the chevron is `display: none`; `.body` is `display: block` regardless of `data-open`; the panel becomes the rail (`position: sticky; top: var(--sp-xl);`).

Head the media query with the same cross-reference comment `AppShell.module.css:221-227` uses, then add this file to the list in `src/ui/tokens.css:86-87`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/ui/advisor-panel.test.jsx --pool=forks --poolOptions.forks.singleFork`
Expected: PASS, 4/4.

- [ ] **Step 6: Full suite**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all green. `no-hardcoded-colours` gains two tests (one per new source file) — that is expected; a raw test total is not a stable baseline in this repo, so compare per-file counts.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/AdvisorPanel.jsx src/ui/components/AdvisorPanel.module.css src/ui/tokens.css tests/ui/advisor-panel.test.jsx
git commit -m "Add the advisor panel chrome: rail above 560px, disclosure below"
```

---

### Task 2: The two-column TUNE layout

Give AIRFLOW, SPARK and FUEL a left column (eyebrow, intro, grid, explainers) and a right column that holds the panel. Mount an `AdvisorPanel` with placeholder content on all three. **Do not move any banner content yet** — that is Tasks 3-5, and keeping the layout change on its own commit is what makes those diffs readable.

**Files:**
- Modify: `src/ui/screens/tune/AirflowScreen.jsx`, `SparkScreen.jsx`, `FuelScreen.jsx`
- Modify: `src/ui/screens/tune/AirflowScreen.module.css`, `SparkScreen.module.css`, `FuelScreen.module.css`
- Test: `tests/ui/tune-screens.test.jsx`

**Interfaces:**
- Consumes: `AdvisorPanel` from Task 1.
- Produces: each of the three screens renders exactly one `data-testid="advisor-panel"`. The existing `data-testid="tuning-grid"` and `data-testid="selection-dock"` stay exactly where they are — `characterisation.test.jsx` and `button-call-sites.test.jsx` query both, and neither test may need to change in this task.

- [ ] **Step 1: Restructure the markup**

In each screen, wrap the existing children of `.wrap` in a new `<div className={styles.main}>`, then add the panel as `.main`'s sibling:

```jsx
<div className={styles.wrap}>
  <div className={styles.main}>
    {/* everything that was directly inside .wrap before, unchanged */}
  </div>
  <AdvisorPanel headline="Advisor" tone="info">
    <p>Placeholder — filled in by the next task.</p>
  </AdvisorPanel>
</div>
```

The `<div className={styles.spacer} />` and the `<SelectionDock …>` stay OUTSIDE `.wrap`, exactly where they are now. The dock is a sticky bottom editor and must not enter the grid.

- [ ] **Step 2: Layout CSS, in each of the three modules**

```css
@media (min-width: 560px) {
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    gap: var(--sp-xl);
    align-items: start;
  }
}
```

`minmax(0, 1fr)` rather than `1fr` on purpose: the tuning grid is a wide fixed-width child, and a bare `1fr` refuses to shrink below its content, which pushes the rail off the cap. Add the media-query cross-reference comment and add all three stylesheets to the `tokens.css` breakpoint list.

- [ ] **Step 3: Test that all three mount exactly one panel**

Add to `tests/ui/tune-screens.test.jsx`, inside the existing describes:

```jsx
it('mounts exactly one advisor panel', () => {
  mount(<SparkScreen calAdvice={QUIET_CAL_ADVICE} />);
  expect(screen.getAllByTestId('advisor-panel')).toHaveLength(1);
});
```

`QUIET_CAL_ADVICE` is the file's existing blank fixture (`tests/ui/tune-screens.test.jsx:78`) — use it and the existing `mount` helper, and write the equivalent in the `AirflowScreen` and `FuelScreen` describes.

**Extend that fixture in this task.** It is currently
`{ overAdvanced: [], underAdvanced: [], pastMbt: [], wrongMix: [] }` — the four
category arrays and nothing else, which was sufficient while the screens only read
those four. `sparkReport` and `fuelReport` also read `spark` and `fuelAdv`, so add
`spark: []` and `fuelAdv: []` to it now, matching the real shape
`calibrationAdvice` returns. Do this by growing the fixture, **not** by making the
report functions tolerate a missing array: a report that quietly copes with
`calAdvice.spark === undefined` would also quietly cope with the shell forgetting to
pass it, and the panel would show "never reached by this build" for every cell in a
correctly-built table.

- [ ] **Step 4: Run and verify**

Run: `npx vitest run tests/ui/tune-screens.test.jsx tests/ui/characterisation.test.jsx tests/ui/button-call-sites.test.jsx --pool=forks --poolOptions.forks.singleFork`
Expected: PASS. **If `characterisation.test.jsx` fails, the layout change broke something real — fix the code, not the test.** That file changed for the first time in seven PRs during #83 and is not entitled to change here.

- [ ] **Step 5: Full suite, then commit**

```bash
git add src/ui/screens/tune src/ui/tokens.css tests/ui/tune-screens.test.jsx
git commit -m "Give TUNE's grid screens a two-column layout with an advisor rail"
```

---

### Task 3: `sparkReport` — the pure classifier

The heart of the feature. Turns `calAdvice` plus a selection into a report record. **Pure JS, no React, no store.**

**Files:**
- Create: `src/ui/components/advisorReports.js`
- Test: `tests/ui/advisor-reports.test.js`

**Interfaces:**
- Consumes: the shape `calibrationAdvice` already returns — `{spark, fuelAdv, overAdvanced, underAdvanced, pastMbt, wrongMix}`, where every entry in `spark`/`fuelAdv` carries `ri`, `ci`, `rpm`, `map`, `current`, `suggested`, `delta`, and spark entries additionally carry `mbt`, `knockCeiling`, `knocking`, `knockLimited`.
- Produces: `export function sparkReport(calAdvice, selection)` returning an `AdvisorReport`. Tasks 5 and 6 add `fuelReport` and `veReport` to the same file.

**The rule this task exists to enforce:** classification is membership in the advisor's own arrays, matched on `ri`/`ci`. Never a threshold comparison. `advisors.js` documents that the classification is subtle — a cell past both ceilings with MBT the lower of the two is *detonating*, and ordering the checks by which ceiling is lower would report it as merely wasteful. Asking the arrays cannot get that wrong; re-deriving it can, and did, before issue #34.

**The precedence order is the screen's existing fall-through and must be preserved exactly:** over-advanced, then under-advanced (only when there are more than four), then past-MBT, then clean.

- [ ] **Step 1: Write the failing tests**

```js
// tests/ui/advisor-reports.test.js
import { describe, expect, it } from 'vitest';

import { sparkReport } from '../../src/ui/components/advisorReports.js';

/** A spark entry; only the fields the report reads. */
const cell = (ri, ci, over) => ({
  ri, ci, rpm: 1000 * (ci + 1), map: 100 + ri * 20,
  current: over ? 24 : 18, suggested: 18, delta: over ? -6 : 0,
  mbt: 22, knockCeiling: 20,
});

/** Assembles a calAdvice whose category arrays genuinely contain the cells named. */
function advice({ over = [], under = [], past = [] } = {}) {
  const all = [...over, ...under, ...past];
  return { spark: all, fuelAdv: [], overAdvanced: over, underAdvanced: under, pastMbt: past, wrongMix: [] };
}

describe('sparkReport, no selection', () => {
  it('leads with the knock limit when any cell is past it', () => {
    const r = sparkReport(advice({ over: [cell(3, 4, true)] }), null);
    expect(r.state).toBe('table-over');
    expect(r.tone).toBe('danger');
    expect(r.headline).toBe('1 cell beyond the knock limit');
  });

  it('pluralises the headline', () => {
    const r = sparkReport(advice({ over: [cell(3, 4, true), cell(3, 5, true)] }), null);
    expect(r.headline).toBe('2 cells beyond the knock limit');
  });

  it('reports timing left on the table only past the four-cell floor', () => {
    const four = [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3)];
    expect(sparkReport(advice({ under: four }), null).state).toBe('table-clean');
    expect(sparkReport(advice({ under: [...four, cell(0, 4)] }), null).state).toBe('table-under');
  });

  it('ranks the knock limit above every other finding', () => {
    // A table that is simultaneously over-advanced somewhere and under-advanced
    // in six places leads with the danger, never with the opportunity.
    const under = [cell(0, 0), cell(0, 1), cell(0, 2), cell(0, 3), cell(0, 4), cell(0, 5)];
    const r = sparkReport(advice({ over: [cell(3, 4, true)], under }), null);
    expect(r.state).toBe('table-over');
  });

  it('is clean when every category is empty', () => {
    const r = sparkReport(advice(), null);
    expect(r.state).toBe('table-clean');
    expect(r.tone).toBe('ok');
  });
});

describe('sparkReport, one cell selected', () => {
  it('classifies by membership, not by comparing against the ceilings itself', () => {
    // This cell's own numbers say it is inside both ceilings (current 18 < mbt 22,
    // < knockCeiling 20). The advisor nonetheless filed it as over-advanced. The
    // report must follow the advisor, because the advisor is the single source of
    // truth for what counts as over-advanced — a UI that recomputed the answer is
    // exactly the disagreement advisors.js warns about.
    const c = { ...cell(3, 4), current: 18 };
    const r = sparkReport(advice({ over: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.state).toBe('cell-over');
    expect(r.tone).toBe('danger');
  });

  it('names the gap to the ceiling that bound it', () => {
    const c = { ...cell(3, 4), current: 24, knockCeiling: 20 };
    const r = sparkReport(advice({ over: [c] }), { type: 'cell', row: 3, col: 4 });
    expect(r.headline).toBe('4.0 deg past the knock limit');
    expect(r.detail.cell).toBe(c);
  });

  it('says a cell the engine never reaches is unreachable, not clean', () => {
    // calibrationAdvice skips unreachable cells entirely (its rule 2), so the
    // lookup misses. Reporting that as "inside both ceilings" would tell the
    // player their 200 kPa cell at 800 RPM is fine, when it simply never happens.
    const r = sparkReport(advice({ over: [cell(3, 4, true)] }), { type: 'cell', row: 0, col: 0 });
    expect(r.state).toBe('cell-unreachable');
    expect(r.tone).toBe('info');
  });

  it('reports a cell in no category as inside both ceilings', () => {
    const c = cell(2, 2);
    const r = sparkReport({ ...advice(), spark: [c] }, { type: 'cell', row: 2, col: 2 });
    expect(r.state).toBe('cell-ok');
    expect(r.tone).toBe('ok');
  });
});

describe('sparkReport, a row or column selected', () => {
  it('counts the flagged cells inside the selected row', () => {
    const r = sparkReport(
      advice({ over: [cell(3, 1, true), cell(3, 2, true), cell(1, 5, true)] }),
      { type: 'row', row: 3 },
    );
    expect(r.state).toBe('group-over');
    expect(r.headline).toBe('2 of these cells are past the knock limit');
  });

  it('counts down the column when a column is selected', () => {
    const r = sparkReport(
      advice({ over: [cell(1, 4, true), cell(3, 4, true), cell(3, 0, true)] }),
      { type: 'col', col: 4 },
    );
    expect(r.headline).toBe('2 of these cells are past the knock limit');
  });

  it('is clean when nothing in the group is flagged', () => {
    const r = sparkReport(advice({ over: [cell(1, 5, true)] }), { type: 'row', row: 3 });
    expect(r.state).toBe('group-clean');
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx vitest run tests/ui/advisor-reports.test.js --pool=forks --poolOptions.forks.singleFork`
Expected: FAIL — cannot resolve `advisorReports.js`.

- [ ] **Step 3: Implement**

```js
/**
 * Advisor reports: what the simulation's advisors already concluded, narrowed to
 * whatever the player currently has selected.
 *
 * These invent no analysis. `calibrationAdvice` and `veRecommendations` in
 * `src/sim/advisors.js` decide what is wrong with a table; these functions only
 * decide which part of that answer is relevant right now, and how to say it.
 *
 * THE ONE RULE: a cell's category is looked up in the advisor's own output
 * arrays. It is never re-derived by comparing the cell against a threshold. The
 * classification in `calibrationAdvice` is subtle on purpose — a cell past both
 * ceilings with MBT the lower of the two is detonating, not merely wasteful, and
 * getting that backwards tells a player a dangerous cell is safe. Asking the
 * arrays cannot get it wrong. Recomputing can, and that is the false alarm
 * issue #34 removed.
 */

/** @typedef {import('./TuningGrid.jsx').Selection} Selection */

/**
 * @typedef {object} AdvisorReport
 * @property {'ok'|'warn'|'danger'|'info'} tone
 * @property {string} headline plain text, shown on the collapsed summary at <560px
 * @property {string} state which body the renderer should show
 * @property {object} detail numbers and cell records the body needs
 */

/** English, not a template with a stray "1 cells" in it. */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Does this category contain the cell at (ri, ci)? */
const holds = (arr, ri, ci) => arr.some((c) => c.ri === ri && c.ci === ci);

/** How many of a category fall inside the selected row or column? */
function countIn(arr, selection) {
  if (selection.type === 'row') return arr.filter((c) => c.ri === selection.row).length;
  return arr.filter((c) => c.ci === selection.col).length;
}

/**
 * @param {object} calAdvice as returned by `calibrationAdvice`
 * @param {Selection|null} selection
 * @returns {AdvisorReport}
 */
export function sparkReport(calAdvice, selection) {
  const { spark, overAdvanced, underAdvanced, pastMbt } = calAdvice;

  if (selection && selection.type === 'cell') {
    const cell = spark.find((c) => c.ri === selection.row && c.ci === selection.col);
    // No entry means `calibrationAdvice` filtered the cell out as unreachable
    // (its rule 2): a turbo build never sees 200 kPa at 800 RPM. That is not the
    // same as a clean cell and must not be reported as one.
    if (!cell) return { tone: 'info', headline: 'Never reached by this build', state: 'cell-unreachable', detail: {} };

    if (holds(overAdvanced, cell.ri, cell.ci)) {
      return {
        tone: 'danger',
        headline: `${(cell.current - cell.knockCeiling).toFixed(1)} deg past the knock limit`,
        state: 'cell-over',
        detail: { cell },
      };
    }
    if (holds(pastMbt, cell.ri, cell.ci)) {
      return {
        tone: 'warn',
        headline: `${(cell.current - cell.mbt).toFixed(1)} deg past MBT`,
        state: 'cell-past-mbt',
        detail: { cell },
      };
    }
    if (holds(underAdvanced, cell.ri, cell.ci)) {
      return {
        tone: 'warn',
        headline: `${cell.delta.toFixed(1)} deg below what this build allows`,
        state: 'cell-under',
        detail: { cell },
      };
    }
    return { tone: 'ok', headline: 'Inside both ceilings', state: 'cell-ok', detail: { cell } };
  }

  if (selection) {
    // A row or column. Same precedence as the table-wide report, scoped to the band.
    const over = countIn(overAdvanced, selection);
    if (over > 0) {
      return {
        tone: 'danger',
        headline: `${over} of these cells are past the knock limit`,
        state: 'group-over',
        detail: { count: over },
      };
    }
    const under = countIn(underAdvanced, selection);
    const past = countIn(pastMbt, selection);
    if (past > 0) {
      return { tone: 'warn', headline: `${past} of these cells are past MBT`, state: 'group-past-mbt', detail: { count: past } };
    }
    if (under > 0) {
      return { tone: 'warn', headline: `${under} of these cells have advance left`, state: 'group-under', detail: { count: under } };
    }
    return { tone: 'ok', headline: 'Nothing flagged in this band', state: 'group-clean', detail: {} };
  }

  // Table-wide. This precedence IS the fall-through the SPARK screen rendered
  // before the panel existed, preserved exactly: danger first, then the
  // opportunity, then the wasted advance, then the all-clear.
  if (overAdvanced.length > 0) {
    return {
      tone: 'danger',
      headline: `${plural(overAdvanced.length, 'cell')} beyond the knock limit`,
      state: 'table-over',
      detail: { count: overAdvanced.length, cells: overAdvanced.slice(0, 5), more: Math.max(0, overAdvanced.length - 5) },
    };
  }
  if (underAdvanced.length > 4) {
    return { tone: 'warn', headline: 'Timing left on the table', state: 'table-under', detail: { count: underAdvanced.length } };
  }
  if (pastMbt.length > 0) {
    return { tone: 'warn', headline: 'Past peak torque', state: 'table-past-mbt', detail: { count: pastMbt.length } };
  }
  return { tone: 'ok', headline: 'Within the knock limit', state: 'table-clean', detail: {} };
}
```

**Careful:** the group branch checks `pastMbt` before `underAdvanced` while the table branch checks `underAdvanced` before `pastMbt`. That is not a slip to "fix" — the table ordering is the screen's historical fall-through and is preserved for fidelity, and the group ordering puts the two warnings in severity order for a band the player is actively looking at. If a reviewer flags the inconsistency, this note is the answer.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/ui/advisor-reports.test.js --pool=forks --poolOptions.forks.singleFork`
Expected: PASS, 13/13.

- [ ] **Step 5: Prove the membership test is load-bearing**

Temporarily change `holds` to compare thresholds instead:
```js
const holds = (arr, ri, ci) => false;
```
Run the tests. `classifies by membership` and `names the gap` must FAIL. Revert. Paste the failure output into the task report — a classification test that passes with the classifier stubbed out is not a test.

- [ ] **Step 6: Full suite, then commit**

```bash
git add src/ui/components/advisorReports.js tests/ui/advisor-reports.test.js
git commit -m "Add sparkReport: narrow the knock advisor to the current selection"
```

---

### Task 4: `TuneAdvisory` renders the spark report, and SPARK's banner moves in

Two commits, in this order. **Stage 1 moves the markup verbatim; stage 2 converts it to the new stylesheet.** That is the technique the screen split used, and it is what makes a fidelity slip visible: hand-audit stage 2's diff against stage 1 before committing it, because no test in this repo sees a className.

**Files:**
- Create: `src/ui/components/TuneAdvisory.jsx`, `src/ui/components/TuneAdvisory.module.css`
- Modify: `src/ui/screens/tune/SparkScreen.jsx`, `SparkScreen.module.css`
- Modify: `tests/ui/tune-screens.test.jsx`, `src/ui/components/README.md`

**Interfaces:**
- Consumes: `sparkReport` (Task 3), `AdvisorPanel` (Task 1), the layout (Task 2).
- Produces: `export function TuneAdvisory({ kind, report, onAcceptVe })` where `kind` is `'ve'|'timing'|'afr'`. Tasks 5 and 6 extend it. It imports the `AdvisorReport` typedef **from `advisorReports.js`** — the module that produces a type owns it, and Task 3 ships before this one, so the arrow cannot point the other way.

- [ ] **Step 1: Move SPARK's four advisory states into `TuneAdvisory`, verbatim**

Every string, every `<b>`, every number format from `SparkScreen.jsx:52-82` moves across unchanged, keyed by `report.state`:

| `report.state` | body |
|---|---|
| `table-over` | the whole `.dangerBanner` block: the count label, the "Your current hardware will not tolerate…" paragraph, up to five `map kPa / rpm RPM: current deg -> suggested deg` lines from `detail.cells`, the "…and N more" line from `detail.more`, and the "Edit them yourself — a calibration is yours to make, not something the app should silently rewrite." footer |
| `table-under` | "**Timing left on the table.** N cells are more than 3 deg below…" |
| `table-past-mbt` | "**Past peak torque.** N cells command more advance than the burn can use…" |
| `table-clean` | "Spark table sits within the knock limit for this hardware." |

The panel supplies the surrounding box, so the outer banner `<div>` does not move — its border, background and radius become the panel's `data-tone`. Everything inside it does.

New bodies, for the states that did not exist before:

| `report.state` | body |
|---|---|
| `cell-over` | the cell's `map`/`rpm`, then `Your value`, `Knock limit`, `MBT` and `Suggested` as a small definition list, then: "Past the knock limit the engine is damaging itself. Pull this cell back to the suggested value, or lower." |
| `cell-past-mbt` | same list, then: "The burn already lands where it should, so the extra degrees are pushing against the piston on the way up rather than making torque. Not dangerous — this cell is inside the knock limit — but pulling it back gains a little power and buys margin." |
| `cell-under` | same list, then: "This cell is leaving advance on the table. Add it a degree at a time and run a pull between each change." |
| `cell-ok` | same list, then: "Inside both the knock limit and MBT. Nothing to correct here." |
| `cell-unreachable` | "This build never reaches this manifold pressure at this engine speed, so the advisor has nothing to say about the cell. It is still yours to edit — it just will not be used." |
| `group-*` | the headline's count and one line naming what to do: select a single cell to see its numbers. |

- [ ] **Step 2: Delete the banner from `SparkScreen.jsx`, mount the advisory**

```jsx
const report = sparkReport(calAdvice, selection);
…
<AdvisorPanel headline={report.headline} tone={report.tone}>
  <TuneAdvisory kind="timing" report={report} />
</AdvisorPanel>
```

`sparkReport` is called on every render. It is a handful of `.some()` scans over at most 96 cells with no allocation in the hot path — do not memoise it. A `useMemo` here would need `calAdvice` and `selection` in its dependency array and would buy nothing measurable.

- [ ] **Step 3: Re-point the existing tests**

`tests/ui/tune-screens.test.jsx:127-143` has two tests that must keep testing what they test today — that the screen shows **the shell's** advice rather than one it derived. They keep their fabricated `calAdvice`; only the expected strings move to the panel's phrasing. Assert inside the panel:

```jsx
const panel = within(screen.getByTestId('advisor-panel'));
expect(panel.getByText('1 cell beyond the knock limit')).toBeTruthy();
```

Note `1 cell`, singular — the old assertion read `1 CELLS BEYOND THE KNOCK LIMIT`, which was a latent copy bug the plural helper fixes.

- [ ] **Step 4: Add a test for the selection-scoped path through the real component**

```jsx
it('narrows to the selected cell rather than the whole table', () => {
  // Set a selection, then assert the panel reports THAT cell and not the table count.
});
```

Use the store the `mount` helper already provides; dispatch `SET_TUNE_FIELD` with `field: 'selection'`.

- [ ] **Step 5: Delete the dead CSS**

`.dangerBanner`, `.dangerLabel`, `.dangerBody`, `.dangerCell`, `.dangerMore`, `.dangerFooter`, `.advisoryPanel` and `.okBanner` leave `SparkScreen.module.css`. `.em` and `.emInk` **stay** — the `ExpandableInfo` blocks still use them. Check each class with `grep -n 'styles\.' src/ui/screens/tune/SparkScreen.jsx` before deleting; an unused CSS Modules class is silent, so removing one that is still referenced only shows up as an unstyled element in a browser nobody has opened.

- [ ] **Step 6: Full suite, then two commits**

```bash
git commit -m "Move SPARK's knock advisory into the advisor panel, markup unchanged"
# then, after converting to TuneAdvisory.module.css and hand-auditing the diff:
git commit -m "Convert the spark advisory to its own stylesheet"
```

---

### Task 5: `fuelReport`, and FUEL's mixture advisory moves in

**Files:**
- Modify: `src/sim/advisors.js` (one keyword — see below)
- Modify: `src/ui/components/advisorReports.js`, `TuneAdvisory.jsx`, `TuneAdvisory.module.css`
- Modify: `src/ui/screens/tune/FuelScreen.jsx`, `FuelScreen.module.css`
- Modify: `tests/ui/advisor-reports.test.js`, `tests/ui/tune-screens.test.jsx`

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: `export function fuelReport(calAdvice, selection)`.

**The one `src/sim` change in this plan.** `OPEN_LOOP_KPA` (`src/sim/advisors.js:47`) is currently a private const. Add the `export` keyword — nothing else:

```js
export const OPEN_LOOP_KPA = 85;
```

`src/sim/index.js:29` already does `export * from './advisors.js'`, so it becomes available without a second edit. Why it is needed: `wrongMix` only ever contains cells at or above that pressure, so a closed-loop cell and an on-target open-loop cell are both simply *absent* from it. Without the constant the panel cannot tell them apart, and would have to say something vague about a cell whose mixture the trims own outright. **Do not copy the literal `85` into the UI** — that is a second copy of a physics threshold, and it will drift.

This is additive, changes no value, and cannot move the fingerprint. Run `npm test` and confirm `tests/fingerprint.test.js` still passes before committing, and say so in the report.

- [ ] **Step 1: Tests for `fuelReport`**

Cover, in `tests/ui/advisor-reports.test.js`:
- no selection, `wrongMix` non-empty → `table-off`, tone `warn`, headline `N high-load cells off best power` (pluralised).
- no selection, `wrongMix` empty → `table-clean`, tone `ok`, headline `High-load mixture is on best power`.
- cell selected, present in `wrongMix` → `cell-off`, tone `warn`, headline names the direction: `0.8 AFR lean of best power` or `0.8 AFR rich of best power`. `delta` is `suggested - current`, so a **negative** delta means the suggestion is richer, i.e. the cell is currently **lean**. Test both signs; getting this backwards tells a player to lean out a cell that is already burning a piston.
- cell selected, `map < OPEN_LOOP_KPA` → `cell-closed-loop`, tone `info`, headline `Closed loop — the trims own this cell`. Assert this is chosen **even when the cell's delta is large**, since a big closed-loop error is still not the player's to fix in this table.
- cell selected, open loop but not in `wrongMix` → `cell-ok`, tone `ok`, headline `On best power`.
- cell not in `fuelAdv` at all → `cell-unreachable`, tone `info`.
- row/col selection → count of `wrongMix` cells in the band.

- [ ] **Step 2: Implement, then Steps 3-6 mirror Task 4**

Move `FuelScreen.jsx:41-56` verbatim into `TuneAdvisory` under `state: 'table-off'` — the count label, the long "Best-power mixture shifts with boost…" paragraph including its `<b>delivered</b>`, the five `data-richen` cell lines with their `(richen)`/`(lean out)` suffixes and `delivered X, wants Y` tails, and the "…and N more" line. The `data-richen` attribute stays: `FuelScreen.module.css` colours the two directions differently and that distinction must survive the move.

**New content:** FUEL had no clean state at all — its banner simply did not render when `wrongMix` was empty. The panel always renders something, so `table-clean` is genuinely new prose. That is deliberate: AIRFLOW and SPARK both already say when a table is fine, and a panel that goes blank reads as broken.

Delete the banner classes from `FuelScreen.module.css`; keep `.em`, which the `ExpandableInfo` block still uses.

---

### Task 6: `veReport`, and AIRFLOW's sync advisory moves in

**Files:** as Task 5, for `AirflowScreen`.

**Interfaces:**
- Produces: `export function veReport(veAdvice, selection)`.

**The honesty problem this task exists to get right.** `veRecommendations` returns `deltas` indexed **by RPM column, at the wide-open-throttle row only** — there is no per-cell VE gap to report, and `WOT_ROW` is a private constant this plan does not export. So:

- **Never** claim a gap for an arbitrary selected cell. For a `cell` or `col` selection, report the **column's** delta and say plainly which quantity it is: "Measured at wide-open throttle. This gap belongs to the RPM column, not to this one cell."
- For a `row` selection, there is nothing column-scoped to say: fall back to the table-wide report.
- `veAdvice` can be `null` — `AirflowScreen` already guards with `{veAdvice && (…)}`. Return a `no-advice` state rather than throwing, and keep the panel mounted.

States:
- `table-sync` — tone `ok`, headline `VE matches your hardware`, body "VE table matches your current hardware. Nothing to correct." (verbatim from the existing `.inSyncBanner`).
- `table-stale` — tone `warn`, headline `VE out of sync — N% max gap`, body: the whole existing `.staleBanner` content, every `rec` with its `rpmText`, `text` and joined `cells`, the `ACCEPT RE-LOGGED VALUES` button, and the "Or type them in yourself — these are the measured targets, not a suggestion." note.
- `col-gap` / `cell-gap` — tone from the sign and size of the column delta, headline `` `${pct.toFixed(0)}% ${pct > 0 ? 'more' : 'less'} air here than your table assumes` ``, body carrying `from`/`to` and the wide-open-throttle caveat above.
- `no-advice` — tone `info`, "No airflow comparison available for this build yet."

**The `ACCEPT RE-LOGGED VALUES` button must keep working.** It is the one advisor action the design rule permits, and three separate test files reach it:
- `tests/ui/tune-screens.test.jsx:107-119` clicks it on a mounted `AirflowScreen`
- `tests/ui/build-store.test.jsx:370-401` drives it through the whole app
- `tests/ui/button-call-sites.test.jsx:149` lists its label in an allow-list, and `:297` counts its call sites

Pass the existing `recalcVE` handler down as `onAcceptVe`. **Run all three files and paste the output** — `build-store.test.jsx` is the one that proves the button still reaches the store through the real shell.

**A trap specific to this task:** `button-call-sites.test.jsx:297` counts call sites. Moving the button from `AirflowScreen` to `TuneAdvisory` does not change the count, but it does change the file the count is attributed to. Read that test before touching the button and check whether it asserts on location as well as number.

---

### Task 7: Sweep, verify, open the PR

- [ ] **Step 1: Prove no user-visible string was lost**

Do this with an AST parse, not a regex — the same check that caught nothing in PR 3c and would have caught the missing branding in PR 3b. Walk `src/ui/` at `origin/main` and at `HEAD` with the Babel parser already in `node_modules`, collect every string and JSX text node, and diff the two sets. Every string present on main and absent on HEAD must be traceable to a deliberate rewrite named in this plan. List them in the PR body.

- [ ] **Step 2: Confirm the simulation is untouched apart from one keyword**

```bash
git diff origin/main --stat -- src/sim/ tests/fixtures/ tests/fingerprint.test.js package.json package-lock.json
```
Expected: exactly one file, `src/sim/advisors.js`, one insertion and one deletion. Anything else is a bug in this branch.

- [ ] **Step 3: Confirm `characterisation.test.jsx` is byte-identical to main**

```bash
git diff origin/main --stat -- tests/ui/characterisation.test.jsx
```
Expected: empty. That file earned its one change in #83; this PR moves content between components without changing what the app does, so it has no claim on another.

- [ ] **Step 4: Check the dead-class sweep**

For each of the three screen stylesheets, confirm every remaining class is still referenced:
```bash
for f in Airflow Spark Fuel; do
  echo "== $f"
  grep -o '^\.[a-zA-Z0-9_]*' "src/ui/screens/tune/${f}Screen.module.css" | tr -d '.' | while read -r c; do
    grep -q "styles\.$c\b" "src/ui/screens/tune/${f}Screen.jsx" || echo "  UNUSED: $c"
  done
done
```
Expected: no output. An orphaned class is invisible to every test in this repo.

- [ ] **Step 5: Full suite, rebase, full suite again**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git fetch origin
git update-index --skip-worktree node_modules
git rebase origin/main
git update-index --no-skip-worktree node_modules
git ls-files -v node_modules   # MUST print uppercase "H"; lowercase "h" means git is silently ignoring it
npm test && npm run lint && npm run typecheck && npm run build
```

The `--skip-worktree` pair is how a rebase gets past the standing ` D node_modules` dirty tree. It is index-only: it touches nothing on disk, stages nothing, commits nothing. **It is not a substitute for stash and stash is still forbidden.** Clear the flag immediately and verify it cleared.

- [ ] **Step 6: Push and open the PR — do not merge it**

The body states what moved, what is genuinely new prose (FUEL's clean state), the one-keyword `src/sim` change and why, the string-sweep result, and `Closes #85`. It must also record that **nobody has loaded this in a browser** — the two-column layout at 560-700px, where a 452px grid and a 280px rail have to share the width, is the most likely thing to look wrong.

Then stop. The Iron Rule: the workflow ends at "PR is open and awaiting review."
