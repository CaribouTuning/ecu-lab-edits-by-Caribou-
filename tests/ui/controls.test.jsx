// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Seg } from '../../src/ui/primitives/Seg.jsx';
import segStyles from '../../src/ui/primitives/Seg.module.css';
import { Select } from '../../src/ui/primitives/Select.jsx';
import selectStyles from '../../src/ui/primitives/Select.module.css';
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

  it('does not apply the equal-width modifier class by default', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Table' }).className).not.toContain(segStyles.equal);
  });

  it('applies the equal-width modifier class when equal is set', () => {
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={() => {}} equal />);
    expect(screen.getByRole('group', { name: 'Table' }).className).toContain(segStyles.equal);
  });

  it('keeps selection behaviour unchanged when equal is set', () => {
    const onChange = vi.fn();
    render(<Seg label="Table" options={SEG_OPTIONS} value="ve" onChange={onChange} equal />);
    expect(screen.getByRole('button', { name: 'AIR' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'FUEL' }));
    expect(onChange).toHaveBeenCalledWith('afr');
  });

  // ECU Injector Scaling and DYNO's manifold-pressure picker both key their options
  // off a number (cc, kPa) rather than a string id — this was already true at
  // runtime under EcuLab.jsx's @ts-nocheck; the TUNE screen split moved the first of
  // those two call sites into a typed file, which is what surfaced that Seg's own
  // types had only ever promised `string`. Proves the widened type describes real
  // behaviour rather than papering over a call-site cast.
  const NUMERIC_OPTIONS = [
    { id: 550, label: '550' },
    { id: 750, label: '750' },
  ];

  it('accepts a numeric id, not just a string one', () => {
    const onChange = vi.fn();
    render(<Seg label="Size" options={NUMERIC_OPTIONS} value={550} onChange={onChange} />);
    expect(screen.getByRole('button', { name: '550' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '750' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '750' }));
    // Fails if Seg ever coerces to a string internally — 750 the number, not '750'.
    expect(onChange).toHaveBeenCalledWith(750);
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

  it('lets the caller size it, since the primitive will not', () => {
    // The wrapper is inline-block with a 200px floor, so a bare swap for the old
    // full-width control shrinks it. The docstring says callers must size it
    // themselves — this is the mechanism that makes that possible, and without it
    // the instruction was unfollowable.
    const { container } = render(
      <Select
        label="Engine"
        groups={[{ label: 'Nissan', options: [{ value: 'vq', label: 'VQ35DE' }] }]}
        value="vq"
        onChange={() => {}}
        style={{ display: 'block', marginBottom: 13 }}
      />,
    );
    const wrap = /** @type {HTMLElement} */ (container.firstChild);
    expect(wrap.style.display).toBe('block');
    expect(wrap.style.marginBottom).toBe('13px');
  });

  it('adds a caller-supplied className instead of replacing its own', () => {
    // `className` is documented passthrough ("Anything not named here ... lands
    // on the wrapper"), but used to live in `...rest`, which spreads after the
    // wrapper's own class and so overwrote it outright — a caller following the
    // docblock got an unstyled wrapper with no test failure.
    const { container } = render(
      <Select label="Engine" groups={GROUPS} value="n54" onChange={() => {}} className="callerClass" />,
    );
    const wrap = /** @type {HTMLElement} */ (container.firstChild);
    expect(wrap.className).toContain(selectStyles.wrap);
    expect(wrap.className).toContain('callerClass');
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

describe('Toggle styling lives in the stylesheet', () => {
  // .sub's margin-top does nothing on an inline box, so display:block is load-bearing
  // rather than cosmetic — and jsdom cannot observe it any other way.
  it('gives the sub-label display:block in CSS, not inline', () => {
    // Explicit node:url URL, not the ambient global: this file runs under the jsdom
    // environment, which replaces global URL with its own class that fs.readFileSync
    // refuses ("The URL must be of scheme file") even for a valid file:// URL.
    const css = readFileSync(new NodeURL('../../src/ui/primitives/Toggle.module.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.sub\s*\{[^}]*display:\s*block/);
  });

  it('keeps Toggle.jsx free of inline styles', () => {
    const jsx = readFileSync(new NodeURL('../../src/ui/primitives/Toggle.jsx', import.meta.url), 'utf8');
    expect(jsx).not.toContain('style=');
  });
});
