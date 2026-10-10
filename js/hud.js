// ---------------------------------------------------------------------------
// 2D overlay drawn on top of the 3D view: the aiming dot and prompts, your
// wristwatch, the clipboard, the phone, the safe's keypad, messages, eyelids,
// film grain and the hit flashes. There is no clock or chore list on screen:
// check your watch (T) and read the clipboard (C).
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

function wrapText(g, s, x, y, maxW, lh, o) {
  g.font = (o.weight || "bold") + " " + (o.size || 14) + "px " + (o.font || "'Courier New', monospace");
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

const ITEM_NAMES = {
  food: "Frozen dinner", hot: "Hot dinner", plate: "Dirty plate", trash: "Trash bag", bulb: "Light bulb",
  laundry: "Clean laundry", clipboard: "Clipboard", key: "Front door key", batteries: "Batteries",
};
const MAP_X0 = 1, MAP_X1 = 27, MAP_Y1 = 23; // minimap covers the apartment and both yards

function drawMinimap(g, S, me, t) {
  const s = R.W < 760 ? 4 : 5;
  const cols = MAP_X1 - MAP_X0 + 1, rows = MAP_Y1 - HOUSE.y0 + 1;
  const w = cols * s, h = rows * s, x0 = R.W - w - 14, y0 = 14;
  g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
  for (let y = HOUSE.y0; y <= MAP_Y1; y++) for (let x = MAP_X0; x <= MAP_X1; x++) {
    const c = tileAt(x, y);
    const mx = x0 + (x - MAP_X0) * s, my = y0 + (y - HOUSE.y0) * s;
    if (c === "#" || c === "F") g.fillStyle = "#666";
    else if ("WD".includes(c) || c === ",") continue;
    else if (c === "y") g.fillStyle = "#1d2a18";
    else if (c === "f" || c === "G") g.fillStyle = "#4a3b2c";
    else if (c === "d") g.fillStyle = S.idoors[IDOOR_AT[x + "," + y]].open ? "#2a2a33" : "#b08d5a";
    else if (c === "." || c === "a") {
      const r = roomAt(x, y), st = r && S.rooms[r.id];
      g.fillStyle = st && S.power && st.on && st.bulb ? "#3b3426" : "#1c1c22";
    } else g.fillStyle = "#3a4a5a";
    g.fillRect(mx, my, s, s);
  }
  ENTRIES.forEach((E, i) => {
    const e = S.entries[i];
    const mx = x0 + (E.x - MAP_X0) * s, my = y0 + (E.y - HOUSE.y0) * s;
    let col = E.kind === "door" ? (e.open ? "#ff3d3d" : e.locked ? "#4fc3f7" : "#b08d5a") : "#5c7a99";
    if (e.broken) col = "#ff00aa";
    g.fillStyle = col; g.fillRect(mx - 1, my - 1, s + 2, s + 2);
  });
  for (const p of Object.values(S.players)) {
    if (p.escaped || p.down) continue;
    const px = p.id === me.id ? me.x : p.x, py = p.id === me.id ? me.y : p.y;
    g.fillStyle = p.color;
    const cx = x0 + (px - MAP_X0) * s, cy = y0 + (py - HOUSE.y0) * s;
    g.beginPath(); g.arc(cx, cy, p.id === me.id ? 3.5 : 2.5, 0, 7); g.fill();
    if (p.id === me.id) {
      g.strokeStyle = p.color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(me.a) * 11, cy + Math.sin(me.a) * 11); g.stroke();
    }
  }
  return y0 + h + 22;
}

// three marks: how many hits you can still take
function drawStrikes(g, me, x, y) {
  txt(g, "HITS", x, y + 5, { size: 11, color: "#9e9e9e" });
  for (let i = 0; i < MAX_STRIKES; i++) {
    const hit = i < (me.strikes || 0), cx = x + 50 + i * 22;
    g.strokeStyle = hit ? "#ff1744" : "rgba(255,255,255,0.55)"; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, y, 7, 0, 7); g.stroke();
    if (hit) { g.beginPath(); g.moveTo(cx - 5, y - 5); g.lineTo(cx + 5, y + 5); g.moveTo(cx + 5, y - 5); g.lineTo(cx - 5, y + 5); g.stroke(); }
  }
}

