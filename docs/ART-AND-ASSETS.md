# Art & Assets — generation pipeline and conventions

How visual assets are made, processed, and wired into THE PACT. Follow this whenever you add or regenerate a sprite, tile, or texture so the game stays visually coherent.

## The golden rules

1. **The renderer never hard-depends on an asset.** Every draw falls back to a procedural shape/colour if its PNG isn't present (`js/assets.js`). Dropping a PNG into `assets/` *upgrades* the look; deleting one degrades gracefully. Never write a draw path that throws when an image is missing.
2. **One STYLE FORMULA, byte-identical, in every generation prompt.** This is the single most important rule for making independently-generated assets look like one game. See below.
3. **Floors are sampled continuously, not stamped per-tile.** See "Floor system".
4. **Keep characters/pickups readable on top of floors.** Floors are dark, low-contrast, and recede; entities pop. This is a deliberate palette-by-role choice, not an accident.

## The STYLE FORMULA (the style contract)

**CURRENT direction (Core Keeper match, set 2026-06-26).** Embed this paragraph **verbatim** in new asset prompts:

> Detailed top-down cozy-underground pixel art in the style of Core Keeper and Stardew Valley: rich readable chunky sprites with soft baked ambient-occlusion contact shadows, clean silhouettes and warm hand-crafted detail, built to be lit by dynamic point-lights; THE PACT's dystopian-debt setting in desaturated industrial browns, steel-blue, rust, moss and bruised violet with sparse teal and amber salvage-tech glow; oppressive-but-cozy underground mood, strong warm-light-to-cool-dark contrast, consistent high top-down orthographic perspective across every asset.

The game now renders **dynamic lighting** (see "Lighting system" below), so assets should be made **lit-neutral**: even, flat baked lighting + a soft contact shadow, *no* hard baked highlights or directional shadows — the engine's lights provide those. Floors stay dark/low-contrast so the light pools and characters pop.

Prompt assembly for a tile: `seamless tileable game texture tile of <3-6 word material>, uniform pattern density, <STYLE FORMULA>, perfectly seamless edges that wrap horizontally and vertically, no border, no vignette, flat even lighting, no single focal object`.

> **History / cohesion:** floors were made with an earlier "dark pixel-painterly" formula. The **hooded hero** (`assets/player.png`), all **7 enemies** (`assets/enemy_*.png`) and the **chest** (`chest.png`) are now in the Core Keeper direction above (enemies + chest re-skinned 2026-06-26, generated on a green key bg). Floors predate it but cohere under the lighting. Don't introduce another style — match the formula above.

## Generation: Higgsfield MCP

The Higgsfield MCP server (id begins `24e431c7-…`) provides `generate_image`, `models_explore`, `show_generations`, `get_game_creation_instructions`, and the bundled `scripts/seamless.py` (via `get_game_creation_bundle_file`).

- **Primary model — `nano_banana_2`** (Google; the "better engine"). Use for **natural floors and decor props** — far richer, more organic detail than Recraft. No palette param, so describe colours in the prompt; generate at `resolution: "2k"` for floors. This is what the current floors/props were made with.
- **`recraft-v4-1`** (`model_type: "standard"`) — use when you need an **exact locked palette**: it takes `params.colors` (up to 10 `#RRGGBB`) + `background_color`. Good for palette-matched tiles or sprites on a clean green key.
- Browse models with `models_explore` (`action:"list"`/`"recommend"`). **`autosprite`** can make animated directional sprite-sheets (idle/walk/attack) — the path for true enemy/character animation later.
- **Preflight cost** with `params.get_cost: true`. ~1.25 credits per 1k image.
- **Fire all variants in parallel** (separate `generate_image` calls in one message), then poll once with `show_generations` (type `image`) to collect `results.rawUrl` for each. Do not poll in a tight loop.
- **Regeneration budget: ~2 attempts** per asset for drift/feature problems, then take the best and compensate in code.

## Post-processing (local, offline)

Python with `numpy` + `pillow` (already installed). The seam-fix script is `scripts/seamless.py` (Moisan FFT periodic decomposition + offset blend + luminance flatten) — a working copy is kept in the session scratchpad; it's fetched from the Higgsfield bundle, never retyped from memory.

