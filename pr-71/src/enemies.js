// Enemy roster for stage 1 (all original designs) plus enemy bullets.
import { W, H, clamp, lerp, rand, TAU, angleTo, turnToward, dist2 } from './util.js';
import { snap } from './view.js';

// Pooled (see Game#enemyShot).
export class EBullet {
  init(x, y, vx, vy, big = false) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.big = big;
    this.r = big ? 3.5 : 2.5;
    this.t = 0;
    this.dead = false;
    return this;
  }
  update(g) {
    this.t++;
    this.x += this.vx + g.scrollDelta;
    this.y += this.vy;
    const sx = this.x - g.cam;
    if (sx < -10 || sx > W + 10 || this.y < -10 || this.y > H + 10 || g.terrain.solidAt(this.x, this.y)) this.dead = true;
  }
  draw(ctx, cam) {
    const x = this.x - cam, y = this.y;
    const r = this.r + ((this.t >> 2) & 1) * 0.6;
    ctx.fillStyle = this.big ? 'rgba(255,60,140,0.55)' : 'rgba(255,90,50,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, r + 1.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.big ? '#ff9ad0' : '#ffb070';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, TAU);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
export class Enemy {
  constructor(g, x, y) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.r = 7;
    this.hp = 1;
    this.score = 100;
    this.t = 0;
    this.dead = false;
    this.flash = 0;
    this.relative = true;   // moves with the screen rather than the world
    this.seen = false;
    this.active = true;
    this.boom = 1;
    this.drop = null;
    this.solo = [this];     // stands in for `parts` when an enemy is one circle
  }

  tick() {
    const g = this.g;
    if (this.relative) this.x += g.scrollDelta;
    this.t++;
    if (this.flash > 0) this.flash--;
    const sx = this.x - g.cam;
    if (sx > -20 && sx < W + 20 && this.y > -20 && this.y < H + 20) this.seen = true;
    if (this.seen ? sx < -70 || sx > W + 140 || this.y < -70 || this.y > H + 70 : this.t > 900) this.dead = true;
  }

  get sx() { return this.x - this.g.cam; }
  onScreen(m = 8) {
    const sx = this.sx;
    return sx > m && sx < W - m && this.y > m && this.y < H - m;
  }
  canShoot() {
    const p = this.g.player;
    return this.onScreen(12) && !p.dead && !p.entering && dist2(this.x, this.y, p.x, p.y) > 60 * 60;
  }
  hit(d) {
    if (this.dead) return;
    this.hp -= d;
    this.flash = 3;
    if (this.hp <= 0) this.die();
  }
  die() {
    const g = this.g;
    this.dead = true;
    g.addScore(this.score);
    g.fx.explode(this.x, this.y, this.boom);
    g.audio.play(this.boom >= 2 ? 'explodeM' : 'explodeS');
    if (this.drop) g.spawnItem(this.x, this.y, this.drop);
  }
  col(c) { return this.flash > 0 ? '#ffffff' : c; }
  pos(cam) { return [snap(this.x) - cam, snap(this.y)]; }
  update() { this.tick(); }
  draw() {}
}

function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Whirler: small tri-blade drone that flies in sine-wave formations.
class Drifter extends Enemy {
  constructor(g, ev) {
    super(g, g.cam + W + 16, ev.y);
    this.y0 = ev.y;
    this.amp = ev.amp ?? 24;
    this.phase = ev.phase || 0;
    this.r = 6;
  }
  update() {
    this.tick();
    this.x -= 1.5;
    this.y = this.y0 + Math.sin(this.t * 0.05 + this.phase) * this.amp;
    if (this.canShoot() && Math.random() < 0.004) this.g.aimed(this.x, this.y, 1.6);
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    const a = this.t * 0.22;
    ctx.fillStyle = this.col('#c8502a');
    for (let i = 0; i < 3; i++) {
      const b = a + (i * TAU) / 3;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(b) * 4, y + Math.sin(b) * 4, 4, 1.8, b, 0, TAU);
      ctx.fill();
    }
    circle(ctx, x, y, 3.3, this.col('#ffd060'));
    circle(ctx, x, y, 1.4, this.col('#6a1a0a'));
  }
}

