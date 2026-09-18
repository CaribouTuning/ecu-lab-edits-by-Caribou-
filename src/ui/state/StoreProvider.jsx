/**
 * The store's React binding.
 *
 * One `useReducer`, one context carrying `[state, dispatch]`, and four hooks —
 * `useBuild`, `useTune`, `useSession`, `useHistory` — that each select their own
 * slice. Consumers see the per-slice split the design doc specifies; internally it
 * stays one state tree, for the reasons in reducer.js's file header (cross-slice
 * actions like SET_TABLE, and APPLY_PRESET/RESET_TO_STOCK, must land in a single
 * pass).
 */

import React, { createContext, useContext, useReducer } from 'react';

import { makeInitialState } from './initialState.js';
import { reducer } from './reducer.js';

/** @typedef {import('./initialState.js').StoreState} StoreState */
/** @typedef {import('./initialState.js').BuildState} BuildState */
/** @typedef {import('./initialState.js').TuneState} TuneState */
/** @typedef {import('./initialState.js').SessionState} SessionState */
/** @typedef {import('./initialState.js').HistoryState} HistoryState */
/** @typedef {import('./reducer.js').StoreAction} StoreAction */

/** @typedef {[StoreState, React.Dispatch<StoreAction>]} StoreContextValue */

/** @type {React.Context<StoreContextValue|null>} */
const StoreContext = createContext(null);

/**
 * Wraps its children in the store. Mount once, at the app root.
 * @param {{children: React.ReactNode}} props
 * @returns {React.ReactElement}
 */
export function StoreProvider({ children }) {
  // The third argument makes this LAZY init: makeInitialState() runs once, on
  // mount, rather than being recomputed (and thrown away) on every render.
  const [state, dispatch] = useReducer(reducer, undefined, makeInitialState);
  /** @type {StoreContextValue} */
  const value = [state, dispatch];
  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

/**
 * Reads the whole store. Throws outside a StoreProvider rather than silently handing
 * back `undefined` — that failure needs to surface here, not as a crash three
 * components away when something destructures a slice off `undefined`.
 * @returns {StoreContextValue}
 */
function useStore() {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error(
      'useStore (and useBuild/useTune/useSession) must be called from inside <StoreProvider>.',
    );
  }
  return ctx;
}

/**
 * The BUILD slice: hardware and ECU configuration.
 * @returns {[BuildState, React.Dispatch<StoreAction>]}
 */
export function useBuild() {
  const [state, dispatch] = useStore();
  return [state.build, dispatch];
}

/**
 * The TUNE slice: calibration tables and the unsaved-work flag.
 * @returns {[TuneState, React.Dispatch<StoreAction>]}
 */
export function useTune() {
  const [state, dispatch] = useStore();
  return [state.tune, dispatch];
}

/**
 * The SESSION slice: run results, scores, wear, the live-engine model and onboarding
 * progress.
 * @returns {[SessionState, React.Dispatch<StoreAction>]}
 */
export function useSession() {
  const [state, dispatch] = useStore();
  return [state.session, dispatch];
}

/**
 * The HISTORY slice: the undo and redo stacks.
 * @returns {[HistoryState, React.Dispatch<StoreAction>]}
 */
export function useHistory() {
  const [state, dispatch] = useStore();
  return [state.history, dispatch];
}
