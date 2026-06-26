# Architecture — THE PACT

> **⚠️ 2026-06-26 Core Keeper rebuild.** The game core was rewritten from the old radial extraction
> sandbox into a **solid-tile dig/build/craft world** ([REBUILD-NOTES.md](REBUILD-NOTES.md)). The
> sections below predate that and describe the retired model (kept in `js_legacy_radial/`). The
> **current** architecture is summarized in this banner + module map; trust those over the legacy prose.
>
> **Current core (rebuild):**
> - `world.wall[]` (Uint8 block ids, 0 = open) over `world.floor[]` (base ground). World starts solid;
>   you dig it out. Persistent via the sparse `world.edits` diff (regen from seed + re-apply edits).
> - `data.blocks` (mineable materials: tier = pickaxe power to break, hp, drop) · `data.items`
>   (mats/bars/tools/weapons/blocks/consumables) · `data.biomes` (concentric tier RINGS with `rock`+`ores`)
>   · `data.recipes`/`data.stations` (Furnace→Tinker→Anvil→Forge tier ladder).
> - `systems`: `mineTargetTile`/`doMine` (gated by pickaxe power), `placeTargetTile`/`doPlace`,
>   `doAttack` (melee arc + ranged), `craft`, `populate`/`tickSpawns`, `die`/`respawn`.
> - `game.G`: inventory = a 40-slot array (`G.inv`), hotbar = slots 0–9 (`G.sel`), `G.stash` (safe
>   storage); snapshot v3 = `{inv, stash, sel, edits, builtStations, player}`.
> - Controls are **hotbar-driven**: selected slot decides the click action. Lighting/audio/util/save
>   sub-systems carried over (lighting adapted to `torchList`/`oreGlows`/`glowDecor`/`stations`).

A top-down extraction-sandbox prototype. Plain JS on HTML5 Canvas, no build step, everything hangs off a global `window.PACT` namespace. This doc maps the modules, the game loop, and the core data flows.

## Engine reality vs the spec

The design spec ([../the-pact-game-design-spec.md](../the-pact-game-design-spec.md)) names **Godot 4** and a **vertical Hold→Undercity→Surface** world. The actual build is:

- **A browser HTML5/Canvas game in plain JS** (decision logged early — easiest to build/test/iterate for a first-time dev), not Godot.
- **A radial top-down world realizing the spec's vertical model**: a central safe **Hold** compound → a semi-safe **Undercity** ring (dead infrastructure, light loot, weak enemies) → the **four surface biomes** by direction (N=Default Row, E=Scrapsea, S=Greenline, W=Stacks) on the outer disc. **Depth is a continuous distance gradient** (`world.depthAtPx`, radii `holdRadius < undercityOuter < mapRadius`) driving ambient darkness, Notice, loot tier, and enemy toughness — the spec's "depth = spatial risk gradient."

Everything follows the spec's *systems* intent; the data-driven approach (§10) is honoured. The remaining divergence is presentation (radial rings vs a literal vertical stack) and scope (Glittermile/Foreclosed Deep not built). See [ROADMAP.md](ROADMAP.md) for phase-by-phase status.

## Module map (load order = dependency order)

Loaded by `index.html` in this order; each attaches to `PACT`:

