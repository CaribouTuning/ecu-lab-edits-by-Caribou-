/**
 * The root reducer: one reducer over three slices, not three independent ones.
 *
 * `EcuLab.jsx`'s `applyEnginePreset` makes 21 sequential `setState` calls spanning
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
 * This file implements the SINGLE-slice actions (Task 2 of the state-extraction plan)
 * AND the cross-cutting actions that replace `applyEnginePreset`, `resetToStock`,
 * `repairEngine` and the score-tallying tail of `doRun` — APPLY_PRESET, RESET_TO_STOCK,
 * REPAIR_ENGINE, BANK_PULL (Task 3).
 */

import { clamp, clone2D, DEFAULT_AFR, DEFAULT_MODS, DEFAULT_TIMING } from '../../sim/index.js';

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
  CLEAR_PRESET_ID: 'CLEAR_PRESET_ID',
  SET_TURBINE: 'SET_TURBINE',
  SET_TABLE: 'SET_TABLE',
  SET_SESSION_FIELD: 'SET_SESSION_FIELD',
  SET_TUNE_FIELD: 'SET_TUNE_FIELD',
  SET_BOOST_SEL: 'SET_BOOST_SEL',
  SET_PRESET_PROMPT: 'SET_PRESET_PROMPT',
  SET_ENGINE_CONFIG_PATCH: 'SET_ENGINE_CONFIG_PATCH',
  APPLY_PRESET: 'APPLY_PRESET',
  RESET_TO_STOCK: 'RESET_TO_STOCK',
  REPAIR_ENGINE: 'REPAIR_ENGINE',
  BANK_PULL: 'BANK_PULL',
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
 * Clears `presetId` alone, with NO other side effect — deliberately narrower than
 * `SET_BUILD_FIELD`, which always pairs a field write with the same invalidation.
 * Its one caller is the preset picker's "Custom build" option: choosing it disowns
 * whatever preset is loaded without touching any other build field, so a generic
 * `{type: SET_BUILD_FIELD, field: 'presetId', value: null}` would only have worked
 * by coincidence — the reducer's own trailing `presetId: null` happens to overwrite
 * whatever `action.value` said, so a future caller passing a non-null value would
 * silently get `null` back with no error anywhere. This action can never carry a
 * value that lies about what it does.
 * @typedef {{type: 'CLEAR_PRESET_ID'}} ClearPresetIdAction
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
 * Moves the boost-curve editor's selected RPM column. A cursor, not hardware — the
 * build-side analogue of `tune.selection` — so unlike `SET_BUILD_FIELD` it must NOT
 * clear `presetId`. See the Task 3 amendment: a generic non-invalidating build setter
 * would be an escape hatch a future caller could reach for on an actual hardware
 * field, silently reintroducing the stale-preset bug `withPresetField` exists to
 * prevent, so this is deliberately its own narrow action rather than a general one.
 * @typedef {{type: 'SET_BOOST_SEL', value: number}} SetBoostSelAction
 */

/**
 * Opens or dismisses the overwrite-confirmation prompt. Also a cursor/UI-state field,
 * not hardware, so — like `SET_BOOST_SEL` — it must NOT clear `presetId`.
 * @typedef {{type: 'SET_PRESET_PROMPT', value: object|null}} SetPresetPromptAction
 */

/**
 * The reducer's equivalent of `setCfg` (`EcuLab.jsx:738`,
 * `setEngineConfigInvalidating((c) => ({ ...c, ...patch }))`). Actions cannot carry
 * functions, so the merge happens here: the reducer already holds the current
 * `engineConfig` and does the spread itself. Invalidates like every other hardware
 * write.
 *
 * @typedef {{type: 'SET_ENGINE_CONFIG_PATCH', patch: Partial<import('../../sim/index.js').EngineConfig>}} SetEngineConfigPatchAction
 */

