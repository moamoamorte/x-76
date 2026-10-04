// Parallax starfield and nebula. The station and boss chamber walls in front
// of them are 3D (models/backdrop3d.js).
import { W, H, rand, mulberry32, TAU } from './util.js';
import { view, snap, scaledCanvas } from './view.js';

export class Background {
  constructor() {
    this.stars = [];
    // sz: farther stars are finer points rather than whole logical pixels.
    const layers = [
      { n: 60, sp: 0.12, sz: 0.5, c: ['#3a4260', '#4a4a70'] },
      { n: 40, sp: 0.35, sz: 0.75, c: ['#7080b0', '#9090c0'] },
      { n: 24, sp: 0.9, sz: 1, c: ['#e0e8ff', '#fff4d0', '#b0d0ff'] },
    ];
    for (const L of layers)
      for (let i = 0; i < L.n; i++)
        this.stars.push({ x: rand(0, W), y: rand(0, H), sp: L.sp * rand(0.8, 1.2), sz: L.sz, c: L.c[i % L.c.length], big: L.sp > 0.5 && Math.random() < 0.3 });
    this.gen = -1;
  }

  // The layers are pre-rendered at the display scale, so a resize rebuilds them.
  build() {
    this.gen = view.gen;
    this.nebula = this.makeNebula();
  }

  makeNebula() {
    const { cv, c } = scaledCanvas(1024, H);
    const rng = mulberry32(7);
    const blobs = [
      [120, 60, 140, '80,40,140'], [300, 170, 120, '30,60,140'], [560, 90, 180, '110,30,90'],
      [800, 150, 150, '30,80,130'], [950, 40, 110, '90,40,150'],
    ];
    for (const [x, y, r, col] of blobs) {
      for (const ox of [0, -1024, 1024]) {
        const g = c.createRadialGradient(x + ox, y, 0, x + ox, y, r);
        g.addColorStop(0, `rgba(${col},0.28)`);
        g.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, 1024, H);
      }
    }
    // Distant ringed planet
    const px = 680, py = 70, pr = 26;
    const pg = c.createRadialGradient(px - 8, py - 8, 2, px, py, pr);
    pg.addColorStop(0, '#6f8fb8');
    pg.addColorStop(0.6, '#34466a');
    pg.addColorStop(1, '#141a2c');
    c.fillStyle = pg;
    c.beginPath();
    c.arc(px, py, pr, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(160,180,220,0.5)';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(px, py, pr * 1.9, pr * 0.35, -0.3, 0, TAU);
    c.stroke();
    for (let i = 0; i < 80; i++) {
      c.fillStyle = `rgba(200,200,255,${rng() * 0.4})`;
      c.fillRect(rng() * 1024, rng() * H, 0.6, 0.6);
    }
    return cv;
  }

  update() {
    for (const s of this.stars) {
      s.x -= s.sp;
      if (s.x < 0) { s.x += W; s.y = rand(0, H); }
    }
  }

  // Draw a horizontally tiling layer with parallax, clipped to start at screen x `from`.
  tiled(ctx, img, cam, par, from) {
    if (from >= W) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.max(0, from), 0, W, H);
    ctx.clip();
    // Stepped in whole device pixels so repeats butt together without seams.
    const s = view.s, wd = img.width;
    for (let xd = Math.round(-((cam * par) % img.lw) * s); xd < W * s; xd += wd)
      ctx.drawImage(img, xd / s, 0, wd / s, img.height / s);
    ctx.restore();
  }

  draw(ctx, cam, t) {
    if (this.gen !== view.gen) this.build();
    ctx.fillStyle = '#02030a';
    ctx.fillRect(0, 0, W, H);
    this.tiled(ctx, this.nebula, cam, 0.06, 0);
    for (const s of this.stars) {
      ctx.fillStyle = s.c;
      if (s.big && (t + s.y) % 40 < 20) ctx.fillRect(snap(s.x - 1), snap(s.y + 0.25), 3, 0.5);
      ctx.fillRect(snap(s.x), snap(s.y), s.sz, s.sz);
    }
  }
}
