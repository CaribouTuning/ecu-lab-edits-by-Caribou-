// @vitest-environment jsdom
/**
 * The tutorial: its pages, its real-screen snippets, its numbers and its practice
 * missions. The important guarantees are the ones a tutorial usually loses over time:
 * every callout still points at something on its screen, and every number it quotes
 * is the one the game will show.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EcuLab, { DYNO_PULL_MS } from '../../src/ui/EcuLab.jsx';
import { TutorialScreen } from '../../src/ui/screens/TutorialScreen.jsx';
import { CHAPTERS, LESSONS } from '../../src/ui/tutorial/lessons.jsx';
import { MISSIONS, advance, markOf } from '../../src/ui/tutorial/missions.js';
import { intakeFitted, intakeRetuned, overAdvanced, stock } from '../../src/ui/tutorial/scenarios.js';
import { LOAD } from '../../src/sim/index.js';

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

const openLesson = (i) => {
  render(<TutorialScreen onDone={() => {}} onPractice={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${LESSONS[i].number.replace('.', '\\.')} `) }));
};

describe('the contents page', () => {
  it('says what you will learn, what you need and how long, before lesson one', () => {
    render(<TutorialScreen onDone={() => {}} />);
    expect(screen.getByText('TUTORIAL · CONTENTS')).toBeTruthy();
    expect(screen.getByText('BY THE END YOU WILL BE ABLE TO')).toBeTruthy();
    expect(screen.getByText('YOU NEED')).toBeTruthy();
    const minutes = CHAPTERS.reduce((m, c) => m + c.minutes, 0);
    expect(screen.getByText(new RegExp(`About ${minutes} minutes`))).toBeTruthy();
  });

  it('shows the end result first: the stock engine on the real dyno screen, with its real numbers', () => {
    render(<TutorialScreen onDone={() => {}} />);
    const fig = screen.getByRole('figure', { name: 'Game screen: DYNO' });
    expect(fig.querySelector('[data-tour="dyno-power"]')).toBeTruthy();
    expect(within(fig).getByText(new RegExp(`${stock().result.peakHp} whp`))).toBeTruthy();
  });

  it('lists every lesson under its chapter, and ticks the ones read', () => {
    render(<TutorialScreen onDone={() => {}} />);
    const nav = screen.getByRole('navigation', { name: 'Tutorial contents' });
    expect(within(nav).getAllByRole('button')).toHaveLength(LESSONS.length);
    fireEvent.click(within(nav).getByRole('button', { name: /^1\.1 / }));
    fireEvent.click(screen.getByRole('button', { name: /CONTENTS/ }));
    expect(screen.getByRole('button', { name: /^1\.1 .*, read$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1\.2 [^,]*$/ })).toBeTruthy();
  });

  it('picks up where the reader left off', () => {
    const first = render(<TutorialScreen onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /^2\.2 / }));
    first.unmount();
    render(<TutorialScreen onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE AT 2.2' }));
    expect(screen.getByRole('heading', { level: 1, name: /FUEL/ })).toBeTruthy();
  });
});

describe('moving through the lessons', () => {
  it('starts at lesson one and counts through them all', () => {
    render(<TutorialScreen onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'START' }));
    expect(screen.getByText(`TUTORIAL · 1/${LESSONS.length}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'NEXT' }));
    expect(screen.getByText(`TUTORIAL · 2/${LESSONS.length}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /BACK/ }));
    expect(screen.getByText(`TUTORIAL · 1/${LESSONS.length}`)).toBeTruthy();
    // BACK from the first lesson is the contents page, not nothing.
    fireEvent.click(screen.getByRole('button', { name: /BACK/ }));
    expect(screen.getByText('TUTORIAL · CONTENTS')).toBeTruthy();
  });

  it('finishes into the game from the last lesson, and can be skipped from anywhere', () => {
    const onDone = vi.fn();
    render(<TutorialScreen onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^5\.3 / }));
    fireEvent.click(screen.getByRole('button', { name: 'START TUNING' }));
    fireEvent.click(screen.getByRole('button', { name: 'SKIP' }));
    expect(onDone).toHaveBeenCalledTimes(2);
  });

  it('marks the end of each chapter', () => {
    openLesson(LESSONS.findIndex((l) => l.id === 'find-your-way'));
    expect(screen.getByRole('status').textContent).toMatch(/Chapter 1 complete/);
  });
});

describe.each(LESSONS.map((l, i) => [l.number, l.title, i]))('lesson %s, %s', (_n, _t, i) => {
  it('opens, says what you will learn, and gives you something to do or to take away', () => {
    openLesson(i);
    const article = screen.getByRole('article');
    expect(within(article).getByText('YOU WILL')).toBeTruthy();
    expect(within(article).getByText('WHAT YOU JUST DID')).toBeTruthy();
  });

  it('points every callout at something that is really on its screen', () => {
    openLesson(i);
    for (const fig of screen.queryAllByRole('figure')) {
      const name = fig.getAttribute('aria-label');
      expect({ name, missing: fig.getAttribute('data-callouts-missing') }).toEqual({ name, missing: '0' });
    }
  });
});

describe('a lesson’s screen is live', () => {
  it('APPLY HALF in lesson 4.2 changes the sandbox table and then asks for a new pull, as the game does', () => {
    openLesson(LESSONS.findIndex((l) => l.id === 've-from-logs'));
    const fig = screen.getByRole('figure', { name: 'Game screen: TUNE › AIRFLOW' });
    const cellBefore = within(fig).getByRole('button', { name: '7500 RPM, 100 kPa' }).textContent;
    fireEvent.click(within(fig).getByRole('button', { name: 'APPLY HALF' }));
    expect(within(fig).getByRole('button', { name: '7500 RPM, 100 kPa' }).textContent).not.toBe(cellBefore);
    const panel = within(fig).getByRole('region', { name: 'Correct VE from logs' });
    expect(within(panel).getByText(/before you changed VE table .* run another pull/)).toBeTruthy();
  });
});

describe('the numbers are the game’s', () => {
  it('the stock pull the tutorial quotes is the pull the app makes', async () => {
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'SANDBOX' }));
    fireEvent.click(screen.getByRole('button', { name: /DYNO/ }));
    fireEvent.click(screen.getByRole('button', { name: 'RUN DYNO PULL' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'RUN DYNO PULL' })).toBeTruthy(), { timeout: 10000 });
    const strip = document.querySelector('[data-tour="strip-last-pull"]');
    expect(strip.textContent).toContain(`${Math.round(stock().result.peakHp)} whp`);
  }, DYNO_PULL_MS + 4000);

  it('each chapter-4 scenario says what the lesson says it does', () => {
    // Over-advanced spark knocks and costs power; the intake makes the MAF and lean
    // entries; the retune clears both and makes more than either.
    expect(overAdvanced().result.events.some((e) => e.type === 'knock')).toBe(true);
    expect(overAdvanced().result.peakHp).toBeLessThan(stock().result.peakHp);
    const fitted = intakeFitted().result.events.map((e) => e.type);
    expect(fitted).toEqual(expect.arrayContaining(['maf', 'lean']));
    const retuned = intakeRetuned().result;
    expect(retuned.events.filter((e) => e.type === 'maf' || e.type === 'lean')).toEqual([]);
    expect(retuned.peakHp).toBeGreaterThan(intakeFitted().result.peakHp);
  });
});

describe('practice missions', () => {
  const route = (tab, section = null) => ({ tab, section });
  const base = () => {
    const s = stock().state;
    return { ...s, session: { ...s.session, result: null, pullCount: 0, running: false } };
  };
  const find = (id) => MISSIONS.find((m) => m.id === id);
  const startOf = (state) => ({ step: 0, marks: [markOf(state)] });

  it('first pull: ticks as the player opens DYNO, pulls, and reads the log and datalog', () => {
    const m = find('first-pull');
    let s = base();
    let p = advance(m, startOf(s), s, route('build', 'engine'));
    expect(p.step).toBe(0);
    p = advance(m, p, s, route('dyno', 'result'));
    expect(p.step).toBe(1);
    s = { ...s, session: { ...s.session, pullCount: 1, result: stock().result } };
    p = advance(m, p, s, route('dyno', 'result'));
    expect(p.step).toBe(2);
    p = advance(m, p, s, route('dyno', 'log'));
    p = advance(m, p, s, route('dyno', 'data'));
    expect(p.step).toBe(m.steps.length);
  });

  it('bolt-on: the VE step only ticks once the table actually changes after the pull', () => {
    const m = find('bolt-on');
    let s = base();
    let p = startOf(s);
    s = { ...s, build: { ...s.build, mods: { ...s.build.mods, intake: true } } };
    p = advance(m, p, s, route('build', 'induction'));
    expect(p.step).toBe(1);
    s = { ...s, session: { ...s.session, pullCount: 1, result: intakeFitted().result } };
    p = advance(m, p, s, route('tune', 'airflow'));
    expect(p.step).toBe(2);
    // Same table, a new render: not done.
    p = advance(m, p, { ...s, tune: { ...s.tune } }, route('tune', 'airflow'));
    expect(p.step).toBe(2);
    s = { ...s, tune: { ...s.tune, ve: s.tune.ve.map((r) => r.map((v) => v + 1)) } };
    p = advance(m, p, s, route('tune', 'airflow'));
    expect(p.step).toBe(3);
    s = { ...s, build: { ...s.build, mafScalar: 1.11 } };
    p = advance(m, p, s, route('tune', 'sensors'));
    expect(p.step).toBe(4);
    s = { ...s, session: { ...s.session, pullCount: 2, result: intakeRetuned().result } };
    p = advance(m, p, s, route('dyno', 'result'));
    expect(p.step).toBe(m.steps.length);
  });

  it('knock limit: needs the knock seen in the log, then a clean pull after it', () => {
    const m = find('knock-limit');
    let s = base();
    let p = startOf(s);
    const WOT = LOAD.indexOf(100);
    s = { ...s, tune: { ...s.tune, timing: s.tune.timing.map((r, ri) => (ri === WOT ? r.map((v) => v + 4) : r)) } };
    p = advance(m, p, s, route('tune', 'spark'));
    expect(p.step).toBe(1);
    s = { ...s, session: { ...s.session, pullCount: 1, result: overAdvanced().result } };
    p = advance(m, p, s, route('dyno', 'result'));
    expect(p.step).toBe(2);
    p = advance(m, p, s, route('dyno', 'log'));
    expect(p.step).toBe(3);
    // The same knocking pull does not count as the clean one.
    p = advance(m, p, s, route('dyno', 'log'));
    expect(p.step).toBe(3);
    s = { ...s, session: { ...s.session, pullCount: 2, result: stock().result } };
    p = advance(m, p, s, route('dyno', 'result'));
    expect(p.step).toBe(m.steps.length);
  });

  it('starts from the tutorial, follows the player into the game, and ticks the first step', () => {
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start practice: Your first pull' }));
    const coach = screen.getByRole('region', { name: 'Practice mission' });
    expect(within(coach).getByText('0/4')).toBeTruthy();
    act(() => { fireEvent.click(screen.getByRole('button', { name: /DYNO/ })); });
    expect(within(screen.getByRole('region', { name: 'Practice mission' })).getByText('1/4')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Practice mission' })).getByRole('button', { name: 'STOP PRACTICE' }));
    expect(screen.queryByRole('region', { name: 'Practice mission' })).toBeNull();
  });
});
