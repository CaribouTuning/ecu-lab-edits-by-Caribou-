/**
 * The town's plan, as data: its roads, the drag strip, the circuit and where the houses go.
 * The town level draws it, the race logic drives on it, the minimap draws it again small.
 *
 * Downtown is the old main street, with your shop, the diner and the clothes shop. The other
 * places are out in the districts, each a drive away (SITES). Round downtown, a grid of avenues and streets,
 * two winding residential drives, an industrial estate and a ring highway. Outside the
 * highway to the north is the drag strip; to the south, Caribou Raceway.
 *
 * Coordinates are metres: x east, z south.
 */

import { QUARTER_MILE_M } from '../../../sim/index.js';

import { makeNet, measuredPath, smoothLoop } from './roadNet.js';

/** The town's edge. */
export const TOWN = { minX: -330, maxX: 360, minZ: -300, maxZ: 350 };

/** A rounded rectangle, as a closed list of points. */
function roundedRect(cx, cz, hw, hd, r, segs = 8) {
  const pts = [];
  const corners = [
    { x: cx + hw - r, z: cz + hd - r, a0: 0 },
    { x: cx - hw + r, z: cz + hd - r, a0: Math.PI / 2 },
    { x: cx - hw + r, z: cz - hd + r, a0: Math.PI },
    { x: cx + hw - r, z: cz - hd + r, a0: (3 * Math.PI) / 2 },
  ];
  for (const c of corners) for (let i = 0; i <= segs; i += 1) {
    const a = c.a0 + (i / segs) * (Math.PI / 2);
    pts.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
  }
  return pts;
}

/** A road that winds: z = z0 + amp * sin(x / wave + phase), from x0 to x1. */
function winding(x0, x1, z0, amp, wave, phase = 0, step = 12) {
  const pts = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) pts.push({ x, z: z0 + amp * Math.sin(x / wave + phase) });
  return pts;
}

/** The ring highway. */
export const HIGHWAY = { cx: 0, cz: 0, hw: 260, hd: 200, r: 70 };

/**
 * The drag strip: two lanes, a tree, a quarter mile and a long shutdown. The start line is
 * at `startX`; lanes run east.
 */
export const STRIP = {
  z: -250, startX: -200, finishX: -200 + QUARTER_MILE_M, endX: 335,
  lanes: { player: -246.5, rival: -253.5 },
  treeX: -197,
};

/**
 * Caribou Raceway: about a kilometre of corners. Raced anticlockwise from the grid on the
 * main straight; the first point is the start line.
 */
const CIRCUIT_CORNERS = [
  { x: -60, z: 245 }, { x: 160, z: 245 }, { x: 232, z: 262 }, { x: 252, z: 296 }, { x: 206, z: 324 }, { x: 110, z: 304 },
  { x: 40, z: 326 }, { x: -40, z: 294 }, { x: -120, z: 324 }, { x: -230, z: 318 }, { x: -264, z: 284 }, { x: -246, z: 252 }, { x: -200, z: 245 },
];
const circuitPts = smoothLoop(CIRCUIT_CORNERS, 26, 8);
// Start the loop at the start line: the first corner's smoothing leaves (-60, 245) mid-straight.
export const CIRCUIT = {
  path: measuredPath(circuitPts, true),
  width: 13,
  startS: 0,
  laps: 2,
  /** Grid slots behind the line, metres back and to the side. */
  grid: [{ back: 8, side: 2.6 }, { back: 16, side: -2.6 }],
};
CIRCUIT.startS = CIRCUIT.path.project(-60, 245).s;

/** @type {import('./roadNet.js').Road[]} */
export const ROADS = [
  { name: 'Main Street', kind: 'road', w: 11, lines: true, pts: [{ x: -260, z: 0 }, { x: 260, z: 0 }] },
  { name: 'Ring Highway', kind: 'highway', w: 14, lines: true, closed: true, pts: roundedRect(HIGHWAY.cx, HIGHWAY.cz, HIGHWAY.hw, HIGHWAY.hd, HIGHWAY.r) },
  { name: 'Mill Avenue', kind: 'road', w: 10, lines: true, pts: [{ x: -75, z: -200 }, { x: -75, z: 200 }] },
  { name: 'Harbour Avenue', kind: 'road', w: 10, lines: true, pts: [{ x: 85, z: -200 }, { x: 85, z: 200 }] },
  { name: 'West Avenue', kind: 'road', w: 9, lines: true, pts: [{ x: -170, z: -200 }, { x: -170, z: 200 }] },
  { name: 'East Avenue', kind: 'road', w: 9, lines: true, pts: [{ x: 170, z: -200 }, { x: 170, z: 200 }] },
  { name: 'North Street', kind: 'road', w: 9, lines: true, pts: [{ x: -260, z: -70 }, { x: 260, z: -70 }] },
  { name: 'South Street', kind: 'road', w: 9, lines: true, pts: [{ x: -260, z: 80 }, { x: 260, z: 80 }] },
  { name: 'Maple Drive', kind: 'road', w: 8, pts: winding(-170, 170, 140, 14, 30) },
  { name: 'Oak Lane', kind: 'road', w: 8, pts: winding(-170, 170, -140, 12, 26, 1) },
  // To the strip: off the highway, round behind the stands to the burnout box.
  { name: 'Strip Road', kind: 'road', w: 9, pts: [{ x: -150, z: -200 }, { x: -150, z: -229 }, { x: -226, z: -229 }, { x: -238, z: -238 }, { x: -238, z: -250 }] },
  { name: 'Return Road', kind: 'road', w: 8, pts: [{ x: 330, z: -257 }, { x: 340, z: -268 }, { x: 320, z: -276 }, { x: -230, z: -276 }, { x: -240, z: -266 }, { x: -238, z: -252 }] },
  { name: 'Drag strip', kind: 'strip', w: 14, pts: [{ x: -238, z: STRIP.z }, { x: STRIP.endX, z: STRIP.z }] },
  { name: 'Pit Road', kind: 'road', w: 9, pts: [{ x: 0, z: 200 }, { x: 0, z: 240 }] },
  { name: 'Caribou Raceway', kind: 'track', w: CIRCUIT.width, closed: true, pts: circuitPts },
];

