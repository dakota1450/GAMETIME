# Roadmap — build status vs the design spec

> **⚠️ 2026-06-26 — Core Keeper rebuild supersedes the slice below.** Per user direction ("match the
> exact style, material/block mechanics, physics as Core Keeper… start from scratch if needed"), the
> game core was rebuilt into a **solid-tile dig/build/craft world** ([REBUILD-NOTES.md](REBUILD-NOTES.md)).
> The §11/§12 status table further down describes the **retired** radial extraction build (code in
> `js_legacy_radial/`) and is kept for history only.
>
> **Rebuild — done & verified in-engine:**
> - ✅ Solid 2-layer tile world (`wall` over `floor`); dig tunnels out of solid earth; persistent dig (`edits` diff).
> - ✅ 1-tile mine + place-back (Minecraft-style); mining cracks/drops/particles; drops fly to you.
> - ✅ Tier ladder: concentric biome rings (Hollows→Scrapsea→Stacks→Core); rock tier gates the pickaxe needed;
>   ore for the next tier sits in the ring you can already dig. Verified: Salvage pick → "too hard" on tier-2 rock,
>   Copper pick → breaks it.
> - ✅ Crafting stations Furnace→Tinker→Anvil→Forge, each built from the prior tier's bars; tools/weapons gated by tier.
> - ✅ Combat (melee arc + ranged Rivet Gun), enemies spawn in the dark + scale with depth, death→respawn at Hold (keep items).
> - ✅ Dynamic lighting (lantern/torches/glowing ore), distinct biome palettes, chunky beveled textured blocks, hotbar/inventory/storage UI.
> - ⬜ Next: per-block/floor PNG tile textures (Higgsfield) for an even closer art match; more enemy variety/bosses;
>   re-introduce select PACT meta (Notice/extraction) if desired; balance to taste.

This tracks where the build actually stands against [the-pact-game-design-spec.md](../the-pact-game-design-spec.md): the MVP phases (spec §11) and the build order beyond the slice (spec §12). **Update the relevant rows whenever you finish a chunk** so this stays the single source of truth for "what's done / what's next."

_Last audited: 2026-06-26 (full codebase audit against the spec). Status reflects changes through that session._

Legend: ✅ done · 🟢 substantially done · 🟡 partial · ⬜ not started

## MVP / Vertical Slice (spec §11) — the heartbeat

| Phase | Status | Notes |
|---|---|---|
| **0 — Skeleton** | ✅ | 220×220 tile world, velocity-based movement + axis-separated AABB collision, camera follow with zoom + clamp, localStorage save/load (snapshot v2) of stash, carried, unlocks, opened-chest deltas. |
| **1 — Vertical world** | ✅ | The spec's **Hold → Undercity → Surface** model is now built (2026-06-26). Semi-safe **Undercity ring** (`data.undercity`, dead-infrastructure floor, light loot, weak depth-scaled enemies, dim lamps) surrounds the Hold; beyond it the four biomes. **Depth is a continuous distance gradient** (`world.depthAtPx`): 0 in the Hold, 0.4→1 across the Undercity, 1→~2.6 ramping out through a biome — driving ambient darkness, Notice rise, loot tier, and **enemy toughness** (same drone is ~0.86× in the Undercity vs ~1.68× deep). |
| **2 — Extraction core** | ✅ | Salvage → bank at Storage; **die → haul drops as a recoverable world cache at the death site** (recover by walking back, or it decays to the rarity-weighted **Claim** when you next rest). World persists. _Recoverable death cache added 2026-06-26 — was the last gap._ |
| **3 — Combat** | ✅ | Salvaged Pistol (multi-pellet capable) + Shock Pulse, player health/death/invuln, **7 enemy types each with a distinct behaviour** (chase / lunge / charge / slam-AoE / shoot / blink) + wind-up attack telegraphs, depth-scaled toughness. |
| **4 — Hold payoff** | ✅ | Fab Bench + Storage + **9 recipes** (target was ~5) turning salvage into permanent stat unlocks and consumables; two-way storage transfer UI. |
| **5 — Notice & dwell** | ✅ | Firing/pulse/cracking + dwelling raise Notice; moving and the safe Hold bleed it; repo sweep converges at 100 and drops to 55. |
| **6 — First risk hook** | ✅ | Answer the Call beacon → 3 escalating waves → checkpoint with **CASH OUT** (banks the at-risk haul), PUSH, or LEAVE. _Cash-out button added 2026-06-26 — the checkpoint previously promised banking but had no bank action._ |

**Slice verdict:** the entire MVP slice (Phase 0–6) is complete and playable end to end, including the Phase 1 Undercity + depth gradient.

## Core Keeper overhaul (2026-06-26) — two passes

Major look-and-feel work on the existing engine (no engine switch — see [ARCHITECTURE.md](ARCHITECTURE.md)):

**Pass 1 (lighting & sprites):**
- ✅ **Dynamic 2D lighting + soft shadows** (`js/lighting.js`) — dark world, warm/cool light pools (lantern, torches, station glows, glow-nodes, fire/tech, glowing decor); the Core Keeper signature.
- ✅ **Hooded-scavenger hero** + **all 7 enemies & the chest** re-skinned in the Core Keeper art direction.

**Pass 2 (floors, world, feel — addressing user feedback):**
- ✅ **Floors redone with nano_banana_2** (a better engine) — natural dirt/stone/soil/moss/cobble, far more varied.
- ✅ **Ground clutter** — ~2,600 scattered decor props + ~120 solid boulders/pillars (`world._placeDecor`); glowing flora lights the dark; **event pillars** ring the beacon.
- ✅ **Dug-out Hold** — the base is carved into mineable earth with exit tunnels (`world._digOutHold`, `data.mining._earth`), so it reads as underground and is expandable.
- ✅ **Per-enemy AI** — distinct movement + attack patterns with wind-up telegraphs (`entities.js` Enemy state machine).
- ✅ **Movement feel** — smooth camera lerp + player walk-bob.
- ✅ **Pacing** — crafting bonuses cut ~40% & costs raised ("scales too fast" fix).
- ✅ **Loadout/skills visible + Liens skill tree** (key **K**, action bar) — see §12 #3.
- ✅ **Curated text/UI** — Pixelify Sans pixel font + warmer panels.
- ✅ **Impact juice (2026-06-26)** — particle **death bursts** (flung debris + ring, bigger/lit for titans), **hit sparks** on projectile impact, and **camera shake** (`game.shake`, applied as a uniform cam offset in `render`) on pulse / enemy-slam / player-hit / death / titan-fell. Pure procedural feel, paired with the audio pass.
- ⬜ Remaining polish (per playtest): sprite-sheet enemy *animations* (Higgsfield AutoSprite), tune values to taste.

## Biomes-come-alive atmosphere overhaul (2026-06-26)

Addressing user feedback that the districts looked "way too plain and boring." A procedural (no-new-art) pass that gives each biome a living identity — verified in-engine per district:
- ✅ **Per-biome ambient color grade** (`data.biomes[*].mood`, `lighting.ambient`) — shadows take the district's hue: Default Row cool blue, Scrapsea rusty amber, Greenline sickly green, Stacks violet, Glittermile hot magenta.
- ✅ **Biome-signature floor detail** (`world._biomeFloorDetail`) — Greenline moss/roots/spores, Scrapsea oil/rust/bolts, Default Row domestic tiling/cracks, Stacks circuit-grid/data-glints, Glittermile neon dancefloor/glitter.
- ✅ **Animated ambient motes** (`data.biomes[*].motes`, `world.renderMotes`) — drifting spores / blowing dust / data-bits / sparks, additively lit, give each district motion.
- ✅ **Procedural signature props** (`data.bigProps`, `world._placeBigProps`/`drawRack`/`drawHulk`/`drawShroomTree`/`drawHolo`/`drawArcade`) — Stacks server-racks, Scrapsea dead vehicle hulks, Greenline glowing mushroom-trees, Default Row flickering holo-residents, Glittermile arcade cabinets. ~85 landmarks/cycle, solid ones block, glowing ones light the dark.
- 🛠 **Dev:** added `serve_nocache.py` + a `the-pact-nocache` launch config (port 8767) so edits show on reload without the JS-cache gotcha.

## Materials, mining & buildings (2026-06-26)

New gameplay systems realizing the salvage fantasy (spec §5.3 "raiding strips the zone", §8 biome rewards, §8.1 POIs):
- ✅ **Biome-signature materials** — `data.items` gained `plating` (Default Row), `biomass` (Greenline), `crystal` (Stacks); each district drops its own via its nodes (`data.mining`).
- ✅ **Destructible environment** — ~500 **mining nodes** per cycle scatter through the districts (`world.mine`, `_placeMineNodes`); they're solid until broken, show cracks as damaged, and drop biome materials. Crystal/bloom nodes glow.
- ✅ **Mining tools** — hold **F** / right-click to mine the node you face (`systems.mineSwing`). Start with the **Salvage Cutter** (power 1); craft the **Plasma Cutter** (power 2) at the Fab Bench to breach **hard** nodes (hull/crystal, hardness 2). Tool shown in the LOADOUT view.
- ✅ **Shoot-through** — player projectiles chip destructible nodes (`Projectile.update` → `systems.hitNode`), so the gun can blast cover/soft nodes.
- ✅ **Enterable roofless buildings** — handcrafted-ish rooms (`world._placeBuildings`) with a doorway and a reward chest inside; their walls are **breachable** nodes, so you can use the door *or* mine/shoot your way in. Top-down = no roof, always visible.

## Build order beyond the slice (spec §12)

In spec priority order. Almost all not-started — **do not start these until the slice feels good** (spec §12 scope-honesty note).

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Rarity & affixes | 🟢 | **Itemization layer built (2026-06-26).** 6-tier gear ladder (Scrap→Heirloom, `data.gearRarity`), prefix/suffix **affix pools** (`data.affixes`), 4 weapon bases (`data.gearBases`), gear instances rolled on drop (`S.rollGear`), stats derived from base+affixes (`S.gearStats`) and fed into combat (`S.weaponStats`/`S.fire`, incl. multi-pellet + notice mods). Gear drops from chests + tougher kills, shows as a rarity-coloured pickup, equips in the LOADOUT view (key **B**). Spare gear is at-risk in the death cache; equipped weapon is kept. _Remaining for full §9.3: armour/module slots, a crafting bench to add/remove/reroll affixes._ **Unique Relics/Heirlooms added 2026-06-26** (`data.uniques`, see §12 #11). |
| 2 | Parts & wiring | 🟢 | **Weapon Parts + rails AND a deployable Module built (2026-06-26).** *Parts/rails:* weapon bases have **rails** (`data.gearBases[*].rails`); **5 craftable Parts** (`data.parts`: Splitter/Overcharger/Dampener/Long Barrel/Heavy Rounds) fabricate into a kit (`G.parts`, `S.craftPart`) and slot into the equipped weapon in LOADOUT (`S.installPart`/`removePart`); `S.gearStats` folds them on top of rolled affixes (same op grammar). *Deployable Module:* `data.modules` + a `Deployable` entity — the **Salvage Turret** (unlock at the Fab Bench → `G.module`; deploy in the field with **[R]** on a cooldown; auto-fires at nearby enemies for its lifetime, then expires). HUD Module slot with cooldown overlay; turret casts a device glow (lighting). _Remaining for full §9.3: a wider Module roster (drones/traps/med-injector) and **wired couplings** that combine gadget effects._ |
| 3 | Liens skill tree | 🟢 | **Built 2026-06-26.** `data.skills` (3 branches × 3 nodes, prereq chains); earn Lien Points from kills; allocate in the **K** overlay (`ui.showSkills`); bonuses via `systems.recomputeSkills`→`G.skillBonus`. _Later: owed/cost keystones, respec, archetype branches._ |
| 4 | Cooking & buff/heal consumables | 🟢 | **Cooking + timed-buff lifecycle built (2026-06-26).** A **Cookfire** station in the Hold (`world` `cook` structure) turns salvage/grown ingredients into **5 rations** (`data.cooking`): Mire Gruel (heal+regen), Stim Brew (+dmg/+fire-rate), Plated Rations (damage resist), Spore Tonic (+move/−notice), Cutter Oil (+mining). Each cook banks carryable **portions** (`G.meals`); eating one (mess-kit hotkeys **1–5** or the Cookfire EAT button) applies a **timed buff** with a draining HUD pip. Buffs aggregate into `G.buffBonus` (`systems.recomputeBuffs`) and flow into weapon dmg/cooldown, move speed, `player.resist`, field regen, Notice gain, and mining; re-eating refreshes the timer. Portions persist in the snapshot; live buffs are transient. _Later: cook-quality tiers, combo dishes, pre-stocked loadout slots._ |
| 5 | Mechanical sidekicks (automation) | 🟢 | **Hold automation MVP built (2026-06-26).** `data.sidekicks` = 3 craftable bots assembled at the Fab Bench (`S.buildSidekick`, one of each): **Scrap-Picker** (scavenges Scrap/Wiring), **Garden-Tender** (grows Organics), **Foundry Unit** (consumes Scrap → forges Alloy). Each runs its Hold job every cycle on **Rest** (`S.runSidekicks` in `S.rest`), depositing straight to safe storage; `consume`-type bots idle when out of feedstock. Persisted in `G.sidekicks`. _Later: more jobs (run craft queues, guard the Hold), upgrades, field-deployable variants (the `Deployable` turret already proves that path)._ |
| 6 | More biomes & foreclosure-titans | 🟢 | **The Glittermile (5th biome) AND foreclosure-titans added (2026-06-26).** *Glittermile:* a gambling district in a narrow **NE diagonal wedge** (`world.dirAtPx` angle band) — hot-magenta mood, procedural **neon-dancefloor** floor, sparkle motes, **arcade-cabinet** landmarks, luxury mining, rogue-bot enemies, Chit-rich chests, a **"THE HOUSE WAKES"** event. *Titans:* **one boss per district** (`data.titansByBiome`, `data.enemies.titan_*`) — The Assessor / Crusher / Bloomfather / Sysadmin / Pit Boss. Large fixed-stat elites (`scaleByDepth` skips them) that **summon adds** while engaged, wear a **boss aura**, show an on-screen **boss health bar** (`game.drawTitanBar`), lurk deep in the outer half, and drop a **guaranteed haul** (gear + a Part + Chits + mats via `systems.titanReward`) with a "TITAN FELLED" banner. _Remaining: only the Foreclosed Deep endgame biome (§12 #12)._ |
| 7 | Surface cycle-turnover + procedural far-out | 🟡 | Resting re-seeds chests/enemies/cover **+ mining nodes + buildings** deterministically per cycle (2026-06-26). Buildings are the first **POIs**. **Biome signature-events added 2026-06-26** (`data.sweepEvents`, `systems.repoSweep`): a Notice-peak event now reflects the district you're in — Default Row **Repo Sweep**, Scrapsea **Static Squall** (scrap-hound stampede), Greenline **Bloom-Surge** (spore-pods), Stacks **Lockdown** (security constructs), Undercity **Repo Patrol** — each with its own banner + enemy mix, scaling with depth. Still missing: weather/Static-spread visuals, moving beacons. |
| 8 | Weapon/armour classes + Light/Med/Heavy + sets | ⬜ | Only the Gunslinger pistol. No armour slot, classes, or set bonuses. |
| 9 | Field casinos + the pull (Chits/banners/pity) | 🟢 | **Field casino built (2026-06-26).** A transient **casino POI** re-seeds in the Glittermile each cycle (`world._placeCasino`); interact (E) opens a gambling overlay (`ui.showCasino`) with three games (`data.casino`, `systems.slots`/`doubleOrNothing`/`pull`): **SLOTS** (Chits → weighted Chit payout w/ reels + jackpot), **DOUBLE-OR-NOTHING** (wager your carried haul — 45% double, else lose it all, the spec's max-tension bet), and **THE PULL** (Chits → gear with a **pity counter** that guarantees a Masterwork+ every 6 pulls; `G.pity` persisted, banner on drop). _Later: black-market gear, flagged items that raise Notice, recurring NPC hosts._ |
| 10 | Recovery-run + Grace/Ledger/den + dynamic trading | 🟡 | The **recovery-run death cache is now in** (Phase 2). Grace/Ledger, the den, and dynamic trading are not. |
| 11 | Prestige ladder (Relic/Heirloom) | 🟡 | **Named unique Relics & Heirlooms built (2026-06-26).** `data.uniques` = build-defining weapons that roll (55%) instead of a random affixed item at Relic/Heirloom rarity: **The Red Ledger** (Heirloom — damage scales with Notice, the spec's "turn Notice into power"), **The Severance** (Heirloom — piercing rounds), **Quietus** (Relic — near-silent fire), **Deadhand** (Relic — pellet wall + knockback), **Overdraft** (Relic — fast multi-shot). Fixed `mods` (affix grammar via `gearStats`) + code-level `special` (Notice-scaling dmg in `weaponStats`, projectile `pierce` in `entities`). Named/coloured in LOADOUT with effect + flavor; can still socket Parts on their rails. Delivered by titan kills + casino pity-pull. _Remaining: the full prestige loop — off-grid/Ledger-clear win condition, Heirloom set effects._ |
| 12 | The Foreclosed Deep endgame | 🟢 | **Endgame loop built (2026-06-26).** Felling all 5 district titans (tracked in `G.titansBeaten`) wakes the **Deep Gate** in the Hold (`world` `deepgate` structure; prompt shows N/5 progress). Interact → `systems.startDeep` summons **The Auditor** (`data.enemies.auditor`, a 1500-HP mega-boss with a void aura, 9-shot bursts, and a construct escort) deep in the Stacks. Felling it runs the `reward.deep` payoff in `titanReward`: a **guaranteed Heirloom** + ◈300 + Parts + a **permanent +50 Max Vitality** ("OFF THE LEDGER" — the spec's off-grid prestige), `G.deepCleared` persisted. _Later: a distinct reality-broken zone, repeatable/scaling Deep, the full Ledger-clear win arc._ |

## Accepted divergences from the spec

These are deliberate (mostly first-time-dev pragmatism), not bugs. Flagged here so "stay on track" is an informed choice, not drift:

1. **Engine:** browser HTML5/Canvas in plain JS, **not Godot 4** (spec §4). Easiest to build/test/iterate; the data-driven §10 architecture is still honoured. _Accepted._
2. ~~World model / no Undercity / discrete depth~~ — **RESOLVED 2026-06-26.** The vertical Hold→Undercity→Surface model + continuous distance-based depth gradient are now built (see Phase 1 above). The world is still laid out radially (Undercity = a ring, biomes = the outer disc by direction) rather than a literal vertical stack, but the spec's *risk semantics* — safe core, semi-safe warm-up, danger rising with distance — now hold.
3. **Biome set:** Default Row, Scrapsea, Greenline, Stacks, **and the Glittermile** (added 2026-06-26 as a NE diagonal wedge) are in. The **Foreclosed Deep** exists as an endgame *encounter* (the Auditor, §12 #12) rather than a distinct explorable biome-zone — a deliberate scope choice; a separate reality-broken zone is a later option.

## World-model decision — RESOLVED (2026-06-26)

**Chosen: (B) align to the spec's verticality.** Bend the flat world back toward the spec's intent: add a semi-safe **Undercity ring** just outside the Hold and a **distance-based depth gradient within biomes** (sub-tiers that scale *enemies*, not just loot). This is the committed next world-track and closes the Phase 1 gap. _(The alternative — embracing the flat 4-biome world — was declined.)_

## Next up (recommended order)

1. ~~Phase 6 cash-out checkpoint~~ — ✅ done 2026-06-26.
2. ~~Phase 2 recoverable death cache~~ — ✅ done 2026-06-26.
3. ~~§12 #1 — Rarity & affixes (itemization layer)~~ — 🟢 built 2026-06-26 (find/equip affixed weapons; see §12 table). _Follow-ups: crafting bench affix add/remove/reroll, armour/module slots, unique Relics._
4. ~~World-track — Phase 1 alignment: Undercity ring + depth gradient~~ — ✅ done 2026-06-26 (see Phase 1 above).
5. ~~Re-skin enemies/chest + materials/mining/buildings~~ — ✅ done 2026-06-26.
6. ~~Core Keeper overhaul pass 2: floors, decor, dug-out Hold, per-enemy AI, movement feel, Liens skill tree, UI/text~~ — ✅ done 2026-06-26.
7. ~~§12 #4 — Cooking & buff consumables~~ — 🟢 built 2026-06-26 (Cookfire station, 5 rations, timed-buff lifecycle, mess-kit HUD; see §12 table).
8. ~~§12 #2 — weapon Parts & rails + first deployable Module (Salvage Turret)~~ — 🟢 built 2026-06-26 (see §12 table). _Remaining: wider Module roster + wired couplings._
9. ~~§12 #5 — mechanical sidekicks (Hold automation MVP)~~ — 🟢 built 2026-06-26 (3 bots, per-cycle Hold jobs; see §12 table).
10. ~~Biomes-come-alive atmosphere overhaul + the Glittermile (5th biome)~~ — 🟢 built 2026-06-26 (per-biome mood/floor-detail/motes/signature-props; Glittermile NE wedge; see sections above).
11. ~~Foreclosure-titans (biome bosses, §12 #6) + field casinos (§12 #9)~~ — 🟢 built 2026-06-26 (5 bosses w/ boss bar + guaranteed loot; Glittermile casino w/ slots/double-or-nothing/pity-pull; see §12 table).
12. ~~Procedural audio engine (first SFX anywhere)~~ — 🟢 built 2026-06-26 (`js/audio.js`, ~18 synthesized SFX, M to mute; see Polish section).
13. ~~Impact juice (death bursts, hit sparks, screen shake)~~ — 🟢 built 2026-06-26 (see Core-Keeper overhaul section).
14. ~~Unique Relics & Heirlooms (§9.11 prestige chase)~~ — 🟢 built 2026-06-26 (5 named build-defining uniques; see §12 #11).
15. ~~§12 #12 — the Foreclosed Deep endgame (titan-gated Auditor finale + off-the-ledger prestige)~~ — 🟢 built 2026-06-26 (see §12 #12).
16. **Next:** the whole §12 build order is now done or substantially done. Remaining depth: enemy **sprite-sheet animations** (needs the art pipeline); §12 #2 **wired couplings**; §12 #10 **Grace/Ledger/den** (the luck/debt meta + dynamic trading); a distinct **reality-broken Deep zone**; affix crafting bench. Plus value-tuning to taste. Keep polishing toward "fully Core Keeper feel" on user feedback.

## Polish / smaller fixes noticed in the audit

- The **beacon** sits just outside the Hold's west wall and never moves; spec implies it lives out in the Stacks and reshuffles per cycle.
- ~~Repo sweeps and biome events are generic; the spec gives each biome its own signature event (squall, bloom-surge, etc.).~~ — **RESOLVED 2026-06-26** (`data.sweepEvents`; see §12 #7). Each district's Notice-peak event is now its own (Static Squall, Bloom-Surge, Lockdown, …).
- ~~No audio anywhere yet (sweeps/cash-out/pickups are silent).~~ — **RESOLVED 2026-06-26.** Added `js/audio.js` — a procedural **Web Audio** SFX engine (no audio files; synthesized oscillators + noise + envelopes). ~18 sounds (shoot/pulse/mine/node-break/hit/pickup/heal/bank/craft/deploy/lien/death/sweep/titan-fell/slots-spin/win/jackpot/lose) wired into systems & entities. AudioContext resumes on the title-screen click (autoplay policy); **M** toggles mute. Verified: ctx running, all SFX play, no errors during live play.