Per texture: **download the 1024px raw → downscale to 512 (LANCZOS) → `make_seamless()` → save to `assets/floor_<dir>.png`.** Verify with the seam-ratio one-liner:

```python
a = np.asarray(Image.open(p).convert("RGB")).astype(float)
seam = abs(a[0]-a[-1]).mean() + abs(a[:,0]-a[:,-1]).mean()
base = abs(np.diff(a,axis=0)).mean() + abs(np.diff(a,axis=1)).mean()
print(seam/base)   # ~1.0 = seamless
```

Caveat: this ratio is **unreliable for very smooth, low-contrast tiles** (tiny interior differences inflate it) — trust the in-game look over the number. A faint residual seam is invisible once the noise overlay + vignette are on top.

## Floor system (how tiles are drawn)

The six floors live at `assets/floor_{hold,undercity,north,east,south,west}.png` (512×512). They were re-done with **nano_banana_2** as natural ground — earth/cobble/planks (Hold), dead-infrastructure concrete (Undercity), cracked pavement, oily scrap-sand, mossy soil, crystal-flecked stone. The renderer (`World.prototype.render` in `js/world.js`) does **continuous world-space sampling**, not per-tile stamping:

```js
const sx = (((c * TILE) % img.width) + img.width) % img.width;
const sy = (((r * TILE) % img.height) + img.height) % img.height;
ctx.drawImage(img, sx, sy, TILE, TILE, x, y, TILE, TILE);   // via assets.img(key)
```

Each tile draws the matching 32px slice of the big seamless texture, so the floor reads as one unbroken surface that repeats only every 512px (16 tiles) — and seamlessly, so even that isn't a visible grid. On top, `World.prototype._floorTexture` adds a subtle two-octave noise shade + sparse grit specks. Darkness/depth now comes entirely from the **lighting pass** (the old radial vignette was removed). Walls are flat biome-coloured fills; mining nodes draw as chunky cracked blocks (`_renderNode`).

## Ground decor / clutter (the "living ground")

`world._placeDecor` (driven by `data.decor` + `data.decorTall`) scatters ~2,600 non-colliding **ground props** (grass, mushrooms, pebbles, bones, scrap, shrubs, glowing flowers/crystals) + ~120 **solid** boulders/pillars that block movement, region-appropriate per tile. Glowing props (flower/crystal) feed `world.glowDecor` → the lighting. A ring of **pillars** frames the event beacon. Props are `assets/decor_<name>.png`; add one = a `data.decor` row + sprite + manifest row. Rendered in `world._renderDecor` (between floor and entities) with a contact shadow under each.

## Lighting system (the Core Keeper look) — `js/lighting.js`

The world is **dark by default**; warm/cool **point lights** carve pools of light out of the shadow. This single system is what makes the game *feel* like Core Keeper. How it works each frame (`PACT.lighting.frame`, called from `game.render` in screen space after the world + entities are drawn):

1. An offscreen **light map** is filled with **ambient darkness** — warm-bright in the Hold, progressively darker in deeper-tier districts (`ambient()`).
2. Every light source is drawn onto it **additively** (`'lighter'`): the player's lantern, Hold torches, station glows, biome **glow-nodes**, unopened chests, the death cache, projectiles, and muzzle/pulse flashes (`gather()`).
3. The light map is **multiplied** over the rendered scene → darkness everywhere the lights don't reach.
4. A second **additive bloom** pass brightens emissive cores so fire and tech visibly glow.

Plus `PACT.lighting.shadow(ctx, sx, sy, w)` draws **soft contact shadows** under the player, enemies, chests, and structures (called in `game.render` / `world._renderStructures`).

**Tuning knobs:** light `r`/`i`/`col` in `gather()`; base darkness in `ambient()`. To add a new light, push `{x, y, r, col:[r,g,b], i, bloom}` in `gather()`. Light/glow/torch placement lives in `world.js` (`_placeTorches`, `_placeGlows`). Because lighting provides the darkness, **asset art must not bake its own vignette or heavy directional shadow.**

## Character / transparent sprites

