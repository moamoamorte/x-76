// Stage terrain as 3D geometry, built from the collision grid. Every block's
// front face sits exactly on its tiles at z = 0, so what you see is what you
// hit; the blocks recede into -z, and the perspective camera in render3d.js
// shows their exposed top, bottom and side faces. Gameplay never reads this.
import * as THREE from '../../vendor/three.module.js';
import { mulberry32 } from '../util.js';
import { TILE, ROWS, HULL, ORGANIC, MACHINE } from '../terrain.js';
import { toonRamp } from './materials.js';
import { Builder, C } from './geom.js';

export const DEPTH = 28;       // how far the blocks recede
const CH = 1.25;               // chamfer on exposed front edges
const CHUNK = 64;              // columns per chunk (512px)
const DETAIL_Z = 0.08;         // decals sit just in front of the face they mark
const INK = 0x10121a;
// The scene's lights push a front face's lit band past its base colour; these
// pull fronts and receding faces back to the old 2D terrain's brightness.
const FRONT_K = 0.8, SIDE_K = 0.7;

// Front-face colour by depth into the block (1 = surface), plus the colours
// for bevels, receding faces, decals and lights. Muted versions of the old 2D
// terrain palette, so the three tile types stay distinguishable.
const PAL = {
  [HULL]: { d: [0x7d90b2, 0x5d6d8e, 0x46536e, 0x343e54, 0x272e40], bevel: 0xaebfdc, side: 0x5a6a8a, seam: 0x1c2232, lit: 0xa0b2d0 },
  [MACHINE]: { d: [0x7a828f, 0x5a616d, 0x444a55, 0x33373f, 0x262930], bevel: 0xb2bac6, side: 0x5c626e, seam: 0x17191e, lit: 0x9aa2b0 },
  [ORGANIC]: { d: [0x96566f, 0x763f58, 0x582d42, 0x3f2031, 0x2f1724], bevel: 0xd090a8, side: 0x7a4560, seam: 0x1e0c16, lit: 0xb87090 },
};
const LIGHTS = [0xff5a3a, 0x4affc0, 0xffd24a];
const VEIN = 0xb0304a;

const S2 = Math.SQRT1_2;

export function createTerrain3D(terrain) {
  const group = new THREE.Group();
  const solid = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const ink = new THREE.LineBasicMaterial({ color: INK });
  const chunks = [];

  for (let c0 = 0; c0 < terrain.cols; c0 += CHUNK) {
    const c1 = Math.min(terrain.cols, c0 + CHUNK);
    const { body, lights, lines } = buildChunk(terrain, c0, c1);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(body.geometry(), solid));
    if (!lights.empty) g.add(new THREE.Mesh(lights.geometry(), glow));
    if (lines.length) {
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
      g.add(new THREE.LineSegments(lg, ink));
    }
    g.userData.x0 = c0 * TILE;
    g.userData.x1 = c1 * TILE;
    group.add(g);
    chunks.push(g);
  }

  return {
    group,
    // Scroll to the (device-snapped) camera and hide chunks well off screen.
    update(cam, w) {
      group.position.x = -cam;
      for (const g of chunks) g.visible = g.userData.x1 > cam - 64 && g.userData.x0 < cam + w + 64;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      solid.dispose(); glow.dispose(); ink.dispose();
    },
  };
}

