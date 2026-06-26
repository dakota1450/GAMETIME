# THE PACT — Game Design & Build Spec (Handoff Brief)

> **Working title.** A single-player, top-down, cozy-cyberpunk **extraction sandbox**: build a safe home in the deep underground, surface into foreclosed corporate ruins to salvage, and get back before the world — or the thing that owns it — collects.
>
> **How to use this doc:** Sections 1–10 are vision and systems context. **Section 11 (MVP / Vertical Slice) and Section 12 (Build Order) are what you build from — start there.** Do not attempt to build the whole vision at once; it is multi-year in full. Everything above the MVP is the *why*; the phased plan is the *what now*.

---

## 1. Pitch

You inherited a debt you can't read the terms of. To pay it down, you live off-grid in a buried hab and raid the surface — districts the Concern has *foreclosed on*, frozen at the moment of seizure and rotting under a corruption called the Static. Everything you haul out can be tinkered into gadgets, weapons, and upgrades. But the surface can see you, the danger deepens the farther you push, and if you die out there you drop everything you were carrying. The home is cozy. The world is not.

## 2. Design pillars

1. **Cozy underground, lethal surface.** The Hold feels like Core Keeper/Stardew. The surface does not. The contrast is the game.
2. **Risk/reward as the core verb.** Every trip ends in "push deeper or get home?" The player sets their own stakes by what they carry and how greedy they get.
3. **Earned, modular power.** Build identity comes from *configuration* — gadgets, parts, and a skill tree — not just bigger numbers.
4. **A world that watches.** The Concern is a pressure that escalates the deeper and longer you intrude. Staying hidden is a skill.
5. **Unflinching, not edgy-for-its-own-sake.** The horror is a polite system that owns you. Dark themes (debt, addiction, complicity, the body as collateral) are earned, not decorative, and never preachy.

## 3. References

- **Look / base-building / contiguous sandbox:** Core Keeper, Stardew Valley
- **Extraction stakes (lose-on-death):** Escape from Tarkov, Hunt: Showdown
- **Itemization (gadgets, parts, affixes, skill tree):** Path of Exile 2, Diablo
- **Tone:** polite-dystopia cyberpunk + sunlit folk-horror dread

---

## 4. Locked decisions

| Area | Decision |
|---|---|
| Engine | **Godot 4** (GDScript) |
| Players | **Single-player** (no multiplayer in scope) |
| Genre/art | Cozy-cyberpunk pixel art |
| World model | **One contiguous, persistent sandbox** (no instanced raids) |
| Core stake | **Extraction loss** — die on the surface, drop the run's carried inventory where you fell; the world persists |
| Risk model | **Depth = primary risk gradient; dwelling = local time-based escalation** (see §7) |
| Progression | PoE2-style **gadgets** (not software): Modules/Rigs + Parts + affixes, plus the **Liens** skill tree |
| Monetization in gacha | **None.** The "pull" runs on an in-game earned currency only — never real money |
| Tone | Unflinching, morally grimy, non-didactic |
| Perspective | **True top-down** (best for combat feel) |
| Surface authoring | **Persistent near-home + procedural/reshuffling far-out, regenerating on a cycle** (see §8.1) |
| Death recovery | Hard loss — the Concern **repossesses** your haul — plus a **rarity-weighted chance-based Claim** (see §9.1) |
| Hold sim scope | Crafting / upgrades / QoL + **cooking for buffs & heals** + **buildable mechanical sidekicks** (base automation). **No relationships.** |

**All §13 items resolved this session — nothing currently blocks the build.**

---

## 5. The world & universe

### 5.1 The Pact
The land was never owned — it was **borrowed**, under an arrangement older than money. Someone treated a sacred debt like a financial one; a land-management entity, **the Concern** (placeholder), "consolidated" it and defaulted on something that was never about coin (**the Default**). You inherited the note. Everything past your door is **the Arrears** — owed ground, where what you take is itself collateral.

