// Dev-only: poll the dev server's /__mtime and reload when a source file changes.
// Silently disables itself when served by anything else.
let last = null;
let timer = null;
let misses = 0;

async function check() {
  try {
    const res = await fetch('/__mtime', { cache: 'no-store' });
    if (!res.ok) return give_up();
    const { mtime } = await res.json();
    misses = 0;
    if (last === null) last = mtime;
    else if (mtime > last) location.reload();
  } catch {
    // Tolerate short outages, such as the dev server restarting.
    if (++misses > 8) give_up();
  }
}

function give_up() {
  stop();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

export function liveReload(intervalMs = 700) {
  if (timer) return;
  timer = setInterval(check, intervalMs);
  check();
}
