// Free lists for short-lived objects (bullets, particles): a busy stretch
// reuses dead ones instead of allocating new ones and leaving garbage behind.
// Objects come back through their init(...); after warm-up nothing calls
// their constructors. Pools never shrink; peak is the high-water mark of
// objects in use at once, which should plateau (tools/bench.py prints it).
export class Pool {
  constructor(make) {
    this.make = make;
    this.free = [];
    this.live = 0;
    this.peak = 0;
  }

  acquire() {
    if (++this.live > this.peak) this.peak = this.live;
    return this.free.length ? this.free.pop() : this.make();
  }

  release(o) {
    this.live--;
    this.free.push(o);
  }

  stats() {
    return { live: this.live, peak: this.peak, free: this.free.length };
  }
}

// Removes, in place, the entries keep() rejects, handing each to drop() if
// given. Order is preserved: update and draw order depend on it.
export function compact(arr, keep, drop) {
  let w = 0;
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (keep(o)) arr[w++] = o;
    else if (drop) drop(o);
  }
  arr.length = w;
}
