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
import { T } from '../../theme.js';

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
        <div style={{ fontSize: 12.5, color: T.ok, background: T.okBg, border: `1px solid ${T.okLine}`, borderRadius: 10, padding: 12 }}>
          Clean pull — no knock, fueling, or trim issues across the sweep.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            const bg = isDanger ? T.dangerBg : isWarn ? T.warnBg : isViolet ? T.violetBg : T.panel2;
            const bd = isDanger ? T.dangerLine : isWarn ? T.warnLine : isViolet ? T.violetLine : T.line;
            const fg = isDanger ? T.dangerInk : isWarn ? T.warnInk : isViolet ? T.violet : T.cyan;
            return (
              <div key={i} style={{ padding: '11px 12px', borderRadius: 10, background: bg, border: `1px solid ${bd}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: 12.5, fontWeight: 700, color: fg }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>{e.msg}</span>
                  </div>
                  {e.impact != null && <span style={{ fontSize: 11, fontFamily: T.mono, fontWeight: 800, color: fg, flexShrink: 0 }}>-{e.impact}</span>}
                </div>
                {e.cause && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 6, paddingLeft: 22 }}><b style={{ color: T.inkSoft }}>Why: </b>{e.cause}</div>}
                {e.fix && <div style={{ fontSize: 11.5, color: T.ink2, marginTop: 4, paddingLeft: 22 }}><b style={{ color: T.inkSoft }}>Try: </b>{e.fix}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
