// ---------------------------------------------------------------------------
// Menus, input, networking (PeerJS / WebRTC) and the main loop.
// ---------------------------------------------------------------------------
const PEER_PREFIX = "until6am-room-";
// STUN finds a direct route between two computers. When a network (like school
// Wi-Fi) blocks that, TURN relays the game through Metered's servers on ports
// 80 and 443, which those networks allow. (The owner chose to publish this free
// relay login; it only lets someone use the relay's monthly allowance.)
const PEER_OPTS = {
  debug: 0,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: [
          "turn:global.relay.metered.ca:80",
          "turn:global.relay.metered.ca:80?transport=tcp",
          "turn:global.relay.metered.ca:443",
          "turns:global.relay.metered.ca:443?transport=tcp",
        ],
        username: "b641e4a81d64a4bb3e30cf16",
        credential: "IOQ5i769BlHy5Zla",
      },
    ],
    sdpSemantics: "unified-plan",
  },
};
const BLOCKED_TIP = "School and some home Wi-Fi block online games. Try a phone hotspot or another Wi-Fi, or play Solo.";
const $ = (id) => document.getElementById(id);

const G = {
  role: null,          // 'host' | 'client'
  phase: "menu",       // 'menu' | 'lobby' | 'play' | 'end'
  myId: null, name: "", code: "",
  lobby: [],           // [{id,name,color}]
  S: null,             // current state (authoritative on host, snapshot on clients)
  inputs: {},          // host only: latest input per player
  me: { x: 0, y: 0, a: 0, pitch: 0, fl: true }, mySnap: -1,
  rpos: {}, stR: { x: 1.5, y: 1.5, a: 0 },
  stam: 100, msgs: [], notes: [], call: null, banner: null, prompt: null,
  scare: 0, shakeX: 0, shakeY: 0, shake: 0, dread: 0, phantom: null,
  stingerCD: 0, stepDist: 0, plock: false, simTimer: null, sendT: 0,
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
  G.msgs.push({ text, c, big, t: 7 });
  if (G.msgs.length > 4) G.msgs.shift();
}

// ----------------------------- networking ----------------------------------
function genCode() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += L[Math.floor(Math.random() * L.length)];
  return s;
}

// a room code typed in the box, or "" if there isn't a valid one
function typedCode() { return $("code").value.toUpperCase().replace(/[^A-Z]/g, ""); }
function dropPeer() {
  const peer = NET.peer;
  NET.peer = null; NET.conns = {}; NET.host = null;
  try { if (peer) peer.destroy(); } catch (e) {}
}

function hostGame(online, retry) {
  // typed a friend's code but pressed Host? They meant to join.
  if (online && !retry && typedCode().length === 4) { joinGame(); return; }
  readName(); SFX.init();
  dropPeer();
  G.role = "host"; G.myId = "host"; G.code = "";
  G.lobby = [{ id: "host", name: G.name, color: COLORS[0] }];
  if (!online) { G.phase = "lobby"; startNight(); return; }
  if (typeof Peer === "undefined") { status("Couldn't load the multiplayer library. Reload the page, or play Solo.", true); return; }
  status("Connecting to the game server...");
  const code = genCode();
  const peer = new Peer(PEER_PREFIX + code, PEER_OPTS);
  NET.peer = peer;
  const openT = setTimeout(() => {
    if (NET.peer === peer && G.phase === "menu") status("Couldn't reach the game server. " + BLOCKED_TIP, true);
  }, 12000);
  peer.on("open", () => {
    clearTimeout(openT);
    if (NET.peer !== peer) return;
    G.code = code; G.phase = "lobby"; status("");
    $("lobbyNote").textContent = "";
    renderLobby(); show("lobby");
  });
  peer.on("connection", (conn) => {
    conn.on("data", (m) => hostOnData(conn, m));
    conn.on("close", () => hostDrop(conn.peer));
    conn.on("error", () => hostDrop(conn.peer));
    // tell the host when a friend found the room but couldn't get through
    const blocked = () => {
      if (NET.peer !== peer || conn.open || G.phase !== "lobby") return;
      $("lobbyNote").textContent = "Someone tried to join, but the network blocked the connection. " + BLOCKED_TIP;
    };
    watchIce(conn, blocked);
    setTimeout(blocked, 20000);
  });
  peer.on("error", (err) => {
    if (NET.peer !== peer) return;
    if (err.type === "unavailable-id") { hostGame(true, true); return; }
    if (G.phase === "menu") { clearTimeout(openT); status(netErrorText(err) + " " + BLOCKED_TIP, true); }
    else addMsg("Network hiccup: " + err.type, "#ff8a80");
  });
  peer.on("disconnected", () => { if (NET.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) {} } });
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

