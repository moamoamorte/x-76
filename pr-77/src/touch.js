// Touch controls: a floating virtual stick plus fire/pod/pause buttons that
// feed the same Input actions as keyboard and gamepad, so gameplay code does
// not know the difference. Only shown on coarse pointers (touchscreens) or
// after the first real touch, so a desktop mouse never sees it.
//
// Movement here is a per-frame boolean step (see player.js), not an analog
// velocity, so the stick reports up to two directions (8-way) past a dead
// zone rather than a "relative drag" delta - a drag scheme suits analog
// velocity control, which this game doesn't have.
const STICK_RADIUS = 44;     // px, the knob's max travel from the stick centre
const DEAD_ZONE = 0.12;      // fraction of STICK_RADIUS before any direction fires
const DIR_THRESHOLD = 0.35;  // fraction of the drag's own magnitude needed per axis

// Exported so both the keyboard 'F' binding (main.js) and the touch FS
// button (below) can call it. requestFullscreen() can be missing entirely
// (e.g. older iOS Safari), so guard every step with optional chaining.
export function toggleFullscreen() {
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  document.documentElement.requestFullscreen?.()?.catch((err) => console.warn('fullscreen request failed:', err));
}

// True when launched from the Home Screen (iOS sets navigator.standalone;
// everything else reports the manifest's display mode).
function isStandalone() {
  return navigator.standalone === true
    || matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.active = false;
    this.stickPointer = null;   // pointerId currently driving the stick
    this.stickOrigin = { x: 0, y: 0 };
    this.stickDir = { x: 0, y: 0 };
    this.buildDom();
    this.wireStick();
    this.wireButtons();
    this.wireDoubleTapGuard();
    this.wireVisibility();
  }

  buildDom() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="touchStart" class="touchZone"></div>
      <div id="touchStickZone" class="touchZone">
        <div id="touchStick"><div id="touchStickKnob"></div></div>
      </div>
      <button id="touchPod" class="touchBtn" aria-label="Pod">POD</button>
      <button id="touchFire" class="touchBtn touchBtnBig" aria-label="Fire">
        <div id="touchFireRing"></div>FIRE
      </button>
      <button id="touchFull" class="touchBtn touchBtnSmall" aria-label="Fullscreen">FS</button>
      <button id="touchPause" class="touchBtn touchBtnSmall" aria-label="Pause">II</button>
      <div id="touchPauseMenu">
        <button id="touchMute" class="touchBtn touchBtnFlat">MUTE</button>
      </div>
    `;
    document.getElementById('wrap').appendChild(root);
    this.root = root;
    this.stickZone = root.querySelector('#touchStickZone');
    this.stickEl = root.querySelector('#touchStick');
    this.knobEl = root.querySelector('#touchStickKnob');
    this.fireRing = root.querySelector('#touchFireRing');
    this.pauseMenu = root.querySelector('#touchPauseMenu');
    this.startZone = root.querySelector('#touchStart');
  }

  // Binds a button/zone to press-and-release an Input action across pointer
  // lifetime, tracking the pointerId so a finger sliding off still releases.
  // preventDefault() on every stage (not just pointerdown) is belt-and-
  // suspenders against iOS Safari still treating fast repeated taps as a
  // double-tap-zoom gesture; see #47.
  bindAction(el, action) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('on');
      this.input.touchPress(action);
    });
    const end = (e) => {
      e.preventDefault();
      el.classList.remove('on');
      this.input.touchRelease(action);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  wireButtons() {
    this.bindAction(this.root.querySelector('#touchFire'), 'fire');
    this.bindAction(this.root.querySelector('#touchPod'), 'pod');
    this.bindAction(this.root.querySelector('#touchPause'), 'pause');
    this.bindAction(this.root.querySelector('#touchMute'), 'mute');
    // A tap anywhere on the title/game-over/clear screen acts as start.
    this.bindAction(this.startZone, 'start');
    this.wireFullscreenButton();
  }

  // Fullscreen can't go through bindAction()/Input like the other buttons:
  // requestFullscreen() must run synchronously inside the gesture's own
  // event handler, or Safari silently ignores it. Routing it through the
  // polled Input action (press this frame, read on next game.update()) put
  // a requestAnimationFrame tick between the tap and the call, which is
  // exactly what broke it - see #50.
  //
  // It also has to be a *touch* event, not a pointer one: WebKit doesn't
  // count PointerEvents towards "user activation" for gated APIs like
  // requestFullscreen(), only touchend/click/keydown do. pointerdown/up are
  // still used for the button's visual press state (that doesn't need a
  // real gesture), but the actual toggleFullscreen() call is wired to
  // touchend, or Safari silently no-ops it exactly as it did before #50 and
  // #52's fixes - neither of those touched the event type, which is why the
  // button kept failing on-device after both landed.
  wireFullscreenButton() {
    const el = this.root.querySelector('#touchFull');
    // Launched from the Home Screen there's no browser UI left to hide.
    if (isStandalone()) {
      el.remove();
      return;
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('on');
    });
    el.addEventListener('pointerup', (e) => { e.preventDefault(); el.classList.remove('on'); });
    el.addEventListener('pointercancel', () => el.classList.remove('on'));
    // iPhone Safari has no element Fullscreen API on any iOS version (iPadOS
    // 16.4 added it for iPad only), so no event wiring can make the call
    // work there. Running as a Home Screen web app is the only way to lose
    // the browser UI, so the button explains that instead (#56).
    const onTap = typeof document.documentElement.requestFullscreen === 'function'
      ? toggleFullscreen
      : () => this.showHomeScreenHint();
    el.addEventListener('touchend', (e) => {
      e.preventDefault();
      onTap();
    });
  }

  // Lives in #wrap rather than #touch so the double-tap guard on #touch
  // can't veto the tap that closes it.
  showHomeScreenHint() {
    const g = this.game;
    const pausedHere = g.state === 'play' && !g.paused;
    if (pausedHere) g.setPaused(true);
    const hint = document.createElement('button');
    hint.id = 'homeScreenHint';
    hint.innerHTML = `
      <b>FULLSCREEN ON IPHONE</b>
      <span>Safari can't hide its toolbars for a web page.<br>
      Instead, open Safari's Share menu, choose<br>
      <b>Add to Home Screen</b>, then start X-76 from that icon.</span>
      <i>TAP TO CLOSE</i>
    `;
    hint.addEventListener('click', () => {
      hint.remove();
      if (pausedHere && g.paused) g.setPaused(false);
    });
    document.getElementById('wrap').appendChild(hint);
  }

  // The standard fix for "double-tap zooms the page" on iOS Safari: touch-
  // action and per-element preventDefault aren't always enough for two fast
  // taps on the same button (e.g. rapid-firing), so also veto any touchend
  // that follows another one within a normal double-tap window. See #47.
  wireDoubleTapGuard() {
    let lastEnd = 0;
    this.root.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastEnd < 350) e.preventDefault();
      lastEnd = now;
    }, { passive: false });
  }

  wireStick() {
    const setDir = (ax, ay) => {
      const flip = (v, neg, pos) => {
        if (v < 0) { this.input.touchRelease(pos); this.input.touchPress(neg); }
        else if (v > 0) { this.input.touchRelease(neg); this.input.touchPress(pos); }
        else { this.input.touchRelease(neg); this.input.touchRelease(pos); }
      };
      flip(ax, 'left', 'right');
      flip(ay, 'up', 'down');
      this.stickDir = { x: ax, y: ay };
    };

    this.stickZone.addEventListener('pointerdown', (e) => {
      if (this.stickPointer !== null) return;
      e.preventDefault();
      this.stickZone.setPointerCapture(e.pointerId);
      this.stickPointer = e.pointerId;
      const r = this.stickZone.getBoundingClientRect();
      this.stickOrigin = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.stickEl.style.left = `${this.stickOrigin.x}px`;
      this.stickEl.style.top = `${this.stickOrigin.y}px`;
      this.stickEl.classList.add('on');
    });

    this.stickZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickPointer) return;
      e.preventDefault();
      const r = this.stickZone.getBoundingClientRect();
      const dx = (e.clientX - r.left) - this.stickOrigin.x;
      const dy = (e.clientY - r.top) - this.stickOrigin.y;
      const mag = Math.hypot(dx, dy);
      const clamped = Math.min(mag, STICK_RADIUS);
      const kx = mag > 0 ? (dx / mag) * clamped : 0;
      const ky = mag > 0 ? (dy / mag) * clamped : 0;
      this.knobEl.style.transform = `translate(${kx}px, ${ky}px)`;

      let ax = 0, ay = 0;
      if (mag > STICK_RADIUS * DEAD_ZONE) {
        if (dx / mag < -DIR_THRESHOLD) ax = -1;
        else if (dx / mag > DIR_THRESHOLD) ax = 1;
        if (dy / mag < -DIR_THRESHOLD) ay = -1;
        else if (dy / mag > DIR_THRESHOLD) ay = 1;
      }
      if (ax !== this.stickDir.x || ay !== this.stickDir.y) setDir(ax, ay);
    });

    const end = (e) => {
      if (e.pointerId !== this.stickPointer) return;
      e.preventDefault();
      this.stickPointer = null;
      this.stickEl.classList.remove('on');
      this.knobEl.style.transform = '';
      setDir(0, 0);
    };
    this.stickZone.addEventListener('pointerup', end);
    this.stickZone.addEventListener('pointercancel', end);
  }

  wireVisibility() {
    const enable = () => {
      if (this.active) return;
      this.active = true;
      this.root.classList.add('active');
    };
    if (matchMedia('(pointer: coarse)').matches) enable();
    else {
      const onFirstTouch = (e) => {
        if (e.pointerType !== 'touch') return;
        enable();
        removeEventListener('pointerdown', onFirstTouch);
      };
      addEventListener('pointerdown', onFirstTouch);
    }
  }

  // Called once per drawn frame from Game.draw() to sync DOM state that
  // depends on game state (charge ring, pause menu, start-tap overlay).
  render() {
    if (!this.active) return;
    const g = this.game;
    this.startZone.classList.toggle('on', g.state !== 'play');
    this.pauseMenu.classList.toggle('on', g.state === 'play' && g.paused);
    const charge = g.state === 'play' ? (g.player?.charge || 0) : 0;
    this.fireRing.style.setProperty('--chargeDeg', `${charge * 360}deg`);
    this.fireRing.style.opacity = charge > 0 ? '1' : '0';
  }
}
