/**
 * The Physics app: the engine model laid open, stage by stage, on your own engine.
 *
 * Each stage is a picture of what happens, the equation the simulator solves for it, and the
 * numbers it got for your current build and tune at the RPM you pick on the power curve at
 * the top. The numbers are the full-throttle pull the advisor and the dyno also use (the
 * app's `advisorPull`), so this page, the TUNE advice and the DYNO never disagree.
 *
 *   1 Air       how much air the cylinder takes in            m = VE x rho x V, rho = MAP / (R T)
 *   2 Fuel      how much fuel that needs, and the injector time m_f = m_air / (AFR_s x lambda)
 *   3 Burn      when the spark fires and where the pressure peaks (MFB50, MBT)
 *   4 Knock     the end gas's race against its ignition delay   integral dt / tau = 1
 *   5 Work      from cylinder pressure to torque at the crank    BMEP = IMEP - FMEP - PMEP
 *   6 Heat      where the rest of the fuel's energy goes         BSFC, EGT
 */

import React, { useMemo, useState } from 'react';

import styles from './Apps.module.css';

const R_AIR = 287;
const NM_PER_LBFT = 1.3558;

/** @param {number} v @param {number} [d] */
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

/**
 * One stage: a picture, the equation, and the numbers.
 * @param {{n: number, title: string, what: string, eq: React.ReactNode, rows: [string, string][], children: React.ReactNode}} props
 */
function Stage({ n, title, what, eq, rows, children }) {
  return (
    <section className={styles.stage} aria-labelledby={`phys-${n}`}>
      <div className={styles.stageArt} aria-hidden="true">{children}</div>
      <div className={styles.stageText}>
        <h3 id={`phys-${n}`} className={styles.stageTitle}><span className={styles.stageNum}>{n}</span>{title}</h3>
        <p className={styles.stageWhat}>{what}</p>
        <div className={styles.eq}>{eq}</div>
        <dl className={styles.nums}>
          {rows.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
        </dl>
      </div>
    </section>
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
 * @returns {React.ReactElement}
 */
export function PhysicsApp({ points, derived, fuel }) {
  const pts = useMemo(() => points ?? [], [points]);
  const peakIdx = useMemo(() => pts.reduce((b, q, j) => (q.torque > (pts[b]?.torque ?? -1) ? j : b), 0), [pts]);
  const [idx, setIdx] = useState(/** @type {number|null} */ (null));
  const i = Math.min(pts.length - 1, idx ?? peakIdx);
  const p = pts[i];
  if (!p) return <div className={styles.pad}>Build an engine first: the model needs something to run.</div>;

  // The curve at the top, and the RPM picker it doubles as.
  const CW = 1000; const CH = 220;
  const maxT = Math.max(...pts.map((q) => q.torque), 1);
  const maxH = Math.max(...pts.map((q) => q.hp), 1);
  const top = Math.max(maxT, maxH) * 1.1;
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

  return (
    <div className={styles.pad}>
      <p className={styles.lead}>
        The simulator&apos;s engine model, one stage at a time, run on <b>your engine as built and tuned</b>{fuel ? ` on ${fuel.label}` : ''}.
        Pick an RPM on the curve: every number below is the model&apos;s own answer at that speed, at full throttle.
      </p>
      <div className={styles.curve}>
        <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.curveSvg} role="img" aria-label={`Torque and power against RPM; ${p.rpm} RPM chosen`}>
          <polyline points={line('torque')} className={styles.artLine} />
          <polyline points={line('hp')} className={styles.artLine2} />
          <line x1={cx(p.rpm)} y1={6} x2={cx(p.rpm)} y2={CH - 14} className={styles.artWarn} />
          <line x1={0} y1={CH - 14} x2={CW} y2={CH - 14} className={styles.artAxis} />
          <text x={14} y={20} className={styles.curveText}>torque (lb-ft)</text>
          <text x={140} y={20} className={styles.curveText2}>power (hp)</text>
          <text x={cx(p.rpm) + 6} y={CH - 22} className={styles.curveText}>{p.rpm} rpm</text>
        </svg>
        <input
          type="range" className={styles.rpm} min={0} max={pts.length - 1} step={1} value={i}
          onChange={(e) => setIdx(Number(e.target.value))} aria-label="RPM" aria-valuetext={`${p.rpm} RPM`}
        />
        <div className={styles.curveNums}>{p.rpm} RPM · {f(p.torque, 0)} lb-ft · {f(p.hp, 0)} hp</div>
      </div>

      <Stage
        n={1} title="Air in" what="The cylinder fills with air. How full it gets, against how full it could be at this pressure, is the volumetric efficiency: the number every hardware choice moves."
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
    </div>
  );
}
