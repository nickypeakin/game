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
  if (o.shadow !== false) { g.fillStyle = "rgba(0,0,0,0.85)"; g.fillText(s, x + 2, y + 2); }
  g.fillStyle = o.color || "#eee";
  g.fillText(s, x, y);
}

function drawMinimap(g, S, me, t) {
  const s = 6, x0 = R.W - (HOUSE.x1 - HOUSE.x0 + 1) * s - 14, y0 = 14;
  const w = (HOUSE.x1 - HOUSE.x0 + 1) * s, h = (HOUSE.y1 - HOUSE.y0 + 1) * s;
  g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(x0 - 6, y0 - 6, w + 12, h + 12);
  for (let y = HOUSE.y0; y <= HOUSE.y1; y++) for (let x = HOUSE.x0; x <= HOUSE.x1; x++) {
    const c = tileAt(x, y);
    const mx = x0 + (x - HOUSE.x0) * s, my = y0 + (y - HOUSE.y0) * s;
    if (c === "#" || c === "F") g.fillStyle = "#555";
    else if ("WDB".includes(c)) continue;
    else if (c === "P") g.fillStyle = "#9b7a50";
    else if (c === "C" || c === "b") g.fillStyle = "#3a4a5a";
    else g.fillStyle = "#1c1c22";
    g.fillRect(mx, my, s, s);
  }
  ENTRIES.forEach((E, i) => {
    const e = S.entries[i];
    const mx = x0 + (E.x - HOUSE.x0) * s, my = y0 + (E.y - HOUSE.y0) * s;
    let col = ["#ff3d3d", "#ff9800", "#ffd600", "#4caf50"][e.boards];
    if (e.broken) col = Math.floor(t * 4) % 2 ? "#ff00aa" : "#300";
    g.fillStyle = col; g.fillRect(mx - 1, my - 1, s + 2, s + 2);
    if (e.hit > 0) { g.strokeStyle = `rgba(255,255,255,${e.hit})`; g.lineWidth = 2; g.strokeRect(mx - 4, my - 4, s + 8, s + 8); }
  });
  if (!S.power && Math.floor(t * 3) % 2) { g.fillStyle = "#ffeb3b"; g.fillRect(x0 + (21 - HOUSE.x0) * s - 1, y0 + (11 - HOUSE.y0) * s - 1, s + 2, s + 2); }
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
  txt(g, "boards: ", x0 - 4, y0 + h + 22, { size: 12 });
  ["0", "1", "2", "3"].forEach((n, i) => {
    g.fillStyle = ["#ff3d3d", "#ff9800", "#ffd600", "#4caf50"][i]; g.fillRect(x0 + 58 + i * 30, y0 + h + 12, 10, 10);
    txt(g, n, x0 + 72 + i * 30, y0 + h + 22, { size: 12 });
  });
  return y0 + h + 44;
}

