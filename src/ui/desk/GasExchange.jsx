/**
 * The Physics app's breathing, laid open and running: air in through the filter, throttle,
 * plenum and runner, the cylinder with its valves and piston on the crank, and the exhaust
 * out through the port, primary, collector, catalyst and cat-back. Everything moves with one
 * crank angle, slowed down so the eye can follow it, and every number and colour comes from
 * the model at the speed and throttle the page is set to:
 *
 *   - the gas exchange (`gasExchangeTrace`, breathing.js): from the exhaust valve opening to
 *     the intake valve closing, the cylinder's pressure, each port's pressure (the wave
 *     arriving plus the one leaving), each valve's flow and open area, step by step;
 *   - the closed cycle (the pull's `cycleTrace`, cycle.js): compression, the burn and the
 *     expansion, between the intake closing and the exhaust opening;
 *   - the pipes' waves, drawn down each pipe from its port end's pressure record: what left
 *     the port x metres back left it x / a seconds ago, the outgoing wave's view of the line.
 *
 * Nothing here is a second model. Where the two traces meet (the seat timing of the valves
 * against the cycle's 0.050-inch events) the picture changes source, not physics.
 *
 * The frame is redrawn by writing attributes straight into the SVG from one animation-frame
 * loop, not through React state, and stops whenever it is off screen, the tab is hidden or the
 * system asks for less motion: it costs nothing on the pages a player is not looking at.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { COEFF, gasExchangeTrace } from '../../sim/index.js';

import styles from './GasExchange.module.css';

/** Seconds one engine cycle takes on screen, whatever the engine speed. */
const CYCLE_SECONDS = 3.2;
/** Segments each pipe's wave is drawn in. */
const PIPE_SEGMENTS = 28;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/**
 * A pressure as a colour: below the plenum's or the collector's own pressure toward cyan
 * (suction), above it toward red (pressure), on a scale of `span` kPa either way.
 * @param {number} kpa @param {number} ref @param {number} span
 */
function pressureColour(kpa, ref, span) {
  const x = Math.max(-1, Math.min(1, (kpa - ref) / span));
  // Neutral grey to cyan or to red: the theme's --cyan (#38d9f0) and --danger (#ff4d4d).
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const base = [96, 98, 104];
  const to = x < 0 ? [56, 217, 240] : [255, 77, 77];
  const t = Math.abs(x);
  return `rgb(${mix(base[0], to[0], t)},${mix(base[1], to[1], t)},${mix(base[2], to[2], t)})`;
}

/**
 * Reads a record (`xs` ascending crank degrees) at `deg`, linearly; null outside it.
 * @param {number[]} xs @param {number[]} ys @param {number} deg
 */
function readAt(xs, ys, deg) {
  if (!xs?.length || deg < xs[0] || deg > xs[xs.length - 1]) return null;
  let lo = 0; let hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= deg) lo = mid; else hi = mid; }
  const t = xs[hi] === xs[lo] ? 0 : (deg - xs[lo]) / (xs[hi] - xs[lo]);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/** Wraps a crank angle into [-360, 360). @param {number} d */
const wrap = (d) => ((((d + 360) % 720) + 720) % 720) - 360;

/** Crank angle, degrees after TDC on overlap, as a cam card would say it. @param {number} d */
function cardAngle(d) {
  // The gas exchange's frame: 0 is TDC between the exhaust and intake strokes, -180 BDC of
  // the power stroke, +180 BDC of the intake stroke.
  if (d < -180) return `${f(-180 - d, 0)}° BBDC`;
  if (d < 0) return `${f(-d, 0)}° BTDC`;
  if (d <= 180) return `${f(d, 0)}° ATDC`;
  return `${f(d - 180, 0)}° ABDC`;
}

/**
 * @param {object} props
 * @param {any} props.engineConfig the engine as built
 * @param {any} props.mods its bolt-ons (and catalyst)
 * @param {any} props.hwForVe the breathing's hardware argument (exhaust pipe, turbo, fuel)
 * @param {((rpm: number, kpa: number) => number)|null} props.camAt the calibrated intake cam advance
 * @param {any} props.point the pull's point at the chosen speed
 * @param {{deg: number[], bar: number[], burned: number[]}|null} props.cycleTrace that point's closed cycle
 * @param {any} props.derived the engine's derived geometry
 */