### 5.2 The creditor
The Concern has a real corporate face — offices, a logo, a friendly support-bot avatar. But the thing wearing it is **obligation given an appetite**: it predates currency and markets are just its most efficient mouth. It doesn't threaten — it offers *terms*, because a smiling contract collects more than a fist. It is functionally the house edge of reality. **You don't fight it. You're employed by it.** Every salvage run is you doing its collection work.

### 5.3 The Static (corruption + complicity engine)
The **Static** is the Concern's reach — where it has foreclosed on the world, rotting signal and flesh together. It **spreads as zones are stripped**. So the loop is never clean: you raid to pay your debt, and raiding deepens the rot. This also gives a built-in escalation/difficulty logic.

### 5.4 The vertical world
The surface belongs to the Concern — a panopticon of drones, towers, and seamless tech. Down in the dark you're **off the ledger**: unseen, safe. The good salvage is up top. So the loop **inverts the usual**: you surface into danger and descend to safety.

- **The Hold** (deep) — your hab/workshop. Fully safe. Build, craft, cook, store.
- **The Undercity** (mid) — dead infrastructure between you and the surface. Semi-safe, light loot, the warm-up layer.
- **The Surface** (exposed) — the biomes (§8). Best rewards; where the Concern can *see* you.

---

## 6. Core loop

```
        ┌──────────────────────────────────────────────┐
        │            THE HOLD (deep / safe)            │
        │   build · craft · cook · store · tinker      │
        └───────────────┬──────────────────────────────┘
                        │  gear up (everything carried is at-risk)
                        ▼  ascend
        ┌──────────────────────────────────────────────┐
        │      UNDERCITY ▸ SURFACE (risk rises w/ depth)│
        │   explore · fight · salvage · manage Notice   │
        │     ┌─────────────────────────────────┐       │
        │     │  PUSH farther/higher for better │       │
        │     │      vs.                        │       │
        │     │  DESCEND home with what I have  │       │
        │     └─────────────────────────────────┘       │
        └───────────────┬───────────────┬──────────────┘
              reach the Hold            die on surface
                        │               │
                ▼ bank the haul    ▼ drop carried inventory where you fell
                                     (world persists; recoverable if you go back)
```

The Hold is safe accumulation; the surface is risk. There's no instance menu — it's one world, and "extraction" is simply **getting home**.

---

## 7. The risk model (Depth + Notice)

Two axes, deliberately separate:

**A) Depth — the primary, spatial risk gradient.**
The farther/higher you push from the Hold, the higher the ambient danger tier: tougher enemies, better loot, more Concern presence. This is baked into the map — each region has a **Depth Tier**. The player chooses their risk by *how far they go*, independent of time.

**B) Notice — local, action- and dwell-driven escalation.**
A meter that rises from:
- **Loud actions** — gunfire, heavy armour, cracking vaults, triggering events.
- **Dwelling** — staying in one local area too long. Linger and Notice climbs until the Concern converges (a **repo sweep**: escalating patrols/repo-units bearing down on your position).

Notice **falls** when you keep moving, go quiet (stealth, light armour), or descend. So: *deep = dangerous (spatial); loitering = dangerous (temporal)*. Movement is the release valve. This replaces any flat raid timer.

> Risk dial summary the player feels: **"How far do I push, how loud am I, and am I lingering?"**

---

## 8. Biomes (foreclosed districts)

Each is a place the Concern repossessed, frozen at seizure, rotting under the Static. Distinct feel / enemies / rewards / signature event. (Higher Depth Tier = later in the list, roughly.)

- **Default Row** — repossessed homes; sunlit domestic dread; holographic "residents" still going through the motions. *Enemies:* repo-units, Concern agents. *Rewards:* household tech, personal relics, caches. *Event:* repo sweep.
- **The Scrapsea** — open chrome wasteland, dead vehicles, salvage dunes. *Enemies:* scrap-beasts, rival scavenger NPCs. *Rewards:* bulk materials, weapon parts. *Event:* Static squall (storm) / roaming scrap-titan.
- **The Greenline** — a feral foreclosed vertical farm; bioluminescent overgrowth swallowing neon. *Enemies:* mutated agri-drones, plant-Static hybrids. *Rewards:* organics, bio-mods, rare compounds. *Event:* bloom-surge.
- **The Glittermile** — dead entertainment strip: shuttered casinos, arcades, pleasure-tech. *Enemies:* rogue service-bots, den enforcers. *Rewards:* Chits, luxury mods, cosmetics. *Event:* a field-casino "wakes up." **(The gambling biome.)**
- **The Stacks** — the Concern's server-cathedral; deepest Static, vertiginous, humming. *Enemies:* security constructs, surveillance swarms. *Rewards:* high-tier gadget cores, rare schematics. *Event:* lockdown escalation.
- **The Foreclosed Deep** (endgame) — where the Concern foreclosed on *reality*; physics breaks. The destination for prestige relics and the truly inhuman.

