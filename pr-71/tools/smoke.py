#!/usr/bin/env python3
"""Headless smoke test runner. Standard library only (hard constraint: no
dependencies to install) — it drives a Chromium/Chrome binary that's already
on the machine, it doesn't install one.

Boots the game with ?smoke=1 (src/smoke.js), which plays a scripted few
hundred frames at every checkpoint plus the warning and boss camera
positions, and fails on any console error or exception — including ones the
game loop's own try/catch would otherwise swallow. WebGL runs on SwiftShader,
so no GPU is needed; if it still can't start, the run fails.

Usage: python3 tools/smoke.py
Exit code 0 on success, 1 on failure (or if no Chromium/Chrome is found).
"""
import html
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIRTUAL_TIME_BUDGET_MS = 15000
SERVER_START_TIMEOUT_S = 5
CHROME_TIMEOUT_S = 30

CHROME_NAMES = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]
CHROME_PATHS = [
    "/opt/pw-browsers",  # globbed below for chromium-*/chrome-linux/chrome
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]


def find_chrome():
    env = os.environ.get("CHROME")
    if env:
        return env
    for name in CHROME_NAMES:
        found = shutil.which(name)
        if found:
            return found
    for path in CHROME_PATHS:
        if os.path.isfile(path):
            return path
        if os.path.isdir(path):
            for name in sorted(os.listdir(path)):
                candidate = os.path.join(path, name, "chrome-linux", "chrome")
                if os.path.isfile(candidate):
                    return candidate
    return None


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("", 0))
        return s.getsockname()[1]


def wait_for_server(port, deadline):
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://localhost:{port}/index.html", timeout=1).close()
            return True
        except OSError:
            time.sleep(0.1)
    return False


SMOKE_RE = re.compile(r'<pre id="smoke">(.*?)</pre>', re.DOTALL)


def run_smoke(chrome, port):
    url = f"http://localhost:{port}/index.html?smoke=1"
    args = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--use-gl=swiftshader",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--dump-dom",
        f"--virtual-time-budget={VIRTUAL_TIME_BUDGET_MS}",
        url,
    ]
    try:
        proc = subprocess.run(args, capture_output=True, text=True, timeout=CHROME_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return {"ok": False, "errors": [f"chromium timed out after {CHROME_TIMEOUT_S}s dumping {url}"]}

    m = SMOKE_RE.search(proc.stdout)
    if not m:
        tail = "\n".join(proc.stderr.strip().splitlines()[-20:])
        return {"ok": False, "errors": [
            f"no #smoke element found in the dumped DOM for {url}",
            f"chromium exit code {proc.returncode}",
            *(["stderr:", tail] if tail else []),
        ]}
    try:
        return json.loads(html.unescape(m.group(1)))
    except json.JSONDecodeError as e:
        return {"ok": False, "errors": [f"couldn't parse #smoke JSON: {e}", m.group(1)[:500]]}


def main():
    chrome = find_chrome()
    if not chrome:
        print("smoke: no Chromium/Chrome found. Set CHROME=/path/to/binary, or install one.")
        return 1
    print(f"smoke: using {chrome}")

    port = free_port()
    server = subprocess.Popen(
        [sys.executable, "serve.py", str(port)], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        if not wait_for_server(port, time.time() + SERVER_START_TIMEOUT_S):
            print("smoke: dev server never came up")
            return 1

        result = run_smoke(chrome, port)
        frames = result.get("frames", "?")
        if result.get("ok"):
            print(f"smoke: pass ({frames} frames, no errors)")
            return 0
        print(f"smoke: FAIL ({frames} frames)")
        for err in result.get("errors", []):
            print(f"  - {err}")
        return 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == "__main__":
    sys.exit(main())
