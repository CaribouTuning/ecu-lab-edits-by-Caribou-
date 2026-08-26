/**
 * DYNO > CURVES (power/torque and AFR/timing traces for the last pull).
 *
 * This is the one DYNO section that also renders WHILE a pull is running — the
 * shell gates it on `running || dynoView === 'result'`, not just the section id,
 * so the player watches the sweep draw live rather than staring at a switcher.
 * That gate lives in EcuLab.jsx, not here: this component only ever renders when
 * it should be visible.
 *
 * `chartData` is the shell's — EcuScreen's own FUEL TRIM chart reads the same
 * memo, so it stays a shell-level computation rather than being repeated per
 * screen. `engineDerived` is the shell's for the same reason (the header's engine
 * label, the audio effect and BUILD's Engine Architecture screen all read it
 * too); `dynoChartMaxRpm` itself has exactly one reader — this screen's two chart
 * axes — so it is computed here off the `engineDerived` prop rather than
 * threaded down as its own value.
 */

import React from 'react';

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Panel } from '../../primitives/Panel.jsx';
import { useSession } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

import styles from './ResultScreen.module.css';

/**
 * @param {object} props
 * @param {Array<object>} props.chartData the shell's, shared with TUNE's ECU screen
 * @param {{redline: number}} props.engineDerived the shell's — see file header
 * @returns {React.ReactElement}
 */
export function ResultScreen({ chartData, engineDerived }) {
  const [session] = useSession();
  const { prevResult } = session;
  // The live tach needle and this chart's RPM axis both used to top out at a
  // hardcoded 7500 — correct only for the one preset whose redline happened to
  // match it. 1.05x redline gives the sweep's last point a little headroom
  // without the axis running away for a low-redline build.
  const dynoChartMaxRpm = engineDerived.redline * 1.05;

  return (
    <>
      <Panel tight className={styles.panel}>
        <div className={styles.chartLabel}>POWER &amp; TORQUE</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={T.line} />
            <XAxis dataKey="rpm" stroke={T.ink3} fontSize={10} type="number" domain={[1500, dynoChartMaxRpm]} />
            <YAxis stroke={T.ink3} fontSize={10} />
            <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.line}`, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {prevResult && <Line dataKey="prevHp" name="Prev WHP" stroke={T.ink3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
            {prevResult && <Line dataKey="prevTorque" name="Prev TQ" stroke={T.ink3} strokeDasharray="4 3" dot={false} isAnimationActive={false} />}
            <Line dataKey="hp" name="WHP" stroke={T.acc} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="torque" name="Torque" stroke={T.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <Panel tight className={styles.panel}>
        <div className={styles.chartLabel}>AFR (COMMANDED VS ACTUAL) / TIMING</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={T.line} />
            <XAxis dataKey="rpm" stroke={T.ink3} fontSize={10} type="number" domain={[1500, dynoChartMaxRpm]} />
            <YAxis stroke={T.ink3} fontSize={10} />
            <Tooltip contentStyle={{ background: T.panel2, border: `1px solid ${T.line}`, fontSize: 11 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="afrCommanded" name="AFR commanded" stroke={T.ink3} strokeDasharray="3 3" dot={false} isAnimationActive={false} />
            {/* Series identity colours, not status: both lines are on screen for
                every pull, so green and amber here reported a health this chart
                never measures. */}
            <Line dataKey="afr" name="AFR actual" stroke={T.cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="timing" name="Timing used" stroke={T.violet} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>
    </>
  );
}
