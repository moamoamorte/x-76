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
  // Fire in bursts, charging a beam every few seconds and cycling the pod.
  const play = (n) => {
    for (let t = 0; t < n; t += 60) {
      hold('fire', (t / 60) % 4 !== 3);
      if ((t / 60) % 4 === 2) { hold('pod', true); step(1); hold('pod', false); }
      hold(t % 240 < 120 ? 'up' : 'down', true);
      step(30);
      hold('up', false); hold('down', false);
      step(30);
    }
    hold('fire', false);
  };

  game.warp({ cp: 3, god: true, power: 'pod:blue:3,speed:2,missile,bits:2' });
  game.banner = null;
  game.player.entering = false;
  last = heap();
  play(1800);

  game.warp({ boss: true, god: true, power: 'pod:red:3,speed:2,missile,bits:2' });
  game.banner = null;
  game.player.entering = false;
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
