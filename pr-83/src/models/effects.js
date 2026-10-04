// Effects in 3D: explosion particles, player and enemy bullets, the charge
// beam and the charge orb. Each is drawn from a few shapes (a soft octagon, a
// diamond streak, a ring, a faceted beam prism, a gem, a missile), and each
// shape is one instanced batch refilled from game state every frame; laser
// trails and beam wisps are ribbons in one shared buffer. Draw calls depend on
// which batches have anything in them, never on how many particles there are
// (DECISIONS §24), and nothing is created after start-up (§23).
//
// Glow is additive. On the transparent WebGL canvas it also adds its
// brightest channel to alpha: a pixel whose colour exceeds its alpha is
// undefined in premultiplied compositing, so browsers may each show it
// differently. Over empty canvas a glow therefore covers the starfield a
// little; over terrain, where alpha is already 1, it's purely additive.
// Smoke, missiles and enemy bullets blend normally: enemy bullets have to
// stay readable over a bright explosion, so they're opaque and drawn last.
import * as THREE from '../../vendor/three.module.js';
import { LASER_HUE } from '../items.js';

// Colours are written out as they are, in sRGB like the 2D canvas: the
// shader has no colour-space conversion, so there's none to undo here.
const RGB = new Map();
export function rgb(hex) {
  let c = RGB.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    RGB.set(hex, (c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]));
  }
  return c;
}

const WHITE = rgb('#ffffff');
const FIRE = ['#fff8d0', '#ffe070', '#ffb030', '#ff6a1a', '#c8321a', '#5a1d14'].map(rgb);
const SMOKE = rgb('#3a3440');
const SHOT = { glow: rgb('#ffaa3c'), core: rgb('#fff6c8') };
const POD_SHOT = rgb('#ff7832'), Y_SHOT = rgb('#ffdc3c');
const BEAM = { halo: rgb('#2a4aff'), mid: rgb('#6ab8ff'), wisp: rgb('#c8ecff') };
const ORB = { calm: rgb('#7ac8ff'), full: rgb('#ffe070'), core: rgb('#e4f6ff') };
const MISSILE = { body: rgb('#c0c8d8'), nose: rgb('#ff4a3a'), fin: rgb('#7a8294'), flame: rgb('#ff9a3a') };
const EB = { glow: rgb('#ff5a32'), body: rgb('#ffb070'), bigGlow: rgb('#ff3c8c'), bigBody: rgb('#ff9ad0') };
const HUE = {};
for (const k in LASER_HUE) HUE[k] = { core: rgb(LASER_HUE[k].core), glow: rgb(LASER_HUE[k].glow) };

// ---- shapes -------------------------------------------------------------------
// Unit-sized, +X forward. Per vertex: a tone (multiplied by the instance's
// colour), a weight (multiplied into its alpha: centres bright, rims soft,
// with straight edges in between) and an edge offset that pushes the vertex
// outward by a per-instance width instead of scaling it, for ring bands.
// Triangles wind counter-clockwise:
// back faces are culled, which is also what keeps the solid shapes' far
// sides from drawing over their near ones without a depth test.
class Shape {
  constructor() { this.pos = []; this.nrm = []; this.tone = []; this.weight = []; this.edge = []; }

  vert(x, y, z, n, w = 1, e = 0, tone = WHITE) {
    this.pos.push(x, y, z);
    this.nrm.push(n[0], n[1], n[2]);
    this.tone.push(tone[0], tone[1], tone[2]);
    this.weight.push(w);
    this.edge.push(e);
  }