| File | `PACT.` | Responsibility |
|---|---|---|
| `js/data.js` | `data` | **All content & tuning** as plain data: world geometry, home, the **Undercity**, biomes, rarity, items (incl. biome materials), farm, loot, enemies (+ `behavior`/`atk`), player stats/weapon/gadgets, Notice, recipes, craft effects, the beacon event, **mining nodes + tools**, **gear** rarity/affixes/bases, **ground decor**, the **Liens skill tree**. |
| `js/util.js` | `util` | Seeded RNG (mulberry32), math (clamp/lerp/dist/norm), value noise + per-cell hash, inventory helpers, hex colour mix, `now()`. |
| `js/assets.js` | `assets` | Loads sprite/tile PNGs from `assets/`, exposes `draw`/`tile`/`img`/`has`. **Every draw falls back to procedural art if the PNG is absent.** |
| `js/save.js` | `save` | `localStorage` read/write/clear/has. Knows nothing about the snapshot shape (game.js owns that). |
| `js/world.js` | `World` | The map: tile gen, the **dug-out Hold** (`_digOutHold` carves a den out of mineable earth), the **Undercity ring** + **continuous depth gradient** (`regionAtPx`/`depthAtPx`, radii `holdRadius<undercityOuter<mapRadius`), chest & enemy-spawn placement, **destructible mining nodes** (`mine`, `damageNode`), **roofless buildings** (`_placeBuildings`), **ground decor** (`decor`/`solidDecor`/`glowDecor`, `_placeDecor`) incl. solid boulders/pillars + event pillars, torches/glow-nodes, collision (`moveBody`), floor/wall/node/decor/structure rendering. |
| `js/entities.js` | `entities` (`Player`, `Enemy`, `Projectile`, `Pickup`) | Entity classes: state, `update(dt,G)`, `draw(ctx,cam)`. **Enemy is a behavior state machine** (chase / lunge / charge / slam-AoE / shoot / blink) with wind-up **attack telegraphs** (`_chaseMove`/`_unleash`); Player has a walk-bob + velocity easing. |
| `js/systems.js` | `systems` | Verbs/rules: firing (multi-pellet), Shock Pulse, damage & death → **recoverable death cache**, chests, enemy drops + **depth-scaling** (`scaleByDepth`), the Claim, rest/cycle turnover, farming, the beacon event + cash-out, Notice, **mining** (`mineSwing`/`hitNode`), **gear** rolling/equip/derive (`rollGear`/`gearStats`/`weaponStats`), the **Liens skill tree** (`recomputeSkills`/`allocSkill`/`gainXp`), applying permanent upgrades. |
| `js/ui.js` | `ui` | DOM HUD + overlays (storage, fab bench, claim, **loadout/gear** `B`, **Liens skill tree** `K`, event checkpoint), the always-visible **action bar** (Loadout/Skills + points badge), prompts, toasts, banners. Canvas draws the world; the UI is HTML (Pixelify Sans font). |
| `js/lighting.js` | `lighting` | **Dynamic 2D lighting** (the Core Keeper look): a screen-space light map — ambient darkness + additive point lights (player lantern, torches, station glows, biome glow-nodes, fire/tech) multiplied over the scene, plus bloom and soft contact shadows. See [ART-AND-ASSETS.md](ART-AND-ASSETS.md). |
| `js/game.js` | `game` (`G`) | **Orchestrator.** Owns shared state `G`, the rAF loop, input→action routing, the camera, `update`, `render`, and the save snapshot. |
| `js/main.js` | — | Bootstrap: wires input (physical key codes), the title screen, resize, autosave; calls `G.start()`. |

## Shared state: `G` (in `game.js`)

One object holds the live game: `world`, `player`, arrays (`enemies`, `projectiles`, `effects`, `pickups`), `stash` (banked) vs `carried` + `carriedGear` (at-risk) and `equipped` (gear), `deathCache`, `pendingClaim`, `notice`, `cycle`, `unlocks` (craft upgrades), `med`, `tool` (mining), `skills`/`skillPoints`/`xp`/`skillBonus` (Liens), `farm`, `event`, sweep flags, input (`keys`/`mouse`/`mineDown`), and loop bookkeeping. `newGame`/`loadGame` initialise it; `snapshot` serialises the persistent subset.

## The game loop (`game.js`)

`G.start()` → `requestAnimationFrame(G.frame)`. Each frame:

```
G.frame(dt clamped to 50ms):
  if started:
    if no overlay open: G.update(dt)     // overlays pause the sim
    G.render()
    ui.updateHud(G)
```

