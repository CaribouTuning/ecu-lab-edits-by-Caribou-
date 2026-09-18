/**
 * DRAG > the strip itself: the christmas tree, the scene, and the car on it.
 *
 * PRESENTATION ONLY. Every number this file draws with — position, speed, gear, engine
 * speed, whether the tyre is lit — is read out of a run `simulateDragRun` has ALREADY
 * solved in full. Nothing here integrates anything, which is what makes it impossible
 * for the animation to disagree with the time slip beside it.
 *
 * WHY THE COLOURS COME FROM `strip` AND NOT FROM CSS
 * The scene is an illustration, not interface: a yellow car is not a warning and a
 * road surface is not a status, so routing it through the semantic ramp
 * (`acc`/`ok`/`warn`/`danger`) would make the design system say something it does not
 * mean. `strip` in tokens.js is the art palette that answers that — see its comment
 * there. It is JS rather than CSS custom properties because these values land in an
 * inline SVG's gradient stops and in computed positions, neither of which a stylesheet
 * can reach. Layout and type still live in the stylesheet next door.
 */

import React, { useEffect, useRef, useState } from 'react';

import { MPH_PER_MS, QUARTER_MILE_M, SIXTY_FEET_M, clamp } from '../../../sim/index.js';
import { Panel } from '../../primitives/Panel.jsx';
import { T, horizonGlowAlpha, smokeAlpha, strip } from '../../theme.js';

import styles from './DragStrip.module.css';

/**
 * Body outlines, one per entry in `CAR_BODIES` and in the same order.
 *
 * Each is drawn into the same 420x168 box with its wheels on a common ground line, so
 * swapping bodies cannot shift the strip's layout. `wheels` are the two axle centres
 * and `wr` the tyre radius, both in that box's units.
 *
 * @type {{body: string, glass: string, wheels: number[], wr: number}[]}
 */
const BODY_PATHS = [
  // Sports coupe — low nose, cab rearward, fastback
  { body: 'M 22 104 L 44 92 L 92 84 L 132 82 L 168 52 L 246 46 L 300 62 L 352 76 L 388 88 L 400 100 L 400 116 L 22 116 Z',
    glass: 'M 176 56 L 244 51 L 292 65 L 300 78 L 150 80 Z', wheels: [112, 316], wr: 30 },
  // Supercar — very low, long tail, cab far forward
  { body: 'M 16 106 L 40 96 L 96 88 L 140 60 L 214 52 L 268 58 L 340 70 L 396 84 L 406 102 L 406 116 L 16 116 Z',
    glass: 'M 150 62 L 212 56 L 258 62 L 268 78 L 132 80 Z', wheels: [104, 320], wr: 30 },
  // Sedan — three-box, taller greenhouse, longer roof
  { body: 'M 20 100 L 44 88 L 96 82 L 128 54 L 258 50 L 300 76 L 372 82 L 400 94 L 402 116 L 20 116 Z',
    glass: 'M 136 58 L 254 54 L 288 76 L 126 78 Z', wheels: [106, 322], wr: 29 },
  // Van — tall box, flat face, short nose
  { body: 'M 24 108 L 30 60 L 60 36 L 300 32 L 384 44 L 402 74 L 404 116 L 24 116 Z',
    glass: 'M 46 62 L 66 42 L 172 40 L 172 62 Z M 186 40 L 292 38 L 300 62 L 186 62 Z', wheels: [96, 330], wr: 31 },
  // Truck — cab plus open bed
  { body: 'M 20 104 L 34 66 L 74 44 L 196 42 L 226 68 L 236 78 L 236 62 L 400 62 L 404 116 L 20 116 Z',
    glass: 'M 52 66 L 80 50 L 190 48 L 206 66 Z', wheels: [98, 332], wr: 32 },
];

/** Spoke angles, degrees. Four lines through the hub, so eight spokes. */
const SPOKE_ANGLES = [0, 45, 90, 135];

/**
 * The car, drawn to whatever body the player picked.
 *
 * @param {object} props
 * @param {number} [props.w] rendered width, px
 * @param {number} [props.squat] 0..1, how hard it is accelerating — the body rotates
 *   about the REAR axle by this much, which is the visible half of the weight transfer
 *   the physics is already computing
 * @param {boolean} [props.spinning] whether the driven tyre is lit
 * @param {number} [props.bodyIdx] index into {@link BODY_PATHS}
 * @returns {React.ReactElement}
 */
