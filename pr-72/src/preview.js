// Standalone model harness: inspect models, play back game animations, or fly
// the ship yourself with the game's own controls. Never loads the level.
import * as THREE from '../vendor/three.module.js';
import { createShip } from './models/ship.js';
import { createPod } from './models/pod.js';
import { createShield } from './models/shield.js';
import { Input } from './input.js';
import {
  shipSpeed, TILT_EASE, TURN_EASE, CHARGE_DELAY, CHARGE_RATE, BEAM_MIN_CHARGE, beamLevel, DOCK, SHIP_SCALE, POD_SCALE,
  POD_LAUNCH_FRONT, POD_LAUNCH_BACK, POD_LAUNCH_DRAG, POD_LAUNCH_STOP, POD_FOLLOW, POD_RECALL_SPEED, POD_GRAB_DIST,
  SHIELD_MAX, SHIELD_DAMAGE, SHIELD_RADIUS, SHIELD_OFFSET, SHIELD_INV,
} from './tuning.js';
import { liveReload } from './livereload.js';

liveReload();

const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));

const scene = new THREE.Scene();
const BG = { space: 0x070a16, studio: 0x2a2f3c, white: 0xe9eaee };
scene.background = new THREE.Color(BG.space);

const key = new THREE.DirectionalLight(0xffffff, 2.4);
const fill = new THREE.DirectionalLight(0x9fb8ff, 0.8);
const rim = new THREE.DirectionalLight(0x7fe8ff, 1.6);
fill.position.set(-40, -20, 30);
rim.position.set(-30, 10, -40);
scene.add(key, fill, rim, new THREE.HemisphereLight(0xbcd2ff, 0x202430, 0.7));

const grid = new THREE.GridHelper(200, 20, 0x3fd8cb, 0x222a38);
grid.position.y = -18;
scene.add(grid);

const models = { ship: createShip(), pod: createPod({ color: 'red' }) };
for (const m of Object.values(models)) scene.add(m.group);
let current = 'ship';

const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 2000);
const cam = { az: 0, el: 0, dist: 160 };
const VIEWS = {
  game: [0, 0], side: [0, 0], top: [0, Math.PI / 2 - 0.05], front: [Math.PI / 2, 0],
  rear: [-Math.PI / 2, 0], three: [0.9, 0.5],
};
const basePose = { ship: [0.2, -0.3], pod: [0.2, -0.4] };

function placeCamera() {
  const { az, el, dist } = cam;
  camera.position.set(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist);
  camera.lookAt(0, 0, 0);
}

// --- shared projectiles -----------------------------------------------------
const shots = [];
const shotMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, toneMapped: false });
const beamMat = new THREE.MeshBasicMaterial({
  color: 0x8fd4ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
});
const podShotMat = new THREE.MeshBasicMaterial({ color: 0xffa060, toneMapped: false });

function clearShots() {
  for (const s of shots) scene.remove(s.mesh);
  shots.length = 0;
}
function spawnShot(pos, { mat = shotMat, size = [5, 1.4, 1.4], speed = 150, life = 1.3, grow = false } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.copy(pos);
  scene.add(m);
  shots.push({ mesh: m, life, speed, grow });
}
function stepShots(dt) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.mesh.position.x += s.speed * dt;
    s.life -= dt;
    if (s.grow) s.mesh.scale.x = Math.min(2.4, s.mesh.scale.x + dt * 3);
    if (s.life <= 0) { scene.remove(s.mesh); shots.splice(i, 1); }
  }
}

const v = new THREE.Vector3();
const muzzleWorld = () => (scene.updateMatrixWorld(), models.ship.nose.localToWorld(v.set(14, 0, 0)).clone());
// A point just behind the nose tip, so a docked pod swallows the tip.
const nosePointWorld = () => (scene.updateMatrixWorld(), models.ship.nose.localToWorld(v.set(9.5, 0, 0)).clone());
const tailPointWorld = () => (scene.updateMatrixWorld(), models.ship.group.localToWorld(v.set(-22, 0, 0)).clone());

// --- fly-it-yourself sandbox ------------------------------------------------
// Uses the game's Input and its constants from tuning.js, so the handling,
// charge timing and pod behaviour match the real thing.
const input = new Input();
const U = 1 / SHIP_SCALE;      // game pixels -> preview world units
// Pod size relative to the ship, as in game. The pod keeps full size when shown
// on its own so it fills the model view.
const POD_WITH_SHIP = POD_SCALE / SHIP_SCALE;

