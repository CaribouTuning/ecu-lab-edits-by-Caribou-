/**
 * The Build app's engine: the model of what is built (world/models/engine.js), turning on
 * a turntable, redrawn whenever the build changes. Drag to turn it yourself.
 */

import React, { useEffect, useRef } from 'react';

import { world as W } from '../tokens.js';
import { THREE } from '../world/gfx.js';
import { makeEngine } from '../world/models/engine.js';

import { useStage } from './useStage.js';

import styles from './Desk.module.css';

/** The size the camera is framed for, metres: a big six or a V8 just fills it, so a smaller block is seen smaller. */
const REF = { len: 0.8, hgt: 0.6 };

/**
 * @param {object} props
 * @param {import('../world/models/engine.js').EngineSpec} props.spec
 * @param {number} [props.rpm] engine speed when it is running, for the belt
 * @param {string} [props.label] what the picture is, for a screen reader
 * @param {string|null} [props.caption] the block's size, printed over the picture
 * @returns {React.ReactElement}
 */
export function EngineViewer({ spec, rpm = 0, label = 'The engine as built', caption = null }) {
  const live = useRef({ spec, rpm, yaw: 0.7, drag: /** @type {null|number} */ (null), dirty: true });
  live.current.rpm = rpm;
  const key = JSON.stringify(spec);
  useEffect(() => { live.current.spec = spec; live.current.dirty = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the content: the object is new every render, and re-sending it would rebuild the 3D model each frame

  const { canvasRef, failed } = useStage((stage) => {
    stage.setTime(0, true);
    stage.scene.fog = null;
    stage.scene.background = new THREE.Color(W.engine.backdrop);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: W.engine.floor }));
    stage.scene.add(floor);
    const turntable = new THREE.Group();
    stage.scene.add(turntable);
    /** @type {ReturnType<typeof makeEngine>|null} */
    let engine = null;
    /** @type {{len: number, wid: number, hgt: number}|null} */
    let frame = null;
    let aspect = 0;
    const cam = stage.camera;
    return {
      update(dt) {
        const l = live.current;
        if (l.dirty) {
          l.dirty = false;
          if (engine) turntable.remove(engine.group);
          engine = makeEngine(l.spec);
          engine.group.position.z = 0;
          turntable.add(engine.group);
          // The same frame for every engine, sized for a large one, so a longer stroke or a
          // wider bore is a bigger block on the turntable, not the same picture refitted. Only
          // a block bigger than that (a long six at the top of the bore range) widens it.
          frame = {
            len: Math.max(REF.len, engine.size.len), wid: Math.max(0.6, engine.size.wid), hgt: Math.max(REF.hgt, engine.size.hgt),
          };
          aspect = 0;
        }
        // Fitted to the box as it is now, wide or tall: far enough back that the block's
        // height fits the vertical view and its turning length (the turntable swings it
        // through its diagonal) fits the horizontal one. A narrow box on a phone used to
        // crop the engine to a slice of its middle.
        if (frame && cam.aspect !== aspect) {
          aspect = cam.aspect;
          const vHalf = (34 / 2) * (Math.PI / 180);
          const hHalf = Math.atan(Math.tan(vHalf) * aspect);
          const reach = Math.hypot(frame.len, frame.wid) / 2;
          const dist = Math.max((frame.hgt * 0.75) / Math.tan(vHalf), (reach * 1.08) / Math.tan(hHalf));
          const dir = new THREE.Vector3(0, 0.42, 1).normalize();
          cam.fov = 34;
          cam.position.set(dir.x * dist, frame.hgt * 0.4 + dir.y * dist, dir.z * dist);
          cam.lookAt(0, frame.hgt * 0.4, 0);
          cam.updateProjectionMatrix();
        }
        if (l.drag == null) l.yaw += dt * 0.35;
        turntable.rotation.y = l.yaw;
        engine?.update(dt, l.rpm);
        stage.followLight(new THREE.Vector3(0, 0, 0));
      },
    };
  }, { hatch: false });

  const onDown = (e) => { live.current.drag = e.clientX; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    const l = live.current;
    if (l.drag == null) return;
    l.yaw += (e.clientX - l.drag) * 0.012;
    l.drag = e.clientX;
  };
  const onUp = () => { live.current.drag = null; };

  return (
    <div className={styles.viewer} role="img" aria-label={label} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
      {failed ? <div className={styles.viewerFallback}>{label}</div> : <canvas ref={canvasRef} />}
      {caption && <span className={styles.viewerCaption} aria-hidden="true">{caption}</span>}
    </div>
  );
}
