/**
 * The engine's condition on the Physics page: the damage model (sim/damage.js, every number
 * sourced or marked a calibration in docs/damage-model.md), drawn in the combustion
 * cutaway's parts and palette.
 *
 * Each of the three parts the model tracks is drawn as worn as it is, and beside it, what the
 * wear is doing to the engine through the physics (never a power deduction):
 *   pistons and rings  blow-by: a share of the charge escapes past the rings before it burns,
 *                      growing with the ring gap to 1% at the end of their life;
 *   bearings           the clearance opens, the oil flows away through it (Poiseuille, the
 *                      cube of the clearance), and the pump makes less pressure at hot idle;
 *   exhaust valves     a burnt valve leaks its cylinder's charge back into the port, and below
 *                      a quarter of its life the cylinder stops firing.
 * Under each, what running at the page's speed and throttle costs that part, and why: real
 * knock the ECU pulled, knock it could not hear, a lean or rich mixture under load, peak
 * pressure past what the parts carry. Every figure is the model's own at that point.
 */

import React from 'react';

import { COEFF, FAILURE_MODES, clamp, pointWear, wearEffects } from '../../sim/index.js';

import cut from './Apps.module.css';
import { SectionHatch } from './cutawayParts.jsx';
import styles from './EngineCondition.module.css';
import { fixed as f } from '../format.js';

/** @param {number} x */
const clamp01 = (x) => clamp(x, 0, 1);
/** Health as a tone: the app's own thresholds (the desk warns under 60, alarms under 30). */
const toneOf = (h) => (h <= 0 ? 'failed' : h < 30 ? 'danger' : h < 60 ? 'warn' : 'ok');

/** A piston and its ring pack, worn by `wear` (0 new, 1 at the end of its life). */
function PistonArt({ wear, leak, failed }) {
  const W = 200; const H = 150; const x0 = 40; const w = 120; const top = 34;
  const gap = 2 + wear * 14; // the ring's end gap opens by 2π × its radial wear
  const pits = Math.round(wear * 9);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.art} role="img" aria-label={`Piston and rings, ${f((1 - wear) * 100, 0)}% of their life left`}>
          <SectionHatch />
      <rect x={x0 - 12} y={top - 6} width={w + 24} height={112} className={cut.cutBlock} />
      <rect x={x0 - 4} y={top - 6} width={w + 8} height={112} style={{ fill: 'var(--bg)' }} />
      <rect x={x0} y={top} width={w} height={70} rx={4} className={cut.cutPiston} />
      {[0.12, 0.24, 0.36].map((t, i) => (
        <g key={t}>
          <line x1={x0} x2={x0 + w / 2 - gap / 2} y1={top + 70 * t} y2={top + 70 * t} className={styles.ring} />
          <line x1={x0 + w / 2 + gap / 2} x2={x0 + w} y1={top + 70 * t} y2={top + 70 * t} className={styles.ring} />
          {i === 0 && wear > 0.05 && <text x={x0 + w / 2} y={top + 70 * t - 3} className={cut.artText} textAnchor="middle">gap</text>}
        </g>
      ))}
      {/* Knock and heat erode the crown's edge first: pits, then a hole. */}
      {Array.from({ length: pits }, (_, i) => <circle key={i} cx={x0 + 8 + ((i * 37) % (w - 16))} cy={top + 2 + (i % 2)} r={1.6 + wear} className={styles.pit} />)}
      {failed && <path d={`M${x0 + w * 0.35} ${top} q ${w * 0.15} 16 ${w * 0.3} 0 z`} style={{ fill: 'var(--bg)' }} />}
      <line x1={x0 + w / 2} y1={top + 46} x2={x0 + w / 2} y2={H - 4} className={cut.cutRod} />
      <circle cx={x0 + w / 2} cy={top + 46} r={7} className={cut.cutHub} />
      {/* Blow-by: charge escaping past the rings, as much as the model says leaks. */}
      {leak > 0.0005 && [x0 + 2, x0 + w - 2].map((x) => (
        <path key={x} d={`M${x} ${top + 4} l 0 ${30 + leak * 2500}`} className={styles.blowby} style={{ strokeWidth: 1 + leak * 300 }} />
      ))}
    </svg>
  );
}

