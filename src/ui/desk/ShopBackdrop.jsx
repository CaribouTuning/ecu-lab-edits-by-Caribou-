/**
 * Your shop, drawn behind the laptop (shopScene.js), and its things to click when the laptop
 * is shut: the dyno, the engine on its stand, the job board, the door and the laptop itself.
 *
 * The markers are real buttons laid over the picture, kept on their objects as the camera
 * moves, so they work by touch, keyboard and screen reader, and with no WebGL at all (then
 * they sit in a row over a plain backdrop).
 *
 * Walked up to the dyno, the stand or the board, the page's own controls are laid onto the
 * things themselves: the dyno computer's screen and console, the stand cart's, the board's
 * cork (`surfaces`). They are ordinary page elements, placed in the room with the camera's
 * own perspective (three.js's CSS3DRenderer), so they are as real to a keyboard or a screen
 * reader as anywhere else. `onSurfaces` hands them to the page, which renders into them.
 */

import React, { useEffect, useRef } from 'react';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

import { THREE } from '../world/gfx.js';

import { buildShopScene } from './shopScene.js';
import { useStage } from './useStage.js';

import styles from './Desk.module.css';

/** The shop's three hotspots: what each is called and what it opens. */
export const HOTSPOTS = [
  { id: 'dyno', label: 'Dyno', hint: 'Make a pull on the dyno' },
  { id: 'stand', label: 'Engine stand', hint: 'Run the engine on the stand' },
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
 * @param {import('./shopScene.js').ShopCars} [props.cars] who is on the dyno and the lift (default: the shop's own two)
 * @param {boolean} [props.phone] the device is a phone, not the laptop
 * @param {boolean} [props.outside] CAREER: the garage door is a way out into town
 * @param {string|null} [props.focus] the surface leaned in to, or none
 * @param {(s: Record<string, HTMLElement>|null) => void} [props.onSurfaces] the faces the page renders into
 * @param {(legible: Record<string, boolean>) => void} [props.onLegible] which faces read at their size from where you stand
 * @param {(id: string) => void} props.onPick a hotspot was chosen
 * @param {() => void} props.onLook the backdrop was clicked with the laptop open: look up at the shop
 * @returns {React.ReactElement}
 */
export function ShopBackdrop({ mode, phone = false, outside = false, engineSpec, rpm, dynoRpm = 0, cars, focus = null, onSurfaces, onLegible, onPick, onLook }) {
  const live = useRef({ mode, rpm, dynoRpm, spec: engineSpec, specDirty: false, cars, carsDirty: false, focus, onSurfaces, onLegible });
  live.current.mode = mode;
  live.current.focus = focus;
  live.current.onSurfaces = onSurfaces;
  live.current.onLegible = onLegible;
  live.current.rpm = rpm;
  live.current.dynoRpm = dynoRpm;
  const key = JSON.stringify(engineSpec);
  useEffect(() => { live.current.spec = engineSpec; live.current.specDirty = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const carsKey = JSON.stringify(cars ?? null);
  useEffect(() => { live.current.cars = cars; live.current.carsDirty = true; }, [carsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  /** @type {React.MutableRefObject<Record<string, HTMLButtonElement|null>>} */
  const spots = useRef({});
  const v = new THREE.Vector3();

  const { canvasRef, failed } = useStage((stage) => {
    const shop = buildShopScene(stage, { engineSpec: live.current.spec, cars: live.current.cars });
    live.current.carsDirty = false;
    let idle = 0;

    // ---- the faces the page's controls are laid on ----
    const host = stage.canvas.parentElement;
    const css = new CSS3DRenderer();
    css.domElement.className = styles.surfaceLayer;
    host?.appendChild(css.domElement);
    const cssScene = new THREE.Scene();
    /** Which place each face belongs to: it shows only there. */
    const PLACE = { dynoMonitor: 'dyno', dynoConsole: 'dyno', standMonitor: 'stand', standConsole: 'stand', board: 'board' };
    /** How wide each face is drawn, as a share of the screen: about what it covers there. */
    const SHARE = { dynoMonitor: 0.4, dynoConsole: 0.28, standMonitor: 0.4, standConsole: 0.28, board: 0.86 };
    // The board is only ever seen square on, so it is laid flat over where the board is on
    // screen rather than turned in 3-D: the same picture, and Chromium's 3-D hit testing
    // misses a face it is looking at exactly square on, so nothing on it could be clicked.
    const flatLayer = document.createElement('div');
    flatLayer.className = styles.surfaceLayer;
    host?.appendChild(flatLayer);
    const FLAT = new Set(['board']);
    const faces = Object.entries(shop.surfaces).map(([name, sf]) => {
      const el = document.createElement('div');
      el.className = styles.surface;
      el.dataset.surface = name;
      const flat = FLAT.has(name);
      if (flat) { flatLayer.appendChild(el); el.style.position = 'absolute'; el.style.pointerEvents = 'auto'; el.style.transformOrigin = '0 0'; }
      const obj = flat ? new THREE.Object3D() : new CSS3DObject(el);
      sf.at.updateWorldMatrix(true, false);
      sf.at.getWorldPosition(obj.position);
      sf.at.getWorldQuaternion(obj.quaternion);
      // A hair in front of the face, so the drawn one never shows through.
      obj.position.add(new THREE.Vector3(0, 0, 0.004).applyQuaternion(obj.quaternion));
      if (!flat) cssScene.add(obj);
      return { name, sf, el, obj, px: 0, flat };
    });
    let sizeW = 0; let sizeH = 0;
    let wasMoving = true;
    const fit = () => {
      const w = host?.clientWidth ?? 0; const h = host?.clientHeight ?? 0;
      if (w === sizeW && h === sizeH) return;
      wasMoving = true;
      sizeW = w; sizeH = h;
      css.setSize(w, h);
      for (const f of faces) {
        // Drawn at the size it shows at from where you stand, so its words are the page's
        // own size there; leaning in only makes them bigger.
        const share = SHARE[/** @type {keyof typeof SHARE} */ (f.name)];
        const pw = Math.round(Math.min(f.name === 'board' ? 1400 : 820, Math.max(320, w * share)));
        f.px = pw;
        f.el.style.width = `${pw}px`;
        f.el.style.height = `${Math.round((pw * f.sf.h) / f.sf.w)}px`;
        f.obj.scale.setScalar(f.sf.w / pw);
      }
    };
    fit();
    live.current.onSurfaces?.(Object.fromEntries(faces.map((f) => [f.name, f.el])));
    const legible = {};
    const corner = new THREE.Vector3();
    const measure = () => {
      // A face reads where it stands if its width on screen is most of the width it is drawn at.
      let changed = false;
      for (const f of faces) {
        if (!f.obj.visible) continue;
        corner.set(-f.sf.w / 2, 0, 0).applyQuaternion(f.obj.quaternion).add(f.obj.position).project(shop.camera);
        const x0 = corner.x;
        corner.set(f.sf.w / 2, 0, 0).applyQuaternion(f.obj.quaternion).add(f.obj.position).project(shop.camera);
        const onScreen = (Math.abs(corner.x - x0) / 2) * sizeW;
        const ok = onScreen >= f.px * 0.8;
        if (legible[f.name] !== ok) { legible[f.name] = ok; changed = true; }
      }
      if (changed) live.current.onLegible?.({ ...legible });
    };

    return {
      dispose() {
        live.current.onSurfaces?.(null);
        css.domElement.remove();
        flatLayer.remove();
      },
      update(dt) {
        const l = live.current;
        fit();
        for (const f of faces) f.obj.visible = PLACE[/** @type {keyof typeof PLACE} */ (f.name)] === l.mode;
        shop.setTickets(l.mode !== 'board');
        shop.setFocus(/** @type {any} */ (l.focus && PLACE[/** @type {keyof typeof PLACE} */ (l.focus)] === l.mode ? l.focus : null));
        // Behind a page the shop is dimmed and still, and walked up to the dyno or the stand
        // nothing moves until it runs: draw it a few times a second, not sixty, so the
        // page's own numbers have the machine to themselves.
        const scene = l.mode === 'dyno' || l.mode === 'stand' || l.mode === 'board';
        shop.setPose(l.mode === 'page' ? 'desk' : l.mode);
        const busy = scene && (shop.moving() || (l.mode === 'dyno' && l.dynoRpm > 0) || (l.mode === 'stand' && l.rpm > 0));
        // While it runs, thirty frames a second is plenty for a turning engine or wheels,
        // and leaves the readouts over it the rest of the machine.
        if (l.mode === 'page' || scene) {
          idle += dt;
          if (idle < (busy ? 1 / 30 : 0.25)) return false;
          dt = idle;
          idle = 0;
        }
        if (l.specDirty) { l.specDirty = false; shop.setEngine(l.spec); }
        if (l.carsDirty) { l.carsDirty = false; shop.setCars(l.cars ?? { dyno: {}, lift: {} }); }
        shop.update(dt, l.rpm, l.dynoRpm);
        shop.camera.updateMatrixWorld();
        css.render(cssScene, shop.camera);
        for (const f of faces) {
          if (!f.flat) continue;
          f.el.style.display = f.obj.visible ? '' : 'none';
          if (!f.obj.visible) continue;
          // Its top-left and bottom-right corners on screen.
          corner.set(-f.sf.w / 2, f.sf.h / 2, 0).applyQuaternion(f.obj.quaternion).add(f.obj.position).project(shop.camera);
          const x0 = ((corner.x + 1) / 2) * sizeW; const y0 = ((1 - corner.y) / 2) * sizeH;
          corner.set(f.sf.w / 2, -f.sf.h / 2, 0).applyQuaternion(f.obj.quaternion).add(f.obj.position).project(shop.camera);
          const x1 = ((corner.x + 1) / 2) * sizeW;
          f.el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px) scale(${((x1 - x0) / f.px).toFixed(4)})`;
        }
        if (scene) {
          const moving = shop.moving();
          if (wasMoving && !moving) measure();
          wasMoving = moving;
        }
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
              <span className={`${styles.spotLabel} ink-frame`}>{h.id === 'laptop' && phone ? 'Pick up the phone' : h.id === 'dyno' && cars?.rollers === false ? 'Road test' : h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
