/**
 * A person: the tuner, a customer, the clerk behind a counter.
 *
 * People are pixel-art sprites, the way a handheld RPG draws them: a small sheet of
 * frames (front, back and side; standing, two walking steps and a few poses) painted
 * pixel by pixel from the look, shown on a card that always faces the camera. Which
 * frame shows depends on which way the person faces relative to the camera, so a
 * character turns as you walk round them. A soft dark blob on the floor is the shadow.
 *
 * The rig keeps the shape the levels use: `group` to place and turn, `setPose`,
 * `setMood`, `setLook`, and `update(dt, speed)` each frame. Faces +z.
 */

import { world as W } from '../../tokens.js';
import { itemById } from '../appearance.js';
import { SPRITE_LIGHT, THREE } from '../gfx.js';

/** One frame is CW by CH texels; the sheet is COLS frames by 3 rows (front, back, side). */
const CW = 24;
const CH = 32;
const FRAMES = ['stand', 'stepA', 'stepB', 'cheer', 'wave', 'sit', 'think', 'point'];
const COLS = FRAMES.length;
const DIRS = ['front', 'back', 'side'];

/** Metres per texel: about 1.75 m from the top of the hair to the soles. */
const PX = 0.066;

const cloth = (key) => W.cloth[key] ?? W.cloth.grey;

/** A tiny raster: a colour (or nothing) per texel, painted in layers. */
function raster() {
  /** @type {(string|null)[]} */
  const px = new Array(CW * CH).fill(null);
  const r = {
    px,
    /** @param {number} x @param {number} y @param {string|null} c */
    set(x, y, c) { if (x >= 0 && y >= 0 && x < CW && y < CH) px[y * CW + x] = c; },
    /** @param {number} x @param {number} y */
    get(x, y) { return x >= 0 && y >= 0 && x < CW && y < CH ? px[y * CW + x] : null; },
    /** Fill a rectangle, inclusive. @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {string|null} c */
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) r.set(x, y, c); },
    /** Paint only where something is already painted (shading, patterns). @param {number} x @param {number} y @param {string} c */
    over(x, y, c) { if (r.get(x, y)) r.set(x, y, c); },
  };
  return r;
}

const colorCache = new Map();
/** A palette colour a touch lighter or darker, as a CSS string. @param {string} c @param {number} dl */
function tone(c, dl) {
  const key = `${c}|${dl}`;
  let v = colorCache.get(key);
  if (!v) { v = new THREE.Color(c).offsetHSL(0, dl < 0 ? 0.04 : -0.02, dl).getStyle(); colorCache.set(key, v); }
  return v;
}

/**
 * The body plan for one frame: where the arms and legs go. Everything else is painted
 * from it.
 * @param {'front'|'back'|'side'} dir @param {string} frame
 */
function planOf(dir, frame) {
  const p = {
    legL: 0, legR: 0, // lift, in texels, of each leg (a step)
    stride: 0, // side view: how far apart the feet are
    armL: 'down', armR: 'down', // 'down' | 'up' | 'out' | 'chin' | 'swingF' | 'swingB'
    sit: false,
  };
  if (frame === 'stepA') { p.legL = 1; p.stride = 2; p.armL = 'swingB'; p.armR = 'swingF'; }
  if (frame === 'stepB') { p.legR = 1; p.stride = -2; p.armL = 'swingF'; p.armR = 'swingB'; }
  if (frame === 'cheer') { p.armL = 'up'; p.armR = 'up'; }
  if (frame === 'wave') { p.armL = 'up'; }
  if (frame === 'sit') { p.sit = true; }
  if (frame === 'think') { p.armR = 'chin'; }
  if (frame === 'point') { p.armL = 'out'; }
  void dir;
  return p;
}

/**
 * Paints one frame of a look.
 * @param {ReturnType<typeof raster>} r
 * @param {import('../appearance.js').Look} look
 * @param {'front'|'back'|'side'} dir side faces +x (screen right)
 * @param {string} frame
 * @param {'neutral'|'smile'|'shout'|'worry'} mood
 */
