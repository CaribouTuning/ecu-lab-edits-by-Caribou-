// @vitest-environment jsdom

/**
 * The phone's page picker: one button naming the open page, which lists every page.
 * TUNE's pages used to be a row of tabs running off the right edge of a phone.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PagePicker } from '../../src/ui/components/PagePicker.jsx';

afterEach(cleanup);

const PAGES = [
  { id: 'airflow', name: 'Airflow (VE)' },
  { id: 'spark', name: 'Spark', flagged: 2 },
  { id: 'boost', name: 'Boost', locked: true },
];

describe('PagePicker', () => {
  it('names the open page and lists every page on a press', () => {
    render(<PagePicker label="Tuning pages" pages={PAGES} current="airflow" onPick={() => {}} />);
    const button = screen.getByRole('button', { name: /Airflow \(VE\) is open/ });
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(button);
    const list = screen.getByRole('list', { name: 'Tuning pages' });
    expect(within(list).getAllByRole('button')).toHaveLength(3);
    expect(within(list).getByRole('button', { name: 'Airflow (VE)' }).getAttribute('aria-current')).toBe('page');
    expect(within(list).getByRole('button', { name: /Spark, named by 2 entries/ })).toBeTruthy();
    expect(within(list).getByRole('button', { name: /Boost, locked/ })).toBeTruthy();
  });

  it('opens the page chosen and closes', () => {
    const onPick = vi.fn();
    render(<PagePicker label="Tuning pages" pages={PAGES} current="airflow" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /is open/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Spark/ }));
    expect(onPick).toHaveBeenCalledWith('spark');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('closes on Escape without choosing', () => {
    const onPick = vi.fn();
    render(<PagePicker label="Tuning pages" pages={PAGES} current="airflow" onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: /is open/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('list')).toBeNull();
    expect(onPick).not.toHaveBeenCalled();
  });
});