/** A rod bearing seen end on: the journal in its shell, the oil film as thick as the clearance. */
function BearingArt({ wear, failed }) {
  const W = 200; const H = 150; const cx = 100; const cy = 78;
  const k = 1 + (COEFF.DAMAGE_BEARING_CLEARANCE_WORN - 1) * wear; // clearance against new
  const film = 2.2 * k;
  const R = 40;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.art} role="img" aria-label={`Rod bearing, clearance ${f(k, 2)} times new`}>
          <SectionHatch />
      <circle cx={cx} cy={cy} r={R + 18} className={cut.cutCase} />
      <circle cx={cx} cy={cy} r={R + film + 4} className={styles.shell} />
      <circle cx={cx} cy={cy} r={R + film} style={{ fill: 'var(--cut-oil)', opacity: failed ? 0.15 : 0.85 }} />
      <circle cx={cx} cy={cy + film * 0.6} r={R} className={cut.cutPiston} />
      {Array.from({ length: Math.round(wear * 8) }, (_, i) => {
        const a = (-150 + i * 14) * (Math.PI / 180);
        return <line key={i} x1={cx + Math.cos(a) * (R - 6)} y1={cy + film * 0.6 + Math.sin(a) * (R - 6)} x2={cx + Math.cos(a) * (R - 1)} y2={cy + film * 0.6 + Math.sin(a) * (R - 1)} className={styles.score} />;
      })}
      <circle cx={cx} cy={cy + film * 0.6} r={8} className={cut.cutHub} />
      <text x={cx} y={H - 4} className={cut.artText} textAnchor="middle">oil film = clearance, {f(k, 2)}× new</text>
    </svg>
  );
}

/** An exhaust valve on its seat, a wedge of its head burnt away as it wears. */
function ValveArt({ wear, failed }) {
  const W = 200; const H = 150; const cx = 100; const seat = 104;
  const notch = clamp01((wear - 0.3) / 0.7) * 34;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.art} role="img" aria-label={`Exhaust valve, ${f((1 - wear) * 100, 0)}% of its life left`}>
          <SectionHatch />
      <rect x={20} y={seat} width={W - 40} height={30} className={cut.cutHead} />
      <path d={`M${cx - 52} ${seat} L${cx - 40} ${seat + 10} L${cx + 40} ${seat + 10} L${cx + 52} ${seat} Z`} style={{ fill: 'var(--bg)' }} />
      <line x1={cx} y1={12} x2={cx} y2={seat - 6} className={cut.cutStem} />
      <path d={`M${cx - 50} ${seat + 2} L${cx + 50} ${seat + 2} L${cx + 6} ${seat - 14} L${cx - 6} ${seat - 14} Z`}
        className={cut.cutValve} style={{ fill: `color-mix(in srgb, var(--cut-burn) ${Math.round(wear * 60)}%, var(--ink-soft))` }} />
      {notch > 0 && <path d={`M${cx + 50 - notch} ${seat + 2} L${cx + 50} ${seat + 2} L${cx + 50 - notch * 0.4} ${seat - notch * 0.35} Z`} style={{ fill: 'var(--bg)' }} />}
      {/* What the leaking valve lets back into the port. */}
      {wear > 0.05 && [0, 1, 2].map((i) => (
        <circle key={i} cx={cx + 50 - notch / 2 + i * 8} cy={seat - 8 - i * 10 * (0.4 + wear)} r={2 + wear * 3} className={cut.gasSpent} opacity={0.4 + 0.5 * wear} />
      ))}
      {failed && <text x={cx} y={30} className={cut.artText} textAnchor="middle">no compression</text>}
    </svg>
  );
}

/**
 * @param {object} props
 * @param {{piston: number, bearing: number, valve: number}} props.health percent of life left
 * @param {any} props.point the pull's point at the page's speed and throttle
 * @param {number} props.pointsPerPull logged points in one dyno pull
 * @param {{cyl?: number, bearingFreeBar?: number, bearingWearMult?: number}} props.derived
 * @param {(() => void)|null} [props.onRepair]
 */
