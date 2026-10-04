# Architecture

How X-76 is put together, and the invariants worth knowing before changing anything.

## Shape of the thing

```
index.html      three stacked canvases at display resolution: back 2D (#back), WebGL (#screen3d), front 2D (#screen)
preview.html    standalone model harness (no level, no game logic)
serve.py        static dev server: no-cache, /__mtime for live reload, threaded
vendor/         three.module.js + three.core.js (r180, MIT, vendored - no install)
src/            game + harness modules
```

| File | Lines | Contents |
| --- | --- | --- |
| `src/main.js` | 952 | Game loop, state machine, spawning, collision, HUD, overlays, hitbox overlay, debug warp, "WebGL required" screen |
| `src/stages.js` | 9 | Stage registry: id, name, level module, boss class |
| `src/player.js` | 453 | Player, pod, bits, every player projectile (behaviour; drawn by `models/effects.js`) |
| `src/tuning.js` | 47 | Handling constants shared by the game and the preview sandbox |
| `src/enemies.js` | 392 | Enemy base + 9 enemy types (behaviour only; drawn by `models/enemies/`), enemy bullets |
| `src/boss.js` | 190 | Stage 1 boss ("Oculus Bloom"): behaviour and layout; drawn by `models/enemies/bloom.js` |
| `src/level1.js` | 191 | Stage 1 terrain shape, backdrop spans and spawn script |
| `src/terrain.js` | 79 | Tile collision grid and depth map |
| `src/background.js` | 97 | Starfield and nebula (2D, behind everything) |
| `src/audio.js` | 333 | Synthesised sound effects + music sequencer |
| `src/fx.js` | 120 | Particles, explosions, screen shake (simulation; drawn by `models/effects.js`) |
| `src/items.js` | 133 | Power-ups |
| `src/font.js` | 135 | Angular stroke font on a 5x7 grid, with a render cache |
| `src/input.js` | 83 | Keyboard + gamepad, edge detection |
| `src/util.js` | 48 | Constants and maths helpers |
| `src/pool.js` | 39 | Object pools and in-place, order-keeping list compaction |
| `src/smoke.js` | 105 | `?smoke=1`: scripted headless run for `tools/smoke.py` |
| `src/bench.js` | 83 | `?bench=1`: allocation benchmark for `tools/bench.py` |
| `src/view.js` | 30 | Display scale (logical → device pixels), `snap()`, scaled offscreen canvases |
| `src/render3d.js` | 273 | 3D layer: perspective camera; draws terrain and enemies, then ship, pod, shield and boss, then effects |
| `src/models/ship.js` | 188 | Procedural ship model |
| `src/models/pod.js` | 152 | Procedural pod model |
| `src/models/shield.js` | 91 | Faceted shield bubble with an impact-ripple shader |
| `src/models/terrain3d.js` | 214 | Stage terrain built from the tile grid: chamfered blocks, decals, ink lines |
| `src/models/backdrop3d.js` | 173 | Station interior and boss chamber walls, set back in depth |
| `src/models/enemies/kit.js` | 240 | Enemy pieces: baking primitives into one geometry, instanced meshes, toon + glow + hit-flash material, a matrix stack for posing |
| `src/models/enemies/index.js` | 97 | The enemy layer (every type's pieces, re-posed from game state each frame) and single-model wrappers for the harness |
| `src/models/enemies/flyers.js` | 115 | Whirler (drifter), Dart, Porter (carrier) |
| `src/models/enemies/mounts.js` | 97 | Turret, Hatch |
| `src/models/enemies/walkers.js` | 105 | Hopper, Bulwark |
| `src/models/enemies/creatures.js` | 103 | Larva, Coil Wyrm (serpent) |
| `src/models/enemies/bloom.js` | 259 | Oculus Bloom, the boss: faceted flesh wall, iris petals, eye, tentacles, spore mouths |
| `src/models/effects.js` | 537 | Particles, bullets, beam and charge orb: instanced shape batches and trail ribbons, refilled from game state each frame |
| `src/models/geom.js` | 54 | Triangle-by-triangle geometry builder with vertex colours, shared by the two above |
| `src/models/materials.js` | 128 | Toon ramp, ink-outline shader, merging static parts, shared palette |
| `src/preview.js` | 489 | Harness: orbit, sequences, fly mode, every model including enemies |
| `src/livereload.js` | 34 | Polls `/__mtime`, reloads on change |

## Game loop

`main.js` runs a fixed 60 Hz accumulator: `update()` may run several times per animation frame, `draw()` once. A thrown error is caught, logged and the loop continues, so one bad frame cannot freeze the game.

**Allocation.** Bullets and particles are pooled (`pool.js`): `game.shoot()`, `game.enemyShot()` and `fx.emit()` take a recycled object and reset it through `init()`, and every list is compacted in place at the end of a step, handing the dead back to their pools while keeping order. `PBullet.init()` resets every field any kind uses, so a recycled bullet can't inherit another kind's state; kind-specific values are set after it. Particles are one class with one field layout. `game.poolStats()` reports high-water marks, which plateau within a few minutes of play. The 3D layer builds its objects up front (models at start-up, terrain and backdrops per stage) and creates none per frame; `tools/smoke.py` fails if its scene graph changes size during play. Every draw call still costs a few hundred bytes of garbage inside Three's uniform upload, so models keep draw calls few: `mergeParts()` bakes each rigid group's parts into one mesh per material plus one outline shell (DECISIONS §24). Hot per-frame loops (collision, particles, list updates and draws) are indexed rather than `for...of`, and `collide()` does its circle arithmetic in place instead of passing doubles to helpers; both allocate whenever V8 runs the code unoptimised, which `collide()` does for a while each time a new enemy type deoptimises it. Drawing state that is the same every frame (gradients, colour strings, option objects, HUD strings) is made once. `python3 tools/bench.py` measures heap allocation per frame (simulation and drawing apart) and GC count; compare runs interleaved, because its absolute numbers drift between sessions.

States: `title` → `play` → (`gameover` | `clear`) → `title`. From `clear` the game moves on to the next entry in `STAGES` if there is one, carrying score, lives and power-ups. Pause is a flag inside `play`. The tab losing visibility auto-pauses.

`stages.js` lists the stages. `main.js` reads everything stage-specific (terrain, spawns, checkpoints, scroll limits, boss class, names) through `game.stage`, so a new stage is one entry there plus its level and boss modules. Terrain is built when a stage is first entered and kept until the stage changes.

## Coordinates and scrolling

- The camera (`game.cam`) only moves right, at `SCROLL` = 0.55 px/frame, and stops at `BOSS_CAM` = 5600.
- **Everything lives in world coordinates.** Entities that should hold station relative to the screen set `relative = true`, which adds `scrollDelta` to their x each frame. Terrain-mounted things (turrets, hatches, walkers) leave it false.
- Drawing uses `camD = snap(cam)` and entities snap their own position (`snap(x) - cam`), both to whole *device* pixels. Static props stay locked to the terrain instead of shimmering, and slow scrolls move one device pixel at a time.
- Screen y grows downward throughout the 2D game.

## Collision

All collision is circle-based and lives in `main.js#collide()`.

- Enemies expose either themselves or a `parts` array of `{x, y, r, armored}`. Armored parts block shots (spark + "tink") but take no damage; this is how the boss's iris, the serpent's body and tentacle segments work.
- Beams pierce: they carry a `power` budget and a `hitSet` keyed by *part*, so one beam can chew through several enemies but only hits each part once.
- The pod and bits damage what they touch and absorb enemy bullets.
- The player has a percentage shield (`SHIELD_*` in `tuning.js`). Enemy bullets, enemy parts, the boss and terrain all go through `game.hitPlayer(kind, angle)`, which spends shield and opens a short invulnerable window (`player.inv`, with `player.hitT` marking it as a hit rather than a respawn). A hit on an empty shield destroys the ship.
- Touching terrain also bounces the ship back to its last clear position. If that position is no longer reachable (pinned against a wall by the scroll), the ship is crushed outright.

## Terrain

`terrain.js` holds a `Uint8Array` grid: 8px tiles, 28 rows (224px), 748 columns for stage 1. Values are tile *types* (hull / organic / machine), not sprites.

It's drawn in 3D by `models/terrain3d.js`, built once per stage (about 20 ms for stage 1) in 64-column chunks, each a merged mesh, a mesh of indicator lights and a set of ink lines, so a frame draws a handful of calls. Every solid tile contributes a **front face at z = 0 exactly over its tile**, inset where an edge is exposed to make room for a 45° chamfer; exposed edges then recede to z = −`DEPTH` (28). Colour comes from vertex colours: `computeDepth()` measures each tile's distance to the nearest empty tile, and deeper tiles get darker fronts. Panel seams, vents, rivets, lights, blotches, veins and spikes are cheap geometry placed by per-tile seeds. The terrain group scrolls by the same device-snapped `camD` as the 2D sprites, so terrain-mounted enemies stay locked to it. Changing the grid needs another `computeDepth()` and a rebuild (`r3d.setTerrain`).

Behind it, `models/backdrop3d.js` builds the walls listed in the level's `BACKDROPS` (`{ kind, x0, x1 }` in world x): the station interior (a recessed-panel wall at z = −230, trusses at −150, columns with warning lamps at −110) and the boss chamber (a jittered, faceted flesh sheet at −200 with tendons standing off it). They scroll with the terrain; the perspective camera alone makes deeper layers slide slower, so there's no per-layer parallax code. Designs are scaled up by `(CAM_DIST − z) / CAM_DIST` so they read at the size the old 2D tiles had. Fog on the world scene starts just behind the terrain, so the backdrops darken with depth and never compete with it.

Queries: `solidAt(x, y)`, `boxSolid(cx, cy, hw, hh)`, `floorY(x, fromY)`, `ceilY(x, fromY)`. The `fromY` hints matter — scanning for a floor from the wrong side finds the wrong surface (this caused a real bug with turrets mounted on the central block).

## Stage 1

`level1.js` exports `buildTerrain()`, `buildSpawns()`, `BACKDROPS`, `CHECKPOINTS`, `WARNING_CAM`, `BOSS_CAM` and `SCROLL`; every level module has the same shape.

- Terrain is built from ceiling/floor height profiles per column plus explicit rectangles for pillars, blocks and obstacles.
- Spawns are a list sorted by camera position: `{x: camTrigger, type, ...opts}`. Terrain-mounted enemies carry `wx` (world x) and `static: true`, and are triggered a screen-width early.
- Constants: `CHECKPOINTS = [0, 1080, 2560, 3480, 4560, 5300]`, `WARNING_CAM = 5470`, `BOSS_CAM = 5600`.
- Death sends the player back to the highest checkpoint passed, clears the field and **removes all power-ups** (arcade-style). Passing a checkpoint, and every new life, refills the shield.

Enemies: Drifter, Dart, Carrier (drops power-ups, including shield cells), Turret, Hopper, Bulwark (heavy walker), Hatch (spawner), Larva, Serpent. Boss: 170 hp, an armoured iris that opens on a cycle, two 16-segment tentacles, spore launches, and a faster second phase below half health.

## Rendering: three stacked layers

**Resolution.** `fit()` in `main.js` sizes the canvases to the largest 384×240 box that fits the window (fractional, aspect preserved) and sets its backing store to that size × `devicePixelRatio`, capped at `MAX_SCALE` = 6. That multiplier is `view.s` (`view.js`). `draw()` starts with `setTransform(s, …)`, so every draw call still works in logical pixels. Anything pre-rendered (font glyphs, nebula, the HUD ship icon) is built at `view.s` through `scaledCanvas()` and rebuilt when `view.gen` changes, then blitted 1:1. `fit()` runs on resize, fullscreen change and pixel-ratio change; everything else picks the new scale up on its next draw.

Back to front (DECISIONS §22):

| Layer | Canvas | Draws |
| --- | --- | --- |
| Back 2D | `#back` (`bctx`) | Starfield and nebula |
| 3D, pass 1 | `#screen3d` | Backdrops (z −110 to −230, fogged), terrain and enemies, depth-tested together |
| 3D, pass 2 | `#screen3d` | Ship, pod, shield bubble and the boss, always over terrain (depth cleared between passes) |
| 3D, pass 3 | `#screen3d` | Effects: particles, player and enemy bullets, the beam and the charge orb, with no depth test |
| Front 2D | `#screen` (`ctx`) | Items, bits, score popups, the white flash, HUD, overlays |

The WebGL canvas covers only the playfield (93.333% height, the HUD strip excluded). Screen shake is one offset applied to all three layers, so sprites never slide off the terrain. Effects draw last in the 3D layer and ignore depth, so enemy bullets stay visible over the ship and explosions over the boss (DECISIONS §27); front-layer sprites (items, bits) draw over everything 3D, and overlays (pause, game over) dim everything. Enemies share the terrain's depth buffer (DECISIONS §25): a turret sits on its block, and anything that strays into a wall is hidden by it. The ship pass draws over them. So does the boss, which grows over the chamber's back wall (terrain from column 744) and would otherwise sink behind its face (DECISIONS §26); the larvae it releases start out under it. `game.showHitboxes = true` draws every enemy's collision circles (and the player's) over the lot. The shield bubble reads `player.shield` and `player.lastHit`.

