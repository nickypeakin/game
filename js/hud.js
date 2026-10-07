// ---------------------------------------------------------------------------
// 2D overlay drawn on top of the 3D view: clock, minimap, prompts, texts,
// name tags, film grain and the jumpscare flash.
// ---------------------------------------------------------------------------
function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function txt(g, s, x, y, o = {}) {
  g.font = (o.weight || "bold") + " " + (o.size || 16) + "px " + (o.font || "'Courier New', monospace");
  g.textAlign = o.align || "left";
  g.textBaseline = o.base || "alphabetic";
  const mw = o.maxW > 0 ? o.maxW : undefined;
  if (o.shadow !== false) { g.fillStyle = "rgba(0,0,0,0.85)"; g.fillText(s, x + 2, y + 2, mw); }
  g.fillStyle = o.color || "#eee";
  g.fillText(s, x, y, mw);
}

const ITEM_NAMES = { food: "Frozen dinner", hot: "Hot dinner", plate: "Dirty plate", trash: "Trash bag", bulb: "Light bulb", laundry: "Clean laundry", plank: "Plank" };
const MAP_X1 = 29, MAP_Y1 = 22; // minimap covers the house and the back yard

function drawMinimap(g, S, me, t) {
  const s = R.W < 760 ? 4 : 6;
  const cols = MAP_X1 - HOUSE.x0 + 1, rows = MAP_Y1 - HOUSE.y0 + 1;
  const w = cols * s, h = rows * s, x0 = R.W - w - 14, y0 = 14;
  g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
  for (let y = HOUSE.y0; y <= MAP_Y1; y++) for (let x = HOUSE.x0; x <= MAP_X1; x++) {
    const c = tileAt(x, y);
    const mx = x0 + (x - HOUSE.x0) * s, my = y0 + (y - HOUSE.y0) * s;
    if (c === "#" || c === "F") g.fillStyle = "#666";
    else if ("WDB".includes(c) || c === ",") continue;
    else if (c === "y") g.fillStyle = "#1d2a18";
    else if (c === "f" || c === "G") g.fillStyle = "#4a3b2c";
    else if (c === "d") g.fillStyle = S.idoors[IDOOR_AT[x + "," + y]].open ? "#2a2a33" : "#b08d5a";
    else if (c === ".") {
      const r = roomAt(x, y), st = r && S.rooms[r.id];
      g.fillStyle = st && S.power && st.on && st.bulb ? "#3b3426" : "#1c1c22";
    } else g.fillStyle = "#3a4a5a";
    g.fillRect(mx, my, s, s);
  }
  ENTRIES.forEach((E, i) => {
    const e = S.entries[i];
    const mx = x0 + (E.x - HOUSE.x0) * s, my = y0 + (E.y - HOUSE.y0) * s;
    let col = ["#ff3d3d", "#ff9800", "#ffd600", "#4caf50"][e.boards];
    if (E.kind === "door" && !e.boards) col = e.open ? "#ff3d3d" : e.locked ? "#4fc3f7" : "#b08d5a";
    if (e.broken) col = Math.floor(t * 4) % 2 ? "#ff00aa" : "#300";
    g.fillStyle = col; g.fillRect(mx - 1, my - 1, s + 2, s + 2);
    if (e.hit > 0) { g.strokeStyle = `rgba(255,255,255,${e.hit})`; g.lineWidth = 2; g.strokeRect(mx - 4, my - 4, s + 8, s + 8); }
  });
  if (!S.power && Math.floor(t * 3) % 2) { g.fillStyle = "#ffeb3b"; g.fillRect(x0 + (23 - HOUSE.x0) * s - 1, y0 + (13 - HOUSE.y0) * s - 1, s + 2, s + 2); }
  for (const p of Object.values(S.players)) {
    const px = p.id === me.id ? me.x : p.x, py = p.id === me.id ? me.y : p.y;
    g.fillStyle = p.down ? "#888" : p.color;
    const cx = x0 + (px - HOUSE.x0) * s, cy = y0 + (py - HOUSE.y0) * s;
    g.beginPath(); g.arc(cx, cy, p.id === me.id ? 3.5 : 2.5, 0, 7); g.fill();
    if (p.id === me.id) {
      g.strokeStyle = p.color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(me.a) * 11, cy + Math.sin(me.a) * 11); g.stroke();
    }
  }
  let ly = y0 + h + 22;
  const lx = Math.min(x0 - 4, R.W - 200);
  if (S.stage === "night" || S.night === 3) {
    txt(g, "boards: ", lx, ly, { size: 12 });
    ["0", "1", "2", "3"].forEach((n, i) => {
      g.fillStyle = ["#ff3d3d", "#ff9800", "#ffd600", "#4caf50"][i]; g.fillRect(lx + 58 + i * 30, ly - 10, 10, 10);
      txt(g, n, lx + 72 + i * 30, ly, { size: 12 });
    });
    ly += 18;
  }
  txt(g, "doors: ", lx, ly, { size: 12 });
  [["#4fc3f7", "locked"], ["#b08d5a", "shut"], ["#ff3d3d", "open"]].forEach(([c, n], i) => {
    g.fillStyle = c; g.fillRect(lx + 50 + i * 52, ly - 10, 10, 10);
    txt(g, n, lx + 63 + i * 52, ly, { size: 11 });
  });
  return ly + 22;
}