Generated with Recraft on a **solid green key background** (`background_color: "#00ff00"`) — green, not magenta, because the robe/tech palette has no green so keying is clean. Then chroma-keyed locally (numpy/PIL): drop pixels where `g > 80 && g > r*1.32 && g > b*1.32`, **de-spill** green fringe on kept edge pixels, trim to the alpha bbox, center on a square, downscale to 128px. A small brightness/contrast/saturation bump helps the sprite read inside the lantern pool (it gets multiplied by the lighting). Source options for the hero are kept in `assets/_raw/hero_hooded_*_src.png`.

The hero faces **up (north)** in the source so the engine's `atan2(aim)+π/2` rotation makes it turn toward the aim direction. The player draws at `radius * 3.7` (`entities.js Player.draw`).

**Green-on-green props** (grass, plants, glowing flora) break the simple ratio key — the prop's own green gets removed. Use the **flood-fill key** instead (`scratchpad/key_props.py`, needs `scipy`): sample the border bg colour, label connected bg-coloured regions, drop only the components **touching the image border**, then de-spill + erode 1px + trim. This keeps green inside the prop while removing the green background.

## UI text & styling

The UI uses **Pixelify Sans** (Google Fonts `@import` at the top of `css/style.css`, exposed as the `--pixel` var) for a cohesive Core Keeper feel, applied to HUD/menu/title/button chrome. The always-visible **action bar** (`#action-bar`, built in `ui.init`) gives one-click Loadout/Skills access. Keep new UI on the `--pixel`/`--mono` vars and the existing colour vars (`--amber`, `--teal`, `--good`, …).

## Biome palettes (pass these to Recraft `colors`)

| Biome | dir | material | palette (dark→light) |
|---|---|---|---|
| The Hold | hold | riveted warm-brown metal deck | `#15110b #1c1812 #221c14 #2a2118 #352819 #43331d` |
| The Undercity | undercity | dead-infrastructure concrete + pipes/grating (semi-safe ring) | `#13151b #1b1e24 #23272e #2d323a #384049 #48515b` |
| Default Row | north | cracked cold concrete | `#0e1218 #14181e #181d24 #20262f #2a323d #3a4654` |
| The Scrapsea | east | rusted scrap-metal ground | `#140f0a #1d1813 #241d15 #2e251a #3a2e1f #4a3a26` |
| The Greenline | south | overgrown mossy soil | `#0c130e #121d16 #16231b #1c2c22 #26382b #33493a` |
| The Stacks | west | violet circuit-etched floor | `#100d1c #171426 #1e1934 #261f42 #2f2650 #3d3266` |

These mirror the `floor`/`floorAlt` colours in `js/data.js` (`data.biomes`, `data.home`). Keep them in sync if you retune a biome's colour.

## The cache gotcha (read this before "it didn't change")

The dev server (`python -m http.server`) sends **no cache headers**, so the browser heuristically caches JS *and PNGs*. Because regenerated tiles reuse the same filename, a plain reload can serve the **old** image. After changing any asset or JS file:

- In a real browser: **hard refresh (Ctrl+Shift+R)**.
- For in-session preview verification, hot-load instead of fighting the cache:
  - JS: inject `<script src="js/x.js?cb=TIMESTAMP">` (re-runs the IIFE, re-augments `PACT`).
  - Image: `const i=new Image(); i.onload=()=>{PACT.assets.images[key]=i; PACT.assets.ready[key]=true}; i.src='assets/'+key+'.png?cb='+Date.now();`
  - **CSS**: the `<link>` caches too — inject a fresh `<link href="css/style.css?cb=...">` and remove the old one to see styling/font changes.
  - To inspect a district without the player dying to the Notice/death logic, temporarily set `PACT.game.update = function(){}` (save the original first), teleport `PACT.game.player`, call `updateCamera()` + `render()`, screenshot, then restore.
- **Preview-tab gotcha:** if `preview_screenshot` times out, check `document.visibilityState` via `preview_eval` — a backgrounded/collapsed preview tab (e.g. after the user opens the game in their own browser) returns `"hidden"` and a tiny canvas width; **stop + start the preview server** to get a fresh visible tab. The game itself is fine (synchronous `preview_eval` still works).
