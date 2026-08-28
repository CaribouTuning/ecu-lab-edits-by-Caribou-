/**
 * The undo/redo pair for TUNE's calibration tables.
 *
 * Chrome only: it reads the two stack lengths and dispatches. What is undoable, and
 * what a snapshot contains, belongs to the reducer — see `src/ui/state/history.js`.
 *
 * Each button takes its accessible name from the entry it would reverse ("Undo VE
 * edit"), so the control is not a bare glyph to a screen reader, and the disabled
 * state carries its own reason ("Nothing to undo") rather than going silent.
 *
 * `React.memo` matters here: LIVE_STEP dispatches at 20 Hz and the store is a single
 * context, so every consumer re-renders on every action regardless of the slice it
 * reads (see AppShell.jsx, "THE 20 Hz PROBLEM"). Memoising bails this out whenever the
 * stacks have not moved.
 */

import { Redo2, Undo2 } from 'lucide-react';
import React from 'react';

import { ACTIONS } from '../state/reducer.js';
import { useHistory } from '../state/StoreProvider.jsx';

import styles from './UndoControls.module.css';

/** @returns {React.ReactElement} */
export const UndoControls = React.memo(function UndoControls() {
  const [history, dispatch] = useHistory();
  const { past, future } = history;
  const undoLabel = past.length ? `Undo ${past[past.length - 1].label}` : 'Nothing to undo';
  const redoLabel = future.length ? `Redo ${future[0].label}` : 'Nothing to redo';
  return (
    <div className={styles.row}>
      <button
        type="button" className={styles.btn} disabled={past.length === 0}
        aria-label={undoLabel} title={undoLabel}
        onClick={() => dispatch({ type: ACTIONS.UNDO })}
      >
        <Undo2 size={14} />
      </button>
      <button
        type="button" className={styles.btn} disabled={future.length === 0}
        aria-label={redoLabel} title={redoLabel}
        onClick={() => dispatch({ type: ACTIONS.REDO })}
      >
        <Redo2 size={14} />
      </button>
    </div>
  );
});
