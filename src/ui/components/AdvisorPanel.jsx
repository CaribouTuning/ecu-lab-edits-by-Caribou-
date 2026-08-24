/**
 * The advisor surface for TUNE's grid screens: a right-hand rail on anything
 * wider than a phone, a tap-to-open disclosure below that.
 *
 * Chrome only. It holds no opinion about tuning — `TuneAdvisory` supplies the
 * body and `advisorReports.js` decides what that body says. Split that way so
 * the responsive mechanics can be tested without fabricating advice objects.
 *
 * Reads no store. The store is one context and every consumer re-renders on
 * every dispatch, `LIVE_STEP` at 20Hz included, so this takes props and is
 * memoised — the panel re-renders when the selection or the advice changes and
 * not when the engine ticks.
 */

import React, { useState } from 'react';

import { ChevronDown } from 'lucide-react';

import styles from './AdvisorPanel.module.css';

/**
 * @param {object} props
 * @param {string} props.headline plain text; the only thing visible while collapsed
 * @param {'ok'|'warn'|'danger'|'info'} props.tone
 * @param {React.ReactNode} props.children
 * @returns {React.ReactElement}
 */
function AdvisorPanelImpl({ headline, tone, children }) {
  // Open state is deliberately NOT width-aware. At >=560px the stylesheet shows
  // the body unconditionally and hides the toggle, so this flag only governs the
  // narrow layout. Doing it in CSS keeps 560px out of the JavaScript, where it
  // would be a second copy of the breakpoint that tokens.css could not track.
  const [open, setOpen] = useState(false);

  return (
    <section
      aria-label="Advisor"
      className={styles.panel}
      data-testid="advisor-panel"
      data-open={open ? 'true' : 'false'}
      data-tone={tone}
    >
      <div className={styles.head}>
        <span className={styles.eyebrow}>ADVISOR</span>
        <span className={styles.headline}>{headline}</span>
        <ChevronDown size={15} className={styles.chevron} aria-hidden="true" />
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open ? 'true' : 'false'}
          aria-label={open ? 'Hide advisor detail' : 'Show advisor detail'}
          onClick={() => setOpen((v) => !v)}
        />
      </div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export const AdvisorPanel = React.memo(AdvisorPanelImpl);
