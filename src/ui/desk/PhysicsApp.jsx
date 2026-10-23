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

import React, { useMemo, useState } from 'react';

import { TableSurface } from '../components/surface/TableSurface.jsx';

import styles from './Apps.module.css';
import { EngineViewer } from './EngineViewer.jsx';

const R_AIR = 287;
const NM_PER_LBFT = 1.3558;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/**
 * One stage of the model: a row that opens to its picture, equation and numbers, so the
 * six stages read as a list first and nothing is in the way until you ask for it.
 * @param {{n: number, title: string, what: string, eq: React.ReactNode, rows: [string, string][], open?: boolean, children: React.ReactNode}} props
 */
function Stage({ n, title, what, eq, rows, open = false, children }) {
  return (
    <details className={styles.stage} open={open}>
      <summary className={styles.stageTitle}><span className={styles.stageNum}>{n}</span>{title}</summary>
      <div className={styles.stageBody}>
        <div className={styles.stageArt} aria-hidden="true">{children}</div>
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
 * One cylinder cut away, to this engine's proportions: the bore is the width, the stroke
 * how far the piston travels, and the chamber above it the compression ratio's share.
 * The piston runs at a pace that rises with the chosen RPM.
 * @param {{bore: number, stroke: number, cr: number, rpm: number}} props
 */
function CylinderCut({ bore, stroke, cr, rpm }) {
  const scale = 70 / Math.max(bore, stroke);
  const w = bore * scale; const travel = stroke * scale;
  const chamber = Math.max(4, travel / Math.max(1.5, cr - 1));
  const x0 = 60 - w / 2; const top = 14;
  // One full cycle a second at idle up to four at the limiter: slow enough to follow.
  const period = Math.max(0.25, 1.6 - rpm / 6000);
  return (
    <svg viewBox="0 0 120 140" className={styles.cylArt} role="img" aria-label={`One cylinder, ${bore} mm bore by ${stroke} mm stroke, ${cr}:1 compression`}>
      <rect x={x0 - 4} y={top} width={w + 8} height={chamber + travel + 26} className={styles.artBox2} />
      <rect x={x0} y={top + 2} width={w} height={chamber + travel + 20} className={styles.artBox} />
      <g className={styles.piston} style={/** @type {React.CSSProperties} */ ({ '--travel': `${travel}px`, animationDuration: `${period}s` })}>
        <rect x={x0 + 1} y={top + chamber + 2} width={w - 2} height="16" className={styles.artFill} />
        <line x1={60} y1={top + chamber + 18} x2={60} y2={top + chamber + 40} className={styles.artLine} />
      </g>
      <line x1={x0 - 10} y1={top + 2} x2={x0 - 10} y2={top + chamber + 2} className={styles.artWarn} />
      <text x={8} y={136} className={styles.artText}>{bore} × {stroke} mm</text>
    </svg>
  );
}

/**
 * The cylinder pressure against crank angle: a motored curve from compression, and the burn
 * laid over it as a Wiebe function centred on the MFB50 the model found, peaking where it
 * says. A picture of the model's numbers, not a second model.
 * @param {{p: any}} props
 */
function PressureTrace({ p }) {
  const W = 260; const H = 120;
  const x = (deg) => ((deg + 60) / 160) * W;
  const peak = Math.max(10, p.peakPressure ?? 50);
  const y = (bar) => H - 12 - (bar / (peak * 1.1)) * (H - 24);
  const start = (p.mfb50 ?? 10) - (p.burnDeg ?? 50) / 2;
  const pts = [];
  for (let deg = -60; deg <= 100; deg += 2) {
    const v = Math.max(0.15, Math.cos((deg * Math.PI) / 180 / 2.2));
    const motored = (p.map ?? 100) / 100 * (v ** 1.3) * 22 + 1;
    const xb = Math.max(0, (deg - start) / Math.max(10, p.burnDeg ?? 50));
    const burned = 1 - Math.exp(-5 * xb ** 3);
    const bump = burned * Math.exp(-Math.max(0, deg - (p.peakPressureDeg ?? 15)) / 45);
    pts.push(`${x(deg).toFixed(1)},${y(motored + (peak - 23) * bump).toFixed(1)}`);
  }
  const spark = -(p.timing ?? 20);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.art}>
      <line x1={x(0)} y1={6} x2={x(0)} y2={H - 12} className={styles.artGrid} />
      <text x={x(0) + 3} y={14} className={styles.artText}>TDC</text>
      <polyline points={pts.join(' ')} className={styles.artLine} />
      <line x1={x(spark)} y1={H - 30} x2={x(spark)} y2={H - 12} className={styles.artWarn} />
      <text x={x(spark) - 12} y={H - 34} className={styles.artText}>spark</text>
      <line x1={x(p.mfb50 ?? 10)} y1={y(peak * 0.6)} x2={x(p.mfb50 ?? 10)} y2={H - 12} className={styles.artGrid} />
      <text x={x(p.mfb50 ?? 10) + 3} y={y(peak * 0.6) + 4} className={styles.artText}>50% burned</text>
      <line x1={0} y1={H - 12} x2={W} y2={H - 12} className={styles.artAxis} />
      <text x={W - 70} y={H - 2} className={styles.artText}>crank angle</text>
    </svg>
  );
}

