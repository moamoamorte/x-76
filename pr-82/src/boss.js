// Stage 1 guardian: "Oculus Bloom" – a wall-grown biomechanical organism.
// Its eye is protected by an iris of armour petals that periodically open;
// two armoured tentacles sweep the arena, and it spits homing larvae.
import { rand } from './util.js';
import { Enemy, Larva } from './enemies.js';

// Drawn in 3D by models/enemies/bloom.js, which shares this layout.
export const N_SEG = 16, SEG_LEN = 8;
export const EYE_X = 312, EYE_Y = 112;    // relative to the screen's left edge

export class Boss extends Enemy {
  static model = 'boss';
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
    this.launchT = -999;   // when larvae last left the spore mouths; only the 3D model reads it
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
      this.launchT = this.t;
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
}
