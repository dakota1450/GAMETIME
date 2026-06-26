/* ============================================================
   THE PACT — GAME (orchestrator)
   Owns the shared state G, the loop, input->action, camera,
   update + render, and the save snapshot.
   ============================================================ */
(function (P) {
  "use strict";
  const D = P.data, U = P.util, S = P.systems, ui = P.ui;
  const { Player, Enemy } = P.entities;

  const G = {
    canvas: null, ctx: null, vw: 0, vh: 0,
    cam: { x: 0, y: 0 },
    world: null, player: null,
    enemies: [], projectiles: [], effects: [], pickups: [], deployables: [],
    module: null,
    stash: { chits: 0, items: {} },
    carried: {},
    carriedGear: [],
    equipped: {},
    parts: {},
    pendingClaim: null,
    deathCache: null,
    notice: 0, cycle: 1,
    unlocks: { maxHpBonus: 0, moveBonus: 0, dmgBonus: 0, pulseCdReduce: 0, satchelBonus: 0, carbine: false },
    med: 0,
    tool: "cutter",
    skills: [], skillPoints: 0, xp: 0, skillBonus: { maxHp: 0, dmg: 0, move: 0, backpack: 0, fireCdMul: 1, pulseCd: 0, mineMul: 1, regen: 0 },
    meals: {}, buffs: [], buffBonus: { dmg: 0, fireCdMul: 1, moveMul: 1, resist: 0, regen: 0, noticeMul: 1, mineMul: 1 },
    sidekicks: [],
    pity: 0,
    titansBeaten: [], deepCleared: false, deepActive: false,
    farm: { planted: false, growth: 0, ready: false },
    event: null,
    sweepActive: false, sweepCooldown: 0,
    keys: {}, mouse: { x: 0, y: 0 }, mouseActive: false, mouseDown: false, mineDown: false,
    started: false, lastT: 0, nearTarget: null,
    shakeT: 0, shakeMag: 0, shakeDur: 1,
    _pkBuf: {}, _pkPending: false,
  };

  // request a camera shake (keeps the strongest active one)
  G.shake = function (mag, dur) {
    const cur = G.shakeT > 0 ? G.shakeMag * (G.shakeT / G.shakeDur) : 0;
    if (mag >= cur) { G.shakeMag = mag; G.shakeT = dur; G.shakeDur = dur; }
  };

  /* ---------------- setup ---------------- */
  G.init = function () {
    G.canvas = document.getElementById("game-canvas");
    G.ctx = G.canvas.getContext("2d");
    G.zoom = D.world.zoom || 1;     // Core-Keeper close-up feel
    G.world = new P.World();
    G.resize();
    ui.init(G);
  };
  G.backpackCap = function () { return D.player.backpackBase + (G.unlocks.satchelBonus || 0) + (G.skillBonus ? G.skillBonus.backpack : 0); };
  G.canCarry = function () { return U.invTotal(G.carried) < G.backpackCap(); };
  G.resize = function () {
    G.vw = G.canvas.width = Math.floor(window.innerWidth);
    G.vh = G.canvas.height = Math.floor(window.innerHeight);
  };

  /* ---------------- new / load ---------------- */
  G.newGame = function () {
    G.cycle = 1;
    G.stash = { chits: 0, items: {} };
    G.carried = {};
    G.carriedGear = [];
    G.equipped = {};
    G.parts = {};
    G.pendingClaim = null;
    G.deathCache = null;
    G.notice = 0;
    G.unlocks = { maxHpBonus: 0, moveBonus: 0, dmgBonus: 0, pulseCdReduce: 0, satchelBonus: 0, carbine: false };
    G.med = 0;
    G.tool = "cutter";
    G.module = null; G.deployables = [];
    G.skills = []; G.skillPoints = 0; G.xp = 0; S.recomputeSkills(G);
    G.meals = {}; G.buffs = []; S.recomputeBuffs(G);
    G.sidekicks = []; G.pity = 0;
    G.titansBeaten = []; G.deepCleared = false; G.deepActive = false;
    G.farm = { planted: false, growth: 0, ready: false };
    G.event = null; G.sweepActive = false;
    G.world.generate(G.cycle);
    const sp = G.world.holdSpawn();
    G.player = new Player(sp.x, sp.y);
    G.player.alive = true;
    S.applyMaxHp(G); S.applySpeed(G);
    G.spawnCycleEnemies();
    G.beginPlay();
    G.toast("Welcome to the Hold. Exit a doorway to raid — [F] or right-click mines district nodes.", "info");
  };

  G.loadGame = function (snap) {
    G.cycle = snap.cycle || 1;
    G.stash = snap.stash || { chits: 0, items: {} };
    if (!G.stash.items) G.stash.items = {};
    G.carried = snap.carried || {};
    G.carriedGear = snap.carriedGear || [];
    G.equipped = snap.equipped || {};
    G.parts = snap.parts || {};
    G.pendingClaim = snap.pendingClaim || null;
    G.deathCache = snap.deathCache || null;
    G.notice = snap.notice || 0;
    G.unlocks = Object.assign({ maxHpBonus: 0, moveBonus: 0, dmgBonus: 0, pulseCdReduce: 0, satchelBonus: 0, carbine: false }, snap.unlocks || {});
    G.med = snap.med || 0;
    G.tool = snap.tool || "cutter";
    G.module = snap.module || null; G.deployables = [];
    G.skills = snap.skills || []; G.skillPoints = snap.skillPoints || 0; G.xp = snap.xp || 0; S.recomputeSkills(G);
    G.meals = snap.meals || {}; G.buffs = []; S.recomputeBuffs(G);   // cooked stock persists; live buffs don't
    G.sidekicks = snap.sidekicks || []; G.pity = snap.pity || 0;
    G.titansBeaten = snap.titansBeaten || []; G.deepCleared = !!snap.deepCleared; G.deepActive = false;
    G.farm = snap.farm || { planted: false, growth: 0, ready: false };
    G.event = null; G.sweepActive = false;
    G.world.generate(G.cycle);
    G.world.opened = snap.opened || {};
    const sp = G.world.holdSpawn();
    G.player = new Player(snap.player ? snap.player.x : sp.x, snap.player ? snap.player.y : sp.y);
    G.player.alive = true;
    S.applyMaxHp(G); S.applySpeed(G);
    if (snap.player && typeof snap.player.hp === "number") G.player.hp = U.clamp(snap.player.hp, 1, G.player.maxHp);
    G.spawnCycleEnemies();
    G.beginPlay();
    G.toast("Loaded — Cycle " + G.cycle, "info");
  };

  G.spawnCycleEnemies = function () {
    G.enemies = [];
    for (const sp of G.world.enemySpawns(G.cycle)) {
      const e = new Enemy(sp.type, sp.x, sp.y);
      S.scaleByDepth(G, e);                 // farther from the Hold = tougher (depth gradient)
      G.enemies.push(e);
    }
  };

  G.regenerateWorld = function () {
    G.world.generate(G.cycle);
    G.spawnCycleEnemies();
    G.projectiles = []; G.effects = []; G.pickups = []; G.deployables = []; G.event = null; G.sweepActive = false;
    const sp = G.world.holdSpawn();
    G.player.x = sp.x; G.player.y = sp.y;
  };

  G.beginPlay = function () {
    G.projectiles = []; G.effects = []; G.pickups = []; G.deployables = [];
    document.getElementById("titlescreen").classList.add("hidden");
    G.started = true;
    G.lastT = U.now();
    G.updateCamera();
  };

  /* ---------------- loop ---------------- */
  G.start = function () { requestAnimationFrame(G.frame); };
  G.frame = function () {
    requestAnimationFrame(G.frame);
    const t = U.now();
    let dt = t - G.lastT; G.lastT = t;
    if (dt > 0.05) dt = 0.05;
    if (G.started) {
      if (!ui.isOpen()) G.update(dt);
      G.render();
      ui.updateHud(G);
    }
  };

  /* ---------------- update ---------------- */
  G.update = function (dt) {
    const p = G.player;
    G._dt = dt;

    let mx = 0, my = 0;
    if (G.keys.KeyW || G.keys.ArrowUp) my -= 1;
    if (G.keys.KeyS || G.keys.ArrowDown) my += 1;
    if (G.keys.KeyA || G.keys.ArrowLeft) mx -= 1;
    if (G.keys.KeyD || G.keys.ArrowRight) mx += 1;
    const moving = (mx !== 0 || my !== 0);

    // ease velocity toward the input target (ramp up on press, glide on release)
    let tvx = 0, tvy = 0;
    if (moving) { const [nx, ny] = U.norm(mx, my); tvx = nx * p.speed; tvy = ny * p.speed; }
    const velEase = 1 - Math.exp(-(moving ? 16 : 22) * dt); // framerate-independent
    p.vx += (tvx - p.vx) * velEase;
    p.vy += (tvy - p.vy) * velEase;
    if (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1) G.world.moveBody(p, p.vx * dt, p.vy * dt);

    // facing rotates smoothly toward travel direction (no 8-way snap)
    if (U.len(p.vx, p.vy) > 6) {
      const [fx, fy] = U.norm(p.vx, p.vy);
      const fe = 1 - Math.exp(-14 * dt);
      const nfx = p.facing.x + (fx - p.facing.x) * fe, nfy = p.facing.y + (fy - p.facing.y) * fe;
      const fl = U.len(nfx, nfy) || 1;
      p.facing.x = nfx / fl; p.facing.y = nfy / fl;
    }

    // aim eases toward the mouse (or toward facing when keyboard-only)
    let tax = p.facing.x, tay = p.facing.y, aimRate = 16;
    if (G.mouseActive) {
      const ax = (G.cam.x + G.mouse.x / G.zoom) - p.x, ay = (G.cam.y + G.mouse.y / G.zoom) - p.y;
      if (U.len(ax, ay) > 2) { const [nx, ny] = U.norm(ax, ay); tax = nx; tay = ny; aimRate = 24; }
    }
    const ae = 1 - Math.exp(-aimRate * dt);
    const naimx = p.aim.x + (tax - p.aim.x) * ae, naimy = p.aim.y + (tay - p.aim.y) * ae;
    const al = U.len(naimx, naimy) || 1;
    p.aim.x = naimx / al; p.aim.y = naimy / al;

    if (G.keys.Space || G.mouseDown) S.fire(G);
    if (G.mineDown || G.keys.KeyF) S.mineSwing(G);

    if (U.len(p.vx, p.vy) > 18) p.walkT += dt * 9.5; else p.walkT *= 0.55;   // step-bounce cycle

    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.pulseCd > 0) p.pulseCd -= dt;
    if (p.moduleCd > 0) p.moduleCd -= dt;
    if (p.mineCd > 0) p.mineCd -= dt;
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (G.shakeT > 0) G.shakeT -= dt;
    if (G.sweepCooldown > 0) { G.sweepCooldown -= dt; if (G.sweepCooldown <= 0) G.sweepActive = false; }

    if (G.world.isSafeAtPx(p.x, p.y) && p.hp < p.maxHp) p.heal((D.player.holdRegen + (G.skillBonus ? G.skillBonus.regen : 0)) * dt);
    if (G.buffBonus.regen && p.hp < p.maxHp) p.heal(G.buffBonus.regen * dt);   // ration regen heals anywhere

    for (const e of G.enemies) if (!e.dead) e.update(dt, G);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      if (G.enemies[i].dead) {
        const dead = G.enemies[i];
        S.addEffect(G, { type: "burst", x: dead.x, y: dead.y, dur: dead.titan ? 0.6 : 0.4, col: dead.color, n: dead.titan ? 18 : 9, spread: dead.titan ? 64 : 28 });
        if (dead.titan) G.shake(8, 0.55);        // a felled titan rocks the screen
        S.enemyDrop(G, G.enemies[i]);            // killed enemies drop salvage
        if (G.enemies[i].titan) S.titanReward(G, G.enemies[i]);   // bosses drop a guaranteed haul
        G.stash.chits += G.enemies[i].def.xpChits;
        S.gainXp(G, G.enemies[i].def.xpChits);   // and Lien Points toward the skill tree
        G.enemies.splice(i, 1);
      }
    }

    for (const dp of G.deployables) dp.update(dt, G);
    G.deployables = G.deployables.filter(dp => !dp.dead);

    for (const pr of G.projectiles) pr.update(dt, G);
    G.projectiles = G.projectiles.filter(pr => !pr.dead);

    for (const pk of G.pickups) pk.update(dt, G);
    G.pickups = G.pickups.filter(pk => !pk.collected);

    for (const fx of G.effects) fx.t += dt;
    G.effects = G.effects.filter(fx => fx.t < fx.dur);

    S.updateBuffs(G, dt);
    S.updateNotice(G, dt, moving);

    if (p.hp <= 0) { S.die(G); return; }

    if (G.event && G.event.active && G.event.state === "fighting") {
      if (!G.enemies.some(e => e.fromEvent && !e.dead)) { S.eventWaveClear(G); ui.showEventCheckpoint(G); }
    }

    G.updatePrompt();
    G.updateCamera();
  };

  G.updatePrompt = function () {
    const p = G.player;
    const chest = G.world.chestNear(p.x, p.y, 44);
    const struct = G.world.structureNear(p.x, p.y, 48);
    const cache = G.deathCache;
    const cacheR = D.deathCache.recoverRadius;
    const dCache = cache ? U.dist2(p.x, p.y, cache.x, cache.y) : Infinity;
    let target = null, text = null;
    const dc = chest ? U.dist2(p.x, p.y, chest.x, chest.y) : Infinity;
    const ds = struct ? U.dist2(p.x, p.y, struct.x, struct.y) : Infinity;
    if (cache && dCache <= cacheR * cacheR && dCache <= dc && dCache <= ds) {
      target = { kind: "cache", ref: cache };
      text = "[E] Recover your dropped haul (" + cache.count + ")";
    } else if (dc < ds && chest) {
      target = { kind: "chest", ref: chest };
      text = S.chestLocked(G, chest) ? "[E] Locked — clear nearby enemies" : "[E] Open chest · Tier " + chest.tier;
    } else if (struct) {
      target = { kind: "struct", ref: struct };
      if (struct.type === "hydro") {
        text = G.farm.ready ? "[E] Harvest Organics"
             : G.farm.planted ? "[E] Growing… rest to mature"
             : "[E] Plant a Spore Seed";
      } else {
        text = "[E] " + ({
          storage: "Bank haul / open storage",
          fab: "Use Fab Bench",
          cook: "Cook rations at the Cookfire",
          casino: "Field Casino — gamble your haul",
          deepgate: G.deepCleared ? "The Deep is spent — you slipped the leash"
                  : (G.titansBeaten || []).length >= 5 ? "Descend into the Foreclosed Deep"
                  : "The Deep sleeps — fell district titans (" + (G.titansBeaten || []).length + "/5)",
          claim: G.pendingClaim ? "File Claim (haul seized)" : "Claim terminal (nothing owed)",
          cot: "Rest — heal & advance cycle",
          beacon: "Answer the Call",
        })[struct.type];
      }
    }
    G.nearTarget = target;
    ui.setPrompt(text);
  };

  G.interact = function () {
    const t = G.nearTarget;
    if (!t) return;
    if (t.kind === "cache") { S.recoverCache(G); return; }
    if (t.kind === "chest") { S.openChest(G, t.ref); return; }
    const s = t.ref;
    switch (s.type) {
      case "storage": ui.showStorage(G); break;
      case "fab": ui.showFab(G); break;
      case "cook": ui.showCookfire(G); break;
      case "casino": ui.showCasino(G); break;
      case "claim": ui.showClaim(G); break;
      case "cot": S.rest(G); break;
      case "hydro": if (G.farm.ready) S.harvestFarm(G); else if (!G.farm.planted) S.plant(G); else G.toast("Crop still growing — rest at the Cot", "info"); break;
      case "deepgate": S.startDeep(G); break;
      case "beacon": S.startEvent(G); break;
    }
  };

  G.onPickup = function (itemId) {
    G._pkBuf[itemId] = (G._pkBuf[itemId] || 0) + 1;
    if (!G._pkPending) {
      G._pkPending = true;
      setTimeout(() => {
        const parts = Object.keys(G._pkBuf).map(k => D.items[k].name + " ×" + G._pkBuf[k]).join(", ");
        if (parts) G.toast("Picked up: " + parts, "good");
        G._pkBuf = {}; G._pkPending = false;
      }, 500);
    }
  };

  // dishes you currently have portions of, in data order — drives the mess-kit hotkeys
  G.mealOrder = function () { return D.cooking.filter(d => (G.meals[d.id] || 0) > 0).map(d => d.id); };
  G.eatByIndex = function (i) { const id = G.mealOrder()[i - 1]; if (id) S.eatMeal(G, id); };

  /* ---------------- input router ---------------- */
  G.action = function (type, arg) {
    if (type === "cancel") { if (ui.isOpen()) ui.closeOverlay(G); return; }
    if (type === "backpack") {            // toggle the backpack view
      if (ui.isOpen()) ui.closeOverlay(G); else if (G.started) ui.showBackpack(G);
      return;
    }
    if (type === "skills") {              // toggle the Liens skill tree
      if (ui.isOpen()) ui.closeOverlay(G); else if (G.started) ui.showSkills(G);
      return;
    }
    if (!G.started || ui.isOpen()) return;
    switch (type) {
      case "pulse": S.pulse(G); break;
      case "module": S.deployModule(G); break;
      case "med": S.useMed(G); break;
      case "eat": G.eatByIndex(arg); break;
      case "interact": G.interact(); break;
    }
  };

  G.onGearPickup = function (gear) {
    const col = D.gearRarity[gear.rarity].color;
    G.toast("Found gear: " + S.gearName(gear) + " — open Backpack [B] to equip", "good");
    G.banner('<span style="color:' + col + '">' + S.gearName(gear) + "</span>", gear.affixes.length + " affix" + (gear.affixes.length === 1 ? "" : "es"));
  };

  G.onBackpackFull = function () {
    if (G._bpFullT && U.now() - G._bpFullT < 3) return;
    G._bpFullT = U.now();
    G.toast("Backpack full — head home and bank your haul", "bad");
  };

  /* ---------------- camera ---------------- */
  G.updateCamera = function () {
    const w = G.world, vw = G.vw / G.zoom, vh = G.vh / G.zoom;
    const tx = (w.pxW <= vw) ? (w.pxW - vw) / 2 : U.clamp(G.player.x - vw / 2, 0, w.pxW - vw);
    const ty = (w.pxH <= vh) ? (w.pxH - vh) / 2 : U.clamp(G.player.y - vh / 2, 0, w.pxH - vh);
    // smooth follow (Core Keeper-style), but snap on big jumps (respawn/cycle/teleport)
    if (Math.hypot(tx - G.cam.x, ty - G.cam.y) > vw) { G.cam.x = tx; G.cam.y = ty; }
    else { const e = 1 - Math.exp(-13 * (G._dt || 0.016)); G.cam.x += (tx - G.cam.x) * e; G.cam.y += (ty - G.cam.y) * e; }
  };

  /* ---------------- render ---------------- */
  G.render = function () {
    const ctx = G.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#04060a";
    ctx.fillRect(0, 0, G.vw, G.vh);

    // camera shake — offset the cam uniformly so world + lights + entities move together
    let sxo = 0, syo = 0;
    if (G.shakeT > 0) {
      const m = G.shakeMag * (G.shakeT / G.shakeDur);
      sxo = (Math.random() - 0.5) * m * 2; syo = (Math.random() - 0.5) * m * 2;
      G.cam.x += sxo; G.cam.y += syo;
    }

    ctx.save();
    ctx.scale(G.zoom, G.zoom);             // zoom the whole world view in
    ctx.imageSmoothingEnabled = false;     // crisp pixel-art scaling
    const vwW = G.vw / G.zoom, vhW = G.vh / G.zoom;
    G.world.render(ctx, G.cam, vwW, vhW);
    G.drawChests(ctx, vwW, vhW);
    G.drawDeathCache(ctx, vwW, vhW);
    for (const pk of G.pickups) pk.draw(ctx, G.cam);
    for (const dp of G.deployables) dp.draw(ctx, G.cam);
    for (const fx of G.effects) G.drawEffect(ctx, fx);
    for (const pr of G.projectiles) pr.draw(ctx, G.cam);
    for (const e of G.enemies) if (!e.dead) {
      P.lighting.shadow(ctx, e.x - G.cam.x, e.y - G.cam.y + e.radius * 0.7, e.radius * 1.05);
      e.draw(ctx, G.cam);
    }
    P.lighting.shadow(ctx, G.player.x - G.cam.x, G.player.y - G.cam.y + G.player.radius * 0.8, G.player.radius * 1.15);
    G.player.draw(ctx, G.cam);
    ctx.restore();

    P.lighting.frame(G, ctx, G.cam, G.vw, G.vh);   // dynamic darkness + light pools + bloom
    G.world.renderMotes(ctx, G.vw, G.vh, G.world.regionAtPx(G.player.x, G.player.y)); // drifting biome motes
    G.drawTitanBar(ctx);                            // boss health bar when a titan is near
    G.drawCacheIndicator(ctx);                      // off-screen pointer stays above the dark

    if (sxo || syo) { G.cam.x -= sxo; G.cam.y -= syo; }   // undo the shake offset
  };

  // the dropped-haul marker, in world space (a pulsing salvage pack)
  G.drawDeathCache = function (ctx, vwW, vhW) {
    const c = G.deathCache;
    if (!c) return;
    const x = c.x - G.cam.x, y = c.y - G.cam.y;
    if (x < -40 || y < -40 || x > vwW + 40 || y > vhW + 40) return;   // off-screen → indicator handles it
    const pulse = 0.5 + 0.5 * Math.sin(U.now() * 3);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = "rgba(255,90,110," + (0.45 + 0.4 * pulse) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 13 + pulse * 6, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowColor = "#ff5a6e"; ctx.shadowBlur = 12 * (0.6 + pulse * 0.4);
    ctx.fillStyle = "#1a1014"; ctx.fillRect(-8, -7, 16, 14);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffae6b"; ctx.lineWidth = 2; ctx.strokeRect(-8, -7, 16, 14);
    ctx.fillStyle = "#ffae6b"; ctx.fillRect(-8, -7, 16, 4);
    ctx.restore();
  };

  // boss health bar — shown when a foreclosure-titan is near (engaged or already hurt)
  G.drawTitanBar = function (ctx) {
    let titan = null, bd = Infinity;
    for (const e of G.enemies) {
      if (e.dead || !e.titan) continue;
      const d = U.dist2(e.x, e.y, G.player.x, G.player.y);
      if (d < bd) { bd = d; titan = e; }
    }
    if (!titan) return;
    const near = bd < 600 * 600, hurt = titan.hp < titan.maxHp;
    if (!near && !hurt) return;
    const w = Math.min(440, G.vw * 0.5), h = 15, x = (G.vw - w) / 2, y = 96;  // below the top HUD row
    ctx.save();
    ctx.fillStyle = "rgba(8,8,12,0.82)"; ctx.fillRect(x - 4, y - 21, w + 8, h + 27);
    ctx.strokeStyle = titan.color; ctx.lineWidth = 1.5; ctx.strokeRect(x - 4, y - 21, w + 8, h + 27);
    ctx.fillStyle = titan.color; ctx.font = "bold 13px 'Pixelify Sans', Consolas, monospace"; ctx.textAlign = "center";
    ctx.fillText(titan.def.name.toUpperCase(), G.vw / 2, y - 7);
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x, y, w, h);
    const frac = U.clamp(titan.hp / titan.maxHp, 0, 1);
    ctx.fillStyle = titan.color; ctx.fillRect(x, y, w * frac, h);
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "10px Consolas, monospace";
    ctx.fillText(Math.max(0, Math.ceil(titan.hp)) + " / " + titan.maxHp, G.vw / 2, y + h - 4);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h);
    ctx.textAlign = "left";
    ctx.restore();
  };

  // when the cache is off-screen, point to it from the screen edge
  G.drawCacheIndicator = function (ctx) {
    const c = G.deathCache;
    if (!c) return;
    const sx = (c.x - G.cam.x) * G.zoom, sy = (c.y - G.cam.y) * G.zoom;
    if (sx >= -10 && sy >= -10 && sx <= G.vw + 10 && sy <= G.vh + 10) return;  // on-screen → world marker shows
    const cx = G.vw / 2, cy = G.vh / 2, m = 48;
    const ang = Math.atan2(sy - cy, sx - cx);
    const ex = U.clamp(cx + Math.cos(ang) * (cx - m), m, G.vw - m);
    const ey = U.clamp(cy + Math.sin(ang) * (cy - m), m, G.vh - m);
    const pulse = 0.5 + 0.5 * Math.sin(U.now() * 3);
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(ang);
    ctx.fillStyle = "rgba(255,90,110," + (0.7 + 0.3 * pulse) + ")";
    ctx.beginPath(); ctx.moveTo(13, 0); ctx.lineTo(-9, -8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle = "rgba(255,174,107,0.9)"; ctx.font = "10px Consolas, monospace"; ctx.textAlign = "center";
    ctx.fillText("HAUL", ex, ey + (ey < cy ? 18 : -12));
    ctx.restore();
  };

  G.drawChests = function (ctx, vwW, vhW) {
    const tnow = U.now();
    for (const ch of G.world.chests) {
      if (G.world.opened[ch.id]) continue;
      const x = ch.x - G.cam.x, y = ch.y - G.cam.y;
      if (x < -40 || y < -40 || x > vwW + 40 || y > vhW + 40) continue;
      P.lighting.shadow(ctx, x, y + 9, 13);
      const locked = S.chestLocked(G, ch);
      const col = locked ? "#ff5a6e" : "#ffcf6b";
      const pulse = 0.6 + 0.4 * Math.sin(tnow * 3 + ch.x * 0.04);
      if (P.assets && P.assets.has("chest")) {
        ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = (locked ? 6 : 14) * pulse;
        P.assets.draw(ctx, "chest", x, y, 30);
        ctx.restore();
        if (locked) { ctx.fillStyle = col; ctx.fillRect(x - 2, y - 3, 4, 6); ctx.fillRect(x - 4, y - 5, 8, 3); }
        continue;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = col; ctx.shadowBlur = (locked ? 8 : 14) * pulse;
      ctx.fillStyle = "rgba(8,10,16,0.95)";
      ctx.fillRect(-11, -8, 22, 16);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(-11, -8, 22, 16);
      ctx.fillStyle = col;
      ctx.fillRect(-11, -8, 22, 4);                 // lid
      if (locked) { ctx.fillStyle = col; ctx.fillRect(-2, -2, 4, 6); ctx.fillRect(-4, -4, 8, 3); } // padlock
      ctx.restore();
    }
  };

  G.drawEffect = function (ctx, fx) {
    const x = fx.x - G.cam.x, y = fx.y - G.cam.y, k = fx.t / fx.dur;
    if (fx.type === "pulse") {
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = "#6ea8ff"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, fx.radius * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (fx.type === "muzzle") {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = "#bff6f0";
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (fx.type === "spark") {            // mining / bullet impact debris
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = fx.col || "#ffcf6b";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + fx.x;
        const d = 3 + k * 12;
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2);
      }
      ctx.restore();
    } else if (fx.type === "burst") {            // enemy death burst — flung debris + ring
      const n = fx.n || 9, spread = fx.spread || 28;
      ctx.save();
      ctx.fillStyle = fx.col || "#ffffff";
      ctx.globalAlpha = 1 - k;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + fx.x * 0.5;
        const d = 4 + k * spread;
        const sz = 3 * (1 - k) + 1;
        ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz);
      }
      ctx.globalAlpha = (1 - k) * 0.55; ctx.strokeStyle = fx.col || "#ffffff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, k * spread, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };

  G.drawVignette = function (ctx) {
    const safe = G.world.isSafeAtPx(G.player.x, G.player.y);
    const grad = ctx.createRadialGradient(G.vw / 2, G.vh / 2, Math.min(G.vw, G.vh) * 0.35,
      G.vw / 2, G.vh / 2, Math.max(G.vw, G.vh) * 0.75);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, safe ? "rgba(0,0,0,0.32)" : "rgba(4,2,8,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, G.vw, G.vh);
  };

  /* ---------------- callbacks ---------------- */
  G.toast = function (msg, kind) { ui.toast(msg, kind); };
  G.banner = function (title, sub) { ui.banner(title, sub); };
  G.endEvent = function (completed) {
    if (!G.event) return;
    G.event = null;
    G.enemies = G.enemies.filter(e => !e.fromEvent);
  };

  /* ---------------- save ---------------- */
  G.snapshot = function () {
    return {
      v: 2, cycle: G.cycle,
      stash: G.stash, carried: G.carried, carriedGear: G.carriedGear, equipped: G.equipped, parts: G.parts,
      pendingClaim: G.pendingClaim, deathCache: G.deathCache,
      notice: G.notice, unlocks: G.unlocks, med: G.med, tool: G.tool, module: G.module, meals: G.meals,
      skills: G.skills, skillPoints: G.skillPoints, xp: G.xp, farm: G.farm, sidekicks: G.sidekicks, pity: G.pity,
      titansBeaten: G.titansBeaten, deepCleared: G.deepCleared,
      opened: G.world.opened,
      player: { x: G.player.x, y: G.player.y, hp: G.player.hp },
    };
  };
  G.persist = function () {
    const ok = P.save.write(G.snapshot());
    if (!ok && !G._saveWarned) {
      G._saveWarned = true;
      G.toast("Save failed — check browser storage settings. Progress may not persist.", "bad");
    }
  };

  P.game = G;
})(window.PACT = window.PACT || {});
