/**
 * HOME > Live Engine.
 *
 * The engine running in real time: tach, ECU state, sensor gauges and fuel trims.
 *
 * THIS IS THE 20 Hz SCREEN. `session.live` is rewritten twenty times a second by the
 * LIVE_STEP action, and every one of those writes re-renders this component. That is
 * the point of it being its own file: nothing that reads `live` is allowed to move up
 * into a parent that also renders the other three HOME sections, or all four would
 * re-render at 20 Hz to redraw three panels that did not change. The accordion
 * header's own subtitle counts — it shows live RPM — which is why this screen owns
 * its `BuildSection` rather than being handed one as children.
 */

import { Activity } from 'lucide-react';
import React from 'react';

import { clamp } from '../../../sim/index.js';
import { BuildSection } from '../../primitives/BuildSection.jsx';
import { Button } from '../../primitives/Button.jsx';
import { DialMark } from '../../primitives/DialMark.jsx';
import { ExpandableInfo } from '../../primitives/ExpandableInfo.jsx';
import { Panel } from '../../primitives/Panel.jsx';
import { useSession } from '../../state/StoreProvider.jsx';
import { T, accAlpha } from '../../theme.js';

/**
 * One sensor readout. Local to this screen: the live panel is the only place in the
 * app that shows a raw, noisy, lagged sensor value rather than a computed figure.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} props.unit
 * @param {string} [props.color]
 * @param {boolean} [props.warn] paint it as out of range
 * @returns {React.ReactElement}
 */
function LiveGauge({ label, value, unit, color = T.ink, warn }) {
  return (
    <div style={{ flex: 1, minWidth: 68, background: T.panel, border: `1px solid ${warn ? T.danger : T.line}`, borderRadius: 9, padding: '8px 9px' }}>
      <div style={{ fontSize: 8.5, color: T.ink2, letterSpacing: 0.8, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: T.mono, color: warn ? T.danger : color }}>
        {value}<span style={{ fontSize: 9, color: T.ink3, marginLeft: 2 }}>{unit}</span>
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
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: T.ink2, fontWeight: 700, marginBottom: 3 }}>
        <span>{label}</span><span style={{ color: c, fontFamily: T.mono }}>{value > 0 ? '+' : ''}{value.toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: T.panel, borderRadius: 3, position: 'relative', border: `1px solid ${T.line}` }}>
        <div style={{ position: 'absolute', left: '50%', top: -1, bottom: -1, width: 1, background: T.lineHi }} />
        <div style={{ position: 'absolute', left: `${Math.min(50, pct)}%`, width: `${Math.abs(pct - 50)}%`, top: 0, bottom: 0, background: c, borderRadius: 2 }} />
      </div>
    </div>
  );
}

/**
 * @param {object} props
 * @param {boolean} props.active whether this is HOME's open section
 * @param {(section: string) => void} props.onToggle opens or closes a HOME section
 * @param {number} props.tachFullScaleRpm redline plus the limiter's overshoot
 *   headroom. Derived from `engineConfig` in the shell because the dyno tach needs
 *   the same number — see the note on `tachFullScaleRpm` in EcuLab.jsx.
 * @param {() => void} props.onStart
 * @param {() => void} props.onStop
 * @param {() => void} props.onToggleSound
 * @param {(percent: number) => void} props.onThrottle driver throttle input, 0 or 100
 * @returns {React.ReactElement}
 */