**`G.update(dt)`** in order: read movement input → ease velocity (accel/glide) + walk-bob → `world.moveBody` → smooth facing/aim → fire if held → **mine if held** (`mineSwing`) → tick cooldowns → Hold regen → update enemies (and reap dead → loot + chits + **`gainXp`** for Lien Points) → projectiles → pickups → effects → `systems.updateNotice` → death check (`systems.die`) → event-wave-clear → update prompt → **smooth** camera.

**`G.render()`**: clear → `ctx.scale(zoom)`, `imageSmoothingEnabled=false` → `world.render` (continuous-sampled floor → **ground decor** → glow-nodes → structures → torches) → chests → death-cache marker → pickups → effects → projectiles → (contact-shadow +) enemies → player → restore → **`lighting.frame`** (ambient darkness + additive light pools + bloom) → off-screen cache pointer. HUD is separate DOM (`ui.updateHud`).

## Core data flows

- **World generation:** `world.generate(cycle)` builds the dug-out Hold + Undercity + biomes, places structures/torches/glow-nodes, scatters mining nodes + ground decor + buildings, and rolls chests — all from a **seeded RNG keyed by `seedBase ^ cycle ^ key`**, so a cycle is fully reproducible and the save stays tiny (store `cycle` + opened-chest ids, regenerate everything else).
- **Region/depth lookup:** `regionAtPx` → `hold` | `undercity` | a direction. `depthAtPx` is a **continuous distance gradient** (0 Hold → ~0.4–1 across the Undercity ring → 1→~2.6 ramping out through a biome), driving ambient darkness, Notice rise, `lootTierAtPx`, and enemy toughness (`systems.scaleByDepth`).
- **Extraction loop:** kill/mine/loot → `pickups` drift to player → `carried`/`carriedGear` → bank at Storage into `stash` → die on the surface → `systems.die` drops the haul as a **`deathCache`** at the death site (recover by walking back; equipped gear is kept) → respawn at Hold → if you rest before recovering, the cache decays into `pendingClaim` → the Claim terminal rolls a rarity-weighted partial refund.
- **Cycle turnover:** rest at the Cot → `systems.rest` advances `cycle` and regenerates the surface (Static reshuffle analogue).
- **Interaction:** `updatePrompt` finds the nearest chest/structure in range and sets the `[E]` prompt; `interact` dispatches by structure type to systems/ui.

## Persistence (`game.js` snapshot + `save.js`)

`G.snapshot()` (version-tagged) saves: `cycle`, `stash`, `carried`, `carriedGear`, `equipped`, `pendingClaim`, `deathCache`, `notice`, `unlocks`, `med`, `tool`, `skills`/`skillPoints`/`xp`, `farm`, `opened` (chest ids), and `player` (x/y/hp). The surface itself is **not** saved — it's regenerated from `seedBase + cycle` (decor/nodes/buildings included). Autosave every 10s and on `beforeunload`. Any new persistent field must be added to both `snapshot()` and `loadGame()` (skills also need `recomputeSkills` on load).

## Where to change things

- **Balance / new content** → `js/data.js` (see [CONVENTIONS.md](CONVENTIONS.md): data-driven).
- **A new verb/rule** → `js/systems.js`, dispatched from `game.js` (`action`/`interact`/`update`).
- **A new structure** → add to `world._placeStructures`, handle in `updatePrompt` + `interact`.
- **A new enemy/item/recipe/biome** → a data row in `data.js` (+ a sprite PNG if desired; procedural fallback otherwise). New enemy behaviour → a `behavior`/`atk` row + a branch in `Enemy._unleash`.
- **A new skill node** → `data.skills` (effect field summed in `systems.recomputeSkills` → applied where `G.skillBonus` is read).
- **A new decor prop** → `data.decor`/`decorTall` + `assets/decor_<name>.png` + manifest row; placed by `world._placeDecor`.
- **Visuals / asset generation** → [ART-AND-ASSETS.md](ART-AND-ASSETS.md).
