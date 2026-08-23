/**
 * DYNO > PULL LOG (event list for the last pull).
 *
 * `result` is plain session state with one reader — this screen — so it is read
 * straight off the store rather than threaded down as a prop.
 */

import React from 'react';

import { AlertTriangle } from 'lucide-react';

import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { useSession } from '../../state/StoreProvider.jsx';

import styles from './LogScreen.module.css';

/**
 * @returns {React.ReactElement}
 */
export function LogScreen() {
  const [session] = useSession();
  const { result } = session;

  return (
    <>
      <Eyebrow icon={AlertTriangle}>Pull Log</Eyebrow>
      {result.events.length === 0 ? (
        <div className={styles.clean}>
          Clean pull — no knock, fueling, or trim issues across the sweep.
        </div>
      ) : (
        <div className={styles.events}>
          {result.events.map((e, i) => {
            // The tone comes from the severity the sim already assigns, not from a
            // hand-kept list of type names. Those lists named eleven of the twelve
            // types `src/sim` emits: `bearing` matched none of them and fell through
            // to the chart-series cyan, so the one warning about accumulating
            // bottom-end stress rendered as decoration while `pressure`, its acute
            // sibling, rendered red. Deriving it means a thirteenth event type gets a
            // tone the day it is added instead of silently becoming a chart colour.
            //
            // `maf` is the one genuine special case: it is a calibration observation
            // rather than damage, and violet is the token reserved for that.
            const isViolet = e.type === 'maf';
            const isDanger = !isViolet && e.severity >= 3;
            const isWarn = !isViolet && !isDanger;
            const tone = isDanger ? 'danger' : isWarn ? 'warn' : isViolet ? 'violet' : 'default';
            return (
              <div key={i} className={styles.event} data-tone={tone}>
                <div className={styles.eventHead}>
                  <div className={styles.eventTitle}>
                    <AlertTriangle size={14} className={styles.eventIcon} />
                    <span>{e.msg}</span>
                  </div>
                  {e.impact != null && <span className={styles.eventImpact}>-{e.impact}</span>}
                </div>
                {e.cause && <div className={styles.eventCause}><b className={styles.eventLabel}>Why: </b>{e.cause}</div>}
                {e.fix && <div className={styles.eventFix}><b className={styles.eventLabel}>Try: </b>{e.fix}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