function buildChunk(t, c0, c1) {
  const body = new Builder(DETAIL_Z), lights = new Builder(DETAIL_Z), lines = [];
  // Off the top and bottom of the grid counts as solid, so the screen edges
  // never get faces; off either end counts as open.
  const solidAt = (c, r) => (r < 0 || r >= ROWS ? true : t.get(c, r) !== 0);
  const line = (a, b) => lines.push(...a, ...b);

  for (let c = c0; c < c1; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = t.get(c, r);
      if (!v) continue;
      const pal = PAL[v];
      const d = Math.min(5, t.depth[c * ROWS + r]);
      const rng = mulberry32(90210 + c * ROWS + r);
      const x0 = c * TILE, x1 = x0 + TILE, yT = -r * TILE, yB = yT - TILE;
      const up = !solidAt(c, r - 1), dn = !solidAt(c, r + 1);
      const lf = !solidAt(c - 1, r), rt = !solidAt(c + 1, r);

      // Front face, inset on exposed edges to make room for the chamfers.
      const fx0 = lf ? x0 + CH : x0, fx1 = rt ? x1 - CH : x1;
      const fyT = up ? yT - CH : yT, fyB = dn ? yB + CH : yB;
      body.quad([fx0, fyB, 0], [fx1, fyB, 0], [fx1, fyT, 0], [fx0, fyT, 0], [0, 0, 1], C(pal.d[d - 1], FRONT_K));

      // Chamfers: mitred where two exposed edges meet, so corners close up.
      const bev = C(pal.bevel), side = C(pal.side, SIDE_K);
      const z = -CH, zb = -DEPTH;
      if (up) {
        body.quad([fx0, fyT, 0], [fx1, fyT, 0], [x1, yT, z], [x0, yT, z], [0, S2, S2], bev);
        body.quad([x0, yT, z], [x1, yT, z], [x1, yT, zb], [x0, yT, zb], [0, 1, 0], side);
        line([x0, yT, z], [x1, yT, z]);
        line([x0, yT, zb], [x1, yT, zb]);
      }
      if (dn) {
        body.quad([x0, yB, z], [x1, yB, z], [fx1, fyB, 0], [fx0, fyB, 0], [0, -S2, S2], bev);
        body.quad([x0, yB, zb], [x1, yB, zb], [x1, yB, z], [x0, yB, z], [0, -1, 0], side);
        line([x0, yB, z], [x1, yB, z]);
        line([x0, yB, zb], [x1, yB, zb]);
      }
      if (lf) {
        body.quad([x0, yB, z], [fx0, fyB, 0], [fx0, fyT, 0], [x0, yT, z], [-S2, 0, S2], bev);
        body.quad([x0, yB, zb], [x0, yB, z], [x0, yT, z], [x0, yT, zb], [-1, 0, 0], side);
        line([x0, yB, z], [x0, yT, z]);
        line([x0, yB, zb], [x0, yT, zb]);
      }
      if (rt) {
        body.quad([fx1, fyB, 0], [x1, yB, z], [x1, yT, z], [fx1, fyT, 0], [S2, 0, S2], bev);
        body.quad([x1, yB, z], [x1, yB, zb], [x1, yT, zb], [x1, yT, z], [1, 0, 0], side);
        line([x1, yB, z], [x1, yT, z]);
        line([x1, yB, zb], [x1, yT, zb]);
      }
      // Receding edges at convex corners.
      if (up && lf) line([x0, yT, z], [x0, yT, zb]);
      if (up && rt) line([x1, yT, z], [x1, yT, zb]);
      if (dn && lf) line([x0, yB, z], [x0, yB, zb]);
      if (dn && rt) line([x1, yB, z], [x1, yB, zb]);

      if (v === ORGANIC) organicDetail(body, rng, pal, d, { x0: fx0, x1: fx1, yT: fyT, yB: fyB }, up, dn, x0, yT, yB);
      else hullDetail(body, lights, rng, pal, d, c, r, x0, yT, { x0: fx0, x1: fx1, yT: fyT, yB: fyB });
    }
  }
  return { body, lights, lines };
}

// Panel seams, vents, rivets and indicator lights, placed by the same rules
// (and the same per-tile seeds) as the old 2D art.
function hullDetail(b, lights, rng, pal, d, c, r, x0, yT, face) {
  const seam = C(pal.seam), lit = C(pal.lit);
  if (d >= 2) {
    // An engraved seam: a dark line with a lit edge beside it.
    if (c % 3 === 0) {
      b.rect(x0, face.yB, x0 + 0.5, face.yT, seam);
      b.rect(x0 + 0.5, face.yB, x0 + 1, face.yT, lit);
    }
    if (r % 2 === 0) {
      b.rect(face.x0, yT - 0.5, face.x1, yT, seam);
      b.rect(face.x0, yT - 1, face.x1, yT - 0.5, lit);
    }
  }
  if (d === 2 && rng() < 0.1) {
    for (let k = 0; k < 3; k++) b.rect(x0 + 1, yT - 2.5 - k * 2, x0 + 7, yT - 3.5 - k * 2, seam);
  }
  if (d === 3 && rng() < 0.06) {
    const col = LIGHTS[Math.floor(rng() * 3)];
    lights.rect(x0 + 3, yT - 5, x0 + 5, yT - 3, C(col), DETAIL_Z * 2);
  }
  if (d === 1 && rng() < 0.25) {
    // Rivets: tiny faceted studs rather than flat dots.
    for (const rx of [x0 + 2.5, x0 + 5.5]) stud(b, rx, yT - 4.5, 0.6, seam, lit);
  }
}