`render3d.js`:

- **Perspective camera** at `CAM_DIST` = 640 in front of the play plane, with a field of view chosen so the z = 0 plane maps **game pixels 1:1** to world units. An entity at screen (x, y) is placed at world (x, −y, 0); terrain faces receding into −z show as up to ~8px slivers at the screen edges and nothing at the centre.
- Internal resolution is the display scale (`setScale(view.s)`), so the 3D models are exactly as sharp as the 2D canvas under them. See DECISIONS §15.
- The ship model is scaled 0.78 and the pod 0.72 (`SHIP_SCALE`, `POD_SCALE` in `tuning.js`), which is what makes them the right size on a 384px-wide field.
- **WebGL is required.** `Render3D.create()` returns `null` when WebGL is unavailable; the boot code in `main.js` then shows a "WebGL required" screen on the 2D canvas and never creates the `Game`, so game code can assume `game.r3d` exists. See DECISIONS §21.
- The layer reads `player.tilt` (vertical lean) and `player.turn` (horizontal lean) and passes them as `bank` and `dip`. The ship model uses only dip's magnitude, so the nose drops whichever way the ship slides. It also watches `pod.state` and triggers the pod's clamp/release animations on transitions.
- Enemies are drawn by `models/enemies/`: each class names its model in `static model` (`'turret'`, `'larva'`, `'boss'`...), and the layer re-poses every live enemy from its state each frame (position, heading, walk phase, hatch opening, `flash`). A spec marked `front` (the boss) goes in the layer's `front` group, which sits in the ship's scene.
- `renderTitle(t)` poses the ship larger and turning for the title screen; `render()` resets scale and pose.

