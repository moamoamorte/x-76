// Game bootstrap, main loop, state machine, spawning and collision.
import { W, H, HUD_H, SCREEN_H, rand, clamp, angleTo, dist2 } from './util.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { drawText } from './font.js';
import { FX } from './fx.js';
import { Background } from './background.js';
import { STAGES } from './stages.js';
import { Player, Pod, Bit, PBullet } from './player.js';
import { createEnemy, EBullet } from './enemies.js';
import { PowerItem, CRYSTAL_COLORS } from './items.js';
import { Render3D } from './render3d.js';
import { TouchControls, toggleFullscreen } from './touch.js';
import { SHIELD_DAMAGE, SHIELD_INV, SHIELD_PICKUP } from './tuning.js';
import { view, snap, setViewScale, MAX_SCALE } from './view.js';
import { Pool, compact } from './pool.js';

// Three stacked canvases (index.html), back to front: the background, the
// WebGL layer (terrain, ship, pod), then sprites, HUD and overlays. `ctx` is
// the front one, which most drawing goes to.
const backCanvas = document.getElementById('back');
const bctx = backCanvas.getContext('2d');
const canvas = document.getElementById('screen');
const ctx = canvas.getContext('2d');

const HI_KEY = 'x76-hi';
const LEGACY_HI_KEYS = ['xiphos-hi', 'nebula-lance-hi'];   // carry over scores from earlier names
function loadHi() {
  try {
    const v = +localStorage.getItem(HI_KEY);
    if (v) return v;
    for (const key of LEGACY_HI_KEYS) {
      const legacy = +localStorage.getItem(key);
      if (legacy) return legacy;
    }
    return 20000;
  } catch { return 20000; }
}
function saveHi(v) {
  try { localStorage.setItem(HI_KEY, String(v)); } catch { /* storage unavailable */ }
}
const pad = (n, l = 7) => String(Math.floor(n)).padStart(l, '0');
// HUD strings drawn every frame, rebuilt only when their number changes.
const counter = (prefix) => {
  let n = NaN, text = '';
  return (v) => (v === n ? text : (text = prefix + pad((n = v))));
};
const scoreText = counter('1P '), hiText = counter('HI ');
const CENTER = { align: 'center' };
// Module-level so the per-step compaction doesn't allocate closures.
const live = (o) => !o.dead;
const showing = (p) => p.t > 0;
// collide() does circleHit's and rectCircleHit's arithmetic in place, or through
// these helpers that take objects, because a call that passes doubles boxes
// each one whenever V8 hasn't inlined it. collide() is deoptimised each time a
// new enemy type turns up and runs in the lower tiers for a while each time,
// with its loops over every bullet, enemy part and player. Indexed loops for
// the same reason: for...of allocates there too.
const touching = (a, b) => {
  const dx = a.x - b.x, dy = a.y - b.y, r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
};
const hitTest = (b, part) => {
  if (!b.hw) return touching(b, part);
  const cx = part.x, cy = part.y, cr = part.r;
  const x0 = b.x - b.hw, x1 = b.x + b.hw, y0 = b.y - b.hh, y1 = b.y + b.hh;
  const dx = (cx < x0 ? x0 : cx > x1 ? x1 : cx) - cx;
  const dy = (cy < y0 ? y0 : cy > y1 ? y1 : cy) - cy;
  return dx * dx + dy * dy < cr * cr;
};

// ---- HUD drawing helpers ----------------------------------------------------
// Thinnest line that still covers a whole device pixel.
const hair = () => Math.max(0.5, 1 / view.s);
// A black meter well with a hairline, corner-chamfered border.
function meterWell(x, y, w, h, color) {
  const t = hair(), c = 1.5;
  // Inset by half the line so the stroke stays inside the old box.
  const l = x + t / 2, r = x + w - t / 2, u = y + t / 2, d = y + h - t / 2;
  ctx.beginPath();
  ctx.moveTo(l + c, u); ctx.lineTo(r, u); ctx.lineTo(r, d - c);
  ctx.lineTo(r - c, d); ctx.lineTo(l, d); ctx.lineTo(l, u + c);
  ctx.closePath();
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = t;
  ctx.stroke();
}
// One slanted shield-meter cell, w wide, in the HUD row at y.
function shieldCell(cx, y, w) {
  ctx.beginPath();
  ctx.moveTo(cx + 1, y + 5.5); ctx.lineTo(cx + w + 0.6, y + 5.5);
  ctx.lineTo(cx + w - 0.4, y + 10.5); ctx.lineTo(cx, y + 10.5);
  ctx.fill();
}
// The beam meter's fill: fixed HUD coordinates, so made once.
let beamFill = null;