function stud(b, x, y, s, dark, light) {
  const z0 = DETAIL_Z, z1 = DETAIL_Z + s;
  const tip = [x, y, z1];
  b.tri([x - s, y + s, z0], [x - s, y - s, z0], tip, [-S2, 0, S2], light);
  b.tri([x - s, y - s, z0], [x + s, y - s, z0], tip, [0, -S2, S2], dark);
  b.tri([x + s, y - s, z0], [x + s, y + s, z0], tip, [S2, 0, S2], dark);
  b.tri([x + s, y + s, z0], [x - s, y + s, z0], tip, [0, S2, S2], light);
}

function organicDetail(b, rng, pal, d, face, up, dn, x0, yT, yB) {
  if (rng() < 0.45) {
    // Blotches as low octagons, kept inside the face so they never hang over open space.
    const rad = Math.min(1.5 + rng() * 2.5, (face.x1 - face.x0) / 2, (face.yT - face.yB) / 2);
    const cx = Math.min(face.x1 - rad, Math.max(face.x0 + rad, x0 + rng() * 8));
    const cy = Math.min(face.yT - rad, Math.max(face.yB + rad, yT - rng() * 8));
    const col = C(pal.d[Math.max(0, d - 2)]);
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      b.tri([cx, cy, DETAIL_Z], [cx + Math.cos(a0) * rad, cy + Math.sin(a0) * rad, DETAIL_Z],
        [cx + Math.cos(a1) * rad, cy + Math.sin(a1) * rad, DETAIL_Z], [0, 0, 1], col);
    }
  }
  if (rng() < 0.12) {
    // A vein across the tile: two straight runs through a random midpoint.
    const ya = yT - rng() * 8, ym = yT - rng() * 8, yb = yT - rng() * 8;
    const clampY = (y) => Math.min(face.yT - 0.4, Math.max(face.yB + 0.4, y));
    const pts = [[face.x0, clampY(ya)], [x0 + 4, clampY(ym)], [face.x1, clampY(yb)]];
    for (let i = 0; i < 2; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      b.quad([ax, ay - 0.3, DETAIL_Z], [bx, by - 0.3, DETAIL_Z], [bx, by + 0.3, DETAIL_Z], [ax, ay + 0.3, DETAIL_Z], [0, 0, 1], C(VEIN));
    }
  }
  // Spikes: small pyramids standing on exposed top and bottom faces.
  if (up && rng() < 0.35) spike(b, x0 + 1 + rng() * 5, yT, 1, pal);
  if (dn && rng() < 0.35) spike(b, x0 + 1 + rng() * 5, yB, -1, pal);
}

function spike(b, x, y, dir, pal) {
  const h = 3.5 * dir, zf = -CH - 0.2, zk = -CH - 4;
  const l = [x, y, zf], rr = [x + 3, y, zf], back = [x + 1.5, y, zk], tip = [x + 1.5, y + h, (zf + zk) / 2];
  const lit = C(pal.bevel), mid = C(pal.d[0]), dark = C(pal.d[2]);
  // Winding flips with direction so the faces stay outward.
  if (dir > 0) {
    b.tri(l, rr, tip, [0, 0.3, 0.95], mid);
    b.tri(rr, back, tip, [0.9, 0.3, -0.3], dark);
    b.tri(back, l, tip, [-0.9, 0.3, -0.3], lit);
  } else {
    b.tri(rr, l, tip, [0, -0.3, 0.95], dark);
    b.tri(back, rr, tip, [0.9, -0.3, -0.3], dark);
    b.tri(l, back, tip, [-0.9, -0.3, -0.3], mid);
  }
}

