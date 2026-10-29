/**
 * DYNO > PULL LOG (event list for the last pull).
 *
 * `result` is plain session state with one reader — this screen — so it is read
 * straight off the store rather than threaded down as a prop.
 */

import React, { useEffect, useRef } from 'react';

import { AlertTriangle, ArrowUpRight } from 'lucide-react';

import { LOAD } from '../../../sim/index.js';
import { Eyebrow } from '../../primitives/Eyebrow.jsx';
import { useSession } from '../../state/StoreProvider.jsx';
import { coversRpm, eventTone } from '../../components/eventBands.js';
import { fixLinks } from '../../components/fixLinks.js';
import { fixStep, groupByCause } from '../../components/fixOrder.js';

import styles from './LogScreen.module.css';

/**
 * The screens a fix names, as links.
 * @param {{fix?: string}} props
 */
function EventLinks({ fix }) {
  const links = fixLinks(fix);
  if (!links.length) return null;
  return (
    <div className={styles.eventLinks} data-tour="log-links">
      {links.map((l) => (
        <a key={l.href} href={l.href} className={styles.eventLink}>
          {l.label}<ArrowUpRight size={12} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

/**
 * @param {object} props
 * @param {{ri: number, ci: number}[]} [props.flagged] the cells TUNE's advisor says are past the
 *   knock limit that this pull did not run (`cellsNotRunBy`). A pull only runs the tables along
 *   its own load, so a clean pull and a flagged cell are both true; the log says so rather than
 *   leaving the two screens to contradict.
 * @returns {React.ReactElement}
 */
export function LogScreen({ flagged = [] }) {
  const [session] = useSession();
  const { result, logFocusRpm } = session;

  // The spec's own words: a chart-band click "highlights every event whose span covers
  // that RPM and scrolls the first into view." Landing on an off-screen highlight with
  // no scroll defeats the reason click-through exists — a bad tune can emit five or six
  // events, and the log is longer than the viewport well before that.
  const firstFocusedRef = useRef(null);
  useEffect(() => {
    if (logFocusRpm == null) return;
    firstFocusedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [logFocusRpm]);

  let firstFocusedSeen = false;

  return (
    <>
      <Eyebrow icon={AlertTriangle}>Pull Log</Eyebrow>
      {result.events.length === 0 ? (
        <div className={styles.clean}>
          Clean pull — no knock, fueling, or trim issues across the sweep.
          {flagged.length > 0 && (() => {
            const loads = [...new Set(flagged.map((c) => LOAD[c.ri]))].sort((a, b) => b - a);
            return (
              <div className={styles.cleanNote} data-testid="log-flagged-elsewhere">
                This pull ran at {result.loadKpa ?? session.loadKpa} kPa. TUNE still flags {flagged.length} spark cell{flagged.length === 1 ? '' : 's'} past
                the knock limit at {loads.join(' and ')} kPa, which a pull at that load will test.{' '}
                {fixLinks('TUNE › SPARK').map((l) => <a key={l.href} href={l.href} className={styles.eventLink}>{l.label}</a>)}
              </div>
            );
          })()}
        </div>
      ) : (
        <div className={styles.events}>
          {result.events.length > 1 && (
            <div className={styles.order} data-testid="log-order">
              Grouped by cause, in the order a tuner fixes them: setup, then fuel, then spark, then boost. Each entry is a cause and the symptoms it produced; fix the top one and pull again, and what it caused clears with it.
            </div>
          )}
          {groupByCause(result.events).map(({ root: e, effects }, i) => {
            const step = fixStep(e.type);
            const tone = eventTone(e);
            // Focus is per entry: the cause's card, or a symptom under it. The first entry
            // covering the focused RPM, in reading order, is the one scrolled to.
            const focused = coversRpm(e, logFocusRpm);
            const refFor = (on) => {
              if (!on || firstFocusedSeen) return undefined;
              firstFocusedSeen = true;
              return firstFocusedRef;
            };
            const ref = refFor(focused);
            return (
              <div
                key={i}
                ref={ref}
                className={styles.event}
                data-tone={tone}
                data-focused={String(focused)}
              >
                <div className={styles.eventHead} data-tour="log-title">
                  <div className={styles.eventTitle}>
                    <AlertTriangle size={14} className={styles.eventIcon} />
                    <span>
                      <span className={styles.eventStep} data-step={step.id}>{step.index} · {step.label}</span>
                      {e.msg}
                    </span>
                  </div>
                  {e.impact != null && <span className={styles.eventImpact}>-{e.impact}</span>}
                </div>
                {e.cause && <div className={styles.eventCause} data-tour="log-why"><b className={styles.eventLabel}>Why: </b>{e.cause}</div>}
                {e.fix && <div className={styles.eventFix} data-tour="log-try"><b className={styles.eventLabel}>Try: </b>{e.fix}</div>}
                {/* Crosslinks: the screens the fix names, one tap away rather than found
                    by name. */}
                <EventLinks fix={e.fix} />
                {/* What this cause also produced in the same part of the pull. Read on its
                    own each would send the player somewhere else; it clears with the fix
                    above, and its own detail is there for when it does not. */}
                {effects.length > 0 && (
                  <div className={styles.effects} data-testid="log-effects">
                    <div className={styles.effectsHead}>Caused by this, and cleared by the same fix:</div>
                    {effects.map((x, j) => (
                      <details key={j} ref={refFor(coversRpm(x, logFocusRpm))} className={styles.effect} data-tone={eventTone(x)} data-focused={String(coversRpm(x, logFocusRpm))}>
                        <summary>
                          <span className={styles.eventStep} data-step={fixStep(x.type).id}>{fixStep(x.type).label}</span>
                          {x.msg}
                          {x.impact != null && <span className={styles.eventImpact}> -{x.impact}</span>}
                        </summary>
                        {x.cause && <div className={styles.eventCause}><b className={styles.eventLabel}>Why: </b>{x.cause}</div>}
                        {x.fix && <div className={styles.eventFix}><b className={styles.eventLabel}>If it is still there after the fix above: </b>{x.fix}</div>}
                        <EventLinks fix={x.fix} />
                      </details>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
