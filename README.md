# THE PACT — vertical slice

A single-player, top-down **cozy-cyberpunk extraction game**. From a safe central **Hold**,
exit any doorway into one of four foreclosed **districts** (each a different biome and
difficulty), salvage from chests and fallen enemies, and get home before the Concern
collects. Die out there and your carried haul is **repossessed** — file a Claim for a
rarity-weighted partial refund.

This repo is the **playable vertical slice** built from §11 of
[`the-pact-game-design-spec.md`](the-pact-game-design-spec.md).

> **Engine note:** the spec locks Godot 4 for the long-term vision. This slice is built
> as a **self-contained browser game (HTML5 + Canvas + plain JS)** because it's the fastest
> way to build, test, and answer the spec's #1 question — *"is the trip-and-return loop fun?"*.
> The data-driven design ports conceptually to Godot later.

## How to run

**Easiest:** just double-click `index.html` — it runs in any modern browser, no build step.

**Or** serve the folder (needed only if your browser is strict about local files):
```
python -m http.server 8765
```
then open <http://localhost:8765>.

## Controls

| Key | Action |
|---|---|
| **WASD / Arrows** | Move |
| **Mouse + Left-click** or **Space** | Fire weapon (aim with mouse) |
| **Q** | Shock Pulse gadget (radial knockback + damage) |
| **H** | Use a Med-Patch |
| **E** | Interact (salvage nodes, Hold stations) |
| **Esc** | Close a menu |

## The world — a hub and four districts

The **Hold** is a safe walled compound in the center with a doorway on each side. Each
direction leads to a distinct biome at its own danger tier (spec §8):

| Direction | District | Tier | Feel |
|---|---|---|---|
| **North** | Default Row | 1 (start here) | repossessed homes · cool blue |
| **East** | The Scrapsea | 2 | chrome wasteland · rust |
| **South** | The Greenline | 2 | feral vertical farm · green |
| **West** | The Stacks | 3 (hardest) | server-cathedral · Static purple |

Pushing into the **outer half** of any district bumps loot richness — so "how far do I push"
still sets your risk, in every direction.

## The loop

1. **Exit** any Hold doorway into a district. Pick your risk by which way you go (and how far).
2. **Loot** comes only from **killed enemies** (they drop salvage) and **chests** — a chest
   stays **locked while an enemy is near it**, so clear the area to open it (`E`). Everything
   you carry is **at risk** (red in the HUD); ground loot drifts to you automatically.
3. Watch **Notice**: firing and standing still raise it; *moving* bleeds it off. Hit max → a
   **repo sweep** closes in from the dark (spawns at a distance, not on top of you).
4. **Decide:** push for richer loot, or head home.
5. **Bank** at Storage (`E`) to make your haul safe — that's a successful extraction.
6. **Die** out there → haul repossessed → respawn in the Hold → **Claim** terminal for a
   rarity-weighted refund (common stuff usually returns; rare gear usually doesn't).
7. **Craft** at the Fab Bench — permanent upgrades (incl. the **Stride Rig** for move speed)
   & Med-Patches.
8. **Rest** at the Cot to heal and advance the **cycle** — the districts re-foreclose (reshuffle).
9. Optional: **Answer the Call** beacon out in the Stacks — 3 escalating waves with a
   bank-or-push checkpoint.

## Code map (data-driven, per spec §10)

All content & tuning lives in **data**; the engine reads it. To change the game, start in `js/data.js`.

| File | Responsibility |
|---|---|
| `js/data.js` | **Tune the game here** — biomes, items, loot tables, enemies, recipes, gadgets, Notice rates, the event |
| `js/util.js` | Seeded RNG (cycle turnover), math, inventory helpers |
| `js/save.js` | localStorage read/write (pure storage) |
| `js/world.js` | Tilemap, the Hold compound + 4 directional biomes, depth/loot tiers, collision, chest/enemy placement, world rendering |
| `js/entities.js` | Player, Enemy (chase + contact damage + knockback), Projectile, Pickup (ground loot) |
| `js/systems.js` | Combat, Notice + repo sweep, loot (chests/kills), extraction (bank/die/Claim), crafting, rest-cycle, the event |
| `js/ui.js` | DOM HUD + overlay menus (storage / fab / claim / checkpoint) |
| `js/game.js` | Orchestrator: shared state, loop, input→action, camera, update/render, save snapshot |
| `js/main.js` | Boot, input wiring, title screen, autosave |
| `index.html` / `css/style.css` | Shell + cozy-cyberpunk styling |

## What's in vs. deferred

**In (slice):** central Hold + 4 directional biomes w/ tiers · movement/collision/camera · save/load ·
loot from chests + kills → bank → die-repossess → Claim · real-time combat (1 weapon + 1 gadget,
weapon-specific knockback) · 7 enemy types · Notice + repo sweep · Fab Bench (7 recipes incl. speed gear) ·
rest/cycle turnover · Answer-the-Call event.

**Deferred (spec §12, bolt on later):** rarity affixes & Parts/wiring · a real equip/gear-slot system ·
the Liens skill tree · cooking · mechanical sidekicks · biome titans · field casinos & the pull ·
Grace/Ledger · recovery-run death cache · prestige ladder · the Foreclosed Deep · touch/mobile controls.

## Tweaking examples

- **Make a district easier/harder:** edit that biome's `enemies` list or `tier` in `data.biomes` (`data.js`).
- **Change loot:** edit the weighted `loot` tables (per tier) in `data.js`.
- **Faster Notice pressure:** raise `notice.riseByDepth` / `dwellBonus` in `data.js`.
- **Tune knockback:** set a weapon's `knockback` (pistol is 0) or the Shock Pulse `gadgets.pulse.knockback`.
- **New recipe:** add to `recipes` + a matching entry in `craftEffects`, then handle it in `systems.craft()`.
