/**
 * The order a tuner works a pull log in, and which step each event belongs to.
 *
 * A calibration is fixed from the bottom up, because each layer reads the one beneath it:
 * the ECU has to know the parts (injector flow rate, MAP and MAF scaling, the fuel) before
 * the fuelling means anything; the fuelling has to be right before timing does, because
 * the knock limit and best-torque timing both move with the mixture; and boost comes last,
 * on a tune that is safe at the boost it already has. Nitrous is tuned on top of a finished
 * base tune. Hardware limits are trade-offs to choose, not cells to fix.
 *
 * A long log in the order the simulator happened to find things gave the player no place
 * to start; in this order the first entry is the first thing to fix.
 *
 * Pure: event types in, steps out. A type not listed here lands in the last step rather
 * than disappearing, and `tests/ui/fix-order.test.js` fails the day the simulator emits a
 * type this file does not name.
 */

/** @type {{id: string, label: string, types: string[]}[]} */
export const FIX_STEPS = [
  { id: 'setup', label: 'Setup', types: ['pastTable', 'injscale', 'mapsensor', 'maf', 'wideband', 'fueltype'] },
  { id: 'fuel', label: 'Fuel', types: ['rich', 'lean', 'valve', 'fuel', 'rail', 'dutyprot', 'leanprot', 'misfire'] },
  { id: 'spark', label: 'Spark', types: ['knock', 'unheardknock', 'falseknock', 'knockprot', 'iatprot', 'egtprot'] },
  { id: 'boost', label: 'Boost', types: ['underboost', 'overboost', 'boostctl', 'compressor', 'blower'] },
  { id: 'nitrous', label: 'Nitrous', types: ['nitrouslean', 'nitrousknock', 'bottle', 'nitrouswindow'] },
  { id: 'hardware', label: 'Hardware', types: ['pressure', 'bearing', 'float', 'cam', 'limiter', 'torquelimit', 'oilprot', 'failure'] },
];

/**
 * @param {string} type an event type
 * @returns {{index: number, id: string, label: string}} its step, 1-based `index`
 */
export function fixStep(type) {
  const i = FIX_STEPS.findIndex((s) => s.types.includes(type));
  const at = i < 0 ? FIX_STEPS.length - 1 : i;
  return { index: at + 1, id: FIX_STEPS[at].id, label: FIX_STEPS[at].label };
}

/**
 * A pull's events in working order: by step, and within a step by what they cost the
 * pull, biggest first. Stable, and a new array — the result itself is left as logged.
 *
 * @template E
 * @param {(E & {type: string, impact?: number})[]} events
 * @returns {(E & {type: string, impact?: number})[]}
 */
export function inFixOrder(events) {
  // A failed engine is read before anything else: nothing below it can be fixed until
  // it is rebuilt.
  return events
    .map((e, i) => ({ e, i, step: e.type === 'failure' ? 0 : fixStep(e.type).index }))
    .sort((a, b) => a.step - b.step || (b.e.impact ?? 0) - (a.e.impact ?? 0) || a.i - b.i)
    .map(({ e }) => e);
}

/**
 * What can cause what, among the pull log's own entries: for each kind of entry, the kinds
 * that, logged over the same RPM, explain it. A protection is caused by the condition it
 * protects against; knock by fuelling or timing written for less charge than it got; a
 * lean or rich mixture by the ECU being told the wrong thing about its parts.
 *
 * One cause shows up as several symptoms (hot, lean boost cells knock, knock control cuts
 * boost, lean protection steps in), and each symptom's own advice read on its own told the
 * player to fix something different. Grouped, the cause is read once with its fix, and the
 * symptoms under it are what that fix also clears.
 * @type {Record<string, string[]>}
 */
export const CAUSED_BY = {
  lean: ['pastTable', 'injscale', 'maf', 'mapsensor', 'fueltype', 'wideband', 'rail', 'fuel'],
  rich: ['pastTable', 'injscale', 'maf', 'mapsensor', 'fueltype', 'wideband'],
  fuel: ['injscale'],
  dutyprot: ['fuel', 'injscale'],
  leanprot: ['lean', 'pastTable', 'injscale', 'maf', 'mapsensor', 'rail', 'fuel', 'dutyprot'],
  valve: ['lean', 'pastTable'],
  misfire: ['lean', 'rich'],
  knock: ['pastTable', 'lean', 'injscale', 'maf', 'mapsensor', 'fueltype'],
  unheardknock: ['pastTable', 'lean', 'knock'],
  knockprot: ['knock', 'unheardknock', 'pastTable', 'lean'],
  egtprot: ['lean', 'knock', 'pastTable'],
  overboost: ['boostctl'],
  nitrousknock: ['nitrouslean'],
};

/** Two entries describe the same part of the pull: their RPM spans overlap, or either covers the whole pull. */
const overlaps = (a, b) => a.rpmStart == null || b.rpmStart == null
  || (a.rpmStart <= (b.rpmEnd ?? b.rpmStart) && b.rpmStart <= (a.rpmEnd ?? a.rpmStart));

/**
 * A pull's entries grouped by cause, in working order: each group is a root entry and the
 * entries it explains. An entry goes under the first cause, in fix order, that is logged
 * over the same RPM, and follows that cause up to its root, so a chain (lean boost cells,
 * the knock they cause, the boost cut that knock causes) is one group. Every entry appears
 * once.
 *
 * @template E
 * @param {(E & {type: string, impact?: number, rpmStart?: number, rpmEnd?: number})[]} events
 * @returns {{root: E & {type: string}, effects: (E & {type: string})[]}[]}
 */
export function groupByCause(events) {
  const ordered = inFixOrder(events);
  /** @type {Map<object, object>} each entry's direct cause */
  const parent = new Map();
  ordered.forEach((e) => {
    const kinds = CAUSED_BY[e.type];
    if (!kinds) return;
    const cause = ordered.find((c) => c !== e && kinds.includes(c.type) && overlaps(c, e));
    if (cause) parent.set(e, cause);
  });
  /** @param {object} e */
  const rootOf = (e) => {
    const seen = new Set();
    let r = e;
    while (parent.has(r) && !seen.has(r)) { seen.add(r); r = parent.get(r); }
    return r;
  };
  /** @type {Map<object, {root: any, effects: any[]}>} */
  const groups = new Map();
  ordered.forEach((e) => {
    const r = rootOf(e);
    if (!groups.has(r)) groups.set(r, { root: r, effects: [] });
    if (r !== e) groups.get(r).effects.push(e);
  });
  // In working order of the roots themselves: a group sits where its cause is fixed.
  return [...groups.values()].sort((a, b) => ordered.indexOf(a.root) - ordered.indexOf(b.root));
}
