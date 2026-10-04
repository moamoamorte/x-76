// Bits and power-up items in 3D, built with the enemy kit: each is a few
// instanced pieces, re-posed from game state each frame, drawn in the ship's
// pass so they stay over the terrain. Crystals and shield cells glow from a
// halo set behind them. Original designs.
import * as THREE from '../../vendor/three.module.js';
import { Piece } from './enemies/kit.js';
import { createEnemyLayer } from './enemies/index.js';
import { rgb } from './effects.js';
import { LASER_HUE, CRYSTAL_COLORS } from '../items.js';
import { glyph } from '../font.js';

const TAU = Math.PI * 2;

// A ring of n flat bars, radius r, in the XY plane. `of` bars are kept,
// starting at angle 0, for an open arc.
function bars(piece, r, n, w, d, color, o = {}, of = n) {
  const len = 2 * r * Math.sin(Math.PI / n) + w * 0.4;
  const rr = r * Math.cos(Math.PI / n);
  for (let i = 0; i < of; i++) {
    const a = ((i + 0.5) * TAU) / n;
    piece.box(w, len, d, color, { ...o, at: [Math.cos(a) * rr, Math.sin(a) * rr, o.z || 0], rot: [0, 0, a] });
  }
  return piece;
}

// A letter from the HUD font as raised bars on the 5x7 grid, centred, at depth z.
function letter(piece, ch, z, color) {
  const W = 1, D = 0.8;
  for (const { dot, pts } of glyph(ch)) {
    if (dot) {
      piece.box(1.5, 1.5, D, color, { glow: true, at: [pts[0][0] - 2, 3 - pts[0][1], z] });
      continue;
    }
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = ay - by;
      piece.box(Math.hypot(dx, dy) + W, W, D, color, {
        glow: true,
        at: [(ax + bx) / 2 - 2, 3 - (ay + by) / 2, z],
        rot: [0, 0, Math.atan2(dy, dx)],
      });
    }
  }
  return piece;
}

const still = { init: (o = {}) => ({ x: 0, y: 0, t: 0, ...o }), step() {} };

// Bit: a violet hexagonal gem in a thin octagonal ring that wobbles round it.
const bit = {
  cap: 2,
  front: true,
  pieces() {
    const core = new Piece();
    core.post(0, 4.2, 4, 6, 0xc070ff, { at: [0, 2, 0] })
      .post(4.2, 0, 4, 6, 0x7a3ab0, { at: [0, -2, 0] });
    const ring = bars(new Piece(), 7.2, 8, 0.9, 0.7, 0xe0b0ff, { glow: true, outline: 0.2 });
    return { core, ring };
  },
  draw(e, P, X) {
    const M = X.at(e.x, e.y);
    M.push().rx(0.35).ry(e.t * 0.06);
    P.core.put(M.m);
    M.pop().rz(-e.t * 0.05).rx(1.25);
    P.ring.put(M.m);
  },
  demo: still,
};

// Laser crystal: a square bipyramid in the laser's hue, bright above and dark
// below, turning on its long axis, with a halo behind it. Its colour cycles,
// so there's one piece per colour.
const HALO = {};
for (const k of CRYSTAL_COLORS) HALO[k] = rgb(LASER_HUE[k].glow);
const crystal = {
  cap: 8,
  front: true,
  halo: 1,
  pieces() {
    const P = {};
    for (const k of CRYSTAL_COLORS) {
      const hue = LASER_HUE[k];
      P[k] = new Piece()
        .post(0, 5.5, 7, 4, hue.glow, { at: [0, 4.5, 0] })
        .post(5.5, 5.5, 2, 4, hue.core, { glow: true, outline: 0.3 })
        .post(5.5, 0, 7, 4, hue.dark, { at: [0, -4.5, 0] });
    }
    return P;
  },
  draw(e, P, X) {
    const color = e.color;
    const M = X.at(e.x, e.y).rx(0.25).ry(e.t * 0.08);
    P[color].put(M.m);
    const m = M.m.elements;
    X.halo?.put(m[12], -m[13], 0, 15, 15, HALO[color], 0.6 + Math.sin(e.t * 0.2) * 0.2);
  },
  demo: {
    init: () => ({ x: 0, y: 0, t: 0, color: 'red' }),
    step(e) { e.color = CRYSTAL_COLORS[Math.floor(e.t / 110) % 3]; },
  },
};

