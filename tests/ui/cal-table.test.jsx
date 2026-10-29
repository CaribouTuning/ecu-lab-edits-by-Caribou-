// @vitest-environment jsdom

/**
 * The table editor's axis breakpoints: a breakpoint the ECU could not search is
 * refused, and the box always shows the breakpoint the table actually has.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CalTable } from '../../src/ui/components/ecu/CalTable.jsx';

afterEach(cleanup);
// jsdom has no PointerEvent, so `pointerType` and `buttons` never reach React without one
// (as in range-selection.test.jsx).
class PointerEventStub extends window.MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType ?? ''; }
}
const hadPointerEvent = 'PointerEvent' in window;
if (!hadPointerEvent) /** @type {any} */ (window).PointerEvent = PointerEventStub;
afterAll(() => { if (!hadPointerEvent) delete /** @type {any} */ (window).PointerEvent; });

/** @type {import('../../src/sim/ecu/calibration.js').EcuFieldMeta} */
const META = {
  path: 'test.curve', section: 'test', group: 'Test', label: 'Test curve', kind: 'curve', unit: '%',
  xLabel: 'RPM', min: 0, max: 100, help: 'A curve for the test.',
};

/** A CalTable over its own state, with an external "undo" that puts the first table back. */
function Harness() {
  /** @type {import('../../src/ui/components/ecu/tableOps.js').Table} */
  const first = { x: [1000, 2000, 3000], z: [10, 20, 30] };
  const [table, setTable] = React.useState(first);
  return (
    <>
      <button type="button" onClick={() => setTable(first)}>undo</button>
      <CalTable table={table} meta={META} onChange={setTable} />
    </>
  );
}

const box = (i) => /** @type {HTMLInputElement} */ (screen.getByLabelText(`RPM breakpoint ${i}`));

describe('axis breakpoints', () => {
  it('refuses one out of order, or blank, and shows the breakpoint the table kept', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Axes' }));
    fireEvent.change(box(2), { target: { value: '3500' } });
    fireEvent.blur(box(2));
    expect(box(2).value).toBe('2000');
    fireEvent.change(box(2), { target: { value: '' } });
    fireEvent.blur(box(2));
    expect(box(2).value).toBe('2000');
  });

  it('redraws a moved breakpoint when the table is put back from outside', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Axes' }));
    fireEvent.change(box(2), { target: { value: '2500' } });
    fireEvent.blur(box(2));
    expect(box(2).value).toBe('2500');
    fireEvent.click(screen.getByText('undo'));
    expect(box(2).value).toBe('2000');
  });
});

/** @type {import('../../src/sim/ecu/calibration.js').EcuFieldMeta} */
const MAP_META = {
  path: 'vvt.intakeTarget', section: 'vvt', group: 'Targets', label: 'Intake cam advance', kind: 'map', unit: '°',
  xLabel: 'RPM', yLabel: 'MAP kPa', min: 0, max: 50, step: 1, help: 'A cam map for the test.',
};

/** A cam map over its own state, the way EcuSection holds one. */
function MapHarness() {
  const [table, setTable] = React.useState(/** @type {import('../../src/ui/components/ecu/tableOps.js').Table} */ ({
    x: [1000, 2000, 3000, 4000], y: [40, 70, 100],
    z: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
  }));
  return (
    <>
      <output data-testid="z">{JSON.stringify(table.z)}</output>
      <CalTable table={table} meta={MAP_META} onChange={setTable} />
    </>
  );
}

const cell = (rpm, kpa) => screen.getByRole('button', { name: new RegExp(`^Intake cam advance at RPM ${rpm}, MAP kPa ${kpa}:`) });
const z = () => JSON.parse(screen.getByTestId('z').textContent ?? '[]');

describe('range selection on a cam map', () => {
  it('SELECT RANGE takes a rectangle in two taps, and the tools act on all of it', () => {
    render(<MapHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select range' }));
    expect(screen.getByText('Tap the first corner of the range.')).toBeTruthy();
    fireEvent.click(cell(1000, 40));
    expect(screen.getByText('Now tap the opposite corner of the range.')).toBeTruthy();
    fireEvent.click(cell(2000, 70));
    expect(screen.getByText(/2 × 2, 4 cells/)).toBeTruthy();
    const addBox = screen.getByLabelText('Add to selected cells');
    fireEvent.change(addBox, { target: { value: '3' } });
    fireEvent.keyDown(addBox, { key: 'Enter' });
    expect(z()).toEqual([[4, 5, 3, 4], [8, 9, 7, 8], [9, 10, 11, 12]]);
  });

  it('copies a range and pastes it into another, arrangement kept', () => {
    render(<MapHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Select range' }));
    fireEvent.click(cell(1000, 40));
    fireEvent.click(cell(2000, 70));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByText('Copied 2 × 2')).toBeTruthy();
    // One cell: the whole block goes down from there.
    fireEvent.click(cell(3000, 40));
    fireEvent.click(cell(3000, 40));
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    return screen.findByText('Pasted 2 × 2').then(() => {
      expect(z()).toEqual([[1, 2, 1, 2], [5, 6, 5, 6], [9, 10, 11, 12]]);
    });
  });

  it('a mouse drags a range without the mode', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cell(3000, 70), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(cell(4000, 100), { pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerUp(window);
    expect(screen.getByText(/2 × 2, 4 cells/)).toBeTruthy();
  });
});
