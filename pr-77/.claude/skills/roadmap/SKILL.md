---
name: roadmap
description: Work the X-76 roadmap. Checks the roadmap issue against GitHub, picks the next open item (or the one named), implements and verifies it in the browser, opens a PR, files issues for follow-up work found along the way, and updates the roadmap. Use when asked to "do the next roadmap item", "pick something off the roadmap", "update the roadmap", or /roadmap [issue number].
---

# Roadmap

The backlog lives in GitHub Issues on `moamoamorte/x-76`. One issue, labelled `roadmap` (currently [#28](https://github.com/moamoamorte/x-76/issues/28)), is the index: a "Suggested order" checklist of issue links grouped into numbered sections, plus "Done so far" and "Decisions" sections. Every other issue holds its own detail: problem, recommended fix, acceptance criteria.

A run takes four steps: **assess → pick → deliver → update the roadmap**. If the user passed an issue number, skip the pick step and work on that issue.

## 1. Assess

1. Find the roadmap issue: list open issues with the `roadmap` label. Don't assume #28.
2. Read its body, then list **all** issues (open and closed) and recently merged PRs.
3. Reconcile the two and note every mismatch:
   - **Closed but unticked:** the issue is done. Tick it. Only tick issues that were closed as completed; a `not_planned` close gets removed from the list and mentioned in the report.
   - **Ticked but open:** leave the box as it is and flag it to the user. Don't reopen or close anything.
   - **Open but missing from the roadmap:** an issue created outside this workflow. Place it in the section that fits its labels.
   - **`needs-decision` items:** check whether a comment has since answered the question. If one has, drop the *needs decision* note from the line and say so.

## 2. Pick the next item

Walk "Suggested order" from the top and take the **first unticked item that can be done now**. Skip an item if:

- it has the `needs-decision` label and the question is still unanswered;
- it depends on an unticked item that comes before it (the roadmap notes this, e.g. "best after #5 and #7");
- its text marks it as parked or "only before publishing";
- an open PR already references it.

Read the whole issue, including its comments, before starting. If the issue is too vague to act on without guessing at the owner's intent, stop and ask; don't invent the design. Tell the user which item you picked and why, in one line, then carry on.

## 3. Deliver

**Branch.** Use the branch the session names. If that branch's PR has already been merged, restart the branch from `origin/main`; never stack new work on merged history.

**Read first.** `CLAUDE.md` sets the hard constraints (no build step, no assets, everything original, gameplay stays 2D). Read `docs/ARCHITECTURE.md` before touching rendering or level code, and `docs/DECISIONS.md` before changing anything that looks deliberate.

**Implement.** Follow the fix the issue recommends unless the code shows it's wrong. If it is wrong, say so in the PR. Keep the change to what the issue asks for. Anything else you notice becomes a new issue (step 4), not part of this diff.

**Verify in the browser.** There's no test suite beyond `tools/smoke.py`'s scripted pass. Show the change working, and show the bug beforehand when it's a bug.

- Start the server in the background with `python3 serve.py` (port 8765).
- Console-error baseline: run `python3 tools/smoke.py`. It scripts a few hundred frames at every checkpoint plus the warning and boss camera and fails on any console error or exception, or if WebGL can't start. It finds its own local Chromium/Chrome (including the macOS app path) — no Playwright needed for this part.
- For interactive driving — screenshots, stepping the sim by hand, feeding one-off state — use whichever browser tool is actually available:
  - **Desktop app:** the in-app browser pane. `preview_start` with the `http://localhost:8765/...` URL, `javascript_tool` to drive `window.game` / `window.__preview`, `read_console_messages` / `read_network_requests` for errors, `computer` for screenshots and zoomed crops.
  - **Cloud sandbox:** Playwright, installed globally; import it from `$(npm root -g)/playwright/index.mjs`. Launch with `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` (check the version under `/opt/pw-browsers`) and `args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']` so the WebGL layer renders. Never run `playwright install`.
  - **Neither available** (e.g. a local CLI session with no pane and no global Playwright): rely on `tools/smoke.py`'s pass/fail signal and console output; skip screenshots rather than improvising an installation.
- Drive state through `window.game` (game) or `window.__preview` (harness). Useful moves:
  - Start play: `game.newGame()`, then set `game.banner = null` and `game.player.entering = false`.
  - Make the player immortal: `game.killPlayer = () => {}`.
  - Hand out power-ups the real way, e.g. `game.collect({ type: 'crystal', color: 'red' })`.
  - Load game classes with `await import('/src/enemies.js')` inside `page.evaluate`.
  - Step the simulation deterministically by calling `game.update()` in a loop.
  - Before screenshotting an overlay (hitboxes etc.), freeze the sim with `game.update = () => {}`. Drawing keeps running, but the camera stops scrolling out from under the overlay.
- Check `/preview.html` when the change touches the ship or pod. There's no 2D fallback any more (DECISIONS §21), so `?flat=1` does nothing.
- Collect console errors. A clean page load logs none: `serve.py` answers `favicon.ico` with 204, and a missing file is a real 404, so any error is worth reading.
- Crop screenshots to the area of interest. Send the before/after images to the user.

**Commit and PR.**
- **Commit:** the message says what changed and why, and ends with `Fixes #N`.
- **PR:** there's no PR template. Write the body with the sections **Problem**, **Change**, **Verification** and, when relevant, "left alone on purpose", and put `Fixes #N` at the top. Refer to issues as `#N` inside the repo; in chat, use full links.
- **Merge:** only when the user asks. Use a merge commit (the repo's history uses them). Check first that the PR is mergeable; there's no CI to wait for. Straight after merging, tick the item on the roadmap (step 4, "Item just delivered"); a merge never leaves the roadmap saying "PR open".

## 4. File new issues and update the roadmap

**New issues.** Anything real you found but didn't fix: a bug seen in passing, a follow-up the fix unlocked, a question only the owner can answer. Before filing:

- Search existing issues so you don't create a duplicate.
- Match the existing issue style: **Problem** (with file paths and numbers), **Fix (recommended)** as numbered steps, **Acceptance criteria**. Put questions for the owner under **Questions** and add `needs-decision`.
- Label it with one area (`gameplay`, `3d`, `audio`, `content`, `polish`, `tooling`, `tech-debt`, plus `bug`, `performance` or `accessibility` where they fit) and one size (`size: S` / `M` / `L`).
- Don't file vague impressions or pure style opinions.

**Roadmap edit.** Fetch the roadmap body again right before editing, since someone may have changed it. Change only the lines that need it and keep everything else byte-for-byte.

- **Line format:** `- [ ] #N Short title (S), optional note`.
- **Item just delivered:** once merged, tick it and append `, done in PR #M`. If the PR is still open, append `, PR #M open` and leave the box unticked.
- **Ticked items stay in place**, so the order still reads as history. Move them to "Done so far" only when a whole section is ticked.
- **New issues:** insert each where it belongs in the order, next to what it depends on, and add it to the "Still open" list if it's `needs-decision`.
- **New decisions:** if the owner settled a question during the run, add a row to the "Decisions" table.

## Report

End with a short summary for the user:

- the item done and its PR link;
- what verification showed, including anything not checked (for example, not played by hand);
- the issues you filed, as links;
- the roadmap changes;
- the next item the order would pick, and anything blocking it.
