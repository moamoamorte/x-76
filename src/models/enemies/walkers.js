// Floor walkers: the leaping Hopper and the heavy Bulwark crawler. Their legs
// are separate pieces posed hip to knee to foot each frame.
import { Piece, E, aimDown } from './kit.js';

const LEFT = Math.PI + 0.3;
const lerp = (a, b, k) => a + (b - a) * k;

// Hopper: a six-sided shell on two jointed legs, its red eye turned toward
// the player. Grounded it crouches; in the air the legs straighten.
const HL = 4.4;   // thigh and shin length
// Leg angles from straight down for the front leg, crouched and stretched,
// matching the old sprite's hip (3,2), knee (7,4), foot (5,8) and its jump pose.
const CROUCH = { thigh: aimDown(4, -2), shin: aimDown(-2, -4) };
const STRETCH = { thigh: aimDown(1, -4), shin: 0 };
export const hopper = {
  cap: 6,
  pieces() {
    const body = new Piece();
    body.prism(3.0, 4.6, 11, 6, E.plate, { at: [0, 0.8, 0], scale: [1, 0.85, 1] })
      .box(9, 1.4, 6.5, E.light, { at: [-0.5, 4.6, 0] })
      .box(3.4, 3.2, 4.2, E.dark, { at: [5.8, 0.4, 0] })
      .box(0.8, 1.2, 3.0, E.red, { glow: true, at: [7.6, 0.8, 0] })
      .box(3, 2, 8.6, E.dark, { at: [0, -2.2, 0] });
    const thigh = new Piece({ per: 2 });
    thigh.box(1.8, HL, 1.8, E.steel, { at: [0, -HL / 2, 0] }).gem(1.2, E.dark, { at: [0, -HL, 0] });
    const shin = new Piece({ per: 2 });
    shin.box(1.5, HL, 1.5, E.plate, { at: [0, -HL / 2, 0] }).box(3.6, 1, 2.4, E.dark, { at: [0.4, -HL - 0.2, 0] });
    return { body, thigh, shin };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const face = e.g.player.x < e.x ? -1 : 1;
    const M = X.at(e.x, e.y).rx(0.2).ry(face > 0 ? -0.3 : LEFT);
    P.body.put(M.m, f);
    // Falling, the legs start reaching for the landing.
    const k = e.ground ? 1 : Math.min(0.6, Math.max(0, e.vy * 0.25));
    const th = lerp(STRETCH.thigh, CROUCH.thigh, k), sh = lerp(STRETCH.shin, CROUCH.shin, k);
    for (let s = -1; s <= 1; s += 2) {
      M.push().t(3 * s, -2, 3.6 * s).rz(th * s);
      P.thigh.put(M.m, f);
      M.t(0, -HL).rz((sh - th) * s);
      P.shin.put(M.m, f);
      M.pop();
    }
  },
  demo: {
    init: () => ({ x: 0, y: 0, t: 0, ground: true, wait: 40, vy: 0, g: { player: { x: -100 } } }),
    step(e) {
      if (e.ground) {
        if (--e.wait <= 0) { e.ground = false; e.vy = -3.3; }
        return;
      }
      e.vy += 0.11;
      e.y += e.vy;
      if (e.y >= 0) { e.y = 0; e.vy = 0; e.ground = true; e.wait = 50; e.g.player.x *= -1; }
    },
  },
};

// Bulwark: a six-sided armoured hull on a wide chassis, twin cannon and a
// red sensor slit at the front, walking on four legs.
const BL = { thigh: 5.6, shin: 7.2 };
const LEGS = [-12, -4, 4, 12];
export const bulwark = {
  cap: 2,
  pieces() {
    const body = new Piece({ outline: 0.45 });
    body.box(36, 5, 17, E.dark, { at: [0, -2.5, 0] })
      .prism(10, 12, 34, 6, E.plate, { at: [0, 0.5, 0], scale: [1, 0.95, 0.75] });
    for (const x of [-10, 0, 10]) body.box(3, 2, 14, E.steel, { at: [x, 10.4, 0] });
    body.box(9, 2.6, 7, E.light, { at: [-3, 11.8, 0] })
      .box(1, 2.6, 9, E.red, { glow: true, at: [17.3, 3.2, 0] })
      .box(14, 4, 5, E.steel, { at: [19, -1, 0] })
      .box(10, 3, 4, E.plate, { at: [19, 7.5, 0] })
      .box(1, 2.4, 3, E.red, { glow: true, at: [26.4, -1, 0] })
      .box(1, 1.8, 2.4, E.red, { glow: true, at: [24.4, 7.5, 0] });
    for (const x of [-12, 12]) body.box(6, 3, 18, E.plate, { at: [x, -4, 0] });

    const thigh = new Piece({ per: 4, outline: 0.4 });
    thigh.box(2.6, BL.thigh, 2.6, E.steel, { at: [0, -BL.thigh / 2, 0] }).gem(1.8, E.dark, { at: [0, -BL.thigh, 0] });
    const shin = new Piece({ per: 4, outline: 0.4 });
    shin.box(2.2, BL.shin, 2.2, E.plate, { at: [0, -BL.shin / 2, 0] }).box(5, 1.4, 3.4, E.dark, { at: [0, -BL.shin - 0.3, 0] });
    return { body, thigh, shin };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const M = X.at(e.x, e.y).rx(0.15).ry(LEFT);
    P.body.put(M.m, f);
    // The old sprite's leg layout, mirrored because the model faces left:
    // hip, knee and foot per leg, the knee and foot lifting in turn.
    const wt = e.walkT * 0.12;
    for (let j = 0; j < 4; j++) {
      const i = LEGS[j], z = j % 2 ? -7 : 7;
      const lift = Math.max(0, Math.sin(wt + i)) * 3;
      const hx = -0.7 * i, hy = -4, kx = -1.3 * i, ky = -9 + lift, fx = -1.5 * i, fy = -16 + lift * 0.5;
      M.push().t(hx, hy, z).rz(aimDown(kx - hx, ky - hy)).s(1, Math.hypot(kx - hx, ky - hy) / BL.thigh, 1);
      P.thigh.put(M.m, f);
      M.pop();
      M.push().t(kx, ky, z).rz(aimDown(fx - kx, fy - ky)).s(1, Math.hypot(fx - kx, fy - ky) / BL.shin, 1);
      P.shin.put(M.m, f);
      M.pop();
    }
  },
  demo: { init: () => ({ x: 0, y: 0, t: 0, walkT: 0 }), step(e) { e.walkT++; } },
};
