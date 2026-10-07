// ---------------------------------------------------------------------------
// Shared rules + the host-side simulation (the host's browser runs the
// "real" game and sends snapshots to everyone else).
// ---------------------------------------------------------------------------
const HOUR_LEN = 70;               // real seconds per in-game hour
const NIGHT_LEN = HOUR_LEN * 6;    // 12 AM -> 6 AM
const PR = 0.3;                    // player radius (tiles)
const WALK = 3.0, SPRINT = 4.7;
const FL_RANGE = 9, FL_HALF = 0.42;
const MAX_BOARDS = 3, MAX_CARRY = 2;
const COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#f06292", "#ba68c8", "#fff176"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function playerSolid(tx, ty) { return tileAt(tx, ty) !== "."; }

function collides(x, y, r, solid) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!solid(tx, ty)) continue;
    const cx = clamp(x, tx, tx + 1), cy = clamp(y, ty, ty + 1);
    if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
  }
  return false;
}

function moveCircle(o, dx, dy, r, solid) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.15));
  for (let i = 0; i < steps; i++) {
    const nx = o.x + dx / steps;
    if (!collides(nx, o.y, r, solid)) o.x = nx;
    const ny = o.y + dy / steps;
    if (!collides(o.x, ny, r, solid)) o.y = ny;
  }
}

// Does this tile block sight? Boarded-up windows (2+ boards) block it too.
function opaqueAt(S, tx, ty) {
  const c = tileAt(tx, ty);
  if (c === "W") return S.entries[ENTRY_AT[tx + "," + ty]].boards >= 2;
  if (c === "D" || c === "B") return !S.entries[ENTRY_AT[tx + "," + ty]].broken;
  return c === "#" || c === "F" || c === "C" || c === "r";
}

function los(S, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.ceil(d / 0.1);
  let lx = Math.floor(x0), ly = Math.floor(y0);
  for (let i = 1; i < n; i++) {
    const tx = Math.floor(x0 + (x1 - x0) * i / n), ty = Math.floor(y0 + (y1 - y0) * i / n);
    if (tx === lx && ty === ly) continue;
    lx = tx; ly = ty;
    if (tx === Math.floor(x1) && ty === Math.floor(y1)) continue;
    if (opaqueAt(S, tx, ty)) return false;
  }
  return true;
}

function flashOn(p) { return p.fl && p.bat > 0 && !p.down && !p.hidden; }

function flashHits(S, p, x, y) {
  if (!flashOn(p)) return false;
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d > FL_RANGE) return false;
  if (Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > FL_HALF + 0.35 / Math.max(d, 0.5)) return false;
  return los(S, p.x, p.y, x, y);
}

function bfs(sx, sy, gx, gy, pass) {
  if (sx === gx && sy === gy) return [];
  const N = MAP_W * MAP_H, prev = new Int32Array(N).fill(-1);
  const start = sy * MAP_W + sx, goal = gy * MAP_W + gx;
  const q = [start]; prev[start] = start;
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    if (cur === goal) break;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (prev[ni] !== -1) continue;
      if (ni !== goal && !pass(nx, ny)) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (prev[goal] === -1) return null;
  const path = [];
  for (let c = goal; c !== start; c = prev[c]) path.push({ x: (c % MAP_W) + 0.5, y: ((c / MAP_W) | 0) + 0.5 });
  return path.reverse();
}

function clockText(time) {
  const mins = Math.min(360, Math.floor(time / NIGHT_LEN * 360));
  const h = Math.floor(mins / 60), m = mins % 60;
  return (h === 0 ? 12 : h) + ":" + String(m).padStart(2, "0") + " AM";
}

