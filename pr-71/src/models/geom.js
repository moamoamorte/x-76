// Shared helpers for geometry built triangle by triangle (terrain, backdrops):
// flat-shaded faces with per-vertex colour, merged into one BufferGeometry.
import * as THREE from '../../vendor/three.module.js';

export class Builder {
  // decalZ: where rect() puts its decals unless told otherwise.
  constructor(decalZ = 0) { this.pos = []; this.nrm = []; this.col = []; this.decalZ = decalZ; }
  tri(a, b, c, n, color) {
    this.pos.push(...a, ...b, ...c);
    for (let i = 0; i < 3; i++) { this.nrm.push(...n); this.col.push(color.r, color.g, color.b); }
  }
  // A triangle whose normal comes from its winding (counter-clockwise = front).
  facet(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    this.tri(a, b, c, [nx / l, ny / l, nz / l], color);
  }
  // Corners in counter-clockwise order as seen from the side the normal faces.
  quad(a, b, c, d, n, color) { this.tri(a, b, c, n, color); this.tri(a, c, d, n, color); }
  // Axis-aligned rectangle facing +z.
  rect(xa, ya, xb, yb, color, z = this.decalZ) {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), y0 = Math.min(ya, yb), y1 = Math.max(ya, yb);
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], [0, 0, 1], color);
  }
  // Axis-aligned box, without the back face nobody can see. side: colour for
  // the top, bottom and end faces (defaults to the front colour).
  box(x0, y0, z0, x1, y1, z1, front, side = front) {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], front);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], side);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], side);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.pos.length === 0; }
}

// THREE.Color converts from sRGB, so vertex colours land in linear space.
const colors = new Map();
export function C(hex, k = 1) {
  const key = `${hex}:${k}`;
  let c = colors.get(key);
  if (!c) colors.set(key, (c = new THREE.Color(hex).multiplyScalar(k)));
  return c;
}
