/* ============================================================
   THE PACT — LIGHTING  (Core Keeper-style dynamic 2D lighting)
   The world is dark; warm/cool point lights (the player's lantern,
   torches, glowing stations, fire, salvage-tech, projectiles) carve
   pools of light out of the shadow. Built as a screen-space light
   map: fill with ambient darkness, add lights additively, then
   MULTIPLY the map over the rendered scene. A second additive pass
   blooms the bright cores so fire and tech visibly glow.
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util;
  const L = { canvas: null, ctx: null, lights: [] };

  function ensure(vw, vh) {
    if (!L.canvas) { L.canvas = document.createElement("canvas"); L.ctx = L.canvas.getContext("2d"); }
    if (L.canvas.width !== vw || L.canvas.height !== vh) { L.canvas.width = vw; L.canvas.height = vh; }
  }

  function hexRgb(h) {
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }

  // paint one radial light onto a context (caller sets compositeOperation)
  function paint(c, sx, sy, R, col, inten) {
    if (R <= 0 || inten <= 0) return;
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    const cr = col[0], cg = col[1], cb = col[2];
    g.addColorStop(0, "rgba(" + cr + "," + cg + "," + cb + "," + inten + ")");
    g.addColorStop(0.5, "rgba(" + cr + "," + cg + "," + cb + "," + (inten * 0.33).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + cr + "," + cg + "," + cb + ",0)");
    c.fillStyle = g;
    c.fillRect(sx - R, sy - R, R * 2, R * 2);
  }

  // base darkness where the player is standing — darkens with depth, and TINTS to
  // the district's signature mood so each biome reads as its own colour of dark.
  function ambient(G) {
    const p = G.player;
    if (G.world.isSafeAtPx(p.x, p.y)) return [82, 74, 64];     // the Hold: cozy, warm, lit
    const d = G.world.depthAtPx(p.x, p.y);                      // 0.4 (Undercity) .. 4.5 (deep)
    const t = U.clamp((d - 0.4) / 3.6, 0, 1);
    const biome = G.world.biomeAtPx(p.x, p.y);
    const mood = (biome && biome.mood) ? hexRgb(biome.mood) : [44, 46, 54];
    const bright = 1.32 - t * 0.78;                            // brighter at the ring, near-black deep
    return [Math.round(mood[0] * bright), Math.round(mood[1] * bright), Math.round(mood[2] * bright)];
  }

  // collect every light in (or near) the view this frame
  function gather(G) {
    const t = U.now();
    const flick = 0.85 + 0.15 * Math.sin(t * 11 + Math.cos(t * 7) * 2);
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
    const out = L.lights; out.length = 0;
    const p = G.player;

    // the player's lantern — the core "vision" light
    out.push({ x: p.x, y: p.y, r: 235, col: [255, 232, 198], i: 1.05, bloom: false });

    // torches around the Hold / districts
    if (G.world.torches) for (const to of G.world.torches) {
      out.push({ x: to.x, y: to.y, r: 150, col: [255, 168, 78], i: 0.9 * flick, bloom: true });
    }
    // emissive glow-nodes scattered through the districts (biome-accent coloured)
    if (G.world.glows) for (const gl of G.world.glows) {
      out.push({ x: gl.x, y: gl.y, r: 78, col: hexRgb(gl.col), i: 0.45 + 0.2 * Math.sin(t * 2.5 + gl.ph), bloom: true });
    }
    // glowing destructible nodes (crystal/bloom) light up until they're mined out
    if (G.world.glowNodes) for (const gn of G.world.glowNodes) {
      if (!G.world.mineAt(gn.col, gn.row)) continue;
      out.push({ x: gn.x, y: gn.y, r: 72, col: hexRgb(gn.col_), i: 0.4 + 0.18 * Math.sin(t * 3 + gn.x * 0.01), bloom: true });
    }
    // glowing ground decor (bioluminescent flowers, crystal clusters)
    if (G.world.glowDecor) for (const gd of G.world.glowDecor) {
      out.push({ x: gd.x, y: gd.y, r: 52, col: gd.col, i: 0.34 + 0.16 * Math.sin(t * 2.6 + gd.ph), bloom: true });
    }
    // the Hold's stations glow in their own colour
    for (const s of G.world.structures) {
      const isBeacon = s.type === "beacon";
      out.push({ x: s.x, y: s.y, r: isBeacon ? 165 : 105, col: hexRgb(s.color), i: isBeacon ? (0.55 + 0.45 * pulse) : 0.7, bloom: isBeacon });
    }
    // unopened chests give off a faint glint
    for (const ch of G.world.chests) {
      if (G.world.opened[ch.id]) continue;
      out.push({ x: ch.x, y: ch.y, r: 58, col: [255, 200, 110], i: 0.4, bloom: false });
    }
    // dropped-haul cache
    if (G.deathCache) out.push({ x: G.deathCache.x, y: G.deathCache.y, r: 95, col: [255, 120, 120], i: 0.7 * pulse + 0.3, bloom: true });
    // deployed Modules (turret) cast a cool device glow
    if (G.deployables) for (const dp of G.deployables) out.push({ x: dp.x, y: dp.y, r: 96, col: [120, 170, 255], i: 0.6, bloom: true });
    // live combat: projectiles + muzzle/pulse flashes
    for (const pr of G.projectiles) out.push({ x: pr.x, y: pr.y, r: 64, col: [150, 240, 230], i: 0.7, bloom: true });
    for (const fx of G.effects) {
      const k = 1 - fx.t / fx.dur;
      if (fx.type === "muzzle") out.push({ x: fx.x, y: fx.y, r: 95, col: [205, 246, 236], i: 0.95 * k, bloom: true });
      else if (fx.type === "pulse") out.push({ x: fx.x, y: fx.y, r: (fx.radius || 120) * 1.25, col: [110, 168, 255], i: 0.6 * k, bloom: true });
      else if (fx.type === "burst") out.push({ x: fx.x, y: fx.y, r: (fx.spread || 28) * 2.2, col: fx.col && fx.col[0] === "#" ? hexRgb(fx.col) : [255, 220, 180], i: 0.7 * k, bloom: true });
    }
    return out;
  }

  // Called in SCREEN space, after the world + entities are drawn, before HUD overlays.
  L.frame = function (G, ctx, cam, vw, vh) {
    ensure(vw, vh);
    const lc = L.ctx, zoom = G.zoom;
    const lights = gather(G);

    const amb = ambient(G);
    lc.globalCompositeOperation = "source-over";
    lc.fillStyle = "rgb(" + amb[0] + "," + amb[1] + "," + amb[2] + ")";
    lc.fillRect(0, 0, vw, vh);

    lc.globalCompositeOperation = "lighter";
    for (const li of lights) {
      const sx = (li.x - cam.x) * zoom, sy = (li.y - cam.y) * zoom, R = li.r * zoom;
      if (sx + R < 0 || sy + R < 0 || sx - R > vw || sy - R > vh) continue;   // cull off-screen
      paint(lc, sx, sy, R, li.col, li.i);
    }

    // multiply the light map over the scene → darkness everywhere the lights don't reach
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(L.canvas, 0, 0);

    // additive bloom: brighten the cores of emissive sources so fire / tech glow
    ctx.globalCompositeOperation = "lighter";
    for (const li of lights) {
      if (!li.bloom) continue;
      const sx = (li.x - cam.x) * zoom, sy = (li.y - cam.y) * zoom, R = li.r * zoom * 0.42;
      if (sx + R < 0 || sy + R < 0 || sx - R > vw || sy - R > vh) continue;
      paint(ctx, sx, sy, R, li.col, li.i * 0.5);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  // soft contact shadow under an object, drawn in world space (caller offsets by cam)
  L.shadow = function (ctx, sx, sy, w) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, w);
    g.addColorStop(0, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(sx, sy, w, w * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  P.lighting = L;
})(window.PACT = window.PACT || {});
