// Oculus Bloom, the stage 1 boss: a faceted wall of armoured flesh with an
// eye behind eight iris petals, two ringed tentacles and two spore mouths.
// Laid out like src/boss.js: x runs from the boss's left edge (ox), y is
// screen y, so a model point (x, y) sits at (x, -y).
import * as THREE from '../../../vendor/three.module.js';
import { mulberry32 } from '../../util.js';
import { Piece } from './kit.js';
import { Boss, EYE_X, EYE_Y, N_SEG } from '../../boss.js';

const F = {
  flesh: [0x5e2c46, 0x4c2238, 0x6c3852, 0x42192f, 0x55263f],
  bone: 0xc8aaa4, boneDark: 0x8a6a6c, socket: 0x14050c, rim: 0x7a5a50, vein: 0xb03050,
  petal: 0xb48a6c, petalDark: 0x5a4038, eyeball: 0xeee8c0, ring: 0x9a7078, band: 0x2a1020,
};
const RIGHT = 418;               // the wall runs on past the screen's right edge
const MOUTHS = [36, 188], SOCKETS = [58, 166], MOUTH_X = 340, SOCKET_X = 326;
const R_PETAL = 22.5, PETAL_Z = 5;
const TENT_Z = 4;                // tentacles hang just in front of the wall

// The old sprite's leading edge: narrowest at the eye, sweeping out top and bottom.
const edgeX = (y) => 302 + Math.pow(Math.abs(y - 112) / 112, 1.6) * 48 + Math.sin(y * 0.3) * 1.5;
// Depth across the wall from its leading edge (u = 0) to the right (u = 1):
// it curls away at the edge and bulges toward the camera further in.
const depthAt = (u) => -18 + 32 * Math.sin(Math.min(1, u / 0.6) * Math.PI / 2);
// Around the eye the wall sinks into a socket, behind the eyeball and its glow.
function sink(x, y, z) {
  const d = Math.hypot(x - EYE_X, y - EYE_Y);
  if (d >= 40) return z;
  const k = Math.max(0, (d - 24) / 16), s = k * k * (3 - 2 * k);
  return Math.min(z, -13 + (z + 13) * s);
}
const surface = (x, y) => { const e = edgeX(y); return sink(x, y, depthAt((x - e) / (RIGHT - e))); };
const MOUTH_Z = MOUTHS.map((y) => surface(MOUTH_X, y));
const V = (x, y, z) => new THREE.Vector3(x, -y, z);

