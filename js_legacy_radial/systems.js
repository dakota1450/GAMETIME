/* ============================================================
   THE PACT — SYSTEMS  (the game logic)
   Combat & gadgets · Notice + repo sweep (§7) · loot from chests &
   kills (§9.1) · extraction: bank / die-repossess / Claim · crafting
   (§9.2) · rest cycle-turnover (§8.1) · Answer-the-Call (§9.7).
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;
  const { Enemy, Projectile, Pickup, Deployable } = P.entities;
  const S = {};

  /* ---------- gear: roll, derive, name (spec §9.3 / §9.11) ---------- */
  // pick a gear rarity, biased toward better tiers the deeper (higher tier) you are
  S.rollGearRarity = function (tier) {
    const table = D.gearRarityOrder.map((k, i) => [k, D.gearRarity[k].weight * (1 + tier * 0.18 * i)]);
    return U.rngWeighted(Math.random, table);
  };
  // build a gear instance: base type + rarity + rolled affixes (no duplicate stat)
  S.rollGear = function (baseId, rarityKey) {
    // at Relic/Heirloom, a named unique can drop instead of a random affixed item
    if ((rarityKey === "relic" || rarityKey === "heirloom") && D.uniques) {
      const pool = Object.keys(D.uniques).filter(id => D.uniques[id].rarity === rarityKey);
      if (pool.length && Math.random() < 0.55) {
        const id = U.rngPick(Math.random, pool), uni = D.uniques[id];
        return { gid: "g" + Math.floor(Math.random() * 1e9).toString(36), base: uni.base, slot: "weapon", rarity: rarityKey, affixes: [], rails: [], unique: id };
      }
    }
    const baseDef = D.gearBases[baseId], rar = D.gearRarity[rarityKey];
    const ri = D.gearRarityOrder.indexOf(rarityKey);
    const nAff = U.rngInt(Math.random, rar.affixes[0], rar.affixes[1]);
    const pool = D.affixes.prefix.map(a => ["prefix", a]).concat(D.affixes.suffix.map(a => ["suffix", a]));
    const chosen = [], used = {};
    for (let i = 0; i < nAff; i++) {
      let pick = null;
      for (let t = 0; t < 16; t++) { const c = U.rngPick(Math.random, pool); if (!used[c[1].id]) { pick = c; break; } }
      if (!pick) break;
      used[pick[1].id] = true;
      const a = pick[1];
      const band = U.clamp(Math.floor(ri * 0.6 + Math.random() * 1.5), 0, a.tiers.length - 1);
      chosen.push({ id: a.id, kind: pick[0], stat: a.stat, op: a.op, pct: !!a.pct, label: a.label, value: a.tiers[band] });
    }
    return { gid: "g" + Math.floor(Math.random() * 1e9).toString(36), base: baseId, slot: baseDef.slot, rarity: rarityKey, affixes: chosen, rails: [] };
  };
  // derive a weapon's effective stats from its base + affixes + socketed Parts
  S.gearStats = function (g) {
    const s = Object.assign({}, D.gearBases[g.base].base);
    s.noticeMul = 1;
    const apply = (m) => {
      if (m.op === "add") s[m.stat] = (s[m.stat] || 0) + m.value;
      else if (m.op === "mulDown") s[m.stat] = (s[m.stat] != null ? s[m.stat] : 1) * (1 - m.value);
      else if (m.op === "mulUp") s[m.stat] = (s[m.stat] != null ? s[m.stat] : 1) * (1 + m.value);
    };
    for (const a of g.affixes) apply(a);
    if (g.unique && D.uniques[g.unique]) D.uniques[g.unique].mods.forEach(apply);   // unique's fixed power
    for (const pid of (g.rails || [])) { const pt = pid && D.parts[pid]; if (pt) pt.mods.forEach(apply); }
    return s;
  };
  // mounting sockets on a gear (spec §9.3) — drives how many Parts it can hold
  S.railCount = function (g) { return (g && g.base && D.gearBases[g.base].rails) || 0; };
  // fabricate a Part into your loose kit (spent at a rail later)
  S.craftPart = function (G, id) {
    const pt = D.parts[id]; if (!pt) return false;
    if (!U.invHasAll(G.stash.items, pt.cost)) { G.toast("Not enough materials for the " + pt.name, "bad"); return false; }
    U.invTake(G.stash.items, pt.cost);
    G.parts[id] = (G.parts[id] || 0) + 1;
    P.audio && P.audio.play("craft");
    G.toast("Fabricated Part: " + pt.name, "good");
    G.persist();
    return true;
  };
  // slot a Part into the equipped weapon's first open rail
  S.installPart = function (G, gear, partId) {
    if (!gear) { G.toast("Equip a weapon with rails first", "bad"); return false; }
    if ((G.parts[partId] || 0) <= 0) { G.toast("You don't have that Part", "bad"); return false; }
    const max = S.railCount(gear), rails = gear.rails || (gear.rails = []);
    let idx = -1;
    for (let i = 0; i < max; i++) if (!rails[i]) { idx = i; break; }
    if (idx < 0) { G.toast("No open rail — pull a Part off first", "bad"); return false; }
    rails[idx] = partId;
    G.parts[partId]--; if (G.parts[partId] <= 0) delete G.parts[partId];
    G.toast("Installed " + D.parts[partId].name + " on the " + S.gearName(gear), "good");
    G.persist();
    return true;
  };
  // pull a Part back off a rail and return it to your kit
  S.removePart = function (G, gear, railIdx) {
    const rails = gear && gear.rails;
    if (!rails || !rails[railIdx]) return false;
    const pid = rails[railIdx];
    G.parts[pid] = (G.parts[pid] || 0) + 1;
    rails[railIdx] = null;
    G.toast("Removed " + D.parts[pid].name, "info");
    G.persist();
    return true;
  };
  S.gearName = function (g) { return (g.unique && D.uniques[g.unique]) ? D.uniques[g.unique].name : (D.gearRarity[g.rarity].name + " " + D.gearBases[g.base].name); };
  S.affixText = function (a) { return a.label.replace("{v}", a.value).replace("{p}", Math.round(a.value * 100)); };

  /* ---------- derived stats (equipped gear, else base pistol + crafted unlocks) ---------- */
  S.weaponStats = function (G) {
    const u = G.unlocks, sk = G.skillBonus || { dmg: 0, fireCdMul: 1 };
    const bb = G.buffBonus || S.BUFF_NEUTRAL();   // active rations sharpen the weapon
    const eq = G.equipped && G.equipped.weapon;
    if (eq) {
      const s = S.gearStats(eq);
      let damage = s.damage + (u.dmgBonus || 0) + sk.dmg + bb.dmg;
      let pierce = false;
      const uni = eq.unique && D.uniques[eq.unique];
      if (uni && uni.special) {
        if (uni.special.noticeScaleDmg) damage += G.notice * uni.special.noticeScaleDmg;   // Red Ledger: Notice → power
        if (uni.special.pierce) pierce = true;                                              // Severance: rounds pierce
      }
      return {
        damage: Math.round(damage),
        cooldown: s.cooldown * sk.fireCdMul * bb.fireCdMul, projSpeed: s.projSpeed, projLife: s.projLife,
        projRadius: s.projRadius, projCount: s.projCount || 1,
        knockback: s.knockback || 0, noticeMul: s.noticeMul || 1, pierce: pierce,
      };
    }
    const w = D.player.weapon;
    return {
      damage: w.damage + (u.dmgBonus || 0) + sk.dmg + bb.dmg + (u.carbine ? D.craftEffects.carbine.dmgBonus : 0),
      cooldown: w.cooldown * sk.fireCdMul * bb.fireCdMul * (u.carbine ? D.craftEffects.carbine.cooldownMul : 1),
      projSpeed: w.projSpeed,
      projLife: w.projLife,
      projRadius: w.projRadius + (u.carbine ? D.craftEffects.carbine.projRadiusAdd : 0),
      projCount: 1,
      knockback: w.knockback,   // pistol = 0; only specific gear shoves enemies
      noticeMul: 1,
    };
  };
  // equip a gear instance; the previously equipped piece returns to the carried gear
  S.equipGear = function (G, g) {
    if (!g) return;
    const slot = g.slot || "weapon";
    G.equipped = G.equipped || {};
    G.carriedGear = G.carriedGear || [];
    const i = G.carriedGear.indexOf(g);
    if (i >= 0) G.carriedGear.splice(i, 1);
    if (G.equipped[slot]) G.carriedGear.push(G.equipped[slot]);
    G.equipped[slot] = g;
    G.toast("Equipped " + S.gearName(g), "good");
    G.persist();
  };
  S.pulseCooldown = function (G) {
    const base = D.player.gadgets.pulse.cooldown;
    const red = (G.unlocks.pulseCdReduce || 0) + (G.skillBonus ? G.skillBonus.pulseCd : 0);
    return Math.max(D.craftEffects.capacitor.pulseCdMin, base - red);
  };
  S.applyMaxHp = function (G) {
    const before = G.player.maxHp;
    G.player.maxHp = D.player.maxHp + (G.unlocks.maxHpBonus || 0) + (G.skillBonus ? G.skillBonus.maxHp : 0);
    if (G.player.maxHp > before) G.player.heal(G.player.maxHp - before);
  };
  S.applySpeed = function (G) {
    const moveMul = (G.buffBonus && G.buffBonus.moveMul) || 1;
    G.player.speed = (D.player.speed + (G.unlocks.moveBonus || 0) + (G.skillBonus ? G.skillBonus.move : 0)) * moveMul;
  };

  /* ---------- Liens skill tree (spec §9.4) ---------- */
  S.recomputeSkills = function (G) {
    const sb = { maxHp: 0, dmg: 0, move: 0, backpack: 0, fireCdMul: 1, pulseCd: 0, mineMul: 1, regen: 0 };
    for (const id of (G.skills || [])) {
      const e = D.skills[id] && D.skills[id].eff; if (!e) continue;
      for (const k in e) { if (k === "fireCdMul") sb.fireCdMul *= e[k]; else sb[k] = (sb[k] || 0) + e[k]; }
    }
    G.skillBonus = sb;
  };
  S.skillState = function (G, id) {              // "owned" | "available" | "locked"
    if ((G.skills || []).indexOf(id) >= 0) return "owned";
    const n = D.skills[id];
    if (n.req && (G.skills || []).indexOf(n.req) < 0) return "locked";
    return G.skillPoints >= n.cost ? "available" : "tooexpensive";
  };
  S.allocSkill = function (G, id) {
    if (S.skillState(G, id) !== "available") return false;
    const n = D.skills[id];
    G.skills.push(id); G.skillPoints -= n.cost;
    S.recomputeSkills(G); S.applyMaxHp(G); S.applySpeed(G);
    G.toast("Lien signed: " + n.name + " — " + n.desc, "good"); G.persist();
    return true;
  };
  S.gainXp = function (G, n) {
    G.xp = (G.xp || 0) + n;
    while (G.xp >= D.skillXpCost) { G.xp -= D.skillXpCost; G.skillPoints = (G.skillPoints || 0) + 1; P.audio && P.audio.play("lien"); G.banner("LIEN POINT", "press K to spend"); }
  };

  /* ---------- effects ---------- */
  S.addEffect = function (G, fx) { fx.t = 0; G.effects.push(fx); };

  /* ---------- cooking & timed buffs (spec §12 #4) ---------- */
  S.BUFF_NEUTRAL = function () { return { dmg: 0, fireCdMul: 1, moveMul: 1, resist: 0, regen: 0, noticeMul: 1, mineMul: 1 }; };
  // collapse every active buff into one bonus object the derived-stat functions read
  S.recomputeBuffs = function (G) {
    const bb = S.BUFF_NEUTRAL();
    let resistKeep = 1;
    for (const b of (G.buffs || [])) {
      const e = b.eff || {};
      if (e.dmg) bb.dmg += e.dmg;
      if (e.fireCdMul) bb.fireCdMul *= e.fireCdMul;
      if (e.moveMul) bb.moveMul *= e.moveMul;
      if (e.regen) bb.regen += e.regen;
      if (e.noticeMul) bb.noticeMul *= e.noticeMul;
      if (e.mineMul) bb.mineMul *= e.mineMul;
      if (e.resist) resistKeep *= (1 - e.resist);   // resists stack multiplicatively
    }
    bb.resist = 1 - resistKeep;
    G.buffBonus = bb;
    if (G.player) { G.player.resist = bb.resist; S.applySpeed(G); }   // moveMul flows through speed
  };
  // apply (or refresh) a dish's buff — one entry per dish, re-eating just resets its timer
  S.addBuff = function (G, dish) {
    if (!dish.dur || !dish.eff) return;
    G.buffs = G.buffs || [];
    const ex = G.buffs.find(b => b.dishId === dish.id);
    if (ex) { ex.t = 0; ex.dur = dish.dur; ex.eff = dish.eff; }
    else G.buffs.push({ dishId: dish.id, name: dish.name, color: dish.color, t: 0, dur: dish.dur, eff: dish.eff });
    S.recomputeBuffs(G);
  };
  S.updateBuffs = function (G, dt) {
    if (!G.buffs || !G.buffs.length) return;
    let changed = false;
    for (const b of G.buffs) b.t += dt;
    for (let i = G.buffs.length - 1; i >= 0; i--) {
      if (G.buffs[i].t >= G.buffs[i].dur) { G.toast(G.buffs[i].name + " wore off", "info"); G.buffs.splice(i, 1); changed = true; }
    }
    if (changed) S.recomputeBuffs(G);
  };
  // cook a dish: spend stash ingredients, bank a few carryable portions
  S.cook = function (G, id) {
    const dish = D.cooking.find(d => d.id === id);
    if (!dish) return false;
    if (!U.invHasAll(G.stash.items, dish.cost)) { G.toast("Not enough ingredients — gather them out in the districts", "bad"); return false; }
    U.invTake(G.stash.items, dish.cost);
    G.meals[id] = (G.meals[id] || 0) + (dish.portions || 1);
    P.audio && P.audio.play("craft");
    G.toast("Cooked " + dish.name + " ×" + (dish.portions || 1), "good");
    G.persist();
    return true;
  };
  // eat one portion: instant heal (if any) + activate its timed buff
  S.eatMeal = function (G, id) {
    const dish = D.cooking.find(d => d.id === id);
    if (!dish) return false;
    if ((G.meals[id] || 0) <= 0) { G.toast("No " + dish.name + " cooked — make some at the Cookfire", "bad"); return false; }
    G.meals[id]--; if (G.meals[id] <= 0) delete G.meals[id];
    if (dish.heal) G.player.heal(dish.heal);
    S.addBuff(G, dish);
    P.audio && P.audio.play("heal");
    G.toast("Ate " + dish.name + (dish.heal ? " (+" + dish.heal + " VIT)" : "") + " — buff active", "good");
    G.persist();
    return true;
  };

  // scale an enemy's toughness by the depth where it stands (the spatial danger gradient)
  S.scaleByDepth = function (G, e) {
    if (e.titan) return e;                              // titans keep their fixed boss stats
    const d = G.world.depthAtPx(e.x, e.y);
    const s = U.clamp(1 + (d - 1) * 0.34, 0.7, 2.4);   // Undercity weaker, deep biome tougher
    e.maxHp = Math.round(e.maxHp * s); e.hp = e.maxHp; e.dmgMul = s;
    return e;
  };

  // a felled titan drops a guaranteed haul: gear + a Part + Chits + biome materials
  S.titanReward = function (G, e) {
    const rw = e.def.reward; if (!rw) return;
    // track district titans toward unlocking the Foreclosed Deep
    if (e.def.biome && e.def.biome !== "deep") {
      G.titansBeaten = G.titansBeaten || [];
      if (G.titansBeaten.indexOf(e.def.biome) < 0) {
        G.titansBeaten.push(e.def.biome);
        if (G.titansBeaten.length >= 5) { P.audio && P.audio.play("lien"); G.toast("All five district titans felled — the DEEP GATE wakes in the Hold.", "good"); }
      }
    }
    for (let i = 0; i < (rw.gearRolls || 1); i++) {
      const baseId = U.rngPick(Math.random, Object.keys(D.gearBases));
      const gear = S.rollGear(baseId, rw.forceRarity || S.rollGearRarity(rw.gearTier || 3));
      G.pickups.push(new Pickup(e.x + (Math.random() - 0.5) * 30, e.y + (Math.random() - 0.5) * 30, null, gear));
    }
    if (rw.parts) for (const pid of rw.parts) G.parts[pid] = (G.parts[pid] || 0) + 1;
    if (rw.loot) for (const k in rw.loot) for (let i = 0; i < rw.loot[k]; i++) G.pickups.push(new Pickup(e.x, e.y, k));
    if (rw.chits) G.stash.chits += rw.chits;
    P.audio && P.audio.play("titanFell");
    if (rw.deep) {                                       // the Auditor — the Deep is answered
      G.deepActive = false; G.deepCleared = true;
      G.unlocks.maxHpBonus = (G.unlocks.maxHpBonus || 0) + D.deep.hpBonus; S.applyMaxHp(G);
      G.shake && G.shake(10, 0.7);
      G.banner('<span style="color:#ffd27a">OFF THE LEDGER</span>', "The Deep is answered — +" + D.deep.hpBonus + " Max Vitality, forever");
      G.toast("You felled The Auditor. You're off the ledger — a Heirloom and a permanent boon are yours.", "good");
    } else {
      G.banner('<span style="color:' + e.def.color + '">TITAN FELLED</span>', e.def.name + " — " + (rw.parts ? rw.parts.length + " Part + " : "") + (rw.gearRolls || 1) + " gear · ◈" + (rw.chits || 0));
      G.toast("Felled " + e.def.name + "! Grab the haul before you go.", "good");
    }
  };

  // descend into the Foreclosed Deep: summon The Auditor deep in the Stacks (spec §12 #12)
  S.startDeep = function (G) {
    if (G.deepActive) { G.toast("The Auditor already walks — go and end it (west, deep).", "info"); return; }
    if ((G.titansBeaten || []).length < 5) { G.toast("The gate is dark — fell all 5 district titans first (" + (G.titansBeaten || []).length + "/5).", "bad"); return; }
    if (G.deepCleared) { G.toast("You're already off the ledger. The Deep is spent.", "info"); return; }
    const w = G.world, rad = w.undercityOuter + (w.mapRadius - w.undercityOuter) * 0.6;
    let x = w.centerX - rad, y = w.centerY;             // deep to the west (the Stacks)
    for (let k = 0; k < 30 && w.solidAtPx(x, y); k++) y += 32;
    const a = new Enemy("auditor", x, y); G.enemies.push(a);
    for (let i = 0; i < 4; i++) {                       // an escort of constructs
      const ang = Math.random() * Math.PI * 2, rr = 90 + Math.random() * 60;
      const ex = x + Math.cos(ang) * rr, ey = y + Math.sin(ang) * rr;
      if (!w.solidAtPx(ex, ey)) { const m = new Enemy("sec_construct", ex, ey); m.summonedBy = a; S.scaleByDepth(G, m); G.enemies.push(m); }
    }
    G.deepActive = true;
    P.audio && P.audio.play("sweep");
    G.banner('<span style="color:#b388ff">THE DEEP OPENS</span>', "The Auditor walks the deep Stacks — go and end it");
    G.toast("The Auditor has manifested deep in the Stacks (head WEST). End it to slip the Concern's leash.", "bad");
  };

  /* ---------- combat ---------- */
  S.fire = function (G) {
    const p = G.player;
    if (p.fireCd > 0) return;
    if (G.world.isSafeAtPx(p.x, p.y)) return;   // no shooting from inside the base
    const w = S.weaponStats(G);
    const baseAng = Math.atan2(p.aim.y, p.aim.x);
    const n = Math.max(1, w.projCount || 1);
    const spread = n > 1 ? 0.16 : 0;            // multi-pellet weapons fan out
    for (let i = 0; i < n; i++) {
      const a = baseAng + (i - (n - 1) / 2) * spread;
      const nx = Math.cos(a), ny = Math.sin(a);
      const mx = p.x + nx * (p.radius + 6), my = p.y + ny * (p.radius + 6);
      G.projectiles.push(new Projectile(mx, my, nx * w.projSpeed, ny * w.projSpeed, {
        damage: w.damage, life: w.projLife, radius: w.projRadius, knockback: w.knockback, fromPlayer: true, pierce: w.pierce,
      }));
    }
    p.fireCd = w.cooldown;
    P.audio && P.audio.play("shoot", 35);
    S.addNotice(G, D.notice.fireBonus * (w.noticeMul || 1));
    S.addEffect(G, { type: "muzzle", x: p.x + Math.cos(baseAng) * (p.radius + 6), y: p.y + Math.sin(baseAng) * (p.radius + 6), dur: 0.06 });
  };

  S.pulse = function (G) {
    const p = G.player, g = D.player.gadgets.pulse;
    if (p.pulseCd > 0) return;
    if (G.world.isSafeAtPx(p.x, p.y)) return;   // no combat from inside the base
    let hits = 0;
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (U.dist(p.x, p.y, e.x, e.y) <= g.radius + e.radius) {
        e.hit(g.damage);
        e.knock(e.x - p.x, e.y - p.y, g.knockback);  // the Shock Pulse DOES shove
        hits++;
      }
    }
    p.pulseCd = S.pulseCooldown(G);
    P.audio && P.audio.play("pulse");
    G.shake && G.shake(5, 0.25);
    S.addNotice(G, D.notice.pulseBonus);
    S.addEffect(G, { type: "pulse", x: p.x, y: p.y, dur: 0.35, radius: g.radius });
    if (hits) G.toast("Shock Pulse — " + hits + " hit", "info");
  };

  /* ---------- deployable Modules (spec §9.3) ---------- */
  S.deployModule = function (G) {
    const p = G.player;
    if (!G.module) { G.toast("No Module equipped — unlock one at the Fab Bench", "bad"); return; }
    if (G.world.isSafeAtPx(p.x, p.y)) { G.toast("Deploy Modules out in the districts, not the Hold", "info"); return; }
    if (p.moduleCd > 0) return;
    const mod = D.modules[G.module];
    G.deployables.push(new Deployable(G.module, p.x + p.aim.x * 22, p.y + p.aim.y * 22));
    p.moduleCd = mod.cooldown;
    P.audio && P.audio.play("deploy");
    S.addNotice(G, 5);                                  // dropping a noisy device draws a little heat
    S.addEffect(G, { type: "pulse", x: p.x, y: p.y, dur: 0.3, radius: 60 });
    G.toast(mod.name + " deployed", "good");
  };

  S.useMed = function (G) {
    const p = G.player;
    if (G.med <= 0) { G.toast("No Med-Patches — craft one at the Fab Bench", "bad"); return; }
    if (p.hp >= p.maxHp) { G.toast("Vitality already full", "info"); return; }
    G.med--;
    p.heal(D.player.gadgets.med.heal);
    P.audio && P.audio.play("heal");
    G.toast("Med-Patch used (+" + D.player.gadgets.med.heal + " VIT)", "good");
  };

  /* ---------- loot (chests + kills only — no free nodes) ---------- */
  S.dropLoot = function (G, x, y, tier, rolls) {
    const lt = D.loot[tier] || D.loot[1];
    const n = U.rngInt(Math.random, rolls[0], rolls[1]);
    for (let i = 0; i < n; i++) {
      const item = U.rngWeighted(Math.random, lt.table);
      G.pickups.push(new Pickup(x, y, item));
    }
  };
  S.enemyDrop = function (G, enemy) {
    S.dropLoot(G, enemy.x, enemy.y, enemy.def.tier, D.loot_rules.enemyDropRolls);
    if (enemy.def.tier >= 2) S.maybeDropGear(G, enemy.x, enemy.y, enemy.def.tier, 0.06);  // tougher kills can drop gear
  };
  // chance to spill a gear instance; richer the deeper (tier) you are
  S.maybeDropGear = function (G, x, y, tier, chance) {
    if (chance == null) chance = [0.05, 0.14, 0.22, 0.32][tier] != null ? [0.05, 0.14, 0.22, 0.32][tier] : 0.14;
    if (Math.random() > chance) return;
    const baseId = U.rngPick(Math.random, Object.keys(D.gearBases));
    const gear = S.rollGear(baseId, S.rollGearRarity(tier));
    G.pickups.push(new Pickup(x, y, null, gear));
  };
  /* ---------- mining: tools break district nodes; the gun shoots through them ---------- */
  S.hitNode = function (G, c, r, dmg) {
    const res = G.world.damageNode(c, r, dmg);
    if (!res) return null;
    S.addEffect(G, { type: "spark", x: res.cx, y: res.cy, dur: 0.18, col: res.node.color });
    P.audio && P.audio.play(res.destroyed ? "nodeBreak" : "mine", res.destroyed ? 0 : 60);
    if (res.destroyed) {
      for (const d of res.node.drops) {
        const n = U.rngInt(Math.random, d[1][0], d[1][1]);
        for (let i = 0; i < n; i++) G.pickups.push(new Pickup(res.cx, res.cy, d[0]));
      }
      S.addNotice(G, 3);                  // breaking the world draws attention
    }
    return res;
  };
  S.mineSwing = function (G) {
    const p = G.player, TILE = D.world.TILE;
    if (p.mineCd > 0) return;
    if (G.world.isSafeAtPx(p.x, p.y)) return;          // no mining inside the Hold
    const tool = D.tools[G.tool] || D.tools.cutter;
    const c = Math.floor((p.x + p.aim.x * tool.reach) / TILE);
    const r = Math.floor((p.y + p.aim.y * tool.reach) / TILE);
    const node = G.world.mineAt(c, r);
    if (!node) return;                                 // nothing to mine in the aim direction
    p.mineCd = tool.cooldown;
    if (tool.power < node.hardness) {                  // need a stronger cutter
      S.addEffect(G, { type: "spark", x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, dur: 0.15, col: "#ff6a6a" });
      if (!G._hardT || U.now() - G._hardT > 1.6) { G._hardT = U.now(); G.toast("Too hard for the " + tool.name + " — craft a Plasma Cutter at the Fab Bench", "bad"); }
      return;
    }
    const mineMul = (G.skillBonus ? G.skillBonus.mineMul : 1) * ((G.buffBonus && G.buffBonus.mineMul) || 1);
    S.hitNode(G, c, r, tool.dmg * mineMul);
  };

  S.chestLocked = function (G, chest) {
    const R = D.loot_rules.chestLockRadius;
    for (const e of G.enemies) if (!e.dead && U.dist2(e.x, e.y, chest.x, chest.y) < R * R) return true;
    return false;
  };
  S.openChest = function (G, chest) {
    if (G.world.opened[chest.id]) return;
    if (S.chestLocked(G, chest)) { G.toast("Chest is locked — clear the nearby enemies first", "bad"); return; }
    if (!G.canCarry()) { G.toast("Backpack full — bank salvage at the Hold first", "bad"); return; }
    S.dropLoot(G, chest.x, chest.y, chest.tier, D.loot_rules.chestRolls);
    S.maybeDropGear(G, chest.x, chest.y, chest.tier);   // chests can also yield a weapon
    G.world.opened[chest.id] = true;
    P.audio && P.audio.play("bank");
    G.toast("Chest cracked — salvage spills out", "good");
    S.addNotice(G, 6);   // cracking a vault is loud (spec §9.7)
    P.save && G.persist();
  };

  /* ---------- field casino: the pull (spec §9.9) ---------- */
  S.slots = function (G) {
    const c = D.casino;
    if (G.stash.chits < c.slotsCost) { G.toast("Not enough Chits to play — need " + c.slotsCost, "bad"); return null; }
    G.stash.chits -= c.slotsCost;
    const payout = U.rngWeighted(Math.random, c.slots);
    G.stash.chits += payout;
    const sym = c.symbols;
    let reels;
    if (payout >= 150) reels = ["★", "★", "★"];                                   // jackpot
    else if (payout > 0) { const s = U.rngPick(Math.random, sym); reels = [s, s, U.rngPick(Math.random, sym)]; }
    else reels = [U.rngPick(Math.random, sym), U.rngPick(Math.random, sym), U.rngPick(Math.random, sym)];
    if (P.audio) { P.audio.play("spin"); setTimeout(() => P.audio.play(payout >= 150 ? "jackpot" : payout > 0 ? "win" : "lose"), 340); }
    G.persist();
    return { payout, net: payout - c.slotsCost, reels };
  };
  S.doubleOrNothing = function (G) {
    if (U.invEmpty(G.carried)) { G.toast("Nothing carried to wager", "info"); return null; }
    const staked = U.invTotal(G.carried);
    const win = Math.random() < D.casino.doubleChance;
    if (win) { const snap = U.invClone(G.carried); for (const k in snap) U.invAdd(G.carried, k, snap[k]); }
    else { for (const k in G.carried) delete G.carried[k]; }
    P.audio && P.audio.play(win ? "jackpot" : "lose");
    G.persist();
    return { win, staked };
  };
  S.pull = function (G) {
    const c = D.casino;
    if (G.stash.chits < c.pullCost) { G.toast("Not enough Chits to pull — need " + c.pullCost, "bad"); return null; }
    G.stash.chits -= c.pullCost;
    G.pity = (G.pity || 0) + 1;
    let rarity, pityHit = false;
    if (G.pity >= c.pityAt) { rarity = U.rngWeighted(Math.random, c.pullRarity); G.pity = 0; pityHit = true; }
    else { rarity = S.rollGearRarity(2); if (rarity === "scrap") rarity = "standard"; }   // pulls floor at Standard
    const baseId = U.rngPick(Math.random, Object.keys(D.gearBases));
    const gear = S.rollGear(baseId, rarity);
    (G.carriedGear || (G.carriedGear = [])).push(gear);
    const col = D.gearRarity[rarity].color;
    P.audio && P.audio.play(pityHit ? "jackpot" : "win");
    G.banner('<span style="color:' + col + '">' + S.gearName(gear) + "</span>", (pityHit ? "PITY DROP · " : "") + "fresh off the machine");
    G.persist();
    return { gear, rarity, pityHit };
  };

  /* ---------- extraction: bank ---------- */
  S.bank = function (G) {
    if (U.invEmpty(G.carried)) { G.toast("Nothing to bank", "info"); return; }
    let value = 0, count = 0;
    for (const k in G.carried) { value += (D.items[k].value || 0) * G.carried[k]; count += G.carried[k]; }
    U.invMergeInto(G.stash.items, G.carried);
    P.audio && P.audio.play("bank");
    G.toast("Banked " + count + " salvage (worth ◈" + value + ") — safe.", "good");
    G.persist();
  };

  /* ---------- extraction: death -> drop a recoverable cache (§9.1) ---------- */
  S.die = function (G) {
    let lost = 0;
    for (const k in G.carried) lost += G.carried[k];
    const gearAtRisk = (G.carriedGear || []).slice();   // equipped weapon stays; spares drop
    const total = lost + gearAtRisk.length;
    // only one cache at a time: an older un-recovered one is forfeited to the Concern
    if (G.deathCache && (!U.invEmpty(G.deathCache.items) || (G.deathCache.gear && G.deathCache.gear.length))) {
      G.pendingClaim = G.pendingClaim || {};
      U.invMergeInto(G.pendingClaim, G.deathCache.items);   // old materials → Claim; old gear is lost
    }
    G.deathCache = total > 0 ? {
      x: G.player.x, y: G.player.y,
      items: U.invClone(G.carried), gear: gearAtRisk,
      biome: G.world.biomeAtPx(G.player.x, G.player.y).name,
      cycle: G.cycle, count: total,
    } : null;
    for (const k in G.carried) delete G.carried[k];
    G.carriedGear = [];
    lost = total;
    const sp = G.world.holdSpawn();
    G.player.x = sp.x; G.player.y = sp.y;
    G.player.hp = G.player.maxHp;
    G.player.invulnT = 1.2;
    G.player.alive = true;
    G.notice = 0;
    G.sweepActive = false; G.sweepCooldown = 0;
    G.projectiles = []; G.effects = []; G.pickups = []; G.deployables = [];
    P.audio && P.audio.play("death");
    G.shake && G.shake(7, 0.5);
    G.endEvent && G.endEvent(false);
    if (lost > 0) {
      G.banner("YOU FELL", lost + " salvage dropped in " + G.deathCache.biome);
      G.toast("Your haul lies where you fell. Recover it before you rest — or file a Claim for scraps.", "bad");
    } else {
      G.banner("YOU FELL", "carrying nothing to lose");
      G.toast("You died — but your pack was empty.", "info");
    }
    G.persist();
  };

  // walk back to the death site and reclaim the whole haul (better than the Claim)
  S.recoverCache = function (G) {
    const c = G.deathCache;
    if (!c || (U.invEmpty(c.items) && !(c.gear && c.gear.length))) { G.deathCache = null; return; }
    let n = 0;
    for (const k in c.items) { U.invAdd(G.carried, k, c.items[k]); n += c.items[k]; }
    if (c.gear && c.gear.length) { G.carriedGear = (G.carriedGear || []).concat(c.gear); n += c.gear.length; }
    G.deathCache = null;
    S.addNotice(G, D.deathCache.recoverNotice);   // disturbing the site stirs attention
    G.toast("Recovered your dropped haul — " + n + " salvage back in your pack. Now get home.", "good");
    G.persist();
  };

  /* ---------- extraction: the Claim ---------- */
  S.fileClaim = function (G) {
    if (!G.pendingClaim || U.invEmpty(G.pendingClaim)) return null;
    const kept = {}, lost = {};
    for (const k in G.pendingClaim) {
      const chance = D.rarity[D.items[k].rarity].claimChance;
      for (let i = 0; i < G.pendingClaim[k]; i++) {
        if (Math.random() < chance) U.invAdd(kept, k, 1); else U.invAdd(lost, k, 1);
      }
    }
    for (const k in kept) U.invAdd(G.stash.items, k, kept[k]);
    G.pendingClaim = null;
    G.persist();
    return { kept, lost };
  };

  /* ---------- crafting ---------- */
  S.craft = function (G, recipeId) {
    const recipe = D.recipes.find(r => r.id === recipeId);
    if (!recipe) return false;
    if (!U.invHasAll(G.stash.items, recipe.cost)) { G.toast("Not enough materials", "bad"); return false; }
    const fx = D.craftEffects[recipeId];
    if (fx.once && G.unlocks[recipeId]) { G.toast("Already installed", "info"); return false; }
    U.invTake(G.stash.items, recipe.cost);

    if (fx.maxHpBonus) { G.unlocks.maxHpBonus = (G.unlocks.maxHpBonus || 0) + fx.maxHpBonus; S.applyMaxHp(G); }
    if (fx.moveBonus) { G.unlocks.moveBonus = (G.unlocks.moveBonus || 0) + fx.moveBonus; S.applySpeed(G); }
    if (fx.backpackBonus) G.unlocks.satchelBonus = (G.unlocks.satchelBonus || 0) + fx.backpackBonus;
    if (fx.dmgBonus && recipeId !== "carbine") G.unlocks.dmgBonus = (G.unlocks.dmgBonus || 0) + fx.dmgBonus;
    if (fx.pulseCdReduce) G.unlocks.pulseCdReduce = (G.unlocks.pulseCdReduce || 0) + fx.pulseCdReduce;
    if (fx.giveMed) G.med += fx.giveMed;
    if (fx.chits) G.stash.chits += fx.chits;
    if (fx.tool) { G.tool = fx.tool; G.unlocks[recipeId] = true; }   // upgrade mining tool
    if (fx.module) { G.module = fx.module; G.unlocks[recipeId] = true; }   // unlock+equip a deployable Module
    if (recipeId === "carbine") G.unlocks.carbine = true;

    P.audio && P.audio.play("craft");
    G.toast("Crafted: " + recipe.name, "good");
    G.persist();
    return true;
  };

  /* ---------- mechanical sidekicks: Hold automation (spec §9.12) ---------- */
  S.buildSidekick = function (G, id) {
    const sk = D.sidekicks[id]; if (!sk) return false;
    if ((G.sidekicks || []).indexOf(id) >= 0) { G.toast("Already assembled", "info"); return false; }
    if (!U.invHasAll(G.stash.items, sk.cost)) { G.toast("Not enough salvage to assemble the " + sk.name, "bad"); return false; }
    U.invTake(G.stash.items, sk.cost);
    (G.sidekicks || (G.sidekicks = [])).push(id);
    P.audio && P.audio.play("craft");
    G.toast("Assembled " + sk.name + " — it'll work the Hold each cycle", "good");
    G.persist();
    return true;
  };
  // run every owned sidekick's job once (called on rest / cycle turnover); returns a report
  S.runSidekicks = function (G) {
    const out = [];
    for (const id of (G.sidekicks || [])) {
      const sk = D.sidekicks[id]; if (!sk) continue;
      if (sk.consume && !U.invHasAll(G.stash.items, sk.consume)) { out.push(sk.name + " idled (no feedstock)"); continue; }
      if (sk.consume) U.invTake(G.stash.items, sk.consume);
      const parts = [];
      for (const k in sk.yield) {
        const n = U.rngInt(Math.random, sk.yield[k][0], sk.yield[k][1]);
        if (n > 0) { U.invAdd(G.stash.items, k, n); parts.push(D.items[k].name + " ×" + n); }
      }
      if (parts.length) out.push(sk.name + ": " + parts.join(", "));
    }
    return out;
  };

  /* ---------- Hold farming — the "grow" loop ---------- */
  S.plant = function (G) {
    if (G.farm.planted) { G.toast("Hydroponics already growing", "info"); return; }
    if (U.invCount(G.carried, "seed") > 0) U.invTake(G.carried, { seed: 1 });
    else if (U.invCount(G.stash.items, "seed") > 0) U.invTake(G.stash.items, { seed: 1 });
    else { G.toast("No Spore Seeds — they grow out in the Greenline (south)", "bad"); return; }
    G.farm = { planted: true, growth: 0, ready: false };
    G.toast("Planted a Spore Seed. Rest at the Cot to let it grow.", "good");
    G.persist();
  };
  S.harvestFarm = function (G) {
    if (!G.farm.ready) return;
    const n = U.rngInt(Math.random, D.farm.yield[0], D.farm.yield[1]);
    U.invAdd(G.stash.items, "organics", n);   // harvested at home → straight to safe stash
    G.farm = { planted: false, growth: 0, ready: false };
    G.toast("Harvested " + n + " Organics → stored. Craft Field Rations at the Fab Bench.", "good");
    G.persist();
  };

  /* ---------- rest / cycle turnover (§8.1) ---------- */
  S.rest = function (G) {
    G.cycle += 1;
    G.player.heal(G.player.maxHp);
    G.notice = 0;
    if (G.deathCache && (!U.invEmpty(G.deathCache.items) || (G.deathCache.gear && G.deathCache.gear.length))) {
      G.pendingClaim = G.pendingClaim || {};            // un-recovered haul is re-foreclosed
      U.invMergeInto(G.pendingClaim, G.deathCache.items);
      const gearGone = G.deathCache.gear ? G.deathCache.gear.length : 0;   // gear left behind is lost for good
      G.deathCache = null;
      G.toast("The Concern collected the haul you left out there" + (gearGone ? " — including " + gearGone + " piece(s) of gear" : "") + ". File a Claim for the materials.", "bad");
    }
    if (G.farm.planted && !G.farm.ready) {    // crops mature across cycles
      G.farm.growth += 1;
      if (G.farm.growth >= D.farm.growTime) G.farm.ready = true;
    }
    const skReport = S.runSidekicks(G);        // sidekicks work the Hold each cycle
    G.regenerateWorld();
    G.banner("CYCLE " + G.cycle, "The districts have re-foreclosed");
    G.toast("Rested. Vitality restored, the districts reshuffled.", "info");
    if (skReport.length) G.toast("Sidekicks worked the Hold — " + skReport.join(" · "), "good");
    G.persist();
  };

  /* ---------- Notice meter (§7) ---------- */
  S.addNotice = function (G, n) {
    if (G.world.isSafeAtPx(G.player.x, G.player.y)) return;
    if (n > 0) n *= (G.buffBonus && G.buffBonus.noticeMul) || 1;   // a Spore Tonic muffles you
    G.notice = U.clamp(G.notice + n, 0, D.notice.max);
  };
  S.updateNotice = function (G, dt, moving) {
    const N = D.notice;
    if (G.world.isSafeAtPx(G.player.x, G.player.y)) {
      G.notice = U.clamp(G.notice - N.safeDecay * dt, 0, N.max);
      return;
    }
    const nm = (G.buffBonus && G.buffBonus.noticeMul) || 1;
    const depth = G.world.depthAtPx(G.player.x, G.player.y);
    let delta = depth * N.risePerDepth * dt * nm;  // continuous with the depth gradient
    if (moving) delta -= N.moveDecay * dt; else delta += N.dwellBonus * dt * nm;
    G.notice = U.clamp(G.notice + delta, 0, N.max);

    if (G.notice >= N.sweepAt && !G.sweepActive && !(G.event && G.event.active)) S.repoSweep(G);
  };
  S.repoSweep = function (G) {
    const p = G.player;
    const reg = G.world.regionAtPx(p.x, p.y);
    const ev = D.sweepEvents[reg] || D.sweepEvents.north;   // each district reacts its own way
    const depth = G.world.depthAtPx(p.x, p.y);
    const extra = depth >= 3 ? 2 : depth >= 2 ? 1 : 0;       // deeper = a heavier wave
    for (const [type, n] of ev.spawn) S.spawnRing(G, type, n + extra, D.notice.sweepRadius, D.notice.sweepMinRadius);
    G.notice = D.notice.sweepDrop;
    G.sweepActive = true; G.sweepCooldown = 6;
    P.audio && P.audio.play("sweep");
    G.banner(ev.name, ev.sub);
    G.toast(ev.toast, "bad");
  };

  // spawn N enemies around the player, between minRadius and radius. Tries many
  // random positions per enemy so it still fills out near walls / map edges.
  S.spawnRing = function (G, type, count, radius, minRadius, tag) {
    minRadius = minRadius || Math.min(radius - 40, 280);
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 28; tries++) {
        const a = Math.random() * Math.PI * 2;
        const rr = minRadius + Math.random() * Math.max(1, radius - minRadius);
        const x = G.player.x + Math.cos(a) * rr, y = G.player.y + Math.sin(a) * rr;
        if (!G.world.solidAtPx(x, y) && !G.world.isSafeAtPx(x, y)) {
          const e = new Enemy(type, x, y);
          if (tag) e.fromEvent = true;
          S.scaleByDepth(G, e);
          G.enemies.push(e);
          break;
        }
      }
    }
  };

  /* ---------- Answer the Call (§9.7) ---------- */
  S.startEvent = function (G) {
    if (G.event && G.event.active) return;
    G.event = { active: true, wave: 0, state: "fighting" };
    S.spawnEventWave(G, 0);
    G.banner("ANSWER THE CALL", "Wave 1 of " + D.event.waves.length);
  };
  S.spawnEventWave = function (G, waveIdx) {
    const wave = D.event.waves[waveIdx];
    for (const [type, n] of wave.spawn) S.spawnRing(G, type, n, D.event.spawnRadius, D.event.spawnMinRadius, true);
  };
  S.eventWaveClear = function (G) {
    const wave = D.event.waves[G.event.wave];
    let rwTxt = [];
    if (wave.reward.loot) {
      for (const k in wave.reward.loot) { U.invAdd(G.carried, k, wave.reward.loot[k]); rwTxt.push(D.items[k].name + " ×" + wave.reward.loot[k]); }
    }
    if (wave.reward.chits) { G.stash.chits += wave.reward.chits; rwTxt.push("◈" + wave.reward.chits); }
    G.toast("Wave cleared — " + rwTxt.join(", "), "good");
    G.event.state = "checkpoint";
  };
  S.eventPush = function (G) {
    if (!G.event) return;
    G.event.wave++;
    if (G.event.wave >= D.event.waves.length) { G.banner("CALL ANSWERED", "All waves cleared"); G.endEvent(true); return; }
    G.event.state = "fighting";
    S.spawnEventWave(G, G.event.wave);
    G.banner("WAVE " + (G.event.wave + 1), "of " + D.event.waves.length);
  };

  P.systems = S;
})(window.PACT = window.PACT || {});
