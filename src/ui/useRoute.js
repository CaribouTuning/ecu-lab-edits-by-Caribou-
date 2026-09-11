/**
 * The one place the app talks to `window.location`.
 *
 * `routing.js` is pure — it converts a hash string to a route object and back and
 * never touches the DOM. This hook is the other half: it holds the current route as
 * React state, keeps that state and `location.hash` in step, and hands back a
 * `navigate` for changing both at once.
 *
 * Three details are load-bearing, and each one is a bug that only shows up in a
 * situation the obvious implementation never reaches:
 *
 * 1. **The hash is read during the first render**, not only in response to a
 *    `hashchange`. A deep link is a cold load — there is no navigation to react to —
 *    so a hook that only listens shows the start screen for `#/tune/timing` and looks
 *    like the feature was never built rather than like a bug.
 *
 * 2. **`navigate` sets React state synchronously** and writes the hash as a side
 *    effect, rather than writing the hash and waiting to be told about it.
 *    `hashchange` is dispatched from a queued task, not synchronously from the
 *    assignment (true in browsers and in jsdom), so a listener-only hook renders one
 *    frame — and, in a test, one whole synchronous assertion — behind every click.
 *
 * 3. **`navigate` skips the write when the target is where we already are.**
 *    Assigning an unchanged `location.hash` is a no-op, but assigning a differently
 *    spelled hash for the SAME route (`#/dash/` for `#/dash`) is a real history
 *    entry, and a stack of those turns the back button into a control that visibly
 *    does nothing. The comparison is therefore between routes, not strings: the
 *    current hash is parsed and re-formatted before it is compared to the target.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { formatRoute, parseRoute } from './routing.js';

/** @typedef {import('./routing.js').Route} Route */

/**
 * The live hash, or `''` where there is no `window` (SSR, node-environment tests).
 * @returns {string}
 */
function readHash() {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

/**
 * Drive the app's navigation from `window.location.hash`.
 *
 * Returns a `[route, navigate]` tuple, matching the shape of this codebase's store
 * hooks (`useBuild`, `useTune`, `useSession`) so call sites read the same way.
 *
 * `navigate` is referentially stable for the lifetime of the component, so it is safe
 * in a dependency array and safe to pass to a memoized child.
 *
 * @returns {[Route, (next: Route) => void]}
 */
export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(readHash()));

  // The route we last put into state, in its canonical hash spelling, kept in a ref
  // so the `hashchange` listener can compare against it without being re-subscribed
  // on every route change. `setRoute` is called from exactly two places — `sync` and
  // `navigate`, both below — and both update this alongside it, so it cannot drift.
  const currentRef = useRef(formatRoute(route));

  useEffect(() => {
    /** Adopt whatever the URL currently says, if it differs from what we render. */
    const sync = () => {
      const next = formatRoute(parseRoute(readHash()));
      if (next === currentRef.current) return;
      currentRef.current = next;
      setRoute(parseRoute(next));
    };

    // Re-read on mount. The initial `useState` already read the hash during render,
    // but a hash set between that render and this effect (React 18 StrictMode
    // double-invokes, and a sibling effect can navigate) would otherwise be missed.
    sync();

    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((/** @type {Route} */ next) => {
    const target = formatRoute(next);
    if (target === currentRef.current) {
      // Already here. Neither a re-render nor a history entry: this is the
      // "clicked the tab you are already on" path, and it must be inert.
      return;
    }
    currentRef.current = target;
    setRoute(parseRoute(target));
    if (typeof window !== 'undefined' && formatRoute(parseRoute(window.location.hash)) !== target) {
      window.location.hash = target;
    }
  }, []);

  return [route, navigate];
}

export default useRoute;
