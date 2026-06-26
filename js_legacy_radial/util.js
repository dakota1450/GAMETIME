/* ============================================================
   THE PACT — UTILITIES
   Seeded RNG (so a "cycle" deterministically regenerates the
   surface — spec §8.1 cycle turnover), math, inventory helpers.
   ============================================================ */
(function (P) {
  "use strict";
  const U = {};

  /* ---- Seeded PRNG (mulberry32). Same seed -> same world. ---- */
  U.makeRng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  U.rngInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
  U.rngPick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

  // Weighted pick from [[value, weight], ...]
  U.rngWeighted = function (rng, table) {
    let total = 0;
    for (const [, w] of table) total += w;
    let r = rng() * total;
    for (const [v, w] of table) { r -= w; if (r <= 0) return v; }
    return table[table.length - 1][0];
  };

  /* ---- Math ---- */
  U.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
  U.dist = (ax, ay, bx, by) => Math.sqrt(U.dist2(ax, ay, bx, by));
  U.len = (x, y) => Math.sqrt(x * x + y * y);
  U.norm = function (x, y) { const l = U.len(x, y) || 1; return [x / l, y / l]; };

  /* ---- Inventory helpers (inventory = {itemId: count}) ---- */
  U.invAdd = function (inv, itemId, n) { inv[itemId] = (inv[itemId] || 0) + (n || 1); };
  U.invCount = function (inv, itemId) { return inv[itemId] || 0; };
  U.invTotal = function (inv) { let t = 0; for (const k in inv) t += inv[k]; return t; };
  U.invEmpty = function (inv) { for (const k in inv) if (inv[k] > 0) return false; return true; };
  U.invHasAll = function (inv, cost) {
    for (const k in cost) if ((inv[k] || 0) < cost[k]) return false;
    return true;
  };
  U.invTake = function (inv, cost) {
    for (const k in cost) { inv[k] = (inv[k] || 0) - cost[k]; if (inv[k] <= 0) delete inv[k]; }
  };
  U.invMergeInto = function (dst, src) { // move all of src into dst, empties src
    for (const k in src) { if (src[k] > 0) U.invAdd(dst, k, src[k]); }
    for (const k in src) delete src[k];
  };
  U.invClone = function (inv) { const o = {}; for (const k in inv) if (inv[k] > 0) o[k] = inv[k]; return o; };

  /* ---- Smooth value noise (for organic biome borders that bleed) ---- */
  function hash2(ix, iy) {
    let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  U.hash2 = hash2; // deterministic [0,1) per integer cell — for per-tile variation
  U.noise = function (x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a * (1 - ux) * (1 - uy) + b * ux * (1 - uy) + c * (1 - ux) * uy + d * ux * uy;
  };
  // blend two "#rrggbb" colors by t in [0,1]
  U.mixHex = function (h1, h2, t) {
    const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = p(h1), [r2, g2, b2] = p(h2);
    const m = (a, b) => Math.round(a + (b - a) * t);
    const hx = (v) => v.toString(16).padStart(2, "0");
    return "#" + hx(m(r1, r2)) + hx(m(g1, g2)) + hx(m(b1, b2));
  };

  /* ---- Misc ---- */
  U.now = () => performance.now() / 1000;

  P.util = U;
})(window.PACT = window.PACT || {});
