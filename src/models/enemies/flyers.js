// Free-flying enemies: the Whirler drone, the Dart interceptor and the Porter
// cargo walker. Original designs.
import * as THREE from '../../../vendor/three.module.js';
import { Piece, E } from './kit.js';

const TAU = Math.PI * 2;
const LEFT = Math.PI + 0.3;   // yaw for a model facing left, turned to show its flank

// Whirler: a hex hub with an amber core and three swept blades, spinning
// face-on to the camera.
export const drifter = {
  cap: 32,
  pieces() {
    const body = new Piece();
    body.disc(3.4, 4, 6, E.plate)
      .disc(2.3, 1.2, 6, E.dark, { at: [0, 0, 2.4] })
      .gem(1.5, E.amber, { glow: true, at: [0, 0, 3.1] });
    for (let i = 0; i < 3; i++) {
      const a = (i * TAU) / 3;
      body.plate([[2.6, -1.5], [8.2, -0.7], [8.7, 1.0], [2.6, 1.7]], 1.1, E.steel, { rot: [0, 0, a] });
      body.box(1.3, 1.3, 1.5, E.red, { glow: true, at: [Math.cos(a) * 8.4, Math.sin(a) * 8.4, 0], rot: [0, 0, a] });
    }
    return { body };
  },
  draw(e, P, X) {
    const M = X.at(e.x, e.y).rx(0.3).ry(-0.35).rz(e.t * 0.22);
    P.body.put(M.m, e.flash > 0 ? 1 : 0);
  },
  demo: { init: () => ({ x: 0, y: 0, t: 0 }), step() {} },
};

// Dart: a flat arrowhead with a raised spine, crossed tail fins and a hot
// exhaust, always pointing along its flight path.
export const dart = {
  cap: 12,
  pieces() {
    const body = new Piece();
    body.plate([[8, 0], [-5, 5], [-3, 0], [-5, -5]], 1.4, E.steel)
      .prism(0.6, 1.8, 10, 6, E.light, { at: [1.5, 0, 0] })
      .gem(1.3, E.red, { glow: true, at: [3, 0, 1.3] })
      .plate([[-0.5, 0], [-5, 0], [-6, 2.8], [-3.6, 2.8]], 0.8, E.plate, { rot: [Math.PI / 2, 0, 0] })
      .plate([[-0.5, 0], [-5, 0], [-6, 2.8], [-3.6, 2.8]], 0.8, E.plate, { rot: [-Math.PI / 2, 0, 0] })
      .box(1.4, 2.6, 2.6, E.dark, { at: [-4.4, 0, 0] })
      .box(1.2, 1.6, 1.6, E.hot, { glow: true, at: [-5.4, 0, 0] });
    return { body };
  },
  draw(e, P, X) {
    const M = X.at(e.x, e.y).rz(-Math.atan2(e.vy, e.vx)).rx(0.5);
    P.body.put(M.m, e.flash > 0 ? 1 : 0);
  },
  demo: {
    init: () => ({ x: 0, y: 0, t: 0, vx: -2.2, vy: 0 }),
    step(e) {
      const a = Math.PI + Math.sin(e.t * 0.02) * 0.9;
      e.vx = Math.cos(a);
      e.vy = Math.sin(a);
    },
  },
};

// Porter: an armoured cargo box on two stilt legs, carrying a glowing canister
// in its back clamps whose colour tells you what it will drop.
const DROP = {
  crystal: new THREE.Color(0xff6a3a), speed: new THREE.Color(0x6ab0ff), missile: new THREE.Color(0x6aff9a),
  bit: new THREE.Color(0xd08aff), shield: new THREE.Color(0x6af0e0),
};
export const carrier = {
  cap: 6,
  pieces() {
    const body = new Piece();
    body.box(20, 10, 11, E.plate)
      .box(18, 2, 10, E.light, { at: [0, 5.6, 0] })
      .box(21, 3, 12, E.dark, { at: [0, -4.2, 0] })
      .box(3, 6, 9, E.steel, { at: [11, 0.5, 0] })
      .box(1, 2.4, 6, E.red, { glow: true, at: [12.6, 1.5, 0] })
      .box(1.6, 4.5, 7, E.dark, { at: [-8.2, 8.5, 0] })
      .box(1.6, 4.5, 7, E.dark, { at: [2.2, 8.5, 0] });
    for (let i = 0; i < 4; i++)
      for (const z of [5.6, -5.6]) body.box(2.4, 1.4, 0.6, E.amber, { glow: true, at: [-7.5 + i * 5, -0.8, z] });

    const leg = new Piece({ per: 2 });
    leg.box(2.2, 1.8, 2.4, E.dark, { at: [0, -0.4, 0] })
      .box(1.6, 4.6, 1.6, E.steel, { at: [0, -2.8, 0] })
      .gem(1.1, E.dark, { at: [0, -5, 0] })
      .box(1.4, 4.4, 1.4, E.plate, { at: [-0.75, -7.1, 0], rot: [0, 0, -0.35] })
      .box(3.2, 1, 2, E.dark, { at: [-1.4, -9.4, 0] });

    // Painted white so the per-instance tint is the colour you see.
    const cargo = new Piece({ tint: true });
    cargo.disc(3.4, 7, 6, 0xffffff, { glow: true, outline: 0.4 })
      .disc(3.9, 1, 6, 0x5a5a5a, { at: [0, 0, 2] })
      .disc(3.9, 1, 6, 0x5a5a5a, { at: [0, 0, -2] });
    return { body, leg, cargo };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const M = X.at(e.x, e.y).rx(0.2).ry(LEFT);
    P.body.put(M.m, f);
    const ph = e.t * 0.15;
    for (let k = 0; k < 2; k++) {
      M.push().t(k ? 4 : -4, -5, k ? -3.5 : 3.5).rz(Math.sin(ph + k * Math.PI) * 0.4);
      P.leg.put(M.m, f);
      M.pop();
    }
    M.t(-3, 9.5, 0).s(1 + Math.sin(e.t * 0.2) * 0.06).rz(e.t * 0.03);
    P.cargo.put(M.m, f, DROP[e.drop] || DROP.crystal);
  },
  demo: {
    init: () => ({ x: 0, y: 0, t: 0, drop: 'crystal' }),
    step(e) {
      const kinds = Object.keys(DROP);
      e.drop = kinds[Math.floor(e.t / 180) % kinds.length];
    },
  },
};