function paint(r, look, dir, frame, mood) {
  const skin = W.skin[look.skin] ?? W.skin[1];
  const top = itemById(look.top) ?? itemById('tee-white');
  const bottom = itemById(look.bottom) ?? itemById('jeans');
  const shoes = itemById(look.shoes) ?? itemById('sneakers');
  const hat = look.hat ? itemById(look.hat) : null;
  const glasses = look.glasses ? itemById(look.glasses) : null;
  const extra = look.extra ? itemById(look.extra) : null;
  const hairC = W.hair[look.hairColor] ?? W.hair.brown;
  const topC = top.style === 'vest' ? W.cloth.white : cloth(top.color);
  const topA = cloth(top.accent ?? top.color);
  const botC = cloth(bottom.color);
  const shoeC = cloth(shoes.color);
  const shoeA = cloth(shoes.accent ?? 'black');
  const handC = extra?.style === 'gloves' ? cloth(extra.color) : skin;
  const plan = planOf(dir, frame);
  const side = dir === 'side';
  const back = dir === 'back';
  const longSleeve = !['tee', 'tank', 'polo', 'vest'].includes(top.style);
  const sleeve = top.style === 'tank' ? 0 : longSleeve ? 6 : 2;
  const sitDrop = plan.sit ? 3 : 0;

  // ---- behind the body: a cape, a backpack seen from the front, long hair ----
  if (extra?.style === 'cape' && !back) {
    const c = cloth(extra.color);
    if (side) r.rect(5, 15 + sitDrop, 8, 27, c);
    else { r.rect(5, 15 + sitDrop, 5, 26, c); r.rect(18, 15 + sitDrop, 18, 26, c); }
  }
  if (!back && !side && !hat && look.hair === 'long') { r.rect(5, 8, 6, 18, hairC); r.rect(17, 8, 18, 18, hairC); }

  // ---- legs and shoes ----
  const legTop = 23;
  const legBot = 28;
  if (plan.sit) {
    // Seated, seen from in front: short thighs toward the camera, shins down.
    if (side) { r.rect(9, 23, 15, 25, botC); r.rect(14, 26, 15, 28, bottom.style === 'short' ? skin : botC); r.rect(14, 29, 17, 30, shoeC); }
    else { r.rect(8, 24, 10, 27, botC); r.rect(13, 24, 15, 27, botC); r.rect(7, 28, 10, 29, shoeC); r.rect(13, 28, 16, 29, shoeC); }
  } else if (side) {
    const s = plan.stride;
    const legs = s === 0 ? [[11, 0]] : [[11 - s, 0], [11 + s, 0]];
    for (const [x] of legs) {
      r.rect(x, legTop, x + 2, legBot, botC);
      if (bottom.style === 'short') r.rect(x, legTop + 3, x + 2, legBot, skin);
      const bootH = shoes.style === 'boot' ? 2 : shoes.style === 'hightop' ? 1 : 0;
      if (bootH) r.rect(x, legBot - bootH + 1, x + 2, legBot, shoeC);
      r.rect(x, 29, x + 3, 30, shoeC);
      if (shoes.style !== 'slide') r.rect(x, 30, x + 3, 30, shoeA);
      else r.set(x + 3, 29, skin);
    }
    if (bottom.accent) r.rect(11, legTop, 11, legBot - 1, cloth(bottom.accent));
  } else {
    for (const [x0, lift] of [[8, plan.legL], [13, plan.legR]]) {
      r.rect(x0, legTop, x0 + 2, legBot - lift, botC);
      if (bottom.style === 'short') r.rect(x0, legTop + 3, x0 + 2, legBot - lift, skin);
      const bootH = shoes.style === 'boot' ? 2 : shoes.style === 'hightop' ? 1 : 0;
      if (bootH) r.rect(x0, legBot - lift - bootH + 1, x0 + 2, legBot - lift, shoeC);
      const sx0 = x0 === 8 ? x0 - 1 : x0;
      r.rect(sx0, 29 - lift, sx0 + 3, 30 - lift, shoeC);
      if (shoes.style === 'slide') { r.rect(sx0, 29 - lift, sx0 + 3, 29 - lift, skin); }
      else if (!back) r.rect(sx0, 30 - lift, sx0 + 3, 30 - lift, shoeA);
      if (bottom.accent) r.rect(x0 === 8 ? 8 : 15, legTop, x0 === 8 ? 8 : 15, legBot - lift - 1, cloth(bottom.accent));
    }
    // The hips join the legs.
    r.rect(8, 22, 15, 23, botC);
  }

  // ---- arms (painted before the torso when they hang behind it in side view) ----
  /** @param {'L'|'R'} which @param {string} pose */
  const arm = (which, pose) => {
    // Front view: the tuner's left arm is on screen right. Back view: the other way.
    const right = back ? which === 'L' : which === 'R';
    const sx = right ? 17 : 5;
    const y0 = 15 + sitDrop;
    const sl = (y) => (y - y0 < sleeve ? topC : skin);
    if (side) {
      // One arm shows, in front of the body; it swings with the step.
      const x = pose === 'swingF' ? 14 : pose === 'swingB' ? 9 : 11;
      if (pose === 'up') { r.rect(12, 8, 13, 15, topC); r.rect(12, 7, 13, 8, handC); return; }
      if (pose === 'out') { r.rect(12, y0 + 1, 18, y0 + 2, topC); r.rect(19, y0 + 1, 20, y0 + 2, handC); return; }
      if (pose === 'chin') { r.rect(11, y0, 12, y0 + 3, topC); r.rect(13, y0 - 1, 14, y0 + 1, topC); r.rect(15, y0 - 3, 16, y0 - 1, handC); return; }
      for (let y = y0; y <= y0 + 5; y += 1) r.rect(x, y, x + 1, y, sl(y));
      r.rect(x, y0 + 6, x + 1, y0 + 7, handC);
      return;
    }
    if (pose === 'up') {
      const ax = right ? 18 : 4;
      for (let y = 6; y <= y0 + 1; y += 1) r.rect(ax, y, ax + 1, y, y > y0 - 4 ? topC : y > 9 ? sl(y0 + 7) : topC);
      r.rect(ax, 4, ax + 1, 5, handC);
      return;
    }
    if (pose === 'out') {
      const ax = right ? 18 : 1;
      r.rect(ax, y0 + 1, ax + 4, y0 + 2, topC);
      r.rect(right ? ax + 5 : ax - 1, y0 + 1, right ? ax + 5 : ax - 1, y0 + 2, handC);
      return;
    }
    if (pose === 'chin') {
      const ax = right ? 15 : 7;
      r.rect(sx, y0, sx + 1, y0 + 3, topC);
      r.rect(ax, y0 - 1, ax + 2, y0 + 1, topC);
      r.rect(ax + (right ? -1 : 2), y0 - 2, ax + (right ? 0 : 3), y0 - 1, handC);
      return;
    }
    const swing = pose === 'swingF' ? 1 : pose === 'swingB' ? -1 : 0;
    for (let y = y0; y <= y0 + 5 + swing; y += 1) r.rect(sx, y, sx + 1, y, sl(y));
    r.rect(sx, y0 + 6 + swing, sx + 1, y0 + 7 + swing, handC);
  };

  // ---- torso ----
  const ty0 = 15 + sitDrop;
  const ty1 = 22;
  if (side) r.rect(9, ty0, 14, ty1, topC);
  else r.rect(7, ty0, 16, ty1, topC);
  const tx0 = side ? 9 : 7;
  const tx1 = side ? 14 : 16;
  const mid = side ? 12 : 11;
  if (!back) {
    switch (top.style) {
      case 'tee': if (!side) r.rect(10, ty0, 13, ty0, skin); break;
      case 'tank': if (!side) r.rect(9, ty0, 14, ty0, skin); break;
      case 'polo': if (!side) { r.rect(9, ty0, 14, ty0, topA); r.rect(11, ty0 + 1, 12, ty0 + 2, topA); } break;
      case 'hoodie': if (!side) { r.set(10, ty0 + 1, W.cloth.white); r.set(13, ty0 + 1, W.cloth.white); r.set(10, ty0 + 2, W.cloth.white); r.set(13, ty0 + 2, W.cloth.white); r.rect(9, ty1 - 2, 14, ty1 - 1, tone(topC, -0.08)); } break;
      case 'vest': r.rect(tx0, ty0 + 1, tx1, ty1, cloth(top.color)); r.rect(tx0, ty0 + 4, tx1, ty0 + 4, topA); r.rect(tx0, ty1 - 1, tx1, ty1 - 1, topA); if (!side) r.rect(11, ty0, 12, ty1, W.cloth.white); break;
      case 'jacket': if (!side) { r.rect(11, ty0, 12, ty1, topA); r.set(10, ty0, topA); r.set(13, ty0, topA); } else r.rect(tx1, ty0, tx1, ty1, topA); break;
      case 'coverall': if (!side) { r.rect(11, ty0, 11, ty1, W.cloth.silver); r.rect(13, ty0 + 2, 14, ty0 + 3, topA); } r.rect(tx0, ty1, tx1, ty1, topA); break;
      case 'racing': r.rect(tx0, ty0, tx0, ty1, topA); r.rect(tx1, ty0, tx1, ty1, topA); if (!side) { r.rect(9, ty0 + 2, 10, ty0 + 3, W.cloth.blue); r.rect(13, ty0 + 4, 14, ty0 + 4, W.cloth.yellow); } break;
      case 'labcoat': if (!side) { r.rect(11, ty0, 12, ty1, topA); r.set(13, ty0 + 3, W.cloth.blue); } break;
      case 'blazer': if (!side) { r.rect(10, ty0, 13, ty0 + 4, W.cloth.white); r.rect(11, ty0 + 1, 12, ty0 + 5, topA); r.set(10, ty0 + 5, topA); r.set(13, ty0 + 5, topA); } break;
      case 'shirt': for (let y = ty0; y <= ty1; y += 1) for (let x = tx0; x <= tx1; x += 1) if ((x * 3 + y * 5) % 7 === 0) r.set(x, y, topA); break;
      default: break;
    }
  } else if (top.style === 'hoodie') {
    r.rect(8, ty0 - 2, 15, ty0 + 1, tone(topC, -0.08));
  } else if (top.style === 'racing' || top.style === 'jacket') {
    r.rect(9, ty0 + 2, 14, ty0 + 3, topA);
  }
  // A lab coat hangs past the hips.
  if (top.style === 'labcoat' && !plan.sit) r.rect(tx0, ty1, tx1, ty1 + 3, topC);
  void mid;

  // ---- extras on the body ----
  if (extra) {
    const c = cloth(extra.color);
    const a = cloth(extra.accent ?? extra.color);
    switch (extra.style) {
      case 'toolbelt': r.rect(tx0, ty1, tx1, ty1, c); if (!side) { r.rect(6, ty1, 7, ty1 + 2, a); r.rect(16, ty1, 17, ty1 + 2, a); } else r.rect(10, ty1 + 1, 12, ty1 + 2, a); break;
      case 'backpack':
        if (back) r.rect(8, ty0 + 1, 15, ty1 - 1, c);
        else if (side) r.rect(6, ty0 + 1, 8, ty1 - 1, c);
        else { r.rect(8, ty0, 8, ty1 - 2, W.cloth.black); r.rect(15, ty0, 15, ty1 - 2, W.cloth.black); }
        break;
      case 'scarf': r.rect(tx0, ty0, tx1, ty0 + 1, c); if (!back && !side) r.rect(13, ty0 + 2, 14, ty0 + 5, c); break;
      case 'chain': if (!back && !side) { r.set(9, ty0 + 1, c); r.set(10, ty0 + 2, c); r.set(11, ty0 + 3, c); r.set(12, ty0 + 3, c); r.set(13, ty0 + 2, c); r.set(14, ty0 + 1, c); } break;
      case 'cape': if (back) { r.rect(6, ty0, 17, 27, c); r.rect(6, ty0, 17, ty0, a); } break;
      default: break;
    }
  }

  // Arms last on the near side, so a swinging arm crosses the body.
  arm('L', plan.armL);
  arm('R', plan.armR);

  // ---- head ----
  const hy0 = 4 + sitDrop;
  const hy1 = 14 + sitDrop;
  const hx0 = side ? 7 : 6;
  const hx1 = side ? 17 : 17;
  r.rect(hx0, hy0 + 1, hx1, hy1 - 1, skin);
  r.rect(hx0 + 1, hy0, hx1 - 1, hy1, skin);
  // A neck.
  r.rect(side ? 11 : 10, hy1 + 1, side ? 12 : 13, hy1 + 1, tone(skin, -0.08));

  // ---- face ----
  if (!back) {
    const eye = W.eye;
    const ey = hy0 + 6;
    if (side) {
      r.rect(15, ey, 15, ey + 1, eye);
      r.set(16, hy0 + 9, mood === 'shout' ? W.mouth : tone(skin, -0.12));
      r.set(17, hy0 + 7, tone(skin, -0.06));
    } else {
      r.rect(9, ey, 9, ey + 1, eye);
      r.rect(14, ey, 14, ey + 1, eye);
      if (mood === 'worry') { r.rect(8, ey - 2, 9, ey - 2, eye); r.rect(14, ey - 2, 15, ey - 2, eye); }
      r.set(8, ey + 2, W.cheek);
      r.set(15, ey + 2, W.cheek);
      if (mood === 'smile') { r.rect(11, ey + 3, 12, ey + 3, W.mouth); r.set(10, ey + 2, W.mouth); r.set(13, ey + 2, W.mouth); }
      else if (mood === 'shout') r.rect(11, ey + 2, 12, ey + 4, W.mouth);
      else if (mood === 'worry') { r.rect(10, ey + 3, 13, ey + 3, W.mouth); }
      else r.rect(11, ey + 3, 12, ey + 3, tone(skin, -0.2));
    }
  }

  // ---- hair ----
  const covers = hat && ['beanie', 'helmet', 'fullhelmet', 'hardhat', 'tophat'].includes(hat.style);
  if (!covers) paintHair(r, look.hair, hairC, dir, hy0, hx0, hx1);

  // ---- glasses ----
  if (glasses && !back) {
    const c = cloth(glasses.color);
    const ey = hy0 + 6;
    const lens = { shades: W.cloth.black, aviator: W.glassDark, round: W.glass, safety: W.glass, goggles: c, visor: c }[glasses.style] ?? W.glassDark;
    if (side) { r.rect(14, ey, 16, ey + 1, lens); r.rect(10, ey, 13, ey, glasses.style === 'goggles' ? W.cloth.black : c); }
    else if (['safety', 'goggles', 'visor'].includes(glasses.style)) { r.rect(7, ey, 16, ey + 1, lens); if (glasses.style === 'goggles') { r.rect(6, ey, 6, ey + 1, W.cloth.black); r.rect(17, ey, 17, ey + 1, W.cloth.black); } }
    else {
      r.rect(8, ey, 10, ey + 1, lens); r.rect(13, ey, 15, ey + 1, lens);
      r.rect(11, ey, 12, ey, glasses.style === 'aviator' ? c : W.cloth.black);
      if (glasses.style === 'aviator') { r.rect(8, ey - 1, 10, ey - 1, c); r.rect(13, ey - 1, 15, ey - 1, c); }
    }
  }

  // ---- hat ----
  if (hat) paintHat(r, hat, dir, hy0, hx0, hx1);
  if (extra?.style === 'headset') {
    const c = cloth(extra.color);
    r.rect(hx0 + 1, hy0 - 1, hx1 - 1, hy0 - 1, c);
    if (side) r.rect(10, hy0 + 5, 12, hy0 + 8, c);
    else { r.rect(hx0 - 1, hy0 + 5, hx0, hy0 + 8, c); r.rect(hx1, hy0 + 5, hx1 + 1, hy0 + 8, c); if (!back) r.rect(hx1 - 3, hy0 + 9, hx1 - 1, hy0 + 9, c); }
  }
}

