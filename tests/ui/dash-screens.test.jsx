// @vitest-environment jsdom

/**
 * The four HOME screens, mounted on their own.
 *
 * `characterisation.test.jsx` and `session-store.test.jsx` already drive all of this
 * through the whole app, and they are the tests that say HOME still works. What they
 * cannot say is whether a screen is INDEPENDENT of the shell: every one of them
 * renders EcuLab, so a screen that had quietly kept reading a value the shell passes
 * down would look identical from there.
 *
 * These mount each screen with nothing but a store around it. A screen that needs the
 * shell to render fails here and only here — which is the property the split exists to
 * create, and the one a later extraction is most likely to erode.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthScreen } from '../../src/ui/screens/dash/HealthScreen.jsx';
import { LearnScreen } from '../../src/ui/screens/dash/LearnScreen.jsx';
import { LiveScreen } from '../../src/ui/screens/dash/LiveScreen.jsx';
import { StatsScreen } from '../../src/ui/screens/dash/StatsScreen.jsx';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useSession } from '../../src/ui/state/StoreProvider.jsx';

afterEach(cleanup);

/**
 * Mounts a screen with a real store and nothing else — no shell, no route, no props
 * beyond the ones a screen is allowed to be given.
 * @param {React.ReactElement} node
 * @returns {ReturnType<typeof render>}
 */
function mount(node) {
  return render(<StoreProvider>{node}</StoreProvider>);
}

const noop = () => {};

/**
 * Mounts a screen inside a store that already holds a dyno result — StatsScreen's
 * last-pull tiles are gated on `session.result`, which no prop can stand in for.
 * Same probe-then-rerender shape as `mountWithResult` in dyno-screens.test.jsx.
 * @param {React.ReactElement} node
 * @returns {ReturnType<typeof render>}
 */
function mountWithResult(node) {
  /** @type {Function} */
  let dispatch;
  const Capture = () => {
    const [, d] = useSession();
    dispatch = d;
    return null;
  };
  const utils = render(<StoreProvider><Capture /></StoreProvider>);
  act(() => dispatch({
    type: ACTIONS.SET_SESSION_FIELD,
    field: 'result',
    value: { points: [], events: [], peakHp: 111, peakTq: 222 },
  }));
  utils.rerender(<StoreProvider><Capture />{node}</StoreProvider>);
  return utils;
}

describe('LiveScreen', () => {
  it('reads the live engine off the store rather than off a prop', () => {
    mount(
      <LiveScreen
        active onToggle={noop} tachFullScaleRpm={7500}
        onStart={noop} onStop={noop} onToggleSound={noop} onThrottle={noop}
      />,
    );
    // The engine's own state machine, straight from `session.live`: nothing above this
    // component told it the engine was off.
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'START ENGINE' })).toBeTruthy();
    expect(screen.getByText('START THE ENGINE FIRST')).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    // Navigation is the shell's, so the screen's only job is to name itself. Getting
    // this wrong routes HOME to the wrong section, and every section still opens —
    // just never the one that was clicked.
    const onToggle = vi.fn();
    mount(
      <LiveScreen
        active={false} onToggle={onToggle} tachFullScaleRpm={7500}
        onStart={noop} onStop={noop} onToggleSound={noop} onThrottle={noop}
      />,
    );
    fireEvent.click(screen.getByText('Live Engine'));
    expect(onToggle).toHaveBeenCalledWith('live');
  });

  it('opens and closes the throttle through the shell, which owns the ref the loop reads', () => {
    const onThrottle = vi.fn();
    mount(
      <LiveScreen
        active onToggle={noop} tachFullScaleRpm={7500}
        onStart={noop} onStop={noop} onToggleSound={noop} onThrottle={onThrottle}
      />,
    );
    const pad = screen.getByText('START THE ENGINE FIRST').parentElement;
    fireEvent.pointerDown(pad);
    fireEvent.pointerUp(pad);
    expect(onThrottle.mock.calls).toEqual([[100], [0]]);
  });
});