function drawHUD(g, S, me, G, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = R.W, H = R.H;
  // clock
  const prog = Math.min(1, S.time / NIGHT_LEN);
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(W / 2 - 110, 10, 220, 58);
  txt(g, clockText(S.time), W / 2, 44, { size: 30, align: "center", color: "#ff5252", font: "'Courier New', monospace" });
  g.fillStyle = "#333"; g.fillRect(W / 2 - 95, 54, 190, 6);
  g.fillStyle = "#ff8a65"; g.fillRect(W / 2 - 95, 54, 190 * prog, 6);
  txt(g, "survive until 6:00 AM", W / 2, 82, { size: 11, align: "center", color: "#aaa" });

  // power
  let y = 30;
  if (S.power) txt(g, "⚡ POWER ON", 16, y, { size: 15, color: "#ffe082" });
  else if (Math.floor(t * 2) % 2 === 0) txt(g, "⚡ POWER OUT! Fix the fuse box (hallway)", 16, y, { size: 15, color: "#ff5252" });
  y += 22;
  if (S.phone > 0) { txt(g, "☎ The phone is ringing (kitchen)", 16, y, { size: 13, color: "#b0bec5" }); y += 20; }
  if (S.tv) { txt(g, "📺 The TV is on... it might attract him", 16, y, { size: 13, color: "#90caf9" }); y += 20; }
  if (S.stalker.mode === "in") { txt(g, "⚠ HE IS INSIDE", 16, y, { size: 16, color: Math.floor(t * 4) % 2 ? "#ff1744" : "#fff" }); y += 22; }

  // message log
  y += 6;
  for (const m of G.msgs) {
    const a = Math.min(1, m.t / 1.5);
    g.globalAlpha = a;
    txt(g, m.text, 16, y, { size: m.big ? 16 : 13, color: m.c || "#ddd" });
    g.globalAlpha = 1;
    y += m.big ? 22 : 18;
  }

  // minimap + players
  let my = drawMinimap(g, S, me, t);
  for (const p of Object.values(S.players)) {
    const st = p.down ? "DOWN" : p.hidden ? "hiding" : "";
    g.fillStyle = p.color; g.fillRect(R.W - 190, my - 9, 10, 10);
    txt(g, p.name + (p.id === me.id ? " (you)" : "") + (st ? " — " + st : ""), R.W - 174, my, { size: 12, color: p.down ? "#ff8a80" : "#ddd" });
    my += 17;
  }

  // phone card (texts from UNKNOWN)
  if (G.phoneCard) {
    const c = G.phoneCard, a = Math.min(1, c.t, (8 - c.t) * 4 + 0.001);
    g.globalAlpha = Math.max(0, Math.min(1, a));
    const cw = 300, cx = R.W - cw - 14, cy = my + 6;
    g.fillStyle = "rgba(20,20,26,0.95)"; rrect(g, cx, cy, cw, 74, 10); g.fill();
    g.strokeStyle = "#444"; g.lineWidth = 1; g.stroke();
    txt(g, c.from, cx + 12, cy + 20, { size: 12, color: "#ff5252", shadow: false });
    wrapText(g, c.text, cx + 12, cy + 40, cw - 24, 16, { size: 13, color: "#eee", shadow: false });
    g.globalAlpha = 1;
  }

  // bottom-left status
  const bx = 16, by = H - 70;
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(bx - 6, by - 22, 230, 80);
  txt(g, "FLASHLIGHT " + (me.fl ? "ON" : "OFF") + " [F]", bx, by - 6, { size: 12, color: "#ddd" });
  g.fillStyle = "#333"; g.fillRect(bx, by, 150, 8);
  g.fillStyle = me.bat > 25 ? "#ffee58" : "#ff5252"; g.fillRect(bx, by, 150 * me.bat / 100, 8);
  txt(g, Math.round(me.bat) + "%", bx + 158, by + 8, { size: 12 });
  txt(g, "STAMINA [Shift]", bx, by + 26, { size: 12, color: "#ddd" });
  g.fillStyle = "#333"; g.fillRect(bx, by + 31, 150, 6);
  g.fillStyle = "#4fc3f7"; g.fillRect(bx, by + 31, 150 * G.stam / 100, 6);
  txt(g, "PLANKS: " + "▬ ".repeat(me.planks) + (me.planks ? "" : "none"), bx, by + 54, { size: 13, color: "#d7b98a" });

  // crosshair + how to look around
  if (!me.down && !me.hidden) {
    g.fillStyle = G.prompt && G.prompt.can ? "rgba(255,230,150,0.95)" : "rgba(255,255,255,0.55)";
    g.beginPath(); g.arc(W / 2, H / 2, G.prompt && G.prompt.can ? 4 : 2.5, 0, 7); g.fill();
  }
  if (!G.plock) txt(g, "Click to look around with the mouse  ·  arrow keys turn", W / 2, H - 150, { size: 13, align: "center", color: "#cfd8dc" });

  // interaction prompt
  if (G.prompt && !me.down) {
    const p = G.prompt;
    const label = (p.can ? "[E] " : "") + p.label;
    g.font = "bold 16px 'Courier New', monospace";
    const w = g.measureText(label).width + 30;
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(W / 2 - w / 2, H - 120, w, 34);
    txt(g, label, W / 2, H - 97, { size: 16, align: "center", color: p.can ? "#fff" : "#aaa" });
  }
  if (me.act) {
    g.fillStyle = "rgba(0,0,0,0.7)"; g.fillRect(W / 2 - 120, H - 78, 240, 16);
    g.fillStyle = "#ffca28"; g.fillRect(W / 2 - 118, H - 76, 236 * Math.min(1, me.act.t / me.act.dur), 12);
  }
  if (me.hidden) txt(g, "You are hiding. Press E to come out.", W / 2, H - 140, { size: 16, align: "center", color: "#90caf9" });
  if (me.down) {
    txt(g, "YOU WERE CAUGHT", W / 2, H / 2 - 20, { size: 34, align: "center", color: "#ff1744" });
    txt(g, "A friend can help you up — hold E next to you", W / 2, H / 2 + 14, { size: 16, align: "center" });
  }
  // hour banner
  if (G.banner) {
    g.globalAlpha = Math.min(1, G.banner.t);
    txt(g, G.banner.text, W / 2, H * 0.32, { size: 54, align: "center", color: "#ff5252" });
    if (G.banner.sub) txt(g, G.banner.sub, W / 2, H * 0.32 + 34, { size: 18, align: "center", color: "#ddd" });
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
  if (G.phase === "play") drawHUD(g, S, me, G, t);
}