*Data note:* a biome is data — `depth_tier`, `enemy_pool`, `loot_table`, `signature_event`, `ambient/tileset`, `hazard`.

### 8.1 Surface authoring & replayability
Reconciles "persistent contiguous sandbox" with "maximize replayability" by **tying novelty to depth**:
- **The Hold + Undercity are handcrafted and persistent** — learnable home turf. Mastering the geography near home is part of the cozy fantasy.
- **The Surface is persistent in its bones, dynamic in its contents.** Each biome keeps a fixed identity and handcrafted **landmark POIs / titan arenas**, but the connective terrain is procedurally assembled and the **contents reshuffle** — loot, enemy packs, opt-in beacons, field casinos, and Static spread all regenerate.
- **The farther out, the more procedural and unpredictable.** Depth therefore means danger *and* novelty in a single gradient.
- **Cycle turnover (the replay engine):** when you descend and rest at the Hold (a "surfacing" cycle, echoing a farming-sim day), the surface **re-forecloses** — Static shifts, contents respawn, new event/casino placements roll. A fresh run every time, with no instancing.
- **The Foreclosed Deep & deep-tier incursions** can be fully **seeded/procedural per entry** — a roguelike-style endless tail hanging off the persistent world for long-term replay.

---

## 9. Systems breakdown

Each lists **purpose / mechanics / MVP vs Later**.

### 9.1 Extraction & death-loss
- **Purpose:** the spine of the loop. **Death must sting** — that's what makes the risk dial real.
- **Mechanics:** carried inventory is at-risk; the Hold's storage is safe. **Die on the surface → the Concern repossesses your carried haul (hard loss).** The risk dial is **sourcing difficulty**: a cheap-scrap loadout is low-stakes; rare crafted chrome or a deep greed-run wagers something that hurt to get.
- **Partial recovery — the Claim:** back at the Hold you can file a **Claim**, a chance-based roll that returns a *random subset* of what was lost. **Recovery odds scale inversely with rarity** — common materials usually come back; your Masterwork/Relic gear usually doesn't. Death stays punishing on the things you care about without being a total feel-bad. (Later: spend **Grace** to improve odds; a high **Ledger** worsens them.)
- **Optional riskier route — the recovery run:** the death-site cache persists briefly but **decays and draws scavengers/Static**; fight back to it in time for a better return than the Claim. High risk, high reward.
- **MVP:** carry loot, die → haul repossessed → return to the Hold → file a Claim for a rarity-weighted partial refund. **Later:** the recovery-run cache, decay timers, Grace/Ledger odds.

### 9.2 The Hold (home base)
- **Purpose:** the reward sink and reason to survive. **Sim scope = utility, not social** — crafting, upgrades, quality-of-life, and cooking. **No relationships.**
- **Mechanics:** placeable fabrication/crafting stations, storage, base expansion/upgrades; raw salvage → refined parts → gadgets/gear. **Cooking** turns organics/ingredients into **consumables that buff or heal** — pre-run prep becomes part of the loadout decision. **QoL upgrades** (faster crafting, more storage, higher fabrication tiers). Underground fantasy: dig out and fortify your Hold over time. Buildable **mechanical sidekicks** automate the Hold while you're out (§9.12).
- **MVP:** one fab bench + one storage container + ~5 recipes converting salvage into useful gear. **Later:** cooking & buff/heal consumables, base building/placement, QoL upgrades, defenses, sidekick automation, decoration.

