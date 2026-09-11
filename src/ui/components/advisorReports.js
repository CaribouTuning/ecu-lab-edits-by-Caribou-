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

import { OPEN_LOOP_KPA, VE_NOTABLE_PCT } from '../../sim/index.js';

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
    // A row or column. Danger first as always, then severity order — past MBT
    // before under-advanced, the reverse of the table-wide fall-through below,
    // and with no four-cell floor: the player picked this band deliberately, so
    // one flagged cell in it is worth saying.
    const over = countIn(overAdvanced, selection);
    if (over > 0) {
      return {
        tone: 'danger',
        headline: `${over} of these cells ${over === 1 ? 'is' : 'are'} past the knock limit`,
        state: 'group-over',
        detail: { count: over },
      };
    }
    const past = countIn(pastMbt, selection);
    if (past > 0) {
      return { tone: 'warn', headline: `${past} of these cells ${past === 1 ? 'is' : 'are'} past MBT`, state: 'group-past-mbt', detail: { count: past } };
    }
    const under = countIn(underAdvanced, selection);
    if (under > 0) {
      return { tone: 'warn', headline: `${under} of these cells ${under === 1 ? 'has' : 'have'} advance left`, state: 'group-under', detail: { count: under } };
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

/**
 * @param {object} calAdvice as returned by `calibrationAdvice`
 * @param {Selection|null} selection
 * @returns {AdvisorReport}
 */
export function fuelReport(calAdvice, selection) {
  const { fuelAdv, wrongMix } = calAdvice;

  if (selection && selection.type === 'cell') {
    const cell = fuelAdv.find((c) => c.ri === selection.row && c.ci === selection.col);
    // No entry means `calibrationAdvice` filtered the cell out as unreachable
    // (its rule 2), the same reason `sparkReport` can miss a lookup — not the
    // same thing as a cell that is on target.
    if (!cell) return { tone: 'info', headline: 'Never reached by this build', state: 'cell-unreachable', detail: {} };

    // Closed loop binds before membership, and unconditionally: the trims own
    // this cell regardless of how large its delta is, so a big number here is
    // not a reason to override the rule and report it anyway.
    if (cell.map < OPEN_LOOP_KPA) {
      return { tone: 'info', headline: 'Closed loop — the trims own this cell', state: 'cell-closed-loop', detail: { cell } };
    }

    if (holds(wrongMix, cell.ri, cell.ci)) {
      const direction = cell.delta < 0 ? 'lean' : 'rich';
      return {
        tone: 'warn',
        headline: `${Math.abs(cell.delta).toFixed(1)} AFR ${direction} of best power`,
        state: 'cell-off',
        detail: { cell },
      };
    }
    return { tone: 'ok', headline: 'On best power', state: 'cell-ok', detail: { cell } };
  }

  if (selection) {
    // A row or column. Only one category here, unlike sparkReport's three, so
    // there is no severity order to preserve — just the count in the band.
    const off = countIn(wrongMix, selection);
    if (off > 0) {
      return { tone: 'warn', headline: `${off} of these cells ${off === 1 ? 'is' : 'are'} off best power`, state: 'group-off', detail: { count: off } };
    }
    return { tone: 'ok', headline: 'Nothing flagged in this band', state: 'group-clean', detail: {} };
  }

  // Table-wide. FUEL never had a fall-through order to preserve — the old
  // banner only ever showed one thing, the wrongMix count, and simply did not
  // render when it was empty. table-clean is new prose the panel needs
  // because, unlike the old banner, it always renders something.
  if (wrongMix.length > 0) {
    return {
      tone: 'warn',
      headline: `${plural(wrongMix.length, 'high-load cell')} off best power`,
      state: 'table-off',
      detail: { count: wrongMix.length, cells: wrongMix.slice(0, 5), more: Math.max(0, wrongMix.length - 5) },
    };
  }
  return { tone: 'ok', headline: 'High-load mixture is on best power', state: 'table-clean', detail: {} };
}

/**
 * @param {{inSync: boolean, recs: object[], deltas?: object[], maxAbs: number}|null} veAdvice
 *   as returned by `veRecommendations`, or `null` — the shell has no VE comparison
 *   to offer for every build (see `AirflowScreen`'s existing `{veAdvice && (…)}` guard).
 *   `deltas` is optional in the type — a `cell`/`col` selection reads it with `?.`
 *   and falls through to the table-wide states if it (or the selected column) is
 *   genuinely missing; the real shell's value always has it.
 * @param {Selection|null} selection
 * @returns {AdvisorReport}
 */
export function veReport(veAdvice, selection) {
  if (!veAdvice) {
    return { tone: 'info', headline: 'No airflow comparison available for this build yet.', state: 'no-advice', detail: {} };
  }

  // `veRecommendations` measures every delta at the wide-open-throttle row only
  // (WOT_ROW, private to src/sim/advisors.js) — there is no per-cell VE gap to
  // report, only one gap per RPM column. `deltas` is indexed by that column
  // position directly (RPM.map's own index), the same index TuningGrid uses for
  // its columns, so a `cell` or `col` selection can look the column up by
  // `selection.col`. `deltas` is optional in the type (see the JSDoc above) —
  // `?.` here means a shell that genuinely omitted it, or a selection past the
  // end of the array, falls through to the table-wide states below rather than
  // throwing.
  if (selection && (selection.type === 'cell' || selection.type === 'col')) {
    const delta = veAdvice.deltas?.[selection.col];
    if (delta) {
      const pct = delta.pct;
      // THE ONE RULE applies here too: `VE_NOTABLE_PCT` is `veRecommendations`'s
      // own cutoff for whether a column's gap is worth reporting at all (it is
      // the same number that decides whether the table-wide state below is
      // 'table-sync' or 'table-stale'). Thresholding against a UI-invented
      // number here — the fixed bug this comment used to describe — could put
      // this branch and the table-wide one in a different mood about the same
      // column: table-wide says nothing is wrong, then selecting the column
      // that IS `inSync` prints a warning immediately below it.
      // Never 'danger': a VE mismatch by itself is not a hazard — it is the
      // fuel/spark tables computed from it that would need correcting, and
      // those are their own screens' job, not this one's.
      const isCell = selection.type === 'cell';
      if (Math.abs(pct) >= VE_NOTABLE_PCT) {
        // Math.abs, not a bare pct.toFixed(0): the plan's literal template
        // keeps the sign, which would print "-15% less air" for a negative
        // delta — a double negative that says the opposite of what it means.
        // fuelReport's cell-off headline already established the fix for the
        // same shape of bug (`Math.abs(cell.delta).toFixed(1)` paired with a
        // direction word); this mirrors it rather than reproducing the sign
        // twice. The RPM is named rather than "here": this headline is the
        // only thing rendered below 560px, and "here" reads as the selected
        // row when the number in fact belongs to the WOT row for this column.
        return {
          tone: 'warn',
          headline: `${Math.abs(pct).toFixed(0)}% ${pct > 0 ? 'more' : 'less'} air at ${delta.rpm} RPM than your table assumes`,
          state: isCell ? 'cell-gap' : 'col-gap',
          detail: { rpm: delta.rpm, from: delta.from, to: delta.to, pct },
        };
      }
      return {
        tone: 'ok',
        headline: `Matches your hardware at ${delta.rpm} RPM`,
        state: isCell ? 'cell-sync' : 'col-sync',
        detail: { rpm: delta.rpm, from: delta.from, to: delta.to, pct },
      };
    }
    // No delta for this column — fall through to the table-wide states below.
  }

  // A row selection has nothing column-scoped to say — `veRecommendations`
  // reports one gap per RPM column, never per row, so there is no per-row
  // answer to narrow to. It falls through to `group-ve`, not to the
  // table-wide states: the table-wide `table-stale` body carries the ACCEPT
  // RE-LOGGED VALUES button, which writes every row, and a player who
  // selected one row must not be shown a button that silently rewrites the
  // other five.
  if (selection && selection.type === 'row') {
    return {
      tone: 'info',
      headline: 'VE is measured per RPM column',
      state: 'group-ve',
      detail: {},
    };
  }

  if (veAdvice.inSync) {
    return { tone: 'ok', headline: 'VE matches your hardware', state: 'table-sync', detail: {} };
  }

  return {
    tone: 'warn',
    headline: `VE out of sync — ${veAdvice.maxAbs.toFixed(0)}% max gap`,
    state: 'table-stale',
    detail: { maxAbs: veAdvice.maxAbs, recs: veAdvice.recs },
  };
}