## Models

Built in code, no asset files. Conventions:

- **+X forward, +Y up, +Z out.** A model's root carries the display pose (a small yaw and pitch, so a side-on camera still sees the top and flank); a child group takes bank/dip so the pose is not disturbed.
- **Angular only.** Prisms use 4-8 radial segments; plates are extruded 2D outlines with a bevel; the pod's core is an octahedron. Nothing reads as a smooth curve.
- **Cel shading**: `MeshToonMaterial` with a 3-step gradient ramp.
- **Ink outlines**: an inverted-hull shell per mesh — the same geometry with `side: BackSide`, pushed along its normals by a shader. `part(geometry, material, {outline})` builds the mesh + shell pair; `setOutlines(false)` hides every shell.
- **Merged parts**: once built, `mergeParts(group)` bakes every part under a group that moves as one (the ship's `bank`, the pod's spinning plates, each claw hinge) into one mesh per material and one outline shell, pushed out by each part's own thickness. A part that needs to move on its own must sit in its own group and be merged separately, or not at all.
- Ship: four swept arms in an X, hull tapering to a drooped nose, faceted canopy on the nose, muzzle flash and recoil on `fire(power)`.
- Pod: faceted core inside three armour plates on a faceted ring, three claws on a rig that flips to face the hull it grips. `clamp()` snaps the claws shut with a jolt and flash; `release()` opens them.
- **Enemies** are built differently, because there are many of each: every type is a few rigid *pieces* (a body, a leg, a barrel, a door), and each piece is one `InstancedMesh` plus one instanced ink shell holding every copy on screen. A `Piece` collects primitives with a colour each and bakes them into one geometry with vertex colours and a per-vertex glow flag (lights and eyes skip shading); a patched toon material adds glow and a per-instance hit flash. There's one copy per pass and per tinted-or-not (`solidMaterial(front, tint)` in `kit.js`), because Three re-acquires a material's program whenever the fog, lights or per-instance colours it is drawn with change (DECISIONS §26). Each spec's `draw(e, P, X)` poses its pieces from the enemy with a small matrix stack (`X.at(x, y)`, then `t`/`rx`/`ry`/`rz`/`s` like nested groups) and `put`s them. Draw calls depend on which piece types are on screen, never on enemy count, and the scene graph is fixed at start-up. Instance capacities (`cap`) are about twice the most stage 1 has alive at once; overflowing one warns once and drops the extra copies. Units are game pixels, so the models need no scale; greys sit a little darker and cooler than the ship's, with colour kept to lights and weak points, and the organic Larva and Coil Wyrm in muted greens and mauves.
- **Oculus Bloom** (the boss) uses the same kit with one instance of each piece. Its wall is a jittered grid of flat triangles, each its own flesh shade (a piece can keep a geometry's own vertex colours), sunk into a socket around the eye, with bone ribs, veins, knobs, sockets and spore mouths baked on. Eight iris petals hinge at the rim: closed they meet over the eye in a shallow cone, and open they fold back toward the camera. The crater's glow and the iris brighten with `open`, and the pupil widens. Tentacle rings are placed from `tent[].segs`. The body flushes red in the second phase and darkens while dying. The mouths' teeth gape for a moment after `launchT`, the one field the boss keeps only for the renderer. The model disappears under the death flash (`st` 150); the explosions carry on.

- **Effects** (`models/effects.js`) are read each frame from `fx.p`, `pbullets`, `ebullets` and the player's charge, and drawn as a few instanced *shapes* rather than one mesh per thing: a soft octagon (fire, pod shots, the orb's halo), a diamond streak (sparks, shots, exhaust), a 12-sided ring, a faceted beam prism, a gem (the orb, enemy bullets) and a missile. Each shape is one `InstancedBufferGeometry` whose instances are placed in the shader from three `vec4` attributes (position and roll; turn, length, width and band; colour and alpha), so a batch is one draw call however full it is, and an empty one is hidden. Shapes carry a per-vertex weight that fades alpha toward the rim, which gives soft glow with straight edges. Laser trails and the beam's wisps are ribbons written into one shared vertex buffer: neighbouring segments share their joint vertices, so a bending trail doesn't brighten at every joint the way overlapping additive pieces do. The hot paths pass only objects and integers to calls V8 might not inline, which would otherwise box every fractional number passed (DECISIONS §27). Glow is additive and also raises alpha by its brightest channel, so the canvas never holds a colour brighter than its alpha (undefined in premultiplied compositing); smoke, missiles and enemy bullets blend normally, and enemy bullets draw last. Capacities are fixed; overflowing one warns once and drops the extras. Screen shake moves the camera, so effects shake with the rest. The full-screen white flash stays 2D.

