// Stage 1 layout: terrain shape + enemy spawn script.
import { W, lerp } from './util.js';
import { Terrain, ROWS, HULL, ORGANIC, MACHINE } from './terrain.js';

export const COLS = 748;
export const BOSS_CAM = 5600;          // camera stops here; boss arena fills the screen
export const SCROLL = 0.55;            // px per frame
export const CHECKPOINTS = [0, 1080, 2560, 3480, 4560, 5300];
export const WARNING_CAM = 5470;
// Walls behind the terrain (models/backdrop3d.js), by world x.
export const BACKDROPS = [
  { kind: 'station', x0: 980, x1: 5488 },
  { kind: 'chamber', x0: 5488, x1: 6144 },
];

export function buildTerrain() {
  const t = new Terrain(COLS);
  const ce = new Float32Array(COLS);
  const fl = new Float32Array(COLS);
  const seg = (c0, c1, a0, a1, b0, b1) => {
    for (let c = c0; c < c1; c++) {
      const k = (c - c0) / Math.max(1, c1 - c0);
      ce[c] = lerp(a0, a1, k);
      fl[c] = lerp(b0, b1, k);
    }
  };

  seg(0, 112, 0, 0, 0, 0);            // open space
  seg(112, 122, 0, 2.4, 0, 2.4);      // outer hull
  seg(122, 150, 2, 2, 2, 2);
  seg(150, 200, 3, 3, 3, 3);
  seg(200, 250, 2, 2, 4, 4);
  for (let c = 250; c < 330; c++) {   // undulating machinery section
    ce[c] = 3 + Math.round(Math.sin(c * 0.12) * 1.2);
    fl[c] = 3 + Math.round(Math.sin(c * 0.09 + 1) * 1.5);
  }
  seg(330, 420, 3, 3, 3, 3);          // central block section
  seg(420, 560, 2, 2, 2, 2);          // obstacle corridor
  for (let c = 560; c < 680; c++) {
    ce[c] = 2 + (Math.sin(c * 0.2) > 0.7 ? 1 : 0);
    fl[c] = 2 + (Math.sin(c * 0.17 + 2) > 0.7 ? 1 : 0);
  }
  seg(680, COLS, 2, 2, 2, 2);         // boss chamber

  for (let c = 0; c < COLS; c++) {
    const type = c >= 684 ? ORGANIC : HULL;
    const a = Math.round(ce[c]), b = Math.round(fl[c]);
    t.fillRect(c, 0, c + 1, a, type);
    t.fillRect(c, ROWS - b, c + 1, ROWS, type);
  }

  // Entrance gateway
  t.fillRect(140, 0, 144, 6);
  t.fillRect(140, 22, 144, 28);
  // Pillars and towers
  t.fillRect(172, 0, 176, 10);
  t.fillRect(188, 19, 194, 28);
  t.fillRect(222, 0, 226, 11);
  t.fillRect(238, 17, 242, 28);
  t.fillRect(270, 0, 276, 7, MACHINE);
  t.fillRect(300, 21, 306, 28, MACHINE);
  // Central block splitting the corridor into two lanes
  t.fillRect(340, 12, 344, 17);
  t.fillRect(344, 11, 410, 18);
  t.fillRect(352, 13, 402, 16, MACHINE);
  t.fillRect(410, 12, 414, 17);
  // Staggered obstacles
  t.fillRect(440, 0, 445, 12);
  t.fillRect(462, 15, 467, 28);
  t.fillRect(484, 0, 489, 12);
  t.fillRect(506, 16, 511, 28);
  t.fillRect(528, 0, 533, 11);
  // Organic arch into the boss chamber, and the chamber's back wall
  t.fillRect(686, 0, 692, 6, ORGANIC);
  t.fillRect(686, 22, 692, 28, ORGANIC);
  t.fillRect(744, 0, COLS, ROWS, ORGANIC);

  t.computeDepth();
  return t;
}