// Shield bubble at its in-game size around the ship; only the "Shield hits" sequence shows it.
const shield = createShield({ rx: SHIELD_RADIUS.x * U, ry: SHIELD_RADIUS.y * U, rz: 13 * U, fade: SHIELD_INV / 60 });
shield.group.position.x = SHIELD_OFFSET * U;
shield.group.visible = false;
scene.add(shield.group);
const hits = { shield: SHIELD_MAX, angle: 0, age: 99 };
const play = {
  x: -20, y: 0, tilt: 0, turn: 0, charge: 0, holdT: 0, speedLv: 0,
  pod: { state: 'front', x: 0, y: 0, vx: 0, has: true },
};

const BOUND_X = 70, BOUND_Y = 42;
const boundsBox = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(BOUND_X * 2, BOUND_Y * 2)),
  new THREE.LineBasicMaterial({ color: 0x2f4a5c })
);
boundsBox.visible = false;
scene.add(boundsBox);

const chargeMesh = new THREE.Mesh(
  new THREE.BoxGeometry(3, 3, 3),
  new THREE.MeshBasicMaterial({ color: 0xaee6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
);
chargeMesh.position.set(15.5, 0, 0);
chargeMesh.visible = false;
models.ship.nose.add(chargeMesh);

let autoFrame = true;
function fitPlayArea() {
  const fov = (camera.fov * Math.PI) / 180;
  const needH = (BOUND_Y + 26) / Math.tan(fov / 2);
  const needW = (BOUND_X + 26) / (Math.tan(fov / 2) * Math.max(0.2, camera.aspect));
  cam.dist = Math.max(needH, needW);
  cam.az = 0;
  cam.el = 0;
  $('zoom').value = Math.round(Math.min(320, cam.dist));
  $('zoomV').textContent = Math.round(Math.min(320, cam.dist));
}

function resetPlay() {
  play.x = -20; play.y = 0; play.tilt = 0; play.turn = 0; play.charge = 0; play.holdT = 0;
  Object.assign(play.pod, { state: 'front', x: 0, y: 0, vx: 0, has: true });
  clearShots();
}

// One fixed 60 Hz step, mirroring Player.update / Pod.update.
function stepPlay() {
  input.poll();
  const speed = shipSpeed(play.speedLv) * U;
  let dx = 0, dy = 0;
  if (input.held('left')) dx--;
  if (input.held('right')) dx++;
  if (input.held('up')) dy--;
  if (input.held('down')) dy++;
  if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
  play.x = THREE.MathUtils.clamp(play.x + dx * speed, -BOUND_X, BOUND_X);
  play.y = THREE.MathUtils.clamp(play.y - dy * speed, -BOUND_Y, BOUND_Y);   // screen y is inverted in world space
  play.tilt = THREE.MathUtils.lerp(play.tilt, dy, TILT_EASE);
  play.turn = THREE.MathUtils.lerp(play.turn, dx, TURN_EASE);

  if (input.pressed('fire')) {
    models.ship.fire(1);
    spawnShot(muzzleWorld());
    if (play.pod.has && play.pod.state !== 'front' && play.pod.state !== 'back') {
      spawnShot(new THREE.Vector3(play.pod.x + 8, play.pod.y, 0), { mat: podShotMat, size: [4, 2, 2], speed: 120, life: 1.1 });
    }
    play.holdT = 0;
  }
  if (input.held('fire')) {
    play.holdT++;
    if (play.holdT > CHARGE_DELAY) play.charge = Math.min(1, play.charge + CHARGE_RATE);
  } else {
    if (play.charge >= BEAM_MIN_CHARGE) {
      const L = beamLevel(play.charge);
      models.ship.fire(1 + L * 0.4);
      const p = muzzleWorld();
      p.x += 10 + L * 3;
      spawnShot(p, { mat: beamMat, size: [10 + L * 8, 2 + L * 1.6, 2 + L * 1.6], speed: 200, life: 1.4, grow: true });
    }
    play.charge = 0;
    play.holdT = 0;
  }
  if (input.pressed('pod')) togglePod();
  stepPod();
}

function togglePod() {
  const p = play.pod;
  if (!p.has) return;
  switch (p.state) {
    case 'front': p.state = 'launch'; p.vx = POD_LAUNCH_FRONT * U; break;
    case 'back': p.state = 'launch'; p.vx = -POD_LAUNCH_BACK * U; break;
    case 'free':
    case 'launch': p.state = 'recall'; break;
    case 'recall': p.state = 'free'; break;
  }
}

function stepPod() {
  const p = play.pod;
  if (!p.has) return;
  const wasDocked = p.state === 'front' || p.state === 'back';
  switch (p.state) {
    case 'front': p.x = play.x + DOCK.front.x * U; p.y = play.y - DOCK.front.y * U; break;
    case 'back': p.x = play.x + DOCK.back.x * U; p.y = play.y - DOCK.back.y * U; break;
    case 'free':
      p.y = THREE.MathUtils.lerp(p.y, play.y, POD_FOLLOW);
      break;
    case 'launch':
      p.x += p.vx;
      p.vx *= POD_LAUNCH_DRAG;
      if (Math.abs(p.vx) < POD_LAUNCH_STOP * U || p.x > 95 || p.x < -95) p.state = 'free';
      break;
    case 'recall': {
      const dx = play.x - p.x, dy = play.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = Math.min(d, POD_RECALL_SPEED * U);
      p.x += (dx / d) * s;
      p.y += (dy / d) * s;
      break;
    }
  }
  if (p.state !== 'front' && p.state !== 'back') {
    p.x = THREE.MathUtils.clamp(p.x, -95, 95);
    p.y = THREE.MathUtils.clamp(p.y, -46, 46);
    if (p.state !== 'launch' && Math.hypot(play.x - p.x, play.y - p.y) < POD_GRAB_DIST * U) {
      p.state = p.x > play.x ? 'front' : 'back';
      models.pod.clamp();
    }
  }
  if (wasDocked && p.state === 'launch') models.pod.release();
}

function applyPlay() {
  models.ship.group.position.set(play.x, play.y, 0);
  const pd = play.pod;
  models.pod.setGrip(pd.state === 'front' ? -1 : 1);
  models.pod.group.position.set(pd.x, pd.y, 0);
  chargeMesh.visible = play.charge > 0;
  if (play.charge > 0) {
    const k = 0.4 + play.charge * 1.6;
    chargeMesh.scale.setScalar(k);
    chargeMesh.material.opacity = 0.5 + 0.5 * play.charge;
  }
}

// --- scripted sequences -----------------------------------------------------
const POD_DEMOS = new Set(['arrive', 'dock', 'dockback']);
const CAPTIONS = {
  idle: '',
  play: 'Arrows / WASD fly, Z or space fires (hold to charge), X launches and recalls the pod',
  fire: 'Tap fire: muzzle flash and recoil',
  beam: 'Hold fire, then release: charged beam',
  arrive: 'The pod flies in from the left after the first crystal',
  dock: 'The pod docks on the nose',
  dockback: 'The pod docks at the tail',
  shield: `Bullet hits on the shield: ${SHIELD_DAMAGE.bullet}% each, rippling from the impact; it refills once broken`,
};
const demo = { mode: 'idle', t: 0, next: 0 };

function setDemo(mode) {
  demo.mode = mode;
  try { sessionStorage.setItem('preview-demo', mode); } catch { /* private mode */ }
  demo.t = 0;
  demo.next = 0;
  Object.assign(hits, { shield: SHIELD_MAX, angle: 0, age: 99 });
  clearShots();
  document.getElementById('caption').textContent = CAPTIONS[mode] || '';
  for (const b of document.querySelectorAll('[data-demo]')) b.classList.toggle('on', b.dataset.demo === mode);
  if (mode !== 'idle') {
    document.getElementById('model').value = 'ship';
    current = 'ship';
  }
  models.pod.group.rotation.set(...basePose.pod, 0);
  boundsBox.visible = mode === 'play';
  if (mode === 'play') { resetPlay(); autoFrame = true; }
  else {
    models.ship.group.position.set(0, 0, 0);
    chargeMesh.visible = false;
  }
}

const easeOut = (k) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
const lerpV = (a, b, k) => a.clone().lerp(b, k);
const START = new THREE.Vector3(-150, -18, 0);
const HOVER = new THREE.Vector3(-48, 14, 0);

function runDemo(dt) {
  const ship = models.ship, pod = models.pod;
  demo.t += dt;
  const t = demo.t;
  switch (demo.mode) {
    case 'fire':
      if (t >= demo.next) {
        demo.next = t + 0.22;
        ship.fire(1);
        spawnShot(muzzleWorld());
      }
      break;
    case 'beam':
      if (t >= demo.next) {
        demo.next = t + 1.8;
        ship.fire(3.4);
        const p = muzzleWorld();
        p.x += 18;
        spawnShot(p, { mat: beamMat, size: [34, 5, 5], speed: 200, life: 1.4, grow: true });
      }
      break;
    case 'arrive': {
      pod.group.position.copy(lerpV(START, HOVER, easeOut(t / 1.9)));
      pod.group.position.y += Math.sin(t * 2.4) * 1.5 * easeOut(t / 1.9);
      if (t > 5) demo.t = 0;
      break;
    }
    case 'dock':
    case 'dockback': {
      const target = demo.mode === 'dock' ? nosePointWorld() : tailPointWorld();
      const stage = new THREE.Vector3(target.x - 46, target.y + 26, 0);
      if (t < 1.3) pod.group.position.copy(lerpV(START, stage, easeOut(t / 1.3)));
      else if (t < 2.2) pod.group.position.copy(lerpV(stage, target, easeOut((t - 1.3) / 0.9)));
      else {
        if (!demo.clamped) { pod.setGrip(demo.mode === 'dock' ? -1 : 1); pod.clamp(); demo.clamped = true; }
        pod.group.position.copy(target);
        pod.group.position.y += Math.sin(t * 6) * 0.25;
      }
      if (t > 5.5) { demo.t = 0; demo.clamped = false; pod.release(); pod.setGrip(1); }
      break;
    }
    case 'shield':
      hits.age += dt;
      if (t >= demo.next) {
        if (hits.shield <= 0) {
          hits.shield = SHIELD_MAX;
          demo.next = t + 1.2;
          break;
        }
        hits.shield = Math.max(0, hits.shield - SHIELD_DAMAGE.bullet);
        hits.angle = Math.random() * Math.PI * 2;
        hits.age = 0;
        ship.hit();
        demo.next = t + (hits.shield > 0 ? 0.9 : 1.6);
      }
      break;
  }
}

// --- controls ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const state = { bank: 0, autoBank: true, throttle: 1, pause: false, spin: false };

let drag = null;
view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointerup', () => { drag = null; });
view.addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.008;
  cam.el = THREE.MathUtils.clamp(cam.el + (e.clientY - drag.y) * 0.008, -1.4, 1.4);
  drag = { x: e.clientX, y: e.clientY };
});
view.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.12, 40, 320);
  autoFrame = false;
  $('zoom').value = Math.round(cam.dist);
  $('zoomV').textContent = Math.round(cam.dist);
}, { passive: false });

