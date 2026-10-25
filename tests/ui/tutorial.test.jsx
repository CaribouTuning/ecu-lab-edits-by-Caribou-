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
import { COURSE, TUTORIAL } from '../../src/ui/tutorial/books.js';
import { MISSIONS, advance, markOf } from '../../src/ui/tutorial/missions.js';
import { intakeFitted, intakeRetuned, overAdvanced, stock } from '../../src/ui/tutorial/scenarios.js';
import { LOAD } from '../../src/sim/index.js';
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
  render(<TutorialScreen book={book} onDone={() => {}} onPractice={() => {}} onCourse={() => {}} />);
  const nav = screen.getByRole('navigation', { name: `${book.title} contents` });
  fireEvent.click(within(nav).getByRole('button', { name: new RegExp(`^${book.lessons[i].number.replace('.', '\\.')} `) }));
};

describe('the tutorial is short', () => {
  it('takes five minutes at most: a handful of cards, not a course', () => {
    // The in-depth material is the Tuning Course's job. The tutorial is the way in, and
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

  it('ends by offering the course, or the game', () => {
    const onDone = vi.fn();
    const onCourse = vi.fn();
    render(<TutorialScreen onDone={onDone} onCourse={onCourse} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${TUTORIAL.lessons.length} `) }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the course' }));
    fireEvent.click(screen.getByRole('button', { name: 'START TUNING' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onCourse).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});

describe('from the tutorial to the course, in the app', () => {
  it('OPEN THE COURSE lands on the course\u2019s contents, not on the page the tutorial was showing', () => {
    render(<EcuLab />);
    fireEvent.click(screen.getByRole('button', { name: 'TUTORIAL' }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${TUTORIAL.lessons.length} `) }));
    fireEvent.click(screen.getByRole('button', { name: 'Open the course' }));
    expect(screen.getByText('Course contents')).toBeTruthy();
    expect(window.location.hash).toBe('#/course');
  });
});

describe('the Tuning Course', () => {
  const course = () => render(<TutorialScreen book={COURSE} onDone={() => {}} onPractice={() => {}} />);

  it('says what you will learn, what you need and how long, before lesson one', () => {
    course();
    expect(screen.getByText('Course contents')).toBeTruthy();
    expect(screen.getByText('You need')).toBeTruthy();
    const minutes = COURSE.chapters.reduce((m, c) => m + c.minutes, 0);
    expect(screen.getByText(new RegExp(`About ${minutes} minutes`))).toBeTruthy();
  });

  it('shows the end result first: the stock engine on the real dyno screen, with its real numbers', () => {
    course();
    const fig = screen.getByRole('figure', { name: 'Game screen: DYNO' });
    expect(fig.querySelector('[data-tour="dyno-power"]')).toBeTruthy();
    expect(within(fig).getByText(new RegExp(`${stock().result.peakHp} whp`))).toBeTruthy();
  });

  it('lists every lesson under its chapter, and ticks the ones read', () => {
    course();
    const nav = screen.getByRole('navigation', { name: 'The Tuning Course contents' });
    expect(within(nav).getAllByRole('button')).toHaveLength(COURSE.lessons.length);
    fireEvent.click(within(nav).getByRole('button', { name: /^1\.1 / }));
    fireEvent.click(screen.getByRole('button', { name: /CONTENTS/ }));
    expect(screen.getByRole('button', { name: /^1\.1 .*, read$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^1\.2 [^,]*$/ })).toBeTruthy();
  });

  it('picks up where the reader left off, separately from the tutorial', () => {
    const first = course();
    fireEvent.click(screen.getByRole('button', { name: /^2\.2 / }));
    first.unmount();
    course();
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE AT 2.2' }));
    expect(screen.getByRole('heading', { level: 1, name: /FUEL/ })).toBeTruthy();
    cleanup();
    render(<TutorialScreen onDone={() => {}} />);
    expect(screen.getByRole('button', { name: 'START' })).toBeTruthy();
  });

  it('marks the end of each chapter, and finishes back to Learn', () => {
    const onDone = vi.fn();
    render(<TutorialScreen book={COURSE} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /^1\.2 / }));
    expect(screen.getByRole('status').textContent).toMatch(/Chapter 1 complete/);
    fireEvent.click(screen.getByRole('button', { name: /CONTENTS/ }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${COURSE.lessons.at(-1).number.replace('.', '\\.')} `) }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO LEARN' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  ...TUTORIAL.lessons.map((l, i) => ['tutorial', TUTORIAL, l.number, l.title, i]),
  ...COURSE.lessons.map((l, i) => ['course', COURSE, l.number, l.title, i]),
])('%s %s, %s', (_b, book, _n, _t, i) => {
  it('opens, and points every callout at something that is really on its screen', () => {
    openLesson(book, i);
    const article = screen.getByRole('article');
    // The course's lessons carry the whole lesson shape; the tutorial's cards are short.
    if (book === COURSE) {
      expect(within(article).getByText('You will')).toBeTruthy();
      expect(within(article).getByText('What you just did')).toBeTruthy();
    }
    for (const fig of screen.queryAllByRole('figure')) {
      const name = fig.getAttribute('aria-label');
      expect({ name, missing: fig.getAttribute('data-callouts-missing') }).toEqual({ name, missing: '0' });
    }
  });
});

describe('a lesson’s screen is live', () => {
  it('APPLY HALF in lesson 4.2 changes the sandbox table and then asks for a new pull, as the game does', () => {
    openLesson(COURSE, COURSE.lessons.findIndex((l) => l.id === 've-from-logs'));
    const fig = screen.getByRole('figure', { name: 'Game screen: TUNE › AIRFLOW' });
    // The cells the intake pull logged: half the correction moves some of them by more
    // than the grid's displayed rounding (at 5500 RPM it is under one VE point).
    const cells = () => within(fig).getAllByRole('button', { name: / RPM, \d+(\.\d+)? kPa$/ }).map((b) => b.textContent).join('|');
    const before = cells();
    fireEvent.click(within(fig).getByRole('button', { name: 'Apply half' }));
    expect(cells()).not.toBe(before);
    const panel = within(fig).getByRole('region', { name: 'Correct VE from logs' });
    expect(within(panel).getByText(/before you changed VE table .* run another pull/)).toBeTruthy();
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

  it('each chapter-4 scenario says what the lesson says it does', () => {
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
    s = { ...s, tune: { ...s.tune, timing: s.tune.timing.map((r, ri) => (ri === WOT ? r.map((v) => v + 10) : r)) } };
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

  it('starts from the course, follows the player into the game, and ticks the first step', () => {
    render(<EcuLab />);
    enterSandbox();
    // The laptop's Learn app is where the course lives.
    goTo('LEARN');
    act(() => { window.location.hash = screen.getByRole('link', { name: /Open the course/ }).getAttribute('href'); window.dispatchEvent(new window.HashChangeEvent('hashchange')); });
    fireEvent.click(screen.getByRole('button', { name: 'Start practice: Your first pull' }));
    const coach = screen.getByRole('region', { name: 'Practice mission' });
    expect(within(coach).getByText('0/4')).toBeTruthy();
    // Each click inside `goTo` is its own act(): the route has to land between them.
    goTo('DYNO');
    expect(within(screen.getByRole('region', { name: 'Practice mission' })).getByText('1/4')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Practice mission' })).getByRole('button', { name: 'Stop practice' }));
    expect(screen.queryByRole('region', { name: 'Practice mission' })).toBeNull();
  });
});
