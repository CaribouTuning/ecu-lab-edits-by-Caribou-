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

import React, { useEffect, useRef, useState } from 'react';

import styles from './Apps.module.css';

/** How much slower than real life the crank is shown turning. */
export const SLOW = 60;
const RAD = Math.PI / 180;
const GAMMA = 1.32;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const STROKES = [
  ['Intake', 'The piston goes down and pulls the fresh mixture in through the open intake valve.'],
  ['Compression', 'Both valves shut; the piston comes up and squeezes the charge into the chamber.'],
  ['Power', 'The spark lights it; the burning gas drives the piston down. The only stroke that makes work.'],
  ['Exhaust', 'The exhaust valve opens and the piston pushes the spent gas out.'],
];

/**
 * The engine's geometry and the pressure in its cylinder at any crank angle.
 * @param {{bore: number, stroke: number, cr: number, map: number, peak: number, peakDeg: number, timing: number, burnDeg: number, camDuration: number}} e
 */
export function cylinderModel(e) {
  const r = e.stroke / 2; // crank throw, mm
  const l = e.stroke * 1.75; // rod, mm
  const area = (Math.PI * e.bore * e.bore) / 4; // mm²
  const swept = area * e.stroke; // mm³
  const vc = swept / Math.max(1.5, e.cr - 1); // clearance volume, mm³
  /** Piston pin's distance from the crank centre, mm. @param {number} th crank angle, ° from TDC */
  const x = (th) => r * Math.cos(th * RAD) + Math.sqrt(l * l - (r * Math.sin(th * RAD)) ** 2);
  /** Volume above the piston, mm³. */
  const vol = (th) => vc + area * (l + r - x(th));
  const vMax = vol(180);
  // Valve events, from the cam's duration (advertised, centred as a typical cam is).
  const dur = Math.max(180, e.camDuration || 230);
  const ivo = -(dur - 180) * 0.35; const ivc = ivo + dur; // intake opens before TDC, closes after BDC
  const evc = 720 + (dur - 180) * 0.35; const evo = evc - dur;
  /** Lift as a share of full, 0-1. */
  const lift = (phi, open, close) => (phi > open && phi < close ? Math.sin(((phi - open) / (close - open)) * Math.PI) : 0);
  const sparkPhi = 360 - e.timing;
  const burn = Math.max(20, e.burnDeg || 50);
  /** Share of the charge burned, Wiebe. */
  const burned = (phi) => {
    const t = (phi - sparkPhi) / burn;
    return t <= 0 ? 0 : 1 - Math.exp(-5 * Math.min(2, t) ** 3);
  };
  const pIvc = Math.max(0.2, e.map / 100); // bar at intake valve closing
  /** The charge squeezed and let out again with no burn: p V^γ held constant. */
  const motored = (phi) => pIvc * (vMax / vol(((phi % 360) + 360) % 360)) ** GAMMA;
  // The burn multiplies that curve: heat released at constant-ish volume raises the
  // pressure by a factor, and the burned gas then expands along its own polytrope. K is
  // sized so the peak lands where the model put it, at the angle it put it.
  const peakPhi = 360 + (e.peakDeg || 15);
  const K = Math.max(0, e.peak / motored(peakPhi) - 1) / Math.max(0.3, burned(peakPhi));
  /** Cylinder pressure, bar absolute. */
  const pressure = (phi) => {
    const q = ((phi % 720) + 720) % 720;
    if (q < 180) return pIvc * 0.97; // intake: about the manifold pressure
    if (q < 540) return motored(q) * (1 + K * burned(q)); // compression, burn, expansion
    // exhaust: the blowdown as the valve opens, then about atmospheric
    const end = motored(540) * (1 + K);
    return 1.1 + (end - 1.1) * Math.exp(-(q - 540) / 12);
  };
  return { r, l, area, swept, vc, vMax, x, vol, ivo, ivc, evo, evc, lift, sparkPhi, burned, pressure };
}

/**
 * @param {object} props
 * @param {number} props.bore mm @param {number} props.stroke mm @param {number} props.cr compression ratio
 * @param {number} props.camDuration °
 * @param {object} props.point the model's answer at the chosen RPM and load (a pull point)
 * @returns {React.ReactElement}
 */
