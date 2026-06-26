/* ============================================================
   THE PACT — WORLD (v2: central Hold + directional biomes)
   A safe walled compound in the center with doorways on all four
   sides. Each cardinal direction is a distinct biome (spec §8) at a
   fixed danger tier. Loot comes only from chests + kills (no free
   nodes). Surface contents regenerate each cycle (spec §8.1).
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util, D = P.data;
  const W = D.world;
  const TILE = W.TILE;
  const FLOOR = 1, WALL = 2;

  function World() {
    this.cols = W.COLS;
    this.rows = W.ROWS;
    this.tile = TILE;
    this.pxW = W.COLS * TILE;
    this.pxH = W.ROWS * TILE;
    this.cx = Math.floor(W.COLS / 2);
    this.cy = Math.floor(W.ROWS / 2);
    this.centerX = (this.cx + 0.5) * TILE;
    this.centerY = (this.cy + 0.5) * TILE;
    this.hw = W.compound.halfW;
    this.hh = W.compound.halfH;
    // safe interior rect (px) — inside the compound walls
    this.safeX0 = (this.cx - this.hw + 1) * TILE;
    this.safeX1 = (this.cx + this.hw) * TILE;
    this.safeY0 = (this.cy - this.hh + 1) * TILE;
    this.safeY1 = (this.cy + this.hh) * TILE;
    this.outerThreshold = this.cx * TILE * 0.5; // beyond this (px from center) = outer half of a biome
    // vertical-world radii (spec §5.4): Hold core -> Undercity ring -> surface biomes
    this.holdRadius = Math.hypot(this.hw, this.hh) * TILE;        // compound corner reach
    this.undercityOuter = this.holdRadius + 18 * TILE;           // semi-safe ring outer edge
    this.mapRadius = (this.cx - 3) * TILE;                        // playable extent

    this.tiles = null;
    this.structures = [];
    this.torches = [];
    this.glows = [];
    this.mine = {};            // "c,r" -> destructible node {kind,color,hp,maxHp,hardness,glow,drops}
    this.glowNodes = [];       // subset of mine nodes that emit light (for lighting.js)
    this.decor = [];           // non-colliding ground clutter
    this.solidDecor = {};      // "c,r" -> tall prop that blocks movement
    this.glowDecor = [];       // emissive decor (for lighting.js)
    this.bigProps = [];        // large procedurally-drawn biome landmarks
    this.bigSolid = {};        // "c,r" -> true for solid big props (blocks movement)
    this._buildingChests = [];
    this.chests = [];
    this.opened = {};   // {chestId: true}
    this.cycle = 1;
  }

  /* ---------- direction / biome / depth lookup ----------
     Biome borders are perturbed by noise so districts BLEED into and
     interleave with each other instead of meeting at hard diagonals.
     The perturbation grows with distance, so the area just outside each
     doorway stays its intended biome while the far reaches mingle. */
  World.prototype._affinities = function (x, y) {
    const dx0 = x - this.centerX, dy0 = y - this.centerY;
    const d = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
    const amp = Math.min(d * 0.45, 1400);
    const nx = U.noise(x * 0.0045, y * 0.0045) - 0.5;
    const ny = U.noise(x * 0.0045 + 131.7, y * 0.0045 + 57.3) - 0.5;
    const dx = dx0 + nx * 2 * amp, dy = dy0 + ny * 2 * amp;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { north: -uy, east: ux, south: uy, west: -ux };
  };
  // the Glittermile occupies a narrow NE diagonal wedge between the N and E districts
  // (perturbed dir angle ~ -45°). atan2(uy,ux) == atan2(a.south, a.east).
  World.GLIT_LO = -1.17; World.GLIT_HI = -0.40;
  World.prototype.dirAtPx = function (x, y) {
    const a = this._affinities(x, y);
    const ang = Math.atan2(a.south, a.east);
    if (ang > World.GLIT_LO && ang < World.GLIT_HI) return "glitter";
    let best = "north", bv = a.north;
    for (const k of ["north", "east", "south", "west"]) if (a[k] > bv) { bv = a[k]; best = k; }
    return best;
  };
  World.prototype.distFromCenter = function (x, y) { return Math.hypot(x - this.centerX, y - this.centerY); };
  // 'undercity' for the semi-safe ring, else the cardinal biome (caller handles the safe Hold)
  World.prototype.regionAtPx = function (x, y) {
    if (this.distFromCenter(x, y) < this.undercityOuter) return "undercity";
    return this.dirAtPx(x, y);
  };
  // blended floor color near a border, so two biomes visibly bleed together
  World.prototype.floorColorAt = function (x, y, alt) {
    if (!this.isSafeAtPx(x, y) && this.distFromCenter(x, y) < this.undercityOuter)
      return alt ? D.undercity.floorAlt : D.undercity.floor;
    const a = this._affinities(x, y);
    const gang = Math.atan2(a.south, a.east);                 // the Glittermile wedge gets its own floor
    if (gang > World.GLIT_LO && gang < World.GLIT_HI) return alt ? D.biomes.glitter.floorAlt : D.biomes.glitter.floor;
    const keys = ["north", "east", "south", "west"].sort((p, q) => a[q] - a[p]);
    const b1 = D.biomes[keys[0]], b2 = D.biomes[keys[1]];
    const f1 = alt ? b1.floorAlt : b1.floor;
    const gap = a[keys[0]] - a[keys[1]];
    const t = U.clamp(0.5 - gap * 1.7, 0, 0.5);
    return t > 0.02 ? U.mixHex(f1, alt ? b2.floorAlt : b2.floor, t) : f1;
  };
  World.prototype.isSafeAtPx = function (x, y) {
    return x > this.safeX0 && x < this.safeX1 && y > this.safeY0 && y < this.safeY1;
  };
  World.prototype.biomeAtPx = function (x, y) {
    if (this.isSafeAtPx(x, y)) return D.home;
    const reg = this.regionAtPx(x, y);
    return reg === "undercity" ? D.undercity : D.biomes[reg];
  };
  // continuous depth: 0 in the Hold, ~0.4-1 across the Undercity ring, then 1 -> ~tier+2
  // ramping with distance through a biome. This is the spec's spatial risk gradient.
  World.prototype.depthAtPx = function (x, y) {
    if (this.isSafeAtPx(x, y)) return 0;
    const dist = this.distFromCenter(x, y);
    if (dist < this.undercityOuter) {
      const t = U.clamp((dist - this.holdRadius) / (this.undercityOuter - this.holdRadius), 0, 1);
      return 0.4 + t * 0.6;
    }
    const biome = D.biomes[this.dirAtPx(x, y)];
    const t = U.clamp((dist - this.undercityOuter) / (this.mapRadius - this.undercityOuter), 0, 1);
    return U.clamp(1 + t * (biome.tier + 1), 1, 4.5);
  };
  // loot richness follows depth continuously (Undercity ~1, deep biome up to 3)
  World.prototype.lootTierAtPx = function (x, y) {
    return U.clamp(Math.round(this.depthAtPx(x, y)), 1, 3);
  };

  /* ---------- tiles ---------- */
  World.prototype.tileAt = function (col, row) {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return WALL;
    return this.tiles[row][col];
  };
  World.prototype.solidAt = function (col, row) { return this.tileAt(col, row) === WALL || !!this.solidDecor[col + "," + row] || !!this.bigSolid[col + "," + row]; };
  World.prototype.solidAtPx = function (px, py) { return this.solidAt(Math.floor(px / TILE), Math.floor(py / TILE)); };
  World.prototype.pxHitsWall = function (px, py) { return this.solidAtPx(px, py); };
  World.prototype.centerOf = function (col, row) { return { x: (col + 0.5) * TILE, y: (row + 0.5) * TILE }; };
  World.prototype._inCompound = function (c, r) {
    return c >= this.cx - this.hw && c <= this.cx + this.hw && r >= this.cy - this.hh && r <= this.cy + this.hh;
  };

  /* ---------- generation ---------- */
  World.prototype.generate = function (cycle) {
    this.cycle = cycle;
    this.mine = {}; this.glowNodes = []; this._buildingChests = []; this._undercityChests = [];
    this._buildTiles(cycle);
    this._placeStructures();
    this._placeCasino(cycle);        // transient gambling POI out in the Glittermile
    this._placeTorches();
    this._placeGlows(cycle);
    this._placeBuildings(cycle);     // enterable roofless rooms (breachable walls)
    this._placeMineNodes(cycle);     // scattered destructible nodes
    this._placeUndercity(cycle);     // semi-safe ring content (light loot/nodes/lamps)
    this._placeDecor(cycle);         // ground clutter + tall obstacles + event pillars
    this._placeBigProps(cycle);      // large biome-signature landmarks
    this.chests = this._generateChests(cycle).concat(this._buildingChests, this._undercityChests);
    this.opened = {};
  };

  /* ---------- ground decor: dense Core Keeper-style clutter + solid obstacles ---------- */
  World.prototype._placeDecor = function (cycle) {
    this.decor = []; this.solidDecor = {}; this.glowDecor = [];
    const rng = U.makeRng((W.seedBase ^ (cycle * 2246822519 + 99)) >>> 0);
    const kinds = Object.keys(D.decor), tall = Object.keys(D.decorTall);
    const regionOf = (cen) => this.isSafeAtPx(cen.x, cen.y) ? "hold" : this.regionAtPx(cen.x, cen.y);

    for (let i = 0; i < D.decorCount; i++) {
      const c = U.rngInt(rng, 2, this.cols - 3), r = U.rngInt(rng, 2, this.rows - 3);
      const key = c + "," + r;
      if (this.tiles[r][c] !== FLOOR || this.mine[key] || this.solidDecor[key] || this._structureAt(c, r)) continue;
      const cen = this.centerOf(c, r), reg = regionOf(cen);
      const valid = kinds.filter(k => D.decor[k].regions.indexOf(reg) >= 0);
      if (!valid.length) continue;
      const kind = U.rngPick(rng, valid), dd = D.decor[kind];
      const px = cen.x + (rng() - 0.5) * 16, py = cen.y + (rng() - 0.5) * 16;
      const inst = { x: px, y: py, sprite: dd.sprite, scale: dd.scale * (0.78 + rng() * 0.5), flip: rng() < 0.5, ph: rng() * 6.28 };
      this.decor.push(inst);
      if (dd.glow && this.glowDecor.length < 240) this.glowDecor.push({ x: px, y: py, col: dd.glow, ph: inst.ph });
    }

    for (let i = 0; i < D.decorTallCount; i++) {
      const c = U.rngInt(rng, 3, this.cols - 4), r = U.rngInt(rng, 3, this.rows - 4);
      const key = c + "," + r;
      if (this.tiles[r][c] !== FLOOR || this.mine[key] || this.solidDecor[key] || this._inCompound(c, r) || this._structureAt(c, r)) continue;
      const cen = this.centerOf(c, r);
      if (this.distFromCenter(cen.x, cen.y) < this.undercityOuter) continue;   // tall props live in the biomes
      const valid = tall.filter(k => D.decorTall[k].regions.indexOf(this.regionAtPx(cen.x, cen.y)) >= 0);
      if (!valid.length) continue;
      const kind = U.rngPick(rng, valid);
      this.solidDecor[key] = { sprite: D.decorTall[kind].sprite, scale: D.decorTall[kind].scale, flip: rng() < 0.5 };
    }
    this._placeEventPillars();
  };
  // a ring of pillars frames the event beacon (Core Keeper arena feel)
  World.prototype._placeEventPillars = function () {
    const beacon = this.structures.find(s => s.type === "beacon"); if (!beacon) return;
    const n = 8, R = 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const c = beacon.col + Math.round(Math.cos(a) * R), r = beacon.row + Math.round(Math.sin(a) * R);
      if (c < 2 || r < 2 || c >= this.cols - 2 || r >= this.rows - 2) continue;
      if (this.tiles[r][c] !== FLOOR || this._structureAt(c, r)) continue;
      this.solidDecor[c + "," + r] = { sprite: "decor_pillar", scale: 48, flip: false };
    }
  };

  World.prototype._renderDecor = function (ctx, cam, vw, vh) {
    if (!(P.assets)) return;
    for (const d of this.decor) {
      const x = d.x - cam.x, y = d.y - cam.y;
      if (x < -32 || y < -32 || x > vw + 32 || y > vh + 32) continue;
      if (P.lighting) P.lighting.shadow(ctx, x, y + d.scale * 0.26, d.scale * 0.36);
      P.assets.draw(ctx, d.sprite, x, y, d.scale, 0, d.flip);
    }
    for (const k in this.solidDecor) {
      const sd = this.solidDecor[k], ci = k.indexOf(","), c = +k.slice(0, ci), r = +k.slice(ci + 1);
      const x = (c + 0.5) * TILE - cam.x, y = (r + 0.5) * TILE - cam.y;
      if (x < -60 || y < -60 || x > vw + 60 || y > vh + 60) continue;
      if (P.lighting) P.lighting.shadow(ctx, x, y + sd.scale * 0.28, sd.scale * 0.46);
      P.assets.draw(ctx, sd.sprite, x, y - sd.scale * 0.16, sd.scale, 0, sd.flip);
    }
  };

  /* ---------- biome signature props: large procedurally-drawn landmarks ---------- */
  World.prototype._placeBigProps = function (cycle) {
    this.bigProps = []; this.bigSolid = {};
    for (const key in D.bigProps) {
      const def = D.bigProps[key];
      const rng = U.makeRng((W.seedBase ^ (cycle * 668265263 + 71) ^ key.charCodeAt(0) * 30011) >>> 0);
      let made = 0, tries = 0;
      while (made < def.count && tries++ < def.count * 10) {
        const c = U.rngInt(rng, 3, this.cols - 4), r = U.rngInt(rng, 3, this.rows - 4);
        if (this.tiles[r][c] !== FLOOR || this._inCompound(c, r)) continue;
        const k = c + "," + r;
        if (this.mine[k] || this.solidDecor[k] || this.bigSolid[k] || this._structureAt(c, r)) continue;
        const cen = this.centerOf(c, r);
        if (this.dirAtPx(cen.x, cen.y) !== key) continue;
        if (this.distFromCenter(cen.x, cen.y) < this.undercityOuter + TILE * 2) continue;
        const inst = { x: cen.x, y: cen.y, kind: def.kind, flip: rng() < 0.5, ph: rng() * 6.28, s: 0.85 + rng() * 0.45 };
        this.bigProps.push(inst);
        if (def.solid) this.bigSolid[k] = true;
        if (def.glow) this.glowDecor.push({ x: cen.x, y: cen.y - 6, col: def.glow, ph: inst.ph });
        made++;
      }
    }
  };
  World.prototype._renderBigProps = function (ctx, cam, vw, vh) {
    for (const p of this.bigProps) {
      const x = p.x - cam.x, y = p.y - cam.y;
      if (x < -70 || y < -80 || x > vw + 70 || y > vh + 80) continue;
      const s = p.s || 1;
      if (p.kind === "rack") drawRack(ctx, x, y, s, p.ph);
      else if (p.kind === "hulk") drawHulk(ctx, x, y, s, p.flip);
      else if (p.kind === "shroomtree") drawShroomTree(ctx, x, y, s, p.ph);
      else if (p.kind === "holo") drawHolo(ctx, x, y, s, p.ph);
      else if (p.kind === "arcade") drawArcade(ctx, x, y, s, p.ph);
    }
  };

  function roundRect(ctx, x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // STACKS — a server-cathedral rack with rows of blinking lights
  function drawRack(ctx, x, y, s, ph) {
    const w = 26 * s, h = 42 * s, t = U.now();
    if (P.lighting) P.lighting.shadow(ctx, x, y + h * 0.16, w * 0.55);
    ctx.save(); ctx.translate(x, y - h * 0.35);
    ctx.fillStyle = "#181426"; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = "#0e0b18"; ctx.fillRect(-w / 2, -h / 2, w, h * 0.08);
    ctx.strokeStyle = "#2c2444"; ctx.lineWidth = 1.5; ctx.strokeRect(-w / 2, -h / 2, w, h);
    const rows = 7;
    for (let i = 0; i < rows; i++) {
      const ry = -h / 2 + h * 0.13 + i * (h * 0.74 / rows);
      ctx.fillStyle = "rgba(36,28,56,0.9)"; ctx.fillRect(-w / 2 + 3, ry, w - 6, h * 0.055);
      for (let kk = 0; kk < 4; kk++) {
        const on = Math.sin(t * 3 + i * 1.7 + kk * 0.9 + ph) > 0.2;
        ctx.fillStyle = on ? (kk % 2 ? "#c084fc" : "#7fd0ff") : "#372c4e";
        ctx.fillRect(-w / 2 + 5 + kk * (w - 10) / 4, ry + 1, 3, 3);
      }
    }
    ctx.restore();
  }
  // SCRAPSEA — a dead, rusted vehicle hulk
  function drawHulk(ctx, x, y, s, flip) {
    const w = 48 * s, h = 24 * s;
    if (P.lighting) P.lighting.shadow(ctx, x, y + h * 0.5, w * 0.5);
    ctx.save(); ctx.translate(x, y - h * 0.15); if (flip) ctx.scale(-1, 1);
    ctx.fillStyle = "#5a3f2c"; roundRect(ctx, -w / 2, -h * 0.18, w, h * 0.72, 5); ctx.fill();
    ctx.fillStyle = "#6b4a33"; roundRect(ctx, -w * 0.24, -h * 0.62, w * 0.52, h * 0.5, 4); ctx.fill();
    ctx.fillStyle = "#17110d"; roundRect(ctx, -w * 0.2, -h * 0.54, w * 0.44, h * 0.34, 3); ctx.fill();
    ctx.fillStyle = "rgba(150,72,30,0.45)"; ctx.fillRect(-w * 0.42, h * 0.04, w * 0.84, 2);
    ctx.fillStyle = "rgba(40,28,18,0.6)"; ctx.fillRect(-w * 0.42, -h * 0.18, w * 0.84, 2);
    ctx.fillStyle = "#141014";
    ctx.beginPath(); ctx.arc(-w * 0.27, h * 0.52, h * 0.22, 0, 6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.27, h * 0.52, h * 0.22, 0, 6.28); ctx.fill();
    ctx.restore();
  }
  // GREENLINE — a bioluminescent mushroom-tree
  function drawShroomTree(ctx, x, y, s, ph) {
    const t = U.now(), w = 32 * s, h = 44 * s;
    const glow = 0.6 + 0.4 * Math.sin(t * 1.4 + ph);
    if (P.lighting) P.lighting.shadow(ctx, x, y + h * 0.18, w * 0.5);
    ctx.save(); ctx.translate(x, y - h * 0.18);
    ctx.fillStyle = "#cdbfa0"; ctx.beginPath();
    ctx.moveTo(-w * 0.13, h * 0.32); ctx.quadraticCurveTo(-w * 0.2, -h * 0.05, -w * 0.15, -h * 0.28);
    ctx.lineTo(w * 0.15, -h * 0.28); ctx.quadraticCurveTo(w * 0.2, -h * 0.05, w * 0.13, h * 0.32); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.shadowColor = "#6fe0a0"; ctx.shadowBlur = 18 * glow;
    ctx.fillStyle = "#4fae72"; ctx.beginPath(); ctx.ellipse(0, -h * 0.3, w * 0.52, h * 0.28, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#6fe0a0"; ctx.beginPath(); ctx.ellipse(0, -h * 0.33, w * 0.52, h * 0.2, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(190,255,210," + (0.5 + 0.4 * glow) + ")";
    for (let i = 0; i < 3; i++) { const a = -0.8 + i * 0.8; ctx.beginPath(); ctx.arc(Math.cos(a) * w * 0.3, -h * 0.34 - Math.sin(a) * 4, 2, 0, 6.28); ctx.fill(); }
    ctx.restore();
  }
  // GLITTERMILE — a dead arcade cabinet with a flickering screen + neon marquee
  function drawArcade(ctx, x, y, s, ph) {
    const t = U.now(), w = 22 * s, h = 40 * s;
    const glow = 0.55 + 0.45 * Math.sin(t * 2.1 + ph);
    if (P.lighting) P.lighting.shadow(ctx, x, y + h * 0.14, w * 0.6);
    ctx.save(); ctx.translate(x, y - h * 0.32);
    ctx.fillStyle = "#241430"; roundRect(ctx, -w / 2, -h / 2, w, h, 3); ctx.fill();
    ctx.strokeStyle = "#ff5ea8"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.save(); ctx.shadowColor = "#ff5ea8"; ctx.shadowBlur = 13 * glow;   // glowing marquee
    ctx.fillStyle = "#ff8fd0"; ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.11);
    ctx.restore();
    ctx.save(); ctx.shadowColor = "#5ee0ff"; ctx.shadowBlur = 14 * glow;   // glowing screen
    ctx.fillStyle = "rgba(90,210,255," + (0.45 + 0.45 * glow) + ")"; ctx.fillRect(-w / 2 + 3, -h / 2 + h * 0.17, w - 6, h * 0.34);
    ctx.restore();
    ctx.fillStyle = "rgba(0,0,0,0.22)";                                    // screen scanlines
    for (let i = 0; i < 5; i++) ctx.fillRect(-w / 2 + 3, -h / 2 + h * 0.17 + i * h * 0.07, w - 6, 1);
    ctx.fillStyle = "#160d1e"; ctx.fillRect(-w / 2 + 2, h * 0.04, w - 4, h * 0.42);   // control panel
    ctx.fillStyle = "#ff5ea8"; ctx.fillRect(-w * 0.22, h * 0.12, 3, 3);
    ctx.fillStyle = "#5ee0ff"; ctx.fillRect(w * 0.12, h * 0.12, 3, 3);
    ctx.restore();
  }
  // DEFAULT ROW — a flickering holographic "resident" still going through the motions
  function drawHolo(ctx, x, y, s, ph) {
    const t = U.now();
    if (Math.sin(t * 16 + ph) > 0.92) return;                 // occasional hologram dropout
    const flick = 0.45 + 0.3 * Math.abs(Math.sin(t * 2.1 + ph));
    const h = 36 * s, w = 15 * s;
    ctx.save(); ctx.translate(x, y - h * 0.28);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = flick * 0.5;
    ctx.fillStyle = "#6ea8ff";
    ctx.beginPath(); ctx.arc(0, -h * 0.4, w * 0.32, 0, 6.28); ctx.fill();
    roundRect(ctx, -w * 0.32, -h * 0.22, w * 0.64, h * 0.5, 4); ctx.fill();
    ctx.fillRect(-w * 0.28, h * 0.26, w * 0.2, h * 0.2); ctx.fillRect(w * 0.08, h * 0.26, w * 0.2, h * 0.2);
    ctx.globalAlpha = flick * 0.28; ctx.fillStyle = "#bfe0ff";
    for (let i = 0; i < 5; i++) { const ly = -h * 0.5 + ((i * h * 0.2 + t * 22) % (h * 0.95)); ctx.fillRect(-w * 0.4, ly, w * 0.8, 1); }
    ctx.restore();
  }

  // random floor cell in the radial ring [minR,maxR] from center (for Undercity content)
  World.prototype._randFloorInRing = function (rng, minR, maxR) {
    for (let tries = 0; tries < 60; tries++) {
      const a = rng() * Math.PI * 2, rr = minR + rng() * (maxR - minR);
      const c = Math.floor((this.centerX + Math.cos(a) * rr) / TILE);
      const r = Math.floor((this.centerY + Math.sin(a) * rr) / TILE);
      if (c < 2 || r < 2 || c >= this.cols - 2 || r >= this.rows - 2) continue;
      if (this.tiles[r][c] !== FLOOR || this._inCompound(c, r) || this._structureAt(c, r)) continue;
      return { col: c, row: r };
    }
    return null;
  };

  // the Undercity ring: light loot, a few rubble nodes, dim lamps — the warm-up layer
  World.prototype._placeUndercity = function (cycle) {
    const u = D.undercity, minR = this.holdRadius + TILE * 2, maxR = this.undercityOuter - TILE;
    const rubble = D.mining.north.nodes[0];
    const nrng = U.makeRng((W.seedBase ^ (cycle * 99991 + 3)) >>> 0);
    for (let i = 0; i < 18; i++) {
      const p = this._randFloorInRing(nrng, minR, maxR); if (!p) continue;
      this._setNode(p.col, p.row, { kind: rubble.kind, color: rubble.color, hp: rubble.hp, maxHp: rubble.hp, hardness: rubble.hardness, glow: false, drops: rubble.drops });
    }
    const grng = U.makeRng((W.seedBase ^ (cycle * 99991 + 7)) >>> 0);
    for (let i = 0; i < 9; i++) {
      const p = this._randFloorInRing(grng, minR, maxR); if (!p) continue;
      const cen = this.centerOf(p.col, p.row);
      this.glows.push({ x: cen.x, y: cen.y, col: u.accent, ph: grng() * 6.28 });
    }
    const crng = U.makeRng((W.seedBase ^ (cycle * 99991 + 11)) >>> 0);
    for (let i = 0; i < u.chestCount; i++) {
      const p = this._randFloorInRing(crng, minR, maxR); if (!p) continue;
      const cen = this.centerOf(p.col, p.row);
      this._undercityChests.push({ id: "u" + cycle + "_" + i, col: p.col, row: p.row, x: cen.x, y: cen.y, tier: 1 });
    }
  };

  /* ---------- destructible nodes: registry + damage ---------- */
  World.prototype.mineAt = function (col, row) { return this.mine[col + "," + row] || null; };
  World.prototype.mineAtPx = function (px, py) { return this.mineAt(Math.floor(px / TILE), Math.floor(py / TILE)); };
  World.prototype._setNode = function (col, row, n) {
    this.tiles[row][col] = WALL;
    this.mine[col + "," + row] = n;
    if (n.glow) { const cen = this.centerOf(col, row); this.glowNodes.push({ col: col, row: row, x: cen.x, y: cen.y, col_: n.color }); }
  };
  // apply damage; returns {destroyed, node, cx, cy} or null if no node there
  World.prototype.damageNode = function (col, row, dmg) {
    const k = col + "," + row, node = this.mine[k];
    if (!node) return null;
    node.hp -= dmg;
    const cen = this.centerOf(col, row);
    if (node.hp <= 0) { this.tiles[row][col] = FLOOR; delete this.mine[k]; return { destroyed: true, node: node, cx: cen.x, cy: cen.y }; }
    return { destroyed: false, node: node, cx: cen.x, cy: cen.y };
  };

  /* ---------- mining nodes scattered through the districts ---------- */
  World.prototype._placeMineNodes = function (cycle) {
    for (const key in D.biomes) {
      const mb = D.mining[key]; if (!mb) continue;
      const rng = U.makeRng((W.seedBase ^ (cycle * 2654435761 + 91) ^ key.charCodeAt(0) * 40961) >>> 0);
      const clusters = Math.floor(this.cols * this.rows * mb.density / 9);
      const minD = this.undercityOuter;
      for (let i = 0; i < clusters; i++) {
        const c = U.rngInt(rng, 2, this.cols - 3), r = U.rngInt(rng, 2, this.rows - 3);
        if (this.tiles[r][c] !== FLOOR || this._inCompound(c, r)) continue;
        const cen = this.centerOf(c, r);
        if (this.dirAtPx(cen.x, cen.y) !== key) continue;
        if (U.dist(cen.x, cen.y, this.centerX, this.centerY) < minD) continue;
        if (this._structureAt(c, r)) continue;
        const def = U.rngPick(rng, mb.nodes);
        this._setNode(c, r, { kind: def.kind, color: def.color, hp: def.hp, maxHp: def.hp, hardness: def.hardness, glow: def.glow, drops: def.drops });
      }
    }
  };

  /* ---------- buildings: roofless rooms you enter (or breach) ---------- */
  World.prototype._placeBuildings = function (cycle) {
    const W_ = D.mining._wall;
    for (const key in D.biomes) {
      const rng = U.makeRng((W.seedBase ^ (cycle * 374761 + 57) ^ key.charCodeAt(0) * 7349) >>> 0);
      const minD = this.undercityOuter + TILE * 2;
      let made = 0, tries = 0;
      while (made < 3 && tries++ < 40) {
        const bw = U.rngInt(rng, 6, 9), bh = U.rngInt(rng, 5, 7);
        const c0 = U.rngInt(rng, 2, this.cols - bw - 2), r0 = U.rngInt(rng, 2, this.rows - bh - 2);
        const ccx = c0 + bw / 2, ccy = r0 + bh / 2;
        const cen = this.centerOf(Math.floor(ccx), Math.floor(ccy));
        if (this.dirAtPx(cen.x, cen.y) !== key) continue;
        if (U.dist(cen.x, cen.y, this.centerX, this.centerY) < minD) continue;
        if (!this._areaClear(c0 - 1, r0 - 1, bw + 2, bh + 2)) continue;
        // breachable perimeter walls + a 2-wide doorway on a random side
        const door = U.rngInt(rng, 0, 3);
        for (let c = c0; c < c0 + bw; c++) for (let r = r0; r < r0 + bh; r++) {
          const edge = (c === c0 || c === c0 + bw - 1 || r === r0 || r === r0 + bh - 1);
          if (!edge) continue;
          this._setNode(c, r, { kind: W_.kind, color: W_.color, hp: W_.hp, maxHp: W_.hp, hardness: W_.hardness, glow: false, drops: W_.drops });
        }
        const dm = c0 + Math.floor(bw / 2);
        const dn = r0 + Math.floor(bh / 2);
        if (door === 0) { this._clearNode(dm, r0); this._clearNode(dm + 1, r0); }
        else if (door === 1) { this._clearNode(dm, r0 + bh - 1); this._clearNode(dm + 1, r0 + bh - 1); }
        else if (door === 2) { this._clearNode(c0, dn); this._clearNode(c0, dn + 1); }
        else { this._clearNode(c0 + bw - 1, dn); this._clearNode(c0 + bw - 1, dn + 1); }
        // a reward chest inside
        const ix = c0 + Math.floor(bw / 2), iy = r0 + Math.floor(bh / 2);
        const ic = this.centerOf(ix, iy);
        this._buildingChests.push({ id: "b" + cycle + "_" + key + made, col: ix, row: iy, x: ic.x, y: ic.y, tier: this.lootTierAtPx(ic.x, ic.y) });
        made++;
      }
    }
  };
  World.prototype._clearNode = function (c, r) { this.tiles[r][c] = FLOOR; delete this.mine[c + "," + r]; };
  World.prototype._areaClear = function (c0, r0, w, h) {
    for (let c = c0; c < c0 + w; c++) for (let r = r0; r < r0 + h; r++) {
      if (c < 1 || r < 1 || c >= this.cols - 1 || r >= this.rows - 1) return false;
      if (this._inCompound(c, r) || this.tiles[r][c] === WALL || this.mine[c + "," + r] || this._structureAt(c, r)) return false;
    }
    return true;
  };

  /* ---------- glow nodes: emissive salvage-tech motes that light the dark districts ---------- */
  World.prototype._placeGlows = function (cycle) {
    this.glows = [];
    const minD = this.undercityOuter;
    for (const key in D.biomes) {
      const b = D.biomes[key];
      const rng = U.makeRng((W.seedBase ^ (cycle * 40503 + 13) ^ key.charCodeAt(0) * 251) >>> 0);
      const n = 12;
      for (let i = 0; i < n; i++) {
        const pos = this._randFloorInDir(rng, key, minD);
        if (!pos) continue;
        const cen = this.centerOf(pos.col, pos.row);
        this.glows.push({ x: cen.x, y: cen.y, col: b.accent, ph: rng() * 6.28 });
      }
    }
  };

  // a destructible node: chunky block, material flecks, cracks that grow with damage
  World.prototype._renderNode = function (ctx, x, y, node, c, r) {
    const dmg = 1 - node.hp / node.maxHp;
    ctx.fillStyle = node.color;
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(x + 1, y + 1, TILE - 2, 3);
    ctx.fillStyle = "rgba(0,0,0,0.34)"; ctx.fillRect(x + 1, y + TILE - 4, TILE - 2, 3);
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.fillRect(x + 1, y + 1, 2, TILE - 2);
    // deterministic material flecks
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i < 4; i++) {
      const hx = U.hash2(c * 13 + i, r * 7 + 1), hy = U.hash2(c * 5 + 1, r * 11 + i);
      ctx.fillRect(x + 4 + hx * (TILE - 9), y + 4 + hy * (TILE - 9), 2, 2);
    }
    // cracks grow as the node is mined
    if (dmg > 0.12) {
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 1;
      ctx.beginPath();
      const n = Math.min(4, 1 + Math.floor(dmg * 4));
      for (let i = 0; i < n; i++) {
        const a = (U.hash2(c + i * 9, r + 3) * 6.28);
        const len = (TILE * 0.4) * (0.5 + dmg * 0.5);
        const mx = x + TILE / 2, my = y + TILE / 2;
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(a) * len, my + Math.sin(a) * len);
      }
      ctx.stroke();
    }
  };

  // Atmospheric motes for the player's current district — drawn in SCREEN space
  // on top of the lighting pass (additive) so they glow over the dark. Drifting
  // spores / dust / data-bits give each biome a sense of living motion.
  World.prototype.renderMotes = function (ctx, vw, vh, region) {
    const biome = D.biomes[region];
    if (!biome || !biome.motes) return;
    const m = biome.motes, t = U.now();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = m.col;
    for (let i = 0; i < m.count; i++) {
      const bx = U.hash2(i * 7 + 1, 13), by = U.hash2(i * 5 + 2, 29);
      let px = bx * vw + m.drift * t * 2 + i * 37;
      let py = by * vh + m.rise * t * 2 + i * 53;
      px = ((px % vw) + vw) % vw; py = ((py % vh) + vh) % vh;
      const tw = 0.3 + 0.7 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
      ctx.globalAlpha = tw * 0.45;
      const s = m.size * (m.kind === "data" ? 1 : 1.5) * (0.7 + 0.5 * tw);
      if (m.kind === "data") ctx.fillRect(px, py, s, s);          // square data-bits
      else { ctx.beginPath(); ctx.arc(px, py, s, 0, 6.28); ctx.fill(); }  // soft spores/dust
    }
    ctx.restore();
  };

  World.prototype._renderGlows = function (ctx, cam, vw, vh) {
    const t = U.now();
    for (const gl of this.glows) {
      const x = gl.x - cam.x, y = gl.y - cam.y;
      if (x < -20 || y < -20 || x > vw + 20 || y > vh + 20) continue;
      const p = 0.6 + 0.4 * Math.sin(t * 2.5 + gl.ph);
      ctx.save();
      ctx.shadowColor = gl.col; ctx.shadowBlur = 10 * p;
      ctx.fillStyle = gl.col;
      ctx.beginPath(); ctx.arc(x, y, 2.6 + p, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  /* ---------- torches: warm point-lights that make the Hold cozy (spec look) ---------- */
  World.prototype._placeTorches = function () {
    const cx = this.cx, cy = this.cy, hw = this.hw, hh = this.hh;
    const cells = [
      [cx - 3, cy - hh + 1], [cx + 3, cy - hh + 1],   // flank the N doorway
      [cx - 3, cy + hh - 1], [cx + 3, cy + hh - 1],   // S
      [cx - hw + 1, cy - 3], [cx - hw + 1, cy + 3],   // W
      [cx + hw - 1, cy - 3], [cx + hw - 1, cy + 3],   // E
      [cx - hw + 2, cy - hh + 2], [cx + hw - 2, cy - hh + 2],  // interior corners
      [cx - hw + 2, cy + hh - 2], [cx + hw - 2, cy + hh - 2],
    ];
    this.torches = [];
    for (const [c, r] of cells) {
      if (this.solidAt(c, r)) continue;
      const cen = this.centerOf(c, r);
      this.torches.push({ col: c, row: r, x: cen.x, y: cen.y });
    }
  };

  World.prototype._renderTorches = function (ctx, cam) {
    const t = U.now();
    for (const to of this.torches) {
      const x = to.x - cam.x, y = to.y - cam.y;
      const f = 0.7 + 0.3 * Math.sin(t * 12 + to.x * 0.5);
      ctx.fillStyle = "#241a12";                         // post
      ctx.fillRect(x - 2, y - 1, 4, 9);
      ctx.fillStyle = "#3a2a1a";
      ctx.fillRect(x - 3, y + 7, 6, 2);
      ctx.save();                                        // flame
      ctx.shadowColor = "#ff9a3c"; ctx.shadowBlur = 10 * f;
      ctx.fillStyle = "#ffd27a";
      ctx.beginPath(); ctx.ellipse(x, y - 4, 3, 5 * f, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ff7a2a";
      ctx.beginPath(); ctx.ellipse(x, y - 3, 1.8, 3 * f, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

  // surround the Hold with a thick band of diggable earth, with carved exit tunnels,
  // so the base reads as a room dug DOWN into solid ground (and can be expanded by mining)
  World.prototype._digOutHold = function () {
    const cx = this.cx, cy = this.cy, hw = this.hw, hh = this.hh, band = 4, door = W.compound.door;
    const e = D.mining._earth;
    for (let r = cy - hh - band; r <= cy + hh + band; r++) {
      for (let c = cx - hw - band; c <= cx + hw + band; c++) {
        if (c < 1 || r < 1 || c >= this.cols - 1 || r >= this.rows - 1) continue;
        if (this._inCompound(c, r) || this.tiles[r][c] === WALL) continue;
        this._setNode(c, r, { kind: e.kind, color: e.color, hp: e.hp, maxHp: e.hp, hardness: e.hardness, glow: false, drops: e.drops });
      }
    }
    for (let d = -door; d <= door; d++) {            // carve the four exit tunnels through the earth
      for (let b = 1; b <= band; b++) {
        this._clearNode(cx + d, cy - hh - b); this._clearNode(cx + d, cy + hh + b);
        this._clearNode(cx - hw - b, cy + d); this._clearNode(cx + hw + b, cy + d);
      }
    }
  };

  World.prototype._buildTiles = function (cycle) {
    const rows = this.rows, cols = this.cols;
    const t = new Array(rows);
    for (let r = 0; r < rows; r++) {
      t[r] = new Array(cols).fill(FLOOR);
      for (let c = 0; c < cols; c++) if (r === 0 || c === 0 || r === rows - 1 || c === cols - 1) t[r][c] = WALL;
    }
    this.tiles = t;

    // home compound: perimeter walls with a doorway gap on each side
    const cx = this.cx, cy = this.cy, hw = this.hw, hh = this.hh, door = W.compound.door;
    for (let c = cx - hw; c <= cx + hw; c++) { t[cy - hh][c] = WALL; t[cy + hh][c] = WALL; }
    for (let r = cy - hh; r <= cy + hh; r++) { t[r][cx - hw] = WALL; t[r][cx + hw] = WALL; }
    for (let d = -door; d <= door; d++) {
      t[cy - hh][cx + d] = FLOOR; t[cy + hh][cx + d] = FLOOR; // N / S doors
      t[cy + d][cx - hw] = FLOOR; t[cy + d][cx + hw] = FLOOR; // W / E doors
    }

    this._digOutHold();   // wrap the den in diggable earth so it reads as carved underground

    // surface cover, per biome, regenerating each cycle
    for (const key in D.biomes) {
      const b = D.biomes[key];
      const rng = U.makeRng((W.seedBase ^ (cycle * 2654435761) ^ key.charCodeAt(0) * 7919) >>> 0);
      this._scatterCover(rng, key, b.cover);
    }
  };

  World.prototype._scatterCover = function (rng, dir, density) {
    const t = this.tiles;
    const clusters = Math.floor((this.cols * this.rows) * density / 22);
    for (let i = 0; i < clusters; i++) {
      const cc = U.rngInt(rng, 2, this.cols - 3);
      const cr = U.rngInt(rng, 2, this.rows - 3);
      if (this._inCompound(cc, cr)) continue;
      const cen = this.centerOf(cc, cr);
      if (this.dirAtPx(cen.x, cen.y) !== dir) continue;
      if (U.dist(cen.x, cen.y, this.centerX, this.centerY) < this.undercityOuter) continue; // keep cover in the biomes
      const shapes = [[[0,0],[1,0]], [[0,0],[0,1]], [[0,0],[1,0],[0,1],[1,1]], [[0,0],[1,0],[2,0]]];
      for (const [dc, dr] of U.rngPick(rng, shapes)) {
        const c = cc + dc, r = cr + dr;
        if (c <= 0 || c >= this.cols - 1 || r <= 0 || r >= this.rows - 1) continue;
        if (this._inCompound(c, r)) continue;
        t[r][c] = WALL;
      }
    }
  };

  /* ---------- structures (stations inside; beacon out in the Stacks) ---------- */
  World.prototype._placeStructures = function () {
    const cx = this.cx, cy = this.cy;
    this.structures = [
      { type: "storage", col: cx - 6, row: cy - 4, label: "STORAGE",   color: "#ffb347", glow: "rgba(255,179,71,0.5)" },
      { type: "fab",     col: cx + 6, row: cy - 4, label: "FAB BENCH",  color: "#4fd6c9", glow: "rgba(79,214,201,0.5)" },
      { type: "claim",   col: cx - 6, row: cy + 4, label: "CLAIM",      color: "#ff8aa0", glow: "rgba(255,138,160,0.5)" },
      { type: "cot",     col: cx + 6, row: cy + 4, label: "REST",       color: "#9fb0c4", glow: "rgba(159,176,196,0.4)" },
      { type: "hydro",   col: cx,     row: cy - 7, label: "HYDROPONICS",color: "#6fe0a0", glow: "rgba(111,224,160,0.5)" },
      { type: "cook",    col: cx,     row: cy + 7, label: "COOKFIRE",   color: "#ff9a3c", glow: "rgba(255,154,60,0.55)" },
      { type: "deepgate",col: cx - 9, row: cy,     label: "THE DEEP",   color: "#a06aff", glow: "rgba(160,106,255,0.6)" },
      { type: "beacon",  col: cx - 26, row: cy,    label: "BEACON",     color: "#ff5a6e", glow: "rgba(255,90,110,0.6)" },
    ];
    for (const s of this.structures) {
      this.tiles[s.row][s.col] = FLOOR;
      const cen = this.centerOf(s.col, s.row);
      s.x = cen.x; s.y = cen.y;
    }
  };

  // a field casino re-seeds out in the Glittermile each cycle (spec §9.9 transient POI)
  World.prototype._placeCasino = function (cycle) {
    const rng = U.makeRng((W.seedBase ^ (cycle * 22695477 + 313)) >>> 0);
    const pos = this._randFloorInDir(rng, "glitter", this.undercityOuter + TILE * 4);
    if (!pos) return;
    const cen = this.centerOf(pos.col, pos.row);
    this.structures.push({ type: "casino", col: pos.col, row: pos.row, x: cen.x, y: cen.y, label: "CASINO", color: "#ff5ea8", glow: "rgba(255,94,168,0.6)" });
  };

  World.prototype.holdSpawn = function () { return { x: this.centerX, y: this.centerY }; };

  /* ---------- chests (loot source, by biome) ---------- */
  World.prototype._generateChests = function (cycle) {
    const out = [];
    let idx = 0;
    for (const key in D.biomes) {
      const b = D.biomes[key];
      const rng = U.makeRng((W.seedBase ^ (cycle * 374761393 + 1) ^ key.charCodeAt(0) * 104729) >>> 0);
      const minD = this.undercityOuter;          // biome chests live past the Undercity ring
      for (let i = 0; i < b.chestCount; i++) {
        const pos = this._randFloorInDir(rng, key, minD);
        if (!pos) continue;
        const cen = this.centerOf(pos.col, pos.row);
        out.push({ id: "c" + cycle + "_" + (idx++), col: pos.col, row: pos.row, x: cen.x, y: cen.y, tier: this.lootTierAtPx(cen.x, cen.y) });
      }
    }
    return out;
  };

  World.prototype._randFloorInDir = function (rng, dir, minD) {
    for (let tries = 0; tries < 60; tries++) {
      const c = U.rngInt(rng, 2, this.cols - 3);
      const r = U.rngInt(rng, 2, this.rows - 3);
      if (this.solidAt(c, r) || this._inCompound(c, r)) continue;
      const cen = this.centerOf(c, r);
      if (this.dirAtPx(cen.x, cen.y) !== dir) continue;
      if (U.dist(cen.x, cen.y, this.centerX, this.centerY) < minD) continue;
      if (this._structureAt(c, r)) continue;
      return { col: c, row: r };
    }
    return null;
  };
  World.prototype._structureAt = function (col, row) {
    for (const s of this.structures) if (s.col === col && s.row === row) return s;
    return null;
  };

  // Enemy spawn descriptors for a cycle (game.js builds the entities).
  World.prototype.enemySpawns = function (cycle) {
    const out = [];
    const minD = this.undercityOuter;   // surface enemies live past the Undercity ring
    // weak, sparse Undercity enemies in the ring (the warm-up layer)
    const urng = U.makeRng((W.seedBase ^ (cycle * 99991 + 23)) >>> 0);
    for (const [type, count] of D.undercity.enemies) {
      for (let i = 0; i < count; i++) {
        const pos = this._randFloorInRing(urng, this.holdRadius + TILE * 3, this.undercityOuter - TILE);
        if (!pos) continue;
        const cen = this.centerOf(pos.col, pos.row);
        out.push({ type: type, x: cen.x, y: cen.y });
      }
    }
    for (const key in D.biomes) {
      const b = D.biomes[key];
      const rng = U.makeRng((W.seedBase ^ (cycle * 2246822519 + 7) ^ key.charCodeAt(0) * 53) >>> 0);
      for (const [type, count] of b.enemies) {
        for (let i = 0; i < count; i++) {
          const pos = this._randFloorInDir(rng, key, minD);
          if (!pos) continue;
          const cen = this.centerOf(pos.col, pos.row);
          out.push({ type, x: cen.x, y: cen.y });
        }
      }
    }
    // one foreclosure-titan per district per cycle, lurking deep in the outer half
    const trng = U.makeRng((W.seedBase ^ (cycle * 2654435761 + 777)) >>> 0);
    const deepD = this.undercityOuter + (this.mapRadius - this.undercityOuter) * 0.5;
    for (const key in D.titansByBiome) {
      const pos = this._randFloorInDir(trng, key, deepD);
      if (!pos) continue;
      const cen = this.centerOf(pos.col, pos.row);
      out.push({ type: D.titansByBiome[key], x: cen.x, y: cen.y });
    }
    return out;
  };

  /* ---------- collision (AABB-vs-tiles, axis separated) ---------- */
  World.prototype.moveBody = function (body, dx, dy) { this._sweep(body, dx, 0); this._sweep(body, 0, dy); };
  World.prototype._sweep = function (body, dx, dy) {
    if (dx === 0 && dy === 0) return;
    const r = body.radius;
    body.x += dx; body.y += dy;
    const minC = Math.floor((body.x - r) / TILE), maxC = Math.floor((body.x + r) / TILE);
    const minR = Math.floor((body.y - r) / TILE), maxR = Math.floor((body.y + r) / TILE);
    for (let row = minR; row <= maxR; row++) {
      for (let col = minC; col <= maxC; col++) {
        if (!this.solidAt(col, row)) continue;
        const tl = col * TILE, tr = tl + TILE, tt = row * TILE, tb = tt + TILE;
        if (body.x + r <= tl || body.x - r >= tr || body.y + r <= tt || body.y - r >= tb) continue;
        if (dx > 0) body.x = tl - r;
        else if (dx < 0) body.x = tr + r;
        else if (dy > 0) body.y = tt - r;
        else if (dy < 0) body.y = tb + r;
      }
    }
  };

  /* ---------- queries ---------- */
  World.prototype.structureNear = function (px, py, range) {
    let best = null, bestD = range * range;
    for (const s of this.structures) {
      const d = U.dist2(px, py, s.x, s.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  };
  World.prototype.chestNear = function (px, py, range) {
    let best = null, bestD = range * range;
    for (const ch of this.chests) {
      if (this.opened[ch.id]) continue;
      const d = U.dist2(px, py, ch.x, ch.y);
      if (d < bestD) { bestD = d; best = ch; }
    }
    return best;
  };

  /* ---------- per-tile floor texture (breaks the repeated-square look) ----------
     Two octaves of smooth noise give large soft patches + fine grain, then a
     sparse deterministic grit/scuff pass so no two tiles read identically. */
  World.prototype._floorTexture = function (ctx, c, r, x, y, region) {
    const n = U.noise(c * 0.34, r * 0.34) * 0.65 + U.noise(c * 1.7, r * 1.7) * 0.35;
    const v = n - 0.5;
    ctx.fillStyle = v > 0
      ? "rgba(255,255,255," + (v * 0.10).toFixed(3) + ")"
      : "rgba(0,0,0," + (-v * 0.22).toFixed(3) + ")";
    ctx.fillRect(x, y, TILE, TILE);

    const h = U.hash2(c, r);
    if (h < 0.11) {                                   // dark grit fleck
      const sx = x + U.hash2(c + 7, r) * (TILE - 6);
      const sy = y + U.hash2(c, r + 7) * (TILE - 6);
      const sz = 2 + U.hash2(c + 3, r + 3) * 4;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(sx, sy, sz, sz);
    } else if (h > 0.94) {                             // faint highlight speck
      const sx = x + U.hash2(c + 5, r) * (TILE - 4);
      const sy = y + U.hash2(c, r + 5) * (TILE - 4);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(sx, sy, 3, 3);
    }

    if (region && region !== "hold" && region !== "undercity") this._biomeFloorDetail(ctx, c, r, x, y, region);
  };

  // signature ground marks per district — deterministic per tile so they're stable.
  // Subtle layers ON TOP of the floor texture that give each biome a material identity.
  World.prototype._biomeFloorDetail = function (ctx, c, r, x, y, region) {
    const T = TILE;
    if (region === "south") {                           // GREENLINE — moss, roots, spores
      const h = U.hash2(c * 3 + 1, r * 3 + 2);
      if (h < 0.34) {                                   // moss blotch
        ctx.fillStyle = "rgba(74,150,82,0.13)";
        const bx = x + U.hash2(c + 2, r) * T * 0.5, by = y + U.hash2(c, r + 2) * T * 0.5;
        const br = 6 + U.hash2(c + 5, r + 5) * 9;
        ctx.beginPath(); ctx.ellipse(bx, by, br, br * 0.7, 0, 0, 6.28); ctx.fill();
      }
      if (h > 0.6 && h < 0.7) {                         // creeping root
        ctx.strokeStyle = "rgba(40,80,44,0.3)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + U.hash2(c, r + 4) * T);
        ctx.quadraticCurveTo(x + T * 0.5, y + T * 0.5, x + T - 2, y + U.hash2(c + 4, r) * T);
        ctx.stroke();
      }
      if (h > 0.95) {                                   // bright spore mote
        ctx.fillStyle = "rgba(155,242,170,0.65)";
        ctx.fillRect(x + U.hash2(c + 9, r) * T, y + U.hash2(c, r + 9) * T, 2, 2);
      }
    } else if (region === "east") {                     // SCRAPSEA — oil, rust, bolts
      const h = U.hash2(c * 5 + 3, r * 5 + 1);
      if (h < 0.16) {                                   // oil stain
        ctx.fillStyle = "rgba(0,0,0,0.24)";
        const bx = x + U.hash2(c + 1, r) * T * 0.5 + 6, by = y + U.hash2(c, r + 1) * T * 0.5 + 6;
        const br = 7 + U.hash2(c + 4, r + 4) * 10;
        ctx.beginPath(); ctx.ellipse(bx, by, br, br * 0.55, 0.6, 0, 6.28); ctx.fill();
      }
      if (h > 0.8) {                                    // rust streak
        ctx.strokeStyle = "rgba(176,92,40,0.2)"; ctx.lineWidth = 2;
        const sy = y + U.hash2(c, r + 3) * T;
        ctx.beginPath(); ctx.moveTo(x + 1, sy); ctx.lineTo(x + T - 1, sy + (U.hash2(c + 6, r) - 0.5) * 9); ctx.stroke();
      }
      if (h > 0.46 && h < 0.52) {                       // loose bolt / chrome fleck
        ctx.fillStyle = "rgba(188,190,198,0.32)";
        ctx.fillRect(x + U.hash2(c + 7, r) * (T - 4), y + U.hash2(c, r + 7) * (T - 4), 3, 3);
      }
    } else if (region === "north") {                    // DEFAULT ROW — domestic tiling, cracks
      const h = U.hash2(c * 2 + 1, r * 2 + 5);
      if (h < 0.26) {                                   // faint tile / parquet outline
        ctx.strokeStyle = "rgba(150,176,220,0.07)"; ctx.lineWidth = 1;
        ctx.strokeRect(x + 3.5, y + 3.5, T - 7, T - 7);
      }
      if (h > 0.9) {                                    // hairline crack
        ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 1;
        const mx = x + T * 0.5, my = y + T * 0.5;
        ctx.beginPath(); ctx.moveTo(mx, my);
        ctx.lineTo(mx + (U.hash2(c + 3, r) - 0.5) * T, my + (U.hash2(c, r + 3) - 0.5) * T); ctx.stroke();
      }
    } else if (region === "west") {                     // STACKS — server grid, circuit traces
      ctx.strokeStyle = "rgba(150,110,220,0.06)"; ctx.lineWidth = 1;  // faint tech grid every tile
      ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + T, y + 0.5); ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + T); ctx.stroke();
      const h = U.hash2(c * 4 + 2, r * 4 + 6);
      if (h < 0.17) {                                   // circuit trace + node
        ctx.strokeStyle = "rgba(182,140,255,0.2)"; ctx.lineWidth = 1.5;
        const mx = x + T * 0.5, my = y + T * 0.5;
        ctx.beginPath(); ctx.moveTo(x + 4, my); ctx.lineTo(mx, my); ctx.lineTo(mx, y + T - 4); ctx.stroke();
        ctx.fillStyle = "rgba(204,164,255,0.45)"; ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }
      if (h > 0.95) {                                   // data glint
        ctx.fillStyle = "rgba(212,172,255,0.7)";
        ctx.fillRect(x + U.hash2(c + 8, r) * T, y + U.hash2(c, r + 8) * T, 2, 2);
      }
    } else if (region === "glitter") {                  // GLITTERMILE — neon dancefloor + glitter
      if ((c + r) % 2 === 0) { ctx.fillStyle = "rgba(255,90,170,0.07)"; ctx.fillRect(x, y, T, T); }
      ctx.strokeStyle = "rgba(255,120,205,0.11)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
      const h = U.hash2(c * 6 + 2, r * 6 + 4);
      if (h > 0.9) {                                    // glitter speck (cyan/pink)
        ctx.fillStyle = h > 0.95 ? "rgba(120,230,255,0.8)" : "rgba(255,150,215,0.8)";
        ctx.fillRect(x + U.hash2(c + 8, r) * T, y + U.hash2(c, r + 8) * T, 2, 2);
      }
    }
  };

  /* ---------- rendering (tiles + compound + structures) ---------- */
  World.prototype.render = function (ctx, cam, vw, vh) {
    const t = this.tiles;
    const c0 = Math.max(0, Math.floor(cam.x / TILE));
    const r0 = Math.max(0, Math.floor(cam.y / TILE));
    const c1 = Math.min(this.cols - 1, Math.floor((cam.x + vw) / TILE));
    const r1 = Math.min(this.rows - 1, Math.floor((cam.y + vh) / TILE));

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = c * TILE - cam.x, y = r * TILE - cam.y;
        const cen = this.centerOf(c, r);
        const home = this._inCompound(c, r);
        if (t[r][c] === WALL) {
          const node = this.mine[c + "," + r];
          if (node) { this._renderNode(ctx, x, y, node, c, r); }
          else {
            const wreg = home ? null : this.regionAtPx(cen.x, cen.y);
            ctx.fillStyle = home ? D.home.wall : wreg === "undercity" ? D.undercity.wall : D.biomes[wreg].wall;
            ctx.fillRect(x, y, TILE, TILE);
            ctx.fillStyle = "rgba(255,255,255,0.04)";
            ctx.fillRect(x, y, TILE, 3);
          }
        } else {
          const dir = home ? "hold" : this.regionAtPx(cen.x, cen.y);
          // Sample the big SEAMLESS biome texture continuously by world position:
          // each tile draws the matching 32px slice, so the floor reads as one
          // unbroken surface instead of the same thumbnail stamped per tile.
          const img = P.assets && P.assets.img("floor_" + dir);
          if (img) {
            const tw = img.width, th = img.height;
            const sx = (((c * TILE) % tw) + tw) % tw;
            const sy = (((r * TILE) % th) + th) % th;
            ctx.drawImage(img, sx, sy, TILE, TILE, x, y, TILE, TILE);
          } else {
            ctx.fillStyle = home ? D.home.floor : this.floorColorAt(cen.x, cen.y, false);
            ctx.fillRect(x, y, TILE, TILE);
          }
          this._floorTexture(ctx, c, r, x, y, dir);
        }
      }
    }

    // (darkness/vignette now comes from the dynamic lighting pass — js/lighting.js)
    this._renderDecor(ctx, cam, vw, vh);
    this._renderBigProps(ctx, cam, vw, vh);
    this._renderGlows(ctx, cam, vw, vh);
    this._renderStructures(ctx, cam);
    this._renderTorches(ctx, cam);
  };

  World.prototype._renderStructures = function (ctx, cam) {
    const tnow = U.now();
    for (const s of this.structures) {
      const x = s.x - cam.x, y = s.y - cam.y;
      const pulse = 0.7 + 0.3 * Math.sin(tnow * 2 + s.col);
      if (P.lighting) P.lighting.shadow(ctx, x, y + 15, 18);
      ctx.save();
      ctx.translate(x, y);
      ctx.shadowColor = s.glow; ctx.shadowBlur = 16 * pulse;
      ctx.fillStyle = "rgba(10,14,20,0.95)";
      ctx.fillRect(-15, -15, 30, 30);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = s.color; ctx.lineWidth = 2;
      ctx.strokeRect(-15, -15, 30, 30);
      ctx.fillStyle = s.color;
      ctx.fillRect(-9, -9, 18, 18 * (s.type === "beacon" ? pulse : 0.5));
      ctx.restore();
      ctx.fillStyle = s.color;
      ctx.font = "9px Consolas, monospace";
      ctx.textAlign = "center";
      ctx.fillText(s.label, x, y - 20);
      ctx.textAlign = "left";
    }
  };

  P.World = World;
})(window.PACT = window.PACT || {});
