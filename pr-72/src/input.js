// Keyboard + gamepad input with per-step edge detection.
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'fire', KeyZ: 'fire', KeyJ: 'fire',
  KeyX: 'pod', ShiftLeft: 'pod', ShiftRight: 'pod', KeyK: 'pod',
  Enter: 'start',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  KeyF: 'fullscreen',
};

// Fallback by `key` value for browsers/layouts that don't report `code`.
const KEY_FALLBACK = {
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
  ' ': 'Space', Enter: 'Enter', Escape: 'Escape', Shift: 'ShiftLeft',
};
function keyId(e) {
  if (KEYMAP[e.code]) return e.code;
  if (KEY_FALLBACK[e.key]) return KEY_FALLBACK[e.key];
  if (e.key && e.key.length === 1) {
    const id = 'Key' + e.key.toUpperCase();
    if (KEYMAP[id]) return id;
  }
  return null;
}

export class Input {
  constructor() {
    this.keys = new Set();     // codes currently held
    this.tapped = new Set();   // actions pressed since last poll (so quick taps aren't lost)
    this.touchHeld = new Set(); // actions currently held via touch controls, by action name
    this.down = {};
    this.prev = {};
    this.onFirstInput = null;

    addEventListener('keydown', (e) => {
      const id = keyId(e);
      if (!id) return;
      e.preventDefault();
      if (!e.repeat) this.tapped.add(KEYMAP[id]);
      this.keys.add(id);
      this.onFirstInput?.();
    });
    addEventListener('keyup', (e) => {
      const id = keyId(e);
      if (!id) return;
      e.preventDefault();
      this.keys.delete(id);
    });
    addEventListener('blur', () => this.keys.clear());
    addEventListener('pointerdown', () => this.onFirstInput?.());
  }

  // Touch controls press/release actions directly (no key code to translate).
  touchPress(action) {
    if (!this.touchHeld.has(action)) this.tapped.add(action);
    this.touchHeld.add(action);
    this.onFirstInput?.();
  }
  touchRelease(action) {
    this.touchHeld.delete(action);
  }

  poll() {
    this.prev = this.down;
    const d = {};
    for (const c of this.keys) d[KEYMAP[c]] = true;
    for (const a of this.touchHeld) d[a] = true;
    for (const a of this.tapped) d[a] = true;
    this.tapped.clear();

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (i) => p.buttons[i]?.pressed;
      if (ax < -0.4 || b(14)) d.left = true;
      if (ax > 0.4 || b(15)) d.right = true;
      if (ay < -0.4 || b(12)) d.up = true;
      if (ay > 0.4 || b(13)) d.down = true;
      if (b(0) || b(7)) d.fire = true;
      if (b(1) || b(2) || b(6)) d.pod = true;
      if (b(9)) { d.start = true; d.pause = true; }
      if (Object.keys(d).length) this.onFirstInput?.();
    }
    this.down = d;
  }

  held(a) { return !!this.down[a]; }
  pressed(a) { return !!this.down[a] && !this.prev[a]; }
  released(a) { return !this.down[a] && !!this.prev[a]; }
}
