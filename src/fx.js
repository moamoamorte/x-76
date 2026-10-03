// Particle effects: explosions, sparks, smoke, shockwave rings.
import { rand, TAU } from './util.js';
import { Pool, compact } from './pool.js';

const FIRE = ['#fff8d0', '#ffe070', '#ffb030', '#ff6a1a', '#c8321a', '#5a1d14'];
const MAX = 900;

// One shape for every kind, so V8 keeps a single hidden class for them all.
class Particle {
  init(k, x, y, vx, vy, r, life, max, c) {
    this.k = k;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = r;
    this.vr = 0;
    this.life = life;
    this.max = max;
    this.c = c;
    this.tx = 0;
    this.ty = 0;
    return this;
  }
}
const alive = (o) => o.life > 0;

export class FX {
  constructor() {
    this.p = [];
    this.pool = new Pool(() => new Particle());
    this.release = (o) => this.pool.release(o);
    this.reset();
  }

  reset() {
    for (const o of this.p) this.pool.release(o);
    this.p.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  // Returns the particle, or null once the cap is reached (it's dropped).
  emit(k, x, y, vx, vy, r, life, max, c = null) {
    if (this.p.length >= MAX) return null;
    const o = this.pool.acquire().init(k, x, y, vx, vy, r, life, max, c);
    this.p.push(o);
    return o;
  }

  explode(x, y, size = 1) {
    const n = Math.round(6 * size + 4);
    const ring = this.emit('ring', x, y, 0, 0, 2, 14 + size * 4, 14 + size * 4, '#ffe9a8');
    if (ring) ring.vr = 1.6 + size * 0.8;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.3, 1.6) * (0.8 + size * 0.4);
      const life = rand(18, 34) * (0.8 + size * 0.25);
      this.emit('fire', x + rand(-4, 4) * size, y + rand(-4, 4) * size, Math.cos(a) * s, Math.sin(a) * s,
        rand(3, 6) * (0.7 + size * 0.35), life, life);
    }
    for (let i = 0; i < n * 1.5; i++) {
      const a = rand(0, TAU), s = rand(1.5, 4.5) * (0.8 + size * 0.2);
      this.emit('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0, rand(10, 26), 26, '#ffd27a');
    }
    for (let i = 0; i < size * 2; i++) {
      this.emit('smoke', x + rand(-6, 6), y + rand(-6, 6), rand(-0.3, 0.3), rand(-0.5, 0), rand(4, 8) * size, 50, 50);
    }
    this.shake = Math.max(this.shake, size * 2.2);
  }

  sparks(x, y, color = '#9fe8ff', n = 5, speed = 2.5) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = rand(0.5, 1) * speed;
      this.emit('spark', x, y, Math.cos(a) * s, Math.sin(a) * s, 0, rand(6, 14), 14, color);
    }
  }

  // Energy particles that fly into a point (used while charging the beam).
  suck(x, y, color) {
    const a = rand(0, TAU), d = rand(14, 26);
    const o = this.emit('suck', x + Math.cos(a) * d, y + Math.sin(a) * d, 0, 0, 0, 12, 12, color);
    if (o) { o.tx = x; o.ty = y; }
  }

  update(scrollDelta) {
    for (const o of this.p) {
      o.life--;
      o.x += scrollDelta;
      switch (o.k) {
        case 'fire':
          o.x += o.vx; o.y += o.vy; o.vx *= 0.93; o.vy *= 0.93;
          break;
        case 'spark':
          o.x += o.vx; o.y += o.vy; o.vx *= 0.94; o.vy *= 0.94;
          break;
        case 'smoke':
          o.x += o.vx; o.y += o.vy; o.r += 0.12;
          break;
        case 'ring':
          o.r += o.vr; o.vr *= 0.94;
          break;
        case 'suck': {
          const t = 1 - o.life / o.max;
          o.x += (o.tx - o.x) * 0.25 * (1 + t);
          o.y += (o.ty - o.y) * 0.25 * (1 + t);
          o.tx += scrollDelta;
          break;
        }
      }
    }
    compact(this.p, alive, this.release);
    this.shake *= 0.88;
    if (this.shake < 0.2) this.shake = 0;
    if (this.flash > 0) this.flash--;
  }

  draw(ctx, cam) {
    ctx.save();
    for (const o of this.p) {
      if (o.k !== 'smoke') continue;
      const t = o.life / o.max;
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = '#3a3440';
      ctx.beginPath();
      ctx.arc(o.x - cam, o.y, o.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const o of this.p) {
      const t = o.life / o.max;
      const x = o.x - cam;
      switch (o.k) {
        case 'fire': {
          const ci = Math.min(FIRE.length - 1, Math.floor((1 - t) * FIRE.length));
          ctx.globalAlpha = Math.min(1, t * 1.6);
          ctx.fillStyle = FIRE[ci];
          ctx.beginPath();
          ctx.arc(x, o.y, o.r * (0.5 + t * 0.7), 0, TAU);
          ctx.fill();
          break;
        }
        case 'spark':
        case 'suck':
          ctx.globalAlpha = t;
          ctx.fillStyle = o.c;
          ctx.fillRect(x - 1, o.y - 1, 2, 2);
          break;
        case 'ring':
          ctx.globalAlpha = t;
          ctx.strokeStyle = o.c;
          ctx.lineWidth = 2 * t + 0.5;
          ctx.beginPath();
          ctx.arc(x, o.y, o.r, 0, TAU);
          ctx.stroke();
          break;
      }
    }
    ctx.restore();
  }
}
