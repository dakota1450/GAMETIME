/* ============================================================
   THE PACT — SAVE / LOAD  (spec §10: persistence is load-bearing)
   Pure localStorage storage. game.js owns the snapshot SHAPE;
   this file just reads/writes JSON. Keeps the world tiny on disk
   because the surface is regenerated from (seed + cycle).
   ============================================================ */
(function (P) {
  "use strict";
  const KEY = "thepact_save_v1";
  const save = {};

  save.has = function () {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  };

  save.read = function () {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn("[save] read failed:", e);
      return null;
    }
  };

  save.write = function (obj) {
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      console.warn("[save] write failed:", e);
      return false;
    }
  };

  save.clear = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
  };

  P.save = save;
})(window.PACT = window.PACT || {});