  // Flat polygon facing the camera, fanned from a centre of weight 1.
  fan(points, rim) {
    const n = [0, 0, 1];
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + 1) % points.length];
      this.vert(0, 0, 0, n);
      this.vert(ax, ay, 0, n, rim);
      this.vert(bx, by, 0, n, rim);
    }
    return this;
  }

  // A stock geometry, flat-shaded, in one tone.
  add(geo, tone = WHITE) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.computeVertexNormals();   // non-indexed, so one normal per face
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) this.vert(P.getX(i), P.getY(i), P.getZ(i), [N.getX(i), N.getY(i), N.getZ(i)], 1, 0, tone);
    return this;
  }

  geometry() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('tone', new THREE.Float32BufferAttribute(this.tone, 3));
    g.setAttribute('weight', new THREE.Float32BufferAttribute(this.weight, 1));
    g.setAttribute('edge', new THREE.Float32BufferAttribute(this.edge, 1));
    return g;
  }
}

const polygon = (n, turn = 0) => Array.from({ length: n }, (_, i) => {
  const a = turn + (i / n) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});

export const octagon = (rim) => new Shape().fan(polygon(8, Math.PI / 8), rim);
const diamond = () => new Shape().fan([[1, 0], [0, 1], [-1, 0], [0, -1]], 0.25);

// A band around the unit circle, its width set per instance.
function ring() {
  const s = new Shape(), pts = polygon(12), n = [0, 0, 1];
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    s.vert(ax, ay, 0, n, 1, -0.5); s.vert(bx, by, 0, n, 1, 0.5); s.vert(bx, by, 0, n, 1, -0.5);
    s.vert(ax, ay, 0, n, 1, -0.5); s.vert(ax, ay, 0, n, 1, 0.5); s.vert(bx, by, 0, n, 1, 0.5);
  }
  return s;
}

// The charge beam: a long hexagonal bipyramid with a bulge, so its facets
// catch the light as it rolls.
function beamPrism() {
  const prof = [[0, -1], [0.72, -0.7], [1, 0], [0.72, 0.7], [0, 1]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(prof, 6);
  g.rotateZ(-Math.PI / 2);
  return new Shape().add(g);
}

const gem = () => new Shape().add(new THREE.OctahedronGeometry(1, 0));

// About 12px long, nose at +X, in game pixels.
function missile() {
  const body = new THREE.CylinderGeometry(1.3, 1.3, 7, 6);
  body.rotateZ(-Math.PI / 2);
  const nose = new THREE.ConeGeometry(1.3, 3, 6);
  nose.rotateZ(-Math.PI / 2);
  nose.translate(5, 0, 0);
  const fins = new THREE.BoxGeometry(2.4, 4.6, 0.5);
  fins.translate(-2.6, 0, 0);
  const fins2 = fins.clone();
  fins2.rotateX(Math.PI / 2);
  // Fins first: with no depth test, the body then covers where they cross it.
  return new Shape().add(fins, MISSILE.fin).add(fins2, MISSILE.fin).add(body, MISSILE.body).add(nose, MISSILE.nose);
}

// ---- material -----------------------------------------------------------------
// Instances are placed in the shader rather than by matrices: position, a roll
// about +X, a turn about +Z, half-length and half-width scales (z follows
// width), a band width for edge vertices, and a colour with alpha.
const VERT = `
  attribute vec3 tone;
  attribute float weight;
  attribute float edge;
  attribute vec4 iPos;   // x, y, z, roll
  attribute vec4 iXf;    // turn, length, width, band
  attribute vec4 iCol;
  uniform float uFacet;
  varying vec3 vCol;
  varying float vA;
  void main() {
    vec3 p = position * vec3(iXf.y, iXf.z, iXf.z);
    if (edge != 0.0) p.xy += normalize(position.xy) * edge * iXf.w;
    vec3 n = normal;
    float c = cos(iPos.w), s = sin(iPos.w);
    p.yz = vec2(c * p.y - s * p.z, s * p.y + c * p.z);
    n.yz = vec2(c * n.y - s * n.z, s * n.y + c * n.z);
    c = cos(iXf.x); s = sin(iXf.x);
    p.xy = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    n.xy = vec2(c * n.x - s * n.y, s * n.x + c * n.y);
    // Flat shapes face the camera and come out at full brightness; solid
    // ones are lit from the top left so their facets read.
    float lit = 0.3 + 0.7 * max(dot(n, vec3(-0.35, 0.5, 0.8)), 0.0) / 0.8;
    vCol = tone * iCol.rgb * mix(1.0, lit, uFacet);
    vA = iCol.a * weight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + iPos.xyz, 1.0);
  }`;
const FRAG = `
  varying vec3 vCol;
  varying float vA;
  void main() {
    #ifdef ADD
      vec3 c = vCol * vA;
      gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
    #else
      gl_FragColor = vec4(vCol, vA);
    #endif
  }`;

// depth: tested against what's already drawn (but never written), so a halo
// set behind a model shows only around it.
function material(add, facet, depth = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uFacet: { value: facet } },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: add ? { ADD: '' } : {},
    transparent: true,
    depthTest: depth,
    depthWrite: false,
    blending: add ? THREE.CustomBlending : THREE.NormalBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
  });
}

