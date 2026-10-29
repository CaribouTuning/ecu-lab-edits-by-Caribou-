/**
 * LIVE's readouts — the engine running in real time: every sensor the scan tool reads,
 * the two fuel trims, and what the ECU is doing (`liveStatus`). The controls are the
 * engine stand's own (desk/Consoles.jsx `StandConsole`).
 *
 * THIS IS 20 Hz MARKUP. `session.live` is rewritten twenty times a second by the
 * LIVE_STEP action, and every one of those writes re-renders what reads it. That is
 * the point of it being its own file: nothing that reads `live` is allowed to move up
 * into a parent that renders anything else, or that would re-render at 20 Hz too.
 */

import React from 'react';

import { clamp } from '../../../sim/index.js';
import { useSession } from '../../state/StoreProvider.jsx';
import { T } from '../../theme.js';

import styles from './LiveScreen.module.css';

/**
 * One sensor readout. Local to this screen: the live panel is the only place in the
 * app that shows a raw, noisy, lagged sensor value rather than a computed figure.
 *
 * `color` is the caller's, because it says which QUANTITY this is — airflow is the
 * chart's cyan, lambda its violet — so it stays an inline value rather than a class.
 * `warn` is a state, so it is a data attribute the stylesheet reads.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} props.unit
 * @param {string} [props.color]
 * @param {boolean} [props.warn] the reading is outside its safe range
 * @returns {React.ReactElement}
 */
function LiveGauge({ label, value, unit, color = T.ink, warn }) {
  return (
    <div className={styles.gauge} data-warn={warn ? 'true' : 'false'}>
      <div className={styles.gaugeLabel}>{label}</div>
      <div className={styles.gaugeValue} style={{ color: warn ? T.danger : color }}>
        {value}<span className={styles.gaugeUnit}>{unit}</span>
      </div>
    </div>
  );
}

/**
 * A fuel trim, drawn as a deviation either side of centre.
 *
 * Not `Bar`: a trim is signed and its zero is the middle of the track, where Bar
 * measures a 0..max quantity from the left edge.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {number} props.value percent, positive means the ECU is adding fuel
 * @returns {React.ReactElement}
 */
function TrimBar({ label, value }) {
  const pct = clamp((value + 25) / 50, 0, 1) * 100;
  const c = Math.abs(value) > 15 ? T.danger : Math.abs(value) > 8 ? T.warn : T.ok;
  return (
    <div className={styles.trim}>
      <div className={styles.trimHead}>
        <span>{label}</span><span className={styles.trimValue} style={{ color: c }}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
      <div className={styles.trimTrack}>
        <div className={styles.trimCentre} />
        <div className={styles.trimFill} style={{ left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%`, background: c }} />
      </div>
    </div>
  );
}

/**
 * What the ECU is doing right now, in a sentence: LIVE's status line, and the engine
 * stand's computer's.
 * @param {Record<string, any>} live the session's live engine
 * @returns {string}
 */
export function liveStatus(live) {
  if (live.cranking && !live.running) return 'Starter engaged…';
  if (!live.running) return 'Engine off. Start it to watch the ECU work in real time.';
  if (live.limiterCut || live.onLimiter) return 'On the rev limiter. The ECU is cutting cylinders to hold the engine at its limit. With a fuel cut those cylinders pump plain air, so the wideband reads lean here though the mixture is not.';
  if (live.dfco) return 'Overrun fuel cut: the injectors are off while it coasts down. Real ECUs do this, and it costs nothing.';
  if (live.ecu?.knockNow) return `Knock. Your spark table asks for more advance than the engine tolerates at this speed and boost. The ECU is pulling ${(live.ecu.knockRetard ?? 0).toFixed(1)}° to protect it; take timing out of that part of the table.`;
  if ((live.ecu?.knockRetard ?? 0) > 0.5) return `Nothing is knocking now. The ECU is still giving back ${live.ecu.knockRetard.toFixed(1)}° it pulled for knock a moment ago, a little each second.`;
  if (live.coolantC < 80) return 'Warming up: the ECU adds fuel until the coolant reaches 80 °C.';
  if (live.closedLoop) return 'Warm and in closed loop: the ECU trims fuel against the O2 sensor.';
  return 'Open loop: the ECU follows your tables and ignores the O2 sensor.';
}

/**
 * Every sensor the scan tool reads, and the two fuel trims.
 * @returns {React.ReactElement}
 */
export function LiveGauges() {
  const [session] = useSession();
  const live = /** @type {Record<string, any>} */ (session.live);
  const engineOff = !live.running && !live.cranking;
  return (
    <>
      <div className={`${styles.gaugeRow} ${styles.gaugeRowFirst}`}>
        <LiveGauge label="MAF" value={live.sensedMaf.toFixed(1)} unit="g/s" color={T.cyan} />
        <LiveGauge label="MAP" value={Math.round(live.sensedMap)} unit="kPa" />
        <LiveGauge label="IAT" value={Math.round(live.sensedIat)} unit="°C" warn={live.sensedIat > 65} />
      </div>
      <div className={styles.gaugeRow}>
        {/* With the engine off nothing is burning, so there is no mixture, no fuel state and no
            idle-air trim to read: a "1.00 λ" or "FUEL ON" on a dead engine is a reading nobody took. */}
        <LiveGauge label="Lambda" value={engineOff ? '—' : live.sensedLambda.toFixed(2)} unit={engineOff ? '' : 'λ'} color={T.violet} />
        <LiveGauge label="Coolant" value={Math.round(live.sensedCoolant)} unit="°C" warn={live.sensedCoolant > 105} />
        <LiveGauge label="Spark timing" value={live.live ? live.live.timing : '—'} unit="°" warn={!!(live.live && (live.ecu ? live.ecu.knockNow : live.live.knock))} />
      </div>
      <div className={styles.gaugeRow}>
        <LiveGauge label="Injector pulse" value={live.live ? live.live.pw : '—'} unit="ms" />
        <LiveGauge label="Injector duty" value={live.live ? live.live.duty : '—'} unit="%" warn={!!(live.live && live.live.duty > 90)} />
        <LiveGauge label="Idle air" value={engineOff ? '—' : Math.round(live.idleTrim)} unit={engineOff ? '' : '%'} />
        <LiveGauge label="Fuel" value={engineOff ? 'off' : live.fuelCut ? 'cut' : 'on'} unit="" color={engineOff ? T.ink2 : live.fuelCut ? T.warn : T.ok} />
      </div>

      <div className={styles.trims}>
        <TrimBar label="Short-term fuel trim" value={live.stft} />
        <TrimBar label="Long-term fuel trim" value={live.ltft} />
      </div>
    </>
  );
}
