// Cel-shading helpers: 3-step toon ramp + inverted-hull ink outlines.
import * as THREE from '../../vendor/three.module.js';

// A small gradient map turns smooth shading into flat bands (anime cel look).
let RAMP = null;
export function toonRamp(steps = 3) {
  if (RAMP) return RAMP;
  const data = new Uint8Array(steps * 4);
  const levels = [90, 178, 255];
  for (let i = 0; i < steps; i++) {
    const v = levels[Math.min(levels.length - 1, Math.round((i / (steps - 1)) * (levels.length - 1)))];
    data.set([v, v, v, 255], i * 4);
  }
  RAMP = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  RAMP.minFilter = RAMP.magFilter = THREE.NearestFilter;
  RAMP.needsUpdate = true;
  return RAMP;
}

export function toon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts });
}

export function glossy(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.1, ...opts });
}

export function emissive(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

// Ink outline: draw back faces pushed out along their normals.
export function outlineMaterial(thickness = 0.35, color = 0x14151c) {
  return new THREE.ShaderMaterial({
    uniforms: { uThickness: { value: thickness }, uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      uniform float uThickness;
      void main() {
        vec3 p = position + normalize(normal) * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
}

// A mesh plus its outline shell, grouped so both move together.
export function part(geometry, material, { outline = 0.3, name = '' } = {}) {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name || 'part';
  mesh.castShadow = mesh.receiveShadow = true;
  g.add(mesh);
  if (outline > 0) {
    const shell = new THREE.Mesh(geometry, outlineMaterial(outline));
    shell.name = 'outline';
    g.add(shell);
  }
  return g;
}

// Bakes the parts under root into one mesh per material plus one outline shell,
// all in root's space, so a model draws in a few calls instead of two per part.
// Every draw call leaves Three's uniform upload a few hundred bytes of garbage
// (DECISIONS §24), and drawn part by part the ship and pod were most of a
// frame's allocation. The shell is baked already pushed out along its normals,
// so each part keeps its own outline thickness, scaled with the part as before.
// Only for parts that never move relative to root, so call it on each animated
// group separately. Anything that isn't a part (glows, flames, flashes) stays.
export function mergeParts(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const parts = [];
  root.traverse((o) => { if (o.isMesh && (o.name === 'part' || o.name === 'outline')) parts.push(o); });

  const solids = new Map();   // material -> { pos, nrm }
  const shell = { pos: [], nrm: [] };
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (const mesh of parts) {
    m.multiplyMatrices(inv, mesh.matrixWorld);
    nm.getNormalMatrix(m);
    const outline = mesh.name === 'outline';
    // The same push the outline shader does, in the part's own space.
    const push = outline ? mesh.material.uniforms.uThickness.value : 0;
    let dst = shell;
    if (!outline) {
      if (!solids.has(mesh.material)) solids.set(mesh.material, { pos: [], nrm: [] });
      dst = solids.get(mesh.material);
    }
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      n.fromBufferAttribute(N, i).normalize();
      p.fromBufferAttribute(P, i).addScaledVector(n, push).applyMatrix4(m);
      n.applyNormalMatrix(nm);
      dst.pos.push(p.x, p.y, p.z);
      dst.nrm.push(n.x, n.y, n.z);
    }
    const holder = mesh.parent;
    holder.remove(mesh);
    if (!holder.children.length && holder !== root) holder.parent.remove(holder);
  }

  const build = ({ pos, nrm }, material, name) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    root.add(mesh);
  };
  for (const [material, data] of solids) build(data, material, 'part');
  if (shell.pos.length) build(shell, outlineMaterial(0), 'outline');
}

export const PALETTE = {
  hull: 0xf0f1f6,
  hullShade: 0xc3c0d8,
  crimson: 0xc0232f,
  gunmetal: 0x3c404e,
  dark: 0x23262f,
  gold: 0xe8b530,
  teal: 0x3fd8cb,
  glow: 0x9fe8ff,
};
