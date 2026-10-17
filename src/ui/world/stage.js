/**
 * The stage: the WebGL renderer, the sky and light, and the camera.
 *
 * The scene is drawn into a small canvas and scaled up with nearest-neighbour filtering,
 * so every pixel on screen is a big, crisp, square pixel: pixel art with real depth. How
 * big is a setting (CHUNKY, NORMAL, FINE); the default aims for about 280 rows however
 * tall the screen is, so a phone held sideways and a 4K monitor see the same picture.
 */

import { world as W } from '../tokens.js';

import { THREE } from './gfx.js';

/** Internal rows of pixels each quality aims for. */
export const PIXEL_ROWS = { chunky: 200, normal: 280, fine: 420 };

const SKY = W.sky;
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{quality?: keyof typeof PIXEL_ROWS, shadows?: boolean, preserve?: boolean}} [opts]
 */
export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.day.horizon, 40, 130);
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.3, 400);
  camera.position.set(0, 12, 14);

  const hemi = new THREE.HemisphereLight(SKY.day.ambient, SKY.day.ground, SKY.day.ambientPower);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(SKY.day.sun, SKY.day.sunPower);
  sun.castShadow = opts.shadows !== false;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 90;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(-0.5, 1, 0.65).normalize();

  let quality = opts.quality ?? 'normal';
  let cssW = 0;
  let cssH = 0;
  let factor = 3;

  const stage = {
    renderer, scene, camera, sun, hemi, canvas,
    get factor() { return factor; },
    get quality() { return quality; },
    /** Whole-pixel size of the picture: width, height of the drawn (small) canvas. */
    get size() { return { w: Math.max(1, Math.floor(cssW / factor)), h: Math.max(1, Math.floor(cssH / factor)) }; },

    /** Re-measure and re-size. @param {number} [w] @param {number} [h] */
    resize(w, h) {
      const rect = canvas.parentElement?.getBoundingClientRect();
      cssW = w ?? Math.max(2, Math.floor(rect?.width ?? canvas.clientWidth ?? 800));
      cssH = h ?? Math.max(2, Math.floor(rect?.height ?? canvas.clientHeight ?? 450));
      factor = Math.max(1, Math.round(cssH / PIXEL_ROWS[quality]));
      const { w: iw, h: ih } = stage.size;
      renderer.setSize(iw, ih, false);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      camera.aspect = iw / ih;
      camera.updateProjectionMatrix();
    },

    /** @param {keyof typeof PIXEL_ROWS} q */
    setQuality(q) { quality = q; stage.resize(cssW, cssH); },

    /**
     * Light and sky for a time of day. `t` runs 0 (noon) to 3 (the dead of night) and
     * blends day, dusk and night.
     * @param {number} t
     */
    setTime(t) {
      const k = Math.max(0, Math.min(3, t));
      const [a, b, f] = k < 1 ? [SKY.day, SKY.dusk, k] : k < 2 ? [SKY.dusk, SKY.night, k - 1] : [SKY.night, SKY.night, 0];
      const horizon = mix(a.horizon, b.horizon, f);
      scene.background = horizon;
      if (scene.fog) { /** @type {THREE.Fog} */ (scene.fog).color.copy(horizon); }
      hemi.color.copy(mix(a.ambient, b.ambient, f));
      hemi.groundColor.copy(mix(a.ground, b.ground, f));
      hemi.intensity = a.ambientPower + (b.ambientPower - a.ambientPower) * f;
      sun.color.copy(mix(a.sun, b.sun, f));
      sun.intensity = a.sunPower + (b.sunPower - a.sunPower) * f;
      // The sun swings low at dusk and the long shadows go with it.
      const low = Math.min(1, k / 2);
      sunDir.set(-0.5 - low * 0.8, 1 - low * 0.55, 0.65);
      sunDir.normalize();
      stage.night = k >= 1.5;
    },
    night: false,

    /** Keep the shadow box around the action, snapped to its own texels so it does not shimmer. @param {THREE.Vector3} at */
    followLight(at) {
      const texel = 52 / 2048;
      const x = Math.round(at.x / texel) * texel;
      const z = Math.round(at.z / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + sunDir.x * 40, sunDir.y * 40, z + sunDir.z * 40);
      sun.target.updateMatrixWorld();
    },

    render() { renderer.render(scene, camera); },

    /** A PNG of what is on screen, scaled up to the display size, for photo mode. @returns {Promise<Blob|null>} */
    snapshot() {
      renderer.render(scene, camera);
      const out = document.createElement('canvas');
      out.width = cssW;
      out.height = cssH;
      const g = out.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(canvas, 0, 0, cssW, cssH);
      return new Promise((res) => out.toBlob(res, 'image/png'));
    },

    dispose() {
      scene.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.geometry) m.geometry.dispose(); });
      renderer.dispose();
    },
  };
  stage.setTime(0);
  stage.resize();
  return stage;
}

