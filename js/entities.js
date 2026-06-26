/* ============================================================
   THE PACT — ENTITIES
   Player (walk-bob + tool swing animation), Enemy (chase/charge/
   shoot state machine), Pickup (dropped items that fly to you),
   Projectile (ranged weapon + enemy shots).
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;

  /* ---------------- Player ---------------- */
  function Player(x, y) {
    const pd = D.player;
    this.x = x; this.y = y;
    this.radius = pd.radius;
    this.speed = pd.speed;
    this.maxHp = pd.maxHp; this.hp = pd.maxHp;
    this.vx = 0; this.vy = 0;
    this.walkT = 0;
    this.facing = { x: 0, y: 1 };
    this.aim = { x: 0, y: 1 };
    this.swingT = 0; this.swingDur = 0; this.swingKind = "pick";  // pick | sword
    this.attackCd = 0; this.mineCd = 0;
    this.invulnT = 0; this.hitFlash = 0;
    this.alive = true;
  }
  Player.prototype.takeDamage = function (dmg) {
    if (this.invulnT > 0 || !this.alive) return false;
    this.hp -= dmg;
    this.invulnT = D.player.invuln;
    this.hitFlash = 0.25;
    return true;
  };
  Player.prototype.heal = function (n) { this.hp = U.clamp(this.hp + n, 0, this.maxHp); };
  Player.prototype.swing = function (kind, dur) { this.swingKind = kind; this.swingT = dur; this.swingDur = dur; };

  Player.prototype.draw = function (ctx, cam) {
    const spd = Math.hypot(this.vx || 0, this.vy || 0);
    const bob = spd > 18 ? Math.abs(Math.sin(this.walkT)) * 2.4 : 0;
    const x = this.x - cam.x, y = this.y - cam.y - bob;
    const ang = Math.atan2(this.aim.y, this.aim.x);
    if (this.invulnT > 0 && (Math.floor(U.now() * 20) & 1)) return;   // i-frame flicker

    // tool swing arc (in front, toward aim) — drawn under the body
    if (this.swingT > 0) {
      const k = 1 - this.swingT / this.swingDur;          // 0..1 through the swing
      const sweep = (this.swingKind === "sword") ? 2.0 : 1.1;
      const a0 = ang - sweep / 2, a = a0 + sweep * k;
      const rr = this.radius + (this.swingKind === "sword" ? 26 : 16);
      ctx.save();
      ctx.globalAlpha = 0.5 * (1 - k * 0.4);
      ctx.strokeStyle = this.swingKind === "sword" ? "#dfe6ee" : "#cbb08a";
      ctx.lineWidth = this.swingKind === "sword" ? 4 : 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(x, y, rr, a0, a); ctx.stroke();
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.stroke();
      ctx.restore();
    }

    if (P.assets && P.assets.draw(ctx, "player", x, y, this.radius * 3.5, ang + Math.PI / 2)) {
      if (this.hitFlash > 0) { ctx.save(); ctx.globalAlpha = 0.5; ctx.globalCompositeOperation = "lighter"; P.assets.draw(ctx, "player", x, y, this.radius * 3.5, ang + Math.PI / 2); ctx.restore(); }
      return;
    }
    // procedural hooded scavenger
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#12161e"; ctx.beginPath(); ctx.arc(0, 0, this.radius + 2, 0, 6.28); ctx.fill();
    ctx.fillStyle = this.hitFlash > 0 ? "#ff5a6e" : "#caa46b"; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 6.28); ctx.fill();
    ctx.fillStyle = "#1a1206"; ctx.beginPath(); ctx.arc(this.aim.x * 3, this.aim.y * 3, this.radius - 4, 0, 6.28); ctx.fill();
    ctx.restore();
  };

  /* ---------------- shape helper ---------------- */
  function shapePath(ctx, shape, r) {
    ctx.beginPath();
    if (shape === "tri") { ctx.moveTo(0, -r); ctx.lineTo(r, r); ctx.lineTo(-r, r); ctx.closePath(); }
    else if (shape === "diamond") { ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); }
    else if (shape === "square") { ctx.rect(-r * 0.82, -r * 0.82, r * 1.64, r * 1.64); }
    else if (shape === "hex") { for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i - Math.PI / 2; const px = Math.cos(a) * r, py = Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
    else { ctx.arc(0, 0, r, 0, 6.28); }   // blob
  }

  /* ---------------- Enemy ---------------- */
  function Enemy(type, x, y) {
    const def = D.enemies[type];
    this.type = type; this.def = def;
    this.x = x; this.y = y; this.radius = def.radius;
    this.hp = def.hp; this.maxHp = def.hp;
    this.speed = def.speed; this.color = def.color;
    this.dmgMul = 1;
    this.touchCd = 0; this.kbx = 0; this.kby = 0;
    this.dead = false; this.hurtFlash = 0;
    this.state = "chase"; this.stateT = 0; this.tele = 0;
    this.atkCd = 0.6 + Math.random() * 1.6;
    this.animT = Math.random() * 6.28;
    this.dashx = 0; this.dashy = 0;
  }
  Enemy.prototype.hit = function (dmg) { this.hp -= dmg; this.hurtFlash = 0.12; if (this.hp <= 0) this.dead = true; };
  Enemy.prototype.knock = function (dx, dy, force) { const [nx, ny] = U.norm(dx, dy); this.kbx += nx * force; this.kby += ny * force; };
  Enemy.prototype.update = function (dt, G) {
    if (this.touchCd > 0) this.touchCd -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.atkCd > 0) this.atkCd -= dt;
    this.animT += dt;
    const p = G.player;

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

    if (!knocking && p.alive && !playerSafe) {
      if (this.state === "windup") {
        this.stateT -= dt; this.tele = U.clamp(1 - this.stateT / atk.windup, 0, 1);
        if (this.stateT <= 0) this._unleash(G, beh, atk, dirx, diry, d);
      } else if (this.state === "dash") {
        this.stateT -= dt;
        G.world.moveBody(this, this.dashx * dt, this.dashy * dt);
        if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.45; }
      } else if (this.state === "recover") {
        this.stateT -= dt; this.tele = 0;
        if (this.stateT <= 0) this.state = "chase";
      } else {
        this.tele = 0;
        this._chaseMove(G, dt, beh, atk, d, dirx, diry);
        if (atk && this.atkCd <= 0 && d < atk.range && d < def.aggro) { this.state = "windup"; this.stateT = atk.windup; }
      }
    } else { this.tele = 0; }

    // contact damage
    if (!playerSafe && U.dist(this.x, this.y, p.x, p.y) < this.radius + p.radius + 1 && this.touchCd <= 0) {
      const mult = this.state === "dash" ? 1.5 : 1;
      if (p.takeDamage(Math.round(def.dmg * this.dmgMul * mult))) { this.touchCd = 0.7; P.game && P.game.shake(3.5, 0.2); P.audio && P.audio.play("hit"); }
    }
  };
  Enemy.prototype._chaseMove = function (G, dt, beh, atk, d, dirx, diry) {
    if (d >= this.def.aggro) {           // idle wander when the player is far
      this._wt = (this._wt || 0) - dt;
      if (this._wt <= 0) { this._wt = 1 + Math.random() * 2; const a = Math.random() * 6.28; this._wx = Math.cos(a); this._wy = Math.sin(a); }
      G.world.moveBody(this, (this._wx || 0) * this.speed * 0.3 * dt, (this._wy || 0) * this.speed * 0.3 * dt);
      return;
    }
    let mx = dirx, my = diry, spd = this.speed;
    if (beh === "shoot" && atk) {
      if (d < atk.prefer - 24) { mx = -dirx; my = -diry; }
      else if (d > atk.prefer + 44) { mx = dirx; my = diry; }
      else { mx = -diry; my = dirx; spd = this.speed * 0.7; }
    } else if (beh === "charge" && atk && d < atk.range * 0.45) { spd = this.speed * 0.4; }
    G.world.moveBody(this, mx * spd * dt, my * spd * dt);
  };
  Enemy.prototype._unleash = function (G, beh, atk, dirx, diry, d) {
    this.atkCd = atk.cd; this.tele = 0;
    if (beh === "charge") {
      this.dashx = dirx * atk.dash; this.dashy = diry * atk.dash;
      this.state = "dash"; this.stateT = atk.dashTime;
    } else if (beh === "shoot") {
      const n = atk.burst || 1, base = Math.atan2(diry, dirx), spr = atk.spread || 0;
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * spr, cs = Math.cos(a), sn = Math.sin(a);
        G.projectiles.push(new Projectile(this.x + cs * this.radius, this.y + sn * this.radius, cs * atk.projSpeed, sn * atk.projSpeed,
          { damage: Math.round(atk.projDmg * this.dmgMul), life: 2.6, radius: 5, fromPlayer: false, color: atk.projColor }));
      }
      this.state = "recover"; this.stateT = 0.4;
      P.audio && P.audio.play("shoot", 40);
    } else { this.state = "chase"; }
  };
  Enemy.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y, r = this.radius;
    if (this.state === "windup") {
      const k = this.tele || 0;
      ctx.save(); ctx.strokeStyle = this.color; ctx.globalAlpha = 0.35 + 0.5 * k; ctx.lineWidth = 2 + 2 * k;
      ctx.beginPath(); ctx.arc(x, y, r * 1.3 + r * 1.2 * k, 0, 6.28); ctx.stroke(); ctx.restore();
    }
    const wob = Math.sin(this.animT * 6) * 1.2;
    ctx.save(); ctx.translate(x, y + wob);
    ctx.fillStyle = this.hurtFlash > 0 ? "#ffffff" : this.color;
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2;
    shapePath(ctx, this.def.shape, r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.12, r * 0.18, 0, 6.28); ctx.arc(r * 0.22, -r * 0.12, r * 0.18, 0, 6.28); ctx.fill();
    ctx.restore();
    if (this.hp < this.maxHp) {
      const w = r * 2;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x - r, y - r - 8, w, 3);
      ctx.fillStyle = "#ff5a6e"; ctx.fillRect(x - r, y - r - 8, w * (this.hp / this.maxHp), 3);
    }
  };

  /* ---------------- Projectile ---------------- */
  function Projectile(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.radius = opts.radius || 4; this.life = opts.life || 0.7;
    this.damage = opts.damage || 10; this.knockback = opts.knockback || 0;
    this.fromPlayer = opts.fromPlayer !== false;
    this.dead = false; this.color = opts.color || "#bff6f0";
  }
  Projectile.prototype.update = function (dt, G) {
    this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (G.world.pxHitsWall(this.x, this.y)) { this.dead = true; return; }
    if (this.fromPlayer) {
      for (const e of G.enemies) {
        if (e.dead) continue;
        if (U.dist2(this.x, this.y, e.x, e.y) < (e.radius + this.radius) * (e.radius + this.radius)) {
          e.hit(this.damage);
          if (this.knockback > 0) e.knock(this.vx, this.vy, this.knockback);
          P.audio && P.audio.play("hit", 30);
          P.systems && P.systems.addEffect(G, { type: "spark", x: this.x, y: this.y, dur: 0.12, col: "#ffe6b0" });
          this.dead = true; break;
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
    ctx.save(); ctx.shadowColor = this.color; ctx.shadowBlur = 8; ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(x, y, this.radius, 0, 6.28); ctx.fill(); ctx.restore();
  };

  /* ---------------- Pickup (dropped item that flies to the player) ---------------- */
  function Pickup(x, y, itemId, n) {
    this.x = x; this.y = y;
    const a = Math.random() * 6.28, s = 40 + Math.random() * 50;
    this.vx = Math.cos(a) * s; this.vy = Math.sin(a) * s;
    this.itemId = itemId; this.n = n || 1; this.radius = 6;
    this.life = 120; this.collected = false; this.t = 0; this.delay = 0.25;
  }
  Pickup.prototype.update = function (dt, G) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) { this.collected = true; return; }
    this.vx *= 0.9; this.vy *= 0.9;
    if (Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1) G.world.moveBody(this, this.vx * dt, this.vy * dt);
    if (this.t < this.delay) return;                    // brief settle before magnet
    const p = G.player, d = U.dist(this.x, this.y, p.x, p.y);
    if (d < 84) {
      const [nx, ny] = U.norm(p.x - this.x, p.y - this.y);
      const pull = Math.min(420, 150 + (84 - d) * 6);
      this.x += nx * pull * dt; this.y += ny * pull * dt;
    }
    if (d < 18 + p.radius) {
      G.addItem(this.itemId, this.n);
      P.audio && P.audio.play("pickup", 45);
      this.collected = true;
    }
  };
  Pickup.prototype.draw = function (ctx, cam) {
    const x = this.x - cam.x, y = this.y - cam.y + Math.sin(this.t * 6) * 2;
    const it = D.items[this.itemId]; if (!it) return;
    ctx.save(); ctx.translate(x, y);
    ctx.shadowColor = it.color; ctx.shadowBlur = 9; ctx.fillStyle = it.color;
    if (it.kind === "bar") { ctx.fillRect(-5, -3, 10, 6); }
    else if (it.kind === "block") { ctx.fillRect(-5, -5, 10, 10); }
    else { ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, 6.28); ctx.fill(); }
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(-2, -2, 2, 2);
    ctx.restore();
  };

  P.entities = { Player, Enemy, Projectile, Pickup };
})(window.PACT = window.PACT || {});
