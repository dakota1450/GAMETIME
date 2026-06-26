# Core Keeper rebuild (2026-06-26)

Goal (user): *"match the exact style, material/block mechanics, physics as Core Keeper, with our premise.
1-tile mineable/replaceable system like Minecraft, base material layer over dirt. First biome has
materials to build tools/weapons for the next zone; each bench/weapon requires higher-level materials."*

## Decision
Keep the engine (plain-JS Canvas — exactly what Core Keeper is) and the good sub-systems
(`util`, `save`, `audio`, `assets`, lighting concept). **Rebuild the game core** from the radial
open-floor + scattered-nodes model into a true **solid-tile dig world**. Legacy backed up in
`js_legacy_radial/`.

## The new core model
- **2-layer tile grid:** `wall[]` (solid mineable block id, 0 = dug-out/open) over `floor[]` (the
  base ground revealed underneath — "base material layer over dirt"). Default world is SOLID; you
  dig tunnels out of it. Persistent — your digging stays (sparse `edits` diff in the save).
- **1-tile mine/place:** hold the pickaxe + click a wall tile in reach → mine it (cracks → break →
  drop flies to you). Select a block in the hotbar + click an empty tile → place it back. Every
  material is mineable and replaceable.
- **Tiered ladder (the gate):** concentric biome rings; the bulk rock of ring N needs the tier-N
  pickaxe. The ore for the tier-(N+1) pickaxe lives in ring N (mineable with what you already have).
  Salvage→Copper→Iron→Crystal→Core. Benches gate recipe tiers; each weapon/tool needs that tier's bars.
- **Benches:** Furnace (ore→bars), Tinker Bench (bars→tools/weapons/blocks), then higher benches
  (Anvil, Forge) unlock the next tier — each crafted from the prior tier's bars.
- **Hotbar-driven controls (CK-style):** selected hotbar item decides the click action — pickaxe
  mines, weapon attacks, block places. WASD move, mouse aims/targets, scroll/1–0 select, E interact,
  Tab inventory.

## Module status
- `data.js` `world.js` `entities.js` `systems.js` `game.js` `ui.js` — rewritten for the tile model.
- `lighting.js` — adapted to the new world interface (still the multiply light-map + bloom).
- `util.js` `save.js` `audio.js` `assets.js` — reused.
