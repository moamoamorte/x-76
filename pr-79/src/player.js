// Player ship, the detachable pod, satellite bits, and all player projectiles.
import { W, H, clamp, lerp, TAU, angleTo, turnToward } from './util.js';
import { snap } from './view.js';
import {
  shipSpeed, TILT_EASE, TURN_EASE, CHARGE_DELAY, CHARGE_RATE, BEAM_MIN_CHARGE, beamLevel, BEAM, DOCK,
  POD_LAUNCH_FRONT, POD_LAUNCH_BACK, POD_LAUNCH_DRAG, POD_LAUNCH_STOP, POD_FOLLOW, POD_RECALL_SPEED, POD_GRAB_DIST,
  SHIELD_MAX,
} from './tuning.js';

// ---------------------------------------------------------------------------
const TRAIL = 7;   // points kept in a laser's trail
const POD_SHOTS = [[0], [0, -0.5, 0.5], [0, -0.5, 0.5, Math.PI - 0.5, Math.PI + 0.5]];   // angles by pod level
const RICOCHET = [-0.45, 0, 0.45], RICOCHET_WIDE = [-0.5, -0.25, 0, 0.25, 0.5];

// Pooled (see Game#shoot): init() resets every field any kind uses, so a
// recycled bullet never inherits another kind's state. Callers set the
// kind-specific ones after init.
export class PBullet {
  constructor() {
    this.trailX = new Float64Array(TRAIL);
    this.trailY = new Float64Array(TRAIL);
    this.hitSet = new Set();
  }

  init(kind, x, y, vx, vy) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 3;
    this.dmg = 1;
    this.t = 0;
    this.dead = false;
    // The lasers that draw as a streak keep the last few positions.
    this.trail = kind === 'helix' || kind === 'ricochet' || kind === 'crawler';
    this.trailLen = 0;
    this.color = null;
    this.y0 = 0; this.phase = 0; this.amp = 0;               // helix
    this.bounces = 0;                                        // ricochet
    this.dir = 1; this.surf = 0; this.mode = null;           // crawler
    this.a = 0; this.sp = 0; this.target = null;             // missile
    this.hw = 0; this.hh = 0; this.power = 0; this.level = 0; // beam
    this.hitSet.clear();
    return this;
  }

  die(g, spark = true) {
    this.dead = true;
    if (spark) g.fx.sparks(this.x, this.y, '#ffe0a0', 3, 1.5);
  }

  update(g) {
    const T = g.terrain;
    this.t++;
    this.x += g.scrollDelta;
    if (this.trail) for (let i = 0; i < this.trailLen; i++) this.trailX[i] += g.scrollDelta;

    switch (this.kind) {
      case 'shot':
      case 'bitshot':
      case 'podshot':
      case 'yshot':
        this.x += this.vx;
        this.y += this.vy;
        if (T.solidAt(this.x, this.y)) this.die(g);
        break;

      case 'beam':
        this.x += this.vx;
        if (T.solidAt(this.x + this.hw * 0.5, this.y)) {
          g.fx.sparks(this.x + this.hw * 0.5, this.y, '#aee6ff', 8, 3);
          this.dead = true;
        }
        break;

      case 'helix':
        this.x += this.vx;
        this.y = this.y0 + Math.sin(this.t * 0.35 + this.phase) * this.amp;
        if (T.solidAt(this.x, this.y)) this.die(g);
        break;

      case 'ricochet': {
        const nx = this.x + this.vx, ny = this.y + this.vy;
        if (T.solidAt(nx, ny)) {
          const hx = T.solidAt(nx, this.y), hy = T.solidAt(this.x, ny);
          if (hx) this.vx = -this.vx;
          if (hy) this.vy = -this.vy;
          if (!hx && !hy) { this.vx = -this.vx; this.vy = -this.vy; }
          if (--this.bounces < 0) { this.die(g); break; }
          g.fx.sparks(this.x, this.y, '#8ae0ff', 3, 1.5);
        } else {
          this.x = nx;
          this.y = ny;
        }
        break;
      }

      case 'crawler': {
        const s = this.surf;
        if (this.mode === 'vert') {
          this.x += this.dir * 1;
          if (T.solidAt(this.x, this.y + this.vy + s * 2)) {
            this.mode = 'crawl';
          } else {
            this.y += this.vy;
          }
        } else {
          const nx = this.x + this.dir * 5.5;
          if (T.solidAt(nx + this.dir * 3, this.y)) { this.die(g); break; }
          this.x = nx;
          if (!T.solidAt(this.x, this.y + s * 8)) this.mode = 'vert';
        }
        if (this.t > 150) this.dead = true;
        break;
      }

      case 'missile': {
        if (!this.target || this.target.dead || !this.target.active) this.target = g.nearestEnemy(this.x, this.y);
        if (this.target && this.t > 6) {
          const tp = this.target.parts ? this.target.parts[0] || this.target : this.target;
          this.a = turnToward(this.a, angleTo(this.x, this.y, tp.x, tp.y), 0.09);
        }
        this.sp = Math.min(4.8, this.sp + 0.15);
        this.vx = Math.cos(this.a) * this.sp;
        this.vy = Math.sin(this.a) * this.sp;
        this.x += this.vx;
        this.y += this.vy;
        if (this.t % 3 === 0) g.fx.emit('smoke', this.x, this.y, 0, 0, 2, 16, 16);
        if (T.solidAt(this.x, this.y)) this.die(g);
        break;
      }
    }

    if (this.trail) {
      if (this.trailLen === TRAIL) {
        this.trailX.copyWithin(0, 1);
        this.trailY.copyWithin(0, 1);
        this.trailLen--;
      }
      this.trailX[this.trailLen] = this.x;
      this.trailY[this.trailLen] = this.y;
      this.trailLen++;
    }

    const sx = this.x - g.cam;
    if (sx < -60 || sx > W + 60 || this.y < -30 || this.y > H + 30) this.dead = true;
  }
}