function drawTasks(g, S, x, y, maxW) {
  const title = S.stage === "night" ? "TONIGHT" : "CHORES";
  txt(g, title, x, y, { size: 13, color: "#ffe082" });
  y += 20;
  for (const tk of S.tasks) {
    const locked = tk.id === "bed" && !tk.done && !choresDone(S);
    txt(g, (tk.done ? "☑ " : "☐ ") + tk.label, x, y, { size: 13, color: tk.done ? "#7f8c7f" : locked ? "#9e9e9e" : "#f5f1e6", maxW });
    if (tk.done) { g.fillStyle = "rgba(160,190,160,0.7)"; g.fillRect(x + 22, y - 5, Math.min(maxW - 22, g.measureText(tk.label).width), 1.5); }
    y += 19;
  }
  return y;
}

function drawHUD(g, S, me, G, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = R.W, H = R.H;
  const cfg = NIGHTS[S.night];
  // clock (narrow screens: smaller, and centred in the space left of the minimap)
  const prog = S.stage === "evening" ? Math.min(1, S.mins / 240) : clamp((S.mins - cfg.wake) / (NIGHT_END - cfg.wake), 0, 1);
  const narrow = W < 760, cw = narrow ? 150 : 220, cx = narrow ? (W - 160) / 2 : W / 2;
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(cx - cw / 2, 10, cw, 58);
  txt(g, clockText(S.mins), cx, 44, { size: narrow ? 22 : 30, align: "center", color: S.stage === "night" ? "#ff5252" : "#ffe7b3", font: "'Courier New', monospace" });
  g.fillStyle = "#333"; g.fillRect(cx - cw / 2 + 15, 54, cw - 30, 6);
  g.fillStyle = S.stage === "night" ? "#ff8a65" : "#ffd180"; g.fillRect(cx - cw / 2 + 15, 54, (cw - 30) * prog, 6);
  txt(g, "NIGHT " + S.night + " · " + cfg.day, cx, 82, { size: 11, align: "center", color: "#bbb" });

  // status line, chores, messages (left column)
  let y = 30;
  const colW = Math.max(220, Math.min(460, (narrow ? W - 40 : cx - cw / 2 - 30)));
  if (!S.power) { if (Math.floor(t * 2) % 2 === 0) txt(g, "⚡ POWER OUT — fuse box at the end of the hall", 16, y, { size: 14, color: "#ff5252", maxW: colW }); y += 22; }
  if (S.stalker.mode === "in") { txt(g, "⚠ HE IS INSIDE THE HOUSE", 16, y, { size: 15, color: Math.floor(t * 4) % 2 ? "#ff1744" : "#fff" }); y += 22; }
  if (S.phone > 0) { txt(g, "☎ The landline is ringing (living room)", 16, y, { size: 13, color: "#b0bec5", maxW: colW }); y += 20; }
  if (narrow) y = Math.max(y, 100);
  y = drawTasks(g, S, 16, y + 6, colW) + 8;
  for (const m of G.msgs) {
    g.globalAlpha = Math.min(1, m.t / 1.5);
    y = wrapText(g, m.text, 16, y, colW, m.big ? 20 : 17, { size: m.big ? 15 : 13, color: m.c || "#ddd" }) + (m.big ? 21 : 18);
    g.globalAlpha = 1;
  }

  // minimap + players
  let my = drawMinimap(g, S, me, t);
  if (Object.keys(S.players).length > 1) for (const p of Object.values(S.players)) {
    const st = p.down ? "DOWN" : p.hidden ? "hiding" : "";
    g.fillStyle = p.color; g.fillRect(R.W - 200, my - 9, 10, 10);
    txt(g, p.name + (p.id === me.id ? " (you)" : "") + (st ? " — " + st : ""), R.W - 184, my, { size: 12, color: p.down ? "#ff8a80" : "#ddd" });
    my += 17;
  }


  // bottom-left status
  const bx = 16, by = H - 70;
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(bx - 6, by - 22, 250, 80);
  txt(g, "FLASHLIGHT " + (me.fl ? "ON" : "OFF") + " [F]", bx, by - 6, { size: 12, color: "#ddd" });
  g.fillStyle = "#333"; g.fillRect(bx, by, 150, 8);
  g.fillStyle = me.bat > 25 ? "#ffee58" : "#ff5252"; g.fillRect(bx, by, 150 * me.bat / 100, 8);
  txt(g, Math.round(me.bat) + "%", bx + 158, by + 8, { size: 12 });
  txt(g, "STAMINA [Shift]", bx, by + 26, { size: 12, color: "#ddd" });
  g.fillStyle = "#333"; g.fillRect(bx, by + 31, 150, 6);
  g.fillStyle = "#4fc3f7"; g.fillRect(bx, by + 31, 150 * G.stam / 100, 6);
  const holding = me.carry ? ITEM_NAMES[me.carry] + (me.carry === "plank" ? " ×" + me.carryN : "") + "  [G] put back" : "nothing";
  txt(g, "HOLDING: " + holding, bx, by + 54, { size: 12, color: me.carry ? "#ffe0a0" : "#999" });

  // crosshair + how to look around
  const ready = G.prompt && ((G.prompt.e && G.prompt.e.can) || (G.prompt.q && G.prompt.q.can));
  if (!me.down && !me.hidden) {
    g.fillStyle = ready ? "rgba(255,230,150,0.95)" : "rgba(255,255,255,0.55)";
    g.beginPath(); g.arc(W / 2, H / 2, ready ? 4 : 2.5, 0, 7); g.fill();
  }
  if (!G.plock) txt(g, G.noLock ? "Drag the mouse to look around  ·  arrow keys turn" : "Click to look around with the mouse  ·  arrow keys turn", W / 2, H - 150, { size: 13, align: "center", color: "#cfd8dc", maxW: W - 32 });

  // interaction prompt: [E] main action, [Q] second action
  if (G.prompt && !me.down) {
    const parts = [];
    if (G.prompt.e) parts.push({ s: (G.prompt.e.can ? "[E] " : "") + G.prompt.e.label, can: G.prompt.e.can });
    if (G.prompt.q) parts.push({ s: (G.prompt.q.can ? "[Q] " : "") + G.prompt.q.label, can: G.prompt.q.can });
    g.font = "bold 16px 'Courier New', monospace";
    const label = parts.map((p) => p.s).join("     ");
    const w = Math.min(W - 24, g.measureText(label).width + 30);
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(W / 2 - w / 2, H - 120, w, 34);
    txt(g, label, W / 2, H - 97, { size: 16, align: "center", color: parts.some((p) => p.can) ? "#fff" : "#aaa", maxW: W - 40 });
  }
  if (me.act) {
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(W / 2 - 120, H - 78, 240, 16);
    g.fillStyle = "#ffca28"; g.fillRect(W / 2 - 118, H - 76, 236 * Math.min(1, me.act.t / me.act.dur), 12);
    if (me.act.dur > 1) txt(g, "walk away to stop", W / 2, H - 50, { size: 11, align: "center", color: "#aaa" });
  }
  if (me.hidden) txt(g, "You are hiding. Press E to come out.", W / 2, H - 140, { size: 16, align: "center", color: "#90caf9" });
  if (me.down) {
    txt(g, "YOU WERE CAUGHT", W / 2, H / 2 - 20, { size: 34, align: "center", color: "#ff1744" });
    txt(g, "A friend can help you up — press E next to you", W / 2, H / 2 + 14, { size: 16, align: "center", maxW: W - 32 });
  }
}

