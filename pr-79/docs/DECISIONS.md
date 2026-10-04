# Decisions

Why things are the way they are. Newest last. If one of these looks wrong, check the rationale before undoing it.

## 1. Inspired by R-Type, never a copy

**Decision:** original art, music, names, enemies and bosses throughout. Game *mechanics* are borrowed freely (charge beam, detachable pod, three laser colours, drones, terrain that kills, checkpoint restarts, a boss with an exposed weak point); expression is not.

**Why:** R-Type's sprites, characters, music and level art belong to Irem. Mechanics are not protected in the same way. This held even when asked for an exact copy "for personal use only" — private use does not change ownership. Reference images supplied during design (R-9A hangar art, Archangel, Gundam-style mecha) were used for *style* cues only: panel density, cel shading, colour blocking, three-quarter framing.

**Consequence:** the game is called X-76, the boss is "Oculus Bloom", and the ship is an original X-form design. Requests that amount to "make it look exactly like X" get an original interpretation plus a note about what was deliberately not copied.

## 2. No build step, no dependencies

**Decision:** plain ES modules served statically; Three.js vendored into `vendor/`.

**Why:** the brief was that it runs in the browser with nothing to install. A bundler would add a toolchain to maintain for no gameplay benefit. Vendoring keeps the "no install" promise while allowing a real 3D library.

**Cost:** `vendor/` is ~2MB and dominates the diff line count. Accepted.

## 3. Everything generated in code

**Decision:** no image, audio or model files. Canvas 2D drawing, Three.js primitives, Web Audio synthesis.

**Why:** keeps the repo self-contained and every asset editable by changing code. It also means the art can be regenerated at any resolution.

**Cost:** hand-drawn detail is limited by what is reasonable to express as geometry — this is the main reason early 2D ship attempts looked flat. If photoreal or hand-painted art is ever wanted, the answer is image files or glTF models, not more drawing code.

## 4. Fixed 60 Hz simulation, decoupled rendering

**Decision:** accumulator stepping `update()` at exactly 1/60s; all tuning constants are per-frame.

**Why:** deterministic feel, and arcade games of this type are tuned per frame. It also lets the preview sandbox reuse the same numbers and match the game's handling exactly.

## 5. 2D gameplay, 3D presentation layer

**Decision:** the 3D layer only reads state and draws. Movement, collision, spawning and scoring stay in the 2D simulation.

**Why:** converting the whole engine to 3D would have risked the working stage while delivering nothing gameplay-wise. This way the conversion is incremental and reversible.

**Consequence:** a transparent WebGL canvas is stacked over the 2D canvas, so 3D objects always draw on top of 2D ones. Fine while only the player and pod were 3D; revisited when terrain converted (§22).

## 6. Keep the 2D sprites as a fallback (superseded by §21)

