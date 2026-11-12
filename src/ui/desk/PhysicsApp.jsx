/**
 * The Physics app: the engine model laid open on your own engine, in four panels, as drawn.
 *
 *   your build      the build's numbers and what the model makes of each, with a small
 *                   cut-away of one cylinder drawn to its bore, stroke and compression
 *   the graph       power and torque against RPM, or VE (the VE button), or the VE map in
 *                   3-D (the 3D button); the RPM you pick here sets every other panel
 *   the raw model   every calculation the simulator makes at that RPM, stage by stage,
 *                   each with its equation, its numbers and what it means
 *   the engine      the 3-D engine from Build, running at that RPM, with its cylinder's
 *                   four strokes going round beside it
 *
 * The numbers are the full-throttle pull the advisor and the dyno also use (the app's
 * `advisorPull`), so this page, the TUNE advice and the DYNO never disagree. The stages:
 *
 *   1 Air       how much air the cylinder takes in            m = VE x rho x V, rho = MAP / (R T)
 *   2 Fuel      how much fuel that needs, and the injector time m_f = m_air / (AFR_s x lambda)
 *   3 Burn      when the spark fires and where the pressure peaks (MFB50, MBT)
 *   4 Knock     the end gas's race against its ignition delay   integral dt / tau = 1
 *   5 Work      from cylinder pressure to torque at the crank    BMEP = IMEP - FMEP - PMEP
 *   6 Heat      where the rest of the fuel's energy goes         BSFC, EGT
 */

import React, { useDeferredValue, useMemo, useRef, useState } from 'react';

import {
  KELVIN_OFFSET, KG_KWH_PER_LB_HPH, R_AIR, airDensityKgM3, brakeThermalEfficiency, fourStrokeTrace, gasExchangeTrace,
} from '../../sim/index.js';
import { TableSurface } from '../components/surface/TableSurface.jsx';

import { Calculator, Cylinder, Flame, Gauge, Waves, Wind, Wrench } from 'lucide-react';

import { PagePicker } from '../components/PagePicker.jsx';
import { Plot } from './Plot.jsx';
import styles from './Apps.module.css';
import { EngineCutaway } from './EngineCutaway.jsx';
import { EngineViewer } from './EngineViewer.jsx';
import { ExhaustSystemCutaway } from './ExhaustSystemCutaway.jsx';
import { HeaderCutaway } from './HeaderCutaway.jsx';
import { IntakeCutaway } from './IntakeCutaway.jsx';
import { EngineCondition } from './EngineCondition.jsx';
import { useUnits } from '../units.js';
import { fixed as f } from '../format.js';

const NM_PER_LBFT = 1.3558;

/** @param {number} v @param {number} [d] */
/**
 * The Physics app's pages, in the order the air goes through the engine and then the sums:
 * the engine and its curves, the intake, the header, the exhaust, one cylinder firing, the
 * model's calculations in order, and the wear. `needs`: a page shown only when the build has
 * its data (the breathing trace, the damage model).
 */
export const PHYSICS_PAGES = /** @type {const} */ ([
  { id: 'model', name: 'Engine overview', icon: Gauge },
  { id: 'intake', name: 'Intake manifold', icon: Wind, needs: 'gx' },
  { id: 'header', name: 'Exhaust header', icon: Flame, needs: 'gx' },
  { id: 'exhaust', name: 'Exhaust system', icon: Waves, needs: 'gx' },
  { id: 'cylinder', name: 'One cylinder', icon: Cylinder, needs: 'gx' },
  { id: 'calc', name: 'Calculations', icon: Calculator },
  { id: 'wear', name: 'Engine wear', icon: Wrench, needs: 'health' },
]);


/**
 * One stage of the model: a row that opens to its picture, equation and numbers, so the
 * six stages read as a list first and nothing is in the way until you ask for it.
 * @param {{n: number, title: string, what: string, eq: React.ReactNode, rows: [string, string][], open?: boolean, children?: React.ReactNode}} props
 */
