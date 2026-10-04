// The enemy layer: every enemy type's pieces as instanced meshes, re-posed
// from game state each frame. It only reads enemies; each enemy class names
// its model in a static `model` field, and anything without one (the boss)
// is left to the 2D layer.
import * as THREE from '../../../vendor/three.module.js';
import { snap } from '../../view.js';
import { Instanced, Pose, SOLID } from './kit.js';
import { drifter, dart, carrier } from './flyers.js';
import { turret, hatch } from './mounts.js';
import { hopper, bulwark } from './walkers.js';
import { larva, serpent } from './creatures.js';

// cap: instances kept per type, about twice the most stage 1 ever has alive at once.
export const SPECS = { drifter, dart, carrier, turret, hopper, bulwark, hatch, larva, serpent };

// snapTo: round positions to device pixels like the 2D sprites and terrain,
// so terrain-mounted enemies stay locked to the blocks they sit on.
export function createEnemyLayer({ kinds = Object.keys(SPECS), cap = null, snapTo = true } = {}) {
  const group = new THREE.Group();
  const pieces = {}, all = [];
  for (const kind of kinds) {
    const P = (pieces[kind] = {});
    for (const [name, piece] of Object.entries(SPECS[kind].pieces())) {
      const inst = new Instanced(piece, (cap ?? SPECS[kind].cap) * piece.per);
      P[name] = inst;
      all.push(inst);
      group.add(...inst.meshes);
    }
  }
  const round = snapTo ? snap : (x) => x;
  const X = {
    cam: 0,
    M: new Pose(),
    // A pose starting at a game position: screen y grows downward, world y up.
    at(x, y, z = 0) { return this.M.at(round(x) - this.cam, -round(y), z); },
  };

  const layer = {
    group,
    outlines: true,
    begin(cam) {
      X.cam = cam;
      for (let i = 0; i < all.length; i++) all[i].begin();
    },
    draw(kind, e) { SPECS[kind].draw(e, pieces[kind], X); },
    end() {
      for (let i = 0; i < all.length; i++) all[i].end(layer.outlines);
    },
    update(enemies, cam) {
      layer.begin(cam);
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i], kind = e.constructor.model;
        if (kind) layer.draw(kind, e);
      }
      layer.end();
    },
  };
  return layer;
}

// One enemy on its own for the preview harness, animated by a stand-in for
// the game state (see each spec's demo). Flashes as if hit every few seconds.
export function createEnemyModel(kind) {
  const spec = SPECS[kind];
  const layer = createEnemyLayer({ kinds: [kind], cap: 1, snapTo: false });
  const e = spec.demo.init();
  let acc = 0;
  return {
    group: layer.group,
    update(dt) {
      for (acc += dt; acc >= 1 / 60; acc -= 1 / 60) {
        e.t++;
        e.flash = e.t % 200 > 196 ? 3 : 0;
        spec.demo.step(e);
      }
      layer.begin(0);
      layer.draw(kind, e);
      layer.end();
    },
    setOutlines(on) { layer.outlines = on; },
    setWireframe(on) { SOLID.wireframe = on; },
  };
}
