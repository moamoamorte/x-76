// Tile-based terrain: the collision grid. It's drawn by models/terrain3d.js.
import { H } from './util.js';

export const TILE = 8;
export const ROWS = H / TILE; // 28

// Tile types
export const HULL = 1, ORGANIC = 2, MACHINE = 3;

export class Terrain {
  constructor(cols) {
    this.cols = cols;
    this.grid = new Uint8Array(cols * ROWS);
  }

  get(c, r) {
    if (c < 0 || c >= this.cols || r < 0 || r >= ROWS) return 0;
    return this.grid[c * ROWS + r];
  }
  set(c, r, v) {
    if (c < 0 || c >= this.cols || r < 0 || r >= ROWS) return;
    this.grid[c * ROWS + r] = v;
  }
  fillRect(c0, r0, c1, r1, v = HULL) {
    for (let c = c0; c < c1; c++) for (let r = r0; r < r1; r++) this.set(c, r, v);
  }

  solidAt(x, y) {
    return this.get(Math.floor(x / TILE), Math.floor(y / TILE)) !== 0;
  }

  // Test a box (centre + half extents) against the grid.
  boxSolid(cx, cy, hw, hh) {
    const x0 = cx - hw, x1 = cx + hw, y0 = cy - hh, y1 = cy + hh;
    for (let x = x0; ; x += TILE) {
      const px = Math.min(x, x1);
      for (let y = y0; ; y += TILE) {
        const py = Math.min(y, y1);
        if (this.solidAt(px, py)) return true;
        if (py >= y1) break;
      }
      if (px >= x1) break;
    }
    return false;
  }

  // Y of the first solid surface found scanning down from `fromY`.
  floorY(x, fromY = H / 2) {
    const c = Math.floor(x / TILE);
    for (let r = Math.max(0, Math.floor(fromY / TILE)); r < ROWS; r++) if (this.get(c, r)) return r * TILE;
    return H;
  }
  // Y of the first solid surface found scanning up from `fromY`.
  ceilY(x, fromY = H / 2) {
    const c = Math.floor(x / TILE);
    for (let r = Math.min(ROWS - 1, Math.floor(fromY / TILE)); r >= 0; r--) if (this.get(c, r)) return (r + 1) * TILE;
    return 0;
  }

  // Depth map: 1 = surface tile, rising toward the interior. The 3D terrain
  // darkens deeper tiles with it. Call again after changing the grid.
  computeDepth() {
    const { cols } = this;
    const depth = new Uint8Array(cols * ROWS);
    for (let i = 0; i < depth.length; i++) depth[i] = this.grid[i] ? 9 : 0;
    const dAt = (cc, rr) => (rr < 0 || rr >= ROWS || cc < 0 || cc >= cols ? 9 : depth[cc * ROWS + rr]);
    for (let p = 1; p <= 4; p++) {
      for (let cc = 0; cc < cols; cc++) {
        for (let rr = 0; rr < ROWS; rr++) {
          const i = cc * ROWS + rr;
          if (depth[i] !== 9) continue;
          if (dAt(cc - 1, rr) === p - 1 || dAt(cc + 1, rr) === p - 1 || dAt(cc, rr - 1) === p - 1 || dAt(cc, rr + 1) === p - 1)
            depth[i] = p;
        }
      }
    }
    this.depth = depth;
  }
}
