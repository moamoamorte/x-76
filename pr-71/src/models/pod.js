// The pod: an angular armoured orb built to match the ship. A faceted energy
// core sits inside slowly turning armour plates; three claws snap shut when it
// clamps onto the hull.
import * as THREE from '../../vendor/three.module.js';
import { part, toon } from './materials.js';

const LASER_COLOR = { red: 0xff5a2a, blue: 0x3ac8ff, yellow: 0xffd82a };

// Same greys as the ship.
const C = { light: 0xd9dce4, hull: 0xb9bec9, shade: 0x8d93a1, metal: 0x4a4f5c, dark: 0x2a2e38 };

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export function createPod({ outline = 0.32, color = 'red' } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();     // takes the clamp jolt
  root.add(body);
  const spin = new THREE.Group();
  body.add(spin);

  const put = (parent, geo, mat, pos = [0, 0, 0], rot = [0, 0, 0], o = outline) => {
    const g = part(geo, mat, { outline: o });
    g.position.set(...pos);
    g.rotation.set(...rot);
    parent.add(g);
    return g;
  };

  // --- faceted core ---------------------------------------------------------
  const coreMat = new THREE.MeshBasicMaterial({ color: LASER_COLOR[color], toneMapped: false });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(3.1, 0), coreMat);
  body.add(core);

  const haloMat = new THREE.MeshBasicMaterial({
    color: LASER_COLOR[color], transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const halo = new THREE.Mesh(new THREE.OctahedronGeometry(4.6, 0), haloMat);
  body.add(halo);

  // --- armour plates around the core ---------------------------------------
  const plateMats = [toon(C.hull), toon(C.light), toon(C.shade)];
  for (let i = 0; i < 3; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i * Math.PI * 2) / 3;
    spin.add(arm);
    put(arm, box(7.5, 1.3, 3.4), plateMats[i], [0, 5.2, 0]);
    put(arm, box(2.6, 1.2, 3.0), toon(C.metal), [3.2, 4.2, 0], [0, 0, -0.6], 0.24);
    put(arm, box(2.6, 1.2, 3.0), toon(C.metal), [-3.2, 4.2, 0], [0, 0, 0.6], 0.24);
  }
  // Faceted ring tying the plates together.
  const ring = part(new THREE.TorusGeometry(6.4, 0.6, 4, 10), toon(C.metal), { outline: outline * 0.7 });
  ring.rotation.x = Math.PI / 2;
  spin.add(ring);

  // --- claws ----------------------------------------------------------------
  // The rig flips so the claws always reach toward the hull they grip.
  const clawRig = new THREE.Group();
  body.add(clawRig);
  const claws = [];
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = (i * Math.PI * 2) / 3 + Math.PI / 6;
    clawRig.add(pivot);
    const hinge = new THREE.Group();
    hinge.position.set(3.4, 2.6, 0);
    pivot.add(hinge);
    put(hinge, box(6.4, 1.3, 1.6), toon(C.light), [2.8, 0, 0], [0, 0, 0], 0.22);
    put(hinge, box(2.8, 1.2, 1.4), toon(C.dark), [6.2, -1.2, 0], [0, 0, -1.0], 0.2);
    claws.push(hinge);
  }

  // --- clamp flash ----------------------------------------------------------
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(4.6, 0), flashMat);
  flash.visible = false;
  body.add(flash);

  root.rotation.set(0.2, -0.4, 0);

  const OPEN = 0.55, SHUT = -0.12;
  let t = 0, clampT = -1, open = OPEN, jolt = 0, spinRate = 1.6;

  function setClaws(a) {
    for (const c of claws) c.rotation.z = a;
  }
  setClaws(open);

  return {
    group: root,
    // Snap the claws shut with a jolt - used when the pod docks onto the hull.
    clamp() {
      clampT = 0;
      jolt = 1;
      flash.visible = true;
    },
    // dir -1 points the claws backward, to grip a nose pushed into them.
    setGrip(dir) {
      const want = dir < 0 ? Math.PI : 0;
      if (clawRig.rotation.y !== want) clawRig.rotation.y = want;
    },
    // Spring the claws open again when the pod is launched.
    release() {
      clampT = -1;
      open = OPEN;
      setClaws(open);
      spinRate = 1.6;
    },
    update(dt, state = {}) {
      t += dt;
      spin.rotation.z += dt * spinRate;
      spin.rotation.x = Math.sin(t * 0.8) * 0.18;

      if (clampT >= 0) {
        clampT += dt;
        // Fast snap, brief overshoot, then settle.
        const k = Math.min(1, clampT / 0.09);
        const over = clampT < 0.09 ? 0 : Math.max(0, 1 - (clampT - 0.09) / 0.22);
        open = THREE.MathUtils.lerp(OPEN, SHUT, k) - over * 0.12;
        setClaws(open);
        spinRate = 1.6 + Math.max(0, 6 * (1 - clampT / 0.3));
        flashMat.opacity = Math.max(0, 0.5 * (1 - clampT / 0.22));
        flash.scale.setScalar(1 + clampT * 2.5);
        if (clampT > 0.22) flash.visible = false;
      }
      jolt = Math.max(0, jolt - dt * 6);
      body.position.x = -jolt * 1.6;
      body.rotation.z = jolt * 0.12;

      const pulse = 1 + Math.sin(t * 5) * 0.06 + jolt * 0.25;
      core.scale.setScalar(pulse);
      core.rotation.y += dt * 0.9;
      core.rotation.z -= dt * 0.5;
      halo.scale.setScalar(pulse * (1 + (state.charge || 0) * 0.3));
      halo.rotation.copy(core.rotation);
    },
    setColor(c) {
      coreMat.color.set(LASER_COLOR[c]);
      haloMat.color.set(LASER_COLOR[c]);
    },
    setOutlines(on) { root.traverse((o) => { if (o.name === 'outline') o.visible = on; }); },
    setWireframe(on) { root.traverse((o) => { if (o.isMesh && o.name !== 'outline' && o.material.wireframe !== undefined) o.material.wireframe = on; }); },
  };
}
