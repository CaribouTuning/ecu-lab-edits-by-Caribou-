// @vitest-environment jsdom

/**
 * The table editor: axis breakpoints, and selecting cells by mouse, touch and keyboard.
 * A breakpoint the ECU could not search is refused, and the box always shows the
 * breakpoint the table actually has. A finger selects on click, so a swipe scrolls.
 */

import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { CalTable } from '../../src/ui/components/ecu/CalTable.jsx';

// jsdom 25 has no PointerEvent, and without one `pointerType`, `shiftKey` and `buttons`
// never reach React. MouseEvent carries the last two; this adds the first.
class PointerEventStub extends window.MouseEvent {
  constructor(type, init = {}) { super(type, init); this.pointerType = init.pointerType ?? ''; }
}
const hadPointerEvent = 'PointerEvent' in window;
if (!hadPointerEvent) /** @type {any} */ (window).PointerEvent = PointerEventStub;
afterAll(() => {
  if (!hadPointerEvent) delete /** @type {any} */ (window).PointerEvent;
});
afterEach(cleanup);

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
  path: 'test.map', section: 'test', group: 'Test', label: 'Test map', kind: 'map', unit: '°',
  xLabel: 'RPM', yLabel: 'kPa', min: 0, max: 100, help: 'A map for the test.',
};

/** The last table the editor committed.
 * @type {import('../../src/ui/components/ecu/tableOps.js').Table|undefined} */
let latest;

/** A 3 × 3 map over its own state. Rows are on kPa: row 0 is 50 kPa. */
function MapHarness() {
  const [table, setTable] = React.useState(/** @type {import('../../src/ui/components/ecu/tableOps.js').Table} */ ({
    x: [1000, 2000, 3000], y: [50, 100, 150], z: [[10, 20, 30], [40, 50, 60], [70, 80, 90]],
  }));
  return <CalTable table={table} meta={MAP_META} onChange={(t) => { latest = t; setTable(t); }} />;
}

const cellAt = (rpm, kpa) => screen.getByRole('button', { name: new RegExp(`^Test map at RPM ${rpm}, kPa ${kpa}:`) });
/** The selected cells as sorted `rpm/kPa` strings. */
const selected = () => screen.getAllByRole('button', { name: /^Test map at / })
  .filter((b) => b.hasAttribute('data-selected'))
  .map((b) => /RPM (\d+), kPa (\d+)/.exec(b.getAttribute('aria-label') ?? '').slice(1).join('/'))
  .sort();
const mouse = { pointerType: 'mouse', button: 0, buttons: 1 };

describe('selecting cells', () => {
  it('a mouse drag selects the rectangle it covers, and its click does not collapse it', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    fireEvent.pointerEnter(cellAt(2000, 100), mouse);
    fireEvent.pointerUp(window, mouse);
    fireEvent.click(cellAt(2000, 100), { detail: 1 });
    expect(selected()).toEqual(['1000/100', '1000/50', '2000/100', '2000/50']);
  });

  it('a hover with no button held does not extend, even if the release was missed', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    // no pointerup: the button came up outside the window
    fireEvent.pointerEnter(cellAt(2000, 100), { pointerType: 'mouse', buttons: 0 });
    expect(selected()).toEqual(['1000/50']);
  });

  it('a cancelled pointer ends the drag', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    fireEvent.pointerCancel(window, mouse);
    fireEvent.pointerEnter(cellAt(2000, 100), mouse);
    expect(selected()).toEqual(['1000/50']);
  });

  it('shift-click extends from the anchor', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    fireEvent.pointerUp(window, mouse);
    fireEvent.pointerDown(cellAt(3000, 100), { ...mouse, shiftKey: true });
    fireEvent.pointerUp(window, mouse);
    expect(selected()).toEqual(['1000/100', '1000/50', '2000/100', '2000/50', '3000/100', '3000/50']);
  });

  it('a touch press does not start a drag; the tap selects on click', () => {
    render(<MapHarness />);
    fireEvent.pointerDown(cellAt(1000, 50), { pointerType: 'touch', buttons: 1 });
    fireEvent.pointerEnter(cellAt(2000, 100), { pointerType: 'touch', buttons: 1 });
    expect(selected()).toEqual([]);
    fireEvent.click(cellAt(1000, 50), { detail: 1 });
    expect(selected()).toEqual(['1000/50']);
  });

  it('a keyboard click selects the cell', () => {
    render(<MapHarness />);
    fireEvent.click(cellAt(2000, 150), { detail: 0 });
    expect(selected()).toEqual(['2000/150']);
  });
});

describe('touch scrolling', () => {
  it('cells do not block panning', () => {
    const css = readFileSync(new NodeURL('../../src/ui/components/ecu/CalTable.module.css', import.meta.url), 'utf8');
    const cellRule = /(^|\n)\.cell\s*\{[^}]*\}/.exec(css)?.[0];
    expect(cellRule).toBeTruthy();
    expect(cellRule).not.toMatch(/touch-action\s*:\s*none/);
  });
});

