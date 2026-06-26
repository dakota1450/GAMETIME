/* ============================================================
   THE PACT — GAME (orchestrator)
   Shared state G, the loop, input->action, the inventory + hotbar
   model, camera, update + render order, and the save snapshot.
   ============================================================ */
(function (P) {
  "use strict";
  const D = P.data, U = P.util, S = P.systems, ui = P.ui;
  const { Player } = P.entities;
  const TILE = D.world.TILE;
  const INV_SLOTS = 40, HOTBAR = 10;

  const G = {
    canvas: null, ctx: null, vw: 0, vh: 0, zoom: 1,
    cam: { x: 0, y: 0 },
    world: null, player: null,
    enemies: [], projectiles: [], effects: [], pickups: [],
    inv: new Array(INV_SLOTS).fill(null),
    stash: {},
    sel: 0,
    selBox: null, curTarget: null,
    keys: {}, mouse: { x: 0, y: 0 }, mouseActive: false, mouseDown: false, mineDown: false,
    started: false, lastT: 0, nearStation: null,
    shakeT: 0, shakeMag: 0, shakeDur: 1,
    _respawnT: 0, _toastT: 0,
  };

  G.shake = function (mag, dur) {
    const cur = G.shakeT > 0 ? G.shakeMag * (G.shakeT / G.shakeDur) : 0;
    if (mag >= cur) { G.shakeMag = mag; G.shakeT = dur; G.shakeDur = dur; }
  };

  /* ---------------- inventory model ---------------- */
  G.addItem = function (item, n) {
    n = n || 1;
    const def = D.items[item]; const max = (def && def.max) || 999;
    for (let i = 0; i < INV_SLOTS; i++) { const s = G.inv[i]; if (s && s.item === item && s.n < max) { const add = Math.min(n, max - s.n); s.n += add; n -= add; if (n <= 0) return; } }
    for (let i = 0; i < INV_SLOTS && n > 0; i++) { if (!G.inv[i]) { const add = Math.min(n, max); G.inv[i] = { item, n: add }; n -= add; } }
  };
  G.countItem = function (item) { let t = 0; for (const s of G.inv) if (s && s.item === item) t += s.n; return t; };
  G.takeItem = function (item, n) {
    n = n || 1;
    for (let i = 0; i < INV_SLOTS && n > 0; i++) { const s = G.inv[i]; if (s && s.item === item) { const take = Math.min(n, s.n); s.n -= take; n -= take; if (s.n <= 0) G.inv[i] = null; } }
  };
  G.hasCost = function (cost) { for (const k in cost) if (G.countItem(k) < cost[k]) return false; return true; };
  G.takeCost = function (cost) { for (const k in cost) G.takeItem(k, cost[k]); };
  G.selectedStack = function () { return G.inv[G.sel] || null; };

  /* ---- storage stash (safe from death) ---- */
  G.deposit = function (item) { const n = G.countItem(item); if (n <= 0) return; G.takeItem(item, n); G.stash[item] = (G.stash[item] || 0) + n; };
  G.withdraw = function (item) { const n = G.stash[item] || 0; if (n <= 0) return; delete G.stash[item]; G.addItem(item, n); };
  G.depositMats = function () {
    for (let i = 0; i < INV_SLOTS; i++) { const s = G.inv[i]; if (!s) continue; const it = D.items[s.item]; if (it.kind === "tool" || it.kind === "weapon") continue; G.stash[s.item] = (G.stash[s.item] || 0) + s.n; G.inv[i] = null; }
  };
  G.quickHeal = function () {
    let best = null, bi = -1;
    for (let i = 0; i < INV_SLOTS; i++) { const s = G.inv[i]; if (!s) continue; const it = D.items[s.item]; if (it && it.kind === "consumable") { if (!best || it.heal > best.heal) { best = it; bi = i; } } }
    if (bi < 0) { G.toast("No bandages — craft some at the Tinker Bench", "info"); return; }
    S.consume(G, bi);
  };

  /* ---------------- setup ---------------- */
  G.init = function () {
    G.canvas = document.getElementById("game-canvas");
    G.ctx = G.canvas.getContext("2d");
    G.zoom = D.world.zoom || 2;
    G.world = new P.World();
    G.resize();
    ui.init(G);
  };
  G.resize = function () { G.vw = G.canvas.width = Math.floor(window.innerWidth); G.vh = G.canvas.height = Math.floor(window.innerHeight); };

  /* ---------------- new / load ---------------- */
  G.newGame = function () {
    G.inv = new Array(INV_SLOTS).fill(null);
    G.stash = {};
    G.sel = 0;
    G.world.edits = {}; G.world.builtStations = {};
    G.world.generate();
    for (const st of D.player.starting) G.addItem(st.item, st.n);
    const sp = G.world.holdSpawn();
    G.player = new Player(sp.x, sp.y);
    S.populate(G);
    G.beginPlay();
    G.toast("Dig out with your pickaxe — gather Copper to forge better tools.", "info");
    G.banner("THE HOLD", "carve deeper, climb the tier ladder");
  };

  G.loadGame = function (snap) {
    G.inv = new Array(INV_SLOTS).fill(null);
    if (snap.inv) for (let i = 0; i < snap.inv.length && i < INV_SLOTS; i++) G.inv[i] = snap.inv[i] ? { item: snap.inv[i].item, n: snap.inv[i].n } : null;
    G.stash = snap.stash || {};
    G.sel = snap.sel || 0;
    G.world.loadEdits(snap.edits || {});
    G.world.builtStations = snap.builtStations || {};
    G.world.generate();
    const sp = G.world.holdSpawn();
    G.player = new Player(snap.player ? snap.player.x : sp.x, snap.player ? snap.player.y : sp.y);
    if (snap.player && typeof snap.player.hp === "number") G.player.hp = U.clamp(snap.player.hp, 1, G.player.maxHp);
    S.populate(G);
    G.beginPlay();
    G.toast("Loaded your dig.", "info");
  };

  G.beginPlay = function () {
    G.projectiles = []; G.effects = []; G.pickups = [];
    document.getElementById("titlescreen").classList.add("hidden");
    G.started = true; G.lastT = U.now();
    G.updateCamera();
  };

  /* ---------------- loop ---------------- */
  G.start = function () { requestAnimationFrame(G.frame); };
  G.frame = function () {
    requestAnimationFrame(G.frame);
    const t = U.now(); let dt = t - G.lastT; G.lastT = t;
    if (dt > 0.05) dt = 0.05;
    if (G.started) {
      if (!ui.isOpen()) G.update(dt);
      G.render();
      ui.updateHud(G);
    }
  };

  /* ---------------- update ---------------- */
  G.update = function (dt) {
    const p = G.player; G._dt = dt;

    if (!p.alive) {
      G._respawnT -= dt;
      if (G.shakeT > 0) G.shakeT -= dt;
      if (G._respawnT <= 0) S.respawn(G);
      G.updateCamera();
      return;
    }

    let mx = 0, my = 0;
    if (G.keys.KeyW || G.keys.ArrowUp) my -= 1;
    if (G.keys.KeyS || G.keys.ArrowDown) my += 1;
    if (G.keys.KeyA || G.keys.ArrowLeft) mx -= 1;
    if (G.keys.KeyD || G.keys.ArrowRight) mx += 1;
    const moving = (mx !== 0 || my !== 0);

    let tvx = 0, tvy = 0;
    if (moving) { const [nx, ny] = U.norm(mx, my); tvx = nx * p.speed; tvy = ny * p.speed; }
    const velEase = 1 - Math.exp(-(moving ? 21 : 26) * dt);
    p.vx += (tvx - p.vx) * velEase; p.vy += (tvy - p.vy) * velEase;
    if (Math.abs(p.vx) > 1 || Math.abs(p.vy) > 1) G.world.moveBody(p, p.vx * dt, p.vy * dt);

    if (U.len(p.vx, p.vy) > 6) {
      const [fx, fy] = U.norm(p.vx, p.vy);
      const fe = 1 - Math.exp(-16 * dt);
      const nfx = p.facing.x + (fx - p.facing.x) * fe, nfy = p.facing.y + (fy - p.facing.y) * fe;
      const fl = U.len(nfx, nfy) || 1; p.facing.x = nfx / fl; p.facing.y = nfy / fl;
    }
    // aim toward the mouse (snaps fast), else toward facing
    let tax = p.facing.x, tay = p.facing.y, aimRate = 16;
    if (G.mouseActive) {
      const ax = (G.cam.x + G.mouse.x / G.zoom) - p.x, ay = (G.cam.y + G.mouse.y / G.zoom) - p.y;
      if (U.len(ax, ay) > 2) { const [nx, ny] = U.norm(ax, ay); tax = nx; tay = ny; aimRate = 26; }
    }
    const ae = 1 - Math.exp(-aimRate * dt);
    const naimx = p.aim.x + (tax - p.aim.x) * ae, naimy = p.aim.y + (tay - p.aim.y) * ae;
    const al = U.len(naimx, naimy) || 1; p.aim.x = naimx / al; p.aim.y = naimy / al;

    // primary action (selected slot) + convenience quick-mine
    if (G.mouseDown || G.keys.Space) S.primary(G);
    if (G.mineDown || G.keys.KeyF) S.quickMine(G);

    if (U.len(p.vx, p.vy) > 18) p.walkT += dt * 9.5; else p.walkT *= 0.55;
    if (p.swingT > 0) p.swingT -= dt;
    if (p.mineCd > 0) p.mineCd -= dt;
    if (p.attackCd > 0) p.attackCd -= dt;
    if (p.placeCd > 0) p.placeCd -= dt;
    if (p.invulnT > 0) p.invulnT -= dt;
    if (p.hitFlash > 0) p.hitFlash -= dt;
    if (G.shakeT > 0) G.shakeT -= dt;

    if (G.world.isSafeAtPx(p.x, p.y) && p.hp < p.maxHp) p.heal(D.player.holdRegen * dt);

    for (const e of G.enemies) if (!e.dead) e.update(dt, G);
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.dead) {
        S.addEffect(G, { type: "burst", x: e.x, y: e.y, dur: 0.4, col: e.color, n: 9, spread: 26 });
        S.enemyDrop(G, e);
        G.enemies.splice(i, 1);
      }
    }
    S.tickSpawns(G, dt);

    for (const pr of G.projectiles) pr.update(dt, G);
    G.projectiles = G.projectiles.filter(pr => !pr.dead);
    for (const pk of G.pickups) pk.update(dt, G);
    G.pickups = G.pickups.filter(pk => !pk.collected);
    for (const fx of G.effects) fx.t += dt;
    G.effects = G.effects.filter(fx => fx.t < fx.dur);

    if (p.hp <= 0) { S.die(G); return; }

    G.updateSelection();
    G.updatePrompt();
    G.updateCamera();
  };

  // compute the highlighted target tile from the selected item + cursor
  G.updateSelection = function () {
    const st = G.selectedStack();
    const it = st ? D.items[st.item] : null;
    if (it && (it.kind === "block" || it.kind === "torch")) {
      const tgt = S.placeTargetTile(G);
      G.selBox = { c: tgt.c, r: tgt.r, place: true };
    } else {
      const reach = (it && it.kind === "tool" && it.tool) ? it.tool.reach : D.player.reach;
      const tgt = S.mineTargetTile(G, reach);
      if (G.world.wallAt(tgt.c, tgt.r) !== 0) {
        const block = D.blocks[G.world.wallAt(tgt.c, tgt.r)];
        let power = 0;
        for (const s of G.inv) { if (!s) continue; const i2 = D.items[s.item]; if (i2 && i2.kind === "tool" && i2.tool) power = Math.max(power, i2.tool.power); }
        G.selBox = { c: tgt.c, r: tgt.r, ok: G.world.canMine(block, power) };
      } else G.selBox = null;
    }
  };

  G.updatePrompt = function () {
    const p = G.player;
    const s = G.world.stationNear(p.x, p.y, 40);
    G.nearStation = s;
    if (s && (s.type === "furnace" || s.type === "tinker" || s.type === "anvil" || s.type === "forge")) ui.setPrompt("[E] Use " + s.name);
    else if (s && s.type === "storage") ui.setPrompt("[E] Storage (deposit)");
    else if (s && s.type === "bed") ui.setPrompt("[E] Rest — heal up");
    else ui.setPrompt(null);
  };

  G.interact = function () {
    const s = G.nearStation;
    if (!s) return;
    if (s.type === "furnace" || s.type === "tinker" || s.type === "anvil" || s.type === "forge") ui.showCrafting(G, s.type);
    else if (s.type === "storage") ui.showStorage(G);
    else if (s.type === "bed") { G.player.heal(G.player.maxHp); G.toast("Rested. Vitality restored.", "good"); P.audio && P.audio.play("heal"); }
  };

  /* ---------------- input router ---------------- */
  G.action = function (type, arg) {
    if (type === "cancel") { if (ui.isOpen()) ui.closeOverlay(G); return; }
    if (type === "inventory") { if (ui.isOpen()) ui.closeOverlay(G); else if (G.started) ui.showInventory(G); return; }
    if (!G.started) return;
    if (type === "selectSlot") { if (!ui.isOpen()) G.sel = U.clamp(arg, 0, HOTBAR - 1); return; }
    if (type === "scrollSel") { if (!ui.isOpen()) { G.sel = (G.sel + arg + HOTBAR) % HOTBAR; } return; }
    if (ui.isOpen()) return;
    if (type === "interact") G.interact();
    else if (type === "heal") G.quickHeal();
  };

  /* ---------------- camera ---------------- */
  G.updateCamera = function () {
    const w = G.world, vw = G.vw / G.zoom, vh = G.vh / G.zoom;
    const tx = U.clamp(G.player.x - vw / 2, 0, w.pxW - vw);
    const ty = U.clamp(G.player.y - vh / 2, 0, w.pxH - vh);
    if (Math.hypot(tx - G.cam.x, ty - G.cam.y) > vw) { G.cam.x = tx; G.cam.y = ty; }
    else { const e = 1 - Math.exp(-13 * (G._dt || 0.016)); G.cam.x += (tx - G.cam.x) * e; G.cam.y += (ty - G.cam.y) * e; }
  };

  /* ---------------- render ---------------- */
  G.render = function () {
    const ctx = G.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#04060a"; ctx.fillRect(0, 0, G.vw, G.vh);

    let sxo = 0, syo = 0;
    if (G.shakeT > 0) { const m = G.shakeMag * (G.shakeT / G.shakeDur); sxo = (Math.random() - 0.5) * m * 2; syo = (Math.random() - 0.5) * m * 2; G.cam.x += sxo; G.cam.y += syo; }

    ctx.save();
    ctx.scale(G.zoom, G.zoom);
    ctx.imageSmoothingEnabled = false;
    const vwW = G.vw / G.zoom, vhW = G.vh / G.zoom;
    G.world.render(ctx, G.cam, vwW, vhW, G.selBox);
    for (const pk of G.pickups) pk.draw(ctx, G.cam);
    for (const fx of G.effects) G.drawEffect(ctx, fx);
    for (const pr of G.projectiles) pr.draw(ctx, G.cam);
    for (const e of G.enemies) if (!e.dead) { P.lighting.shadow(ctx, e.x - G.cam.x, e.y - G.cam.y + e.radius * 0.7, e.radius * 1.05); e.draw(ctx, G.cam); }
    if (G.player.alive) { P.lighting.shadow(ctx, G.player.x - G.cam.x, G.player.y - G.cam.y + G.player.radius * 0.8, G.player.radius * 1.15); G.player.draw(ctx, G.cam); }
    ctx.restore();

    P.lighting.frame(G, ctx, G.cam, G.vw, G.vh);
    G.world.renderMotes(ctx, G.vw, G.vh, G.world.biomeAtPx(G.player.x, G.player.y));

    if (sxo || syo) { G.cam.x -= sxo; G.cam.y -= syo; }
  };

  G.drawEffect = function (ctx, fx) {
    const x = fx.x - G.cam.x, y = fx.y - G.cam.y, k = fx.t / fx.dur;
    if (fx.type === "muzzle") {
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = "#bff6f0";
      ctx.beginPath(); ctx.arc(x, y, 5, 0, 6.28); ctx.fill(); ctx.restore();
    } else if (fx.type === "spark") {
      ctx.save(); ctx.globalAlpha = 1 - k; ctx.fillStyle = fx.col || "#ffcf6b";
      for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.28 + fx.x; const d = 3 + k * 12; ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 2, 2); }
      ctx.restore();
    } else if (fx.type === "burst") {
      const n = fx.n || 9, spread = fx.spread || 26;
      ctx.save(); ctx.fillStyle = fx.col || "#fff"; ctx.globalAlpha = 1 - k;
      for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + fx.x * 0.5; const d = 4 + k * spread; const sz = 3 * (1 - k) + 1; ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, sz, sz); }
      ctx.globalAlpha = (1 - k) * 0.5; ctx.strokeStyle = fx.col || "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, k * spread, 0, 6.28); ctx.stroke(); ctx.restore();
    }
  };

  /* ---------------- toasts / banner passthrough ---------------- */
  G.toast = function (msg, kind) { ui.toast(msg, kind); };
  G.toastThrottled = function (msg, kind) { const t = U.now(); if (t - G._toastT < 1.4) return; G._toastT = t; ui.toast(msg, kind); };
  G.banner = function (title, sub) { ui.banner(title, sub); };

  /* ---------------- save ---------------- */
  G.snapshot = function () {
    return {
      v: 3,
      inv: G.inv.map(s => s ? { item: s.item, n: s.n } : null),
      stash: G.stash,
      sel: G.sel,
      edits: G.world.edits,
      builtStations: G.world.builtStations,
      player: { x: G.player.x, y: G.player.y, hp: G.player.hp },
    };
  };
  G.persist = function () { P.save.write(G.snapshot()); };

  P.game = G;
})(window.PACT = window.PACT || {});
