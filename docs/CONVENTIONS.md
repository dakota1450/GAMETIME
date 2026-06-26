# Conventions — how this codebase is built

Read this before writing code in THE PACT. The patterns are simple and consistent; match them.

## No build step, plain classic scripts

The game is plain ES5-ish JavaScript served statically. There is **no bundler, no transpile, no npm**. `index.html` loads each `js/*.js` with a `<script>` tag in dependency order. It runs from `file://` or any static server. Don't introduce `import`/`export`, JSX, TypeScript, or a build tool without an explicit decision to do so.

## The module pattern (every file)

Each file is an IIFE that attaches to the global `PACT` namespace:

```js
(function (P) {
  "use strict";
  const U = P.util, D = P.data;     // grab deps off the namespace
  // ... define things ...
  P.world = ...;                    // attach this module's exports
})(window.PACT = window.PACT || {});
```

- **Dependencies are read off `P` (= `window.PACT`)**, not imported. So **load order in `index.html` is load-bearing**: `data → util → assets → save → world → entities → systems → ui → game → main`. If module A uses module B at load time, B's `<script>` must come first. (Using B at call time — inside a function — is fine regardless of order.)
- New file? Add it to the namespace and insert its `<script>` tag in the right place in `index.html`.

## Data-driven everything

All tuning and content lives in `js/data.js` as plain objects: `items`, `biomes`, `undercity`, `enemies` (+ `behavior`/`atk`), `recipes`, `craftEffects`, `loot`, `notice`, `player`, `world`, `event`, `rarity`, `farm`, `mining` (nodes) + `tools`, `gearRarity`/`affixes`/`gearBases`, `decor`/`decorTall`, `skills`. The engine *reads* data; it doesn't hard-code content. **To add or balance content, edit `data.js`** — a new enemy, recipe, item, biome, decor prop, or skill node should be a data row, not new engine code, wherever possible. This is the spec's §10 mandate and the thing that lets §9 systems bolt on without re-architecting.

## Input: physical key codes only

Keyboard is bound to `event.code` (`KeyW`, `Space`, `ArrowUp`), never to typed letters — so it works on any keyboard layout (`js/main.js`). Keep it that way. Movement keys set `G.keys[code]`; one-shot actions route through `G.action(...)`.

## Determinism: seeded RNG

The surface regenerates deterministically per cycle via `util.makeRng` (mulberry32). Same seed → same world. World/chest/enemy placement all derive from `seedBase ^ cycle ^ biomeKey`. Don't use `Math.random()` for anything world-generating — use a seeded RNG so a cycle is reproducible.

## The game loop and units

- `js/game.js` owns shared state `G`, the rAF loop (`G.frame` → `G.update(dt)` + `G.render()`), input→action routing, and the camera.
- **Time is dt-based.** Speeds are in **px/second**; multiply by `dt` in update. Smoothing uses framerate-independent easing: `1 - Math.exp(-rate * dt)`.
- **Units:** `TILE = 32` px; world is `220×220` tiles; camera `zoom = 2.0`. Rendering draws at world coords minus `cam.x/y`; entities expose `draw(ctx, cam)`.
- **Collision:** AABB-vs-tiles, axis-separated sweep — `world.moveBody(body, dx, dy)`. Bodies have `x, y, radius`.

## Rendering & assets

- Canvas 2D. Draw order: floor → ground decor → glow-nodes → structures/torches → chests → death-cache marker → pickups/effects/projectiles → enemies → player → **lighting pass** (`lighting.frame` — darkness + light pools + bloom) → (HUD is DOM, not canvas). Darkness comes from lighting, **not** a vignette.
- **Always provide a procedural fallback** for any sprite/tile/decor draw; the game must run with zero PNGs present. See [ART-AND-ASSETS.md](ART-AND-ASSETS.md).

## Persistence

`js/save.js` wraps `localStorage`. `G.snapshot()` builds the save object; `G.persist()` writes it; autosave every 10s and on `beforeunload`. Persist anything that must survive a reload: stash, carried + carried gear + equipped, death cache, unlocks, mining tool, Liens skills/points/xp, Notice, cycle, player pos/hp, pending claim, farm. New persistent state must be added to `snapshot()` **and** `loadGame()` (skills also call `recomputeSkills` on load).

## Verifying a change (do this, don't ask the user to)

1. Start the dev server via the preview tool using the `the-pact` config in `.claude/launch.json` (`python -m http.server`). If port 8765 is busy (another session), add a second config on another port.
2. Load the page, click **DESCEND INTO THE HOLD** (or click `#btn-start` via `preview_eval`), check `preview_console_logs` for errors, and `preview_screenshot` the result.
3. **Mind the cache** — the server sends no cache headers. After editing JS/PNG, hard-refresh or hot-inject (see [ART-AND-ASSETS.md](ART-AND-ASSETS.md)).
4. For logic you can't see in a still, drive it from `preview_eval` (e.g. step `G.update(dt)` and read back state) — this is how movement smoothing and biome floors were verified.

## Style

Match the surrounding code: terse, commented at the section level with `/* ---- ... ---- */` banners, short helper functions, no framework idioms. Keep comments about *why*, not *what*.
