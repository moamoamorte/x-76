// Stage 1 guardian: "Oculus Bloom" – a wall-grown biomechanical organism.
// Its eye is protected by an iris of armour petals that periodically open;
// two armoured tentacles sweep the arena, and it spits homing larvae.
import { TAU, rand, lerp, mulberry32 } from './util.js';
import { Enemy, Larva } from './enemies.js';
import { view, snap, scaledCanvas } from './view.js';

const N_SEG = 16, SEG_LEN = 8;
const EYE_X = 312, EYE_Y = 112;    // relative to the screen's left edge

function makeBody() {
  const w = 120, h = 224;
  const { cv, c } = scaledCanvas(w, h);
  const rng = mulberry32(42);
  const edgeX = (y) => 22 + Math.pow(Math.abs(y - 112) / 112, 1.6) * 48;

  c.beginPath();
  c.moveTo(w, 0);
  for (let y = 0; y <= h; y += 4) c.lineTo(edgeX(y) + Math.sin(y * 0.3) * 1.5, y);
  c.lineTo(w, h);
  c.closePath();
  const g = c.createRadialGradient(85, 112, 10, 85, 112, 140);
  g.addColorStop(0, '#6a3650');
  g.addColorStop(0.6, '#40182e');
  g.addColorStop(1, '#1e0814');
  c.fillStyle = g;
  c.fill();
  c.save();
  c.clip();

  // Veins
  c.strokeStyle = 'rgba(200,50,80,0.45)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = 110, y = rng() * h;
    c.beginPath();
    c.moveTo(x, y);
    while (x > 20) {
      x -= 6;
      y += (rng() - 0.5) * 10;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  // Carapace ribs
  for (let k = -5; k <= 5; k++) {
    if (k === 0) continue;
    const y = 112 + k * 19;
    const ex = edgeX(y);
    c.strokeStyle = '#2a1020';
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(ex + 2, y);
    c.quadraticCurveTo(70, y + Math.sign(k) * 10, w, y + Math.sign(k) * 6);
    c.stroke();
    c.strokeStyle = '#b89098';
    c.lineWidth = 2;
    c.stroke();
    c.strokeStyle = '#f0d0d0';
    c.lineWidth = 0.7;
    c.stroke();
  }
  // Eye crater
  const cg = c.createRadialGradient(32, 112, 10, 32, 112, 34);
  cg.addColorStop(0, '#0a0206');
  cg.addColorStop(0.7, '#2a0c1a');
  cg.addColorStop(1, 'rgba(42,12,26,0)');
  c.fillStyle = cg;
  c.beginPath();
  c.arc(32, 112, 34, 0, TAU);
  c.fill();
  // Spore mouths
  for (const my of [36, 188]) {
    c.fillStyle = '#12040a';
    c.beginPath();
    c.ellipse(60, my, 10, 7, 0, 0, TAU);
    c.fill();
    c.fillStyle = '#e8d8c0';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const tx = 60 + Math.cos(a) * 9, ty = my + Math.sin(a) * 6;
      c.beginPath();
      c.moveTo(tx, ty);
      c.lineTo(60 + Math.cos(a + 0.2) * 5, my + Math.sin(a + 0.2) * 3);
      c.lineTo(60 + Math.cos(a - 0.2) * 5, my + Math.sin(a - 0.2) * 3);
      c.fill();
    }
  }
  // Tentacle sockets
  for (const sy of [58, 166]) {
    c.fillStyle = '#12040a';
    c.beginPath();
    c.arc(46, sy, 9, 0, TAU);
    c.fill();
    c.strokeStyle = '#b89098';
    c.lineWidth = 2;
    c.stroke();
  }
  c.restore();
  // Bony knobs along the leading edge
  for (let y = 10; y < h; y += 14) {
    if (Math.abs(y - 112) < 30) continue;
    c.fillStyle = '#c8b0a8';
    c.beginPath();
    c.arc(edgeX(y) + 2, y, 3, 0, TAU);
    c.fill();
    c.fillStyle = '#6a4a4a';
    c.fillRect(edgeX(y) + 2, y, 2, 2);
  }
  return cv;
}

export class Boss extends Enemy {
  constructor(g) {
    super(g, g.cam + EYE_X, EYE_Y);
    this.relative = false;
    this.hp = this.maxHp = 170;
    this.score = 20000;
    this.boom = 4;
    this.state = 'intro';
    this.st = 0;
    this.slide = 150;
    this.open = 0;
    this.cycle = 'closed';
    this.ct = 0;
    this.active = false;
    this.lash = 0;
    this.spiral = 0;
    this.eye = { x: 0, y: EYE_Y, r: 20, armored: true };
    this.bodyParts = [
      { dx: 358, y: 112, r: 44, armored: true },
      { dx: 356, y: 40, r: 40, armored: true },
      { dx: 356, y: 184, r: 40, armored: true },
    ];
    this.tent = [-1, 1].map((sign, i) => ({
      sign,
      by: sign < 0 ? 58 : 166,
      ph: i * 2.1,
      segs: Array.from({ length: N_SEG }, (_, k) => ({ x: 0, y: 0, r: 6.5 - k * 0.25, armored: true })),
    }));
    this.parts = [];
    this.layout();
    g.audio.play('roar');
  }

