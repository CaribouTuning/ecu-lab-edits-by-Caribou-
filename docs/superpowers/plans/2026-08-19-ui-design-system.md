# UI Design System (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ECU Lab's ad-hoc inline styling with a single token layer and a tested primitives library, turning the whole app azure in the process — without changing any physics.

**Architecture:** `src/ui/tokens.js` holds every colour as the one source of truth; `src/ui/tokens.css` mirrors it as CSS custom properties and a test proves the two cannot drift. The existing `theme.js` is re-pointed at those tokens, which recolours all 500+ existing `T.*` call sites at once. New primitives are built as React components with co-located CSS Modules, then proven by converting the two entry screens.

**Tech Stack:** React 18, Vite 5 (native CSS Modules), Vitest 2, `@testing-library/react` + `jsdom` (new devDependencies), JSDoc types checked by `tsc --checkJs`.

## Global Constraints

- **Node 20 or 22 only — never 26.** `.nvmrc` pins 22. Newer V8 shifts float results and invalidates the fingerprint hash.
- **`tests/fingerprint.test.js` must stay green and must NOT be regenerated.** This is a UI-only change; a moved fingerprint means the change broke physics. Never run `npm run test:fingerprint:update`.
- **No changes to `src/sim/` in this PR** except where a task explicitly says so (no task in this plan does).
- **No new runtime dependencies.** Only `@testing-library/react` and `jsdom` as devDependencies.
- **Nothing adds horsepower** (`CONTRIBUTING.md`). No task here touches physics at all.
- **Full gate before the PR:** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- Branch is `feat/6-ui-design-system`, already created. Never commit to `main`.
- Every commit message ends with the repo's `Co-Authored-By:` and `Claude-Session:` trailers.

## Scope note — one deliberate deviation from the spec

The design doc says PR 1 makes "no screen changes". This plan makes two, on purpose,
and they are worth understanding before starting:

**Task 3 recolours every existing screen.** Re-pointing `theme.js` was always going to
do that — 500+ `T.*` call sites change value the moment the tokens change. There is no
version of "add the token layer" that leaves the running app looking the same, short of
shipping a palette nothing uses. Taking the recolour now means the loudest complaint in
the issue is fixed in PR 1 rather than PR 3.

**Task 9 converts the start and tutorial screens.** Without it, every primitive in this
PR is unused code and the reviewer has nothing to look at. These two screens were chosen
because they are self-contained, are the first thing a user sees, and touch none of the
four main tabs — so they prove the system without pre-empting the IA work in PR 3.

What the spec's "no screen changes" actually protects — the navigation, the four tabs,
the tuning grids — is untouched here.

---

### Task 1: Token source of truth

**Files:**
- Create: `src/ui/tokens.js`
- Create: `src/ui/tokens.css`
- Test: `tests/tokens.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `tokens` — a frozen object of `{[name: string]: string}` where every value is a CSS colour or font stack. Key names are camelCase (`accInk`); the CSS custom property is the kebab-case form (`--acc-ink`). Also exports `camelToKebab(s: string): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/tokens.test.js`:

```js
/**
 * Token contract tests.
 *
 * `tokens.js` and `tokens.css` describe the same palette in two languages, and
 * nothing but a test can stop them drifting. These also pin the one rule the whole
 * colour system rests on: the accent is never a status colour.
 */

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { camelToKebab, tokens } from '../src/ui/tokens.js';

const css = readFileSync(new URL('../src/ui/tokens.css', import.meta.url), 'utf8');

