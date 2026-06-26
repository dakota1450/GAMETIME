/* ============================================================
   THE PACT — ENTITIES
   Player, Enemy (chase + contact damage, biome-flavored shapes),
   Projectile (knockback only when the weapon has it), and Pickup
   (ground loot dropped by kills/chests that drifts to the player).
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;

  /* ---------------- Player ---------------- */
  function Player(x, y) {
    const pd = D.player;
    this.x = x; this.y = y;
    this.radius = pd.radius;
    this.speed = pd.speed;            // game.applySpeed() may raise this via gear
    this.maxHp = pd.maxHp;
    this.hp = pd.maxHp;
    this.vx = 0; this.vy = 0;         // smoothed velocity (accel + glide, not instant snap)
    this.walkT = 0;                   // walk-cycle phase (drives the bob)
    this.facing = { x: 0, y: -1 };
    this.aim = { x: 0, y: -1 };
    this.fireCd = 0;
    this.pulseCd = 0;
    this.moduleCd = 0;
    this.mineCd = 0;
    this.invulnT = 0;
    this.hitFlash = 0;
    this.resist = 0;                  // damage reduction from active buffs (Plated Rations)
  }
  Player.prototype.takeDamage = function (dmg) {
    if (this.invulnT > 0) return false;
    this.hp -= dmg * (1 - (this.resist || 0));
    this.invulnT = D.player.invuln;
    this.hitFlash = 0.25;
    return true;
  };
  Player.prototype.heal = function (n) { this.hp = U.clamp(this.hp + n, 0, this.maxHp); };
  Player.prototype.draw = function (ctx, cam) {
    const spd = Math.hypot(this.vx || 0, this.vy || 0);
    const bob = spd > 18 ? Math.abs(Math.sin(this.walkT)) * 2.6 : 0;   // little step-bounce
    const x = this.x - cam.x, y = this.y - cam.y - bob;
    const flick = this.invulnT > 0 && (Math.floor(U.now() * 20) & 1);
    if (flick) return;
    // sprite (rotated to face aim) if available, else the procedural body
    if (P.assets && P.assets.draw(ctx, "player", x, y, this.radius * 3.7, Math.atan2(this.aim.y, this.aim.x) + Math.PI / 2)) {
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#12161e";
    ctx.beginPath(); ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.hitFlash > 0 ? "#ff5a6e" : "#ffb347";
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#1a1206";
    ctx.beginPath(); ctx.arc(0, 0, this.radius - 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#4fd6c9"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(this.aim.x * (this.radius + 8), this.aim.y * (this.radius + 8));
    ctx.stroke();
    ctx.restore();
  };

  /* ---------------- shape helper ---------------- */
  function shapePath(ctx, shape, r) {
    ctx.beginPath();
    if (shape === "triangle") { ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); }
    else if (shape === "diamond") { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); }
    else if (shape === "square") { ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); }
    else if (shape === "circle") { ctx.arc(0, 0, r, 0, Math.PI * 2); }
    else { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
  }

  /* ---------------- Enemy ---------------- */
  function Enemy(type, x, y) {
    const def = D.enemies[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y;
    this.radius = def.radius;
    this.hp = def.hp; this.maxHp = def.hp;
    this.speed = def.speed;
    this.color = def.color;
    this.dmgMul = 1;            // scaled by spawn depth (the spatial danger gradient)
    this.touchCd = 0;
    this.kbx = 0; this.kby = 0;
    this.dead = false;
    this.hurtFlash = 0;
    this.state = "chase";       // chase | windup | dash | recover
    this.stateT = 0; this.tele = 0;
    this.atkCd = 0.6 + Math.random() * 1.6;   // stagger first attacks
    this.animT = Math.random() * 6.28;
    this.dashx = 0; this.dashy = 0;
    this.titan = !!def.titan;
    this.summonCd = def.summon ? def.summon.cd : 0;
  }
  Enemy.prototype.hit = function (dmg) { this.hp -= dmg; this.hurtFlash = 0.12; if (this.hp <= 0) this.dead = true; };
  Enemy.prototype.knock = function (dx, dy, force) { const [nx, ny] = U.norm(dx, dy); this.kbx += nx * force; this.kby += ny * force; };
  Enemy.prototype.update = function (dt, G) {
    if (this.touchCd > 0) this.touchCd -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    this.animT += dt;
    const p = G.player;
    const prevX = this.x, prevY = this.y;

    // while being shoved, the enemy slides and can't act
    const knocking = Math.abs(this.kbx) > 6 || Math.abs(this.kby) > 6;
    if (this.kbx || this.kby) {
      G.world.moveBody(this, this.kbx * dt, this.kby * dt);
      this.kbx *= 0.86; this.kby *= 0.86;
      if (Math.abs(this.kbx) < 4 && Math.abs(this.kby) < 4) { this.kbx = 0; this.kby = 0; }
      if (knocking) { this.state = "chase"; this.tele = 0; }
    }

    const def = this.def, atk = def.atk, beh = def.behavior || "chase";
    const playerSafe = G.world.isSafeAtPx(p.x, p.y);
    const d = U.dist(this.x, this.y, p.x, p.y) || 1;
    const dirx = (p.x - this.x) / d, diry = (p.y - this.y) / d;

    if (!knocking && p.alive !== false && !playerSafe) {
      if (this.state === "windup") {
        this.stateT -= dt; this.tele = U.clamp(1 - this.stateT / atk.windup, 0, 1);
        if (this.stateT <= 0) this._unleash(G, beh, atk, dirx, diry, d);
      } else if (this.state === "dash") {
        this.stateT -= dt;
        G.world.moveBody(this, this.dashx * dt, this.dashy * dt);
        if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.5; }
      } else if (this.state === "recover") {
        this.stateT -= dt; this.tele = 0;
        if (this.stateT <= 0) this.state = "chase";
      } else {
        this.tele = 0;
        this._chaseMove(G, dt, beh, atk, d, dirx, diry);
        if (atk && this.atkCd <= 0 && d < atk.range && d < def.aggro) { this.state = "windup"; this.stateT = atk.windup; }
      }
    } else { this.tele = 0; }

    if (G.world.isSafeAtPx(this.x, this.y)) { this.x = prevX; this.y = prevY; }

    if (!playerSafe && U.dist(this.x, this.y, p.x, p.y) < this.radius + p.radius + 1 && this.touchCd <= 0) {
      const mult = this.state === "dash" ? 1.6 : 1;
      if (p.takeDamage(Math.round(def.touchDmg * this.dmgMul * mult))) { this.touchCd = 0.7; P.game && P.game.shake(3.5, 0.2); }
    }

    // titans periodically call in reinforcements while engaged
    if (def.summon && !playerSafe && !knocking) {
      this.summonCd -= dt;
      if (this.summonCd <= 0 && d < def.aggro) {
        this.summonCd = def.summon.cd;
        const live = G.enemies.filter(e => !e.dead && e.summonedBy === this).length;
        if (live < (def.summon.cap || 4)) {
          for (let i = 0; i < def.summon.n; i++) {
            const a = Math.random() * Math.PI * 2, rr = this.radius + 20 + Math.random() * 30;
            const mx = this.x + Math.cos(a) * rr, my = this.y + Math.sin(a) * rr;
            if (G.world.solidAtPx(mx, my) || G.world.isSafeAtPx(mx, my)) continue;
            const m = new Enemy(def.summon.type, mx, my);
            m.summonedBy = this;
            if (P.systems) P.systems.scaleByDepth(G, m);
            G.enemies.push(m);
          }
          if (P.systems) P.systems.addEffect(G, { type: "pulse", x: this.x, y: this.y, dur: 0.3, radius: this.radius + 30 });
        }
      }
    }
  };
  // movement while not attacking — varies by behavior (chase / kite / pre-charge slow)
  Enemy.prototype._chaseMove = function (G, dt, beh, atk, d, dirx, diry) {
    if (d >= this.def.aggro) return;
    let mx = dirx, my = diry, spd = this.speed;
    if (beh === "shoot" && atk) {
      if (d < atk.prefer - 24) { mx = -dirx; my = -diry; }            // back off
      else if (d > atk.prefer + 44) { mx = dirx; my = diry; }         // close in
      else { mx = -diry; my = dirx; spd = this.speed * 0.7; }         // strafe at range
    } else if (beh === "charge" && atk && d < atk.range * 0.45) {
      spd = this.speed * 0.4;                                          // hounds slow to pounce
    }
    G.world.moveBody(this, mx * spd * dt, my * spd * dt);
  };
  // resolve the attack at the end of windup
  Enemy.prototype._unleash = function (G, beh, atk, dirx, diry, d) {
    this.atkCd = atk.cd; this.tele = 0;
    if (beh === "lunge" || beh === "charge") {
      this.dashx = dirx * atk.dash; this.dashy = diry * atk.dash;
      this.state = "dash"; this.stateT = atk.dashTime;
    } else if (beh === "slam") {
      if (d < atk.radius + G.player.radius) G.player.takeDamage(Math.round(atk.dmg * this.dmgMul));
      if (P.systems) P.systems.addEffect(G, { type: "pulse", x: this.x, y: this.y, dur: 0.32, radius: atk.radius });
      P.game && P.game.shake(this.titan ? 6 : 4, 0.3);
      P.audio && P.audio.play("pulse");
      this.state = "recover"; this.stateT = 0.55;
    } else if (beh === "shoot") {
      const n = atk.burst || 1, base = Math.atan2(diry, dirx), spr = atk.spread || 0;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spr, cs = Math.cos(a), sn = Math.sin(a);
        G.projectiles.push(new Projectile(this.x + cs * this.radius, this.y + sn * this.radius, cs * atk.projSpeed, sn * atk.projSpeed,
          { damage: Math.round(atk.projDmg * this.dmgMul), life: 2.6, radius: 5, fromPlayer: false, color: atk.projColor }));
      }
      this.state = "recover"; this.stateT = 0.4;
    } else if (beh === "blink") {
      const step = Math.min(atk.blink, d - (this.radius + G.player.radius + 6));
      const nx = this.x + dirx * step, ny = this.y + diry * step;
      if (!G.world.solidAtPx(nx, ny) && !G.world.isSafeAtPx(nx, ny)) { this.x = nx; this.y = ny; }
      this.state = "recover"; this.stateT = 0.3;
    } else { this.state = "chase"; }
  };
  Enemy.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y, r = this.radius;
    const sprite = this.def.sprite || ("enemy_" + this.type);
    // titans wear a pulsing boss aura so they read as a threat from across the room
    if (this.titan) {
      const t = U.now(), pa = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = this.color; ctx.globalAlpha = 0.12 + 0.10 * pa;
      ctx.beginPath(); ctx.arc(x, y, r * (1.8 + 0.25 * pa), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5 + 0.3 * pa; ctx.lineWidth = 2; ctx.strokeStyle = this.color;
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    // attack telegraph: a growing warning ring while winding up
    if (this.state === "windup") {
      const k = this.tele || 0;
      ctx.save();
      ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath(); ctx.arc(x, y, r * 1.3 + r * 1.4 * k, 0, Math.PI * 2); ctx.stroke();
      if (this.def.behavior === "slam" && this.def.atk) {   // enforcer telegraphs its slam radius
        ctx.globalAlpha = 0.12 + 0.18 * k; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(x, y, this.def.atk.radius * k, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // anticipation pop on windup, stretch on dash
    const sz = r * 3.0 * (this.state === "windup" ? 1 + (this.tele || 0) * 0.2 : this.state === "dash" ? 1.12 : 1);
    if (P.assets && P.assets.has(sprite)) {
      P.assets.draw(ctx, sprite, x, y, sz);
      if (this.hurtFlash > 0) {           // white flash overlay on hit
        ctx.save(); ctx.globalAlpha = 0.6; ctx.globalCompositeOperation = "lighter";
        P.assets.draw(ctx, sprite, x, y, sz); ctx.restore();
      }
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = this.hurtFlash > 0 ? "#ffffff" : this.color;
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2;
      shapePath(ctx, this.def.shape, r);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (this.hp < this.maxHp) {
      const w = r * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - r, y - r - 8, w, 3);
      ctx.fillStyle = "#ff5a6e"; ctx.fillRect(x - r, y - r - 8, w * (this.hp / this.maxHp), 3);
    }
  };

  /* ---------------- Projectile ---------------- */
  function Projectile(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = opts.radius || 4;
    this.life = opts.life || 0.7;
    this.damage = opts.damage || 10;
    this.knockback = opts.knockback || 0;     // 0 = no shove (default pistol)
    this.fromPlayer = opts.fromPlayer !== false;
    this.pierce = !!opts.pierce;              // unique weapons: pass through enemies
    this._hit = null;                          // enemies already struck (pierce only)
    this.dead = false;
    this.color = opts.color || "#bff6f0";
  }
  Projectile.prototype.update = function (dt, G) {
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (G.world.pxHitsWall(this.x, this.y)) {
      if (this.fromPlayer) {                       // bullets chip through destructible nodes
        const T = D.world.TILE, c = Math.floor(this.x / T), r = Math.floor(this.y / T);
        if (G.world.mineAt(c, r)) P.systems.hitNode(G, c, r, this.damage * 0.6);
      }
      this.dead = true; return;
    }
    if (this.fromPlayer) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (this.pierce && this._hit && this._hit.has(e)) continue;   // already pierced this one
        if (U.dist2(this.x, this.y, e.x, e.y) < (e.radius + this.radius) * (e.radius + this.radius)) {
          e.hit(this.damage);
          if (this.knockback > 0) e.knock(this.vx, this.vy, this.knockback);
          P.audio && P.audio.play("hit", 30);
          if (P.systems) P.systems.addEffect(G, { type: "spark", x: this.x, y: this.y, dur: 0.12, col: "#ffe6b0" });
          if (this.pierce) { (this._hit || (this._hit = new Set())).add(e); }   // pierce: keep flying
          else { this.dead = true; break; }
        }
      }
    } else {
      const p = G.player;
      if (U.dist2(this.x, this.y, p.x, p.y) < (p.radius + this.radius) * (p.radius + this.radius)) {
        if (p.takeDamage(this.damage)) P.game && P.game.shake(3, 0.18);
        this.dead = true;
      }
    }
  };
  Projectile.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    ctx.save();
    ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(x, y, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ---------------- Pickup (ground loot: a material, or a gear instance) ---------------- */
  function Pickup(x, y, itemId, gear) {
    this.x = x; this.y = y;
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 50;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.itemId = itemId; this.gear = gear || null; this.radius = gear ? 8 : 6;
    this.life = gear ? 240 : 70;            // gear lingers longer so you don't lose it
    this.collected = false; this.t = 0;
  }
  Pickup.prototype.update = function (dt, G) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.collected = true; return; }
    this.vx *= 0.9; this.vy *= 0.9;
    if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) G.world.moveBody(this, this.vx * dt, this.vy * dt);
    const p = G.player, LR = D.loot_rules;
    const d = U.dist(this.x, this.y, p.x, p.y);
    // gear never counts against the material backpack cap, so it's always collectable
    const canCarry = this.gear ? true : (!G.canCarry || G.canCarry());
    if (canCarry && d < LR.pickupMagnet) {        // magnet toward the player
      const [nx, ny] = U.norm(p.x - this.x, p.y - this.y);
      const pull = Math.min(380, 140 + (LR.pickupMagnet - d) * 6);
      this.x += nx * pull * dt; this.y += ny * pull * dt;
    }
    if (canCarry && d < LR.pickupCollect + p.radius) {
      if (this.gear) {
        (G.carriedGear || (G.carriedGear = [])).push(this.gear);
        G.onGearPickup && G.onGearPickup(this.gear);
        P.audio && P.audio.play("win");
      } else {
        U.invAdd(G.carried, this.itemId, 1);
        G.onPickup && G.onPickup(this.itemId);
        P.audio && P.audio.play("pickup", 45);
      }
      this.collected = true;
    } else if (!canCarry && d < 46) {
      G.onBackpackFull && G.onBackpackFull();        // pack full — loot stays on the ground
    }
  };
  Pickup.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y + Math.sin(this.t * 6) * 2;
    if (this.gear) {                                   // gear = pulsing rarity-coloured diamond
      const col = D.gearRarity[this.gear.rarity].color;
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 4);
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = col; ctx.shadowBlur = 14 * pulse;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(3, 0); ctx.lineTo(0, 4); ctx.lineTo(-3, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    const it = D.items[this.itemId];
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = it.color; ctx.shadowBlur = 10;
    ctx.fillStyle = it.color;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };

  /* ---------------- Deployable (placed Module — e.g. the Salvage Turret) ---------------- */
  function Deployable(moduleId, x, y) {
    this.moduleId = moduleId;
    this.def = D.modules[moduleId].deploy;
    this.color = D.modules[moduleId].color;
    this.x = x; this.y = y;
    this.radius = 10;
    this.life = this.def.life;
    this.maxLife = this.def.life;
    this.hp = this.def.hp || 30;
    this.fireCd = 0.2;
    this.t = 0;
    this.aimAng = -Math.PI / 2;
    this.dead = false;
  }
  Deployable.prototype.update = function (dt, G) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0 || this.hp <= 0) { this.dead = true; return; }
    if (this.fireCd > 0) this.fireCd -= dt;
    // acquire the nearest live enemy in range and fire on cadence
    let best = null, bd = this.def.range * this.def.range;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = U.dist2(this.x, this.y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      this.aimAng = Math.atan2(best.y - this.y, best.x - this.x);
      if (this.fireCd <= 0) {
        const nx = Math.cos(this.aimAng), ny = Math.sin(this.aimAng);
        G.projectiles.push(new Projectile(this.x + nx * 13, this.y + ny * 13, nx * this.def.projSpeed, ny * this.def.projSpeed,
          { damage: this.def.damage, life: this.def.projLife, radius: this.def.projRadius, fromPlayer: true, color: "#9fd0ff" }));
        this.fireCd = this.def.fireCd;
        if (P.systems) P.systems.addEffect(G, { type: "muzzle", x: this.x + nx * 14, y: this.y + ny * 14, dur: 0.06 });
      }
    }
  };
  Deployable.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y;
    const expiring = this.life < 2.5 && (Math.floor(this.t * 8) & 1);   // blink as it runs down
    ctx.save();
    ctx.translate(x, y);
    if (P.lighting) P.lighting.shadow(ctx, 0, this.radius * 0.7, this.radius);
    ctx.globalAlpha = expiring ? 0.5 : 1;
    // base
    ctx.fillStyle = "#1a2230";
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = this.color; ctx.lineWidth = 2; ctx.stroke();
    // barrel tracks the target
    ctx.rotate(this.aimAng);
    ctx.fillStyle = this.color;
    ctx.fillRect(0, -2.5, this.radius + 8, 5);
    ctx.restore();
    // lifetime ring
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = this.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, this.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (this.life / this.maxLife)); ctx.stroke();
    ctx.restore();
  };

  P.entities = { Player, Enemy, Projectile, Pickup, Deployable };
})(window.PACT = window.PACT || {});