function drawHUD(g, S, me, G, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = R.W, H = R.H;
  const narrow = W < 760;
  const colW = Math.max(220, Math.min(460, narrow ? W - 40 : W * 0.42));

  // left column: warnings and messages
  let y = 30;
  if (S.curfew.state === "warn") {
    txt(g, "CURFEW IN " + Math.ceil(S.curfew.t) + " — GET IN BED, EYES SHUT (LOOK UP)", 16, y, { size: 15, color: Math.floor(t * 3) % 2 ? "#ff1744" : "#fff", maxW: colW }); y += 24;
  } else if (S.curfew.state === "check") {
    txt(g, "CURFEW — HE'S CHECKING THE ROOMS", 16, y, { size: 15, color: "#ff5252", maxW: colW }); y += 24;
  }
  if (!S.power) { if (Math.floor(t * 2) % 2 === 0) txt(g, "⚡ POWER OUT — fuse box in the laundry room", 16, y, { size: 14, color: "#ff5252", maxW: colW }); y += 22; }
  if (S.stalker.state === "chase" && S.stalker.target === me.id) { txt(g, S.stalker.rage ? "⚠ HE'S ENRAGED. HIDE." : "⚠ HE'S CHASING YOU", 16, y, { size: 15, color: Math.floor(t * 4) % 2 ? "#ff1744" : "#fff" }); y += 22; }
  if (S.phone > 0) { txt(g, "☎ The landline is ringing (living room)", 16, y, { size: 13, color: "#b0bec5", maxW: colW }); y += 20; }
  y += 6;
  for (const m of G.msgs) {
    g.globalAlpha = Math.min(1, m.t / 1.5);
    y = wrapText(g, m.text, 16, y, colW, m.big ? 20 : 17, { size: m.big ? 15 : 13, color: m.c || "#ddd" }) + (m.big ? 21 : 18);
    g.globalAlpha = 1;
  }

  // top right: hits, friends, and the minimap if you turned it on (M)
  let ry = 24;
  if (G.showMap) ry = drawMinimap(g, S, me, t);
  drawStrikes(g, me, W - 130, ry);
  ry += 26;
  if (Object.keys(S.players).length > 1) for (const p of Object.values(S.players)) {
    const st = p.escaped ? "got out" : p.down ? "knocked out" : p.cut ? "TAKEN" : p.hidden ? "hiding" : "";
    g.fillStyle = p.color; g.fillRect(W - 200, ry - 9, 10, 10);
    txt(g, p.name + (p.id === me.id ? " (you)" : "") + (st ? " — " + st : ""), W - 184, ry, { size: 12, color: p.down || p.cut ? "#ff8a80" : p.escaped ? "#a5d6a7" : "#ddd", maxW: 190 });
    ry += 17;
  }

  // bottom: what you're holding, stamina
  const holding = me.carry ? ITEM_NAMES[me.carry] || me.carry : null;
  if (holding) {
    let hint = "  [G] put back";
    if (me.carry === "clipboard") hint = "  [C] read  ·  [G] put back";
    if (me.carry === "batteries") hint = "  [R] put them in your flashlight";
    txt(g, "HOLDING: " + holding + hint, 16, H - 22, { size: 12, color: "#ffe0a0", maxW: W - 32 });
  }
  if (G.stam < 99) {
    g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(W / 2 - 61, H - 15, 122, 6);
    g.fillStyle = G.stam > 25 ? "rgba(180,220,255,0.8)" : "rgba(255,120,120,0.9)"; g.fillRect(W / 2 - 60, H - 14, 120 * G.stam / 100, 4);
  }

  // the aiming dot: it grows when you're looking right at something you can use
  const ready = G.prompt && ((G.prompt.e && G.prompt.e.can) || (G.prompt.q && G.prompt.q.can));
  if (!me.hidden && !me.cut && !G.readClip && !G.keypad) {
    if (ready) {
      g.strokeStyle = "rgba(255,230,150,0.95)"; g.lineWidth = 2;
      g.beginPath(); g.arc(W / 2, H / 2, 7, 0, 7); g.stroke();
      g.fillStyle = "rgba(255,230,150,0.95)"; g.beginPath(); g.arc(W / 2, H / 2, 2, 0, 7); g.fill();
    } else {
      g.fillStyle = G.prompt ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.45)";
      g.beginPath(); g.arc(W / 2, H / 2, 2.2, 0, 7); g.fill();
    }
  }
  if (!G.plock) txt(g, G.noLock ? "Drag the mouse to look around  ·  arrow keys turn" : "Click to look around with the mouse  ·  arrow keys turn", W / 2, H - 150, { size: 13, align: "center", color: "#cfd8dc", maxW: W - 32 });

  // what you're looking at: [E] main action, [Q] second action
  if (G.prompt && !me.hidden && !G.readClip && !G.keypad) {
    const parts = [];
    if (G.prompt.e) parts.push({ s: (G.prompt.e.can ? "[E] " : "") + G.prompt.e.label, can: G.prompt.e.can });
    if (G.prompt.q) parts.push({ s: (G.prompt.q.can ? "[Q] " : "") + G.prompt.q.label, can: G.prompt.q.can });
    const label = parts.map((p) => p.s).join("     ");
    g.font = "bold 15px 'Courier New', monospace";
    const w = Math.min(W - 24, g.measureText(label).width + 26);
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(W / 2 - w / 2, H / 2 + 26, w, 28);
    txt(g, label, W / 2, H / 2 + 45, { size: 15, align: "center", color: parts.some((p) => p.can) ? "#fff" : "#aaa", maxW: W - 40 });
  }
  if (me.act) {
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(W / 2 - 120, H / 2 + 62, 240, 14);
    g.fillStyle = "#ffca28"; g.fillRect(W / 2 - 118, H / 2 + 64, 236 * Math.min(1, me.act.t / me.act.dur), 10);
    if (me.act.dur > 1) txt(g, "walk away to stop", W / 2, H / 2 + 92, { size: 11, align: "center", color: "#aaa" });
  }
  if (me.hidden === "bed") {
    const shut = (me.pitch || 0) > 0.9;
    const left = Math.max(0, Math.ceil(BED_MAX - (me.hideT || 0)));
    const line = shut ? "Eyes shut. He can't see you." : "Under the blanket. Look up at the ceiling to shut your eyes.";
    txt(g, line, W / 2, H - 120, { size: 15, align: "center", color: shut ? "#90caf9" : "#ffe082", maxW: W - 32 });
    txt(g, (S.curfew.state !== "none" ? "Stay put until curfew is over." : left + "s before you have to get up.") + "  [E] get up", W / 2, H - 98, { size: 13, align: "center", color: left <= 5 && S.curfew.state === "none" ? "#ff8a80" : "#b0bec5", maxW: W - 32 });
  } else if (me.hidden === "closet") txt(g, "Hiding in the closet. If he saw you get in, he knows.  [E] come out", W / 2, H - 110, { size: 15, align: "center", color: "#90caf9", maxW: W - 32 });
  if (me.stun > 0) txt(g, "...", W / 2, H / 2 - 30, { size: 28, align: "center", color: "#ff8a80" });
}

