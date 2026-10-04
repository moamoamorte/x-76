// Terrain-mounted enemies: the gun turret and the larva hatch. Both are built
// for a floor and flipped upside down for a ceiling. Their bases reach back
// over the top face of the block they sit on, so they look seated on it.
import * as THREE from '../../../vendor/three.module.js';
import { Piece, E } from './kit.js';

// Gun turret: a six-sided housing on a foot plate; the barrel turns on a pivot
// at the housing's centre, where the game aims and fires from.
export const turret = {
  cap: 16,
  pieces() {
    const base = new Piece();
    base.box(16, 2.4, 13, E.dark, { at: [0, -1.9, -2] })
      .box(12, 1, 10, E.plate, { at: [0, -0.3, -2] })
      .post(4.2, 6.4, 5.6, 6, E.steel, { at: [0, 2.2, 0] })
      .gem(0.9, E.amber, { glow: true, at: [0, 1.2, 5.6] });
    for (const x of [-6.5, 6.5]) base.box(1.6, 0.8, 0.4, E.amber, { glow: true, at: [x, -1.9, 4.6] });

    const barrel = new Piece();
    barrel.box(4.4, 3.8, 4.4, E.plate, { at: [0.6, 0, 0] })
      .prism(1.0, 1.4, 8, 6, E.light, { at: [5, 0, 0] })
      .box(1.6, 2.6, 2.6, E.dark, { at: [8.6, 0, 0] })
      .gem(0.9, E.red, { glow: true, at: [9.8, 0, 0] });
    return { base, barrel };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const M = X.at(e.x, e.y).ry(-0.3);
    // Flipped about X, a local angle comes out mirrored, so a ceiling mount
    // takes the game's screen angle as is and a floor mount negates it.
    if (!e.up) M.rx(Math.PI);
    P.base.put(M.m, f);
    M.t(0, 0.5, 0).rz(e.up ? -e.a : e.a);
    P.barrel.put(M.m, f);
  },
  demo: {
    init: () => ({ x: 0, y: 0, t: 0, up: true, a: -Math.PI / 2 }),
    step(e) {
      e.up = Math.floor(e.t / 360) % 2 === 0;
      e.a = (e.up ? -1 : 1) * (Math.PI / 2 + Math.sin(e.t * 0.02) * 1.3);
    },
  },
};

// Larva hatch: a faceted dome split into two doors over a glowing pit. The
// doors swing outward on hinges at the rim; the pit lights up as they open.
export const hatch = {
  cap: 6,
  pieces() {
    const base = new Piece();
    for (const x of [-10.5, 10.5]) base.box(5, 2.2, 16, E.dark, { at: [x, 1.1, -3] });
    base.box(16, 1.2, 1.5, E.dark, { at: [0, 0.6, 4.2] })
      .box(16, 2.2, 2, E.dark, { at: [0, 1.1, -10] })
      .box(16, 0.6, 14, E.black, { at: [0, 0.3, -3] });
    for (const x of [-10, 10]) base.box(1.8, 0.8, 0.4, E.amber, { glow: true, at: [x, 1.2, 5.1] });

    const maw = new Piece();
    maw.gem(3.6, E.red, { glow: true, scale: [1.3, 0.7, 1.3] })
      .gem(1.8, 0xffd080, { glow: true, at: [0, 0.6, 0] });

    // One half of the dome, hinged at its outer edge (the origin), +X half
    // shifted so it spans x -11..0. The left door is the same piece turned round.
    const door = new Piece({ per: 2 });
    const shell = new THREE.SphereGeometry(11, 3, 2, Math.PI / 2, Math.PI, 0, Math.PI / 2);
    door.add(shell, E.steel, { at: [-11, 0, 0], scale: [1, 0.9, 1] });
    const cut = [];
    for (let i = 0; i <= 4; i++) {
      const th = (i * Math.PI) / 4;
      cut.push([-Math.cos(th) * 11, Math.sin(th) * 11]);
    }
    // The flat inner face, so an open door isn't hollow.
    door.plate(cut, 0.8, E.dark, { at: [-10.6, 0, 0], rot: [0, -Math.PI / 2, 0], scale: [1, 0.9, 1] });
    return { base, maw, door };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const M = X.at(e.x, e.surf).ry(-0.25);
    if (!e.up) M.rx(Math.PI);
    P.base.put(M.m, f);
    const k = e.open, o = k * 4, swing = -k * 1.0;
    M.push().t(0, 1.4, -1).s(0.3 + k).ry(e.t * 0.05);
    P.maw.put(M.m, 0);
    M.pop();
    M.push().t(11 + o, 0.6).rz(swing);
    P.door.put(M.m, f);
    M.pop();
    M.t(-11 - o, 0.6).ry(Math.PI).rz(swing);
    P.door.put(M.m, f);
  },
  demo: {
    init: () => ({ x: 0, y: 0, surf: 0, t: 0, up: true, open: 0, cyc: 40 }),
    step(e) {
      const c = ++e.cyc % 180;
      e.open += ((c > 100 && c < 150 ? 1 : 0) - e.open) * 0.15;
    },
  },
};
