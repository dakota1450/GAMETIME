/* ============================================================
   THE PACT — DATA LAYER
   Per spec §10: items, biomes, loot tables, enemies, recipes,
   gadgets are all DATA. Tune the game here; the engine reads it.

   WORLD MODEL (v2): a central safe Hold compound; you exit any of
   4 doorways into a distinct biome per direction (spec §8). Danger
   is set by which district you enter (+ pushing farther within it).
   ============================================================ */
(function (P) {
  "use strict";

  const data = {};

  /* ---- World geometry (tiles) ---- */
  data.world = {
    TILE: 32,
    COLS: 220, ROWS: 220,      // big open sandbox to explore (square = symmetric)
    seedBase: 1337,
    compound: { halfW: 13, halfH: 10, door: 2 }, // roomy home, 5-wide doorways
    zoom: 2.0,                 // camera zoom — Core-Keeper close-up feel
  };

  /* ---- The safe home ---- */
  data.home = {
    name: "THE HOLD", safe: true,
    floor: "#1c1812", floorAlt: "#221c14", wall: "#0e0b07",
    accent: "#ffb347", blurb: "SAFE HAVEN",
  };

  /* ---- The Undercity (spec §5.4): semi-safe ring between the Hold and the
     surface districts. Dead infrastructure, light loot, weak enemies — the
     warm-up layer. Danger ramps up as you push out toward the biomes. ---- */
  data.undercity = {
    name: "THE UNDERCITY", semi: true,
    floor: "#1b1e24", floorAlt: "#23272e", wall: "#0e1014",
    accent: "#9fb0c4", blurb: "DEAD INFRASTRUCTURE", mood: "#2a2e38",
    enemies: [["repo_drone", 12]],   // sparse, weak
    chestCount: 9, cover: 0.035,
  };

  /* ---- Biomes (one per cardinal direction, spec §8) ----
     dir is decided by angle from home. Each has a fixed danger tier,
     a palette, an enemy pool, and chest density. Pushing into the
     OUTER half of a biome bumps loot richness (push-deeper tension). */
  data.biomes = {
    north: {
      dir: "N", name: "DEFAULT ROW", tier: 1, blurb: "REPOSSESSED HOMES",
      floor: "#14181e", floorAlt: "#181d24", wall: "#0a0e16", accent: "#6ea8ff",
      mood: "#1e283c", motes: { col: "#8fb4ff", rise: -6, drift: 10, count: 26, size: 1.4, kind: "dust" },
      enemies: [["repo_drone", 16], ["repo_unit", 8]],
      chestCount: 26, cover: 0.05,
    },
    east: {
      dir: "E", name: "THE SCRAPSEA", tier: 2, blurb: "CHROME WASTELAND",
      floor: "#1d1813", floorAlt: "#241d15", wall: "#120c07", accent: "#e0a36b",
      mood: "#382818", motes: { col: "#e8b06a", rise: -2, drift: 46, count: 30, size: 1.6, kind: "dust" },
      enemies: [["scrap_hound", 15], ["repo_unit", 9]],
      chestCount: 26, cover: 0.08,
    },
    south: {
      dir: "S", name: "THE GREENLINE", tier: 2, blurb: "FERAL VERTICAL FARM",
      floor: "#121d16", floorAlt: "#16231b", wall: "#08120b", accent: "#6fe0a0",
      mood: "#163420", motes: { col: "#9bf0a8", rise: -16, drift: 8, count: 34, size: 1.8, kind: "spore" },
      enemies: [["spore_pod", 9], ["static_hybrid", 13]],
      chestCount: 26, cover: 0.10,
    },
    west: {
      dir: "W", name: "THE STACKS", tier: 3, blurb: "SERVER-CATHEDRAL",
      floor: "#171426", floorAlt: "#1e1934", wall: "#0c0a18", accent: "#c084fc",
      mood: "#2c1c40", motes: { col: "#c9a6ff", rise: 22, drift: 4, count: 30, size: 1.5, kind: "data" },
      enemies: [["sec_construct", 9], ["repo_enforcer", 13]],
      chestCount: 30, cover: 0.07,
    },
    // The Glittermile sits in a narrow NE diagonal wedge (no floor PNG — drawn as a
    // neon dancefloor procedurally). Dead entertainment strip: the gambling district.
    glitter: {
      dir: "NE", name: "THE GLITTERMILE", tier: 2, blurb: "DEAD ENTERTAINMENT STRIP",
      floor: "#1b1226", floorAlt: "#241734", wall: "#100a18", accent: "#ff5ea8",
      mood: "#3a1838", motes: { col: "#ff8fd0", rise: -4, drift: 16, count: 34, size: 1.7, kind: "spark" },
      enemies: [["repo_unit", 12], ["sec_construct", 8]],   // rogue service-bots + den enforcers
      chestCount: 32, cover: 0.05,
    },
  };

  /* ---- Rarity ladder (spec §9.11, slimmed for the slice) ---- */
  data.rarity = {
    common:    { name: "Common",    color: "#9fb0c4", claimChance: 0.85 },
    uncommon:  { name: "Uncommon",  color: "#5ad88a", claimChance: 0.55 },
    rare:      { name: "Rare",      color: "#6ea8ff", claimChance: 0.28 },
    epic:      { name: "Epic",      color: "#c084fc", claimChance: 0.12 },
  };
  data.rarityOrder = ["common", "uncommon", "rare", "epic"];

  /* ---- Items (salvage + crafted consumables) ---- */
  data.items = {
    scrap:   { name: "Scrap",          rarity: "common",   value: 1,  color: "#9fb0c4" },
    wiring:  { name: "Wiring",         rarity: "common",   value: 2,  color: "#caa46b" },
    cells:   { name: "Power Cells",    rarity: "uncommon", value: 5,  color: "#5ad88a" },
    alloy:   { name: "Alloy Plate",    rarity: "uncommon", value: 6,  color: "#7fd0ff" },
    relic:   { name: "Household Relic",rarity: "rare",     value: 18, color: "#6ea8ff" },
    core:    { name: "Gadget Core",    rarity: "rare",     value: 24, color: "#b48cff" },
    chrome:  { name: "Concern Chrome", rarity: "epic",     value: 60, color: "#c084fc" },
    seed:    { name: "Spore Seed",     rarity: "uncommon", value: 4,  color: "#9be38a" },
    organics:{ name: "Organics",       rarity: "uncommon", value: 7,  color: "#6fe0a0" },
    medpatch:{ name: "Med-Patch",      rarity: "uncommon", value: 0,  color: "#ff8aa0", consumable: true },
    // biome-signature materials (mined from district nodes — see data.mining)
    plating: { name: "Salvaged Plating", rarity: "common",   value: 3,  color: "#b8c0cc" },
    biomass: { name: "Raw Biomass",      rarity: "uncommon", value: 5,  color: "#7fd89a" },
    crystal: { name: "Data-Crystal",     rarity: "rare",     value: 20, color: "#c084fc" },
  };

  /* ---- Mining: destructible nodes per district (spec §5.3 "strip the zone") ----
     Each biome has node kinds you break with a cutter (or shoot through). Node
     hardness must be <= your tool's power to mine; drops are biome-signature. */
  data.mining = {
    north: { density: 0.045, nodes: [
      { kind: "rubble",  color: "#6b6f78", hp: 18, hardness: 1, glow: false, drops: [["scrap", [1, 2]], ["plating", [0, 1]]] },
      { kind: "conduit", color: "#8a6a3a", hp: 22, hardness: 1, glow: false, drops: [["wiring", [1, 2]], ["plating", [0, 1]]] },
    ] },
    east: { density: 0.075, nodes: [
      { kind: "scrapheap", color: "#7a5a36", hp: 24, hardness: 1, glow: false, drops: [["scrap", [2, 3]], ["alloy", [0, 1]]] },
      { kind: "hull",      color: "#5a6a72", hp: 42, hardness: 2, glow: false, drops: [["alloy", [1, 2]], ["chrome", [0, 1]]] },
    ] },
    south: { density: 0.07, nodes: [
      { kind: "overgrowth", color: "#3f7048", hp: 16, hardness: 1, glow: false, drops: [["organics", [1, 2]], ["seed", [0, 1]]] },
      { kind: "bloom",      color: "#6fe0a0", hp: 26, hardness: 1, glow: true,  drops: [["biomass", [1, 2]], ["organics", [1, 1]]] },
    ] },
    west: { density: 0.055, nodes: [
      { kind: "rack",    color: "#5a3f82", hp: 30, hardness: 1, glow: false, drops: [["cells", [1, 2]], ["core", [0, 1]]] },
      { kind: "crystal", color: "#c084fc", hp: 36, hardness: 2, glow: true,  drops: [["crystal", [1, 2]], ["cells", [0, 1]]] },
    ] },
    glitter: { density: 0.05, nodes: [
      { kind: "slots",   color: "#c0408a", hp: 24, hardness: 1, glow: true,  drops: [["cells", [1, 2]], ["wiring", [1, 2]]] },
      { kind: "marquee", color: "#ffcf6b", hp: 30, hardness: 1, glow: true,  drops: [["chrome", [0, 1]], ["cells", [1, 1]]] },
    ] },
    // building walls (breachable) — same in every district
    _wall: { kind: "wall", color: "#3a3a44", hp: 30, hardness: 1, glow: false, drops: [["scrap", [1, 2]], ["plating", [0, 1]]] },
    // packed earth/rock walls the Hold is dug out of — mine to expand your den
    _earth: { kind: "earth", color: "#2e2317", hp: 22, hardness: 1, glow: false, drops: [["scrap", [1, 2]], ["plating", [0, 1]]] },
  };

  /* ---- Mining tools (spec: "specific tool and tools for this") ---- */
  data.tools = {
    cutter: { name: "Salvage Cutter", power: 1, dmg: 10, cooldown: 0.34, reach: 50 },
    plasma: { name: "Plasma Cutter",  power: 2, dmg: 19, cooldown: 0.26, reach: 56 },
  };

  /* ---- Ground decor (Core Keeper-style scattered clutter "above the ground") ----
     Non-colliding props densely scattered on the floor per region; `glow` marks
     emissive ones (they light the dark). Tall props (decorTall) BLOCK movement —
     real obstacles you navigate around. */
  data.decor = {
    grass:    { sprite: "decor_grass",    scale: 22, regions: ["south", "north", "undercity", "hold"] },
    mushroom: { sprite: "decor_mushroom", scale: 20, regions: ["south", "undercity", "hold", "west"] },
    flower:   { sprite: "decor_flower",   scale: 20, glow: [111, 224, 160], regions: ["south"] },
    pebbles:  { sprite: "decor_pebbles",  scale: 18, regions: ["north", "east", "undercity", "west", "hold", "glitter"] },
    bones:    { sprite: "decor_bones",    scale: 19, regions: ["north", "east", "west"] },
    shrub:    { sprite: "decor_shrub",    scale: 24, regions: ["north", "undercity", "south"] },
    scrap:    { sprite: "decor_scrap",    scale: 21, regions: ["east", "undercity", "north", "glitter"] },
    crystal:  { sprite: "decor_crystal",  scale: 22, glow: [192, 132, 252], regions: ["west", "glitter"] },
  };
  data.decorTall = {
    boulder: { sprite: "decor_boulder", scale: 42, regions: ["north", "east", "west", "undercity"] },
    pillar:  { sprite: "decor_pillar",  scale: 46, regions: ["west", "north", "east"] },
  };
  data.decorCount = 2600;        // ground props scattered per cycle (culled at render)
  data.decorTallCount = 120;     // solid obstacles

  /* ---- Biome signature props: large, procedurally-drawn landmarks that give
     each district its silhouette (spec §8 distinct feel). Placed per cycle,
     drawn in world.js by `kind`. Solid ones block; glow ones light the dark. ---- */
  data.bigProps = {
    north: { kind: "holo",       count: 16, solid: false, glow: [120, 165, 255] }, // residents still going through the motions
    east:  { kind: "hulk",       count: 16, solid: true },                          // dead vehicles in the chrome waste
    south:   { kind: "shroomtree", count: 20, solid: true,  glow: [120, 240, 150] }, // bioluminescent farm growth
    west:    { kind: "rack",       count: 20, solid: true,  glow: [180, 140, 255] }, // server-cathedral racks
    glitter: { kind: "arcade",     count: 18, solid: true,  glow: [255, 110, 200] }, // dead arcade cabinets
  };

  /* ---- Liens — the skill tree (spec §9.4). Earn Lien Points from kills,
     sign them into nodes for permanent power. 3 branches, prereq chains. ---- */
  data.skillXpCost = 7;          // enemy xpChits needed per Lien Point
  data.skillBranches = ["VITALITY", "FIREPOWER", "TINKER"];
  data.skills = {
    vit1: { name: "Toughened",    branch: 0, row: 0, cost: 1, req: null,  eff: { maxHp: 20 },        desc: "+20 Max Vitality" },
    vit2: { name: "Field Mend",   branch: 0, row: 1, cost: 2, req: "vit1", eff: { regen: 9 },         desc: "Faster Hold healing" },
    vit3: { name: "Second Wind",  branch: 0, row: 2, cost: 3, req: "vit2", eff: { maxHp: 35 },        desc: "+35 Max Vitality" },
    fir1: { name: "Hot Rounds",   branch: 1, row: 0, cost: 1, req: null,  eff: { dmg: 3 },           desc: "+3 Weapon Damage" },
    fir2: { name: "Rapid Cycle",  branch: 1, row: 1, cost: 2, req: "fir1", eff: { fireCdMul: 0.88 },  desc: "-12% Fire Cooldown" },
    fir3: { name: "Overcharge",   branch: 1, row: 2, cost: 3, req: "fir2", eff: { dmg: 6 },           desc: "+6 Weapon Damage" },
    tnk1: { name: "Deep Pockets", branch: 2, row: 0, cost: 1, req: null,  eff: { backpack: 12 },     desc: "+12 Backpack" },
    tnk2: { name: "Power Cutter", branch: 2, row: 1, cost: 2, req: "tnk1", eff: { mineMul: 1.5 },     desc: "+50% Mining Damage" },
    tnk3: { name: "Capacitor",    branch: 2, row: 2, cost: 2, req: "tnk1", eff: { pulseCd: 1.0 },     desc: "-1.0s Shock Pulse cooldown" },
  };

  /* ---- Cooking & buff consumables (spec §12 #4) ----
     Cook salvage/grown ingredients into RATIONS at the Cookfire; each cook
     yields a few portions you carry safely. Eating a portion (mess-kit hotkey
     1-5, or the Cookfire) applies a TIMED buff — prep before a run, or refuel
     mid-raid. `eff` fields feed systems.recomputeBuffs -> G.buffBonus:
       dmg (+weapon dmg) · fireCdMul (×fire cooldown) · moveMul (×speed) ·
       resist (incoming dmg ×(1-r)) · regen (HP/s anywhere) ·
       noticeMul (×Notice gain) · mineMul (×mining damage).
     Re-eating refreshes the same buff's timer (no infinite stacking). */
  data.cooking = [
    { id: "gruel", name: "Mire Gruel",     short: "Gruel", color: "#7fd89a",
      desc: "Heal 30, then regenerate 6 VIT/s for 28s",
      cost: { organics: 3 },           portions: 2, heal: 30, dur: 28, eff: { regen: 6 } },
    { id: "brew",  name: "Stim Brew",      short: "Brew",  color: "#ff9a5a",
      desc: "+6 Damage & +18% Fire Rate for 32s",
      cost: { cells: 2, wiring: 3 },   portions: 2,           dur: 32, eff: { dmg: 6, fireCdMul: 0.82 } },
    { id: "plate", name: "Plated Rations", short: "Plate", color: "#b8c0cc",
      desc: "Take 30% less damage for 36s",
      cost: { plating: 4, scrap: 4 },  portions: 2,           dur: 36, eff: { resist: 0.30 } },
    { id: "tonic", name: "Spore Tonic",    short: "Tonic", color: "#6fe0a0",
      desc: "+18% Move & -40% Notice for 28s",
      cost: { biomass: 3, organics: 2 },portions: 2,          dur: 28, eff: { moveMul: 1.18, noticeMul: 0.6 } },
    { id: "oil",   name: "Cutter Oil",     short: "Oil",   color: "#ffcf6b",
      desc: "+80% Mining speed for 40s",
      cost: { alloy: 2, wiring: 2 },   portions: 3,           dur: 40, eff: { mineMul: 1.8 } },
  ];

  /* ---- Mechanical sidekicks: Hold automation (spec §9.12) ----
     Craft a bot at the Fab Bench; it works a Hold job every cycle (each REST)
     while you're out raiding — progress happens while you're away. `yield` is
     deposited straight to safe storage; `consume` (if any) is feedstock it needs
     or it idles that cycle. The cozy "factory" layer (no relationship sim). */
  data.sidekicks = {
    scavenger: { name: "Scrap-Picker Bot", color: "#caa46b", job: "Scavenges the Undercity",
      desc: "Each cycle: deposits Scrap & Wiring to storage",
      cost: { scrap: 10, wiring: 8, cells: 2 }, yield: { scrap: [2, 4], wiring: [1, 3] } },
    tender:    { name: "Garden-Tender Bot", color: "#6fe0a0", job: "Tends the hydroponics",
      desc: "Each cycle: grows Organics into storage",
      cost: { wiring: 6, organics: 5, cells: 3 }, yield: { organics: [2, 4] } },
    refiner:   { name: "Foundry Unit",      color: "#7fd0ff", job: "Refines raw salvage",
      desc: "Each cycle: consumes Scrap → forges Alloy Plate",
      cost: { alloy: 5, cells: 5, core: 1 }, consume: { scrap: 6 }, yield: { alloy: [1, 2] } },
  };
  data.sidekicksOrder = ["scavenger", "tender", "refiner"];

  /* ---- Hold farming (spec §9.2 hydroponics; the "grow" verb) ---- */
  data.farm = { growTime: 2, yield: [3, 5] };  // rests to mature; organics per harvest

  /* ---- Death-site cache (spec §9.1 the recovery run) ----
     On death your carried haul drops where you fell instead of vanishing.
     Walk back and recover it for a full return; if you rest first (cycle
     turnover re-forecloses the districts) the Concern collects it and it
     falls back to the rarity-weighted Claim. */
  data.deathCache = { recoverRadius: 46, recoverNotice: 8 };

  /* ---- Gear: droppable weapon instances (spec §9.3 itemization, §9.11 ladder) ----
     A gear item = base type + rarity + rolled affixes. Salvage materials keep
     their own grades (data.rarity); this 6-tier ladder is the GEAR rarity. */
  data.gearRarity = {
    scrap:      { name: "Scrap",      color: "#9fb0c4", affixes: [0, 1], weight: 46,  claimChance: 0.80 },
    standard:   { name: "Standard",   color: "#cfe0d0", affixes: [1, 1], weight: 30,  claimChance: 0.60 },
    modified:   { name: "Modified",   color: "#5ad88a", affixes: [1, 2], weight: 15,  claimChance: 0.42 },
    masterwork: { name: "Masterwork", color: "#6ea8ff", affixes: [2, 3], weight: 6.5, claimChance: 0.24 },
    relic:      { name: "Relic",      color: "#c084fc", affixes: [3, 3], weight: 2.0, claimChance: 0.12 },
    heirloom:   { name: "Heirloom",   color: "#ffb347", affixes: [4, 4], weight: 0.5, claimChance: 0.05 },
  };
  data.gearRarityOrder = ["scrap", "standard", "modified", "masterwork", "relic", "heirloom"];

  // Weapon base types. `base` mirrors player.weapon fields; projCount = pellets/shot.
  // `rails` = number of mounting sockets (spec §9.3) — how many Parts you can bolt on.
  data.gearBases = {
    pistol:      { name: "Salvaged Pistol", slot: "weapon", rails: 2, base: { damage: 12, cooldown: 0.26, projSpeed: 560, projLife: 0.74, projRadius: 4, projCount: 1, knockback: 0 } },
    carbine:     { name: "Scrap Carbine",   slot: "weapon", rails: 2, base: { damage: 8,  cooldown: 0.15, projSpeed: 620, projLife: 0.70, projRadius: 3, projCount: 1, knockback: 0 } },
    scattergun:  { name: "Scattergun",      slot: "weapon", rails: 2, base: { damage: 7,  cooldown: 0.52, projSpeed: 500, projLife: 0.42, projRadius: 4, projCount: 3, knockback: 90 } },
    slugthrower: { name: "Slugthrower",     slot: "weapon", rails: 1, base: { damage: 26, cooldown: 0.62, projSpeed: 480, projLife: 0.80, projRadius: 6, projCount: 1, knockback: 160 } },
  };

  /* ---- Parts: bolt-on weapon modifiers (spec §9.3 "Parts = support gems") ----
     You fabricate Parts at the Fab Bench, then slot them into an equipped
     weapon's mounting rails (LOADOUT view). `mods` use the same op grammar as
     affixes (add / mulDown / mulUp); they stack on top of the rolled affixes.
     Parts are swappable — pull one and it returns to your kit. This is the
     player-driven, modular half of itemization (affixes are the rolled half). */
  data.parts = {
    splitter:    { name: "Splitter",     color: "#6ea8ff", desc: "+1 Projectile",
                   mods: [{ stat: "projCount", op: "add", value: 1 }], cost: { wiring: 4, cells: 2 } },
    overcharger: { name: "Overcharger",  color: "#ff7a8a", desc: "+5 Damage · louder (+Notice)",
                   mods: [{ stat: "damage", op: "add", value: 5 }, { stat: "noticeMul", op: "mulUp", value: 0.35 }], cost: { cells: 3, alloy: 2 } },
    dampener:    { name: "Dampener",     color: "#9fb0c4", desc: "-35% Notice on fire",
                   mods: [{ stat: "noticeMul", op: "mulDown", value: 0.35 }], cost: { wiring: 5 } },
    longbarrel:  { name: "Long Barrel",  color: "#7fd0ff", desc: "+Projectile Speed & +40% Range",
                   mods: [{ stat: "projSpeed", op: "add", value: 140 }, { stat: "projLife", op: "mulUp", value: 0.4 }], cost: { alloy: 3, wiring: 3 } },
    heavyrounds: { name: "Heavy Rounds", color: "#e0a36b", desc: "+Knockback & +3 Damage · slower",
                   mods: [{ stat: "knockback", op: "add", value: 220 }, { stat: "damage", op: "add", value: 3 }, { stat: "cooldown", op: "mulUp", value: 0.18 }], cost: { alloy: 4, cells: 2 } },
  };
  data.partsOrder = ["splitter", "overcharger", "dampener", "longbarrel", "heavyrounds"];

  /* ---- Modules: deployable gadgets (spec §9.3 "Modules/Rigs = skill gems") ----
     The Shock Pulse is an instant Module; these are PLACED in the world and act
     on their own. Unlock one at the Fab Bench, then deploy it in the field with
     [R] on a cooldown. `deploy` describes the spawned device's behaviour. */
  data.modules = {
    turret: {
      name: "Salvage Turret", color: "#6ea8ff",
      desc: "Deploy an auto-turret that guns down nearby enemies for a while",
      cooldown: 14,
      deploy: { kind: "turret", life: 10, range: 250, fireCd: 0.45, damage: 9, projSpeed: 540, projLife: 0.72, projRadius: 4, hp: 40 },
    },
  };

  /* ---- Unique Relics & Heirlooms (spec §9.3/§9.11 "marquee chase items") ----
     Named, build-defining weapons that can roll INSTEAD of a random affixed item
     at Relic/Heirloom rarity. Their power is fixed `mods` (affix grammar) plus a
     code-level `special` effect wired in systems.js. The prestige chase — felling
     titans and the casino pity-pull are the main delivery paths. ---- */
  data.uniques = {
    redledger:  { name: "The Red Ledger", base: "pistol",      rarity: "heirloom",
      mods: [{ stat: "damage", op: "add", value: 6 }, { stat: "cooldown", op: "mulDown", value: 0.15 }],
      special: { noticeScaleDmg: 0.28 }, text: "Damage rises with your Notice — your debt, weaponised",
      flavor: "It reads your balance and bills the whole room." },
    severance:  { name: "The Severance", base: "slugthrower",  rarity: "heirloom",
      mods: [{ stat: "damage", op: "add", value: 14 }, { stat: "projSpeed", op: "add", value: 120 }],
      special: { pierce: true }, text: "Rounds pierce through every enemy in line",
      flavor: "It cuts the cord between you and them." },
    quietus:    { name: "Quietus", base: "carbine",            rarity: "relic",
      mods: [{ stat: "damage", op: "add", value: 3 }, { stat: "noticeMul", op: "mulDown", value: 0.85 }],
      special: {}, text: "Near-silent fire — barely registers on the Notice grid",
      flavor: "The quiet part, said out loud." },
    deadhand:   { name: "Deadhand", base: "scattergun",        rarity: "relic",
      mods: [{ stat: "projCount", op: "add", value: 2 }, { stat: "knockback", op: "add", value: 200 }, { stat: "damage", op: "add", value: 2 }],
      special: {}, text: "A wall of pellets that throws everything back",
      flavor: "Foreclosure, delivered by hand." },
    overdraft:  { name: "Overdraft", base: "pistol",           rarity: "relic",
      mods: [{ stat: "projCount", op: "add", value: 1 }, { stat: "cooldown", op: "mulDown", value: 0.22 }],
      special: {}, text: "Spends rounds faster than you can afford",
      flavor: "Pay it back later. Always later." },
  };

  // Affix pools. Each affix rolls one band of `tiers[]`; gear rarity sets the band.
  // op: add (additive) · mulDown (×(1-v)) · mulUp (×(1+v)). pct → label shows v×100.
  data.affixes = {
    prefix: [
      { id: "honed",    stat: "damage",     op: "add",     label: "+{v} Damage",            tiers: [2, 4, 7, 11] },
      { id: "highcal",  stat: "projSpeed",  op: "add",     label: "+{v} Projectile Speed",  tiers: [60, 110, 170, 240] },
      { id: "heavy",    stat: "projRadius", op: "add",     label: "+{v} Projectile Size",   tiers: [1, 2, 3, 4] },
      { id: "forked",   stat: "projCount",  op: "add",     label: "+{v} Projectile",        tiers: [1, 1, 2, 2] },
    ],
    suffix: [
      { id: "rapid",    stat: "cooldown",   op: "mulDown", label: "-{p}% Fire Cooldown",    tiers: [0.08, 0.14, 0.20, 0.28], pct: true },
      { id: "shoving",  stat: "knockback",  op: "add",     label: "+{v} Knockback",         tiers: [80, 150, 230, 330] },
      { id: "muffled",  stat: "noticeMul",  op: "mulDown", label: "-{p}% Notice on fire",   tiers: [0.15, 0.25, 0.40, 0.55], pct: true },
      { id: "longshot", stat: "projLife",   op: "mulUp",   label: "+{p}% Projectile Range", tiers: [0.15, 0.30, 0.50, 0.80], pct: true },
    ],
  };

  /* ---- Loot tables per tier (weighted). Higher tiers skew richer. ---- */
  data.loot = {
    1: { rolls: [1, 2], table: [["scrap", 50], ["wiring", 35], ["cells", 12], ["alloy", 6]] },
    2: { rolls: [1, 3], table: [["scrap", 32], ["wiring", 30], ["cells", 20], ["alloy", 12], ["relic", 5], ["core", 3], ["seed", 7]] },
    3: { rolls: [2, 4], table: [["scrap", 18], ["wiring", 18], ["cells", 22], ["alloy", 20], ["relic", 12], ["core", 8], ["chrome", 2], ["seed", 5]] },
  };

  /* ---- Loot sourcing rules ----
     Loot ONLY comes from killed enemies and opened chests (no free nodes). */
  data.loot_rules = {
    enemyDropRolls: [1, 1],   // each kill drops ~1 item from its tier table
    chestRolls: [2, 4],       // a chest is a burst; tier comes from where it sits
    chestLockRadius: 195,     // chest stays locked while an enemy is this close
    pickupMagnet: 78,         // ground loot drifts toward you within this range
    pickupCollect: 18,        // and is collected within this range
  };

  /* ---- Enemies (chase + contact damage). `shape` drives the silhouette. ---- */
  data.enemies = {
    repo_drone:    { name: "Repo Drone",    tier: 1, hp: 22,  speed: 66,  touchDmg: 6,  radius: 12, color: "#7fae9f", aggro: 270, xpChits: 1, shape: "triangle", behavior: "chase" },
    repo_unit:     { name: "Repo Unit",     tier: 2, hp: 46,  speed: 74,  touchDmg: 11, radius: 14, color: "#6ea8ff", aggro: 320, xpChits: 2, shape: "diamond",  behavior: "lunge",  atk: { range: 120, windup: 0.45, dash: 540, dashTime: 0.22, cd: 1.9 } },
    repo_enforcer: { name: "Repo Enforcer", tier: 3, hp: 92,  speed: 60,  touchDmg: 16, radius: 17, color: "#ff7a8a", aggro: 360, xpChits: 4, shape: "hex",      behavior: "slam",   atk: { range: 66, windup: 0.6, radius: 82, dmg: 22, cd: 2.6 } },
    scrap_hound:   { name: "Scrap Hound",   tier: 2, hp: 30,  speed: 138, touchDmg: 9,  radius: 11, color: "#e0a36b", aggro: 380, xpChits: 2, shape: "triangle", behavior: "charge", atk: { range: 230, windup: 0.32, dash: 720, dashTime: 0.30, cd: 1.5 } },
    spore_pod:     { name: "Spore Pod",     tier: 2, hp: 74,  speed: 38,  touchDmg: 11, radius: 16, color: "#6fe0a0", aggro: 320, xpChits: 3, shape: "hex",      behavior: "shoot",  atk: { range: 330, prefer: 220, windup: 0.5, projSpeed: 215, projDmg: 11, burst: 1, spread: 0, cd: 2.2, projColor: "#9be38a" } },
    static_hybrid: { name: "Static Hybrid", tier: 2, hp: 48,  speed: 98,  touchDmg: 12, radius: 13, color: "#9ff0c0", aggro: 320, xpChits: 3, shape: "diamond",  behavior: "blink",  atk: { range: 250, blink: 165, windup: 0.28, cd: 1.4 } },
    sec_construct: { name: "Security Construct", tier: 3, hp: 124, speed: 56, touchDmg: 16, radius: 18, color: "#c084fc", aggro: 380, xpChits: 5, shape: "square", behavior: "shoot", atk: { range: 380, prefer: 290, windup: 0.42, projSpeed: 300, projDmg: 13, burst: 3, spread: 0.18, cd: 2.9, projColor: "#d8b0ff" } },

    // ---- Foreclosure-titans (spec §8 biome bosses) — large, high-HP elites that
    // crown each district. Not depth-scaled (fixed boss stats); they summon adds,
    // and drop a guaranteed haul (gear + Parts + Chits + mats) via systems.titanReward.
    titan_north: { name: "The Assessor", titan: true, biome: "north", tier: 3, hp: 520, speed: 64, touchDmg: 22, radius: 30, color: "#ff9a5a", aggro: 560, xpChits: 30, shape: "hex", sprite: "enemy_repo_enforcer",
      behavior: "slam", atk: { range: 96, windup: 0.7, radius: 128, dmg: 34, cd: 2.4 },
      summon: { type: "repo_drone", n: 2, cd: 6, cap: 4 },
      reward: { chits: 60, gearRolls: 2, gearTier: 3, parts: ["overcharger"], loot: { plating: 6, relic: 1, alloy: 3 } } },
    titan_east: { name: "The Crusher", titan: true, biome: "east", tier: 3, hp: 470, speed: 118, touchDmg: 20, radius: 30, color: "#e0a36b", aggro: 600, xpChits: 32, shape: "triangle", sprite: "enemy_scrap_hound",
      behavior: "charge", atk: { range: 320, windup: 0.4, dash: 840, dashTime: 0.42, cd: 1.8 },
      summon: { type: "scrap_hound", n: 2, cd: 7, cap: 4 },
      reward: { chits: 70, gearRolls: 2, gearTier: 3, parts: ["heavyrounds"], loot: { alloy: 6, chrome: 1 } } },
    titan_south: { name: "The Bloomfather", titan: true, biome: "south", tier: 3, hp: 560, speed: 40, touchDmg: 18, radius: 33, color: "#6fe0a0", aggro: 560, xpChits: 32, shape: "hex", sprite: "enemy_spore_pod",
      behavior: "shoot", atk: { range: 440, prefer: 280, windup: 0.5, projSpeed: 240, projDmg: 16, burst: 6, spread: 0.55, cd: 2.0, projColor: "#9be38a" },
      summon: { type: "spore_pod", n: 1, cd: 8, cap: 3 },
      reward: { chits: 70, gearRolls: 2, gearTier: 3, parts: ["splitter"], loot: { biomass: 6, organics: 6 } } },
    titan_west: { name: "The Sysadmin", titan: true, biome: "west", tier: 3, hp: 660, speed: 58, touchDmg: 24, radius: 33, color: "#c084fc", aggro: 600, xpChits: 38, shape: "square", sprite: "enemy_sec_construct",
      behavior: "shoot", atk: { range: 460, prefer: 320, windup: 0.4, projSpeed: 320, projDmg: 18, burst: 7, spread: 0.34, cd: 2.6, projColor: "#d8b0ff" },
      summon: { type: "sec_construct", n: 1, cd: 9, cap: 3 },
      reward: { chits: 90, gearRolls: 3, gearTier: 3, parts: ["longbarrel"], loot: { crystal: 3, core: 2 } } },
    titan_glitter: { name: "The Pit Boss", titan: true, biome: "glitter", tier: 3, hp: 600, speed: 80, touchDmg: 22, radius: 31, color: "#ff5ea8", aggro: 580, xpChits: 36, shape: "square", sprite: "enemy_repo_enforcer",
      behavior: "shoot", atk: { range: 420, prefer: 250, windup: 0.36, projSpeed: 300, projDmg: 16, burst: 5, spread: 0.42, cd: 2.1, projColor: "#ff8fd0" },
      summon: { type: "repo_unit", n: 2, cd: 7, cap: 4 },
      reward: { chits: 120, gearRolls: 2, gearTier: 3, parts: ["dampener"], loot: { chrome: 2, cells: 6 } } },
  };
  data.titansByBiome = { north: "titan_north", east: "titan_east", south: "titan_south", west: "titan_west", glitter: "titan_glitter" };

  // ---- The Auditor: the Foreclosed Deep endgame boss (spec §12 #12). Summoned
  // by the Deep Gate once all 5 district titans are felled. `auditor`/`reward.deep`
  // route the off-the-ledger prestige payoff in systems.titanReward.
  data.enemies.auditor = {
    name: "The Auditor", titan: true, auditor: true, biome: "deep", tier: 4, hp: 1500, speed: 52, touchDmg: 30, radius: 38, color: "#b388ff", aggro: 760, xpChits: 120, shape: "hex", sprite: "enemy_sec_construct",
    behavior: "shoot", atk: { range: 540, prefer: 340, windup: 0.36, projSpeed: 320, projDmg: 22, burst: 9, spread: 0.62, cd: 1.8, projColor: "#c9a6ff" },
    summon: { type: "sec_construct", n: 2, cd: 6, cap: 6 },
    reward: { chits: 300, gearRolls: 1, forceRarity: "heirloom", parts: ["overcharger", "longbarrel"], loot: { chrome: 4, core: 4, crystal: 4 }, deep: true },
  };
  data.deep = { hpBonus: 50 };   // permanent Max Vitality granted for clearing the Deep

  /* ---- Player base stats + weapon + gadgets ---- */
  data.player = {
    radius: 12, speed: 205, maxHp: 100, holdRegen: 14, invuln: 0.45,
    backpackBase: 40,   // how much salvage you can carry before the pack is full
    stackMax: 99,
    weapon: {
      name: "Salvaged Pistol",
      damage: 12, projSpeed: 560, cooldown: 0.26, projLife: 0.74, projRadius: 4,
      knockback: 0,   // the pistol does NOT shove enemies — only specific gear does
    },
    gadgets: {
      pulse: { name: "Shock Pulse", radius: 120, damage: 34, knockback: 440, cooldown: 6.0 },
      med:   { name: "Med-Patch", heal: 45 },
    },
  };

  /* ---- Field casino (spec §9.9 "the pull"): the Glittermile's gambling POI.
     A transient casino re-seeds in the Glittermile each cycle. Three games:
     SLOTS (Chits in, weighted Chit payout), DOUBLE-OR-NOTHING (wager your carried
     haul mid-run — the spec's max-tension bet), and THE PULL (Chits → gear, with a
     pity counter that guarantees a Masterwork+ every `pityAt` pulls). ---- */
  data.casino = {
    slotsCost: 10, pullCost: 30, pityAt: 6, doubleChance: 0.45,
    slots: [[0, 50], [10, 25], [20, 14], [45, 8], [150, 3]],   // [Chit payout, weight]
    pullRarity: [["masterwork", 60], ["relic", 30], ["heirloom", 10]],  // the pity-hit table
    symbols: ["◆", "★", "☼", "⬢", "♠", "♣", "❖"],
  };

  /* ---- The Notice meter (spec §7B) ---- */
  data.notice = {
    max: 100,
    riseByDepth: { 0: 0, 1: 1.4, 2: 2.6, 3: 4.2 },
    risePerDepth: 1.45,        // continuous: ambient Notice rise = depth * this
    dwellBonus: 3.0,
    fireBonus: 4.0,
    pulseBonus: 16.0,
    moveDecay: 3.0,
    safeDecay: 28.0,
    sweepAt: 100,
    sweepDrop: 55,
    sweepWave: 3,
    sweepRadius: 540,   // sweep enemies appear far off and CLOSE IN (not next to you)
    sweepMinRadius: 380,
  };

  /* ---- Fab-bench recipes (spec §9.2) ---- */
  data.recipes = [
    { id: "frame",     name: "Reinforced Frame", effect: "+15 Max Vitality (permanent)",      cost: { scrap: 12, alloy: 4 } },
    { id: "satchel",   name: "Salvage Satchel",  effect: "+16 backpack capacity (permanent)", cost: { scrap: 8, wiring: 6 } },
    { id: "stride",    name: "Stride Rig",       effect: "+ Move Speed (permanent)",          cost: { wiring: 6, alloy: 4 } },
    { id: "rounds",    name: "Hot-Loaded Rounds",effect: "+3 Pistol Damage (permanent)",      cost: { wiring: 7, cells: 4 } },
    { id: "capacitor", name: "Capacitor Tuning", effect: "-1.2s Shock Pulse cooldown",        cost: { cells: 3, wiring: 2 } },
    { id: "medpatch",  name: "Med-Patch ×1",     effect: "Craft a healing patch (use with H)",cost: { wiring: 2, cells: 1 } },
    { id: "ration",    name: "Field Ration ×2",  effect: "Grow-fed healing (use with H)",     cost: { organics: 3 } },
    { id: "chitpress", name: "Chit Press",       effect: "Melt junk into ◈10 Chits",          cost: { scrap: 5 } },
    { id: "carbine",   name: "Carbine Conversion",effect: "Faster fire + bigger rounds (one-time)", cost: { core: 2, alloy: 4, relic: 1 } },
    { id: "plasma",    name: "Plasma Cutter",     effect: "Stronger mining tool — breaches hard nodes (one-time)", cost: { alloy: 3, cells: 2, plating: 4 } },
    { id: "turretmod", name: "Salvage Turret",     effect: "Deployable Module — place an auto-turret with [R] (one-time)", cost: { core: 1, alloy: 5, cells: 4 } },
  ];

  data.craftEffects = {
    frame:     { maxHpBonus: 15 },
    satchel:   { backpackBonus: 16 },
    stride:    { moveBonus: 16 },
    rounds:    { dmgBonus: 3 },
    capacitor: { pulseCdReduce: 0.9, pulseCdMin: 2.4 },
    medpatch:  { giveMed: 1 },
    ration:    { giveMed: 2 },
    chitpress: { chits: 10 },
    carbine:   { cooldownMul: 0.62, projRadiusAdd: 2, dmgBonus: 4, once: true },
    plasma:    { tool: "plasma", once: true },
    turretmod: { module: "turret", once: true },
  };

  /* ---- Biome signature events (spec §8): when Notice peaks, the district that
     owns you reacts in its OWN way instead of a generic sweep. Reuses existing
     enemies; spawn counts scale up with depth in systems.repoSweep. ---- */
  data.sweepEvents = {
    north:     { name: "REPO SWEEP",    sub: "The Concern is converging — move!",       toast: "A repo sweep closes in from the dark. Keep moving or get home.", spawn: [["repo_unit", 2], ["repo_drone", 2]] },
    east:      { name: "STATIC SQUALL",  sub: "The Scrapsea churns — beasts on the move", toast: "A Static squall rolls in — scrap-hounds stampede out of the dust.", spawn: [["scrap_hound", 4]] },
    south:     { name: "BLOOM-SURGE",    sub: "The Greenline erupts in spores",          toast: "A bloom-surge — spore-pods burst awake and spit around you.", spawn: [["spore_pod", 2], ["static_hybrid", 2]] },
    west:      { name: "LOCKDOWN",       sub: "The Stacks seal — security converging",   toast: "Lockdown escalation — security constructs lock onto you.", spawn: [["sec_construct", 2], ["repo_enforcer", 1]] },
    glitter:   { name: "THE HOUSE WAKES", sub: "A field-casino powers on — bots swarm",   toast: "The house wakes — rogue service-bots flood the floor.", spawn: [["repo_unit", 3], ["sec_construct", 1]] },
    undercity: { name: "REPO PATROL",    sub: "A patrol sweeps the Undercity",           toast: "A repo patrol sweeps the dead infrastructure. Keep moving.", spawn: [["repo_drone", 3]] },
  };

  /* ---- Answer the Call event (spec §9.7). Beacon sits out in the Stacks. ---- */
  data.event = {
    waves: [
      { spawn: [["repo_drone", 4]],                       reward: { chits: 8,  loot: { scrap: 4, wiring: 3 } } },
      { spawn: [["repo_unit", 4], ["scrap_hound", 2]],     reward: { chits: 16, loot: { cells: 3, alloy: 2, relic: 1 } } },
      { spawn: [["repo_enforcer", 3], ["sec_construct", 2]],reward: { chits: 30, loot: { core: 2, relic: 2, chrome: 1 } } },
    ],
    spawnRadius: 380, spawnMinRadius: 240,
  };

  P.data = data;
})(window.PACT = window.PACT || {});