  get ox() { return this.g.cam + this.slide; }

  layout() {
    const ox = this.ox;
    this.x = ox + EYE_X;
    this.eye.x = this.x;
    this.eye.armored = this.open < 0.7;
    this.eye.r = this.eye.armored ? 21 : 14;
    for (const b of this.bodyParts) b.x = ox + b.dx;

    const amp = this.state === 'dying' ? 0.02 : this.lash > 0 ? 0.12 : 0.07;
    const freq = this.lash > 0 ? 0.09 : 0.05;
    for (const tc of this.tent) {
      let a = Math.PI + tc.sign * (0.35 + 0.35 * Math.sin(this.t * 0.013 + tc.ph));
      let x = ox + 326, y = tc.by;
      for (let i = 0; i < N_SEG; i++) {
        a += tc.sign * Math.sin(this.t * freq - i * 0.45 + tc.ph) * amp;
        x += Math.cos(a) * SEG_LEN;
        y += Math.sin(a) * SEG_LEN;
        tc.segs[i].x = x;
        tc.segs[i].y = y;
      }
    }
    // Refilled in place rather than rebuilt, so it doesn't allocate every frame.
    const parts = this.parts;
    parts.length = 0;
    if (this.state === 'fight') {
      parts.push(this.eye);
      for (const q of this.bodyParts) parts.push(q);
      for (const q of this.tent[0].segs) parts.push(q);
      for (const q of this.tent[1].segs) parts.push(q);
    }
  }

  update() {
    const g = this.g;
    this.t++;
    if (this.flash > 0) this.flash--;
    switch (this.state) {
      case 'intro':
        this.st++;
        this.slide = 150 * Math.pow(1 - Math.min(1, this.st / 160), 2);
        g.fx.shake = Math.max(g.fx.shake, 2);
        if (this.st >= 170) { this.state = 'fight'; this.active = true; this.st = 0; }
        break;
      case 'fight':
        this.fight();
        break;
      case 'dying':
        this.dyingUpdate();
        break;
    }
    this.layout();
  }

  fight() {
    const g = this.g, p = g.player;
    const rage = this.hp < this.maxHp * 0.5;
    this.ct++;
    switch (this.cycle) {
      case 'closed':
        this.open = Math.max(0, this.open - 0.06);
        if (this.ct > (rage ? 110 : 150)) { this.cycle = 'opening'; this.ct = 0; g.audio.play('open'); }
        break;
      case 'opening':
        this.open = Math.min(1, this.open + 1 / 28);
        if (this.open >= 1) { this.cycle = 'open'; this.ct = 0; }
        break;
      case 'open':
        if (this.ct > (rage ? 210 : 170)) { this.cycle = 'closing'; this.ct = 0; }
        break;
      case 'closing':
        this.open = Math.max(0, this.open - 1 / 28);
        if (this.open <= 0) { this.cycle = 'closed'; this.ct = 0; }
        break;
    }

    const alive = !p.dead && !p.entering;
    if (this.cycle === 'open' && alive) {
      if (this.ct % 45 === 20) for (let k = -1; k <= 1; k++) g.aimed(this.x - 10, EYE_Y, 1.8, k * 0.25, true);
      if (rage && this.ct % 10 === 0) {
        this.spiral += 0.45;
        for (let k = 0; k < 2; k++) {
          const a = this.spiral + k * Math.PI;
          g.enemyShot(this.x, EYE_Y, Math.cos(a) * 1.5, Math.sin(a) * 1.5);
        }
      }
    }
    if (this.cycle === 'closed' && this.ct === 60) {
      for (const my of [36, 188]) {
        g.enemies.push(new Larva(g, this.ox + 338, my, my < 112 ? 1 : -1));
        if (rage) g.enemies.push(new Larva(g, this.ox + 346, my, my < 112 ? 1 : -1));
      }
    }
    if (this.lash > 0) this.lash--;
    else if (this.t % 420 === 0) this.lash = 150;

    if (alive) {
      this.tent.forEach((tc, i) => {
        if ((this.t + i * 55) % 110 === 0) {
          const tip = tc.segs[N_SEG - 1];
          g.aimed(tip.x, tip.y, 1.6);
        }
      });
    }
  }

  hit(d) {
    if (this.state !== 'fight') return;
    super.hit(d);
  }

  die() {
    const g = this.g;
    this.state = 'dying';
    this.st = 0;
    this.active = false;
    this.open = 1;
    g.addScore(this.score);
    g.audio.play('explodeL');
    g.audio.music(null);
    for (const b of g.ebullets) b.dead = true;
    for (const e of g.enemies) if (e instanceof Larva) e.hit(99);
  }

