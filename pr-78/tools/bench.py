#!/usr/bin/env python3
"""Allocation benchmark. Standard library only, like smoke.py, whose Chrome
discovery and dev-server helpers it reuses.

Boots the game with ?bench=1 (src/bench.js), which plays the obstacle corridor
and the boss fight through the boss's death with every weapon firing, and
reports roughly how much JS heap that allocated and how many garbage
collections it caused. Numbers vary a little between runs, so it takes the
median of several.

Usage: python3 tools/bench.py [runs]
"""
import html
import json
import os
import re
import statistics
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smoke import ROOT, find_chrome, free_port, wait_for_server  # noqa: E402

BENCH_RE = re.compile(r'<pre id="bench">(.*?)</pre>', re.DOTALL)


def run_bench(chrome, port):
    url = f"http://localhost:{port}/index.html?bench=1"
    args = [
        chrome, "--headless=new", "--disable-gpu", "--use-gl=swiftshader", "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader", "--enable-precise-memory-info", "--dump-dom",
        "--virtual-time-budget=60000", url,
    ]
    proc = subprocess.run(args, capture_output=True, text=True, timeout=180)
    m = BENCH_RE.search(proc.stdout)
    if not m:
        raise RuntimeError(f"no #bench element in the dumped DOM (exit code {proc.returncode})")
    return json.loads(html.unescape(m.group(1)))


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    chrome = find_chrome()
    if not chrome:
        print("bench: no Chromium/Chrome found. Set CHROME=/path/to/binary, or install one.")
        return 1
    port = free_port()
    server = subprocess.Popen([sys.executable, "serve.py", str(port)], cwd=ROOT,
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not wait_for_server(port, time.time() + 5):
            print("bench: dev server never came up")
            return 1
        results = []
        for i in range(runs):
            r = run_bench(chrome, port)
            results.append(r)
            print(f"bench: run {i + 1}: {r['frames']} frames, {r['kbPerFrame']} KB/frame allocated "
                  f"(update {r['updateKbPerFrame']}, draw {r['drawKbPerFrame']}), {r['gcs']} GCs")
        if not results[0].get("precise"):
            print("bench: performance.memory unavailable, numbers are meaningless")
            return 1
        med = lambda k: statistics.median(r[k] for r in results)  # noqa: E731
        print(f"bench: median {med('kbPerFrame')} KB/frame (update {med('updateKbPerFrame')}, "
              f"draw {med('drawKbPerFrame')}), {med('gcs')} GCs")
        if results[-1].get("pools"):
            print(f"bench: pool high-water marks {results[-1]['pools']}")
        return 0
    finally:
        server.kill()


if __name__ == "__main__":
    sys.exit(main())