function Stage({ n, title, what, eq, rows, open = false, children }) {
  return (
    <details className={styles.stage} open={open}>
      <summary className={styles.stageTitle}><span className={styles.stageNum}>{n}</span>{title}</summary>
      <div className={styles.stageBody}>
        {children && <div className={styles.stageArt} aria-hidden="true">{children}</div>}
        <div className={styles.stageText}>
          <p className={styles.stageWhat}>{what}</p>
          <div className={styles.eq}>{eq}</div>
          <dl className={styles.nums}>
            {rows.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
          </dl>
        </div>
      </div>
    </details>
  );
}

/**
 * The cylinder pressure against crank angle through the closed cycle, intake valve closing
 * to exhaust valve opening, exactly as the model integrated it (`runCycle`'s trace): the
 * compression, the burn from the spark and the expansion, with the spark and the 50%-burned
 * angle marked. Nothing here is drawn from a second model.
 * @param {{p: any, trace: {deg: number[], bar: number[], burned: number[]}|null}} props
 */
function PressureTrace({ p, trace }) {
  if (!trace?.deg?.length) return null;
  const peak = Math.max(...trace.bar);
  const at = trace.bar.indexOf(peak);
  const spark = -(p.timing ?? 0);
  const mfb = p.mfb50;
  const x0 = Math.floor(trace.deg[0] / 20) * 20; const x1 = Math.ceil(trace.deg[trace.deg.length - 1] / 20) * 20;
  const ticks = [];
  for (let v = Math.ceil(x0 / 60) * 60; v <= x1; v += 60) ticks.push({ v, label: v === 0 ? 'TDC' : String(v) });
  return (
    <Plot
      title="Cylinder pressure, the closed cycle"
      sub={`peak ${f(peak, 0)} bar at ${f(trace.deg[at], 0)}° ATDC`}
      xLabel="crank angle, ° ATDC firing"
      yLabel="pressure, bar"
      xDomain={[x0, x1]}
      yDomain={[0, Math.ceil((peak * 1.1) / 10) * 10]}
      xTicks={ticks}
      ariaLabel={`Cylinder pressure from intake valve closing to exhaust valve opening: spark ${f(p.timing, 0)}° BTDC, peak ${f(peak, 0)} bar`}
      legend={[
        { label: 'cylinder pressure, as integrated', kind: 'line', tone: 'var(--acc)' },
        { label: `spark, ${f(p.timing, 0)}° BTDC`, kind: 'dash', tone: 'var(--warn)' },
        ...(Number.isFinite(mfb) ? [{ label: `50% burned (MFB50), ${f(mfb, 0)}° ATDC`, kind: /** @type {const} */ ('dash'), tone: 'var(--ink2)' }] : []),
      ]}
    >
      {({ x, y, Y1 }) => (
        <>
          <line x1={x(spark)} x2={x(spark)} y1={0} y2={Y1} className={styles.artWarn} strokeDasharray="3 3" />
          {Number.isFinite(mfb) && <line x1={x(mfb)} x2={x(mfb)} y1={0} y2={Y1} className={styles.artGrid} strokeDasharray="3 3" />}
          <polyline points={trace.deg.map((d, i) => `${x(d).toFixed(1)},${y(trace.bar[i]).toFixed(1)}`).join(' ')} className={styles.artLine} />
        </>
      )}
    </Plot>
  );
}

/**
 * @param {object} props
 * @param {any[]} props.points the full-throttle pull of the current calibration
 * @param {any} props.derived the engine's derived geometry
 * @param {{label: string, lhv?: number}} [props.fuel] the fuel, its lower heating value in J/kg
 * @param {import('../world/models/engine.js').EngineSpec} [props.spec] the engine as built, for the 3-D model
 * @param {number[][]|null} [props.ve] the tune's VE table (highest load first), for the 3-D map
 * @param {{rpm: number[], load: number[], loadUnit: string}|null} [props.veAxes] its breakpoints
 * @param {((loadKpa: number) => {points: any[]})|null} [props.sweepAt] runs the model's pull at a part-throttle load
 * @param {((loadKpa: number, rpm: number) => {deg: number[], bar: number[], burned: number[]}|null)|null} [props.cycleAt]
 *   the closed cycle's pressure trace at a load and speed, as the pull integrates it
 * @param {{engineConfig: any, mods: any, hwForVe: any, camAt: ((rpm: number, kpa: number) => number)|null}|null} [props.breathing]
 *   the engine's breathing inputs, for the live gas-exchange diagram
 * @param {{piston: number, bearing: number, valve: number}|null} [props.health] each part's life left, percent
 * @param {(() => void)|null} [props.onRepair] rebuild the engine
 * @param {string} [props.page] the open page (PHYSICS_PAGES), as TUNE opens one table at a time
 * @param {((id: string) => void)|null} [props.onPage] open another page
 * @returns {React.ReactElement}
 */
export function PhysicsApp({ points, derived, fuel, spec, ve = null, veAxes = null, sweepAt = null, cycleAt = null, breathing = null, health = null, onRepair = null, page = 'model', onPage = null }) {
  const U = useUnits();
  // The load the model runs at: manifold pressure, set by the throttle. Full throttle is
  // the advisor's own pull; any other is solved here, once per load, and kept.
  const [load, setLoad] = useState(100);
  const deferredLoad = useDeferredValue(load);
  // Kept for the engine and tables it was solved for. Checked here, in the same render,
  // not cleared by an effect afterwards: an undo or a map-slot change would otherwise draw
  // one frame (or, with the load unchanged, every frame) from the old tables.
  const cache = useRef(/** @type {{points: any, sweepAt: any, map: Map<number, any[]>}} */ ({ points: null, sweepAt: null, map: new Map() }));
  const pts = useMemo(() => {
    if (deferredLoad >= 100 || !sweepAt) return points ?? [];
    const c = cache.current;
    if (c.points !== points || c.sweepAt !== sweepAt) cache.current = { points, sweepAt, map: new Map() };
    const map = cache.current.map;
    if (!map.has(deferredLoad)) map.set(deferredLoad, sweepAt(deferredLoad)?.points ?? []);
    return map.get(deferredLoad) ?? [];
  }, [points, sweepAt, deferredLoad]);
  const peakIdx = useMemo(() => pts.reduce((b, q, j) => (q.torque > (pts[b]?.torque ?? -1) ? j : b), 0), [pts]);
  const [idx, setIdx] = useState(/** @type {number|null} */ (null));
  const [graph, setGraph] = useState(/** @type {'power'|'ve'|'3d'} */ ('power'));
  const veRows = useMemo(() => (ve ? [...ve].reverse() : null), [ve]);
  const veLoads = useMemo(() => (veAxes ? [...veAxes.load].reverse() : null), [veAxes]);
  const i = Math.min(pts.length - 1, idx ?? peakIdx);
  const p = pts[i];
  // The gas exchange at the chosen speed and throttle, once, for all three breathing diagrams.
  const atRpm = p?.rpm ?? null; const atMap = p?.map ?? 100;
  const advance = breathing?.camAt && atRpm != null ? breathing.camAt(atRpm, atMap) : 0;
  const gx = useMemo(() => (breathing && atRpm != null
    ? gasExchangeTrace(breathing.engineConfig, breathing.mods ?? {}, { ...breathing.hwForVe, intakeCamAdvanceDeg: advance }, atRpm, atMap)
    : null), [breathing, atRpm, atMap, advance]);
  // The closed cycle at that speed and throttle, as the pull integrates it; only on the pages
  // that draw it (a point of the pull is not free).
  const wantsCycle = page === 'calc' || page === 'cylinder';
  const cycle = useMemo(() => (wantsCycle && cycleAt && atRpm != null ? cycleAt(deferredLoad, atRpm) : null), [wantsCycle, cycleAt, deferredLoad, atRpm]);
  const fourStroke = useMemo(() => (cycle && gx?.trace ? fourStrokeTrace(cycle, gx.trace) : null), [cycle, gx]);
  if (!p) return <div className={styles.pad}>Build an engine first: the model needs something to run.</div>;

  // The curve at the top, in the units the player reads (units.js): power and torque
  // converted, never hp and lb-ft drawn under a kW key.
  const powerOf = (q) => U.power(q.hp); const torqueOf = (q) => U.torque(q.torque);
  const maxVe = Math.max(...pts.map((q) => q.ve ?? 0), 1);
  const top = graph === 've' ? Math.max(110, maxVe * 1.1) : Math.max(...pts.map((q) => Math.max(powerOf(q), torqueOf(q))), 1) * 1.1;
  const rpm0 = pts[0].rpm; const rpm1 = pts[pts.length - 1].rpm;
  const rpmTicks = [];
  for (let r = Math.ceil(rpm0 / 1000) * 1000; r <= rpm1; r += 1000) rpmTicks.push({ v: r, label: `${r / 1000}k` });

  // The numbers each stage shows, worked from the point.
  const vCylL = derived?.perCylL ?? (derived?.displacementL ?? 3.5) / (derived?.cyl ?? 6);
  const tK = (p.iat ?? 25) + KELVIN_OFFSET;
  const rho = airDensityKgM3(p.map ?? 100, tK);
  const mAirMg = (p.airCharge ?? 0) * 1000;
  const stoich = p.ecuStoich ?? 14.7;
  const vdM3 = (derived?.displacementL ?? 3.5) / 1000;
  const crankNm = ((p.bmep ?? 0) * 1e5 * vdM3) / (4 * Math.PI);
  const rollerNm = (p.torque ?? 0) * NM_PER_LBFT;
  const lost = crankNm > 0 ? Math.max(0, 1 - rollerNm / crankNm) : 0;
  // Brake thermal efficiency from BSFC and this fuel's own heating value (E85 carries two
  // thirds of gasoline's energy per kilogram, so the same BSFC is a far better engine on it).
  const lhvMJ = (fuel?.lhv ?? 44e6) / 1e6;
  const eff = brakeThermalEfficiency(p.bsfc ?? 0.45, lhvMJ * 1e6);

  const stroke = derived?.stroke ?? 0; const bore = derived?.bore ?? 0;
  const pistonSpeed = (2 * (stroke / 1000) * p.rpm) / 60;
  const buildRows = /** @type {[string, string, string][]} */ ([
    ['Layout', `${derived?.configuration ?? '—'}`, `${derived?.cyl ?? '—'} cylinders: how many slices the work is split into`],
    ['Bore × stroke', `${f(bore, 1)} × ${f(stroke, 1)} mm`, `${f(vCylL * 1000, 0)} cc a cylinder, ${f(derived?.displacementL, 2)} L in all`],
    ['Compression', `${f(derived?.compression, 1)} : 1`, 'squeeze before the spark: more work per burn, closer to knock'],
    ['Cam duration', `${f(derived?.camDuration, 0)}° / ${f(derived?.exhaustCamDuration, 0)}°`, 'how long the intake and exhaust valves stay open: shapes the VE curve'],
    ['Piston speed', `${f(pistonSpeed, 1)} m/s at ${p.rpm} rpm`, 'from the stroke: what the intake has to keep up with'],
    ['Fuel', fuel?.label ?? '—', 'sets the knock limit and the stoichiometric ratio'],
  ]);
  const graphLabel = graph === 've'
    ? `Volumetric efficiency against RPM; ${p.rpm} RPM chosen, ${f(p.ve, 0)} %`
    : `Torque and power against RPM; ${p.rpm} RPM chosen`;

  // One page at a time, as TUNE opens one table: a page the build has nothing for is not offered.
  const pages = PHYSICS_PAGES.filter((pg) => (pg.needs === 'gx' ? !!gx : pg.needs === 'health' ? !!health : true));
  const open = pages.some((pg) => pg.id === page) ? page : 'model';
  const pick = (id) => onPage?.(id);

  return (
    <div className={`${styles.pad} ${styles.physics}`}>
      {/* The pages: one button naming the open page on a phone, which lists them all (as TUNE's
          tables do); a row of tabs where there is room. */}
      <div className={styles.physPicker}>
        <PagePicker label="Physics pages" current={open} onPick={pick} pages={pages.map((pg) => ({ id: pg.id, name: pg.name, icon: pg.icon }))} />
      </div>
      <nav className={styles.physTabs} aria-label="Physics pages" data-plain="">
        {pages.map((pg) => {
          const Icon = pg.icon;
          return (
            <button key={pg.id} type="button" aria-current={open === pg.id ? 'page' : undefined} onClick={() => pick(pg.id)}>
              <Icon size={14} aria-hidden="true" />{pg.name}
            </button>
          );
        })}
      </nav>
      <div className={styles.physControls}>
        <label className={styles.ctl}>
          <span>Engine speed <b>{p.rpm} RPM</b></span>
          <input type="range" min={0} max={pts.length - 1} step={1} value={i}
            onChange={(e) => setIdx(Number(e.target.value))} aria-label="RPM" aria-valuetext={`${p.rpm} RPM`} />
        </label>
        <label className={styles.ctl}>
          <span>Throttle <b>{load >= 100 ? 'wide open' : `${Math.round(((load - 20) / 80) * 100)} %`}</b>, manifold <b>{f(p.map, 0)} kPa</b></span>
          <input type="range" min={20} max={100} step={10} value={load}
            onChange={(e) => setLoad(Number(e.target.value))} aria-label="Throttle" aria-valuetext={`${load}% throttle`} />
        </label>
        <p className={styles.ctlNote}>Your engine as built and tuned{fuel ? `, on ${fuel.label}` : ''}. Every panel, every number and the engine below follow these two.</p>
      </div>
      <div className={styles.physGrid}>
        {open === 'model' && (
          <>
        <section className={styles.physPanel} aria-label="Your build in the model">
          <h3 className={styles.panelTitle}>Your build in the model</h3>
          {/* The engine across the panel, framed whole at any width; the figures under it. */}
          {spec ? <div className={styles.buildEngine}><EngineViewer spec={spec} rpm={p.rpm} label="Your engine as built" /></div> : null}
          <dl className={styles.buildList}>
            {buildRows.map(([k, v, why]) => (
              <div key={k} className={styles.buildRow2}><dt>{k}</dt><dd><b>{v}</b><span>{why}</span></dd></div>
            ))}
          </dl>
        </section>
          </>
        )}

        {open === 'model' && (
          <>
        <section className={styles.physPanel} aria-label="Graph">
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>{graph === '3d' ? 'The VE map in 3-D' : 'Full-throttle curves'}</h3>
            <div className={styles.graphBtns} role="group" aria-label="Graph">
              <button type="button" aria-pressed={graph === 've'} onClick={() => setGraph(graph === 've' ? 'power' : 've')} title="Show VE against RPM">VE</button>
              <button type="button" aria-pressed={graph === '3d'} onClick={() => setGraph(graph === '3d' ? 'power' : '3d')} title="Show the VE map in 3-D">3D</button>
            </div>
          </div>
          {graph === '3d' && veRows && veAxes && veLoads ? (
            <TableSurface x={veAxes.rpm} y={veLoads} z={veRows} lo={10} hi={130} xLabel="RPM" yLabel={veAxes.loadUnit} unit="%" decimals={0}
              title="Volumetric efficiency" xVar="rpm" yVar={veAxes.loadUnit === 'kPa' ? 'map' : null} />
          ) : (
            <Plot
              title={graph === 've' ? 'Volumetric efficiency' : 'Power and torque'}
              sub={`${derived?.displacementL ? `${f(derived.displacementL, 1)} L, ` : ''}${fuel?.label ?? ''}; cursor at ${p.rpm.toLocaleString('en-US')} rpm`}
              xLabel="engine speed, rpm"
              yLabel={graph === 've' ? 'VE, %' : `${U.powerUnit} · ${U.torqueUnit}`}
              xDomain={[rpm0, rpm1]}
              yDomain={[0, top]}
              xTicks={rpmTicks}
              height={200}
              ariaLabel={graphLabel}
              legend={graph === 've'
                ? [{ label: 'VE, %', kind: 'line', tone: 'var(--acc)' }]
                : [{ label: `power, ${U.powerUnit}`, kind: 'line', tone: 'var(--acc)' }, { label: `torque, ${U.torqueUnit}`, kind: 'line', tone: 'var(--data2)' }]}
            >
              {({ x, y, Y0, Y1 }) => {
                const line = (get) => pts.map((q) => `${x(q.rpm).toFixed(1)},${y(get(q)).toFixed(1)}`).join(' ');
                return (
                  <>
                    {/* The chosen speed: a neutral cursor, not the warning colour. */}
                    <line x1={x(p.rpm)} y1={Y0} x2={x(p.rpm)} y2={Y1} className={styles.plotCursor} />
                    {graph === 've' ? (
                      <>
                        <polyline points={line((q) => q.ve ?? 0)} className={styles.plotLine} />
                        <circle cx={x(p.rpm)} cy={y(p.ve ?? 0)} r="4" className={styles.plotDot} />
                      </>
                    ) : (
                      <>
                        {/* Power in the accent and torque in the second hue, as the dyno draws them. */}
                        <polyline points={line(torqueOf)} className={styles.plotLine2} />
                        <polyline points={line(powerOf)} className={styles.plotLine} />
                        <circle cx={x(p.rpm)} cy={y(torqueOf(p))} r="4" className={styles.plotDot2} />
                        <circle cx={x(p.rpm)} cy={y(powerOf(p))} r="4" className={styles.plotDot} />
                      </>
                    )}
                  </>
                );
              }}
            </Plot>
          )}
          <dl className={styles.readout}>
            <div><dt>Speed</dt><dd>{p.rpm.toLocaleString('en-US')} <small>rpm</small></dd></div>
            <div><dt>Power</dt><dd>{f(U.power(p.hp), 0)} <small>{U.powerUnit}</small></dd></div>
            <div><dt>Torque</dt><dd>{f(U.torque(p.torque), 0)} <small>{U.torqueUnit}</small></dd></div>
            <div><dt>VE</dt><dd>{f(p.ve, 0)} <small>%</small></dd></div>
          </dl>
        </section>
          </>
        )}

        {gx ? (
          <>
            {open === 'intake' && (
            <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="The intake manifold">
              <h3 className={styles.panelTitle}>The intake: air filter, throttle, plenum and runners</h3>
              <IntakeCutaway gx={gx} point={p} derived={derived} engineConfig={breathing?.engineConfig} throttleFrac={Math.min(1, deferredLoad / 101.3)} />
            </section>
            )}
            {open === 'header' && (
            <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="The exhaust header">
              <h3 className={styles.panelTitle}>The exhaust header: ports, primaries and collector</h3>
              <HeaderCutaway gx={gx} point={p} derived={derived} engineConfig={breathing?.engineConfig} />
            </section>
            )}
            {open === 'exhaust' && (
            <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="The exhaust system">
              <h3 className={styles.panelTitle}>The exhaust system: converter, muffler and tailpipe</h3>
              <ExhaustSystemCutaway gx={gx} point={p} derived={derived} engineConfig={breathing?.engineConfig} mods={breathing?.mods} />
            </section>
            )}
          </>
        ) : null}
        {health && open === 'wear' ? (
          <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="Engine condition">
            <h3 className={styles.panelTitle}>Engine condition: what wears it, and what the wear does</h3>
            <EngineCondition health={health} point={p} pointsPerPull={pts.length} derived={derived} onRepair={onRepair} />
          </section>
        ) : null}
        {open === 'calc' && (
          <>
        <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="The raw physics model">
          <h3 className={styles.panelTitle}>The raw physics model</h3>
          <p className={styles.panelNote}>Every calculation the simulator makes at {p.rpm} RPM, in order. Open one for what it means and its numbers.</p>
      <Stage
        open n={1} title="Air in" what="The cylinder fills with air. How full it gets, against how full it could be at this pressure, is the volumetric efficiency: the number every hardware choice moves."
        eq={<>ρ = MAP / (R × T) = {f((p.map ?? 0) * 1000, 0)} / ({R_AIR} × {f(tK, 0)}) = {f(rho, 3)} kg/m³<br />m<sub>air</sub> = VE × ρ × V<sub>cyl</sub> = {f((p.ve ?? 0) / 100, 3)} × {f(rho, 3)} × {f(vCylL * 1000, 0)} cc = {f(mAirMg, 0)} mg</>}
        rows={[['VE', `${f(p.ve)} %`], ['MAP', `${f(p.map, 0)} kPa`], ['Charge temp', `${f(p.iat, 0)} °C = ${f(tK, 0)} K`], ['Air density ρ', `${f(rho, 3)} kg/m³`], ['V cyl', `${f(vCylL * 1000, 0)} cc`], ['Air per cylinder', `${f(mAirMg, 0)} mg`]]}
      />

      <Stage
        n={2} title="Fuel" what="The ECU works out how much fuel that air needs for the mixture it wants, then holds the injector open long enough to deliver it."
        eq={<>m<sub>fuel</sub> = m<sub>air</sub> / (AFR<sub>s</sub> × λ) = {f(mAirMg, 0)} / ({f(stoich, 1)} × {f(p.lambda, 3)}) = {f(mAirMg / (stoich * (p.lambda || 1)), 1)} mg<br />PW = m<sub>fuel</sub> / flow + dead time = {f(p.pw, 2)} ms</>}
        rows={[['λ (lambda)', f(p.lambda, 3)], ['AFR', `${f(p.afr)} : 1`], ['Stoichiometric', `${f(stoich)} : 1`], ['Fuel per cylinder', `${f(p.fuelMass, 1)} mg`], ['Pulse width', `${f(p.pw, 2)} ms`], ['Injector duty', `${f(p.duty, 0)} %`]]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          <rect x="48" y="10" width="24" height="44" className={styles.artBox2} />
          <path d="M60 54 L42 100 M60 54 L60 104 M60 54 L78 100" className={styles.artWarn} />
          <text x="76" y="30" className={styles.artText}>{f(p.pw, 1)} ms</text>
        </svg>
      </Stage>

      <Stage
        n={3} title="Spark and burn" what="The spark fires before the piston reaches the top, so the flame has burned half the fuel just after it (MFB50, aimed at about 8.5°). That is the best timing for torque (MBT): earlier fights the piston, later wastes the push."
        eq={<>MBT: spark where MFB50 ≈ 8.5° after TDC &nbsp;&nbsp; burn ≈ {f(p.burnDeg, 0)}° of crank</>}
        rows={[['Spark', `${f(p.timing, 1)}° BTDC`], ['Best for torque (MBT)', `${f(p.mbtIdeal, 1)}° BTDC`], ['50% burned at', `${f(p.mfb50, 1)}° ATDC`], ['Peak pressure', `${f(p.peakPressure, 0)} bar at ${f(p.peakPressureDeg, 0)}°`], ['Leftover exhaust in charge', `${f((p.residualFrac ?? 0) * 100, 1)} %`]]}
      >
        <PressureTrace p={p} trace={cycle} />
      </Stage>

      <Stage
        n={4} title="Knock" what="The unburned end gas, squeezed and heated, is racing its own ignition delay. Each instant uses up a slice of the time it can survive; if the slices reach one before the flame arrives, it explodes on its own: knock."
        eq={<>knock when ∫ dt / τ(p, T) ≥ 1 &nbsp;&nbsp; τ falls fast as pressure and temperature rise</>}
        rows={[['Knock integral', `${f(p.knockIntegral, 2)} of 1`], ['Spark margin to knock', `${f(p.margin, 1)}°`], ['End-gas temperature', `${f(p.endGasK, 0)} K`], ['Knocking', p.knock ? 'yes' : 'no']]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          <rect x="20" y="50" width="80" height="18" className={styles.artBox} />
          <rect x="21" y="51" width={Math.min(78, 78 * (p.knockIntegral ?? 0))} height="16" className={(p.knockIntegral ?? 0) >= 1 ? styles.artDanger : styles.artFill} />
          <line x1="99" y1="40" x2="99" y2="78" className={styles.artWarn} />
          <text x="86" y="36" className={styles.artText}>limit</text>
          <text x="20" y="92" className={styles.artText}>{f((p.knockIntegral ?? 0) * 100, 0)}% of the way</text>
        </svg>
      </Stage>

      <Stage
        n={5} title="Work and torque" what="The pressure on the piston over a whole cycle is the indicated mean effective pressure. Friction and the work of pumping air in and out take their share; what is left turns the crank."
        eq={<>BMEP = IMEP − FMEP − PMEP = {f(p.imep, 2)} − {f(p.fmep, 2)} − {f(p.pmep, 2)} = {f(p.bmep, 2)} bar<br />T = BMEP × V<sub>d</sub> / 4π = {f(crankNm, 0)} N·m &nbsp; hp = T × rpm / 5252 = {f(p.hp, 0)}</>}
        rows={[['IMEP', `${f(p.imep, 2)} bar`], ['Friction FMEP', `−${f(p.fmep, 2)} bar`], ['Pumping PMEP', `−${f(p.pmep, 2)} bar`], ['BMEP', `${f(p.bmep, 2)} bar`], ['Crank torque', `${f(crankNm, 0)} N·m = ${f(crankNm / NM_PER_LBFT, 0)} lb-ft`], ['At the rollers', `${f(p.torque, 0)} lb-ft (${f(lost * 100, 0)}% lost in the drivetrain)`]]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          {[['IMEP', p.imep, styles.artFill], ['FMEP', p.fmep, styles.artDanger], ['PMEP', p.pmep, styles.artDanger], ['BMEP', p.bmep, styles.artFill2]].map(([k, v, cls], j) => {
            const h = Math.max(1, (Number(v) / Math.max(1, p.imep)) * 80);
            return (
              <g key={/** @type {string} */ (k)}>
                <rect x={10 + j * 27} y={100 - h} width="20" height={h} className={/** @type {string} */ (cls)} />
                <text x={8 + j * 27} y="114" className={styles.artText}>{k}</text>
              </g>
            );
          })}
        </svg>
      </Stage>

      <Stage
        n={6} title="Heat" what="Most of the fuel's energy never reaches the crank: it goes out of the exhaust and into the coolant. How much fuel each horsepower costs says how well the engine turns heat into work."
        eq={<>η = 3.6 / (BSFC × {KG_KWH_PER_LB_HPH.toFixed(4)} × LHV) = 3.6 / ({f(p.bsfc, 3)} × {KG_KWH_PER_LB_HPH.toFixed(4)} × {f(lhvMJ, 1)}) = {f(eff * 100, 0)} %</>}
        rows={[['Exhaust gas temp', `${f(p.egt, 0)} °C`], ['BSFC', U.metric ? `${f(p.bsfc * KG_KWH_PER_LB_HPH * 1000, 0)} g/kWh` : `${f(p.bsfc, 3)} lb/hp·h`], ['Thermal efficiency', `${f(eff * 100, 0)} % (on ${fuel?.label ?? 'this fuel'}, ${f(lhvMJ, 1)} MJ/kg)`]]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          <rect x="10" y="40" width="100" height="22" className={styles.artBox} />
          <rect x="11" y="41" width={Math.max(4, Math.min(98, 98 * eff))} height="20" className={styles.artFill2} />
          <text x="10" y="34" className={styles.artText}>to the crank</text>
          <text x="10" y="80" className={styles.artText}>the rest: exhaust, coolant</text>
        </svg>
      </Stage>
        </section>
          </>
        )}

        {open === 'cylinder' && (
          <>
        <section className={`${styles.physPanel} ${styles.physWide}`} aria-label="The engine running">
          <h3 className={styles.panelTitle}>The engine in action: one cylinder at {p.rpm} RPM, {f(p.map, 0)} kPa</h3>
          {fourStroke && gx
            ? <EngineCutaway bore={bore || 90} stroke={stroke || 86} cr={derived?.compression ?? 10} point={p} trace={fourStroke} gx={gx} />
            : <p className={styles.panelNote}>Working out the cycle at {p.rpm} RPM…</p>}
        </section>
          </>
        )}
      </div>
    </div>
  );
}