## Audio

Everything is synthesised at runtime (`audio.js`): oscillators and filtered noise for effects, a lookahead scheduler for music. Two original tunes (stage, boss) plus a clear jingle, written as note-name strings. The beam charge is a continuous oscillator whose frequency tracks the charge level. Audio only initialises after a user gesture, as browsers require.

## Preview harness

`preview.html` + `preview.js`, independent of the game. Controls sit along the bottom.

- **Fly it** — a sandbox using the game's own `Input` class and the game's per-frame constants imported from `tuning.js` (speed, banking, charge timing, beam levels, pod state machine), so handling matches the game. Conversion: preview world units = game pixels ÷ 0.78.
- **Sequences** — firing, charged beam, pod fly-in, pod docking front/rear. Each loops and can be replayed.
- The model list includes every enemy, each driven by a small stand-in for its game state (a `demo` in its spec) and flashing as if hit every few seconds.
- Orbit/zoom, preset camera angles, outline/wireframe/grid toggles, light angle, backgrounds, PNG export.
- The active sequence is remembered in `sessionStorage` so a live reload drops you back in place.

## Dev server and live reload

`serve.py` is a threaded `http.server` that sends `Cache-Control: no-store` (so edited modules always reload) and serves `/__mtime`, the newest mtime across `.js`/`.html`/`.css`. `livereload.js` polls it every 700ms and reloads on change, tolerating short outages such as a server restart. Only the preview page imports it; the game page does not.