// What can player p interact with right now? Used by host (to do it) and
// by every client (to show the prompt).
function findTarget(S, p) {
  let best = null, bestScore = 1e9;
  const consider = (t, d) => {
    const da = Math.abs(angDiff(Math.atan2(t.ty - p.y, t.tx - p.x), p.a));
    const score = d + da * 0.35 + (t.can ? 0 : 0.3);
    if (score < bestScore) { bestScore = score; best = t; }
  };
  for (const q of Object.values(S.players)) {
    if (q.id === p.id || !q.down) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < 1.4) consider({ key: "rv:" + q.id, kind: "revive", ref: q.id, label: "Help " + q.name + " up", dur: 2.5, can: true, tx: q.x, ty: q.y }, d - 0.4);
  }
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let ty = cy - 2; ty <= cy + 2; ty++) for (let tx = cx - 2; tx <= cx + 2; tx++) {
    const c = tileAt(tx, ty);
    if ("WDBPFACbhv".indexOf(c) < 0) continue;
    const nx = clamp(p.x, tx, tx + 1), ny = clamp(p.y, ty, ty + 1);
    const d = Math.hypot(p.x - nx, p.y - ny);
    if (d > 0.85) continue;
    const t = tileAction(S, p, c, tx, ty);
    if (t) { t.tx = tx + 0.5; t.ty = ty + 0.5; consider(t, d); }
  }
  return best;
}

function tileAction(S, p, c, tx, ty) {
  const k = tx + "," + ty;
  switch (c) {
    case "W": case "D": case "B": {
      const i = ENTRY_AT[k], e = S.entries[i], E = ENTRIES[i];
      const nm = E.name + (e.broken ? " (BROKEN)" : "");
      if (e.boards >= MAX_BOARDS) return { key: "e" + i, label: nm + " — fully boarded", can: false };
      if (p.planks <= 0) return { key: "e" + i, label: nm + " — you need a plank", can: false };
      return { key: "e" + i, kind: "board", ref: i, label: (e.broken ? "Repair " : "Board up ") + E.name + " (" + e.boards + "/" + MAX_BOARDS + ")", dur: 1.6, can: true };
    }
    case "P": {
      const i = PILE_AT[k], n = S.piles[i];
      if (n <= 0) return { key: "p" + i, label: "Plank pile — empty", can: false };
      if (p.planks >= MAX_CARRY) return { key: "p" + i, label: "Hands full (" + MAX_CARRY + " planks)", can: false };
      return { key: "p" + i, kind: "take", ref: i, label: "Grab a plank (" + n + " left)", dur: 0.45, can: true };
    }
    case "F":
      if (S.power) return { key: "f", label: "Fuse box — power is on", can: false };
      return { key: "f", kind: "fuse", label: "Flip the breakers (restore power)", dur: 2.5, can: true };
    case "A":
      if (S.batteries <= 0) return { key: "a", label: "Junk drawer — no batteries left", can: false };
      if (p.bat >= 90) return { key: "a", label: "Batteries (" + S.batteries + ") — flashlight is full", can: false };
      return { key: "a", kind: "battery", label: "Grab batteries (" + S.batteries + " left)", dur: 0.8, can: true };
    case "C": return { key: "h" + k, kind: "hide", ref: k, label: "Hide in the closet", dur: 0.35, can: true };
    case "b": return { key: "h" + k, kind: "hide", ref: k, label: "Hide under the bed", dur: 0.35, can: true };
    case "h": return S.phone > 0 ? { key: "ph", kind: "phone", label: "Answer the phone", dur: 0.3, can: true } : null;
    case "v": return S.tv ? { key: "tv", kind: "tv", label: "Turn off the TV", dur: 0.3, can: true } : null;
  }
  return null;
}

// ======================= HOST SIMULATION ===================================
let emit = () => {};
function setEmitter(f) { emit = f; }

function newGame(lobby) {
  const S = {
    phase: "play", time: 0, hour: 0, power: true, flick: 0, tv: false, phone: 0,
    piles: PILES.map(() => 25), batteries: 6,
    entries: ENTRIES.map((E) => ({ boards: 0, bhp: 100, lock: E.kind === "door" ? 100 : 55, broken: false, hit: 0 })),
    players: {},
    stalker: { x: 1.5, y: 1.5, a: 0, mode: "out", state: "wander", timer: 16, path: [], next: null, target: -1, last: -1, bangT: 0, stun: false, expose: 0, repath: 0, lastSeen: null },
    nextEvent: 5, nextTarget: -1, powerCD: 40, n: lobby.length, firstEvent: true,
  };
  lobby.forEach((L, i) => {
    S.players[L.id] = {
      id: L.id, name: L.name, color: L.color, x: 8.5 + i * 2.5, y: 12.5, a: 0, fl: true, bat: 100, planks: 0,
      down: false, hidden: false, hideX: 0, hideY: 0, snap: 0, act: null, needRel: false, seenHide: false, hamT: 0,
    };
  });
  return S;
}

