/* ============================================================
   THE PACT — UI
   Drives the DOM HUD + overlay menus. The canvas renders only the
   world; everything readable (bars, carry list, menus, prompts,
   toasts, banners) lives here so it's easy to restyle.
   ============================================================ */
(function (P) {
  "use strict";
  const D = P.data, U = P.util, S = P.systems;
  const ui = {};
  let el = {};

  ui.init = function (G) {
    el = {
      regionName: document.getElementById("region-name"),
      depthTier: document.getElementById("depth-tier"),
      cycleNum: document.getElementById("cycle-num"),
      chits: document.getElementById("chits-num"),
      healthFill: document.getElementById("health-fill"),
      healthText: document.getElementById("health-text"),
      noticeFill: document.getElementById("notice-fill"),
      noticeText: document.getElementById("notice-text"),
      carryList: document.getElementById("carry-list"),
      medCount: document.getElementById("med-count"),
      slotPulse: document.getElementById("slot-pulse"),
      slotMed: document.getElementById("slot-med"),
      prompt: document.getElementById("prompt"),
      toasts: document.getElementById("toasts"),
      banner: document.getElementById("banner"),
      overlay: document.getElementById("overlay"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayBody: document.getElementById("overlay-body"),
      overlayClose: document.getElementById("overlay-close"),
      regionBadge: document.getElementById("region-badge"),
      carryTitle: document.querySelector("#carry-panel .carry-title"),
    };
    // cooldown overlay for the pulse gadget
    const cool = document.createElement("div");
    cool.className = "cool-overlay";
    el.slotPulse.appendChild(cool);
    el.pulseCool = cool;

    // deployable Module slot (R) — hidden until a Module is unlocked at the Fab Bench
    const ms = document.createElement("div");
    ms.className = "gadget-slot"; ms.id = "slot-module"; ms.style.display = "none";
    ms.innerHTML = '<span class="key">R</span><span class="g-name" id="module-name">Module</span>';
    const mcool = document.createElement("div"); mcool.className = "cool-overlay";
    ms.appendChild(mcool);
    el.slotMed.parentNode.insertBefore(ms, el.slotMed);   // sits between Pulse and Med
    el.slotModule = ms;
    el.moduleName = document.getElementById("module-name");
    el.moduleCool = mcool;

    // always-visible Loadout / Skills access bar (easy to find your gear & tree)
    const bar = document.createElement("div");
    bar.id = "action-bar";
    bar.innerHTML =
      '<button id="ab-load" class="ab-btn"><span class="key">B</span> LOADOUT</button>' +
      '<button id="ab-skill" class="ab-btn"><span class="key">K</span> SKILLS<span id="ab-pts"></span></button>';
    document.getElementById("hud").appendChild(bar);
    el.abSkill = document.getElementById("ab-skill");
    el.abPts = document.getElementById("ab-pts");
    document.getElementById("ab-load").addEventListener("click", () => G.action("backpack"));
    el.abSkill.addEventListener("click", () => G.action("skills"));

    // mess-kit belt: cooked rations above the gadget slots, click or hotkey 1-5 to eat
    const mess = document.createElement("div");
    mess.id = "mess-kit";
    document.getElementById("hud").appendChild(mess);
    el.messKit = mess;
    mess.addEventListener("click", (e) => {
      const slot = e.target.closest("[data-dish]");
      if (slot) S.eatMeal(G, slot.getAttribute("data-dish"));
    });

    // active-buff pips (timed ration effects) — bottom-left, above the bars
    const bb = document.createElement("div");
    bb.id = "buff-bar";
    document.getElementById("hud").appendChild(bb);
    el.buffBar = bb;

    el.overlayClose.addEventListener("click", () => ui.closeOverlay(G));
    this.G = G;
  };

  ui.updateHud = function (G) {
    const biome = G.world.biomeAtPx(G.player.x, G.player.y);
    const depth = G.world.depthAtPx(G.player.x, G.player.y);
    el.regionName.textContent = biome.name;
    el.depthTier.textContent = depth === 0 ? "SAFE HAVEN" : "DEPTH " + depth.toFixed(1) + " · " + biome.blurb;
    el.regionBadge.style.borderLeftColor = biome.accent;
    el.cycleNum.textContent = G.cycle;
    el.chits.textContent = G.stash.chits;

    const hpFrac = U.clamp(G.player.hp / G.player.maxHp, 0, 1);
    el.healthFill.style.width = (hpFrac * 100).toFixed(1) + "%";
    el.healthText.textContent = Math.max(0, Math.ceil(G.player.hp)) + "/" + G.player.maxHp;

    const nFrac = U.clamp(G.notice / D.notice.max, 0, 1);
    el.noticeFill.style.width = (nFrac * 100).toFixed(1) + "%";
    el.noticeText.textContent = Math.round(G.notice);

    el.medCount.textContent = G.med;

    if (el.abPts) {
      const sp = G.skillPoints || 0;
      el.abPts.textContent = sp > 0 ? " (" + sp + ")" : "";
      el.abSkill.classList.toggle("has-pts", sp > 0);
    }

    // pulse cooldown overlay
    const maxCd = S.pulseCooldown(G);
    const frac = U.clamp(G.player.pulseCd / maxCd, 0, 1);
    el.pulseCool.style.height = (frac * 100) + "%";
    el.slotPulse.classList.toggle("cooling", frac > 0.001);

    // deployable Module slot (only once unlocked)
    if (G.module) {
      el.slotModule.style.display = "";
      el.moduleName.textContent = D.modules[G.module].name;
      const mcd = D.modules[G.module].cooldown;
      const mf = U.clamp(G.player.moduleCd / mcd, 0, 1);
      el.moduleCool.style.height = (mf * 100) + "%";
      el.slotModule.classList.toggle("cooling", mf > 0.001);
    } else if (el.slotModule.style.display !== "none") {
      el.slotModule.style.display = "none";
    }

    ui.renderCarry(G);
    ui.renderMessKit(G);
    ui.renderBuffs(G);
  };

  // the mess-kit belt: one slot per cooked ration you hold, numbered for the hotkeys
  ui.renderMessKit = function (G) {
    let html = "", idx = 0;
    for (const d of D.cooking) {
      const n = G.meals[d.id] || 0;
      if (n <= 0) continue;
      idx++;
      html += '<div class="meal-slot" data-dish="' + d.id + '" title="' + d.desc + '" style="border-top-color:' + d.color + '">' +
        '<span class="key">' + idx + '</span>' +
        '<span class="g-name" style="color:' + d.color + '">' + d.short + ' ×' + n + "</span></div>";
    }
    el.messKit.innerHTML = html;
  };

  // active timed-buff pips with a draining countdown bar
  ui.renderBuffs = function (G) {
    const buffs = G.buffs || [];
    let html = "";
    for (const b of buffs) {
      const frac = U.clamp(1 - b.t / b.dur, 0, 1);
      html += '<div class="buff-pip" style="border-color:' + b.color + '">' +
        '<span class="buff-name" style="color:' + b.color + '">' + b.name + " · " + Math.ceil(b.dur - b.t) + "s</span>" +
        '<div class="buff-timer"><div style="width:' + (frac * 100) + "%;background:" + b.color + '"></div></div></div>';
    }
    el.buffBar.innerHTML = html;
  };

  ui.renderCarry = function (G) {
    const inv = G.carried;
    const total = U.invTotal(inv), cap = G.backpackCap();
    if (el.carryTitle) {
      const full = total >= cap;
      el.carryTitle.innerHTML = 'BACKPACK <b style="color:' + (full ? "var(--danger)" : "var(--ink)") + '">' +
        total + "/" + cap + '</b> <span class="at-risk">· AT RISK · [B]</span>';
    }
    if (U.invEmpty(inv)) {
      el.carryList.innerHTML = '<span class="carry-empty">empty — head out and salvage</span>';
      return;
    }
    let html = "";
    for (const k of ui._sortedKeys(inv)) {
      const it = D.items[k];
      html += '<span class="carry-chip" style="color:' + it.color + '">' +
              it.name + ' <span class="ct">×' + inv[k] + "</span></span>";
    }
    el.carryList.innerHTML = html;
  };

  /* ---------- prompt ---------- */
  ui.setPrompt = function (text) {
    if (!text) { el.prompt.classList.add("hidden"); return; }
    el.prompt.classList.remove("hidden");
    el.prompt.innerHTML = text.replace(/\[([^\]]+)\]/g, '<span class="kbd">$1</span>');
  };

  /* ---------- toasts ---------- */
  ui.toast = function (msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    t.textContent = msg;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2400);
  };

  /* ---------- banner ---------- */
  let bannerTimer = null;
  ui.banner = function (title, sub) {
    el.banner.classList.remove("hidden");
    el.banner.innerHTML = title + (sub ? '<span class="sub">' + sub + "</span>" : "");
    el.banner.style.animation = "none"; void el.banner.offsetWidth; el.banner.style.animation = "";
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.add("hidden"), 1700);
  };

  /* ---------- overlay base ---------- */
  ui.isOpen = function () { return !el.overlay.classList.contains("hidden"); };
  ui.openOverlay = function (title, bodyHtml) {
    el.overlayTitle.textContent = title;
    el.overlayBody.innerHTML = bodyHtml;
    el.overlay.classList.remove("hidden");
  };
  ui.closeOverlay = function (G) {
    el.overlay.classList.add("hidden");
    if (G && G.event && G.event.state === "checkpoint") {
      // closing the checkpoint = stand down / cash out
      G.endEvent(false);
    }
  };

  /* ---------- loadout / backpack (key B): equipped weapon + gear + salvage ---------- */
  ui.showBackpack = function (G) {
    ui.openOverlay("LOADOUT", ui._backpackBody(G));
    ui._wireBackpack(G);
  };
  ui._backpackBody = function (G) {
    let body = '<div class="menu-section-label">EQUIPPED WEAPON</div>';
    body += ui._gearCard(G, G.equipped && G.equipped.weapon, true);
    body += ui._partsBody(G);
    const tool = D.tools[G.tool] || D.tools.cutter;
    body += '<div class="menu-section-label" style="margin-top:14px;">MINING TOOL</div>';
    body += '<div style="border-left:3px solid #b8c0cc;background:rgba(255,255,255,0.03);padding:8px 10px;margin:6px 0;border-radius:4px;">' +
      '<span style="color:#cdd6e0;font-weight:bold;">' + tool.name + '</span>' +
      '<div style="font-size:11px;color:var(--ink-dim);margin-top:3px;">power ' + tool.power + ' · hold <b>[F]</b> or <b>right-click</b> to mine district nodes' +
      (tool.power < 2 ? ' · craft a <b>Plasma Cutter</b> for hard nodes' : '') + '</div></div>';
    body += '<div class="menu-section-label" style="margin-top:14px;">GEAR CARRIED · AT RISK</div>';
    const gear = G.carriedGear || [];
    if (!gear.length) {
      body += '<div class="empty-note">No spare gear. Crack chests and kill tougher enemies to find weapons.</div>';
    } else {
      for (let i = 0; i < gear.length; i++) body += ui._gearCard(G, gear[i], false, i);
    }
    const total = U.invTotal(G.carried), cap = G.backpackCap();
    body += '<div class="menu-section-label" style="margin-top:14px;">SALVAGE · ' + total + "/" + cap + " · AT RISK</div>";
    body += ui._capBar(total, cap);
    body += ui._invGrid(G.carried, "No salvage — head out and gather.");
    return body;
  };
  ui._gearCard = function (G, gear, equipped, idx) {
    if (!gear) return '<div class="empty-note">Default Salvaged Pistol equipped — find a weapon to gain affixes.</div>';
    const r = D.gearRarity[gear.rarity];
    const s = S.gearStats(gear);
    const dps = (s.damage * (s.projCount || 1) / s.cooldown).toFixed(0);
    const uni = gear.unique && D.uniques[gear.unique];
    const aff = gear.affixes.length
      ? gear.affixes.map(a => '<span style="display:inline-block;font-size:10px;color:#cdd6e0;background:rgba(255,255,255,0.06);border-radius:3px;padding:1px 6px;margin:3px 4px 0 0;">' + S.affixText(a) + "</span>").join("")
      : (uni ? "" : '<span style="font-size:10px;color:var(--ink-dim);">no affixes</span>');
    const uniHtml = uni
      ? '<div style="margin-top:5px;font-size:11px;color:' + r.color + ';font-weight:bold;">◆ ' + uni.text + "</div>" +
        '<div style="font-size:10px;color:var(--ink-dim);font-style:italic;margin-top:2px;">“' + uni.flavor + '”</div>'
      : "";
    const btn = equipped
      ? '<span style="font-size:10px;color:var(--good);font-weight:bold;letter-spacing:1px;">EQUIPPED</span>'
      : '<button class="btn good" data-equip="' + idx + '">EQUIP</button>';
    return '<div style="border-left:3px solid ' + r.color + ';background:rgba(255,255,255,0.03);padding:8px 10px;margin:6px 0;border-radius:4px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
      '<span style="color:' + r.color + ';font-weight:bold;">' + S.gearName(gear) + "</span>" + btn + "</div>" +
      '<div style="font-size:11px;color:var(--ink-dim);margin-top:3px;">DMG ' + s.damage + (s.projCount > 1 ? " ×" + s.projCount : "") +
      " · CD " + s.cooldown.toFixed(2) + "s · ~" + dps + ' dps</div>' +
      '<div style="margin-top:2px;">' + aff + "</div>" + uniHtml + ui._railsHtml(gear, equipped) + "</div>";
  };
  // mounting-rail sockets row: filled Parts (✕ to pull, equipped only) or empty slots
  ui._railsHtml = function (gear, interactive) {
    const n = S.railCount(gear);
    if (!n) return "";
    let h = '<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap;align-items:center;">' +
      '<span style="font-size:9px;color:var(--ink-dim);letter-spacing:1px;">RAILS</span>';
    for (let i = 0; i < n; i++) {
      const pid = (gear.rails || [])[i];
      if (pid && D.parts[pid]) {
        const pt = D.parts[pid];
        h += '<span style="font-size:10px;color:' + pt.color + ';background:rgba(255,255,255,0.06);border:1px solid ' + pt.color + ';border-radius:3px;padding:1px 6px;">' +
          pt.name + (interactive ? ' <b data-rail="' + i + '" style="cursor:pointer;color:var(--danger);">✕</b>' : "") + "</span>";
      } else {
        h += '<span style="font-size:10px;color:var(--ink-dim);border:1px dashed rgba(255,255,255,0.18);border-radius:3px;padding:1px 8px;">empty</span>';
      }
    }
    return h + "</div>";
  };
  // fabricate / install weapon Parts (spec §9.3) — sits under the equipped weapon
  ui._partsBody = function (G) {
    let body = '<div class="menu-section-label" style="margin-top:14px;">WEAPON PARTS · bolt onto the equipped weapon\'s rails</div>';
    const eqRails = S.railCount(G.equipped && G.equipped.weapon);
    if (!eqRails) body += '<div class="empty-note">Equip a weapon with rails to install Parts.</div>';
    for (const id of D.partsOrder) {
      const pt = D.parts[id], owned = G.parts[id] || 0;
      const can = U.invHasAll(G.stash.items, pt.cost);
      const cost = Object.keys(pt.cost).map(k => {
        const h = U.invCount(G.stash.items, k), need = pt.cost[k];
        return '<span class="' + (h >= need ? "have" : "lack") + '">' + D.items[k].name + " " + h + "/" + need + "</span>";
      }).join("  ·  ");
      body += '<div class="recipe" style="border-left:3px solid ' + pt.color + ';padding-left:9px;">' +
        '<div class="recipe-info"><div class="recipe-name" style="color:' + pt.color + '">' + pt.name +
        (owned ? ' <span style="color:var(--ink-dim);font-weight:normal;">· ' + owned + " in kit</span>" : "") +
        ' — <span class="effect">' + pt.desc + "</span></div>" +
        '<div class="recipe-cost">' + cost + "</div></div>" +
        '<div style="display:flex;flex-direction:column;gap:5px;">' +
        '<button class="btn" data-craftpart="' + id + '"' + (can ? "" : " disabled") + ">FABRICATE</button>" +
        '<button class="btn good" data-install="' + id + '"' + (owned && eqRails ? "" : " disabled") + ">INSTALL ▸</button></div></div>";
    }
    return body;
  };
  ui._wireBackpack = function (G) {
    const refresh = () => { el.overlayBody.innerHTML = ui._backpackBody(G); ui._wireBackpack(G); };
    el.overlayBody.querySelectorAll("button[data-equip]").forEach(btn => {
      btn.addEventListener("click", () => { S.equipGear(G, G.carriedGear[parseInt(btn.getAttribute("data-equip"), 10)]); refresh(); });
    });
    el.overlayBody.querySelectorAll("button[data-craftpart]").forEach(btn => {
      btn.addEventListener("click", () => { S.craftPart(G, btn.getAttribute("data-craftpart")); refresh(); });
    });
    el.overlayBody.querySelectorAll("button[data-install]").forEach(btn => {
      btn.addEventListener("click", () => { S.installPart(G, G.equipped && G.equipped.weapon, btn.getAttribute("data-install")); refresh(); });
    });
    el.overlayBody.querySelectorAll("[data-rail]").forEach(b => {
      b.addEventListener("click", () => { S.removePart(G, G.equipped && G.equipped.weapon, parseInt(b.getAttribute("data-rail"), 10)); refresh(); });
    });
  };

  /* ---------- Liens skill tree (key K) ---------- */
  ui.showSkills = function (G) {
    ui.openOverlay("LIENS · SKILL TREE", ui._skillsBody(G));
    ui._wireSkills(G);
  };
  ui._skillsBody = function (G) {
    let body = '<div class="menu-section-label">LIEN POINTS: <b style="color:var(--amber)">' + (G.skillPoints || 0) +
      '</b> &nbsp;·&nbsp; kill enemies to earn (' + (G.xp || 0) + "/" + D.skillXpCost + ' to next)</div>';
    body += '<p style="font-size:11px;color:var(--ink-dim);margin-bottom:10px;">Each node is a Lien you sign for permanent power. Upper nodes need the one beneath them first.</p>';
    body += '<div style="display:flex;gap:12px;">';
    for (let bi = 0; bi < D.skillBranches.length; bi++) {
      body += '<div style="flex:1;"><div class="menu-section-label" style="text-align:center;letter-spacing:1px;">' + D.skillBranches[bi] + "</div>";
      const nodes = Object.keys(D.skills).filter(id => D.skills[id].branch === bi).sort((a, b) => D.skills[b].row - D.skills[a].row);
      for (const id of nodes) body += ui._skillNode(G, id);
      body += "</div>";
    }
    return body + "</div>";
  };
  ui._skillNode = function (G, id) {
    const n = D.skills[id], st = S.skillState(G, id);
    const col = { owned: "#5ad88a", available: "#ffb347", tooexpensive: "#6b7280", locked: "#454b55" }[st] || "#454b55";
    const dim = (st === "locked" || st === "tooexpensive") ? "opacity:.55;" : "";
    let btn;
    if (st === "owned") btn = '<span style="font-size:10px;color:#5ad88a;font-weight:bold;">✔ SIGNED</span>';
    else if (st === "available") btn = '<button class="btn good" data-skill="' + id + '" style="padding:3px 8px;font-size:11px;">SIGN · ' + n.cost + "</button>";
    else if (st === "tooexpensive") btn = '<span style="font-size:10px;color:var(--ink-dim);">' + n.cost + " pts</span>";
    else btn = '<span style="font-size:10px;color:var(--ink-dim);">locked</span>';
    return '<div style="border:1px solid ' + col + ';background:rgba(255,255,255,0.03);border-radius:5px;padding:7px 8px;margin:7px 0;' + dim + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span style="color:' + col + ';font-weight:bold;font-size:12px;">' + n.name + "</span>" + btn + "</div>" +
      '<div style="font-size:10px;color:var(--ink-dim);margin-top:3px;">' + n.desc + "</div></div>";
  };
  ui._wireSkills = function (G) {
    el.overlayBody.querySelectorAll("button[data-skill]").forEach(btn => {
      btn.addEventListener("click", () => {
        S.allocSkill(G, btn.getAttribute("data-skill"));
        el.overlayBody.innerHTML = ui._skillsBody(G); ui._wireSkills(G);
      });
    });
  };

  ui._capBar = function (total, cap) {
    const frac = U.clamp(total / cap, 0, 1);
    const col = frac >= 1 ? "var(--danger)" : frac > 0.8 ? "var(--amber)" : "var(--good)";
    return '<div class="bar-track" style="height:10px;margin:4px 0 12px;"><div style="height:100%;width:' +
      (frac * 100) + '%;background:' + col + ';"></div></div>';
  };

  ui._invGrid = function (inv, emptyMsg, onClickAttr) {
    if (U.invEmpty(inv)) return '<div class="empty-note">' + emptyMsg + "</div>";
    let html = '<div class="stash-grid">';
    for (const k of ui._sortedKeys(inv)) {
      const it = D.items[k];
      html += '<div class="stash-item"' + (onClickAttr ? ' data-item="' + k + '" style="cursor:pointer"' : "") + '>' +
        '<span class="stash-swatch" style="background:' + it.color + '"></span>' +
        '<span class="stash-name">' + it.name + '</span>' +
        '<span class="stash-count" style="color:' + it.color + '">' + inv[k] + "</span></div>";
    }
    return html + "</div>";
  };

  /* ---------- storage (two-way transfer, Core-Keeper style) ---------- */
  ui.showStorage = function (G) {
    ui.openOverlay("STORAGE", ui._storageBody(G));
    ui._wireStorage(G);
  };
  ui._storageBody = function (G) {
    const total = U.invTotal(G.carried), cap = G.backpackCap();
    let body = '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '<span class="menu-section-label" style="margin:0;">click an item to move it · ◈' + G.stash.chits + ' CHITS</span>' +
      '<button class="btn" id="deposit-all">DEPOSIT ALL ▸</button></div>';
    body += '<div style="display:flex;gap:14px;">';
    body += '<div style="flex:1;"><div class="menu-section-label">BACKPACK ' + total + "/" + cap + " · at risk</div>" +
      ui._capBar(total, cap) +
      '<div data-pane="bp">' + ui._invGrid(G.carried, "Empty.", true) + "</div></div>";
    body += '<div style="flex:1;"><div class="menu-section-label">STORAGE · safe</div>' +
      '<div data-pane="st">' + ui._invGrid(G.stash.items, "No salvage stored yet.", true) + "</div></div>";
    body += "</div>";
    return body;
  };
  ui._wireStorage = function (G) {
    const refresh = () => { el.overlayBody.innerHTML = ui._storageBody(G); ui._wireStorage(G); };
    const dep = document.getElementById("deposit-all");
    if (dep) dep.addEventListener("click", () => { S.bank(G); refresh(); });
    el.overlayBody.querySelectorAll('[data-pane="bp"] [data-item]').forEach(elm => {
      elm.addEventListener("click", () => {                 // deposit one stack to storage
        const k = elm.getAttribute("data-item");
        U.invAdd(G.stash.items, k, G.carried[k]); delete G.carried[k];
        G.persist(); refresh();
      });
    });
    el.overlayBody.querySelectorAll('[data-pane="st"] [data-item]').forEach(elm => {
      elm.addEventListener("click", () => {                 // withdraw up to remaining capacity
        const k = elm.getAttribute("data-item");
        const room = G.backpackCap() - U.invTotal(G.carried);
        if (room <= 0) { G.toast("Backpack full", "bad"); return; }
        const move = Math.min(room, G.stash.items[k]);
        U.invAdd(G.carried, k, move);
        G.stash.items[k] -= move; if (G.stash.items[k] <= 0) delete G.stash.items[k];
        G.persist(); refresh();
      });
    });
  };

  ui._sortedKeys = function (inv) {
    return Object.keys(inv).sort((a, b) =>
      D.rarityOrder.indexOf(D.items[b].rarity) - D.rarityOrder.indexOf(D.items[a].rarity));
  };

  /* ---------- fab bench ---------- */
  ui.showFab = function (G) {
    ui.openOverlay("FAB BENCH", ui._fabBody(G));
    ui._wireFab(G);
  };
  ui._fabBody = function (G) {
    let body = '<div class="menu-section-label">TURN SALVAGE INTO POWER · materials in stash below</div>';
    for (const r of D.recipes) {
      const fx = D.craftEffects[r.id];
      const owned = fx.once && G.unlocks[r.id];
      const can = U.invHasAll(G.stash.items, r.cost) && !owned;
      const cost = Object.keys(r.cost).map(k => {
        const have = U.invCount(G.stash.items, k), need = r.cost[k];
        const cls = have >= need ? "have" : "lack";
        return '<span class="' + cls + '">' + D.items[k].name + " " + have + "/" + need + "</span>";
      }).join("  ·  ");
      body += '<div class="recipe"><div class="recipe-info">' +
        '<div class="recipe-name">' + r.name + ' — <span class="effect">' + r.effect + "</span></div>" +
        '<div class="recipe-cost">' + cost + "</div></div>" +
        '<button class="btn" data-recipe="' + r.id + '"' + (can ? "" : " disabled") + ">" +
        (owned ? "INSTALLED" : "CRAFT") + "</button></div>";
    }
    body += ui._sidekickBody(G);
    return body;
  };
  // mechanical sidekicks: assemble a Hold-automation bot (spec §9.12)
  ui._sidekickBody = function (G) {
    let body = '<div class="menu-section-label" style="margin-top:16px;">MECHANICAL SIDEKICKS · automate the Hold while you raid</div>';
    body += '<p style="font-size:11px;color:var(--ink-dim);margin-bottom:8px;">Each assembled bot works its job every cycle (when you <b>Rest</b>), depositing to storage even while you\'re out.</p>';
    for (const id of D.sidekicksOrder) {
      const sk = D.sidekicks[id];
      const owned = (G.sidekicks || []).indexOf(id) >= 0;
      const can = !owned && U.invHasAll(G.stash.items, sk.cost);
      const cost = Object.keys(sk.cost).map(k => {
        const h = U.invCount(G.stash.items, k), need = sk.cost[k];
        return '<span class="' + (h >= need ? "have" : "lack") + '">' + D.items[k].name + " " + h + "/" + need + "</span>";
      }).join("  ·  ");
      body += '<div class="recipe" style="border-left:3px solid ' + sk.color + ';padding-left:9px;">' +
        '<div class="recipe-info"><div class="recipe-name" style="color:' + sk.color + '">' + sk.name +
        ' <span style="color:var(--ink-dim);font-weight:normal;font-size:10px;">· ' + sk.job + "</span>" +
        ' — <span class="effect">' + sk.desc + "</span></div>" +
        '<div class="recipe-cost">' + cost + "</div></div>" +
        '<button class="btn' + (owned ? " good" : "") + '" data-sidekick="' + id + '"' + (can ? "" : " disabled") + ">" +
        (owned ? "ACTIVE" : "ASSEMBLE") + "</button></div>";
    }
    return body;
  };
  ui._wireFab = function (G) {
    const refresh = () => { el.overlayBody.innerHTML = ui._fabBody(G); ui._wireFab(G); };
    el.overlayBody.querySelectorAll("button[data-recipe]").forEach(btn => {
      btn.addEventListener("click", () => { S.craft(G, btn.getAttribute("data-recipe")); refresh(); });
    });
    el.overlayBody.querySelectorAll("button[data-sidekick]").forEach(btn => {
      btn.addEventListener("click", () => { S.buildSidekick(G, btn.getAttribute("data-sidekick")); refresh(); });
    });
  };

  /* ---------- cookfire: cook ration portions, eat one for a timed buff ---------- */
  ui.showCookfire = function (G) {
    ui.openOverlay("COOKFIRE", ui._cookBody(G));
    ui._wireCook(G);
  };
  ui._cookBody = function (G) {
    let body = '<div class="menu-section-label">COOK RATIONS · ingredients come from your STORAGE</div>';
    body += '<p style="font-size:11px;color:var(--ink-dim);margin-bottom:10px;">Each cook banks a few portions you carry safely. Eat one here, or out in the field with hotkeys <b>1–5</b>, for a timed buff. Re-eating refreshes its timer.</p>';
    for (const d of D.cooking) {
      const can = U.invHasAll(G.stash.items, d.cost);
      const have = G.meals[d.id] || 0;
      const cost = Object.keys(d.cost).map(k => {
        const h = U.invCount(G.stash.items, k), need = d.cost[k];
        return '<span class="' + (h >= need ? "have" : "lack") + '">' + D.items[k].name + " " + h + "/" + need + "</span>";
      }).join("  ·  ");
      body += '<div class="recipe" style="border-left:3px solid ' + d.color + ';padding-left:9px;">' +
        '<div class="recipe-info">' +
        '<div class="recipe-name" style="color:' + d.color + '">' + d.name +
        (have ? ' <span style="color:var(--ink-dim);font-weight:normal;">· ' + have + " in pack</span>" : "") +
        ' — <span class="effect">' + d.desc + "</span></div>" +
        '<div class="recipe-cost">' + cost + " &nbsp; <span style=\"color:var(--ink-dim)\">→ ×" + (d.portions || 1) + " portions</span></div></div>" +
        '<div style="display:flex;flex-direction:column;gap:5px;">' +
        '<button class="btn" data-cook="' + d.id + '"' + (can ? "" : " disabled") + ">COOK</button>" +
        '<button class="btn good" data-eat="' + d.id + '"' + (have ? "" : " disabled") + ">EAT</button></div></div>";
    }
    return body;
  };
  ui._wireCook = function (G) {
    const refresh = () => { el.overlayBody.innerHTML = ui._cookBody(G); ui._wireCook(G); };
    el.overlayBody.querySelectorAll("button[data-cook]").forEach(btn =>
      btn.addEventListener("click", () => { S.cook(G, btn.getAttribute("data-cook")); refresh(); }));
    el.overlayBody.querySelectorAll("button[data-eat]").forEach(btn =>
      btn.addEventListener("click", () => { S.eatMeal(G, btn.getAttribute("data-eat")); refresh(); }));
  };

  /* ---------- field casino (spec §9.9): slots · double-or-nothing · the pull ---------- */
  ui.showCasino = function (G) {
    ui.openOverlay("FIELD CASINO", ui._casinoBody(G, ""));
    ui._wireCasino(G);
  };
  ui._casinoBody = function (G, resultHtml) {
    const c = D.casino, carried = U.invTotal(G.carried);
    let body = '<div class="menu-section-label">◈ <b style="color:var(--amber)">' + G.stash.chits + '</b> CHITS · the house always remembers</div>';
    body += '<div id="casino-result" style="min-height:26px;margin:4px 0 10px;text-align:center;font-size:13px;">' + (resultHtml || '<span style="color:var(--ink-dim)">place your bet…</span>') + '</div>';
    const row = (title, color, desc, btnId, btnLabel, can) =>
      '<div class="recipe" style="border-left:3px solid ' + color + ';padding-left:9px;">' +
      '<div class="recipe-info"><div class="recipe-name" style="color:' + color + '">' + title + '</div>' +
      '<div class="recipe-cost">' + desc + '</div></div>' +
      '<button class="btn" id="' + btnId + '"' + (can ? '' : ' disabled') + '>' + btnLabel + '</button></div>';
    body += row("SLOTS", "#ffcf6b", "Spin for ◈" + c.slotsCost + " — jackpot pays ◈150", "cas-slots", "SPIN ◈" + c.slotsCost, G.stash.chits >= c.slotsCost);
    body += row("DOUBLE OR NOTHING", "#ff5ea8", "Wager your carried haul (" + carried + " items) — " + Math.round(c.doubleChance * 100) + "% to double, else lose it all", "cas-double", "WAGER HAUL", carried > 0);
    body += row("THE PULL", "#c084fc", "Pull gear for ◈" + c.pullCost + " · Masterwork+ guaranteed in " + (c.pityAt - (G.pity || 0)) + " pull(s)", "cas-pull", "PULL ◈" + c.pullCost, G.stash.chits >= c.pullCost);
    return body;
  };
  ui._wireCasino = function (G) {
    const refresh = (res) => { el.overlayBody.innerHTML = ui._casinoBody(G, res); ui._wireCasino(G); };
    const slots = document.getElementById("cas-slots");
    if (slots) slots.addEventListener("click", () => {
      const r = S.slots(G); if (!r) { refresh(""); return; }
      const reel = '<span style="font-size:22px;letter-spacing:6px;">' + r.reels.join(" ") + '</span><br>';
      refresh(reel + (r.payout > 0
        ? '<span style="color:var(--good)">WON ◈' + r.payout + (r.net >= 0 ? " (net +" + r.net + ")" : "") + '</span>'
        : '<span style="color:var(--danger)">no win — ◈' + D.casino.slotsCost + ' gone</span>'));
    });
    const dbl = document.getElementById("cas-double");
    if (dbl) dbl.addEventListener("click", () => {
      const r = S.doubleOrNothing(G); if (!r) { refresh(""); return; }
      refresh(r.win
        ? '<span style="color:var(--good);font-size:15px;">DOUBLED — ' + (r.staked * 2) + ' items in your pack!</span>'
        : '<span style="color:var(--danger);font-size:15px;">THE HOUSE TAKES ALL — ' + r.staked + ' items gone.</span>');
    });
    const pull = document.getElementById("cas-pull");
    if (pull) pull.addEventListener("click", () => {
      const r = S.pull(G); if (!r) { refresh(""); return; }
      const col = D.gearRarity[r.rarity].color;
      refresh((r.pityHit ? '<span style="color:var(--amber)">★ PITY ★</span><br>' : '') +
        '<span style="color:' + col + ';font-weight:bold;">' + S.gearName(r.gear) + '</span> → Backpack [B]');
    });
  };

  /* ---------- claim ---------- */
  ui.showClaim = function (G) {
    if (!G.pendingClaim || U.invEmpty(G.pendingClaim)) {
      ui.openOverlay("CLAIM", '<div class="empty-note">No outstanding Claim. Nothing has been repossessed.</div>');
      return;
    }
    let body = '<div class="menu-section-label">THE CONCERN HOLDS YOUR SEIZED HAUL</div>';
    body += '<p style="font-size:12px;color:var(--ink-dim);line-height:1.6;margin-bottom:12px;">' +
      'Filing returns a <b>random subset</b>. Common materials usually come back; rare gear usually does not.</p>';
    body += ui._claimList(G.pendingClaim);
    body += '<div style="text-align:center;margin-top:14px;"><button class="btn danger" id="file-claim">FILE CLAIM</button></div>';
    ui.openOverlay("CLAIM", body);
    document.getElementById("file-claim").addEventListener("click", () => {
      const res = S.fileClaim(G);
      ui._showClaimResult(G, res);
    });
  };
  ui._claimList = function (inv) {
    let html = '<div class="stash-grid">';
    for (const k of ui._sortedKeys(inv)) {
      const it = D.items[k];
      html += '<div class="stash-item"><span class="stash-swatch" style="background:' + it.color + '"></span>' +
        '<span class="stash-name">' + it.name + '</span><span class="stash-count">' + inv[k] + "</span></div>";
    }
    return html + "</div>";
  };
  ui._showClaimResult = function (G, res) {
    if (!res) { ui.closeOverlay(G); return; }
    const fmt = (inv) => U.invEmpty(inv) ? "nothing" :
      ui._sortedKeys(inv).map(k => D.items[k].name + " ×" + inv[k]).join(", ");
    let body = '<div class="claim-result">';
    body += '<div class="claim-kept">RECOVERED: ' + fmt(res.kept) + "</div>";
    body += '<div class="claim-lost">LOST FOR GOOD: ' + fmt(res.lost) + "</div></div>";
    body += '<div style="text-align:center;margin-top:16px;"><button class="btn" id="claim-ok">CLOSE</button></div>';
    ui.openOverlay("CLAIM SETTLED", body);
    document.getElementById("claim-ok").addEventListener("click", () => ui.closeOverlay(G));
    ui.toast("Claim settled — recovered items moved to stash", "info");
  };

  /* ---------- event checkpoint (Answer the Call) ---------- */
  ui.showEventCheckpoint = function (G) {
    const next = G.event.wave + 1;
    const last = next >= D.event.waves.length;
    const haul = U.invTotal(G.carried);
    let body = '<div class="menu-section-label">BANK YOUR WINNINGS, OR PUSH FOR MORE</div>';
    body += '<p style="font-size:12px;color:var(--ink-dim);line-height:1.6;margin-bottom:14px;">' +
      (last ? "That was the final wave. " : "Each wave escalates threat <i>and</i> reward. ") +
      "Your winnings sit in your <b>at-risk</b> haul (" + haul + " carried). <b>Cash out</b> banks it here and now — a clean exit." +
      (last ? "" : " <b>Push</b> wagers it for a bigger payout.") + "</p>";
    body += '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">';
    if (!last) body += '<button class="btn danger" id="ev-push">PUSH — WAVE ' + (next + 1) + "</button>";
    body += '<button class="btn good" id="ev-bank">CASH OUT &amp; LEAVE</button>';
    body += '<button class="btn alt" id="ev-stand">LEAVE (KEEP AT RISK)</button></div>';
    ui.openOverlay(last ? "CALL ANSWERED" : "WAVE CLEARED", body);
    const push = document.getElementById("ev-push");
    if (push) push.addEventListener("click", () => { el.overlay.classList.add("hidden"); S.eventPush(G); });
    document.getElementById("ev-bank").addEventListener("click", () => { el.overlay.classList.add("hidden"); S.bank(G); G.endEvent(false); });
    document.getElementById("ev-stand").addEventListener("click", () => { el.overlay.classList.add("hidden"); G.endEvent(false); });
  };

  P.ui = ui;
})(window.PACT = window.PACT || {});