// Each event fires when the camera reaches `x`.
export function buildSpawns() {
  const E = [];
  const ev = (x, type, o = {}) => E.push({ x, type, ...o });
  const wave = (x, n, o = {}) => { for (let i = 0; i < n; i++) ev(x + i * 11, 'drifter', { phase: i * 0.6, ...o }); };
  // Terrain-mounted enemies appear just before they scroll into view.
  const mount = (wx, type, o = {}) => ev(wx - W - 12, type, { wx, static: true, ...o });

  // --- open space ---
  wave(60, 6, { y: 70 });
  wave(180, 6, { y: 150 });
  ev(300, 'carrier', { y: 110, drop: 'crystal' });
  ev(380, 'dart', { y: 50 });
  ev(390, 'dart', { y: 112 });
  ev(400, 'dart', { y: 174 });
  wave(470, 5, { y: 60 });
  wave(480, 5, { y: 164 });
  ev(600, 'carrier', { y: 70, drop: 'speed' });
  wave(680, 8, { y: 112, amp: 50 });
  ev(790, 'dart', { y: 40, from: 'left' });
  ev(800, 'dart', { y: 184, from: 'left' });
  wave(850, 6, { y: 90 });
  ev(920, 'dart', { y: 112 });
  ev(930, 'dart', { y: 80 });
  ev(940, 'dart', { y: 144 });

  // --- station entrance ---
  wave(1100, 6, { y: 112 });
  ev(1200, 'carrier', { y: 110, drop: 'crystal' });
  mount(1300, 'turret', { mount: 'floor' });
  mount(1360, 'turret', { mount: 'ceil' });
  ev(1300, 'dart', { y: 70 });
  ev(1310, 'dart', { y: 150 });
  mount(1420, 'turret', { mount: 'floor' });
  mount(1450, 'hopper');
  mount(1490, 'hopper');
  mount(1500, 'turret', { mount: 'ceil' });
  wave(1500, 6, { y: 140, amp: 16 });
  mount(1560, 'turret', { mount: 'floor' });
  mount(1720, 'hatch', { mount: 'ceil' });
  ev(1750, 'carrier', { y: 100, drop: 'missile' });
  mount(1880, 'hatch', { mount: 'floor' });
  wave(1900, 6, { y: 60 });
  mount(2000, 'bulwark');
  ev(2050, 'dart', { y: 60 });
  ev(2060, 'dart', { y: 160 });
  ev(2140, 'carrier', { y: 112, drop: 'shield' });
  mount(2100, 'turret', { mount: 'floor' });
  mount(2180, 'turret', { mount: 'ceil' });
  mount(2250, 'turret', { mount: 'floor' });
  wave(2300, 8, { y: 112, amp: 40 });
  mount(2320, 'turret', { mount: 'ceil' });
  mount(2440, 'turret', { mount: 'ceil' });
  ev(2450, 'carrier', { y: 112, drop: 'bit' });
  mount(2600, 'hopper');
  mount(2640, 'hopper');

  // --- central block (two lanes) ---
  wave(2600, 6, { y: 52, amp: 10 });
  wave(2700, 6, { y: 172, amp: 10 });
  mount(2800, 'turret', { mount: 'floor', from: 30 });
  mount(2860, 'turret', { mount: 'ceil' });
  ev(2850, 'carrier', { y: 52, drop: 'crystal' });
  mount(2900, 'turret', { mount: 'ceil', from: 186 });
  mount(2960, 'turret', { mount: 'floor' });
  mount(3000, 'turret', { mount: 'floor', from: 30 });
  ev(3000, 'dart', { y: 56 });
  ev(3010, 'dart', { y: 172 });
  mount(3060, 'turret', { mount: 'ceil' });
  mount(3100, 'turret', { mount: 'ceil', from: 186 });
  wave(3150, 5, { y: 52, amp: 10 });
  wave(3160, 5, { y: 172, amp: 10 });
  mount(3160, 'turret', { mount: 'floor' });
  mount(3200, 'turret', { mount: 'floor', from: 30 });

  // --- obstacle corridor ---
  wave(3400, 6, { y: 112 });
  mount(3536, 'turret', { mount: 'ceil', from: 186 });
  ev(3600, 'carrier', { y: 150, drop: 'speed' });
  mount(3610, 'hatch', { mount: 'ceil' });
  mount(3712, 'turret', { mount: 'floor', from: 60 });
  mount(3780, 'hatch', { mount: 'floor' });
  ev(3800, 'dart', { y: 60 });
  ev(3810, 'dart', { y: 112 });
  ev(3820, 'dart', { y: 164 });
  mount(3888, 'turret', { mount: 'ceil', from: 186 });
  mount(3950, 'hopper');
  ev(3960, 'carrier', { y: 112, drop: 'shield' });
  wave(4000, 6, { y: 60 });
  mount(4064, 'turret', { mount: 'floor', from: 60 });
  ev(4150, 'carrier', { y: 112, drop: 'crystal' });
  mount(4150, 'hopper');
  ev(4250, 'dart', { y: 90, from: 'left' });
  ev(4260, 'dart', { y: 140, from: 'left' });
  mount(4800, 'bulwark');

  // --- serpent nest ---
  ev(4500, 'serpent', { y: 196 });
  wave(4700, 6, { y: 112, amp: 36 });
  ev(4850, 'serpent', { y: 28 });
  ev(5000, 'carrier', { y: 112, drop: 'crystal' });
  ev(5100, 'dart', { y: 50 });
  ev(5110, 'dart', { y: 174 });
  wave(5150, 6, { y: 100, amp: 30 });
  ev(5250, 'carrier', { y: 140, drop: 'bit' });
  ev(WARNING_CAM, 'warning');

  E.sort((a, b) => a.x - b.x);
  return E;
}