// your wristwatch: raise it with T
function drawWatch(g, S, G) {
  const k = Math.min(1, G.watchT * 4, (G.watchMax - G.watchT) * 4);
  if (k <= 0) return;
  const W = R.W, H = R.H, r = Math.min(70, H * 0.12);
  const cx = W * 0.3, cy = H + r * 1.6 - k * (r * 3.3);
  g.save();
  // the strap and wrist
  g.fillStyle = "#c69c7c"; rrect(g, cx - r * 1.5, cy - r * 0.55, r * 3.0, r * 1.1, r * 0.5); g.fill();
  g.fillStyle = "#1d1d20"; rrect(g, cx - r * 0.55, cy - r * 1.6, r * 1.1, r * 3.2, r * 0.2); g.fill();
  // the case and face
  g.fillStyle = "#3a3d42"; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.fillStyle = "#0d1410"; g.beginPath(); g.arc(cx, cy, r * 0.84, 0, 7); g.fill();
  const glow = "#7dffb0";
  txt(g, clockText(S.mins).replace(" ", " "), cx, cy + r * 0.12, { size: Math.round(r * 0.42), align: "center", color: glow, shadow: false, font: "'Courier New', monospace" });
  const next = CURFEWS.find((m) => m > S.mins);
  txt(g, next != null && S.curfew.state === "none" ? "curfew " + clockText(next).replace(":00", "").replace(" PM", "p").replace(" AM", "a") : S.curfew.state !== "none" ? "CURFEW" : "", cx, cy + r * 0.5, { size: Math.round(r * 0.17), align: "center", color: S.curfew.state !== "none" ? "#ff5252" : "#58b882", shadow: false });
  g.restore();
}