export function EngineCondition({ health, point: p, pointsPerPull, derived, onRepair = null }) {
  const cyl = derived?.cyl ?? 6;
  const effects = wearEffects(health, cyl) ?? { ringLeakFrac: 0, cylLossFrac: 0, deadFrac: 0, oilConductance: 1 };
  const lost = (part) => clamp01(1 - health[part] / 100);
  // What a dyno pull's worth of running at this one point costs each part: the dyno charges
  // `pointWear` per logged point, and the bearings by the pull's peak pressure over the free
  // threshold (sweep.js), so a pull held here is this point's charge over a pull's points.
  const w = p ? pointWear(p) : { piston: 0, valve: 0 };
  // One instant is judged as the live engine judges it: against the pull-average threshold
  // plus the spread a stock pull shows between its average and its highest point.
  const bearingFree = (derived?.bearingFreeBar ?? COEFF.BEARING_PRESSURE_FREE_BAR) + COEFF.BEARING_LIVE_POINT_SPREAD_BAR;
  const bearingPerPull = p ? Math.max(0, p.peakPressure - bearingFree) * COEFF.WEAR_BEARING_PER_BAR * (derived?.bearingWearMult ?? 1) : 0;
  const pistonPerPull = w.piston * pointsPerPull;
  const valvePerPull = w.valve * pointsPerPull;
  const realKnock = p && p.knockPull > (p.knockFalse ?? 0) + 0.05 ? p.knockPull : 0;
  const causes = {
    piston: [
      realKnock > 0 && `knock: the ECU pulled ${f(realKnock, 1)}° (crown erosion, ring lands)`,
      (p?.knockUnheard ?? 0) > 0 && `knock it could not hear: ${f(p.knockUnheard, 1)}°, charged ${f(COEFF.WEAR_KNOCK_UNHEARD / COEFF.WEAR_KNOCK, 0)}× heard knock`,
      p?.leanRisk && !p?.valveRisk && `lean under load: ${f(p.afr, 1)}:1, past ${COEFF.LEAN_DAMAGE_AFR}:1`,
      p?.richRisk && `rich enough to wash the bore: λ ${f(p.lambda, 2)}`,
      p?.pressureRisk && `peak pressure ${f(p.peakPressure, 0)} bar, past the parts' ${COEFF.PEAK_PRESSURE_LIMIT_BAR}`,
    ].filter(Boolean),
    bearing: [
      bearingPerPull > 0 && `peak pressure ${f(p.peakPressure, 0)} bar, over the ${f(bearingFree, 0)} bar the bottom end carries free`,
    ].filter(Boolean),
    valve: [p?.valveRisk && p?.leanRisk && `lean under boost: ${f(p.afr, 1)}:1 at ${f(p.boostPsi, 1)} psi`].filter(Boolean),
  };
  const parts = [
    {
      id: 'piston', name: 'Pistons and rings', art: <PistonArt wear={lost('piston')} leak={effects.ringLeakFrac} failed={health.piston <= 0} />,
      effect: <>Blow-by from wear: <b>{f(effects.ringLeakFrac * 100, 2)}%</b> of every charge leaves past the rings before it burns (worn out, 1%: on top of the 0.5–0.7% a new ring pack already passes).</>,
      perPull: pistonPerPull,
    },
    {
      id: 'bearing', name: 'Rod and main bearings', art: <BearingArt wear={lost('bearing')} failed={health.bearing <= 0} />,
      effect: <>The oil leaks away {f(effects.oilConductance, 2)}× as freely, so below its relief valve the pump makes <b>{f(100 / effects.oilConductance, 0)}%</b> of its pressure: low oil pressure at hot idle.</>,
      perPull: bearingPerPull,
    },
    {
      id: 'valve', name: 'Exhaust valves', art: <ValveArt wear={lost('valve')} failed={health.valve <= 0} />,
      effect: health.valve < COEFF.DAMAGE_VALVE_DEAD_BELOW
        ? <>One cylinder has <b>stopped firing</b>: {f(effects.deadFrac * 100, 0)}% of the firing events, and {f(effects.cylLossFrac * 100, 1)}% of the engine&apos;s work.</>
        : <>A burnt valve leaks its cylinder&apos;s charge back into the port: <b>{f(effects.cylLossFrac * 100, 1)}%</b> of the engine&apos;s work. Under {COEFF.DAMAGE_VALVE_DEAD_BELOW}% life the cylinder stops firing.</>,
      perPull: valvePerPull,
    },
  ];
  return (
    <div className={styles.wrap}>
      <div className={styles.parts}>
        {parts.map((part) => {
          const h = health[part.id];
          const tone = toneOf(h);
          return (
            <section key={part.id} className={styles.part} data-tone={tone} aria-label={`${part.name}, ${f(h, 0)}% of life left`}>
              <div className={styles.head}>
                <span className={styles.name}>{part.name}</span>
                <span className={styles.pct}>{f(h, 0)}%</span>
              </div>
              <div className={styles.bar} aria-hidden="true"><i style={{ width: `${clamp01(h / 100) * 100}%` }} /></div>
              {part.art}
              {h <= 0
                ? <p className={styles.failed}><b>{FAILURE_MODES[part.id].title}.</b> {FAILURE_MODES[part.id].cause}</p>
                : <p className={styles.effect}>{part.effect}</p>}
              <div className={styles.cost}>
                <span>A pull held at {p ? `${p.rpm.toLocaleString('en-US')} rpm` : 'this point'}:</span>
                <b data-zero={part.perPull <= 0 ? 'true' : undefined}>{part.perPull > 0 ? `−${f(part.perPull, part.perPull < 0.1 ? 3 : 2)}% of its life` : 'no wear'}</b>
              </div>
              {causes[part.id].length > 0 && <ul className={styles.causes}>{causes[part.id].map((c) => <li key={c}>{c}</li>)}</ul>}
            </section>
          );
        })}
      </div>
      <p className={cut.panelNote}>
        Wear is what the real parts suffer, priced from the model&apos;s own numbers at each point: knock that happened (the knock the ECU could not hear far above what it caught), a lean or rich mixture under load, and peak pressure past what the parts carry; on the stand, also oil starvation, overspeed and boiling coolant. The mechanisms and thresholds are MAHLE&apos;s piston, bearing and valve damage guides and the makers&apos; service specifications; the rates of wear are the model&apos;s calibration, since no one publishes them (docs/damage-model.md).
        {onRepair && (health.piston < 100 || health.bearing < 100 || health.valve < 100) ? <> <button type="button" className={styles.repair} onClick={onRepair}>Rebuild the engine</button></> : null}
      </p>
    </div>
  );
}
