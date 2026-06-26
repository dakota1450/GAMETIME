/* ============================================================
   THE PACT — SYSTEMS (verbs & rules)
   Mining, placing, attacking (melee + ranged), item drops, crafting
   up the tier ladder, enemy spawning, death/respawn. game.js owns the
   shared state G and the inventory helpers; systems mutate through them.
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;
  const TILE = D.world.TILE;
  const S = {};

  S.addEffect = function (G, fx) { fx.t = 0; G.effects.push(fx); };

  /* ---------- targeting: the tile the cursor points at, within reach ---------- */
  S.pickTarget = function (G, reachTiles) {
    const p = G.player;
    let ax, ay;
    if (G.mouseActive) { ax = G.cam.x + G.mouse.x / G.zoom; ay = G.cam.y + G.mouse.y / G.zoom; }
    else { ax = p.x + p.facing.x * reachTiles * TILE; ay = p.y + p.facing.y * reachTiles * TILE; }
    const dx = ax - p.x, dy = ay - p.y, dl = Math.hypot(dx, dy) || 1;
    const reachPx = reachTiles * TILE;
    if (dl > reachPx) { ax = p.x + dx / dl * reachPx; ay = p.y + dy / dl * reachPx; }
    return { c: Math.floor(ax / TILE), r: Math.floor(ay / TILE) };
  };

  // mining target: the first SOLID tile along the aim ray, within reach
  // (so pointing near a wall always grabs the wall, mouse or keyboard)
  S.mineTargetTile = function (G, reachTiles) {
    const p = G.player;
    let ax, ay;
    if (G.mouseActive) { ax = G.cam.x + G.mouse.x / G.zoom; ay = G.cam.y + G.mouse.y / G.zoom; }
    else { ax = p.x + p.facing.x * reachTiles * TILE; ay = p.y + p.facing.y * reachTiles * TILE; }
    const dx = ax - p.x, dy = ay - p.y, dl = Math.hypot(dx, dy) || 1;
    const nx = dx / dl, ny = dy / dl, reachPx = reachTiles * TILE;
    const clamp = Math.min(dl, reachPx);
    let tc = Math.floor((p.x + nx * clamp) / TILE), tr = Math.floor((p.y + ny * clamp) / TILE);
    if (G.world.wallAt(tc, tr) !== 0) return { c: tc, r: tr };
    for (let d = 8; d <= reachPx; d += 6) { const c = Math.floor((p.x + nx * d) / TILE), r = Math.floor((p.y + ny * d) / TILE); if (G.world.wallAt(c, r) !== 0) return { c, r }; }
    return { c: tc, r: tr };
  };

  // placement target: cursor tile (clamped to reach) with the mouse, else the
  // tile one cardinal step in the facing direction
  S.placeTargetTile = function (G) {
    const p = G.player;
    if (G.mouseActive) return S.pickTarget(G, 3.4);
    const fx = Math.abs(p.facing.x) >= Math.abs(p.facing.y) ? (p.facing.x >= 0 ? 1 : -1) : 0;
    const fy = fx === 0 ? (p.facing.y >= 0 ? 1 : -1) : 0;
    return { c: Math.floor(p.x / TILE) + fx, r: Math.floor(p.y / TILE) + fy };
  };

  /* ---------- primary action: use the selected hotbar item ---------- */
  S.primary = function (G) {
    const st = G.selectedStack();
    if (!st) { S.quickMine(G); return; }            // empty hand -> still dig
    const it = D.items[st.item];
    if (!it) return;
    if (it.kind === "tool") S.doMine(G, it.tool);
    else if (it.kind === "weapon") S.doAttack(G, it.weapon);
    else if (it.kind === "block") S.doPlace(G, st.item);
    else if (it.kind === "torch") S.doPlaceTorch(G);
    else S.quickMine(G);                            // mats/bars: holding them digs by hand fallback
  };

  // mine using the best pickaxe you own (convenience key F / right-click)
  S.quickMine = function (G) {
    let best = null;
    for (const s of G.inv) { if (!s) continue; const it = D.items[s.item]; if (it && it.kind === "tool" && it.tool && (!best || it.tool.power > best.power)) best = it.tool; }
    if (best) S.doMine(G, best);
  };

  /* ---------- mining ---------- */
  S.doMine = function (G, tool) {
    const p = G.player;
    if (p.mineCd > 0) return;
    const tgt = S.mineTargetTile(G, tool.reach || 2.7);
    if (G.world.wallAt(tgt.c, tgt.r) === 0) return;
    p.mineCd = tool.cd;
    const cen = G.world.centerOf(tgt.c, tgt.r);
    const [fx, fy] = U.norm(cen.x - p.x, cen.y - p.y); p.aim.x = fx; p.aim.y = fy; p.facing.x = fx; p.facing.y = fy;
    p.swing("pick", 0.18);
    G.curTarget = tgt;
    const res = G.world.mineTile(tgt.c, tgt.r, tool.dmg, tool.power);
    if (res === "toohard") {
      P.audio && P.audio.play("hit", 120);
      G.toastThrottled("Too hard — craft a stronger pickaxe", "bad");
      S.addEffect(G, { type: "spark", x: cen.x, y: cen.y, dur: 0.12, col: "#9fb0c4" });
      return;
    }
    if (res === "bedrock") { P.audio && P.audio.play("hit", 120); return; }
    if (!res) return;
    if (res.result === "hit") {
      P.audio && P.audio.play("mine", 60);
      S.addEffect(G, { type: "spark", x: cen.x, y: cen.y, dur: 0.12, col: res.block.oreCol || res.block.top });
    } else if (res.result === "broke") {
      P.audio && P.audio.play("nodeBreak");
      G.shake(2.4, 0.16);
      S.addEffect(G, { type: "burst", x: cen.x, y: cen.y, dur: 0.34, col: res.block.color, n: 8, spread: 22 });
      S.dropFromBlock(G, cen.x, cen.y, res.block, res.id);
    }
  };

  // what a broken block yields
  S.dropFromBlock = function (G, x, y, block, id) {
    if (block.drop) S.spawnDrop(G, x, y, block.drop, 1);
    if ((id === 1 || id === 3) && Math.random() < 0.25) S.spawnDrop(G, x, y, "fiber", 1);
    if (block.glow && Math.random() < 0.5) S.spawnDrop(G, x, y, "glowdust", 1);
  };

  S.spawnDrop = function (G, x, y, itemId, n) {
    if (!D.items[itemId]) return;
    G.pickups.push(new P.entities.Pickup(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8, itemId, n));
  };

  /* ---------- placing blocks / torches ---------- */
  S.doPlace = function (G, itemId) {
    const p = G.player;
    if (p.placeCd > 0) return;
    const it = D.items[itemId]; if (!it || it.block == null) return;
    const tgt = S.placeTargetTile(G);
    if (G.world.wallAt(tgt.c, tgt.r) !== 0) return;
    const cen = G.world.centerOf(tgt.c, tgt.r);
    if (U.dist(cen.x, cen.y, p.x, p.y) < p.radius + 6) return;
    if (G.countItem(itemId) <= 0) return;
    if (G.world.placeBlock(tgt.c, tgt.r, it.block)) { G.takeItem(itemId, 1); p.placeCd = 0.12; P.audio && P.audio.play("craft", 60); }
  };
  S.doPlaceTorch = function (G) {
    const p = G.player;
    if (p.placeCd > 0) return;
    const tgt = S.placeTargetTile(G);
    if (G.countItem("torch") <= 0) return;
    if (G.world.placeTorch(tgt.c, tgt.r)) { G.takeItem("torch", 1); p.placeCd = 0.15; P.audio && P.audio.play("craft", 60); }
  };

  /* ---------- attacking ---------- */
  S.doAttack = function (G, weapon) {
    const p = G.player;
    if (p.attackCd > 0) return;
    p.attackCd = weapon.cd;
    if (weapon.ranged) {
      p.swing("pick", 0.12);
      const nx = p.aim.x, ny = p.aim.y;
      G.projectiles.push(new P.entities.Projectile(p.x + nx * p.radius, p.y + ny * p.radius, nx * weapon.projSpeed, ny * weapon.projSpeed,
        { damage: weapon.dmg, life: weapon.projLife, radius: weapon.projRadius, fromPlayer: true, color: "#9fd0ff", knockback: weapon.knockback }));
      S.addEffect(G, { type: "muzzle", x: p.x + nx * 14, y: p.y + ny * 14, dur: 0.06 });
      P.audio && P.audio.play("shoot", 30);
      return;
    }
    // melee arc
    p.swing("sword", weapon.cd * 0.7);
    const base = Math.atan2(p.aim.y, p.aim.x);
    let hitAny = false;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = U.dist(p.x, p.y, e.x, e.y);
      if (d > weapon.reach + e.radius) continue;
      const ang = Math.atan2(e.y - p.y, e.x - p.x);
      const da = Math.abs(((ang - base + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (da <= weapon.arc / 2) {
        e.hit(weapon.dmg);
        e.knock(e.x - p.x, e.y - p.y, weapon.knockback);
        hitAny = true;
        S.addEffect(G, { type: "spark", x: e.x, y: e.y, dur: 0.14, col: "#ffe6b0" });
      }
    }
    P.audio && P.audio.play(hitAny ? "hit" : "shoot", 30);
    if (hitAny) G.shake(2.5, 0.14);
  };

  /* ---------- consumables ---------- */
  S.consume = function (G, slotIndex) {
    const st = G.inv[slotIndex]; if (!st) return;
    const it = D.items[st.item];
    if (!it || it.kind !== "consumable") return;
    if (G.player.hp >= G.player.maxHp) { G.toast("Already at full vitality", "info"); return; }
    G.player.heal(it.heal);
    G.takeItem(st.item, 1);
    P.audio && P.audio.play("heal");
    G.toast("Used " + it.name + " (+" + it.heal + " VIT)", "good");
  };

  /* ---------- crafting ---------- */
  S.stationAvailable = function (G, type) {
    if (!type) return true;
    return G.world.stations.some(s => s.type === type);
  };
  S.canCraft = function (G, recipe) {
    if (!S.stationAvailable(G, recipe.station)) return false;
    if (recipe.need && !S.stationAvailable(G, recipe.need)) return false;
    return G.hasCost(recipe.cost);
  };
  S.craft = function (G, recipe) {
    if (!S.canCraft(G, recipe)) { P.audio && P.audio.play("hit", 80); return false; }
    G.takeCost(recipe.cost);
    if (recipe.build) {
      const spot = S.findBuildSpot(G);
      if (spot) { G.world.addStation(recipe.build, spot.c, spot.r); G.toast(D.stations[recipe.build].name + " built nearby", "good"); }
      else G.toast("No room to place it — clear a space first", "bad");
    } else {
      for (const item in recipe.out) {
        G.addItem(item, recipe.out[item]);
        const it = D.items[item];
        if (it && (it.kind === "tool" || it.kind === "weapon")) G.banner(it.name, "crafted — select it on your hotbar");
      }
    }
    P.audio && P.audio.play("craft");
    return true;
  };
  S.findBuildSpot = function (G) {
    const p = G.player, w = G.world;
    const pc = Math.floor(p.x / TILE), pr = Math.floor(p.y / TILE);
    for (let rad = 1; rad <= 3; rad++) for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
      const c = pc + dc, r = pr + dr;
      if (w.wallAt(c, r) === 0 && !w.stations.some(s => s.c === c && s.r === r)) return { c, r };
    }
    return null;
  };

  /* ---------- enemies: spawning + scaling ---------- */
  S.scaleByDepth = function (G, e, depth) {
    const m = 1 + Math.max(0, depth - 1) * 0.35;
    e.hp = Math.round(e.maxHp * m); e.maxHp = e.hp; e.dmgMul = m;
  };
  S.populate = function (G) {
    G.enemies = [];
    const w = G.world, rng = U.makeRng(998);
    let tries = 0, made = 0;
    const want = 80;
    while (made < want && tries++ < 8000) {
      const c = U.rngInt(rng, 4, w.cols - 5), r = U.rngInt(rng, 4, w.rows - 5);
      if (w.wallAt(c, r) !== 0) continue;
      const cen = w.centerOf(c, r);
      const depth = w.depthAtPx(cen.x, cen.y);
      if (depth < 1) continue;
      const b = w.biomeAt(c, r);
      if (!b.enemies || !b.enemies.length) continue;
      const type = U.rngWeighted(rng, b.enemies);
      const e = new P.entities.Enemy(type, cen.x, cen.y);
      S.scaleByDepth(G, e, depth);
      G.enemies.push(e); made++;
    }
  };
  // trickle respawns in the dug-out dark, just off-screen, capped
  S.tickSpawns = function (G, dt) {
    G._spawnT = (G._spawnT || 0) - dt;
    if (G._spawnT > 0) return;
    G._spawnT = 2.5;
    if (G.enemies.length > 110) return;
    const w = G.world, p = G.player;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * 6.28, dist = 360 + Math.random() * 200;
      const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
      const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
      if (!w.inBounds(c, r) || w.wallAt(c, r) !== 0) continue;
      const depth = w.depthAtPx(x, y);
      if (depth < 1) continue;
      const b = w.biomeAt(c, r);
      if (!b.enemies || !b.enemies.length) continue;
      const e = new P.entities.Enemy(U.rngWeighted(Math.random, b.enemies), x, y);
      S.scaleByDepth(G, e, depth);
      G.enemies.push(e);
      return;
    }
  };

  /* ---------- enemy death rewards ---------- */
  S.enemyDrop = function (G, e) {
    for (const [item, [lo, hi]] of (e.def.drops || [])) {
      const n = U.rngInt(Math.random, lo, hi);
      for (let i = 0; i < n; i++) S.spawnDrop(G, e.x, e.y, item, 1);
    }
  };

  /* ---------- death / respawn (Core Keeper-style: keep your stuff) ---------- */
  S.die = function (G) {
    if (!G.player.alive) return;
    G.player.alive = false;
    P.audio && P.audio.play("death");
    G.shake(7, 0.5);
    G.banner("YOU FELL", "respawning at the Hold…");
    G._respawnT = 1.4;
  };
  S.respawn = function (G) {
    const sp = G.world.holdSpawn();
    const p = G.player;
    p.x = sp.x; p.y = sp.y; p.vx = 0; p.vy = 0;
    p.hp = p.maxHp; p.alive = true; p.invulnT = 1.2;
    G.toast("Back at the Hold — your haul is intact.", "info");
  };

  P.systems = S;
})(window.PACT = window.PACT || {});