// Dart: interceptor that flies in, then locks onto the player's position and dives.
class Dart extends Enemy {
  constructor(g, ev) {
    const left = ev.from === 'left';
    super(g, left ? g.cam - 14 : g.cam + W + 14, ev.y);
    this.vx = left ? 2.4 : -2.2;
    this.vy = 0;
    this.turnAt = left ? 45 : 32;
    this.r = 5;
    this.score = 150;
  }
  update() {
    this.tick();
    const g = this.g, p = g.player;
    if (this.t === this.turnAt && !p.dead) {
      const a = angleTo(this.x, this.y, p.x, p.y);
      this.vx = Math.cos(a) * 3.1;
      this.vy = Math.sin(a) * 3.1;
    }
    this.x += this.vx;
    this.y += this.vy;
    if (this.seen && g.terrain.solidAt(this.x, this.y)) this.die();
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(this.vy, this.vx));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,140,40,0.8)';
    ctx.fillRect(-8 - Math.random() * 3, -1, 4, 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.col('#d83040');
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-5, -5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 5);
    ctx.fill();
    ctx.fillStyle = this.col('#ff8a8a');
    ctx.fillRect(-3, -1, 7, 1);
    circle(ctx, 2, 0, 1.5, this.col('#ffe070'));
    ctx.restore();
  }
}

const DROP_COLOR = { crystal: '#ff6a3a', speed: '#6ab0ff', missile: '#6aff9a', bit: '#d08aff', shield: '#6af0e0' };

// Porter: slow, armoured cargo walker. Destroy it to release a power-up.
class Carrier extends Enemy {
  constructor(g, ev) {
    super(g, g.cam + W + 18, ev.y);
    this.y0 = ev.y;
    this.r = 10;
    this.hp = 5;
    this.score = 300;
    this.boom = 1.5;
    this.drop = ev.drop || 'crystal';
  }
  update() {
    this.tick();
    this.x -= 0.75;
    this.y = this.y0 + Math.sin(this.t * 0.03) * 10;
    if (this.t % 140 === 70 && this.canShoot()) this.g.aimed(this.x, this.y, 1.5);
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    const ph = this.t * 0.15;
    ctx.strokeStyle = this.col('#5a5f6e');
    ctx.lineWidth = 2;
    for (const [lx, o] of [[-4, 0], [4, Math.PI]]) {
      const s = Math.sin(ph + o);
      ctx.beginPath();
      ctx.moveTo(x + lx, y + 5);
      ctx.lineTo(x + lx + s * 3, y + 9);
      ctx.lineTo(x + lx + s * 4 - 1, y + 13);
      ctx.stroke();
    }
    ctx.fillStyle = this.col('#8a8f9e');
    ctx.fillRect(x - 10, y - 6, 20, 12);
    ctx.fillStyle = this.col('#b4b9c8');
    ctx.fillRect(x - 10, y - 6, 20, 2);
    ctx.fillStyle = this.col('#e8c030');
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 8 + i * 5, y + 2, 3, 3);
    ctx.fillStyle = this.col('#ff3040');
    ctx.fillRect(x - 11, y - 3, 4, 3);
    const dc = DROP_COLOR[this.drop];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circle(ctx, x + 3, y - 9, 6 + Math.sin(this.t * 0.2), dc + '66');
    ctx.restore();
    circle(ctx, x + 3, y - 9, 4, this.col(dc));
    circle(ctx, x + 2, y - 10, 1.5, '#ffffff');
  }
}