function netErrorText(err) {
  const t = err && err.type;
  if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed") return "Couldn't reach the game server.";
  if (t === "browser-incompatible") return "This browser can't do online play.";
  return "Network error: " + t + ".";
}

// calls fail() if the browsers can't find any route to each other
function watchIce(conn, fail) {
  const pc = conn.peerConnection;
  if (!pc) return;
  pc.addEventListener("iceconnectionstatechange", () => { if (pc.iceConnectionState === "failed") fail(); });
}

function joinGame() {
  readName(); SFX.init();
  const code = typedCode();
  if (code.length !== 4) { status("Type the 4-letter code from your friend's lobby screen, then press Join.", true); return; }
  if (typeof Peer === "undefined") { status("Couldn't load the multiplayer library. Reload the page, or play Solo.", true); return; }
  dropPeer();
  status("Connecting to the game server...");
  const peer = new Peer(PEER_OPTS);
  NET.peer = peer;
  let step = "server";
  const fail = () => {
    if (NET.peer !== peer || G.phase !== "menu" || step === "done") return;
    clearTimeout(timeout);
    if (step === "server") status("Couldn't reach the game server. " + BLOCKED_TIP, true);
    else status("Found room " + code + ", but couldn't connect to your friend's computer. " + BLOCKED_TIP, true);
  };
  const timeout = setTimeout(fail, 20000);
  peer.on("open", () => {
    if (NET.peer !== peer) return;
    step = "room";
    status("Looking for room " + code + "...");
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: "json" });
    NET.host = conn;
    // no "room not found" within a few seconds means the room is there
    setTimeout(() => { if (NET.peer === peer && step === "room" && G.phase === "menu") { step = "link"; status("Found room " + code + ". Connecting to your friend's computer..."); } }, 3000);
    watchIce(conn, () => { step = "link"; fail(); });
    conn.on("error", () => { step = "link"; fail(); });
    conn.on("open", () => conn.send({ t: "hello", name: G.name }));
    conn.on("data", (m) => { clearTimeout(timeout); clientOnData(m); });
    conn.on("close", () => {
      if (NET.peer === peer && G.phase !== "menu") { leaveToMenu(); status("The host left the game.", true); }
    });
  });
  peer.on("error", (err) => {
    if (NET.peer !== peer || step === "done") return;
    step = "done";
    clearTimeout(timeout);
    if (err.type === "peer-unavailable") status("No game found with code " + code + ". Check the code with your friend: they press Host a Game and read you the code on their screen.", true);
    else status(netErrorText(err) + " " + BLOCKED_TIP, true);
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
  releaseLook();
  if (G.simTimer) { clearInterval(G.simTimer); G.simTimer = null; }
  G.phase = "menu"; G.S = null; G.role = null; G.lobby = [];
  dropPeer();
  show("menu");
  if (!keepStatus) status("");
}

// ------------------------------- game flow ---------------------------------
function hostEmit(e) {
  onEvent(e);
  broadcast({ t: "ev", e });
}
setEmitter(hostEmit);

function startNight(resumeS, night) {
  G.inputs = {};
  G.S = resumeS || newGame(G.lobby, night || 1);
  broadcast({ t: "start" });
  enterPlay(!!resumeS);
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

function enterPlay(resumed) {
  G.phase = "play";
  show(null);
  G.mySnap = -1; G.rpos = {}; G.msgs = []; G.notes = []; G.call = null; G.card = null; G.scare = 0; G.stam = 100;
  G.stR = G.S ? { x: G.S.stalker.x, y: G.S.stalker.y, a: G.S.stalker.a } : { x: -30, y: -30, a: 0 };
  G.lastStage = null;
  if (resumed) addMsg("The game was updated. Your night continues.", "#b0bec5");
  if (G.S && G.S.players[G.myId]) { const p = G.S.players[G.myId]; G.me.x = p.x; G.me.y = p.y; G.mySnap = p.snap; }
  G.me.pitch = 0; lookDX = lookDY = 0;
  if (!resumed && G.S && G.S.players[G.myId]) G.me.a = G.S.players[G.myId].a;
  R.gl.focus();
  requestLook();
}

function showEnd(result) {
  G.phase = "end";
  releaseLook();
  setTimeout(() => {
    if (G.phase !== "end") return;
    show("end");
    const win = result === "win";
    const night = G.S ? G.S.night : 1;
    G.endNight = night;
    $("endTitle").textContent = win ? "THE END" : "HE GOT YOU";
    $("endTitle").style.color = win ? "#ffd180" : "#ff1744";
    $("endText").textContent = win
      ? "You made it through all three nights in Apartment 302. Aunt May is home. You're never apartment-sitting again."
      : "Night " + night + ". It was " + clockText(G.S ? G.S.mins : 0) + " when the last of you went quiet.";
    $("btnAgain").textContent = win ? (NET.peer ? "Back to Lobby" : "Play Again") : "Try Night " + night + " Again";
    $("btnAgain").classList.toggle("hidden", G.role !== "host");
    $("endWait").classList.toggle("hidden", G.role === "host");
  }, result === "win" ? 1200 : 2200);
}

function backToLobby() {
  if (G.simTimer) { clearInterval(G.simTimer); G.simTimer = null; }
  const retry = G.S && G.S.phase === "lose" ? G.S.night : 0;
  G.S = null;
  if (retry) { startNight(null, retry); return; } // try the same night again
  if (!NET.peer) { startNight(); return; } // solo: straight into a new game
  G.phase = "lobby";
  renderLobby(); show("lobby");
  broadcastLobby(true);
}

// ------------------------------ events -------------------------------------
function myPos() { return G.me; }
// stereo pan for a sound at (x, y): -1 = on your left, +1 = on your right
function panFor(x, y) {
  const dx = x - G.me.x, dy = y - G.me.y, d = Math.hypot(dx, dy);
  if (d < 0.3) return 0;
  return clamp((-dx * Math.sin(G.me.a) + dy * Math.cos(G.me.a)) / d, -1, 1) * Math.min(1, d / 2);
}
function posPlay(name, x, y, base = 1) {
  const me = myPos();
  const d = Math.hypot(x - me.x, y - me.y);
  SFX.play(name, base / (1 + d * 0.17), panFor(x, y));
  return d;
}

function onEvent(e) {
  if (e.to && e.to !== G.myId) return;
  switch (e.k) {
    case "bang": {
      const d = posPlay("bang", e.x, e.y, 1.3);
      G.shake = Math.max(G.shake, 7 / (1 + d * 0.4));
      G.stBang = 0.4;
      break;
    }
    case "glass": case "doorbreak": { const d = posPlay(e.k, e.x, e.y, 1.5); G.shake = Math.max(G.shake, 12 / (1 + d * 0.3)); break; }
    case "wood": case "knock": case "scratch": case "tap": case "hammer": case "nail": case "plank": case "click": case "grab": case "hiss": case "doorbell":
      posPlay(e.k, e.x, e.y, e.k === "doorbell" || e.k === "knock" ? 1.2 : 1);
      if (e.k === "knock") addMsg("*knock knock knock*", "#bcaaa4");
      if (e.k === "doorbell") addMsg("Someone rang the doorbell. At this hour?", "#bcaaa4");
      break;
    case "steps": SFX.play("steps", 0.5, panFor(e.x, e.y)); addMsg("Footsteps... from the apartment upstairs?", "#bcaaa4"); break;
    case "msg": addMsg(e.text, e.c, e.big); break;
    case "text": SFX.play("buzz", 0.7); G.notes.push({ from: "Unknown", text: e.text, t: 0 }); break;
    case "call":
      G.call = { text: e.text, t: 0, dur: 4 + e.text.length * 0.07 };
      SFX.play("pickup", 0.9); SFX.play("breath", 0.8, 0, 0.4); SFX.play("voice", 0.7, 0, 1.4);
      SFX.play("hangup", 0.8, 0, G.call.dur - 0.6);
      break;
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
    case "card": G.card = { title: e.title, lines: e.lines, t: e.t || 6, dur: e.t || 6 }; break;
    case "task": SFX.play("tick", 0.7); addMsg("✓ Done: " + e.text, "#a5d6a7"); break;
    case "creak": posPlay(e.heavy ? "creakHeavy" : e.soft ? "creakSoft" : "creak", e.x, e.y, e.slow ? 1.3 : 1); break;
    case "lock": case "rattle": case "fridge": case "micro": case "ding": case "munch": case "water": case "rustle":
    case "bin": case "brush": case "flush": case "screw": case "switch":
      posPlay(e.k, e.x, e.y, 1);
      break;
    case "sleep": SFX.play("sleep", 0.8); break;
    case "wake": SFX.play("chime", 0.5); break;
    case "morning": SFX.play("win", 0.8); break;
    case "win": SFX.play("win", 1); break;
    case "lose": break;
  }
}

// ------------------------------- input -------------------------------------
const keys = {};
const LOOK_SENS = 0.0026;
let mouseDown = false, dragging = false, dragDist = 0, lookDX = 0, lookDY = 0;
// a tap is counted, not held: the host acts when the count changes
G.pressE = 0; G.pressQ = 0; G.pressG = 0;
addEventListener("keydown", (e) => {
  if (G.phase !== "play" && G.phase !== "end") return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === "KeyF") { G.me.fl = !G.me.fl; SFX.play("click", 0.4); }
    if (e.code === "KeyE" || e.code === "Space") G.pressE++;
    if (e.code === "KeyQ") G.pressQ++;
    if (e.code === "KeyG") G.pressG++;
  }
  keys[e.code] = true;
});
addEventListener("keyup", (e) => { keys[e.code] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; mouseDown = false; dragging = false; });

