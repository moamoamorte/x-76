// Backdrops behind the terrain: the station's interior wall and the boss
// chamber's flesh wall, as geometry set back in -z. The perspective camera
// (render3d.js) gives them parallax for free: the deeper a layer sits, the
// slower it slides. Built once per stage from the level's BACKDROPS list.
import * as THREE from '../../vendor/three.module.js';
import { mulberry32 } from '../util.js';
import { toonRamp } from './materials.js';
import { Builder, C } from './geom.js';

const CHUNK = 512;
// Vertical span every layer covers: past the screen edges at its depth, so no
// layer's top or bottom edge ever shows through a gap in the terrain.
const Y_TOP = 70, Y_BOT = -300;
const MID = -112;   // world y of the screen's centre line

// A layer at depth z looks smaller by (camDist - z) / camDist; designs are
// written in screen-sized units and scaled up by that so they read at the old
// 2D art's size.
let grow;

// ---- station interior --------------------------------------------------------
const WALL_Z = -230, TRUSS_Z = -150, COL_Z = -110;
const ST = {
  wall: 0x0b101c, panel: 0x10172a, panelEdge: 0x1a2340, slit: 0x162038, slitLit: 0x2c4a78,
  truss: 0x1e2844, brace: 0x1a2440, col: 0x18203a, colLit: 0x26314f, colDark: 0x0c1020, lamp: 0xff6040,
};

function station(body, glow, x0, x1, rng) {
  // Back wall: bays of recessed panels with rows of slits, some lit.
  const kw = grow(WALL_Z), bay = 48 * kw, inset = 4;
  const pT = MID + 72 * kw, pB = MID - 72 * kw, wall = C(ST.wall);
  let x = x0;
  for (; x + bay <= x1 + 0.01; x += bay) {
    const l = x + 4 * kw, r = x + bay - 4 * kw;
    // The wall around the panel's opening, then the panel set into it.
    body.rect(x, Y_BOT, l, Y_TOP, wall, WALL_Z);
    body.rect(r, Y_BOT, x + bay, Y_TOP, wall, WALL_Z);
    body.rect(l, pT, r, Y_TOP, wall, WALL_Z);
    body.rect(l, Y_BOT, r, pB, wall, WALL_Z);
    recess(body, l, pT, r, pB, WALL_Z, inset, C(ST.panel), C(ST.panelEdge));
    for (let y = MID + 56 * kw; y > pB + 8; y -= 22 * kw) {
      const lit = rng() < 0.35;
      (lit ? glow : body).rect(l + 8 * kw, y, r - 8 * kw, y - 3 * kw, C(lit ? ST.slitLit : ST.slit), WALL_Z - inset + 0.2);
    }
  }
  if (x < x1) body.rect(x, Y_BOT, x1, Y_TOP, wall, WALL_Z);
  // Trusses: two rails with cross-bracing, above and below the play area.
  const kt = grow(TRUSS_Z);
  for (const ty of [26, 190]) {
    const top = MID - (ty - 112) * kt, bot = MID - (ty + 15 - 112) * kt, rail = 3 * kt;
    body.box(x0, top - rail, TRUSS_Z - 3, x1, top, TRUSS_Z, C(ST.truss), C(ST.colDark));
    body.box(x0, bot, TRUSS_Z - 3, x1, bot + rail, TRUSS_Z, C(ST.truss), C(ST.colDark));
    const step = 16 * kt, a = top - rail, b = bot + rail, w = 1.2 * kt;
    for (let x = x0; x + step <= x1 + 0.01; x += step) {
      strut(body, x, a, x + step, b, w, TRUSS_Z - 1.5, C(ST.brace));
      strut(body, x + step, a, x, b, w, TRUSS_Z - 1.6, C(ST.brace));
    }
  }
  // Columns in front of it all, each with a warning lamp.
  const kc = grow(COL_Z), cw = 14 * kc;
  for (let x = x0 + 4; x + cw <= x1; x += 96 * kc) {
    body.box(x, Y_BOT, COL_Z - 8, x + cw, Y_TOP, COL_Z, C(ST.col), C(ST.colDark));
    body.rect(x + 1 * kc, Y_BOT, x + 3 * kc, Y_TOP, C(ST.colLit), COL_Z + 0.1);
    body.rect(x + cw - 2 * kc, Y_BOT, x + cw, Y_TOP, C(ST.colDark), COL_Z + 0.1);
    const ly = MID - (100 - 112) * kc;
    glow.box(x + 6 * kc, ly - 2 * kc, COL_Z, x + 8 * kc, ly, COL_Z + 1, C(ST.lamp));
  }
}