describe('StatsScreen', () => {
  it('shows the career off the store, and says so when there is no pull to report', () => {
    mount(<StatsScreen active onToggle={noop} scores={null} />);
    expect(screen.getByText('BEST PULL')).toBeTruthy();
    expect(screen.getByText('CAREER TOTAL')).toBeTruthy();
    expect(screen.getByText(/No dyno pull logged yet/)).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<StatsScreen active={false} onToggle={onToggle} scores={null} />);
    fireEvent.click(screen.getByText('Career & Last Pull'));
    expect(onToggle).toHaveBeenCalledWith('stats');
  });

  // Fabricated figures, as in dyno-screens.test.jsx: no real scoring output for the
  // default engine lands on these.
  const scores = { pull: 4321, wasBest: true, tuning: { score: 91 }, engineer: { score: 12 } };

  it('heads the last-pull tiles plainly while they are still about the car on screen', () => {
    mountWithResult(<StatsScreen active onToggle={noop} scores={scores} />);
    expect(screen.getByText('LAST PULL')).toBeTruthy();
    expect(screen.queryByText(/HAS CHANGED/)).toBeNull();
  });

  it('says the build has changed rather than dropping the tiles or re-grading them', () => {
    // HOME has no room for a paragraph, so the heading IS the disclosure here. The
    // figures stay: they are the previous pull, which is the thing the player is
    // comparing against. What must never happen is showing them under a bare "LAST
    // PULL" as though they described the build now selected.
    mountWithResult(<StatsScreen active onToggle={noop} scores={scores} scoresStale />);
    expect(screen.getByText('LAST PULL · SETUP HAS CHANGED SINCE')).toBeTruthy();
    expect(screen.getByText('4321')).toBeTruthy();
  });
});

describe('HealthScreen', () => {
  it('meters the three components off the store', () => {
    mount(<HealthScreen active onToggle={noop} overallHealth={100} needsMafRecal={false} />);
    expect(screen.getAllByRole('meter')).toHaveLength(3);
    // The MAF warning belongs to the build, not to wear, so it is absent on a stock one.
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('raises the MAF warning when the shell says the plumbing moved', () => {
    mount(<HealthScreen active onToggle={noop} overallHealth={100} needsMafRecal />);
    expect(within(screen.getByRole('note')).getByText('FUEL')).toBeTruthy();
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    mount(<HealthScreen active={false} onToggle={onToggle} overallHealth={100} needsMafRecal={false} />);
    fireEvent.click(screen.getByText('Engine Health'));
    expect(onToggle).toHaveBeenCalledWith('health');
  });
});

describe('LearnScreen', () => {
  it('renders the guide with no store read at all', () => {
    // Deliberately NOT wrapped in a store: this screen is constant, and a store read
    // creeping into it is exactly what would put it back in the 20 Hz re-render path.
    render(<LearnScreen active onToggle={noop} />);
    expect(screen.getByText('PART 1 · FUNDAMENTALS')).toBeTruthy();
    expect(screen.getByText('PART 3 · THE TUNING PROCESS')).toBeTruthy();
  });

  it('is memoised, so a live-engine tick does not walk sixteen articles', () => {
    // A performance contract with no other observable effect: with the memo in place
    // React skips this subtree when its props have not changed, and without it there
    // is no rendered difference to assert on — only twenty needless passes a second
    // over the largest block of markup on the tab. Asserting the wrapper is the only
    // way to notice the memo being dropped.
    //
    // The memo is only worth anything while `onToggle` stays referentially stable; see
    // `toggleDashSection` in EcuLab.jsx, which is written the way it is for this.
    expect(LearnScreen.$$typeof).toBe(Symbol.for('react.memo'));
  });

  it('reports which section it is when its header is clicked', () => {
    const onToggle = vi.fn();
    render(<LearnScreen active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByText('Learn How It Works'));
    expect(onToggle).toHaveBeenCalledWith('learn');
  });
});
