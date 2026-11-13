// @vitest-environment jsdom
/**
 * The tutorial: its pages, its real-screen snippets and its numbers, and the Learn guide's
 * worked scenarios. The important guarantees are the ones a tutorial usually loses over time:
 * every callout still points at something on its screen, and every number it quotes
 * is the one the game will show.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EcuLab, { DYNO_PULL_MS } from '../../src/ui/EcuLab.jsx';
import { TutorialScreen } from '../../src/ui/screens/TutorialScreen.jsx';
import { TUTORIAL } from '../../src/ui/tutorial/books.js';
import { intakeFitted, intakeRetuned, overAdvanced, stock } from '../../src/ui/tutorial/scenarios.js';
import { enterSandbox, goTo, factoryEngine } from './nav.js';

// recharts' <ResponsiveContainer> needs a ResizeObserver, which jsdom lacks.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
const hadResizeObserver = 'ResizeObserver' in window;
if (!hadResizeObserver) window.ResizeObserver = ResizeObserverStub;
afterAll(() => {
  if (!hadResizeObserver) delete window.ResizeObserver;
});

beforeEach(() => {
  try { localStorage.clear(); } catch { /* no storage */ }
});
afterEach(cleanup);

/** Opens lesson `i` of `book` from its contents page. */
const openLesson = (book, i) => {
  render(<TutorialScreen book={book} onDone={() => {}} />);
  const nav = screen.getByRole('navigation', { name: `${book.title} contents` });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${book.lessons[i].number.replace('.', '\\.')} `) }));
};

describe('the tutorial is short', () => {
  it('takes five minutes at most: a handful of cards, not a course', () => {
    // The in-depth material is the Learn app's job. The tutorial is the way in, and
    // nobody finishes a long one.
    expect(TUTORIAL.chapters.reduce((m, c) => m + c.minutes, 0)).toBeLessThanOrEqual(5);
    expect(TUTORIAL.lessons.length).toBeLessThanOrEqual(6);
  });

  it('opens on a short contents page, then counts through its cards', () => {
    render(<TutorialScreen onDone={() => {}} />);
    expect(screen.getByText('Tutorial contents')).toBeTruthy();
    expect(screen.getByText('By the end you will be able to')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(screen.getByText(`Tutorial, page 1 of ${TUTORIAL.lessons.length}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText(`Tutorial, page 2 of ${TUTORIAL.lessons.length}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /BACK/ }));
    fireEvent.click(screen.getByRole('button', { name: /BACK/ }));
    expect(screen.getByText('Tutorial contents')).toBeTruthy();
  });

  it('ends on the game', () => {
    const onDone = vi.fn();
    render(<TutorialScreen onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${TUTORIAL.lessons.length} `) }));
    expect(screen.queryByRole('button', { name: 'Open the course' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'START TUNING' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});

describe.each([
  ...TUTORIAL.lessons.map((l, i) => ['tutorial', TUTORIAL, l.number, l.title, i]),
])('%s %s, %s', (_b, book, _n, _t, i) => {
  it('opens, and points every callout at something that is really on its screen', () => {
    openLesson(book, i);
    expect(screen.getByRole('article')).toBeTruthy();
    for (const fig of screen.queryAllByRole('figure')) {
      const name = fig.getAttribute('aria-label');
      expect({ name, missing: fig.getAttribute('data-callouts-missing') }).toEqual({ name, missing: '0' });
    }
  });
});

describe('the numbers are the game’s', () => {
  it('the stock pull the tutorial quotes is the pull the app makes on the engine it names', async () => {
    // As a player does it: SANDBOX opens with no engine, and the lessons name the Rev-Up.
    render(<EcuLab blankStart />);
    enterSandbox();
    goTo('DYNO');
    fireEvent.click(factoryEngine('Nissan VQ35DE Rev-Up'));
    fireEvent.click(screen.getByRole('button', { name: 'Run a pull' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run a pull' })).toBeTruthy(), { timeout: 10000 });
    // At the dyno the computer's title bar carries the pull's peak, where the strip would.
    expect(screen.getByText(new RegExp(`^Peak ${Math.round(stock().result.peakHp)} whp`))).toBeTruthy();
  }, DYNO_PULL_MS + 4000);

  it('each worked scenario the Learn guide shows says what the article says it does', () => {
    // Over-advanced spark knocks and gains nothing, because knock control takes it back
    // out; the intake makes the MAF entry and runs lean of target at full throttle; the
    // retune clears both and keeps the part's gain over stock. (Not more than the untuned
    // pull: that one ran lean of its rich target, and a leaner flame releases a little more
    // heat; thermo.js, heatReleasedShare. The lesson says so from these same numbers.)
    expect(overAdvanced().result.events.some((e) => e.type === 'knock')).toBe(true);
    expect(overAdvanced().result.peakHp).toBeLessThanOrEqual(stock().result.peakHp + 1);
    const fitted = intakeFitted().result;
    expect(fitted.events.map((e) => e.type)).toContain('maf');
    const wotLean = Math.max(...fitted.points.filter((p) => p.openLoop).map((p) => p.afr / p.afrCommanded - 1));
    expect(wotLean).toBeGreaterThan(0.05);
    const retuned = intakeRetuned().result;
    expect(retuned.events.filter((e) => e.type === 'maf' || e.type === 'lean')).toEqual([]);
    expect(retuned.peakHp).toBeGreaterThan(stock().result.peakHp);
  });
});
