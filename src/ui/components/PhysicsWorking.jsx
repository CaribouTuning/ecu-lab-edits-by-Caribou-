/**
 * The simulator's working for one operating point, step by step: air, fuel, the cycle in
 * the cylinder, the knock check, and work and losses. LIVE shows it for the instant the
 * engine is at (screens/dash/PhysicsPanel.jsx); DYNO for any point of the last pull
 * (screens/dyno/DynoPhysics.jsx).
 *
 * Every number is one the simulator computed for that point: the operating point
 * `evaluatePoint` returned (`pt`) and the cylinder pressure trace `runCycle` integrated
 * (`ph`). The equations are the ones those functions use, with that point's numbers put
 * into them; where a line is worked out here from the simulator's rounded outputs it is
 * marked ≈.
 */

import React from 'react';

import { R_AIR } from '../../sim/index.js';

import styles from './PhysicsWorking.module.css';

export { styles as physicsStyles };

/** A number with fixed decimals, or an en dash when the simulator has none. */
export const fmt = (v, dp = 1) => (Number.isFinite(v) ? Number(v).toFixed(dp) : '–');

/**
 * One line of working: what is computed, the equation, and the result.
 * @param {{name: string, eq: React.ReactNode, result: React.ReactNode}} props
 */
export function Step({ name, eq, result }) {
  return (
    <div className={styles.step}>
      <div className={styles.stepName}>{name}</div>
      <div className={styles.eq}>{eq}</div>
      <div className={styles.result}>{result}</div>
    </div>
  );
}

/**
 * A crank-angle chart: one series against degrees after TDC firing, drawn to scale.
 * @param {{points: {x: number, y: number}[], yLabel: string, yMax?: number, markers?: {x: number, label: string}[], limit?: number, tone: 'acc'|'violet'|'cyan'}} props
 */
