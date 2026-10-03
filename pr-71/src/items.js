// Power-up items dropped by carrier enemies.
import { TAU } from './util.js';
import { drawText } from './font.js';
import { snap } from './view.js';

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

  draw(ctx, cam) {
    const x = snap(this.x - cam), y = snap(this.y);
    ctx.save();
    ctx.translate(x, y);
    if (this.type === 'crystal') {
      const hue = LASER_HUE[this.color];
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, 13);
      gl.addColorStop(0, hue.glow);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gl;
      ctx.globalAlpha = 0.6 + Math.sin(this.t * 0.2) * 0.2;
      ctx.fillRect(-13, -13, 26, 26);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const s = Math.cos(this.t * 0.08);
      ctx.scale(Math.abs(s) * 0.7 + 0.3, 1);
      ctx.fillStyle = hue.dark;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 8); ctx.lineTo(-6, 0);
      ctx.fill();
      ctx.fillStyle = hue.glow;
      ctx.beginPath();
      ctx.moveTo(0, -8); ctx.lineTo(6, 0); ctx.lineTo(0, 2); ctx.lineTo(-6, 0);
      ctx.fill();
      // Facet glint along the upper-left edge.
      ctx.fillStyle = hue.core;
      ctx.beginPath();
      ctx.moveTo(0, -6.5); ctx.lineTo(-4.5, -0.5); ctx.lineTo(-3.5, -0.5); ctx.lineTo(0, -5);
      ctx.fill();
    } else if (this.type === 'shield') {
      // A hexagonal cell with a plus: reads as "repair", unlike the round letter pods.
      const hex = (r) => {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * TAU / 6) * r, Math.sin(i * TAU / 6) * r);
        ctx.closePath();
      };
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(63,216,203,${0.25 + Math.sin(this.t * 0.2) * 0.1})`;
      hex(11);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#0e4a4a';
      hex(8);
      ctx.fill();
      ctx.strokeStyle = '#6af0e0';
      ctx.lineWidth = 1.5;
      ctx.rotate(this.t * 0.03);
      hex(7);
      ctx.stroke();
      ctx.rotate(-this.t * 0.03);
      ctx.fillStyle = '#e8fffb';
      ctx.fillRect(-1, -4, 2, 8);
      ctx.fillRect(-4, -1, 8, 2);
    } else {
      const cfg = {
        speed: ['#1c4a9a', '#6ab0ff', 'S'],
        missile: ['#1a7a3a', '#6aff9a', 'M'],
        bit: ['#6a2a9a', '#d08aff', 'B'],
      }[this.type];
      ctx.fillStyle = cfg[0];
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = cfg[1];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 7, this.t * 0.1, this.t * 0.1 + 4.5);
      ctx.stroke();
      // An angular glint rather than a block, matching the cel-shaded models.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(-3.5, -6); ctx.lineTo(-1.5, -6.8); ctx.lineTo(-5, -1.8);
      ctx.fill();
      drawText(ctx, cfg[2], 0, -3, '#fff', { align: 'center', shadow: cfg[0] });
    }
    ctx.restore();
  }
}