// ---- batches ------------------------------------------------------------------
// One shape, one blend mode, up to `cap` copies, drawn in `order`. put() takes
// screen coordinates (y down, angles clockwise) and converts them, at depth z.
export class Batch {
  constructor(name, shape, { cap, add = true, facet = 0, order = 0, depth = false, z = 0 }) {
    this.name = name;
    this.cap = cap;
    this.z = z;
    this.n = 0;
    this.warned = false;
    const g = shape.geometry();
    this.attrs = [
      (this.pos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
      (this.xf = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
      (this.col = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4)),
    ];
    for (const a of this.attrs) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.pos);
    g.setAttribute('iXf', this.xf);
    g.setAttribute('iCol', this.col);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material(add, facet, depth));
    this.mesh.frustumCulled = false;   // instances are placed in the shader; the bounds know nothing of them
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }

  put(x, y, turn, len, wid, c, a, roll = 0, band = 0) {
    if (this.n >= this.cap) {
      if (!this.warned) { this.warned = true; console.warn(`effects: ${this.name} is full (${this.cap}); dropping extras`); }
      return;
    }
    const i = this.n++ * 4;
    const P = this.pos.array, X = this.xf.array, C = this.col.array;
    P[i] = x; P[i + 1] = -y; P[i + 2] = this.z; P[i + 3] = roll;
    X[i] = -turn; X[i + 1] = len; X[i + 2] = wid; X[i + 3] = band;
    C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2]; C[i + 3] = a;
  }

  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    if (!n) return;
    for (let i = 0; i < 3; i++) {
      const a = this.attrs[i];
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * 4);
      a.needsUpdate = true;
    }
  }
}