// Mouse look: pointer lock when the browser allows it, click-and-drag otherwise
function requestLook() {
  if (G.phase !== "play" || G.plock || !R.gl.requestPointerLock) return;
  try {
    const p = R.gl.requestPointerLock();
    if (p && p.catch) p.catch(() => { G.noLock = true; });
  } catch (e) { G.noLock = true; }
}
function releaseLook() {
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
}
document.addEventListener("pointerlockchange", () => {
  G.plock = document.pointerLockElement === R.gl;
  if (G.plock) { G.noLock = false; dragging = false; }
  else mouseDown = false;
});
document.addEventListener("pointerlockerror", () => { G.noLock = true; });
addEventListener("mousemove", (e) => {
  if (G.phase !== "play") return;
  // some browsers report a huge jump on the first event after locking
  const mx = e.movementX || 0, my = e.movementY || 0;
  if (Math.abs(mx) > 250 || Math.abs(my) > 250) return;
  if (G.plock || dragging) { lookDX += mx; lookDY += my; }
  if (dragging && !G.plock) {
    dragDist += Math.abs(mx) + Math.abs(my);
    if (dragDist > 8) mouseDown = false; // it's a drag to look, not a click to interact
  }
});
addEventListener("mousedown", (e) => {
  if (G.phase !== "play" || e.button !== 0 || e.target !== R.gl) return;
  if (G.plock) G.pressE++;
  else { mouseDown = true; dragging = true; dragDist = 0; requestLook(); }
});
addEventListener("mouseup", () => {
  // without pointer lock, a click that didn't turn into a drag counts as a tap
  if (mouseDown && G.phase === "play" && !G.plock) G.pressE++;
  mouseDown = false; dragging = false;
});