// Gun turret mounted on floor or ceiling; tracks and fires at the player.
class Turret extends Enemy {
  constructor(g, ev, surf) {
    const up = ev.mount === 'floor';
    super(g, ev.wx, surf + (up ? -3 : 3));
    this.surf = surf;
    this.up = up;
    this.relative = false;
    this.r = 7;
    this.hp = 3;
    this.score = 200;
    this.a = up ? -Math.PI / 2 : Math.PI / 2;
    this.cd = 60 + Math.floor(rand(0, 60));
  }
  update() {
    this.tick();
    const g = this.g, p = g.player;
    let ta = angleTo(this.x, this.y, p.x, p.y);
    if (this.up && ta > 0) ta = ta > Math.PI / 2 ? -Math.PI + 0.05 : -0.05;
    if (!this.up && ta < 0) ta = ta < -Math.PI / 2 ? Math.PI - 0.05 : 0.05;
    this.a = turnToward(this.a, ta, 0.05);
    if (--this.cd <= 0) {
      this.cd = 100 + Math.floor(rand(0, 40));
      const side = this.up ? p.y < this.y : p.y > this.y;
      if (side && this.canShoot()) {
        const c = Math.cos(this.a), s = Math.sin(this.a);
        g.enemyShot(this.x + c * 9, this.y + s * 9, c * 1.7, s * 1.7);
        g.audio.play('eshot');
      }
    }
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    const sy = this.surf;
    ctx.strokeStyle = this.col('#9aa0b0');
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(this.a) * 9, y + Math.sin(this.a) * 9);
    ctx.stroke();
    ctx.fillStyle = this.col('#ff6040');
    ctx.fillRect(x + Math.cos(this.a) * 9 - 1, y + Math.sin(this.a) * 9 - 1, 2, 2);
    ctx.fillStyle = this.col('#5f6576');
    ctx.beginPath();
    ctx.arc(x, y, 6, this.up ? Math.PI : 0, this.up ? TAU : Math.PI);
    ctx.fill();
    ctx.fillStyle = this.col('#3a3f4c');
    ctx.fillRect(x - 8, this.up ? sy - 3 : sy, 16, 3);
    ctx.fillStyle = this.col('#ffd24a');
    ctx.fillRect(x - 1, y + (this.up ? -3 : 2), 2, 1);
  }
}

// Hopper: bipedal walker that leaps along the floor and fires at the top of each jump.
class Hopper extends Enemy {
  constructor(g, ev) {
    const fy = g.terrain.floorY(ev.wx);
    super(g, ev.wx, fy - 8);
    this.relative = false;
    this.r = 7;
    this.hp = 3;
    this.score = 200;
    this.vx = 0;
    this.vy = 0;
    this.ground = true;
    this.wait = 40 + Math.floor(rand(0, 30));
  }
  update() {
    this.tick();
    const g = this.g, T = g.terrain, p = g.player;
    if (this.ground) {
      if (--this.wait <= 0 && this.onScreen(0)) {
        this.ground = false;
        this.vy = -3.3;
        this.vx = (p.x < this.x ? -1 : 1) * 1.2;
      }
      return;
    }
    const before = this.vy;
    this.vy += 0.11;
    if (before < 0 && this.vy >= 0 && this.canShoot()) g.aimed(this.x, this.y, 1.6);
    if (T.solidAt(this.x + this.vx + Math.sign(this.vx) * 7, this.y)) this.vx = 0;
    this.x += this.vx;
    if (this.vy < 0 && T.solidAt(this.x, this.y - 8)) this.vy = 0;
    this.y += this.vy;
    if (this.vy > 0) {
      const fy = T.floorY(this.x, this.y - 4);
      if (this.y + 8 >= fy) {
        this.y = fy - 8;
        this.ground = true;
        this.vy = 0;
        this.vx = 0;
        this.wait = 50 + Math.floor(rand(0, 30));
      }
    }
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    ctx.strokeStyle = this.col('#4a6a4a');
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + s * 3, y + 2);
      if (this.ground) { ctx.lineTo(x + s * 7, y + 4); ctx.lineTo(x + s * 5, y + 8); }
      else { ctx.lineTo(x + s * 4, y + 6); ctx.lineTo(x + s * 4, y + 10); }
      ctx.stroke();
    }
    ctx.fillStyle = this.col('#5a8a5a');
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 7, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.col('#9ac89a');
    ctx.fillRect(x - 5, y - 5, 10, 2);
    const face = this.g.player.x < this.x ? -1 : 1;
    ctx.fillStyle = this.col('#ff3a3a');
    ctx.fillRect(x + face * 4 - 1, y - 2, 2, 2);
  }
}