// ---------------------------------------------------------------------------
export class Player {
  constructor(g, x, y) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.dead = false;
    this.entering = true;
    this.inv = 0;
    this.shield = this.maxShield = SHIELD_MAX;
    this.hitT = 0;          // counts down with inv after a shield hit, so it doesn't blink like a respawn
    this.lastHit = null;    // { angle, t }: where the last shield hit landed, for the bubble's ripple
    this.safeX = x;         // last position clear of terrain, to bounce back to
    this.safeY = y;
    this.speedLv = 0;
    this.missile = false;
    this.missileCd = 0;
    this.charge = 0;
    this.holdT = 0;
    this.tilt = 0;
    this.turn = 0;
    this.t = 0;
  }

  get speed() { return shipSpeed(this.speedLv); }
  // Centre of the (small) hit circle.
  get hx() { return this.x + 1; }
  get hy() { return this.y; }

  update() {
    const g = this.g, inp = g.input;
    this.t++;
    if (this.dead) return;
    this.x += g.scrollDelta;

    if (this.entering) {
      this.x += 1.6;
      if (this.x - g.cam >= 56) { this.entering = false; this.inv = 100; }
      this.safeX = this.x;
      this.safeY = this.y;
      return;
    }
    if (this.inv > 0) this.inv--;
    if (this.hitT > 0) this.hitT--;

    let dx = 0, dy = 0;
    if (inp.held('left')) dx--;
    if (inp.held('right')) dx++;
    if (inp.held('up')) dy--;
    if (inp.held('down')) dy++;
    if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    this.x += dx * this.speed;
    this.y += dy * this.speed;
    this.tilt = lerp(this.tilt, dy, TILT_EASE);
    this.turn = lerp(this.turn, dx, TURN_EASE);
    this.x = clamp(this.x, g.cam + 16, g.cam + W - 22);
    this.y = clamp(this.y, 10, H - 9);

    if (g.terrain.boxSolid(this.x + 2, this.y, 11, 3.5)) {
      // Bounce back to the last clear spot. If the scroll has pinned the ship
      // against the wall there is nowhere to go, and it's crushed.
      const a = Math.atan2(this.y - this.safeY, this.x - this.safeX);
      this.x = Math.max(this.safeX, g.cam + 16);
      this.y = this.safeY;
      if (g.terrain.boxSolid(this.x + 2, this.y, 11, 3.5)) { g.killPlayer(); return; }
      g.hitPlayer('terrain', a);
      if (this.dead) return;
    }
    this.safeX = this.x;
    this.safeY = this.y;

    if (this.missileCd > 0) this.missileCd--;
    if (inp.pressed('fire')) { this.fire(); this.holdT = 0; }
    if (inp.held('fire')) {
      this.holdT++;
      if (this.holdT > CHARGE_DELAY) {
        if (this.charge === 0) g.audio.chargeStart();
        this.charge = Math.min(1, this.charge + CHARGE_RATE);
        g.audio.chargeSet(this.charge);
        if (this.t % 2 === 0) g.fx.suck(this.x + 22, this.y, this.charge >= 1 ? '#ffffff' : '#8ad8ff');
      }
    } else {
      if (this.charge >= BEAM_MIN_CHARGE) this.fireBeam();
      if (this.charge > 0) { this.charge = 0; g.audio.chargeStop(); }
      this.holdT = 0;
    }

    if (inp.pressed('pod') && g.pod) g.pod.toggle();
  }

  fire() {
    const g = this.g;
    let shots = 0;
    for (const b of g.pbullets) if (b.kind === 'shot') shots++;
    if (shots < 6) {
      g.shoot('shot', this.x + 18, this.y, 8, 0);
      g.audio.play('shot');
      g.r3d.ship.fire(1);
    }
    g.pod?.fire();
    for (const b of g.bits) b.fire();
    if (this.missile && this.missileCd <= 0) {
      this.missileCd = 50;
      for (let s = -1; s <= 1; s += 2) {
        const m = g.shoot('missile', this.x, this.y + s * 4, 0, 0);
        m.a = s * 1.1; m.sp = 1.2; m.dmg = 3;
      }
      g.audio.play('missile');
    }
  }

  fireBeam() {
    const g = this.g;
    const L = beamLevel(this.charge);
    const b = g.shoot('beam', this.x + 16 + BEAM.hw[L], this.y, 8.5, 0);
    b.hw = BEAM.hw[L]; b.hh = BEAM.hh[L]; b.power = BEAM.power[L]; b.level = L;
    const ring = g.fx.emit('ring', this.x + 20, this.y, 0, 0, 2, 12, 12, '#aee6ff');
    if (ring) ring.vr = 1.5 + L * 0.4;
    g.audio.play('beam', L);
    g.r3d.ship.fire(1 + L * 0.4);
  }
}

