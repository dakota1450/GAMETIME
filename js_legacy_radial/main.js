/* ============================================================
   THE PACT — MAIN (bootstrap)
   Wires input, the title screen, resize, and autosave, then starts
   the loop. Keyboard is bound to physical key CODES (KeyW, Space)
   so it works on any layout.
   ============================================================ */
(function (P) {
  "use strict";
  const G = P.game, ui = P.ui;

  function boot() {
    G.init();

    // ---- title screen ----
    const title = document.getElementById("titlescreen");
    const btnStart = document.getElementById("btn-start");
    const btnContinue = document.getElementById("btn-continue");
    if (P.save.has()) btnContinue.classList.remove("hidden");

    btnStart.addEventListener("click", () => { P.audio.init(); P.save.clear(); G.newGame(); });
    btnContinue.addEventListener("click", () => {
      P.audio.init();                           // resume AudioContext on the first gesture
      const snap = P.save.read();
      if (snap) G.loadGame(snap); else G.newGame();
    });

    wireInput();
    G.start();
  }

  function wireInput() {
    const canvas = G.canvas;

    window.addEventListener("keydown", (e) => {
      const c = e.code;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Tab"].includes(c)) e.preventDefault();
      if (c === "Space") { G.keys.Space = true; return; }
      if (c === "KeyF") { G.keys.KeyF = true; return; }   // hold to mine
      if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(c)) {
        G.keys[c] = true; return;
      }
      if (e.repeat) return;             // one-shot actions ignore key-repeat
      if (c === "KeyQ") G.action("pulse");
      else if (c === "KeyR") G.action("module");
      else if (c === "KeyH") G.action("med");
      else if (c === "KeyE") G.action("interact");
      else if (c === "KeyB" || c === "Tab") G.action("backpack");
      else if (c === "KeyK") G.action("skills");
      else if (/^Digit[1-5]$/.test(c)) G.action("eat", +c.slice(5));   // mess-kit: eat a cooked ration
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
      G.mouse.x = e.clientX - r.left;
      G.mouse.y = e.clientY - r.top;
      G.mouseActive = true;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (!G.started || ui.isOpen()) return;
      if (e.button === 0) G.mouseDown = true;        // left = fire
      else if (e.button === 2) G.mineDown = true;    // right = mine
    });
    window.addEventListener("mouseup", () => { G.mouseDown = false; G.mineDown = false; });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("blur", () => { G.keys = {}; G.mouseDown = false; G.mineDown = false; });
    window.addEventListener("resize", () => { G.resize(); if (G.started) G.updateCamera(); });
    window.addEventListener("beforeunload", () => { if (G.started) G.persist(); });

    // autosave
    setInterval(() => { if (G.started) G.persist(); }, 10000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window.PACT = window.PACT || {});