function myInput() {
  return { t: "in", x: G.me.x, y: G.me.y, a: G.me.a, pt: G.me.pitch, fl: G.me.fl, ep: G.pressE, qp: G.pressQ, gp: G.pressG };
}

function updateLocal(dt, now) {
  const S = G.S, p = S && S.players[G.myId];
  if (!p || S.phase !== "play" || G.phase !== "play") return;
  if (S.stage === "sleep") { lookDX = lookDY = 0; return; }
  // looking around
  G.me.a += lookDX * LOOK_SENS;
  G.me.pitch = clamp((G.me.pitch || 0) - lookDY * LOOK_SENS, -1.3, 1.3);
  lookDX = lookDY = 0;
  if (keys.ArrowLeft) G.me.a -= dt * 2.4;
  if (keys.ArrowRight) G.me.a += dt * 2.4;
  G.me.a = Math.atan2(Math.sin(G.me.a), Math.cos(G.me.a));
  // walking: forward/back along where you look, A/D strafe
  let fw = 0, st = 0;
  if (keys.KeyW || keys.ArrowUp) fw += 1;
  if (keys.KeyS || keys.ArrowDown) fw -= 1;
  if (keys.KeyD) st += 1;
  if (keys.KeyA) st -= 1;
  const ca = Math.cos(G.me.a), sa = Math.sin(G.me.a);
  const mx = fw * ca - st * sa, my = fw * sa + st * ca;
  const moving = (fw || st) && !p.down && !p.hidden;
  const sprint = moving && (keys.ShiftLeft || keys.ShiftRight) && G.stam > 1;
  if (sprint) G.stam = Math.max(0, G.stam - dt * 28);
  else G.stam = Math.min(100, G.stam + dt * (moving ? 10 : 18));
  if (moving) {
    const l = Math.hypot(mx, my), spd = (sprint ? SPRINT : WALK) * (p.planks > 0 ? 0.9 : 1);
    const ox = G.me.x, oy = G.me.y;
    moveCircle(G.me, mx / l * spd * dt, my / l * spd * dt, PR, playerSolidFn(S));
    const stepped = Math.hypot(G.me.x - ox, G.me.y - oy);
    G.stepDist += stepped;
    G.bobPhase = (G.bobPhase || 0) + stepped * 5.5;
    if (G.stepDist > (sprint ? 1.1 : 0.85)) { G.stepDist = 0; SFX.play("step", sprint ? 0.35 : 0.18, 0); }
  }
  G.bob = Math.sin(G.bobPhase || 0) * (moving ? (sprint ? 0.05 : 0.03) : 0);
}

