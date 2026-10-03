// Player fighter, built procedurally. Original design: a grey gunship whose
// hull tapers from a wide engine block down to a narrow nose, with four short
// swept arms forming a compact X when seen from behind.
// +X is forward, +Y up, +Z out of the screen.
import * as THREE from '../../vendor/three.module.js';
import { part, toon } from './materials.js';

const OUT = 0.5;

// Greyscale hull palette; accents kept to the canopy and muzzle.
const C = {
  light: 0xd9dce4,
  hull: 0xb9bec9,
  shade: 0x8d93a1,
  panel: 0x6b7180,
  metal: 0x4a4f5c,
  dark: 0x2a2e38,
  teal: 0x17d5ff,
};

function prism(rTop, rBottom, len, seg = 6, thetaStart = 0) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, seg, 1, false, thetaStart);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// Flat plate from a 2D outline: shape x runs along the hull, shape y is the span (+Z).
function plate(points, thickness = 1.0, bevel = 0.25) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1,
  });
  g.rotateX(Math.PI / 2);
  g.translate(0, thickness / 2, 0);
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function createShip({ outline = OUT } = {}) {
  const root = new THREE.Group();
  const bank = new THREE.Group();
  root.add(bank);

  const mLight = toon(C.light);
  const mHull = toon(C.hull);
  const mShade = toon(C.shade);
  const mPanel = toon(C.panel);
  const mMetal = toon(C.metal);
  const mDark = toon(C.dark);
  const glass = new THREE.MeshStandardMaterial({
    color: C.teal, roughness: 0.05, metalness: 0.2, emissive: 0x0d7fa8, emissiveIntensity: 0.9,
  });

  const put = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], o = outline) => {
    const g = part(geo, mat, { outline: o });
    g.position.set(...pos);
    g.rotation.set(...rot);
    g.scale.set(...scale);
    parent.add(g);
    return g;
  };
  const add = (...args) => put(bank, ...args);

  // --- fuselage: wide at the engines, tapering to a point at the nose ------
  add(box(5, 6.4, 8.2), mMetal, [-14, 0, 0], [0, 0, 0], [1, 1, 1], 0.4);        // engine block
  add(prism(3.9, 4.6, 14, 8), mHull, [-4.5, 0, 0], [0, 0, 0], [1, 0.92, 1.08]); // mid body
  // Forward section hinges off the mid body and crooks downward.
  const nose = new THREE.Group();
  nose.position.set(2.5, 0, 0);
  nose.rotation.z = -0.26;
  bank.add(nose);
  put(nose, prism(1.7, 3.9, 12, 6), mLight, [6, 0, 0], [0, 0, 0], [1, 0.9, 1]);
  add(box(7, 1.3, 6.4), mShade, [1, 3.6, 0]);                                    // dorsal deck
  add(box(12, 1.5, 6.2), mPanel, [-4, -3.7, 0]);                                 // belly plate

  // --- cockpit: faceted wedge sitting on the nose ---------------------------
  put(nose, box(7, 1.0, 4.2), mMetal, [6.6, 1.5, 0], [0, 0, 0], [1, 1, 1], 0.22);
  put(nose, prism(0.8, 1.8, 6, 4, Math.PI / 4), glass, [7.4, 2.5, 0], [0, 0, 0], [1, 0.8, 1.15], 0.18);

  // --- four short arms in a compact X --------------------------------------
  const flames = [];
  const armAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
  for (const a of armAngles) {
    const arm = new THREE.Group();
    arm.rotation.x = a;
    bank.add(arm);

    put(arm, plate([[4, 2.2], [5.2, 3.4], [-4.5, 9.2], [-9, 9.2], [-4.5, 3.4]], 1.1), mHull, [-4, 0, 0]);
    put(arm, plate([[5, 3.4], [-4.5, 9.2], [-6.4, 9.2], [2.6, 3.4]], 1.2), mShade, [-4, 0.15, 0], [0, 0, 0], [1, 1, 1], 0.24);
    put(arm, prism(1.9, 2.1, 10, 6), mLight, [-6.5, 0, 9.6], [0, 0, 0], [1, 1, 1.05]);
    put(arm, box(6, 0.8, 1.1), mPanel, [-6.5, 1.9, 9.6], [0, 0, 0], [1, 1, 1], 0.22);
    put(arm, prism(2.4, 1.9, 2.2, 6), mMetal, [-12.2, 0, 9.6]);
    put(arm, prism(1.3, 2.0, 3, 6), mDark, [-0.9, 0, 9.6], [0, 0, 0], [1, 1, 1], 0.26);

    const ring = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 6),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, toneMapped: false })
    );
    ring.position.set(-13.3, 0, 9.6);
    ring.rotation.y = -Math.PI / 2;
    arm.add(ring);

    const flameGeo = new THREE.ConeGeometry(1.6, 10, 4, 1, true);
    flameGeo.rotateZ(Math.PI / 2);
    const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({
      color: 0x8fe4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    flame.position.set(-19, 0, 9.6);
    arm.add(flame);
    flames.push(flame);
  }

  // --- greebles ------------------------------------------------------------
  add(box(3.4, 0.6, 2.6), mPanel, [-2, 4.2, 1.8], [0, 0, 0], [1, 1, 1], 0.16);
  add(box(2.6, 0.6, 2.0), mPanel, [-7, 4.0, -1.6], [0, 0, 0], [1, 1, 1], 0.16);
  for (const s of [1, -1]) add(box(2.0, 1.4, 0.7), toon(C.shade), [0, 0.2, s * 4.4], [0, 0, 0], [1, 1, 1], 0.16);
  // --- muzzle flash (hidden until the ship fires) ---------------------------
  const flashGeo = new THREE.ConeGeometry(2.4, 6, 4, 1, true);
  flashGeo.rotateZ(-Math.PI / 2);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xbfefff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const flash = new THREE.Mesh(flashGeo, flashMat);
  flash.position.set(13.5, 0, 0);
  flash.visible = false;
  nose.add(flash);

  // Display pose: mostly side-on, turned just enough to show the top and flank.
  root.rotation.set(0.2, -0.3, 0);

  // Lit materials, so a shield hit can flare the whole hull.
  const lit = [];
  root.traverse((o) => { if (o.isMesh && o.material.emissive) lit.push(o.material); });
  const HIT_TIME = 0.22;

  let t = 0, flashT = 0, flashPower = 1, recoil = 0, hitT = 0;
  return {
    group: root,
    bank,
    nose,
    // Called when the player shoots; power scales the flash and kick.
    fire(power = 1) {
      flashPower = power;
      flashT = 0.06 + 0.04 * power;
      recoil = Math.min(2.2, 0.5 * power);
    },
    // Called when the shield takes a hit: a brief cyan-white flare.
    hit() { hitT = HIT_TIME; },
    update(dt, state = {}) {
      t += dt;
      if (flashT > 0) {
        flashT -= dt;
        const k = Math.max(0, flashT / (0.06 + 0.04 * flashPower));
        flash.visible = true;
        flash.scale.set(0.5 + k * 0.9, k * flashPower, k * flashPower);
        flashMat.opacity = 0.35 + 0.6 * k;
      } else {
        flash.visible = false;
      }
      if (hitT > 0) {
        hitT = Math.max(0, hitT - dt);
        const k = hitT / HIT_TIME;
        for (const m of lit) m.emissive.setRGB(0.55 * k, 0.9 * k, 0.85 * k);
      }
      recoil = Math.max(0, recoil - dt * 7);
      bank.position.x = -recoil;
      // bank: +1 when climbing. dip: horizontal movement; only its magnitude
      // counts, so the nose drops whichever way the ship slides.
      const b = state.bank || 0;
      const d = state.dip || 0;
      bank.rotation.x = THREE.MathUtils.lerp(bank.rotation.x, -b * 0.55, 0.25);
      bank.rotation.z = THREE.MathUtils.lerp(bank.rotation.z, -Math.abs(d) * 0.2, 0.2);
      bank.position.y = Math.sin(t * 2.2) * 0.2;
      const thr = state.throttle ?? 1;
      for (const f of flames) {
        const k = thr * (0.75 + Math.random() * 0.4);
        f.scale.set(k, 1, 1);
        f.position.x = -14 - 5.5 * k;
        f.material.opacity = 0.3 + 0.35 * k;
        f.visible = thr > 0.02;
      }
    },
    setOutlines(on) { root.traverse((o) => { if (o.name === 'outline') o.visible = on; }); },
    setWireframe(on) { root.traverse((o) => { if (o.isMesh && o.name !== 'outline' && o.material.wireframe !== undefined) o.material.wireframe = on; }); },
  };
}
