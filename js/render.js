// ---------------------------------------------------------------------------
// Drawing: static apartment background, dynamic objects, darkness/lighting,
// HUD, jumpscare.
// ---------------------------------------------------------------------------
const R = { cv: null, ctx: null, light: null, lctx: null, bg: null, grain: null, W: 0, H: 0, Z: 1, camX: 0, camY: 0 };

function initRender() {
  R.cv = document.getElementById("c");
  R.ctx = R.cv.getContext("2d");
  R.light = document.createElement("canvas");
  R.lctx = R.light.getContext("2d");
  R.bg = buildBG();
  R.grain = document.createElement("canvas");
  R.grain.width = R.grain.height = 256;
  const gg = R.grain.getContext("2d"), id = gg.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.random() * 255;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22;
  }
  gg.putImageData(id, 0, 0);
  resize();
  addEventListener("resize", resize);
}

function resize() {
  R.W = R.cv.width = innerWidth;
  R.H = R.cv.height = innerHeight;
  R.light.width = R.W; R.light.height = R.H;
  R.Z = Math.max(0.7, Math.min(R.H / (13 * TILE), R.W / (20 * TILE)));
}

function worldXf(g) {
  g.setTransform(R.Z, 0, 0, R.Z, R.W / 2 - R.camX * TILE * R.Z, R.H / 2 - R.camY * TILE * R.Z);
}
function toScreen(x, y) {
  return [(x - R.camX) * TILE * R.Z + R.W / 2, (y - R.camY) * TILE * R.Z + R.H / 2];
}