class Game {
  constructor(r3d) {
    this.r3d = r3d;
    this.input = new Input();
    this.audio = new Sound();
    this.input.onFirstInput = () => this.audio.init();
    this.setStage(0);
    this.bg = new Background();
    this.fx = new FX();
    // Bullets are recycled rather than allocated per shot; see pool.js.
    this.pools = { pbullet: new Pool(() => new PBullet()), ebullet: new Pool(() => new EBullet()) };
    this.releasePB = (b) => this.pools.pbullet.release(b);
    this.releaseEB = (b) => this.pools.ebullet.release(b);
    this.touch = new TouchControls(this);
    this.hi = loadHi();
    this.state = 'title';
    this.stateT = 0;
    this.t = 0;
    this.cam = 0;
    this.scrollDelta = 0;
    this.paused = false;
    this.god = false;
    this.resetLists();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'play') this.setPaused(true);
    });
  }

  // Live bullets go back to their pools; the arrays themselves are reused.
  resetLists() {
    if (this.pbullets) {
      for (const b of this.pbullets) this.releasePB(b);
      for (const b of this.ebullets) this.releaseEB(b);
    }
    for (const k of ['enemies', 'pbullets', 'ebullets', 'items', 'popups']) {
      if (this[k]) this[k].length = 0;
      else this[k] = [];
    }
    this.bits = [];
    this.pod = null;
    this.boss = null;
  }

  // ---- flow ---------------------------------------------------------------
  // Terrain art is pre-rendered, so it is only rebuilt when the stage changes.
  setStage(i) {
    this.stageIdx = i;
    this.stage = STAGES[i];
    if (this.builtStage !== this.stage) {
      this.terrain = this.stage.level.buildTerrain();
      this.spawns = this.stage.level.buildSpawns();
      this.builtStage = this.stage;
    }
  }

  newGame(stageIdx = 0, cam) {
    this.score = 0;
    this.lives = 3;
    this.nextExtend = 50000;
    this.state = 'play';
    this.startStage(stageIdx, cam);
  }

  startStage(i, cam) {
    this.setStage(i);
    const { CHECKPOINTS } = this.stage.level;
    const start = CHECKPOINTS[0];
    // The checkpoint already passed, so a warp doesn't count as reaching one.
    this.cpIndex = Math.max(0, CHECKPOINTS.findLastIndex((x) => x <= (cam ?? start)));
    this.bossDone = false;
    this.startAt(cam ?? start, (cam ?? start) === start);
  }

  // Score and lives carry over; so do power-ups, as the genre usually does.
  nextStage() {
    const kit = this.loadout();
    this.state = 'play';
    this.startStage(this.stageIdx + 1);
    this.applyLoadout(kit);
  }

  startFromCheckpoint(first = false) {
    this.startAt(this.stage.level.CHECKPOINTS[this.cpIndex], first);
  }

  startAt(cam, first = false) {
    this.resetLists();
    this.fx.reset();
    this.cam = cam;
    this.scrollDelta = 0;
    this.deathT = 0;
    this.warning = 0;
    this.player = new Player(this, this.cam - 20, H / 2);
    this.spawnIdx = this.spawns.findIndex((e) => e.x >= this.cam);
    if (this.spawnIdx < 0) this.spawnIdx = this.spawns.length;
    // Terrain-mounted enemies that should already be on screen.
    for (const ev of this.spawns) if (ev.static && ev.x < this.cam && ev.wx > this.cam + 40) this.spawn(ev);
    this.banner = first
      ? { text: 'STAGE ' + this.stage.id, sub: this.stage.name, t: 200 }
      : { text: 'READY', sub: '', t: 120 };
    this.audio.music('stage');
  }

  loadout() {
    const p = this.player;
    return {
      pod: this.pod && { color: this.pod.color, level: this.pod.level },
      speed: p.speedLv,
      missile: p.missile,
      bits: this.bits.length,
    };
  }

  // Grants power-ups directly: no pickup, score or popup. The pod starts docked.
  // shield (a percentage) is debug-only; a new stage or life always starts full.
  applyLoadout({ pod, speed = 0, missile = false, bits = 0, shield }) {
    const p = this.player;
    if (shield !== undefined) p.shield = clamp(shield, 0, p.maxShield);
    p.speedLv = clamp(speed, 0, 4);
    p.missile = missile;
    this.pod = null;
    if (pod) {
      this.pod = new Pod(this, pod.color);
      this.pod.level = clamp(pod.level, 1, 3);
      this.pod.state = 'front';
    }
    this.bits = [];
    for (let i = 0; i < Math.min(2, bits); i++) this.bits.push(new Bit(this, i ? 1 : -1));
  }

  // Start play anywhere, e.g. game.warp({ cp: 3, power: 'pod:blue:2', god: true }).
  // The URL takes the same options (?stage ?cp ?cam ?boss ?god ?power); see readWarp().
  // Always a fresh game: score 0, three lives.
  warp({ stage = 1, cp, cam, boss, god, power } = {}) {
    let i = STAGES.findIndex((s) => s.id === +stage);
    if (i < 0) { console.warn(`warp: no stage ${stage}`); i = 0; }
    const L = STAGES[i].level;
    let x = L.CHECKPOINTS[0];
    if (boss) x = L.WARNING_CAM - 40;
    else if (cam !== undefined) x = clamp(+cam, 0, L.BOSS_CAM);
    else if (cp !== undefined) x = L.CHECKPOINTS[clamp(Math.floor(cp), 0, L.CHECKPOINTS.length - 1)];
    if (god !== undefined) this.god = !!god;
    this.setPaused(false);
    this.newGame(i, x);
    if (power) this.applyLoadout(typeof power === 'string' ? parsePower(power) : power);
  }

  setPaused(p) {
    this.paused = p;
    if (p) this.audio.chargeStop();
    if (this.player) { this.player.charge = 0; }
  }

  // Anything that isn't instantly fatal goes through here. The shield soaks the
  // hit and opens a short invulnerable window, so one bullet spread costs one
  // hit; a hit on an empty shield destroys the ship. angle points from the ship
  // toward the impact (screen space) and drives the bubble's ripple.
  hitPlayer(kind, angle = 0) {
    const p = this.player;
    if (p.dead || p.inv > 0) return;
    if (p.shield <= 0) { this.killPlayer(); return; }
    p.shield = Math.max(0, p.shield - SHIELD_DAMAGE[kind]);
    p.inv = p.hitT = SHIELD_INV;
    p.lastHit = { angle, t: p.t };
    this.fx.sparks(p.x + Math.cos(angle) * 14, p.y + Math.sin(angle) * 10, '#9ffff0', 8, 2.5);
    this.fx.shake = Math.max(this.fx.shake, 2);
    this.r3d.ship.hit();
    this.audio.play('shieldHit', p.shield <= 0 ? 1 : 0);
  }

  refillShield() {
    const p = this.player;
    if (p.dead || p.shield >= p.maxShield) return;
    p.shield = p.maxShield;
    this.popup(p.x, p.y - 14, 'SHIELD 100%', '#6af0e0');
    this.audio.play('shieldUp');
  }

  killPlayer() {
    const p = this.player;
    if (p.dead || this.god) return;
    p.dead = true;
    this.deathT = 0;
    this.fx.explode(p.x, p.y, 2.5);
    this.fx.sparks(p.x, p.y, '#aee6ff', 20, 4);
    if (this.pod) this.fx.explode(this.pod.x, this.pod.y, 1);
    for (const b of this.bits) this.fx.explode(b.x, b.y, 0.8);
    this.pod = null;
    this.bits = [];
    this.audio.chargeStop();
    this.audio.play('playerDie');
  }

  gameOver() {
    this.state = 'gameover';
    this.stateT = 0;
    this.audio.music(null);
    saveHi(this.hi);
  }

  stageClear() {
    this.bossDone = true;
    this.state = 'clear';
    this.stateT = 0;
    this.clearBonus = 10000 + this.lives * 5000;
    this.addScore(this.clearBonus);
    this.audio.music('clear');
    saveHi(this.hi);
  }

  addScore(n) {
    this.score += n;
    if (this.score >= this.nextExtend) {
      this.nextExtend += 100000;
      this.lives++;
      this.audio.play('powerup');
      this.popup(this.player.x, this.player.y - 14, '1UP', '#8aff8a');
    }
    if (this.score > this.hi) this.hi = this.score;
  }

  popup(x, y, text, color = '#fff') {
    this.popups.push({ x, y, text, color, t: 60 });
  }

  // ---- helpers used by entities ------------------------------------------
  spawn(ev) {
    if (ev.type === 'warning') {
      this.warning = 220;
      this.audio.music(null);
      this.audio.play('warning');
      return;
    }
    const e = createEnemy(this, ev);
    if (e) this.enemies.push(e);
  }

  spawnItem(x, y, type) {
    this.items.push(new PowerItem(this, x, y, type));
  }

  // Every bullet comes from these two, out of the pools.
  shoot(kind, x, y, vx, vy) {
    const b = this.pools.pbullet.acquire().init(kind, x, y, vx, vy);
    this.pbullets.push(b);
    return b;
  }

  enemyShot(x, y, vx, vy, big = false) {
    const b = this.pools.ebullet.acquire().init(x, y, vx, vy, big);
    this.ebullets.push(b);
    return b;
  }

  poolStats() {
    return { pbullet: this.pools.pbullet.stats(), ebullet: this.pools.ebullet.stats(), particle: this.fx.pool.stats() };
  }

  aimed(x, y, sp, off = 0, big = false) {
    const p = this.player;
    const a = angleTo(x, y, p.x, p.y) + off;
    this.enemyShot(x, y, Math.cos(a) * sp, Math.sin(a) * sp, big);
    this.audio.play('eshot');
  }

  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || !e.active || !e.onScreen(0)) continue;
      const tp = e.parts ? e.parts[0] : e;
      if (!tp || tp.armored) continue;
      const d = dist2(x, y, tp.x, tp.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  collect(item) {
    const p = this.player;
    let label = '';
    switch (item.type) {
      case 'crystal': {
        const col = item.color;
        if (!this.pod) { this.pod = new Pod(this, col); label = 'POD'; }
        else {
          this.pod.level = Math.min(3, this.pod.level + 1);
          this.pod.color = col;
          label = { red: 'HELIX', blue: 'RICOCHET', yellow: 'CRAWLER' }[col] + ' ' + this.pod.level;
        }
        break;
      }
      case 'speed':
        p.speedLv = Math.min(4, p.speedLv + 1);
        label = 'SPEED UP';
        break;
      case 'missile':
        p.missile = true;
        label = 'MISSILE';
        break;
      case 'bit':
        if (this.bits.length < 2) this.bits.push(new Bit(this, this.bits.length ? 1 : -1));
        label = 'BIT';
        break;
      case 'shield':
        p.shield = Math.min(p.maxShield, p.shield + SHIELD_PICKUP);
        label = `SHIELD ${p.shield}%`;
        break;
    }
    this.addScore(100);
    this.popup(item.x, item.y - 10, label, '#ffe070');
    this.audio.play('powerup');
  }

  // ---- update ---------------------------------------------------------------
  update() {
    const inp = this.input;
    inp.poll();
    this.t++;
    if (inp.pressed('mute')) this.audio.toggleMute();
    if (inp.pressed('fullscreen')) toggleFullscreen();

    switch (this.state) {
      case 'title':
        this.bg.update();
        this.stateT++;
        if (inp.pressed('start') || inp.pressed('fire')) {
          this.audio.init();
          this.newGame();
        }
        break;
      case 'play':
        if (inp.pressed('pause')) this.setPaused(!this.paused);
        if (!this.paused) this.updatePlay();
        break;
      case 'gameover':
      case 'clear':
        this.stateT++;
        this.bg.update();
        this.fx.update(0);
        if (this.state === 'clear' && !this.player.dead) this.player.x += 3;
        if (this.stateT > 120 && (inp.pressed('start') || inp.pressed('fire'))) {
          if (this.state === 'clear' && this.stageIdx + 1 < STAGES.length) this.nextStage();
          else {
            this.state = 'title';
            this.stateT = 0;
            this.audio.music(null);
          }
        }
        break;
    }
  }

  updatePlay() {
    const { BOSS_CAM, SCROLL, CHECKPOINTS } = this.stage.level;
    const prev = this.cam;
    this.cam = Math.min(BOSS_CAM, this.cam + SCROLL);
    this.scrollDelta = this.cam - prev;

    while (this.spawnIdx < this.spawns.length && this.spawns[this.spawnIdx].x <= this.cam)
      this.spawn(this.spawns[this.spawnIdx++]);
    // Passing a checkpoint tops the shield up.
    while (this.cpIndex + 1 < CHECKPOINTS.length && this.cam >= CHECKPOINTS[this.cpIndex + 1]) {
      this.cpIndex++;
      this.refillShield();
    }
    if (!this.boss && !this.bossDone && this.cam >= BOSS_CAM) {
      this.boss = new this.stage.Boss(this);
      this.enemies.push(this.boss);
      this.audio.music('boss');
    }

    this.bg.update();
    this.player.update();
    this.pod?.update();
    for (let i = 0; i < this.bits.length; i++) this.bits[i].update();
    for (let i = 0; i < this.pbullets.length; i++) this.pbullets[i].update(this);
    for (let i = 0; i < this.enemies.length; i++) this.enemies[i].update();
    for (let i = 0; i < this.ebullets.length; i++) this.ebullets[i].update(this);
    for (let i = 0; i < this.items.length; i++) this.items[i].update();
    this.collide();
    this.fx.update(this.scrollDelta);
    for (let i = 0; i < this.popups.length; i++) {
      const pu = this.popups[i];
      pu.t--; pu.y -= 0.4; pu.x += this.scrollDelta;
    }

    compact(this.pbullets, live, this.releasePB);
    compact(this.ebullets, live, this.releaseEB);
    compact(this.enemies, live);
    compact(this.items, live);
    compact(this.popups, showing);
    if (this.boss?.dead) this.boss = null;

    if (this.banner && --this.banner.t <= 0) this.banner = null;
    if (this.warning > 0) this.warning--;

    if (this.player.dead && this.state === 'play') {
      if (++this.deathT === 110) {
        this.lives--;
        if (this.lives <= 0) this.gameOver();
        else {
          let i = 0;
          while (i + 1 < CHECKPOINTS.length && CHECKPOINTS[i + 1] <= this.cam) i++;
          this.cpIndex = i;
          this.startFromCheckpoint();
        }
      }
    }
  }

  collide() {
    const p = this.player;
    const pbullets = this.pbullets, ebullets = this.ebullets, enemies = this.enemies;

    // Player projectiles vs enemies
    for (let i = 0; i < pbullets.length; i++) {
      const b = pbullets[i];
      if (b.dead) continue;
      for (let j = 0; j < enemies.length; j++) {
        const e = enemies[j];
        if (e.dead || !e.active) continue;
        const parts = e.parts || e.solo;
        for (let k = 0; k < parts.length; k++) {
          const part = parts[k];
          if (!hitTest(b, part)) continue;
          this.bulletHit(b, e, part);
          if (b.dead || e.dead || !e.active) break;
        }
        if (b.dead) break;
      }
    }

    // Pod and bits: ram enemies, soak bullets
    if (this.pod && this.pod.state !== 'arrive') this.shieldHits(this.pod, 0.34);
    for (let i = 0; i < this.bits.length; i++) this.shieldHits(this.bits[i], 0.2);

    if (p.dead || p.entering) return;

    // Items
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.dead) continue;
      const dx = p.x - it.x, dy = p.y - it.y, r = 12 + it.r;
      if (dx * dx + dy * dy < r * r) {
        it.dead = true;
        this.collect(it);
      }
    }

    if (p.inv > 0) return;
    const hx = p.hx, hy = p.hy;
    for (let i = 0; i < ebullets.length; i++) {
      const b = ebullets[i];
      if (b.dead) continue;
      const dx = hx - b.x, dy = hy - b.y, r = 2.5 + b.r;
      if (dx * dx + dy * dy < r * r) {
        b.dead = true;
        this.hitPlayer(b.big ? 'bigBullet' : 'bullet', angleTo(hx, hy, b.x, b.y));
        return;
      }
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || (!e.active && e !== this.boss)) continue;
      const parts = e.parts || e.solo;
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k];
        const dx = hx - part.x, dy = hy - part.y, r = 4 + part.r * 0.85;
        if (dx * dx + dy * dy < r * r) {
          this.hitPlayer(e === this.boss ? 'boss' : 'enemy', angleTo(hx, hy, part.x, part.y));
          return;
        }
      }
    }
  }

  shieldHits(s, dmg) {
    const enemies = this.enemies, ebullets = this.ebullets;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead || !e.active) continue;
      const parts = e.parts || e.solo;
      for (let k = 0; k < parts.length; k++) {
        const part = parts[k];
        if (part.armored || !touching(s, part)) continue;
        e.hit(dmg, part);
        if (this.t % 6 === 0) this.fx.sparks(s.x, s.y, '#ffd080', 2, 2);
        break;
      }
    }
    for (let i = 0; i < ebullets.length; i++) {
      const b = ebullets[i];
      if (!b.dead && touching(s, b)) {
        b.dead = true;
        this.fx.sparks(b.x, b.y, '#ffb070', 2, 1.5);
      }
    }
  }

  bulletHit(b, e, part) {
    if (b.kind === 'beam') {
      if (b.hitSet.has(part)) return;
      b.hitSet.add(part);
    }
    if (part.armored) {
      this.fx.sparks(b.x, b.y, '#ffffff', 3, 2);
      this.audio.play('tink');
      if (b.kind === 'beam') {
        b.power -= 8;
        if (b.power <= 0) b.dead = true;
      } else b.dead = true;
      return;
    }
    if (b.kind === 'beam') {
      const hp = e.hp;
      e.hit(b.power, part);
      b.power -= hp;
      if (b.power <= 0) b.dead = true;
    } else {
      e.hit(b.dmg, part);
      b.dead = true;
    }
    this.fx.sparks(b.x, b.y, '#ffe0a0', 3, 2);
    if (!e.dead) this.audio.play('hit');
  }

  // ---- draw -----------------------------------------------------------------
  // Everything draws in logical pixels; the transform maps them onto the
  // canvas's device-resolution backing store (see fit()).
  draw() {
    for (const c of [bctx, ctx]) {
      c.setTransform(view.s, 0, 0, view.s, 0, 0);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
    }
    ctx.clearRect(0, 0, W, SCREEN_H);
    if (this.r3d.scale !== view.s) this.r3d.setScale(view.s);
    if (this.state === 'title') this.drawTitle();
    else this.drawPlay();
    this.touch.render();
  }

  drawPlay() {
    // Snapped to device pixels: scrolling steps by one device pixel, not one
    // logical pixel, and terrain-mounted sprites stay locked to the terrain.
    const cam = this.cam, camD = snap(cam);
    // One shake offset for all three layers, so sprites stay on the terrain.
    const s = this.fx.shake;
    const shake = s ? { x: Math.round(rand(-s, s)), y: Math.round(rand(-s, s)) } : { x: 0, y: 0 };
    bctx.save();
    bctx.translate(shake.x, shake.y);
    this.bg.draw(bctx, cam, this.t);
    bctx.restore();
    this.r3d.render(this, camD, shake);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.translate(shake.x, shake.y);
    this.boss?.draw(ctx, camD);
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e !== this.boss) e.draw(ctx, camD);
    }
    for (let i = 0; i < this.items.length; i++) this.items[i].draw(ctx, camD);
    for (let i = 0; i < this.pbullets.length; i++) this.pbullets[i].draw(ctx, camD);
    for (let i = 0; i < this.bits.length; i++) this.bits[i].draw(ctx, camD);
    if (this.state !== 'clear' || this.player.x - cam < W + 30) this.player.drawCharge(ctx, camD);
    for (let i = 0; i < this.ebullets.length; i++) this.ebullets[i].draw(ctx, camD);
    this.fx.draw(ctx, cam);
    for (let i = 0; i < this.popups.length; i++) {
      const pu = this.popups[i];
      drawText(ctx, pu.text, pu.x - cam, pu.y, pu.color, CENTER);
    }
    if (this.fx.flash) {
      ctx.fillStyle = `rgba(255,255,255,${this.fx.flash / 24})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    this.drawHUD();
    this.drawOverlays();
  }

  drawHUD() {
    const y = H;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, y, W, HUD_H);
    ctx.fillStyle = '#2a3866';
    ctx.fillRect(0, y, W, hair());
    // Reserve ships: a snapshot of the 3D model.
    const icon = this.r3d.shipIcon(Math.round(12 * view.s), Math.round(8 * view.s));
    for (let i = 0; i < Math.min(5, this.lives - 1); i++) {
      ctx.drawImage(icon, 4 + i * 14, y + 4, icon.width / view.s, icon.height / view.s);
    }
    // Beam charge meter
    drawText(ctx, 'BEAM', 80, y + 5, '#6ab0ff');
    const bx = 106, bw = 64;
    meterWell(bx, y + 4, bw, 8, '#2a4a9a');
    const c = this.player?.charge || 0;
    if (c > 0) {
      if (!beamFill) {
        beamFill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        beamFill.addColorStop(0, '#1a4aff');
        beamFill.addColorStop(0.7, '#6ad0ff');
        beamFill.addColorStop(1, '#ffffff');
      }
      ctx.fillStyle = c >= 1 && this.t % 8 < 4 ? '#fff' : beamFill;
      ctx.fillRect(bx + 1, y + 5, (bw - 2) * c, 6);
    }
    this.drawShieldMeter(178, y);
    drawText(ctx, scoreText(this.score), 246, y + 5, '#fff');
    drawText(ctx, hiText(this.hi), 318, y + 5, '#ffd070');
  }

  // A shield glyph and ten 10% cells; the last cell fills partway.
  drawShieldMeter(x, y) {
    const p = this.player;
    const k = p ? p.shield / p.maxShield : 1;
    const blink = this.t % 16 < 8;
    const col = k > 0.5 ? '#3fd8cb' : k > 0.25 ? '#ffc040' : '#ff4a4a';
    ctx.fillStyle = k > 0 || blink ? col : '#5a1a1a';
    ctx.beginPath();
    ctx.moveTo(x, y + 4); ctx.lineTo(x + 7, y + 4); ctx.lineTo(x + 7, y + 8);
    ctx.lineTo(x + 3.5, y + 12); ctx.lineTo(x, y + 8);
    ctx.fill();
    // Shadowed right half: the same hard two-step shading as the 3D models.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(x + 3.5, y + 4); ctx.lineTo(x + 7, y + 4); ctx.lineTo(x + 7, y + 8); ctx.lineTo(x + 3.5, y + 12);
    ctx.fill();
    const sx = x + 10, cells = 10, cw = 4;
    meterWell(sx, y + 4, cells * (cw + 1) + 1, 8, k <= 0.25 && blink ? '#c02a30' : '#1f6a66');
    // Slanted cells, each a parallelogram; the last one fills partway.
    for (let i = 0; i < cells; i++) {
      const cx = sx + 1 + i * (cw + 1);
      ctx.fillStyle = '#0c2222';
      shieldCell(cx, y, cw);
      const fill = clamp(k * cells - i, 0, 1);
      if (fill <= 0) continue;
      ctx.fillStyle = col;
      shieldCell(cx, y, Math.max(1, cw * fill));
    }
  }

  drawOverlays() {
    const mid = H / 2;
    if (this.banner && this.state === 'play') {
      const a = this.banner.t;
      if (a > 20 || a % 4 < 2) {
        drawText(ctx, this.banner.text, W / 2, mid - 20, '#ffffff', { align: 'center', scale: 2, shadow: '#1a3a8a' });
        if (this.banner.sub) drawText(ctx, this.banner.sub, W / 2, mid + 2, '#8ad8ff', { align: 'center' });
      }
    }
    if (this.warning > 0) {
      const on = (this.warning >> 4) % 2 === 0;
      ctx.fillStyle = `rgba(255,0,40,${on ? 0.12 : 0.04})`;
      ctx.fillRect(0, 0, W, H);
      if (on) drawText(ctx, 'WARNING', W / 2, mid - 24, '#ff3a4a', { align: 'center', scale: 3, shadow: '#400010' });
      drawText(ctx, 'A HUGE LIFEFORM IS APPROACHING', W / 2, mid + 6, '#ffb0b0', { align: 'center' });
    }
    if (this.boss && this.boss.state === 'fight') {
      const b = this.boss;
      drawText(ctx, this.stage.bossName, 132, 4, '#ffb0c0');
      ctx.fillStyle = '#300a14';
      ctx.fillRect(132, 13, 120, 4);
      ctx.fillStyle = '#ff3a5a';
      ctx.fillRect(132, 13, 120 * Math.max(0, b.hp / b.maxHp), 4);
      ctx.fillStyle = '#ffb0c0';
      ctx.fillRect(132, 13, 120 * Math.max(0, b.hp / b.maxHp), hair());
    }
    if (this.paused && this.state === 'play') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, 'PAUSED', W / 2, mid - 8, '#fff', { align: 'center', scale: 2 });
      drawText(ctx, 'PRESS P TO RESUME', W / 2, mid + 12, '#8ad8ff', { align: 'center' });
    }
    if (this.state === 'gameover') {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, 'GAME OVER', W / 2, mid - 14, '#ff5a5a', { align: 'center', scale: 3, shadow: '#400010' });
      if (this.stateT > 120 && this.t % 60 < 40) drawText(ctx, 'PRESS ENTER', W / 2, mid + 20, '#fff', { align: 'center' });
    }
    if (this.state === 'clear') {
      const s = this.stateT;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, W, H);
      drawText(ctx, `STAGE ${this.stage.id} CLEAR`, W / 2, 60, '#8affb0', { align: 'center', scale: 3, shadow: '#0a3a1a' });
      if (s > 40) drawText(ctx, 'CLEAR BONUS  ' + this.clearBonus, W / 2, 100, '#fff', { align: 'center' });
      if (s > 70) drawText(ctx, 'SCORE  ' + pad(this.score), W / 2, 114, '#ffd070', { align: 'center' });
      if (s > 100 && this.stageIdx + 1 >= STAGES.length)
        drawText(ctx, `STAGE ${this.stage.id + 1} IS STILL UNDER CONSTRUCTION`, W / 2, 146, '#8ad8ff', { align: 'center' });
      if (s > 120 && this.t % 60 < 40) drawText(ctx, 'PRESS ENTER', W / 2, 176, '#fff', { align: 'center' });
    }
  }

  drawTitle() {
    this.bg.draw(bctx, this.stateT * 0.5, this.t);
    bctx.fillStyle = 'rgba(0,0,10,0.35)';
    bctx.fillRect(0, 0, W, H);
    drawText(ctx, 'X-76', W / 2, 24, '#8ad8ff', { align: 'center', scale: 4, shadow: '#1a2a7a' });
    drawText(ctx, `STAGE ${STAGES[0].id} - ${STAGES[0].name}`, W / 2, 60, '#ffd070', { align: 'center' });

    this.r3d.renderTitle(this.t);

    const lines = [
      ['ARROWS / WASD', 'MOVE'],
      ['Z / SPACE', 'SHOOT - HOLD TO CHARGE BEAM'],
      ['X / SHIFT', 'LAUNCH / RECALL POD'],
      ['P  M  F', 'PAUSE  MUTE  FULLSCREEN'],
    ];
    lines.forEach(([k, v], i) => {
      drawText(ctx, k, 150, 130 + i * 12, '#ffffff', { align: 'right' });
      drawText(ctx, v, 162, 130 + i * 12, '#9ab0d0');
    });
    if (this.t % 60 < 40) drawText(ctx, 'PRESS ENTER OR FIRE', W / 2, 184, '#ffffff', { align: 'center', scale: 1 });
    drawText(ctx, 'HI ' + pad(this.hi), W / 2, 204, '#ffd070', { align: 'center' });

    ctx.fillStyle = '#000';
    ctx.fillRect(0, H, W, HUD_H);
    drawText(ctx, 'GAMEPAD SUPPORTED', W / 2, H + 5, '#445', { align: 'center' });
  }
}

// ---- debug warp -------------------------------------------------------------
// "pod:red:3,speed:2,missile,bits:2" -> a loadout for applyLoadout().
function parsePower(str) {
  const kit = {};
  for (const tok of str.split(',')) {
    const [k, a, b] = tok.trim().toLowerCase().split(':');
    if (k === 'pod') kit.pod = { color: CRYSTAL_COLORS.includes(a) ? a : 'red', level: +b || 1 };
    else if (k === 'speed') kit.speed = +a || 1;
    else if (k === 'missile') kit.missile = true;
    else if (k === 'bits' || k === 'bit') kit.bits = +a || 1;
    else if (k === 'shield') kit.shield = +a || 0;
    else if (k) console.warn(`power: unknown power-up "${tok}"`);
  }
  return kit;
}

// Any warp param skips the title. Returns null when there are none.
function readWarp() {
  const q = new URLSearchParams(location.search);
  if (!['stage', 'cp', 'cam', 'boss', 'god', 'power'].some((k) => q.has(k))) return null;
  const num = (k) => (q.get(k) && Number.isFinite(+q.get(k)) ? +q.get(k) : undefined);
  const flag = (k) => (q.has(k) ? q.get(k) !== '0' : undefined);
  return {
    stage: num('stage'), cp: num('cp'), cam: num('cam'),
    boss: flag('boss'), god: flag('god'), power: q.get('power') || undefined,
  };
}

// ---- boot -------------------------------------------------------------------
// The canvas fills as much of the window as the aspect ratio allows, and its
// backing store matches that size in device pixels (capped at MAX_SCALE) so
// both layers draw at display resolution. The 3D layer and the pre-rendered
// caches pick the new scale up on their next draw.
function fit() {
  // Subtract body's safe-area padding (style.css) so the notch and home
  // indicator never overlap the play-field when running edge to edge.
  const pad = getComputedStyle(document.body);
  const w = innerWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const h = innerHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  const k = Math.max(0.25, Math.min(w / W, h / SCREEN_H));   // CSS px per logical px
  const dpr = devicePixelRatio || 1;
  const s = Math.min(MAX_SCALE, k * dpr);
  const cw = Math.round(W * s), ch = Math.round(SCREEN_H * s);
  for (const c of [backCanvas, canvas]) {
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
  }
  // The front canvas and the WebGL layer size themselves to this one in CSS.
  backCanvas.style.width = `${W * k}px`;
  backCanvas.style.height = `${SCREEN_H * k}px`;
  setViewScale(cw / W);
}
addEventListener('resize', fit);
// Not every browser fires 'resize' on fullscreen enter/exit.
addEventListener('fullscreenchange', fit);
// Nor when the window moves to a screen with a different pixel ratio.
(function watchDpr() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener('change', () => { fit(); watchDpr(); }, { once: true });
})();
fit();

// Without WebGL there's no game to show (DECISIONS §21), so say why instead.
function showWebGLRequired() {
  document.getElementById('screen3d').style.display = 'none';
  const draw = () => {
    ctx.setTransform(view.s, 0, 0, view.s, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, SCREEN_H);
    drawText(ctx, 'X-76', W / 2, 40, '#8ad8ff', { align: 'center', scale: 4, shadow: '#1a2a7a' });
    drawText(ctx, 'WEBGL REQUIRED', W / 2, 100, '#ff5a5a', { align: 'center', scale: 2, shadow: '#400010' });
    drawText(ctx, 'THIS BROWSER COULD NOT START WEBGL.', W / 2, 136, '#9ab0d0', { align: 'center' });
    drawText(ctx, 'TURN ON HARDWARE ACCELERATION', W / 2, 152, '#9ab0d0', { align: 'center' });
    drawText(ctx, 'OR TRY ANOTHER BROWSER.', W / 2, 164, '#9ab0d0', { align: 'center' });
  };
  draw();
  // fit() clears the canvas when it resizes it; these run after its listeners.
  addEventListener('resize', draw);
  addEventListener('fullscreenchange', draw);
}

const STEP = 1000 / 60;
let last = performance.now(), acc = 0;
let game;
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(100, now - last);
  last = now;
  try {
    while (acc >= STEP) {
      game.update();
      acc -= STEP;
    }
    game.draw();
  } catch (err) {
    // Keep the loop alive; a single bad frame shouldn't freeze the game.
    acc = 0;
    console.error(err);
  }
}

const r3d = Render3D.create(document.getElementById('screen3d'));
const smoke = new URLSearchParams(location.search).has('smoke');
if (!r3d) {
  showWebGLRequired();
  if (smoke) (await import('./smoke.js')).reportNoWebGL();
} else {
  game = new Game(r3d);
  window.game = game; // handy for debugging from the console
  const warp = readWarp();
  if (warp) game.warp(warp);
  // ?smoke=1: run headlessly instead of on rAF, see tools/smoke.py. A
  // top-level await here holds the page's load event until it's done.
  if (smoke) (await import('./smoke.js')).runSmoke(game);
  else if (new URLSearchParams(location.search).has('bench')) (await import('./bench.js')).runBench(game);
  else requestAnimationFrame(frame);
}