/**
 * @param {object} props
 * @param {any[]} props.points the full-throttle pull of the current calibration
 * @param {any} props.derived the engine's derived geometry
 * @param {{label: string}} [props.fuel]
 * @param {import('../world/models/engine.js').EngineSpec} [props.spec] the engine as built, for the 3-D model
 * @param {number[][]|null} [props.ve] the tune's VE table (highest load first), for the 3-D map
 * @param {{rpm: number[], load: number[], loadUnit: string}|null} [props.veAxes] its breakpoints
 * @returns {React.ReactElement}
 */
export function PhysicsApp({ points, derived, fuel, spec, ve = null, veAxes = null }) {
  const pts = useMemo(() => points ?? [], [points]);
  const peakIdx = useMemo(() => pts.reduce((b, q, j) => (q.torque > (pts[b]?.torque ?? -1) ? j : b), 0), [pts]);
  const [idx, setIdx] = useState(/** @type {number|null} */ (null));
  const [graph, setGraph] = useState(/** @type {'power'|'ve'|'3d'} */ ('power'));
  const veRows = useMemo(() => (ve ? [...ve].reverse() : null), [ve]);
  const veLoads = useMemo(() => (veAxes ? [...veAxes.load].reverse() : null), [veAxes]);
  const i = Math.min(pts.length - 1, idx ?? peakIdx);
  const p = pts[i];
  if (!p) return <div className={styles.pad}>Build an engine first: the model needs something to run.</div>;

  // The curve at the top, and the RPM picker it doubles as.
  const CW = 600; const CH = 260;
  const maxT = Math.max(...pts.map((q) => q.torque), 1);
  const maxH = Math.max(...pts.map((q) => q.hp), 1);
  const maxVe = Math.max(...pts.map((q) => q.ve ?? 0), 1);
  const top = graph === 've' ? Math.max(110, maxVe * 1.1) : Math.max(maxT, maxH) * 1.1;
  const rpm0 = pts[0].rpm; const rpm1 = pts[pts.length - 1].rpm;
  const cx = (rpm) => ((rpm - rpm0) / Math.max(1, rpm1 - rpm0)) * (CW - 20) + 10;
  const cy = (v) => CH - 14 - (v / top) * (CH - 24);
  const line = (k) => pts.map((q) => `${cx(q.rpm).toFixed(1)},${cy(q[k]).toFixed(1)}`).join(' ');

  // The numbers each stage shows, worked from the point.
  const vCylL = derived?.perCylL ?? (derived?.displacementL ?? 3.5) / (derived?.cyl ?? 6);
  const tK = (p.iat ?? 25) + 273.15;
  const rho = ((p.map ?? 100) * 1000) / (R_AIR * tK);
  const mAirMg = (p.airCharge ?? 0) * 1000;
  const stoich = p.ecuStoich ?? 14.7;
  const vdM3 = (derived?.displacementL ?? 3.5) / 1000;
  const crankNm = ((p.bmep ?? 0) * 1e5 * vdM3) / (4 * Math.PI);
  const rollerNm = (p.torque ?? 0) * NM_PER_LBFT;
  const lost = crankNm > 0 ? Math.max(0, 1 - rollerNm / crankNm) : 0;
  // Brake thermal efficiency from BSFC (lb/hp·h = 0.6083 kg/kWh) and gasoline's 43 MJ/kg.
  const eff = 3.6 / (Math.max(0.05, p.bsfc ?? 0.45) * 0.6083 * 43);

  const stroke = derived?.stroke ?? 0; const bore = derived?.bore ?? 0;
  const pistonSpeed = (2 * (stroke / 1000) * p.rpm) / 60;
  const buildRows = /** @type {[string, string, string][]} */ ([
    ['Cylinders', `${derived?.cyl ?? '—'} · ${derived?.configuration ?? ''}`, 'how many slices the work is split into'],
    ['Bore × stroke', `${f(bore, 1)} × ${f(stroke, 1)} mm`, `${f(vCylL * 1000, 0)} cc a cylinder, ${f(derived?.displacementL, 2)} L in all`],
    ['Compression', `${f(derived?.compression, 1)} : 1`, 'squeeze before the spark: more work per burn, closer to knock'],
    ['Cam duration', `${f(derived?.camDuration, 0)}°`, 'how long the valves stay open: shapes the VE curve'],
    ['Piston speed', `${f(pistonSpeed, 1)} m/s at ${p.rpm} rpm`, 'from the stroke: what the intake has to keep up with'],
    ['Fuel', fuel?.label ?? '—', 'sets the knock limit and the stoichiometric ratio'],
  ]);
  const graphLabel = graph === 've'
    ? `Volumetric efficiency against RPM; ${p.rpm} RPM chosen, ${f(p.ve, 0)} %`
    : `Torque and power against RPM; ${p.rpm} RPM chosen`;

  return (
    <div className={`${styles.pad} ${styles.physics}`}>
      <p className={styles.lead}>
        The simulator&apos;s engine model, run on <b>your engine as built and tuned</b>{fuel ? ` on ${fuel.label}` : ''}, at full throttle.
        Pick an RPM on the graph: every panel follows it.
      </p>
      <div className={styles.physGrid}>
        <section className={`${styles.physPanel} ink-frame`} aria-label="Your build in the model">
          <h3 className={styles.panelTitle}>Your build in the model</h3>
          <div className={styles.buildSplit}>
            <dl className={styles.buildList}>
              {buildRows.map(([k, v, why]) => (
                <div key={k} className={styles.buildRow2}><dt>{k}</dt><dd><b>{v}</b><span>{why}</span></dd></div>
              ))}
            </dl>
            <CylinderCut bore={Number(f(bore, 1))} stroke={Number(f(stroke, 1))} cr={derived?.compression ?? 10} rpm={p.rpm} />
          </div>
        </section>

        <section className={`${styles.physPanel} ink-frame`} aria-label="Graph">
          <div className={styles.panelHead}>
            <h3 className={styles.panelTitle}>{graph === 've' ? 'VE against RPM' : graph === '3d' ? 'The VE map in 3-D' : 'Power and torque'}</h3>
            <div className={styles.graphBtns} role="group" aria-label="Graph">
              <button type="button" aria-pressed={graph === 've'} onClick={() => setGraph(graph === 've' ? 'power' : 've')} title="Show VE against RPM">VE</button>
              <button type="button" aria-pressed={graph === '3d'} onClick={() => setGraph(graph === '3d' ? 'power' : '3d')} title="Show the VE map in 3-D">3D</button>
            </div>
          </div>
          {graph === '3d' && veRows && veAxes && veLoads ? (
            <TableSurface x={veAxes.rpm} y={veLoads} z={veRows} lo={10} hi={130} xLabel="RPM" yLabel={veAxes.loadUnit} unit="%" decimals={0}
              title="Volumetric efficiency" xVar="rpm" yVar={veAxes.loadUnit === 'kPa' ? 'map' : null} />
          ) : (
            <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.curveSvg} role="img" aria-label={graphLabel}>
              {graph === 've' ? (
                <polyline points={line('ve')} className={styles.artLine} />
              ) : (
                <>
                  <polyline points={line('torque')} className={styles.artLine} />
                  <polyline points={line('hp')} className={styles.artLine2} />
                  <circle cx={cx(p.rpm)} cy={cy(p.hp)} r="9" className={styles.artDot} />
                  <text x={cx(p.rpm) + 14} y={cy(p.hp) - 10} className={styles.curveText2}>{f(p.hp, 0)} hp</text>
                </>
              )}
              {graph === 've' && <circle cx={cx(p.rpm)} cy={cy(p.ve ?? 0)} r="9" className={styles.artDot} />}
              <line x1={cx(p.rpm)} y1={6} x2={cx(p.rpm)} y2={CH - 14} className={styles.artWarn} />
              <line x1={0} y1={CH - 14} x2={CW} y2={CH - 14} className={styles.artAxis} />
              {graph === 've'
                ? <text x={14} y={24} className={styles.curveText}>VE (%)</text>
                : <><text x={14} y={24} className={styles.curveText}>torque (lb-ft)</text><text x={130} y={24} className={styles.curveText2}>power (hp)</text></>}
              <text x={CW - 40} y={CH - 22} className={styles.curveText}>RPM</text>
            </svg>
          )}
          <input
            type="range" className={styles.rpm} min={0} max={pts.length - 1} step={1} value={i}
            onChange={(e) => setIdx(Number(e.target.value))} aria-label="RPM" aria-valuetext={`${p.rpm} RPM`}
          />
          <div className={styles.curveNums}>{p.rpm} RPM · {f(p.torque, 0)} lb-ft · {f(p.hp, 0)} hp · VE {f(p.ve, 0)} %</div>
        </section>

        <section className={`${styles.physPanel} ink-frame`} aria-label="The raw physics model">
          <h3 className={styles.panelTitle}>The raw physics model</h3>
          <p className={styles.panelNote}>Every calculation the simulator makes at {p.rpm} RPM, in order. Open one for what it means and its numbers.</p>
      <Stage
        open n={1} title="Air in" what="The cylinder fills with air. How full it gets, against how full it could be at this pressure, is the volumetric efficiency: the number every hardware choice moves."
        eq={<>m<sub>air</sub> = VE × ρ × V<sub>cyl</sub> &nbsp;&nbsp; ρ = MAP / (R × T)</>}
        rows={[['VE', `${f(p.ve)} %`], ['MAP', `${f(p.map, 0)} kPa`], ['Charge temp', `${f(p.iat, 0)} °C = ${f(tK, 0)} K`], ['Air density ρ', `${f(rho, 3)} kg/m³`], ['V cyl', `${f(vCylL * 1000, 0)} cc`], ['Air per cylinder', `${f(mAirMg, 0)} mg`]]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          <rect x="34" y="30" width="52" height="80" className={styles.artBox} />
          <rect x="36" y={32 + (1 - Math.min(1.2, (p.ve ?? 90) / 100)) * 60} width="48" height={Math.min(1.2, (p.ve ?? 90) / 100) * 60} className={styles.artFill} />
          <rect x="36" y="92" width="48" height="16" className={styles.artBox2} />
          <path d="M10 18h30v14" className={styles.artLine} fill="none" />
          <text x="8" y="12" className={styles.artText}>intake</text>
          <text x="40" y="104" className={styles.artText}>piston</text>
        </svg>
      </Stage>

      <Stage
        n={2} title="Fuel" what="The ECU works out how much fuel that air needs for the mixture it wants, then holds the injector open long enough to deliver it."
        eq={<>m<sub>fuel</sub> = m<sub>air</sub> / (AFR<sub>stoich</sub> × λ) &nbsp;&nbsp; PW = m<sub>fuel</sub> / flow + dead time</>}
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
        <PressureTrace p={p} />
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
        eq={<>BMEP = IMEP − FMEP − PMEP &nbsp;&nbsp; T = BMEP × V<sub>d</sub> / 4π &nbsp;&nbsp; hp = T × rpm / 5252</>}
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
        eq={<>BSFC = fuel mass flow / power &nbsp;&nbsp; efficiency = 3.6 / (BSFC[kg/kWh] × LHV[MJ/kg])</>}
        rows={[['Exhaust gas temp', `${f(p.egt, 0)} °C`], ['BSFC', `${f(p.bsfc, 3)} lb/hp·h`], ['Thermal efficiency', `${f(eff * 100, 0)} % (on gasoline)`]]}
      >
        <svg viewBox="0 0 120 120" className={styles.art}>
          <rect x="10" y="40" width="100" height="22" className={styles.artBox} />
          <rect x="11" y="41" width={Math.max(4, Math.min(98, 98 * eff))} height="20" className={styles.artFill2} />
          <text x="10" y="34" className={styles.artText}>to the crank</text>
          <text x="10" y="80" className={styles.artText}>the rest: exhaust, coolant</text>
        </svg>
      </Stage>
        </section>

        <section className={`${styles.physPanel} ink-frame`} aria-label="The engine running">
          <h3 className={styles.panelTitle}>The engine, running at {p.rpm} RPM</h3>
          {spec ? <EngineViewer spec={spec} rpm={p.rpm} label={`Your engine, turning at ${p.rpm} RPM`} /> : null}
          <ol className={styles.strokes}>
            {[['Intake', `fills ${f(p.ve, 0)} % full`], ['Compression', `to ${f(derived?.compression, 1)} : 1`], ['Power', `peaks ${f(p.peakPressure, 0)} bar`], ['Exhaust', `out at ${f(p.egt, 0)} °C`]].map(([k, v], j) => (
              <li key={k} className={styles.strokeStep} style={{ animationDelay: `${j * 0.5}s` }}><b>{k}</b><span>{v}</span></li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
