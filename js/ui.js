/* ============================================================
   THE PACT — UI
   DOM HUD (biome badge, vitality bar, the hotbar) + overlay menus
   (inventory, crafting at a station, storage). The canvas renders the
   world; everything readable lives here.
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
      regionBadge: document.getElementById("region-badge"),
      healthFill: document.getElementById("health-fill"),
      healthText: document.getElementById("health-text"),
      prompt: document.getElementById("prompt"),
      toasts: document.getElementById("toasts"),
      banner: document.getElementById("banner"),
      overlay: document.getElementById("overlay"),
      overlayTitle: document.getElementById("overlay-title"),
      overlayBody: document.getElementById("overlay-body"),
      overlayClose: document.getElementById("overlay-close"),
      hotbar: document.getElementById("hotbar"),
      levelBadge: document.getElementById("level-badge"),
      xpFill:     document.getElementById("xp-fill"),
      bossBar:    document.getElementById("boss-bar"),
      bossFill:   document.getElementById("boss-fill"),
      bossName:   document.getElementById("boss-name"),
    };
    // build the 10 hotbar slots
    let hb = "";
    for (let i = 0; i < 10; i++) hb += '<div class="hb-slot" data-slot="' + i + '"><span class="hb-key">' + ((i + 1) % 10) + '</span><span class="hb-icon"></span><span class="hb-n"></span></div>';
    el.hotbar.innerHTML = hb;
    el.hbSlots = [].slice.call(el.hotbar.querySelectorAll(".hb-slot"));
    el.hbSlots.forEach((s, i) => s.addEventListener("click", () => { G.action("selectSlot", i); }));
    el.overlayClose.addEventListener("click", () => ui.closeOverlay(G));
    this.G = G;
  };

  ui.updateHud = function (G) {
    const biome = G.world.biomeAtPx(G.player.x, G.player.y);
    el.regionName.textContent = biome.name;
    el.depthTier.textContent = biome.tier === 0 ? "SAFE HAVEN" : ("TIER " + biome.tier + " · " + (biome.blurb || ""));
    el.regionBadge.style.borderLeftColor = biome.accent;

    const hpFrac = U.clamp(G.player.hp / G.player.maxHp, 0, 1);
    el.healthFill.style.width = (hpFrac * 100).toFixed(1) + "%";
    el.healthText.textContent = Math.max(0, Math.ceil(G.player.hp)) + "/" + G.player.maxHp;

    // level badge + XP bar
    if (el.levelBadge) el.levelBadge.textContent = "LV " + (G.level || 1);
    if (el.xpFill) {
      const xpFrac = U.clamp((G.xp || 0) / (G.xpToNext || 1), 0, 1);
      el.xpFill.style.width = (xpFrac * 100).toFixed(1) + "%";
    }

    // boss health bar
    const boss = G.activeBoss;
    if (el.bossBar) {
      if (boss && !boss.dead) {
        el.bossBar.classList.remove("hidden");
        if (el.bossName) el.bossName.textContent = boss.def.name;
        if (el.bossFill) el.bossFill.style.width = (U.clamp(boss.hp / boss.maxHp, 0, 1) * 100).toFixed(1) + "%";
        if (el.bossFill) el.bossFill.style.background = boss.color;
      } else {
        el.bossBar.classList.add("hidden");
      }
    }

    ui.renderHotbar(G);
  };

  ui.renderHotbar = function (G) {
    for (let i = 0; i < 10; i++) {
      const slot = el.hbSlots[i], st = G.inv[i];
      slot.classList.toggle("sel", i === G.sel);
      const icon = slot.querySelector(".hb-icon"), num = slot.querySelector(".hb-n");
      if (!st) { icon.style.background = "transparent"; icon.textContent = ""; icon.className = "hb-icon"; num.textContent = ""; continue; }
      const it = D.items[st.item];
      icon.className = "hb-icon k-" + (it.kind || "mat");
      icon.style.background = it.color;
      icon.textContent = ui._abbr(it);
      num.textContent = st.n > 1 ? st.n : "";
    }
  };
  ui._abbr = function (it) {
    if (it.kind === "tool")   return "⛏";
    if (it.kind === "weapon") return it.icon === "gun" ? "▸" : "⚔";
    if (it.kind === "torch")  return "≀";
    if (it.kind === "consumable") return "✚";
    if (it.kind === "armor" && it.slot === "head")  return "⬡";
    if (it.kind === "armor" && it.slot === "chest") return "▣";
    return "";
  };

  /* ---------- prompt / toast / banner ---------- */
  ui.setPrompt = function (text) {
    if (!text) { el.prompt.classList.add("hidden"); return; }
    el.prompt.classList.remove("hidden");
    el.prompt.innerHTML = text.replace(/\[([^\]]+)\]/g, '<span class="kbd">$1</span>');
  };
  ui.toast = function (msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "info");
    t.textContent = msg;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2400);
  };
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
  ui.closeOverlay = function () { el.overlay.classList.add("hidden"); };

  /* ---------- inventory ---------- */
  ui.showInventory = function (G) {
    ui.openOverlay("INVENTORY", ui._invBody(G));
    ui._wireInventory(G);
  };
  ui._invBody = function (G) {
    // armor slot section
    const slots = ["head", "chest"];
    const slotLabel = { head: "Head", chest: "Body" };
    let armorHtml = '<div style="display:flex;gap:10px;margin-bottom:12px;">';
    for (const slot of slots) {
      const itemId = G.equipped[slot];
      const it = itemId ? D.items[itemId] : null;
      armorHtml += '<div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:8px 10px;">' +
        '<div style="font-size:10px;color:var(--ink-dim);letter-spacing:1px;margin-bottom:4px;">' + slotLabel[slot].toUpperCase() + '</div>';
      if (it) {
        armorHtml += '<div style="display:flex;align-items:center;gap:8px;">' +
          '<span style="width:22px;height:22px;background:' + it.color + ';border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:13px;color:#10131a;">' + ui._abbr(it) + '</span>' +
          '<span style="font-size:12px;color:' + it.color + ';">' + it.name + '</span>' +
          '<span style="font-size:11px;color:var(--good);margin-left:auto;">' + (it.armor.defense * 100 | 0) + '% def</span>' +
          '<button class="btn alt" style="padding:3px 8px;font-size:11px;" data-unequip="' + slot + '">▽</button></div>';
      } else {
        armorHtml += '<div style="font-size:11px;color:var(--ink-dim);font-style:italic;">— empty —</div>';
      }
      armorHtml += '</div>';
    }
    armorHtml += '</div>';

    // armor in inventory
    const armorItems = G.inv.reduce((a, s) => { if (s) { const it = D.items[s.item]; if (it && it.kind === "armor") a.push(s.item); } return a; }, []);
    let equipSection = "";
    if (armorItems.length) {
      equipSection = '<div class="menu-section-label">ARMOR IN PACK — click to equip</div><div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">';
      for (const itemId of armorItems) {
        const it = D.items[itemId];
        equipSection += '<button class="btn" style="display:flex;align-items:center;gap:6px;" data-equip="' + itemId + '">' +
          '<span style="width:18px;height:18px;background:' + it.color + ';border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#10131a;">' + ui._abbr(it) + '</span>' +
          it.name + ' <span style="font-size:10px;opacity:0.7;">(' + (it.armor.defense * 100 | 0) + '% ' + it.slot + ')</span>' +
          '</button>';
      }
      equipSection += '</div>';
    }

    let body = armorHtml + equipSection;
    body += '<div class="menu-section-label">PACK — slots 1–10 are your hotbar</div>';
    body += '<div class="inv-grid">';
    for (let i = 0; i < G.inv.length; i++) {
      const st = G.inv[i];
      const hot = i < 10 ? ' hotbar' : '';
      if (!st) { body += '<div class="inv-cell empty' + hot + '"></div>'; continue; }
      const it = D.items[st.item];
      body += '<div class="inv-cell' + hot + '" title="' + it.name + '" style="border-color:' + it.color + '">' +
        '<span class="ic" style="background:' + it.color + '">' + ui._abbr(it) + '</span>' +
        '<span class="nm">' + it.name + '</span>' +
        (st.n > 1 ? '<span class="cn">' + st.n + '</span>' : '') + '</div>';
    }
    body += '</div>';
    return body;
  };

  ui._wireInventory = function (G) {
    el.overlayBody.querySelectorAll("[data-equip]").forEach(btn => {
      btn.addEventListener("click", () => { G.equip(btn.getAttribute("data-equip")); ui.showInventory(G); });
    });
    el.overlayBody.querySelectorAll("[data-unequip]").forEach(btn => {
      btn.addEventListener("click", () => {
        const slot = btn.getAttribute("data-unequip");
        const itemId = G.equipped[slot];
        if (itemId) { G.addItem(itemId, 1); G.equipped[slot] = null; }
        ui.showInventory(G);
      });
    });
  };

  /* ---------- crafting at a station ---------- */
  ui.showCrafting = function (G, station) {
    ui.openOverlay(D.stations[station].name.toUpperCase(), ui._craftBody(G, station));
    ui._wireCraft(G, station);
  };
  ui._craftBody = function (G, station) {
    const st = D.stations[station];
    let body = '<div class="menu-section-label">' + st.blurb + ' · ingredients come from your inventory</div>';
    const list = D.recipes.filter(r => r.station === station);
    if (!list.length) body += '<div class="empty-note">Nothing to make here.</div>';
    for (let i = 0; i < list.length; i++) {
      const r = list[i], can = S.canCraft(G, r);
      const outName = ui._recipeOutName(r);
      const cost = Object.keys(r.cost).filter(k => r.cost[k] > 0).map(k => {
        const have = G.countItem(k), need = r.cost[k];
        return '<span class="' + (have >= need ? "have" : "lack") + '">' + D.items[k].name + " " + have + "/" + need + "</span>";
      }).join("  ·  ");
      const gate = (r.need && !S.stationAvailable(G, r.need)) ? ' <span class="lack">(needs ' + D.stations[r.need].name + ')</span>' : '';
      body += '<div class="recipe"><div class="recipe-info">' +
        '<div class="recipe-name">' + outName + gate + '</div>' +
        '<div class="recipe-cost">' + cost + '</div></div>' +
        '<button class="btn" data-recipe="' + i + '"' + (can ? "" : " disabled") + '>' + (r.build ? "BUILD" : "CRAFT") + '</button></div>';
    }
    return body;
  };
  ui._recipeOutName = function (r) {
    if (r.build) return '<span style="color:' + D.stations[r.build].color + '">Build ' + D.stations[r.build].name + '</span>';
    const k = Object.keys(r.out)[0], it = D.items[k], n = r.out[k];
    return '<span style="color:' + it.color + '">' + it.name + (n > 1 ? ' ×' + n : '') + '</span>';
  };
  ui._wireCraft = function (G, station) {
    const list = D.recipes.filter(r => r.station === station);
    const refresh = () => { el.overlayBody.innerHTML = ui._craftBody(G, station); ui._wireCraft(G, station); };
    el.overlayBody.querySelectorAll("button[data-recipe]").forEach(btn => {
      btn.addEventListener("click", () => { S.craft(G, list[+btn.getAttribute("data-recipe")]); refresh(); });
    });
  };

  /* ---------- storage (simple safe stash) ---------- */
  ui.showStorage = function (G) {
    ui.openOverlay("STORAGE", ui._storageBody(G));
    ui._wireStorage(G);
  };
  ui._storageBody = function (G) {
    let body = '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<span class="menu-section-label" style="margin:0;">click an item to move it · safe from death</span>' +
      '<button class="btn" id="dep-all">DEPOSIT MATS ▸</button></div>';
    body += '<div style="display:flex;gap:14px;">';
    body += '<div style="flex:1;"><div class="menu-section-label">INVENTORY</div><div data-pane="inv">' + ui._stashGrid(ui._invMats(G), "Empty.", true) + '</div></div>';
    body += '<div style="flex:1;"><div class="menu-section-label">STORAGE</div><div data-pane="st">' + ui._stashGrid(G.stash || {}, "Nothing stored.", true) + '</div></div>';
    body += '</div>';
    return body;
  };
  ui._invMats = function (G) {
    const m = {};
    for (const s of G.inv) { if (!s) continue; const it = D.items[s.item]; if (it.kind === "tool" || it.kind === "weapon") continue; m[s.item] = (m[s.item] || 0) + s.n; }
    return m;
  };
  ui._stashGrid = function (map, emptyMsg, click) {
    const keys = Object.keys(map).filter(k => map[k] > 0);
    if (!keys.length) return '<div class="empty-note">' + emptyMsg + '</div>';
    let html = '<div class="stash-grid">';
    for (const k of keys) {
      const it = D.items[k];
      html += '<div class="stash-item"' + (click ? ' data-item="' + k + '" style="cursor:pointer"' : '') + '>' +
        '<span class="stash-swatch" style="background:' + it.color + '"></span>' +
        '<span class="stash-name">' + it.name + '</span>' +
        '<span class="stash-count" style="color:' + it.color + '">' + map[k] + '</span></div>';
    }
    return html + '</div>';
  };
  ui._wireStorage = function (G) {
    const refresh = () => { el.overlayBody.innerHTML = ui._storageBody(G); ui._wireStorage(G); };
    const dep = document.getElementById("dep-all");
    if (dep) dep.addEventListener("click", () => { G.depositMats(); refresh(); });
    el.overlayBody.querySelectorAll('[data-pane="inv"] [data-item]').forEach(elm =>
      elm.addEventListener("click", () => { G.deposit(elm.getAttribute("data-item")); refresh(); }));
    el.overlayBody.querySelectorAll('[data-pane="st"] [data-item]').forEach(elm =>
      elm.addEventListener("click", () => { G.withdraw(elm.getAttribute("data-item")); refresh(); }));
  };

  P.ui = ui;
})(window.PACT = window.PACT || {});
