// Power-up items dropped by carrier enemies (drawn by models/pickups.js).

export const CRYSTAL_COLORS = ['red', 'blue', 'yellow'];
export const LASER_HUE = {
  red: { core: '#fff0e0', glow: '#ff5a2a', dark: '#a01808' },
  blue: { core: '#e8fbff', glow: '#3ac8ff', dark: '#0a4a9a' },
  yellow: { core: '#fffbe0', glow: '#ffd82a', dark: '#8a6a00' },
};

export class PowerItem {
  constructor(g, x, y, type) {
    this.g = g;
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.type = type;
    this.r = 9;
    this.t = 0;
    this.dead = false;
  }

  // Crystals cycle colour so the player can choose which laser to collect.
  get color() {
    return CRYSTAL_COLORS[Math.floor(this.t / 110) % 3];
  }

  update() {
    const g = this.g;
    this.t++;
    this.x += g.scrollDelta - 0.35;
    this.y = this.baseY + Math.sin(this.t * 0.05) * 6;
    if (this.x - g.cam < -20) this.dead = true;
  }
}
