/**
 * The stage: the WebGL renderer, the sky and light, and the camera.
 *
 * The scene is drawn into a small canvas and scaled up with nearest-neighbour filtering,
 * so every pixel on screen is a big, crisp, square pixel: pixel art with real depth. How
 * big is a setting (CHUNKY, NORMAL, FINE); the default aims for about 280 rows however
 * tall the screen is, so a phone held sideways and a 4K monitor see the same picture.
 */

import { world as W } from '../tokens.js';

import { SPRITE_LIGHT, THREE } from './gfx.js';
import { makeSky } from './sky.js';

/** Internal rows of pixels each quality aims for. */
export const PIXEL_ROWS = { chunky: 200, normal: 280, fine: 420 };

const SKY = W.sky;
/** How far you see, metres: haze start and end, and where the outlines fade out. Driving looks down the road. */
const VIEW = { walk: { fog: [40, 130], ink: [60, 105] }, drive: { fog: [70, 250], ink: [90, 190] } };
const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{quality?: keyof typeof PIXEL_ROWS, shadows?: boolean, preserve?: boolean, sketch?: boolean}} [opts]
 *   `sketch` draws the scene as ink and watercolour on paper instead of pixel art: full
 *   resolution, wobbly ink outlines, pencil hatching in the shade and paper grain. The
 *   sandbox's shop is drawn this way; the career's town stays pixel art.
 */