### 9.3 Gadgets & itemization (PoE2 system, re-themed to hardware)
- **Modules / Rigs** (= skill gems): physical deployables & weapon attachments — turrets, drones, grapples, shock-nets, flak launchers, cloak rigs, med-injectors.
- **Parts** (= support gems): bolt-ons that modify a Module — bigger battery (more uses), splitter (extra projectile), dampener (quieter → less Notice), overcharger (more power, more heat/wear).
- **Mounting rails** (= sockets) hold Modules/Parts; **wired couplings** (= links) combine wired gadgets' effects.
- **Items = base type + rarity + affixes + rails.** Affixes are rolled prefixes/suffixes from pools. Crafting bench adds/removes/rerolls affixes (the deterministic-ish crafting layer).
- **Aesthetic:** analog retro-futurism — exposed wiring, CRT readouts, handmade jank vs. the Concern's seamless tech.
- **Data sketch:**
  ```jsonc
  Item { id, base_type, rarity, implicit_mods:[Mod], affixes:[Mod], rails:[Rail] }
  Mod  { stat, value, tier, type:"prefix"|"suffix"|"implicit" }
  Rail { module:ModuleRef|null, parts:[PartRef], wired_to:[railIndex] }
  Module { id, deploy_effect, tags:[...], heat, uses }
  Part   { id, modifier_effect, applies_to_tags:[...] }
  ```
- **MVP:** one weapon base + one Module (a single active gadget) + basic combat. **Later:** rarity/affixes, Parts & wiring, crafting currency, uniques, Module leveling.

### 9.4 Liens — the skill tree
- **Purpose:** Diablo/PoE-style allocatable progression, fused to theme.
- **Mechanics:** each node is a **Lien you sign** — power now, cost later. Flat bargains for minor nodes; the strongest are *owed* and periodically come due (a tithe, a debuff window, a price). Branches align with the weapon/armour archetypes (§9.5). Growing stronger visibly chromes you up and deepens what you owe.
- **MVP:** a small linear/branching tree of straightforward stat/utility nodes. **Later:** owed/cost nodes, keystones that warp builds, archetype branches, respec rules.

### 9.5 Weapon & armour classes (build identity)
Gear that *pushes* a playstyle, paired with tree branches:
- **Bruiser** — sledges, riot-rigs, miniguns; slow, tanky, crowd control.
- **Gunslinger** — rifles/pistols; ranged precision, crit.
- **Ghost** — silenced weapons, blades, cloak gadgets; stealth, burst, **Notice management**.
- **Tinker** — drones, turrets, traps; engineer/summoner.
- **Brawler** — shock gauntlets, batons; close, mobile, on-hit effects.

Armour in **Light / Medium / Heavy** — trading mobility-and-stealth vs. defense (**Heavy is loud → raises Notice**). **Set bonuses** reward committing to an archetype.
- **MVP:** 1–2 weapon types, one armour slot, no sets. **Later:** full classes, Light/Med/Heavy, set bonuses.

### 9.6 Combat & enemies
- **MVP:** real-time top-down combat; one attack driven by the equipped Module/weapon; player health + death; 1–2 enemy types with chase/attack AI scaled by Depth Tier. **Later:** enemy variety per biome, elites, **foreclosure-titans** (biome bosses), status effects, damage types tied to affixes.

### 9.7 Opt-in scaling events
- **Purpose:** the purest expression of risk/reward — the player **starts** them and **sets how far to push**.
- **Forms:**
  - **Answer the Call** — a beacon summons escalating waves; each cleared tier ups loot *and* next-tier difficulty, with a **bank-or-push checkpoint** between rounds (a horde mode you can cash out of).
  - **Break the Lien** — crack a sealed vault; deeper layers = better contents but spike Notice.
  - **Into the Squall** — wade into a Static surge for corruption-touched materials; deeper = worse = rarer.
  - **Wager-contracts** — a terminal offers a payout for accepting a handicap (no gadgets / half health / a timer).
- **Model:** **tiered dials (1–5)**, each multiplying threat and reward, most with a cash-out point. *Later:* spend Grace (§9.10) to unlock higher tiers.
- **MVP:** one event — recommend **Answer the Call** (beacon → 3 waves → cash-out). **Later:** the rest, plus tier scaling.