const bindRange = (id, fn) => {
  const el = $(id), out = $(id + 'V');
  el.addEventListener('input', () => {
    const val = +el.value;
    if (out) out.textContent = el.step === '1' ? val : val.toFixed(2);
    fn(val);
  });
};
bindRange('bank', (val) => { state.bank = val; state.autoBank = false; $('autoBank').checked = false; });
bindRange('throttle', (val) => { state.throttle = val; });
bindRange('zoom', (val) => { cam.dist = val; autoFrame = false; });
bindRange('lightA', (val) => {
  const a = (val * Math.PI) / 180;
  key.position.set(Math.cos(a) * 60, 45, Math.sin(a) * 60);
});
$('lightA').dispatchEvent(new Event('input'));

$('autoBank').addEventListener('change', (e) => { state.autoBank = e.target.checked; });
$('pause').addEventListener('change', (e) => { state.pause = e.target.checked; });
$('spin').addEventListener('change', (e) => { state.spin = e.target.checked; });
$('outline').addEventListener('change', (e) => { for (const m of Object.values(models)) m.setOutlines(e.target.checked); });
$('wire').addEventListener('change', (e) => { for (const m of Object.values(models)) m.setWireframe(e.target.checked); });
$('grid').addEventListener('change', (e) => { grid.visible = e.target.checked; });
$('bg').addEventListener('change', (e) => { scene.background = new THREE.Color(BG[e.target.value]); });
$('podColor').addEventListener('change', (e) => models.pod.setColor(e.target.value));
$('model').addEventListener('change', (e) => { current = e.target.value; setDemo('idle'); });
$('replay').addEventListener('click', () => setDemo(demo.mode));
for (const b of document.querySelectorAll('[data-demo]')) b.addEventListener('click', () => setDemo(b.dataset.demo));
for (const b of document.querySelectorAll('[data-view]')) {
  b.addEventListener('click', () => {
    const [az, el] = VIEWS[b.dataset.view];
    cam.az = az; cam.el = el;
    const pose = basePose[current];
    models[current].group.rotation.set(...(b.dataset.view === 'side' ? [0, 0] : pose), 0);
  });
}
$('shot').addEventListener('click', () => {
  renderer.render(scene, camera);
  const a = document.createElement('a');
  a.download = `${current}-${demo.mode}.png`;
  a.href = view.toDataURL('image/png');
  a.click();
});
addEventListener('keydown', (e) => {
  if (demo.mode === 'play') return;   // keys belong to the sandbox while flying
  if (e.key === 'r') { cam.az = 0; cam.el = 0; cam.dist = 160; }
  if (e.key === 'o') { const c = $('outline'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); }
  if (e.key === '1') { $('model').value = 'ship'; current = 'ship'; setDemo('idle'); }
  if (e.key === '2') { $('model').value = 'pod'; current = 'pod'; setDemo('idle'); }
  if (e.code === 'Space') { e.preventDefault(); setDemo(demo.mode); }
});

