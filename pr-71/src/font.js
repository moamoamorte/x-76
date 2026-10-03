// Angular stroke font on the old 5x7 grid. Glyphs are polylines through pixel
// centres (x 0-4, y 0-6) with 45-degree chamfers where a bitmap font would
// round a corner, stroked at display resolution so diagonals stay clean at any
// scale. Metrics match the old bitmap font (6px advance, 7px cap height), so
// layout code doesn't change.
import { view, snap } from './view.js';

// Parts are separated by '|'. A part is a polyline of "x,y" points (closed if
// it ends where it starts), or '*x,y' for a square dot.
const GLYPHS = {
  A: '0,6 0,1 1,0 3,0 4,1 4,6|0,3 4,3',
  B: '0,3 3,3 4,4 4,5 3,6 0,6 0,0 3,0 4,1 4,2 3,3',
  C: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
  D: '0,0 3,0 4,1 4,5 3,6 0,6 0,0',
  E: '4,0 0,0 0,6 4,6|0,3 3,3',
  F: '4,0 0,0 0,6|0,3 3,3',
  G: '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3 2,3',
  H: '0,0 0,6|4,0 4,6|0,3 4,3',
  I: '1,0 3,0|2,0 2,6|1,6 3,6',
  J: '1,0 4,0 4,5 3,6 1,6 0,5',
  K: '0,0 0,6|4,0 1,3 4,6|0,3 1,3',
  L: '0,0 0,6 4,6',
  M: '0,6 0,0 2,3 4,0 4,6',
  N: '0,6 0,0 4,6 4,0',
  O: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0',
  P: '0,6 0,0 3,0 4,1 4,2 3,3 0,3',
  Q: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|2,4 4,6',
  R: '0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6',
  S: '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5',
  T: '0,0 4,0|2,0 2,6',
  U: '0,0 0,5 1,6 3,6 4,5 4,0',
  V: '0,0 0,3 2,6 4,3 4,0',
  W: '0,0 0,6 2,3 4,6 4,0',
  X: '0,0 4,6|4,0 0,6',
  Y: '0,0 2,3 4,0|2,3 2,6',
  Z: '0,0 4,0 0,6 4,6',
  0: '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|3,2 1,4',
  1: '1,1 2,0 2,6|1,6 3,6',
  2: '0,1 1,0 3,0 4,1 4,2 0,6 4,6',
  3: '0,1 1,0 3,0 4,1 4,2 3,3 1,3|3,3 4,4 4,5 3,6 1,6 0,5',
  4: '3,6 3,0 0,4 4,4',
  5: '4,0 0,0 0,2 3,2 4,3 4,5 3,6 1,6 0,5',
  6: '3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3',
  7: '0,0 4,0 4,1 1,4 1,6',
  8: '1,0 3,0 4,1 4,2 3,3 1,3 0,2 0,1 1,0|1,3 3,3 4,4 4,5 3,6 1,6 0,5 0,4 1,3',
  9: '1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,2 1,3 4,3',
  '-': '0,3 4,3', '.': '*1.5,5.5', '!': '2,0 2,4|*2,6', ':': '*1.5,1.5|*1.5,4.5',
  '/': '4,0 0,6', '?': '0,1 1,0 3,0 4,1 4,2 2,3.5 2,4|*2,6', ',': '*1.5,4.5|2,5 1,6',
  "'": '2,0 2,1 1,2', '(': '3,0 1,2 1,4 3,6', ')': '1,0 3,2 3,4 1,6',
  '+': '2,1 2,5|0,3 4,3', '=': '0,2 4,2|0,4 4,4', '>': '1,0 4,3 1,6',
  '<': '3,0 0,3 3,6', ' ': '', '%': '*0.5,0.5|4,0 0,6|*3.5,5.5',
};

const parse = (src) => src ? src.split('|').map((part) => {
  const dot = part[0] === '*';
  const pts = (dot ? part.slice(1) : part).split(' ').map((p) => p.split(',').map(Number));
  return { dot, pts };
}) : [];
const PARSED = {};
for (const ch in GLYPHS) PARSED[ch] = parse(GLYPHS[ch]);

const STROKE = 0.9;   // in font pixels; a touch under 1 so it reads finer than the old blocks
const DOT = 1.5;
const PAD = 1;        // square caps and miters poke slightly outside the 5x7 box

const cache = new Map();

// k = device pixels per font pixel.
function renderText(str, color, shadow, k) {
  const cw = 6;
  const w = Math.max(1, str.length * cw);
  const cv = document.createElement('canvas');
  cv.width = Math.round((w + 1 + PAD * 2) * k);
  cv.height = Math.round((8 + PAD * 2) * k);
  cv.lw = w + 1;
  const c = cv.getContext('2d');
  c.setTransform(k, 0, 0, k, PAD * k, PAD * k);
  c.lineWidth = STROKE;
  c.lineCap = 'square';
  c.lineJoin = 'miter';
  // Strokes and dots go in separate paths: filling the dots' path would also
  // fill closed letter outlines.
  const pass = (col, ox, oy) => {
    const lines = new Path2D(), dots = new Path2D();
    for (let i = 0; i < str.length; i++) {
      const gx = i * cw + ox + 0.5, gy = oy + 0.5;
      for (const { dot, pts } of PARSED[str[i]] || PARSED['?']) {
        if (dot) {
          dots.rect(gx + pts[0][0] - DOT / 2, gy + pts[0][1] - DOT / 2, DOT, DOT);
          continue;
        }
        const n = pts.length;
        const closed = n > 2 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1];
        lines.moveTo(gx + pts[0][0], gy + pts[0][1]);
        for (let j = 1; j < (closed ? n - 1 : n); j++) lines.lineTo(gx + pts[j][0], gy + pts[j][1]);
        if (closed) lines.closePath();
      }
    }
    c.fillStyle = c.strokeStyle = col;
    c.stroke(lines);
    c.fill(dots);
  };
  if (shadow) pass(shadow, 1, 1);
  pass(color, 0, 0);
  return cv;
}

// Draw text at (x, y). align: 'left' | 'center' | 'right'. scale: integer size multiplier.
export function drawText(ctx, str, x, y, color = '#fff', { align = 'left', scale = 1, shadow = '#000' } = {}) {
  str = String(str).toUpperCase();
  const k = view.s * scale;
  const key = str + '|' + color + '|' + shadow + '|' + k;
  let cv = cache.get(key);
  if (!cv) {
    cv = renderText(str, color, shadow, k);
    if (cache.size > 400) cache.clear();
    cache.set(key, cv);
  }
  const w = cv.lw * scale;
  let dx = x;
  if (align === 'center') dx = x - w / 2;
  else if (align === 'right') dx = x - w;
  // Destination size is the cache's own device size, so the blit is 1:1.
  ctx.drawImage(cv, snap(dx - PAD * scale), snap(y - PAD * scale), cv.width / view.s, cv.height / view.s);
}