// Bulwark: heavy armoured crawler with a spread cannon. Mid-stage threat.
class Bulwark extends Enemy {
  constructor(g, ev) {
    const fy = g.terrain.floorY(ev.wx);
    super(g, ev.wx, fy - 16);
    this.relative = false;
    this.r = 15;
    this.hp = 40;
    this.score = 3000;
    this.boom = 3;
    this.walkT = 0;
    this.cd = 80;
  }
  update() {
    this.tick();
    const g = this.g, T = g.terrain;
    if (this.onScreen(-40)) {
      if (this.t % 240 < 170 && !T.solidAt(this.x - 22, this.y)) {
        this.x -= 0.35;
        this.walkT++;
      }
      const fy = T.floorY(this.x, this.y);
      if (fy < H) this.y = lerp(this.y, fy - 16, 0.2);
    }
    if (this.onScreen(10)) {
      this.cd--;
      if (this.cd === 40 && this.canShoot()) g.aimed(this.x - 14, this.y - 2, 2.2, 0, true);
      if (this.cd <= 0) {
        this.cd = 85;
        if (this.canShoot()) for (let k = -2; k <= 2; k++) g.aimed(this.x - 10, this.y - 6, 1.5, k * 0.22);
      }
    }
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    const wt = this.walkT * 0.12;
    ctx.strokeStyle = this.col('#4a5060');
    ctx.lineWidth = 3;
    for (const i of [-12, -4, 4, 12]) {
      const lift = Math.max(0, Math.sin(wt + i)) * 3;
      ctx.beginPath();
      ctx.moveTo(x + i * 0.7, y + 4);
      ctx.lineTo(x + i * 1.3, y + 9 - lift);
      ctx.lineTo(x + i * 1.5, y + 16 - lift * 0.5);
      ctx.stroke();
    }
    ctx.fillStyle = this.col('#5a6070');
    ctx.fillRect(x - 26, y - 1, 14, 4);
    ctx.fillRect(x - 24, y - 9, 10, 3);
    const gr = ctx.createLinearGradient(0, y - 12, 0, y + 8);
    gr.addColorStop(0, this.col('#6aa0a8'));
    gr.addColorStop(1, this.col('#1e3438'));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(x, y, 20, 12, 0, Math.PI, TAU);
    ctx.lineTo(x + 18, y + 5);
    ctx.lineTo(x - 18, y + 5);
    ctx.fill();
    ctx.strokeStyle = this.col('#9ad0d8');
    ctx.lineWidth = 1;
    for (const r of [8, 14]) {
      ctx.beginPath();
      ctx.ellipse(x + 2, y, r, r * 0.6, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.fillStyle = this.col('#ff3040');
    ctx.fillRect(x - 15, y - 4, 7, 3);
    ctx.fillStyle = '#ffd0d0';
    ctx.fillRect(x - 13 + Math.round(Math.sin(this.t * 0.05) * 2), y - 4, 2, 2);
  }
}

// Spawner hatch: armoured dome that opens and releases homing larvae.
class Hatch extends Enemy {
  constructor(g, ev, surf) {
    const up = ev.mount === 'floor';
    super(g, ev.wx, surf + (up ? -5 : 5));
    this.surf = surf;
    this.up = up;
    this.relative = false;
    this.r = 10;
    this.hp = 14;
    this.score = 800;
    this.boom = 2;
    this.open = 0;
    this.cyc = 40;
  }
  update() {
    this.tick();
    if (!this.onScreen(0)) return;
    this.cyc++;
    const c = this.cyc % 180;
    this.open = lerp(this.open, c > 100 && c < 150 ? 1 : 0, 0.15);
    if (c === 110 || c === 122 || c === 134)
      this.g.enemies.push(new Larva(this.g, this.x, this.y + (this.up ? -4 : 4), this.up ? -1 : 1));
  }
  draw(ctx, cam) {
    const x = snap(this.x) - cam, s = this.surf;
    const d = this.up ? -1 : 1;
    const a0 = this.up ? Math.PI : 0, a1 = this.up ? TAU : Math.PI;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    circle(ctx, x, s, 8 * this.open, '#ff3a3a');
    circle(ctx, x, s, 4 * this.open, '#ffd080');
    ctx.restore();
    const o = this.open * 7;
    ctx.fillStyle = this.col('#4d5361');
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * o, s);
      ctx.arc(x + side * o, s, 11, side < 0 ? (this.up ? Math.PI : Math.PI / 2) : (this.up ? Math.PI * 1.5 : 0),
        side < 0 ? (this.up ? Math.PI * 1.5 : Math.PI) : (this.up ? TAU : Math.PI / 2));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = this.col('#8a92a4');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, s, 12, a0, a1);
    ctx.stroke();
    ctx.fillStyle = this.col('#2a2e38');
    ctx.fillRect(x - 13, this.up ? s - 2 : s, 26, 2);
    ctx.fillStyle = this.col('#ffd24a');
    ctx.fillRect(x - 10, s + d * 4, 2, 1);
    ctx.fillRect(x + 8, s + d * 4, 2, 1);
  }
}