/** @returns {Map<string,string>} every `--name: value` declared in tokens.css */
function parseCss() {
  const out = new Map();
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

describe('token contract', () => {
  it('declares every JS token as a CSS custom property with the same value', () => {
    const declared = parseCss();
    for (const [key, value] of Object.entries(tokens)) {
      const cssName = camelToKebab(key);
      expect(declared.get(cssName), `--${cssName} missing from tokens.css`).toBe(value);
    }
  });

  it('declares no CSS custom property that JS does not know about', () => {
    const known = new Set(Object.keys(tokens).map(camelToKebab));
    for (const name of parseCss().keys()) {
      expect(known.has(name), `--${name} exists in CSS but not in tokens.js`).toBe(true);
    }
  });

  it('never uses a status colour as the accent', () => {
    // The defect this whole overhaul exists to fix: when the accent IS the alarm
    // colour, a real alarm has nowhere to escalate to.
    for (const status of [tokens.ok, tokens.warn, tokens.danger]) {
      expect(tokens.acc).not.toBe(status);
      expect(tokens.accInk).not.toBe(status);
    }
  });

  it('is frozen so no screen can mutate the palette at runtime', () => {
    expect(Object.isFrozen(tokens)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tokens.test.js`
Expected: FAIL — `Failed to resolve import "../src/ui/tokens.js"`.

- [ ] **Step 3: Create the JS token source**

Create `src/ui/tokens.js`:

```js
/**
 * The palette, and the single place it is defined.
 *
 * `tokens.css` mirrors this file as CSS custom properties for stylesheets, and
 * `tests/tokens.test.js` proves the two never drift. Add a colour here first.
 *
 * The organising rule: THE ACCENT IS NEVER A STATUS, AND A STATUS IS NEVER
 * DECORATION. `acc` means "this is the action" or "this is the live value".
 * `ok`/`warn`/`danger` mean engine state and nothing else. The previous palette
 * spent its alarm colour on chrome — 84 uses of the same hot orange on the
 * wordmark, the nav, the focus ring and genuine warnings alike — which left a real
 * warning nothing to escalate to.
 */

/** @param {string} s camelCase token name @returns {string} its kebab-case CSS name */
export const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** @type {Readonly<Record<string,string>>} */
export const tokens = Object.freeze({
  // Surfaces, darkest to lightest. The base is blue-black rather than neutral grey
  // because red reads harder against blue than against grey.
  bg: '#0a0d14',
  panel: '#131824',
  panel2: '#1a2130',
  panel3: '#212a3c',

  // Borders.
  line: '#262f42',
  lineHi: '#33405a',

  // Text, four steps from primary to faintest.
  ink: '#e9eef8',
  inkSoft: '#c8d2e2',
  ink2: '#8792a8',
  ink3: '#5c6880',

  // Accent. `accOn` is text placed ON an accent fill — it must never be a grey.
  acc: '#4c9eff',
  accInk: '#8fc2ff',
  accBg: '#0f2033',
  accOn: '#04162e',

  // Status. Reserved for engine state. Never used as decoration.
  ok: '#35e08a',
  okInk: '#7fe8b4',
  okBg: '#0d2419',
  warn: '#ffb020',
  warnInk: '#ffd07a',
  warnBg: '#2a2110',
  danger: '#ff4d4d',
  dangerInk: '#ff9d9d',
  dangerBg: '#2a1414',

  // Secondary data hue, for charts that must plot two series at once (power vs
  // torque). Distinct from `acc` on purpose so a chart never looks like a control.
  cyan: '#38d9f0',
  cyanBg: '#0b2630',
  violet: '#a78bfa',
  violetBg: '#1d1a33',

  // Type.
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",

  // Bare RGB triplets, so translucent washes can be built from the same colours
  // rather than re-typing them at a new alpha. See accAlpha/shadowAlpha below.
  accRgb: '76, 158, 255',
  shadowRgb: '0, 0, 0',
});

/**
 * A translucent accent wash — glows, focus halos, the shadow under a primary button.
 *
 * Lives here rather than in a screen because an `rgba()` literal in a component is
 * precisely what this system exists to prevent, and `tests/no-hardcoded-colours.test.js`
 * rejects one.
 *
 * @param {number} alpha 0-1
 * @returns {string} an rgba() colour
 */
export const accAlpha = (alpha) => `rgba(${tokens.accRgb}, ${alpha})`;

/**
 * A plain black scrim, for drop shadows and cell borders that must darken whatever
 * is underneath rather than tint it.
 *
 * @param {number} alpha 0-1
 * @returns {string} an rgba() colour
 */
export const shadowAlpha = (alpha) => `rgba(${tokens.shadowRgb}, ${alpha})`;
```

- [ ] **Step 4: Create the CSS mirror**

Create `src/ui/tokens.css`:

```css
/* Mirrors src/ui/tokens.js. Both are checked against each other by
   tests/tokens.test.js — change one and you must change the other. */

:root {
  --bg: #0a0d14;
  --panel: #131824;
  --panel2: #1a2130;
  --panel3: #212a3c;

  --line: #262f42;
  --line-hi: #33405a;

  --ink: #e9eef8;
  --ink-soft: #c8d2e2;
  --ink2: #8792a8;
  --ink3: #5c6880;

  --acc: #4c9eff;
  --acc-ink: #8fc2ff;
  --acc-bg: #0f2033;
  --acc-on: #04162e;

  --ok: #35e08a;
  --ok-ink: #7fe8b4;
  --ok-bg: #0d2419;
  --warn: #ffb020;
  --warn-ink: #ffd07a;
  --warn-bg: #2a2110;
  --danger: #ff4d4d;
  --danger-ink: #ff9d9d;
  --danger-bg: #2a1414;

  --cyan: #38d9f0;
  --cyan-bg: #0b2630;
  --violet: #a78bfa;
  --violet-bg: #1d1a33;

  --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  --acc-rgb: 76, 158, 255;
  --shadow-rgb: 0, 0, 0;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/tokens.test.js`
Expected: PASS, 4 tests.

Note: `--ink2` and `--ink3` come from keys `ink2`/`ink3`, which `camelToKebab` leaves unchanged because there is no lowercase-to-uppercase boundary. That is intended.

- [ ] **Step 6: Commit**

```bash
git add src/ui/tokens.js src/ui/tokens.css tests/tokens.test.js
git commit -m "Add the azure token layer as one source of truth

tokens.js and tokens.css describe the same palette in two languages; a
contract test proves they cannot drift, and pins the rule the system rests
on — the accent is never a status colour.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 2: Re-point theme.js at the tokens

This is the task where the running app turns azure. `EcuLab.jsx` is not edited at all — the old key names (`amber`, `amberInk`, `amberBg`, `yellow`, `green`, `red`) survive as aliases so all 500+ existing call sites keep working. Task 3 renames them.

**Files:**
- Modify: `src/ui/theme.js` (whole file)
- Test: `tests/theme.test.js`

**Interfaces:**
- Consumes: `tokens` from `src/ui/tokens.js`.
- Produces: `T` (same shape as before, now token-backed, plus the new keys `acc`, `accInk`, `accBg`, `accOn`, `inkSoft`, `ok`, `okInk`, `okBg`, `warn`, `warnInk`, `warnBg`, `danger`, `dangerInk`, `dangerBg`, `panel3`); `statusColor(v: number): string`; `heat(value: number, min: number, max: number): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/theme.test.js`:

```js
/**
 * Theme tests.
 *
 * `T` is consumed at 500+ call sites in the UI, so a missing key is a blank screen
 * rather than a type error. These pin the whole surface, plus the two functions
 * that turn a number into a colour.
 */

import { describe, expect, it } from 'vitest';

import { tokens } from '../src/ui/tokens.js';
import { T, heat, statusColor } from '../src/ui/theme.js';

describe('T', () => {
  it('exposes every key the existing screens read', () => {
    const required = [
      'bg', 'panel', 'panel2', 'panel3', 'line', 'lineHi',
      'ink', 'inkSoft', 'ink2', 'ink3',
      'acc', 'accInk', 'accBg', 'accOn',
      'ok', 'okInk', 'okBg', 'warn', 'warnInk', 'warnBg',
      'danger', 'dangerInk', 'dangerBg',
      'amber', 'amberInk', 'amberBg', 'green', 'greenBg',
      'yellow', 'yellowBg', 'red', 'redBg',
      'cyan', 'cyanBg', 'violet', 'violetBg', 'mono', 'sans',
    ];
    for (const key of required) {
      expect(T[key], `T.${key} is missing`).toBeTruthy();
    }
  });

  it('aliases the retired amber keys onto the accent', () => {
    // Kept so this commit recolours the app without editing 500 call sites.
    expect(T.amber).toBe(tokens.acc);
    expect(T.amberInk).toBe(tokens.accInk);
    expect(T.amberBg).toBe(tokens.accBg);
  });

  it('no longer contains the old orange anywhere', () => {
    expect(Object.values(T)).not.toContain('#ff6a2c');
    expect(Object.values(T)).not.toContain('#ffab7a');
  });
});

describe('statusColor', () => {
  it('is green at and above 90', () => {
    expect(statusColor(90)).toBe(tokens.ok);
    expect(statusColor(100)).toBe(tokens.ok);
  });

  it('is amber between 55 and 89', () => {
    expect(statusColor(55)).toBe(tokens.warn);
    expect(statusColor(89)).toBe(tokens.warn);
  });

  it('is red below 55', () => {
    expect(statusColor(54)).toBe(tokens.danger);
    expect(statusColor(0)).toBe(tokens.danger);
  });
});

describe('heat', () => {
  it('returns an hsl string', () => {
    expect(heat(50, 0, 100)).toMatch(/^hsl\(/);
  });

  it('clamps out-of-range values instead of running off the scale', () => {
    expect(heat(-999, 0, 100)).toBe(heat(0, 0, 100));
    expect(heat(999, 0, 100)).toBe(heat(100, 0, 100));
  });

  it('moves monotonically from cool to warm across the range', () => {
    const hue = (v) => Number(heat(v, 0, 100).match(/hsl\((-?[\d.]+)/)[1]);
    expect(hue(0)).toBeGreaterThan(hue(50));
    expect(hue(50)).toBeGreaterThan(hue(100));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/theme.test.js`
Expected: FAIL — `T.panel3 is missing` (and the alias assertions fail, since `T.amber` is still `#ff6a2c`).

- [ ] **Step 3: Rewrite theme.js**

Replace the whole of `src/ui/theme.js`:

```js
/**
 * The shared visual language, assembled from the tokens.
 *
 * Every colour in the app resolves to `src/ui/tokens.js`. Screens must not hard-code
 * hex values — `tests/no-hardcoded-colours.test.js` enforces that, because the rule
 * was stated here for a long time and quietly broken 58 times.
 *
 * The `amber*`/`yellow`/`green`/`red` keys are ALIASES kept so the pre-overhaul
 * screens keep rendering while they are migrated. Write new code against
 * `acc`/`warn`/`ok`/`danger` and delete an alias the moment its last caller goes.
 */

import { clamp } from '../sim/index.js';

import { tokens } from './tokens.js';

const T = {
  bg: tokens.bg,
  panel: tokens.panel,
  panel2: tokens.panel2,
  panel3: tokens.panel3,
  panelHi: tokens.panel3,
  line: tokens.line,
  lineHi: tokens.lineHi,

  ink: tokens.ink,
  inkSoft: tokens.inkSoft,
  ink2: tokens.ink2,
  ink3: tokens.ink3,

  acc: tokens.acc,
  accInk: tokens.accInk,
  accBg: tokens.accBg,
  accOn: tokens.accOn,

  ok: tokens.ok,
  okInk: tokens.okInk,
  okBg: tokens.okBg,
  warn: tokens.warn,
  warnInk: tokens.warnInk,
  warnBg: tokens.warnBg,
  danger: tokens.danger,
  dangerInk: tokens.dangerInk,
  dangerBg: tokens.dangerBg,

  cyan: tokens.cyan,
  cyanBg: tokens.cyanBg,
  violet: tokens.violet,
  violetBg: tokens.violetBg,

  // --- aliases retired during the overhaul; see the file comment above ---
  amber: tokens.acc,
  amberInk: tokens.accInk,
  amberBg: tokens.accBg,
  green: tokens.ok,
  greenBg: tokens.okBg,
  yellow: tokens.warn,
  yellowBg: tokens.warnBg,
  red: tokens.danger,
  redBg: tokens.dangerBg,

  mono: tokens.mono,
  sans: tokens.sans,
};

/** Maps a 0-100 health/quality value onto the green/amber/red status scale. */
export const statusColor = (v) => (v >= 90 ? T.ok : v >= 55 ? T.warn : T.danger);

/**
 * Heat-map colour for a table cell, cool (low) through warm (high).
 *
 * Deliberately its own ramp rather than the status scale: a hot VE cell is not a
 * fault, and it must never compete visually with a real warning.
 *
 * @param {number} value cell value
 * @param {number} min low end of the scale
 * @param {number} max high end of the scale
 * @returns {string} an hsl() colour
 */
function heat(value, min, max) {
  const t = clamp((value - min) / (max - min), 0, 1);
  const hue = 214 - t * 214;
  return `hsl(${hue.toFixed(0)}, 68%, ${26 + t * 12}%)`;
}

export { T, heat };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/theme.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify the physics did not move**

Run: `npm test`
Expected: PASS, every suite including `fingerprint.test.js`. If the fingerprint fails here, something is badly wrong — this task touched no physics. Do NOT regenerate it; find the real cause.

- [ ] **Step 6: Look at the app**

Run: `npm run dev`, open the printed URL.
Expected: the app is recognisably the same layout, now blue instead of orange. Buttons will have **dark brown text** (`#1a0f08`) on azure fills — that is expected and Task 3 fixes it.

- [ ] **Step 7: Commit**

```bash
git add src/ui/theme.js tests/theme.test.js
git commit -m "Point theme.js at the azure tokens

Recolours all 500+ existing T.* call sites at once. The retired amber/yellow/
green/red keys stay as aliases so no screen needs editing yet; Task 3 renames
them and purges the hard-coded hexes that bypass this file entirely.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 3: Purge the hard-coded colours

`EcuLab.jsx` contains 58 hex literals and 9 `rgba()` literals that bypass `theme.js` completely, despite that file having always said not to. Nine of them are `'#1a0f08'`, the brown text that sits on amber fills — leave those and every azure button has brown text.

**Files:**
- Modify: `src/ui/EcuLab.jsx` (throughout)
- Test: `tests/no-hardcoded-colours.test.js`

**Interfaces:**
- Consumes: `T` from `src/ui/theme.js`.
- Produces: nothing importable. Establishes the invariant that `src/ui/**` contains no colour literal outside `tokens.js`/`tokens.css`.

- [ ] **Step 1: Write the failing test**

Create `tests/no-hardcoded-colours.test.js`:

```js
/**
 * Guards the rule theme.js has always stated and nothing ever enforced.
 *
 * A hard-coded colour is invisible to the token layer, so a palette change silently
 * misses it. That is exactly how 58 stray hexes accumulated in one component.
 */

import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const UI_DIR = new URL('../src/ui/', import.meta.url);

/** Files allowed to name a colour literally: the token layer itself. */
const ALLOWED = new Set(['tokens.js', 'tokens.css']);

/** @returns {string[]} every source file under src/ui that must not name a colour */
function sourceFiles() {
  return readdirSync(UI_DIR, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(jsx?|css)$/.test(e.name) && !ALLOWED.has(e.name))
    .map((e) => `${e.parentPath ?? e.path}/${e.name}`);
}

describe('src/ui contains no hard-coded colours', () => {
  for (const file of sourceFiles()) {
    const rel = file.slice(file.indexOf('src/ui'));

    it(`${rel} names no hex colour`, () => {
      const hits = readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(hits, `use a token from theme.js instead of ${hits.join(', ')}`).toEqual([]);
    });

    it(`${rel} names no rgb/rgba colour`, () => {
      const hits = readFileSync(file, 'utf8').match(/\brgba?\(\s*\d/g) ?? [];
      expect(hits, 'use a token, or a colour-mix on one, instead').toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/no-hardcoded-colours.test.js`
Expected: FAIL — `src/ui/EcuLab.jsx names no hex colour` reports 58 literals.

- [ ] **Step 3: Re-export the alpha helpers from theme.js**

Task 1 already defined `accAlpha` and `shadowAlpha` in `tokens.js`. Re-export them from
`src/ui/theme.js` so screens have one import for everything colour-related. Add to the
imports:

```js
import { accAlpha, shadowAlpha, tokens } from './tokens.js';
```

and change the final export line to:

```js
export { T, accAlpha, heat, shadowAlpha };
```

`tests/no-hardcoded-colours.test.js` skips `tokens.js` and `tokens.css`, so the two
`rgba()` templates are legal exactly there and nowhere else.

- [ ] **Step 4: Replace every literal in EcuLab.jsx**

Apply this mapping. Each is a plain find-and-replace of the quoted literal with the token expression.

| Literal | Count | Replace with |
|---|---|---|
| `'#1a0f08'` | 9 | `T.accOn` |
| `'#a5aebb'` | 10 | `T.ink2` |
| `'#c3cad2'` | 9 | `T.inkSoft` |
| `'#ff9d9d'` | 7 | `T.dangerInk` |
| `'#9aa4b0'` | 3 | `T.ink2` |
| `'#ff9d7a'` | 2 | `T.accInk` |
| `'#ff8f8f'` | 2 | `T.dangerInk` |
| `'#3a2f16'` | 2 | `T.warnBg` |
| `'#fff'` | 2 | `T.ink` |
| `'#ffcf8a'` | 1 | `T.warnInk` |
| `'#f2f5f7'` | 1 | `T.ink` |
| `'#b7c0c9'` | 1 | `T.inkSoft` |
| `'#7a4526'` | 1 | `T.lineHi` |
| `'#3a4149'` | 1 | `T.ink3` |
| `'#3a2c1c'` | 1 | `T.warnBg` |
| `'#3a2020'` | 1 | `T.dangerBg` |
| `'#382a4a'` | 1 | `T.violetBg` |
| `'#2a323a'` | 1 | `T.panel3` |
| `'#2a1206'` | 1 | `T.accBg` |
| `'#1f4a30'` | 1 | `T.okBg` |
| `'#06210f'` | 1 | `T.okBg` |

And the nine `rgba()` literals, all of them, exactly:

| Literal | Count | Replace with |
|---|---|---|
| `rgba(255,106,44,0.10)` | 1 | `accAlpha(0.10)` |
| `rgba(255,106,44,0.16)` | 1 | `accAlpha(0.16)` |
| `rgba(255,106,44,0.18)` | 1 | `accAlpha(0.18)` |
| `rgba(255,106,44,0.22)` | 1 | `accAlpha(0.22)` |
| `rgba(255,106,44,0.25)` | 1 | `accAlpha(0.25)` |
| `rgba(0,0,0,.4)` | 1 | `shadowAlpha(0.4)` |
| `rgba(0,0,0,0.35)` | 2 | `shadowAlpha(0.35)` |
| `rgba(0,0,0,0.45)` | 1 | `shadowAlpha(0.45)` |

Import the helpers alongside `T` at the top of `EcuLab.jsx`:

```jsx
import { T, accAlpha, heat, shadowAlpha, statusColor } from './theme.js';
```

(Keep whichever of `heat`/`statusColor` the file already imports; add only what is new.)

Because these sit inside template literals as often as bare values, check each site
compiles — `border: \`1px solid ${T.line}\`` rather than `border: '1px solid T.line'`.

Confirm the counts before and after, so nothing is missed:

```bash
grep -o "'#[0-9a-fA-F]\{3,8\}'" src/ui/EcuLab.jsx | wc -l   # 58 before, 0 after
grep -o "rgba([^)]*)" src/ui/EcuLab.jsx | wc -l             # 9 before, 0 after
```

- [ ] **Step 5: Rename the retired aliases at their call sites**

Now that the literals are gone, rename the alias keys so `theme.js` can eventually drop them:

```bash
# Order matters: amberInk and amberBg before amber, or the shorter name eats them.
sed -i '' 's/T\.amberInk/T.accInk/g; s/T\.amberBg/T.accBg/g; s/T\.amber\b/T.acc/g' src/ui/EcuLab.jsx
sed -i '' 's/T\.greenBg/T.okBg/g; s/T\.green\b/T.ok/g' src/ui/EcuLab.jsx
sed -i '' 's/T\.yellowBg/T.warnBg/g; s/T\.yellow\b/T.warn/g' src/ui/EcuLab.jsx
sed -i '' 's/T\.redBg/T.dangerBg/g; s/T\.red\b/T.danger/g' src/ui/EcuLab.jsx
```

Then delete the alias block from `src/ui/theme.js` (the nine lines under
`// --- aliases retired during the overhaul ---`), and delete the
`aliases the retired amber keys onto the accent` test from `tests/theme.test.js`
along with the `amber`/`green`/`yellow`/`red` entries in its `required` array.

- [ ] **Step 6: Update the focus-ring colour in index.html**

`index.html` hard-codes the old orange in two places. Change:

```css
      button:focus-visible, [role="gridcell"]:focus-visible {
        outline: 2px solid #4c9eff;
        outline-offset: 2px;
      }
```

and in the `<head>`:

```html
    <meta name="theme-color" content="#0a0d14" />
```

plus the pre-mount background:

```css
      html, body { margin: 0; padding: 0; background: #0a0d14; }
```

`index.html` is outside `src/ui/`, so the guard test does not cover it — this step is
the reason to check it by hand.

- [ ] **Step 7: Run the guard test**

Run: `npm test -- tests/no-hardcoded-colours.test.js`
Expected: PASS.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: PASS, fingerprint included. Then `npm run lint` and `npm run typecheck` — both clean.

- [ ] **Step 9: Look at the app**

Run: `npm run dev`.
Expected: azure throughout, **button text now dark navy rather than brown**, warnings red, health green. No orange anywhere.

- [ ] **Step 10: Commit**

```bash
git add src/ui/ tests/ index.html
git commit -m "Route every colour in the UI through the token layer

Replaces 58 hex literals and 9 rgba() literals that bypassed theme.js, and
renames the retired amber/yellow/green/red aliases to acc/warn/ok/danger. A
guard test now enforces the rule theme.js has always stated.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 4: CSS Modules and component-test infrastructure

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `vite.config.js:15-20` (test block)
- Modify: `tsconfig.json` (include)
- Create: `src/css-modules.d.ts`
- Modify: `src/main.jsx` (import tokens.css)
- Test: `tests/ui/infrastructure.test.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: the ability to `import styles from './X.module.css'` in a typechecked `.jsx` file, and to render a component in a `jsdom` test via `// @vitest-environment jsdom`.

- [ ] **Step 1: Install the devDependencies**

```bash
npm install --save-dev @testing-library/react@^16.1.0 jsdom@^25.0.1
```

Expected: two devDependencies added, no production dependencies changed. Verify with
`git diff package.json` — the `dependencies` block must be untouched.

- [ ] **Step 2: Widen the test glob to include JSX tests**

In `vite.config.js`, change the `include` line inside `test`:

```js
  test: {
    // The simulation is pure JS with no DOM dependency, so the default Node
    // environment is both correct and much faster than jsdom. Component tests opt
    // into jsdom per-file with `// @vitest-environment jsdom` rather than slowing
    // the physics suite down for everyone.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
  },
```

- [ ] **Step 3: Declare CSS Modules for the typechecker**

Create `src/css-modules.d.ts`:

```ts
/**
 * Vite resolves `*.module.css` to an object of generated class names at build time.
 * `tsc` knows nothing about that, so without this declaration every stylesheet
 * import is a "cannot find module" error under `npm run typecheck`.
 */

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css';
```

- [ ] **Step 4: Put the new UI directories under the typechecker**

In `tsconfig.json`, replace the `include` array and its preceding comment:

```json
  "//include": "src/sim is fully typed. src/ui/EcuLab.jsx is still one large untyped component and stays excluded until the screen split; everything built during the overhaul — tokens, primitives, screens — is typed from the start so the exclusion never has to grow again.",
  "include": [
    "src/sim",
    "src/ui/tokens.js",
    "src/ui/theme.js",
    "src/ui/primitives",
    "src/storage.js",
    "src/version.js",
    "src/globals.d.ts",
    "src/css-modules.d.ts",
    "tests",
    "scripts"
  ],
```

- [ ] **Step 5: Load the tokens stylesheet at the app root**

In `src/main.jsx`, add the import after the React imports and before the local ones:

```jsx
import './ui/tokens.css';
```

- [ ] **Step 6: Write a test that proves the infrastructure works**

Create `tests/ui/infrastructure.test.jsx`:

```jsx
// @vitest-environment jsdom

/**
 * Proves the component-test setup itself works before any primitive depends on it:
 * jsdom provides a document, React renders into it, and @testing-library queries it.
 *
 * CSS Module resolution is proven by the Button test in Task 5, which is the first
 * file that actually imports a stylesheet — this task must not depend on a file a
 * later task creates, or it cannot end green.
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

describe('component test infrastructure', () => {
  it('provides a DOM', () => {
    expect(typeof document).toBe('object');
  });

  it('renders React into jsdom', () => {
    render(<button type="button">RUN DYNO PULL</button>);
    expect(screen.getByRole('button', { name: 'RUN DYNO PULL' })).toBeTruthy();
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- tests/ui/infrastructure.test.jsx`
Expected: PASS, 2 tests.

- [ ] **Step 8: Confirm the physics suite still runs in the fast node environment**

Run: `npm test`
Expected: PASS throughout. The physics suites must NOT have switched to jsdom — only
files carrying the `// @vitest-environment jsdom` comment do.

- [ ] **Step 9: Commit the infrastructure**

```bash
git add package.json package-lock.json vite.config.js tsconfig.json src/css-modules.d.ts src/main.jsx tests/ui/infrastructure.test.jsx
git commit -m "Add CSS Modules typing and jsdom component-test setup

Component tests opt into jsdom per-file so the physics suite keeps running in
the fast node environment. Everything built during the overhaul goes under the
typechecker from the start, so tsconfig's src/ui exclusion never has to grow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 5: Button primitive

The single most visible fix: today every call-to-action is `width: '100%'`, which is
why buttons span a monitor. This Button is content-width by default and full-width only
when explicitly asked.

**Files:**
- Create: `src/ui/primitives/Button.jsx`
- Create: `src/ui/primitives/Button.module.css`
- Test: `tests/ui/Button.test.jsx`

**Interfaces:**
- Consumes: `tokens.css` custom properties (already loaded by `main.jsx`).
- Produces: `Button({ children, variant, size, block, disabled, onClick, type, ...rest })` — `variant` is `'primary' | 'ghost' | 'danger'` (default `'primary'`), `size` is `'sm' | 'md' | 'lg'` (default `'md'`), `block` is a boolean defaulting to `false`. Renders a real `<button>`; unknown props pass through.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/Button.test.jsx`:

```jsx
// @vitest-environment jsdom

/**
 * Button tests.
 *
 * The `block` assertions are the point of this component: the pre-overhaul UI made
 * every action full-width, which is why a primary button spanned a 27-inch monitor.
 * Full-width is now opt-in.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '../../src/ui/primitives/Button.jsx';
import styles from '../../src/ui/primitives/Button.module.css';

describe('Button', () => {
  it('renders a real button element with its label', () => {
    render(<Button>RUN DYNO PULL</Button>);
    const el = screen.getByRole('button', { name: 'RUN DYNO PULL' });
    expect(el.tagName).toBe('BUTTON');
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>RESET</Button>);
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });

  it('is not full-width unless asked', () => {
    render(<Button>RESET</Button>);
    expect(screen.getByRole('button').className).not.toContain(styles.block);
  });

  it('is full-width when block is set', () => {
    render(<Button block>RUN DYNO PULL</Button>);
    expect(screen.getByRole('button').className).toContain(styles.block);
  });

  it('applies the primary variant by default', () => {
    render(<Button>GO</Button>);
    expect(screen.getByRole('button').className).toContain(styles.primary);
  });

  it('applies the variant it is given', () => {
    render(<Button variant="danger">RESET ENGINE</Button>);
    expect(screen.getByRole('button').className).toContain(styles.danger);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>GO</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>GO</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes unknown props through to the element', () => {
    render(<Button aria-label="Run a dyno pull">GO</Button>);
    expect(screen.getByLabelText('Run a dyno pull')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/Button.test.jsx`
Expected: FAIL — cannot resolve `../../src/ui/primitives/Button.jsx`.

- [ ] **Step 3: Write the stylesheet**

Create `src/ui/primitives/Button.module.css`:

```css
/* Content-width by default. `block` is opt-in — see Button.jsx. */

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-family: var(--sans);
  font-weight: 800;
  letter-spacing: 0.05em;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 0.14s ease, border-color 0.14s ease, color 0.14s ease;
}

.button:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
}

.button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* --- variants --- */

.primary {
  background: var(--acc);
  color: var(--acc-on);
}
.primary:hover:not(:disabled) { background: var(--acc-ink); }

.ghost {
  background: transparent;
  border-color: var(--line);
  color: var(--ink2);
}
.ghost:hover:not(:disabled) {
  border-color: var(--line-hi);
  color: var(--ink);
}

/* Reserved for genuinely destructive actions, never for emphasis. */
.danger {
  background: var(--danger-bg);
  border-color: var(--danger);
  color: var(--danger-ink);
}
.danger:hover:not(:disabled) { background: var(--danger); color: var(--bg); }

/* --- sizes --- */

.sm { padding: 6px 11px; font-size: 10px; }
.md { padding: 9px 16px; font-size: 11.5px; }
.lg { padding: 13px 22px; font-size: 13.5px; }

/* --- full width, opt-in only --- */

.block { display: flex; width: 100%; }
```

- [ ] **Step 4: Write the component**

Create `src/ui/primitives/Button.jsx`:

```jsx
/**
 * The app's only button.
 *
 * Content-width by default. The pre-overhaul UI set `width: '100%'` on every
 * call-to-action, which is why a primary action spanned the whole window on a
 * desktop monitor — so full-width is opt-in via `block`, and worth justifying each
 * time you reach for it.
 *
 * `danger` is for destructive actions only. It is not an emphasis variant; the
 * status colours mean engine state and must not be spent on decoration.
 */

import React from 'react';

import styles from './Button.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {'primary'|'ghost'|'danger'} [props.variant]
 * @param {'sm'|'md'|'lg'} [props.size]
 * @param {boolean} [props.block] stretch to the full width of the container
 * @param {string} [props.type]
 * @returns {React.ReactElement}
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  block = false,
  type = 'button',
  ...rest
}) {
  const className = [styles.button, styles[variant], styles[size], block && styles.block]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={className} {...rest}>
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ui/Button.test.jsx tests/ui/infrastructure.test.jsx`
Expected: PASS, 11 tests across the two files (the infrastructure test from Task 4 goes green here too).

- [ ] **Step 6: Verify the guard test still holds**

Run: `npm test -- tests/no-hardcoded-colours.test.js`
Expected: PASS — `Button.module.css` uses `var(--…)` throughout and names no colour.

- [ ] **Step 7: Commit**

```bash
git add src/ui/primitives/Button.jsx src/ui/primitives/Button.module.css tests/ui/
git commit -m "Add the Button primitive

Content-width by default; full-width is opt-in via block. The old UI made every
call-to-action width:100%, which is why primary actions spanned the window on a
desktop monitor.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 6: Surface primitives — Panel, Eyebrow, Note

Replaces the inline `Panel`, `Eyebrow` and `Note` defined at `EcuLab.jsx:39-62`.

**Files:**
- Create: `src/ui/primitives/Panel.jsx`, `src/ui/primitives/Panel.module.css`
- Create: `src/ui/primitives/Eyebrow.jsx`, `src/ui/primitives/Eyebrow.module.css`
- Create: `src/ui/primitives/Note.jsx`, `src/ui/primitives/Note.module.css`
- Test: `tests/ui/surfaces.test.jsx`

**Interfaces:**
- Consumes: `tokens.css`.
- Produces:
  - `Panel({ children, tight, as, ...rest })` — `tight` reduces padding; `as` defaults to `'div'`.
  - `Eyebrow({ children, icon })` — `icon` is an optional Lucide component.
  - `Note({ children, tone })` — `tone` is `'info' | 'warn' | 'danger'`, default `'info'`; renders `role="note"`, and `role="alert"` when tone is `'danger'`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/surfaces.test.jsx`:

```jsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Eyebrow } from '../../src/ui/primitives/Eyebrow.jsx';
import { Note } from '../../src/ui/primitives/Note.jsx';
import noteStyles from '../../src/ui/primitives/Note.module.css';
import { Panel } from '../../src/ui/primitives/Panel.jsx';
import panelStyles from '../../src/ui/primitives/Panel.module.css';

describe('Panel', () => {
  it('renders its children', () => {
    render(<Panel>peak power</Panel>);
    expect(screen.getByText('peak power')).toBeTruthy();
  });

  it('uses the tight padding modifier only when asked', () => {
    const { rerender } = render(<Panel>x</Panel>);
    expect(screen.getByText('x').className).not.toContain(panelStyles.tight);
    rerender(<Panel tight>x</Panel>);
    expect(screen.getByText('x').className).toContain(panelStyles.tight);
  });

  it('can render as another element', () => {
    render(<Panel as="section">x</Panel>);
    expect(screen.getByText('x').tagName).toBe('SECTION');
  });
});

describe('Eyebrow', () => {
  it('renders its label', () => {
    render(<Eyebrow>Forced induction</Eyebrow>);
    expect(screen.getByText('Forced induction')).toBeTruthy();
  });

  it('renders an icon when given one', () => {
    const Icon = (props) => <svg data-testid="icon" {...props} />;
    render(<Eyebrow icon={Icon}>Boost</Eyebrow>);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});

describe('Note', () => {
  it('defaults to the info tone', () => {
    render(<Note>Speed density indexes VE by RPM and MAP.</Note>);
    expect(screen.getByRole('note').className).toContain(noteStyles.info);
  });

  it('applies the warn tone', () => {
    render(<Note tone="warn">Injector duty is above 90%.</Note>);
    expect(screen.getByRole('note').className).toContain(noteStyles.warn);
  });

  it('announces a danger note as an alert', () => {
    // A danger note reports engine distress; a screen reader should not have to
    // stumble across it.
    render(<Note tone="danger">Knock retard active.</Note>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/surfaces.test.jsx`
Expected: FAIL — cannot resolve `../../src/ui/primitives/Eyebrow.jsx`.

- [ ] **Step 3: Write Panel**

`src/ui/primitives/Panel.module.css`:

```css
.panel {
  background: var(--panel2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
}

.tight { padding: 10px 12px; }
```

`src/ui/primitives/Panel.jsx`:

```jsx
/** A bordered surface. The app's default container for a group of related controls. */

import React from 'react';

import styles from './Panel.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {boolean} [props.tight] reduce the padding
 * @param {string} [props.as] element to render, defaults to a div
 * @returns {React.ReactElement}
 */
export function Panel({ children, tight = false, as: As = 'div', ...rest }) {
  const className = [styles.panel, tight && styles.tight].filter(Boolean).join(' ');
  return <As className={className} {...rest}>{children}</As>;
}
```

- [ ] **Step 4: Write Eyebrow**

`src/ui/primitives/Eyebrow.module.css`:

```css
.eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--acc-ink);
}

.rule {
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--acc);
}
```

`src/ui/primitives/Eyebrow.jsx`:

```jsx
/** Small uppercase section label with an accent rule. Labels a group; never a status. */

import React from 'react';

import styles from './Eyebrow.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {React.ElementType} [props.icon] optional Lucide icon component
 * @returns {React.ReactElement}
 */
export function Eyebrow({ children, icon: Icon }) {
  return (
    <div className={styles.eyebrow}>
      <span className={styles.rule} />
      {Icon && <Icon size={13} />}
      <span>{children}</span>
    </div>
  );
}
```

- [ ] **Step 5: Write Note**

`src/ui/primitives/Note.module.css`:

```css
.note {
  display: flex;
  gap: 9px;
  margin: 10px 0;
  padding: 11px 13px;
  border: 1px solid;
  border-radius: 10px;
  font-family: var(--sans);
  font-size: 12.5px;
  line-height: 1.55;
}

.icon { flex-shrink: 0; margin-top: 1px; }

.info { background: var(--panel2); border-color: var(--line); color: var(--ink-soft); }
.warn { background: var(--warn-bg); border-color: var(--warn); color: var(--warn-ink); }
.danger { background: var(--danger-bg); border-color: var(--danger); color: var(--danger-ink); }
```

`src/ui/primitives/Note.jsx`:

```jsx
/**
 * An inline explanatory box.
 *
 * `warn` and `danger` carry engine meaning, so they are not emphasis levels — do not
 * reach for `danger` to make a paragraph louder.
 */

import { Info } from 'lucide-react';
import React from 'react';

import styles from './Note.module.css';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @param {'info'|'warn'|'danger'} [props.tone]
 * @returns {React.ReactElement}
 */
export function Note({ children, tone = 'info' }) {
  const className = [styles.note, styles[tone] ?? styles.info].join(' ');
  return (
    <div className={className} role={tone === 'danger' ? 'alert' : 'note'}>
      <Info size={15} className={styles.icon} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/ui/surfaces.test.jsx`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add src/ui/primitives/ tests/ui/surfaces.test.jsx
git commit -m "Add Panel, Eyebrow and Note primitives

A danger-toned Note announces as role=alert, so engine distress is not
something a screen-reader user has to stumble across.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 7: Readout primitives — StatTile and Bar

Replaces `StatTile` (`EcuLab.jsx:174`) and `HealthBar` (`:183`).

**Files:**
- Create: `src/ui/primitives/StatTile.jsx`, `src/ui/primitives/StatTile.module.css`
- Create: `src/ui/primitives/Bar.jsx`, `src/ui/primitives/Bar.module.css`
- Test: `tests/ui/readouts.test.jsx`

**Interfaces:**
- Consumes: `statusColor` from `src/ui/theme.js`.
- Produces:
  - `StatTile({ label, value, unit, tone })` — `tone` is `'neutral' | 'acc' | 'ok' | 'warn' | 'danger'`, default `'neutral'`.
  - `Bar({ label, value, max })` — `value` and `max` are numbers; `max` defaults to `100`. Colour comes from `statusColor(percent)`. Renders `role="meter"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/readouts.test.jsx`:

```jsx
// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Bar } from '../../src/ui/primitives/Bar.jsx';
import { StatTile } from '../../src/ui/primitives/StatTile.jsx';
import tileStyles from '../../src/ui/primitives/StatTile.module.css';

describe('StatTile', () => {
  it('renders label, value and unit', () => {
    render(<StatTile label="PEAK HP" value={412} unit="whp" />);
    expect(screen.getByText('PEAK HP')).toBeTruthy();
    expect(screen.getByText('412')).toBeTruthy();
    expect(screen.getByText('whp')).toBeTruthy();
  });

  it('omits the unit element entirely when no unit is given', () => {
    const { container } = render(<StatTile label="PULLS" value={7} />);
    expect(container.querySelector(`.${tileStyles.unit}`)).toBeNull();
  });

  it('applies the tone it is given', () => {
    const { container } = render(<StatTile label="KNOCK" value="0.4" tone="warn" />);
    expect(container.querySelector(`.${tileStyles.warn}`)).toBeTruthy();
  });
});

describe('Bar', () => {
  it('exposes itself as a meter with its current value', () => {
    render(<Bar label="Pistons" value={86} />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuenow')).toBe('86');
    expect(meter.getAttribute('aria-valuemin')).toBe('0');
    expect(meter.getAttribute('aria-valuemax')).toBe('100');
  });

  it('names the meter after its label', () => {
    render(<Bar label="Bearings" value={71} />);
    expect(screen.getByRole('meter', { name: 'Bearings' })).toBeTruthy();
  });

  it('scales the fill to the percentage of max', () => {
    const { container } = render(<Bar label="Duty" value={40} max={80} />);
    expect(container.querySelector('[data-fill]').style.width).toBe('50%');
  });

  it('clamps a value above max instead of overflowing the track', () => {
    const { container } = render(<Bar label="Duty" value={150} max={100} />);
    expect(container.querySelector('[data-fill]').style.width).toBe('100%');
  });

  it('clamps a negative value to zero', () => {
    const { container } = render(<Bar label="Duty" value={-20} max={100} />);
    expect(container.querySelector('[data-fill]').style.width).toBe('0%');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/readouts.test.jsx`
Expected: FAIL — cannot resolve `../../src/ui/primitives/Bar.jsx`.

- [ ] **Step 3: Write StatTile**

`src/ui/primitives/StatTile.module.css`:

```css
.tile {
  flex: 1;
  min-width: 74px;
  padding: 9px 10px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
  font-family: var(--sans);
}

.label {
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--ink3);
}

.value {
  margin-top: 3px;
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 800;
  color: var(--ink);
}

.unit {
  margin-left: 2px;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--ink2);
}

.acc .value { color: var(--acc); }
.ok .value { color: var(--ok); }
.warn .value { color: var(--warn); }
.danger .value { color: var(--danger); }
```

`src/ui/primitives/StatTile.jsx`:

```jsx
/** A single labelled number. The app's unit of measured output. */

import React from 'react';

import styles from './StatTile.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.unit]
 * @param {'neutral'|'acc'|'ok'|'warn'|'danger'} [props.tone]
 * @returns {React.ReactElement}
 */
export function StatTile({ label, value, unit, tone = 'neutral' }) {
  const className = [styles.tile, styles[tone]].filter(Boolean).join(' ');
  return (
    <div className={className}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write Bar**

`src/ui/primitives/Bar.module.css`:

```css
.wrap { font-family: var(--sans); }

.label {
  display: flex;
  justify-content: space-between;
  font-size: 9.5px;
  color: var(--ink2);
  margin-bottom: 4px;
}

.pct { font-family: var(--mono); font-weight: 700; }

.track {
  height: 5px;
  border-radius: 3px;
  background: var(--panel3);
  overflow: hidden;
}

.fill { height: 100%; transition: width 0.4s ease; }
```

`src/ui/primitives/Bar.jsx`:

```jsx
/**
 * A horizontal meter for a 0-max quantity: component health, injector duty.
 *
 * The fill colour comes from `statusColor`, so it is a STATUS, never decoration.
 * Do not use this for a value that has no good/bad reading.
 */

import React from 'react';

import { clamp } from '../../sim/index.js';
import { statusColor } from '../theme.js';

import styles from './Bar.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value
 * @param {number} [props.max]
 * @returns {React.ReactElement}
 */
export function Bar({ label, value, max = 100 }) {
  const pct = clamp((value / max) * 100, 0, 100);
  return (
    <div className={styles.wrap}>
      <div className={styles.label}>
        <span>{label}</span>
        <span className={styles.pct} style={{ color: statusColor(pct) }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          data-fill=""
          className={styles.fill}
          style={{ width: `${pct}%`, background: statusColor(pct) }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ui/readouts.test.jsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/ui/primitives/ tests/ui/readouts.test.jsx
git commit -m "Add StatTile and Bar readout primitives

Bar exposes role=meter with real aria value attributes and clamps out-of-range
input rather than overflowing its track.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 8: Control primitives — Seg, Select, Toggle

Replaces `Seg` (`EcuLab.jsx:83`), `GroupedSelect` (`:125`) and `ToggleRow` (`:160`).

**Files:**
- Create: `src/ui/primitives/Seg.jsx`, `src/ui/primitives/Seg.module.css`
- Create: `src/ui/primitives/Select.jsx`, `src/ui/primitives/Select.module.css`
- Create: `src/ui/primitives/Toggle.jsx`, `src/ui/primitives/Toggle.module.css`
- Test: `tests/ui/controls.test.jsx`

**Interfaces:**
- Consumes: `Button` is NOT used here — segments need their own pressed semantics.
- Produces:
  - `Seg({ options, value, onChange, label })` — `options` is `Array<{id: string, label: string, icon?: React.ElementType}>`. Renders `role="tablist"`-free plain buttons carrying `aria-pressed`.
  - `Select({ groups, extra, value, onChange, label })` — `groups` is `Array<{label: string, options: Array<{value: string, label: string}>}>`, `extra` is a flat `Array<{value, label}>` appended after the groups.
  - `Toggle({ label, sub, checked, onChange })` — renders a `role="switch"` button with `aria-checked`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/controls.test.jsx`:

```jsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Seg } from '../../src/ui/primitives/Seg.jsx';
import { Select } from '../../src/ui/primitives/Select.jsx';
import { Toggle } from '../../src/ui/primitives/Toggle.jsx';

const SEG_OPTIONS = [
  { id: 've', label: 'AIR' },
  { id: 'timing', label: 'SPARK' },
  { id: 'afr', label: 'FUEL' },
];

describe('Seg', () => {
  it('renders one button per option', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks only the selected option as pressed', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="timing" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'SPARK' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'AIR' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the id of the option clicked', () => {
    const onChange = vi.fn();
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'FUEL' }));
    expect(onChange).toHaveBeenCalledWith('afr');
  });

  it('names the group for assistive technology', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Table' })).toBeTruthy();
  });
});

describe('Select', () => {
  const GROUPS = [
    { label: 'BMW', options: [{ value: 'n54', label: 'N54 3.0' }, { value: 'b58', label: 'B58 3.0' }] },
    { label: 'Nissan', options: [{ value: 'vq35', label: 'VQ35DE' }] },
  ];

  it('renders every option inside its group', () => {
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={() => {}} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('appends the extra options after the groups', () => {
    render(
      <Select
        label="Engine"
        groups={GROUPS}
        extra={[{ value: 'custom', label: 'Custom build' }]}
        value="n54"
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect(screen.getByRole('option', { name: 'Custom build' })).toBeTruthy();
  });

  it('reports the selected value', () => {
    const onChange = vi.fn();
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b58' } });
    expect(onChange).toHaveBeenCalledWith('b58');
  });

  it('is labelled', () => {
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Engine' })).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('exposes itself as a switch reflecting its state', () => {
    render(<Toggle label="Intake" checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: /Intake/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('reports the flipped value when clicked', () => {
    const onChange = vi.fn();
    render(<Toggle label="Intake" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders its sub-label', () => {
    render(<Toggle label="Intake" sub="+4% VE above 4000 RPM" checked onChange={() => {}} />);
    expect(screen.getByText('+4% VE above 4000 RPM')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/controls.test.jsx`
Expected: FAIL — cannot resolve `../../src/ui/primitives/Seg.jsx`.

- [ ] **Step 3: Write Seg**

`src/ui/primitives/Seg.module.css`:

```css
.seg {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 3px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 9px;
}

.item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 13px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ink3);
  font-family: var(--sans);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background-color 0.14s ease, color 0.14s ease;
}

.item:hover { color: var(--ink2); }
.item:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

.item[aria-pressed='true'] {
  background: var(--acc-bg);
  color: var(--acc-ink);
  box-shadow: inset 0 0 0 1px var(--acc);
}
```

`src/ui/primitives/Seg.jsx`:

```jsx
/**
 * A segmented control: pick exactly one of a small set.
 *
 * Plain buttons carrying `aria-pressed` rather than a radio group, because these
 * switch a view rather than submit a value.
 */

import React from 'react';

import styles from './Seg.module.css';

/**
 * @param {object} props
 * @param {string} props.label accessible name for the group
 * @param {Array<{id: string, label: string, icon?: React.ElementType}>} props.options
 * @param {string} props.value id of the selected option
 * @param {(id: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Seg({ label, options, value, onChange }) {
  return (
    <div className={styles.seg} role="group" aria-label={label}>
      {options.map(({ id, label: text, icon: Icon }) => (
        <button
          key={id}
          type="button"
          className={styles.item}
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {Icon && <Icon size={13} aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Write Select**

`src/ui/primitives/Select.module.css`:

```css
.wrap { position: relative; display: inline-block; min-width: 200px; }

.select {
  width: 100%;
  padding: 11px 34px 11px 13px;
  appearance: none;
  -webkit-appearance: none;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel2);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.select:hover { border-color: var(--line-hi); }
.select:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

.chevron {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink2);
  pointer-events: none;
}
```

`src/ui/primitives/Select.jsx`:

```jsx
/**
 * A grouped dropdown built on a real `<select>`.
 *
 * Deliberately native: keyboard navigation, type-ahead and screen-reader semantics
 * come free, and on a phone it opens the platform picker. Only the chevron is ours.
 */

import { ChevronDown } from 'lucide-react';
import React from 'react';

import styles from './Select.module.css';

/**
 * @param {object} props
 * @param {string} props.label accessible name
 * @param {Array<{label: string, options: Array<{value: string, label: string}>}>} props.groups
 * @param {Array<{value: string, label: string}>} [props.extra] ungrouped options, appended last
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Select({ label, groups, extra = [], value, onChange }) {
  return (
    <div className={styles.wrap}>
      <select
        className={styles.select}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        ))}
        {extra.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={16} className={styles.chevron} aria-hidden="true" />
    </div>
  );
}
```

- [ ] **Step 5: Write Toggle**

`src/ui/primitives/Toggle.module.css`:

```css
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel2);
  color: inherit;
  font-family: var(--sans);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.14s ease;
}

.row:hover { border-color: var(--line-hi); }
.row:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
.row[aria-checked='true'] { border-color: var(--acc); }

.label { font-size: 13px; font-weight: 700; color: var(--ink); }
.sub { margin-top: 2px; font-size: 11px; color: var(--ink2); }

.track {
  flex-shrink: 0;
  width: 38px;
  height: 22px;
  padding: 2px;
  border-radius: 11px;
  background: var(--panel3);
  transition: background-color 0.16s ease;
}

.row[aria-checked='true'] .track { background: var(--acc); }

.knob {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ink2);
  transition: transform 0.16s ease, background-color 0.16s ease;
}

.row[aria-checked='true'] .knob {
  transform: translateX(16px);
  background: var(--acc-on);
}
```

`src/ui/primitives/Toggle.jsx`:

```jsx
/** An on/off row for a single hardware option. */

import React from 'react';

import styles from './Toggle.module.css';

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} [props.sub] one line on what the option physically does
 * @param {boolean} props.checked
 * @param {(next: boolean) => void} props.onChange
 * @returns {React.ReactElement}
 */
export function Toggle({ label, sub, checked, onChange }) {
  return (
    <button
      type="button"
      className={styles.row}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>
        <span className={styles.label}>{label}</span>
        {sub && <span className={styles.sub} style={{ display: 'block' }}>{sub}</span>}
      </span>
      <span className={styles.track}>
        <span className={styles.knob} />
      </span>
    </button>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/ui/controls.test.jsx`
Expected: PASS, 12 tests.

Note: `<button role="switch">` gets its accessible name from its text content, so
`getByRole('switch', { name: /Intake/ })` matches on the label — the regex is there
because the sub-label joins the accessible name when present.

- [ ] **Step 7: Commit**

```bash
git add src/ui/primitives/ tests/ui/controls.test.jsx
git commit -m "Add Seg, Select and Toggle control primitives

Select stays a native <select> so keyboard navigation, type-ahead and the
platform picker on mobile come for free. Toggle is a real role=switch.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 9: Convert the entry screens

Proves the primitives against real screens. `StartScreen` (`EcuLab.jsx:519-539`) and
`TutorialScreen` (`:488-517`) are self-contained, are the first thing a user sees, and
touch none of the four main tabs — so this validates the system without pre-empting the
IA work in PR 3.

**Files:**
- Create: `src/ui/screens/StartScreen.jsx`, `src/ui/screens/StartScreen.module.css`
- Create: `src/ui/screens/TutorialScreen.jsx`, `src/ui/screens/TutorialScreen.module.css`
- Modify: `src/ui/EcuLab.jsx` — delete both inline components, import the new ones
- Modify: `tsconfig.json` — add `src/ui/screens` to `include`
- Test: `tests/ui/screens.test.jsx`

**Interfaces:**
- Consumes: `Button` from Task 5; `TUTORIAL_STEPS` and `DialMark` stay in `EcuLab.jsx` and are passed in as props so this task does not have to move them.
- Produces:
  - `StartScreen({ onStart, onTutorial, version, dial })` — `dial` is a rendered node.
  - `TutorialScreen({ steps, onDone })` — `steps` is `Array<{title: string, body: string}>`.

- [ ] **Step 1: Write the failing test**

Create `tests/ui/screens.test.jsx`:

```jsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { StartScreen } from '../../src/ui/screens/StartScreen.jsx';
import { TutorialScreen } from '../../src/ui/screens/TutorialScreen.jsx';

const STEPS = [
  { title: 'This is an air pump', body: 'Everything starts with airflow.' },
  { title: 'Design it on BUILD', body: 'None of it is cosmetic.' },
];

describe('StartScreen', () => {
  it('starts the app', () => {
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} onTutorial={() => {}} version="v1.4.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('opens the tutorial', () => {
    const onTutorial = vi.fn();
    render(<StartScreen onStart={() => {}} onTutorial={onTutorial} version="v1.4.0" />);
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    expect(onTutorial).toHaveBeenCalledTimes(1);
  });

  it('shows the build version', () => {
    render(<StartScreen onStart={() => {}} onTutorial={() => {}} version="v1.4.0" />);
    expect(screen.getByText('v1.4.0')).toBeTruthy();
  });
});

describe('TutorialScreen', () => {
  it('opens on the first step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.getByText('This is an air pump')).toBeTruthy();
  });

  it('advances to the next step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText('Design it on BUILD')).toBeTruthy();
  });

  it('offers no BACK on the first step', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.queryByRole('button', { name: 'BACK' })).toBeNull();
  });

  it('goes back', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    expect(screen.getByText('This is an air pump')).toBeTruthy();
  });

  it('finishes from the last step', () => {
    const onDone = vi.fn();
    render(<TutorialScreen steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    fireEvent.click(screen.getByRole('button', { name: 'START TUNING' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('skips out at any point', () => {
    const onDone = vi.fn();
    render(<TutorialScreen steps={STEPS} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reports progress through the steps', () => {
    render(<TutorialScreen steps={STEPS} onDone={() => {}} />);
    expect(screen.getByText('TUTORIAL · 1/2')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/screens.test.jsx`
Expected: FAIL — cannot resolve `../../src/ui/screens/StartScreen.jsx`.

- [ ] **Step 3: Write StartScreen**

`src/ui/screens/StartScreen.module.css`:

```css
.screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 24px;
  position: relative;
  overflow: hidden;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
  text-align: center;
}

.glow {
  position: absolute;
  top: -15%;
  left: 50%;
  width: 420px;
  height: 420px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(circle, var(--acc-glow) 0%, transparent 70%);
  pointer-events: none;
}

.inner { position: relative; display: flex; flex-direction: column; align-items: center; }

.dial { margin-bottom: 22px; }

.eyebrow {
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.28em;
  color: var(--acc-ink);
}

.title {
  max-width: 22ch;
  margin-bottom: 15px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}

.blurb {
  max-width: 42ch;
  margin-bottom: 34px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--ink2);
}

.actions { display: flex; flex-direction: column; gap: 12px; width: 100%; max-width: 300px; }

.version { margin-top: 18px; font-family: var(--mono); font-size: 10.5px; color: var(--ink3); }

/* From the small-tablet breakpoint up there is room to sit the two actions side by
   side, which is also where a full-width button starts looking wrong. */
@media (min-width: 560px) {
  .title { font-size: 34px; }
  .actions { flex-direction: row; max-width: none; justify-content: center; }
}
```

`src/ui/screens/StartScreen.jsx`:

```jsx
/** The first screen: what this is, and the two ways in. */

import React from 'react';

import { Button } from '../primitives/Button.jsx';

import styles from './StartScreen.module.css';

/**
 * @param {object} props
 * @param {() => void} props.onStart
 * @param {() => void} props.onTutorial
 * @param {string} props.version
 * @param {React.ReactNode} [props.dial] decorative dial mark
 * @returns {React.ReactElement}
 */
export function StartScreen({ onStart, onTutorial, version, dial }) {
  return (
    <div className={styles.screen}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.inner}>
        {dial && <div className={styles.dial}>{dial}</div>}
        <div className={styles.eyebrow}>CARIBOU TUNING</div>
        <h1 className={styles.title}>Engine Management Sandbox</h1>
        <p className={styles.blurb}>
          Design an engine. Tune it. Log it. Improve it. A free-tune sandbox built to
          teach real engine management, not just move sliders.
        </p>
        <div className={styles.actions}>
          <Button size="lg" onClick={onStart}>START</Button>
          <Button size="lg" variant="ghost" onClick={onTutorial}>TUTORIAL</Button>
        </div>
        <div className={styles.version}>{version}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write TutorialScreen**

`src/ui/screens/TutorialScreen.module.css`:

```css
.screen {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--sans);
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
}

.count {
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.15em;
  color: var(--acc-ink);
}

.skip {
  border: none;
  background: none;
  color: var(--ink3);
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.skip:hover { color: var(--ink2); }
.skip:focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 0 24px;
}

.inner { width: 100%; max-width: 60ch; }

.title { margin: 0 0 13px; font-size: 21px; font-weight: 800; letter-spacing: -0.01em; }
.text { margin: 0; font-size: 14.5px; line-height: 1.7; color: var(--ink-soft); }

.dots { display: flex; gap: 6px; justify-content: center; padding-bottom: 18px; }

.dot { width: 6px; height: 6px; border-radius: 3px; background: var(--line); transition: width 0.2s ease; }
.dotOn { width: 20px; background: var(--acc); }

.actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom));
}

@media (min-width: 560px) {
  .title { font-size: 27px; }
}
```

`src/ui/screens/TutorialScreen.jsx`:

```jsx
/** The eight-card walkthrough, shown before the first run and from the header. */

import React, { useState } from 'react';

import { Button } from '../primitives/Button.jsx';

import styles from './TutorialScreen.module.css';

/**
 * @param {object} props
 * @param {Array<{title: string, body: string}>} props.steps
 * @param {() => void} props.onDone
 * @returns {React.ReactElement}
 */
export function TutorialScreen({ steps, onDone }) {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className={styles.screen}>
      <div className={styles.bar}>
        <div className={styles.count}>TUTORIAL · {step + 1}/{steps.length}</div>
        <button type="button" className={styles.skip} onClick={onDone}>SKIP</button>
      </div>

      <div className={styles.body}>
        <div className={styles.inner}>
          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.text}>{current.body}</p>
        </div>
      </div>

      <div className={styles.dots} aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s.title}
            className={[styles.dot, i === step && styles.dotOn].filter(Boolean).join(' ')}
          />
        ))}
      </div>

      <div className={styles.actions}>
        {step > 0 && (
          <Button size="lg" variant="ghost" onClick={() => setStep((v) => v - 1)}>BACK</Button>
        )}
        <Button size="lg" onClick={() => (last ? onDone() : setStep((v) => v + 1))}>
          {last ? 'START TUNING' : 'NEXT'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/ui/screens.test.jsx`
Expected: PASS, 11 tests.

- [ ] **Step 6: Wire them into EcuLab.jsx**

Delete the `TutorialScreen` function (`EcuLab.jsx:488-517`) and the `StartScreen`
function (`:519-539`). Keep `TUTORIAL_STEPS` and `DialMark` where they are. Add to the
imports at the top of the file:

```jsx
import { StartScreen } from './screens/StartScreen.jsx';
import { TutorialScreen } from './screens/TutorialScreen.jsx';
```

Then replace the two dispatch lines (`:1164-1165`) with:

```jsx
  if (appView === 'start') {
    return (
      <StartScreen
        onStart={() => { setAppView('app'); setTab('build'); }}
        onTutorial={() => setAppView('tutorial')}
        version={BUILD_VERSION}
        dial={<DialMark size={92} pct={0.62} />}
      />
    );
  }
  if (appView === 'tutorial') {
    return (
      <TutorialScreen
        steps={TUTORIAL_STEPS}
        onDone={() => { setAppView('app'); setTab('build'); setJourneyStep(0); }}
      />
    );
  }
```

- [ ] **Step 7: Put the screens directory under the typechecker**

In `tsconfig.json`, add `"src/ui/screens"` to `include`, directly after
`"src/ui/primitives"`.

- [ ] **Step 8: Run the full suite and the whole gate**

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all four clean. `npm run lint` will flag `useState` as unused in
`EcuLab.jsx` only if no other code uses it — it does, so no change is needed there.

- [ ] **Step 9: Look at both screens**

Run: `npm run dev`.
Expected: the start screen shows two azure actions **side by side above 560px wide** and
stacked below it — the first responsive behaviour in the app. The tutorial reads at a
comfortable measure instead of spanning the window.

- [ ] **Step 10: Commit**

```bash
git add src/ui/screens/ src/ui/EcuLab.jsx tsconfig.json tests/ui/screens.test.jsx
git commit -m "Rebuild the start and tutorial screens on the primitives

First screens off the design system, and the app's first responsive layout: the
entry actions sit side by side above 560px and stack below it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd"
```

---

### Task 10: Re-sync, verify, and open the PR

**Files:**
- Modify: `README.md` if it names the old palette (check; do not assume)

**Interfaces:**
- Consumes: everything above.
- Produces: an open pull request awaiting human review.

- [ ] **Step 1: Check the docs for stale colour claims**

```bash
grep -rn "amber\|orange\|#ff6a2c" README.md CONTRIBUTING.md docs/ --include="*.md" | grep -v "docs/superpowers"
```

If the README describes the palette, update the wording to match. If nothing matches,
move on — do not invent documentation changes.

- [ ] **Step 2: Re-sync with the base branch**

```bash
git fetch origin
git rebase origin/main
```

If anything conflicts, resolve it deliberately. If `tests/fixtures/` conflicts,
regenerate rather than picking a side — but nothing in this plan touches fixtures, so a
conflict there means something is wrong.

- [ ] **Step 3: Re-run the entire gate after the rebase**

A rebase produces a new tree; the pre-rebase green says nothing about it.

```bash
node --version    # must print v20.x or v22.x
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all clean, `fingerprint.test.js` included and unmodified.

- [ ] **Step 4: Confirm the fingerprint baseline was never touched**

```bash
git diff origin/main --stat -- tests/fixtures/
```

Expected: **no output.** Any change here means the physics moved and the PR must not
be opened until it is understood.

- [ ] **Step 5: Confirm no production dependency changed**

```bash
git diff origin/main -- package.json | grep -A6 '"dependencies"'
```

Expected: no changes inside the `dependencies` block.

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/6-ui-design-system
gh pr create --title "UI overhaul PR 1: design system and azure palette" --body "$(cat <<'EOF'
First of seven PRs against #6. Establishes the token layer and primitives
library the rest of the overhaul is built on — and recolours the app on the way
past.

## What changed

- **`src/ui/tokens.js` + `tokens.css`** — the palette, defined once. A contract
  test proves the two files cannot drift, and pins the rule the system rests on:
  the accent is never a status colour.
- **`theme.js` re-pointed at the tokens** — recolours all 500+ existing `T.*`
  call sites at once, from orange to azure.
- **58 hex literals and 9 `rgba()` literals removed from `EcuLab.jsx`**. That
  file had been bypassing `theme.js` entirely, despite `theme.js` always saying
  not to. A guard test now enforces it.
- **Primitives** — Button, Panel, Eyebrow, Note, StatTile, Bar, Seg, Select,
  Toggle. Each with a co-located CSS Module and component tests.
- **Start and tutorial screens rebuilt** on the primitives, including the app's
  first responsive breakpoint.

## Why the palette changed

The old accent `#ff6a2c` appeared 84 times — wordmark, active nav, focus ring,
primary buttons, selected cells, *and* genuine warnings. An app whose purpose is
reporting engine distress had spent its distress colour on chrome, leaving a real
warning nothing to escalate to. Azure sits far from every status hue, and its
blue-black base makes the red alarm state read harder than a neutral grey ground
would.

Design doc: `docs/superpowers/specs/2026-08-19-ui-overhaul-design.md`

## What did NOT change

No physics. `src/sim/` is untouched and the behavioural fingerprint is
byte-identical — which is the point: a UI refactor that moves the fingerprint has
broken something, and the baseline was never regenerated.

No production dependencies. `@testing-library/react` and `jsdom` are devDependencies.

## Verification

`npm test`, `npm run lint`, `npm run typecheck` and `npm run build` all clean on
Node 22, run again after rebasing onto current `main`.

Part of #6.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01QXHAjTu429hwKhLLSRfTCd
EOF
)"
```

- [ ] **Step 7: Check no auto-merge is queued**

```bash
gh pr view --json autoMergeRequest
```

Expected: `{"autoMergeRequest":null}`. If it is non-null, run
`gh pr merge <N> --disable-auto`. **Do not merge this PR.** It ends open, awaiting
human review.

---

## Notes for the implementer

**The fingerprint is the whole safety net.** Nothing in this plan touches `src/sim/`,
so `tests/fingerprint.test.js` must stay green from the first commit to the last. If it
ever fails, stop and find out why — the documented cure for a failing fingerprint is
regenerating the baseline, and doing that here would replace the project's regression
gate with a broken refactor's answer.

**Check your Node version before believing a failure.** `node --version` must be 20 or
22. On Node 26 the fingerprint fails on an untouched checkout, which looks exactly like
a physics break and is not one.

**Task 3 is the one to slow down on.** It is the only task that edits `EcuLab.jsx`
broadly, and its `sed` renames are order-sensitive: `T.amberInk` and `T.amberBg` must be
rewritten before `T.amber`, or the shorter pattern consumes the longer ones and produces
`T.accInk` → `T.accInkInk`-style damage. Run the guard test and read the diff.

**Do not add a barrel file** (`primitives/index.js`). Direct imports keep the dependency
graph obvious and stop the whole library being pulled in for one Button.