/**
 * A camera that follows something: behind and above it, at a set angle, with a little
 * lag so it glides. Chase mode swings round behind a moving car.
 *
 * @param {THREE.PerspectiveCamera} camera
 */
export function createRig(camera) {
  const rig = {
    /** 'follow' keeps a fixed bearing; 'chase' turns to sit behind the target's heading. */
    mode: 'follow',
    yaw: 0, pitch: 0.82, dist: 15, fov: 34, height: 1.2,
    pos: new THREE.Vector3(),
    shake: 0,
    /** Slide the whole picture sideways (metres along the camera's right) to make room for a panel. */
    shiftX: 0,
    _shift: 0,
    _yaw: 0,
    _look: new THREE.Vector3(),
    /** Drops the camera straight onto its target, no gliding. */
    snap() { rig._snap = true; },
    _snap: true,

    /**
     * @param {number} dt
     * @param {THREE.Vector3} target
     * @param {number} [heading] the target's heading, for chase
     * @param {number} [speed] m/s, which widens the lens and pulls the camera back
     */
    update(dt, target, heading = 0, speed = 0) {
      const snapping = rig._snap;
      const k = snapping ? 1 : 1 - Math.exp(-dt * (rig.mode === 'chase' ? 3.2 : 6));
      rig._snap = false;
      if (rig.mode === 'chase') {
        // Shortest way round to sit behind the heading.
        let want = heading + Math.PI;
        const cur = rig._yaw;
        let d = want - cur;
        d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        want = cur + d;
        rig._yaw = cur + (want - cur) * (snapping ? 1 : 1 - Math.exp(-dt * 2.4));
      } else rig._yaw = rig.yaw;
      const dist = rig.dist + Math.min(6, speed * 0.12);
      const horiz = Math.cos(rig.pitch) * dist;
      const want = new THREE.Vector3(
        target.x + Math.sin(rig._yaw) * horiz,
        target.y + rig.height + Math.sin(rig.pitch) * dist,
        target.z + Math.cos(rig._yaw) * horiz,
      );
      rig._shift += (rig.shiftX - rig._shift) * (snapping ? 1 : 1 - Math.exp(-dt * 5));
      const rx = Math.cos(rig._yaw) * rig._shift;
      const rz = -Math.sin(rig._yaw) * rig._shift;
      want.x += rx; want.z += rz;
      rig.pos.lerp(want, k);
      rig._look.lerp(new THREE.Vector3(target.x + rx, target.y + rig.height * 0.6, target.z + rz), k);
      camera.position.copy(rig.pos);
      if (rig.shake > 0.001) {
        camera.position.x += (Math.random() - 0.5) * rig.shake;
        camera.position.y += (Math.random() - 0.5) * rig.shake;
        rig.shake *= Math.exp(-dt * 8);
      }
      camera.lookAt(rig._look);
      const fov = rig.fov + Math.min(14, speed * 0.28);
      if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
    },
  };
  return rig;
}
