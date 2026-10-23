/**
 * The first screen: what this is, the three ways in, and the product doing its one job.
 *
 * Left, the name, one sentence and the ways in as rows that say what each one is. Right,
 * a dyno sheet: the stock Nissan VQ35DE Rev-Up's pull, run by this simulator when the screen
 * opens (the tutorial's own engine and pull, `tutorial/scenarios.js`). Nothing on it is
 * drawn for show: the curve, the peak and the speed it lands at are the model's.
 */

import React, { useEffect, useState } from 'react';

import { stock } from '../tutorial/scenarios.js';

import { CARIBOU_FILL, CARIBOU_INK, CARIBOU_VIEWBOX } from './caribouLogo.js';
import styles from './StartScreen.module.css';

/**
 * The three ways in. CAREER first: a customer car with a fault in it is the only one of
 * the three that tells you what you are trying to achieve. SANDBOX is your own shop with
 * every tool and no objective; the tutorial is the walk through.
 */
const WAYS_IN = [
  { key: 'career', label: 'Career', caption: 'Run a tuning shop in town. Customers bring cars that run wrong; you find out why and fix the calibration.' },
  { key: 'sandbox', label: 'Sandbox', caption: 'Your laptop and your shop. Build any engine, tune it, run it on the dyno and the engine stand.' },
  { key: 'tutorial', label: 'Tutorial', caption: 'Five minutes: one pull, one fault, one fix.' },
];

/** @param {{src: string|null}} props */
function LogoMark({ src }) {
  if (src) return <img className={styles.logo} src={src} alt="Caribou Tuning" />;
  return (
    <svg className={styles.logo} viewBox={CARIBOU_VIEWBOX} role="img" aria-label="Caribou Tuning">
      <path d={CARIBOU_FILL} fill="var(--panel3)" fillRule="evenodd" />
      <path d={CARIBOU_INK} fill="var(--ink)" fillRule="evenodd" />
    </svg>
  );
}

/**
 * The stock pull as a dyno sheet: power and torque against rpm, the peak marked.
 * @param {{points: {rpm: number, hp: number, torque: number}[]}} props
 */
function DynoSheet({ points }) {
  const W = 520; const H = 300; const L = 44; const B = 34; const T = 18; const R = 14;
  const r0 = points[0].rpm; const r1 = points[points.length - 1].rpm;
  const top = Math.ceil(Math.max(...points.map((p) => Math.max(p.hp, p.torque))) / 50) * 50;
  const x = (r) => L + ((r - r0) / (r1 - r0)) * (W - L - R);
  const y = (v) => H - B - (v / top) * (H - B - T);
  const line = (k) => points.map((p) => `${x(p.rpm).toFixed(1)},${y(p[k]).toFixed(1)}`).join(' ');
  const peak = points.reduce((b, p) => (p.hp > b.hp ? p : b), points[0]);
  const peakTq = points.reduce((b, p) => (p.torque > b.torque ? p : b), points[0]);
  const ticks = [];
  for (let v = 0; v <= top; v += 50) ticks.push(v);
  return (
    <figure className={styles.sheet}>
      <figcaption className={styles.sheetHead}>
        <span>Nissan VQ35DE Rev-Up, stock, on this simulator</span>
        <span className={styles.sheetPeak}><b>{Math.round(peak.hp)}</b> whp at {peak.rpm} rpm, <b>{Math.round(peakTq.torque)}</b> lb-ft at {peakTq.rpm}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.sheetSvg} role="img"
        aria-label={`Dyno sheet: ${Math.round(peak.hp)} wheel horsepower at ${peak.rpm} rpm and ${Math.round(peakTq.torque)} pound-feet at ${peakTq.rpm} rpm`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={styles.rule} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className={styles.tick}>{v}</text>
          </g>
        ))}
        {[2000, 3000, 4000, 5000, 6000, 7000].filter((r) => r >= r0 && r <= r1).map((r) => (
          <text key={r} x={x(r)} y={H - 12} textAnchor="middle" className={styles.tick}>{r}</text>
        ))}
        <polyline points={line('torque')} className={styles.torque} />
        <polyline points={line('hp')} className={styles.power} />
        <circle cx={x(peak.rpm)} cy={y(peak.hp)} r="4" className={styles.peak} />
        <text x={W - R} y={y(points[points.length - 1].hp) - 10} textAnchor="end" className={styles.seriesPower}>power, whp</text>
        <text x={W - R} y={y(points[points.length - 1].torque) + 18} textAnchor="end" className={styles.seriesTorque}>torque, lb-ft</text>
      </svg>
    </figure>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onCareer
 * @param {() => void} props.onStart opens SANDBOX
 * @param {() => void} props.onTutorial
 * @param {string} props.version
 * @param {string|null} [props.logo] an image to use for the logo instead of the traced one
 * @returns {React.ReactElement}
 */
export function StartScreen({ onCareer, onStart, onTutorial, version, logo = null }) {
  const handlers = { career: onCareer, sandbox: onStart, tutorial: onTutorial };
  // The pull runs after the first paint, so the ways in are there at once.
  const [points, setPoints] = useState(/** @type {any[]|null} */ (null));
  useEffect(() => {
    const id = setTimeout(() => {
      try { setPoints(stock().result.points); } catch { setPoints(null); }
    }, 0);
    return () => clearTimeout(id);
  }, []);
  return (
    <div className={styles.screen} data-plain>
      <div className={styles.lead}>
        <div className={styles.brand}>
          <LogoMark src={logo} />
          <div>
            <h1 className={styles.title}>ECU Lab</h1>
            <p className={styles.maker}>Caribou Tuning</p>
          </div>
        </div>
        <p className={styles.what}>
          An engine and the computer that runs it, simulated from the physics. Build it, tune the
          tables a real tuner edits, run it on the dyno and read why it made what it made.
        </p>
        <nav className={styles.ways} aria-label="Ways in">
          {WAYS_IN.map((way) => (
            <button
              key={way.key} type="button" className={styles.way} data-key={way.key}
              onClick={handlers[/** @type {keyof typeof handlers} */ (way.key)]}
              aria-label={way.label} aria-describedby={`way-${way.key}`}
            >
              <span className={styles.wayName}>{way.label}</span>
              <span className={styles.wayCaption} id={`way-${way.key}`}>{way.caption}</span>
            </button>
          ))}
        </nav>
        <div className={styles.version}>{version}</div>
      </div>
      <div className={styles.side} aria-live="polite">
        {points && points.length > 1 && <DynoSheet points={points} />}
      </div>
    </div>
  );
}