/** @param {ReturnType<typeof raster>} r @param {string} style @param {string} c @param {'front'|'back'|'side'} dir @param {number} y @param {number} x0 @param {number} x1 */
function paintHair(r, style, c, dir, y, x0, x1) {
  const hi = tone(c, 0.1);
  const side = dir === 'side';
  const back = dir === 'back';
  if (style === 'bald') { r.set(x0 + 3, y + 1, tone(W.skin[0], 0.05)); return; }
  if (style === 'buzz') { r.rect(x0 + 1, y, x1 - 1, y + 1, tone(c, 0.05)); r.rect(x0, y + 1, x1, y + 2, tone(c, 0.05)); if (back) r.rect(x0, y + 3, x1, y + 6, tone(c, 0.05)); return; }
  if (style === 'afro') {
    r.rect(x0 - 2, y - 3, x1 + 2, y + 4, c); r.rect(x0 - 1, y - 4, x1 + 1, y + 6, c);
    if (back) r.rect(x0 - 1, y + 4, x1 + 1, y + 9, c);
    else if (side) r.rect(x0 - 2, y + 4, x0 + 3, y + 9, c);
    r.rect(x0, y - 3, x0 + 3, y - 3, hi);
    return;
  }
  if (style === 'mohawk') {
    if (side) r.rect(x0 + 2, y - 3, x1 - 3, y + 1, c); else r.rect(10, y - 4, 13, y + 1, c);
    r.rect(side ? x0 + 3 : 11, side ? y - 3 : y - 4, side ? x1 - 4 : 12, side ? y - 3 : y - 4, hi);
    if (back) r.rect(10, y + 1, 13, y + 9, c);
    return;
  }
  // The common cap of hair over the crown.
  r.rect(x0 + 1, y - 1, x1 - 1, y + 2, c);
  r.rect(x0, y, x1, y + 2, c);
  r.rect(x0 + 2, y - 1, x0 + 5, y - 1, hi);
  if (back) r.rect(x0, y + 3, x1, y + (style === 'long' ? 14 : style === 'ponytail' ? 6 : 8), c);
  else if (side) {
    // Hair covers the back of the head (screen left) down past the ear.
    r.rect(x0, y + 3, x0 + 4, y + (style === 'long' ? 14 : 8), c);
    r.set(x1, y + 3, c);
  } else {
    // A fringe and the sides.
    r.rect(x0, y + 3, x0, y + 6, c); r.rect(x1, y + 3, x1, y + 6, c);
    if (style === 'short' || style === 'curly' || style === 'spiky') { r.rect(x0 + 1, y + 3, x0 + 4, y + 3, c); r.rect(x1 - 3, y + 3, x1 - 1, y + 3, c); }
    if (style === 'long') { r.rect(x0 - 1, y + 2, x0, y + 13, c); r.rect(x1, y + 2, x1 + 1, y + 13, c); }
  }
  if (style === 'spiky') for (let i = 0; i < 4; i += 1) { const sx = x0 + 1 + i * 3; r.rect(sx, y - 3, sx + 1, y - 2, c); r.set(sx, y - 4, c); }
  if (style === 'curly') for (let x = x0; x <= x1; x += 2) r.set(x, y - 2, c);
  if (style === 'bun') { r.rect(10, y - 5, 13, y - 2, c); r.rect(11, y - 5, 12, y - 5, hi); }
  if (style === 'slick') r.rect(x0 + 1, y, x1 - 1, y, hi);
  if (style === 'ponytail') {
    if (back) r.rect(11, y + 6, 12, y + 15, c);
    else if (side) { r.rect(x0 - 2, y + 4, x0, y + 12, c); }
    else { r.rect(x1 + 1, y + 5, x1 + 1, y + 9, c); }
  }
}