// ----------------------------- background ----------------------------------
function components(ch) {
  const seen = new Set(), out = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (MAP[y][x] !== ch || seen.has(x + "," + y)) continue;
    const box = { x0: x, y0: y, x1: x, y1: y }, st = [[x, y]];
    seen.add(x + "," + y);
    while (st.length) {
      const [cx, cy] = st.pop();
      box.x0 = Math.min(box.x0, cx); box.x1 = Math.max(box.x1, cx);
      box.y0 = Math.min(box.y0, cy); box.y1 = Math.max(box.y1, cy);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (tileAt(nx, ny) === ch && !seen.has(nx + "," + ny)) { seen.add(nx + "," + ny); st.push([nx, ny]); }
      }
    }
    out.push(box);
  }
  return out;
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function buildBG() {
  const T = TILE;
  const c = document.createElement("canvas");
  c.width = MAP_W * T; c.height = MAP_H * T;
  const g = c.getContext("2d");
  let seed = 7;
  const sr = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const ch = MAP[y][x], px = x * T, py = y * T;
    if (ch === "," || ch === "X") {
      if (y >= 23) {
        g.fillStyle = "#141416"; g.fillRect(px, py, T, T);
        if (y === 24 && x % 3 === 0) { g.fillStyle = "#6b5d1e"; g.fillRect(px + 4, py + 14, 20, 3); }
      } else if (y === 22) {
        g.fillStyle = "#2a2a2c"; g.fillRect(px, py, T, T);
        g.strokeStyle = "#1e1e20"; g.strokeRect(px + 0.5, py + 0.5, T - 1, T - 1);
      } else {
        const v = 20 + sr() * 8;
        g.fillStyle = `rgb(${v * 0.8 | 0},${v + 8 | 0},${v * 0.6 | 0})`; g.fillRect(px, py, T, T);
        for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(60,80,40,0.25)"; g.fillRect(px + sr() * T, py + sr() * T, 2, 4); }
      }
      continue;
    }
    if (ch === "#" || ch === "F" || "WDB".includes(ch)) {
      g.fillStyle = "#2b2b35"; g.fillRect(px, py, T, T);
      continue;
    }
    // floors (furniture sits on top of floor)
    const room = roomAt(x, y);
    const fl = room ? room.floor : "carpet";
    if (fl === "wood" || fl === "wood2") {
      g.fillStyle = fl === "wood" ? "#5b4330" : "#4d3a2b"; g.fillRect(px, py, T, T);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(0,0,0,${0.08 + sr() * 0.1})`; g.fillRect(px, py + i * 8, T, 1);
        g.fillStyle = `rgba(255,220,180,${sr() * 0.04})`; g.fillRect(px, py + i * 8 + 1, T, 7);
      }
    } else if (fl === "tile" || fl === "tile2") {
      const a = fl === "tile" ? ["#7d8288", "#6b7076"] : ["#6d6a60", "#5b5850"];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        g.fillStyle = a[(i + j + x + y) % 2]; g.fillRect(px + i * 16, py + j * 16, 16, 16);
      }
    } else {
      g.fillStyle = "#5a4042"; g.fillRect(px, py, T, T);
      for (let i = 0; i < 10; i++) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(px + sr() * T, py + sr() * T, 2, 2); }
    }
  }
  // rugs
  g.fillStyle = "#3f2224"; rrect(g, 19 * T, 16.2 * T, 7 * T, 3.6 * T, 6); g.fill();
  g.strokeStyle = "#7a5a3a"; g.lineWidth = 2; rrect(g, 19.3 * T, 16.5 * T, 6.4 * T, 3 * T, 4); g.stroke();
  g.fillStyle = "#2e3a4a"; rrect(g, 6 * T, 7.5 * T, 4 * T, 2.5 * T, 6); g.fill();
  // toilet
  g.fillStyle = "#d8dcdf"; g.beginPath(); g.ellipse(17.5 * T, 5.55 * T, 8, 11, 0, 0, 7); g.fill();
  g.fillStyle = "#b9c3c9"; g.fillRect(17.5 * T - 9, 5 * T + 1, 18, 6);

  // walls with a little depth
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const ch = MAP[y][x];
    if (ch !== "#" && ch !== "F") continue;
    const px = x * T, py = y * T;
    g.fillStyle = "#30303c"; g.fillRect(px, py, T, T);
    if (tileAt(x, y + 1) !== "#" && tileAt(x, y + 1) !== ",") { g.fillStyle = "#1c1c24"; g.fillRect(px, py + T - 5, T, 5); }
    if (tileAt(x, y - 1) !== "#") { g.fillStyle = "#44445a"; g.fillRect(px, py, T, 3); }
  }

  // furniture
  const F = (ch, fn) => components(ch).forEach((b) => fn(b.x0 * T, b.y0 * T, (b.x1 - b.x0 + 1) * T, (b.y1 - b.y0 + 1) * T, b));
  F("b", (x, y, w, h) => {
    g.fillStyle = "#3e2a1e"; rrect(g, x + 2, y + 2, w - 4, h - 4, 4); g.fill();
    g.fillStyle = "#3f5a7a"; rrect(g, x + 5, y + 18, w - 10, h - 22, 3); g.fill();
    g.fillStyle = "#d9d4c7"; rrect(g, x + 8, y + 6, w / 2 - 11, 11, 3); g.fill(); rrect(g, x + w / 2 + 3, y + 6, w / 2 - 11, 11, 3); g.fill();
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x + 5, y + 18, w - 10, 3);
  });
  F("t", (x, y, w, h) => {
    g.fillStyle = "#d9dde0"; rrect(g, x + 2, y + 3, w - 4, h - 6, 10); g.fill();
    g.fillStyle = "#8fa9b8"; rrect(g, x + 7, y + 8, w - 14, h - 16, 8); g.fill();
  });
  F("k", (x, y, w, h, b) => {
    g.fillStyle = "#6f6f6b"; g.fillRect(x, y, w, h);
    g.fillStyle = "#8d8d88"; g.fillRect(x + 1, y + 1, w - 2, h - 6);
    if (b.x0 >= 5 && b.y0 === 15) {
      // stove + sink
      g.fillStyle = "#222"; g.fillRect(7 * T + 2, y + 3, 2 * T - 4, h - 10);
      g.strokeStyle = "#555"; g.lineWidth = 2;
      for (const [cx, cy] of [[7.5, 15.35], [8.5, 15.35], [7.5, 15.75], [8.5, 15.75]]) { g.beginPath(); g.arc(cx * T, cy * T, 5, 0, 7); g.stroke(); }
      g.fillStyle = "#a9b4bb"; rrect(g, 5 * T + 6, y + 4, T * 1.3, h - 12, 4); g.fill();
    } else {
      g.fillStyle = "#cfd8dc"; g.beginPath(); g.ellipse(x + w / 2, y + h / 2, 9, 7, 0, 0, 7); g.fill();
    }
  });
  F("r", (x, y, w, h) => {
    g.fillStyle = "#c7cbce"; rrect(g, x + 2, y + 1, w - 4, h - 3, 3); g.fill();
    g.fillStyle = "#9aa0a4"; g.fillRect(x + 4, y + h * 0.4, w - 8, 2); g.fillRect(x + w - 8, y + 6, 2, 8);
  });
  F("T", (x, y, w, h) => {
    g.fillStyle = "#3a2a1e";
    for (const [cx, cy] of [[x + w / 2, y - 3], [x + w / 2, y + h + 3], [x - 3, y + h / 2], [x + w + 3, y + h / 2]]) { rrect(g, cx - 7, cy - 7, 14, 14, 3); g.fill(); }
    g.fillStyle = "#6d4c33"; rrect(g, x + 4, y + 4, w - 8, h - 8, 5); g.fill();
    g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(x + 8, y + 8, w - 16, 3);
  });
  F("s", (x, y, w, h) => {
    g.fillStyle = "#4a1f27"; rrect(g, x, y + 2, w, h - 2, 6); g.fill();
    g.fillStyle = "#5e2a33"; for (let i = 0; i < 3; i++) { rrect(g, x + 4 + i * (w - 8) / 3, y + 4, (w - 8) / 3 - 2, h - 14, 4); g.fill(); }
    g.fillStyle = "#3a161d"; g.fillRect(x, y + h - 9, w, 9);
  });
  F("v", (x, y, w, h) => {
    g.fillStyle = "#2a2522"; g.fillRect(x - 4, y + 2, w + 8, h - 10);
    g.fillStyle = "#08080a"; g.fillRect(x + 2, y + 4, w - 4, 7);
  });
  F("C", (x, y, w, h) => {
    g.fillStyle = "#5d4430"; g.fillRect(x + 1, y + 1, w - 2, h - 2);
    g.strokeStyle = "#3d2b1e"; g.lineWidth = 1;
    for (let i = 4; i < h - 2; i += 4) { g.beginPath(); g.moveTo(x + 4, y + i); g.lineTo(x + w - 4, y + i); g.stroke(); }
    g.fillStyle = "#c9a96e"; g.fillRect(x + w / 2 - 3, y + h / 2 - 2, 2, 5); g.fillRect(x + w / 2 + 1, y + h / 2 - 2, 2, 5);
  });
  F("F", (x, y, w, h) => {
    g.fillStyle = "#6a6d70"; g.fillRect(x + 6, y + 8, w - 12, h - 10);
    g.fillStyle = "#3a3c3e"; g.fillRect(x + 9, y + 11, w - 18, h - 16);
    g.fillStyle = "#ffd54f"; g.beginPath(); g.moveTo(x + 17, y + 12); g.lineTo(x + 12, y + 20); g.lineTo(x + 16, y + 20); g.lineTo(x + 14, y + 27); g.lineTo(x + 21, y + 18); g.lineTo(x + 17, y + 18); g.closePath(); g.fill();
  });
  F("A", (x, y, w, h) => {
    g.fillStyle = "#6b4a32"; g.fillRect(x + 1, y + 1, w - 2, h - 3);
    g.fillStyle = "#4a3222"; g.fillRect(x + 3, y + 8, w - 6, 1); g.fillRect(x + 3, y + 18, w - 6, 1);
    g.fillStyle = "#c9a96e"; g.fillRect(x + w / 2 - 4, y + 12, 8, 2);
  });
  F("h", (x, y, w, h) => {
    g.fillStyle = "#4e3423"; g.beginPath(); g.arc(x + w / 2, y + h / 2, 12, 0, 7); g.fill();
  });
  F("X", (x, y, w, h) => {
    g.fillStyle = "#56595c"; g.fillRect(x + 2, y + 6, 14, 20);
    g.fillStyle = "#2c2e30"; g.fillRect(x + 5, y + 10, 8, 12);
  });
  // trees & bushes outside
  for (const [tx, ty, r] of [[1.5, 6, 30], [2, 14, 26], [33.5, 9, 28], [34, 17, 24], [12, 1.5, 26], [21, 1.2, 30], [29, 1.6, 22], [1.4, 20.2, 22]]) {
    g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.arc(tx * T + 6, ty * T + 6, r, 0, 7); g.fill();
    g.fillStyle = "#0f1a0c"; g.beginPath(); g.arc(tx * T, ty * T, r, 0, 7); g.fill();
    g.fillStyle = "#15240f"; g.beginPath(); g.arc(tx * T - r * 0.25, ty * T - r * 0.25, r * 0.6, 0, 7); g.fill();
  }
  // parked car
  g.fillStyle = "#2a1a1a"; rrect(g, 11 * T, 23.3 * T, 3.2 * T, 1.4 * T, 10); g.fill();
  g.fillStyle = "#1a2530"; rrect(g, 11.8 * T, 23.5 * T, 1.5 * T, 1 * T, 5); g.fill();
  // streetlight poles
  for (const s of STREETLIGHTS) { g.fillStyle = "#444"; g.beginPath(); g.arc(s.x * T, s.y * T, 5, 0, 7); g.fill(); }
  return c;
}

// --------------------------- dynamic objects -------------------------------
function drawEntry(g, S, i, t) {
  const T = TILE, E = ENTRIES[i], e = S.entries[i];
  const px = E.x * T, py = E.y * T;
  const horiz = E.dy !== 0;
  g.save();
  g.translate(px + T / 2, py + T / 2);
  if (!horiz) g.rotate(Math.PI / 2);
  if (E.kind === "window") {
    if (e.broken) {
      g.fillStyle = "#0b0b10"; g.fillRect(-16, -5, 32, 10);
      g.fillStyle = "rgba(170,200,220,0.7)";
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(-16 + k * 7, -5); g.lineTo(-13 + k * 7, 1 + (k % 2) * 3); g.lineTo(-10 + k * 7, -5); g.fill(); }
    } else {
      g.fillStyle = "#4a5866"; g.fillRect(-16, -5, 32, 10);
      g.fillStyle = "rgba(140,180,210,0.55)"; g.fillRect(-14, -3, 13, 6); g.fillRect(1, -3, 13, 6);
    }
  } else {
    if (e.broken) {
      g.fillStyle = "#0b0b10"; g.fillRect(-16, -6, 32, 12);
      g.save(); g.translate(-15, 0); g.rotate(-1.1); g.fillStyle = "#4b3020"; g.fillRect(0, -3, 30, 6); g.restore();
    } else {
      g.fillStyle = "#5a3a24"; g.fillRect(-15, -6, 30, 12);
      g.fillStyle = "#3d2718"; g.fillRect(-15, -1, 30, 2);
      g.fillStyle = "#d4af37"; g.beginPath(); g.arc(9, 3, 2, 0, 7); g.fill();
    }
  }
  // boards
  for (let k = 0; k < e.boards; k++) {
    const ang = [0.35, -0.35, 0][k], off = [-4, 4, 0][k];
    g.save(); g.translate(0, off); g.rotate(ang);
    g.fillStyle = "#9b7a50"; g.fillRect(-21, -4, 42, 8);
    g.fillStyle = "#7a5c3a"; g.fillRect(-21, 2, 42, 2);
    g.fillStyle = "#333"; g.fillRect(-18, -1, 2, 2); g.fillRect(16, -1, 2, 2);
    if (k === e.boards - 1 && e.bhp < 55) { g.strokeStyle = "#2a1a10"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-3, -4); g.lineTo(1, 0); g.lineTo(-2, 4); g.stroke(); }
    g.restore();
  }
  if (e.hit > 0) {
    g.strokeStyle = `rgba(255,120,40,${e.hit})`; g.lineWidth = 3;
    g.strokeRect(-18, -10, 36, 20);
  }
  g.restore();
}

function drawDynamic(g, S, t) {
  const T = TILE;
  for (let i = 0; i < ENTRIES.length; i++) drawEntry(g, S, i, t);
  // plank piles
  PILES.forEach((P, i) => {
    const n = S.piles[i], px = P.x * T, py = P.y * T;
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(px + 3, py + 5, 28, 26);
    const layers = Math.min(8, Math.ceil(n / 3));
    for (let k = 0; k < layers; k++) {
      g.fillStyle = k % 2 ? "#9b7a50" : "#8a6a42";
      g.fillRect(px + 2 + (k % 2) * 2, py + 26 - k * 3, 26, 5);
    }
    if (n === 0) { g.fillStyle = "#3a2a1a"; g.fillRect(px + 4, py + 24, 24, 3); }
  });
  // TV
  if (S.tv) {
    g.fillStyle = `rgba(${180 + Math.random() * 60 | 0},${190 + Math.random() * 60 | 0},255,0.9)`;
    g.fillRect(27 * T + 2, 15 * T + 4, 2 * T - 4, 7);
  }
  // phone
  const ph = Math.floor(Math.random() * 3) - 1;
  const ring = S.phone > 0;
  g.fillStyle = "#b71c1c";
  rrect(g, 16 * T + 9 + (ring ? ph : 0), 15 * T + 11, 14, 10, 3); g.fill();
  g.fillStyle = "#7f0000"; g.fillRect(16 * T + 8 + (ring ? ph : 0), 15 * T + 9, 16, 3);
  // fuse box warning
  if (!S.power && Math.floor(t * 3) % 2 === 0) {
    g.fillStyle = "#ff1744"; g.beginPath(); g.arc(21 * T + 26, 11 * T + 10, 3, 0, 7); g.fill();
  }
  // drawer
  if (S.batteries > 0) { g.fillStyle = "#ffeb3b"; g.fillRect(12 * T + 22, 15 * T + 3, 4, 6); }
}

function drawPlayerBody(g, p, x, y, a, t) {
  const T = TILE, px = x * T, py = y * T;
  if (p.down) {
    g.fillStyle = "rgba(120,0,0,0.5)"; g.beginPath(); g.ellipse(px, py, 15, 10, 0.4, 0, 7); g.fill();
    g.fillStyle = "#777"; g.beginPath(); g.ellipse(px, py, 11, 7, 0.4, 0, 7); g.fill();
    g.strokeStyle = p.color; g.lineWidth = 2; g.stroke();
    return;
  }
  g.fillStyle = "rgba(0,0,0,0.35)"; g.beginPath(); g.arc(px + 2, py + 3, 10, 0, 7); g.fill();
  if (p.planks > 0) {
    g.save(); g.translate(px, py); g.rotate(a + Math.PI / 2);
    g.fillStyle = "#9b7a50"; g.fillRect(-14, -12, 28, 5);
    if (p.planks > 1) g.fillRect(-13, -16, 28, 5);
    g.restore();
  }
  g.fillStyle = p.color; g.beginPath(); g.arc(px, py, 9.5, 0, 7); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 2; g.stroke();
  g.fillStyle = "rgba(255,255,255,0.25)"; g.beginPath(); g.arc(px - 2, py - 3, 4, 0, 7); g.fill();
  // flashlight in hand
  const hx = px + Math.cos(a) * 10, hy = py + Math.sin(a) * 10;
  g.fillStyle = "#222"; g.beginPath(); g.arc(hx, hy, 3.5, 0, 7); g.fill();
  if (p.fl && p.bat > 0) { g.fillStyle = "#fff8d0"; g.beginPath(); g.arc(hx + Math.cos(a) * 2, hy + Math.sin(a) * 2, 2, 0, 7); g.fill(); }
}

function drawStalker(g, x, y, a, t, stun) {
  const T = TILE, px = x * T, py = y * T;
  for (let i = 0; i < 7; i++) {
    const ang = t * 1.7 + i * 0.9;
    g.fillStyle = "rgba(0,0,0,0.3)";
    g.beginPath(); g.arc(px + Math.cos(ang) * 5, py + Math.sin(ang * 1.3) * 5, 13, 0, 7); g.fill();
  }
  const jit = stun ? (Math.random() - 0.5) * 3 : 0;
  g.save(); g.translate(px + jit, py); g.rotate(a);
  g.fillStyle = "#070708"; g.beginPath(); g.ellipse(-2, 0, 10, 17, 0, 0, 7); g.fill();
  g.fillStyle = "#0e0e10"; g.beginPath(); g.arc(3, 0, 8.5, 0, 7); g.fill();
  // pale mask
  g.fillStyle = "#cfc6b4"; g.beginPath(); g.ellipse(8, 0, 4, 6, 0, 0, 7); g.fill();
  g.fillStyle = "#000"; g.beginPath(); g.arc(10, -2.2, 1.4, 0, 7); g.arc(10, 2.2, 1.4, 0, 7); g.fill();
  // long arms
  g.strokeStyle = "#070708"; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(14 + Math.sin(t * 6) * 2, -15); g.moveTo(0, 12); g.lineTo(14 - Math.sin(t * 6) * 2, 15); g.stroke();
  g.restore();
}

// ------------------------------ lighting -----------------------------------
function castRay(S, ox, oy, dx, dy, maxD) {
  let mx = Math.floor(ox), my = Math.floor(oy);
  const ddx = Math.abs(1 / (dx || 1e-9)), ddy = Math.abs(1 / (dy || 1e-9));
  let sx, sy, sdx, sdy;
  if (dx < 0) { sx = -1; sdx = (ox - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - ox) * ddx; }
  if (dy < 0) { sy = -1; sdy = (oy - my) * ddy; } else { sy = 1; sdy = (my + 1 - oy) * ddy; }
  for (let i = 0; i < 200; i++) {
    let d;
    if (sdx < sdy) { d = sdx; sdx += ddx; mx += sx; } else { d = sdy; sdy += ddy; my += sy; }
    if (d > maxD) return maxD;
    if (opaqueAt(S, mx, my)) return Math.min(maxD, d + 0.3);
  }
  return maxD;
}

function visPoly(S, ox, oy, radius) {
  const N = 220, pts = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    const d = castRay(S, ox, oy, dx, dy, radius);
    pts.push(ox + dx * d, oy + dy * d);
  }
  return pts;
}

function drawLighting(S, me, view, t) {
  const L = R.lctx, T = TILE;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = "source-over";
  L.fillStyle = "#000"; L.fillRect(0, 0, R.W, R.H);
  worldXf(L);
  const poly = visPoly(S, me.x, me.y, me.hidden ? 2.2 : 17);
  L.save();
  L.beginPath();
  L.moveTo(poly[0] * T, poly[1] * T);
  for (let i = 2; i < poly.length; i += 2) L.lineTo(poly[i] * T, poly[i + 1] * T);
  L.closePath();
  L.clip();
  L.globalCompositeOperation = "destination-out";
  // moonlight everywhere
  L.fillStyle = "rgba(0,0,0,0.16)"; L.fillRect(0, 0, MAP_W * T, MAP_H * T);
  const flick = S.flick > 0 && Math.sin(t * 40) * Math.sin(t * 17) > 0;
  if (S.power && !flick) {
    L.fillStyle = "rgba(0,0,0,0.78)";
    L.fillRect(HOUSE.x0 * T, HOUSE.y0 * T, (HOUSE.x1 - HOUSE.x0 + 1) * T, (HOUSE.y1 - HOUSE.y0 + 1) * T);
  }
  const radial = (x, y, r, a) => {
    const gr = L.createRadialGradient(x * T, y * T, 0, x * T, y * T, r * T);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    L.fillStyle = gr; L.beginPath(); L.arc(x * T, y * T, r * T, 0, 7); L.fill();
  };
  for (const s of STREETLIGHTS) radial(s.x, s.y, 5, 0.55);
  if (S.tv) radial(27.5, 16.2, 4 + Math.random() * 0.6, 0.5 + Math.random() * 0.2);
  radial(me.x, me.y, me.hidden ? 1.6 : 2.4, 0.5);
  for (const v of view) {
    if (!flashOn(v.p)) continue;
    let alpha = 0.95;
    if (v.p.bat < 15 && Math.random() < 0.25) alpha = 0.2;
    const x = v.x * T, y = v.y * T, r = FL_RANGE * T;
    const gr = L.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`); gr.addColorStop(0.6, `rgba(0,0,0,${alpha * 0.8})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    L.fillStyle = gr;
    L.beginPath(); L.moveTo(x, y); L.arc(x, y, r, v.a - FL_HALF, v.a + FL_HALF); L.closePath(); L.fill();
  }
  L.restore();
  const g = R.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(R.light, 0, 0);
  // faint warm tint for flashlight beams
  worldXf(g);
  g.globalCompositeOperation = "lighter";
  for (const v of view) {
    if (!flashOn(v.p)) continue;
    const x = v.x * T, y = v.y * T, r = FL_RANGE * T * 0.8;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(60,50,20,0.25)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, v.a - FL_HALF, v.a + FL_HALF); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = "source-over";
  return poly;
}

// --------------------------------- HUD -------------------------------------
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
    g.beginPath(); g.arc(x0 + (px - HOUSE.x0) * s, y0 + (py - HOUSE.y0) * s, p.id === me.id ? 3.5 : 2.5, 0, 7); g.fill();
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
    g.fillStyle = "rgba(120,0,0,0.25)"; g.fillRect(0, 0, W, H);
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
    g.fillStyle = "rgba(0,0,0,0.85)";
    for (let y = 0; y < R.H; y += 26) g.fillRect(0, y, R.W, 15);
  }
}

function drawScare(g, k, t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  const W = R.W, H = R.H;
  g.fillStyle = Math.random() < 0.3 ? "#300" : "#000"; g.fillRect(0, 0, W, H);
  const s = Math.min(W, H) / 400 * (1 + (1 - k) * 0.4);
  g.save();
  g.translate(W / 2 + (Math.random() - 0.5) * 30, H / 2 + (Math.random() - 0.5) * 30);
  g.scale(s, s);
  g.fillStyle = "#d8d0bf"; g.beginPath(); g.ellipse(0, 0, 120, 160, 0, 0, 7); g.fill();
  g.fillStyle = "rgba(90,70,60,0.5)"; for (let i = 0; i < 12; i++) { g.fillRect(-100 + Math.random() * 200, -140 + Math.random() * 280, 3, 20 + Math.random() * 30); }
  g.fillStyle = "#000";
  g.beginPath(); g.ellipse(-48, -40, 30, 40, 0.2, 0, 7); g.fill();
  g.beginPath(); g.ellipse(48, -40, 30, 40, -0.2, 0, 7); g.fill();
  g.fillStyle = "#fff"; g.beginPath(); g.arc(-44, -36, 4, 0, 7); g.arc(44, -36, 4, 0, 7); g.fill();
  g.fillStyle = "#000"; g.beginPath(); g.ellipse(0, 75, 45, 60 + Math.random() * 10, 0, 0, 7); g.fill();
  g.fillStyle = "#cfc6b4";
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 12 - 5, 22); g.lineTo(i * 12 + 5, 22); g.lineTo(i * 12, 40); g.fill(); }
  g.restore();
}

// --------------------------------- frame -----------------------------------
function renderFrame(S, me, G, t) {
  const g = R.ctx, T = TILE;
  R.camX = me.x + G.shakeX; R.camY = me.y + G.shakeY;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#000"; g.fillRect(0, 0, R.W, R.H);
  worldXf(g);
  g.drawImage(R.bg, 0, 0);
  drawDynamic(g, S, t);

  const view = [];
  for (const p of Object.values(S.players)) {
    if (p.id === me.id) { view.push({ p: me, x: me.x, y: me.y, a: me.a }); continue; }
    const r = G.rpos[p.id] || (G.rpos[p.id] = { x: p.x, y: p.y, a: p.a });
    view.push({ p, x: r.x, y: r.y, a: r.a });
  }
  for (const v of view) if (!v.p.hidden) drawPlayerBody(g, v.p, v.x, v.y, v.a, t);
  const st = S.stalker, sr = G.stR;
  drawStalker(g, sr.x, sr.y, sr.a, t, st.stun);
  if (G.phantom) drawStalker(g, G.phantom.x, G.phantom.y, G.phantom.a, t, false);

  drawLighting(S, me, view, t);

  // eyes that catch the light in the dark
  worldXf(g);
  const dS = Math.hypot(sr.x - me.x, sr.y - me.y);
  if (dS < 9 && !me.hidden && los(S, me.x, me.y, sr.x, sr.y)) {
    const ex = sr.x * T + Math.cos(sr.a) * 10, ey = sr.y * T + Math.sin(sr.a) * 10;
    const px = -Math.sin(sr.a) * 2.4, py = Math.cos(sr.a) * 2.4;
    g.fillStyle = `rgba(255,${60 + Math.random() * 40 | 0},40,${0.6 - dS * 0.05})`;
    g.beginPath(); g.arc(ex + px, ey + py, 1.6, 0, 7); g.arc(ex - px, ey - py, 1.6, 0, 7); g.fill();
  }
  // name tags
  for (const v of view) {
    if (v.p.id === me.id || v.p.hidden) continue;
    const [sx, sy] = toScreen(v.x, v.y);
    g.setTransform(1, 0, 0, 1, 0, 0);
    txt(g, v.p.name + (v.p.down ? " (DOWN)" : ""), sx, sy - 22 * R.Z, { size: 12, align: "center", color: v.p.down ? "#ff8a80" : v.p.color });
    worldXf(g);
  }
  drawPost(g, S, me, G, t);
  if (G.phase === "play") drawHUD(g, S, me, G, t);
  if (G.scare > 0) drawScare(g, G.scare / 1.4, t);
}