// ---- ribbons ------------------------------------------------------------------
// Polylines w wide, bright down the middle, written into one vertex buffer
// each frame. Joints share their vertices, so a bending trail has no overlaps
// for additive blending to brighten into beads, as separate segments did.
// Usage: begin(w, c, a), point(x, y) for each point, end().
const RIBBON_VERT = `
  attribute vec4 rgba;
  varying vec4 vCol;
  void main() {
    vCol = rgba;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const RIBBON_FRAG = `
  varying vec4 vCol;
  void main() {
    vec3 c = vCol.rgb * vCol.a;
    gl_FragColor = vec4(c, max(c.r, max(c.g, c.b)));
  }`;
const EDGE = 0.35, TIP = 0.4;   // weights at the sides and at the end caps
const MAX_POINTS = 64;
// Triangles between two points' vertices: centre, left, right of the first,
// then of the second.
const SEG = [0, 1, 4, 0, 4, 3, 0, 3, 5, 0, 5, 2];

// Methods here take objects and small integers, never fractional numbers:
// V8 boxes a double passed to any call it doesn't inline, and these run for
// thousands of vertices a frame (DECISIONS §24). The camera is a field, set
// once a frame.
class Ribbons {
  constructor(cap, order) {
    this.cap = cap;   // vertices
    this.n = 0;
    this.warned = false;
    this.cam = 0;
    this.hw = 0;
    this.a = 0;
    this.c = WHITE;
    this.px = new Float64Array(MAX_POINTS);
    this.py = new Float64Array(MAX_POINTS);
    this.np = 0;
    // Per point: centre, left and right vertex; then the two cap tips.
    this.vx = new Float64Array(MAX_POINTS * 3 + 2);
    this.vy = new Float64Array(MAX_POINTS * 3 + 2);
    this.vw = new Float64Array(MAX_POINTS * 3 + 2);
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('rgba', this.col);
    g.setDrawRange(0, 0);
    this.geo = g;
    const m = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERT,
      fragmentShader: RIBBON_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
  }

  // A laser's trail: layer 0 is the wide coloured glow, 1 the white-hot core.
  trail(b, layer) {
    const hue = HUE[b.color];
    if (layer === 0) { this.hw = b.r * 0.9; this.c = hue.glow; this.a = 0.6; }
    else { this.hw = b.r * 0.35; this.c = hue.core; this.a = 1; }
    const n = Math.min(b.trailLen, MAX_POINTS), X = b.trailX, Y = b.trailY, cam = this.cam;
    for (let i = 0; i < n; i++) { this.px[i] = X[i] - cam; this.py[i] = -Y[i]; }
    this.np = n;
    this.end();
  }

  // One of the two strands spiralling round a beam from level 3.
  wisp(b, ph) {
    const hw = b.hw, hh = b.hh, x = b.x - this.cam, y = b.y, k = b.t * 0.9 + ph * Math.PI;
    this.hw = 0.6; this.c = BEAM.wisp; this.a = 0.8;
    let n = 0;
    for (let i = -hw * 1.7; i <= hw && n < MAX_POINTS; i += 3, n++) {
      this.px[n] = x + i;
      this.py[n] = -(y + Math.sin(i * 0.25 + k) * hh * 1.1 * (1 - Math.abs(i) / (hw * 1.8)));
    }
    this.np = n;
    this.end();
  }

  // Each point's sides lie along the normal of the line through its
  // neighbours, so consecutive quads meet edge to edge.
  end() {
    const n = this.np, X = this.px, Y = this.py, hw = this.hw;
    if (n < 2) return;
    if (this.n + (n - 1) * 12 + 12 > this.cap) {
      if (!this.warned) { this.warned = true; console.warn(`effects: ribbons are full (${this.cap}); dropping extras`); }
      return;
    }
    const VX = this.vx, VY = this.vy, VW = this.vw, tip = n * 3;
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
      let dx = X[b] - X[a], dy = Y[b] - Y[a];
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= d; dy /= d;
      const j = i * 3;
      VX[j] = X[i]; VY[j] = Y[i]; VW[j] = 1;
      VX[j + 1] = X[i] - dy * hw; VY[j + 1] = Y[i] + dx * hw; VW[j + 1] = EDGE;
      VX[j + 2] = X[i] + dy * hw; VY[j + 2] = Y[i] - dx * hw; VW[j + 2] = EDGE;
      // Pointed caps, half the width long.
      if (i === 0) { VX[tip] = X[i] - dx * hw; VY[tip] = Y[i] - dy * hw; VW[tip] = TIP; }
      if (i === n - 1) { VX[tip + 1] = X[i] + dx * hw; VY[tip + 1] = Y[i] + dy * hw; VW[tip + 1] = TIP; }
    }
    const last = (n - 1) * 3;
    this.v(0); this.v(1); this.v(tip); this.v(0); this.v(tip); this.v(2);
    this.v(last); this.v(last + 1); this.v(tip + 1); this.v(last); this.v(tip + 1); this.v(last + 2);
    for (let i = 0; i < last; i += 3) for (let k = 0; k < 12; k++) this.v(i + SEG[k]);
  }

  v(j) {
    const i = this.n++, P = this.pos.array, C = this.col.array, c = this.c;
    P[i * 3] = this.vx[j]; P[i * 3 + 1] = this.vy[j]; P[i * 3 + 2] = 0;
    C[i * 4] = c[0]; C[i * 4 + 1] = c[1]; C[i * 4 + 2] = c[2]; C[i * 4 + 3] = this.a * this.vw[j];
  }

  flush() {
    const n = this.n;
    this.geo.setDrawRange(0, n);
    this.mesh.visible = n > 0;
    if (!n) return;
    this.pos.clearUpdateRanges();
    this.pos.addUpdateRange(0, n * 3);
    this.pos.needsUpdate = true;
    this.col.clearUpdateRanges();
    this.col.addUpdateRange(0, n * 4);
    this.col.needsUpdate = true;
  }
}

// ---- the layer ----------------------------------------------------------------
export function createEffects() {
  // Back to front. Additive batches can go in any order among themselves.
  const B = {
    smoke: new Batch('smoke', octagon(0.45), { cap: 400, add: false, order: 0 }),
    missile: new Batch('missile', missile(), { cap: 16, add: false, facet: 1, order: 1 }),
    streak: new Batch('streak', diamond(), { cap: 1024, order: 3 }),
    glow: new Batch('glow', octagon(0.5), { cap: 1024, order: 4 }),
    ring: new Batch('ring', ring(), { cap: 64, order: 5 }),
    beam: new Batch('beam', beamPrism(), { cap: 12, facet: 0.8, order: 6 }),
    orb: new Batch('orb', gem(), { cap: 2, facet: 0.7, order: 7 }),
    eglow: new Batch('eglow', octagon(0.8), { cap: 256, add: false, order: 8 }),
    ebody: new Batch('ebody', gem(), { cap: 512, add: false, facet: 0.25, order: 9 }),
  };
  const list = Object.values(B);
  const trails = new Ribbons(24576, 2);
  const group = new THREE.Group();
  for (const b of list) group.add(b.mesh);
  group.add(trails.mesh);

  function particles(p, cam) {
    for (let i = 0; i < p.length; i++) {
      const o = p[i], t = o.life / o.max, x = o.x - cam;
      switch (o.k) {
        case 'smoke':
          B.smoke.put(x, o.y, Math.atan2(o.vy, o.vx), o.r, o.r, SMOKE, t * 0.35);
          break;
        case 'fire': {
          // Drag slows both axes alike, so the heading holds and the octagon doesn't spin.
          const r = o.r * (0.5 + t * 0.7);
          B.glow.put(x, o.y, Math.atan2(o.vy, o.vx), r, r, FIRE[Math.min(5, Math.floor((1 - t) * 6))], Math.min(1, t * 1.6));
          break;
        }
        case 'spark': {
          const sp = Math.sqrt(o.vx * o.vx + o.vy * o.vy);
          B.streak.put(x, o.y, Math.atan2(o.vy, o.vx), 1.4 + sp * 0.7, 1, rgb(o.c), t);
          break;
        }
        case 'suck':
          B.streak.put(x, o.y, Math.atan2(o.ty - o.y, o.tx - o.x), 2.4, 1, rgb(o.c), t);
          break;
        case 'ring':
          B.ring.put(x, o.y, 0, o.r, o.r, rgb(o.c), t, 0, 2 * t + 0.5);
          break;
      }
    }
  }

  // One small function per kind, taking only the bullet, so V8 can inline
  // their put() calls; one big switch was over its inlining budget, and every
  // call it left made boxed copies of the numbers passed (DECISIONS §24).
  let cx = 0;   // camera x, set once a frame

  function playerShots(list) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      switch (b.kind) {
        case 'shot':
        case 'bitshot': shot(b); break;
        case 'podshot':
        case 'yshot': podShot(b); break;
        case 'beam': beam(b); break;
        case 'helix':
        case 'ricochet':
        case 'crawler': trails.trail(b, 0); trails.trail(b, 1); break;
        case 'missile': missileShot(b); break;
      }
    }
  }

  function shot(b) {
    B.streak.put(b.x - cx, b.y, 0, 6.5, 2.6, SHOT.glow, 0.55);
    B.streak.put(b.x - cx, b.y, 0, 5.5, 1.3, SHOT.core, 1);
  }

  function podShot(b) {
    const r = b.r, spin = b.t * 0.2;
    B.glow.put(b.x - cx, b.y, spin, r + 1.5, r + 1.5, b.kind === 'yshot' ? Y_SHOT : POD_SHOT, 0.75);
    B.glow.put(b.x - cx, b.y, spin, r * 0.55, r * 0.55, WHITE, 1);
  }

  function missileShot(b) {
    const x = b.x - cx;
    B.missile.put(x, b.y, b.a, 1, 1, WHITE, 1, b.t * 0.3);
    B.streak.put(x - Math.cos(b.a) * 6.5, b.y - Math.sin(b.a) * 6.5, b.a, 2.5 + Math.random() * 1.2, 1.3, MISSILE.flame, 0.9);
  }

  // Halo, body and white-hot core, each a size up from the 2D ellipses they
  // replace (the prism's bulge covers less than an ellipse of the same
  // extent). Wisps spiral round it from level 3.
  function beam(b) {
    const x = b.x - cx, hw = b.hw, hh = b.hh;
    const flick = 0.85 + Math.random() * 0.15, roll = b.t * 0.15;
    B.beam.put(x, b.y, 0, hw * 1.15, hh * 1.5, BEAM.halo, 0.5 * flick, roll);
    B.beam.put(x, b.y, 0, hw * 1.02, hh * 1.05, BEAM.mid, 0.6 * flick, roll + 0.5);
    B.beam.put(x, b.y, 0, hw * 0.88, hh * 0.42, WHITE, flick, -roll);
    if (b.level >= 3) { trails.wisp(b, 0); trails.wisp(b, 1); }
  }

  // Grows with the charge, pulses, and flashes gold in step with the HUD
  // meter once full (both read game.t).
  function orb(p, cam, t) {
    if (!p || p.dead || p.charge <= 0) return;
    const x = p.x - cam + 21, y = p.y;
    const r = 2 + p.charge * 6 + Math.sin(p.t * 0.6);
    const full = p.charge >= 1 && t % 8 < 4;
    // Stepped rather than smooth falloff, to keep to the angular style.
    const c = full ? ORB.full : ORB.calm;
    B.glow.put(x, y, p.t * 0.05, r * 2, r * 2, c, 0.22);
    B.glow.put(x, y, -p.t * 0.07, r * 1.45, r * 1.45, c, 0.35);
    B.orb.put(x, y, p.t * 0.13, r * 0.8, r * 0.8, full ? WHITE : ORB.core, 1, p.t * 0.21);
  }

  // Halos first, then bodies and white cores, so no bullet's halo covers
  // another's core.
  function enemyShots(list, cam) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i], r = b.r + ((b.t >> 2) & 1) * 0.6;
      B.eglow.put(b.x - cam, b.y, 0, r + 1.8, r + 1.8, b.big ? EB.bigGlow : EB.glow, 0.6);
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i], r = b.r * 1.35;
      B.ebody.put(b.x - cam, b.y, b.t * 0.1, r, r, b.big ? EB.bigBody : EB.body, 1, b.t * 0.17);
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      B.ebody.put(b.x - cam, b.y, b.t * 0.1, b.r * 0.65, b.r * 0.65, WHITE, 1, b.t * 0.17);
    }
  }

  return {
    group,
    batches: B,
    // cam: the camera the 3D models use; t: game.t, which the HUD's charge meter blinks on.
    update(game, cam) {
      for (let i = 0; i < list.length; i++) list[i].n = 0;
      trails.n = 0;
      cx = trails.cam = cam;
      particles(game.fx.p, cam);
      playerShots(game.pbullets);
      orb(game.player, cam, game.t);
      enemyShots(game.ebullets, cam);
      for (let i = 0; i < list.length; i++) list[i].end();
      trails.flush();
    },
  };
}
