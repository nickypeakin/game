// ---------------------------------------------------------------------------
// Procedural sound: everything is synthesized with WebAudio, no files needed.
// ---------------------------------------------------------------------------
const SFX = (() => {
  let ctx = null, master = null, nbuf = null;
  let wind = null, drone = null, hum = null, tv = null, ring = null;
  let beatT = 0;

  function init() {
    if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startLoops();
  }

  function bus(vol, pan) {
    const g = ctx.createGain();
    g.gain.value = vol;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); p.connect(master);
    } else g.connect(master);
    return g;
  }
  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  }
  function noise(dest, t, dur, o = {}) {
    const s = ctx.createBufferSource();
    s.buffer = nbuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || "lowpass";
    f.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    env(g, t, o.a || 0.005, o.gain || 1, dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.1);
  }
  function tone(dest, t, freq, dur, o = {}) {
    const osc = ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g, t, o.a || 0.005, o.gain || 0.5, dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.1);
  }
  const rnd = (a, b) => a + Math.random() * (b - a);

  const S = {
    knock(d, t) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.27 + rnd(0, 0.04);
        noise(d, tt, 0.12, { freq: 500, gain: 1.4 });
        tone(d, tt, 95, 0.16, { gain: 0.9, freqEnd: 60 });
      }
    },
    bang(d, t) {
      noise(d, t, 0.45, { freq: 700, freqEnd: 90, gain: 2.2 });
      tone(d, t, 70, 0.5, { gain: 1.4, freqEnd: 30 });
      noise(d, t, 0.07, { type: "highpass", freq: 1800, gain: 0.5 });
    },
    wood(d, t) {
      for (let i = 0; i < 5; i++) noise(d, t + i * rnd(0.02, 0.06), 0.06, { type: "bandpass", freq: rnd(1200, 3500), q: 2, gain: 1.2 });
      tone(d, t, 140, 0.25, { gain: 0.6, freqEnd: 60 });
    },
    glass(d, t) {
      noise(d, t, 0.7, { type: "highpass", freq: 3000, gain: 1.2 });
      for (let i = 0; i < 14; i++) tone(d, t + rnd(0, 0.5), rnd(2500, 7000), rnd(0.05, 0.25), { type: "triangle", gain: 0.25 });
      S.bang(d, t);
    },
    doorbreak(d, t) { S.bang(d, t); S.wood(d, t + 0.05); noise(d, t + 0.1, 0.6, { freq: 300, gain: 1.2 }); },
    hammer(d, t) {
      tone(d, t, 210, 0.07, { type: "square", gain: 0.25, freqEnd: 100 });
      noise(d, t, 0.05, { type: "highpass", freq: 1600, gain: 0.7 });
    },
    nail(d, t) { S.hammer(d, t); S.hammer(d, t + 0.12); tone(d, t + 0.12, 900, 0.15, { type: "triangle", gain: 0.12 }); },
    plank(d, t) { noise(d, t, 0.18, { freq: 700, gain: 0.7 }); tone(d, t, 130, 0.12, { gain: 0.4 }); },
    click(d, t) { noise(d, t, 0.03, { type: "highpass", freq: 2500, gain: 0.6 }); tone(d, t, 600, 0.03, { type: "square", gain: 0.1 }); },
    powerout(d, t) {
      noise(d, t, 0.08, { type: "highpass", freq: 2500, gain: 1 });
      tone(d, t, 120, 1.4, { type: "sawtooth", gain: 0.25, freqEnd: 25 });
      tone(d, t, 60, 1.4, { gain: 0.4, freqEnd: 20 });
    },
    powerup(d, t) {
      noise(d, t, 0.06, { type: "highpass", freq: 2500, gain: 0.8 });
      tone(d, t + 0.05, 35, 0.9, { type: "sawtooth", gain: 0.18, freqEnd: 120 });
    },
    doorbell(d, t) {
      tone(d, t, 659, 1.0, { type: "triangle", gain: 0.45 });
      tone(d, t + 0.5, 523, 1.4, { type: "triangle", gain: 0.45 });
    },
    whisper(d, t) {
      for (let i = 0; i < 7; i++) noise(d, t + i * 0.16 + rnd(0, 0.05), 0.14, { type: "bandpass", freq: rnd(1800, 4500), q: 4, gain: 1.2, a: 0.04 });
    },
    steps(d, t) {
      for (let i = 0; i < 6; i++) { tone(d, t + i * 0.55, 65, 0.18, { gain: 0.8 }); noise(d, t + i * 0.55, 0.1, { freq: 250, gain: 0.8 }); }
    },
    step(d, t) { noise(d, t, 0.06, { freq: rnd(300, 500), gain: 0.5 }); },
    scratch(d, t) {
      for (let i = 0; i < 4; i++) noise(d, t + i * 0.35, 0.3, { type: "bandpass", freq: 3200, freqEnd: 1400, q: 6, gain: 1, a: 0.05 });
    },
    tap(d, t) { for (let i = 0; i < 3; i++) tone(d, t + i * 0.22, 1900, 0.05, { type: "triangle", gain: 0.35 }); },
    stinger(d, t) {
      for (const f of [196, 207.7, 293.7, 311]) tone(d, t, f, 2.2, { type: "sawtooth", gain: 0.09, a: 0.05 });
      noise(d, t, 2.0, { type: "bandpass", freq: 600, freqEnd: 3000, q: 1, gain: 0.4, a: 0.3 });
    },
    scream(d, t) {
      for (const f of [520, 555, 790]) tone(d, t, f, 1.2, { type: "sawtooth", gain: 0.22, freqEnd: f * 1.8 });
      noise(d, t, 1.2, { type: "bandpass", freq: 2000, q: 0.8, gain: 1.4 });
      tone(d, t, 50, 1.0, { type: "square", gain: 0.4 });
    },
    hiss(d, t) { noise(d, t, 0.9, { type: "highpass", freq: 3500, gain: 0.9, a: 0.1 }); tone(d, t, 90, 0.6, { type: "sawtooth", gain: 0.15, freqEnd: 60 }); },
    buzz(d, t) { for (let i = 0; i < 2; i++) tone(d, t + i * 0.35, 160, 0.22, { type: "square", gain: 0.12 }); },
    chime(d, t) {
      for (const [f, o] of [[523, 0], [415, 0.6], [466, 1.2], [311, 1.8]]) {
        tone(d, t + o, f, 2.2, { gain: 0.25 });
        tone(d, t + o, f * 2.01, 1.2, { gain: 0.06 });
      }
    },
    dog(d, t) { for (let i = 0; i < 2; i++) { tone(d, t + i * 0.35, 420, 0.16, { type: "sawtooth", gain: 0.25, freqEnd: 230 }); noise(d, t + i * 0.35, 0.12, { type: "bandpass", freq: 900, gain: 0.4 }); } },
    breath(d, t) {
      noise(d, t, 1.3, { type: "bandpass", freq: 700, q: 1.5, gain: 0.9, a: 0.6 });
      noise(d, t + 1.6, 1.0, { type: "bandpass", freq: 500, q: 1.5, gain: 0.7, a: 0.2 });
    },
    beat(d, t) { tone(d, t, 55, 0.15, { gain: 1 }); tone(d, t + 0.18, 50, 0.18, { gain: 0.8 }); },
    flicker(d, t) { for (let i = 0; i < 6; i++) noise(d, t + i * rnd(0.05, 0.2), 0.04, { type: "highpass", freq: 3000, gain: 0.4 }); },
    win(d, t) {
      for (const [f, o] of [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.5]]) tone(d, t + o, f, 2.0, { type: "triangle", gain: 0.2 });
    },
    grab(d, t) { tone(d, t, 300, 0.08, { type: "triangle", gain: 0.2, freqEnd: 500 }); },
  };

  function play(name, vol = 1, pan = 0, delay = 0) {
    if (!ctx || !S[name] || vol < 0.01) return;
    S[name](bus(vol, pan), ctx.currentTime + 0.01 + delay);
  }

  function loopNoise(type, freq, q) {
    const s = ctx.createBufferSource();
    s.buffer = nbuf; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    s.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(master); } else g.connect(master);
    s.start();
    return { f, g, p };
  }

  function startLoops() {
    wind = loopNoise("lowpass", 350, 1);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg); lg.connect(wind.f.frequency); lfo.start();
    wind.g.gain.value = 0.12;

    drone = ctx.createGain(); drone.gain.value = 0; drone.connect(master);
    for (const f of [55, 58.3, 82.4]) {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      o.connect(drone); o.start();
    }
    hum = ctx.createGain(); hum.gain.value = 0; hum.connect(master);
    const ho = ctx.createOscillator(); ho.frequency.value = 60; ho.connect(hum); ho.start();

    tv = loopNoise("bandpass", 3000, 0.5);

    // telephone ring: 440+480Hz, amplitude-modulated at 20Hz
    const am = ctx.createGain(); am.gain.value = 0.5;
    const gate = ctx.createGain(); gate.gain.value = 0;
    const rp = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(am); o.start(); }
    const rl = ctx.createOscillator(); rl.type = "square"; rl.frequency.value = 20;
    const rlg = ctx.createGain(); rlg.gain.value = 0.5;
    rl.connect(rlg); rlg.connect(am.gain); rl.start();
    am.connect(gate);
    if (rp) { gate.connect(rp); rp.connect(master); } else gate.connect(master);
    ring = { g: gate, p: rp, phase: 0 };
  }

  function set(param, v) { param.setTargetAtTime(v, ctx.currentTime, 0.08); }

  // called every frame with the current "mood"
  function update(dt, m) {
    if (!ctx) return;
    set(drone.gain, m.playing ? 0.025 + m.dread * 0.05 : 0.015);
    set(hum.gain, m.playing && m.power ? 0.012 : 0);
    set(wind.g.gain, 0.08 + (m.dread || 0) * 0.06);
    set(tv.g.gain, m.tvVol || 0);
    if (tv.p) set(tv.p.pan, m.tvPan || 0);
    if (m.ringVol > 0) {
      ring.phase += dt;
      const on = (ring.phase % 3.2) < 1.4;
      set(ring.g.gain, on ? m.ringVol * 0.12 : 0);
      if (ring.p) set(ring.p.pan, m.ringPan || 0);
    } else { ring.phase = 0; set(ring.g.gain, 0); }
    if (m.heart > 0.05) {
      beatT -= dt;
      if (beatT <= 0) { play("beat", 0.3 + m.heart * 0.7); beatT = 1.1 - m.heart * 0.6; }
    }
  }

  return { init, play, update };
})();