// What clients receive (same shape as S, minus host-only bookkeeping)
function publicState(S) {
  const players = {};
  for (const p of Object.values(S.players)) {
    players[p.id] = {
      id: p.id, name: p.name, color: p.color, x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: +p.a.toFixed(2),
      fl: p.fl, bat: Math.round(p.bat), planks: p.planks, down: p.down, hidden: p.hidden, hideX: p.hideX, hideY: p.hideY,
      snap: p.snap, act: p.act ? { label: p.act.label, t: p.act.t, dur: p.act.dur } : null,
    };
  }
  const st = S.stalker;
  return {
    phase: S.phase, time: S.time, hour: S.hour, power: S.power, flick: S.flick, tv: S.tv, phone: S.phone,
    piles: S.piles, batteries: S.batteries,
    entries: S.entries.map((e) => ({ boards: e.boards, bhp: Math.round(e.bhp), lock: Math.round(e.lock), broken: e.broken, hit: e.hit })),
    players,
    stalker: { x: +st.x.toFixed(2), y: +st.y.toFixed(2), a: +st.a.toFixed(2), mode: st.mode, state: st.state, stun: st.stun, target: st.target },
  };
}

function simStep(S, inputs, dt) {
  if (S.phase !== "play") return;
  S.time += dt;
  const h = Math.min(5, Math.floor(S.time / HOUR_LEN));
  if (h > S.hour) { S.hour = h; emit({ k: "hour", h }); }
  if (S.time >= NIGHT_LEN) { S.phase = "win"; emit({ k: "win" }); return; }
  S.flick = Math.max(0, S.flick - dt);
  if (S.power) S.powerCD -= dt;
  if (S.phone > 0) S.phone = Math.max(0, S.phone - dt);
  for (const e of S.entries) e.hit = Math.max(0, e.hit - dt * 2);
  updatePlayers(S, inputs, dt);
  updateStalker(S, dt);
  updateEvents(S, dt);
  const ps = Object.values(S.players);
  if (ps.length && ps.every((p) => p.down)) { S.phase = "lose"; emit({ k: "lose" }); }
}

function updatePlayers(S, inputs, dt) {
  for (const p of Object.values(S.players)) {
    const inp = inputs[p.id];
    if (inp) {
      if (!p.down && !p.hidden && typeof inp.x === "number") {
        const d = Math.hypot(inp.x - p.x, inp.y - p.y);
        if (d < 2.5 && !collides(inp.x, inp.y, PR - 0.05, playerSolid)) { p.x = inp.x; p.y = inp.y; }
        else if (d > 0.001) p.snap++;
      }
      if (typeof inp.a === "number") p.a = inp.a;
      p.fl = !!inp.fl;
    }
    if (flashOn(p)) p.bat = Math.max(0, p.bat - dt * 0.55);
    const held = inp && inp.e;
    if (!held || p.down) { p.act = null; p.needRel = false; continue; }
    if (p.needRel) continue;
    if (p.hidden) {
      p.hidden = false; p.seenHide = false; p.needRel = true;
      emit({ k: "click", x: p.hideX, y: p.hideY });
      continue;
    }
    const t = findTarget(S, p);
    if (!t || !t.can) { p.act = null; continue; }
    if (!p.act || p.act.key !== t.key) p.act = { key: t.key, label: t.label, t: 0, dur: t.dur };
    p.act.t += dt;
    if (t.kind === "board") {
      p.hamT -= dt;
      if (p.hamT <= 0) { p.hamT = 0.38; emit({ k: "hammer", x: t.tx, y: t.ty }); }
    }
    if (p.act.t >= p.act.dur) { completeAction(S, p, t); p.act = null; p.needRel = true; }
  }
}