/** @param {ReturnType<typeof raster>} r @param {import('../appearance.js').Item} it @param {'front'|'back'|'side'} dir @param {number} y @param {number} x0 @param {number} x1 */
function paintHat(r, it, dir, y, x0, x1) {
  const c = cloth(it.color);
  const a = cloth(it.accent ?? it.color);
  const side = dir === 'side';
  const front = dir === 'front';
  const crown = (top, bot) => { r.rect(x0 + 1, top, x1 - 1, bot, c); r.rect(x0, top + 1, x1, bot, c); };
  switch (it.style) {
    case 'cap':
      crown(y - 2, y + 2);
      if (front) r.rect(x0, y + 3, x1, y + 3, a === c ? tone(c, -0.15) : a);
      if (side) r.rect(x1 - 1, y + 2, x1 + 3, y + 3, a === c ? tone(c, -0.15) : a);
      r.rect(x0 + 2, y - 2, x0 + 4, y - 2, tone(c, 0.12));
      break;
    case 'beanie': crown(y - 3, y + 3); r.rect(x0, y + 3, x1, y + 4, a === c ? tone(c, -0.12) : a); r.rect(11, y - 4, 12, y - 4, c); break;
    case 'bucket': crown(y - 2, y + 2); r.rect(x0 - 2, y + 3, x1 + 2, y + 3, tone(c, -0.08)); break;
    case 'hardhat': crown(y - 3, y + 2); r.rect(x0 - 1, y + 3, x1 + 1, y + 3, tone(c, -0.1)); r.rect(11, y - 3, 12, y + 2, tone(c, 0.1)); break;
    case 'bandana': r.rect(x0, y + 1, x1, y + 2, c); if (!front) r.rect(side ? x0 - 2 : 10, y + 2, side ? x0 : 13, y + 4, c); r.set(x0 + 3, y + 1, W.cloth.white); break;
    case 'headband': r.rect(x0, y + 2, x1, y + 3, c); break;
    case 'helmet': crown(y - 3, y + 2); r.rect(x0 - 1, y, x0, y + 8, c); r.rect(x1, y, x1 + 1, y + 8, c); if (!front) r.rect(x0, y + 3, x1, y + 8, c); r.rect(11, y - 3, 12, y + 2, a); break;
    case 'fullhelmet':
      crown(y - 3, y + 2); r.rect(x0 - 1, y, x1 + 1, y + 11, c);
      if (front) r.rect(x0 + 1, y + 4, x1 - 1, y + 7, a === c ? W.glassDark : W.glassDark);
      if (side) r.rect(x1 - 3, y + 4, x1 + 1, y + 7, W.glassDark);
      r.rect(x0, y + 1, x1, y + 1, a);
      break;
    case 'tophat': r.rect(x0 + 1, y - 7, x1 - 1, y + 1, c); r.rect(x0 - 2, y + 1, x1 + 2, y + 2, c); r.rect(x0 + 1, y - 1, x1 - 1, y, a); break;
    default: break;
  }
}

