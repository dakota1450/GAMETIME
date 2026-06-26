# THE PACT — Claude working notes

A single-player, top-down **Core Keeper-style dig-and-craft sandbox** with THE PACT's debt/extraction skin: dig out a safe **Hold**, tunnel through tiered biome rings, mine ores, and forge your way deeper up a material→pickaxe→bench→weapon ladder. Cozy lit Hold, lethal dark depths.

**Design source of truth:** [the-pact-game-design-spec.md](the-pact-game-design-spec.md) for the world/premise. The **2026-06-26 Core Keeper rebuild** ([docs/REBUILD-NOTES.md](docs/REBUILD-NOTES.md)) replaced the old radial/extraction core; that doc + [docs/ROADMAP.md](docs/ROADMAP.md) are the live status. **Read them before picking up new work.**

## What this actually is (engine reality)

A **browser HTML5/Canvas game in plain JS** (no build step). The core is a **true Core Keeper-style solid-tile dig world** (rebuilt 2026-06-26):

- **2-layer tile grid:** `world.wall[]` (the solid mineable block id, 0 = dug-out/open) over `world.floor[]` (the base ground revealed underneath — "base material over dirt"). The world starts SOLID; you dig tunnels out of it. **Your digging persists** (saved as a sparse `world.edits` diff; the terrain is NOT regenerated per session).
- **1-tile mine/place (Minecraft-style):** hold the pickaxe + click a wall tile → mine it (cracks → break → a drop flies to you). Select a block + click an empty tile → place it back. Every material is mineable and replaceable.
- **Tiered ladder (the gate):** concentric biome RINGS (`data.biomes`), each with a `rock` whose `tier` = the pickaxe power needed to break it. The ore for the next pickaxe lives in the ring you can already dig: **Salvage→Copper→Iron→Crystal→Core**. So you can't enter ring N+1 until you craft the metal ring N gave you. Benches gate recipe tiers (Furnace→Tinker→Anvil→Forge), each built from the prior tier's bars; every tool/weapon needs that tier's bars.
- **The old radial/extraction/Notice/titans/casino/skills systems were retired** in the rebuild (backed up in `js_legacy_radial/`). Re-introduce selectively only if asked.

The legacy spec's §11/§12 phase tracking no longer maps to the build; treat the rebuild notes as current. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run & verify

- Static site, no dependencies. Serve the folder and open `index.html`.
- Preview tooling: start the dev server via the `the-pact` config in `.claude/launch.json` (`python -m http.server`, port 8765). If 8765 is taken by another session, add a temp config on another port.
- To verify a change: load the page, click **DESCEND INTO THE HOLD**, check `preview_console_logs` (errors), `preview_screenshot`. For logic, drive it via `preview_eval` (e.g. step `PACT.game.update(dt)` and read state back). **Verify changes yourself — don't ask the user to check manually.**
- ⚠️ **Cache gotcha:** `python -m http.server` sends no cache headers, yet browsers still heuristically cache JS *and PNGs* (regenerated tiles reuse filenames → stale) — a plain reload (and even a server restart) can serve stale `js/*.js`. **For iterating, use the `the-pact-nocache` launch config** (`serve_nocache.py`, port 8767) — it sends `no-store`, so reload always loads fresh files. Otherwise **hard-refresh (Ctrl+Shift+R)**, or hot-inject (`fetch('js/x.js?v='+t).then(eval)`) for in-session checks (see [docs/ART-AND-ASSETS.md](docs/ART-AND-ASSETS.md)).

## Layout

```
index.html              # loads js/*.js in dependency order (no bundler)
js/   data util assets save world entities systems ui lighting audio game main   # one module each, on window.PACT
assets/                 # floor tiles, sprites, decor props (optional; procedural fallback if missing)
css/style.css           # HUD / title / overlay styling (Pixelify Sans pixel font)
docs/                   # ARCHITECTURE, CONVENTIONS, ART-AND-ASSETS, ROADMAP
the-pact-game-design-spec.md   ·   images*.jpg   # Core Keeper reference shots (the look target)
```

## Controls

WASD/arrows move · mouse aim · **Left-click / Space** = use the SELECTED hotbar item (pickaxe mines · weapon attacks · block/torch places) · **Right-click / F** = quick-mine with your best pickaxe (regardless of selection) · **1–0 / scroll** select hotbar slot · **E** use a nearby bench (Furnace/Tinker/Anvil/Forge) or Storage/Bedroll · **I / Tab** inventory · **H** quick-heal (best bandage) · **M** mute · Esc close.

## Conventions (full: [docs/CONVENTIONS.md](docs/CONVENTIONS.md))

- **No build step.** Plain classic scripts; no import/export/TS/JSX/npm.
- **Module pattern:** every file is an IIFE attaching to `window.PACT`; deps read off `P`. **Load order in `index.html` is load-bearing.**
- **Data-driven:** all content/tuning is in `js/data.js`. Add enemies/items/recipes/biomes as data rows, not engine code.
- **Input = physical key codes** (`KeyW`, `Space`), never typed letters.
- **Determinism:** the surface regenerates from a seeded RNG (`seedBase + cycle`); don't use `Math.random()` for worldgen.
- **dt-based update;** speeds in px/s; framerate-independent easing `1 - Math.exp(-rate*dt)`.
- **Assets always have a procedural fallback** — the game must run with zero PNGs.
- **Persistence:** new persistent state goes in both `G.snapshot()` and `G.loadGame()`.

## Visuals ([docs/ART-AND-ASSETS.md](docs/ART-AND-ASSETS.md))

The look targets **Core Keeper**: a dark top-down world lit by **dynamic point-lights** (`js/lighting.js`) — the player's lantern, placed torches, glowing ore veins, and station glows carve warm/cool pools out of the shadow, with soft contact shadows. Wall blocks are drawn **procedurally** (`world._drawBlock`): a chunky beveled face (top highlight + side bevel) with material grain, ore glints, a heavier bottom lip where a block borders open floor, and growing mining cracks; the revealed floor uses soft two-octave noise (no checkerboard). Hero = a **hooded scavenger** (`assets/player.png`); decor props + the Pixelify Sans font carry over. **Everything renders with zero PNGs** — `assets/` is optional polish. _Next art step: generate per-block/floor tile textures via the Higgsfield pipeline for an even closer match (procedural is the lit-neutral baseline today)._

## Active gotchas

- Teleporting the player via `preview_eval` is now safe (no Notice/extraction logic); the world is persistent — `G.update(dt)` can be stepped and the dig stays.
- Overlays pause the sim (`G.update` is skipped while a menu is open) — expected.
- Controls are **hotbar-driven**: the selected slot decides what left-click does. `F`/right-click always digs with your best pickaxe.