// the clipboard with your chores (and, when they're done, the sticky note)
function drawClipboard(g, S, G) {
  const W = R.W, H = R.H;
  const bw = Math.min(420, W - 40), bh = Math.min(H - 60, 520), bx = (W - bw) / 2, by = (H - bh) / 2 + 10;
  g.save();
  g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#8a5a32"; rrect(g, bx, by, bw, bh, 14); g.fill();
  g.fillStyle = "#f4f0e2"; g.fillRect(bx + 18, by + 36, bw - 36, bh - 54);
  g.fillStyle = "#9aa0a6"; rrect(g, bx + bw / 2 - 50, by + 6, 100, 40, 6); g.fill();
  g.fillStyle = "#6c7177"; g.fillRect(bx + bw / 2 - 34, by + 20, 68, 8);
  let y = by + 76;
  txt(g, "CHORES — Apt 302", bx + 34, y, { size: 18, color: "#2b2b2b", shadow: false }); y += 12;
  g.fillStyle = "rgba(60,90,160,0.25)"; for (let ly = y + 14; ly < by + bh - 30; ly += 26) g.fillRect(bx + 24, ly, bw - 48, 1);
  y += 22;
  for (const tk of S.tasks) {
    y = wrapText(g, (tk.done ? "☑ " : "☐ ") + tk.label, bx + 34, y, bw - 70, 20, { size: 14, color: tk.done ? "#7a8a7a" : "#222", shadow: false });
    if (tk.done) { g.fillStyle = "rgba(40,80,40,0.6)"; g.fillRect(bx + 54, y - 5, Math.min(bw - 90, 260), 1.5); }
    y += 26;
  }
  if (S.note) {
    y = wrapText(g, (S.unlocked ? "☑ " : "☐ ") + "Open the safe in the laundry room, take the key", bx + 34, y, bw - 70, 20, { size: 14, color: "#222", shadow: false }) + 26;
    wrapText(g, "☐ Unlock the front door and GET OUT", bx + 34, y, bw - 70, 20, { size: 14, color: "#222", shadow: false });
    // the sticky note
    const nx = bx + bw - 150, ny = by + bh - 150;
    g.translate(nx + 60, ny + 55); g.rotate(-0.06);
    g.fillStyle = "#ffe866"; g.fillRect(-62, -55, 124, 112);
    g.fillStyle = "rgba(0,0,0,0.08)"; g.fillRect(-62, -55, 124, 14);
    txt(g, "safe:", 0, -14, { size: 16, align: "center", color: "#5a4a10", shadow: false, font: "'Comic Sans MS', 'Segoe Print', cursive" });
    txt(g, S.code || "????", 0, 22, { size: 30, align: "center", color: "#3a2a00", shadow: false, font: "'Comic Sans MS', 'Segoe Print', cursive" });
  } else {
    txt(g, "Do all of these to finish your night.", bx + 34, by + bh - 34, { size: 12, color: "#6b6b6b", shadow: false, weight: "normal" });
  }
  g.restore();
  txt(g, "[C] put it down", W / 2, by + bh + 22 > H - 6 ? H - 8 : by + bh + 22, { size: 13, align: "center", color: "#cfd8dc" });
}