### 9.8 Field casinos & black markets
- **Purpose:** mobile temptation — the Concern's "mouths" out in the dead zones.
- **Mechanics:** randomly encountered and **transient** (a neon tram, a parlor behind a foreclosed storefront, a fixer's rig) — they appear, move, vanish, restock. At one you can: **gamble your current haul mid-run** (max tension — that's the stuff you came to extract), **buy black-market gear** (rare, marked-up, sometimes "flagged" → carrying it raises Notice), and **pull** (§9.9). Recurring NPC hosts give the polite-predator horror a face.
- **MVP:** none (defer). **Later:** spawn/despawn logic, host NPCs, buy/sell, mid-run gambling.

### 9.9 The pull (gacha — in-game currency ONLY)
- **Purpose:** a tactile, dangerous **loot-sink spectacle**. **No real-money purchases, ever** — runs on an earned in-game currency (placeholder: **Chits**), gained by feeding junk salvage into the machines, winning at the den, and rare drops.
- **Mechanics:** physical, chunky minigames — capsule machines with levers, weighty slot reels, a claw dispenser, a fate-wheel, card-flips — each with escalating light/sound, **near-miss** beats, and building rarity reveals. Pulls yield gadget blueprints, mod parts, cosmetics, and rarely high-tier/unique gear, on rotating **banners** (themed to biomes/events) with an earned **pity** guarantee. Thematically: the Concern *wants* you pulling — addiction-by-design — and the game lets you indulge it knowingly. (Non-didactic edge.)
- **MVP:** optionally one simple tactile minigame if time allows; otherwise defer. **Later:** full banner/pity/Chits economy and multiple machines.

### 9.10 Economy & luck meta (deferred layer)
- **Grace** — a buyable probability resource: burn to reroll loot, sway a wager, buy a safer extract. Spending/borrowing grows your **Ledger** (debt); a high Ledger tilts the world's odds against you (your debt becomes a difficulty curve).
- **The den / dynamic trading** — fluctuating trader prices, arbitrage, reputation; clear enough Ledger to slip the leash.
- **MVP:** flat currency + one seller only. **Later:** Grace, the Ledger, the den, dynamic pricing.

### 9.11 Prestige & endgame chase (the big goals)
- **Rarity ladder:** **Scrap → Standard → Modified → Masterwork → Relic (uniques) → Heirloom (mythic, build-defining, vanishingly rare).**
- **Marquee chase items:** named, build-warping legends — e.g. a Relic that ignores Concern lockdowns; an Heirloom rig that **turns Notice into power**.
- **Long arcs:** biome **foreclosure-titans**, reaching the **Foreclosed Deep**, fortressing the Hold, and going **off-grid** (clearing enough Ledger to escape the Concern for good).
- **MVP:** a simple rarity tier on drops. **Later:** the full ladder, titans, named uniques, endgame zone.

### 9.12 Mechanical sidekicks (base automation)
- **Purpose:** a build-toward goal that makes progress happen *while you raid*, plus the cozy "factory" layer — no relationship sim, just machines you make and improve.
- **Mechanics:** craft **mechanical companions** from salvage + schematics (cyberpunk-flavored bots/automata/drones). Assign each a **Hold job** that runs while you're on the surface:
  - auto-refine raw salvage into parts,
  - run crafting/fabrication queues,
  - tend hydroponics / grow organics for cooking,
  - **guard the Hold** against Undercity incursions,
  - scavenge the Undercity for passive materials/Chits.
- Upgradeable (speed, capacity, smarts); cosmetic personality without any social mechanics.
- **Optional hook:** some sidekick types can be **field-deployed** on the surface as Tinker-style drones/turrets (§9.5), bridging base automation and combat builds.
- **MVP:** none (defer). **Later:** 1–2 sidekick types with one job each, then the full roster, upgrades, and field-deployable variants.

---

## 10. Architecture notes (Godot 4)