export function CarSprite({ w = 190, squat = 0, spinning = false, bodyIdx = 0 }) {
  const B = BODY_PATHS[bodyIdx] || BODY_PATHS[0];
  return (
    // The car travels left to right, so the nose must point right. The artwork is
    // drawn nose-left, so the whole thing is mirrored here.
    <svg
      width={w} height={w * 0.40} viewBox="0 0 420 168" aria-hidden="true"
      className={styles.sprite}
    >
      <defs>
        <linearGradient id="dragpaint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strip.paintHi} />
          <stop offset="38%" stopColor={strip.paint} />
          <stop offset="72%" stopColor={strip.paintMid} />
          <stop offset="100%" stopColor={strip.paintLow} />
        </linearGradient>
        <linearGradient id="dragwin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strip.glassHi} />
          <stop offset="100%" stopColor={strip.glassLow} />
        </linearGradient>
      </defs>

      <g transform={`rotate(${-squat * 1.5} 300 128)`}>
        <path d={B.body} fill="url(#dragpaint)" stroke={strip.paintEdge} strokeWidth="2" strokeLinejoin="round" />
        <path d={B.glass} fill="url(#dragwin)" />
        <path d="M 96 96 L 384 92" stroke={strip.paintLine} strokeWidth="1.6" opacity="0.65" />
        <path d="M 244 80 L 240 114" stroke={strip.paintLine} strokeWidth="1.6" opacity="0.5" />
        <path d="M 24 98 L 54 94 L 54 102 L 24 104 Z" fill={strip.headlight} opacity="0.92" />
        <path d="M 372 88 L 396 96 L 394 104 L 370 98 Z" fill={strip.taillight} />
        <rect x="120" y="112" width="180" height="6" rx="3" fill={strip.paintShadow} opacity="0.75" />
      </g>

      {/* Wheels sit on the road regardless of body attitude. */}
      {B.wheels.map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={122} r={B.wr} fill={strip.tyre} stroke={strip.tyreWall} strokeWidth="3" />
          <circle cx={cx} cy={122} r="17" fill={strip.rim} stroke={spinning && i === 1 ? T.acc : strip.rimEdge} strokeWidth="3" />
          {SPOKE_ANGLES.map((ang) => (
            <line
              key={ang}
              x1={cx - 14 * Math.cos((ang * Math.PI) / 180)} y1={122 - 14 * Math.sin((ang * Math.PI) / 180)}
              x2={cx + 14 * Math.cos((ang * Math.PI) / 180)} y2={122 + 14 * Math.sin((ang * Math.PI) / 180)}
              stroke={strip.spoke} strokeWidth="2.5"
            />
          ))}
        </g>
      ))}
      {B.wheels.map((cx) => (
        <path
          key={cx} d={`M ${cx - B.wr} 116 A ${B.wr} ${B.wr} 0 0 1 ${cx + B.wr} 116`}
          fill="none" stroke={strip.paintLine} strokeWidth="3"
        />
      ))}
    </svg>
  );
}

/**
 * Christmas tree: two stage bulbs, three ambers, then green.
 *
 * @param {object} props
 * @param {number} props.phase 0 dark, 1 staged, 2-4 ambers, 5 green
 * @returns {React.ReactElement}
 */
export function LightTree({ phase }) {
  /**
   * @param {string} key react key
   * @param {boolean} on whether the bulb is lit
   * @param {string} color the lit colour
   * @param {number} [size] diameter, px
   * @returns {React.ReactElement}
   */
  const bulb = (key, on, color, size = 15) => (
    <div
      key={key}
      className={styles.bulb}
      style={{
        width: size, height: size,
        background: on ? color : strip.bulbOff,
        boxShadow: on ? `0 0 10px ${color}, 0 0 20px ${color}` : 'none',
        borderColor: on ? color : strip.bulbRim,
      }}
    />
  );
  return (
    <div className={styles.tree} aria-hidden="true">
      {bulb('pre', phase >= 1, strip.stage, 9)}
      {bulb('stage', phase >= 1, strip.stage, 9)}
      {bulb('a1', phase === 2, T.warn)}
      {bulb('a2', phase === 3, T.warn)}
      {bulb('a3', phase === 4, T.warn)}
      {bulb('green', phase >= 5, T.ok)}
    </div>
  );
}

/**
 * Tyre smoke: puffs spawn at the driven wheel while it spins, then drift and expand.
 *
 * @param {object} props
 * @param {{id: number, x: number, y: number, r: number, a: number}[]} props.puffs
 * @returns {React.ReactElement[]}
 */
function Smoke({ puffs }) {
  return puffs.map((p) => (
    <div
      key={p.id} aria-hidden="true" className={styles.puff}
      style={{
        left: p.x, bottom: p.y, width: p.r * 2, height: p.r * 2,
        background: smokeAlpha(p.a),
      }}
    />
  ));
}

/** How often the smoke advances, ms. */
const PUFF_STEP_MS = 40;

/** Ceiling on live puffs, so a long burnout cannot grow the DOM without bound. */
const PUFF_LIMIT = 45;