/**
 * Light from the top left: each colour run gets a darker right and bottom edge and a
 * brighter top-left texel, then the whole figure gets a one-texel dark outline. This is
 * what makes a flat drawing read as a rounded figure at a glance.
 * @param {ReturnType<typeof raster>} r
 */
function finish(r) {
  const src = r.px.slice();
  const at = (x, y) => (x >= 0 && y >= 0 && x < CW && y < CH ? src[y * CW + x] : null);
  for (let y = 0; y < CH; y += 1) {
    for (let x = 0; x < CW; x += 1) {
      const c = at(x, y);
      if (!c) continue;
      const rgt = at(x + 1, y);
      const dn = at(x, y + 1);
      const up = at(x, y - 1);
      if (!rgt || !dn) r.set(x, y, tone(c, -0.1));
      else if (!up && at(x - 1, y)) r.set(x, y, tone(c, 0.07));
    }
  }
  const shaded = r.px.slice();
  for (let y = 0; y < CH; y += 1) {
    for (let x = 0; x < CW; x += 1) {
      if (shaded[y * CW + x]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const xx = x + dx; const yy = y + dy;
        return xx >= 0 && yy >= 0 && xx < CW && yy < CH && shaded[yy * CW + xx];
      });
      if (near) r.set(x, y, W.outline);
    }
  }
}

