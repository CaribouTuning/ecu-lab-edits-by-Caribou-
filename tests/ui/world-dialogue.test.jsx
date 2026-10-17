// @vitest-environment jsdom

/**
 * The career world's text box: lines type out, a press finishes a line before it moves
 * on, the last line can offer choices, and keys work the same as a tap.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Dialogue } from '../../src/ui/world/Hud.jsx';

afterEach(() => { cleanup(); vi.useRealTimers(); });

/** Let the typewriter run to the end of the line, one timer step at a time. */
const typeAll = () => { for (let i = 0; i < 120; i += 1) act(() => { vi.advanceTimersByTime(40); }); };

const typed = () => screen.getByRole('button', { name: /continue|show the whole line/i });

describe('the text box', () => {
  it('types a line out, finishes it on a press, then moves to the next and ends', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const talk = { lines: [{ who: 'Pops', text: 'Welcome to the shop.' }, { text: 'The keys are on the bench.' }] };
    render(<Dialogue talk={talk} onDone={onDone} sound={false} />);
    expect(screen.getByText('Pops')).toBeTruthy();
    // Part-way through, the button finishes the line rather than skipping it.
    act(() => { vi.advanceTimersByTime(80); });
    expect(typed().getAttribute('aria-label')).toBe('Show the whole line');
    fireEvent.click(typed());
    expect(typed().getAttribute('aria-label')).toBe('Continue');
    fireEvent.click(typed());
    // The narrator line has no name tab.
    expect(screen.queryByText('Pops')).toBeNull();
    typeAll();
    fireEvent.keyDown(window, { code: 'KeyE' });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('offers choices on its last line, picked by tap or by keys', () => {
    vi.useFakeTimers();
    const yes = vi.fn();
    const no = vi.fn();
    const talk = { lines: [{ who: 'Gus', text: 'Want to see the kit?', choices: [{ label: 'SHOW ME', run: yes }, { label: 'NOT NOW', run: no }] }] };
    render(<Dialogue talk={talk} onDone={() => {}} sound={false} />);
    expect(screen.queryByRole('menuitem')).toBeNull();
    typeAll();
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['SHOW ME', 'NOT NOW']);
    fireEvent.keyDown(window, { code: 'ArrowDown' });
    fireEvent.keyDown(window, { code: 'Enter' });
    expect(no).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'SHOW ME' }));
    expect(yes).toHaveBeenCalledTimes(1);
  });
});
