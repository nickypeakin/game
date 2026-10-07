// ---------------------------------------------------------------------------
// Menus, input, networking (PeerJS / WebRTC) and the main loop.
// ---------------------------------------------------------------------------
const PEER_PREFIX = "until6am-room-";
const $ = (id) => document.getElementById(id);

const G = {
  role: null,          // 'host' | 'client'
  phase: "menu",       // 'menu' | 'lobby' | 'play' | 'end'
  myId: null, name: "", code: "",
  lobby: [],           // [{id,name,color}]
  S: null,             // current state (authoritative on host, snapshot on clients)
  inputs: {},          // host only: latest input per player
  me: { x: 0, y: 0, a: 0, fl: true }, mySnap: -1,
  rpos: {}, stR: { x: 1.5, y: 1.5, a: 0 },
  stam: 100, msgs: [], phoneCard: null, banner: null, prompt: null,
  scare: 0, shakeX: 0, shakeY: 0, shake: 0, dread: 0, phantom: null,
  stingerCD: 0, stepDist: 0, mouseT: -10, simTimer: null, sendT: 0,
};
const NET = { peer: null, conns: {}, host: null };

// ------------------------------- UI ----------------------------------------
function show(id) {
  for (const s of ["menu", "lobby", "end", "help"]) $(s).classList.toggle("hidden", s !== id);
}
function status(msg, bad) { const s = $("status"); s.textContent = msg || ""; s.style.color = bad ? "#ff6b6b" : "#aaa"; }
function cleanName(n) { return (String(n || "").replace(/[^\w \-'.!?]/g, "").trim().slice(0, 12)) || "Player"; }

function readName() {
  G.name = cleanName($("name").value);
  try { localStorage.setItem("until6am-name", G.name); } catch (e) {}
}

function renderLobby() {
  $("lobbyCode").textContent = G.code || "SOLO";
  $("lobbyLink").textContent = G.code ? location.origin + location.pathname + "?join=" + G.code : "";
  const ul = $("lobbyList");
  ul.innerHTML = "";
  for (const p of G.lobby) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span>`;
    li.appendChild(document.createTextNode(p.name + (p.id === G.myId ? " (you)" : "") + (p.id === "host" ? " — host" : "")));
    ul.appendChild(li);
  }
  $("btnStart").classList.toggle("hidden", G.role !== "host");
  $("lobbyWait").classList.toggle("hidden", G.role === "host");
}

function addMsg(text, c, big) {
  G.msgs.push({ text, c, big, t: 8 });
  if (G.msgs.length > 6) G.msgs.shift();
}

// ----------------------------- networking ----------------------------------
function genCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

function hostGame(online) {
  readName(); SFX.init();
  G.role = "host"; G.myId = "host"; G.code = "";
  G.lobby = [{ id: "host", name: G.name, color: COLORS[0] }];
  if (!online) { G.phase = "lobby"; startNight(); return; }
  if (typeof Peer === "undefined") { status("Couldn't load the multiplayer library (no internet?). Try Solo.", true); return; }
  status("Creating a room...");
  const code = genCode();
  const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
  NET.peer = peer;
  peer.on("open", () => {
    G.code = code; G.phase = "lobby"; status("");
    renderLobby(); show("lobby");
  });
  peer.on("connection", (conn) => {
    conn.on("data", (m) => hostOnData(conn, m));
    conn.on("close", () => hostDrop(conn.peer));
    conn.on("error", () => hostDrop(conn.peer));
  });
  peer.on("error", (err) => {
    if (err.type === "unavailable-id") { peer.destroy(); hostGame(true); return; }
    if (G.phase === "menu") status("Network error: " + err.type + ". Try again or play Solo.", true);
    else addMsg("Network hiccup: " + err.type, "#ff8a80");
  });
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
}

function hostOnData(conn, m) {
  if (!m || typeof m !== "object") return;
  if (m.t === "hello") {
    if (G.phase !== "lobby") { conn.send({ t: "deny", why: "That game already started. Wait for the next round!" }); setTimeout(() => conn.close(), 500); return; }
    if (G.lobby.length >= 6) { conn.send({ t: "deny", why: "That room is full (6 players max)." }); setTimeout(() => conn.close(), 500); return; }
    NET.conns[conn.peer] = conn;
    const used = new Set(G.lobby.map((p) => p.color));
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    G.lobby = G.lobby.filter((p) => p.id !== conn.peer);
    G.lobby.push({ id: conn.peer, name: cleanName(m.name), color });
    conn.send({ t: "welcome", id: conn.peer, code: G.code });
    broadcastLobby();
  } else if (m.t === "in" && NET.conns[conn.peer]) {
    G.inputs[conn.peer] = m;
  }
}

function hostDrop(id) {
  if (!NET.conns[id]) return;
  delete NET.conns[id];
  const p = G.lobby.find((q) => q.id === id);
  G.lobby = G.lobby.filter((q) => q.id !== id);
  if (G.S && G.S.players[id]) {
    delete G.S.players[id];
    hostEmit({ k: "msg", text: (p ? p.name : "Someone") + " lost connection.", c: "#ff8a80" });
  }
  broadcastLobby();
}

function broadcast(m) {
  for (const c of Object.values(NET.conns)) if (c.open) { try { c.send(m); } catch (e) {} }
}
function broadcastLobby(back) {
  broadcast({ t: "lobby", players: G.lobby, back: !!back });
  if (G.phase === "lobby") renderLobby();
}

function joinGame() {
  readName(); SFX.init();
  const code = $("code").value.toUpperCase().replace(/[^A-Z]/g, "");
  if (code.length !== 4) { status("Enter the 4-letter room code from your friend.", true); return; }
  if (typeof Peer === "undefined") { status("Couldn't load the multiplayer library (no internet?).", true); return; }
  status("Connecting to room " + code + "...");
  const peer = new Peer({ debug: 0 });
  NET.peer = peer;
  const timeout = setTimeout(() => { if (G.phase === "menu") status("Couldn't reach that room. Check the code and that the host is still in the lobby.", true); }, 15000);
  peer.on("open", () => {
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: "json" });
    NET.host = conn;
    conn.on("open", () => conn.send({ t: "hello", name: G.name }));
    conn.on("data", (m) => { clearTimeout(timeout); clientOnData(m); });
    conn.on("close", () => {
      if (G.phase !== "menu") { leaveToMenu(); status("The host left the game.", true); }
    });
  });
  peer.on("error", (err) => {
    clearTimeout(timeout);
    if (err.type === "peer-unavailable") status("No game found with code " + code + ".", true);
    else status("Network error: " + err.type, true);
  });
}

function clientOnData(m) {
  if (!m || typeof m !== "object") return;
  switch (m.t) {
    case "welcome":
      G.role = "client"; G.myId = m.id; G.code = m.code; G.phase = "lobby";
      status(""); renderLobby(); show("lobby");
      break;
    case "deny": status(m.why, true); leaveToMenu(true); break;
    case "lobby":
      G.lobby = m.players;
      if (m.back && G.phase !== "lobby") { G.phase = "lobby"; G.S = null; show("lobby"); }
      if (G.phase === "lobby") renderLobby();
      break;
    case "start": enterPlay(); break;
    case "s": applySnapshot(m.s); break;
    case "ev": onEvent(m.e); break;
  }
}

function applySnapshot(s) {
  if (G.phase === "lobby" && s.phase === "play") enterPlay();
  if (G.phase !== "play" && G.phase !== "end") return;
  G.S = s;
  const me = s.players[G.myId];
  if (me && me.snap !== G.mySnap) { G.me.x = me.x; G.me.y = me.y; G.mySnap = me.snap; }
  if (s.phase !== "play" && G.phase === "play") showEnd(s.phase);
}

function leaveToMenu(keepStatus) {
  if (G.simTimer) { clearInterval(G.simTimer); G.simTimer = null; }
  G.phase = "menu"; G.S = null; G.role = null; G.lobby = [];
  const peer = NET.peer;
  NET.peer = null; NET.conns = {}; NET.host = null;
  try { if (peer) peer.destroy(); } catch (e) {}
  show("menu");
  if (!keepStatus) status("");
}

// ------------------------------- game flow ---------------------------------
function hostEmit(e) {
  onEvent(e);
  broadcast({ t: "ev", e });
}
setEmitter(hostEmit);

function startNight() {
  G.inputs = {};
  G.S = newGame(G.lobby);
  broadcast({ t: "start" });
  enterPlay();
  let last = performance.now(), tick = 0;
  if (G.simTimer) clearInterval(G.simTimer);
  G.simTimer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    G.inputs[G.myId] = myInput();
    const before = G.S.phase;
    simStep(G.S, G.inputs, dt);
    if (++tick % 2 === 0 || G.S.phase !== before) broadcast({ t: "s", s: publicState(G.S) });
    if (G.S.phase !== "play" && G.phase === "play") showEnd(G.S.phase);
  }, 1000 / 30);
}

function enterPlay() {
  G.phase = "play";
  show(null);
  G.mySnap = -1; G.rpos = {}; G.msgs = []; G.phoneCard = null; G.scare = 0; G.stam = 100; G.me.fl = true;
  G.stR = { x: 1.5, y: 1.5, a: 0 };
  G.banner = { text: "12:00 AM", sub: "Board up the doors and windows. Survive until 6 AM.", t: 5 };
  addMsg("Grab planks from the piles and board up the windows & doors!", "#ffe082");
  addMsg("Shine your flashlight at him through a window to scare him off.", "#80deea");
  if (G.S && G.S.players[G.myId]) { const p = G.S.players[G.myId]; G.me.x = p.x; G.me.y = p.y; G.mySnap = p.snap; }
  R.cv.focus();
}

function showEnd(result) {
  G.phase = "end";
  setTimeout(() => {
    if (G.phase !== "end") return;
    show("end");
    const win = result === "win";
    $("endTitle").textContent = win ? "6:00 AM" : "HE GOT YOU";
    $("endTitle").style.color = win ? "#ffd180" : "#ff1744";
    const alive = G.S ? Object.values(G.S.players).filter((p) => !p.down).map((p) => p.name) : [];
    $("endText").textContent = win
      ? "The sun is coming up. The figure outside is gone... for now. Survivors: " + (alive.join(", ") || "nobody") + "."
      : "Nobody made it to sunrise. You held out until " + clockText(G.S ? G.S.time : 0) + " before the last of you went quiet.";
    $("btnAgain").textContent = NET.peer ? "Back to Lobby" : "Play Again";
    $("btnAgain").classList.toggle("hidden", G.role !== "host");
    $("endWait").classList.toggle("hidden", G.role === "host");
  }, result === "win" ? 1200 : 2200);
}

function backToLobby() {
  if (G.simTimer) { clearInterval(G.simTimer); G.simTimer = null; }
  G.S = null;
  if (!NET.peer) { startNight(); return; } // solo: straight into a new night
  G.phase = "lobby";
  renderLobby(); show("lobby");
  broadcastLobby(true);
}

// ------------------------------ events -------------------------------------
function myPos() { return G.me; }
function posPlay(name, x, y, base = 1) {
  const me = myPos();
  const d = Math.hypot(x - me.x, y - me.y);
  SFX.play(name, base / (1 + d * 0.17), clamp((x - me.x) / 8, -1, 1));
  return d;
}

function onEvent(e) {
  if (e.to && e.to !== G.myId) return;
  switch (e.k) {
    case "bang": { const d = posPlay("bang", e.x, e.y, 1.3); G.shake = Math.max(G.shake, 7 / (1 + d * 0.4)); break; }
    case "glass": case "doorbreak": { const d = posPlay(e.k, e.x, e.y, 1.5); G.shake = Math.max(G.shake, 12 / (1 + d * 0.3)); break; }
    case "wood": case "knock": case "scratch": case "tap": case "hammer": case "nail": case "plank": case "click": case "grab": case "hiss": case "doorbell":
      posPlay(e.k, e.x, e.y, e.k === "doorbell" || e.k === "knock" ? 1.2 : 1);
      if (e.k === "knock") addMsg("*knock knock knock*", "#bcaaa4");
      if (e.k === "doorbell") addMsg("Someone rang the doorbell. At this hour?", "#bcaaa4");
      break;
    case "steps": SFX.play("steps", 0.5, clamp((e.x - G.me.x) / 10, -1, 1)); addMsg("Footsteps... from the apartment upstairs?", "#bcaaa4"); break;
    case "msg": addMsg(e.text, e.c, e.big); break;
    case "text": SFX.play("buzz", 0.7); G.phoneCard = { from: "UNKNOWN NUMBER", text: e.text, t: 8 }; break;
    case "call": SFX.play("breath", 0.9); G.phoneCard = { from: "☎ CALLER (UNKNOWN)", text: '"' + e.text + '"', t: 8 }; break;
    case "whisper": SFX.play("whisper", 0.7, rand(-1, 1)); addMsg("...did someone just whisper your name?", "#ce93d8"); break;
    case "phantom": {
      const a = G.me.a + rand(-0.5, 0.5), d = rand(3.5, 6);
      const x = G.me.x + Math.cos(a) * d, y = G.me.y + Math.sin(a) * d;
      if (tileAt(Math.floor(x), Math.floor(y)) === "." && G.S && los(G.S, G.me.x, G.me.y, x, y)) {
        G.phantom = { x, y, a: a + Math.PI, t: 0.35 };
        SFX.play("stinger", 0.5);
      }
      break;
    }
    case "powerout": SFX.play("powerout", 1); break;
    case "powerup": SFX.play("powerup", 1); break;
    case "flicker": SFX.play("flicker", 0.6); break;
    case "dog": SFX.play("dog", 0.25, rand(-1, 1)); break;
    case "stinger": SFX.play("stinger", 0.8); break;
    case "caught":
      if (e.id === G.myId) { G.scare = 1.4; SFX.play("scream", 1.2); }
      else { posPlay("scream", e.x, e.y, 0.8); addMsg(e.name + " WAS CAUGHT! Go help them up!", "#ff1744", true); }
      break;
    case "hour": SFX.play("chime", 0.8); G.banner = { text: e.h + ":00 AM", sub: ["", "He's getting restless.", "Halfway there.", "He's getting angrier.", "Almost dawn...", "Last hour. Hold on!"][e.h], t: 3.5 }; break;
    case "win": SFX.play("win", 1); G.banner = { text: "6:00 AM", sub: "The sun is rising. You survived.", t: 5 }; break;
    case "lose": break;
  }
}

// ------------------------------- input -------------------------------------
const keys = {};
let mouseX = 0, mouseY = 0, mouseDown = false;
addEventListener("keydown", (e) => {
  if (G.phase !== "play" && G.phase !== "end") return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (e.code === "KeyF" && !e.repeat) { G.me.fl = !G.me.fl; SFX.play("click", 0.4); }
  keys[e.code] = true;
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouseDown = false; });
addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; G.mouseT = performance.now() / 1000; });
addEventListener("mousedown", (e) => { if (G.phase === "play" && e.button === 0 && e.target === R.cv) mouseDown = true; });
addEventListener("mouseup", () => { mouseDown = false; });

function myInput() {
  return { t: "in", x: G.me.x, y: G.me.y, a: G.me.a, fl: G.me.fl, e: !!(keys.KeyE || keys.Space || mouseDown) };
}

function updateLocal(dt, now) {
  const S = G.S, p = S && S.players[G.myId];
  if (!p || S.phase !== "play" || G.phase !== "play") return;
  let mx = 0, my = 0;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  const moving = (mx || my) && !p.down && !p.hidden;
  const sprint = moving && (keys.ShiftLeft || keys.ShiftRight) && G.stam > 1;
  if (sprint) G.stam = Math.max(0, G.stam - dt * 28);
  else G.stam = Math.min(100, G.stam + dt * (moving ? 10 : 18));
  if (moving) {
    const l = Math.hypot(mx, my), spd = (sprint ? SPRINT : WALK) * (p.planks > 0 ? 0.9 : 1);
    const ox = G.me.x, oy = G.me.y;
    moveCircle(G.me, mx / l * spd * dt, my / l * spd * dt, PR, playerSolid);
    G.stepDist += Math.hypot(G.me.x - ox, G.me.y - oy);
    if (G.stepDist > (sprint ? 1.1 : 0.85)) { G.stepDist = 0; SFX.play("step", sprint ? 0.35 : 0.18, 0); }
  }
  // aim: mouse if it moved recently, otherwise face where you walk
  if (now - G.mouseT < 4) {
    const [sx, sy] = toScreen(G.me.x, G.me.y);
    G.me.a = Math.atan2(mouseY - sy, mouseX - sx);
  } else if (moving) {
    const ta = Math.atan2(my, mx);
    G.me.a += angDiff(ta, G.me.a) * Math.min(1, dt * 12);
  }
}

// ------------------------------ main loop ----------------------------------
let lastT = performance.now();
function frame(nowMs) {
  const now = nowMs / 1000, dt = Math.min(0.05, (nowMs - lastT) / 1000);
  lastT = nowMs;
  if ((G.phase === "play" || G.phase === "end") && G.S) {
    updateLocal(dt, now);
    if (G.role === "client") {
      G.sendT -= dt;
      if (G.sendT <= 0 && NET.host && NET.host.open) { G.sendT = 0.05; try { NET.host.send(myInput()); } catch (e) {} }
    }
    tickEffects(dt, now);
    const S = G.S, sp = S.players[G.myId];
    if (sp && sp.snap !== G.mySnap) { G.me.x = sp.x; G.me.y = sp.y; G.mySnap = sp.snap; }
    const me = Object.assign({}, sp || { id: G.myId, name: G.name, color: "#fff", bat: 0, planks: 0 }, { x: G.me.x, y: G.me.y, a: G.me.a, fl: G.me.fl });
    G.prompt = sp && !sp.down && !sp.hidden ? findTarget(S, me) : null;
    renderFrame(S, me, G, now);
  } else {
    drawMenuBackdrop(now);
  }
  requestAnimationFrame(frame);
}

function tickEffects(dt, now) {
  const S = G.S, k = 1 - Math.exp(-dt * 14);
  for (const p of Object.values(S.players)) {
    if (p.id === G.myId) continue;
    const r = G.rpos[p.id] || (G.rpos[p.id] = { x: p.x, y: p.y, a: p.a });
    if (Math.hypot(p.x - r.x, p.y - r.y) > 3) { r.x = p.x; r.y = p.y; }
    r.x += (p.x - r.x) * k; r.y += (p.y - r.y) * k; r.a += angDiff(p.a, r.a) * k;
  }
  const st = S.stalker, sr = G.stR;
  if (Math.hypot(st.x - sr.x, st.y - sr.y) > 3) { sr.x = st.x; sr.y = st.y; }
  sr.x += (st.x - sr.x) * k; sr.y += (st.y - sr.y) * k; sr.a += angDiff(st.a, sr.a) * k;

  for (const m of G.msgs) m.t -= dt;
  G.msgs = G.msgs.filter((m) => m.t > 0);
  if (G.phoneCard && (G.phoneCard.t -= dt) <= 0) G.phoneCard = null;
  if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;
  if (G.phantom && (G.phantom.t -= dt) <= 0) G.phantom = null;
  G.scare = Math.max(0, G.scare - dt);
  G.shake = Math.max(0, G.shake - dt * 25);
  G.shakeX = (Math.random() - 0.5) * G.shake / TILE; G.shakeY = (Math.random() - 0.5) * G.shake / TILE;

  // mood: heartbeat when he's close, stinger when you first spot him
  const d = Math.hypot(sr.x - G.me.x, sr.y - G.me.y);
  const inside = st.mode === "in";
  const heart = inside ? clamp(1 - d / 12, 0, 1) : clamp(1 - d / 7, 0, 1) * 0.5;
  G.dread += ((inside ? 0.6 + heart * 0.4 : heart * 0.6) - G.dread) * Math.min(1, dt * 2);
  G.stingerCD -= dt;
  if (d < 7 && G.stingerCD <= 0 && los(S, G.me.x, G.me.y, sr.x, sr.y)) { SFX.play("stinger", 0.6); G.stingerCD = 15; }
  const tvD = Math.hypot(27.5 - G.me.x, 15.5 - G.me.y), phD = Math.hypot(16.5 - G.me.x, 15.5 - G.me.y);
  SFX.update(dt, {
    playing: G.phase === "play", power: S.power, dread: G.dread, heart: G.phase === "play" ? heart : 0,
    tvVol: S.tv ? 0.25 / (1 + tvD * 0.3) : 0, tvPan: clamp((27.5 - G.me.x) / 8, -1, 1),
    ringVol: S.phone > 0 ? 1 / (1 + phD * 0.15) : 0, ringPan: clamp((16.5 - G.me.x) / 8, -1, 1),
  });
}

function drawMenuBackdrop(now) {
  const g = R.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#050507"; g.fillRect(0, 0, R.W, R.H);
  R.camX = 18 + Math.sin(now * 0.05) * 4; R.camY = 13 + Math.cos(now * 0.04) * 2;
  worldXf(g);
  g.globalAlpha = 0.25; g.drawImage(R.bg, 0, 0); g.globalAlpha = 1;
  // a figure slowly circling the building
  const a = now * 0.08, fx = 18 + Math.cos(a) * 16, fy = 12.8 + Math.sin(a) * 11;
  drawStalker(g, fx, fy, a + Math.PI / 2, now, false);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const vg = g.createRadialGradient(R.W / 2, R.H / 2, R.H * 0.1, R.W / 2, R.H / 2, R.H * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0.3)"); vg.addColorStop(1, "rgba(0,0,0,0.95)");
  g.fillStyle = vg; g.fillRect(0, 0, R.W, R.H);
}

// ------------------------------- boot --------------------------------------
function boot() {
  initRender();
  try { $("name").value = localStorage.getItem("until6am-name") || ""; } catch (e) {}
  const j = new URLSearchParams(location.search).get("join");
  if (j) $("code").value = j.toUpperCase().slice(0, 4);
  $("btnHost").onclick = () => hostGame(true);
  $("btnSolo").onclick = () => hostGame(false);
  $("btnJoin").onclick = joinGame;
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") joinGame(); });
  $("btnHelp").onclick = () => show("help");
  $("btnHelpBack").onclick = () => show("menu");
  $("btnStart").onclick = () => { SFX.init(); if (G.role === "host") startNight(); };
  $("btnLeave").onclick = () => leaveToMenu();
  $("btnAgain").onclick = backToLobby;
  $("btnMenu").onclick = () => leaveToMenu();
  $("btnCopy").onclick = () => {
    const link = $("lobbyLink").textContent;
    if (navigator.clipboard && link) navigator.clipboard.writeText(link).then(() => { $("btnCopy").textContent = "Copied!"; setTimeout(() => ($("btnCopy").textContent = "Copy invite link"), 1500); });
  };
  show("menu");
  requestAnimationFrame(frame);
}
boot();
