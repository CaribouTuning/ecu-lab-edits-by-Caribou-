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
 * cork (`surfaces`). They are ordinary page elements, laid flat over where each face is on
 * screen, so they are as real to a pointer, a keyboard or a screen reader as anywhere else.
 * `onSurfaces` hands them to the page, which renders into them.
 */

import React, { useEffect, useRef } from 'react';

import { THREE } from '../world/gfx.js';

import { buildShopScene } from './shopScene.js';
import { useStage } from './useStage.js';

import styles from './Desk.module.css';

/** The shop's three hotspots: what each is called and what it opens. */
export const HOTSPOTS = [
  { id: 'dyno', label: 'Dyno', hint: 'Make a pull on the dyno' },
  { id: 'build', label: 'Build bench', hint: 'Build the engine, a part at a time' },
  { id: 'stand', label: 'Engine stand', hint: 'Start the engine and run it on the stand' },
  { id: 'laptop', label: 'Open the laptop', hint: 'Back to the desktop' },
  { id: 'door', label: 'Go outside', hint: 'Take a car out into town' },
  { id: 'board', label: 'Job board', hint: 'Today, customers, upgrades, training and the books' },
];

/**
 * @param {object} props
 * @param {'desk'|'bay'|'page'|'dyno'|'stand'|'build'|'board'} props.mode the laptop open, the shop with it shut, a
 *   page over it all, or walked up to one thing in it (the camera on it, the page see-through)
 * @param {import('../world/models/engine.js').EngineSpec} props.engineSpec the engine on the stand
 * @param {number} props.rpm the stand's engine speed, 0 when it is off
 * @param {number} [props.dynoRpm] the car on the dyno's engine speed during a pull, 0 between
 * @param {import('./shopScene.js').ShopCars} [props.cars] who is on the dyno and the lift (default: the shop's own two)
 * @param {boolean} [props.phone] the device is a phone, not the laptop
 * @param {boolean} [props.outside] CAREER: the job board is on the wall
 * @param {boolean} [props.town] CAREER with its 3-D town (features.js): the garage door is a way out into it
 * @param {(s: Record<string, HTMLElement>|null) => void} [props.onSurfaces] the faces the page renders into
 * @param {string|null} [props.nextSpot] the hotspot the game's next step is at: its marker is lit
 * @param {(id: string) => void} props.onPick a hotspot was chosen
 * @param {() => void} props.onLook the backdrop was clicked with the laptop open: look up at the shop
 * @returns {React.ReactElement}
 */
