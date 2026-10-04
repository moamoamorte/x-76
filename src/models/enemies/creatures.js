// Organic enemies: the Larva grub and the armoured Coil Wyrm. Both are chains
// of segments, so each segment is one instance of a shared piece.
import { Piece, E } from './kit.js';

const G = { light: 0xa4dc78, mid: 0x76b058, dark: 0x35562e };
const W = { skull: 0xb89aa8, plate: 0x9a7a8a, dark: 0x3a2240, crest: 0x6a4a5a, fang: 0xe0c8d0 };

// Larva: a faceted head with red eyes and mandibles, trailing three shrinking
// segments that wriggle as it homes in.
export const larva = {
  cap: 48,
  pieces() {
    const head = new Piece({ outline: 0.3 });
    head.gem(3.4, G.light, { scale: [1.25, 0.85, 0.9] });
    for (const z of [1.2, -1.2]) {
      head.gem(1.0, E.red, { glow: true, at: [2.6, 0.7, z] })
        .box(2.4, 0.7, 0.7, G.dark, { at: [3.9, -0.4, z], rot: [0, z > 0 ? -0.5 : 0.5, 0] });
    }
    const seg = new Piece({ per: 3, outline: 0.3 });
    seg.prism(2.0, 2.6, 2.8, 6, G.mid).box(1.6, 1, 1.6, G.dark, { at: [0, 2.3, 0] });
    return { head, seg };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    const c = Math.cos(e.a), s = Math.sin(e.a);
    let M = X.at(e.x, e.y).rz(-e.a).rx(0.5);
    P.head.put(M.m, f);
    for (let i = 1; i <= 3; i++) {
      const w = Math.sin(e.t * 0.3 + i) * 1.5;
      M = X.at(e.x - c * i * 3 + s * w, e.y - s * i * 3 - c * w).rz(-e.a).rx(0.5).s((3 - i * 0.6) / 2.6);
      P.seg.put(M.m, f);
    }
  },
  demo: { init: () => ({ x: 0, y: 0, t: 0, a: Math.PI }), step(e) { e.a = Math.PI + Math.sin(e.t * 0.03) * 1.2; } },
};

// Coil Wyrm: a six-sided skull with snapping mandibles, then fourteen armour
// rings, spined on every other one. Symmetric top to bottom, so it needs no
// righting when it turns to swim left.
export const serpent = {
  cap: 3,
  pieces() {
    const head = new Piece({ outline: 0.4 });
    head.prism(3.6, 7.5, 16, 6, W.skull, { scale: [1, 0.85, 0.85] })
      .box(3, 2.4, 11, W.dark, { at: [-7.6, 0, 0] });
    for (const y of [5.5, -5.5]) head.box(9, 1.4, 5.5, W.crest, { at: [-2, y, 0] });
    for (const y of [2.6, -2.6]) head.gem(1.4, E.red, { glow: true, at: [4, y, 3.4] });

    // Pivot at the origin; the lower jaw is the same piece flipped.
    const jaw = new Piece({ per: 2, outline: 0.3 });
    jaw.box(5.2, 1.3, 1.6, W.fang, { at: [2.4, 0, 0] })
      .box(3.2, 1.2, 1.4, W.fang, { at: [5.6, -0.9, 0], rot: [0, 0, -0.75] });

    // Longer than the 9px the rings trail apart and narrower at the front, so
    // each one tucks into the back of the ring ahead.
    const ring = (p) => p.prism(5.0, 7, 10.5, 6, W.plate).prism(7.3, 7.3, 1.6, 6, W.dark, { at: [-4.4, 0, 0] });
    const plain = ring(new Piece({ per: 7, outline: 0.4 }));
    const spined = ring(new Piece({ per: 7, outline: 0.4 }))
      .post(0, 1.8, 4.5, 4, W.crest, { at: [0, 8.6, 0] })
      .post(0, 1.8, 4.5, 4, W.crest, { at: [0, -8.6, 0], rot: [Math.PI, 0, 0] });
    return { head, jaw, plain, spined };
  },
  draw(e, P, X) {
    const f = e.flash > 0 ? 1 : 0;
    // Tail first; each ring faces the one ahead of it. Dying, they burst from the neck back.
    for (let i = e.N - 1; i >= 0; i--) {
      if (e.dying && i < e.dying / 5) continue;
      const s = e.segs[i], ahead = i ? e.segs[i - 1] : e.head;
      const M = X.at(s.x, s.y).rz(-Math.atan2(ahead.y - s.y, ahead.x - s.x)).rx(0.35).s(s.r / 7);
      (i % 2 ? P.plain : P.spined).put(M.m, 0);
    }
    if (e.dying) return;
    const M = X.at(e.x, e.y).rz(-e.a).rx(0.35);
    P.head.put(M.m, f);
    const m = Math.sin(e.t * 0.2) * 0.4 + 0.5;
    M.push().t(5.5, 3).rz(0.1 + m * 0.5);
    P.jaw.put(M.m, f);
    M.pop();
    M.t(5.5, -3).rx(Math.PI).rz(0.1 + m * 0.5);
    P.jaw.put(M.m, f);
  },
  demo: {
    init() {
      const head = { x: 0, y: 0, r: 8 };
      const segs = Array.from({ length: 14 }, (_, i) => ({ x: 0, y: 0, r: 7 - i * 0.22 }));
      return { x: 0, y: 0, t: 0, a: 0, N: 14, dying: 0, head, segs, hist: [] };
    },
    // Swims a figure of eight at about the game's speed, so the rings space out the same.
    step(e) {
      const x = Math.sin(e.t * 0.05) * 30, y = Math.sin(e.t * 0.1) * 14;
      e.a = Math.atan2(y - e.y, x - e.x);
      e.x = e.head.x = x;
      e.y = e.head.y = y;
      e.hist.unshift({ x, y });
      if (e.hist.length > e.N * 6 + 2) e.hist.pop();
      for (let i = 0; i < e.N; i++) {
        const h = e.hist[Math.min(e.hist.length - 1, (i + 1) * 6)];
        e.segs[i].x = h.x;
        e.segs[i].y = h.y;
      }
    },
  },
};
