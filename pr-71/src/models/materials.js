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
