// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { Eyebrow } from '../../src/ui/primitives/Eyebrow.jsx';
import { Note } from '../../src/ui/primitives/Note.jsx';
import noteStyles from '../../src/ui/primitives/Note.module.css';
import { Panel } from '../../src/ui/primitives/Panel.jsx';
import panelStyles from '../../src/ui/primitives/Panel.module.css';

afterEach(cleanup);

describe('Panel', () => {
  it('renders its children', () => {
    render(<Panel>peak power</Panel>);
    expect(screen.getByText('peak power')).toBeTruthy();
  });

  it('uses the tight padding modifier only when asked', () => {
    const { rerender } = render(<Panel>x</Panel>);
    expect(screen.getByText('x').className).not.toContain(panelStyles.tight);
    rerender(<Panel tight>x</Panel>);
    expect(screen.getByText('x').className).toContain(panelStyles.tight);
  });

  it('can render as another element', () => {
    render(<Panel as="section">x</Panel>);
    expect(screen.getByText('x').tagName).toBe('SECTION');
  });

  it('passes unknown props through to the element', () => {
    render(<Panel aria-label="Build summary">x</Panel>);
    expect(screen.getByLabelText('Build summary')).toBeTruthy();
  });

  it('lets a caller supply the layout the panel does not own', () => {
    // Fourteen of the fifteen call sites pass a `style` for margins and flex. They
    // live in a file with @ts-nocheck, so a props type that rejected `style` would
    // never have failed there — it would only have surfaced the first time a typed
    // screen tried the same thing, which is exactly what the next PR does.
    const { container } = render(<Panel style={{ marginBottom: 13 }}>x</Panel>);
    expect(/** @type {HTMLElement} */ (container.firstChild).style.marginBottom).toBe('13px');
  });

  it('adds a caller-supplied className instead of replacing its own', () => {
    // `className` is documented passthrough ("Anything not named above ... lands
    // on the element"), but used to live in `...rest`, which spreads after the
    // computed class list and so overwrote it outright — a caller following the
    // docblock got an unstyled panel with no test failure.
    render(<Panel className="callerClass">x</Panel>);
    const el = screen.getByText('x');
    expect(el.className).toContain(panelStyles.panel);
    expect(el.className).toContain('callerClass');
  });
});

describe('Eyebrow', () => {
  it('renders its label', () => {
    render(<Eyebrow>Forced induction</Eyebrow>);
    expect(screen.getByText('Forced induction')).toBeTruthy();
  });

  it('renders an icon when given one', () => {
    const Icon = (props) => <svg data-testid="icon" {...props} />;
    render(<Eyebrow icon={Icon}>Boost</Eyebrow>);
    expect(screen.getByTestId('icon')).toBeTruthy();
  });
});

describe('Note', () => {
  it('defaults to the info tone', () => {
    render(<Note>Speed density indexes VE by RPM and MAP.</Note>);
    expect(screen.getByRole('note').className).toContain(noteStyles.info);
  });

  it('applies the warn tone', () => {
    render(<Note tone="warn">Injector duty is above 90%.</Note>);
    expect(screen.getByRole('note').className).toContain(noteStyles.warn);
  });

  it('announces a danger note as an alert', () => {
    // A danger note reports engine distress; a screen reader should not have to
    // stumble across it.
    render(<Note tone="danger">Knock retard active.</Note>);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
