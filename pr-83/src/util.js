// Shared constants and small math helpers.
export const W = 384;          // play-field width (logical pixels)
export const H = 224;          // play-field height
export const HUD_H = 16;       // HUD strip below the play-field
export const SCREEN_H = H + HUD_H;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export const TAU = Math.PI * 2;

// Deterministic PRNG so the level art is the same every run.
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function circleHit(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) < r * r;
}

// Axis-aligned rectangle (centre + half extents) vs circle.
export function rectCircleHit(rx, ry, hw, hh, cx, cy, cr) {
  const nx = clamp(cx, rx - hw, rx + hw);
  const ny = clamp(cy, ry - hh, ry + hh);
  return dist2(nx, ny, cx, cy) < cr * cr;
}

// Rotate an angle toward a target by at most `step` radians.
export function turnToward(a, target, step) {
  let d = target - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return a + clamp(d, -step, step);
}