// The flesh: a jittered grid of flat triangles, each its own shade.
function wall(rng) {
  const cols = [0, 0.1, 0.17, 0.24, 0.33, 0.42, 0.62, 0.82, 1];
  const rows = [];
  for (let y = -8; y <= 236; y += 14) rows.push(y);
  const pts = rows.map((y, r) => cols.map((u, c) => {
    const e = edgeX(y);
    const inside = c > 0 && c < cols.length - 1;
    const yy = r > 0 && r < rows.length - 1 ? y + (rng() - 0.5) * 6 : y;
    const x = e + u * (RIGHT - e) + (inside ? (rng() - 0.5) * 5 : 0);
    return [x, -yy, sink(x, yy, depthAt(u) + (c ? (rng() - 0.5) * 4 : 0))];
  }));
  const pos = [], col = [], c = new THREE.Color();
  const tri = (a, b, d) => {
    pos.push(...a, ...b, ...d);
    c.set(F.flesh[Math.floor(rng() * F.flesh.length)]);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let k = 0; k + 1 < cols.length; k++) {
      const a = pts[r][k], b = pts[r][k + 1], cc = pts[r + 1][k + 1], d = pts[r + 1][k];
      tri(a, d, cc);
      tri(a, cc, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// A box from a to b: w deep, h thick across the line.
const q = new THREE.Quaternion(), eu = new THREE.Euler(), AX = new THREE.Vector3(1, 0, 0), dv = new THREE.Vector3();
function strut(p, a, b, w, h, color, o = {}) {
  dv.subVectors(b, a);
  const len = dv.length();
  eu.setFromQuaternion(q.setFromUnitVectors(AX, dv.normalize()));
  return p.box(len + h * 0.5, h, w, color, { ...o, at: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], rot: [eu.x, eu.y, eu.z] });
}

function bodyPiece() {
  const rng = mulberry32(42);
  const body = new Piece({ tint: true });
  body.add(wall(rng), null, { outline: 0 });

  // Carapace ribs along the old sprite's curves.
  for (let k = -5; k <= 5; k++) {
    if (!k) continue;
    const y = 112 + k * 19, sg = Math.sign(k), ex = edgeX(y) + 2;
    let prev = null;
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, s = 1 - t;
      const x = s * s * ex + 2 * s * t * 350 + t * t * RIGHT;
      const yy = s * s * y + 2 * s * t * (y + sg * 10) + t * t * (y + sg * 6);
      const pt = V(x, yy, surface(x, yy) + 2.6);
      if (prev) strut(body, prev, pt, 3.4, 2.6, F.bone);
      prev = pt;
    }
  }
  // Veins creeping toward the leading edge.
  for (let i = 0; i < 12; i++) {
    let x = RIGHT - 8, y = rng() * 224;
    let prev = V(x, y, surface(x, y) + 2.2);
    while (x > edgeX(y) + 8) {
      x -= 12;
      y += (rng() - 0.5) * 10;
      const pt = V(x, y, surface(x, y) + 2.2);
      strut(body, prev, pt, 1, 1.1, F.vein, { outline: 0 });
      prev = pt;
    }
  }
  // Bony knobs along the leading edge, clear of the eye.
  for (let y = 10; y < 224; y += 14) {
    if (Math.abs(y - 112) < 30) continue;
    const x = edgeX(y) + 2;
    body.gem(3, F.bone, { at: [x, -y, surface(x, y) + 1.5] });
  }
  for (const y of SOCKETS) {
    const z = surface(SOCKET_X, y);
    body.disc(10.5, 1.4, 8, F.bone, { at: [SOCKET_X, -y, z + 0.8] })
      .disc(8.2, 1.4, 8, F.socket, { at: [SOCKET_X, -y, z + 1.4] });
  }
  for (const y of MOUTHS) {
    const z = surface(MOUTH_X, y);
    body.disc(10, 1.4, 8, F.boneDark, { at: [MOUTH_X, -y, z + 0.6], scale: [1.25, 0.85, 1] })
      .disc(8, 1.4, 8, F.socket, { at: [MOUTH_X, -y, z + 1.2], scale: [1.25, 0.85, 1] })
      .gem(2.4, 0x6a1020, { glow: true, at: [MOUTH_X, -y, z + 1.6] });
  }
  // The eye socket: a dark backing and an eight-sided armoured rim.
  body.disc(27, 2, 8, F.socket, { at: [EYE_X, -EYE_Y, -11], rot: [0, 0, Math.PI / 8] });
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) * Math.PI) / 4, b = ((i + 1.5) * Math.PI) / 4;
    strut(body, V(EYE_X + Math.cos(a) * 24, EYE_Y + Math.sin(a) * 24, 3), V(EYE_X + Math.cos(b) * 24, EYE_Y + Math.sin(b) * 24, 3), 5, 3.6, F.rim);
  }
  return body;
}

const tint = new THREE.Color(), glowTint = new THREE.Color(), irisTint = new THREE.Color();

