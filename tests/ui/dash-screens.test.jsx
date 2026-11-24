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

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LearnScreen } from '../../src/ui/screens/dash/LearnScreen.jsx';
import { LiveEcuPanel } from '../../src/ui/screens/dash/LiveEcuPanel.jsx';
import { LiveBars } from '../../src/ui/desk/BenchScreens.jsx';
import { StandConsole, StandStatus } from '../../src/ui/desk/Consoles.jsx';
import { INJECTOR_OPTS } from '../../src/sim/index.js';
import { makeLiveState } from '../../src/sim/live.js';
import { ACTIONS } from '../../src/ui/state/reducer.js';
import { StoreProvider, useBuild, useSession } from '../../src/ui/state/StoreProvider.jsx';

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


describe('the engine stand\'s controls', () => {
  // The stand's control box is the only place the engine is started and revved: its
  // console reads the live engine off the store, never off a prop.
  const stand = (o = {}) => (
    <>
      <StandStatus />
      <StandConsole onStart={noop} onStop={noop} onToggleSound={noop} onTestSound={noop} onThrottle={noop} {...o} />
    </>
  );

  it('reads the live engine off the store rather than off a prop', () => {
    mount(stand());
    // The engine's own state machine, straight from `session.live`: nothing above this
    // component told it the engine was off.
    expect(screen.getByText('Engine off')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start engine' })).toBeTruthy();
    expect(screen.getByText('Start the engine first')).toBeTruthy();
  });

  it('opens and closes the throttle through the shell, which owns the ref the loop reads', () => {
    const onThrottle = vi.fn();
    mount(stand({ onThrottle }));
    const lever = screen.getByRole('button', { name: 'Throttle, press and hold' });
    fireEvent.pointerDown(lever);
    fireEvent.pointerUp(lever);
    expect(onThrottle.mock.calls.slice(0, 2)).toEqual([[100], [0]]);
  });

  it('a failed engine will not turn over: START is disabled and says why', () => {
    const onStart = vi.fn();
    mount(stand({ onStart, failed: true }));
    const start = screen.getByRole('button', { name: 'Engine failed' });
    expect(/** @type {HTMLButtonElement} */ (start).disabled).toBe(true);
    fireEvent.click(start);
    expect(onStart).not.toHaveBeenCalled();
  });
});

describe('the stand\'s injector duty with a staged port kit (#166)', () => {
  /** Mounts the stand's bars with `live.live` already holding a reading, as the engine loop would. */
  function mountReading(reading) {
    /** @type {Function} */
    let dispatch;
    const Capture = () => {
      const [, d] = useSession();
      dispatch = d;
      return null;
    };
    const node = <LiveBars fullScaleRpm={7500} redline={7000} />;
    const utils = render(<StoreProvider><Capture /></StoreProvider>);
    act(() => dispatch({
      type: ACTIONS.SET_SESSION_FIELD,
      field: 'live',
      value: { ...makeLiveState(), running: true, live: { timing: 12, knock: false, ...reading } },
    }));
    utils.rerender(<StoreProvider><Capture />{node}</StoreProvider>);
    return utils;
  }
  const meter = (label) => screen.getByText(label).parentElement.textContent;

  it('reads the port bank\'s duty when it is the busier one', () => {
    mountReading({ pw: 2.4, duty: 20, portPw: 17.7, portDuty: 96 });
    expect(meter('Injector duty')).toContain('96');
  });

  it('reads the direct bank when there is no kit (the port fields are zero)', () => {
    mountReading({ pw: 6.1, duty: 42, portPw: 0, portDuty: 0 });
    expect(meter('Injector duty')).toContain('42');
  });
});

describe('LiveEcuPanel data-log channels', () => {
  function FitKit() {
    const [, dispatch] = useBuild();
    return (
      <button type="button" onClick={() => {
        dispatch({ type: ACTIONS.SET_ENGINE_CONFIG_PATCH, patch: { injection: 'direct' } });
        dispatch({ type: ACTIONS.SET_BUILD_FIELD, field: 'portKit', value: { injIdx: INJECTOR_OPTS.findIndex((o) => o.cc === 1300), ecuInjectorCc: 1300 } });
      }}>fit kit</button>
    );
  }

  it('offers the port kit channels only once a kit is fitted', () => {
    mount(<><FitKit /><LiveEcuPanel /></>);
    expect(screen.queryByRole('button', { name: 'Port kit pulse width' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Port kit duty' })).toBeNull();
    fireEvent.click(screen.getByText('fit kit'));
    expect(screen.getByRole('button', { name: 'Port kit pulse width' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Port kit duty' })).toBeTruthy();
  });
});

describe('LearnScreen', () => {
  it('renders the guide with no store read at all', () => {
    // Deliberately NOT wrapped in a store: this screen is constant, and a store read
    // creeping into it is exactly what would put it back in the 20 Hz re-render path.
    render(<LearnScreen active onToggle={noop} />);
    expect(screen.getByText('Part 1: Fundamentals')).toBeTruthy();
    expect(screen.getByText('Part 3: The tuning process')).toBeTruthy();
  });

  it('is memoised, so a live-engine tick does not walk all thirty-nine articles', () => {
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

describe('the Learn guide', () => {
  it('opens its maths part with the reference build\'s plain-English symbol key', () => {
    render(<LearnScreen active onToggle={() => {}} />);
    expect(screen.getByText('Symbol key — plain-English version')).toBeTruthy();
  });

  it('explains what the dyno\'s two numbers are before its reading list', () => {
    render(<LearnScreen active onToggle={() => {}} />);
    expect(screen.getByText('32. Horsepower and torque: two views of one number')).toBeTruthy();
    expect(screen.getByText('33. Further reading on engine management')).toBeTruthy();
    expect(screen.getByText('34. What this simulator simplifies')).toBeTruthy();
  });
});
