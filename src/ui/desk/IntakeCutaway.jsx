/**
 * The intake on the Physics page: the air filter, the throttle body's butterfly, the plenum
 * and a runner to each cylinder of a bank, down through the ports past the valves into the
 * bores. Every number and colour is the model's (`gasExchangeTrace`); the shared parts are
 * in cutawayParts.jsx.
 */

import React, { useMemo, useRef } from 'react';

import cut from './Apps.module.css';
import {
  bankGeometry, bankOf, BlockFace, cardAngle, clamp01, CYCLE_SECONDS, CylinderStrip, freshMix, Labels, Lobe, PortChart, readers, roundedAlong, roundedPath, SectionHatch, segs, streaks, Streaks, strokeOf, STROKES, useCrank, Valve, wrap,
} from './cutawayParts.jsx';
import { fixed as f } from '../format.js';

/**
 * @typedef {object} BreathingProps
 * @property {any} gx the model's gas exchange at the page's speed and throttle (`gasExchangeTrace`)
 * @property {any} point the pull's point at that speed
 * @property {any} derived the engine's derived geometry
 * @property {any} engineConfig the engine as built
 * @property {any} [mods] its bolt-ons and catalyst
 * @property {number} [throttleFrac] the throttle's opening, 0-1
 */

/** @param {BreathingProps} props */
export function IntakeCutaway({ gx, point, derived, engineConfig, throttleFrac = 1 }) {
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6'), [engineConfig?.configuration]);
  const travel = useRef(/** @type {number[]} */ ([]));
  const inlet = useRef(0);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);
  tickRef.current = (dt) => {
    bank.forEach((c, j) => { travel.current[j] = (travel.current[j] ?? 0) + (R.inFlow(d - c.offset) / R.maxFlow) * dt * 0.8; });
    inlet.current += dt * 0.12 * clamp01(throttleFrac + 0.15);
  };

  const ev = gx.events; const geo = gx.geometry;
  const W = 480; const H = 616;
  const headTop = 232; const deckY = 318;
  const g = bankGeometry({ derived, n: bank.length, W, deckY, bottomY: deckY + 260, margin: 84 });
  const blockBot = deckY + 70; const stripY = blockBot + 14;
  const centreIn = (ev.ivo + ev.ivc) / 2;
  const sparkD = wrap(360 - (point?.timing ?? 20));
  const RW = Math.min(g.pitch * 0.34, 26);
  const flangeY = 276;
  const valvesX = (x) => (geo.intakeValves > 1 ? [x - g.halfBore * 0.45, x + g.halfBore * 0.45] : [x]);
  const plTop = 108; const plBot = 162;
  const tbX = 146; const tbY = 46;
  const runners = useMemo(() => g.xs.map((x) => /** @type {[number, number][]} */ ([[x + g.pitch * 0.22, plBot - 6], [x + g.pitch * 0.22, plBot + 22], [x, plBot + 66], [x, flangeY]])), [g.xs, g.pitch]);
  const runnerPts = useMemo(() => runners.map((pts) => roundedAlong(pts, 22, 18)), [runners]);
  // The air's way in: the filter, the throttle body, the elbow and along the plenum.
  const inletPts = useMemo(() => roundedAlong(/** @type {[number, number][]} */ ([[24, tbY], [tbX, tbY], [232, tbY], [232, plTop + 8], [W - 40, plTop + 26]]), 40, 18), [tbX, tbY, plTop, W]);
  const half = gx.runnerRoundTripDeg / 2;
  const mapKpa = gx.mapKpa;
  const s1 = strokeOf(d);
  const port1 = R.inPort(d);
  const flow1 = R.inFlow(d);
  const burnedAt = (dd) => (strokeOf(dd) === 2 ? clamp01(1 - Math.exp(-5 * ((wrap(dd - sparkD) + 0) / Math.max(30, point?.burnDeg ?? 50)) ** 3)) : 0);
  const butterfly = 90 - clamp01(throttleFrac) * 84;
  const intakeK = gx.intakeK; const a = gx.intakeSoundMs;
  const slowMo = Math.round(CYCLE_SECONDS / (120 / gx.rpm));

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['Air filter', 8, 98, 36, 80],
    [`Throttle ${f(throttleFrac * 100, 0)}% open`, W - 8, 24, tbX + 22, tbY - 8],
    [`Plenum ${f(mapKpa, 0)} kPa`, W - 8, plTop - 8, g.bx1 + 10, plTop + 12],
    [`Runner ${f(geo.runnerLengthMm, 0)} mm`, 8, plBot + 40, g.xs[0] + g.pitch * 0.22 - RW / 2, plBot + 30],
    ['Camshaft', W - 8, headTop + 4, g.bx1 - 8, headTop + 22],
    ['Intake valves', 8, headTop + 34, valvesX(g.xs[0])[0] - 6, deckY - 10],
    ['Ports', 8, headTop + 66, g.xs[0] - RW / 2, flangeY + 14],
    ['Chambers', W - 8, deckY - 18, g.xs[g.xs.length - 1] + g.halfBore * 0.5, deckY - 5],
    ['Block', 8, deckY + 44, g.bx0 + 4, deckY + 44],
  ]);

  return (
    <div className={cut.cutWrap} ref={wrapRef}>
      <div className={cut.strokeRow}>
        <span className={cut.strokeLabel}>Cylinder 1 is on its</span>
        <ol className={cut.strokeBar} aria-label="Cylinder 1's stroke">
          {STROKES.map((name, j) => <li key={name} className={cut.strokePill} data-on={j === s1 ? 'true' : undefined} aria-current={j === s1 ? 'step' : undefined}>{name}</li>)}
        </ol>
      </div>
      <div className={cut.cutSplit}>
        <svg viewBox={`0 0 ${W} ${H}`} className={cut.cutSvg} role="img"
          aria-label={`The intake at ${gx.rpm} RPM: plenum ${f(mapKpa, 0)} kPa, cylinder 1 on its ${STROKES[s1].toLowerCase()} stroke, its port at ${f(port1, 0)} kPa`}>
          <SectionHatch />
          {/* air filter, its pleated element */}
          <rect x={10} y={16} width={74} height={62} rx={3} className={cut.cutCase} />
          <rect x={18} y={24} width={28} height={46} rx={3} className={cut.cutOil} />
          {Array.from({ length: 6 }, (_, i) => <line key={i} x1={21 + i * 4.4} x2={21 + i * 4.4} y1={26} y2={68} className={cut.cutRing} />)}
          {/* the inlet duct, throttle body and the elbow into the plenum */}
          <path d={roundedPath([[84, tbY], [232, tbY], [232, plTop + 6]], 22)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={24} />
          <path d={roundedPath([[84, tbY], [232, tbY], [232, plTop + 6]], 22)} fill="none" style={{ stroke: freshMix(101.3, mapKpa) }} strokeWidth={20} />
          <circle cx={tbX} cy={tbY} r={23} className={cut.cutCase} />
          <circle cx={tbX} cy={tbY} r={13} style={{ fill: freshMix(mapKpa, mapKpa) }} />
          <line x1={tbX} y1={tbY - 13} x2={tbX} y2={tbY + 13} className={cut.cutStem} transform={`rotate(${butterfly.toFixed(1)} ${tbX} ${tbY})`} />
          <circle cx={tbX} cy={tbY} r={2.5} className={cut.cutHub} />
          {/* plenum */}
          <rect x={g.bx0 + 10} y={plTop} width={g.bx1 - g.bx0 + 20} height={plBot - plTop} rx={8} className={cut.cutCase} />
          <rect x={g.bx0 + 18} y={plTop + 7} width={g.bx1 - g.bx0 + 4} height={plBot - plTop - 14} rx={4} style={{ fill: freshMix(mapKpa, mapKpa) }} />
          {/* head: cam cover, camshaft, the ports' channels and the valves */}
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={deckY - headTop} className={cut.cutHead} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={10} rx={3} className={cut.cutBlock} />
          <line x1={g.bx0 + 6} x2={g.bx1 - 6} y1={headTop + 22} y2={headTop + 22} className={cut.cutRod} style={{ strokeWidth: 5 }} />
          {g.xs.map((x, j) => {
            const dj = d - bank[j].offset;
            const kpa = R.inPort(dj);
            const lift = R.inLift(dj);
            const vx = valvesX(x);
            return (
              <g key={`p${j}`}>
                <path d={vx.length > 1
                  ? `M${x - RW / 2} ${flangeY} L${x + RW / 2} ${flangeY} L${vx[1] + g.halfBore * 0.32} ${deckY - 10} L${vx[1] - g.halfBore * 0.22} ${deckY - 10} L${x} ${flangeY + 18} L${vx[0] + g.halfBore * 0.22} ${deckY - 10} L${vx[0] - g.halfBore * 0.32} ${deckY - 10} Z`
                  : `M${x - RW / 2} ${flangeY} L${x + RW / 2} ${flangeY} L${x + g.halfBore * 0.36} ${deckY - 10} L${x - g.halfBore * 0.36} ${deckY - 10} Z`}
                  style={{ fill: freshMix(kpa, mapKpa) }} opacity={0.55 + 0.45 * lift} />
                {vx.map((v) => <Valve key={v} x={v} seatY={deckY - 8} lift={lift} halfBore={g.halfBore} topY={headTop + 22} />)}
                {vx.map((v) => <Lobe key={`c${v}`} x={v} y={headTop + 22} d={dj} centre={centreIn} size={Math.min(1, g.halfBore / 30)} />)}
              </g>
            );
          })}
          {/* the block from outside, bores behind it dashed; each cylinder's chamber in the cut head */}
          <BlockFace g={g} top={deckY} bottom={blockBot} />
          {g.xs.map((x, j) => {
            const st = strokeOf(wrap(d - bank[j].offset));
            return <path key={`ch${j}`} d={`M${x - g.halfBore} ${deckY} L${x} ${deckY - 12} L${x + g.halfBore} ${deckY} Z`} className={st <= 1 ? cut.gasFresh : st === 2 ? cut.gasBurn : cut.gasSpent} opacity={0.75} />;
          })}
          {g.xs.map((x, j) => <text key={`n${j}`} x={x} y={deckY + 16} className={cut.artText} textAnchor="middle">{bank[j].n}</text>)}
          <CylinderStrip bank={bank} d={d} R={R} derived={derived} W={W} y0={stripY} sparkD={sparkD} burnedAt={burnedAt}
            label="Each cylinder, at its own place in the firing order" />
          {/* runners: the wave in each, at its cylinder's place in the cycle */}
          {runners.map((pts, j) => (
            <path key={`ro${j}`} d={roundedPath(pts, 18)} fill="none" stroke="var(--cut-metal)" strokeWidth={RW + 3} />
          ))}
          {runnerPts.map((pts, j) => {
            const dj = d - bank[j].offset;
            const n = pts.length - 1;
            return segs(pts).map(([x0, y0, x1, y1], i) => (
              <line key={`r${j}-${i}`} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: freshMix(R.inPort(dj - (1 - (i + 0.5) / n) * half), mapKpa) }} strokeWidth={RW} />
            ));
          })}
          {g.xs.map((x) => <rect key={`fl${x}`} x={x - RW / 2 - 6} y={flangeY - 5} width={RW + 12} height={8} rx={2} className={cut.cutBlock} />)}
          {/* the charge moving */}
          <Streaks items={streaks(inletPts, inlet.current, 14, 0.035)} tone="fresh" />
          {runnerPts.map((pts, j) => {
            const q = R.inFlow(d - bank[j].offset);
            return Math.abs(q) > 1 ? <g key={`d${j}`}><Streaks items={streaks(pts, travel.current[j] ?? 0, 5, 0.09, q < 0)} tone="fresh" /></g> : null;
          })}
          <Labels items={labels} W={W} />
        </svg>
        <div className={cut.cutSide}>
          <p className={cut.cutStroke}>
            <b>Cylinder 1, {STROKES[s1].toLowerCase()}.</b>{' '}
            {R.inLift(d) > 0.02
              ? flow1 >= 0
                ? `Its intake valves are ${f(R.inLift(d) * 100, 0)}% open and ${f(flow1, 0)} g/s is going in. The runner's wave sets the pressure at the valve: ${port1 >= mapKpa ? 'now above' : 'now below'} the plenum by ${f(Math.abs(port1 - mapKpa), 1)} kPa.`
                : `The piston is pushing charge back up the runner, ${f(-flow1, 0)} g/s: the valve is still open past bottom dead centre and the port is below the cylinder's pressure.`
              : 'Its intake valves are shut. The runner still rings with the wave the last opening started; the next cylinder in the firing order draws on the plenum.'}
          </p>
          <PortChart gx={gx} ys={gx.trace.inPortKpa} refKpa={mapKpa} d={wrap(d)} tone="in" lift={gx.trace.inAreaMm2}
            marks={[[ev.ivo, 'IVO'], [ev.ivc, 'IVC']]} title="Intake port pressure" refName="plenum pressure" valveName="intake valve" />
          <dl className={cut.liveEq}>
            <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
            <dt>Throttle</dt><dd>{f(throttleFrac * 100, 0)}% open: 101.3 → {f(mapKpa, 0)} kPa in the plenum</dd>
            <dt>Wave speed</dt><dd>a = √(γRT) = √(1.4 × 287 × {f(intakeK, 0)}) = {f(a, 0)} m/s</dd>
            <dt>Round trip</dt><dd>2L/a = 2 × {f(geo.runnerLengthMm / 1000, 3)} / {f(a, 0)} = {f((2 * geo.runnerLengthMm) / 1000 / a * 1000, 2)} ms = {f(gx.runnerRoundTripDeg, 0)}° of crank</dd>
            <dt>Plenum end</dt><dd>R = {f(geo.runnerReflection, 2)}: a wave comes back {geo.runnerReflection < 0 ? 'inverted, suction as pressure' : 'the same sign'}</dd>
            <dt>Valve flow</dt><dd>ṁ = C<sub>d</sub>A p<sub>up</sub> ψ / √(RT) = {f(flow1, 0)} g/s</dd>
            <dt>Filling</dt><dd>VE {f(gx.ve, 1)}%, {f(gx.backflowShare * 100, 1)}% pushed back up the runner</dd>
          </dl>
          <div className={cut.cutControls}>
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
              onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
          </div>
          <p className={cut.panelNote}>Shown {slowMo.toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM. Cylinders {bank.map((c) => c.n).join(', ')} in their firing order; each runner lighter where its wave is high, darker in its suction.</p>
        </div>
      </div>
    </div>
  );
}