  dyingUpdate() {
    const g = this.g;
    this.st++;
    if (this.st % 5 === 0) {
      g.fx.explode(this.ox + 290 + rand(0, 90), rand(16, 208), rand(1, 2.5));
      if (this.st % 10 === 0) g.audio.play('explodeS');
    }
    g.fx.shake = Math.max(g.fx.shake, 3);
    if (this.st === 150) {
      g.fx.flash = 24;
      g.fx.explode(this.x, EYE_Y, 5);
      g.audio.play('explodeL');
    }
    if (this.st >= 220) {
      this.dead = true;
      g.stageClear();
    }
  }

  draw(ctx, cam) {
    const ox = snap(this.ox) - cam;
    // Pre-rendered at the display scale, so rebuilt after a resize.
    if (this.bodyGen !== view.gen) { this.body = makeBody(); this.bodyGen = view.gen; }
    const fading = this.state === 'dying' && this.st > 150;
    ctx.save();
    if (fading) ctx.globalAlpha = Math.max(0, 1 - (this.st - 150) / 50);

    for (const tc of this.tent) this.drawTentacle(ctx, tc, cam);
    ctx.drawImage(this.body, snap(ox + 280), 0, this.body.lw, this.body.lh);

    // Pulsing glow in the eye crater
    const ex = ox + EYE_X;
    const pulse = 0.5 + Math.sin(this.t * 0.08) * 0.2 + this.open * 0.3;
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(ex, EYE_Y, 4, ex, EYE_Y, 34);
    gl.addColorStop(0, `rgba(255,60,40,${0.5 * pulse})`);
    gl.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(ex - 34, EYE_Y - 34, 68, 68);
    ctx.globalCompositeOperation = 'source-over';

    this.drawEye(ctx, ex, EYE_Y);
    ctx.restore();
  }

  drawTentacle(ctx, tc, cam) {
    for (let i = N_SEG - 1; i >= 0; i--) {
      const s = tc.segs[i];
      const x = snap(s.x) - cam, y = snap(s.y);
      if (i === N_SEG - 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,120,40,0.5)';
        ctx.beginPath();
        ctx.arc(x, y, 7 + Math.sin(this.t * 0.2), 0, TAU);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#ffb050';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = '#2a1020';
      ctx.beginPath();
      ctx.arc(x, y, s.r + 1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9a7078';
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d8b8b0';
      ctx.beginPath();
      ctx.arc(x - s.r * 0.3, y - s.r * 0.3, s.r * 0.4, 0, TAU);
      ctx.fill();
    }
  }

  drawEye(ctx, ex, ey) {
    const p = this.g.player;
    const flash = this.flash > 0;
    // Eyeball
    const eg = ctx.createRadialGradient(ex - 4, ey - 4, 2, ex, ey, 17);
    eg.addColorStop(0, flash ? '#ffffff' : '#f8f4c8');
    eg.addColorStop(1, flash ? '#ffffff' : '#9a8a50');
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(ex, ey, 16, 0, TAU);
    ctx.fill();
    // Iris tracks the player
    const la = Math.atan2(p.y - ey, p.x - this.x);
    const ix = ex + Math.cos(la) * 5, iy = ey + Math.sin(la) * 5;
    const ig = ctx.createRadialGradient(ix, iy, 1, ix, iy, 9);
    ig.addColorStop(0, '#ffcc40');
    ig.addColorStop(0.5, '#e02a1a');
    ig.addColorStop(1, '#5a0a0a');
    ctx.fillStyle = ig;
    ctx.beginPath();
    ctx.arc(ix, iy, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#100204';
    ctx.beginPath();
    ctx.ellipse(ix, iy, 1.8 + this.open, 7, 0, 0, TAU);
    ctx.fill();

    // Iris petals: closed they meet at the centre; open they fold outward.
    const R = 22;
    const tipR = lerp(0, R + 9, this.open);
    for (let i = 0; i < 4; i++) {
      const phi = Math.PI / 4 + (i * Math.PI) / 2;
      const ax = ex + Math.cos(phi - 0.85) * R, ay = ey + Math.sin(phi - 0.85) * R;
      const bx = ex + Math.cos(phi + 0.85) * R, by = ey + Math.sin(phi + 0.85) * R;
      const cx = ex + Math.cos(phi) * tipR;
      const cy = ey + Math.sin(phi) * tipR;
      const pg = ctx.createLinearGradient(ax, ay, cx, cy);
      pg.addColorStop(0, '#5a4038');
      pg.addColorStop(1, '#c8a078');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#2a1410';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Armoured rim
    ctx.strokeStyle = '#7a5a50';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(ex, ey, R + 1, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#d8b8a0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ex, ey, R + 2.5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
  }
}
