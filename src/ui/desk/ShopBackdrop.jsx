/**
 * Your shop, drawn behind the laptop (shopScene.js), and its three things to click when the
 * laptop is shut: the dyno, the engine on its stand, and the laptop itself.
 *
 * The buttons are real buttons laid over the picture, kept on their objects as the camera
 * moves, so they work by touch, keyboard and screen reader, and with no WebGL at all (then
 * they sit in a row over a plain backdrop).
 */

import React, { useEffect, useRef } from 'react';

import { THREE } from '../world/gfx.js';

import { buildShopScene } from './shopScene.js';
import { useStage } from './useStage.js';

import styles from './Desk.module.css';

/** The shop's three hotspots: what each is called and what it opens. */
export const HOTSPOTS = [
  { id: 'dyno', label: 'DYNO', hint: 'Make a pull on the dyno' },
  { id: 'stand', label: 'LIVE', hint: 'The engine on the stand: run it live' },
  { id: 'laptop', label: 'Open the laptop', hint: 'Back to the desktop' },
  { id: 'door', label: 'Go outside', hint: 'Take a car out into town' },
  { id: 'board', label: 'Job board', hint: 'Today, customers, upgrades, training and the books' },
];

/**
 * @param {object} props
 * @param {'desk'|'bay'|'page'|'dyno'|'stand'|'board'} props.mode the laptop open, the shop with it shut, a
 *   page over it all, or walked up to one thing in it (the camera on it, the page see-through)
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand
 * @param {number} props.rpm the stand's engine speed, 0 when it is off
 * @param {number} [props.dynoRpm] the car on the dyno's engine speed during a pull, 0 between
 * @param {boolean} [props.phone] the device is a phone, not the laptop
 * @param {boolean} [props.outside] CAREER: the garage door is a way out into town
 * @param {(id: string) => void} props.onPick a hotspot was chosen
 * @param {() => void} props.onLook the backdrop was clicked with the laptop open: look up at the shop
 * @returns {React.ReactElement}
 */
export function ShopBackdrop({ mode, phone = false, outside = false, engineSpec, rpm, dynoRpm = 0, onPick, onLook }) {
  const live = useRef({ mode, rpm, dynoRpm, spec: engineSpec, specDirty: false });
  live.current.mode = mode;
  live.current.rpm = rpm;
  live.current.dynoRpm = dynoRpm;
  const key = JSON.stringify(engineSpec);
  useEffect(() => { live.current.spec = engineSpec; live.current.specDirty = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  /** @type {React.MutableRefObject<Record<string, HTMLButtonElement|null>>} */
  const spots = useRef({});
  const v = new THREE.Vector3();

  const { canvasRef, failed } = useStage((stage) => {
    const shop = buildShopScene(stage, { engineSpec: live.current.spec });
    let idle = 0;
    return {
      update(dt) {
        const l = live.current;
        // Behind a page the shop is dimmed and still, and walked up to the dyno or the stand
        // nothing moves until it runs: draw it a few times a second, not sixty, so the
        // page's own numbers have the machine to themselves.
        const scene = l.mode === 'dyno' || l.mode === 'stand' || l.mode === 'board';
        shop.setPose(l.mode === 'page' ? 'desk' : l.mode);
        const busy = scene && (shop.moving() || (l.mode === 'dyno' && l.dynoRpm > 0) || (l.mode === 'stand' && l.rpm > 0));
        if (l.mode === 'page' || (scene && !busy)) {
          idle += dt;
          if (idle < 0.25) return false;
          dt = idle;
          idle = 0;
        }
        // Framed clear of the page's bench computer: above it on an upright phone, beside it
        // on its side, and above and right of it on a wide screen (Station.module.css).
        const cv = canvasRef.current;
        if (cv) {
          const w = cv.clientWidth; const h = cv.clientHeight;
          if (w <= 560) shop.setFrame(0, 0.62);
          else if (l.mode === 'board') shop.setFrame(-0.62, 0.05);
          else if (h <= 500) shop.setFrame(0.6, 0.5);
          else shop.setFrame(0.5, 0.42);
        }
        if (l.specDirty) { l.specDirty = false; shop.setEngine(l.spec); }
        shop.update(dt, l.rpm, l.dynoRpm);
        // Keep each button on its object.
        const canvas = canvasRef.current;
        if (!canvas || l.mode !== 'bay') return;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        shop.camera.updateMatrixWorld();
        for (const [id, at] of Object.entries(shop.anchors)) {
          const el = spots.current[id];
          if (!el) continue;
          v.copy(at).project(shop.camera);
          // Kept on screen, however narrow it is: a marker never goes past the edge.
          const pad = 48;
          el.style.left = `${Math.min(w - pad, Math.max(pad, ((v.x + 1) / 2) * w))}px`;
          el.style.top = `${Math.min(h - pad, Math.max(pad, ((1 - v.y) / 2) * h))}px`;
        }
      },
    };
  }, { shadows: true });

  return (
    <div className={styles.backdrop} data-mode={mode}>
      {failed ? <div className={styles.backdropFallback} /> : <canvas ref={canvasRef} className={styles.backdropCanvas} />}
      {mode === 'desk' && (
        <button type="button" className={styles.lookUp} onClick={onLook} aria-label="Look up at the shop" />
      )}
      {mode === 'bay' && (
        <div className={failed ? styles.spotRow : styles.spotLayer}>
          {HOTSPOTS.filter((h) => outside || (h.id !== 'door' && h.id !== 'board')).map((h) => (
            <button
              key={h.id}
              ref={(el) => { spots.current[h.id] = el; }}
              type="button"
              className={styles.spot}
              data-spot={h.id}
              onClick={() => onPick(h.id)}
              title={h.hint}
            >
              <span className={styles.spotRing} aria-hidden="true" />
              <span className={`${styles.spotLabel} ink-frame`}>{h.id === 'laptop' && phone ? 'Pick up the phone' : h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