**Decision:** `Render3D.create()` returned `null` on failure and the game drew the old sprites; `?flat=1` forced it. Since [#26](https://github.com/moamoamorte/x-76/issues/26) a failure shows a "WebGL required" screen instead.

**Why:** WebGL can be unavailable or blocked, and having a working comparison path made the 3D work much easier to evaluate.

## 7. Models are angular, greyscale, and built from primitives

**Decision:** no curved geometry anywhere on the ship or pod; greyscale hull with colour reserved for cockpit, engines and the pod core.

**Why:** direct art direction from the user ("the style is angular", "mainly grey"). The pod core keeps the laser colour because it is the only cue for which weapon you are carrying.

## 8. Cel shading with inverted-hull outlines

**Decision:** `MeshToonMaterial` with a 3-step ramp, plus a back-face shell pushed along normals for ink lines.

**Why:** matches the hand-inked anime look in the reference images, and works without post-processing passes (no `EffectComposer`, no addons — which also keeps the vendored surface to two files).

## 9. 3D renders at 3x internal resolution (superseded by §15)

**Decision:** the WebGL canvas was 1152×672 for a 384×224 field. Since [#4](https://github.com/moamoamorte/x-76/issues/4) it renders at the display scale instead, the same as the 2D canvas.

**Why:** the detail in the models is invisible at 1x — this was demonstrated with side-by-side thumbnails during design.

**Open problem:** the result is mixed sharpness — crisp 3D ship against chunky pixel-art terrain. Two coherent endpoints exist (render 3D at 1x for a true retro look, or raise the whole game's resolution and redo the 2D art). Resolved by §15.

## 10. The docked pod engulfs the nose, and its hitbox follows

**Decision:** when docked, the pod sits back over the hull so it swallows the nose tip (or caps the tail), and its gameplay position is that drawn position. The offsets live in `DOCK` in `player.js`; the preview harness imports them.

**Why:** the pod read as floating in front of the ship. The first fix only moved the drawing ~7px back and left gameplay alone, so the pod blocked bullets ahead of where it appeared. That offset was folded into gameplay in [#10](https://github.com/moamoamorte/x-76/issues/10).

**Consequence:** the docked shield sits ~7px closer to the ship than it originally did.

## 11. Checkpoints wipe power-ups

**Decision:** dying returns you to the last checkpoint and strips the pod, speed, missiles and bits.

**Why:** authentic to the genre and to the difficulty curve it implies. Worth revisiting only as a deliberate difficulty decision.

## 12. Preview harness as a first-class tool

**Decision:** a standalone page with model inspection, scripted animation sequences, and a flyable sandbox sharing the game's input and constants.

**Why:** iterating on models through the game is slow and needs a level running. The harness made every ship revision a few seconds' work.

**Consequence:** the sandbox re-implements the player and pod update logic, but takes every tuning number from `src/tuning.js`, which the game uses too. Changing a value there changes both. Changing the *logic* in `player.js` (a new state, a different formula) still has to be mirrored in `stepPlay` / `stepPod` by hand — if handling ever feels different between the two, that is the first suspect.

## 13. Live reload via polling

**Decision:** `serve.py` exposes `/__mtime`; the preview polls every 700ms.

**Why:** simpler and more robust than SSE or websockets for a single-user dev server, and degrades silently on any other static server.

## 14. Renamed to Xiphos

**Decision:** the game was renamed from Nebula Lance; high scores saved under the old key are migrated on load.

**Why:** requested a name with an "x"; a xiphos is a short sword, which suits the blade-like hull and the X-form arms.

## 15. Art target: modern high-res, gameplay stays 384×224

**Decision:** resolve the mixed sharpness from §9 by going high-res rather than retro. Both the 2D canvas and the 3D layer render at the device's real size × `devicePixelRatio`; the 2D art is redrawn to suit. Gameplay keeps its 384×224 logical field, so coordinates, tuning constants and level data do not change.

**Why:** owner's choice between the two endpoints in §9. Keeping the logical coordinates fixed makes this a rendering-only change, consistent with §5.

**Consequence:** 3D conversion work targets display resolution. Pre-rendered 2D caches (font, backgrounds, terrain) must be rebuilt at the display scale. Done in [#4](https://github.com/moamoamorte/x-76/issues/4), with these details:

- **Scale is capped at 6** device pixels per logical pixel (`MAX_SCALE` in `view.js`); past that the browser upscales the canvas. Measured in headless Chrome on an M2 Mac, a 2304×1440 backing store holds 60 fps with under 1 ms of CPU per draw, but cache memory grows with the square of the scale, and a 4K screen at DPR 2 would want 9.
- **Terrain art was drawn lazily in 256px strips** near the camera rather than as one stage-wide canvas: at scale 6 the whole of stage 1 would be ~36000px wide, past browser canvas limits and hundreds of MB. Replaced by 3D terrain in [#5](https://github.com/moamoamorte/x-76/issues/5) (§22), which keeps the per-tile seeds.
- **Pixel-locking moved to device pixels.** The camera and sprite origins snap to whole device pixels (`snap()`), not logical ones, so slow scrolls step by one device pixel instead of jumping by several, and terrain-mounted sprites still stay locked to the terrain.

## 16. No visible gun barrels on the ship

**Decision:** the ship stays clean; shots continue to appear from the nose.

**Why:** owner's call when the backlog was migrated to GitHub Issues.

## 17. Renamed to X-76

**Decision:** the game was renamed from Xiphos; the GitHub repo followed, from `r-type` to `x-76`. High scores saved under `xiphos-hi` or the older `nebula-lance-hi` are migrated on load.

**Why:** owner's choice, tracked in [#24](https://github.com/moamoamorte/x-76/issues/24). `r-type` as a repo name named the game this project is inspired by rather than the project itself (see §1); `x-76` doesn't have that problem.

## 18. iPhone fullscreen via Home Screen web app

**Decision:** on iPhone, the FS button explains how to add the game to the Home Screen instead of calling `requestFullscreen()`. The page ships a manifest and Apple's web-app meta tags so the Home Screen launch has no browser UI.

**Why:** iPhone Safari has no element Fullscreen API on any iOS version; iPadOS 16.4 added it for iPad only. Four PRs (#49, #51, #53, #54) tuned the event wiring before this was spotted, and none of them could have worked on iPhone. Tracked in [#56](https://github.com/moamoamorte/x-76/issues/56).

**Consequence:** with `viewport-fit=cover` the page runs under the notch and home indicator, so `body` is padded by the safe-area insets and `fit()` sizes the canvas to the padded box. Anything new positioned against the viewport rather than inside `#wrap` has to respect those insets itself. There's no Home Screen icon yet, so iOS uses a page snapshot.

## 19. A percentage shield instead of one-hit deaths

**Decision:** the ship carries a shield from 0 to 100%. Every hit costs a share of it (`SHIELD_DAMAGE` in `tuning.js`: bullets, big bullets, enemy contact, boss contact and terrain each have their own cost). A hit landing on an empty shield destroys the ship. The shield does not regenerate over time; it refills on reaching a checkpoint and on every new life, and a shield cell dropped by carriers restores `SHIELD_PICKUP`. Terrain and boss contact cost shield like anything else, and the ship bounces off walls; only being pinned against a wall by the scroll still kills outright.

**Why:** owner's answers on [#14](https://github.com/moamoamorte/x-76/issues/14). A percentage rather than a few fixed points lets different hits cost different amounts.

**Consequence:** stage 1 is much easier than it was tuned for. The damage numbers are placeholders; enemy placement, bullet volume and the costs themselves are rebalanced together in [#12](https://github.com/moamoamorte/x-76/issues/12). Respawn invulnerability still blinks the ship; the shorter window after a shield hit doesn't, so the two can't be confused. The shield bubble is invisible until something hits it (owner's call): each hit flashes it up and it fades out over that window, so the HUD meter is the only resting readout.

## 20. A stroke font instead of the 5x7 bitmap font

**Decision:** text is drawn with an angular stroke font: polylines through the old 5x7 grid's pixel centres, 45-degree chamfers where a bitmap font rounds a corner, stroked a little under one logical pixel wide and cached at display resolution. The advance (6px), cap height (7px) and drop shadow are unchanged, so no layout moved.

**Why:** owner's answer on [#62](https://github.com/moamoamorte/x-76/issues/62), chosen over keeping the block font. At display resolution the blocks read as 4–6px squares next to the 3D ship; strokes stay clean at any scale and the chamfers match the models' angular style.

**Consequence:** a new glyph is a string of points in `GLYPHS` (`src/font.js`); `*x,y` is a square dot. Unknown characters fall back to `?`.

## 21. WebGL is required; the 2D fallback is gone

**Decision:** when WebGL can't start, the page shows a "WebGL required" screen and the game doesn't boot. The 2D ship and pod sprites, the 2D shield outline, the `?flat=1` switch and the smoke test's flat pass are deleted. Enemies, the boss, effects and terrain keep their 2D drawing until each is converted (#5, #7–#9), then lose it.

**Why:** owner's choice on [#26](https://github.com/moamoamorte/x-76/issues/26), option 3 of three (keep a full fallback, keep a minimal one, drop it). Every 3D conversion would otherwise have had to keep a matching 2D path alive, roughly doubling the art work, for the rare browser without WebGL.

**Consequence:** game code can call `game.r3d` without null checks. The smoke test runs once, on SwiftShader, and fails outright if WebGL can't start. The side-by-side 2D/3D comparison that §6 valued is gone; the preview harness remains the place to inspect models.

## 22. 3D terrain: perspective camera, three canvases, two passes

**Decision:** terrain is 3D geometry built from the tile grid, with every block's front face at z = 0 exactly over its tiles. The 3D layer uses a perspective camera placed so z = 0 maps game pixels 1:1. The page stacks three canvases: background (2D), WebGL, then sprites, HUD and overlays (2D). WebGL draws terrain, clears depth, then draws the ship, pod and shield.

**Why:** from [#5](https://github.com/moamoamorte/x-76/issues/5) and [#6](https://github.com/moamoamorte/x-76/issues/6).

- *Perspective rather than orthographic:* an orthographic camera looking straight down −z only ever shows a block's front face, so extruded terrain would look exactly like the flat art it replaces. A perspective camera shows the top, bottom and side faces facing the screen centre, and keeps everything at z = 0 (block fronts, the ship) exactly where gameplay has it, so collision and visuals still agree. `CAM_DIST` = 640 keeps the effect modest: receding faces show as at most ~8px at the screen's side edges.
- *Front/back 2D canvases rather than a CanvasTexture in the scene:* uploading the whole 2D layer as a texture every frame, at display resolution (up to 2304×1344), costs far more than compositing one extra canvas, and buys nothing until 2D sprites need to sit *between* 3D objects. Every 2D sprite today belongs in front of terrain, which is how the 2D game layered them.
- *Two passes:* the ship's model is wider than its hitbox, so it often overlaps a wall it's grazing without touching it. In one depth-tested pass the wall's front face (z = 0) would cut off the half of the ship behind z = 0.

**Consequence:** front-layer sprites (enemy bullets, explosions, items) now draw over the 3D ship rather than under it, and overlays dim the ship too. The station and chamber walls followed in [#67](https://github.com/moamoamorte/x-76/issues/67): they're geometry set back to z −110…−230, so the camera's perspective gives them parallax (old 2D factor 0.5, now 0.74–0.85 by depth, with layers within a wall sliding against each other). Only the starfield and nebula, effectively at infinity, stay on the back canvas. When enemies convert (#7), each one moves from the front canvas into the 3D scene, and the layer table in ARCHITECTURE.md should follow.

## 23. Pool bullets and particles; the 3D layer creates nothing per frame

**Decision:** player bullets, enemy bullets and effect particles come from free-list pools and are reset by `init()`; game lists are compacted in place. Three.js objects are created only at start-up and per stage, never per entity per frame, and the smoke test enforces it. Enemies and items are not pooled.

**Why:** [#20](https://github.com/moamoamorte/x-76/issues/20), ahead of enemies and effects becoming 3D meshes (#7, #9), when per-frame churn would cost more. Enemies and items are spawned at most a few per second, so pooling them buys little and their constructors carry per-type state that would all need resetting.

**Consequence:** a new bullet kind must reset its fields in `PBullet.init()`; a new particle field goes in `Particle.init()`. `tools/bench.py` exists to measure this kind of change. Measured with it on a fire-heavy run, the simulation allocates 13–26% less (interleaved runs; the absolute numbers drift between sessions). But most of what the game allocates per frame is drawing, about a third 2D canvas work and two thirds inside Three.js's renderer (two passes a frame), so total GC frequency did not change measurably. The drawing side, and the simulation's remaining allocation that the pools don't explain, are [#70](https://github.com/moamoamorte/x-76/issues/70).

## 24. Few draw calls per model; hot loops that allocate in no JIT tier

**Decision:** models merge each rigid group's parts into one mesh per material plus one outline shell (`mergeParts()` in `models/materials.js`), baked with each part's own outline thickness. `collide()` and the other per-frame loops over game lists use indexed loops, and `collide()` does its hit arithmetic in place rather than passing coordinates to helpers. Per-frame 2D drawing state that never changes (gradients, `rgba()` strings, option objects, HUD strings, closures) is made once.

**Why:** [#70](https://github.com/moamoamorte/x-76/issues/70), after pooling (§23) left about 76 KB a frame of allocation on `tools/bench.py`'s run. Chrome's sampling heap profiler, plus heap deltas around single calls, showed:

- *Three.js costs about 0.3 KB per draw call, whatever the material.* Its uniform setters copy each object's matrices into per-uniform cache arrays, and V8 boxes the fractional numbers. Changing the cache arrays' type from outside (doubles, `Float64Array`) didn't help and `Float64Array` made it worse, because Three's shared `arraysEqual`/`copyArray` helpers see every kind of array. The vendored library stays unpatched (hard constraint 1). What's left on our side is the number of draws: the ship and pod were about 110 of the frame's ~125, two per part (mesh plus outline shell). Merged, they're about 30, pixel-identical at 4× apart from 1–3 edge pixels.
- *`collide()` runs unoptimised much of the time.* It's deoptimised whenever a new enemy type, part shape or field type reaches it ("prototype chain changed", "field type constness changed", "wrong map"), and in the lower tiers `for...of` allocates iterator results and every double passed to a call is boxed. Over the benchmark it reached TurboFan once and Maglev about twenty times.
- *2D drawing* was a few KB a frame, mostly doubles passed to Canvas calls, which can't be avoided at fractional device coordinates. The avoidable part was per-frame gradients, template strings, `drawText` cache keys and option objects.

Measured with `tools/bench.py`, four runs interleaved against `main` in one session (`bench.js` now draws once after each warp, so the one-off terrain build isn't counted): **75–81 → 40–41 KB a frame** (simulation 26–31 → 16–17, drawing 49–50 → 23–25), with the same per-step game state hash over the whole run. The bench's GC count fell less, 94–110 → 81–89, because V8 shrinks the young generation as allocation slows. Traced, scavenges fell from about 41 to 24 per run and their time from 14 to 6–9 ms. Main-thread GC time was only about 20 ms a minute to begin with, so this is headroom for #7 and #9 rather than a fix for a visible stall.

**Consequence:** each new 3D model, and each enemy or effect converted in #7 and #9, should count its draw calls; as a rule of thumb, every draw call visible in a frame costs about 0.3 KB of garbage. Parts that animate independently need their own group, merged on its own. Anything per-object (enemies in #7) wants `InstancedMesh` or merged geometry rather than a mesh per piece. A new per-frame loop over game lists should be indexed.

## 25. Enemies are instanced pieces in the terrain's pass

**Decision:** every stage 1 enemy is a 3D model, drawn as a few rigid pieces per type (body, leg, barrel, door, ring...), each piece one `InstancedMesh` plus one instanced ink shell sized for every copy the stage can have alive. They draw in the first pass with the terrain, sharing its depth buffer. Their 2D sprites are deleted. The boss stays 2D until #8.

**Why:** [#7](https://github.com/moamoamorte/x-76/issues/7). The issue suggested a pool of whole models, one per enemy. That would cost one or two draw calls per rigid group per enemy: a busy screen of a dozen Whirlers, a few turrets and a Porter would add 40–60 draws, about 0.3 KB of garbage each (§24), and growing a pool mid-play would trip the smoke test's fixed scene graph (§23). Instanced pieces cost the same however many enemies share them: measured on stage 1, 17 enemies of two types add 6 draw calls and the busiest mix 25. `tools/bench.py`, three runs interleaved with `main`: 38.8–39.4 KB a frame against 40.0–40.6, and 64–68 GCs against 78–83, so the 3D enemies allocate no more than the 2D sprites they replace. Sharing the terrain's depth buffer is what the 3D terrain was for (§22): turrets and hatches sit on their blocks, and walkers stand on the floor.

**Consequence:**
- Posing happens in JS from game state, so the 3D layer still only reads (§5). A new enemy type is a spec in `src/models/enemies/` (pieces, `cap`, `draw`, a `demo` for the harness) plus `static model` on its class.
- Animation is derived from existing state rather than kept by the renderer: spin and walk phase from `t`, the Hopper's crouch from `ground` and `vy`, the Bulwark's legs from `walkT`. Nothing per enemy needs creating or freeing.
- Enemies are now behind the ship (pass 2), where the 2D sprites were in front. Enemy bullets are still 2D and still draw over everything.
- Anything inside terrain is hidden by it. That's right for a larva burrowing through a wall, but it also half-buries the four central-block turrets that spawn inside the block ([#66](https://github.com/moamoamorte/x-76/issues/66)); the 2D sprites used to draw over it.

## 26. The boss draws over the terrain

**Decision:** Oculus Bloom is a 3D model built with the enemy kit (§25), but drawn in the second pass with the ship rather than in the terrain's pass. Its 2D drawing, including the pre-rendered body canvas, is deleted.

**Why:** [#8](https://github.com/moamoamorte/x-76/issues/8). The chamber's back wall is terrain from column 744, a block whose front face is at z = 0 from screen x 352 onward. The boss is drawn growing over it, and most of its wall (curling back to z −18 at the leading edge) would sink behind that face, leaving only the eye and tentacles. The 2D sprite simply drew on top, so the second pass keeps that. The ship and the boss now depth-test against each other, which only matters when they overlap, and that is a collision anyway.

**Consequence:**
- Larvae from the spore mouths stay in the terrain pass, so they emerge from under the boss.
- Only one field was added to the game for the model: `launchT`, the frame larvae last launched, which makes the mouths gape. A seeded, scripted fight through to stage clear hashes the same game state every frame on this branch and on `main`.
- The open iris has to read at a glance. Closed, eight petals meet over the eye in a shallow cone; open, they fold back toward the camera, the crater glows and the pupil widens. The wall sinks into a socket around the eye so nothing covers it.
- The model vanishes at the death flash (`st` 150) instead of fading, because its materials are opaque; the flash covers the cut.
- **One toon material per pass and per tint.** The first version shared one enemy material everywhere and drew about 8 KB a frame more than `main` on `tools/bench.py`. Chrome's sampling heap profiler (including garbage already collected) put over 30 KB of each boss-fight frame in Three's `getProgram`: `getParameters` and the program cache key. Three keys a material's program on the scene's fog and lights and on whether an instanced mesh has per-instance colours. The boss mixes tinted pieces (body, crater, iris) with untinted ones and draws in the fogless second pass, so the shared material changed program state many times a frame, and each change rebuilds the parameters. `solidMaterial(front, tint)` keeps a material per combination, so none ever changes. Boss-fight drawing fell from 46 to 11 KB a frame (9.5 on `main` with the 2D boss), and `tools/bench.py` (two runs of three, interleaved) is back level with `main`: 39.1–39.5 KB a frame against 39.3, with the same GC counts. The Porter's tinted canister had been paying a smaller share of this since #7.

## 27. Effects are instanced shapes in a third pass, over everything

**Decision:** explosion particles, player and enemy bullets, the charge beam and the charge orb are drawn in 3D by `models/effects.js`, in a third pass after the ship's, with no depth test. Each is built from a handful of shapes (soft octagon, diamond streak, ring, faceted beam prism, gem, missile); each shape is one instanced batch placed in the shader, and laser trails are ribbons in one shared buffer. Glow is additive; smoke, missiles and enemy bullets blend normally, and enemy bullets draw last. Their 2D drawing is deleted. No bloom: there's no post-processing, so `vendor/` stays at two files (§8). Items, bits, score popups and the white flash stay on the 2D front canvas.

**Why:** [#9](https://github.com/moamoamorte/x-76/issues/9).

- *A pass of their own, not depth-tested against the scene:* most effects happen on or against a model (a shot bursting on the boss, sparks off a wall's front face at z = 0, a bullet crossing the ship), and a depth test would cut them in half or hide them, exactly as the boss sank behind the chamber wall (§26). Enemy bullets in particular must stay readable over the ship, which the 2D canvas gave them by drawing on top. With the depth test off, convex shapes rely on back-face culling to avoid drawing their far sides over their near ones.
- *Instanced shapes rather than meshes per particle or kind:* draw calls stay at one per shape in use (ten batches and the ribbon buffer at most) however many particles there are, each draw costing about 0.3 KB of garbage (§24), and nothing is created during play (§23). Instances carry position, roll, turn, length, width, band width and colour in three `vec4` attributes, so a particle needs no matrix.
- *Ribbons for trails:* the first version drew each stretch of a trail as an instance, overlapping at the joints so bends had no gaps. Additive overlaps brightened into beads at every joint along the red helix. Ribbons share their joint vertices, so nothing overlaps.
- *Alpha raised with additive colour:* adding colour while leaving alpha alone is the textbook additive glow on a transparent canvas, but it leaves pixels whose colour exceeds their alpha, which premultiplied compositing leaves undefined. Adding the brightest channel to alpha keeps every pixel valid, at the cost of glow over empty canvas covering a little of the starfield behind.

**Consequence:**
- Enemy bullets are faceted gems now, not discs, with a halo, a lighter body and a white core in the 2D colours. They're opaque and drawn after every glow, so an explosion never washes one out.
- Player shots and bits' shots now sit under items and bits (front canvas) instead of over them. Nothing gameplay-relevant is hidden by that.
- Measured in the desktop app's browser at display scale 5.3 through the boss's death explosions (about 380 particles, every weapon firing, draw timed to a GPU sync): 3.3–3.4 ms median and 4 ms at the 95th percentile per drawn frame, against 3.0 and 3.3–3.5 with the effects pass emptied. `renderer.info.memory` stays at the same counts across repeated boss deaths.
