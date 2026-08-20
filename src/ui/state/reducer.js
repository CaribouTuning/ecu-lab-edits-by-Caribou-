/**
 * The root reducer: one reducer over three slices, not three independent ones.
 *
 * `EcuLab.jsx`'s `applyEnginePreset` makes 23 sequential `setState` calls spanning
 * hardware, calibration tables and run results — and its own comment warns that
 * routing those writes through the invalidating setters "would make that order-
 * dependent on React's batching instead of explicit". `resetToStock` makes six writes
 * and documents that "the last call pins tablesDirty back to false". `withTableEdit`
 * writes a TUNE table, then clears `presetId` (BUILD), then sets `tablesDirty` (TUNE)
 * — one hand edit, two slices, and both must land together or the header lies about
 * which preset (if any) is loaded.
 *
 * Three independent contexts cannot express any of that atomically — each cross-slice
 * write would become choreography between providers, preserving the exact ordering
 * hazards these comments warn about. One reducer computes the next state in a single
 * pass instead: a case either changes a slice or it doesn't, there is no partial
 * application to observe mid-write, and "order-dependent" stops being a possible bug.
 *
 * This file implements the SINGLE-slice actions only (Task 2 of the state-extraction
 * plan). The cross-cutting actions that replace `applyEnginePreset` and
 * `resetToStock` themselves — APPLY_PRESET, RESET_TO_STOCK, REPAIR_ENGINE, BANK_PULL —
 * are added on top of this file in the next task.
 */

/** @typedef {import('./initialState.js').StoreState} StoreState */
/** @typedef {import('./initialState.js').BuildState} BuildState */
/** @typedef {import('./initialState.js').TuneState} TuneState */
/** @typedef {import('./initialState.js').SessionState} SessionState */

/**
 * Every action type the reducer understands. Frozen so a typo in a dispatch call
 * (`ACTIONS.SET_BULID_FIELD`) fails loudly as `undefined` rather than silently adding
 * a new property.
 */
export const ACTIONS = Object.freeze({
  SET_BUILD_FIELD: 'SET_BUILD_FIELD',
  SET_TURBINE: 'SET_TURBINE',
  SET_TABLE: 'SET_TABLE',
  SET_SESSION_FIELD: 'SET_SESSION_FIELD',
  SET_TUNE_FIELD: 'SET_TUNE_FIELD',
});

/**
 * Sets one field on the BUILD slice and clears `presetId` — a hand edit to any single
 * hardware/ECU field is no longer that preset's build. This is the reducer's
 * equivalent of `withPresetField`. It does NOT touch `tune.tablesDirty`: hardware
 * edits alone don't touch the calibration tables (see SET_TABLE for the write that
 * does).
 * @typedef {{type: 'SET_BUILD_FIELD', field: keyof BuildState, value: *}} SetBuildFieldAction
 */

/**
 * Fits ONE of the chosen turbine housing. A twin-turbo `turbineCount` belongs to a
 * preset, not a hand pick from the turbine list, so this always resets it to 1
 * alongside the new housing — and, like any hardware edit, clears `presetId`.
 * @typedef {{type: 'SET_TURBINE', value: number}} SetTurbineAction
 */

/**
 * Writes a calibration table (`ve`, `timing` or `afr`) and, in the SAME pass, clears
 * `presetId` (BUILD) and sets `tablesDirty` (TUNE). This is the reducer's equivalent
 * of `withTableEdit` — the one write that must cross the build/tune boundary
 * atomically, which is the whole reason this is one reducer and not two.
 * @typedef {{type: 'SET_TABLE', table: 've'|'timing'|'afr', value: number[][]}} SetTableAction
 */

/**
 * Sets one field on the SESSION slice. No cross-slice effects — session is run/career
 * bookkeeping, not hardware or calibration.
 * @typedef {{type: 'SET_SESSION_FIELD', field: keyof SessionState, value: *}} SetSessionFieldAction
 */

/**
 * Sets one field on the TUNE slice WITHOUT the SET_TABLE side effects. This is for
 * tune-slice writes that are not a calibration edit — `selection`, for instance, which
 * changes what grid cell is highlighted and must not clear the preset label or flag
 * unsaved work.
 * @typedef {{type: 'SET_TUNE_FIELD', field: keyof TuneState, value: *}} SetTuneFieldAction
 */

/**
 * @typedef {SetBuildFieldAction | SetTurbineAction | SetTableAction |
 *   SetSessionFieldAction | SetTuneFieldAction | {type: string, [key: string]: *}
 * } StoreAction
 */

/**
 * The root reducer. Pure: no `Date.now()`, no `Math.random()`, no mutation of `state`
 * or any of its slices — every case that changes a slice returns a NEW object for
 * that slice only, and every slice it does not touch keeps its existing reference
 * (so `React.memo`/`useMemo` consumers downstream can bail out on an unrelated
 * dispatch).
 *
 * @param {StoreState} state
 * @param {StoreAction} action
 * @returns {StoreState}
 */
export function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_BUILD_FIELD:
      return {
        ...state,
        build: { ...state.build, [action.field]: action.value, presetId: null },
      };

    case ACTIONS.SET_TURBINE:
      return {
        ...state,
        build: {
          ...state.build,
          turbineIdx: action.value,
          turbineCount: 1,
          presetId: null,
        },
      };

    case ACTIONS.SET_TABLE:
      return {
        ...state,
        build: { ...state.build, presetId: null },
        tune: { ...state.tune, [action.table]: action.value, tablesDirty: true },
      };

    case ACTIONS.SET_SESSION_FIELD:
      return {
        ...state,
        session: { ...state.session, [action.field]: action.value },
      };

    case ACTIONS.SET_TUNE_FIELD:
      return {
        ...state,
        tune: { ...state.tune, [action.field]: action.value },
      };

    default:
      // Unknown action: return the SAME object by reference so React's useReducer
      // bails out of the re-render instead of scheduling one for a no-op.
      return state;
  }
}