// A panel set into a wall: a sunken face with 45-degree sides.
function recess(b, l, t, r, bt, z, d, face, edge) {
  const zi = z - d, il = l + d, ir = r - d, it = t - d, ib = bt + d;
  b.rect(il, ib, ir, it, face, zi);
  const S = Math.SQRT1_2;
  b.quad([l, t, z], [il, it, zi], [ir, it, zi], [r, t, z], [0, -S, S], edge);       // top side faces down
  b.quad([l, bt, z], [r, bt, z], [ir, ib, zi], [il, ib, zi], [0, S, S], edge);      // bottom side faces up
  b.quad([l, bt, z], [il, ib, zi], [il, it, zi], [l, t, z], [S, 0, S], edge);       // left side faces right
  b.quad([r, bt, z], [r, t, z], [ir, it, zi], [ir, ib, zi], [-S, 0, S], edge);      // right side faces left
}

// A flat diagonal bar from (xa, ya) to (xb, yb), w wide, facing +z.
function strut(b, xa, ya, xb, yb, w, z, color) {
  const dx = xb - xa, dy = yb - ya, l = Math.hypot(dx, dy);
  const nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
  const p = [[xa - nx, ya - ny], [xb - nx, yb - ny], [xb + nx, yb + ny], [xa + nx, ya + ny]];
  // Keep the winding counter-clockwise whichever way the bar slopes.
  if ((p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) < 0) p.reverse();
  b.quad(...p.map(([x, y]) => [x, y, z]), [0, 0, 1], color);
}

// ---- boss chamber -------------------------------------------------------------
const FLESH_Z = -200, TENDON_Z = -184;
// Kept close together: the facets should read as texture, not compete with bullets.
const FL = [0x2a0b15, 0x2e0d18, 0x33101b, 0x2c0c17];
const TENDON = { lit: 0x7a2038, dark: 0x3a0c1a };

function chamber(body, glow, x0, x1, rng) {
  // A jittered, triangulated sheet: every facet catches the light differently,
  // which the toon ramp turns into hard-edged organic lumps.
  const s = 14, cols = Math.ceil((x1 - x0) / s), rows = Math.ceil((Y_TOP - Y_BOT) / s);
  const v = [];
  for (let i = 0; i <= cols; i++) {
    v.push([]);
    for (let j = 0; j <= rows; j++) {
      const edge = i === 0 || i === cols;   // chunk seams stay straight so neighbours meet
      v[i].push([
        x0 + i * s + (edge ? 0 : (rng() - 0.5) * 6),
        Y_TOP - j * s + (rng() - 0.5) * 6,
        FLESH_Z + (rng() - 0.5) * 7,
      ]);
    }
  }
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const a = v[i][j], b = v[i + 1][j], c = v[i + 1][j + 1], d = v[i][j + 1];
      // Rows run downward, so a-d-c / a-c-b is counter-clockwise from the front.
      body.facet(a, d, c, C(FL[Math.floor(rng() * FL.length)]));
      body.facet(a, c, b, C(FL[Math.floor(rng() * FL.length)]));
    }
  }
  // Tendons: wobbling vertical ridges standing off the sheet.
  for (let x = x0 + 10 + rng() * 30; x < x1 - 10; x += 34 + rng() * 40) {
    let px = x;
    for (let y = Y_TOP; y > Y_BOT; y -= 12) {
      const nx = px + (rng() - 0.5) * 14, w = 2.2;
      const top = [px, y, TENDON_Z], bot = [nx, y - 12, TENDON_Z];
      body.facet([px - w, y, FLESH_Z + 4], [nx - w, y - 12, FLESH_Z + 4], bot, C(TENDON.lit));
      body.facet([px - w, y, FLESH_Z + 4], bot, top, C(TENDON.lit));
      body.facet(top, bot, [nx + w, y - 12, FLESH_Z + 4], C(TENDON.dark));
      body.facet(top, [nx + w, y - 12, FLESH_Z + 4], [px + w, y, FLESH_Z + 4], C(TENDON.dark));
      px = nx;
    }
  }
}

// ---------------------------------------------------------------------------------
const BUILD = { station, chamber };

export function createBackdrop3D(backdrops, camDist) {
  grow = (z) => (camDist - z) / camDist;
  const group = new THREE.Group();
  const solid = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const chunks = [];
  for (const [n, bd] of (backdrops || []).entries()) {
    const rng = mulberry32(4242 + n);
    for (let x = bd.x0; x < bd.x1; x += CHUNK) {
      const xe = Math.min(bd.x1, x + CHUNK);
      const body = new Builder(), lit = new Builder();
      BUILD[bd.kind](body, lit, x, xe, rng);
      const g = new THREE.Group();
      if (!body.empty) g.add(new THREE.Mesh(body.geometry(), solid));
      if (!lit.empty) g.add(new THREE.Mesh(lit.geometry(), glow));
      g.userData.x0 = x;
      g.userData.x1 = xe;
      group.add(g);
      chunks.push(g);
    }
  }
  return {
    group,
    // Deep layers are seen over a wider strip of world than the screen, so
    // the margin is generous.
    update(cam, w) {
      group.position.x = -cam;
      for (const g of chunks) g.visible = g.userData.x1 > cam - 320 && g.userData.x0 < cam + w + 320;
    },
    dispose() {
      group.traverse((o) => o.geometry?.dispose());
      solid.dispose(); glow.dispose();
    },
  };
}
