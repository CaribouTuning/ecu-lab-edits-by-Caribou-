/**
 * The exhaust system on the Physics page: the collector's outlet, the oxygen sensors, the
 * catalytic converter's substrate, the muffler's chambers and the tailpipe, with the
 * pressure along the pipe under it. Every number is the model's (`gasExchangeTrace`'s
 * exhaust pipe, catalyst and losses); the shared parts are in cutawayParts.jsx.
 */

import React, { useCallback, useMemo, useRef } from 'react';

import cut from './Apps.module.css';
import styles from './Breathing.module.css';
import {
  along, bankOf, cardAngle, CYCLE_SECONDS, hotMix, Labels, readers, SectionHatch, streaks, Streaks, useCrank, wrap,
} from './cutawayParts.jsx';
import { Plot } from './Plot.jsx';
import { useUnits } from '../units.js';
import { fixed as f } from '../format.js';

// Where each part sits along a typical car's exhaust, metres from the collector: it times the
// pulses and the gas on screen, and is drawn to it. The model prices each part by its loss
// coefficient (exhaustSystemDropKpa), not by its length.
const SYS = { o2a: 0.25, catIn: 0.45, catOut: 0.8, o2b: 0.95, mufIn: 2.0, mufOut: 2.55, tip: 3.0 };