/**
 * Loads a factory preset's complete patch — build, tune AND session — in one pass.
 * `action.preset` is the ALREADY-COMPUTED patch object `applyPreset(rawPreset)`
 * returns (`src/sim/presets.js`), not the raw catalogue entry: computing it needs no
 * hardware the reducer doesn't already have in scope, unlike `RESET_TO_STOCK`'s `ve`,
 * but it is still the caller's job to produce it, the same way `SET_TABLE`'s caller
 * produces the table it hands over. `EcuLab.jsx`'s `applyEnginePreset` made 21
 * sequential raw `setState` calls across all three slices to land this and its own
 * comment warns that routing them through the invalidating setters "would make that
 * order-dependent" — deliberately bypassing `withPresetField`/`withTableEdit` because
 * IT needs `presetId` to end up SET, the opposite of every other write. One reducer
 * case removes the ordering hazard instead of documenting it: every field lands in the
 * same object-literal pass, so there is no "last call" to get right.
 * @typedef {{type: 'APPLY_PRESET', preset: {
 *   presetId: string, engineConfig: import('../../sim/index.js').EngineConfig,
 *   mods: BuildState['mods'], turboOn: boolean, boostCurve: number[],
 *   turbineIdx: number, turbineCount: number, compressorIdx: number, injIdx: number,
 *   ecuInjectorCc: number, octaneIdx: number, exhaustDiaIdx: number,
 *   ve: number[][], timing: number[][], afr: number[][],
 * }}} ApplyPresetAction
 */

/**
 * Wipes the calibration back to a generic stock baseline and drops any preset label,
 * mirroring `resetToStock` (`EcuLab.jsx:726`). `action.ve` is the recomputed stock VE
 * table: producing it needs `computeHardwareVE` fed the CURRENT hardware
 * (`engineConfig`, `turboOn`, `exhaustDiaIdx`, `boostCurve`, fuel, turbine) mixed with
 * a hypothetical DEFAULT_MODS, which is exactly the kind of hardware-shaped lookup the
 * reducer should not be reaching for itself — so the caller computes it, the same
 * reasoning as `SET_TABLE`. `timing`/`afr`/`mods`/`mafScalar` reset to fixed constants
 * that need no such lookup, so the reducer sets those itself. The original made six
 * `setState` calls and documented that "the last call pins tablesDirty back to false"
 * — three of the five earlier calls set it true via `withTableEdit`/`withPresetField`,
 * so the LAST write had to win. One action has no "last write" to get right: it is
 * simply false in the object literal below.
 * @typedef {{type: 'RESET_TO_STOCK', ve: number[][]}} ResetToStockAction
 */

/**
 * Restores every worn engine component to full health, mirroring `repairEngine`
 * (`EcuLab.jsx:737`).
 * @typedef {{type: 'REPAIR_ENGINE'}} RepairEngineAction
 */

/**
 * Finalises a completed dyno pull: banks the score, wears the engine, and rotates
 * `result` into `prevResult`. Mirrors the tail of `doRun` (`EcuLab.jsx:868-896`) —
 * NOT the whole function, which also flips `running`/`revealCount` for the reveal
 * animation before and after an interval-driven timer runs; that is time-based UI
 * state with no atomicity hazard and stays as plain `SET_SESSION_FIELD` dispatches in
 * the component (Task 4). The part that DOES have an ordering hazard, and is what this
 * action removes: `doRun` calls `setPrevResult(result)` (the OLD result) before
 * `setResult(r)` (the new one) — reversing those two lines would silently make
 * `prevResult` equal the new result instead of the old one. `action.result` and
 * `action.pullScore` are precomputed by the caller: `result` comes from
 * `simulateSweep`, and `pullScore` from `computePullScore`, which needs derived
 * hardware objects (`turbine`, `compressor`, `dutyPreview`, `exhaustDiaError`) that
 * are `useMemo` values in the component, not raw state the reducer holds — the same
 * "caller computes, reducer applies" split as `RESET_TO_STOCK`'s `ve`.
 * @typedef {{type: 'BANK_PULL', result: object, pullScore: number}} BankPullAction
 */

/**
 * The union of every action shape the reducer actually understands. Deliberately has
 * NO catch-all `{type: string, [key: string]: *}` member: with one, every object
 * shape is assignable to `StoreAction` and the eleven specific typedefs above become
 * decorative — a typo'd payload key (`presset` instead of `preset`) would typecheck
 * clean. Without the catch-all, `tsc` must reject it.
 * @typedef {SetBuildFieldAction | ClearPresetIdAction | SetTurbineAction | SetTableAction |
 *   SetSessionFieldAction | SetTuneFieldAction | SetBoostSelAction |
 *   SetPresetPromptAction | SetEngineConfigPatchAction | ApplyPresetAction |
 *   ResetToStockAction | RepairEngineAction | BankPullAction
 * } KnownStoreAction
 */