export function LiveScreen({ active, onToggle, tachFullScaleRpm, onStart, onStop, onToggleSound, onThrottle }) {
  const [session] = useSession();
  const { soundOn, throttleInput } = session;
  // `SessionState.live` is typed `object` because the live model it holds is built in
  // src/sim/live.js, which has no typedef to point at and which this PR may not touch.
  // One cast here, named and explained, rather than a suppression on each of the
  // thirty reads below.
  const live = /** @type {Record<string, any>} */ (session.live);

  return (
    <BuildSection
      active={active} onClick={() => onToggle('live')}
      icon={Activity} label="Live Engine"
      sub={live.running ? `Running · ${Math.round(live.sensedRpm)} RPM · ${Math.round(live.coolantC)}°C` : live.cranking ? 'Cranking…' : 'Off'}
    >
      <Panel style={{ background: T.panel, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <DialMark size={104} pct={clamp(live.sensedRpm / tachFullScaleRpm, 0, 1)} live />
            <div style={{ position: 'absolute', top: '58%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 800, fontFamily: T.mono, color: live.fuelCut ? T.danger : T.ink }}>{Math.round(live.sensedRpm)}</div>
              <div style={{ fontSize: 7, color: T.ink3, letterSpacing: 1, fontWeight: 700 }}>RPM</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: T.ink2, marginBottom: 8, lineHeight: 1.5 }}>
              {live.running
                ? (live.limiterCut ? 'Rev limiter — fuel cut to protect the engine.'
                  : live.dfco ? 'Overrun fuel cut — injectors off while coasting down. Real ECUs do this; it costs nothing to spin.'
                  : live.coolantC < 70 ? 'Warming up — the ECU is running extra fuel until it reaches temperature.'
                  : live.closedLoop ? 'Warm and in closed loop — the ECU is trimming fuel against the O2 sensor.'
                  : 'Open loop — the ECU is following your tables directly, ignoring O2 feedback.')
                : live.cranking ? 'Starter engaged…' : 'Engine off. Start it to watch the ECU work in real time.'}
            </div>
            <div style={{ display: 'flex', gap: 7 }}>
              {/* START was filled with `ok`. Green here is decoration, not
                  state — the engine is not running when the button says
                  START — and spending a status colour on an action is the
                  rule Toggle's docstring closed. It takes the accent; STOP
                  is the secondary state and takes `ghost`. Not `danger`:
                  shutting an engine down destroys nothing. */}
              <Button
                variant={live.running || live.cranking ? 'ghost' : 'primary'}
                style={{ flex: 1 }}
                onClick={live.running || live.cranking ? onStop : onStart}
              >{live.running || live.cranking ? 'STOP' : 'START ENGINE'}</Button>
              <button onClick={onToggleSound} title="Engine sound" style={{
                width: 46, padding: '11px 0', borderRadius: 9, fontWeight: 800, fontSize: 13,
                border: `1px solid ${soundOn ? T.acc : T.line}`, background: soundOn ? T.accBg : T.panel2,
                color: soundOn ? T.accInk : T.ink3,
              }}>{soundOn ? '♪' : '✕'}</button>
            </div>
          </div>
        </div>

        <div
          onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); onThrottle(100); }}
          onPointerUp={() => onThrottle(0)}
          onPointerCancel={() => onThrottle(0)}
          style={{
            position: 'relative', overflow: 'hidden',
            marginTop: 12, padding: '18px 0', borderRadius: 12, textAlign: 'center', userSelect: 'none',
            WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
            border: `1px solid ${throttleInput > 0 ? T.acc : T.line}`,
            background: throttleInput > 0 ? T.accBg : T.panel2,
            color: throttleInput > 0 ? T.accInk : T.ink2, fontWeight: 800, fontSize: 13.5, letterSpacing: 0.5,
            touchAction: 'none', opacity: live.running ? 1 : 0.4,
            transition: 'background .1s, border-color .1s',
          }}
        >
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${clamp(live.effThrottle ?? 0, 0, 100)}%`,
            background: accAlpha(0.16), transition: 'width .12s',
          }} />
          <span style={{ position: 'relative' }}>
            {!live.running ? 'START THE ENGINE FIRST' : throttleInput > 0 ? 'WIDE OPEN THROTTLE' : 'PRESS AND HOLD TO REV'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <LiveGauge label="MAF" value={live.sensedMaf.toFixed(1)} unit="g/s" color={T.cyan} />
          <LiveGauge label="MAP" value={Math.round(live.sensedMap)} unit="kPa" />
          <LiveGauge label="IAT" value={Math.round(live.sensedIat)} unit="°C" warn={live.sensedIat > 65} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <LiveGauge label="LAMBDA" value={live.sensedLambda.toFixed(2)} unit="λ" color={T.violet} />
          <LiveGauge label="COOLANT" value={Math.round(live.sensedCoolant)} unit="°C" warn={live.sensedCoolant > 105} />
          <LiveGauge label="TIMING" value={live.live ? live.live.timing : '—'} unit="°" warn={!!(live.live && live.live.knock)} />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <LiveGauge label="INJ PW" value={live.live ? live.live.pw : '—'} unit="ms" />
          <LiveGauge label="DUTY" value={live.live ? live.live.duty : '—'} unit="%" warn={!!(live.live && live.live.duty > 90)} />
          <LiveGauge label="IDLE AIR" value={Math.round(live.idleTrim)} unit="%" />
          <LiveGauge label="FUEL" value={live.fuelCut ? 'CUT' : 'ON'} unit="" color={live.fuelCut ? T.warn : T.ok} />
        </div>

        <div style={{ marginTop: 12 }}>
          <TrimBar label="SHORT TERM FUEL TRIM (STFT)" value={live.stft} />
          <TrimBar label="LONG TERM FUEL TRIM (LTFT)" value={live.ltft} />
        </div>
      </Panel>
      <ExpandableInfo title="Why these gauges jitter">
        Every value above is a simulated sensor reading, with real noise and lag — not the exact internal number. That is what a tuner actually sees on a scan tool, and why real logs never look perfectly smooth.
      </ExpandableInfo>
    </BuildSection>
  );
}
