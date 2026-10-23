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
];

/**
 * @param {object} props
 * @param {'desk'|'bay'|'page'} props.mode the laptop open, the shop with it shut, or a page over it all
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand
 * @param {number} props.rpm the stand's engine speed, 0 when it is off
 * @param {boolean} [props.phone] the device is a phone, not the laptop
 * @param {(id: string) => void} props.onPick a hotspot was chosen
 * @param {() => void} props.onLook the backdrop was clicked with the laptop open: look up at the shop
 * @returns {React.ReactElement}
 */
export function ShopBackdrop({ mode, phone = false, engineSpec, rpm, onPick, onLook }) {
  const live = useRef({ mode, rpm, spec: engineSpec, specDirty: false });
  live.current.mode = mode;
  live.current.rpm = rpm;
  const key = JSON.stringify(engineSpec);
  useEffect(() => { live.current.spec = engineSpec; live.current.specDirty = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  /** @type {React.MutableRefObject<Record<string, HTMLButtonElement|null>>} */
  const spots = useRef({});
  const v = new THREE.Vector3();

  const { canvasRef, failed } = useStage((stage) => {
    const shop = buildShopScene(stage, { engineSpec: live.current.spec });
    return {
      update(dt) {
        const l = live.current;
        shop.setPose(l.mode === 'bay' ? 'bay' : 'desk');
        if (l.specDirty) { l.specDirty = false; shop.setEngine(l.spec); }
        shop.update(dt, l.rpm);
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
          {HOTSPOTS.map((h) => (
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