const sheetCache = new Map();

/**
 * The whole sheet for a look and a mood, as a texture: COLS frames across, front, back and
 * side down. Shared by everyone who looks the same.
 * @param {import('../appearance.js').Look} look @param {'neutral'|'smile'|'shout'|'worry'} mood
 */
function sheetFor(look, mood) {
  const key = `${JSON.stringify(look)}|${mood}`;
  let tex = sheetCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = CW * COLS;
  c.height = CH * DIRS.length;
  const g = c.getContext('2d');
  const img = g.createImageData(c.width, c.height);
  const rgb = new Map();
  const srgb = { r: 0, g: 0, b: 0 };
  const toRgb = (s) => { let v = rgb.get(s); if (!v) { new THREE.Color(s).getRGB(srgb, THREE.SRGBColorSpace); v = [srgb.r, srgb.g, srgb.b].map((k) => Math.round(Math.min(1, Math.max(0, k)) * 255)); rgb.set(s, v); } return v; };
  DIRS.forEach((dir, row) => {
    FRAMES.forEach((frame, col) => {
      const r = raster();
      paint(r, look, /** @type {any} */ (dir), frame, mood);
      finish(r);
      for (let y = 0; y < CH; y += 1) {
        for (let x = 0; x < CW; x += 1) {
          const s = r.px[y * CW + x];
          if (!s) continue;
          const [R, G, B] = toRgb(s);
          const i = ((row * CH + y) * c.width + col * CW + x) * 4;
          img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = 255;
        }
      }
    });
  });
  g.putImageData(img, 0, 0);
  tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (sheetCache.size > 160) sheetCache.clear();
  sheetCache.set(key, tex);
  return tex;
}