// a text message drops in from the top of the screen, like a phone notification
function drawNote(g, G) {
  const n = G.notes && G.notes[0];
  if (!n) return;
  const W = R.W, nw = Math.min(440, W - 32), nh = 70;
  const k = n.t < 0.35 ? n.t / 0.35 : n.t > 5.6 ? Math.max(0, (6 - n.t) / 0.4) : 1;
  const ease = 1 - Math.pow(1 - k, 3);
  const x = (W - nw) / 2, y = -nh - 10 + ease * (nh + 22);
  g.save();
  g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 18;
  g.fillStyle = "rgba(242,242,247,0.96)"; rrect(g, x, y, nw, nh, 16); g.fill();
  g.restore();
  // the green messages icon
  g.fillStyle = "#34c759"; rrect(g, x + 12, y + 12, 22, 22, 6); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.ellipse(x + 23, y + 22, 7, 5.5, 0, 0, 7); g.fill();
  g.beginPath(); g.moveTo(x + 18, y + 25); g.lineTo(x + 16, y + 30); g.lineTo(x + 22, y + 26); g.fill();
  txt(g, "MESSAGES", x + 42, y + 27, { size: 11, color: "#6b6b70", shadow: false, font: "system-ui, sans-serif" });
  txt(g, "now", x + nw - 14, y + 27, { size: 11, color: "#8e8e93", shadow: false, align: "right", font: "system-ui, sans-serif" });
  txt(g, n.from, x + 42, y + 45, { size: 14, color: "#111", shadow: false, font: "system-ui, sans-serif" });
  txt(g, n.text, x + 42, y + 62, { size: 13, color: "#222", shadow: false, weight: "normal", font: "system-ui, sans-serif", maxW: nw - 56 });
}