// your phone, held in your left hand (your flashlight goes in your pocket)
function drawPhone(g, S, G) {
  const ph = G.phone;
  if (!ph) return;
  const W = R.W, H = R.H;
  const k = Math.min(1, ph.t * 4, Math.max(0, ph.dur - ph.t) * 4);
  const pw = Math.min(205, W * 0.3), phh = pw * 1.9;
  const px = W * 0.08, py = H - phh * 0.92 * k + (1 - k) * 40;
  g.save();
  g.fillStyle = "#c69c7c"; rrect(g, px + pw * 0.15, py + phh * 0.55, pw * 0.7, phh * 0.6, pw * 0.2); g.fill();
  g.fillStyle = "#111215"; rrect(g, px, py, pw, phh, pw * 0.13); g.fill();
  g.fillStyle = "#1b1f2a"; rrect(g, px + 8, py + 8, pw - 16, phh - 16, pw * 0.1); g.fill();
  g.fillStyle = "#000"; rrect(g, px + pw / 2 - 26, py + 14, 52, 12, 6); g.fill();
  txt(g, "Unknown", px + pw / 2, py + 48, { size: 14, align: "center", color: "#e6e6e6", shadow: false, font: "system-ui, sans-serif" });
  txt(g, clockText(S.mins), px + pw / 2, py + 64, { size: 10, align: "center", color: "#8b8f99", shadow: false, font: "system-ui, sans-serif", weight: "normal" });
  // the message bubbles, newest at the bottom
  let y = py + phh - 40 - (ph.opts ? 92 : 0);
  const msgs = ph.thread.slice(-4).reverse();
  for (const m of msgs) {
    g.font = "15px system-ui, sans-serif";
    const lines = [], words = m.text.split(" ");
    let line = "";
    for (const w of words) { const tl = line ? line + " " + w : w; if (g.measureText(tl).width > pw - 70 && line) { lines.push(line); line = w; } else line = tl; }
    if (line) lines.push(line);
    const bh = lines.length * 19 + 14, bwid = Math.min(pw - 40, Math.max(...lines.map((l) => g.measureText(l).width)) + 22);
    y -= bh;
    if (y < py + 74) break;
    const mine = m.me, bx = mine ? px + pw - 18 - bwid : px + 18;
    g.fillStyle = mine ? "#2f7cf6" : "#3a3c44"; rrect(g, bx, y, bwid, bh, 12); g.fill();
    lines.forEach((l, i) => txt(g, l, bx + 11, y + 22 + i * 19, { size: 15, color: "#fff", shadow: false, weight: "normal", font: "system-ui, sans-serif" }));
    y -= 8;
  }
  if (ph.opts) {
    ph.opts.forEach((o, i) => {
      const oy = py + phh - 124 + i * 44;
      g.fillStyle = "#2a2d36"; rrect(g, px + 16, oy, pw - 32, 36, 10); g.fill();
      txt(g, "[" + (i + 1) + "] " + o, px + 28, oy + 24, { size: 14, color: "#dfe6ff", shadow: false, font: "system-ui, sans-serif", maxW: pw - 50 });
    });
    txt(g, "press 1 or 2 to text back", px + pw / 2, py + phh - 22, { size: 11, align: "center", color: "#8b8f99", shadow: false, font: "system-ui, sans-serif", weight: "normal" });
  }
  g.restore();
}

// the safe's keypad
function drawKeypad(g, S, G) {
  const kp = G.keypad;
  if (!kp) return;
  const W = R.W, H = R.H, kw = 250, kh = 330, kx = (W - kw) / 2, ky = (H - kh) / 2;
  g.save();
  g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#2c2f33"; rrect(g, kx, ky, kw, kh, 14); g.fill();
  g.fillStyle = kp.bad > 0 ? "#3a0d0d" : "#0d1a10"; rrect(g, kx + 20, ky + 20, kw - 40, 54, 6); g.fill();
  const shown = kp.digits.padEnd(4, "-").split("").join(" ");
  txt(g, kp.bad > 0 ? "WRONG" : shown, kx + kw / 2, ky + 58, { size: 28, align: "center", color: kp.bad > 0 ? "#ff5252" : "#7dffb0", shadow: false });
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "×"];
  keys.forEach((k, i) => {
    const bx = kx + 26 + (i % 3) * 68, by = ky + 92 + Math.floor(i / 3) * 56;
    g.fillStyle = "#44484e"; rrect(g, bx, by, 58, 46, 8); g.fill();
    txt(g, k, bx + 29, by + 31, { size: 20, align: "center", color: "#eee", shadow: false });
  });
  g.restore();
  txt(g, "Type the 4 numbers on your keyboard  ·  Backspace fixes  ·  Esc closes", W / 2, ky + kh + 24, { size: 13, align: "center", color: "#cfd8dc", maxW: W - 32 });
}

// a text message drops in from the top of the screen (when your phone isn't out)
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

