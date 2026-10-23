/**
 * What the shop's bench computers show besides the app's own screens: the engine's speed as
 * a digital bar graph with the throttle and the other live channels under it, the physics
 * worked from what the sensors read right now, and the pull's VE against RPM.
 *
 * Pictures of numbers the simulation already made: nothing here models anything.
 */

import React from 'react';

import { useSession } from '../state/StoreProvider.jsx';

import styles from './BenchScreens.module.css';

const SEGMENTS = 40;
const R_AIR = 287;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');
/** @param {number} v */
const unit01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * @typedef {{label: string, value: string, unit?: string, pct: number, tone?: 'ok'|'warn'|'danger'|'acc'}} Meter
 */

/**
 * The engine's speed in lit segments, the throttle under it, and a meter a channel.
 * @param {{rpm: number, fullScaleRpm: number, redline: number, throttle: number, cut?: boolean, meters: Meter[]}} props
 * @returns {React.ReactElement}
 */
export function BarGraph({ rpm, fullScaleRpm, redline, throttle, cut = false, meters }) {
  const lit = Math.round(unit01(rpm / Math.max(1, fullScaleRpm)) * SEGMENTS);
  const zone = (i) => {
    const at = ((i + 0.5) / SEGMENTS) * fullScaleRpm;
    return at >= redline ? 'danger' : at >= redline * 0.85 ? 'warn' : 'acc';
  };
  return (
    <div className={styles.bars}>
      <div className={styles.rpmHead}>
        <span className={styles.rpmNum} data-cut={cut ? 'true' : undefined}>{Math.round(rpm)}</span>
        <span className={styles.rpmUnit}>RPM</span>
      </div>
      <div className={styles.segments} role="meter" aria-label="Engine speed bar" aria-valuemin={0} aria-valuemax={fullScaleRpm} aria-valuenow={Math.round(rpm)}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className={styles.seg} data-zone={zone(i)} data-on={i < lit ? 'true' : undefined} />
        ))}
      </div>
      <div className={styles.scale} aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((k) => <span key={k}>{Math.round((fullScaleRpm * k) / 1000)}k</span>)}
      </div>
      <Bar label="THROTTLE" value={`${Math.round(throttle)}`} unit="%" pct={throttle / 100} tone="ok" big />
      <div className={styles.meters}>
        {meters.map((m) => <Bar key={m.label} {...m} />)}
      </div>
    </div>
  );
}

/** @param {Meter & {big?: boolean}} props */
function Bar({ label, value, unit = '', pct, tone = 'acc', big = false }) {
  return (
    <div className={styles.meter} data-big={big ? 'true' : undefined}>
      <div className={styles.meterHead}><span>{label}</span><b>{value}<small>{unit}</small></b></div>
      <div className={styles.track}><div className={styles.fill} data-tone={tone} style={{ width: `${unit01(pct) * 100}%` }} /></div>
    </div>
  );
}

/**
 * The engine on the stand, live: its speed, the throttle and every channel as a bar.
 * @param {{fullScaleRpm: number, redline: number}} props
 * @returns {React.ReactElement}
 */
export function LiveBars({ fullScaleRpm, redline }) {
  const [session] = useSession();
  const live = /** @type {Record<string, any>} */ (session.live);
  const off = !live.running && !live.cranking;
  const lam = off ? NaN : live.sensedLambda;
  const timing = live.live ? Number(live.live.timing) : NaN;
  const duty = live.live ? Number(live.live.duty) : NaN;
  /** @type {Meter[]} */
  const meters = [
    { label: 'MAP', value: f(live.sensedMap, 0), unit: ' kPa', pct: live.sensedMap / 250 },
    { label: 'MAF', value: f(live.sensedMaf, 1), unit: ' g/s', pct: live.sensedMaf / 400 },
    { label: 'LAMBDA', value: f(lam, 2), unit: ' λ', pct: (lam - 0.6) / 0.8, tone: lam > 1.08 || lam < 0.72 ? 'warn' : 'ok' },
    { label: 'TIMING', value: f(timing, 0), unit: '°', pct: timing / 50, tone: live.ecu?.knockNow ? 'danger' : 'acc' },
    { label: 'INJ DUTY', value: f(duty, 0), unit: '%', pct: duty / 100, tone: duty > 90 ? 'danger' : 'acc' },
    { label: 'COOLANT', value: f(live.sensedCoolant, 0), unit: ' °C', pct: live.sensedCoolant / 120, tone: live.sensedCoolant > 105 ? 'danger' : live.sensedCoolant < 80 ? 'warn' : 'ok' },
    { label: 'IAT', value: f(live.sensedIat, 0), unit: ' °C', pct: live.sensedIat / 90, tone: live.sensedIat > 65 ? 'danger' : 'acc' },
    { label: 'FUEL TRIM', value: `${live.stft > 0 ? '+' : ''}${f(live.stft, 1)}`, unit: '%', pct: (live.stft + 25) / 50, tone: Math.abs(live.stft) > 15 ? 'danger' : Math.abs(live.stft) > 8 ? 'warn' : 'ok' },
  ];
  return <BarGraph rpm={live.sensedRpm} fullScaleRpm={fullScaleRpm} redline={redline} throttle={live.effThrottle ?? 0} cut={!!live.fuelCut} meters={meters} />;
}

/**
 * The physics of the engine on the stand, worked from what its sensors read this instant.
 * @param {{derived: {cyl?: number, displacementL?: number, stroke?: number}}} props
 * @returns {React.ReactElement}
 */