function completeAction(S, p, t) {
  const st = S.stalker;
  switch (t.kind) {
    case "board": {
      if (p.planks <= 0) return;
      const e = S.entries[t.ref];
      p.planks--;
      if (e.broken) { e.broken = false; e.lock = 40; }
      e.boards = Math.min(MAX_BOARDS, e.boards + 1);
      e.bhp = 100;
      emit({ k: "nail", x: t.tx, y: t.ty });
      break;
    }
    case "take":
      if (S.piles[t.ref] <= 0) return;
      S.piles[t.ref]--; p.planks++;
      emit({ k: "plank", x: t.tx, y: t.ty });
      break;
    case "fuse":
      S.power = true; S.powerCD = Math.max(25, 55 - S.hour * 5);
      emit({ k: "powerup" });
      emit({ k: "msg", text: p.name + " got the power back on.", c: "#ffe082" });
      break;
    case "battery":
      if (S.batteries <= 0) return;
      S.batteries--; p.bat = Math.min(100, p.bat + 60);
      emit({ k: "grab", x: t.tx, y: t.ty });
      break;
    case "hide":
      p.hidden = true; p.act = null;
      p.hideX = t.tx; p.hideY = t.ty;
      p.seenHide = st.mode === "in" && Math.hypot(st.x - p.x, st.y - p.y) < 7 && los(S, st.x, st.y, p.x, p.y);
      emit({ k: "click", x: t.tx, y: t.ty });
      break;
    case "phone": {
      S.phone = 0;
      const i = weightedEntry(S);
      S.nextTarget = i;
      const lines = [
        "...(heavy breathing)... the " + ENTRIES[i].name.toLowerCase() + ". that's where I'm coming in next.",
        "I like your " + ENTRIES[i].name.toLowerCase() + ". see you there soon.",
        "you can't board up everything. the " + ENTRIES[i].name.toLowerCase() + " is mine.",
      ];
      emit({ k: "call", to: p.id, text: pick(lines) });
      emit({ k: "msg", text: p.name + " answered the phone...", c: "#b0bec5" });
      break;
    }
    case "tv":
      S.tv = false;
      emit({ k: "click", x: t.tx, y: t.ty });
      break;
    case "revive": {
      const q = S.players[t.ref];
      if (q && q.down) {
        q.down = false; q.snap++;
        emit({ k: "msg", text: p.name + " helped " + q.name + " back up!", c: "#a5d6a7" });
      }
      break;
    }
  }
}

// ----------------------------- the stalker ---------------------------------
const passOut = (tx, ty) => tileAt(tx, ty) === ",";
const passIn = (allowEntry) => (tx, ty) => tileAt(tx, ty) === "." || (allowEntry != null && ENTRY_AT[tx + "," + ty] === allowEntry);
const stalkerSolidIn = (tx, ty) => tileAt(tx, ty) !== ".";

function goTo(st, gx, gy, pass) {
  const p = bfs(Math.floor(st.x), Math.floor(st.y), Math.floor(gx), Math.floor(gy), pass);
  if (p === null) { st.path = []; return false; }
  if (p.length) p[p.length - 1] = { x: gx, y: gy }; else p.push({ x: gx, y: gy });
  st.path = p;
  return true;
}

function followPath(st, spd, dt) {
  let move = spd * dt;
  while (move > 0 && st.path.length) {
    const n = st.path[0];
    const dx = n.x - st.x, dy = n.y - st.y, d = Math.hypot(dx, dy);
    if (d > 0.001) st.a = Math.atan2(dy, dx);
    if (d <= move) { st.x = n.x; st.y = n.y; st.path.shift(); move -= d; }
    else { st.x += dx / d * move; st.y += dy / d * move; move = 0; }
  }
  return st.path.length === 0;
}

function litByAny(S, x, y) {
  for (const p of Object.values(S.players)) if (flashHits(S, p, x, y)) return true;
  return false;
}

