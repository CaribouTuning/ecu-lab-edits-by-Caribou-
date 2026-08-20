// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Seg } from '../../src/ui/primitives/Seg.jsx';
import { Select } from '../../src/ui/primitives/Select.jsx';
import { Toggle } from '../../src/ui/primitives/Toggle.jsx';

// This project's vitest config has no `globals: true` and no setup file, so
// Testing Library does not auto-unmount between tests. Every test here renders
// and queries by role, so without this, elements from earlier tests accumulate
// in the DOM and unscoped role/name queries start matching more than one
// element. Matches the pattern already used in readouts.test.jsx.
afterEach(cleanup);

const SEG_OPTIONS = [
  { id: 've', label: 'AIR' },
  { id: 'timing', label: 'SPARK' },
  { id: 'afr', label: 'FUEL' },
];

describe('Seg', () => {
  it('renders one button per option', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks only the selected option as pressed', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="timing" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'SPARK' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'AIR' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports the id of the option clicked', () => {
    const onChange = vi.fn();
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'FUEL' }));
    expect(onChange).toHaveBeenCalledWith('afr');
  });

  it('names the group for assistive technology', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Table' })).toBeTruthy();
  });
});

describe('Select', () => {
  const GROUPS = [
    { label: 'BMW', options: [{ value: 'n54', label: 'N54 3.0' }, { value: 'b58', label: 'B58 3.0' }] },
    { label: 'Nissan', options: [{ value: 'vq35', label: 'VQ35DE' }] },
  ];

  it('renders every option inside its group', () => {
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={() => {}} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('appends the extra options after the groups', () => {
    render(
      <Select
        label="Engine"
        groups={GROUPS}
        extra={[{ value: 'custom', label: 'Custom build' }]}
        value="n54"
        onChange={() => {}}
      />,
    );
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['N54 3.0', 'B58 3.0', 'VQ35DE', 'Custom build']);
  });

  it('reports the selected value', () => {
    const onChange = vi.fn();
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b58' } });
    expect(onChange).toHaveBeenCalledWith('b58');
  });

  it('is labelled', () => {
    render(<Select label="Engine" groups={GROUPS} value="n54" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Engine' })).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('exposes itself as a switch reflecting its state', () => {
    render(<Toggle label="Intake" checked onChange={() => {}} />);
    expect(screen.getByRole('switch', { name: 'Intake' }).getAttribute('aria-checked')).toBe('true');
  });

  it('reports the flipped value when clicked', () => {
    const onChange = vi.fn();
    render(<Toggle label="Intake" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('renders its sub-label', () => {
    render(<Toggle label="Intake" sub="+4% VE above 4000 RPM" checked onChange={() => {}} />);
    expect(screen.getByText('+4% VE above 4000 RPM')).toBeTruthy();
  });

  it('names the switch after its label alone, not the sub-label too', () => {
    // The sub-label carries the physics ("+4% VE above 4000 RPM"). Fused into the
    // accessible name it becomes one unbroken run; as a description it is announced
    // separately, the way the two visually separated lines read on screen.
    render(<Toggle label="Intake" sub="+4% VE above 4000 RPM" checked onChange={() => {}} />);
    const el = screen.getByRole('switch', { name: 'Intake' });
    expect(el.getAttribute('aria-label')).toBe('Intake');
  });

  it('describes the switch with its sub-label', () => {
    render(<Toggle label="Intake" sub="+4% VE above 4000 RPM" checked onChange={() => {}} />);
    const el = screen.getByRole('switch');
    const describedBy = el.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy).textContent).toBe('+4% VE above 4000 RPM');
  });

  it('carries no description when there is no sub-label', () => {
    render(<Toggle label="Intake" checked onChange={() => {}} />);
    expect(screen.getByRole('switch').getAttribute('aria-describedby')).toBeNull();
  });
});
