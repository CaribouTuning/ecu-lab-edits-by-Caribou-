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

/** The size the camera is framed for: about a V8's block, metres. */
const REF = { len: 1.15, hgt: 0.75 };

/**
 * @param {object} props
 * @param {import('../world/models/engine.js').EngineSpec} props.spec
 * @param {number} [props.rpm] engine speed when it is running, for the belt
 * @param {string} [props.label] what the picture is, for a screen reader
 * @returns {React.ReactElement}
 */
export function EngineViewer({ spec, rpm = 0, label = 'The engine as built' }) {
  const live = useRef({ spec, rpm, yaw: 0.7, drag: /** @type {null|number} */ (null), dirty: true });
  live.current.rpm = rpm;
  const key = JSON.stringify(spec);
  useEffect(() => { live.current.spec = spec; live.current.dirty = true; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

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
          // The same camera for every engine, framed for a large one, so a longer stroke or a
          // wider bore is a bigger block on the turntable, not the same picture refitted.
          cam.fov = 34;
          cam.position.set(0, REF.hgt * 0.9 + REF.len * 0.55, REF.len * 2.1);
          cam.lookAt(0, REF.hgt * 0.4, 0);
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
    </div>
  );
}
