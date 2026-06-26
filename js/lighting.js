/* ============================================================
   THE PACT — LIGHTING  (Core Keeper-style dynamic 2D lighting)
   The dug-out dark is lit by point lights: the player's lantern,
   placed torches, glowing ore veins, station glows, projectiles.
   Built as a screen-space light map (ambient darkness + additive
   lights) multiplied over the scene, then a bloom pass on the cores.
   ============================================================ */
(function (P) {
  "use strict";
  const U = P.util;
  const L = { canvas: null, ctx: null, lights: [] };

  function ensure(vw, vh) {
    if (!L.canvas) { L.canvas = document.createElement("canvas"); L.ctx = L.canvas.getContext("2d"); }
    if (L.canvas.width !== vw || L.canvas.height !== vh) { L.canvas.width = vw; L.canvas.height = vh; }
  }
  function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }

  function paint(c, sx, sy, R, col, inten) {
    if (R <= 0 || inten <= 0) return;
    const g = c.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + inten + ")");
    g.addColorStop(0.5, "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + (inten * 0.34).toFixed(3) + ")");
    g.addColorStop(1, "rgba(" + col[0] + "," + col[1] + "," + col[2] + ",0)");
    c.fillStyle = g; c.fillRect(sx - R, sy - R, R * 2, R * 2);
  }

  // base darkness where the player stands — Hold is cozy; districts darken with depth + take the biome hue
  function ambient(G) {
    const p = G.player;
    if (G.world.isSafeAtPx(p.x, p.y)) return [86, 76, 62];
    const d = G.world.depthAtPx(p.x, p.y);
    const t = U.clamp(d / 4, 0, 1);
    const biome = G.world.biomeAtPx(p.x, p.y);
    const mood = biome && biome.mood ? hexRgb(biome.mood) : [40, 42, 50];
    const bright = 1.15 - t * 0.78;
    return [Math.round(mood[0] * bright), Math.round(mood[1] * bright), Math.round(mood[2] * bright)];
  }

  function gather(G) {
    const t = U.now();
    const flick = 0.85 + 0.15 * Math.sin(t * 11 + Math.cos(t * 7) * 2);
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
    const out = L.lights; out.length = 0;
    const p = G.player, w = G.world;

    out.push({ x: p.x, y: p.y, r: 250, col: [255, 234, 200], i: 1.05, bloom: false });   // lantern

    if (w.torchList) for (const to of w.torchList) out.push({ x: to.x, y: to.y, r: 150, col: [255, 168, 78], i: 0.9 * flick, bloom: true });
    if (w.oreGlows) for (const gl of w.oreGlows) out.push({ x: gl.x, y: gl.y, r: 64, col: gl.col, i: 0.4 + 0.18 * Math.sin(t * 2.5 + gl.x * 0.01), bloom: true });
    if (w.glowDecor) for (const gd of w.glowDecor) out.push({ x: gd.x, y: gd.y, r: 50, col: gd.col, i: 0.34 + 0.16 * Math.sin(t * 2.6 + gd.ph), bloom: true });
    if (w.stations) for (const s of w.stations) {
      const col = hexRgb(s.color);
      const i = s.type === "furnace" || s.type === "forge" ? (0.6 + 0.3 * pulse) : 0.5;
      out.push({ x: s.x, y: s.y, r: 110, col, i, bloom: s.type === "furnace" || s.type === "forge" });
    }
    for (const pr of G.projectiles) out.push({ x: pr.x, y: pr.y, r: 60, col: hexRgb(pr.color), i: 0.65, bloom: true });
    for (const fx of G.effects) {
      const k = 1 - fx.t / fx.dur;
      if (fx.type === "muzzle") out.push({ x: fx.x, y: fx.y, r: 90, col: [205, 246, 236], i: 0.9 * k, bloom: true });
      else if (fx.type === "burst") out.push({ x: fx.x, y: fx.y, r: (fx.spread || 24) * 2.2, col: fx.col && fx.col[0] === "#" ? hexRgb(fx.col) : [255, 220, 180], i: 0.7 * k, bloom: true });
      else if (fx.type === "spark") out.push({ x: fx.x, y: fx.y, r: 40, col: fx.col && fx.col[0] === "#" ? hexRgb(fx.col) : [255, 220, 180], i: 0.6 * k, bloom: true });
    }
    return out;
  }

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
      if (sx + R < 0 || sy + R < 0 || sx - R > vw || sy - R > vh) continue;
      paint(lc, sx, sy, R, li.col, li.i);
    }

    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(L.canvas, 0, 0);

    ctx.globalCompositeOperation = "lighter";
    for (const li of lights) {
      if (!li.bloom) continue;
      const sx = (li.x - cam.x) * zoom, sy = (li.y - cam.y) * zoom, R = li.r * zoom * 0.42;
      if (sx + R < 0 || sy + R < 0 || sx - R > vw || sy - R > vh) continue;
      paint(ctx, sx, sy, R, li.col, li.i * 0.5);
    }
    ctx.globalCompositeOperation = "source-over";
  };

  L.shadow = function (ctx, sx, sy, w) {
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, w);
    g.addColorStop(0, "rgba(0,0,0,0.42)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(sx, sy, w, w * 0.5, 0, 0, 6.28); ctx.fill(); ctx.restore();
  };

  P.lighting = L;
})(window.PACT = window.PACT || {});