// ------------------------------ main loop ----------------------------------
let lastT = performance.now();
function frame(nowMs) {
  const now = nowMs / 1000, rawDt = Math.max(0, (nowMs - lastT) / 1000), dt = Math.min(0.05, rawDt);
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
    const me = Object.assign({}, sp || { id: G.myId, name: G.name, color: "#fff", bat: 0, planks: 0 }, { x: G.me.x, y: G.me.y, a: G.me.a, pitch: G.me.pitch || 0, fl: G.me.fl });
    G.prompt = sp && !sp.down && !sp.hidden ? findTarget(S, me) : null;
    renderGame(S, me, G, now, rawDt);
  } else {
    renderMenu(now, rawDt);
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
  if (G.notes.length) { G.notes[0].t += dt; if (G.notes[0].t > 6) G.notes.shift(); }
  if (G.call && (G.call.t += dt) > G.call.dur) G.call = null;
  if (G.card && (G.card.t -= dt) <= 0) G.card = null;
  // flashlight off for the cosy evening, on when something wakes you
  if (S.stage !== G.lastStage) {
    if (S.stage === "evening") G.me.fl = false;
    if (S.stage === "night") G.me.fl = true;
    G.lastStage = S.stage;
  }
  if (G.phantom && (G.phantom.t -= dt) <= 0) G.phantom = null;
  G.scare = Math.max(0, G.scare - dt);
  G.shake = Math.max(0, G.shake - dt * 25);
  G.shakeX = (Math.random() - 0.5) * G.shake * 0.006; G.shakeY = (Math.random() - 0.5) * G.shake * 0.006;
  G.stBang = Math.max(0, (G.stBang || 0) - dt);

  // mood: heartbeat when he's close, stinger when you first spot him
  const d = Math.hypot(sr.x - G.me.x, sr.y - G.me.y);
  const inside = st.mode === "in";
  const heart = inside ? clamp(1 - d / 12, 0, 1) : clamp(1 - d / 7, 0, 1) * 0.5;
  G.dread += ((inside ? 0.6 + heart * 0.4 : heart * 0.6) - G.dread) * Math.min(1, dt * 2);
  G.stingerCD -= dt;
  if (d < 7 && G.stingerCD <= 0 && los(S, G.me.x, G.me.y, sr.x, sr.y)) { SFX.play("stinger", 0.6); G.stingerCD = 15; }
  const tvD = Math.hypot(SPOTS.tv.x - G.me.x, SPOTS.tv.y - G.me.y), phD = Math.hypot(SPOTS.phone.x - G.me.x, SPOTS.phone.y - G.me.y);
  SFX.update(dt, {
    playing: G.phase === "play", power: S.power, dread: G.dread, heart: G.phase === "play" ? heart : 0,
    tvVol: S.tv && S.power ? 0.25 / (1 + tvD * 0.3) : 0, tvPan: panFor(SPOTS.tv.x, SPOTS.tv.y),
    ringVol: S.phone > 0 ? 1 / (1 + phD * 0.15) : 0, ringPan: panFor(SPOTS.phone.x, SPOTS.phone.y),
  });
}