// Larva: small homing grub released by hatches and the boss.
export class Larva extends Enemy {
  constructor(g, x, y, dirY) {
    super(g, x, y);
    this.a = dirY < 0 ? -Math.PI / 2 : Math.PI / 2;
    this.sp = 1.35;
    this.r = 4;
    this.score = 50;
    this.seen = true;
  }
  update() {
    this.tick();
    const p = this.g.player;
    if (!p.dead) this.a = turnToward(this.a, angleTo(this.x, this.y, p.x, p.y), 0.035);
    this.x += Math.cos(this.a) * this.sp;
    this.y += Math.sin(this.a) * this.sp;
    if (this.t > 600) this.dead = true;
  }
  draw(ctx, cam) {
    const [x, y] = this.pos(cam);
    const bx = -Math.cos(this.a), by = -Math.sin(this.a);
    for (let i = 3; i >= 1; i--) {
      const w = Math.sin(this.t * 0.3 + i) * 1.5;
      circle(ctx, x + bx * i * 3 - by * w, y + by * i * 3 + bx * w, 3 - i * 0.6, this.col('#4ab84a'));
    }
    circle(ctx, x, y, 3.5, this.col('#8aff6a'));
    circle(ctx, x + Math.cos(this.a) * 1.5, y + Math.sin(this.a) * 1.5, 1.2, this.col('#ff3a3a'));
  }
}

