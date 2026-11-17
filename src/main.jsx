/**
 * Application entry point.
 *
 * Deliberately thin: mount the app inside an error boundary and get out of the way.
 */

import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import './ui/tokens.css';
import './ui/sketch.css';

import EcuLab from './ui/EcuLab.jsx';
import { ErrorBoundary } from './ui/ErrorBoundary.jsx';
import { parseRoute } from './ui/routing.js';
import { StartScreen } from './ui/screens/StartScreen.jsx';
import { BUILD_VERSION } from './version.js';
import { trackVisibleHeight } from './ui/visibleHeight.js';

trackVisibleHeight();

/**
 * The start screen first, then the app. The app's store solves the default engine's breathing
 * as it mounts (a few seconds on a phone), which the start screen does not need: it is drawn
 * at once, the app mounts behind the first frame, and a way in tapped meanwhile is handed on.
 * @returns {React.ReactElement}
 */
function Boot() {
  const atStart = parseRoute(window.location.hash).view === 'start';
  const [ready, setReady] = useState(!atStart);
  const [held, setHeld] = useState(/** @type {'career'|'sandbox'|'tutorial'|null} */ (null));
  useEffect(() => {
    if (ready) return undefined;
    // After the start screen is on screen: the second frame's callback runs once the first has
    // been drawn, then the app (one frame was not enough: the app's mount held the first back).
    let f = 0;
    let t = 0;
    f = requestAnimationFrame(() => { f = requestAnimationFrame(() => { t = window.setTimeout(() => setReady(true), 0); }); });
    return () => { cancelAnimationFrame(f); clearTimeout(t); };
  }, [ready]);
  if (!ready) {
    const go = (w) => () => { setHeld(w); setReady(true); };
    return <StartScreen onCareer={go('career')} onStart={go('sandbox')} onTutorial={go('tutorial')} version={BUILD_VERSION} />;
  }
  return <EcuLab blankStart startWith={held} startShown={atStart} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Boot />
    </ErrorBoundary>
  </React.StrictMode>,
);