// ---------------------------------------------------------------------------
// The pod: an indestructible orb that blocks bullets, rams enemies, and fires
// lasers when docked to the ship's nose or tail.
export class Pod {
  constructor(g, color) {
    this.g = g;
    this.color = color;
    this.level = 1;
    this.state = 'arrive';
    this.x = g.cam - 16;
    this.y = g.player.y;
    this.vx = 0;
    this.r = 9;
    this.spin = 0;
    this.laserCd = 0;
    this.t = 0;
  }

  get attached() { return this.state === 'front' || this.state === 'back'; }

  update() {
    const g = this.g, p = g.player;
    this.t++;
    this.spin += 0.12;
    if (this.laserCd > 0) this.laserCd--;

    switch (this.state) {
      case 'arrive':
        this.x += g.scrollDelta + 2.5;
        this.y = lerp(this.y, p.y, 0.06);
        if (this.x - g.cam >= 40) this.state = 'free';
        break;
      case 'free':
        this.x += g.scrollDelta;
        this.y = lerp(this.y, p.y, POD_FOLLOW);
        break;
      case 'launch': {
        this.x += g.scrollDelta + this.vx;
        this.vx *= POD_LAUNCH_DRAG;
        const sx = this.x - g.cam;
        if (Math.abs(this.vx) < POD_LAUNCH_STOP || sx > W - 20 || sx < 16) this.state = 'free';
        break;
      }
      case 'recall': {
        const dx = p.x - this.x, dy = p.y - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const s = Math.min(d, POD_RECALL_SPEED);
        this.x += g.scrollDelta + (dx / d) * s;
        this.y += (dy / d) * s;
        break;
      }
      case 'front':
        this.x = p.x + DOCK.front.x;
        this.y = p.y + DOCK.front.y;
        break;
      case 'back':
        this.x = p.x + DOCK.back.x;
        this.y = p.y + DOCK.back.y;
        break;
    }

    if (!this.attached) {
      this.x = clamp(this.x, g.cam + 10, g.cam + W - 10);
      this.y = clamp(this.y, 10, H - 10);
      if (this.state !== 'launch' && this.state !== 'arrive' && !p.dead && !p.entering &&
          Math.hypot(p.x - this.x, p.y - this.y) < POD_GRAB_DIST) {
        this.attach(this.x > p.x ? 'front' : 'back');
      }
    }
  }