// ------------------------------- boot --------------------------------------
// SOLO_ONLY is set by builds that run where peer-to-peer is unavailable
// (e.g. the single-file page published on claude.ai).
const SOLO_ONLY = !!window.SOLO_ONLY;

function boot(saved) {
  initRender();
  try { $("name").value = localStorage.getItem("until6am-name") || ""; } catch (e) {}
  if (SOLO_ONLY) {
    $("mpControls").classList.add("hidden");
    if (window.MULTIPLAYER_URL) {
      $("mpLink").href = $("mpLink").textContent = window.MULTIPLAYER_URL;
      $("soloNote").classList.remove("hidden");
    }
  } else {
    try {
      const j = new URLSearchParams(location.search).get("join");
      if (j) $("code").value = j.toUpperCase().slice(0, 4);
    } catch (e) {}
  }
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
    if (navigator.clipboard && link) navigator.clipboard.writeText(link).then(() => { $("btnCopy").textContent = "Copied!"; setTimeout(() => ($("btnCopy").textContent = "Copy invite link"), 1500); }).catch(() => {});
  };
  show("menu");
  if (window.matchMedia && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches) {
    status("This game needs a keyboard and a mouse or trackpad (a Chromebook or computer works).", true);
  }
  if (!R.ok) {
    status(R.err || "Your browser couldn't start 3D graphics.", true);
    for (const id of ["btnHost", "btnJoin", "btnSolo"]) $(id).disabled = true;
  }
  requestAnimationFrame(frame);
  // Pick a solo night back up after the page is hot-reloaded
  if (saved && saved.S && saved.S.phase === "play") {
    SFX.init();
    // browsers keep audio paused until the player touches a key or the mouse again
    const unlock = () => { SFX.init(); removeEventListener("pointerdown", unlock); removeEventListener("keydown", unlock); };
    addEventListener("pointerdown", unlock);
    addEventListener("keydown", unlock);
    G.role = "host"; G.myId = "host"; G.name = saved.name || "Player"; G.lobby = saved.lobby || [];
    $("name").value = G.name;
    startNight(saved.S);
    if (saved.me) Object.assign(G.me, saved.me);
  }
}

const HOT = window.claude && window.claude.hot;
if (HOT && HOT.snapshot) {
  HOT.snapshot(() => (G.role === "host" && !NET.peer && G.S && G.phase === "play")
    ? { S: G.S, lobby: G.lobby, name: G.name, me: { x: G.me.x, y: G.me.y, a: G.me.a, fl: G.me.fl } }
    : {});
}
if (HOT && HOT.ready) HOT.ready(boot);
else boot(HOT && HOT.data);
