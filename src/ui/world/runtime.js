/**
 * The world's runtime: the loop that walks the tuner round, drives the car, finds what is
 * in reach and tells the screen about it.
 *
 * It owns the renderer, the player, the current LEVEL (the garage, the town, a shop), and
 * the car being driven. Everything the screen needs to know comes out as events
 * (`onEvent`), and everything the screen wants done goes in through the returned object.
 * Levels (levels/*.js) say what is in a place; this file says how to move through it.
 *
 * Coordinates: x east, z south (toward the default camera), y up; a heading of 0 faces +z
 * and increases toward +x.
 */

import { advance, makeVehicle, toKph, toMph } from './driving.js';
import { createInput } from './input.js';
import { makePerson } from './models/person.js';
import { THREE } from './gfx.js';
import { createRig, createStage } from './stage.js';

const WALK = 3.1;
const RUN = 5.6;
const PLAYER_R = 0.36;

/** Smallest angle from a to b, radians. */
const angleTo = (a, b) => ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

/**
 * Pushes a circle out of the colliders. Boxes are axis-aligned `{x, z, hw, hd}`, circles
 * `{x, z, r}`. Returns the corrected position.
 *
 * @param {number} x @param {number} z @param {number} r
 * @param {any[]} colliders
 */
export function pushOut(x, z, r, colliders) {
  let px = x;
  let pz = z;
  // Two things close together can push a walker from one into the other: go round until
  // nothing moves (three passes is plenty for anything a room holds).
  for (let pass = 0; pass < 3; pass += 1) {
    const bx = px;
    const bz = pz;
    [px, pz] = pushOnce(px, pz, r, colliders);
    if (Math.abs(px - bx) < 1e-5 && Math.abs(pz - bz) < 1e-5) break;
  }
  return [px, pz];
}

/** @param {number} x @param {number} z @param {number} r @param {any[]} colliders */
function pushOnce(x, z, r, colliders) {
  let px = x;
  let pz = z;
  for (const c of colliders) {
    if (c.off) continue;
    if (c.r != null) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + r;
      if (d < min) {
        const k = d < 1e-6 ? 0 : (min - d) / d;
        px += (d < 1e-6 ? min : dx * k);
        pz += d < 1e-6 ? 0 : dz * k;
      }
    } else {
      const cx = Math.max(c.x - c.hw, Math.min(px, c.x + c.hw));
      const cz = Math.max(c.z - c.hd, Math.min(pz, c.z + c.hd));
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px += (dx / d) * (r - d);
          pz += (dz / d) * (r - d);
        } else {
          // Centre is inside the box: leave by the nearest face.
          const ox = c.hw - Math.abs(px - c.x);
          const oz = c.hd - Math.abs(pz - c.z);
          if (ox < oz) px += Math.sign(px - c.x || 1) * (ox + r);
          else pz += Math.sign(pz - c.z || 1) * (oz + r);
        }
      }
    }
  }
  return [px, pz];
}

/** Whether (x, z) lies inside any of the walkable rectangles. @param {number} x @param {number} z @param {{minX: number, maxX: number, minZ: number, maxZ: number}[]} rects */
export function inBounds(x, z, rects) {
  return rects.some((b) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ);
}