export const boss = {
  cap: 1,
  // The chamber's back wall is terrain, and the boss grows over it: drawn in
  // the terrain's pass, most of its body would sink behind the wall's face.
  front: true,
  pieces() {
    const body = bodyPiece();

    // Red glow in the crater behind the eyeball, brightening as the iris opens.
    const crater = new Piece({ tint: true });
    crater.disc(22, 1, 8, 0xff3a28, { glow: true, rot: [0, 0, Math.PI / 8] });

    const eyeball = new Piece();
    eyeball.add(new THREE.IcosahedronGeometry(14, 0), F.eyeball);

    const iris = new Piece({ tint: true, outline: 0.3 });
    iris.disc(7.5, 1, 8, 0xe02a1a, { glow: true, outline: 0.3 })
      .disc(4.5, 1, 8, 0xffc040, { glow: true, at: [0, 0, 0.35] });
    const pupil = new Piece({ outline: 0 });
    pupil.disc(1, 0.6, 6, 0x100204, { glow: true });

    // One iris petal, hinged at the rim (the origin) and pointing inward (+X).
    const petal = new Piece({ per: 8 });
    const half = R_PETAL * Math.sin(Math.PI / 8);
    // A touch wider than an eighth of the rim, so closed petals overlap without gaps.
    petal.plate([[0, -half * 1.08], [0, half * 1.08], [R_PETAL, 0]], 1.6, F.petal)
      .prism(0.4, 1.2, 17, 4, F.petalDark, { at: [8.5, 0, 0.8] })
      .box(2, half * 1.6, 2.4, F.petalDark, { at: [0.6, 0, 0] });

    const teeth = new Piece({ per: 2 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      teeth.post(0, 1.7, 4.5, 4, F.bone, { at: [Math.cos(a) * 7.5, Math.sin(a) * 5.2, 0], rot: [0, 0, a + Math.PI / 2] });
    }

    const ring = new Piece({ per: 2 * (N_SEG - 1) });
    ring.prism(4.8, 6.5, 10, 6, F.ring)
      .prism(6.8, 6.8, 1.4, 6, F.band, { at: [-4.2, 0, 0] });
    for (const y of [6.2, -6.2]) ring.box(5, 1.4, 4, F.bone, { at: [0.5, y, 0] });
    const tip = new Piece({ per: 2 });
    // The tips fire, so they glow as brightly as the old sprite's orbs.
    tip.gem(5.4, 0xff9a30, { glow: true }).gem(3, 0xfff0c0, { glow: true, at: [0, 0, 3] });

    return { body, crater, eyeball, iris, pupil, petal, teeth, ring, tip };
  },
  draw(e, P, X) {
    // Gone under the death flash; the 2D explosions carry on.
    if (e.state === 'dying' && e.st >= 150) return;
    const t = e.t, f = e.flash > 0 ? 1 : 0;

    if (e.state === 'dying') {
      const k = 1 - 0.45 * (e.st / 150);
      tint.setScalar(e.st % 10 < 5 ? k * 1.25 : k);
    } else if (e.hp < e.maxHp * 0.5) {
      const p = 0.5 + 0.5 * Math.sin(t * 0.1);
      tint.setRGB(1.1 + 0.25 * p, 0.8, 0.8);   // second phase: flushed
    } else tint.setScalar(1);
    const M = X.at(e.ox, 0);
    P.body.put(M.m, 0, tint);

    M.push().t(EYE_X, -EYE_Y, -9);
    P.crater.put(M.m, 0, glowTint.setScalar(0.5 + Math.sin(t * 0.08) * 0.2 + e.open * 0.3));
    M.pop();
    M.push().t(EYE_X, -EYE_Y, -8).rx(0.4).ry(0.3);
    P.eyeball.put(M.m, f);
    M.pop();
    const pl = e.g.player, la = Math.atan2(pl.y - EYE_Y, pl.x - e.x);
    M.push().t(EYE_X + Math.cos(la) * 4, -(EYE_Y + Math.sin(la) * 4), 6.6);
    P.iris.put(M.m, f, irisTint.setScalar(0.55 + 0.45 * e.open));
    M.t(0, 0, 0.9).s(1.8 + e.open, 7, 1);
    P.pupil.put(M.m, 0);
    M.pop();
    // Closed, the petals meet over the eye in a shallow cone; open, they fold
    // back toward the camera and the eye is plainly bare.
    const fold = 0.38 + e.open * 1.55;
    for (let i = 0; i < 8; i++) {
      M.push().t(EYE_X, -EYE_Y, PETAL_Z).rz(Math.PI / 8 + (i * Math.PI) / 4).t(R_PETAL, 0, 0).rz(Math.PI).ry(-fold);
      P.petal.put(M.m, f);
      M.pop();
    }
    // The spore mouths gape as larvae leave them.
    const gape = Math.max(0, 1 - (t - e.launchT) / 36);
    for (let i = 0; i < MOUTHS.length; i++) {
      M.push().t(MOUTH_X, -MOUTHS[i], MOUTH_Z[i] + 1.8).s(1 + 0.45 * gape, 1 + 0.45 * gape, 1).rz(gape * 0.3);
      P.teeth.put(M.m, 0);
      M.pop();
    }

    for (let j = 0; j < e.tent.length; j++) {
      const s = e.tent[j].segs;
      for (let k = 0; k < N_SEG - 1; k++) {
        const a = Math.atan2(s[k + 1].y - s[k].y, s[k + 1].x - s[k].x);
        P.ring.put(X.at(s[k].x, s[k].y, TENT_Z).rz(-a).rx(0.35).s(s[k].r / 6.5).m, 0);
      }
      const tp = s[N_SEG - 1];
      P.tip.put(X.at(tp.x, tp.y, TENT_Z).s(1 + Math.sin(t * 0.2) * 0.12).ry(t * 0.05).m, 0);
    }
  },
  // The real Boss with a stand-in game: the iris cycles, the tentacles lash
  // now and then, the eye follows a circling player, the mouths gape every
  // few seconds and the second-phase flush comes and goes.
  demo: {
    origin: [330, 112],
    scale: 0.45,
    init() {
      const g = { cam: 0, audio: { play() {} }, player: { x: 100, y: 112 } };
      const b = new Boss(g);
      b.state = 'fight';
      b.slide = 0;
      b.layout();
      return b;
    },
    step(b) {
      const t = b.t, c = t % 300;
      b.open = c < 90 ? 0 : c < 118 ? (c - 90) / 28 : c < 260 ? 1 : c < 288 ? 1 - (c - 260) / 28 : 0;
      b.lash = t % 600 < 150 ? 1 : 0;
      b.hp = t % 1200 < 600 ? b.maxHp : 60;
      if (t % 240 === 0) b.launchT = t;
      b.g.player.x = 150 + Math.cos(t * 0.02) * 130;
      b.g.player.y = 112 + Math.sin(t * 0.03) * 80;
      b.layout();
    },
  },
};
