# X-76

A browser-based horizontal shooter in the style of the classic late-80s arcade games.
It runs entirely in the browser: plain ES modules, Canvas 2D, and Web Audio. There are no dependencies, no build step, and no asset files.
All graphics, music, and sound effects are generated in code, and every character and enemy is an original design.

Stage 1, "The Hollow Station", is complete: open space, then a station interior, then a boss chamber.

**Play it live:** https://moamoamorte.github.io/x-76/ — GitHub Pages, auto-deployed from `main` by `.github/workflows/pages.yml` a couple of minutes after every merge.

## Documentation

- [CLAUDE.md](CLAUDE.md) — orientation, constraints and conventions (start here)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the game, renderer and level are built
- [docs/DECISIONS.md](docs/DECISIONS.md) — why things are the way they are
- [GitHub Issues](https://github.com/moamoamorte/x-76/issues) — backlog and open questions; the [roadmap](https://github.com/moamoamorte/x-76/issues/28) gives the suggested order

## Running

ES modules need to be served over HTTP (opening `index.html` from disk won't work):

```bash
python3 serve.py
```

Then open http://localhost:8765. Any other static file server also works. `serve.py` just disables caching so edits always reload.

There's no automated test suite, but `python3 tools/smoke.py` is a headless smoke test: it boots the game and plays it for a few hundred frames at every checkpoint plus the boss, and fails on any console error or exception. It needs a Chromium/Chrome binary on the machine already (no dependencies installed).

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Move | Arrow keys / WASD | D-pad / left stick |
| Shoot | Z / Space / J (tap) | A / RT |
| Charge beam | Hold shoot, release to fire | Hold A |
| Launch / recall pod | X / Shift / K | B / X / LT |
| Pause | P / Esc | Start |
| Mute | M | |
| Fullscreen | F | |

On a phone or tablet, on-screen controls appear instead. iPhone Safari can't make a web page fullscreen, so there the FS button explains how to add the game to the Home Screen. Launched from that icon, it runs with no browser UI.

## How it plays

- **Charge beam:** hold fire to fill the BEAM meter, then release. Higher charge gives a bigger, piercing shot.
- **Pod:** your first crystal summons an indestructible pod. It docks to your nose or tail when you touch it. It blocks bullets and damages anything it touches. Launch it forward (or backward), then recall it with the pod button. When docked it fires the laser for its colour:
  - **Red, Helix:** twin spiralling beams.
  - **Blue, Ricochet:** a spread that bounces off walls.
  - **Yellow, Crawler:** shots that run along floors and ceilings.

  Crystals cycle colour, so you choose which laser you pick up. Each extra crystal raises the pod level, up to 3.
- **Other power-ups:** `S` gives more speed, `M` gives homing missiles, and `B` gives a bit (a drone that blocks bullets, up to 2).
- **Carriers** (armoured walkers with a glowing cargo pod) drop the power-ups.
- **Dying** sends you back to the last checkpoint and removes all power-ups. You get an extra ship at 50,000 points and every 100,000 after that.
- **The boss** only takes damage while its armoured iris is open. Parking the pod in the open eye works very well.

## 3D models

The player ship, pod, station terrain and its backdrops are real 3D models rendered with Three.js (vendored in `vendor/`, no install or build step). They sit on a transparent canvas between the 2D background and the 2D sprites, and all game logic stays 2D. Enemies, the boss and effects are still 2D for now.

- The models are built in code, so there are no asset files.
- Shading is cel-style with ink outlines, to match a hand-drawn anime look.
- The game needs WebGL. Without it the page explains that instead of starting.

## Model preview harness

Open http://localhost:8765/preview.html to inspect models without playing. Controls run along the bottom of the page.

**Sequences** play back the animations the game uses:

| Button | Shows |
| --- | --- |
| Fly it | Fly the ship yourself with the game's controls (see below) |
| Idle | The ship flying, banking and idling |
| Firing | Tap-fire: muzzle flash, recoil and shots |
| Charged beam | The release of a full charge |
| Pod flies in | The pod entering from the left, as it does after the first crystal |
| Pod docks front | The pod approaching and locking onto the nose |
| Pod docks rear | The same at the tail |
| Replay | Restarts the current sequence (or press space) |

**Fly it** is a sandbox: arrows or WASD move, `Z`/space fires (hold to charge, release for the beam), `X` launches and recalls the pod. It uses the game's own input handling and the same per-frame constants — speed, charge timing, banking and the pod's state machine — so the handling matches the real game. There is no level, no enemies and nothing to collide with. A frame marks the area you can fly in, and the camera fits it automatically until you zoom manually.

Also available:

- Switch between the ship and the pod, and change the pod's laser colour.
- Bank angle (manual or automatic), throttle, and pause.
- Orbit by dragging, zoom by scrolling, or jump to preset angles (game, side, top, front, 3/4, rear).
- Toggle ink outlines, wireframe and the grid; move the light; change the background.
- Save a PNG of the current view; frame rate and triangle counts show top-left.
- Shortcuts: `R` resets the view, `O` toggles outlines, `1`/`2` switch model, `space` replays.

**Live reload:** while `serve.py` is running, the preview page reloads itself whenever a `.js`, `.html` or `.css` file changes, and returns to the sequence you were on. The server exposes `/__mtime` for this; any other static server just serves the files and the page skips reloading.

## Code layout

| File | Contents |
| --- | --- |
| `src/main.js` | Game loop (fixed 60 Hz), state machine, spawning, collisions, HUD |
| `src/level1.js` | Stage 1 terrain layout and enemy spawn script |
| `src/terrain.js` | Tile collision grid (drawn in 3D by `src/models/terrain3d.js`) |
| `src/player.js` | Ship, pod, bits, and all player projectiles |
| `src/enemies.js` | Enemy types and enemy bullets |
| `src/boss.js` | Stage 1 boss |
| `src/background.js` | Parallax starfield and nebula |
| `src/fx.js` | Particles and explosions |
| `src/audio.js` | Synthesised sound effects and music sequencer |
| `src/font.js` | Angular stroke font on a 5×7 grid |
| `src/input.js` | Keyboard and gamepad input |
| `src/render3d.js` | 3D layer that draws the ship and pod over the 2D game |
| `src/models/*.js` | Procedural 3D models and cel-shading materials |
| `src/preview.js` | Logic for the standalone model preview page |

Adding a stage means writing a new `levelN.js` with `buildTerrain()` and `buildSpawns()`, plus a boss class.
