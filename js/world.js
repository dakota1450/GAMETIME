/* ============================================================
   THE PACT — WORLD  (solid-tile dig grid, Core Keeper model)

   The world is SOLID. Two layers per tile:
     wall[]  : the mineable block id (0 = dug-out / open / walkable)
     floor[] : the base ground revealed underneath (visual identity)
   You dig tunnels out of the rock; your digging persists (saved as a
   sparse `edits` diff). Concentric biome RINGS set the material tier.
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;
  const W = D.world, TILE = W.TILE;

  function World() {
    this.cols = W.COLS; this.rows = W.ROWS; this.tile = TILE;
    this.pxW = this.cols * TILE; this.pxH = this.rows * TILE;
    this.cx = Math.floor(this.cols / 2); this.cy = Math.floor(this.rows / 2);
    this.centerX = (this.cx + 0.5) * TILE; this.centerY = (this.cy + 0.5) * TILE;

    this.wall = new Uint8Array(this.cols * this.rows);
    this.floor = new Uint8Array(this.cols * this.rows);
    this.mineDmg = {};        // "i" -> accumulated mining damage (transient)
    this.edits = {};          // "i" -> blockId (0 = dug). The persistent diff.
    this.oreGlows = [];       // {i,x,y,col} glowing ore tiles (for lighting), pruned on mine
    this.torchList = [];      // {x,y,c,r} placed torches
    this.stations = [];       // {type,c,r,x,y,color,name}
    this.decor = [];          // {x,y,sprite,scale,flip,glow?}
    this.glowDecor = [];      // emissive decor for lighting
    this.builtStations = {};  // type -> {c,r} for persistence
    this.chests     = [];     // {id,c,r,x,y,tier} — world loot chests
    this.bossRooms  = {};     // biomeIndex -> {x,y} pre-carved boss chamber
    this.openedChests = new Set(); // ids of chests opened this session (synced from G)
  }

  /* ---------- index helpers ---------- */
  World.prototype.idx = function (c, r) { return r * this.cols + c; };
  World.prototype.inBounds = function (c, r) { return c >= 0 && r >= 0 && c < this.cols && r < this.rows; };
  World.prototype.wallAt = function (c, r) { return this.inBounds(c, r) ? this.wall[this.idx(c, r)] : 1; };
  World.prototype.floorAt = function (c, r) { return this.inBounds(c, r) ? this.floor[this.idx(c, r)] : 0; };
  World.prototype.solidAt = function (c, r) { return this.wallAt(c, r) !== 0; };
  World.prototype.solidAtPx = function (px, py) { return this.solidAt(Math.floor(px / TILE), Math.floor(py / TILE)); };
  World.prototype.pxHitsWall = function (px, py) { return this.solidAtPx(px, py); };
  World.prototype.centerOf = function (c, r) { return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE }; };
  World.prototype.colRowAtPx = function (px, py) { return { c: Math.floor(px / TILE), r: Math.floor(py / TILE) }; };

  /* ---------- biome / depth lookup ---------- */
  // distance from center in tiles, with a noise wobble so ring borders bleed
  World.prototype._ringDist = function (c, r) {
    const dx = c - this.cx, dy = r - this.cy;
    const base = Math.sqrt(dx * dx + dy * dy);
    const n = (U.noise(c * 0.06, r * 0.06) - 0.5) * 10;   // +/- ~5 tiles of wobble
    return base + n;
  };
  World.prototype.biomeIndexAt = function (c, r) {
    const d = this._ringDist(c, r);
    const B = D.biomes;
    for (let i = 0; i < B.length; i++) if (d <= B[i].rRing) return i;
    return B.length - 1;
  };
  World.prototype.biomeAt = function (c, r) { return D.biomes[this.biomeIndexAt(c, r)]; };
  World.prototype.biomeAtPx = function (px, py) { return this.biomeAt(Math.floor(px / TILE), Math.floor(py / TILE)); };
  World.prototype.distFromCenterPx = function (x, y) { return Math.hypot(x - this.centerX, y - this.centerY); };
  // continuous danger gradient (0 in Hold .. ~4 deep) for ambient + enemy scaling
  World.prototype.depthAtPx = function (x, y) {
    const d = this.distFromCenterPx(x, y) / TILE;
    const B = D.biomes;
    if (d <= B[0].rRing) return 0;
    for (let i = 1; i < B.length; i++) {
      if (d <= B[i].rRing) {
        const lo = B[i - 1].rRing, hi = B[i].rRing;
        return (i - 1) + (d - lo) / Math.max(1, hi - lo);   // smooth within the ring
      }
    }
    return B.length - 1;
  };
  World.prototype.isSafeAtPx = function (x, y) {
    return this.distFromCenterPx(x, y) <= (W.holdRadius + 0.5) * TILE;
  };
  World.prototype.holdSpawn = function () { return { x: this.centerX, y: this.centerY + TILE * 2 }; };

  /* ============================================================
     GENERATION — fill solid, scatter ore veins, carve the Hold +
     some natural caves, place stations, build the decor/glow lists.
     Deterministic from seedBase; `edits` re-applied after, so a saved
     dig persists on reload.
     ============================================================ */
  World.prototype.generate = function () {
    const rng = U.makeRng(W.seedBase >>> 0);
    const cols = this.cols, rows = this.rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const bi = this.biomeIndexAt(c, r);
        const b = D.biomes[bi];
        this.floor[i] = b.floor;
        // border ring of indestructible bedrock-ish wall
        if (c < 2 || r < 2 || c >= cols - 2 || r >= rows - 2) { this.wall[i] = 6; continue; }
        let block = b.rock;
        // a sub-material (e.g. stone pockets) gives the bulk some variation
        if (b.sub && U.noise(c * 0.18 + 40, r * 0.18) > 0.66) block = b.sub;
        this.wall[i] = block;
      }
    }

    // ore veins: per biome, per ore, threshold a high-freq noise field into clusters
    for (let bi = 1; bi < D.biomes.length; bi++) {
      const b = D.biomes[bi];
      for (let k = 0; k < (b.ores || []).length; k++) {
        const [oreId, freq] = b.ores[k];
        const ox = 13.7 * (bi + 1) + oreId * 4.1, oy = 91.3 * (bi + 1) - oreId * 7.7;
        for (let r = 2; r < rows - 2; r++) {
          for (let c = 2; c < cols - 2; c++) {
            const i = r * cols + c;
            if (this.wall[i] === 0 || this.wall[i] === 6) continue;
            if (this.biomeIndexAt(c, r) !== bi) continue;
            const v = U.noise(c * 0.30 + ox, r * 0.30 + oy);
            if (v > 1 - freq * 2.6) this.wall[i] = oreId;
          }
        }
      }
    }

    // sparse natural caverns in the outer rings (so it's not 100% solid)
    for (let r = 2; r < rows - 2; r++) {
      for (let c = 2; c < cols - 2; c++) {
        const i = r * cols + c;
        if (this.wall[i] === 6) continue;
        const bi = this.biomeIndexAt(c, r);
        if (bi < 1) continue;
        const cave = U.noise(c * 0.11 + 200, r * 0.11 + 200);
        if (cave > 0.78) this.wall[i] = 0;     // open pocket
      }
    }

    this._carveHold();
    this._placeBossRooms(U.makeRng(W.seedBase ^ 0xB0551));  // separate rng — boss chambers
    this._placeChests(U.makeRng(W.seedBase ^ 0xC4E512));    // separate rng — loot chests
    this._applyEdits();
    this._buildOreGlows();
    this._placeDecor(rng);
    this._restoreBuiltStations();
  };

  // carve the dug-out starting clearing + place the core stations + torches
  World.prototype._carveHold = function () {
    const R = W.holdRadius;
    for (let r = this.cy - R - 1; r <= this.cy + R + 1; r++) {
      for (let c = this.cx - R - 1; c <= this.cx + R + 1; c++) {
        if (!this.inBounds(c, r)) continue;
        const d = Math.hypot(c - this.cx, r - this.cy);
        const i = r * this.cols + c;
        this.floor[i] = 6;                       // warm Hold floor
        if (d <= R) this.wall[i] = 0;            // open interior
      }
    }
    // core stations ringed around the Hold
    this.stations = [];
    const place = (type, dc, dr) => {
      const c = this.cx + dc, r = this.cy + dr, cen = this.centerOf(c, r);
      const st = D.stations[type];
      this.stations.push({ type, c, r, x: cen.x, y: cen.y, color: st.color, name: st.name });
      this.wall[r * this.cols + c] = 0;
    };
    place("furnace", -3, -4);
    place("tinker",  3, -4);
    // a bed/respawn marker + storage are drawn as stations too
    this.stations.push({ type: "bed", c: this.cx - 4, r: this.cy + 4, x: (this.cx - 4 + 0.5) * TILE, y: (this.cy + 4 + 0.5) * TILE, color: "#9fb0c4", name: "Bedroll" });
    this.stations.push({ type: "storage", c: this.cx + 4, r: this.cy + 4, x: (this.cx + 4 + 0.5) * TILE, y: (this.cy + 4 + 0.5) * TILE, color: "#ffb347", name: "Storage" });

    // ring of torches lighting the Hold
    this.torchList = [];
    const ringR = R - 1;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const c = Math.round(this.cx + Math.cos(a) * ringR), r = Math.round(this.cy + Math.sin(a) * ringR);
      if (this.inBounds(c, r) && this.wallAt(c, r) === 0) this.torchList.push({ c, r, x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });
    }
  };

  World.prototype._restoreBuiltStations = function () {
    for (const type in this.builtStations) {
      const p = this.builtStations[type], st = D.stations[type];
      if (!st) continue;
      this.stations.push({ type, c: p.c, r: p.r, x: (p.c + 0.5) * TILE, y: (p.r + 0.5) * TILE, color: st.color, name: st.name });
      this.wall[p.r * this.cols + p.c] = 0;
    }
  };

  World.prototype._buildOreGlows = function () {
    this.oreGlows = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const id = this.wall[r * this.cols + c];
      const bl = D.blocks[id];
      if (bl && bl.glow) {
        const cen = this.centerOf(c, r);
        this.oreGlows.push({ i: r * this.cols + c, x: cen.x, y: cen.y, col: bl.glow });
      }
    }
  };

  // scatter ground decor on open floor tiles per biome
  World.prototype._placeDecor = function (rng) {
    this.decor = []; this.glowDecor = [];
    const count = 1400;
    for (let n = 0; n < count; n++) {
      const c = U.rngInt(rng, 3, this.cols - 4), r = U.rngInt(rng, 3, this.rows - 4);
      const i = r * this.cols + c;
      if (this.wall[i] !== 0) continue;
      const b = this.biomeAt(c, r);
      if (!b.decor || !b.decor.length) continue;
      const kind = U.rngPick(rng, b.decor), dd = D.decor[kind];
      if (!dd) continue;
      const cen = this.centerOf(c, r);
      const px = cen.x + (rng() - 0.5) * 12, py = cen.y + (rng() - 0.5) * 12;
      const inst = { x: px, y: py, sprite: dd.sprite, scale: dd.scale * (0.8 + rng() * 0.4), flip: rng() < 0.5, ph: rng() * 6.28 };
      this.decor.push(inst);
      if (dd.glow && this.glowDecor.length < 200) this.glowDecor.push({ x: px, y: py, col: dd.glow, ph: inst.ph });
    }
  };

  /* ---------- edits (persistent dig/place diff) ---------- */
  World.prototype._applyEdits = function () {
    for (const k in this.edits) {
      const i = +k; if (i >= 0 && i < this.wall.length) this.wall[i] = this.edits[k];
    }
  };
  World.prototype.loadEdits = function (edits) { this.edits = edits || {}; };

  /* ============================================================
     MINING + PLACING
     ============================================================ */
  World.prototype.canMine = function (block, power) { return block && block.tier <= power; };

  // apply mining damage to a tile. returns {result:"broke"|"hit", block, id} | "toohard" | null
  World.prototype.mineTile = function (c, r, dmg, power) {
    if (!this.inBounds(c, r)) return null;
    const i = this.idx(c, r), id = this.wall[i];
    if (id === 0) return null;
    const block = D.blocks[id];
    if (!block) return null;
    // the outermost border (id 6 on the edge) is bedrock — unbreakable
    if (c < 2 || r < 2 || c >= this.cols - 2 || r >= this.rows - 2) return "bedrock";
    if (block.tier > power) return "toohard";
    const cur = (this.mineDmg[i] || 0) + dmg;
    if (cur >= block.hp) {
      this.wall[i] = 0;
      delete this.mineDmg[i];
      this.edits[i] = 0;
      this._removeOreGlow(i);
      return { result: "broke", block, id };
    }
    this.mineDmg[i] = cur;
    return { result: "hit", block, id, frac: cur / block.hp };
  };

  World.prototype._removeOreGlow = function (i) {
    for (let k = 0; k < this.oreGlows.length; k++) if (this.oreGlows[k].i === i) { this.oreGlows.splice(k, 1); return; }
  };

  // place a block id onto an empty tile. returns true if placed.
  World.prototype.placeBlock = function (c, r, blockId) {
    if (!this.inBounds(c, r)) return false;
    const i = this.idx(c, r);
    if (this.wall[i] !== 0) return false;
    this.wall[i] = blockId;
    this.edits[i] = blockId;
    const bl = D.blocks[blockId];
    if (bl && bl.glow) { const cen = this.centerOf(c, r); this.oreGlows.push({ i, x: cen.x, y: cen.y, col: bl.glow }); }
    return true;
  };

  World.prototype.placeTorch = function (c, r) {
    if (!this.inBounds(c, r) || this.wallAt(c, r) !== 0) return false;
    for (const t of this.torchList) if (t.c === c && t.r === r) return false;
    this.torchList.push({ c, r, x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });
    return true;
  };

  World.prototype.addStation = function (type, c, r) {
    const st = D.stations[type]; if (!st) return false;
    this.builtStations[type] = { c, r };
    this.stations.push({ type, c, r, x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, color: st.color, name: st.name });
    this.wall[this.idx(c, r)] = 0; this.edits[this.idx(c, r)] = 0;
    return true;
  };

  /* ---------- queries ---------- */
  World.prototype.stationNear = function (px, py, range) {
    let best = null, bd = range * range;
    for (const s of this.stations) { const d = U.dist2(px, py, s.x, s.y); if (d < bd) { bd = d; best = s; } }
    return best;
  };

  /* ============================================================
     COLLISION (AABB vs walls, axis-separated)
     ============================================================ */
  World.prototype.moveBody = function (body, dx, dy) { this._sweep(body, dx, 0); this._sweep(body, 0, dy); };
  World.prototype._sweep = function (body, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const r = body.radius;
    body.x += dx; body.y += dy;
    const minC = Math.floor((body.x - r) / TILE), maxC = Math.floor((body.x + r) / TILE);
    const minR = Math.floor((body.y - r) / TILE), maxR = Math.floor((body.y + r) / TILE);
    for (let row = minR; row <= maxR; row++) for (let col = minC; col <= maxC; col++) {
      if (!this.solidAt(col, row)) continue;
      const tl = col * TILE, tr = tl + TILE, tt = row * TILE, tb = tt + TILE;
      if (body.x + r <= tl || body.x - r >= tr || body.y + r <= tt || body.y - r >= tb) continue;
      if (dx > 0) body.x = tl - r; else if (dx < 0) body.x = tr + r;
      else if (dy > 0) body.y = tt - r; else if (dy < 0) body.y = tb + r;
    }
  };

  /* ============================================================
     RENDER — floor pass, then chunky wall blocks with bevel + ore +
     cracks + cast shadow, then decor / torches / stations / selection.
     Only visible tiles are touched (culled to the camera viewport).
     ============================================================ */
  World.prototype.render = function (ctx, cam, vw, vh, sel) {
    const c0 = Math.max(0, Math.floor(cam.x / TILE) - 1), c1 = Math.min(this.cols - 1, Math.floor((cam.x + vw) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(cam.y / TILE) - 1), r1 = Math.min(this.rows - 1, Math.floor((cam.y + vh) / TILE) + 1);

    // ---- floor pass: organic per-tile variation (soft noise patches + grit) ----
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const x = c * TILE - cam.x, y = r * TILE - cam.y;
      const fid = this.floor[this.idx(c, r)];
      const fl = D.floors[fid] || D.floors[1];
      // two octaves of smooth noise mix base<->alt so the ground reads as one
      // continuous surface, not a checkerboard
      const n = U.noise(c * 0.5, r * 0.5) * 0.6 + U.noise(c * 1.9 + 11, r * 1.9 + 7) * 0.4;
      ctx.fillStyle = U.mixHex(fl.color, fl.alt, U.clamp(n, 0, 1));
      ctx.fillRect(x, y, TILE, TILE);
      const v = n - 0.5;                                   // gentle light/dark wash
      ctx.fillStyle = v > 0 ? "rgba(255,255,255," + (v * 0.06).toFixed(3) + ")" : "rgba(0,0,0," + (-v * 0.14).toFixed(3) + ")";
      ctx.fillRect(x, y, TILE, TILE);
      const h = U.hash2(c, r);
      if (h < 0.09) { ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fillRect(x + (h * 90 % (TILE - 5)), y + (h * 53 % (TILE - 5)), 3, 3); }
      else if (h > 0.94) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.fillRect(x + (h * 70 % (TILE - 4)), y + (h * 33 % (TILE - 4)), 2, 2); }
    }

    // ---- decor (between floor and walls) ----
    for (const d of this.decor) {
      const x = d.x - cam.x, y = d.y - cam.y;
      if (x < -24 || y < -24 || x > vw + 24 || y > vh + 24) continue;
      if (P.assets) P.assets.draw(ctx, d.sprite, x, y, d.scale, 0, d.flip);
    }

    // ---- wall pass: cast-shadow first (so walls sit ON the floor), then blocks ----
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (this.wallAt(c, r) !== 0) continue;
      // shadow cast by a wall directly above onto this open tile
      if (this.wallAt(c, r - 1) !== 0) {
        const x = c * TILE - cam.x, y = r * TILE - cam.y;
        const g = ctx.createLinearGradient(0, y, 0, y + 9);
        g.addColorStop(0, "rgba(0,0,0,0.34)"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(x, y, TILE, 9);
      }
    }
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const id = this.wall[this.idx(c, r)];
      if (id === 0) continue;
      this._drawBlock(ctx, c, r, c * TILE - cam.x, r * TILE - cam.y, id);
    }

    // ---- stations + torches ----
    this._drawStations(ctx, cam, vw, vh);
    this._drawTorches(ctx, cam);

    // ---- mining-target selection box ----
    if (sel && this.wallAt(sel.c, sel.r) !== 0) {
      const x = sel.c * TILE - cam.x, y = sel.r * TILE - cam.y;
      ctx.strokeStyle = sel.ok ? "rgba(255,255,255,0.85)" : "rgba(255,90,110,0.8)";
      ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
    } else if (sel && sel.place) {
      const x = sel.c * TILE - cam.x, y = sel.r * TILE - cam.y;
      ctx.strokeStyle = "rgba(120,200,255,0.7)"; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    }
  };

  // one chunky block, EDGE-AWARE: a contiguous earth mass reads as one surface
  // (lit rims only where it borders open tunnels) — the Core-Keeper wall look
  World.prototype._drawBlock = function (ctx, c, r, x, y, id) {
    const bl = D.blocks[id]; if (!bl) return;
    const openT = this.wallAt(c, r - 1) === 0, openB = this.wallAt(c, r + 1) === 0;
    const openL = this.wallAt(c - 1, r) === 0, openR = this.wallAt(c + 1, r) === 0;
    ctx.fillStyle = bl.color; ctx.fillRect(x, y, TILE, TILE);
    // material grain: deterministic darker/lighter speckles -> textured rock/earth
    for (let i = 0; i < 6; i++) {
      const hx = U.hash2(c * 17 + i * 3, r * 11 + 5), hy = U.hash2(c * 7 + 5, r * 13 + i * 2);
      const sz = 2 + (hx > 0.66 ? 2 : 0);
      ctx.fillStyle = hx > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.16)";
      ctx.fillRect(x + 3 + hx * (TILE - 7), y + 3 + hy * (TILE - 7), sz, sz);
    }
    // lit rim on faces that meet open space; faint seam on faces that meet rock
    ctx.fillStyle = bl.top;
    if (openT) ctx.fillRect(x, y, TILE, 4); else { ctx.fillStyle = "rgba(255,255,255,0.045)"; ctx.fillRect(x, y, TILE, 1); ctx.fillStyle = bl.top; }
    if (openL) ctx.fillRect(x, y, 3, TILE); else { ctx.fillStyle = "rgba(255,255,255,0.04)"; ctx.fillRect(x, y, 1, TILE); }
    ctx.fillStyle = bl.side;
    if (openR) ctx.fillRect(x + TILE - 3, y, 3, TILE); else { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x + TILE - 1, y, 1, TILE); ctx.fillStyle = bl.side; }
    if (openB) ctx.fillRect(x, y + TILE - 5, TILE, 5); else { ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x, y + TILE - 1, TILE, 1); }
    // ore glints
    if (bl.ore) {
      ctx.fillStyle = bl.oreCol;
      for (let i = 0; i < 5; i++) {
        const hx = U.hash2(c * 13 + i, r * 7 + 1), hy = U.hash2(c * 5 + 1, r * 11 + i);
        const s = 2 + (hx > 0.7 ? 1 : 0);
        ctx.fillRect(x + 4 + hx * (TILE - 9), y + 4 + hy * (TILE - 9), s, s);
      }
      if (bl.glow) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = bl.oreCol; ctx.fillRect(x + TILE / 2 - 2, y + TILE / 2 - 2, 4, 4); ctx.restore(); }
    }
    // mining cracks
    const dmg = this.mineDmg[this.idx(c, r)];
    if (dmg) {
      const frac = U.clamp(dmg / bl.hp, 0, 1);
      ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 1;
      ctx.beginPath();
      const n = 1 + Math.floor(frac * 4), mx = x + TILE / 2, my = y + TILE / 2;
      for (let i = 0; i < n; i++) {
        const a = U.hash2(c + i * 9, r + 3) * 6.28, len = TILE * 0.45 * (0.4 + frac * 0.6);
        ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len);
      }
      ctx.stroke();
    }
  };

  World.prototype._drawStations = function (ctx, cam, vw, vh) {
    for (const s of this.stations) {
      const x = s.x - cam.x, y = s.y - cam.y;
      if (x < -40 || y < -40 || x > vw + 40 || y > vh + 40) continue;
      if (P.lighting) P.lighting.shadow(ctx, x, y + 10, 14);
      drawStation(ctx, x, y, s.type, s.color);
    }
  };
  World.prototype._drawTorches = function (ctx, cam) {
    const t = U.now();
    for (const to of this.torchList) {
      const x = to.x - cam.x, y = to.y - cam.y;
      const f = 0.7 + 0.3 * Math.sin(t * 12 + to.x * 0.5);
      ctx.fillStyle = "#241a12"; ctx.fillRect(x - 2, y - 1, 4, 9);
      ctx.fillStyle = "#3a2a1a"; ctx.fillRect(x - 3, y + 7, 6, 2);
      ctx.save(); ctx.shadowColor = "#ff9a3c"; ctx.shadowBlur = 10 * f;
      ctx.fillStyle = "#ffd27a"; ctx.beginPath(); ctx.ellipse(x, y - 4, 3, 5 * f, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = "#ff7a2a"; ctx.beginPath(); ctx.ellipse(x, y - 3, 1.8, 3 * f, 0, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  };

  function roundRect(ctx, x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // procedural station sprites (no PNGs needed)
  function drawStation(ctx, x, y, type, color) {
    ctx.save(); ctx.translate(x, y);
    const t = U.now();
    if (type === "furnace") {
      ctx.fillStyle = "#3a3138"; roundRect(ctx, -13, -13, 26, 26, 4); ctx.fill();
      ctx.fillStyle = "#1a1410"; roundRect(ctx, -8, -6, 16, 14, 3); ctx.fill();
      const g = 0.6 + 0.4 * Math.sin(t * 5);
      ctx.save(); ctx.shadowColor = "#ff7a2a"; ctx.shadowBlur = 14 * g;
      ctx.fillStyle = "#ff9a3c"; roundRect(ctx, -6, -2, 12, 9, 2); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#52464e"; ctx.fillRect(-13, -15, 26, 4);
    } else if (type === "tinker") {
      ctx.fillStyle = "#3a2c1c"; roundRect(ctx, -13, -8, 26, 18, 3); ctx.fill();
      ctx.fillStyle = "#5a4530"; ctx.fillRect(-13, -8, 26, 4);
      ctx.fillStyle = color; ctx.fillRect(-9, -2, 7, 7); ctx.fillRect(3, -3, 6, 9);
      ctx.fillStyle = "#cdd3da"; ctx.fillRect(-7, -10, 2, 6); ctx.fillRect(5, -11, 2, 7);
    } else if (type === "anvil") {
      ctx.fillStyle = "#2c2a30"; roundRect(ctx, -12, -3, 24, 12, 2); ctx.fill();
      ctx.fillStyle = "#46444c"; ctx.fillRect(-13, -8, 18, 6); ctx.fillRect(-6, 2, 12, 8);
      ctx.fillStyle = color; ctx.fillRect(-12, -8, 16, 2);
    } else if (type === "forge") {
      ctx.fillStyle = "#2a1c38"; roundRect(ctx, -13, -12, 26, 24, 4); ctx.fill();
      const g = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 16 * g;
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 6.28); ctx.fill(); ctx.restore();
      ctx.strokeStyle = color; ctx.lineWidth = 2; roundRect(ctx, -13, -12, 26, 24, 4); ctx.stroke();
    } else if (type === "bed") {
      ctx.fillStyle = "#3a2c20"; roundRect(ctx, -13, -8, 26, 17, 3); ctx.fill();
      ctx.fillStyle = "#6b8aa0"; roundRect(ctx, -12, -7, 24, 9, 2); ctx.fill();
      ctx.fillStyle = "#cdd9e4"; roundRect(ctx, -12, -7, 9, 9, 2); ctx.fill();
    } else if (type === "storage") {
      ctx.fillStyle = "#1a1f28"; roundRect(ctx, -12, -9, 24, 18, 3); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-12, -9, 24, 4);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; roundRect(ctx, -12, -9, 24, 18, 3); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(-2, -3, 4, 6);
    }
    ctx.restore();
  }

  // ground motes (drift over the dark) — drawn in screen space by game.render
  /* ---------- Boss rooms: carve one pre-dug 3×3 chamber per biome ---------- */
  World.prototype._placeBossRooms = function (rng) {
    this.bossRooms = {};
    // [biomeIndex, minRingTile, maxRingTile]
    const targets = [ [1, 16, 30], [2, 37, 52], [3, 59, 73], [4, 82, 95] ];
    for (const [bi, rMin, rMax] of targets) {
      for (let tries = 0; tries < 1200; tries++) {
        const a = rng() * Math.PI * 2;
        const d = rMin + rng() * (rMax - rMin);
        const c = Math.round(this.cx + Math.cos(a) * d);
        const r = Math.round(this.cy + Math.sin(a) * d);
        if (!this.inBounds(c - 2, r - 2) || !this.inBounds(c + 2, r + 2)) continue;
        if (this.biomeIndexAt(c, r) !== bi) continue;
        // carve a 3×3 chamber
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const i = (r + dr) * this.cols + (c + dc);
            this.wall[i] = 0;
          }
        }
        const cen = this.centerOf(c, r);
        this.bossRooms[bi] = { x: cen.x, y: cen.y, c, r };
        break;
      }
    }
  };

  /* ---------- Chests: seed ~70 loot chests in natural cave pockets ---------- */
  World.prototype._placeChests = function (rng) {
    this.chests = [];
    let id = 0;
    const want = 70, tries_max = 8000;
    let tries = 0;
    while (id < want && tries++ < tries_max) {
      const c = 2 + Math.floor(rng() * (this.cols - 4));
      const r = 2 + Math.floor(rng() * (this.rows - 4));
      const bi = this.biomeIndexAt(c, r);
      if (bi < 1) continue;              // no chests in Hold
      if (this.wall[r * this.cols + c] !== 0) continue; // must be on open floor
      // spacing: no two chests within 7 tiles of each other
      let tooClose = false;
      for (const ch of this.chests) {
        if (Math.abs(ch.c - c) < 7 && Math.abs(ch.r - r) < 7) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const cen = this.centerOf(c, r);
      this.chests.push({ id: id++, c, r, x: cen.x, y: cen.y, tier: bi });
    }
  };

  /* ---------- Chest proximity query ---------- */
  // Returns nearest open, unopened chest within px range, or null.
  World.prototype.chestNear = function (px, py, range, openedSet) {
    let best = null, bestD = range * range;
    for (const ch of this.chests) {
      if (openedSet && openedSet.has(ch.id)) continue;
      if (this.wall[ch.r * this.cols + ch.c] !== 0) continue; // tile must be dug out
      const dx = ch.x - px, dy = ch.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = ch; }
    }
    return best;
  };

  /* ---------- Chest rendering ---------- */
  World.prototype.renderChests = function (ctx, cam, vwW, vhH, openedSet) {
    for (const ch of this.chests) {
      if (openedSet && openedSet.has(ch.id)) continue;
      // only render if tile is open
      if (this.wall[ch.r * this.cols + ch.c] !== 0) continue;
      const sx = ch.x - cam.x + vwW / 2;
      const sy = ch.y - cam.y + vhH / 2;
      if (sx < -32 || sx > vwW + 32 || sy < -32 || sy > vhH + 32) continue;
      this._drawChest(ctx, sx, sy, ch.tier);
    }
  };

  World.prototype._drawChest = function (ctx, sx, sy, tier) {
    const tierColors = ["#888", "#e8975a", "#c8b4a0", "#c4a0ff", "#ffd24a"];
    const col = tierColors[tier] || tierColors[1];
    const s = TILE * 0.72;
    ctx.save();
    ctx.translate(sx, sy);
    // body
    ctx.fillStyle = "#3a2810";
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s * 0.3, s, s * 0.6, 3);
    ctx.fill(); ctx.stroke();
    // lid
    ctx.fillStyle = "#4d3518";
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s * 0.5, s, s * 0.22, [3, 3, 0, 0]);
    ctx.fill(); ctx.stroke();
    // metal band
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s / 2, -s * 0.08); ctx.lineTo(s / 2, -s * 0.08);
    ctx.stroke();
    // latch
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-s * 0.07, -s * 0.24, s * 0.14, s * 0.16, 2);
    ctx.fill();
    // glow border
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-s / 2, -s * 0.5, s, s * 0.8, 3);
    ctx.stroke();
    ctx.restore();
  };

  World.prototype.renderMotes = function (ctx, vw, vh, biome) {
    if (!biome || biome.tier === 0) return;
    const t = U.now();
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = biome.accent;
    for (let i = 0; i < 22; i++) {
      const bx = U.hash2(i * 7 + 1, 13), by = U.hash2(i * 5 + 2, 29);
      let px = ((bx * vw + t * 8 + i * 37) % vw + vw) % vw;
      let py = ((by * vh - t * 6 + i * 53) % vh + vh) % vh;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
      ctx.globalAlpha = tw * 0.3;
      ctx.beginPath(); ctx.arc(px, py, 1.4 * (0.7 + tw), 0, 6.28); ctx.fill();
    }
    ctx.restore();
  };

  P.World = World;
})(window.PACT = window.PACT || {});
