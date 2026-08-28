// @vitest-environment jsdom

/**
 * The undo/redo pair on TUNE's table screens.
 *
 * The load-bearing test here is the last one: it drives the REAL app through a preset
 * load, a table edit and a click on the real button, and asserts the header goes back
 * to claiming the preset. That fails for any implementation which restores the 48
 * numbers but forgets `presetId` — the exact defect a table-only history would ship.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import EcuLab from '../../src/ui/EcuLab.jsx';
import { UndoControls } from '../../src/ui/components/UndoControls.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useTune } from '../../src/ui/state/StoreProvider.jsx';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;

afterEach(cleanup);

/** Dispatches one VE edit, so the undo stack is non-empty. */
function EditOnce() {
  const [, dispatch] = useTune();
  return (
    <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: [[42]] })}>
      EDIT
    </button>
  );
}

/** Dispatches one edit per table, so the stack holds three distinguishable entries. */
function EditThree() {
  const [, dispatch] = useTune();
  return (
    <>
      <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 've', value: [[1]] })}>
        EDIT VE
      </button>
      <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 'timing', value: [[2]] })}>
        EDIT SPARK
      </button>
      <button onClick={() => dispatch({ type: ACTIONS.SET_TABLE, table: 'afr', value: [[3]] })}>
        EDIT FUEL
      </button>
    </>
  );
}

function mount() {
  return render(
    <StoreProvider>
      <UndoControls />
      <EditOnce />
    </StoreProvider>,
  );
}

function mountThree() {
  return render(
    <StoreProvider>
      <UndoControls />
      <EditThree />
    </StoreProvider>,
  );
}

const undoBtn = () => screen.getByRole('button', { name: /^(Undo|Nothing to undo)/ });
const redoBtn = () => screen.getByRole('button', { name: /^(Redo|Nothing to redo)/ });

describe('UndoControls', () => {
  it('starts with both buttons disabled', () => {
    mount();
    expect(/** @type {HTMLButtonElement} */ (undoBtn()).disabled).toBe(true);
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(true);
  });

  it('names what it would undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(undoBtn().getAttribute('aria-label')).toBe('Undo VE edit');
  });

  it('enables redo only after an undo', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(true);
    fireEvent.click(undoBtn());
    expect(/** @type {HTMLButtonElement} */ (redoBtn()).disabled).toBe(false);
    expect(redoBtn().getAttribute('aria-label')).toBe('Redo VE edit');
  });

  it('names the MOST RECENT edit to undo, not the oldest', () => {
    // past is a stack: VE then Spark then Fuel means Fuel is on top, and undo
    // reverses the top of the stack first. If the label read the wrong end, this
    // would say "Undo VE edit" instead.
    mountThree();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT VE' }));
    fireEvent.click(screen.getByRole('button', { name: 'EDIT SPARK' }));
    fireEvent.click(screen.getByRole('button', { name: 'EDIT FUEL' }));
    expect(undoBtn().getAttribute('aria-label')).toBe('Undo Fuel edit');
  });

  it('names the NEXT redo after two undos, not the last one undone', () => {
    // Undoing Fuel then Spark leaves future = [Spark, Fuel] (head-first): Spark is
    // next in line to be replayed, so redo must name Spark, not Fuel.
    mountThree();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT VE' }));
    fireEvent.click(screen.getByRole('button', { name: 'EDIT SPARK' }));
    fireEvent.click(screen.getByRole('button', { name: 'EDIT FUEL' }));
    fireEvent.click(undoBtn()); // undoes Fuel edit -> future = [Fuel]
    fireEvent.click(undoBtn()); // undoes Spark edit -> future = [Spark, Fuel]
    expect(redoBtn().getAttribute('aria-label')).toBe('Redo Spark edit');
  });

  it('puts the preset label back when a table edit is undone', () => {
    // The whole point of a snapshot spanning both slices, driven through the real app.
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));

    const picker = /** @type {HTMLSelectElement[]} */ (screen.getAllByRole('combobox'))
      .find((el) => el.querySelector('optgroup'));
    const target = [...picker.querySelectorAll('option')]
      .map((o) => o.value)
      .find((v) => v && v !== picker.value);
    fireEvent.change(picker, { target: { value: target } });
    // Loading over an untouched default asks for no confirmation, so the preset is on.
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/^\d\.\dL /);

    fireEvent.click(screen.getByRole('button', { name: /TUNE/ }));
    const grid = within(screen.getByTestId('tuning-grid'));
    const cells = grid.getAllByRole('button')
      .filter((b) => /^-?\d+(\.\d+)?$/.test(b.textContent));
    fireEvent.click(cells[Math.floor(cells.length / 2)]);
    fireEvent.click(within(screen.getByTestId('selection-dock')).getByRole('button', { name: '+1' }));

    // The edit disowned the preset: the header falls back to the derived "3.0L I6".
    expect(screen.getByTestId('build-line').textContent).toMatch(/^\d\.\dL /);

    fireEvent.click(undoBtn());

    // ...and undo gives it back.
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/^\d\.\dL /);
  });
});