// on the landline: the caller's words appear as subtitles while you hold the handset
function drawCall(g, G) {
  const c = G.call;
  if (!c) return;
  const W = R.W, H = R.H, bw = Math.min(620, W - 32), bx = (W - bw) / 2, by = H - 220;
  const a = Math.min(1, c.t * 3, (c.dur - c.t) * 2);
  g.globalAlpha = Math.max(0, a);
  g.fillStyle = "rgba(0,0,0,0.75)"; rrect(g, bx, by, bw, 76, 8); g.fill();
  txt(g, "☎ LANDLINE · unknown caller", bx + 16, by + 22, { size: 12, color: "#ff8a80" });
  const shown = c.t < 1.3 ? "" : c.text.slice(0, Math.floor((c.t - 1.3) * 16));
  let line = c.t < 1.3 ? "(breathing)" : shown;
  if (c.t > c.dur - 1) line = "*click*  The line went dead.";
  wrapText(g, line, bx + 16, by + 48, bw - 32, 18, { size: 15, color: "#f2f2f2", weight: "normal" });
  g.globalAlpha = 1;
}

// story cards, falling asleep, sunrise
function drawStory(g, S, G, t) {
  const W = R.W, H = R.H;
  if (S.stage === "sleep") {
    const k = Math.min(1, S.stageT / 1.5);
    g.fillStyle = `rgba(0,0,0,${k})`; g.fillRect(0, 0, W, H);
    g.globalAlpha = Math.min(1, Math.max(0, (S.stageT - 1) / 1.2));
    txt(g, "z  z  z", W / 2, H / 2, { size: 28, align: "center", color: "#8a8fa8" });
    g.globalAlpha = 1;
  }
  if (S.stage === "night" && S.stageT < 2) {
    g.fillStyle = `rgba(0,0,0,${1 - S.stageT / 2})`; g.fillRect(0, 0, W, H);
  }
  if (S.stage === "morning") {
    g.fillStyle = `rgba(255,214,150,${Math.min(0.55, S.stageT / 4)})`; g.fillRect(0, 0, W, H);
  }
  if (G.card) {
    const c = G.card, a = Math.max(0, Math.min(1, (c.dur - c.t) * 2, c.t));
    g.globalAlpha = a;
    const bh = 120 + c.lines.length * 26;
    const grd = g.createLinearGradient(0, H / 2 - bh, 0, H / 2 + bh);
    grd.addColorStop(0, "rgba(0,0,0,0)"); grd.addColorStop(0.3, "rgba(0,0,0,0.82)"); grd.addColorStop(0.7, "rgba(0,0,0,0.82)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, H / 2 - bh, W, bh * 2);
    let y = H / 2 - c.lines.length * 13 - 10;
    txt(g, c.title, W / 2, y, { size: W < 760 ? 28 : 40, align: "center", color: "#ff5252" });
    y += 40;
    for (const l of c.lines) { txt(g, l, W / 2, y, { size: W < 760 ? 13 : 17, align: "center", color: "#eee", maxW: W - 40, weight: "normal" }); y += 26; }
    g.globalAlpha = 1;
  }
}

function wrapText(g, s, x, y, maxW, lh, o) {
  g.font = (o.weight || "bold") + " " + (o.size || 14) + "px 'Courier New', monospace";
  const words = s.split(" ");
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (g.measureText(test).width > maxW && line) { txt(g, line, x, y, o); line = w; y += lh; }
    else line = test;
  }
  if (line) txt(g, line, x, y, o);
  return y;
}

