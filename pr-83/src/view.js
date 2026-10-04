// Display scale: how many device pixels one logical pixel covers. Set by
// fit() in main.js from the window size × devicePixelRatio. Only drawing reads
// it; gameplay stays in the 384×240 logical space.
export const MAX_SCALE = 6;   // past this the browser upscales; keeps 4K fill-rate and cache memory sane

export const view = { s: 1, gen: 0 };

export function setViewScale(s) {
  if (s === view.s) return;
  view.s = s;
  view.gen++;    // caches compare against this to know when to rebuild
}

// Round a logical coordinate to the nearest device pixel, so blits and sprite
// origins land on whole pixels at fractional scales.
export const snap = (x) => Math.round(x * view.s) / view.s;

// An offscreen canvas w×h logical pixels big at the current scale, with its
// context already drawing in logical pixels. Blit it with drawImage(cv, x, y,
// cv.lw, cv.lh) so it maps 1:1 onto device pixels.
export function scaledCanvas(w, h, s = view.s) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * s));
  cv.height = Math.max(1, Math.round(h * s));
  cv.lw = w;
  cv.lh = h;
  const c = cv.getContext('2d');
  c.setTransform(cv.width / w, 0, 0, cv.height / h, 0, 0);
  return { cv, c };
}