/** @param {import('./IntakeCutaway.jsx').BreathingProps} props */
export function ExhaustSystemCutaway({ gx, engineConfig, mods = {} }) {
  const U = useUnits();
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const geo = gx.geometry;
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6', geo.primariesPerCollector), [engineConfig?.configuration, geo.primariesPerCollector]);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const flowT = useRef(0);
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);

  // The gas in the pipe as the model prices its loss: all of the flow through the one pipe,
  // its density, speed and dynamic pressure, and its speed of sound (gasExchangeTrace).
  const pipe = gx.exhaustPipe;
  const flowKgS = pipe.flowKgS; const T = pipe.gasK; const pipeA = pipe.areaM2;
  const L = SYS.tip;
  const drop = gx.exhaustDropKpa;
  const catLoss = drop.catalyst; const backLoss = drop.catback;
  // Static pressure along the pipe: the cat's loss across the cat, the cat-back's down the
  // rest (the model prices the pipe and the muffler as one loss).
  const staticAt = (s) => {
    if (s <= SYS.catIn) return 101.3 + catLoss + backLoss;
    if (s <= SYS.catOut) return 101.3 + backLoss + catLoss * (1 - (s - SYS.catIn) / (SYS.catOut - SYS.catIn));
    return 101.3 + backLoss * (1 - (s - SYS.catOut) / (L - SYS.catOut));
  };
  const rho = pipe.densityKgM3; const u = pipe.speedMs; const q = pipe.dynamicKpa * 1000; const a = pipe.soundMs;
  const slowMo = CYCLE_SECONDS / (120 / gx.rpm);
  tickRef.current = (dt) => { flowT.current += (u / slowMo / L) * dt; };
  const half = gx.primaryRoundTripDeg / 2;
  const collRaw = useCallback((dd) => bank.reduce((sum, c) => sum + R.exPort(dd - c.offset - half), 0) / bank.length, [R, bank, half]);
  // The collector's pulses about their own average over the cycle (the average is the static
  // back-pressure, drawn separately), and their size, which sets the colour scale.
  const pulse = useMemo(() => {
    const xs = []; for (let dd = -360; dd < 360; dd += 4) xs.push(collRaw(dd));
    const mean = xs.reduce((a0, b0) => a0 + b0, 0) / xs.length;
    return { mean, amp: Math.max(1, ...xs.map((v) => Math.abs(v - mean))) };
  }, [collRaw]);
  const collAt = (dd) => collRaw(dd) - pulse.mean;
  const degPerSec = gx.rpm * 6;
  // A pulse runs at a + u; the converter's cells and the muffler's chambers take it out.
  const atten = (s) => (s < SYS.catIn ? 1 : s < SYS.catOut ? 1 - 0.5 * ((s - SYS.catIn) / (SYS.catOut - SYS.catIn)) : s < SYS.mufIn ? 0.5 : s < SYS.mufOut ? 0.5 - 0.42 * ((s - SYS.mufIn) / (SYS.mufOut - SYS.mufIn)) : 0.08);
  const pAt = (s) => staticAt(s) + collAt(d - (s / (a + u)) * degPerSec) * atten(s);

  const W = 960; const H = 260; const y0 = 120; const x0 = 20; const x1 = W - 40;
  const X = (s) => x0 + (s / L) * (x1 - x0);
  const P = 30; // pipe height on screen
  const catKind = mods.catalyst ?? 'ceramic';
  const free = !!mods.exhaust;
  const N = 120;
  const pipeCells = Array.from({ length: N }, (_, i) => (i + 0.5) / N * L);
  const ref = staticAt(0);
  const gasFill = (s) => hotMix(ref + ((pAt(s) - staticAt(s)) / pulse.amp) * 30, ref);
  // The converter's honeycomb, as the model prices it (catalystSubstrate).
  const sub = gx.catalyst ?? { cpsi: 0, wallIn: 0, channelIn: 0, openArea: 1 };
  const catCpsi = sub.cpsi; const catWall = sub.wallIn; const dh = sub.channelIn; const ofa = sub.openArea;
  const catRows = catKind === 'metallic' ? 9 : 13;
  // Muffler gas path: in through the perforated inlet tube to the rear chamber, back through
  // the return tube to the front one, out through the outlet tube.
  const mx0 = X(SYS.mufIn); const mx1 = X(SYS.mufOut); const mw = mx1 - mx0;
  const mufPath = useMemo(() => /** @type {[number, number][]} */ (free ? [[mx0, y0], [mx1, y0]] : [[mx0, y0 - 18], [mx0 + mw * 0.82, y0 - 18], [mx0 + mw * 0.92, y0], [mx0 + mw * 0.82, y0 + 18], [mx0 + mw * 0.18, y0 + 18], [mx0 + mw * 0.08, y0], [mx0 + mw * 0.2, y0 - 2], [mx1, y0 - 2]]), [free, mx0, mx1, mw, y0]);
  const pipeStart = X(0); const pipeEnd = X(L);
  // The gas's whole way through: the pipe, the muffler's passes, the tailpipe. Laid out once
  // per drawing: it changes only with the muffler and the drawing's width.
  const pathPts = useMemo(() => along(/** @type {[number, number][]} */ ([[pipeStart, y0], [mx0, y0], ...mufPath, [pipeEnd, y0], [W - 6, y0]]), 160),
    [mufPath, mx0, pipeStart, pipeEnd, y0, W]);
  const puffs = Array.from({ length: 4 }, (_, i) => ((flowT.current * 3 + i / 4) % 1));
  const dropRows = /** @type {[string, number][]} */ ([
    [geo.headers ? 'Headers' : 'Cast manifold', drop.manifold],
    [catKind === 'none' ? 'Test pipe' : catKind === 'metallic' ? 'High-flow catalyst' : 'Catalyst', drop.catalyst],
    [free ? 'Free-flow cat-back' : 'Stock cat-back', drop.catback],
    ...(drop.turbine > 0 ? /** @type {[string, number][]} */ ([['Turbine', drop.turbine]]) : []),
  ]);
  const dropTotal = dropRows.reduce((s, [, v]) => s + v, 0);
  // The pressure strip under the drawing.
  // Both traces and the air outside inside the plot, a kPa of room either side.
  const pAll = [...pipeCells.map(pAt), ...pipeCells.map(staticAt), 101.3, ref];
  const pLo = Math.min(...pAll) - 1; const pHi = Math.max(...pAll) + 1;

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['From the collector', 8, y0 - 46, X(0.08), y0 - P / 2],
    ['Oxygen sensor (upstream)', X(SYS.o2a) - 30, 22, X(SYS.o2a), y0 - P / 2 - 26],
    [catKind === 'none' ? 'Test pipe' : `${catKind === 'metallic' ? 'High-flow catalyst' : 'Catalytic converter'}, ${catCpsi} cells/in²`, X((SYS.catIn + SYS.catOut) / 2) - 70, H - 20, X((SYS.catIn + SYS.catOut) / 2), y0 + 38],
    ['Oxygen sensor (downstream)', X(SYS.o2b) + 10, 46, X(SYS.o2b), y0 - P / 2 - 26],
    [free ? 'Straight-through muffler' : 'Muffler: three passes, two baffles', mx0 + 10, 22, mx0 + mw * 0.4, y0 - 46],
    [`${U.metric ? U.fmtLength(gx.exhaustPipe.pipeDiaIn) : `${gx.exhaustPipe.pipeDiaIn} in`} tailpipe`, W - 8, H - 20, X(2.85), y0 + P / 2],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <div className={styles.scroller}>
        <svg viewBox={`0 0 ${W} ${H}`} className={`${cut.cutSvg} ${styles.svg}`} role="img"
          aria-label={`The exhaust system at ${gx.rpm} RPM: ${f(u, 0)} m/s in the pipe, ${f(dropTotal, 1)} kPa of back-pressure`}>
          <SectionHatch />
          {/* the pipe: steel, and the gas in it */}
          <rect x={X(0) - 6} y={y0 - P / 2 - 4} width={X(L) - X(0) + 30} height={P + 8} rx={4} style={{ fill: 'var(--cut-metal)' }} />
          {pipeCells.map((s, i) => (
            <rect key={i} x={X(s - L / N / 2)} y={y0 - P / 2} width={(x1 - x0) / N + 0.8} height={P} style={{ fill: gasFill(s) }} />
          ))}
          {/* flanges at the joints, and the rubber hangers the pipe swings on */}
          {[0.12, SYS.catIn - 0.02, SYS.catOut + 0.02, SYS.mufIn - 0.04, SYS.mufOut + 0.04].map((s) => (
            <rect key={`fl${s}`} x={X(s) - 3} y={y0 - P / 2 - 9} width={6} height={P + 18} rx={2} className={cut.cutBlock} />
          ))}
          {[1.35, 2.8].map((s) => (
            <g key={`h${s}`}>
              <line x1={X(s)} x2={X(s)} y1={y0 - P / 2 - 4} y2={y0 - P / 2 - 26} className={cut.cutStem} />
              <rect x={X(s) - 9} y={y0 - P / 2 - 40} width={18} height={14} rx={5} className={cut.cutCase} />
            </g>
          ))}
          {/* oxygen sensors */}
          {[SYS.o2a, SYS.o2b].map((s) => (
            <g key={s}>
              <rect x={X(s) - 8} y={y0 - P / 2 - 12} width={16} height={10} rx={2} className={cut.cutBlock} />
              <rect x={X(s) - 4} y={y0 - P / 2 - 30} width={8} height={20} rx={2} className={cut.cutPlug} />
              <path d={`M${X(s)} ${y0 - P / 2 - 30} C ${X(s)} ${y0 - 70}, ${X(s) + 30} ${y0 - 64}, ${X(s) + 34} ${y0 - 84}`} fill="none" stroke="var(--ink3)" strokeWidth={2} />
            </g>
          ))}
          {/* the converter: shell, cones, and the substrate's channels the gas runs through */}
          {catKind !== 'none' && (
            <g>
              <path d={`M${X(SYS.catIn)} ${y0 - P / 2 - 4} L${X(SYS.catIn) + 22} ${y0 - 40} L${X(SYS.catOut) - 22} ${y0 - 40} L${X(SYS.catOut)} ${y0 - P / 2 - 4} L${X(SYS.catOut)} ${y0 + P / 2 + 4} L${X(SYS.catOut) - 22} ${y0 + 40} L${X(SYS.catIn) + 22} ${y0 + 40} L${X(SYS.catIn)} ${y0 + P / 2 + 4} Z`} style={{ fill: 'var(--cut-metal)' }} />
              <path d={`M${X(SYS.catIn) + 3} ${y0 - P / 2} L${X(SYS.catIn) + 24} ${y0 - 35} L${X(SYS.catOut) - 24} ${y0 - 35} L${X(SYS.catOut) - 3} ${y0 - P / 2} L${X(SYS.catOut) - 3} ${y0 + P / 2} L${X(SYS.catOut) - 24} ${y0 + 35} L${X(SYS.catIn) + 24} ${y0 + 35} L${X(SYS.catIn) + 3} ${y0 + P / 2} Z`}
                style={{ fill: gasFill((SYS.catIn + SYS.catOut) / 2) }} />
              <path d={`M${X(SYS.catIn) + 20} ${y0 - 48} L${X(SYS.catOut) - 20} ${y0 - 48}`} fill="none" stroke="var(--ink3)" strokeWidth={1.2} strokeDasharray="4 3" />
              <path d={`M${X(SYS.catIn) + 20} ${y0 + 48} L${X(SYS.catOut) - 20} ${y0 + 48}`} fill="none" stroke="var(--ink3)" strokeWidth={1.2} strokeDasharray="4 3" />
              <rect x={X(SYS.catIn) + 30} y={y0 - 33} width={X(SYS.catOut) - X(SYS.catIn) - 60} height={66} rx={4} style={{ fill: 'var(--cut-metal-dark)' }} />
              {Array.from({ length: catRows }, (_, i) => {
                const yy = y0 - 33 + ((i + 0.5) * 66) / catRows;
                return <line key={i} x1={X(SYS.catIn) + 30} x2={X(SYS.catOut) - 30} y1={yy} y2={yy} style={{ stroke: gasFill(SYS.catIn + 0.1) }} strokeWidth={(66 / catRows) * Math.sqrt(ofa) - 0.4} />;
              })}
              {Array.from({ length: 10 }, (_, i) => <line key={`v${i}`} x1={X(SYS.catIn) + 30 + ((i + 1) * (X(SYS.catOut) - X(SYS.catIn) - 60)) / 11} x2={X(SYS.catIn) + 30 + ((i + 1) * (X(SYS.catOut) - X(SYS.catIn) - 60)) / 11} y1={y0 - 33} y2={y0 + 33} stroke="var(--cut-metal-dark)" strokeWidth={0.8} opacity={0.6} />)}
            </g>
          )}
          {/* the muffler: its shell, baffles, perforated tubes (or a packed straight-through core) */}
          <rect x={mx0} y={y0 - 56} width={mw} height={112} rx={44} style={{ fill: 'var(--cut-metal)' }} />
          <rect x={mx0 + 4} y={y0 - 52} width={mw - 8} height={104} rx={40} className={cut.cutCase} />
          <path d={`M${mx0 + 10} ${y0 - 46} Q${mx0 + 2} ${y0} ${mx0 + 10} ${y0 + 46}`} fill="none" stroke="var(--cut-metal)" strokeWidth={3} />
          <path d={`M${mx1 - 10} ${y0 - 46} Q${mx1 - 2} ${y0} ${mx1 - 10} ${y0 + 46}`} fill="none" stroke="var(--cut-metal)" strokeWidth={3} />
          {free ? (
            <g>
              <rect x={mx0 + 12} y={y0 - 40} width={mw - 24} height={80} rx={30} className={cut.cutOil} opacity={0.35} />
              <rect x={mx0} y={y0 - P / 2} width={mw} height={P} style={{ fill: gasFill(SYS.mufIn + 0.2) }} />
              {Array.from({ length: 22 }, (_, i) => <circle key={i} cx={mx0 + 10 + i * ((mw - 20) / 21)} cy={y0 - P / 2 + 1} r={1.6} className={cut.cutHub} />)}
              {Array.from({ length: 22 }, (_, i) => <circle key={`b${i}`} cx={mx0 + 10 + i * ((mw - 20) / 21)} cy={y0 + P / 2 - 1} r={1.6} className={cut.cutHub} />)}
            </g>
          ) : (
            <g>
              {[0.33, 0.66].map((t) => <rect key={t} x={mx0 + mw * t - 2} y={y0 - 50} width={4} height={100} style={{ fill: 'var(--cut-metal)' }} />)}
              {[[mx0, mx0 + mw * 0.82, y0 - 18], [mx0 + mw * 0.18, mx0 + mw * 0.82, y0 + 18], [mx0 + mw * 0.2, mx1, y0 - 2]].map(([a0, a1, yy], i) => (
                <g key={i}>
                  <rect x={a0} y={yy - 7} width={a1 - a0} height={14} rx={3} style={{ fill: gasFill(SYS.mufIn + 0.15 * (i + 1)) }} />
                  {Array.from({ length: 10 }, (_, k) => <circle key={k} cx={a0 + 8 + (k * (a1 - a0 - 16)) / 9} cy={yy - 7} r={1.4} className={cut.cutHub} />)}
                </g>
              ))}
            </g>
          )}
          {/* tailpipe tip, the gas leaving it */}
          <path d={`M${X(L)} ${y0 - P / 2 - 4} L${X(L) + 26} ${y0 - P / 2 - 8} L${X(L) + 26} ${y0 + P / 2 + 8} L${X(L)} ${y0 + P / 2 + 4} Z`} style={{ fill: 'var(--ink-soft)' }} />
          <ellipse cx={X(L) + 26} cy={y0} rx={4} ry={P / 2 + 8} style={{ fill: 'var(--panel3)' }} stroke="var(--ink-soft)" strokeWidth={1.5} />
          {puffs.map((t, i) => <circle key={i} cx={X(L) + 30 + t * 30} cy={y0 + (i % 2 ? -4 : 4) * t} r={4 + t * 10} className={cut.gasSpent} opacity={0.5 * (1 - t)} />)}
          {/* the gas moving, at the speed it really flows (slowed with the rest) */}
          <Streaks items={streaks(pathPts, flowT.current, 30, 0.012)} tone="burn" width={2} />
          <Labels items={labels} W={W} />
        </svg>
      </div>
      <Plot
        title="Exhaust pressure along the pipe"
        sub={`${f(gx.exhaustFlowGs, 0)} g/s; ${f(ref, 1)} kPa at the collector, 101.3 outside`}
        xLabel="distance from the collector, m"
        yLabel="pressure, kPa (abs)"
        xDomain={[0, L]}
        yDomain={[Math.floor(pLo), Math.ceil(pHi)]}
        height={170}
        ariaLabel="Pressure along the exhaust, now and on average"
        legend={[
          { label: 'now (the pulses)', kind: 'line', tone: 'var(--cut-burn)' },
          { label: 'average (each part\'s loss)', kind: 'dash', tone: 'var(--ink2)' },
          { label: 'outside air, 101.3', kind: 'dots', tone: 'var(--ink3)' },
        ]}
      >
        {({ x, y, Y1 }) => (
          <>
            {/** @type {[number, string][]} */ ([[SYS.catIn, 'cat'], [SYS.mufIn, 'muffler']]).filter(([, t]) => t !== 'cat' || catKind !== 'none').map(([sx, t]) => (
              <g key={t}>
                <line x1={x(sx)} x2={x(sx)} y1={0} y2={Y1} className={styles.eventLine} />
                <text x={x(sx) + 3} y={18} className={styles.eventText}>{t}</text>
              </g>
            ))}
            <line x1={x(0)} x2={x(L)} y1={y(101.3)} y2={y(101.3)} className={styles.ambient} />
            <polyline points={pipeCells.map((sc) => `${x(sc).toFixed(1)},${y(staticAt(sc)).toFixed(1)}`).join(' ')} className={styles.stripMean} />
            <polyline points={pipeCells.map((sc) => `${x(sc).toFixed(1)},${y(pAt(sc)).toFixed(1)}`).join(' ')} className={styles.stripNow} />
          </>
        )}
      </Plot>
      <div className={styles.numbers}>
        <dl className={cut.liveEq}>
          <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
          <dt>Gas</dt><dd>ṁ = {f(flowKgS * 1000, 0)} g/s through this pipe, {f(T, 0)} K, ρ = p/RT = {f(rho, 3)} kg/m³ at the tailpipe</dd>
          <dt>Speed</dt><dd>u = ṁ/(ρA) = {f(flowKgS, 3)} / ({f(rho, 3)} × {f(pipeA * 1e4, 1)} cm²) = {f(u, 0)} m/s</dd>
          <dt>Dynamic pressure</dt><dd>q = ½ρu² = {f(q / 1000, 2)} kPa; each part loses K × q</dd>
          <dt>Pulses</dt><dd>run at a + u = {f(a, 0)} + {f(u, 0)} m/s: the length of the car in {f((L / (a + u)) * 1000, 1)} ms</dd>
          {catKind !== 'none' && <><dt>Substrate</dt><dd>{catCpsi} cells/in², {f(catWall * 1000, 1)} thou walls: channel {f(dh * 25.4, 2)} mm, {f(ofa * 100, 0)}% open; laminar loss ∝ 1/(OFA × d<sub>h</sub>²)</dd></>}
          <dt>Back-pressure</dt><dd>{f(gx.empKpa, 1)} kPa at the port side: {f(dropTotal, 1)} above the air outside</dd>
        </dl>
        <div className={styles.dropBox} aria-label="Exhaust back-pressure, part by part">
          <div className={styles.dropHead}>Exhaust back-pressure <b>{f(dropTotal, 1)} kPa</b> <span>({U.metric ? `${f(dropTotal / 100, 3)} bar` : `${f(dropTotal * 0.145, 2)} psi`}) at {f(gx.exhaustFlowGs, 0)} g/s</span></div>
          {dropRows.map(([kk, v]) => (
            <div key={kk} className={styles.dropRow}>
              <span>{kk}</span>
              <span className={styles.dropBar}><i style={{ width: `${dropTotal > 0 ? (v / dropTotal) * 100 : 0}%` }} /></span>
              <b>{f(v, 1)}</b>
            </div>
          ))}
          <p className={styles.dropNote}>Each part&apos;s loss goes as its coefficient times the pipe&apos;s dynamic pressure, ½ρu²: the bigger the pipe, the slower the gas and the smaller every loss. Change the pipe, catalyst or muffler on BUILD.</p>
        </div>
      </div>
      <div className={cut.cutControls}>
        <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
        <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
          onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
      </div>
      <p className={cut.panelNote}>Shown {Math.round(slowMo).toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM, drawn to a typical car&apos;s lengths. The gas crawls at its {f(u, 0)} m/s; the pressure pulses race through it at the speed of sound, and the converter and the muffler&apos;s chambers take them out.</p>
    </div>
  );
}