export function ShopBackdrop({ mode, phone = false, outside = false, town = false, engineSpec, rpm, dynoRpm = 0, cars, nextSpot = null, onSurfaces, onPick, onLook }) {
  const live = useRef({ mode, rpm, dynoRpm, spec: engineSpec, specDirty: false, cars, carsDirty: false, onSurfaces });
  live.current.mode = mode;
  live.current.onSurfaces = onSurfaces;
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
    // Each is an ordinary page element laid FLAT over where its face is on screen: placed
    // and sized from the face's projected corners every frame, never turned in 3-D. The
    // camera stands square on to each face, so the picture is the same; and a flat element
    // is hit-tested like any other, where Chromium's 3-D hit testing let taps on a turned
    // one fall through (the dyno's RUN and the stand's throttle used to miss).
    const host = stage.canvas.parentElement;
    const layer = document.createElement('div');
    layer.className = styles.surfaceLayer;
    host?.appendChild(layer);
    /** Which place each face belongs to: it shows only there. */
    const PLACE = { dynoMonitor: 'dyno', dynoConsole: 'dyno', standMonitor: 'stand', standConsole: 'stand', buildMonitor: 'build', board: 'board' };
    const faces = Object.entries(shop.surfaces).map(([name, sf]) => {
      const el = document.createElement('div');
      el.className = styles.surface;
      el.dataset.surface = name;
      el.style.position = 'absolute';
      el.style.left = '0';
      el.style.top = '0';
      el.style.pointerEvents = 'auto';
      el.style.transformOrigin = '0 0';
      el.style.display = 'none';
      layer.appendChild(el);
      return { name, sf, el, pw: 0, ph: 0 };
    });
    let sizeW = 0; let sizeH = 0;
    const fit = () => {
      sizeW = host?.clientWidth ?? 0;
      sizeH = host?.clientHeight ?? 0;
    };
    fit();
    live.current.onSurfaces?.(Object.fromEntries(faces.map((f) => [f.name, f.el])));
    const corner = new THREE.Vector3();
    /** What of the view the page leaves clear at a station: below its header and the job bar. */
    const measureFrame = () => {
      const station = host?.parentElement?.querySelector('[data-station]');
      const hr = host?.getBoundingClientRect();
      if (!station || !hr) return;
      const r = station.getBoundingClientRect();
      shop.setFrame({ top: r.top - hr.top, bottom: hr.bottom - r.bottom, left: r.left - hr.left, right: hr.right - r.right, w: hr.width, h: hr.height });
    };

    return {
      dispose() {
        live.current.onSurfaces?.(null);
        layer.remove();
      },
      update(dt) {
        const l = live.current;
        fit();
        shop.setTickets(l.mode !== 'board');
        // Behind a page the shop is dimmed and still, and walked up to the dyno or the stand
        // nothing moves until it runs: draw it a few times a second, not sixty, so the
        // page's own numbers have the machine to themselves.
        const station = l.mode === 'dyno' || l.mode === 'stand' || l.mode === 'build';
        const scene = station || l.mode === 'board';
        if (station) measureFrame();
        shop.setPose(l.mode === 'page' ? 'desk' : l.mode);
        const busy = scene && (shop.moving() || (l.mode === 'dyno' && l.dynoRpm > 0) || (l.mode === 'stand' && l.rpm > 0) || l.specDirty);
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
        const moving = shop.moving();
        for (const f of faces) {
          const on = PLACE[/** @type {keyof typeof PLACE} */ (f.name)] === l.mode;
          f.el.style.display = on ? '' : 'none';
          if (!on) continue;
          // The face's four corners on screen, and the box round them.
          let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
          f.sf.at.updateWorldMatrix(true, false);
          for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            corner.set((cx * f.sf.w) / 2, (cy * f.sf.h) / 2, 0).applyMatrix4(f.sf.at.matrixWorld).project(shop.camera);
            const sx = ((corner.x + 1) / 2) * sizeW; const sy = ((1 - corner.y) / 2) * sizeH;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
          const bw = Math.max(1, x1 - x0); const bh = Math.max(1, y1 - y0);
          // Laid out at the size it shows at, so its words are the page's own size there,
          // once the camera has stopped (not again every frame on the way). Never narrower
          // than its controls need in one row: a narrow screen shows the whole control box
          // a little smaller rather than cutting its right end off.
          const minPx = f.name.endsWith('Console') ? (bh > bw ? 220 : 420) : f.name === 'board' ? 300 : 340;
          if (!moving || f.pw === 0) {
            const pw = Math.round(Math.max(minPx, bw));
            const ph = Math.round((pw * bh) / bw);
            if (Math.abs(pw - f.pw) > 2 || Math.abs(ph - f.ph) > 2) {
              f.pw = pw; f.ph = ph;
              f.el.style.width = `${pw}px`;
              f.el.style.height = `${ph}px`;
            }
          }
          f.el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px) scale(${(bw / f.pw).toFixed(4)}, ${(bh / f.ph).toFixed(4)})`;
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
          {HOTSPOTS.filter((h) => (h.id !== 'board' || outside) && (h.id !== 'door' || (outside && town))).map((h) => (
            <button
              key={h.id}
              ref={(el) => { spots.current[h.id] = el; }}
              type="button"
              className={styles.spot}
              data-spot={h.id}
              data-next={h.id === nextSpot ? 'true' : undefined}
              onClick={() => onPick(h.id)}
              title={h.hint}
            >
              <span className={`${styles.spotLabel} ink-frame`}>{h.id === 'laptop' && phone ? 'Pick up the phone' : h.id === 'dyno' && cars?.rollers === false ? 'Road test' : h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