function drawPost(g, S, me, G, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  // film grain
  g.globalAlpha = 0.6;
  const ox = Math.random() * 256 | 0, oy = Math.random() * 256 | 0;
  g.fillStyle = g.createPattern(R.grain, "repeat");
  g.save(); g.translate(-ox, -oy); g.fillRect(ox, oy, R.W, R.H); g.restore();
  g.globalAlpha = 1;
  // vignette
  const dread = G.dread || 0;
  const vg = g.createRadialGradient(R.W / 2, R.H / 2, R.H * 0.25, R.W / 2, R.H / 2, R.H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(${40 * dread | 0},0,0,${0.55 + dread * 0.3})`);
  g.fillStyle = vg; g.fillRect(0, 0, R.W, R.H);
  if (me.hidden) {
    if (tileAt(Math.floor(me.hideX), Math.floor(me.hideY)) === "b") {
      // under the bed: the frame fills the top of your view
      const bg = g.createLinearGradient(0, 0, 0, R.H * 0.55);
      bg.addColorStop(0, "rgba(8,5,3,1)"); bg.addColorStop(0.85, "rgba(8,5,3,0.97)"); bg.addColorStop(1, "rgba(8,5,3,0)");
      g.fillStyle = bg; g.fillRect(0, 0, R.W, R.H * 0.55);
    } else {
      // inside the closet: peeking through the slats
      g.fillStyle = "rgba(10,7,4,0.92)";
      for (let y = 0; y < R.H; y += 26) g.fillRect(0, y, R.W, 16);
      g.fillRect(0, 0, R.W * 0.12, R.H); g.fillRect(R.W * 0.88, 0, R.W * 0.12, R.H);
    }
  }
  if (me.down) { g.fillStyle = "rgba(120,0,0,0.25)"; g.fillRect(0, 0, R.W, R.H); }
}

function drawNameTags(g, S, me, G) {
  for (const p of Object.values(S.players)) {
    if (p.id === G.myId || p.hidden) continue;
    const r = G.rpos[p.id] || p;
    const d = Math.hypot(r.x - me.x, r.y - me.y);
    if (d > 14 || !los(S, me.x, me.y, r.x, r.y)) continue;
    const sp = projectToScreen(r.x, p.down ? 0.7 : 2.0, r.y);
    if (!sp) continue;
    txt(g, p.name + (p.down ? " (DOWN — help them up!)" : ""), sp[0], sp[1], { size: 13, align: "center", color: p.down ? "#ff8a80" : p.color });
  }
}

function drawOverlay(S, me, G, t) {
  const g = R.h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, R.W, R.H);
  if (G.scare > 0 && me.down) {
    // jumpscare: violent red/black flashes over his face
    if (G.scare > 1.25 || Math.random() < 0.2) { g.fillStyle = Math.random() < 0.5 ? "rgba(150,0,0,0.45)" : "rgba(0,0,0,0.6)"; g.fillRect(0, 0, R.W, R.H); }
    return;
  }
  drawNameTags(g, S, me, G);
  drawPost(g, S, me, G, t);
  if (G.phase === "play" && S.stage !== "sleep") { drawHUD(g, S, me, G, t); drawCall(g, G); }
  drawStory(g, S, G, t);
  drawNote(g, G);
}
