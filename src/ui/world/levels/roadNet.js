/**
 * Roads as data: centre lines with a width, and the questions a level asks of them (is this
 * point on a road, which surface, where along a loop is it). Plain numbers, no WebGL, so the
 * race logic and the tests use exactly the roads the town draws.
 */

/**
 * @typedef {object} Road
 * @property {string} name
 * @property {{x: number, z: number}[]} pts centre line
 * @property {number} w width, metres
 * @property {'road'|'highway'|'track'|'strip'|'lot'} kind
 * @property {boolean} [closed] the last point joins the first
 * @property {boolean} [lines] a dashed centre line
 */

/** @param {{x: number, z: number}} p @param {number} ax @param {number} az @param {number} bx @param {number} bz */
function segDist2(p, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2)) : 0;
  const qx = ax + dx * t - p.x;
  const qz = az + dz * t - p.z;
  return { d2: qx * qx + qz * qz, t };
}

/**
 * Rounds the corners of a closed loop the way `smoothPath` rounds an open one.
 * @param {{x: number, z: number}[]} pts
 * @param {number} [radius] @param {number} [steps]
 */
export function smoothLoop(pts, radius = 20, steps = 8) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[(i - 1 + n) % n];
    const c = pts[i];
    const b = pts[(i + 1) % n];
    const la = Math.hypot(c.x - a.x, c.z - a.z);
    const lb = Math.hypot(b.x - c.x, b.z - c.z);
    const ra = Math.min(radius, la / 2);
    const rb = Math.min(radius, lb / 2);
    const p0 = { x: c.x + ((a.x - c.x) / la) * ra, z: c.z + ((a.z - c.z) / la) * ra };
    const p2 = { x: c.x + ((b.x - c.x) / lb) * rb, z: c.z + ((b.z - c.z) / lb) * rb };
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const u = 1 - t;
      out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * c.z + t * t * p2.z });
    }
  }
  return out;
}

/**
 * A path you can measure along: cumulative distance, and the nearest point to anywhere.
 * @param {{x: number, z: number}[]} pts
 * @param {boolean} [closed]
 */
export function measuredPath(pts, closed = false) {
  const p = closed ? [...pts, pts[0]] : pts;
  const s = [0];
  for (let i = 1; i < p.length; i += 1) s.push(s[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
  const length = s[s.length - 1];
  return {
    pts: p, s, length, closed,
    /** The point a distance along, and the direction of travel there. @param {number} d */
    at(d) {
      let dd = closed ? ((d % length) + length) % length : Math.max(0, Math.min(length, d));
      let lo = 0;
      let hi = s.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid] <= dd) lo = mid; else hi = mid; }
      const a = p[lo];
      const b = p[hi];
      const seg = Math.max(1e-9, s[hi] - s[lo]);
      dd -= s[lo];
      const f = dd / seg;
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, heading: Math.atan2(b.x - a.x, b.z - a.z), i: lo };
    },
    /**
     * Distance along the path of the point nearest (x, z), searched near a hint when one is
     * given (a car moves a little each frame), and how far off the line it is.
     * @param {number} x @param {number} z @param {number} [hint] a distance along to search near
     * @param {number} [window] metres either side of the hint to search
     */
    project(x, z, hint, window = 60) {
      let best = { d2: Infinity, s: 0 };
      for (let i = 0; i < p.length - 1; i += 1) {
        if (hint != null) {
          // How far the hint is from this segment's span (zero when it lies on it).
          const h = closed ? ((hint % length) + length) % length : hint;
          const gapOf = (q) => (q < s[i] ? s[i] - q : q > s[i + 1] ? q - s[i + 1] : 0);
          const gap = closed ? Math.min(gapOf(h), gapOf(h + length), gapOf(h - length)) : gapOf(h);
          if (gap > window) continue;
        }
        const r = segDist2({ x, z }, p[i].x, p[i].z, p[i + 1].x, p[i + 1].z);
        if (r.d2 < best.d2) best = { d2: r.d2, s: s[i] + (s[i + 1] - s[i]) * r.t };
      }
      if (hint != null && best.d2 === Infinity) return this.project(x, z);
      return { s: best.s, off: Math.sqrt(best.d2) };
    },
  };
}

/**
 * A set of roads, with a coarse grid over their segments so "what am I standing on" stays
 * cheap however big the town is.
 * @param {Road[]} roads
 */
export function makeNet(roads) {
  const CELL = 40;
  /** @type {Map<string, {ax: number, az: number, bx: number, bz: number, hw: number, road: Road}[]>} */
  const grid = new Map();
  const key = (i, j) => `${i},${j}`;
  for (const road of roads) {
    const p = road.closed ? [...road.pts, road.pts[0]] : road.pts;
    for (let i = 0; i < p.length - 1; i += 1) {
      const seg = { ax: p[i].x, az: p[i].z, bx: p[i + 1].x, bz: p[i + 1].z, hw: road.w / 2, road };
      const x0 = Math.floor((Math.min(seg.ax, seg.bx) - seg.hw) / CELL);
      const x1 = Math.floor((Math.max(seg.ax, seg.bx) + seg.hw) / CELL);
      const z0 = Math.floor((Math.min(seg.az, seg.bz) - seg.hw) / CELL);
      const z1 = Math.floor((Math.max(seg.az, seg.bz) + seg.hw) / CELL);
      for (let gi = x0; gi <= x1; gi += 1) for (let gj = z0; gj <= z1; gj += 1) {
        const k = key(gi, gj);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(seg);
      }
    }
  }
  /** Surfaces in order of precedence where two overlap: a car on the circuit is on the circuit. */
  const RANK = { track: 4, strip: 3, highway: 2, road: 1, lot: 0 };
  return {
    roads,
    /** The road under (x, z), or null. @param {number} x @param {number} z @returns {Road|null} */
    roadAt(x, z) {
      const cell = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
      if (!cell) return null;
      /** @type {Road|null} */
      let best = null;
      for (const sg of cell) {
        if (best && RANK[sg.road.kind] <= RANK[best.kind]) continue;
        if (segDist2({ x, z }, sg.ax, sg.az, sg.bx, sg.bz).d2 <= sg.hw * sg.hw) best = sg.road;
      }
      return best;
    },
  };
}
