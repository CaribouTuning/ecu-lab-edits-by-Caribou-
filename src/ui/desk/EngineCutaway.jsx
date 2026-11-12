/**
 * One cylinder of your engine, cut away and running: the Physics app's "engine in action".
 *
 * Drawn to the engine's own bore, stroke and compression, and driven by the slider-crank
 * kinematics the simulator uses. The crank turns at the chosen RPM, slowed down so it can
 * be followed; the cams turn at half speed and lift the valves through their duration; the
 * spark fires at the tune's timing; the charge is coloured by stroke (fresh mixture,
 * burning, spent); and the pressure in the cylinder is drawn on a p-V diagram as it goes.
 * Every number beside it is worked live, with the equation it comes from.
 *
 * Crank angle φ runs 0-720° over one cycle: 0 is TDC at the start of intake, 180 BDC,
 * 360 TDC between compression and power (where the spark fires), 540 BDC, 720 TDC.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { COEFF, cylinderVolumeM3 } from '../../sim/index.js';

import { SectionHatch } from './cutawayParts.jsx';
import { Plot } from './Plot.jsx';
import styles from './Apps.module.css';
import { fixed as f } from '../format.js';

/** How much slower than real life the crank is shown turning. */
const SLOW = 60;
const RAD = Math.PI / 180;


const STROKES = [
  ['Intake', 'The piston goes down and pulls the fresh mixture in through the open intake valve.'],
  ['Compression', 'Both valves shut; the piston comes up and squeezes the charge into the chamber.'],
  ['Power', 'The spark lights it; the burning gas drives the piston down. The only stroke that makes work.'],
  ['Exhaust', 'The exhaust valve opens and the piston pushes the spent gas out.'],
];

/** Linear read of a sorted record at `x`, held at its ends. */
const readSorted = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0; let hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const k = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * k;
};

/**
 * The cylinder as the model has it, at any crank angle of the 720: its geometry (the
 * slider-crank on the model's rod ratio), its valve events and lift (the gas exchange's), and
 * its pressure and burned share (the four-stroke record: the closed cycle as `runCycle`
 * integrated it, the open period as the gas exchange did). Crank angle `phi`: 0° is top dead
 * centre between the exhaust and intake strokes, 360° firing TDC. Nothing here is a second
 * model: it reads the model's numbers and draws them.
 * @param {{bore: number, stroke: number, cr: number, timing: number,
 *   trace: {phi: number[], bar: number[], burned: number[]},
 *   gx: {events: {ivo: number, ivc: number, evo: number, evc: number}, trace: {deg: number[], inAreaMm2: number[], exAreaMm2: number[]}}}} e
 */
export function cylinderModel(e) {
  const r = e.stroke / 2; // crank throw, mm
  const l = r * COEFF.ROD_RATIO; // rod, mm: the model's rod ratio (rod over crank radius)
  const area = (Math.PI * e.bore * e.bore) / 4; // mm²
  const swept = area * e.stroke; // mm³
  const vc = swept / Math.max(1.5, e.cr - 1); // clearance volume, mm³: the compression ratio's definition
  /** Volume above the piston, mm³ (the cycle's own slider-crank). @param {number} th crank angle, ° from TDC */
  const vol = (th) => cylinderVolumeM3(th, vc, swept, COEFF.ROD_RATIO);
  /** Piston pin's distance from the crank centre, mm. */
  const x = (th) => l + r - (vol(th) - vc) / area;
  const vMax = vol(180);
  // Valve events in this frame: the gas exchange measures from the overlap TDC, the exhaust
  // events before it (negative), so they sit at the end of the 720 here.
  const ev = e.gx.events;
  const ivo = ev.ivo; const ivc = ev.ivc; const evo = ev.evo + 720; const evc = ev.evc + 720;
  const tr = e.gx.trace;
  const maxIn = Math.max(...tr.inAreaMm2, 1); const maxEx = Math.max(...tr.exAreaMm2, 1);
  /** A valve's opening as a share of its full flow area, read from the gas exchange's record. */
  const liftOf = (areas, maxA) => (phi) => {
    const d = phi > 360 ? phi - 720 : phi; // the record's frame
    if (d < tr.deg[0] || d > tr.deg[tr.deg.length - 1]) return 0;
    return readSorted(tr.deg, areas, d) / maxA;
  };
  const liftIn = liftOf(tr.inAreaMm2, maxIn);
  const liftEx = liftOf(tr.exAreaMm2, maxEx);
  const sparkPhi = 360 - e.timing;
  const wrap720 = (phi) => ((phi % 720) + 720) % 720;
  /** Share of the charge burned, as the cycle integrated it. */
  const burned = (phi) => readSorted(e.trace.phi, e.trace.burned, wrap720(phi));
  /** Cylinder pressure, bar absolute. */
  const pressure = (phi) => readSorted(e.trace.phi, e.trace.bar, wrap720(phi));
  return { r, l, area, swept, vc, vMax, x, vol, ivo, ivc, evo, evc, liftIn, liftEx, sparkPhi, burned, pressure };
}

