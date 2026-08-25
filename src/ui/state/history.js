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