export function GasExchange({ engineConfig, mods, hwForVe, camAt, point, cycleTrace, derived }) {
  const rpm = point?.rpm ?? 3000;
  const mapKpa = point?.map ?? 100;
  const advance = camAt ? camAt(rpm, mapKpa) : 0;
  const gx = useMemo(
    () => gasExchangeTrace(engineConfig, mods ?? {}, { ...hwForVe, intakeCamAdvanceDeg: advance }, rpm, mapKpa),
    [engineConfig, mods, hwForVe, advance, rpm, mapKpa],
  );
  const svgRef = useRef(/** @type {SVGSVGElement|null} */ (null));
  const [paused, setPaused] = useState(false);
  const [scrub, setScrub] = useState(/** @type {number|null} */ (null));
  const scrubRef = useRef(scrub);
  scrubRef.current = scrub;
  const readoutRef = useRef(/** @type {HTMLParagraphElement|null} */ (null));
  const wrapRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  // The crank angle survives a re-render: a new trace carries on from where the last one was.
  const degRef = useRef(-360);

  const tr = gx.trace;
  const ev = gx.events;
  const geo = gx.geometry;
  // Where the two records hand over: the gas exchange runs EVO..IVC in its own frame; the
  // closed cycle is in the firing frame (0 at firing TDC = +/-360 here).
  const gasLo = tr.deg[0]; const gasHi = tr.deg[tr.deg.length - 1];
  const cyc = useMemo(() => {
    if (!cycleTrace?.deg?.length) return null;
    const deg = cycleTrace.deg.map((d) => d + 360);
    return { deg, bar: cycleTrace.bar, burned: cycleTrace.burned };
  }, [cycleTrace]);
  const peakBar = Math.max(...(cyc?.bar ?? [10]), ...tr.cylKpa.map((k) => k / 100));

  // The drawing's fixed geometry, in a 960 x 360 frame.
  const L = useMemo(() => {
    const runnerPx = Math.max(70, Math.min(230, geo.runnerLengthMm * 0.32));
    const primaryPx = Math.max(60, Math.min(230, geo.primaryLengthMm * 0.22));
    const cylX = 64 + 52 + 40 + runnerPx + 30; // filter, throttle, plenum, runner, port
    return { runnerPx, primaryPx, cylX, cylW: 96, cylTop: 96, cylH: 132 };
  }, [geo.runnerLengthMm, geo.primaryLengthMm]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const q = (sel) => /** @type {SVGElement|null} */ (svg.querySelector(sel));
    const runnerSegs = [...svg.querySelectorAll('[data-runner-seg]')];
    const primarySegs = [...svg.querySelectorAll('[data-primary-seg]')];
    const piston = q('[data-piston]'); const rod = q('[data-rod]'); const pin = q('[data-crankpin]');
    const inValve = q('[data-in-valve]'); const exValve = q('[data-ex-valve]');
    const gas = q('[data-cyl-gas]'); const flame = q('[data-flame]');
    const inArrow = q('[data-in-flow]'); const exArrow = q('[data-ex-flow]');
    const cursorP = q('[data-cursor-p]'); const cursorPort = q('[data-cursor-port]');
    const strokeLabel = q('[data-stroke]');
    const maxIn = Math.max(...tr.inAreaMm2, 1); const maxEx = Math.max(...tr.exAreaMm2, 1);
    const maxFlow = Math.max(...tr.inFlowGs.map(Math.abs), ...tr.exFlowGs.map(Math.abs), 1);
    const rodRatio = COEFF.ROD_RATIO;
    const crankR = 22; const travel = 64;
    // Half a round trip of each pipe, in crank degrees: how long ago the wave a given way
    // down the pipe left its port end.
    const halfRunner = gx.runnerRoundTripDeg / 2; const halfPrimary = gx.primaryRoundTripDeg / 2;
    const plenumKpa = mapKpa; const collectorKpa = gx.empKpa;

    /** The cylinder's pressure at a crank angle, kPa, from whichever record covers it. */
    const cylKpa = (d) => {
      const g = readAt(tr.deg, tr.cylKpa, d);
      if (g != null) return g;
      const c = cyc ? readAt(cyc.deg, cyc.bar, d < gasLo ? d + 720 : d) : null;
      return c != null ? c * 100 : plenumKpa;
    };
    const burnedAt = (d) => (cyc ? readAt(cyc.deg, cyc.burned, d < gasLo ? d + 720 : d) ?? 0 : 0);
    // Port-end pressures outside the gas exchange: a shut valve, the pipe at its own end's.
    const exPortAt = (d) => readAt(tr.deg, tr.exPortKpa, d) ?? collectorKpa;
    const inPortAt = (d) => readAt(tr.deg, tr.inPortKpa, d) ?? plenumKpa;

    const draw = (deg) => {
      const d = wrap(deg);
      // Piston and crank: firing TDC at +/-360, overlap TDC at 0, so the crank angle from TDC is d itself.
      const th = (d * Math.PI) / 180;
      const s = Math.sin(th); const c = Math.cos(th);
      const down = (1 - c) / 2 + (rodRatio - Math.sqrt(Math.max(0, rodRatio * rodRatio - s * s))) / 2;
      const py = L.cylTop + 18 + down * travel;
      const cx = L.cylX + L.cylW / 2; const cy = L.cylTop + L.cylH + 44;
      piston?.setAttribute('y', String(py));
      pin?.setAttribute('cx', String(cx + crankR * s)); pin?.setAttribute('cy', String(cy - crankR * c));
      rod?.setAttribute('x1', String(cx)); rod?.setAttribute('y1', String(py + 22));
      rod?.setAttribute('x2', String(cx + crankR * s)); rod?.setAttribute('y2', String(cy - crankR * c));
      gas?.setAttribute('height', String(Math.max(2, py - L.cylTop)));
      const pk = cylKpa(d);
      gas?.setAttribute('fill', pressureColour(pk, 101.3, Math.max(60, peakBar * 25)));
      const b = burnedAt(d);
      flame?.setAttribute('opacity', String(d > 300 || d < -300 ? Math.min(1, b * (1 - b) * 4) : 0));
      // Valves: lift as the open area's share of its most.
      const ia = readAt(tr.deg, tr.inAreaMm2, d) ?? 0; const ea = readAt(tr.deg, tr.exAreaMm2, d) ?? 0;
      inValve?.setAttribute('transform', `translate(0 ${(ia / maxIn) * 14})`);
      exValve?.setAttribute('transform', `translate(0 ${(ea / maxEx) * 14})`);
      const inF = readAt(tr.deg, tr.inFlowGs, d) ?? 0; const exF = readAt(tr.deg, tr.exFlowGs, d) ?? 0;
      inArrow?.setAttribute('stroke-width', String(1 + (Math.abs(inF) / maxFlow) * 9));
      inArrow?.setAttribute('opacity', String(Math.abs(inF) > 0.5 ? 0.9 : 0));
      inArrow?.setAttribute('transform', inF < 0 ? 'scale(-1 1)' : '');
      exArrow?.setAttribute('stroke-width', String(1 + (Math.abs(exF) / maxFlow) * 9));
      exArrow?.setAttribute('opacity', String(Math.abs(exF) > 0.5 ? 0.9 : 0));
      // The waves: each segment at what its port end held when it left, delayed by distance.
      runnerSegs.forEach((el, k) => {
        const x = (k + 0.5) / PIPE_SEGMENTS; // 0 at the plenum, 1 at the port
        el.setAttribute('stroke', pressureColour(inPortAt(d - (1 - x) * halfRunner), plenumKpa, 18));
      });
      primarySegs.forEach((el, k) => {
        const x = (k + 0.5) / PIPE_SEGMENTS; // 0 at the port, 1 at the collector
        el.setAttribute('stroke', pressureColour(exPortAt(d - x * halfPrimary), collectorKpa, 45));
      });
      const X = (dd) => 40 + ((dd + 360) / 720) * 880;
      cursorP?.setAttribute('x1', String(X(d))); cursorP?.setAttribute('x2', String(X(d)));
      cursorPort?.setAttribute('x1', String(X(d))); cursorPort?.setAttribute('x2', String(X(d)));
      const phase = d < -180 ? 'Power (expansion)' : d < 0 ? 'Exhaust' : d < 180 ? 'Intake' : 'Compression';
      if (strokeLabel) strokeLabel.textContent = `${phase} · ${cardAngle(d)}`;
      if (readoutRef.current) {
        readoutRef.current.textContent = `Cylinder ${f(pk, 0)} kPa · intake port ${f(inPortAt(d), 0)} · exhaust port ${f(exPortAt(d), 0)} kPa · intake ${f(inF, 0)} g/s · exhaust ${f(exF, 0)} g/s`;
      }
    };

    let raf = 0; let last = window.performance.now();
    let visible = true;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = (now) => {
      raf = 0;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (scrubRef.current != null) degRef.current = scrubRef.current;
      else if (!paused && !reduce) degRef.current = wrap(degRef.current + (720 / CYCLE_SECONDS) * dt);
      draw(degRef.current);
      if (visible && !document.hidden && !paused && !reduce && scrubRef.current == null) raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf) { last = window.performance.now(); raf = requestAnimationFrame(tick); } };
    const io = typeof window.IntersectionObserver === 'function'
      ? new window.IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }, { threshold: 0.05 }) : null;
    // The whole panel, charts included: their cursors move with the drawing.
    io?.observe(wrapRef.current ?? svg);
    const onVis = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVis);
    draw(scrubRef.current ?? degRef.current);
    start();
    return () => { if (raf) cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, [gx, tr, cyc, L, paused, scrub, mapKpa, gasLo, peakBar]);

  // The two charts under the drawing: the cylinder's whole cycle, and the ports' pressures
  // with the valves' lift through the gas exchange.
  const X = (d) => 40 + ((d + 360) / 720) * 880;
  const cylPath = useMemo(() => {
    const pts = [];
    for (let d = -360; d < 360; d += 2) {
      const g = readAt(tr.deg, tr.cylKpa, d);
      const c = g == null && cyc ? readAt(cyc.deg, cyc.bar, d < gasLo ? d + 720 : d) : null;
      const bar = g != null ? g / 100 : c;
      if (bar != null) pts.push(`${X(d).toFixed(1)},${(150 - (bar / (peakBar * 1.05)) * 130).toFixed(1)}`);
    }
    return pts.join(' ');
  }, [tr, cyc, gasLo, peakBar]);
  const portRange = useMemo(() => {
    const all = [...tr.inPortKpa, ...tr.exPortKpa, mapKpa, gx.empKpa];
    return [Math.min(...all) - 5, Math.max(...all) + 5];
  }, [tr, mapKpa, gx.empKpa]);
  const PY = (k) => 150 - ((k - portRange[0]) / (portRange[1] - portRange[0])) * 130;
  const line = (ys) => tr.deg.map((d, k) => `${X(d).toFixed(1)},${PY(ys[k]).toFixed(1)}`).join(' ');
  const liftLine = (ys, max) => tr.deg.map((d, k) => `${X(d).toFixed(1)},${(150 - (ys[k] / max) * 60).toFixed(1)}`).join(' ');
  const maxA = Math.max(...tr.inAreaMm2, ...tr.exAreaMm2, 1);
  // Where each pipe's wave comes back to its valve: one round trip after the event that sent it.
  const primaryReturn = wrap(gasLo + gx.primaryRoundTripDeg);
  const overlapLo = ev.ivo; const overlapHi = ev.evc;

  const drop = gx.exhaustDropKpa;
  const dropTotal = drop.manifold + drop.catalyst + drop.catback + drop.turbine;
  const dropRows = /** @type {[string, number][]} */ ([
    [geo.headers ? 'Headers' : 'Cast manifold', drop.manifold],
    [mods?.catalyst === 'none' ? 'No catalyst' : mods?.catalyst === 'metallic' ? 'High-flow catalyst' : 'Catalyst', drop.catalyst],
    [mods?.exhaust ? 'Free-flow cat-back' : 'Stock cat-back', drop.catback],
    ...(drop.turbine > 0 ? /** @type {[string, number][]} */ ([['Turbine', drop.turbine]]) : []),
  ]);
  const slowMo = Math.round(CYCLE_SECONDS / (120 / rpm));

  const { runnerPx, primaryPx, cylX, cylW, cylTop, cylH } = L;
  const yAxis = 176; // the pipes' centreline
  const runnerX0 = 64 + 52 + 40; const runnerX1 = runnerX0 + runnerPx;
  const exX0 = cylX + cylW + 30; const exX1 = exX0 + primaryPx;
  const catX = exX1 + 54; const mufX = catX + 92;
  const catCells = mods?.catalyst === 'metallic' ? 5 : 9;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.btn} onClick={() => setPaused((v) => !v)} aria-pressed={paused}>{paused ? 'Run' : 'Pause'}</button>
        <label className={styles.scrub}>
          <span>Crank angle</span>
          <input type="range" min={-360} max={359} step={1} value={scrub ?? -360}
            onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={() => setScrub(null)} onKeyUp={() => setScrub(null)}
            aria-label="Crank angle" />
        </label>
        <span className={styles.note}>{rpm.toLocaleString('en-US')} RPM, {f(mapKpa, 0)} kPa manifold, slowed {slowMo.toLocaleString('en-US')}×</span>
      </div>
      <svg ref={svgRef} viewBox="0 0 960 360" className={styles.svg} role="img"
        aria-label={`The engine breathing at ${rpm} RPM: air through the runner into the cylinder, burned gas out through the ${geo.headers ? 'headers' : 'manifold'} and exhaust, animated with the model's own pressures and flows`}>
        <defs>
          <marker id="gx-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        {/* Section labels, as the reference diagrams set them. */}
        <text x={20} y={26} className={styles.hIn}>INTAKE</text>
        <text x={exX0} y={26} className={styles.hEx}>EXHAUST</text>
        <text data-stroke x={cylX + cylW / 2} y={26} className={styles.stroke} textAnchor="middle">Intake</text>

        {/* Air filter, throttle body, plenum. */}
        <rect x={14} y={yAxis - 30} width={44} height={60} rx={6} className={styles.part} />
        {[0, 1, 2, 3, 4, 5].map((k) => <line key={k} x1={20 + k * 6.5} y1={yAxis - 24} x2={20 + k * 6.5} y2={yAxis + 24} className={styles.pleat} />)}
        <text x={36} y={yAxis + 46} className={styles.lab} textAnchor="middle">filter</text>
        <line x1={58} y1={yAxis} x2={70} y2={yAxis} className={styles.pipeIn} />
        <circle cx={92} cy={yAxis} r={22} className={styles.part} />
        <line x1={92} y1={yAxis - 18} x2={92} y2={yAxis + 18} className={styles.blade}
          transform={`rotate(${90 - Math.min(90, ((point?.map ?? 100) / 101.3) * 90)} 92 ${yAxis})`} />
        <text x={92} y={yAxis + 46} className={styles.lab} textAnchor="middle">throttle</text>
        <rect x={116} y={yAxis - 48} width={40} height={96} rx={8} className={styles.plenum}
          fill={pressureColour(mapKpa, 101.3, 60)} />
        <text x={136} y={yAxis + 64} className={styles.lab} textAnchor="middle">plenum {f(mapKpa, 0)} kPa</text>

        {/* The runner, drawn to its length, its wave in colour. */}
        {Array.from({ length: PIPE_SEGMENTS }, (_, k) => (
          <line key={k} data-runner-seg x1={runnerX0 + (k / PIPE_SEGMENTS) * runnerPx} y1={yAxis}
            x2={runnerX0 + ((k + 1) / PIPE_SEGMENTS) * runnerPx + 0.6} y2={yAxis} className={styles.pipeSeg} />
        ))}
        <text x={(runnerX0 + runnerX1) / 2} y={yAxis + 30} className={styles.lab} textAnchor="middle">runner {f(geo.runnerLengthMm, 0)} mm × {f(geo.runnerBoreMm, 0)} mm</text>
        <path d={`M${runnerX1} ${yAxis} C ${runnerX1 + 22} ${yAxis}, ${cylX + 10} ${cylTop - 30}, ${cylX + 26} ${cylTop - 6}`} className={styles.port} />
        <line data-in-flow x1={runnerX1 - 30} y1={yAxis - 18} x2={runnerX1 - 6} y2={yAxis - 18} className={styles.flowIn} markerEnd="url(#gx-arrow)" />

        {/* The cylinder: head, valves, the gas coloured by its pressure, the piston, the crank. */}
        <rect x={cylX - 6} y={cylTop - 14} width={cylW + 12} height={14} className={styles.head} />
        <g data-in-valve><line x1={cylX + 26} y1={cylTop - 30} x2={cylX + 26} y2={cylTop - 2} className={styles.stem} /><line x1={cylX + 14} y1={cylTop - 2} x2={cylX + 38} y2={cylTop - 2} className={styles.valveIn} /></g>
        <g data-ex-valve><line x1={cylX + cylW - 26} y1={cylTop - 30} x2={cylX + cylW - 26} y2={cylTop - 2} className={styles.stem} /><line x1={cylX + cylW - 38} y1={cylTop - 2} x2={cylX + cylW - 14} y2={cylTop - 2} className={styles.valveEx} /></g>
        <rect x={cylX} y={cylTop} width={cylW} height={cylH} className={styles.bore} />
        <rect data-cyl-gas x={cylX + 2} y={cylTop} width={cylW - 4} height={40} />
        <circle data-flame cx={cylX + cylW / 2} cy={cylTop + 12} r={16} className={styles.flame} opacity={0} />
        <rect data-piston x={cylX + 4} y={cylTop + 30} width={cylW - 8} height={24} rx={3} className={styles.piston} />
        <line data-rod className={styles.rod} />
        <circle cx={cylX + cylW / 2} cy={cylTop + cylH + 44} r={30} className={styles.crankCase} />
        <circle data-crankpin r={5} className={styles.pin} />
        <text x={cylX + cylW / 2} y={cylTop + cylH + 92} className={styles.lab} textAnchor="middle">bore {f(derived?.bore, 1)} × stroke {f(derived?.stroke, 1)} mm, {f(derived?.compression, 1)}:1</text>

        {/* The exhaust: port, primary to its length, collector, catalyst, cat-back, tailpipe. */}
        <path d={`M${cylX + cylW - 26} ${cylTop - 6} C ${cylX + cylW - 10} ${cylTop - 30}, ${exX0 - 22} ${yAxis}, ${exX0} ${yAxis}`} className={styles.portEx} />
        <line data-ex-flow x1={exX0 + 6} y1={yAxis - 18} x2={exX0 + 30} y2={yAxis - 18} className={styles.flowEx} markerEnd="url(#gx-arrow)" />
        {Array.from({ length: PIPE_SEGMENTS }, (_, k) => (
          <line key={k} data-primary-seg x1={exX0 + (k / PIPE_SEGMENTS) * primaryPx} y1={yAxis}
            x2={exX0 + ((k + 1) / PIPE_SEGMENTS) * primaryPx + 0.6} y2={yAxis} className={styles.pipeSegEx} />
        ))}
        <text x={exX0} y={yAxis + 48} className={styles.lab}>{geo.headers ? 'header primary' : 'manifold runner'} {f(geo.primaryLengthMm, 0)} × {f(geo.primaryBoreMm, 0)} mm</text>
        <path d={`M${exX1} ${yAxis - 8} L${exX1 + 34} ${yAxis - 14} L${exX1 + 34} ${yAxis + 14} L${exX1} ${yAxis + 8} Z`} className={styles.collector} />
        <text x={exX1 + 17} y={yAxis - 24} className={styles.lab} textAnchor="middle">collector</text>
        <line x1={exX1 + 34} y1={yAxis} x2={catX} y2={yAxis} className={styles.pipeEx} />
        <rect x={catX} y={yAxis - 22} width={58} height={44} rx={10} className={styles.cat} opacity={mods?.catalyst === 'none' ? 0.25 : 1} />
        {/* The substrate's cells, coarser for the 200-cell metallic one. */}
        {mods?.catalyst !== 'none' && Array.from({ length: catCells }, (_, k) => (
          <line key={k} x1={catX + 8 + (k * 42) / (catCells - 1)} y1={yAxis - 16} x2={catX + 8 + (k * 42) / (catCells - 1)} y2={yAxis + 16} className={styles.cell} />
        ))}
        <text x={catX + 29} y={yAxis + 40} className={styles.lab} textAnchor="middle">{mods?.catalyst === 'none' ? 'test pipe' : mods?.catalyst === 'metallic' ? '200-cell metallic' : '400-cell ceramic'}</text>
        <line x1={catX + 58} y1={yAxis} x2={mufX} y2={yAxis} className={styles.pipeEx} />
        <ellipse cx={mufX + 40} cy={yAxis} rx={40} ry={mods?.exhaust ? 18 : 24} className={styles.muffler} />
        <text x={mufX + 40} y={yAxis + 40} className={styles.lab} textAnchor="middle">{mods?.exhaust ? 'free-flow cat-back' : 'stock cat-back'}</text>
        <line x1={mufX + 80} y1={yAxis} x2={940} y2={yAxis} className={styles.pipeEx} />
        <text x={940} y={yAxis - 12} className={styles.lab} textAnchor="end">{f(hwForVe?.exhaustDia ?? 3, 2)} in pipe</text>

        {/* The legend for the colours. */}
        <g transform="translate(20 330)">
          <rect width={14} height={8} fill={pressureColour(-1, 0, 1)} /><text x={18} y={8} className={styles.lab}>below the pipe's own end (suction)</text>
          <rect x={210} width={14} height={8} fill={pressureColour(0, 0, 1)} /><text x={228} y={8} className={styles.lab}>at it</text>
          <rect x={268} width={14} height={8} fill={pressureColour(1, 0, 1)} /><text x={286} y={8} className={styles.lab}>above it (pressure)</text>
        </g>
      </svg>
      <p ref={readoutRef} className={styles.live} aria-live="off" />

      <div className={styles.charts}>
        <svg viewBox="0 0 960 170" className={styles.chart} role="img" aria-label="Cylinder pressure across the whole cycle">
          <rect x={X(overlapLo)} y={14} width={Math.max(0, X(overlapHi) - X(overlapLo))} height={136} className={styles.overlap} />
          <polyline points={cylPath} className={styles.cylLine} />
          {[-360, -180, 0, 180, 360].map((d) => <line key={d} x1={X(d)} x2={X(d)} y1={14} y2={150} className={styles.grid} />)}
          <text x={X(-360) + 4} y={164} className={styles.lab}>firing TDC</text>
          <text x={X(-180)} y={164} className={styles.lab} textAnchor="middle">BDC</text>
          <text x={X(0)} y={164} className={styles.lab} textAnchor="middle">TDC overlap</text>
          <text x={X(180)} y={164} className={styles.lab} textAnchor="middle">BDC</text>
          <text x={44} y={26} className={styles.lab}>cylinder pressure, peak {f(peakBar, 0)} bar</text>
          <line data-cursor-p y1={14} y2={150} className={styles.cursor} />
        </svg>
        <svg viewBox="0 0 960 170" className={styles.chart} role="img" aria-label="Port pressures and valve lift through the gas exchange">
          <rect x={X(overlapLo)} y={14} width={Math.max(0, X(overlapHi) - X(overlapLo))} height={136} className={styles.overlap} />
          <polyline points={liftLine(tr.inAreaMm2, maxA)} className={styles.liftIn} />
          <polyline points={liftLine(tr.exAreaMm2, maxA)} className={styles.liftEx} />
          <line x1={X(gasLo)} x2={X(gasHi)} y1={PY(mapKpa)} y2={PY(mapKpa)} className={styles.refIn} />
          <line x1={X(gasLo)} x2={X(gasHi)} y1={PY(gx.empKpa)} y2={PY(gx.empKpa)} className={styles.refEx} />
          <polyline points={line(tr.inPortKpa)} className={styles.portLineIn} />
          <polyline points={line(tr.exPortKpa)} className={styles.portLineEx} />
          <line x1={X(primaryReturn)} x2={X(primaryReturn)} y1={14} y2={150} className={styles.waveMark} />
          <text x={X(primaryReturn) + 4} y={24} className={styles.lab}>blowdown's echo back at the valve</text>
          {[[ev.evo, 'EVO'], [ev.ivo, 'IVO'], [ev.evc, 'EVC'], [ev.ivc, 'IVC']].map(([d, k]) => (
            <text key={k} x={X(d)} y={164} className={styles.lab} textAnchor="middle">{k}</text>
          ))}
          <text x={916} y={26} className={styles.lab} textAnchor="end">ports, kPa ({f(portRange[0], 0)}–{f(portRange[1], 0)}); valve lift shaded below</text>
          <line data-cursor-port y1={14} y2={150} className={styles.cursor} />
        </svg>
        <div className={styles.key}>
          <span><i className={styles.kIn} />intake port</span><span><i className={styles.kEx} />exhaust port</span>
          <span><i className={styles.kCyl} />cylinder</span><span><i className={styles.kOv} />valve overlap</span>
        </div>
      </div>

      <div className={styles.numbers}>
        <dl className={styles.nums}>
          <dt>Volumetric efficiency</dt><dd>{f(gx.ve, 1)} %</dd>
          <dt>Residual (burned gas kept)</dt><dd>{f(gx.residualFrac * 100, 1)} %</dd>
          <dt>Charge pushed back up the runner</dt><dd>{f(gx.backflowShare * 100, 1)} %</dd>
          <dt>Runner wave round trip</dt><dd>{f(gx.runnerRoundTripDeg, 0)}° of crank ({f(geo.runnerLengthMm, 0)} mm, R {f(geo.runnerReflection, 2)} at the plenum)</dd>
          <dt>Primary wave round trip</dt><dd>{f(gx.primaryRoundTripDeg, 0)}° of crank (R {f(geo.collectorReflection, 2)} at the collector)</dd>
          <dt>Valve events (seat)</dt><dd>IVO {cardAngle(ev.ivo)}, IVC {cardAngle(ev.ivc)}<br />EVO {cardAngle(ev.evo)}, EVC {cardAngle(ev.evc)}</dd>
          <dt>Valves</dt><dd>{geo.intakeValves} × {f(geo.intakeValveMm, 1)} mm intake, {geo.exhaustValves} × {f(geo.exhaustValveMm, 1)} mm exhaust</dd>
        </dl>
        <div className={styles.dropBox} aria-label="Exhaust back-pressure, part by part">
          <div className={styles.dropHead}>Exhaust back-pressure <b>{f(dropTotal, 1)} kPa</b> <span>({f(dropTotal * 0.145, 2)} psi) at {f(gx.exhaustFlowGs, 0)} g/s</span></div>
          {dropRows.map(([k, v]) => (
            <div key={k} className={styles.dropRow}>
              <span>{k}</span>
              <span className={styles.dropBar}><i style={{ width: `${dropTotal > 0 ? (v / dropTotal) * 100 : 0}%` }} /></span>
              <b>{f(v, 1)}</b>
            </div>
          ))}
          <p className={styles.dropNote}>Each part's loss goes as its coefficient times the pipe's dynamic pressure, ½ρu²: the bigger the pipe, the slower the gas and the smaller every loss.</p>
        </div>
      </div>
    </div>
  );
}
