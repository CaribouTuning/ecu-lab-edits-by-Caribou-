// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AdvisorPanel } from '../../src/ui/components/AdvisorPanel.jsx';

afterEach(cleanup);

describe('AdvisorPanel', () => {
  it('starts collapsed and shows the headline while closed', () => {
    render(<AdvisorPanel headline="3.5 deg past the knock limit" tone="danger"><p>body</p></AdvisorPanel>);
    const panel = screen.getByTestId('advisor-panel');
    expect(panel.getAttribute('data-open')).toBe('false');
    expect(screen.getByText('3.5 deg past the knock limit')).toBeTruthy();
  });

  it('toggles data-open when the toggle is clicked', () => {
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const panel = screen.getByTestId('advisor-panel');
    fireEvent.click(screen.getByRole('button', { name: 'Show advisor detail' }));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hide advisor detail' }));
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it('reports its open state to a screen reader', () => {
    // #81 is open precisely because BuildSection and ExpandableInfo do NOT do this.
    // A component added after that issue was filed must not repeat the omission.
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const toggle = screen.getByRole('button', { name: 'Show advisor detail' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('changes the toggle accessible name with open state, not just aria-expanded', () => {
    // Pins the fix for the >=560px lie: a static label would leave aria-expanded
    // as the only signal, and CSS alone hides the toggle from the a11y tree at
    // desktop widths anyway — the label itself must track state, not just exist.
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    expect(screen.getByRole('button', { name: 'Show advisor detail' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show advisor detail' }));
    expect(screen.getByRole('button', { name: 'Hide advisor detail' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show advisor detail' })).toBeNull();
  });

  it('carries the tone as an attribute rather than a colour', () => {
    render(<AdvisorPanel headline="h" tone="warn"><p>body</p></AdvisorPanel>);
    expect(screen.getByTestId('advisor-panel').getAttribute('data-tone')).toBe('warn');
  });
});