// Live reload drops you back in wherever you were.
let startMode = 'idle';
try { startMode = sessionStorage.getItem('preview-demo') || 'idle'; } catch { /* private mode */ }
setDemo(startMode);

// --- loop -------------------------------------------------------------------
const hud = document.getElementById('hud');
let last = performance.now(), fps = 60, t = 0, acc = 0;
const STEP = 1 / 60;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  fps += (1000 / Math.max(1, now - (frame.prev || now)) - fps) * 0.1;
  frame.prev = now;

  const playing = demo.mode === 'play';
  const podVisible = playing ? play.pod.has : POD_DEMOS.has(demo.mode) || current === 'pod';
  models.ship.group.visible = current === 'ship' || POD_DEMOS.has(demo.mode) || playing;
  models.pod.group.visible = podVisible;
  const podAlone = !playing && !POD_DEMOS.has(demo.mode) && current === 'pod';
  if (podAlone) models.pod.group.position.set(0, 0, 0);
  models.pod.group.scale.setScalar(podAlone ? 1 : POD_WITH_SHIP);

  if (!state.pause) {
    t += dt;
    if (playing) {
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps++ < 5) { stepPlay(); acc -= STEP; }
      applyPlay();
      models.ship.update(dt, { bank: -play.tilt, dip: play.turn, throttle: state.throttle });
    } else {
      if (state.autoBank) state.bank = Math.sin(t * 1.1);
      models.ship.update(dt, { bank: state.bank, throttle: state.throttle });
      runDemo(dt);
      if (state.spin) models[current].group.rotation.y += dt * 0.6;
    }
    models.pod.update(dt, { charge: playing ? play.charge : 0 });
    stepShots(dt);
  }
  shield.group.visible = demo.mode === 'shield';
  if (demo.mode === 'shield' && !state.pause) {
    shield.update(dt, { strength: hits.shield / SHIELD_MAX, hitAngle: hits.angle, hitAge: hits.age });
  }

  const w = view.clientWidth, h = view.clientHeight;
  if (view.width !== w * renderer.getPixelRatio() || view.height !== h * renderer.getPixelRatio()) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  if (playing && autoFrame) fitPlayArea();
  placeCamera();
  renderer.render(scene, camera);

  const info = renderer.info.render;
  hud.textContent = playing
    ? `fly  charge ${(play.charge * 100).toFixed(0)}%  pod ${play.pod.state}  ${fps.toFixed(0)} fps`
    : `${current}  ${demo.mode}${demo.mode === 'shield' ? `  shield ${hits.shield}%` : ''}  ${fps.toFixed(0)} fps  ${info.triangles} tris  ${info.calls} calls`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__preview = { scene, camera, cam, models, shield, hits, state, renderer, demo, setDemo, play, input };