describe('the Range chip', () => {
  const range = () => screen.getByRole('button', { name: 'Range' });
  const hint = () => screen.queryByText('1 cell · tap the opposite corner');

  it('takes two taps as two corners, the toolbar edits that block, and a third tap starts over', () => {
    render(<MapHarness />);
    fireEvent.click(range());
    expect(range().getAttribute('aria-pressed')).toBe('true');

    fireEvent.pointerDown(cellAt(1000, 50), { pointerType: 'touch', buttons: 1 });
    fireEvent.click(cellAt(1000, 50), { detail: 1 });
    expect(selected()).toEqual(['1000/50']);
    expect(hint()).toBeTruthy();

    fireEvent.pointerDown(cellAt(2000, 100), { pointerType: 'touch', buttons: 1 });
    fireEvent.click(cellAt(2000, 100), { detail: 1 });
    expect(selected()).toEqual(['1000/100', '1000/50', '2000/100', '2000/50']);
    expect(hint()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(latest?.z).toEqual([[11, 21, 30], [41, 51, 60], [70, 80, 90]]);

    fireEvent.click(cellAt(3000, 150), { detail: 1 });
    expect(selected()).toEqual(['3000/150']);
    expect(hint()).toBeTruthy();
  });

  it('completes the range from a mouse press on the second corner', () => {
    render(<MapHarness />);
    fireEvent.click(range());
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    fireEvent.pointerUp(window, mouse);
    fireEvent.pointerDown(cellAt(3000, 150), mouse);
    fireEvent.pointerUp(window, mouse);
    expect(selected()).toHaveLength(9);
    expect(hint()).toBeNull();
  });

  it('completes the range from a mouse drag', () => {
    render(<MapHarness />);
    fireEvent.click(range());
    fireEvent.pointerDown(cellAt(1000, 50), mouse);
    fireEvent.pointerEnter(cellAt(2000, 100), mouse);
    fireEvent.pointerUp(window, mouse);
    expect(selected()).toEqual(['1000/100', '1000/50', '2000/100', '2000/50']);
    expect(hint()).toBeNull();
  });

  it('clears the selection when switched on or off', () => {
    render(<MapHarness />);
    fireEvent.click(cellAt(1000, 50), { detail: 0 });
    fireEvent.click(range());
    expect(selected()).toEqual([]);
    fireEvent.click(cellAt(1000, 50), { detail: 0 });
    fireEvent.click(range());
    expect(range().getAttribute('aria-pressed')).toBe('false');
    expect(selected()).toEqual([]);
    expect(hint()).toBeNull();
  });

  it('drops a waiting anchor when the selection is set another way', () => {
    render(<MapHarness />);
    fireEvent.click(range());
    fireEvent.click(cellAt(1000, 50), { detail: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(hint()).toBeNull();
    expect(selected()).toHaveLength(9);
    // the next tap anchors a new range rather than completing one from the old anchor
    fireEvent.click(cellAt(2000, 100), { detail: 0 });
    expect(selected()).toEqual(['2000/100']);
    expect(hint()).toBeTruthy();
  });
});

/** @type {import('../../src/sim/ecu/calibration.js').EcuFieldMeta} */
const CAM_META = {
  path: 'vvt.intakeTarget', section: 'vvt', group: 'Targets', label: 'Intake cam advance', kind: 'map', unit: '°',
  xLabel: 'RPM', yLabel: 'MAP kPa', min: 0, max: 50, step: 1, help: 'A cam map for the test.',
};

/** A cam map over its own state, the way EcuSection holds one. */
function CamHarness() {
  const [table, setTable] = React.useState(/** @type {import('../../src/ui/components/ecu/tableOps.js').Table} */ ({
    x: [1000, 2000, 3000, 4000], y: [40, 70, 100],
    z: [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]],
  }));
  return (
    <>
      <output data-testid="z">{JSON.stringify(table.z)}</output>
      <CalTable table={table} meta={CAM_META} onChange={setTable} />
    </>
  );
}

const camCell = (rpm, kpa) => screen.getByRole('button', { name: new RegExp(`^Intake cam advance at RPM ${rpm}, MAP kPa ${kpa}:`) });
const camZ = () => JSON.parse(screen.getByTestId('z').textContent ?? '[]');

describe('range selection on a cam map', () => {
  it('Range takes a rectangle in two taps, and the tools act on all of it', () => {
    render(<CamHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    expect(screen.getByText('Tap the first corner of the range.')).toBeTruthy();
    fireEvent.click(camCell(1000, 40));
    expect(screen.getByText('1 cell · tap the opposite corner')).toBeTruthy();
    fireEvent.click(camCell(2000, 70));
    expect(screen.getByText(/2 × 2, 4 cells/)).toBeTruthy();
    const addBox = screen.getByLabelText('Add to selected cells');
    fireEvent.change(addBox, { target: { value: '3' } });
    fireEvent.keyDown(addBox, { key: 'Enter' });
    expect(camZ()).toEqual([[4, 5, 3, 4], [8, 9, 7, 8], [9, 10, 11, 12]]);
  });

  it('copies a range and pastes it into another, arrangement kept', () => {
    render(<CamHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Range' }));
    fireEvent.click(camCell(1000, 40));
    fireEvent.click(camCell(2000, 70));
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(screen.getByText('Copied 2 × 2')).toBeTruthy();
    // One cell: the whole block goes down from there.
    fireEvent.click(camCell(3000, 40));
    fireEvent.click(camCell(3000, 40));
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    return screen.findByText('Pasted 2 × 2').then(() => {
      expect(camZ()).toEqual([[1, 2, 1, 2], [5, 6, 5, 6], [9, 10, 11, 12]]);
    });
  });

  it('a mouse drags a range without the mode', () => {
    render(<CamHarness />);
    fireEvent.pointerDown(camCell(3000, 70), { pointerType: 'mouse', button: 0, buttons: 1 });
    fireEvent.pointerEnter(camCell(4000, 100), { pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerUp(window);
    expect(screen.getByText(/2 × 2, 4 cells/)).toBeTruthy();
  });
});
