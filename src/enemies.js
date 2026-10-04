// Enemy roster for stage 1 (all original designs) plus enemy bullets.
import { W, H, clamp, lerp, rand, angleTo, turnToward, dist2 } from './util.js';

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
}

// ---------------------------------------------------------------------------
// Enemies are drawn in 3D; each subclass, the boss included, names its model
// in `static model` (see models/enemies/index.js).
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
  update() { this.tick(); }
}

// ---------------------------------------------------------------------------
// Whirler: small tri-blade drone that flies in sine-wave formations.
class Drifter extends Enemy {
  static model = 'drifter';
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
}

// Dart: interceptor that flies in, then locks onto the player's position and dives.
class Dart extends Enemy {
  static model = 'dart';
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
}

// Porter: slow, armoured cargo walker. Destroy it to release a power-up.
class Carrier extends Enemy {
  static model = 'carrier';
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
}

// Gun turret mounted on floor or ceiling; tracks and fires at the player.
class Turret extends Enemy {
  static model = 'turret';
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
}

// Hopper: bipedal walker that leaps along the floor and fires at the top of each jump.
class Hopper extends Enemy {
  static model = 'hopper';
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
}

// Bulwark: heavy armoured crawler with a spread cannon. Mid-stage threat.
class Bulwark extends Enemy {
  static model = 'bulwark';
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
}

// Spawner hatch: armoured dome that opens and releases homing larvae.
class Hatch extends Enemy {
  static model = 'hatch';
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
}

// Larva: small homing grub released by hatches and the boss.
export class Larva extends Enemy {
  static model = 'larva';
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
}

// Coil Wyrm: armoured segmented serpent; only the head is vulnerable.
class Serpent extends Enemy {
  static model = 'serpent';
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
