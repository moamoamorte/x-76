// 3D layer: renders the terrain, player ship and pod as lit 3D models on a
// transparent canvas between the two 2D canvases (see index.html). Game logic
// stays 2D and untouched.
import * as THREE from '../vendor/three.module.js';
import { W, H } from './util.js';
import { view } from './view.js';
import { createShip } from './models/ship.js';
import { createPod } from './models/pod.js';
import { createShield } from './models/shield.js';
import { createTerrain3D } from './models/terrain3d.js';
import { createBackdrop3D } from './models/backdrop3d.js';
import { SHIP_SCALE, POD_SCALE, SHIELD_RADIUS, SHIELD_OFFSET, SHIELD_INV } from './tuning.js';

// Camera distance from the play plane. Farther flattens the perspective: at
// 640 a block face 28 deep shows as at most ~8px at the screen's side edges.
const CAM_DIST = 640;

function lights() {
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(60, 90, 120);
  const fill = new THREE.DirectionalLight(0x91b4ff, 0.9);
  fill.position.set(-80, -40, 60);
  const rim = new THREE.DirectionalLight(0x7fe8ff, 1.7);
  rim.position.set(-60, 30, -90);
  return [key, fill, rim, new THREE.HemisphereLight(0xbcd2ff, 0x1a1e2a, 0.75)];
}

export class Render3D {
  // Returns null when WebGL isn't available; the game then shows a
  // "WebGL required" screen instead of starting.
  static create(canvas) {
    try {
      return new Render3D(canvas);
    } catch (err) {
      console.warn('WebGL unavailable:', err);
      return null;
    }
  }

  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(1);
    this.setScale(view.s);

    // Two scenes drawn in turn, with the depth buffer cleared between them:
    // terrain first, then the ship, pod and shield, which therefore never sink
    // into a wall they graze. Both get the same lights.
    this.world = new THREE.Scene();
    this.scene = new THREE.Scene();
    this.world.add(...lights());
    this.scene.add(...lights());
    // Haze that only reaches past the terrain (its faces are 612-668 away),
    // so the backdrops darken with depth and the terrain stands out in front.
    this.world.fog = new THREE.Fog(0x05070e, CAM_DIST + 60, CAM_DIST + 760);

    // Perspective, placed so the z = 0 plane maps game pixels 1:1 to world
    // units: anything at z = 0 (block fronts, the ship) lands exactly where
    // gameplay has it, and the faces receding into -z show their depth.
    // Screen y grows downward, world y up. See DECISIONS §22.
    this.camera = new THREE.PerspectiveCamera(2 * Math.atan(H / 2 / CAM_DIST) * 180 / Math.PI, W / H, 100, CAM_DIST + 400);
    this.aimCamera(0, 0);