export function createStage(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.day.horizon, VIEW.walk.fog[0], VIEW.walk.fog[1]);
  const sky = makeSky();
  scene.add(sky.group);
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

  // The picture is drawn into a small target first, then a full-screen pass puts a one-pixel
  // dark line wherever the depth jumps or folds: the outline every model of a pixel-art game
  // has, on everything at once, without a line mesh per box.
  const target = new THREE.WebGLRenderTarget(8, 8, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  target.depthTexture = new THREE.DepthTexture(8, 8);
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const post = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2(1, 1) }, near: { value: camera.near }, far: { value: camera.far },
      strength: { value: 0.62 }, thresh: { value: 0.035 }, inkNear: { value: VIEW.walk.ink[0] }, inkFar: { value: VIEW.walk.ink[1] },
      sketch: { value: opts.sketch ? 1 : 0 },
      paper: { value: new THREE.Color(W.sketch.paper) }, inkCol: { value: new THREE.Color(W.sketch.ink) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float strength; uniform float thresh; uniform float inkNear; uniform float inkFar;
      uniform float sketch; uniform vec3 paper; uniform vec3 inkCol;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      // Inverse view depth is linear across a flat surface at any angle, so its second difference is
      // zero on a floor or a wall and spikes only on a silhouette or a fold.
      float invZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return (far - d * (far - near)) / (near * far); }
      void main(){
        // SKETCH: the pen shakes. Every lookup is nudged along a slow wave, so a straight
        // edge comes out as a hand-drawn line rather than a ruled one.
        vec2 shake = sketch * texel * 1.6 * vec2(sin(vUv.y * 61.0 + vUv.x * 7.0), cos(vUv.x * 53.0 - vUv.y * 9.0));
        vec2 uv = vUv + shake;
        vec4 c = texture2D(tColor, vUv);
        vec2 tx = texel * (1.0 + sketch * 0.6);
        float w = invZ(uv);
        float l = invZ(uv - vec2(tx.x, 0.0)); float r = invZ(uv + vec2(tx.x, 0.0));
        float u = invZ(uv - vec2(0.0, tx.y)); float d = invZ(uv + vec2(0.0, tx.y));
        float lap = max((l + r) - 2.0 * w, (u + d) - 2.0 * w);
        // Positive when the neighbours are nearer: this pixel is the far side of the edge, so the
        // line sits on the farther surface and a model keeps its full silhouette.
        float edge = smoothstep(thresh, thresh * 2.0, lap / max(w, 1e-5));
        // Far scenery sits in the haze: no ink on it, or the hills turn to wire.
        edge *= 1.0 - smoothstep(inkNear, inkFar, 1.0 / max(w, 1e-5));
        if (sketch < 0.5) {
          c.rgb *= 1.0 - edge * strength;
          gl_FragColor = linearToOutputTexel(vec4(c.rgb, 1.0));
          return;
        }
        // Ink also goes where the colour changes sharply: panel lines, a stripe, a window.
        float cl = lum(texture2D(tColor, uv - vec2(tx.x, 0.0)).rgb); float cr = lum(texture2D(tColor, uv + vec2(tx.x, 0.0)).rgb);
        float cu = lum(texture2D(tColor, uv - vec2(0.0, tx.y)).rgb); float cd = lum(texture2D(tColor, uv + vec2(0.0, tx.y)).rgb);
        edge = max(edge, smoothstep(0.10, 0.22, abs(cl - cr) + abs(cu - cd)) * 0.8);
        // Watercolour: the colour thinned out towards the paper, flat and pale.
        float L = pow(max(lum(c.rgb), 0.0), 1.0 / 2.2); // as the eye sees it, not linear light
        // Grey surfaces (walls, floor, concrete) go almost to paper; coloured things keep
        // their wash, the way a sketch is coloured in only where it matters.
        vec3 sc = pow(max(c.rgb, vec3(0.0)), vec3(1.0 / 2.2));
        float sat = max(sc.r, max(sc.g, sc.b)) - min(sc.r, min(sc.g, sc.b));
        vec3 wash = mix(c.rgb, paper, 0.40 + 0.38 * (1.0 - smoothstep(0.06, 0.28, sat)));
        // Pencil hatching in the shade, and cross-hatching where it is darkest.
        vec2 f = gl_FragCoord.xy;
        float h1 = step(0.7, fract((f.x + f.y) / 7.0));
        float h2 = step(0.7, fract((f.x - f.y) / 7.0));
        float shade = smoothstep(0.30, 0.16, L);
        float deep = smoothstep(0.14, 0.05, L);
        wash = mix(wash, inkCol, h1 * shade * 0.35 + h2 * deep * 0.35);
        // Paper grain, then the ink line on top.
        wash *= 0.97 + 0.05 * hash(floor(f / 2.0));
        wash = mix(wash, inkCol, clamp(edge, 0.0, 1.0) * 0.92);
        gl_FragColor = linearToOutputTexel(vec4(wash, 1.0));
      }`,
    depthTest: false, depthWrite: false,
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

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
      // A sketch is drawn at full resolution: pen lines, not pixels.
      factor = opts.sketch ? 1 : Math.max(1, Math.round(cssH / PIXEL_ROWS[quality]));
      const { w: iw, h: ih } = stage.size;
      renderer.setSize(iw, ih, false);
      target.setSize(iw, ih);
      post.uniforms.texel.value.set(1 / iw, 1 / ih);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      camera.aspect = iw / ih;
      camera.updateProjectionMatrix();
      post.uniforms.near.value = camera.near;
      post.uniforms.far.value = camera.far;
    },

    /** @param {keyof typeof PIXEL_ROWS} q */
    setQuality(q) { quality = q; stage.resize(cssW, cssH); },

    /**
     * Light and sky for a time of day. `t` runs 0 (noon) to 3 (the dead of night) and
     * blends day, dusk and night.
     * @param {number} t
     * @param {boolean} [indoor] a room: brighter fill, fainter shadows
     */
    setTime(t, indoor = false) {
      const k = Math.max(0, Math.min(3, t));
      const [a, b, f] = k < 1 ? [SKY.day, SKY.dusk, k] : k < 2 ? [SKY.dusk, SKY.night, k - 1] : [SKY.night, SKY.night, 0];
      const horizon = mix(a.horizon, b.horizon, f);
      scene.background = horizon;
      if (scene.fog) { /** @type {THREE.Fog} */ (scene.fog).color.copy(horizon); }
      hemi.color.copy(mix(a.ambient, b.ambient, f));
      hemi.groundColor.copy(mix(a.ground, b.ground, f));
      hemi.intensity = (a.ambientPower + (b.ambientPower - a.ambientPower) * f) * (indoor ? 1.45 : 1);
      sun.color.copy(mix(a.sun, b.sun, f));
      // Indoors the sun only gets in through the open roof the camera looks through: soft
      // light from everywhere, faint shadows, the way a handheld game lights a room.
      sun.intensity = (a.sunPower + (b.sunPower - a.sunPower) * f) * (indoor ? 0.5 : 1);
      // The sun swings low at dusk and the long shadows go with it.
      const low = Math.min(1, k / 2);
      sunDir.set(-0.5 - low * 0.8, 1 - low * 0.55, 0.65);
      sunDir.normalize();
      stage.night = k >= 1.5;
      sky.setTime(a, b, f, stage.night);
      // Sprites are unlit: give them the scene's light as one tint, scaled so midday is white.
      const lit = (c, i) => new THREE.Color(c).multiplyScalar(i);
      const sunP = a.sunPower + (b.sunPower - a.sunPower) * f;
      const ambP = a.ambientPower + (b.ambientPower - a.ambientPower) * f;
      const now = lit(sun.color, sunP * 0.5).add(lit(hemi.color, ambP * 0.6));
      const noon = lit(SKY.day.sun, SKY.day.sunPower * 0.5).add(lit(SKY.day.ambient, SKY.day.ambientPower * 0.6));
      SPRITE_LIGHT.setRGB(Math.min(1.1, now.r / noon.r), Math.min(1.1, now.g / noon.g), Math.min(1.1, now.b / noon.b));
    },
    night: false,

    /**
     * Behind the wheel the view opens up: the haze moves back, the outlines reach further, and
     * the sky dome and the hills show. On foot the stage is as it always was.
     * @param {boolean} on
     */
    setDriving(on) {
      const v = on ? VIEW.drive : VIEW.walk;
      const fog = /** @type {THREE.Fog} */ (scene.fog);
      fog.near = v.fog[0];
      fog.far = v.fog[1];
      post.uniforms.inkNear.value = v.ink[0];
      post.uniforms.inkFar.value = v.ink[1];
      sky.group.visible = on;
    },

    /** Keep the shadow box around the action, snapped to its own texels so it does not shimmer. @param {THREE.Vector3} at */
    followLight(at) {
      const texel = 52 / 2048;
      const x = Math.round(at.x / texel) * texel;
      const z = Math.round(at.z / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + sunDir.x * 40, sunDir.y * 40, z + sunDir.z * 40);
      sun.target.updateMatrixWorld();
    },

    render() { drawOutlined(); },

    /** A PNG of what is on screen, scaled up to the display size, for photo mode. @returns {Promise<Blob|null>} */
    snapshot() {
      drawOutlined();
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
      target.dispose();
      post.dispose();
      renderer.dispose();
    },
  };
  function drawOutlined() {
    if (sky.group.visible) sky.follow(camera.position);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }
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
    yaw: 0, pitch: 1.0, dist: 15, fov: 34, height: 1.2,
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
      const k = snapping ? 1 : 1 - Math.exp(-dt * (rig.mode === 'chase' ? 7 : 6));
      rig._snap = false;
      if (rig.mode === 'chase') {
        // Shortest way round to sit behind the heading.
        let want = heading + Math.PI;
        const cur = rig._yaw;
        let d = want - cur;
        d = ((d + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        want = cur + d;
        rig._yaw = cur + (want - cur) * (snapping ? 1 : 1 - Math.exp(-dt * (1.8 + Math.min(2.2, speed * 0.08))));
      } else rig._yaw = rig.yaw;
      const chase = rig.mode === 'chase';
      const dist = rig.dist + Math.min(5, speed * 0.1);
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
      // Chasing, look a little way down the road, so the car sits low and the corner you are about to take is in view.
      const lead = chase ? Math.min(7, 1.5 + speed * 0.18) : 0;
      rig._look.lerp(new THREE.Vector3(target.x + rx + Math.sin(heading) * lead, target.y + rig.height * 0.6, target.z + rz + Math.cos(heading) * lead), k);
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