function CrankChart({ points, yLabel, yMax, markers = [], limit, tone }) {
  // Drawn at roughly the size it shows (max 640 px wide), so the text stays at text size.
  // The y label sits in its own band above the plot, clear of the marker labels.
  const W = 600; const H = 220; const L = 40; const R = 10; const TOP = 24; const B = 32;
  if (points.length < 2) return null;
  const x0 = points[0].x; const x1 = points[points.length - 1].x;
  const top = yMax ?? Math.max(...points.map((p) => p.y), limit ?? 0) * 1.08;
  const sx = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - R);
  const sy = (y) => TOP + (1 - y / top) * (H - TOP - B);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const ticks = [-180, -90, 0, 90, 180].filter((t) => t >= x0 && t <= x1);
  const yTicks = [0, top / 2, top];
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against crank angle`}>
      {yTicks.map((t) => (
        <g key={t}>
          <line className={styles.grid} x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} />
          <text className={styles.tick} x={L - 4} y={sy(t) + 3} textAnchor="end">{t >= 10 ? Math.round(t) : fmt(t, 1)}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} className={styles.tick} x={sx(t)} y={H - 18} textAnchor="middle">{t === 0 ? 'TDC' : `${t}°`}</text>
      ))}
      <text className={styles.axis} x={W - R} y={H - 2} textAnchor="end">crank angle, ° after TDC firing</text>
      {limit != null && <line className={styles.limit} x1={L} x2={W - R} y1={sy(limit)} y2={sy(limit)} />}
      {markers.filter((m) => m.x >= x0 && m.x <= x1).map((m) => (
        <g key={m.label}>
          <line className={styles.marker} x1={sx(m.x)} x2={sx(m.x)} y1={TOP} y2={H - B} />
          <text className={styles.markerLabel} x={sx(m.x) + 4} y={TOP + 12}>{m.label}</text>
        </g>
      ))}
      <path className={styles.series} data-tone={tone} d={path} />
      <text className={styles.axis} x={L} y={13}>{yLabel}</text>
    </svg>
  );
}

/**
 * Sections 1–5 for one point, then `children` (each screen's own last section).
 * @param {{pt: Record<string, any>, ph: {trace?: any[], inputs?: Record<string, number>|null, cyl: number, displacementL: number}, children?: React.ReactNode}} props
 */
export function PhysicsWorking({ pt, ph, children }) {
  const inp = ph.inputs ?? {};
  const chargeK = pt.iat + 273.15;
  const rho = (pt.map * 1000) / (R_AIR * chargeK);
  const vCylCc = (ph.displacementL * 1000) / ph.cyl;
  const airMg = pt.airCharge * 1000;
  const lambdaCmd = pt.afrCommanded / 14.7;
  const cycleMs = 120000 / Math.max(1, pt.rpm);
  const rubbing = pt.fmep - pt.pmep;
  const crankFromBmep = (pt.bmep * 1e5 * (ph.displacementL / 1000)) / (4 * Math.PI);
  const trace = ph.trace ?? [];
  const pressure = trace.map((t) => ({ x: t.deg, y: t.bar }));
  const burned = trace.map((t) => ({ x: t.deg, y: t.xb }));
  const knock = trace.map((t) => ({ x: t.deg, y: t.ki }));
  const spark = -(inp.sparkBtdc ?? pt.timing);
  const markers = [
    { x: spark, label: 'spark' },
    { x: pt.mfb50, label: '50 %' },
  ];

  return (
    <>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>1 · Air into each cylinder</h3>
        <Step
          name="Charge density"
          eq={<>ρ = MAP ÷ (R × T) = {fmt(pt.map, 0)} kPa ÷ ({R_AIR} × {fmt(chargeK, 0)} K)</>}
          result={<>≈ {fmt(rho, 3)} kg/m³</>}
        />
        <Step
          name="Air trapped"
          eq={<>m = VE × V<sub>cyl</sub> × ρ = {fmt(pt.ve)} % × {fmt(vCylCc, 0)} cc × ρ</>}
          result={<>{fmt(airMg, 0)} mg</>}
        />
        <Step
          name="Mass airflow"
          eq={<>MAF = m × {ph.cyl} cylinders × rpm ÷ 120</>}
          result={<>{fmt(pt.maf)} g/s</>}
        />
        <p className={styles.aside}>VE here is how well this engine really fills ({fmt(pt.ve)} %). The ECU fuels from its own VE table, which says {fmt(pt.veTable)} %: the gap between them is what the fuel trims chase.</p>
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>2 · Fuel</h3>
        <Step
          name="Target mixture"
          eq={<>λ<sub>target</sub> = AFR ÷ 14.7 = {fmt(pt.afrCommanded, 2)} ÷ 14.7</>}
          result={<>≈ {fmt(lambdaCmd, 3)}</>}
        />
        {pt.fuelCmd != null && (
          <Step
            name="Fuel the ECU asks for"
            eq={<>fuel = air the ECU believes ÷ (λ<sub>target</sub> × stoichiometric AFR), with its trims</>}
            result={<>{fmt(pt.fuelCmd, 2)} mg</>}
          />
        )}
        <Step
          name="Injector pulse"
          eq={<>PW = fuel ÷ injector flow + dead time; duty = PW ÷ {fmt(cycleMs, 1)} ms per cycle</>}
          result={<>{fmt(pt.pw, 2)} ms · {pt.duty} %</>}
        />
        <Step
          name="Mixture the cylinder gets"
          eq={<>λ = air ÷ (fuel delivered{pt.fuelMass != null ? ` ${fmt(pt.fuelMass, 2)} mg` : ''} × stoichiometric AFR)</>}
          result={<>λ {fmt(pt.lambda, 3)} · AFR {fmt(pt.afr, 2)}</>}
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>3 · Inside the cylinder</h3>
        <p className={styles.aside}>
          Integrated from intake valve close to exhaust valve open, step by step:
          dp = (γ − 1)/V · (dQ<sub>burn</sub> − dQ<sub>wall</sub>) − γ · p · dV/V, with the burn following a Wiebe curve and
          Woschni heat loss to the walls. Trapped at intake close: {fmt(inp.trappedBar, 2)} bar, {fmt(inp.trappedK, 0)} K,
          {' '}{fmt(inp.trappedMassG * 1000, 0)} mg; fuel heat to release {fmt(inp.heatJ, 0)} J.
        </p>
        <CrankChart points={pressure} yLabel="cylinder pressure, bar" markers={markers} tone="acc" />
        <div className={styles.facts}>
          <span>Spark {fmt(inp.sparkBtdc ?? pt.timing)}° BTDC</span>
          <span>Flame takes {fmt(inp.flameDevDeg, 0)}° to form, burns over {fmt(pt.burnDeg)}°</span>
          <span>50 % burned at {fmt(pt.mfb50)}° ATDC</span>
          <span>Peak {fmt(pt.peakPressure)} bar at {fmt(pt.peakPressureDeg)}°</span>
        </div>
        <CrankChart points={burned} yLabel="fraction of the charge burned" yMax={1.05} markers={markers} tone="violet" />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>4 · Knock check</h3>
        <p className={styles.aside}>
          The unburned end gas ahead of the flame is heated by compression and by the flame. Its ignition delay is
          τ = A · (p/1 atm)<sup>−n</sup> · e<sup>B/T</sup> (Douaud and Eyzat); the engine knocks if ∫ dt/τ reaches 1
          before the flame arrives (Livengood and Wu).
        </p>
        <CrankChart points={knock} yLabel="knock integral ∫dt/τ (1 = knock)" yMax={Math.max(1.15, (pt.knockIntegral ?? 0) * 1.1)} limit={1} tone="cyan" />
        <Step
          name="This cycle"
          eq={<>end gas peaked at {pt.endGasK} K; integral reached {fmt(pt.knockIntegral, 3)}</>}
          result={pt.knock ? <span className={styles.bad}>knock</span> : <span className={styles.good}>no knock</span>}
        />
        <Step
          name="Spark"
          eq={<>knock limit {fmt(pt.threshold)}° · table asks {fmt(pt.commandedTiming)}° · margin {fmt(pt.margin)}°</>}
          result={<>runs {fmt(pt.timing)}° BTDC</>}
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>5 · Work and losses</h3>
        <Step name="Gas work on the piston" eq={<>IMEP = ∮ p dV ÷ V<sub>d</sub></>} result={<>{fmt(pt.imep, 2)} bar</>} />
        <Step name="Pumping" eq={<>PMEP = exhaust − intake pressure loop</>} result={<>{fmt(pt.pmep, 2)} bar</>} />
        <Step name="Rubbing friction and drives" eq={<>FMEP − PMEP</>} result={<>{fmt(rubbing, 2)} bar</>} />
        <Step name="What reaches the crank" eq={<>BMEP = IMEP − FMEP</>} result={<>{fmt(pt.bmep, 2)} bar</>} />
        <Step
          name="Torque"
          eq={<>T = BMEP × V<sub>d</sub> ÷ 4π = {fmt(pt.bmep, 2)} bar × {fmt(ph.displacementL, 2)} L ÷ 4π</>}
          result={<>≈ {fmt(crankFromBmep, 0)} N·m crank · {pt.torque} lb·ft wheel</>}
        />
      </section>

      {children}
    </>
  );
}