export function LivePhysics({ derived }) {
  const [session] = useSession();
  const live = /** @type {Record<string, any>} */ (session.live);
  const rpm = live.sensedRpm;
  const cyl = derived?.cyl ?? 6;
  const vCylL = (derived?.displacementL ?? 3.5) / cyl;
  const running = live.running && rpm > 50;
  // A four-stroke fills each cylinder once every two turns of the crank.
  const fills = (rpm / 120) * cyl;
  const tK = live.sensedIat + 273.15;
  const rho = (live.sensedMap * 1000) / (R_AIR * tK);
  const airMg = running ? (live.sensedMaf / fills) * 1000 : NaN;
  const ve = running ? (airMg / 1e6) / (rho * (vCylL / 1000)) * 100 : NaN;
  const cycleMs = running ? 120000 / rpm : NaN;
  const pw = live.live ? Number(live.live.pw) : NaN;
  const timing = live.live ? Number(live.live.timing) : NaN;
  const leadMs = running ? (timing / (6 * rpm)) * 1000 : NaN;
  const piston = running ? (2 * ((derived?.stroke ?? 0) / 1000) * rpm) / 60 : NaN;
  const rows = /** @type {[string, React.ReactNode, string][]} */ ([
    ['Air density', <>ρ = MAP / (R·T) = {f(live.sensedMap * 1000, 0)} / (287 × {f(tK, 0)}) = <b>{f(rho, 3)} kg/m³</b></>, 'thinner air, hotter or at less pressure, carries less oxygen'],
    ['Cylinder fills', <>{f(rpm, 0)} rpm ÷ 120 × {cyl} = <b>{f(running ? fills : NaN, 0)} a second</b></>, 'a four-stroke fills each cylinder every second turn'],
    ['Air per fill', <>MAF ÷ fills = {f(live.sensedMaf, 1)} g/s ÷ {f(running ? fills : NaN, 0)} = <b>{f(airMg, 0)} mg</b></>, 'what each cylinder took in, as the MAF sees it'],
    ['Filling', <>m ÷ (ρ · V<sub>cyl</sub>) = <b>{f(ve, 0)} %</b></>, 'volumetric efficiency, measured: how full against how full it could be'],
    ['Injector', <>{f(pw, 2)} ms open of a {f(cycleMs, 1)} ms cycle = <b>{f(running ? (pw / cycleMs) * 100 : NaN, 0)} %</b></>, 'past about 90 % the injector cannot keep up'],
    ['Spark lead', <>{f(timing, 0)}° ÷ (6 × rpm) = <b>{f(leadMs, 2)} ms</b> before top centre</>, 'the faster it spins, the less time the burn has'],
    ['Piston speed', <>2 × stroke × rpm ÷ 60 = <b>{f(piston, 1)} m/s</b></>, 'mean speed: past about 25 m/s the parts are working hard'],
  ]);
  return (
    <div className={styles.phys}>
      {!running && <p className={styles.note}>Start the engine: the numbers come from its sensors as it runs.</p>}
      <dl className={styles.physList}>
        {rows.map(([k, eq, why]) => (
          <div key={k} className={styles.physRow}><dt>{k}</dt><dd><span className={styles.eq}>{eq}</span><span className={styles.why}>{why}</span></dd></div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Volumetric efficiency against RPM, as the pull measured it.
 * @param {{points: {rpm: number, ve?: number}[], at?: number|null}} props
 * @returns {React.ReactElement}
 */
export function VeCurve({ points, at = null }) {
  const pts = points.filter((p) => Number.isFinite(p.ve));
  if (pts.length < 2) return <p className={styles.note}>Make a pull: the VE curve is measured on it.</p>;
  const W = 600; const H = 300;
  const rpm0 = pts[0].rpm; const rpm1 = pts[pts.length - 1].rpm;
  const top = Math.max(110, ...pts.map((p) => p.ve ?? 0)) * 1.05;
  const x = (r) => 40 + ((r - rpm0) / Math.max(1, rpm1 - rpm0)) * (W - 56);
  const y = (v) => H - 28 - (v / top) * (H - 44);
  const peak = pts.reduce((b, p) => ((p.ve ?? 0) > (b.ve ?? 0) ? p : b), pts[0]);
  const near = at == null ? null : pts.reduce((b, p) => (Math.abs(p.rpm - at) < Math.abs(b.rpm - at) ? p : b), pts[0]);
  return (
    <div className={styles.ve}>
      <div className={styles.veHead}>VOLUMETRIC EFFICIENCY · peak <b>{f(peak.ve ?? NaN, 0)} %</b> at {peak.rpm} rpm</div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.veSvg} role="img" aria-label={`VE against RPM, peak ${f(peak.ve ?? NaN, 0)} percent at ${peak.rpm} RPM`}>
        {[25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={40} x2={W - 16} y1={y(v)} y2={y(v)} className={styles.veGrid} />
            <text x={34} y={y(v) + 4} className={styles.veTick} textAnchor="end">{v}</text>
          </g>
        ))}
        <polyline points={pts.map((p) => `${x(p.rpm).toFixed(1)},${y(p.ve ?? 0).toFixed(1)}`).join(' ')} className={styles.veLine} />
        <circle cx={x(peak.rpm)} cy={y(peak.ve ?? 0)} r="6" className={styles.veDot} />
        {near && <line x1={x(near.rpm)} x2={x(near.rpm)} y1={12} y2={H - 28} className={styles.veAt} />}
        <text x={40} y={H - 8} className={styles.veTick}>{rpm0}</text>
        <text x={W - 16} y={H - 8} className={styles.veTick} textAnchor="end">{rpm1} rpm</text>
      </svg>
    </div>
  );
}
