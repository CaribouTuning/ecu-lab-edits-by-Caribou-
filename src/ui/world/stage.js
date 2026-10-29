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
 * @param {{quality?: keyof typeof PIXEL_ROWS, shadows?: boolean, preserve?: boolean, sketch?: boolean, hatch?: boolean, maxDpr?: number, real?: boolean}} [opts]
 *   `maxDpr` caps how many drawn pixels a sketch spends per screen pixel (default 2).
 *   `hatch: false` (a sketch only) leaves out the hatching and grain: clean, crisp ink
 *   outlines on the model's own colours, for a close-up such as the Build engine.
 *   `sketch` draws the scene as if doodled by hand instead of pixel art: full resolution,
 *   its own colours and light, ink outlines, pencil hatching in the shade and paper
 *   grain, all held still. The shop is drawn this way, and the town too unless its quality
 *   is set to CHUNKY.
 */
export function createStage(canvas, opts = {}) {
  // `real`: a room lit as one (the shop): smoothed edges, soft shadows, film-like tone
  // response, and no drawn outline over it.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!opts.real, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: !!opts.preserve });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = opts.shadows !== false;
  renderer.shadowMap.type = opts.real ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = opts.real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = opts.real ? 0.85 : 1;

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
  // The shop (`real`) keeps its light in half floats, smoothed edges and all, so the film
  // response is applied once, after the lines: a lit room with an engineer's drawing over it.
  const target = new THREE.WebGLRenderTarget(8, 8, opts.real
    ? { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, type: THREE.HalfFloatType, samples: 4 }
    : { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  target.depthTexture = new THREE.DepthTexture(8, 8);
  target.depthTexture.minFilter = THREE.NearestFilter;
  target.depthTexture.magFilter = THREE.NearestFilter;
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const post = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture }, tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2(1, 1) }, near: { value: camera.near }, far: { value: camera.far },
      strength: { value: opts.real ? 0.5 : 0.62 }, thresh: { value: 0.035 }, inkNear: { value: VIEW.walk.ink[0] }, inkFar: { value: VIEW.walk.ink[1] },
      sketch: { value: opts.sketch && !opts.real ? 1 : 0 }, hatch: { value: opts.hatch === false ? 0 : 1 }, lw: { value: 1 },
      inkCol: { value: new THREE.Color(W.sketch.ink) },
      projScale: { value: 1 },
    },
    // The shop on a desktop: contact shading where things meet (see `ao` in the shader).
    // A phone or tablet goes without; its frame rate matters more.
    defines: opts.real && !(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) ? { AO: 1 } : {},
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float near; uniform float far; uniform float strength; uniform float thresh; uniform float inkNear; uniform float inkFar;
      uniform float sketch; uniform float hatch; uniform vec3 inkCol; uniform float lw;
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      float vnoise(vec2 p){
        vec2 i = floor(p); vec2 q = fract(p); q = q * q * (3.0 - 2.0 * q);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), q.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), q.x), q.y);
      }
      // Inverse view depth is linear across a flat surface at any angle, so its second difference is
      // zero on a floor or a wall and spikes only on a silhouette or a fold.
      float invZ(vec2 uv){ float d = texture2D(tDepth, uv).x; return (far - d * (far - near)) / (near * far); }
      #ifdef AO
      uniform float projScale;
      // Ambient occlusion from the depth alone: light that cannot reach into a corner, under
      // a car, where a stand's foot meets the floor. Each pair of samples either side of the
      // pixel predicts, from one, where the other would be if the surface were flat (inverse
      // depth is linear across a plane); a sample nearer than that is something in the way.
      // A plane at any slope is left alone, and an occluder far in front (a cart against the
      // back wall) is not counted, so nothing grows a halo.
      float ao(vec2 uv, float w){
        float z0 = 1.0 / w;
        const float R = 0.32;
        float rp = clamp(R * projScale / z0, 2.0, 90.0);
        float occ = 0.0;
        for (int i = 0; i < 8; i++) {
          float a = float(i) * 0.3927;
          for (int k = 1; k <= 2; k++) {
            vec2 o = vec2(cos(a), sin(a)) * rp * (float(k) * 0.5) * texel;
            float wa = invZ(uv + o); float wb = invZ(uv - o);
            float pa = 2.0 * w - wb; float pb = 2.0 * w - wa;
            float ha = pa > 1e-5 ? 1.0 / pa - 1.0 / wa : 0.0;
            float hb = pb > 1e-5 ? 1.0 / pb - 1.0 / wb : 0.0;
            occ += smoothstep(0.0, R * 0.35, ha) * (1.0 - smoothstep(R, R * 3.0, ha));
            occ += smoothstep(0.0, R * 0.35, hb) * (1.0 - smoothstep(R, R * 3.0, hb));
          }
        }
        return occ / 32.0;
      }
      #endif
      void main(){
        // The world holds still: edges are found where they are, so walls and floors stay
        // straight. (A shaking pen here made the whole room look drunk.)
        vec2 uv = vUv;
        vec4 c = texture2D(tColor, vUv);
        vec2 tx = texel;
        float w = invZ(uv);
        float l = invZ(uv - vec2(tx.x, 0.0)); float r = invZ(uv + vec2(tx.x, 0.0));
        float u = invZ(uv - vec2(0.0, tx.y)); float d = invZ(uv + vec2(0.0, tx.y));
        float lap = max((l + r) - 2.0 * w, (u + d) - 2.0 * w);
        // A sketch's line is a pen's, a couple of pixels wide: look again a step further out
        // and keep whichever finds the edge, so the line is drawn on both sides of it.
        if (sketch > 0.5) {
          vec2 t2 = tx * lw;
          float l2 = invZ(uv - vec2(t2.x, 0.0)); float r2 = invZ(uv + vec2(t2.x, 0.0));
          float u2 = invZ(uv - vec2(0.0, t2.y)); float d2 = invZ(uv + vec2(0.0, t2.y));
          lap = max(lap, max(abs((l2 + r2) - 2.0 * w), abs((u2 + d2) - 2.0 * w)) * 0.5);
        }
        // Positive when the neighbours are nearer: this pixel is the far side of the edge, so the
        // line sits on the farther surface and a model keeps its full silhouette.
        float edge = smoothstep(thresh, thresh * 2.0, lap / max(w, 1e-5));
        // Far scenery sits in the haze: no ink on it, or the hills turn to wire.
        edge *= 1.0 - smoothstep(inkNear, inkFar, 1.0 / max(w, 1e-5));
        if (sketch < 0.5) {
          #ifdef AO
            c.rgb *= 1.0 - 0.75 * ao(uv, w);
          #endif
          c.rgb *= 1.0 - edge * strength;
          #ifdef TONE_MAPPING
            c.rgb = toneMapping(c.rgb);
          #endif
          gl_FragColor = linearToOutputTexel(vec4(c.rgb, 1.0));
          return;
        }
        // Ink also goes where the colour changes sharply: panel lines, a stripe, a window.
        vec2 tc = tx * max(1.0, lw * 0.6);
        float cl = lum(texture2D(tColor, uv - vec2(tc.x, 0.0)).rgb); float cr = lum(texture2D(tColor, uv + vec2(tc.x, 0.0)).rgb);
        float cu = lum(texture2D(tColor, uv - vec2(0.0, tc.y)).rgb); float cd = lum(texture2D(tColor, uv + vec2(0.0, tc.y)).rgb);
        edge = max(edge, smoothstep(0.08, 0.18, abs(cl - cr) + abs(cu - cd)) * 0.85);
        // The room keeps its own colours and light, dark walls and all: a real space,
        // doodled over rather than washed out. What makes it drawn is the hand on top.
        float L = pow(max(lum(c.rgb), 0.0), 1.0 / 2.2); // as the eye sees it, not linear light
        vec3 wash = c.rgb;
        // Flat washes, not a render's smooth falloff: the light lies in a few bands, the way
        // a colourist fills a drawing in with marker.
        float Lb = (floor(L * 5.0 + 0.5)) / 5.0;
        wash *= mix(1.0, pow(max(Lb, 0.02), 2.2) / max(pow(max(L, 0.02), 2.2), 1e-3), 0.55 * hatch);
        // A light, uneven wash: the colour lies a little patchily, nothing that moves or waves.
        vec2 fc = gl_FragCoord.xy;
        wash *= 0.93 + 0.14 * vnoise(fc / 70.0);
        // Pencil hatching in the shade, and cross-hatching where it is darkest: strokes of
        // pencil, a little uneven in weight, held still on the page.
        vec2 f = gl_FragCoord.xy / max(1.0, lw * 0.5);
        float wob = vnoise(f / 23.0) * 2.0;
        float h1 = smoothstep(0.62, 0.8, fract((f.x + f.y + wob) / 6.0));
        float h2 = smoothstep(0.62, 0.8, fract((f.x - f.y - wob) / 6.0));
        float pres = 0.75 + 0.5 * vnoise(f / 9.0);
        float shade = smoothstep(0.5, 0.26, L);
        float deep = smoothstep(0.26, 0.1, L);
        wash *= 1.0 - hatch * pres * (h1 * shade * 0.42 + h2 * deep * 0.42);
        // Paper grain: fine tooth and a coarser mottle, both fixed to the page.
        float tooth = hash(floor(gl_FragCoord.xy / max(1.0, lw * 0.5)));
        wash *= 1.0 - hatch * (0.07 * tooth + 0.05 * vnoise(fc / 6.0) - 0.05);
        // The ink line on top, near black, its weight varying a little along the stroke.
        float ink = clamp(edge, 0.0, 1.0) * (0.85 + 0.15 * vnoise(fc / 13.0));
        wash = mix(wash, inkCol * 0.3, ink);
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
      // The layout size, not the box on screen: a world turned sideways on a phone held
      // upright still draws its picture the long way round.
      const box = canvas.parentElement;
      cssW = w ?? Math.max(2, Math.floor(box?.clientWidth || canvas.clientWidth || 800));
      cssH = h ?? Math.max(2, Math.floor(box?.clientHeight || canvas.clientHeight || 450));
      // A sketch is drawn at full resolution: pen lines, not pixels.
      // A sketch is drawn at the screen's own resolution, retina included (to 2x): pen
      // lines, not pixels, and sharp on a phone.
      factor = opts.sketch ? 1 / Math.min(opts.maxDpr ?? 2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1) : Math.max(1, Math.round(cssH / PIXEL_ROWS[quality]));
      const { w: iw, h: ih } = stage.size;
      renderer.setSize(iw, ih, false);
      target.setSize(iw, ih);
      post.uniforms.texel.value.set(1 / iw, 1 / ih);
      // The pen's width in drawn pixels: about two of the screen's own, whatever its density.
      post.uniforms.lw.value = opts.sketch ? 2 / factor : 1;
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
    // Drawn pixels a metre covers at a metre away: how wide the contact shading reaches.
    post.uniforms.projScale.value = target.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
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