// Coil Wyrm: armoured segmented serpent; only the head is vulnerable.
class Serpent extends Enemy {
  constructor(g, ev) {
    super(g, g.cam + W + 24, ev.y);
    this.r = 8;
    this.hp = 26;
    this.score = 2500;
    this.boom = 2;
    this.a = Math.PI;
    this.sp = 1.5;
    this.N = 14;
    this.hist = [];
    this.head = { x: this.x, y: this.y, r: 8, armored: false };
    this.segs = [];
    for (let i = 0; i < this.N; i++) this.segs.push({ x: this.x, y: this.y, r: 7 - i * 0.22, armored: true });
    this.parts = [this.head, ...this.segs];
    this.dying = 0;
  }
  update() {
    const g = this.g;
    this.tick();
    if (this.dying) {
      this.dead = false;
      for (const s of this.segs) s.x += g.scrollDelta;
      this.dying++;
      if (this.dying % 5 === 0) {
        const s = this.segs[this.dying / 5 - 1];
        if (s) { g.fx.explode(s.x, s.y, 1); g.audio.play('explodeS'); }
        else this.dead = true;
      }
      return;
    }
    const p = g.player;
    const target = this.t < 760 && !p.dead ? angleTo(this.x, this.y, p.x, p.y) + Math.sin(this.t * 0.04) * 0.9 : Math.PI;
    this.a = turnToward(this.a, target, 0.028);
    this.x += Math.cos(this.a) * this.sp;
    this.y = clamp(this.y + Math.sin(this.a) * this.sp, 20, H - 20);
    this.hist.unshift({ x: this.x - g.cam, y: this.y });
    if (this.hist.length > this.N * 6 + 2) this.hist.pop();
    for (let i = 0; i < this.N; i++) {
      const h = this.hist[Math.min(this.hist.length - 1, (i + 1) * 6)];
      this.segs[i].x = h.x + g.cam;
      this.segs[i].y = h.y;
    }
    this.head.x = this.x;
    this.head.y = this.y;
    if (this.t % 90 === 45 && this.canShoot()) g.aimed(this.x, this.y, 1.7);
  }
  die() {
    const g = this.g;
    this.dying = 1;
    this.active = false;
    this.parts = [];
    g.addScore(this.score);
    g.fx.explode(this.x, this.y, 2);
    g.audio.play('explodeM');
  }
  draw(ctx, cam) {
    for (let i = this.N - 1; i >= 0; i--) {
      if (this.dying && i < this.dying / 5) continue;
      const s = this.segs[i];
      const x = snap(s.x) - cam, y = snap(s.y);
      if (i % 2 === 0) {
        ctx.fillStyle = '#6a4a5a';
        ctx.beginPath();
        ctx.moveTo(x - 2, y - s.r + 1); ctx.lineTo(x, y - s.r - 3); ctx.lineTo(x + 2, y - s.r + 1);
        ctx.moveTo(x - 2, y + s.r - 1); ctx.lineTo(x, y + s.r + 3); ctx.lineTo(x + 2, y + s.r - 1);
        ctx.fill();
      }
      circle(ctx, x, y, s.r, '#3a2240');
      circle(ctx, x, y, s.r - 1.5, '#9a7a8a');
      circle(ctx, x - s.r * 0.3, y - s.r * 0.3, s.r * 0.35, '#d8c0c8');
    }
    if (this.dying) return;
    const [x, y] = this.pos(cam);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.a);
    const m = Math.sin(this.t * 0.2) * 0.4 + 0.5;
    ctx.strokeStyle = this.col('#e0c8d0');
    ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(4, s * 3);
      ctx.quadraticCurveTo(12, s * (5 + m * 3), 13, s * m * 2);
      ctx.stroke();
    }
    ctx.fillStyle = this.col('#b89aa8');
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.col('#6a4a5a');
    ctx.fillRect(-6, -1, 8, 2);
    circle(ctx, 4, -3, 1.6, '#ff3040');
    circle(ctx, 4, 3, 1.6, '#ff3040');
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
export function createEnemy(g, ev) {
  switch (ev.type) {
    case 'drifter': return new Drifter(g, ev);
    case 'dart': return new Dart(g, ev);
    case 'carrier': return new Carrier(g, ev);
    case 'hopper': return new Hopper(g, ev);
    case 'bulwark': return new Bulwark(g, ev);
    case 'serpent': return new Serpent(g, ev);
    case 'turret':
    case 'hatch': {
      const floor = ev.mount === 'floor';
      const from = ev.from ?? H / 2;
      const s = floor ? g.terrain.floorY(ev.wx, from) : g.terrain.ceilY(ev.wx, from);
      if (floor ? s >= H : s <= 0) return null;
      return ev.type === 'turret' ? new Turret(g, ev, s) : new Hatch(g, ev, s);
    }
  }
  return null;
}