  attach(side) {
    this.state = side;
    this.g.audio.play('podClamp');
  }

  toggle() {
    const a = this.g.audio;
    switch (this.state) {
      case 'front':
      case 'back':
        this.vx = this.state === 'front' ? POD_LAUNCH_FRONT : -POD_LAUNCH_BACK;
        this.state = 'launch';
        a.play('podLaunch');
        a.play('podRelease');
        break;
      case 'free':
      case 'launch': this.state = 'recall'; break;
      case 'recall': this.state = 'free'; break;
    }
  }

  fire() {
    const g = this.g;
    if (this.state === 'arrive' || this.state === 'recall') return;
    if (this.attached) {
      if (this.laserCd > 0) return;
      this.laserCd = 8;
      this.fireLaser();
      return;
    }
    for (const a of POD_SHOTS[this.level - 1]) g.shoot('podshot', this.x, this.y, Math.cos(a) * 6, Math.sin(a) * 6);
  }

  fireLaser() {
    const g = this.g, L = this.level, color = this.color;
    const dir = this.state === 'front' ? 1 : -1;
    const x = this.x + dir * 8, y = this.y;
    const shot = (kind, vx, vy) => {
      const b = g.shoot(kind, x, y, vx, vy);
      b.color = color;
      return b;
    };
    switch (color) {
      case 'red':
        for (let i = 0; i < 2; i++) {
          const b = shot('helix', 7 * dir, 0);
          b.y0 = y; b.phase = i * Math.PI; b.amp = 5 + L * 2.5; b.r = 2.5 + L * 0.5; b.dmg = 1 + L * 0.6;
        }
        break;
      case 'blue':
        for (const a of L >= 3 ? RICOCHET_WIDE : RICOCHET) {
          const b = shot('ricochet', Math.cos(a) * 6.5 * dir, Math.sin(a) * 6.5);
          b.bounces = 1 + L; b.dmg = 0.8 + L * 0.5; b.r = 2.5;
        }
        break;
      case 'yellow': {
        for (let s = -1; s <= 1; s += 2) {
          const b = shot('crawler', 0, s * 5);
          b.dir = dir; b.surf = s; b.mode = 'vert'; b.dmg = 1.5 + L * 0.6; b.r = 2.5 + L * 0.5;
        }
        const b = shot('yshot', 7 * dir, 0);
        b.dmg = 1 + L * 0.5; b.r = 2.5 + L * 0.4;
        break;
      }
    }
    g.audio.play('laser');
  }
}

// ---------------------------------------------------------------------------
// Bits: small drones above/below the ship that block bullets and add firepower.
export class Bit {
  constructor(g, slot) {
    this.g = g;
    this.slot = slot;
    this.x = g.player.x;
    this.y = g.player.y;
    this.r = 6;
    this.t = 0;
  }
  update() {
    const g = this.g, p = g.player;
    this.t++;
    this.x = lerp(this.x + g.scrollDelta, p.x - 2, 0.3);
    this.y = lerp(this.y, p.y + this.slot * 20, 0.3);
  }
  fire() {
    this.g.shoot('bitshot', this.x + 6, this.y, 7, 0);
  }
  draw(ctx, cam) {
    const x = snap(this.x) - cam, y = snap(this.y);
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createRadialGradient(-1, -1, 0, 0, 0, 5);
    g.addColorStop(0, '#ffe8ff');
    g.addColorStop(0.5, '#c070ff');
    g.addColorStop(1, '#4a1a7a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#e0b0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 2.5, this.t * 0.05, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}
