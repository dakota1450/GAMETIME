/* ============================================================
   THE PACT — MAIN (bootstrap)
   Wires input (physical key codes), the title screen, resize, and
   autosave, then starts the loop.
   ============================================================ */
(function (P) {
  "use strict";
  const G = P.game, ui = P.ui;

  function boot() {
    G.init();
    const title = document.getElementById("titlescreen");
    const btnStart = document.getElementById("btn-start");
    const btnContinue = document.getElementById("btn-continue");
    if (P.save.has()) btnContinue.classList.remove("hidden");

    btnStart.addEventListener("click", () => { P.audio.init(); P.save.clear(); G.newGame(); });
    btnContinue.addEventListener("click", () => {
      P.audio.init();
      const snap = P.save.read();
      if (snap && snap.v === 3) G.loadGame(snap); else G.newGame();
    });

    wireInput();
    G.start();
  }

  function wireInput() {
    const canvas = G.canvas;

    window.addEventListener("keydown", (e) => {
      const c = e.code;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(c)) e.preventDefault();
      if (c === "Space") { G.keys.Space = true; return; }
      if (c === "KeyF") { G.keys.KeyF = true; return; }
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(c)) { G.keys[c] = true; return; }
      if (e.repeat) return;
      if (/^Digit[0-9]$/.test(c)) { const d = +c.slice(5); G.action("selectSlot", (d + 9) % 10); }   // 1->0 .. 0->9
      else if (c === "KeyE") G.action("interact");
      else if (c === "KeyI" || c === "Tab") G.action("inventory");
      else if (c === "KeyH") G.action("heal");
      else if (c === "KeyM") { const m = P.audio.toggleMute(); G.toast(m ? "Sound off" : "Sound on", "info"); }
      else if (c === "Escape") G.action("cancel");
    });
    window.addEventListener("keyup", (e) => {
      const c = e.code;
      if (c === "Space") { G.keys.Space = false; return; }
      G.keys[c] = false;
    });

    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      G.mouse.x = e.clientX - r.left; G.mouse.y = e.clientY - r.top; G.mouseActive = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (!G.started || ui.isOpen()) return;
      if (e.button === 0) G.mouseDown = true;      // left = use selected
      else if (e.button === 2) G.mineDown = true;  // right = quick-mine
    });
    window.addEventListener("mouseup", () => { G.mouseDown = false; G.mineDown = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => { if (!G.started || ui.isOpen()) return; e.preventDefault(); G.action("scrollSel", e.deltaY > 0 ? 1 : -1); }, { passive: false });

    window.addEventListener("blur", () => { G.keys = {}; G.mouseDown = false; G.mineDown = false; });
    window.addEventListener("resize", () => { G.resize(); if (G.started) G.updateCamera(); });
    window.addEventListener("beforeunload", () => { if (G.started) G.persist(); });
    setInterval(() => { if (G.started) G.persist(); }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.PACT = window.PACT || {});
