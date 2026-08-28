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
import { afterAll, afterEach, describe, expect, it } from 'vitest';

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
afterAll(() => {
  if (!hadResizeObserver) delete window.ResizeObserver;
});

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

/** Renders the VE table's top-left cell, so a redo that actually replays SET_TABLE
 *  is directly observable, not just its label/disabled bookkeeping. */
function ReadVeCell() {
  const [tune] = useTune();
  return <div data-testid="ve-cell">{tune.ve[0][0]}</div>;
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
    const undo = /** @type {HTMLButtonElement} */ (undoBtn());
    const redo = /** @type {HTMLButtonElement} */ (redoBtn());
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    // The exact disabled-state strings, not just the prefix the query above
    // matches on.
    expect(undo.getAttribute('aria-label')).toBe('Nothing to undo');
    expect(redo.getAttribute('aria-label')).toBe('Nothing to redo');
    // The hover tooltip carries the same text as the accessible name. Derived on
    // purpose here — the literals are asserted two lines up, so this pins the
    // RELATIONSHIP. The populated case is pinned separately, below: in the empty
    // state a title frozen to the hardcoded fallback would satisfy this too.
    expect(undo.getAttribute('title')).toBe(undo.getAttribute('aria-label'));
    expect(redo.getAttribute('title')).toBe(redo.getAttribute('aria-label'));
  });

  it('renders undo before redo in DOM order', () => {
    const { container } = mount();
    const buttons = container.querySelectorAll('button');
    expect(buttons[0]).toBe(undoBtn());
    expect(buttons[1]).toBe(redoBtn());
  });

  it('keeps the tooltip tracking the entry once there is one to name', () => {
    // The empty-state test above pins title === aria-label, but BOTH are the
    // hardcoded fallback there, so a title that never tracks the entry passes it.
    // Literal, and taken after an edit, so the tooltip has to follow the label.
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(undoBtn().getAttribute('title')).toBe('Undo VE edit');
    fireEvent.click(undoBtn());
    expect(redoBtn().getAttribute('title')).toBe('Redo VE edit');
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

  it('redo actually replays the edit it names, not a no-op', () => {
    // The mirror of undo's own click-handler coverage: undoing then redoing the
    // same edit must bring the exact edited value back, not merely flip the
    // disabled flag redo's label already proves it tracks.
    render(
      <StoreProvider>
        <UndoControls />
        <EditOnce />
        <ReadVeCell />
      </StoreProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'EDIT' }));
    expect(screen.getByTestId('ve-cell').textContent).toBe('42');
    fireEvent.click(undoBtn());
    expect(screen.getByTestId('ve-cell').textContent).not.toBe('42');
    fireEvent.click(redoBtn());
    expect(screen.getByTestId('ve-cell').textContent).toBe('42');
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

    // The edit disowned the preset: the header falls back to the derived "3.5L V6".
    expect(screen.getByTestId('build-line').textContent).toMatch(/^\d\.\dL /);

    fireEvent.click(undoBtn());

    // ...and undo gives it back. The negative regex alone would pass for ANY
    // preset restored, including the wrong one — this names the specific preset
    // the picker loaded (the first option in the first optgroup, the Nissan
    // group, over an untouched default store) so a restore that hands back a
    // different preset fails here instead of slipping through.
    expect(screen.getByTestId('build-line').textContent).not.toMatch(/^\d\.\dL /);
    expect(screen.getByTestId('build-line').textContent).toMatch(/^Nissan VQ35DE Rev-Up /);
  });
});
