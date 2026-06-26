/* ============================================================
   THE PACT — AUDIO  (procedural SFX, no asset files)
   A tiny Web Audio synth. Every sound is generated from oscillators +
   noise + envelopes at call time, so the game ships zero audio files
   (matches the "procedural fallback / no dependencies" ethos). The
   AudioContext starts suspended (browser autoplay policy) and is
   resumed on the first user gesture (the title-screen button click).
   Toggle with M. Hook P.audio.play("name") into game events.
   ============================================================ */
(function (P) {
  "use strict";
  const A = { ctx: null, master: null, muted: false, enabled: true, _last: {} };

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === "suspended") A.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { A.enabled = false; return; }
      A.ctx = new AC();
      A.master = A.ctx.createGain();
      A.master.gain.value = 0.45;
      A.master.connect(A.ctx.destination);
      if (A.ctx.state === "suspended") A.ctx.resume();
    } catch (e) { A.enabled = false; }
  };

  function env(g, t0, dur, vol) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  // a single enveloped oscillator, optionally pitch-sliding to `slideTo`
  A.tone = function (freq, dur, type, vol, slideTo, delay) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime + (delay || 0);
    const o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    env(g, t0, dur, vol == null ? 0.25 : vol);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  };
  // a burst of filtered noise (impacts, whooshes, static)
  A.noise = function (dur, vol, filtFreq, delay) {
    if (!A.ctx || A.muted) return;
    const t0 = A.ctx.currentTime + (delay || 0);
    const len = Math.max(1, Math.floor(A.ctx.sampleRate * dur));
    const buf = A.ctx.createBuffer(1, len, A.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const n = A.ctx.createBufferSource(); n.buffer = buf;
    const g = A.ctx.createGain(); env(g, t0, dur, vol == null ? 0.18 : vol);
    if (filtFreq) {
      const f = A.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = filtFreq; f.Q.value = 0.8;
      n.connect(f); f.connect(g);
    } else n.connect(g);
    g.connect(A.master);
    n.start(t0); n.stop(t0 + dur + 0.03);
  };
  function arp(freqs, step, dur, type, vol) { freqs.forEach((f, i) => A.tone(f, dur, type, vol, null, i * step)); }

  // named one-shots — the game's whole sound palette
  const SFX = {
    shoot:    () => { A.tone(900, 0.07, "square", 0.10, 300); A.noise(0.04, 0.05, 2200); },
    pulse:    () => { A.tone(150, 0.42, "sawtooth", 0.22, 55); A.noise(0.32, 0.10, 520); },
    mine:     () => { A.noise(0.08, 0.16, 850); A.tone(170, 0.06, "square", 0.08, 90); },
    nodeBreak:() => { A.noise(0.16, 0.18, 600); A.tone(120, 0.14, "square", 0.1, 70); },
    hit:      () => { A.noise(0.05, 0.08, 1700); },
    pickup:   () => { A.tone(720, 0.05, "triangle", 0.09, 1040); },
    heal:     () => { arp([523, 784], 0.07, 0.12, "triangle", 0.16); },
    bank:     () => { arp([523, 784, 1047], 0.07, 0.13, "triangle", 0.17); },
    craft:    () => { A.tone(300, 0.09, "square", 0.15, 460); A.tone(620, 0.12, "square", 0.13, null, 0.09); },
    deploy:   () => { A.tone(220, 0.16, "sawtooth", 0.18, 540); A.noise(0.1, 0.08, 1200); },
    lien:     () => { arp([523, 659, 880], 0.08, 0.16, "triangle", 0.18); },
    death:    () => { A.tone(330, 0.6, "sawtooth", 0.26, 65); A.noise(0.5, 0.14, 380); },
    sweep:    () => { A.tone(110, 0.55, "sawtooth", 0.22, 220); A.noise(0.45, 0.11, 480); },
    titanFell:() => { A.tone(180, 0.5, "sawtooth", 0.28, 520); A.tone(440, 0.4, "square", 0.2, null, 0.14); A.noise(0.3, 0.12, 900, 0.14); },
    spin:     () => { for (let i = 0; i < 5; i++) A.tone(420 + i * 70, 0.05, "square", 0.09, null, i * 0.06); },
    win:      () => { arp([523, 659, 784, 1047], 0.075, 0.13, "triangle", 0.2); },
    jackpot:  () => { arp([523, 659, 784, 1047, 1319, 1568], 0.07, 0.16, "triangle", 0.22); },
    lose:     () => { A.tone(320, 0.32, "sawtooth", 0.2, 120); },
    ui:       () => { A.tone(460, 0.04, "square", 0.07); },
    banner:   () => { A.tone(330, 0.18, "sawtooth", 0.16, 247); },
  };

  // play a named SFX; `throttle` ms dedupes spammy callers (shots, pickups)
  A.play = function (name, throttle) {
    if (!A.enabled || A.muted) return;
    A.init();
    if (!A.ctx) return;
    if (throttle) {
      const now = A.ctx.currentTime * 1000;
      if (A._last[name] && now - A._last[name] < throttle) return;
      A._last[name] = now;
    }
    const fn = SFX[name];
    if (fn) try { fn(); } catch (e) { /* never let audio break the game */ }
  };
  A.toggleMute = function () {
    A.muted = !A.muted;
    if (!A.muted) A.init();
    return A.muted;
  };

  P.audio = A;
})(window.PACT = window.PACT || {});
