// All sound is synthesised at runtime with Web Audio – no audio files.

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function noteFreq(tok) {
  const m = /^([A-G]#?)(\d)$/.exec(tok);
  if (!m) return null;
  const midi = 12 * (+m[2] + 1) + NOTE_INDEX[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const seq = (s) => s.trim().split(/\s+/).map((t) => (t === '-' ? null : t === 'x' ? 1 : noteFreq(t)));

// Original compositions (A minor stage theme, E phrygian boss theme).
const SONGS = {
  stage: {
    bpm: 132,
    tracks: [
      { kind: 'bass', notes: seq(`
        A1 - A2 A1 - A1 A2 - A1 - A2 A1 G1 - G2 -
        A1 - A2 A1 - A1 A2 - C2 - C3 C2 B1 - B2 -
        F1 - F2 F1 - F1 F2 - F1 - F2 F1 E1 - E2 -
        G1 - G2 G1 - G1 G2 - G1 - G2 G1 E1 - E2 -`) },
      { kind: 'lead', notes: seq(`
        E4 - - A4 - - B4 - C5 - B4 - A4 - E4 -
        G4 - - A4 - - E4 - D4 - E4 - - - - -
        F4 - - A4 - - C5 - D5 - C5 - A4 - F4 -
        G4 - - B4 - - D5 - E5 - - - D5 - B4 -
        E5 - - D5 - - C5 - B4 - C5 - A4 - - -
        G4 - - A4 - - B4 - C5 - D5 - E5 - - -
        F5 - - E5 - - D5 - C5 - A4 - C5 - D5 -
        E5 - - - B4 - - - G#4 - - - E4 - - -`) },
      { kind: 'kick', notes: seq('x - - - x - - - x - - - x - x -') },
      { kind: 'snare', notes: seq('- - - - x - - - - - - - x - - x') },
      { kind: 'hat', notes: seq('- - x - - - x - - - x - - - x x') },
    ],
  },
  boss: {
    bpm: 150,
    tracks: [
      { kind: 'bass', notes: seq(`
        E1 E1 E2 E1 F1 E1 E2 E1 E1 E1 E2 E1 A#1 A1 G1 F1
        E1 E1 E2 E1 F1 E1 E2 E1 D1 D1 D2 D1 F1 E1 D1 C1`) },
      { kind: 'lead', notes: seq(`
        E4 - - - F4 - - - E4 - - - A#4 - A4 -
        G4 - - - F4 - - - E4 - - - - - - -
        B4 - - - C5 - - - B4 - - - F5 - E5 -
        D5 - - - C5 - - - B4 - A#4 - A4 - G4 -`) },
      { kind: 'kick', notes: seq('x - - x x - - - x - - x x - x -') },
      { kind: 'snare', notes: seq('- - - - x - - - - - - - x - - -') },
      { kind: 'hat', notes: seq('x - x - x - x - x - x - x x x x') },
    ],
  },
  clear: {
    bpm: 140, once: true,
    tracks: [
      { kind: 'lead', notes: seq('C5 - E5 - G5 - C6 - - - G5 - C6 - - - - - - -') },
      { kind: 'bass', notes: seq('C2 - - - G2 - - - C3 - - - - - - - - - - -') },
    ],
  },
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.last = {};
    this.song = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.6;
    this.sfx.connect(this.master);
    this.mus = ctx.createGain();
    this.mus.gain.value = 0.26;
    this.mus.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (this.pendingSong) this.music(this.pendingSong);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
  }

  // ---- primitives -------------------------------------------------------
  tone(f0, f1, dur, type = 'square', vol = 0.15, delay = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, f0, f1 = f0, type = 'lowpass', q = 1, delay = 0, dest = this.sfx) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.02);
  }

  // ---- sound effects ----------------------------------------------------
  play(name, arg = 0) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const gap = { hit: 0.05, tink: 0.06, eshot: 0.07, shot: 0.03, explodeS: 0.04 }[name] ?? 0.02;
    if (now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;

    switch (name) {
      case 'shot':
        this.tone(1800, 500, 0.07, 'square', 0.06);
        this.thump(1);
        break;
      case 'laser':
        this.tone(900, 1600, 0.1, 'sawtooth', 0.05);
        this.tone(450, 800, 0.1, 'square', 0.03);
        break;
      case 'beam': {
        const l = arg;
        this.tone(220 + l * 40, 60, 0.25 + l * 0.08, 'sawtooth', 0.12);
        this.tone(880, 110, 0.2 + l * 0.05, 'square', 0.06);
        this.noise(0.25 + l * 0.08, 0.15, 4000, 300, 'bandpass', 2);
        this.thump(1 + l * 0.4);
        break;
      }
      case 'missile':
        this.noise(0.18, 0.08, 2500, 800, 'bandpass', 3);
        break;
      case 'eshot':
        this.tone(600, 300, 0.08, 'triangle', 0.05);
        break;
      case 'hit':
        this.tone(300, 120, 0.05, 'square', 0.06);
        break;
      case 'tink':
        this.tone(2400, 2000, 0.05, 'square', 0.04);
        break;
      case 'explodeS':
        this.noise(0.25, 0.25, 3000, 200);
        this.tone(160, 40, 0.2, 'triangle', 0.15);
        break;
      case 'explodeM':
        this.noise(0.5, 0.35, 2000, 80);
        this.tone(120, 30, 0.4, 'triangle', 0.25);
        break;
      case 'explodeL':
        this.noise(1.2, 0.5, 1500, 40);
        this.tone(90, 20, 1.0, 'sawtooth', 0.2);
        this.noise(0.8, 0.3, 600, 40, 'lowpass', 1, 0.15);
        break;
      case 'powerup':
        [0, 4, 7, 12, 16].forEach((n, i) =>
          this.tone(523 * Math.pow(2, n / 12), 523 * Math.pow(2, n / 12), 0.12, 'square', 0.07, i * 0.05));
        break;
      case 'podLaunch':
        this.tone(200, 900, 0.18, 'sawtooth', 0.08);
        break;
      case 'podClamp':
        // Claws biting onto the hull: a dull knock and a pitched-down clank,
        // then a tick as they seat (~0.09 s, when the 3D snap completes).
        this.noise(0.08, 0.22, 1200, 250, 'lowpass', 1);
        this.tone(400, 150, 0.07, 'square', 0.08);
        this.tone(3200, 2600, 0.03, 'square', 0.035, 0.09);
        break;
      case 'podRelease':
        // Claws springing open: an airy hiss, quieter than the clamp.
        this.noise(0.12, 0.1, 3500, 700, 'bandpass', 1.5);
        break;
      case 'shieldHit':
        // A bright zap; it drops low and buzzes when the hit empties the shield.
        this.tone(arg ? 600 : 1600, arg ? 70 : 500, 0.16 + arg * 0.12, arg ? 'sawtooth' : 'square', 0.09);
        this.noise(0.12, 0.16, 7000, 2000, 'highpass', 1);
        break;
      case 'shieldUp':
        [0, 7, 12].forEach((n, i) => this.tone(659 * Math.pow(2, n / 12), 880 * Math.pow(2, n / 12), 0.1, 'triangle', 0.09, i * 0.06));
        break;
      case 'playerDie':
        this.noise(1.4, 0.5, 3000, 60);
        this.tone(800, 40, 1.2, 'sawtooth', 0.15);
        break;
      case 'roar':
        this.tone(70, 35, 1.8, 'sawtooth', 0.25);
        this.tone(95, 45, 1.8, 'square', 0.12);
        this.noise(1.8, 0.3, 500, 100, 'lowpass', 4);
        break;
      case 'warning':
        for (let i = 0; i < 4; i++) {
          this.tone(880, 440, 0.35, 'square', 0.07, i * 0.5);
        }
        break;
      case 'open':
        this.tone(150, 400, 0.35, 'sawtooth', 0.07);
        break;
    }
  }

  // Recoil under the ship's own shots, matching the 3D recoil's power scale.
  // Kept quiet and short: normal shots fire constantly.
  thump(power) {
    this.tone(120, 50, 0.04 + (power - 1) * 0.03, 'triangle', 0.05 * power);
  }

  // Continuous hum while the beam is charging.
  chargeStart() {
    if (!this.ctx || this.chargeOsc) return;
    const c = this.ctx;
    const o = c.createOscillator();
    const lfo = c.createOscillator();
    const lg = c.createGain();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 90;
    lfo.frequency.value = 18;
    lg.gain.value = 20;
    lfo.connect(lg).connect(o.frequency);
    g.gain.value = 0;
    o.connect(g).connect(this.sfx);
    o.start();
    lfo.start();
    this.chargeOsc = { o, lfo, g };
  }
  chargeSet(v) {
    if (!this.chargeOsc) return;
    const t = this.ctx.currentTime;
    this.chargeOsc.o.frequency.setTargetAtTime(90 + v * 520, t, 0.03);
    this.chargeOsc.g.gain.setTargetAtTime(this.muted ? 0 : 0.03 + v * 0.03, t, 0.03);
  }
  chargeStop() {
    if (!this.chargeOsc) return;
    const { o, lfo, g } = this.chargeOsc;
    const t = this.ctx.currentTime;
    g.gain.setTargetAtTime(0, t, 0.02);
    o.stop(t + 0.1);
    lfo.stop(t + 0.1);
    this.chargeOsc = null;
  }

  // ---- music sequencer --------------------------------------------------
  music(name) {
    if (!this.ctx) { this.pendingSong = name; return; }
    this.pendingSong = null;
    this.stopMusic();
    if (!name) return;
    this.song = SONGS[name];
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() {
    clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }
  schedule() {
    const song = this.song;
    if (!song) return;
    const spb = 60 / song.bpm / 4;
    const longest = Math.max(...song.tracks.map((t) => t.notes.length));
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      if (song.once && this.step >= longest) { this.stopMusic(); return; }
      for (const tr of song.tracks) {
        const n = tr.notes[this.step % tr.notes.length];
        if (n) this.note(tr.kind, n, this.nextTime, spb);
      }
      this.nextTime += spb;
      this.step++;
    }
  }
  note(kind, f, t, spb) {
    const c = this.ctx;
    const delay = Math.max(0, t - c.currentTime);
    switch (kind) {
      case 'bass': {
        const o = c.createOscillator();
        const fl = c.createBiquadFilter();
        const g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        fl.type = 'lowpass';
        fl.frequency.setValueAtTime(1400, t);
        fl.frequency.exponentialRampToValueAtTime(200, t + spb * 1.6);
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.8);
        o.connect(fl).connect(g).connect(this.mus);
        o.start(t);
        o.stop(t + spb * 2);
        break;
      }
      case 'lead': {
        const o = c.createOscillator();
        const o2 = c.createOscillator();
        const g = c.createGain();
        o.type = 'square';
        o2.type = 'square';
        o.frequency.value = f;
        o2.frequency.value = f * 1.006;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.01);
        g.gain.setTargetAtTime(0.09, t + 0.03, 0.08);
        g.gain.setTargetAtTime(0.0001, t + spb * 2.6, 0.05);
        o.connect(g);
        o2.connect(g);
        g.connect(this.mus);
        o.start(t);
        o2.start(t);
        o.stop(t + spb * 3.2);
        o2.stop(t + spb * 3.2);
        break;
      }
      case 'kick':
        this.tone(150, 40, 0.18, 'sine', 0.8, delay, this.mus);
        break;
      case 'snare':
        this.noise(0.14, 0.45, 5000, 1200, 'highpass', 0.7, delay, this.mus);
        this.tone(220, 140, 0.08, 'triangle', 0.3, delay, this.mus);
        break;
      case 'hat':
        this.noise(0.04, 0.18, 9000, 7000, 'highpass', 1, delay, this.mus);
        break;
    }
  }
}