    this.ship = createShip();
    this.pod = createPod();
    this.ship.group.scale.setScalar(SHIP_SCALE);
    this.pod.group.scale.setScalar(POD_SCALE);
    this.shield = createShield({ rx: SHIELD_RADIUS.x, ry: SHIELD_RADIUS.y, fade: SHIELD_INV / 60 });
    this.scene.add(this.ship.group, this.pod.group, this.shield.group);
    this.hideAll();
  }

  // Internal resolution multiplier over the 384x224 field: the display scale,
  // so the 3D layer is exactly as sharp as the 2D canvas under it.
  setScale(s) {
    this.scale = s;
    this.renderer.setSize(W * s, H * s, false);
  }

  aimCamera(dx, dy) {
    this.camera.position.set(W / 2 + dx, -H / 2 + dy, CAM_DIST);
  }

  // Rebuilt whenever the game switches to a stage with different terrain.
  setTerrain(terrain, backdrops) {
    if (this.terrainSrc === terrain) return;
    for (const old of [this.terrain, this.backdrop]) {
      if (!old) continue;
      old.dispose();
      this.world.remove(old.group);
    }
    this.terrainSrc = terrain;
    this.terrain = createTerrain3D(terrain);
    this.backdrop = createBackdrop3D(backdrops, CAM_DIST);
    this.world.add(this.terrain.group, this.backdrop.group);
  }

  // Both passes with whatever is currently posed.
  draw() {
    const r = this.renderer;
    r.render(this.world, this.camera);
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.camera);
    r.autoClear = true;
  }

  hideAll() {
    this.ship.group.visible = false;
    this.pod.group.visible = false;
    this.shield.group.visible = false;
  }

  // HUD spare-ship icon: the ship model rendered once, supersampled, then
  // shrunk into a w x h 2D canvas. It borrows the main renderer (a second
  // WebGL context costs more than a resize) and redraws the scene as it was
  // afterwards, so it is safe to call mid-frame. Cached per size, so asking
  // for a new size (e.g. a sharper HUD) regenerates it.
  shipIcon(w, h) {
    const key = `${w}x${h}`;
    if (this.icon?.key === key) return this.icon.canvas;

    const SS = 8;
    const s = this.ship.group;
    const vis = [s.visible, this.pod.group.visible, this.shield.group.visible];
    const pos = s.position.clone(), rot = s.rotation.clone(), scl = s.scale.clone();
    const bank = this.ship.bank;
    const bankRot = bank.rotation.clone(), bankPos = bank.position.clone();
    const flames = [];
    s.traverse((o) => { if (o.material?.blending === THREE.AdditiveBlending) flames.push([o, o.visible]); });

    this.hideAll();
    s.visible = true;
    s.position.set(0, 0, 0);
    s.rotation.set(0.2, -0.3, 0);
    s.scale.setScalar(1);
    bank.rotation.set(0, 0, 0);
    bank.position.set(0, 0, 0);
    for (const [o] of flames) o.visible = false;   // parked: no engine glow or muzzle flash

    // Frame the model's silhouette, padded to the icon's aspect.
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s, true);
    const c = box.getCenter(new THREE.Vector3());
    const sz = box.getSize(new THREE.Vector3());
    const half = Math.max(sz.x / w, sz.y / h) / 2;
    const cam = new THREE.OrthographicCamera(c.x - w * half, c.x + w * half, c.y + h * half, c.y - h * half, -800, 800);
    cam.position.z = 400;

    this.renderer.setSize(w * SS, h * SS, false);
    this.renderer.render(this.scene, cam);
    // Halve repeatedly: one big smoothed downscale drops thin edges and outlines.
    let src = this.renderer.domElement, sw = w * SS, sh = h * SS;
    while (sw > w) {
      sw /= 2; sh /= 2;
      const dst = document.createElement('canvas');
      dst.width = sw; dst.height = sh;
      const g = dst.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, sw, sh);
      src = dst;
    }
    this.icon = { key, canvas: src };

    [s.visible, this.pod.group.visible, this.shield.group.visible] = vis;
    s.position.copy(pos); s.rotation.copy(rot); s.scale.copy(scl);
    bank.rotation.copy(bankRot); bank.position.copy(bankPos);
    for (const [o, v] of flames) o.visible = v;
    this.setScale(this.scale);
    this.draw();
    return src;
  }

  // Title screen: the ship hangs centre stage, turning slowly.
  renderTitle(t) {
    this.pod.group.visible = false;
    this.shield.group.visible = false;
    const s = this.ship.group;
    s.visible = true;
    s.scale.setScalar(2.0);
    s.position.set(W / 2, -97 + Math.sin(t * 0.03) * 3, 0);
    // The nose sway lives on the pose, not in dip: dip only ever drops the nose.
    s.rotation.set(0.2 + Math.sin(t * 0.011) * 0.06, -0.3 + Math.sin(t * 0.008) * 0.22, Math.sin(t * 0.014) * 0.08);
    this.ship.update(1 / 60, {
      bank: Math.sin(t * 0.02) * 0.3,
      throttle: 1,
    });
    if (this.terrain) this.terrain.group.visible = this.backdrop.group.visible = false;
    this.aimCamera(0, 0);
    this.draw();
  }

  // camD is the device-snapped camera the 2D sprites use, so terrain-mounted
  // sprites stay locked to the 3D terrain; shake is the 2D layers' offset.
  render(game, camD, shake = { x: 0, y: 0 }, dt = 1 / 60) {
    const p = game.player;
    const cam = game.cam;
    this.setTerrain(game.terrain, game.stage.level.BACKDROPS);
    this.terrain.group.visible = this.backdrop.group.visible = true;
    this.terrain.update(camD, W);
    this.backdrop.update(camD, W);
    this.aimCamera(-shake.x, shake.y);

    // Respawn invulnerability blinks; the shorter window after a shield hit doesn't.
    const show = p && !p.dead && !(p.inv > 0 && !p.hitT && (p.t >> 2) % 2);
    this.ship.group.visible = !!show;
    if (p && show) {
      this.ship.group.scale.setScalar(SHIP_SCALE);
      this.ship.group.rotation.set(0.2, -0.3, 0);
      this.ship.group.position.set(p.x - cam, -p.y, 0);
      this.ship.update(dt, {
        bank: -p.tilt,
        dip: p.turn || 0,
        throttle: p.entering ? 1 : 0.85 + Math.random() * 0.15,
      });
    }

    this.shield.group.visible = !!show;
    if (p && show) {
      this.shield.group.position.set(p.x - cam + SHIELD_OFFSET, -p.y, 0);
      this.shield.update(dt, {
        strength: p.shield / p.maxShield,
        hitAngle: p.lastHit?.angle,
        hitAge: p.lastHit ? (p.t - p.lastHit.t) / 60 : 99,
      });
    }

    const pod = game.pod;
    this.pod.group.visible = !!pod;
    if (pod) {
      const docked = pod.state === 'front' || pod.state === 'back';
      if (pod.state !== this.podState) {
        if (docked) this.pod.clamp();
        else if (this.podDocked) this.pod.release();
        this.podState = pod.state;
        this.podDocked = docked;
      }
      // Claws reach back toward the hull when docked on the nose.
      this.pod.setGrip(pod.state === 'front' ? -1 : 1);
      this.pod.group.position.set(pod.x - cam, -pod.y, 4);
      if (this.podColor !== pod.color) {
        this.podColor = pod.color;
        this.pod.setColor(pod.color);
      }
      this.pod.update(dt, { charge: p?.charge || 0 });
    }

    this.draw();
  }
}
