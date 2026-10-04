// Allocation benchmark, loaded only behind ?bench=1 (see tools/bench.py).
// Plays a fixed, busy stretch: the obstacle corridor with every weapon firing,
// then the boss fight through the boss's death. It samples the JS heap after
// every frame: growth between samples approximates bytes allocated, and each
// drop is a garbage collection. Needs Chrome's --enable-precise-memory-info,
// or the heap size only updates every few seconds.

const CODE = { up: 'ArrowUp', down: 'ArrowDown', fire: 'Space', pod: 'KeyX' };

export function runBench(game) {
  const keys = game.input.keys;
  const hold = (action, on) => { on ? keys.add(CODE[action]) : keys.delete(CODE[action]); };
  const heap = () => performance.memory?.usedJSHeapSize ?? 0;

  // Simulation and drawing are counted apart: pooling only touches the first.
  let frames = 0, gcs = 0, last = heap();
  const alloc = { update: 0, draw: 0 };
  const sample = (phase) => {
    const h = heap();
    if (h >= last) alloc[phase] += h - last;
    else gcs++;
    last = h;
  };
  const step = (n) => {
    for (let i = 0; i < n; i++) {
      game.update();
      sample('update');
      game.draw();
      sample('draw');
      frames++;
    }
  };
  // Each second: tap fire every 4 frames (a press fires; holding charges),
  // except every fourth second, which holds to charge and release a beam.
  // The pod is launched and recalled now and then; the ship weaves.
  const play = (n) => {
    for (let t = 0; t < n; t += 60) {
      const sec = t / 60;
      if (sec % 8 === 2 || sec % 8 === 4) { hold('pod', true); step(1); hold('pod', false); }
      hold(sec % 4 < 2 ? 'up' : 'down', true);
      if (sec % 4 === 3) {
        hold('fire', true); step(56); hold('fire', false); step(4);
      } else {
        for (let i = 0; i < 15; i++) { hold('fire', true); step(2); hold('fire', false); step(2); }
      }
      hold('up', false); hold('down', false);
    }
  };

  // Each warp draws once before measuring: the first draw of a stage builds its
  // 3D terrain and backdrops, a one-off that isn't per-frame allocation.
  game.warp({ cp: 3, god: true, power: 'pod:blue:3,speed:2,missile,bits:2' });
  game.banner = null;
  game.player.entering = false;
  game.draw();
  last = heap();
  play(1800);

  game.warp({ boss: true, god: true, power: 'pod:red:3,speed:2,missile,bits:2' });
  game.banner = null;
  game.player.entering = false;
  game.draw();
  last = heap();
  play(900);
  if (game.boss) game.boss.hp = 1;   // kill it, for the death explosions
  play(900);

  const kb = (b) => +(b / 1024 / frames).toFixed(1);
  const result = {
    frames,
    kbPerFrame: kb(alloc.update + alloc.draw),
    updateKbPerFrame: kb(alloc.update),
    drawKbPerFrame: kb(alloc.draw),
    gcs,
    precise: heap() !== 0,
    pools: game.poolStats?.() ?? null,
  };
  const pre = document.createElement('pre');
  pre.id = 'bench';
  pre.textContent = JSON.stringify(result);
  document.body.appendChild(pre);
  return result;
}