- **Data-driven everything.** Items, Modules, Parts, affixes, recipes, biomes, enemies, events, loot tables as Godot `Resource` (`.tres`) or JSON — so content is added via data, not code.
- **`GameState` autoload** holds persistent stash, currency, unlocks, Notice, and **world-state deltas** (dropped caches, opened vaults, defeated titans).
- **Contiguous world**, not instances: a tile-based world (TileMap) with **regions tagged by `depth_tier`** and **safe/unsafe flags**. The Hold is a persistent safe scene contiguous (or seamlessly linked) to the Undercity and Surface.
- **Persistence is load-bearing:** save the stash, the Hold's built state, and surface mutations (opened vaults, defeated titans, surface cycle state). Build the save system in Phase 0.
- **Notice as a system/service** reading region depth tier + recent loud actions + dwell timer, driving enemy spawn/escalation.

---

## 11. ⭐ MVP / Vertical Slice — BUILD THIS FIRST

Goal: a tiny, complete, *fun* loop. Build strictly in order; each phase playable before the next.

- [ ] **Phase 0 — Skeleton:** Godot project; tile world; player movement + collision; camera follow; **save/load** of stash + world deltas (stub ok).
- [ ] **Phase 1 — Vertical world:** the **Hold** (safe) + a stretch of **Undercity** + one **Surface** biome (**Default Row**), contiguous, with **Depth Tiers** (enemies/loot scale with distance from the Hold).
- [ ] **Phase 2 — Extraction core:** salvage on the surface → return to the Hold to bank it. **Die on the surface → the Concern repossesses your carried haul (hard loss); respawn at the Hold; then file a Claim for a rarity-weighted partial refund.** The world persists. *(This is the heartbeat — make it feel good before anything else.)*
- [ ] **Phase 3 — Combat:** one weapon + one **Module** (single active gadget); player health; 1–2 enemy types scaled by Depth Tier.
- [ ] **Phase 4 — Hold payoff:** fab bench + storage + ~5 recipes turning salvage into a useful gadget/upgrade.
- [ ] **Phase 5 — Notice & dwell:** loud actions + lingering raise **Notice** → a **repo sweep** converges on you; moving/descending bleeds it off.
- [ ] **Phase 6 — First risk hook:** **Answer the Call** beacon — 3 escalating waves with a bank-or-push checkpoint and a cash-out.

**"Slice done" = ** a player can ascend from the Hold, fight and salvage, feel danger rise with depth, get punished for loitering, decide to push or descend, bank loot, craft with it, run an opt-in event for more — and *want to go again*. If that's fun, the rest is content and depth.

---

## 12. Build order beyond the slice (rough priority)

rarity & affixes → Parts & wiring → the **Liens** tree → **cooking & buff/heal consumables** → **mechanical sidekicks** (base automation) → more biomes & **foreclosure-titans** → **surface cycle-turnover + procedural far-out** (the replayability engine, §8.1) → weapon/armour **classes + Light/Med/Heavy + sets** → **field casinos + the pull** (Chits/banners/pity) → the **recovery-run** death-cache + **Grace / Ledger / the den** + dynamic trading → prestige ladder (Relic/Heirloom) → **the Foreclosed Deep** endgame.

> **Scope honesty (first-time dev note):** this is a large game. The win condition for the first month is *the Phase-2 loop feeling good* — not breadth. Resist adding systems until the core trip-and-return is fun. Everything in §9 is designed to bolt onto that core later without re-architecting, *if* §10's data-driven approach is followed from the start.

---

## 13. Decisions resolved this session

- **Perspective:** true top-down (chosen for combat feel).
- **Surface authoring:** persistent near-home + procedural/reshuffling far-out with cycle turnover (§8.1).
- **Names:** placeholders accepted as-is (the Concern, the Static, Chits, Grace, the Hold, the Arrears).
- **Death recovery:** hard loss via repossession + rarity-weighted chance-based **Claim**, with an optional risky recovery run (§9.1).
- **Hold sim:** crafting / upgrades / QoL + cooking for buffs & heals + mechanical sidekicks; **no relationships** (§9.2, §9.12).

**Nothing currently blocks the build.** Remaining choices are tuning details — the Claim odds curve, cache decay timers, surfacing-cycle length — best settled in playtesting.