/** Where a car arrives when you head for a venue: on its access road, facing in. */
export const ARRIVE = {
  strip: { x: -150, z: -212, heading: Math.PI },
  track: { x: 0, z: 214, heading: 0 },
};

/**
 * Where each place stands. Every place was laid out facing an east-west street from its south
 * or north side, as downtown's shops face Main Street; a site moves the whole place, its lot and
 * its door, to another stretch of an east-west street, so it still fronts onto a road. Your shop,
 * the diner and the clothes shop stay downtown; everything else is a drive.
 *   supply   the west end of Main Street            academy  North Street, east of Harbour Avenue
 *   meet     North Street, west of Mill Avenue      dealer   South Street, west of Mill Avenue
 *   gas      the east end of Main Street            junk     South Street by the industrial estate
 * @type {Record<string, {dx: number, dz: number}>}
 */
export const SITES = {
  supply: { dx: -200, dz: 0 },
  academy: { dx: 110, dz: -70 },
  meet: { dx: -150, dz: -70 },
  dealer: { dx: -60, dz: 80 },
  gas: { dx: 215, dz: 0 },
  junk: { dx: 180, dz: 80 },
};
/** A point of a place's own layout, where its site puts it. @param {string} id @param {number} x @param {number} z */
export const siteAt = (id, x, z) => ({ x: x + (SITES[id]?.dx ?? 0), z: z + (SITES[id]?.dz ?? 0) });
const moved = (id, r) => ({ x0: r.x0 + SITES[id].dx, x1: r.x1 + SITES[id].dx, z0: r.z0 + SITES[id].dz, z1: r.z1 + SITES[id].dz });

/** Paved areas that are not roads: lots and forecourts, as rectangles. */
export const LOTS = [
  moved('dealer', { x0: -64, x1: -28, z0: 6, z1: 16 }),
  moved('gas', { x0: -22, x1: -6, z0: 6, z1: 20 }),
  moved('meet', { x0: 38, x1: 66, z0: 6, z1: 36 }),
  { x0: -49, x1: -25, z0: -14, z1: -5 },
  { x0: 100, x1: 160, z0: 14, z1: 64 },
  { x0: -230, x1: -150, z0: -236, z1: -230 },
  { x0: -30, x1: 30, z0: 226, z1: 238 },
];
/** Dirt: the scrapyard. */
export const DIRT = [moved('junk', { x0: 2, x1: 30, z0: 9, z1: 36 })];

export const NET = makeNet(ROADS);

const inRect = (x, z, r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * What a tyre is on, and what that does to it: grip as a share of the tyre's own, and
 * rolling drag as a multiple of tarmac's.
 * @param {number} x @param {number} z
 */
export function surfaceAt(x, z) {
  const road = NET.roadAt(x, z);
  if (road) return { grip: 1, roll: 1, kind: road.kind === 'track' ? 'track' : road.kind === 'strip' ? 'strip' : 'road' };
  for (const l of LOTS) if (inRect(x, z, l)) return { grip: 1, roll: 1, kind: 'road' };
  for (const l of DIRT) if (inRect(x, z, l)) return { grip: 0.72, roll: 2.4, kind: 'dirt' };
  return { grip: 0.55, roll: 3.6, kind: 'grass' };
}

/** Areas nothing is built in: downtown, the park, the venues, the estate. */
export const KEEP_CLEAR = [
  { x0: -70, x1: 80, z0: -50, z1: 42 },
  { x0: -64, x1: -10, z0: -46, z1: -20 },
  { x0: -245, x1: 345, z0: -290, z1: -215 },
  { x0: -280, x1: 270, z0: 220, z1: 345 },
  { x0: 95, x1: 165, z0: 10, z1: 70 },
  // The places out in the districts, with room round them.
  moved('supply', { x0: -24, x1: -2, z0: -26, z1: -4 }),
  moved('academy', { x0: -6, x1: 18, z0: -28, z1: -4 }),
  moved('meet', { x0: 34, x1: 70, z0: 4, z1: 40 }),
  moved('dealer', { x0: -68, x1: -24, z0: 4, z1: 34 }),
  moved('gas', { x0: -26, x1: -2, z0: 4, z1: 34 }),
  moved('junk', { x0: -2, x1: 34, z0: 5, z1: 40 }),
];