const blobGeo = new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: W.shadow, transparent: true, opacity: 0.32, depthWrite: false });
const cardGeo = new THREE.PlaneGeometry(CW * PX, CH * PX).translate(0, (CH * PX) / 2 - PX, 0);

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Builds a person.
 *
 * @param {import('../appearance.js').Look} look
 * @param {{scale?: number, mood?: 'neutral'|'smile'|'shout'|'worry'}} [opts]
 */
export function makePerson(look, opts = {}) {
  const group = new THREE.Group();
  group.userData.dynamic = true;
  const body = new THREE.Group();
  group.add(body);
  const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.5, side: THREE.DoubleSide });
  mat.map = null;
  const card = new THREE.Mesh(cardGeo, mat);
  card.castShadow = false;
  card.receiveShadow = false;
  // Never culled by its own box: the card is turned to the camera at draw time.
  card.frustumCulled = false;
  body.add(card);
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.position.y = 0.02;
  blob.renderOrder = -1;
  group.add(blob);

  const rig = {
    group, body, look, mood: opts.mood ?? 'neutral', phase: Math.random() * 6, pose: 'idle', poseT: 0, speed: 0,
    /** The frame column showing now. */
    frame: 0,
  };

  function build() {
    const tex = sheetFor(rig.look, rig.mood);
    // Each person gets their own copy of the sheet's sampling window; the pixels are shared.
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(1 / COLS, 1 / DIRS.length);
    if (mat.map) mat.map.dispose();
    mat.map = t;
    mat.needsUpdate = true;
  }
  build();
  group.scale.setScalar(opts.scale ?? 1);

  // At draw time: face the card to the camera, and pick the row (front, back, side) from
  // where the camera stands relative to the way the person faces.
  card.onBeforeRender = (_r, _s, camera) => {
    card.getWorldPosition(_pos);
    group.getWorldDirection(_dir);
    group.getWorldScale(_scale);
    const facing = Math.atan2(_dir.x, _dir.z);
    const toCam = Math.atan2(camera.position.x - _pos.x, camera.position.z - _pos.z);
    let rel = facing - toCam;
    rel = ((rel + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    let row = 0;
    let flip = false;
    if (Math.abs(rel) > (Math.PI * 3) / 4) row = 1;
    else if (rel > Math.PI / 4) { row = 2; flip = false; }
    else if (rel < -Math.PI / 4) { row = 2; flip = true; }
    const t = mat.map;
    if (t) {
      const u = rig.frame / COLS;
      t.repeat.x = flip ? -1 / COLS : 1 / COLS;
      t.offset.x = flip ? u + 1 / COLS : u;
      t.offset.y = 1 - (row + 1) / DIRS.length;
    }
    mat.color.copy(SPRITE_LIGHT);
    _q.copy(camera.quaternion);
    card.matrixWorld.compose(_pos, _q, _scale);
  };

  /** Re-dress the same character. @param {import('../appearance.js').Look} next */
  rig.setLook = (next) => { rig.look = next; look = next; build(); };

  /** @param {'neutral'|'smile'|'shout'|'worry'} m */
  rig.setMood = (m) => { if (m !== rig.mood) { rig.mood = m; build(); } };

  /** @param {string} p one of idle walk run type sit wave cheer think point lookUnder */
  rig.setPose = (p) => { if (rig.pose !== p) { rig.pose = p; rig.poseT = 0; } };

  /**
   * @param {number} dt seconds
   * @param {number} [speed] metres per second, for the walk cycle
   */
  rig.update = (dt, speed = 0) => {
    rig.poseT += dt;
    rig.speed = speed;
    const t = rig.poseT;
    let pose = rig.pose;
    if ((pose === 'idle' || pose === 'walk' || pose === 'run') && speed > 0.15) pose = speed > 4 ? 'run' : 'walk';
    else if (pose === 'walk' || pose === 'run') pose = 'idle';
    body.position.y = 0;
    let f = 'stand';
    if (pose === 'walk' || pose === 'run') {
      // Four beats a cycle: step, stand, the other step, stand. Faster legs when running.
      rig.phase += dt * (pose === 'run' ? 11 : 7.5) * Math.min(1.4, 0.75 + speed * 0.1);
      const beat = Math.floor(rig.phase) % 4;
      f = beat === 0 ? 'stepA' : beat === 2 ? 'stepB' : 'stand';
      body.position.y = beat % 2 === 1 ? PX : 0;
    } else if (pose === 'cheer') {
      f = Math.floor(t * 5) % 2 ? 'cheer' : 'stand';
      body.position.y = Math.abs(Math.sin(t * 8)) * 0.12;
    } else if (pose === 'wave') {
      f = Math.floor(t * 4) % 2 ? 'wave' : 'stand';
    } else if (pose === 'sit') f = 'sit';
    else if (pose === 'think') f = 'think';
    else if (pose === 'point') f = 'point';
    else if (pose === 'type') f = Math.floor(t * 6) % 2 ? 'stepA' : 'stand';
    else {
      // Idle: a breath every couple of seconds, one texel up and down.
      body.position.y = Math.sin(t * 2.2 + rig.phase) > 0.6 ? PX * 0.5 : 0;
    }
    rig.frame = FRAMES.indexOf(f);
    blob.visible = pose !== 'sit';
  };

  rig.update(0, 0);
  return rig;
}

/** For tests and the wardrobe preview: the frame names, in sheet order. */
export const SPRITE_FRAMES = FRAMES;
