// Shared kit for the enemy models. Each enemy type is a few rigid pieces
// (a body, a leg, a barrel...), and each piece draws every instance of itself
// on screen as one InstancedMesh plus one instanced ink shell. Draw calls
// depend on how many kinds of piece are on screen, not how many enemies
// (DECISIONS §24), and nothing is created after start-up (§23).
import * as THREE from '../../../vendor/three.module.js';
import { toonRamp } from '../materials.js';

// Toon shading over vertex colours, plus two extras the stock material lacks:
// a per-vertex glow flag (lights and eyes ignore shading) and a per-instance
// flash that whites out an enemy that was just hit.
function solid() {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nattribute float flash;\nvarying float vGlow;\nvarying float vFlash;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvFlash = flash;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;\nvarying float vFlash;')
      .replace('#include <opaque_fragment>', 'outgoingLight = mix(mix(outgoingLight, vColor.rgb, vGlow), vec3(1.0), vFlash);\n#include <opaque_fragment>');
  };
  return m;
}

// One material per pass and per tinted-or-not. Three keys a material's
// program on the scene's fog and lights and on whether the mesh has
// per-instance colours, so a material shared across those flips its program
// at every switch, and each flip rebuilds the program's parameters and cache
// key: in the boss fight that was over 30 KB of garbage a frame.
const SOLIDS = new Map();
export function solidMaterial(front = false, tint = false) {
  const key = `${front}:${tint}`;
  if (!SOLIDS.has(key)) SOLIDS.set(key, solid());
  return SOLIDS.get(key);
}
export function setWireframe(on) {
  for (const m of SOLIDS.values()) m.wireframe = on;
}

// Ink outline for instanced pieces. The shell geometry is baked already
// pushed out along its normals, so all this does is place it.
export const INK = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0x14151c) } },
  vertexShader: `
    void main() {
      vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p;
    }`,
  fragmentShader: `
    uniform vec3 uColor;
    void main() { gl_FragColor = vec4(uColor, 1.0); }`,
  side: THREE.BackSide,
});

// Enemy greys sit a little darker and cooler than the player's ship, so the
// two never read as the same thing; colour is kept to lights and weak points.
export const E = {
  light: 0xbfc4cf,
  steel: 0x9298a5,
  plate: 0x737a88,
  dark: 0x33373f,
  black: 0x1f2228,
  red: 0xff3a2a,
  amber: 0xffa82a,
  hot: 0xff6a20,
};

// --- pieces -------------------------------------------------------------------
// A piece collects primitives, each with a colour and transform, and bakes them
// into one geometry. +X forward, +Y up, +Z out of the screen, units are game
// pixels. per: how many of this piece one enemy uses (legs come in pairs);
// tint: instances take their own colour (multiplied into the vertex colours).
export class Piece {
  constructor({ per = 1, tint = false, outline = 0.4 } = {}) {
    this.parts = [];
    this.per = per;
    this.tint = tint;
    this.outline = outline;
  }

  // o: { at, rot, scale, glow, outline, smooth }. Glowing parts get no ink by
  // default. Facets are flat-shaded unless smooth is set. A null colour keeps
  // the geometry's own vertex colours (the boss's mottled flesh).
  add(geo, color, o = {}) {
    this.parts.push({ geo, color, o });
    return this;
  }
  box(w, h, d, color, o) { return this.add(new THREE.BoxGeometry(w, h, d), color, o); }
  // Prism along X, rFront at the +X end.
  prism(rFront, rBack, len, seg, color, o) {
    const g = new THREE.CylinderGeometry(rFront, rBack, len, seg);
    g.rotateZ(-Math.PI / 2);
    return this.add(g, color, o);
  }
  // Prism along Y (upright), for housings and posts.
  post(rTop, rBottom, h, seg, color, o) { return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg), color, o); }
  // Prism along Z, facing the camera.
  disc(r, depth, seg, color, o) {
    const g = new THREE.CylinderGeometry(r, r, depth, seg);
    g.rotateX(Math.PI / 2);
    return this.add(g, color, o);
  }
  gem(r, color, o) { return this.add(new THREE.OctahedronGeometry(r, 0), color, o); }
  // A 2D outline in the XY plane, extruded along Z and centred on z = 0.
  plate(points, depth, color, o) {
    const s = new THREE.Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, o);
  }

  bake() {
    const pos = [], nrm = [], col = [], glow = [], ink = [];
    const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
    const q = new THREE.Quaternion(), eu = new THREE.Euler();
    const p = new THREE.Vector3(), n = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3();
    const c = new THREE.Color();
    for (const { geo, color, o } of this.parts) {
      const at = o.at || [0, 0, 0], rot = o.rot || [0, 0, 0], sc = o.scale || [1, 1, 1];
      m.compose(t.set(...at), q.setFromEuler(eu.set(...rot)), s.set(...sc));
      nm.getNormalMatrix(m);
      const g = geo.index ? geo.toNonIndexed() : geo;
      const P = g.attributes.position, N = g.attributes.normal;
      let F = N;
      if (!o.smooth) {
        const flat = g.clone();
        flat.computeVertexNormals();   // non-indexed, so one normal per face
        F = flat.attributes.normal;
      }
      const own = color === null ? g.attributes.color : null;
      if (!own) c.set(color);
      const lit = o.glow ? 1 : 0;
      const push = o.outline ?? (o.glow ? 0 : this.outline);
      for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i).applyMatrix4(m);
        n.fromBufferAttribute(F, i).applyNormalMatrix(nm);
        pos.push(p.x, p.y, p.z);
        nrm.push(n.x, n.y, n.z);
        if (own) c.fromBufferAttribute(own, i);
        col.push(c.r, c.g, c.b);
        glow.push(lit);
        if (push > 0) {
          // The same push the ship's outline shader does, in the part's own space.
          n.fromBufferAttribute(N, i).normalize();
          p.fromBufferAttribute(P, i).addScaledVector(n, push).applyMatrix4(m);
          ink.push(p.x, p.y, p.z);
        }
      }
    }
    const solid = new THREE.BufferGeometry();
    solid.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    solid.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    solid.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    solid.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
    let shell = null;
    if (ink.length) {
      shell = new THREE.BufferGeometry();
      shell.setAttribute('position', new THREE.Float32BufferAttribute(ink, 3));
    }
    return { solid, shell };
  }
}

