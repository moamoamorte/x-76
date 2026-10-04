# X-76 — working notes for Claude

A browser side-scrolling shooter in the style of late-80s arcade games. Stage 1 is complete and playable; the player ship, pod, enemies, boss, terrain and backdrops are 3D, while effects are still 2D.

**Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before changing rendering or level code, and [docs/DECISIONS.md](docs/DECISIONS.md) before revisiting a choice that looks odd.** Open work lives in [GitHub Issues](https://github.com/moamoamorte/x-76/issues); the [roadmap issue](https://github.com/moamoamorte/x-76/issues/28) lists it in order. The `/roadmap` skill (`.claude/skills/roadmap/`) picks the next item, delivers it as a PR and keeps the roadmap in step.

**Every merge updates the roadmap**, whether or not the PR came through `/roadmap`. Right after merging, re-fetch the roadmap issue, tick the line for each issue the PR closed and append `, done in PR #M`. Add the line first if the issue isn't on the roadmap. Change nothing else.

## Run it

```bash
python3 serve.py          # http://localhost:8765
```

ES modules need HTTP; opening `index.html` from disk will not work. `serve.py` also disables caching and powers live reload.

**Live build:** https://moamoamorte.github.io/x-76/ — GitHub Pages, redeployed by `.github/workflows/pages.yml` a couple of minutes after every merge to `main`. No manual deploy step; that's what makes it useful for trying changes on a phone.

**PR previews:** every open PR also gets published at `.../pr-<number>/` (`.github/workflows/pr-preview.yml`, cleaned up by `pr-preview-cleanup.yml` on close), with the link commented on the PR. Useful for on-device debugging of a change before it merges.

**Every PR description includes a "Try it" link** to its preview, `https://moamoamorte.github.io/x-76/pr-<number>/`, plus warp links (`?cp=`, `?boss=1`, `?power=` etc.) to the parts the change touches. Add it right after creating the PR, once the number is known.

**When delivering a PR, also run the game locally from the checkout you changed** and put clickable `http://localhost:<port>/...` links in the chat reply (same warp links as the PR), so the owner can see the change immediately without waiting for the Pages deploy. Check that the server is actually serving *this* checkout: an old `serve.py` from another worktree may already hold 8765 (`lsof -iTCP:8765 -sTCP:LISTEN`, then check its cwd). If so, run on another port (`python3 serve.py 8766`) rather than killing it.

- Game: `/index.html`. It needs WebGL; without it the page shows a "WebGL required" screen (DECISIONS §21).
- Model harness: `/preview.html` — fly the ship, play animations, inspect models

## Hard constraints

1. **No build step, no dependencies to install.** Plain ES modules served statically. Three.js is vendored in `vendor/` (MIT). Do not add a bundler or a package manager without being asked.
2. **No copyrighted material.** This is *inspired by* R-Type, not a clone of it. All art, music, sound, names and enemy designs are original. Never recreate another game's sprites, characters, music or level maps, even "for personal use". This has come up repeatedly with reference images — take style cues (shading, panel detail, colour blocking), never the subject.
3. **Everything is generated in code.** No image, audio or model files. Art is drawn with Canvas 2D or built from Three.js primitives; sound is synthesised with Web Audio.
4. **Gameplay stays 2D.** The 3D layer is presentation only. It reads state and draws; it never moves anything or decides anything.

## Conventions

- Fixed 60 Hz simulation with an accumulator; rendering is decoupled. Per-frame constants are in *pixels per frame at 60 Hz*.
- Play-field is 384×224 logical pixels with a 16px HUD strip below (384×240 total).
- 3D model space: **+X forward, +Y up, +Z out of the screen**. Screen y grows downward, so world y = −screen y.
- Models are **angular only** — no spheres, cones-as-curves or tori read as round. Use faceted prisms (low `radialSegments`), boxes and extruded plates.
- Ship palette is greyscale; colour is reserved for the cockpit, engine glow and the pod core (which encodes laser type).

## Testing

`python3 tools/smoke.py` is a headless smoke test: it boots the game at every checkpoint plus the boss, fakes input for a few hundred frames at each, and fails on any console error or exception, or if WebGL can't start. Run it after changes that touch the game loop, spawning or collision. It needs a Chromium/Chrome binary already on the machine (set `CHROME=/path/to/binary` if it can't find one) — no dependencies to install. It also fails if the 3D layer's scene graph grows during play.

`python3 tools/bench.py` measures how much the game allocates per frame (simulation and drawing separately) and how many garbage collections that causes, over a fixed busy stretch. Use it before and after changes to pooling or hot loops, and compare runs interleaved with a baseline checkout: the absolute numbers drift between sessions.

Beyond that there is no automated test suite. Verify in the browser:

- `window.game` (game page) and `window.__preview` (harness) are exposed for driving state from the console.
- Typical loop: start a server, navigate, drive state via JS, screenshot, read console errors.
- **Warp** straight into play from the URL: `?stage=N`, `?cp=K` (checkpoint index), `?cam=X`, `?boss=1` (just before the boss warning), `?god=1` (no deaths from enemies or terrain), `?power=pod:red:3,speed:2,missile,bits:2`. Any of them skips the title, e.g. `/index.html?cp=3&power=pod:blue:2` or `?boss=1&god=1`.
- The same at runtime: `game.warp({ cp: 3, power: 'pod:blue:2', god: true })` starts a fresh game there. `game.god = true` on its own stops dying while inspecting.

## Style

- Comments explain *why*, not *what*. Match the surrounding density — this codebase is lightly commented with section banners.
- Keep modules single-purpose; the file map is in the architecture doc.