export function EngineCutaway({ bore, stroke, cr, camDuration, point: p }) {
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

  const m = cylinderModel({
    bore, stroke, cr, camDuration, map: p.map ?? 100, peak: p.peakPressure ?? 60, peakDeg: p.peakPressureDeg ?? 15,
    timing: p.timing ?? 20, burnDeg: p.burnDeg ?? 50,
  });
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
  const liftIn = m.lift(phi < 600 ? phi : phi - 720, m.ivo, m.ivc);
  const liftEx = m.lift(phi < 100 ? phi + 720 : phi, m.evo, m.evc);
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

  // ---- the p-V diagram, drawn as the cycle goes ----
  const PW = 150; const PH = 120;
  const pMax = Math.max(10, (p.peakPressure ?? 60) * 1.1);
  const vx = (v) => 10 + ((v - m.vc) / (m.vMax - m.vc)) * (PW - 20);
  const py = (pr) => PH - 10 - (Math.log10(Math.max(0.3, pr)) - Math.log10(0.3)) / (Math.log10(pMax) - Math.log10(0.3)) * (PH - 20);
  const loop = [];
  for (let a = 0; a < 720; a += 6) loop.push(`${vx(m.vol(a % 360)).toFixed(1)},${py(m.pressure(a)).toFixed(1)}`);


  return (
    <div className={styles.cutWrap}>
      <ol className={styles.strokeBar} aria-label="The four strokes">
        {STROKES.map(([name], j) => (
          <li key={name} className={styles.strokePill} data-on={j === strokeIdx ? 'true' : undefined}>{name}</li>
        ))}
      </ol>
      <div className={styles.cutSplit}>
        <svg viewBox={`0 0 ${W} 520`} className={styles.cutSvg} role="img" aria-label={`One cylinder cut away at ${f(phi, 0)}° of the cycle: ${STROKES[strokeIdx][0].toLowerCase()} stroke, ${f(P, 1)} bar`}>
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
              <text x={lx} y={ly} className={styles.cutLabel} textAnchor={lx < W / 2 ? 'start' : 'end'}>{t}</text>
            </g>
          ))}
        </svg>
        <div className={styles.cutSide}>
          <p className={styles.cutStroke}><b>{STROKES[strokeIdx][0]}.</b> {STROKES[strokeIdx][1]}</p>
          <svg viewBox={`0 0 ${PW} ${PH}`} className={styles.pvSvg} role="img" aria-label={`Pressure against volume; now ${f(P, 1)} bar at ${f(V / 1000, 0)} cc`}>
            <polyline points={loop.join(' ')} className={styles.pvLoop} />
            <line x1={10} y1={PH - 10} x2={PW - 6} y2={PH - 10} className={styles.artAxis} />
            <line x1={10} y1={6} x2={10} y2={PH - 10} className={styles.artAxis} />
            <circle cx={vx(V)} cy={py(P)} r={4.5} className={styles.pvDot} />
            <text x={14} y={14} className={styles.artText}>p (log)</text>
            <text x={PW - 8} y={PH - 13} className={styles.artText} textAnchor="end">V</text>
          </svg>
          <dl className={styles.liveEq}>
            <dt>Crank angle</dt><dd>{f(phi, 0)}° of 720, {f(th, 0)}° from TDC</dd>
            <dt>Piston pin</dt><dd>x = r cos θ + √(l² − r² sin² θ) = {f(xNow, 1)} mm</dd>
            <dt>Volume</dt><dd>V = V<sub>c</sub> + A(l + r − x) = {f(m.vc / 1000, 0)} + {f(m.area / 100, 1)} cm² × {f((m.l + m.r - xNow) / 10, 2)} cm = {f(V / 1000, 0)} cc</dd>
            <dt>Pressure</dt><dd>{strokeIdx === 1 ? <>p = p<sub>ivc</sub>(V<sub>max</sub>/V)<sup>1.32</sup> = </> : strokeIdx === 2 ? <>p = p<sub>ivc</sub>(V<sub>max</sub>/V)<sup>1.32</sup> × (1 + K x<sub>b</sub>), x<sub>b</sub> = {f(m.burned(phi) * 100, 0)}% burned = </> : strokeIdx === 0 ? <>p ≈ MAP = </> : <>p ≈ exhaust back-pressure = </>}{f(P, 1)} bar</dd>
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