// One piece's instanced meshes. Filled each frame between begin() and end().
export class Instanced {
  constructor(piece, cap, front = false) {
    const { solid, shell } = piece.bake();
    this.cap = cap;
    this.flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.flash.setUsage(THREE.DynamicDrawUsage);
    solid.setAttribute('flash', this.flash);
    this.solid = new THREE.InstancedMesh(solid, solidMaterial(front, piece.tint), cap);
    this.ink = shell ? new THREE.InstancedMesh(shell, INK, cap) : null;
    if (piece.tint) this.solid.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.meshes = this.ink ? [this.solid, this.ink] : [this.solid];
    for (const mesh of this.meshes) {
      // Instances go anywhere on screen; a bounding sphere computed once would go stale.
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
    }
    this.n = 0;
  }
  begin() { this.n = 0; }
  put(matrix, flash = 0, color = null) {
    const i = this.n;
    if (i >= this.cap) {
      if (!this.warned) { this.warned = true; console.warn(`enemy piece out of instances (${this.cap})`); }
      return;
    }
    this.solid.setMatrixAt(i, matrix);
    this.ink?.setMatrixAt(i, matrix);
    this.flash.array[i] = flash;
    if (color) this.solid.setColorAt(i, color);
    this.n = i + 1;
  }
  end(outlines) {
    const n = this.n;
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.visible = n > 0 && (mesh === this.solid || outlines);
      if (n) mesh.instanceMatrix.needsUpdate = true;
    }
    if (n) {
      this.flash.needsUpdate = true;
      if (this.solid.instanceColor) this.solid.instanceColor.needsUpdate = true;
    }
  }
}

// A small matrix stack for posing pieces without allocating: at() starts a
// new enemy at a world position, then t/rx/ry/rz/s apply in the order called,
// the way nested groups would.
export class Pose {
  constructor() {
    this.stack = Array.from({ length: 8 }, () => new THREE.Matrix4());
    this.i = 0;
    this.tmp = new THREE.Matrix4();
  }
  get m() { return this.stack[this.i]; }
  at(x, y, z = 0) { this.i = 0; this.stack[0].makeTranslation(x, y, z); return this; }
  push() { this.stack[this.i + 1].copy(this.stack[this.i]); this.i++; return this; }
  pop() { this.i--; return this; }
  t(x, y, z = 0) { this.m.multiply(this.tmp.makeTranslation(x, y, z)); return this; }
  rx(a) { this.m.multiply(this.tmp.makeRotationX(a)); return this; }
  ry(a) { this.m.multiply(this.tmp.makeRotationY(a)); return this; }
  rz(a) { this.m.multiply(this.tmp.makeRotationZ(a)); return this; }
  s(x, y = x, z = x) { this.m.multiply(this.tmp.makeScale(x, y, z)); return this; }
}

// Rotation about Z that turns "straight down" (0, -1) toward (dx, dy): how
// legs are aimed from hip to knee to foot.
export const aimDown = (dx, dy) => Math.atan2(dx, -dy);