function weightedEntry(S) {
  const st = S.stalker;
  const tvWin = ENTRY_AT["18,21"];
  const w = S.entries.map((e, i) => {
    let v = e.broken ? 3 : 1 / (1 + e.boards * 1.6);
    if (i === st.last) v *= 0.3;
    if (S.tv && i === tvWin) v *= 3;
    return v;
  });
  let sum = w.reduce((a, b) => a + b, 0), r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

function wanderDelay(S) { return Math.max(2, 8 - S.hour * 1.1 - (S.n - 1) * 0.6) + rand(0, 3); }

function wanderOutside(S) {
  const st = S.stalker;
  for (let tries = 0; tries < 20; tries++) {
    const tx = Math.floor(rand(0, MAP_W)), ty = Math.floor(rand(0, MAP_H));
    if (tileAt(tx, ty) === "," && Math.hypot(tx - st.x, ty - st.y) < 14) { goTo(st, tx + 0.5, ty + 0.5, passOut); return; }
  }
}

function stalkerDecide(S) {
  const st = S.stalker, r = Math.random();
  if (S.power && S.powerCD <= 0 && S.time > HOUR_LEN * 0.6 && r < 0.3) {
    st.next = "cut";
    goTo(st, BREAKER.x + 1.5, BREAKER.y + 0.5, passOut);
  } else if (r < 0.42 && S.nextTarget < 0 && ENTRIES.some((E, i) => E.kind === "window" && !S.entries[i].broken)) {
    const ws = ENTRIES.map((E, i) => i).filter((i) => ENTRIES[i].kind === "window" && !S.entries[i].broken);
    st.target = pick(ws); st.next = "peek";
    goTo(st, ENTRIES[st.target].ox, ENTRIES[st.target].oy, passOut);
  } else {
    let i = S.nextTarget; S.nextTarget = -1;
    if (i < 0) i = weightedEntry(S);
    st.target = i; st.next = "attack";
    goTo(st, ENTRIES[i].ox, ENTRIES[i].oy, passOut);
  }
  st.state = "goto";
}

function doBang(S, i) {
  const st = S.stalker, E = ENTRIES[i], e = S.entries[i], h = S.hour;
  if (e.broken) { enterInside(S, i); return; }
  const dmg = (10 + h * 3) * (S.power ? 1 : 1.35) * (0.75 + 0.12 * S.n) * rand(0.8, 1.2);
  e.hit = 1;
  emit({ k: "bang", x: E.x + 0.5, y: E.y + 0.5 });
  if (e.boards > 0) {
    e.bhp -= dmg;
    if (e.bhp <= 0) {
      e.boards--; e.bhp = 100;
      emit({ k: "wood", x: E.x + 0.5, y: E.y + 0.5 });
      emit({ k: "msg", text: "A board on the " + E.name + " just snapped!", c: "#ffab40" });
    }
  } else {
    e.lock -= dmg;
    if (e.lock <= 0) {
      e.broken = true; e.lock = 0;
      emit({ k: E.kind === "window" ? "glass" : "doorbreak", x: E.x + 0.5, y: E.y + 0.5 });
      emit({ k: "msg", text: "HE BROKE IN THROUGH THE " + E.name.toUpperCase() + "! RUN AND HIDE!", c: "#ff1744", big: true });
      emit({ k: "stinger" });
      enterInside(S, i);
    }
  }
  st.a = Math.atan2(E.y + 0.5 - st.y, E.x + 0.5 - st.x);
}

function enterInside(S, i) {
  const st = S.stalker, E = ENTRIES[i];
  st.mode = "in"; st.state = "hunt"; st.timer = (S.n === 1 ? 14 : 18) + S.hour * 3;
  st.x = E.ix; st.y = E.iy; st.path = []; st.lastSeen = null; st.repath = 0;
}

function startLeave(S) {
  const st = S.stalker;
  let best = 0, bs = 1e9;
  ENTRIES.forEach((E, i) => {
    const s = Math.hypot(E.x + 0.5 - st.x, E.y + 0.5 - st.y) + (S.entries[i].broken ? 0 : 6);
    if (s < bs) { bs = s; best = i; }
  });
  st.state = "leave"; st.target = best;
  if (!goTo(st, ENTRIES[best].x + 0.5, ENTRIES[best].y + 0.5, passIn(best))) exitHouse(S);
}

function exitHouse(S) {
  const st = S.stalker, i = st.target, E = ENTRIES[i], e = S.entries[i];
  if (!e.broken) {
    e.broken = true; e.boards = 0; e.lock = 0;
    emit({ k: E.kind === "window" ? "glass" : "doorbreak", x: E.x + 0.5, y: E.y + 0.5 });
  }
  st.mode = "out"; st.state = "wander"; st.timer = wanderDelay(S) + 5;
  st.x = E.x + E.dx + 0.5; st.y = E.y + E.dy + 0.5; st.path = []; st.last = i;
  emit({ k: "msg", text: "He went back outside through the " + E.name + "... fix it!", c: "#ffab40" });
  wanderOutside(S);
}

function catchPlayer(S, p) {
  p.down = true; p.hidden = false; p.act = null; p.snap++;
  emit({ k: "caught", id: p.id, name: p.name, x: p.x, y: p.y });
  if (Object.values(S.players).some((q) => !q.down)) startLeave(S);
}

function updateStalker(S, dt) {
  const st = S.stalker, h = S.hour;
  st.stun = litByAny(S, st.x, st.y);
  if (st.mode === "out") {
    const spd = 2.3 + h * 0.12;
    switch (st.state) {
      case "wander":
        st.timer -= dt;
        followPath(st, spd * 0.6, dt);
        if (st.timer <= 0) stalkerDecide(S);
        break;
      case "goto":
        if (followPath(st, spd, dt)) {
          st.state = st.next; st.expose = 0;
          if (st.state === "attack") {
            st.timer = 7 + h * 1.2 + rand(0, 3); st.bangT = 0.6;
            emit({ k: "msg", text: "Something is pounding on the " + ENTRIES[st.target].name + "!", c: "#ffab40" });
          } else if (st.state === "peek") {
            st.timer = rand(3, 6);
            const E = ENTRIES[st.target];
            emit({ k: Math.random() < 0.5 ? "tap" : "scratch", x: E.x + 0.5, y: E.y + 0.5 });
          } else st.timer = 2;
        }
        break;
      case "attack":
      case "peek": {
        const E = ENTRIES[st.target];
        if (st.state === "peek") st.a = Math.atan2(E.y + 0.5 - st.y, E.x + 0.5 - st.x);
        // Shining a flashlight in his face through an (un-boarded) window scares him off
        if (st.stun) {
          st.expose += dt;
          if (st.expose > 0.9) {
            emit({ k: "hiss", x: st.x, y: st.y });
            emit({ k: "msg", text: "He flinched away from the light!", c: "#80deea" });
            st.state = "wander"; st.timer = wanderDelay(S) + 3; st.last = st.target;
            wanderOutside(S);
            break;
          }
        } else st.expose = Math.max(0, st.expose - dt * 0.5);
        if (st.state === "attack") {
          st.bangT -= dt;
          if (st.bangT <= 0) {
            st.bangT = Math.max(0.75, 1.3 - h * 0.1) * rand(0.8, 1.2);
            doBang(S, st.target);
            if (st.mode === "in") break;
          }
        }
        st.timer -= dt;
        if (st.timer <= 0) { st.last = st.target; st.state = "wander"; st.timer = wanderDelay(S); wanderOutside(S); }
        break;
      }
      case "cut":
        st.a = 0;
        st.timer -= dt;
        if (st.timer <= 0) {
          if (S.power) {
            S.power = false;
            emit({ k: "powerout" });
            emit({ k: "msg", text: "THE POWER WENT OUT. Fix the fuse box in the hallway!", c: "#ff5252", big: true });
          }
          st.state = "wander"; st.timer = wanderDelay(S); wanderOutside(S);
        }
        break;
    }
    return;
  }

  // ---- inside the apartment ----
  const spd = (st.stun ? 0.4 : 1) * (2.9 + h * 0.13);
  if (st.state === "leave") {
    if (followPath(st, spd, dt)) exitHouse(S);
    return;
  }
  st.timer -= dt;
  let tgt = null, bd = 1e9, seeDirect = false;
  for (const p of Object.values(S.players)) {
    if (p.down) continue;
    let px = p.x, py = p.y;
    if (p.hidden) { if (!p.seenHide) continue; px = p.hideX; py = p.hideY; }
    const d = Math.hypot(px - st.x, py - st.y);
    const vis = !p.hidden && (d < 1.6 || (d < 12 && los(S, st.x, st.y, px, py)));
    if ((p.hidden || vis) && d < bd) { bd = d; tgt = { p, px, py }; seeDirect = vis; }
  }
  if (tgt) {
    st.lastSeen = { x: tgt.px, y: tgt.py };
    st.timer = Math.max(st.timer, 3);
    if (bd < (tgt.p.hidden ? 1.15 : 0.65)) { catchPlayer(S, tgt.p); return; }
    if (seeDirect && bd < 2.2) {
      const dx = tgt.px - st.x, dy = tgt.py - st.y;
      st.a = Math.atan2(dy, dx);
      moveCircle(st, dx / bd * spd * dt, dy / bd * spd * dt, 0.3, stalkerSolidIn);
      st.path = [];
    } else {
      st.repath -= dt;
      if (st.repath <= 0 || !st.path.length) { st.repath = 0.4; goTo(st, tgt.px, tgt.py, passIn(null)); }
      followPath(st, spd, dt);
    }
  } else {
    if (!st.path.length) {
      if (st.lastSeen) { goTo(st, st.lastSeen.x, st.lastSeen.y, passIn(null)); st.lastSeen = null; }
      else { const f = pick(FLOORS); goTo(st, f.x + 0.5, f.y + 0.5, passIn(null)); }
    }
    followPath(st, spd * 0.75, dt);
  }
  if (st.timer <= 0) startLeave(S);
}

// --------------------------- creepy events ---------------------------------
const TEXTS = [
  "nice pajamas",
  "i can see you",
  "why'd you turn the lights on? i like the dark",
  "don't bother calling anyone. nobody's coming.",
  "how many of you are in there? i counted {n}.",
  "the {e} looks weak",
  "it's cold out here. let me in.",
  "you missed a spot",
  "check the closets",
  "i've been inside before. while you were sleeping.",
  "that flashlight won't last all night",
  "sweet dreams :)",
  "look outside",
];
function updateEvents(S, dt) {
  S.nextEvent -= dt;
  if (S.nextEvent > 0) return;
  S.nextEvent = rand(9, 22) - S.hour;
  const alive = Object.values(S.players).filter((p) => !p.down);
  const who = alive.length ? pick(alive).id : null;
  if (S.firstEvent) {
    S.firstEvent = false;
    emit({ k: "text", text: "hey. are you guys still awake?" });
    return;
  }
  const doorE = ENTRIES.filter((E) => E.kind === "door");
  const winE = ENTRIES.filter((E) => E.kind === "window");
  const ev = pick(["knock", "phone", "tv", "flicker", "text", "text", "whisper", "steps", "doorbell", "scratch", "dog", "phantom"]);
  switch (ev) {
    case "knock": { const E = pick(doorE); emit({ k: "knock", x: E.x + 0.5, y: E.y + 0.5 }); break; }
    case "doorbell": { const E = ENTRIES[ENTRY_AT["24,21"]]; emit({ k: "doorbell", x: E.x + 0.5, y: E.y + 0.5 }); break; }
    case "scratch": { const E = pick(winE); emit({ k: "scratch", x: E.x + 0.5, y: E.y + 0.5 }); break; }
    case "phone":
      if (S.phone <= 0) { S.phone = 14; emit({ k: "msg", text: "The landline is ringing in the kitchen...", c: "#b0bec5" }); }
      break;
    case "tv":
      if (!S.tv) { S.tv = true; emit({ k: "msg", text: "The TV in the living room turned on by itself.", c: "#b0bec5" }); emit({ k: "click", x: 27.5, y: 15.5 }); }
      break;
    case "flicker":
      if (S.power) { S.flick = 1.8; emit({ k: "flicker" }); }
      break;
    case "text": {
      const t = pick(TEXTS).replace("{n}", S.n).replace("{e}", pick(ENTRIES).name.toLowerCase());
      emit({ k: "text", to: who, text: t });
      break;
    }
    case "whisper": emit({ k: "whisper", to: who }); break;
    case "steps": emit({ k: "steps", x: rand(6, 30), y: rand(5, 20) }); break;
    case "dog": emit({ k: "dog" }); break;
    case "phantom": emit({ k: "phantom", to: who }); break;
  }
}
