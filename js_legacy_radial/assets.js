/* ============================================================
   THE PACT — ASSETS
   Loads generated sprite PNGs from /assets and exposes them to the
   renderer. Every draw falls back to the procedural shape if its
   sprite isn't present yet, so the game always runs — dropping a
   PNG into /assets/ just upgrades the look.
   ============================================================ */
(function (P) {
  "use strict";
  const A = { images: {}, ready: {} };

  // key -> file. Add rows here as assets are generated.
  A.manifest = {
    player:                "assets/player.png",
    enemy_repo_drone:      "assets/enemy_repo_drone.png",
    enemy_repo_unit:       "assets/enemy_repo_unit.png",
    enemy_repo_enforcer:   "assets/enemy_repo_enforcer.png",
    enemy_scrap_hound:     "assets/enemy_scrap_hound.png",
    enemy_spore_pod:       "assets/enemy_spore_pod.png",
    enemy_static_hybrid:   "assets/enemy_static_hybrid.png",
    enemy_sec_construct:   "assets/enemy_sec_construct.png",
    chest:                 "assets/chest.png",
    floor_hold:            "assets/floor_hold.png",
    floor_undercity:       "assets/floor_undercity.png",
    floor_north:           "assets/floor_north.png",
    floor_east:            "assets/floor_east.png",
    floor_south:           "assets/floor_south.png",
    floor_west:            "assets/floor_west.png",
    decor_grass:           "assets/decor_grass.png",
    decor_mushroom:        "assets/decor_mushroom.png",
    decor_pebbles:         "assets/decor_pebbles.png",
    decor_crystal:         "assets/decor_crystal.png",
    decor_scrap:           "assets/decor_scrap.png",
    decor_bones:           "assets/decor_bones.png",
    decor_shrub:           "assets/decor_shrub.png",
    decor_flower:          "assets/decor_flower.png",
    decor_boulder:         "assets/decor_boulder.png",
    decor_pillar:          "assets/decor_pillar.png",
  };

  A.load = function () {
    for (const key in A.manifest) {
      const img = new Image();
      img.onload = () => { A.ready[key] = true; };
      img.onerror = () => { A.ready[key] = false; };
      img.src = A.manifest[key];
      A.images[key] = img;
    }
  };

  A.has = function (key) { return !!A.ready[key]; };
  // raw loaded Image for a key, or null if not ready yet (caller draws fallback)
  A.img = function (key) { return A.ready[key] ? A.images[key] : null; };

  // draw a sprite centered at (x,y), sized `size`, optionally rotated (radians).
  // returns false if the sprite isn't loaded (caller draws its fallback).
  A.draw = function (ctx, key, x, y, size, rot, flip) {
    if (!A.ready[key]) return false;
    const img = A.images[key];
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
    return true;
  };

  // draw a tile/background image at top-left (x,y) sized w×h
  A.tile = function (ctx, key, x, y, w, h) {
    if (!A.ready[key]) return false;
    ctx.drawImage(A.images[key], x, y, w, h);
    return true;
  };

  A.load();
  P.assets = A;
})(window.PACT = window.PACT || {});