/**
 * The strip.
 *
 * `tNow` scrubs the completed run's trace, so what is drawn is a REPLAY of physics
 * that has already been solved rather than a second, subtly different simulation
 * running alongside the first.
 *
 * @param {object} props
 * @param {import('../../../sim/index.js').DragResult|null} props.res the solved run
 * @param {number} props.tNow playback clock, seconds into the run
 * @param {boolean} props.running whether playback is live (smoke only spawns then)
 * @param {number} props.treePhase see {@link LightTree}
 * @param {number} props.bodyIdx which body to draw
 * @returns {React.ReactElement}
 */
export function DragStrip({ res, tNow, running, treePhase, bodyIdx }) {
  const [puffs, setPuffs] = useState([]);
  const puffId = useRef(0);

  let frac = 0, mph = 0, gear = 1, spinning = false, rpm = 0, accel = 0;
  const pt = res ? (res.trace.find((p) => p.t >= tNow) ?? res.trace[res.trace.length - 1]) : null;
  if (pt) {
    frac = clamp(pt.x / QUARTER_MILE_M, 0, 1);
    mph = pt.v * MPH_PER_MS; gear = pt.gear; spinning = pt.spinning; rpm = pt.rpm; accel = pt.a;
  }

  // `spinning` is read through a ref rather than a dependency: it flips many times a
  // second during a launch, and depending on it would tear down and rebuild this
  // interval on almost every frame. The interval is installed once per run instead.
  const spinningRef = useRef(spinning);
  spinningRef.current = spinning;

  useEffect(() => {
    if (!running) {
      setPuffs([]);
      return undefined;
    }
    const id = setInterval(() => {
      setPuffs((prev) => {
        const moved = prev
          .map((p) => ({ ...p, x: p.x - 4, y: p.y + 1.2, r: p.r + 1.8, a: p.a - 0.05 }))
          .filter((p) => p.a > 0.02);
        if (spinningRef.current) {
          for (let i = 0; i < 3; i++) {
            moved.push({
              id: puffId.current++, x: 26 + Math.random() * 30, y: 2 + Math.random() * 10,
              r: 6 + Math.random() * 6, a: 0.45 + Math.random() * 0.25,
            });
          }
        }
        return moved.slice(-PUFF_LIMIT);
      });
    }, PUFF_STEP_MS);
    return () => clearInterval(id);
  }, [running]);

  return (
    <Panel tight className={styles.panel}>
      <div className={styles.markers}>
        <span>START</span><span>60 FT</span><span>1/8</span><span>1/4 MILE</span>
      </div>

      <div className={styles.row}>
        <LightTree phase={treePhase} />

        <div
          className={styles.scene}
          style={{
            background: `linear-gradient(180deg,${strip.sky} 0%,${strip.skyLow} 34%,${strip.horizon} 36%,${strip.ground} 62%,${strip.groundLow} 100%)`,
          }}
        >
          <div className={styles.horizonGlow} style={{ background: `linear-gradient(180deg,${horizonGlowAlpha(0.10)},transparent)` }} />
          <div className={styles.wall} style={{ background: strip.wall, borderTopColor: strip.wallTop }} />
          {[...Array(16)].map((_, i) => (
            <div
              key={i} className={styles.wallPost}
              style={{ background: strip.wallPost, left: `${(i * 6.6 - ((frac * 260) % 6.6))}%` }}
            />
          ))}
          <div className={styles.surface} style={{ background: strip.surface }} />
          <div className={styles.groove} style={{ background: strip.groove }} />
          {/* Moving surface texture conveys speed. */}
          {[...Array(20)].map((_, i) => (
            <div
              key={i} className={styles.texture}
              style={{ background: strip.texture, left: `${(((i * 6) - ((frac * 340) % 6)) % 108 + 108) % 108}%` }}
            />
          ))}
          {/* Distance boards, placed at the real fractions of the strip. */}
          {[[SIXTY_FEET_M / QUARTER_MILE_M, '60'], [0.5, '660']].map(([f, lbl]) => (
            <div key={lbl} className={styles.board} style={{ left: `${Number(f) * 92}%` }}>{lbl}</div>
          ))}
          <div
            className={styles.finish}
            style={{ background: `repeating-linear-gradient(180deg,${strip.stripeLight} 0 5px,${strip.stripeDark} 5px 10px)` }}
          />

          <div className={styles.carLayer} style={{ left: `calc(${frac * 78}% + 4px)` }}>
            <div className={styles.carAnchor}>
              <Smoke puffs={puffs} />
              <div className={mph > 100 ? styles.fast : undefined}>
                <CarSprite w={132} squat={clamp(accel / 8, 0, 1)} spinning={spinning} bodyIdx={bodyIdx} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.readout}>
        <span className={styles.speed}>{mph.toFixed(0)}<span className={styles.unit}> MPH</span></span>
        <span className={spinning ? styles.spinning : styles.gear}>{spinning ? 'WHEELSPIN' : `GEAR ${gear}`}</span>
        <span className={styles.revs}>{Math.round(rpm)}<span className={styles.unit}> RPM</span></span>
      </div>
    </Panel>
  );
}