// Shield cell: a hexagonal cell with a white cross, a slowly turning rim and
// a teal halo; it rocks gently so its depth shows.
const CELL_HALO = rgb('#3fd8cb');
const cell = {
  cap: 8,
  front: true,
  halo: 1,
  pieces() {
    const body = new Piece();
    body.disc(8.5, 4, 6, 0x2a8a84, { rot: [0, 0, Math.PI / 6] })
      .disc(6.6, 1.2, 6, 0x0e4a4a, { at: [0, 0, 2.2], rot: [0, 0, Math.PI / 6] })
      .box(2, 8, 1, 0xe8fffb, { glow: true, at: [0, 0, 3] })
      .box(8, 2, 1, 0xe8fffb, { glow: true, at: [0, 0, 3] });
    const rim = bars(new Piece(), 7.4, 6, 1.2, 1, 0x6af0e0, { glow: true, z: 2.6 });
    return { body, rim };
  },
  draw(e, P, X) {
    const M = X.at(e.x, e.y).rx(0.2).ry(Math.sin(e.t * 0.03) * 0.45);
    P.body.put(M.m);
    const m = M.m.elements;
    X.halo?.put(m[12], -m[13], 0, 14, 14, CELL_HALO, 0.45 + Math.sin(e.t * 0.2) * 0.15);
    M.rz(-e.t * 0.03);
    P.rim.put(M.m);
  },
  demo: still,
};

// Letter pods (speed, missile, bit): an octagonal capsule in the power-up's
// colour with its letter raised on the face and an open rim arc turning
// round it. The letter rocks a little but never turns edge-on.
function letterPod(dark, light, ch) {
  return {
    cap: 8,
    front: true,
    pieces() {
      const turn = { rot: [0, 0, Math.PI / 8] };
      const body = new Piece();
      body.disc(8.2, 5, 8, dark, turn)
        .disc(6.4, 1.2, 8, new THREE.Color(dark).multiplyScalar(0.55).getHex(), { ...turn, at: [0, 0, 2.8] });
      letter(body, ch, 3.6, 0xffffff);
      const arc = bars(new Piece(), 7.4, 8, 1.1, 1, light, { glow: true, z: 3 }, 6);
      return { body, arc };
    },
    draw(e, P, X) {
      const M = X.at(e.x, e.y).rx(0.2).ry(Math.sin(e.t * 0.04) * 0.35);
      P.body.put(M.m);
      M.rz(-e.t * 0.1);
      P.arc.put(M.m);
    },
    demo: still,
  };
}

export const PICKUPS = {
  bit,
  crystal,
  cell,
  speed: letterPod(0x2a5ab8, 0x6ab0ff, 'S'),
  missile: letterPod(0x248a44, 0x6aff9a, 'M'),
  bitpod: letterPod(0x7a3ab0, 0xd08aff, 'B'),
};

// PowerItem.type -> model.
const ITEM = { crystal: 'crystal', shield: 'cell', speed: 'speed', missile: 'missile', bit: 'bitpod' };

export function createPickups() {
  const layer = createEnemyLayer({ specs: PICKUPS });
  return {
    group: layer.front,
    set visible(on) { layer.visible = on; },
    // cam: the device-snapped camera the terrain and enemies use.
    update(game, cam) {
      layer.begin(cam);
      const items = game.items, bits = game.bits;
      for (let i = 0; i < items.length; i++) layer.draw(ITEM[items[i].type], items[i]);
      for (let i = 0; i < bits.length; i++) layer.draw('bit', bits[i]);
      layer.end();
    },
  };
}