// story cards, the third-strike scenes, escaping
function drawStory(g, S, me, G, t) {
  const W = R.W, H = R.H;
  const cut = S.cut && S.cut.id === me.id ? S.cut : null;
  if (cut) {
    if (cut.ph === "drag") {
      g.fillStyle = `rgba(40,0,0,${0.35 + Math.sin(t * 3) * 0.1})`; g.fillRect(0, 0, W, H);
      txt(g, "He's dragging you by the foot...", W / 2, H - 60, { size: 18, align: "center", color: "#ff8a80" });
    } else if (cut.ph === "tv") {
      txt(g, "Don't turn around.", W / 2, H - 60, { size: 18, align: "center", color: "#cfd8dc" });
    } else if (cut.ph === "ko") {
      g.fillStyle = `rgba(0,0,0,${Math.min(1, cut.t * 1.5)})`; g.fillRect(0, 0, W, H);
      if (cut.t > 0.8) txt(g, "KNOCKED OUT", W / 2, H / 2, { size: W < 760 ? 30 : 44, align: "center", color: "#ff1744" });
    } else if (cut.ph === "carry") {
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 0, W, H);
      txt(g, "He's carrying you back to bed...", W / 2, H - 60, { size: 18, align: "center", color: "#cfd8dc" });
    }
  }
  if (me.escaped || me.down) {
    g.fillStyle = "rgba(0,0,0,0.88)"; g.fillRect(0, 0, W, H);
    txt(g, me.escaped ? "YOU GOT OUT" : "KNOCKED OUT", W / 2, H / 2 - 10, { size: W < 760 ? 30 : 44, align: "center", color: me.escaped ? "#a5d6a7" : "#ff1744" });
    txt(g, "Waiting for the others...", W / 2, H / 2 + 26, { size: 16, align: "center", color: "#cfd8dc" });
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
  if (me.hidden === "closet") {
    // inside the closet: peeking through the slats
    g.fillStyle = "rgba(10,7,4,0.92)";
    for (let y = 0; y < R.H; y += 26) g.fillRect(0, y, R.W, 16);
    g.fillRect(0, 0, R.W * 0.12, R.H); g.fillRect(R.W * 0.88, 0, R.W * 0.12, R.H);
  }
  if (me.hidden === "bed") {
    // the edge of the blanket at the bottom of your view
    const bg = g.createLinearGradient(0, R.H * 0.72, 0, R.H);
    bg.addColorStop(0, "rgba(40,55,80,0)"); bg.addColorStop(0.4, "rgba(40,55,80,0.85)"); bg.addColorStop(1, "rgba(25,35,55,1)");
    g.fillStyle = bg; g.fillRect(0, R.H * 0.72, R.W, R.H * 0.28);
  }
  // eyelids: they close when you look up in bed
  const lid = G.lid || 0;
  if (lid > 0.01) {
    const h = R.H / 2 * lid;
    g.fillStyle = "#050302";
    g.beginPath(); g.moveTo(0, 0); g.lineTo(R.W, 0); g.lineTo(R.W, h * 0.9); g.quadraticCurveTo(R.W / 2, h * 1.25, 0, h * 0.9); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, R.H); g.lineTo(R.W, R.H); g.lineTo(R.W, R.H - h * 0.9); g.quadraticCurveTo(R.W / 2, R.H - h * 1.25, 0, R.H - h * 0.9); g.closePath(); g.fill();
  }
  // getting hit: a red flash
  if (G.hitFx > 0) { g.fillStyle = `rgba(160,0,0,${Math.min(0.6, G.hitFx)})`; g.fillRect(0, 0, R.W, R.H); }
}

function drawNameTags(g, S, me, G) {
  for (const p of Object.values(S.players)) {
    if (p.id === G.myId || p.hidden || p.escaped || p.down) continue;
    const r = G.rpos[p.id] || p;
    const d = Math.hypot(r.x - me.x, r.y - me.y);
    if (d > 14 || !los(S, me.x, me.y, r.x, r.y)) continue;
    const sp = projectToScreen(r.x, 2.0, r.y);
    if (!sp) continue;
    txt(g, p.name + (p.cut ? " (TAKEN)" : ""), sp[0], sp[1], { size: 13, align: "center", color: p.cut ? "#ff8a80" : p.color });
  }
}

function drawOverlay(S, me, G, t) {
  const g = R.h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, R.W, R.H);
  if (G.scare > 0) {
    // getting grabbed: violent red/black flashes over his face
    if (G.scare > 1.25 || Math.random() < 0.2) { g.fillStyle = Math.random() < 0.5 ? "rgba(150,0,0,0.45)" : "rgba(0,0,0,0.6)"; g.fillRect(0, 0, R.W, R.H); }
    return;
  }
  drawNameTags(g, S, me, G);
  drawPost(g, S, me, G, t);
  const inPlay = G.phase === "play" && !me.escaped && !me.down;
  if (inPlay && !(S.cut && S.cut.id === me.id)) {
    drawHUD(g, S, me, G, t);
    drawCall(g, G);
    if (G.watchT > 0) drawWatch(g, S, G);
    // you can't read your phone with your eyes shut
    if (G.phone && G.lid < 0.5) drawPhone(g, S, G); else if (!G.phone) drawNote(g, G);
    if (G.readClip && me.carry === "clipboard") drawClipboard(g, S, G);
    drawKeypad(g, S, G);
  }
  drawStory(g, S, me, G, t);
}