/**
 * Kept as the public name `StoreAction` (re-exported via `StoreProvider.jsx`'s
 * `@typedef {import('./reducer.js').StoreAction}`) so callers outside this file are
 * unaffected — it is simply an alias for {@link KnownStoreAction}, not a looser type.
 * @typedef {KnownStoreAction} StoreAction
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

    case ACTIONS.CLEAR_PRESET_ID:
      return {
        ...state,
        build: { ...state.build, presetId: null },
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

    case ACTIONS.SET_BOOST_SEL:
      return {
        ...state,
        build: { ...state.build, boostSel: action.value },
      };

    case ACTIONS.SET_PRESET_PROMPT:
      return {
        ...state,
        build: { ...state.build, presetPrompt: action.value },
      };

    case ACTIONS.SET_ENGINE_CONFIG_PATCH:
      return {
        ...state,
        build: {
          ...state.build,
          engineConfig: { ...state.build.engineConfig, ...action.patch },
          presetId: null,
        },
      };

    case ACTIONS.APPLY_PRESET: {
      const p = action.preset;
      return {
        ...state,
        build: {
          ...state.build,
          engineConfig: p.engineConfig,
          mods: p.mods,
          turboOn: p.turboOn,
          boostCurve: p.boostCurve,
          turbineIdx: p.turbineIdx,
          turbineCount: p.turbineCount,
          compressorIdx: p.compressorIdx,
          injIdx: p.injIdx,
          ecuInjectorCc: p.ecuInjectorCc,
          octaneIdx: p.octaneIdx,
          exhaustDiaIdx: p.exhaustDiaIdx,
          // A preset's AFR table already bakes in a correction for the MAF error its
          // mod set implies (factoryCalibration, src/sim/presets.js) — valid only at
          // the neutral scalar, so loading a preset must pin this back to 1.0.
          mafScalar: 1.0,
          presetId: p.presetId,
          presetPrompt: null,
        },
        tune: {
          ...state.tune,
          ve: p.ve,
          timing: p.timing,
          afr: p.afr,
          // Fresh factory calibration is not unsaved player work.
          tablesDirty: false,
          selection: null,
        },
        session: {
          ...state.session,
          // A factory rating from the newly loaded engine must never sit next to a
          // pull logged on whatever was running before it.
          result: null,
          prevResult: null,
        },
      };
    }

    case ACTIONS.RESET_TO_STOCK:
      return {
        ...state,
        build: {
          ...state.build,
          mods: DEFAULT_MODS,
          mafScalar: 1.0,
          presetId: null,
        },
        tune: {
          ...state.tune,
          ve: action.ve,
          timing: clone2D(DEFAULT_TIMING),
          afr: clone2D(DEFAULT_AFR),
          // A reset baseline is not unsaved player work — no "last call" needed to
          // pin this false, it is simply false in this same pass.
          tablesDirty: false,
        },
      };

    case ACTIONS.REPAIR_ENGINE:
      return {
        ...state,
        session: {
          ...state.session,
          health: { piston: 100, bearing: 100, valve: 100 },
        },
      };

    case ACTIONS.BANK_PULL:
      return {
        ...state,
        session: {
          ...state.session,
          // The OLD result becomes prevResult BEFORE the new one overwrites `result` —
          // reversing this order would silently make prevResult equal the new result.
          prevResult: state.session.result,
          result: action.result,
          health: {
            piston: clamp(state.session.health.piston - action.result.wear.piston, 0, 100),
            bearing: clamp(state.session.health.bearing - action.result.wear.bearing, 0, 100),
            valve: clamp(state.session.health.valve - action.result.wear.valve, 0, 100),
          },
          bestScore: Math.max(state.session.bestScore, action.pullScore),
          totalScore: state.session.totalScore + action.pullScore,
          pullCount: state.session.pullCount + 1,
        },
      };

    default:
      // Unknown action: return the SAME object by reference so React's useReducer
      // bails out of the re-render instead of scheduling one for a no-op.
      return state;
  }
}