/** Pulls a point back into the nearest walkable rectangle. */
function clampToBounds(x, z, rects) {
  if (inBounds(x, z, rects)) return [x, z];
  let best = null;
  let bd = Infinity;
  for (const b of rects) {
    const cx = Math.max(b.minX, Math.min(x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bd) { bd = d; best = [cx, cz]; }
  }
  return best ?? [x, z];
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {(e: any) => void} o.onEvent
 * @param {() => any} o.getCareer
 * @param {() => any} o.getLook
 * @param {Record<string, (api: any, entry: any) => any>} o.levels level builders by id
 * @param {'chunky'|'normal'|'fine'} [o.quality]
 * @param {boolean} [o.preserve] keep the drawing buffer, for screenshots
 */
export function createWorld({ canvas, onEvent, getCareer, getLook, levels, quality = 'normal', preserve = false }) {
  const stage = createStage(canvas, { quality, preserve });
  // Test hook: a browser test can draw debug shapes with the same three.js the scene uses.
  if (typeof window !== 'undefined' && /** @type {any} */ (window).__ECU_E2E__) /** @type {any} */ (window).__THREE = THREE;
  const rig = createRig(stage.camera);
  const input = createInput();
  const person = makePerson(getLook());
  stage.scene.add(person.group);

  const player = { x: 0, z: 0, yaw: 0, speed: 0, vx: 0, vz: 0, busy: 0, locked: false };
  /** @type {null|{pitch: number, dist: number, height: number, shiftX: number, fov: number}} */
  let saved = null;
  let spin = false;
  /** Share of the screen a side panel covers: the picture slides over to keep the action in view. */
  let panelFrac = 0;
  let cinematicOn = false;
  /** @type {any} */ let level = null;
  /** @type {any} */ let drive = null;
  let paused = false;
  let raf = 0;
  let last = 0;
  let prompt = null;
  let promptKey = '';
  let clock = 0;
  const camOffset = { yaw: 0 };
  const tele = { knock: false, lean: false, surface: 'road', driving: false, speedKph: 0, speedMph: 0, rpm: 0, redline: 8000, gear: 1, throttle: 0, brake: 0, boost: 0, limiter: false, shifting: false, tcCut: 0, slip: 0, odoKm: 0, manual: false, g: 0, reverse: false, level: '', lat: 0, hp: 0 };
  /** Transient things the screen draws over the picture: speech, nameplates. */
  const labels = new Map();
  let labelTimer = 0;

  const api = {
    shakeOn: true,
    stage, rig, input, player, person, tele,
    get level() { return level; },
    get drive() { return drive; },
    career: getCareer,
    look: getLook,
    /** Jobs whose cars are about to drive in, and jobs whose cars are out on the road. */
    arrivals: new Set(),
    away: new Set(),
    emit: (e) => onEvent(e),
    /** Show a speech bubble over a world position for a while. */
    say(id, text, at, seconds = 4, tone = 'say') { labels.set(id, { id, text, at: at.clone ? at.clone() : new THREE.Vector3(at.x, at.y, at.z), until: clock + seconds, tone, dirty: true }); },
    clearSay(id) { if (labels.delete(id)) labelTimer = 99; },
    /** Place the player. */
    teleport(x, z, yaw = player.yaw) { player.x = x; player.z = z; player.yaw = yaw; player.vx = player.vz = 0; rig.snap(); },
    setPaused(p) { paused = p; input.setEnabled(!p); },
    setHatches: () => {},
    time: () => clock,
  };

  // ---- levels ----
  function disposeLevel() {
    if (!level) return;
    level.dispose?.();
    stage.scene.remove(level.root);
    level.root.traverse((o) => { const m = /** @type {THREE.Mesh} */ (o); if (m.geometry) m.geometry.dispose(); });
    level = null;
  }

  /** @param {string} id @param {any} [entry] where and how the player arrives */
  function loadLevel(id, entry = {}) {
    const build = levels[id];
    if (!build) throw new Error(`no level ${id}`);
    const driving = drive;
    if (driving) { stage.scene.remove(driving.rig.group); if (driving.inside) { driving.rig.group.remove(person.group); driving.inside = false; stage.scene.add(person.group); person.group.visible = true; person.group.scale.setScalar(1); person.group.rotation.set(0, 0, 0); person.setPose('idle'); tele.driving = false; } }
    disposeLevel();
    labels.clear();
    level = build(api, entry);
    level.id = id;
    stage.scene.add(level.root);
    stage.setTime(level.time ?? 0, !!level.indoor);
    const sp = entry.at ?? level.spawn(entry);
    player.x = sp.x; player.z = sp.z; player.yaw = sp.yaw ?? 0;
    player.vx = player.vz = 0;
    rig.pitch = level.camera?.pitch ?? 1.0;
    rig.dist = level.camera?.dist ?? 22;
    rig.yaw = level.camera?.yaw ?? 0;
    rig.fov = level.camera?.fov ?? 34;
    camOffset.yaw = 0;
    rig.mode = 'follow';
    rig.snap();
    if (driving && !level.noCars) {
      // The car you were driving is where you left it.
      stage.scene.add(driving.rig.group);
      if (entry.car) {
        driving.state.x = entry.car.x; driving.state.z = entry.car.z; driving.state.heading = entry.car.heading ?? 0;
        driving.state.vx = driving.state.vy = driving.state.yawRate = 0; driving.state.wR = driving.state.wF = 0;
        syncCar(driving);
      }
    }
    onEvent({ type: 'drive', on: false });
    tele.level = id;
    onEvent({ type: 'level', id });
    prompt = null; promptKey = '';
  }

  // ---- the car ----
  /** @param {any} d */
  function syncCar(d) {
    const s = d.state;
    d.rig.group.position.set(s.x, d.lift ?? 0, s.z);
    d.rig.group.rotation.y = s.heading;
    // Body roll and pitch from the accelerations the model computed.
    d.rig.group.rotation.z = THREE.MathUtils.clamp(-s.ay * 0.0035, -0.05, 0.05);
    d.rig.group.rotation.x = THREE.MathUtils.clamp(-s.ax * 0.003, -0.04, 0.04);
  }

  /**
   * Take over a car as the vehicle. `car` carries its rig (a models/car.js car), a
   * powertrain (driving.js) and where it stands.
   * @param {{rig: any, pt: any, x: number, z: number, heading: number, id?: string, name?: string, source?: any, setup?: any, boostAt?: any, hpAt?: any}} car
   */
  function setCar(car) {
    if (drive) stage.scene.remove(drive.rig.group);
    const state = makeVehicle({ x: car.x, z: car.z, heading: car.heading });
    drive = { ...car, state, inside: false, carry: 0, tcOn: true, seat: null };
    stage.scene.add(drive.rig.group);
    syncCar(drive);
    return drive;
  }

  function dropCar() {
    if (!drive) return;
    stage.scene.remove(drive.rig.group);
    if (drive.inside) exitCar();
    drive = null;
    tele.driving = false;
    onEvent({ type: 'drive', on: false });
  }

  function enterCar() {
    if (!drive || drive.inside) return;
    drive.inside = true;
    person.setPose('sit');
    drive.rig.group.add(person.group);
    person.group.position.copy(drive.rig.seat);
    person.group.position.y -= 0.25;
    person.group.rotation.set(0, 0, 0);
    person.group.visible = false;
    rig.mode = 'chase';
    rig.pitch = 0.3;
    rig.dist = 9.4;
    rig.height = 1.7;
    rig.fov = 46;
    rig.snap();
    tele.driving = true;
    tele.redline = drive.pt.redline;
    onEvent({ type: 'drive', on: true });
  }

  function exitCar() {
    if (!drive || !drive.inside) return;
    const s = drive.state;
    drive.inside = false;
    drive.rig.group.remove(person.group);
    stage.scene.add(person.group);
    person.group.visible = true;
    person.group.scale.setScalar(1);
    person.group.rotation.set(0, 0, 0);
    person.setPose('idle');
    // Step out on the driver's side, left of the car.
    const h = s.heading;
    player.x = s.x + Math.cos(h) * 1.7;
    player.z = s.z - Math.sin(h) * 1.7;
    player.yaw = h;
    [player.x, player.z] = pushOut(player.x, player.z, PLAYER_R, level.colliders);
    rig.mode = 'follow';
    rig.pitch = level.camera?.pitch ?? 0.85;
    rig.dist = level.camera?.dist ?? 16;
    rig.height = 1.2;
    rig.fov = level.camera?.fov ?? 34;
    rig.snap();
    tele.driving = false;
    s.vx = s.vy = s.yawRate = 0; s.wR = s.wF = 0;
    onEvent({ type: 'drive', on: false });
  }

  /** Circles that cover a car's footprint. @param {any} d */
  function carCircles(d) {
    const s = d.state;
    const half = d.rig.dims.len / 2 - d.rig.dims.wid / 2;
    const r = d.rig.dims.wid / 2;
    return [-half, 0, half].map((off) => ({ x: s.x + Math.sin(s.heading) * off, z: s.z + Math.cos(s.heading) * off, r }));
  }

  // ---- per-frame ----
  function walk(dt) {
    const a = input.axes();
    const run = input.running();
    const speed = run ? RUN : WALK;
    const cy = rig.yaw;
    // Screen-up is away from the camera.
    const fx = -Math.sin(cy);
    const fz = -Math.cos(cy);
    const rx = Math.cos(cy);
    const rz = -Math.sin(cy);
    let tx = (fx * a.y + rx * a.x) * speed;
    let tz = (fz * a.y + rz * a.x) * speed;
    if (player.locked) { tx = 0; tz = 0; }
    if (spin) player.yaw += dt * 0.7;
    const k = 1 - Math.exp(-dt * 14);
    player.vx += (tx - player.vx) * k;
    player.vz += (tz - player.vz) * k;
    const sp = Math.hypot(player.vx, player.vz);
    player.speed = sp;
    if (sp > 0.2) player.yaw += angleTo(player.yaw, Math.atan2(player.vx, player.vz)) * (1 - Math.exp(-dt * 16));
    let nx = player.x + player.vx * dt;
    let nz = player.z + player.vz * dt;
    // A parked car is solid too: the one you got out of has no place in the level's list.
    const cols = drive && !drive.inside && !level.noCars ? [...level.colliders, ...carCircles(drive)] : level.colliders;
    [nx, nz] = pushOut(nx, nz, PLAYER_R, cols);
    [nx, nz] = clampToBounds(nx, nz, level.bounds);
    [nx, nz] = pushOut(nx, nz, PLAYER_R, cols);
    player.x = nx; player.z = nz;
    person.group.position.set(player.x, level.groundAt?.(player.x, player.z) ?? 0, player.z);
    person.group.rotation.y = player.yaw;
    person.update(dt, sp);
  }

  function driveFrame(dt) {
    const d = drive;
    const s = d.state;
    const p = input.pedals();
    const shift = input.pressed('shiftUp') ? 1 : input.pressed('shiftDown') ? -1 : 0;
    if (shift) s.manual = true;
    if (input.pressed('lights')) { d.lights = !d.lights; d.rig.setLights?.(d.lights); }
    if (input.pressed('reset')) { s.heading = Math.round(s.heading / (Math.PI / 2)) * (Math.PI / 2); s.vx = s.vy = s.yawRate = 0; s.wR = s.wF = 0; }
    const before = { x: s.x, z: s.z };
    const surf = level.surfaceAt?.(s.x, s.z) ?? { grip: 1, roll: 1, kind: 'road' };
    d.surface = surf.kind;
    d.carry = advance(s, d.pt, { throttle: p.throttle, brake: p.brake, steer: input.steer(), handbrake: p.handbrake, shift, manual: s.manual && !d.autoOnly, tc: d.tcOn, gripScale: surf.grip, rollScale: surf.roll }, dt, d.carry);
    // Bumping into things: circles along the car's length.
    const cols = level.colliders;
    const h = s.heading;
    const sh = Math.sin(h);
    const ch = Math.cos(h);
    const half = d.rig.dims.len / 2 - 0.7;
    let hit = 0;
    for (const off of [-half, 0, half]) {
      const px = s.x + sh * off;
      const pz = s.z + ch * off;
      const [qx, qz] = pushOut(px, pz, 0.95, cols);
      if (qx !== px || qz !== pz) {
        s.x += qx - px; s.z += qz - pz;
        const nx = qx - px; const nz = qz - pz;
        const n = Math.hypot(nx, nz) || 1;
        // Remove the speed going into the thing, with a little bounce.
        const vwx = sh * s.vx + ch * s.vy;
        const vwz = ch * s.vx - sh * s.vy;
        const into = -(vwx * nx + vwz * nz) / n;
        if (into > 0) {
          hit = Math.max(hit, into);
          const jx = (nx / n) * into * 1.25;
          const jz = (nz / n) * into * 1.25;
          const nvx = vwx + jx; const nvz = vwz + jz;
          s.vx = sh * nvx + ch * nvz;
          s.vy = ch * nvx - sh * nvz;
        }
      }
    }
    if (hit > 2) { if (api.shakeOn !== false) rig.shake = Math.min(0.4, hit * 0.03); onEvent({ type: 'bump', force: hit }); }
    const [cx, cz] = clampToBounds(s.x, s.z, level.bounds);
    if (cx !== s.x || cz !== s.z) { s.x = cx; s.z = cz; s.vx *= 0.5; s.vy *= 0.5; }
    // The model's steer is positive to the left, and so is a turn of the wheel's group about y.
    d.rig.steer(s.steer);
    d.rig.roll(s.vx * dt);
    d.rig.setBrake(p.brake > 0.1 && s.vx > 0);
    d.rig.update(dt);
    syncCar(d);
    d.moved = Math.hypot(s.x - before.x, s.z - before.z);
    person.update(dt, 0);
    // Telemetry for the dash and the sound.
    tele.speedKph = toKph(Math.abs(s.vx));
    tele.speedMph = toMph(Math.abs(s.vx));
    tele.rpm = s.rpm;
    tele.gear = s.reverse && s.vx < 0.8 ? -1 : s.gear;
    tele.throttle = s.throttle;
    tele.brake = s.brake;
    tele.limiter = s.limiter;
    tele.shifting = s.shifting;
    tele.tcCut = s.tcCut;
    tele.slip = Math.max(s.slipR, s.slipF);
    tele.odoKm = s.odo / 1000;
    tele.manual = s.manual;
    tele.g = s.ax / 9.81;
    tele.lat = s.ay / 9.81;
    tele.reverse = s.reverse;
    tele.boost = d.boostAt ? d.boostAt(s.rpm, s.throttle) : 0;
    const mp = d.setup?.pointAt?.(s.rpm);
    tele.knock = !!mp?.knock && s.throttle > 0.55;
    tele.lean = !!mp?.leanRisk && s.throttle > 0.55;
    tele.surface = d.surface ?? 'road';
    tele.hp = d.hpAt ? d.hpAt(s.rpm) * s.throttle : 0;
    level.onDrive?.(d, dt);
    rig.update(dt, new THREE.Vector3(s.x, 0, s.z), s.heading, Math.abs(s.vx));
  }

  function findPrompt() {
    if (!level || paused) return null;
    const px = drive?.inside ? drive.state.x : player.x;
    const pz = drive?.inside ? drive.state.z : player.z;
    const sp = drive?.inside ? Math.abs(drive.state.vx) : 0;
    let best = null;
    let bd = Infinity;
    let lowBest = null;
    let lowD = Infinity;
    for (const it of level.interactables) {
      if (it.enabled && !it.enabled(api)) continue;
      if (it.carOnly && !drive?.inside) continue;
      if (it.onFoot && drive?.inside) continue;
      if (drive?.inside && sp > (it.maxSpeed ?? 6)) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d >= (it.r ?? 1.6)) continue;
      // Something that wanders (the dog) never takes the button from something that stays put.
      if (it.low) { if (d < lowD) { lowD = d; lowBest = it; } } else if (d < bd) { bd = d; best = it; }
    }
    return best ?? lowBest;
  }

  function frame(ms) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, last ? (ms - last) / 1000 : 0.016);
    last = ms;
    if (!level) { stage.render(); return; }
    clock += dt;
    if (input.pressed('menu')) onEvent({ type: 'menu' });
    if (input.pressed('map')) onEvent({ type: 'map' });
    if (input.pressed('photo')) onEvent({ type: 'photo' });

    {
      const visible = 2 * rig.dist * Math.tan((rig.fov * Math.PI) / 360) * stage.camera.aspect;
      rig.shiftX = (panelFrac / 2) * visible;
    }
    const cin = level.cinematic?.() ?? null;
    if (cin) {
      cinematicOn = true;
      rig.mode = 'follow'; rig.yaw = cin.yaw; rig.pitch = cin.pitch; rig.dist = cin.dist; rig.fov = cin.fov;
      rig.update(dt, new THREE.Vector3(cin.x, 0, cin.z), cin.heading, cin.speed);
      person.update(dt, 0);
    } else if (cinematicOn) {
      cinematicOn = false;
      rig.pitch = level.camera?.pitch ?? 0.85; rig.dist = level.camera?.dist ?? 16; rig.fov = level.camera?.fov ?? 34;
      rig.yaw = (level.camera?.yaw ?? 0) + camOffset.yaw;
      rig.snap();
    }
    if (!cin) {
      if (!paused && drive?.inside) driveFrame(dt);
      else if (!drive?.inside) {
        if (!paused) {
          walk(dt);
          const yawIn = input.camera() * dt * 1.8 + input.consumeDrag();
          if (yawIn) { camOffset.yaw += yawIn; rig.yaw = (level.camera?.yaw ?? 0) + camOffset.yaw; }
        } else {
          // Paused behind a panel: the tuner still breathes, and the wardrobe's camera still turns.
          if (spin) player.yaw += dt * 0.7;
          person.group.rotation.y = player.yaw;
          person.update(dt, 0);
        }
        const f = level.focus && !saved ? level.focus(player.x, player.z) : player;
        rig.update(dt, new THREE.Vector3(f.x, 0, f.z));
      } else {
        const sv = drive.state;
        rig.update(dt, new THREE.Vector3(sv.x, 0, sv.z), sv.heading, Math.abs(sv.vx));
      }
    }
    if (!paused) {
      const pr = findPrompt();
      const key = pr ? pr.id : '';
      if (key !== promptKey) {
        promptKey = key;
        prompt = pr;
        onEvent({ type: 'prompt', prompt: pr ? { id: pr.id, label: typeof pr.label === 'function' ? pr.label(api) : pr.label, hint: pr.hint, icon: pr.icon, key: 'E' } : null });
      } else if (pr && typeof pr.label === 'function') {
        const l = pr.label(api);
        if (l !== pr._last) { pr._last = l; onEvent({ type: 'prompt', prompt: { id: pr.id, label: l, hint: pr.hint, icon: pr.icon, key: 'E' } }); }
      }
      if (prompt && input.pressed('interact')) prompt.run(api);
      else if (input.pressed('interact') && drive && !drive.inside && !level.noCars) {
        // Not near anything: get in the car if it is close.
        const d = Math.hypot(drive.state.x - player.x, drive.state.z - player.z);
        if (d < 3.4) enterCar();
      } else if (input.pressed('interact') && drive?.inside && !prompt && Math.abs(drive.state.vx) < 2) exitCar();
      input.clearEdges();
    }
    level.update?.(dt, clock, api);
    if (level.root) stage.followLight(drive?.inside ? new THREE.Vector3(drive.state.x, 0, drive.state.z) : new THREE.Vector3(player.x, 0, player.z));
    stage.render();
    labelTimer += dt;
    if (labelTimer > 0.05) { labelTimer = 0; emitLabels(); }
  }

  function emitLabels() {
    const out = [];
    const v = new THREE.Vector3();
    for (const [id, l] of labels) {
      if (clock > l.until) { labels.delete(id); out.push({ id, gone: true }); continue; }
      v.copy(l.at).project(stage.camera);
      out.push({ id, text: l.text, tone: l.tone, x: (v.x * 0.5 + 0.5), y: (-v.y * 0.5 + 0.5), visible: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 });
    }
    if (out.length || labels.size === 0) onEvent({ type: 'labels', labels: out });
  }

  function resize() { stage.resize(); }
  const ro = typeof ResizeObserver !== 'undefined' && canvas.parentElement ? new ResizeObserver(() => resize()) : null;
  ro?.observe(canvas.parentElement);
  raf = requestAnimationFrame(frame);

  return Object.assign(api, {
    loadLevel, setCar, dropCar, enterCar, exitCar, resize,
    setLook(look) { person.setLook(look); },
    /**
     * Frame the tuner for the wardrobe: close, low, turning slowly, off to one side to make
     * room for the panel. Turning it off puts the camera back.
     * @param {boolean} on
     */
    showcase(on) {
      if (on && !saved) {
        saved = { pitch: rig.pitch, dist: rig.dist, height: rig.height, shiftX: rig.shiftX, fov: rig.fov };
        rig.pitch = 0.18; rig.dist = 6.4; rig.height = 1.15; rig.fov = 30;
        spin = true;
        player.yaw = rig.yaw;
      } else if (!on && saved) {
        Object.assign(rig, { ...saved, shiftX: rig.shiftX });
        saved = null;
        spin = false;
      }
    },
    setQuality(q) { stage.setQuality(q); },
    /** Camera shake on bumps. @param {boolean} on */
    setShake(on) { api.shakeOn = on; },
    /** Tell the camera how much of the screen a panel covers (0 to 1). @param {number} frac */
    setPanel(frac) { panelFrac = frac; },
    snapshot: () => stage.snapshot(),
    sync(career) { level?.sync?.(career, api); },
    /** Run a level-specific command (arrive, depart). */
    cmd(name, ...args) { return level?.cmd?.(name, ...args); },
    interact() { input.press('interact'); },
    dispose() {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      input.dispose();
      disposeLevel();
      stage.dispose();
    },
  });
}
