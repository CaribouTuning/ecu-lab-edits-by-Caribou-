/**
 * The exhaust header on the Physics page: the bank from the exhaust side, its valves and
 * ports and the primary tubes merging in the collector. Every number and colour is the
 * model's (`gasExchangeTrace`); the shared parts are in cutawayParts.jsx.
 */

import React, { useMemo, useRef } from 'react';
import { COEFF } from '../../sim/index.js';

import cut from './Apps.module.css';
import {
  bankGeometry, bankOf, BlockFace, cardAngle, clamp01, CYCLE_SECONDS, CylinderStrip, hotMix, Labels, Lobe, PortChart, RAD, readAt, readers, roundedAlong, roundedPath, SectionHatch, segs, streaks, Streaks, strokeOf, STROKES, useCrank, Valve, wrap,
} from './cutawayParts.jsx';
import { fixed as f } from '../format.js';

/** @param {import('./IntakeCutaway.jsx').BreathingProps} props */
export function HeaderCutaway({ gx, point, derived, engineConfig }) {
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const R = useMemo(() => readers(gx), [gx]);
  const geo = gx.geometry; const ev = gx.events;
  const bank = useMemo(() => bankOf(engineConfig?.configuration ?? 'V6', geo.primariesPerCollector), [engineConfig?.configuration, geo.primariesPerCollector]);
  const travel = useRef(/** @type {number[]} */ ([]));
  const out = useRef(0);
  const tickRef = useRef(/** @type {((dt: number) => void)|null} */ (null));
  const { deg: d, setDeg, playing, setPlaying } = useCrank(wrapRef, tickRef);
  tickRef.current = (dt) => {
    bank.forEach((c, j) => { travel.current[j] = (travel.current[j] ?? 0) + (R.exFlow(d - c.offset) / R.maxFlow) * dt * 0.8; });
    out.current += dt * 0.22;
  };

  const W = 480;
  const camY = 34; const headTop = 22; const deckY = 128; const blockBot = 214;
  const g = bankGeometry({ derived, n: bank.length, W, deckY, bottomY: deckY + 250, margin: 84 });
  const centreEx = (ev.evo + ev.evc) / 2;
  const sparkD = wrap(360 - (point?.timing ?? 20));
  const PW = Math.min(g.pitch * 0.3, 22);
  const flangeY = 78;
  const valvesX = (x) => (geo.exhaustValves > 1 ? [x - g.halfBore * 0.45, x + g.halfBore * 0.45] : [x]);
  // A merge collector: the primaries meet side by side and a cone takes them down to the
  // outlet at a 15-degree included angle, the usual figure (Burns Stainless, "Collectors",
  // Vince in Shorts part one: about 15 degrees for most, 7 to 18 across applications).
  const colX = W / 2 + 10; const colTop = 300;
  const spacing = PW + 2;
  const inletHalf = (spacing * bank.length) / 2 + 3; const outletHalf = PW * 0.8;
  const coneLen = Math.min(150, (inletHalf - outletHalf) / Math.tan(7.5 * RAD));
  const colY = colTop + coneLen;
  const stripY = colY + 72;
  const H = stripY + 196;
  const primaries = useMemo(() => g.xs.map((x, j) => {
    const mx = colX + (j - (bank.length - 1) / 2) * spacing;
    return /** @type {[number, number][]} */ ([[x, flangeY], [x, flangeY + 70 + j * 10], [x + (mx - x) * 0.55, 250 + j * 8], [mx, colTop - 30], [mx, colTop]]);
  }), [g.xs, bank.length, colX, spacing]);
  const primaryPts = useMemo(() => primaries.map((p) => roundedAlong(p, 26, 30)), [primaries]);
  /** @type {[number, number][]} */
  const outlet = [[colX, colY - 2], [colX, colY + 24], [W - 4, colY + 24]];
  const outletPts = useMemo(() => roundedAlong(outlet, 20, 26), [colX, colY]); // eslint-disable-line react-hooks/exhaustive-deps
  const half = gx.primaryRoundTripDeg / 2;
  const emp = gx.empKpa;
  const s1 = strokeOf(d);
  const port1 = R.exPort(d);
  const flow1 = R.exFlow(d);
  const burnedAt = (dd) => (strokeOf(dd) === 2 ? clamp01(1 - Math.exp(-5 * (wrap(dd - sparkD) / Math.max(30, point?.burnDeg ?? 50)) ** 3)) : 0);
  // The collector sees every primary's pulse as it arrives.
  const collKpa = bank.reduce((s, c) => s + R.exPort(d - c.offset - half), 0) / bank.length;
  const a = gx.exhaustSoundMs; const slowMo = Math.round(CYCLE_SECONDS / (120 / gx.rpm));
  const echo = wrap(ev.evo + gx.primaryRoundTripDeg);
  const n = bank.length;

  const labels = /** @type {[string, number, number, number, number][]} */ ([
    ['Camshaft', 8, 30, g.bx0 + 6, camY],
    ['Exhaust valves', W - 8, 30, (valvesX(g.xs[n - 1]).at(-1) ?? 0) + 6, deckY - 12],
    ['Ports', 8, 78, g.xs[0] - PW / 2 - 6, flangeY + 8],
    ['Cylinder head', 8, deckY - 20, g.bx0 + 4, deckY - 24],
    ['Block', W - 8, deckY + 60, g.bx1 - 6, deckY + 60],
    [`${geo.headers ? 'Primaries' : 'Runners'} ${f(geo.primaryLengthMm, 0)} × ${f(geo.primaryBoreMm, 0)} mm`, 8, 340, primaries[0][2][0] - PW / 2, primaries[0][2][1] + 14],
    [`Merge collector, ${n} into 1, 15°`, 8, colTop + coneLen / 2, colX - (inletHalf + outletHalf) / 2 - 4, colTop + coneLen / 2],
    ['To the catalytic converter', W - 8, colY + 50, W - 40, colY + 30],
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
          aria-label={`The exhaust header at ${gx.rpm} RPM: cylinder 1 on its ${STROKES[s1].toLowerCase()} stroke, its port at ${f(port1, 0)} kPa, the collector at ${f(collKpa, 0)} kPa`}>
          <SectionHatch />
          {/* the block from outside; the head cut open along its exhaust ports */}
          <BlockFace g={g} top={deckY} bottom={blockBot} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={deckY - headTop} className={cut.cutHead} />
          <rect x={g.bx0} y={headTop} width={g.bx1 - g.bx0} height={8} rx={3} className={cut.cutBlock} />
          <line x1={g.bx0 + 6} x2={g.bx1 - 6} y1={camY} y2={camY} className={cut.cutRod} style={{ strokeWidth: 5 }} />
          {g.xs.map((x, j) => {
            const dj = d - bank[j].offset;
            const lift = R.exLift(dj);
            const vx = valvesX(x);
            return (
              <g key={`v${j}`}>
                <path d={vx.length > 1
                  ? `M${x - PW / 2} ${flangeY} L${x + PW / 2} ${flangeY} L${vx[1] + g.halfBore * 0.3} ${deckY - 10} L${vx[1] - g.halfBore * 0.2} ${deckY - 10} L${x} ${flangeY + 16} L${vx[0] + g.halfBore * 0.2} ${deckY - 10} L${vx[0] - g.halfBore * 0.3} ${deckY - 10} Z`
                  : `M${x - PW / 2} ${flangeY} L${x + PW / 2} ${flangeY} L${x + g.halfBore * 0.34} ${deckY - 10} L${x - g.halfBore * 0.34} ${deckY - 10} Z`}
                  style={{ fill: hotMix(R.exPort(dj), emp) }} opacity={0.6 + 0.4 * lift} />
                {vx.map((v) => <Valve key={v} x={v} seatY={deckY - 8} lift={lift} halfBore={g.halfBore} topY={camY} />)}
                {vx.map((v) => <Lobe key={`l${v}`} x={v} y={camY} d={dj} centre={centreEx} size={Math.min(1, g.halfBore / 30)} />)}
                <text x={x} y={deckY + 14} className={cut.artText} textAnchor="middle">{bank[j].n}</text>
              </g>
            );
          })}
          {/* the primaries, in front of the block: steel tube, the gas and its pulses inside */}
          {primaries.map((pts, j) => <path key={`po${j}`} d={roundedPath(pts, 30)} fill="none" stroke="var(--cut-metal)" strokeWidth={PW + 3} strokeLinejoin="round" />)}
          {primaries.map((pts, j) => <path key={`pi${j}`} d={roundedPath(pts, 30)} fill="none" stroke="var(--cut-metal-dark)" strokeWidth={PW + 1} strokeLinejoin="round" />)}
          {primaryPts.map((pts, j) => {
            const dj = d - bank[j].offset;
            const m = pts.length - 1;
            return segs(pts).map(([x0, y0, x1, y1], i) => (
              <line key={`s${j}-${i}`} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: hotMix(R.exPort(dj - ((i + 0.5) / m) * half), emp) }} strokeWidth={PW - 2} />
            ));
          })}
          {g.xs.map((x) => <rect key={`f${x}`} x={x - PW / 2 - 7} y={flangeY - 6} width={PW + 14} height={10} rx={2} className={cut.cutBlock} />)}
          {/* collector: the primaries merge, then the outlet */}
          <path d={`M${colX - inletHalf - 4} ${colTop - 2} L${colX + inletHalf + 4} ${colTop - 2} L${colX + outletHalf + 4} ${colY} L${colX - outletHalf - 4} ${colY} Z`} style={{ fill: 'var(--cut-metal)' }} />
          <path d={`M${colX - inletHalf} ${colTop} L${colX + inletHalf} ${colTop} L${colX + outletHalf} ${colY} L${colX - outletHalf} ${colY} Z`} style={{ fill: hotMix(collKpa, emp) }} />
          <CylinderStrip bank={bank} d={d} R={R} derived={derived} W={W} y0={stripY} sparkD={sparkD} burnedAt={burnedAt}
            label="Each cylinder into this collector, in firing order" />
          <path d={roundedPath(outlet, 26)} fill="none" stroke="var(--cut-metal)" strokeWidth={PW * 1.5 + 3} />
          <path d={roundedPath(outlet, 26)} fill="none" style={{ stroke: hotMix(collKpa, emp) }} strokeWidth={PW * 1.5} />
          {/* the burned gas moving out */}
          {primaryPts.map((pts, j) => {
            const q = R.exFlow(d - bank[j].offset);
            return Math.abs(q) > 1 ? <g key={`e${j}`}><Streaks items={streaks(pts, travel.current[j] ?? 0, 6, 0.07, q < 0)} tone="burn" /></g> : null;
          })}
          <Streaks items={streaks(outletPts, out.current, 7, 0.06)} tone="burn" />
          <Labels items={labels} W={W} />
        </svg>
        <div className={cut.cutSide}>
          <p className={cut.cutStroke}>
            <b>Cylinder 1, {STROKES[s1].toLowerCase()}.</b>{' '}
            {R.exLift(d) > 0.02
              ? (wrap(d) < -150 && wrap(d) > -360)
                ? `Blowdown: the exhaust valve has cracked open on ${f((readAt(gx.trace.deg, gx.trace.cylKpa, wrap(d)) ?? 0) / 100, 1)} bar of burned gas, and the pulse runs down the primary at ${f(a, 0)} m/s.`
                : `The piston is pushing the rest out, ${f(flow1, 0)} g/s. ${port1 < emp ? 'The collector\'s inverted echo has arrived: the port is below the collector, pulling gas out.' : 'The port is above the collector: the piston is doing the work.'}`
              : 'Its exhaust valves are shut. The other cylinders\' pulses cross at the collector, each one\'s echo running back up the other primaries.'}
          </p>
          <PortChart gx={gx} ys={gx.trace.exPortKpa} refKpa={emp} d={wrap(d)} tone="ex" lift={gx.trace.exAreaMm2}
            marks={[[ev.evo, 'EVO'], [echo, 'echo'], [ev.evc, 'EVC']]} title="Exhaust port pressure" refName="collector pressure" valveName="exhaust valve" />
          <dl className={cut.liveEq}>
            <dt>Crank angle</dt><dd>{cardAngle(wrap(d))} (cylinder 1)</dd>
            <dt>Wave speed</dt><dd>a = √(γRT) = √({f(COEFF.GAMMA_BURNED, 2)} × 287 × {f(gx.exhaustK, 0)}) = {f(a, 0)} m/s</dd>
            <dt>Round trip</dt><dd>2L/a = 2 × {f(geo.primaryLengthMm / 1000, 3)} / {f(a, 0)} = {f(((2 * geo.primaryLengthMm) / 1000 / a) * 1000, 2)} ms = {f(gx.primaryRoundTripDeg, 0)}° of crank</dd>
            <dt>Collector</dt><dd>R = {f(geo.collectorReflection, 2)} ({n} primaries meet): the pulse comes back as suction</dd>
            <dt>Echo lands</dt><dd>EVO + {f(gx.primaryRoundTripDeg, 0)}° = {cardAngle(echo)}{echo > ev.ivo - 30 && echo < ev.evc + 30 ? ', in the overlap: it helps scavenge' : ''}</dd>
            <dt>Port now</dt><dd>p = {f(emp, 0)} {port1 >= emp ? '+' : '−'} {f(Math.abs(port1 - emp), 1)} = {f(port1, 0)} kPa; out {f(flow1, 0)} g/s</dd>
            <dt>Left behind</dt><dd>{f(gx.residualFrac * 100, 1)}% of the charge is last cycle&apos;s burned gas</dd>
          </dl>
          <div className={cut.cutControls}>
            <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={!playing}>{playing ? 'Pause' : 'Play'}</button>
            <input type="range" min={-360} max={359} value={Math.round(wrap(d))} aria-label="Crank angle" aria-valuetext={cardAngle(wrap(d))}
              onChange={(e) => { setPlaying(false); setDeg(Number(e.target.value)); }} />
          </div>
          <p className={cut.panelNote}>Shown {slowMo.toLocaleString('en-US')}× slower than {gx.rpm.toLocaleString('en-US')} RPM. Cylinders {bank.map((c) => c.n).join(', ')} into one collector, in their firing order. Orange where a pulse pushes, dark where its echo pulls.</p>
        </div>
      </div>
    </div>
  );
}