/**
 * @param {object} props
 * @param {number} props.bore mm @param {number} props.stroke mm @param {number} props.cr compression ratio
 * @param {object} props.point the model's answer at the chosen RPM and load (a pull point)
 * @param {{phi: number[], bar: number[], burned: number[]}} props.trace the four strokes' pressure (`fourStrokeTrace`)
 * @param {any} props.gx the gas exchange at that speed and load (`gasExchangeTrace`)
 * @returns {React.ReactElement}
 */
export function EngineCutaway({ bore, stroke, cr, point: p, trace, gx }) {
  const [phi, setPhi] = useState(300);
  const [playing, setPlaying] = useState(true);
  const raf = useRef(0);
  const rpm = p.rpm ?? 3000;
  useEffect(() => {
    if (!playing) return undefined;
    let last = 0;
    const step = (t) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      // degrees per second at the slowed speed: rpm / 60 rev/s × 360°, divided by SLOW
      setPhi((v) => (v + (dt * rpm * 6) / SLOW) % 720);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, rpm]);

  const m = useMemo(() => cylinderModel({ bore, stroke, cr, timing: p.timing ?? 20, trace, gx }), [bore, stroke, cr, p.timing, trace, gx]);
  const th = phi % 360; // crank angle from TDC, for the kinematics
  const strokeIdx = Math.floor(phi / 180) % 4;
  const P = m.pressure(phi);
  const V = m.vol(th);
  const xNow = m.x(th);
  const burning = phi > m.sparkPhi && phi < m.sparkPhi + 120 ? m.burned(phi) : 0;

  // ---- the drawing: 360 × 520. The head is at the top, the crank at (180, 400); the
  // scale fits this engine's rod, stroke and piston between them, and its bore across. ----
  const W = 360; const cx = 180; const cy = 400; const deckTarget = 150;
  const pistonComp = bore * 0.3; // pin to crown, mm
  const k = Math.min(150 / bore, (cy - deckTarget) / (m.r + m.l + pistonComp + m.vc / m.area));
  const halfBore = (bore * k) / 2;
  const rk = m.r * k;
  const pinY = cy - xNow * k;
  const pistonH = bore * 0.62 * k;
  const pistonTop = pinY - pistonComp * k;
  const deckY = cy - (m.r + m.l + pistonComp + m.vc / m.area) * k; // crown at TDC + the clearance
  const headTop = deckY - 128;
  const roofY = deckY - 22; // the pent roof's peak
  const crankPinX = cx + rk * Math.sin(th * RAD);
  const crankPinY = cy - rk * Math.cos(th * RAD);
  const liftIn = m.liftIn(phi);
  const liftEx = m.liftEx(phi);
  const maxLift = halfBore * 0.22;
  const valve = (side, lift) => {
    const s = side === 'in' ? -1 : 1;
    const a = 22 * RAD * s; // the valves lean out, under a pent roof
    const seatX = cx + s * halfBore * 0.48;
    const seatY = deckY - 8;
    const down = lift * maxLift;
    const ux = Math.sin(a); const uy = -Math.cos(a); // up the stem
    const hx = seatX - ux * down; const hy = seatY - uy * down;
    const stemLen = 78;
    const coils = [];
    const s0 = 34; const s1 = 66; // spring from 34 to 66 up the stem, squeezed by the lift
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const d = s0 + (s1 - s0) * t - down * (1 - t);
      const off = i % 2 ? 7 : -7;
      coils.push(`${(seatX + ux * d + Math.cos(a) * off).toFixed(1)},${(seatY + uy * d + Math.sin(a) * off).toFixed(1)}`);
    }
    const camX = seatX + ux * (stemLen + 14); const camY = seatY + uy * (stemLen + 14);
    const centre = side === 'in' ? (m.ivo + m.ivc) / 2 : (m.evo + m.evc) / 2;
    // The cam turns at half the crank's speed; its lobe points down the stem at full lift.
    const camDeg = (phi - centre) / 2 + (a / RAD) + 180;
    const headW = halfBore * 0.36;
    return (
      <g>
        <polyline points={coils.join(' ')} className={styles.cutSpring} />
        <line x1={hx} y1={hy} x2={hx + ux * stemLen} y2={hy + uy * stemLen} className={styles.cutStem} />
        <path d={`M${hx - Math.cos(a) * headW} ${hy - Math.sin(a) * headW} L${hx + Math.cos(a) * headW} ${hy + Math.sin(a) * headW} L${hx + ux * 7 + Math.cos(a) * 2} ${hy + uy * 7 + Math.sin(a) * 2} L${hx + ux * 7 - Math.cos(a) * 2} ${hy + uy * 7 - Math.sin(a) * 2} Z`} className={styles.cutValve} />
        <g transform={`translate(${camX.toFixed(1)} ${camY.toFixed(1)}) rotate(${camDeg.toFixed(1)})`}>
          <path d="M0 -14 C 11 -14 14 -4 13 5 C 11 14 4 23 0 23 C -4 23 -11 14 -13 5 C -14 -4 -11 -14 0 -14 Z" className={styles.cutCam} />
          <circle r="4.5" className={styles.cutHub} />
        </g>
      </g>
    );
  };
  const gasClass = strokeIdx === 0 ? styles.gasFresh : strokeIdx === 1 ? styles.gasFresh
    : strokeIdx === 2 ? styles.gasBurn : styles.gasSpent;
  const gasOpacity = strokeIdx === 1 ? 0.55 + 0.4 * (1 - (V - m.vc) / (m.vMax - m.vc)) : strokeIdx === 2 ? 0.5 + 0.5 * (1 - (phi - 360) / 180) : 0.6;

  // ---- the p-V diagram, drawn as the cycle goes: log pressure against volume, the way an
  // indicator diagram is read (compression and expansion are straight lines of slope -n) ----
  const pMax = Math.max(10, (p.peakPressure ?? 60) * 1.1);
  const lg = (pr) => Math.log10(Math.max(0.3, pr));
  const pvTicks = [0.5, 1, 2, 5, 10, 20, 50, 100].filter((b) => b <= pMax).map((b) => ({ v: Math.log10(b), label: String(b) }));

  return (
    <div className={styles.cutWrap}>
      <ol className={styles.strokeBar} aria-label="The four strokes">
        {STROKES.map(([name], j) => (
          <li key={name} className={styles.strokePill} data-on={j === strokeIdx ? 'true' : undefined}>{name}</li>
        ))}
      </ol>
      <div className={styles.cutSplit}>
        <svg viewBox={`0 0 ${W} 520`} className={styles.cutSvg} role="img" aria-label={`One cylinder cut away at ${f(phi, 0)}° of the cycle: ${STROKES[strokeIdx][0].toLowerCase()} stroke, ${f(P, 1)} bar`}>
          <SectionHatch />
          {/* block: coolant jackets either side of the bore, its walls */}
          <rect x={cx - halfBore - 34} y={deckY} width={34} height={cy - rk - 30 - deckY} className={styles.cutBlock} />
          <rect x={cx + halfBore} y={deckY} width={34} height={cy - rk - 30 - deckY} className={styles.cutBlock} />
          <rect x={cx - halfBore - 26} y={deckY + 8} width={14} height={cy - rk - 50 - deckY} rx={4} className={styles.cutCoolant} />
          <rect x={cx + halfBore + 12} y={deckY + 8} width={14} height={cy - rk - 50 - deckY} rx={4} className={styles.cutCoolant} />
          {/* head, with its ports */}
          <path d={`M${cx - halfBore - 34} ${deckY} L${cx - halfBore - 34} ${headTop} L${cx + halfBore + 34} ${headTop} L${cx + halfBore + 34} ${deckY} L${cx + halfBore} ${deckY} L${cx} ${roofY} L${cx - halfBore} ${deckY} Z`} className={styles.cutHead} />
          <path d={`M4 ${deckY - 60} L${cx - halfBore - 34} ${deckY - 60} L${cx - halfBore * 0.62} ${deckY - 12} L${cx - halfBore * 0.22} ${deckY - 18} L${cx - halfBore - 34} ${deckY - 86} L4 ${deckY - 86} Z`} className={styles.gasFresh} opacity={0.3 + 0.65 * liftIn} />
          <path d={`M${W - 4} ${deckY - 60} L${cx + halfBore + 34} ${deckY - 60} L${cx + halfBore * 0.62} ${deckY - 12} L${cx + halfBore * 0.22} ${deckY - 18} L${cx + halfBore + 34} ${deckY - 86} L${W - 4} ${deckY - 86} Z`} className={styles.gasSpent} opacity={0.3 + 0.65 * liftEx} />
          {/* the charge above the piston */}
          <path d={`M${cx - halfBore} ${deckY} L${cx} ${roofY} L${cx + halfBore} ${deckY} L${cx + halfBore} ${pistonTop} L${cx - halfBore} ${pistonTop} Z`} className={gasClass} opacity={gasOpacity} />
          {burning > 0 && burning < 0.98 && (
            <circle cx={cx} cy={roofY + 6} r={6 + burning * halfBore * 1.1} className={styles.cutFlame} opacity={0.7 * (1 - burning * 0.6)} />
          )}
          {valve('in', liftIn)}
          {valve('ex', liftEx)}
          {/* spark plug */}
          <rect x={cx - 6} y={headTop - 14} width={12} height={roofY - headTop - 2} rx={3} className={styles.cutPlug} />
          <rect x={cx - 3} y={roofY - 14} width={6} height={12} className={styles.cutPlugTip} />
          {Math.abs(phi - m.sparkPhi) < 9 && (
            <path d={`M${cx} ${roofY - 2} l7 11 l-9 2 l9 13 l-16 -13 l9 -2 z`} className={styles.cutSpark} />
          )}
          {/* crankcase, oil */}
          <path d={`M${cx - halfBore - 34} ${cy - rk - 30} L${cx - rk - 44} ${cy - 10} L${cx - rk - 44} ${cy + rk + 26} L${cx + rk + 44} ${cy + rk + 26} L${cx + rk + 44} ${cy - 10} L${cx + halfBore + 34} ${cy - rk - 30} Z`} className={styles.cutCase} />
          <path d={`M${cx - rk - 44} ${cy + rk + 26} L${cx - rk - 30} ${cy + rk + 58} L${cx + rk + 30} ${cy + rk + 58} L${cx + rk + 44} ${cy + rk + 26} Z`} className={styles.cutOil} />
          {/* crank: counterweight opposite the pin, the web, the main journal */}
          <g transform={`rotate(${th.toFixed(1)} ${cx} ${cy})`}>
            <path d={`M${cx - rk * 1.15} ${cy + 4} A ${rk * 1.15} ${rk * 1.15} 0 0 0 ${cx + rk * 1.15} ${cy + 4} Z`} className={styles.cutCounter} />
            <rect x={cx - 11} y={cy - rk - 11} width={22} height={rk + 18} rx={11} className={styles.cutWeb} />
          </g>
          <circle cx={cx} cy={cy} r={12} className={styles.cutHub} />
          {/* bore walls over the jackets' inner edge */}
          <line x1={cx - halfBore} y1={deckY} x2={cx - halfBore} y2={cy - rk - 30} className={styles.cutBore} />
          <line x1={cx + halfBore} y1={deckY} x2={cx + halfBore} y2={cy - rk - 30} className={styles.cutBore} />
          {/* rod */}
          <line x1={crankPinX} y1={crankPinY} x2={cx} y2={pinY} className={styles.cutRod} />
          <circle cx={crankPinX} cy={crankPinY} r={9} className={styles.cutHub} />
          {/* piston, rings, pin */}
          <rect x={cx - halfBore + 1.5} y={pistonTop} width={halfBore * 2 - 3} height={pistonH} rx={3} className={styles.cutPiston} />
          {[0.07, 0.15, 0.23].map((t) => <line key={t} x1={cx - halfBore + 1.5} x2={cx + halfBore - 1.5} y1={pistonTop + pistonH * t} y2={pistonTop + pistonH * t} className={styles.cutRing} />)}
          <circle cx={cx} cy={pinY} r={7} className={styles.cutHub} />
          <path d={strokeIdx % 2 === 0 ? `M${cx} ${pistonTop + pistonH * 0.62} l-7 -10 h14 z` : `M${cx} ${pistonTop + pistonH * 0.32} l-7 10 h14 z`} className={styles.cutArrow} />
          {/* labels on leader lines */}
          {(/** @type {[string, number, number, number, number][]} */ ([
            ['Camshaft', 8, headTop - 8, cx - halfBore * 0.48 - 34, headTop + 18],
            ['Intake valve', 8, deckY - 100, cx - halfBore * 0.5, deckY - 24],
            ['Intake port', 8, deckY - 40, 30, deckY - 70],
            ['Coolant', 8, deckY + 60, cx - halfBore - 19, deckY + 60],
            ['Spark plug', W - 8, headTop - 4, cx + 6, headTop + 2],
            ['Exhaust valve', W - 8, deckY - 100, cx + halfBore * 0.5, deckY - 24],
            ['Exhaust port', W - 8, deckY - 40, W - 30, deckY - 70],
            ['Piston', W - 8, pistonTop + pistonH * 0.5, cx + halfBore - 4, pistonTop + pistonH * 0.5],
            ['Rings', W - 8, pistonTop + 6, cx + halfBore - 4, pistonTop + pistonH * 0.15],
            ['Connecting rod', 8, (pinY + crankPinY) / 2, (cx + crankPinX) / 2 - 6, (pinY + crankPinY) / 2],
            ['Crankshaft', W - 8, cy - 4, cx + 14, cy],
            ['Counterweight', 8, cy + rk + 8, cx - rk * 0.6, cy + rk * 0.7],
            ['Oil pan', W - 8, cy + rk + 46, cx + rk + 34, cy + rk + 44],
          ])).map(([t, lx, ly, tx, ty]) => (
            <g key={t}>
              <line x1={lx < W / 2 ? lx + t.length * 5.2 + 4 : lx - t.length * 5.2 - 4} y1={ly - 3} x2={tx} y2={ty} className={styles.cutLeader} />
              <circle cx={tx} cy={ty} r={1.8} className={styles.cutLeaderDot} />
              <text x={lx} y={ly} className={styles.cutLabel} textAnchor={lx < W / 2 ? 'start' : 'end'}>{t}</text>
            </g>
          ))}
        </svg>
        <div className={styles.cutSide}>
          <p className={styles.cutStroke}><b>{STROKES[strokeIdx][0]}.</b> {STROKES[strokeIdx][1]}</p>
          <Plot
            title="Pressure against volume"
            sub={`now ${f(P, 1)} bar at ${f(V / 1000, 0)} cc`}
            xLabel="cylinder volume, cc"
            yLabel="pressure, bar (log)"
            xDomain={[m.vc / 1000, m.vMax / 1000]}
            yDomain={[Math.log10(0.3), Math.log10(pMax)]}
            yTicks={pvTicks}
            height={170}
            ariaLabel={`Pressure against volume; now ${f(P, 1)} bar at ${f(V / 1000, 0)} cc`}
            legend={[{ label: 'the cycle', kind: 'line', tone: 'var(--cut-burn)' }, { label: 'now', kind: 'dot', tone: 'var(--acc)' }]}
          >
            {({ x, y }) => {
              const loop = [];
              for (let a = 0; a < 720; a += 4) loop.push(`${x(m.vol(a % 360) / 1000).toFixed(1)},${y(lg(m.pressure(a))).toFixed(1)}`);
              return (
                <>
                  <polyline points={loop.join(' ')} className={styles.pvLoop} />
                  <circle cx={x(V / 1000)} cy={y(lg(P))} r={4} className={styles.pvDot} />
                </>
              );
            }}
          </Plot>
          <p className={styles.panelNote}>The loop is the model&apos;s own: the closed cycle as integrated, then the gas exchange from the moment the exhaust valve leaves its seat. The step there is where the two calculations meet and disagree: the blowdown starts about a third lower than the cycle&apos;s pressure at that angle (an open item, in docs/accuracy.md).</p>
          <dl className={styles.liveEq}>
            <dt>Crank angle</dt><dd>{f(phi, 0)}° of 720, {f(th, 0)}° from TDC</dd>
            <dt>Piston pin</dt><dd>x = r cos θ + √(l² − r² sin² θ) = {f(xNow, 1)} mm</dd>
            <dt>Volume</dt><dd>V = V<sub>c</sub> + A(l + r − x) = {f(m.vc / 1000, 0)} + {f(m.area / 100, 1)} cm² × {f((m.l + m.r - xNow) / 10, 2)} cm = {f(V / 1000, 0)} cc</dd>
            <dt>Pressure</dt><dd>{f(P, 1)} bar, {strokeIdx === 1 || strokeIdx === 2
              ? <>the closed cycle as integrated: slider-crank volume, Wiebe heat release, wall heat ({f(m.burned(phi) * 100, 0)}% burned)</>
              : <>the gas exchange: the valves&apos; flow against the runner and primary waves</>}</dd>
            <dt>Valves</dt><dd>intake {f(liftIn * 100, 0)}% open, exhaust {f(liftEx * 100, 0)}% open</dd>
            <dt>Spark</dt><dd>{f(p.timing, 1)}° before TDC (φ = {f(m.sparkPhi, 0)}°)</dd>
          </dl>
          <div className={styles.cutControls}>
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={0} max={719} value={Math.round(phi)} aria-label="Crank angle" aria-valuetext={`${Math.round(phi)} degrees`}
              onChange={(e) => { setPlaying(false); setPhi(Number(e.target.value)); }} />
          </div>
          <p className={styles.panelNote}>Shown {SLOW}× slower than {rpm} RPM: really {f(rpm / 120, 1)} cycles a second.</p>
        </div>
      </div>
    </div>
  );
}
