// @vitest-environment jsdom

/**
 * The phone's page tabs: every page in sight and one tap away. TUNE's pages were once a row
 * of tabs running off the right edge of a phone, then a drop-down that hid them.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PageTabs } from '../../src/ui/components/PageTabs.jsx';

afterEach(cleanup);

const PAGES = [
  { id: 'airflow', name: 'Airflow (VE)', short: 'Airflow' },
  { id: 'spark', name: 'Spark', flagged: 2 },
  { id: 'boost', name: 'Boost', locked: true },
];

describe('PageTabs', () => {
  it('shows every page at once, the open one marked, with what the log flagged and what is locked', () => {
    render(<PageTabs label="Tuning pages" pages={PAGES} current="airflow" onPick={() => {}} />);
    const group = screen.getByRole('group', { name: 'Tuning pages' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);
    expect(within(group).getByRole('button', { name: 'Airflow (VE)' }).getAttribute('aria-current')).toBe('page');
    expect(within(group).getByRole('button', { name: /Spark, named by 2 entries/ })).toBeTruthy();
    expect(within(group).getByRole('button', { name: /Boost, locked/ })).toBeTruthy();
  });

  it('opens the page tapped', () => {
    const onPick = vi.fn();
    render(<PageTabs label="Tuning pages" pages={PAGES} current="airflow" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /^Spark/ }));
    expect(onPick).toHaveBeenCalledWith('spark');
  });
});
