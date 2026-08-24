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

  it('toggles data-open when the summary is clicked', () => {
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const panel = screen.getByTestId('advisor-panel');
    fireEvent.click(screen.getByRole('button', { name: /advisor/i }));
    expect(panel.getAttribute('data-open')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /advisor/i }));
    expect(panel.getAttribute('data-open')).toBe('false');
  });

  it('reports its open state to a screen reader', () => {
    // #81 is open precisely because BuildSection and ExpandableInfo do NOT do this.
    // A component added after that issue was filed must not repeat the omission.
    render(<AdvisorPanel headline="h" tone="ok"><p>body</p></AdvisorPanel>);
    const toggle = screen.getByRole('button', { name: /advisor/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('carries the tone as an attribute rather than a colour', () => {
    render(<AdvisorPanel headline="h" tone="warn"><p>body</p></AdvisorPanel>);
    expect(screen.getByTestId('advisor-panel').getAttribute('data-tone')).toBe('warn');
  });
});
