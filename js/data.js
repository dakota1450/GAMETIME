/* ============================================================
   THE PACT — DATA LAYER  (Core Keeper-style tile-dig rebuild)

   Everything is data: blocks (the mineable tile materials), items
   (mats/bars/tools/weapons/placeables/consumables), the concentric
   biome RINGS (the tier gate), crafting stations + recipes, enemies,
   and player base stats. The engine (world/systems/game) reads this.

   THE TIER LADDER (the heart of the request):
     ring 1  rock tier 1  + Copper ore   -> craft Copper gear (power 2)
     ring 2  rock tier 2  + Iron ore     -> craft Iron gear   (power 3)
     ring 3  rock tier 3  + Crystal ore  -> craft Crystal gear (power 4)
     ring 4  rock tier 4  + Core ore     -> endgame
   A pickaxe of power P mines any block of tier <= P. The bulk rock of
   ring N needs the tier-N pickaxe, so you can't reach a biome until you
   have crafted the metal that the PREVIOUS biome gave you. The ore for
   the next tool always sits in a ring your current pickaxe can already dig.
   ============================================================ */
(function (P) {
  "use strict";
  const data = {};

  /* ---- World geometry ---- */
  data.world = {
    TILE: 24,                 // px per tile (chunky, Core-Keeper readable)
    COLS: 200, ROWS: 200,     // solid sandbox you dig out of
    seedBase: 8675309,
    zoom: 2.4,                // camera zoom — close-up CK feel
    holdRadius: 9,            // tiles: the dug-out starting clearing
  };

  /* ============================================================
     BLOCKS — what fills the WALL layer. id 0 = open/dug (walkable).
     tier = pickaxe power required. hp = mining damage to break.
     drop = item id dropped (defaults to a placeable of the same name).
     ore: true  -> embedded ore (glints, often glows).
     A block is solid; mine it to reveal the FLOOR underneath.
     ============================================================ */
  data.blocks = {
    1:  { name: "Dirt",        tier: 0, hp: 14, color: "#6b4f34", top: "#806038", side: "#4a3522", drop: "dirt" },
    2:  { name: "Stone",       tier: 1, hp: 26, color: "#6f7178", top: "#878a92", side: "#4b4d53", drop: "stone" },
    3:  { name: "Clay",        tier: 1, hp: 22, color: "#9c6f4e", top: "#b98a64", side: "#6d4c34", drop: "clay" },
    4:  { name: "Rusted Rock", tier: 2, hp: 40, color: "#7a4d35", top: "#9a6442", side: "#522f1f", drop: "rubble" },
    5:  { name: "Dense Rock",  tier: 3, hp: 60, color: "#4a4660", top: "#615c80", side: "#2f2c40", drop: "rubble" },
    6:  { name: "Core Rock",   tier: 4, hp: 92, color: "#3a2942", top: "#553a60", side: "#241726", drop: "rubble" },

    // ---- ores (embedded; glint, the metal ones tint warm) ----
    10: { name: "Copper Ore",  tier: 1, hp: 30, color: "#7a5a44", top: "#9a6e4e", side: "#4f3a2c", ore: true, oreCol: "#e08a4a", glow: [224,138,74], drop: "copper_ore" },
    11: { name: "Tin Ore",     tier: 1, hp: 30, color: "#6e6f63", top: "#8a8b7c", side: "#494a42", ore: true, oreCol: "#cfd6c0", drop: "tin_ore" },
    12: { name: "Iron Ore",    tier: 2, hp: 46, color: "#73503e", top: "#8f6650", side: "#4d352a", ore: true, oreCol: "#d9b08c", glow: [217,176,140], drop: "iron_ore" },
    13: { name: "Crystal Ore", tier: 3, hp: 64, color: "#43406a", top: "#5d588f", side: "#2a2844", ore: true, oreCol: "#b48cff", glow: [180,140,255], drop: "crystal" },
    14: { name: "Core Ore",    tier: 4, hp: 96, color: "#3c2a4a", top: "#5a3a66", side: "#241730", ore: true, oreCol: "#ffd24a", glow: [255,210,74], drop: "core_shard" },

    // ---- crafted / placeable building blocks ----
    20: { name: "Packed Dirt Wall", tier: 0, hp: 14, color: "#5a4430", top: "#74543a", side: "#3c2c1e", drop: "dirt" },
    21: { name: "Stone Brick",      tier: 1, hp: 28, color: "#5f6168", top: "#797b84", side: "#3f4147", drop: "stone_brick", placeOnly: true },
    22: { name: "Plank Wall",       tier: 1, hp: 18, color: "#7a5634", top: "#9a6e44", side: "#523920", drop: "plank", placeOnly: true },
  };

  /* ============================================================
     FLOOR types — the BASE LAYER revealed under every block and in
     dug-out tunnels. Purely visual ground identity per biome.
     ============================================================ */
  data.floors = {
    0: { name: "void",  color: "#0a0b10", alt: "#0a0b10" },
    1: { name: "dirt",  color: "#2c2114", alt: "#33271a" },
    2: { name: "stone", color: "#23252b", alt: "#282a31" },
    3: { name: "rust",  color: "#281a12", alt: "#2f1f15" },
    4: { name: "ash",   color: "#1c1a26", alt: "#211e2d" },
    5: { name: "core",  color: "#1a1020", alt: "#1f1426" },
    6: { name: "hold",  color: "#241c12", alt: "#2b2216" },   // the warm Hold floor
  };

  /* ============================================================
     ITEMS — one registry. kind drives behaviour:
       mat  : raw material (stacks)
       bar  : smelted bar (stacks)
       block: placeable -> `block` is the block id it places
       tool : `tool` {power, dmg, cd, reach}
       weapon: `weapon` {dmg, cd, reach, arc, knockback}
       consumable: `heal`
     ============================================================ */
  data.items = {
    // raw mats
    dirt:        { name: "Dirt",          kind: "block", block: 20, color: "#8a6038", max: 999 },
    stone:       { name: "Stone",         kind: "block", block: 2,  color: "#8a8d95", max: 999 },
    clay:        { name: "Clay",          kind: "block", block: 3,  color: "#b98a64", max: 999 },
    rubble:      { name: "Rubble",        kind: "mat",   color: "#9a7a64", max: 999 },
    copper_ore:  { name: "Copper Ore",    kind: "mat",   color: "#e08a4a", max: 999 },
    tin_ore:     { name: "Tin Ore",       kind: "mat",   color: "#cfd6c0", max: 999 },
    iron_ore:    { name: "Iron Ore",      kind: "mat",   color: "#d9b08c", max: 999 },
    crystal:     { name: "Data-Crystal",  kind: "mat",   color: "#b48cff", max: 999 },
    core_shard:  { name: "Core Shard",    kind: "mat",   color: "#ffd24a", max: 999 },
    fiber:       { name: "Fiber",         kind: "mat",   color: "#8fce6a", max: 999 },
    glowdust:    { name: "Glow Dust",     kind: "mat",   color: "#ffd98a", max: 999 },

    // smelted bars
    copper_bar:  { name: "Copper Bar",    kind: "bar", color: "#e8975a", max: 999 },
    tin_bar:     { name: "Tin Bar",       kind: "bar", color: "#d7ddc8", max: 999 },
    iron_bar:    { name: "Iron Bar",      kind: "bar", color: "#cdb9a6", max: 999 },
    crystal_bar: { name: "Refined Crystal",kind: "bar", color: "#c4a0ff", max: 999 },

    // placeable crafted blocks / props
    stone_brick: { name: "Stone Brick",   kind: "block", block: 21, color: "#7a7d86", max: 999 },
    plank:       { name: "Plank Wall",    kind: "block", block: 22, color: "#9a6e44", max: 999 },
    torch:       { name: "Torch",         kind: "torch", color: "#ffb454", max: 99 },

    // ---- tools (pickaxes): power gates which blocks you can mine ----
    pick_salvage: { name: "Salvage Pickaxe", kind: "tool", icon: "pick", tier: 1, color: "#b0b6c0",
                    tool: { power: 1, dmg: 10, cd: 0.34, reach: 2.7 } },
    pick_copper:  { name: "Copper Pickaxe",  kind: "tool", icon: "pick", tier: 2, color: "#e8975a",
                    tool: { power: 2, dmg: 16, cd: 0.28, reach: 2.8 } },
    pick_iron:    { name: "Iron Pickaxe",    kind: "tool", icon: "pick", tier: 3, color: "#cdb9a6",
                    tool: { power: 3, dmg: 24, cd: 0.23, reach: 3.0 } },
    pick_crystal: { name: "Crystal Pickaxe", kind: "tool", icon: "pick", tier: 4, color: "#c4a0ff",
                    tool: { power: 4, dmg: 36, cd: 0.18, reach: 3.2 } },

    // ---- weapons (melee arc) ----
    sword_salvage:{ name: "Scrap Blade",     kind: "weapon", icon: "sword", tier: 1, color: "#b0b6c0",
                    weapon: { dmg: 14, cd: 0.42, reach: 46, arc: 1.7, knockback: 150 } },
    sword_copper: { name: "Copper Sword",    kind: "weapon", icon: "sword", tier: 2, color: "#e8975a",
                    weapon: { dmg: 24, cd: 0.40, reach: 50, arc: 1.8, knockback: 200 } },
    sword_iron:   { name: "Iron Cleaver",    kind: "weapon", icon: "sword", tier: 3, color: "#cdb9a6",
                    weapon: { dmg: 40, cd: 0.44, reach: 56, arc: 1.9, knockback: 280 } },
    sword_crystal:{ name: "Crystal Edge",    kind: "weapon", icon: "sword", tier: 4, color: "#c4a0ff",
                    weapon: { dmg: 62, cd: 0.38, reach: 60, arc: 2.0, knockback: 320 } },

    // ---- ranged (crafted upgrade) ----
    gun_rivet:    { name: "Rivet Gun",       kind: "weapon", icon: "gun", tier: 2, color: "#7fd0ff",
                    weapon: { ranged: true, dmg: 16, cd: 0.20, reach: 0, projSpeed: 620, projLife: 0.8, projRadius: 4, knockback: 40 } },

    // ---- consumables ----
    bandage:      { name: "Bandage",   kind: "consumable", color: "#ff8aa0", heal: 35, max: 20 },
    stew:         { name: "Root Stew", kind: "consumable", color: "#ffce6b", heal: 70, max: 20 },
  };

  /* ============================================================
     BIOME RINGS — concentric tiers radiating from the Hold. Distance
     from center decides the ring; noise wobbles the borders so they
     bleed. `rock` = the bulk wall material (its tier is the gate),
     `ores` = veins scattered in that ring (with rough frequency),
     `floor` = base ground id, `enemies` = pool with spawn weight.
     ============================================================ */
  data.biomes = [
    { id: "hold",    name: "THE HOLD",       tier: 0, rRing: 9,
      rock: 1, floor: 6, mood: "#2a2214", accent: "#ffb347",
      ores: [], enemies: [] },
    { id: "hollows", name: "THE HOLLOWS",    tier: 1, rRing: 34,
      rock: 1, sub: 2, floor: 1, mood: "#241c12", accent: "#caa46b",
      blurb: "Packed earth & old copper",
      ores: [ [10, 0.10], [11, 0.06] ],   // copper (common), tin (rarer)
      decor: ["grass","mushroom","pebbles"],
      enemies: [ ["grub", 1.0] ] },
    { id: "scrapsea",name: "THE SCRAPSEA",   tier: 2, rRing: 56,
      rock: 4, floor: 3, mood: "#34221a", accent: "#e0a36b",
      blurb: "Rusted strata, iron veins",
      ores: [ [12, 0.09], [2, 0.06] ],
      decor: ["scrap","bones","pebbles"],
      enemies: [ ["grub", 0.5], ["hound", 0.7], ["crawler", 0.5] ] },
    { id: "stacks",  name: "THE STACKS",     tier: 3, rRing: 78,
      rock: 5, floor: 4, mood: "#241a36", accent: "#c084fc",
      blurb: "Dense rock, data-crystal",
      ores: [ [13, 0.08] ],
      decor: ["crystal","pebbles"],
      enemies: [ ["crawler", 0.7], ["sentinel", 0.7] ] },
    { id: "core",    name: "THE CORE",       tier: 4, rRing: 999,
      rock: 6, floor: 5, mood: "#2a1430", accent: "#ffd24a",
      blurb: "Core rock — the deep ledger",
      ores: [ [14, 0.08] ],
      decor: ["crystal"],
      enemies: [ ["sentinel", 0.6], ["warden", 0.8] ] },
  ];

  /* ---- ground decor props (non-colliding clutter on the floor) ---- */
  data.decor = {
    grass:    { sprite: "decor_grass",    scale: 18 },
    mushroom: { sprite: "decor_mushroom", scale: 17 },
    flower:   { sprite: "decor_flower",   scale: 17, glow: [111,224,160] },
    pebbles:  { sprite: "decor_pebbles",  scale: 15 },
    bones:    { sprite: "decor_bones",    scale: 16 },
    scrap:    { sprite: "decor_scrap",    scale: 17 },
    crystal:  { sprite: "decor_crystal",  scale: 18, glow: [180,140,255] },
  };

  /* ============================================================
     CRAFTING STATIONS + recipes. A station unlocks a tier of recipes;
     building the next station needs the previous tier's bars (so
     "each bench requires higher-level materials"). Recipes list
     `cost` (item->n) and `out` (item->n). `station` is where it's made.
     ============================================================ */
  data.stations = {
    furnace: { name: "Furnace",      color: "#ff9a3c", blurb: "Smelt ore into bars" },
    tinker:  { name: "Tinker Bench", color: "#4fd6c9", blurb: "Forge tools, weapons & blocks" },
    anvil:   { name: "Anvil",        color: "#cdb9a6", blurb: "Iron-tier forging" },
    forge:   { name: "Arc Forge",    color: "#c084fc", blurb: "Crystal-tier forging" },
  };

  data.recipes = [
    // --- furnace: smelting ---
    { station: "furnace", out: { copper_bar: 1 }, cost: { copper_ore: 2 } },
    { station: "furnace", out: { tin_bar: 1 },    cost: { tin_ore: 2 } },
    { station: "furnace", out: { iron_bar: 1 },   cost: { iron_ore: 2 } },
    { station: "furnace", out: { crystal_bar: 1 },cost: { crystal: 2 }, need: "anvil" },

    // --- tinker bench: tier 1 -> 2 (copper) ---
    { station: "tinker", out: { stone_brick: 4 }, cost: { stone: 2 } },
    { station: "tinker", out: { plank: 4 },       cost: { fiber: 2 } },
    { station: "tinker", out: { torch: 4 },       cost: { fiber: 1, glowdust: 1 } },
    { station: "tinker", out: { bandage: 1 },     cost: { fiber: 3 } },
    { station: "tinker", out: { pick_copper: 1 }, cost: { copper_bar: 6, tin_bar: 2 } },
    { station: "tinker", out: { sword_copper: 1 },cost: { copper_bar: 5, tin_bar: 1 } },
    { station: "tinker", out: { gun_rivet: 1 },   cost: { copper_bar: 4, tin_bar: 4, glowdust: 2 } },
    { station: "tinker", out: { anvil_kit: 1 },   cost: { copper_bar: 8, stone: 12 }, build: "anvil" },

    // --- anvil: tier 2 -> 3 (iron) ---
    { station: "anvil", out: { pick_iron: 1 },  cost: { iron_bar: 8 } },
    { station: "anvil", out: { sword_iron: 1 }, cost: { iron_bar: 7 } },
    { station: "anvil", out: { stew: 2 },       cost: { fiber: 3, glowdust: 1 } },
    { station: "anvil", out: { forge_kit: 1 },  cost: { iron_bar: 10, crystal: 4 }, build: "forge" },

    // --- arc forge: tier 3 -> 4 (crystal) ---
    { station: "forge", out: { pick_crystal: 1 },  cost: { crystal_bar: 8, iron_bar: 4 } },
    { station: "forge", out: { sword_crystal: 1 }, cost: { crystal_bar: 7, iron_bar: 3 } },
  ];
  // build-kit pseudo-items just mark "this recipe places/unlocks a station"
  data.items.anvil_kit = { name: "Anvil",     kind: "kit", color: "#cdb9a6", builds: "anvil" };
  data.items.forge_kit = { name: "Arc Forge", kind: "kit", color: "#c084fc", builds: "forge" };

  /* ============================================================
     ENEMIES — simple top-down creatures that prowl the dug-out dark.
     behavior: chase (contact) / charge (lunge) / shoot (ranged).
     scale = how much the biome tier multiplies hp/dmg.
     ============================================================ */
  data.enemies = {
    grub:     { name: "Cave Grub",     hp: 26,  speed: 52,  dmg: 7,  radius: 11, color: "#8fae7a", shape: "blob",
                xp: 1, drops: [["fiber",[1,2]],["glowdust",[0,1]]], behavior: "chase", aggro: 230 },
    hound:    { name: "Scrap Hound",   hp: 40,  speed: 132, dmg: 11, radius: 12, color: "#e0a36b", shape: "tri",
                xp: 2, drops: [["rubble",[1,2]],["tin_ore",[0,1]]], behavior: "charge", aggro: 360,
                atk: { range: 220, windup: 0.32, dash: 700, dashTime: 0.28, cd: 1.5 } },
    crawler:  { name: "Static Crawler",hp: 64,  speed: 78,  dmg: 13, radius: 13, color: "#9ff0c0", shape: "diamond",
                xp: 3, drops: [["glowdust",[1,2]],["iron_ore",[0,1]]], behavior: "chase", aggro: 300 },
    sentinel: { name: "Sec Sentinel",  hp: 120, speed: 58,  dmg: 16, radius: 16, color: "#c084fc", shape: "square",
                xp: 5, drops: [["crystal",[0,1]],["glowdust",[1,2]]], behavior: "shoot", aggro: 420,
                atk: { range: 360, prefer: 260, windup: 0.45, projSpeed: 280, projDmg: 13, burst: 3, spread: 0.18, cd: 2.6, projColor: "#d8b0ff" } },
    warden:   { name: "Core Warden",   hp: 240, speed: 50,  dmg: 22, radius: 20, color: "#ffd24a", shape: "hex",
                xp: 9, drops: [["core_shard",[0,1]],["crystal",[1,2]]], behavior: "charge", aggro: 480,
                atk: { range: 300, windup: 0.5, dash: 760, dashTime: 0.4, cd: 1.8 } },
  };

  /* ---- Player base stats ---- */
  data.player = {
    radius: 10, speed: 202, maxHp: 100, holdRegen: 16, invuln: 0.5,
    reach: 2.7,                      // default mining reach in tiles
    starting: [                      // starting hotbar / inventory
      { item: "pick_salvage", n: 1 },
      { item: "sword_salvage", n: 1 },
      { item: "torch", n: 8 },
    ],
  };

  /* ---- Boss enemies (one per biome ring, spawned into pre-carved rooms) ---- */
  data.enemies.burrow_king = {
    name: "The Burrow King", boss: true, biome: 1,
    hp: 360, speed: 62, dmg: 18, radius: 30, color: "#a8d078", shape: "hex",
    xp: 60, drops: [["iron_ore",[2,4]], ["fiber",[3,5]], ["copper_bar",[1,2]]],
    behavior: "charge", aggro: 700,
    atk: { range: 290, windup: 0.55, dash: 520, dashTime: 0.5, cd: 2.2 },
  };
  data.enemies.salvager_hulk = {
    name: "The Salvager Hulk", boss: true, biome: 2,
    hp: 540, speed: 46, dmg: 24, radius: 34, color: "#e8a870", shape: "square",
    xp: 100, drops: [["iron_bar",[1,2]], ["tin_bar",[2,3]]],
    behavior: "shoot", aggro: 700,
    atk: { range: 420, prefer: 260, windup: 0.65, projSpeed: 270, projDmg: 20, burst: 5, spread: 0.24, cd: 3.0, projColor: "#e8a870" },
  };
  data.enemies.sysadmin = {
    name: "The Sysadmin", boss: true, biome: 3,
    hp: 780, speed: 54, dmg: 30, radius: 38, color: "#c090ff", shape: "diamond",
    xp: 160, drops: [["crystal_bar",[1,2]], ["crystal",[2,4]]],
    behavior: "shoot", aggro: 800,
    atk: { range: 460, prefer: 270, windup: 0.55, projSpeed: 300, projDmg: 24, burst: 7, spread: 0.26, cd: 2.8, projColor: "#c090ff" },
  };
  data.enemies.the_ledger = {
    name: "THE LEDGER", boss: true, biome: 4,
    hp: 1400, speed: 50, dmg: 38, radius: 46, color: "#ffd24a", shape: "hex",
    xp: 350, drops: [["core_shard",[3,5]], ["crystal_bar",[1,2]]],
    behavior: "charge", aggro: 900,
    atk: { range: 380, windup: 0.7, dash: 640, dashTime: 0.55, cd: 1.7 },
  };

  /* ---- Armor items ---- */
  data.items.helm_copper      = { name: "Copper Helm",     kind: "armor", slot: "head",  color: "#e8975a", tier: 2, armor: { defense: 0.10 }, max: 1 };
  data.items.plate_iron       = { name: "Iron Plate",      kind: "armor", slot: "chest", color: "#cdb9a6", tier: 3, armor: { defense: 0.18 }, max: 1 };
  data.items.lattice_crystal  = { name: "Crystal Lattice", kind: "armor", slot: "head",  color: "#c4a0ff", tier: 4, armor: { defense: 0.14 }, max: 1 };

  /* ---- Armor recipes ---- */
  data.recipes.push(
    { station: "tinker", out: { helm_copper: 1 },     cost: { copper_bar: 4, fiber: 2 } },
    { station: "anvil",  out: { plate_iron: 1 },       cost: { iron_bar: 6 } },
    { station: "forge",  out: { lattice_crystal: 1 },  cost: { crystal_bar: 5, iron_bar: 2 } }
  );

  /* ---- Chest loot tables (indexed 1..4 by biome ring tier) ---- */
  data.chestLoot = [
    [],   // tier 0 — Hold (no chests)
    // tier 1 — Hollows
    [ {item:"copper_ore",n:[3,6],w:3}, {item:"tin_ore",n:[1,3],w:2}, {item:"fiber",n:[2,5],w:3},
      {item:"bandage",n:[1,2],w:2},    {item:"torch",n:[3,6],w:2},   {item:"pick_copper",n:1,w:0.4},
      {item:"glowdust",n:[1,3],w:1} ],
    // tier 2 — Scrapsea
    [ {item:"iron_ore",n:[2,4],w:3},   {item:"tin_bar",n:[1,2],w:2},  {item:"stew",n:[1,2],w:2},
      {item:"pick_iron",n:1,w:0.25},   {item:"helm_copper",n:1,w:0.4},{item:"glowdust",n:[2,3],w:1} ],
    // tier 3 — Stacks
    [ {item:"crystal",n:[1,3],w:3},    {item:"iron_bar",n:[1,2],w:2}, {item:"stew",n:[1,2],w:1},
      {item:"plate_iron",n:1,w:0.4},   {item:"pick_crystal",n:1,w:0.25},{item:"crystal_bar",n:[0,1],w:1} ],
    // tier 4 — Core
    [ {item:"core_shard",n:[1,3],w:3}, {item:"crystal_bar",n:[1,2],w:2},
      {item:"lattice_crystal",n:1,w:0.4} ],
  ];

  P.data = data;
})(window.PACT = window.PACT || {});
