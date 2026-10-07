// ---------------------------------------------------------------------------
// 3D view (Three.js r128). The game itself is still played on the tile grid
// in map.js / sim.js: 1 tile = 1 metre, tile (x, y) sits at world (x, 0, y).
// ---------------------------------------------------------------------------
const R = { gl: null, hud: null, h: null, W: 0, H: 0, ok: false, err: "", grain: null, q: 2, fpsT: 0, fpsN: 0 };
const WALL_H = 2.6, EYE_H = 1.62;
const QUALITY = [
  { pr: 0.5, shadow: false },
  { pr: 0.7, shadow: false },
  { pr: 0.9, shadow: true },
];
const W3 = {};

function initRender() {
  R.gl = document.getElementById("c");
  R.hud = document.getElementById("hud");
  R.h = R.hud.getContext("2d");
  R.grain = document.createElement("canvas");
  R.grain.width = R.grain.height = 256;
  const gg = R.grain.getContext("2d"), id = gg.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = Math.random() * 255;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22;
  }
  gg.putImageData(id, 0, 0);
  try {
    if (typeof THREE === "undefined") throw new Error("The 3D engine (Three.js) didn't load. Check your internet connection and reload.");
    setup3D();
    R.ok = true;
  } catch (e) {
    R.ok = false;
    R.err = e.message || String(e);
    console.error(e);
  }
  resize();
  addEventListener("resize", resize);
}

function resize() {
  R.W = innerWidth; R.H = innerHeight;
  R.hud.width = R.W; R.hud.height = R.H;
  if (!R.ok) return;
  applyQuality();
  W3.camera.aspect = R.W / Math.max(1, R.H);
  W3.camera.updateProjectionMatrix();
}

function applyQuality() {
  const q = QUALITY[R.q];
  W3.renderer.setPixelRatio(q.pr * Math.min(window.devicePixelRatio || 1, 1.25));
  W3.renderer.setSize(R.W, R.H, false);
  W3.flash[0].castShadow = q.shadow;
}

// Drop the resolution if the computer can't keep up (Chromebooks!)
function trackFps(dt) {
  if (dt > 1) { R.fpsT = 0; R.fpsN = 0; return; } // tab was in the background
  R.fpsT += dt; R.fpsN++;
  if (R.fpsT < 2.5) return;
  const fps = R.fpsN / R.fpsT;
  R.fpsT = 0; R.fpsN = 0;
  if (fps < 28 && R.q > 0) { R.q--; applyQuality(); }
}

// ------------------------------ textures -----------------------------------
let tseed = 11;
const srand = () => ((tseed = (tseed * 16807) % 2147483647) / 2147483647);
function ctex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, color, size) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(srand() * w, srand() * h, size, size);
}
function makeTextures() {
  const T = {};
  // wallpaper: pattern on top, a painted baseboard and crown moulding (v spans floor to ceiling)
  const paper = (base, pattern) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    pattern(g, w, h);
    g.fillStyle = "rgba(0,0,0,0.05)";
    for (let i = 0; i < 60; i++) g.fillRect(srand() * w, srand() * h, 2, 2);
    g.fillStyle = "#efe9dd"; g.fillRect(0, h - 14, w, 14);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, h - 15, w, 2);
    g.fillStyle = "#f4f0e8"; g.fillRect(0, 0, w, 6);
  };
  T.wpBlue = ctex(128, 256, paper("#7f9cc0", (g, w, h) => {
    for (let y = 16; y < h - 20; y += 32) for (let x = 8 + ((y / 32) % 2) * 32; x < w; x += 64) {
      g.fillStyle = "rgba(255,255,255,0.35)";
      for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * 1.26) * 5, y + Math.sin(k * 1.26) * 5, 3, 0, 7); g.fill(); }
      g.fillStyle = "rgba(240,210,120,0.6)"; g.beginPath(); g.arc(x, y, 2, 0, 7); g.fill();
    }
  }));
  T.wpGreen = ctex(128, 256, paper("#9fb59a", (g, w, h) => {
    for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, 0, 6, h); g.fillStyle = "rgba(60,90,60,0.12)"; g.fillRect(x + 9, 0, 2, h); }
  }));
  T.wpDamask = ctex(128, 256, paper("#cdbb98", (g, w, h) => {
    g.strokeStyle = "rgba(140,110,70,0.35)"; g.lineWidth = 2;
    for (let y = 20; y < h - 20; y += 48) for (let x = 0; x <= w; x += 64) {
      const ox = x + ((y / 48) % 2) * 32;
      g.beginPath(); g.ellipse(ox, y, 10, 16, 0, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(ox, y - 22); g.lineTo(ox, y + 22); g.stroke();
    }
  }));
  T.wpWarm = ctex(128, 256, paper("#c69a6a", (g, w, h) => {
    for (let x = 0; x < w; x += 32) { g.fillStyle = "rgba(120,60,30,0.16)"; g.fillRect(x, 0, 14, h); }
    g.fillStyle = "rgba(255,240,200,0.18)";
    for (let y = 24; y < h - 20; y += 40) for (let x = 7; x < w; x += 32) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.fill(); }
    g.fillStyle = "#7a5432"; g.fillRect(0, h * 0.6, w, 6); // chair rail
  }));
  T.wpYellow = ctex(128, 256, paper("#e9d58e", (g, w, h) => {
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) if ((x + y) % 32 === 0) { g.fillStyle = "rgba(200,120,60,0.12)"; g.fillRect(x + 6, y + 6, 4, 4); }
    // tile backsplash band behind the counters
    const y0 = h * (1 - 1.5 / 2.6), y1 = h * (1 - 0.92 / 2.6);
    g.fillStyle = "#e9eef0"; g.fillRect(0, y0, w, y1 - y0);
    g.strokeStyle = "rgba(120,140,150,0.6)"; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
    for (let y = y0; y <= y1; y += 12) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }));
  T.wpTile = ctex(128, 256, (g, w, h) => {
    g.fillStyle = "#eef2f3"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,140,150,0.55)"; g.lineWidth = 2;
    for (let x = 0; x <= w; x += 21) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = "#4f86a6"; g.fillRect(0, h * 0.55, w, 8);
  });
  const wood = (base) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      g.fillStyle = `rgba(${srand() * 50 | 0},${srand() * 25 | 0},0,${0.1 + srand() * 0.12})`;
      g.fillRect(0, r * 32, w, 32);
      for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, r * 32 + 3 + srand() * 26, w, 1); }
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, r * 32, w, 2);
      g.fillRect(((r * 53) % 128), r * 32, 2, 32);
    }
  };
  T.wood = ctex(128, 128, wood("#9a7048"));
  T.wood2 = ctex(128, 128, wood("#b58a5e"));
  T.carpetBlue = ctex(128, 128, (g, w, h) => { g.fillStyle = "#5d6f8f"; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, "rgba(0,0,0,0.12)", 1); speckle(g, w, h, 700, "rgba(255,255,255,0.06)", 1); });
  const checker = (a, b, n) => (g, w, h) => {
    const s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * s, j * s, s, s); }
    g.strokeStyle = "rgba(60,60,60,0.35)"; g.lineWidth = 1;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    speckle(g, w, h, 200, "rgba(0,0,0,0.05)", 2);
  };
  T.tile = ctex(128, 128, checker("#dfe9ee", "#a9c6d6", 4));
  T.tile2 = ctex(128, 128, checker("#f0eee8", "#2d2d33", 4));
  T.siding = ctex(128, 128, (g, w, h) => {
    g.fillStyle = "#5d6b78"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, y + 14, w, 2); g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(0, y, w, 3); }
  });
  T.grass = ctex(128, 128, (g, w, h) => { g.fillStyle = "#1f2e17"; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, "rgba(80,110,45,0.35)", 2); speckle(g, w, h, 500, "rgba(0,0,0,0.3)", 2); });
  T.asphalt = ctex(128, 128, (g, w, h) => { g.fillStyle = "#1b1b1e"; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, "rgba(255,255,255,0.05)", 1); });
  T.sidewalk = ctex(128, 128, (g, w, h) => { g.fillStyle = "#56565a"; g.fillRect(0, 0, w, h); speckle(g, w, h, 800, "rgba(0,0,0,0.2)", 2); g.fillStyle = "#2c2c2e"; g.fillRect(0, 0, 2, h); g.fillRect(0, 0, w, 2); });
  T.rug = ctex(256, 128, (g, w, h) => {
    g.fillStyle = "#7a2e30"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#d8b878"; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = "#9c4a3c"; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(w / 2, h / 2, 20 + i * 16, 8 + i * 8, 0, 0, 7); g.stroke(); }
    speckle(g, w, h, 900, "rgba(0,0,0,0.12)", 1);
  });
  T.closet = ctex(64, 128, (g, w, h) => {
    g.fillStyle = "#e8e1d2"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 10; y < h - 10; y += 6) { g.fillRect(4, y, 25, 2); g.fillRect(35, y, 25, 2); }
    g.fillStyle = "#8a7f6c"; g.fillRect(31, 0, 2, h);
    g.fillStyle = "#b08d4e"; g.fillRect(27, 60, 2, 8); g.fillRect(35, 60, 2, 8);
  });
  T.door = ctex(64, 128, (g, w, h) => {
    g.fillStyle = "#f1ece2"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.18)"; g.lineWidth = 2;
    g.strokeRect(8, 8, 48, 50); g.strokeRect(8, 68, 48, 52);
  });
  T.extDoor = ctex(64, 128, (g, w, h) => {
    g.fillStyle = "#6b2e26"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2;
    g.strokeRect(8, 8, 48, 50); g.strokeRect(8, 68, 48, 52);
  });
  T.board = ctex(128, 16, (g, w, h) => {
    g.fillStyle = "#9b7a50"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(60,40,20,0.3)"; g.fillRect(0, srand() * h, w, 1); }
    g.fillStyle = "#222"; g.fillRect(6, 6, 3, 3); g.fillRect(w - 9, 6, 3, 3);
  });
  T.board.wrapS = T.board.wrapT = THREE.ClampToEdgeWrapping;
  T.fence = ctex(64, 64, (g, w, h) => { g.fillStyle = "#4a3b2c"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(x, 0, 2, h); } });
  // a few paintings for the walls
  T.art = [
    ctex(64, 48, (g) => { g.fillStyle = "#87a8c9"; g.fillRect(0, 0, 64, 48); g.fillStyle = "#3d6b3a"; g.fillRect(0, 30, 64, 18); g.fillStyle = "#f2e2a0"; g.beginPath(); g.arc(48, 12, 6, 0, 7); g.fill(); }),
    ctex(48, 64, (g) => { g.fillStyle = "#4a3a30"; g.fillRect(0, 0, 48, 64); g.fillStyle = "#d8b89a"; g.beginPath(); g.ellipse(24, 26, 10, 13, 0, 0, 7); g.fill(); g.fillStyle = "#2a1c14"; g.fillRect(14, 40, 20, 24); }),
    ctex(64, 48, (g) => { g.fillStyle = "#e9d9b8"; g.fillRect(0, 0, 64, 48); g.fillStyle = "#c0504d"; g.beginPath(); g.arc(22, 26, 9, 0, 7); g.fill(); g.fillStyle = "#4f81bd"; g.fillRect(36, 14, 14, 22); }),
  ];
  for (const a of T.art) a.wrapS = a.wrapT = THREE.ClampToEdgeWrapping;
  return T;
}

class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  // rectangle from corner o along unit vectors u (w long) and v (h long); normal = u x v
  rect(o, u, v, w, h, u0, v0, su, sv) {
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const b = this.p.length / 3;
    const pts = [
      o,
      [o[0] + u[0] * w, o[1] + u[1] * w, o[2] + u[2] * w],
      [o[0] + u[0] * w + v[0] * h, o[1] + u[1] * w + v[1] * h, o[2] + u[2] * w + v[2] * h],
      [o[0] + v[0] * h, o[1] + v[1] * h, o[2] + v[2] * h],
    ];
    for (const q of pts) { this.p.push(q[0], q[1], q[2]); this.n.push(n[0], n[1], n[2]); }
    this.u.push(u0, v0, u0 + w * su, v0, u0 + w * su, v0 + h * sv, u0, v0 + h * sv);
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // axis-aligned box, all six faces
  box(x0, y0, z0, x1, y1, z1) {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    this.rect([x0, y0, z1], [1, 0, 0], [0, 1, 0], w, h, x0, y0, 1, 1);
    this.rect([x1, y0, z0], [-1, 0, 0], [0, 1, 0], w, h, x0, y0, 1, 1);
    this.rect([x1, y0, z1], [0, 0, -1], [0, 1, 0], d, h, z0, y0, 1, 1);
    this.rect([x0, y0, z0], [0, 0, 1], [0, 1, 0], d, h, z0, y0, 1, 1);
    this.rect([x0, y1, z1], [1, 0, 0], [0, 0, -1], w, d, x0, z0, 1, 1);
    this.rect([x0, y0, z0], [1, 0, 0], [0, 0, 1], w, d, x0, z0, 1, 1);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

function phong(o) { return new THREE.MeshPhongMaterial(Object.assign({ shininess: 8 }, o)); }

function addBox(parent, w, h, d, x, y0, z, mat, rotY) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y0 + h / 2, z);
  if (rotY) m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function addCyl(parent, rt, rb, h, x, y0, z, mat, seg) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), mat);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

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

// ------------------------------ the scene ----------------------------------
function isWallTile(c) { return c === "#" || c === "F"; }
// which room's wallpaper a wall face shows, judged from the tile in front of it
function roomForFace(tx, ty) {
  const r = roomAt(tx, ty);
  if (r) return r;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const c = tileAt(tx + dx, ty + dy);
    if (c === "." || c === "a" || "bnCuzoelLvcsgASkOMrTh".indexOf(c) >= 0) { const r2 = roomAt(tx + dx, ty + dy); if (r2) return r2; }
  }
  return ROOM_BY_ID.hall;
}

function setup3D() {
  const renderer = new THREE.WebGLRenderer({ canvas: R.gl, antialias: false, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  W3.renderer = renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);
  scene.fog = new THREE.FogExp2(0x05070f, 0.045);
  W3.scene = scene;
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  cam.rotation.order = "YXZ";
  W3.camera = cam;
  scene.add(cam);
  const T = makeTextures();
  W3.T = T;

  const M = {
    siding: phong({ map: T.siding, emissive: 0x070a12 }),
    trim: phong({ color: 0xd9d1c2, shininess: 30 }),
    ceil: phong({ color: 0xe8e4dc }),
    roof: phong({ color: 0x24262c, emissive: 0x05060a }),
    darkwood: phong({ color: 0x4a3324 }),
    midwood: phong({ color: 0x8a6440, shininess: 20 }),
    lightwood: phong({ color: 0xc9a777, shininess: 20 }),
    white: phong({ color: 0xf2f4f5, shininess: 70 }),
    steel: phong({ color: 0xb8bec2, shininess: 80 }),
    black: phong({ color: 0x141418, shininess: 40 }),
    blanket: phong({ color: 0x41618a }),
    blanket2: phong({ color: 0x9a5a4a }),
    pillow: phong({ color: 0xf1ede2 }),
    sofa: phong({ color: 0x5f7a6a }),
    sofaDark: phong({ color: 0x4a6253 }),
    counter: phong({ color: 0xdedbd2, shininess: 60 }),
    cabinet: phong({ color: 0x7d9aa6 }),
    closet: phong({ map: T.closet }),
    door: phong({ map: T.door, shininess: 15 }),
    extDoor: phong({ map: T.extDoor, shininess: 25 }),
    brass: phong({ color: 0xd4af37, shininess: 90 }),
    red: phong({ color: 0xc62828, shininess: 60 }),
    grass: phong({ map: T.grass, emissive: 0x060a12 }),
    asphalt: phong({ map: T.asphalt, emissive: 0x040508 }),
    sidewalk: phong({ map: T.sidewalk, emissive: 0x06070b }),
    bark: phong({ color: 0x2a1d14, emissive: 0x030305 }),
    leaves: phong({ color: 0x17260f, emissive: 0x040710 }),
    fence: phong({ map: T.fence, emissive: 0x050608 }),
    glass: phong({ color: 0x9fc6e0, transparent: true, opacity: 0.16, shininess: 120, specular: 0x8899aa, side: THREE.DoubleSide, depthWrite: false }),
    board: phong({ map: T.board }),
    rug: phong({ map: T.rug }),
    bin: phong({ color: 0x2f4a33, shininess: 30, emissive: 0x030503 }),
    bag: phong({ color: 0x18181c, shininess: 90 }),
    lampshade: phong({ color: 0xf3e3c0, emissive: 0x000000 }),
  };
  for (const k of ["wood", "wood2", "tile", "tile2", "carpetBlue"]) M[k] = phong({ map: T[k], shininess: k.startsWith("tile") ? 70 : 20 });
  for (const k of ["wpBlue", "wpGreen", "wpDamask", "wpWarm", "wpYellow", "wpTile"]) M[k] = phong({ map: T[k], shininess: k === "wpTile" ? 60 : 6 });
  W3.M = M;

  const world = new THREE.Group();
  scene.add(world);
  W3.world = world;

  // --- floors and walls, grouped by material
  const B = {};
  const gb = (k) => B[k] || (B[k] = new GeoBuilder());
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const c = tileAt(x, z);
    if (!inHouse(x, z)) continue;
    if (!isWallTile(c)) {
      const r = roomForFace(x, z);
      gb(r.floor).rect([x, 0, z], [0, 0, 1], [1, 0, 0], 1, 1, z, x, 1, 1);
      continue;
    }
    const sides = [
      [1, 0, [x + 1, 0, z + 1], [0, 0, -1]],
      [-1, 0, [x, 0, z], [0, 0, 1]],
      [0, 1, [x, 0, z + 1], [1, 0, 0]],
      [0, -1, [x + 1, 0, z], [-1, 0, 0]],
    ];
    for (const [dx, dz, o, u] of sides) {
      const nx = x + dx, nz = z + dz, nb = tileAt(nx, nz);
      if (isWallTile(nb)) continue;
      const along = dx ? z : x;
      if (!inHouse(nx, nz)) gb("siding").rect(o, u, [0, 1, 0], 1, WALL_H, along, 0, 1, 1);
      else gb(roomForFace(nx, nz).wall).rect(o, u, [0, 1, 0], 1, WALL_H, along, 0, 1, 1 / WALL_H);
    }
  }
  // sills and lintels around windows and doorways
  const trim = gb("trim");
  for (const E of ENTRIES) {
    if (E.kind === "window") { trim.box(E.x, 0, E.y, E.x + 1, 0.9, E.y + 1); trim.box(E.x, 2.05, E.y, E.x + 1, WALL_H, E.y + 1); }
    else trim.box(E.x, 2.15, E.y, E.x + 1, WALL_H, E.y + 1);
  }
  for (const D of IDOORS) trim.box(D.x, 2.12, D.y, D.x + 1, WALL_H, D.y + 1);
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) if (tileAt(x, z) === "a") trim.box(x, 2.3, z, x + 1, WALL_H, z + 1);
  for (const k in B) {
    const m = B[k].mesh(M[k]);
    if (!/^wp|siding|trim/.test(k)) m.castShadow = false;
    world.add(m);
  }
  const hw = HOUSE.x1 - HOUSE.x0 + 1, hd = HOUSE.y1 - HOUSE.y0 + 1;
  const ceilB = new GeoBuilder();
  ceilB.rect([HOUSE.x0, WALL_H, HOUSE.y0], [1, 0, 0], [0, 0, 1], hw, hd, 0, 0, 1, 1);
  const ceil = ceilB.mesh(M.ceil); ceil.castShadow = false; world.add(ceil);
  // a gabled roof: two slopes meeting at a ridge along the house
  const half = (hd + 0.6) / 2, rise = 1.7, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  for (const s of [-1, 1]) {
    const r = addBox(world, hw + 0.6, 0.12, slope, HOUSE.x0 + hw / 2, WALL_H + rise / 2 - 0.06, HOUSE.y0 + hd / 2 + s * half / 2, M.roof);
    r.rotation.x = s * ang;
    r.castShadow = false;
  }

  buildOutside(world, M, T);
  buildFurniture(world, M, T);
  buildEntries(world, M);
  buildLights(scene, world, M);
  W3.stalker = makeStalker();
  scene.add(W3.stalker.group);
  W3.phantom = makeStalker();
  W3.phantom.group.visible = false;
  scene.add(W3.phantom.group);
  W3.players = {};
  W3.v = new THREE.Vector3();
  W3.held = new THREE.Group();
  W3.held.position.set(0.3, -0.3, -0.55);
  cam.add(W3.held);
  W3.heldKind = null;
  W3.menuS = newGame([]);
}

function buildOutside(world, M, T) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), M.grass);
  T.grass.repeat.set(80, 80);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(15, -0.02, 15);
  ground.receiveShadow = true;
  world.add(ground);
  const strip = (mat, z0, z1, y, tex, rep) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, z1 - z0), mat);
    if (tex) tex.repeat.set(rep[0], rep[1]);
    m.rotation.x = -Math.PI / 2;
    m.position.set(15, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    world.add(m);
  };
  strip(M.sidewalk, 24.8, 26, 0.006, T.sidewalk, [80, 1]);
  strip(M.asphalt, 26, 31, 0.004, T.asphalt, [60, 2]);
  const line = phong({ color: 0x8a7a2a, emissive: 0x151000 });
  for (let x = -40; x < 80; x += 3) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.12), line);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.008, 28.5); world.add(d);
  }
  // front path and porch step
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.0), M.sidewalk);
  path.rotation.x = -Math.PI / 2; path.position.set(14.5, 0.007, 23.4); world.add(path);
  addBox(world, 2.2, 0.12, 1.0, 14.5, 0, 22.4, M.sidewalk);
  // fence and gate around the back yard
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const c = tileAt(x, z);
    if (c !== "f" && c !== "G") continue;
    const horiz = tileAt(x - 1, z) === "f" || tileAt(x + 1, z) === "f" || (tileAt(x, z - 1) !== "f" && tileAt(x, z + 1) !== "f" && tileAt(x, z - 1) !== "G");
    const w = horiz ? 1 : 0.08, d = horiz ? 0.08 : 1;
    if (c === "G") {
      const gate = addBox(world, 0.06, 1.25, 0.95, x + 0.5, 0.05, z + 0.5, M.fence);
      gate.rotation.y = 0.25;
    } else {
      addBox(world, w, 1.4, d, x + 0.5, 0, z + 0.5, M.fence);
    }
  }
  // outside trash bin (lid on top)
  addBox(world, 0.7, 1.0, 0.75, 27.5, 0, 15.5, M.bin);
  W3.binLid = addBox(world, 0.74, 0.06, 0.8, 27.5, 1.0, 15.5, M.bin);
  W3.binBag = addBox(world, 0.42, 0.3, 0.42, 27.5, 0.98, 15.5, M.bag);
  W3.binBag.visible = false;
  // trees
  for (const [tx, tz, s] of [[2.5, 4, 1.2], [3, 15, 1.1], [27, 4, 1.05], [2, 22, 0.9], [-5, 10, 1.4], [36, 8, 1.3], [-4, 20, 1.2], [34, 18, 1.1], [18, 2, 1.0]]) {
    addCyl(world, 0.12 * s, 0.18 * s, 2.4 * s, tx, 0, tz, M.bark, 7);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 - i * 0.25) * s, 0), M.leaves);
      f.position.set(tx + (i - 1) * 0.3 * s, (2.4 + i * 0.75) * s, tz + ((i * 37) % 5 - 2) * 0.1 * s);
      f.rotation.set(i, i * 2, 0);
      f.castShadow = f.receiveShadow = true;
      world.add(f);
    }
  }
  // parked car and a mailbox
  const car = new THREE.Group();
  const paint = phong({ color: 0x3a1414, shininess: 80, emissive: 0x050205 });
  addBox(car, 3.4, 0.7, 1.6, 0, 0.3, 0, paint);
  addBox(car, 1.9, 0.6, 1.45, -0.2, 1.0, 0, phong({ color: 0x0c1218, shininess: 120, specular: 0x445566 }));
  for (const [wx, wz] of [[-1.1, 0.8], [1.1, 0.8], [-1.1, -0.8], [1.1, -0.8]]) {
    const w = addCyl(car, 0.33, 0.33, 0.25, wx, 0.33 - 0.125, wz, M.black, 10);
    w.rotation.x = Math.PI / 2;
  }
  car.position.set(5, 0, 27.2);
  world.add(car);
  addCyl(world, 0.05, 0.05, 1.1, 17, 0, 24.5, M.black, 6);
  addBox(world, 0.25, 0.25, 0.45, 17, 1.1, 24.5, phong({ color: 0x2d4a6a }));
  // the neighbours' houses
  const houseMat = phong({ color: 0x1a1c22, emissive: 0x040508 });
  const litWin = new THREE.MeshBasicMaterial({ color: 0x9a7a40 });
  const darkWin = new THREE.MeshBasicMaterial({ color: 0x0b0d14 });
  [[-11, 14, 9, 6, 14], [42, 14, 9, 6, 14], [15, -9, 20, 6, 8], [6, 36, 14, 6, 8], [26, 36, 12, 6, 8]].forEach(([hx, hz, w, h, d], hi) => {
    addBox(world, w, h, d, hx, 0, hz, houseMat);
    for (let i = 0; i < 4; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), (i + hi) % 4 === 0 ? litWin : darkWin);
      const fy = 1.6 + (i % 2) * 2.2, off = -w / 3 + (i >> 1) * (w / 1.5);
      if (hz > 30) { win.position.set(hx + off, fy, hz - d / 2 - 0.02); win.rotation.y = Math.PI; }
      else if (hz < 0) win.position.set(hx + off, fy, hz + d / 2 + 0.02);
      else if (hx < 0) { win.position.set(hx + w / 2 + 0.02, fy, hz + off * d / w); win.rotation.y = Math.PI / 2; }
      else { win.position.set(hx - w / 2 - 0.02, fy, hz + off * d / w); win.rotation.y = -Math.PI / 2; }
      world.add(win);
    }
  });
  // moon and stars ignore the fog
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe3ee, fog: false }));
  moon.position.set(-40, 45, -60);
  world.add(moon);
  const sp = [];
  for (let i = 0; i < 600; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.3;
    sp.push(15 + Math.cos(th) * Math.sin(ph) * 90, Math.cos(ph) * 90 + 5, 15 + Math.sin(th) * Math.sin(ph) * 90);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  world.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xb4bed6, size: 0.35, fog: false })));
  // breaker box on the outside wall
  addBox(world, 0.12, 0.6, 0.45, BREAKER.x + 0.94, 1.1, BREAKER.y + 0.5, M.steel);
}

// a framed picture on a wall face (x,z on the face, n = direction into the room)
function addPicture(world, tex, x, y, z, nx, nz, w, h) {
  const g = new THREE.Group();
  addBox(g, w + 0.08, h + 0.08, 0.04, 0, -(h + 0.08) / 2, 0, W3.M.darkwood);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), phong({ map: tex }));
  p.position.z = 0.025;
  g.add(p);
  g.position.set(x + nx * 0.03, y, z + nz * 0.03);
  g.rotation.y = Math.atan2(nx, nz);
  world.add(g);
}

function buildFurniture(world, M, T) {
  for (const b of components("b")) {
    const cx = (b.x0 + b.x1 + 1) / 2, cz = (b.y0 + b.y1 + 1) / 2, w = b.x1 - b.x0 + 1, d = b.y1 - b.y0 + 1;
    addBox(world, w - 0.1, 0.42, d - 0.1, cx, 0, cz, M.darkwood);
    addBox(world, w - 0.18, 0.18, d - 0.2, cx, 0.42, cz + 0.02, M.pillow);
    addBox(world, w - 0.12, 0.08, d * 0.62, cx, 0.58, cz + d * 0.17, b.x0 < 15 ? M.blanket : M.blanket2);
    addBox(world, 0.6, 0.12, 0.35, cx - 0.4, 0.6, b.y0 + 0.35, M.pillow);
    addBox(world, 0.6, 0.12, 0.35, cx + 0.4, 0.6, b.y0 + 0.35, M.pillow);
    addBox(world, w, 1.05, 0.08, cx, 0, b.y0 + 0.05, M.darkwood);
  }
  for (const b of components("n")) {
    addBox(world, 0.55, 0.55, 0.5, b.x0 + 0.5, 0, b.y0 + 0.3, M.midwood);
    addCyl(world, 0.05, 0.08, 0.3, b.x0 + 0.5, 0.55, b.y0 + 0.3, M.brass, 8);
    const shade = addCyl(world, 0.12, 0.18, 0.2, b.x0 + 0.5, 0.82, b.y0 + 0.3, M.lampshade, 12);
    W3.nightLamp = shade;
  }
  for (const b of components("C")) addBox(world, 0.94, 2.25, 0.94, b.x0 + 0.5, 0, b.y0 + 0.5, M.closet);
  for (const b of components("L")) {
    addBox(world, 0.94, 2.3, 0.9, b.x0 + 0.5, 0, b.y0 + 0.5, M.closet);
  }
  for (const b of components("u")) {
    const cx = (b.x0 + b.x1 + 1) / 2;
    addBox(world, 1.9, 0.55, 0.85, cx, 0, b.y0 + 0.47, M.white);
    addBox(world, 1.7, 0.02, 0.65, cx, 0.5, b.y0 + 0.47, phong({ color: 0x9fc1d4, shininess: 110 }));
    addCyl(world, 0.02, 0.02, 0.25, b.x0 + 0.25, 0.55, b.y0 + 0.2, M.steel, 6);
  }
  for (const b of components("z")) {
    addCyl(world, 0.08, 0.1, 0.75, b.x0 + 0.3, 0, b.y0 + 0.5, M.white);
    addBox(world, 0.45, 0.15, 0.55, b.x0 + 0.3, 0.75, b.y0 + 0.5, M.white);
    addBox(world, 0.03, 0.7, 0.5, b.x0 + 0.02, 1.15, b.y0 + 0.5, phong({ color: 0xbcd6e0, shininess: 140, specular: 0xffffff }));
  }
  for (const b of components("o")) {
    addBox(world, 0.42, 0.42, 0.55, b.x0 + 0.55, 0, b.y0 + 0.5, M.white);
    addBox(world, 0.2, 0.45, 0.45, b.x0 + 0.88, 0.3, b.y0 + 0.5, M.white);
  }
  for (const b of components("e")) {
    addBox(world, 0.6, 0.05, 1.0, b.x0 + 0.32, 0.74, b.y0 + 0.5, M.lightwood);
    for (const [lx, lz] of [[0.06, 0.06], [0.06, 0.94], [0.58, 0.06], [0.58, 0.94]]) addBox(world, 0.04, 0.74, 0.04, b.x0 + lx, 0, b.y0 + lz, M.lightwood);
    addBox(world, 0.06, 0.32, 0.45, b.x0 + 0.12, 0.79, b.y0 + 0.5, M.black);
    addBox(world, 0.42, 0.06, 0.42, b.x0 + 0.85, 0.45, b.y0 + 0.5, M.darkwood);
  }
  for (const b of components("l")) {
    addCyl(world, 0.24, 0.2, 0.4, b.x0 + 0.5, 0, b.y0 + 0.5, phong({ color: 0xc9b38a }), 10);
    W3.laundry = new THREE.Group();
    addBox(W3.laundry, 0.32, 0.08, 0.26, 0, 0, 0, phong({ color: 0x7aa3d8 }));
    addBox(W3.laundry, 0.3, 0.08, 0.24, 0.02, 0.08, 0, phong({ color: 0xe8e0d0 }));
    addBox(W3.laundry, 0.28, 0.08, 0.24, -0.02, 0.16, 0, phong({ color: 0xd87a7a }));
    W3.laundry.position.set(b.x0 + 0.5, 0.36, b.y0 + 0.5);
    world.add(W3.laundry);
  }
  for (const b of components("v")) {
    const cx = (b.x0 + b.x1 + 1) / 2;
    addBox(world, 2, 0.5, 0.5, cx, 0, b.y0 + 0.3, M.darkwood);
    addBox(world, 1.6, 0.92, 0.07, cx, 0.55, b.y0 + 0.3, M.black);
    const c = document.createElement("canvas");
    c.width = 64; c.height = 40;
    W3.tvCanvas = c;
    W3.tvTex = new THREE.CanvasTexture(c);
    W3.tvMat = new THREE.MeshBasicMaterial({ color: 0x050507 });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.84), W3.tvMat);
    scr.position.set(cx, 1.01, b.y0 + 0.345);
    world.add(scr);
    W3.tvPos = { x: cx, z: b.y0 + 0.9 };
  }
  for (const b of components("c")) {
    const cx = (b.x0 + b.x1 + 1) / 2;
    addBox(world, 1.4, 0.06, 0.7, cx, 0.4, b.y0 + 0.5, M.lightwood);
    for (const [lx, lz] of [[-0.62, -0.28], [0.62, -0.28], [-0.62, 0.28], [0.62, 0.28]]) addBox(world, 0.05, 0.4, 0.05, cx + lx, 0, b.y0 + 0.5 + lz, M.lightwood);
    addCyl(world, 0.05, 0.05, 0.1, cx + 0.3, 0.46, b.y0 + 0.5, M.red, 8);
  }
  for (const b of components("s")) {
    const w = b.x1 - b.x0 + 1, cx = (b.x0 + b.x1 + 1) / 2, z = b.y0;
    addBox(world, w - 0.1, 0.42, 0.9, cx, 0, z + 0.5, M.sofaDark);
    addBox(world, w - 0.1, 0.55, 0.22, cx, 0.3, z + 0.86, M.sofaDark);
    for (let i = 0; i < 3; i++) addBox(world, (w - 0.6) / 3 - 0.04, 0.14, 0.62, b.x0 + 0.3 + (i + 0.5) * (w - 0.6) / 3, 0.42, z + 0.42, M.sofa);
    addBox(world, 0.22, 0.62, 0.9, b.x0 + 0.16, 0, z + 0.5, M.sofaDark);
    addBox(world, 0.22, 0.62, 0.9, b.x1 + 0.84, 0, z + 0.5, M.sofaDark);
  }
  // kitchen: counters, sink, stove, microwave, fridge, drawer, trash can
  for (const ch of ["k", "S", "O", "M", "A"]) for (const b of components(ch)) {
    const w = b.x1 - b.x0 + 1, cx = (b.x0 + b.x1 + 1) / 2;
    addBox(world, w, 0.86, 0.85, cx, 0, b.y0 + 0.44, M.cabinet);
    addBox(world, w, 0.05, 0.9, cx, 0.86, b.y0 + 0.45, M.counter);
    addBox(world, w, 0.7, 0.36, cx, 1.55, b.y0 + 0.19, M.cabinet);
    if (ch === "S") {
      addBox(world, 0.7, 0.04, 0.5, cx, 0.89, b.y0 + 0.5, M.steel);
      addCyl(world, 0.02, 0.02, 0.3, cx, 0.91, b.y0 + 0.17, M.steel, 6);
      W3.sinkDishes = addCyl(world, 0.13, 0.13, 0.08, cx - 0.12, 0.91, b.y0 + 0.5, M.white, 12);
    }
    if (ch === "O") {
      addBox(world, 0.8, 0.02, 0.7, cx, 0.91, b.y0 + 0.45, M.black);
      for (const [bx, bz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, 0.62], [0.2, 0.62]]) addCyl(world, 0.11, 0.11, 0.02, cx + bx, 0.93, b.y0 + bz, phong({ color: 0x333333 }));
    }
    if (ch === "M") {
      addBox(world, 0.55, 0.32, 0.4, cx, 0.91, b.y0 + 0.35, M.black);
      W3.microWin = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      W3.microWin.position.set(cx - 0.05, 1.07, b.y0 + 0.555);
      world.add(W3.microWin);
      W3.microPlate = addCyl(world, 0.1, 0.1, 0.03, cx - 0.05, 0.95, b.y0 + 0.35, M.white, 10);
    }
    if (ch === "A") {
      for (const y of [0.3, 0.6]) addBox(world, 0.3, 0.03, 0.02, cx, y, b.y0 + 0.88, M.brass);
      W3.battery = addBox(world, 0.12, 0.06, 0.06, cx, 0.91, b.y0 + 0.5, new THREE.MeshBasicMaterial({ color: 0xffd600 }));
    }
  }
  for (const b of components("r")) {
    addBox(world, 0.88, 1.9, 0.8, b.x0 + 0.5, 0, b.y0 + 0.42, M.white);
    addBox(world, 0.04, 0.4, 0.04, b.x0 + 0.15, 1.0, b.y0 + 0.84, M.steel);
  }
  for (const b of components("g")) {
    addCyl(world, 0.2, 0.17, 0.6, b.x0 + 0.5, 0, b.y0 + 0.45, M.steel, 12);
    W3.canBag = addCyl(world, 0.19, 0.19, 0.12, b.x0 + 0.5, 0.58, b.y0 + 0.45, M.bag, 10);
  }
  for (const b of components("T")) {
    const cx = (b.x0 + b.x1 + 1) / 2, cz = (b.y0 + b.y1 + 1) / 2;
    addBox(world, 1.6, 0.05, 1.3, cx, 0.72, cz, M.lightwood);
    for (const [lx, lz] of [[-0.7, -0.55], [0.7, -0.55], [-0.7, 0.55], [0.7, 0.55]]) addBox(world, 0.06, 0.72, 0.06, cx + lx, 0, cz + lz, M.lightwood);
    for (const [px, pz, r] of [[0, -0.95, 0], [0, 0.95, Math.PI], [-1.05, 0, Math.PI / 2], [1.05, 0, -Math.PI / 2]]) {
      const ch = new THREE.Group();
      addBox(ch, 0.44, 0.06, 0.44, 0, 0.42, 0, M.midwood);
      addBox(ch, 0.44, 0.5, 0.05, 0, 0.48, -0.2, M.midwood);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) addBox(ch, 0.04, 0.42, 0.04, lx, 0, lz, M.midwood);
      ch.position.set(cx + px, 0, cz + pz);
      ch.rotation.y = r;
      world.add(ch);
    }
    W3.tablePlate = addCyl(world, 0.13, 0.13, 0.02, cx - 0.3, 0.77, cz - 0.2, phong({ color: 0xd8d4c8 }), 12);
  }
  for (const b of components("h")) {
    addCyl(world, 0.3, 0.26, 0.72, b.x0 + 0.5, 0, b.y0 + 0.5, M.midwood, 16);
    const ph = new THREE.Group();
    addBox(ph, 0.24, 0.08, 0.18, 0, 0, 0, M.red);
    addBox(ph, 0.26, 0.05, 0.06, 0, 0.09, 0, M.red);
    ph.position.set(b.x0 + 0.5, 0.72, b.y0 + 0.5);
    world.add(ph);
    W3.phone = ph;
    W3.phonePos = { x: b.x0 + 0.5, z: b.y0 + 0.5 };
  }
  // fuse box on the hallway side of its wall
  for (const b of components("F")) {
    addBox(world, 0.1, 0.7, 0.5, b.x0 - 0.05, 1.2, b.y0 + 0.5, M.steel);
    W3.fuseLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
    W3.fuseLed.position.set(b.x0 - 0.11, 1.8, b.y0 + 0.68);
    world.add(W3.fuseLed);
  }
  // rugs, plants and pictures make it a home
  const rug = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.rug); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.receiveShadow = true; world.add(m); };
  rug(3.4, 2.4, 10.6, 17.4);
  rug(6, 1.3, 15.5, 12.95);
  const plant = (x, z) => { addCyl(world, 0.18, 0.14, 0.35, x, 0, z, M.red, 10); const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), phong({ color: 0x3f7a3a })); f.position.set(x, 0.65, z); f.castShadow = true; world.add(f); };
  plant(8.5, 20.5); plant(22.5, 20.5); plant(8.5, 12.4);
  addPicture(world, T.art[0], 12.5, 1.9, 21, 0, -1, 0.9, 0.62);
  addPicture(world, T.art[1], 8, 1.9, 9, 1, 0, 0.5, 0.66);
  addPicture(world, T.art[2], 17.5, 1.9, 14, 0, -1, 0.9, 0.62);
  addPicture(world, T.art[1], 8, 1.9, 16.5, 1, 0, 0.5, 0.66);
}

function buildEntries(world, M) {
  const boardGeo = new THREE.BoxGeometry(1.3, 0.17, 0.045);
  const makeDoor = (g, mat) => {
    const hinge = new THREE.Group();
    hinge.position.set(-0.47, 0, 0);
    addBox(hinge, 0.94, 2.1, 0.06, 0.47, 0, 0, mat);
    addBox(hinge, 0.06, 0.06, 0.16, 0.84, 1.0, 0, M.brass);
    g.add(hinge);
    return hinge;
  };
  W3.entries = ENTRIES.map((E) => {
    const horiz = E.dy !== 0;
    const g = new THREE.Group();
    g.position.set(E.x + 0.5, 0, E.y + 0.5);
    if (!horiz) g.rotation.y = Math.PI / 2;
    world.add(g);
    const inSign = horiz ? -E.dy : -E.dx; // +1 when local +z points into the house
    const o = { g, glass: null, shards: [], door: null, boards: [], E, rot: 0 };
    if (E.kind === "window") {
      o.glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.15), M.glass);
      o.glass.position.set(0, 1.475, 0);
      g.add(o.glass);
      addBox(g, 0.05, 1.15, 0.07, 0, 0.9, 0, M.trim);
      addBox(g, 1, 0.05, 0.07, 0, 1.45, 0, M.trim);
      const shardMat = phong({ color: 0xaaccdd, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + (i % 3) * 0.06, 0.25 + (i % 2) * 0.15), shardMat);
        s.position.set(-0.45 + (i * 0.37) % 0.9, i % 2 ? 0.98 : 1.95, 0);
        s.rotation.z = i * 0.9;
        s.visible = false;
        g.add(s);
        o.shards.push(s);
      }
    } else {
      o.door = makeDoor(g, M.extDoor);
      o.openRot = 1.6 * (inSign > 0 ? -1 : 1);
      o.bolt = addBox(g, 0.04, 0.04, 0.05, 0.36, 1.18, 0.05 * inSign, M.brass);
    }
    const heights = E.kind === "window" ? [1.15, 1.78, 1.47] : [0.6, 1.15, 1.72];
    const tilts = E.kind === "window" ? [0.28, -0.3, 0.05] : [0.14, -0.12, 0.04];
    for (let k = 0; k < MAX_BOARDS; k++) {
      const b = new THREE.Mesh(boardGeo, M.board.clone());
      b.position.set(0, heights[k], 0.44 * inSign);
      b.rotation.z = tilts[k];
      b.castShadow = b.receiveShadow = true;
      b.visible = false;
      g.add(b);
      o.boards.push(b);
    }
    o.base = { x: g.position.x, z: g.position.z };
    return o;
  });
  // room doors swing into the rooms (north of the hallway)
  W3.idoors = IDOORS.map((D) => {
    const g = new THREE.Group();
    g.position.set(D.x + 0.5, 0, D.y + 0.5);
    world.add(g);
    const hinge = makeDoor(g, M.door);
    return { hinge, rot: 1.45, openRot: 1.45 };
  });
  // light switches
  W3.switches = SWITCHES.map((sw) => {
    const g = new THREE.Group();
    g.position.set(sw.x + sw.nx * 0.01, 1.2, sw.y + sw.ny * 0.01);
    g.rotation.y = Math.atan2(sw.nx, sw.ny);
    addBox(g, 0.09, 0.13, 0.015, 0, -0.065, 0, M.trim);
    const nub = addBox(g, 0.025, 0.045, 0.025, 0, -0.022, 0.015, M.white);
    world.add(g);
    return { nub, room: sw.room };
  });
}

function buildLights(scene, world, M) {
  W3.hemi = new THREE.HemisphereLight(0x2a3a60, 0x0a0806, 0.2);
  scene.add(W3.hemi);
  const moon = new THREE.DirectionalLight(0x8899cc, 0.12);
  moon.position.set(-20, 40, -30);
  scene.add(moon);
  // one warm ceiling light per room; the long hallway gets one in the middle
  W3.rooms = [];
  for (const r of ROOMS) {
    const lx = r.id === "hall" ? 15 : r.lights[0][0], lz = r.id === "hall" ? 13 : r.lights[0][1];
    const l = new THREE.PointLight(0xffe4bd, 1.35, r.id === "hall" ? 11 : 9, 1.3);
    l.position.set(lx, WALL_H - 0.35, lz);
    scene.add(l);
    const fixtures = r.lights.map(([fx, fz]) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff3dc }));
      m.position.set(fx, WALL_H - 0.01, fz);
      world.add(m);
      return m;
    });
    W3.rooms.push({ id: r.id, light: l, fixtures, base: 1.35 });
  }
  // porch light, back yard light, street light
  const fixture = (x, y, z) => { const m = addBox(world, 0.18, 0.22, 0.12, x, y, z, new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); m.castShadow = false; return m; };
  W3.porch = { light: new THREE.PointLight(0xffc98a, 1.1, 6, 1.6), fix: fixture(PORCH_LIGHT.x + 0.7, 2.0, 22.07) };
  W3.porch.light.position.set(PORCH_LIGHT.x + 0.7, 2.0, 22.5);
  scene.add(W3.porch.light);
  W3.yardLight = { light: new THREE.PointLight(0xdfe8ff, 0, 8, 1.5), fix: fixture(24.07, 2.3, YARD_LIGHT.y) };
  W3.yardLight.light.position.set(24.5, 2.3, YARD_LIGHT.y);
  scene.add(W3.yardLight.light);
  W3.street = [];
  STREETLIGHTS.forEach((s, i) => {
    addCyl(world, 0.07, 0.09, 4.2, s.x, 0, s.y + 0.3, phong({ color: 0x333336 }), 8);
    addBox(world, 0.1, 0.1, 0.9, s.x, 4.1, s.y - 0.1, phong({ color: 0x333336 }));
    const head = addBox(world, 0.35, 0.12, 0.25, s.x, 4.0, s.y - 0.5, new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    head.castShadow = false;
    if (i === 0) {
      const l = new THREE.PointLight(0xffb070, 2.4, 9, 1.4);
      l.position.set(s.x, 3.8, s.y - 0.5);
      scene.add(l);
      W3.street.push(l);
    }
  });
  W3.tvLight = new THREE.PointLight(0x8ab4ff, 0, 6, 1.8);
  W3.tvLight.position.set(W3.tvPos ? W3.tvPos.x : 10, 1.1, W3.tvPos ? W3.tvPos.z : 16);
  scene.add(W3.tvLight);
  // flashlights: [0] is yours, the rest follow the nearest friends
  W3.flash = [];
  W3.beams = [];
  const beamGeo = new THREE.CylinderGeometry(0.03, 1.5, 7, 16, 1, true);
  beamGeo.translate(0, -3.5, 0);
  beamGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.SpotLight(0xfff2d6, 0, 15, 0.46, 0.45, 1.2);
    if (i === 0) {
      s.shadow.mapSize.set(512, 512);
      s.shadow.camera.near = 0.1; s.shadow.camera.far = 15;
      s.shadow.bias = -0.002;
      s.shadow.normalBias = 0.03;
    }
    scene.add(s);
    scene.add(s.target);
    W3.flash.push(s);
    if (i > 0) {
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff2d6, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.visible = false;
      scene.add(beam);
      W3.beams.push(beam);
    }
  }
  W3.scareLight = new THREE.PointLight(0xff2010, 0, 3, 2);
  scene.add(W3.scareLight);
}

// things you carry, shown in your hand and in your friends' hands
function makeItem(kind, n) {
  const g = new THREE.Group();
  const M = W3.M;
  switch (kind) {
    case "food": addBox(g, 0.22, 0.05, 0.16, 0, 0, 0, phong({ color: 0xd84a3a })); addBox(g, 0.18, 0.052, 0.08, 0.01, 0, 0.02, M.pillow); break;
    case "hot": addCyl(g, 0.13, 0.13, 0.02, 0, 0, 0, M.white, 12); { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), phong({ color: 0xc9772e })); f.scale.y = 0.5; f.position.y = 0.03; g.add(f); } break;
    case "plate": addCyl(g, 0.13, 0.13, 0.02, 0, 0, 0, phong({ color: 0xb8b2a4 }), 12); break;
    case "trash": { const b = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.bag); b.scale.set(1, 1.2, 1); b.position.y = -0.1; g.add(b); break; }
    case "bulb": { const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })); s.position.y = 0.05; g.add(s); addCyl(g, 0.025, 0.025, 0.04, 0, -0.01, 0, M.steel, 8); break; }
    case "laundry": addBox(g, 0.32, 0.08, 0.26, 0, 0, 0, phong({ color: 0x7aa3d8 })); addBox(g, 0.3, 0.08, 0.24, 0, 0.08, 0, phong({ color: 0xe8e0d0 })); break;
    case "plank": for (let i = 0; i < (n || 1); i++) { const b = addBox(g, 0.12, 0.04, 1.0, 0.0, i * 0.045, -0.2, M.board); b.rotation.y = 0.2; } break;
    case "handset": {
      // the landline receiver, held up to your ear
      addBox(g, 0.06, 0.05, 0.24, 0, 0, 0, M.red);
      addBox(g, 0.08, 0.07, 0.07, 0, -0.03, -0.11, M.red);
      addBox(g, 0.08, 0.07, 0.07, 0, -0.03, 0.11, M.red);
      g.position.set(0.12, 0.16, -0.08);
      g.rotation.set(0.2, 0.5, 1.35);
      g.scale.setScalar(0.8);
      break;
    }
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = false; } });
  return g;
}


// ------------------------------ characters ---------------------------------
function makeStalker() {
  const g = new THREE.Group();
  const black = phong({ color: 0x09090b, shininess: 4 });
  const mask = phong({ color: 0xd8cfbe, shininess: 30 });
  const hole = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3020 });
  const parts = {};
  const body = new THREE.Group();
  g.add(body);
  const legL = addCyl(body, 0.055, 0.06, 0.55, -0.1, 0, 0, black, 6);
  const legR = addCyl(body, 0.055, 0.06, 0.55, 0.1, 0, 0, black, 6);
  addCyl(body, 0.17, 0.32, 1.15, 0, 0.42, 0, black, 10);
  addBox(body, 0.56, 0.22, 0.24, 0, 1.47, 0, black);
  addCyl(body, 0.05, 0.06, 0.16, 0, 1.68, 0.02, black, 6);
  const head = new THREE.Group();
  head.position.set(0, 1.92, 0.04);
  body.add(head);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), black);
  hood.scale.set(1, 1.15, 1);
  hood.castShadow = true;
  head.add(hood);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.125, 12, 10), mask);
  face.scale.set(0.85, 1.1, 0.55);
  face.position.set(0, -0.01, 0.085);
  head.add(face);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), hole);
    h.position.set(s * 0.045, 0.025, 0.145);
    head.add(h);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), eye);
    e.position.set(s * 0.045, 0.025, 0.163);
    head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), hole);
  mouth.position.set(0, -0.07, 0.15);
  head.add(mouth);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.3, 1.52, 0);
    const arm = addCyl(a, 0.04, 0.05, 1.0, 0, -1.0, 0, black, 6);
    arm.castShadow = true;
    for (let f = 0; f < 3; f++) addBox(a, 0.015, 0.16, 0.015, (f - 1) * 0.025, -1.17, 0.02, black);
    body.add(a);
    arms.push(a);
  }
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  Object.assign(parts, { body, head, legL, legR, arms });
  return { group: g, parts, last: new THREE.Vector3(), phase: 0 };
}

function makePlayerModel(color) {
  const g = new THREE.Group();
  const body = phong({ color: new THREE.Color(color), shininess: 20 });
  const pants = phong({ color: 0x23252b });
  const skin = phong({ color: 0xd6b08c });
  addBox(g, 0.3, 0.8, 0.2, 0, 0, 0, pants);
  addCyl(g, 0.2, 0.22, 0.65, 0, 0.8, 0, body, 10);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
  head.position.y = 1.6;
  head.castShadow = true;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, 1.6), phong({ color: 0x2a1c12 }));
  hair.position.y = 1.62;
  g.add(hair);
  const torch = addCyl(g, 0.03, 0.03, 0.22, -0.16, 1.1, 0.18, phong({ color: 0x222222 }), 6);
  torch.rotation.x = Math.PI / 2;
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  const hand = new THREE.Group();
  hand.position.set(0.12, 1.0, 0.32);
  g.add(hand);
  W3.scene.add(g);
  return { group: g, hand, phase: 0, last: new THREE.Vector3() };
}

function faceYaw(a) { return Math.PI / 2 - a; } // model +z faces game angle a

function lieAngle(x, y, a) {
  for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
    const c = Math.cos(a + da), s = Math.sin(a + da);
    const open = (tx, ty) => ".ay".indexOf(tileAt(tx, ty)) >= 0;
    if (open(Math.floor(x + c * 0.85), Math.floor(y + s * 0.85)) && open(Math.floor(x - c * 0.85), Math.floor(y - s * 0.85))) return a + da;
  }
  return a;
}

function poseStalker(model, x, z, a, t, opts) {
  const g = model.group, p = model.parts;
  const moved = Math.hypot(x - model.last.x, z - model.last.z);
  model.last.set(x, 0, z);
  model.phase += Math.min(moved, 0.2) * 5;
  g.position.set(x, 0, z);
  g.rotation.y = faceYaw(a);
  const sw = Math.sin(model.phase);
  p.legL.rotation.x = sw * 0.4; p.legR.rotation.x = -sw * 0.4;
  p.body.position.y = Math.abs(Math.cos(model.phase)) * 0.03;
  const bang = opts.bang || 0;
  for (let i = 0; i < 2; i++) {
    const arm = p.arms[i];
    arm.rotation.x = bang > 0 ? -1.6 * Math.sin((1 - bang / 0.4) * Math.PI) : (i ? -sw : sw) * 0.25 + Math.sin(t * 1.3 + i) * 0.04;
    arm.rotation.z = (i ? -1 : 1) * 0.06;
  }
  p.body.rotation.x = 0.12; // hunched
  p.head.rotation.z = Math.sin(t * 0.7) * 0.25 + (opts.stun ? (Math.random() - 0.5) * 0.6 : 0);
  p.head.rotation.x = opts.stun ? (Math.random() - 0.5) * 0.4 : -0.1;
}

// ------------------------------ per-frame ----------------------------------
// ------------------------------ per-frame ----------------------------------
function lerpTo(cur, target, k) { return cur + (target - cur) * k; }

function updateWorld(S, t, dt) {
  const k = 1 - Math.exp(-(dt || 0.016) * 9);
  const flick = S.flick > 0 && Math.sin(t * 40) * Math.sin(t * 17) > 0;
  for (const r of W3.rooms) {
    const st = S.rooms[r.id];
    const on = S.power && !flick && st.on && st.bulb;
    r.light.intensity = on ? r.base : 0;
    for (const f of r.fixtures) f.material.color.setHex(on ? 0xfff3dc : st.bulb ? 0x4a4640 : 0x24221f);
  }
  if (W3.nightLamp) W3.nightLamp.material.emissive.setHex(S.power && S.rooms.bed1.on ? 0x6a5a40 : 0x000000);
  // outside lights: porch light runs on the house power; the yard light is motion-activated
  W3.porch.light.intensity = S.power && !flick ? 1.1 : 0;
  W3.porch.fix.material.color.setHex(S.power ? 0xffd9a0 : 0x2a2622);
  const st = S.stalker;
  const motion = S.power && (Object.values(S.players).some((p) => inYard(p.x, p.y)) || (st.state !== "away" && st.x > 23.5 && st.x < 30 && st.y > 13 && st.y < 23));
  W3.yardLight.light.intensity = lerpTo(W3.yardLight.light.intensity, motion ? 1.6 : 0, k);
  W3.yardLight.fix.material.color.setHex(motion ? 0xf2f6ff : 0x2a2a2e);
  W3.fuseLed.material.color.setHex(S.power ? 0x00ff66 : (Math.floor(t * 3) % 2 ? 0xff1744 : 0x220000));
  if (W3.battery) W3.battery.visible = S.batteries > 0;
  // light switches flip up and down
  W3.switches.forEach((s) => { const on = S.rooms[s.room].on; s.nub.position.y = on ? -0.012 : -0.034; s.nub.rotation.x = on ? -0.4 : 0.4; });
  // chore props
  W3.canBag.visible = S.trash === "can";
  W3.binBag.visible = S.trash === "bin";
  W3.tablePlate.visible = !!S.plateOnTable;
  if (W3.laundry) W3.laundry.visible = S.laundry === "basket";
  W3.microPlate.visible = S.micro.st !== "off";
  W3.microWin.material.color.setHex(S.micro.st === "cooking" ? 0xffcf6a : 0x111111);
  // TV static
  if (S.tv && S.power) {
    const g = W3.tvCanvas.getContext("2d"), img = g.createImageData(64, 40);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = v; img.data[i + 2] = Math.min(255, v + 30); img.data[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    W3.tvTex.needsUpdate = true;
    if (!W3.tvOn) { W3.tvMat.map = W3.tvTex; W3.tvMat.color.setHex(0xffffff); W3.tvMat.needsUpdate = true; W3.tvOn = true; }
    W3.tvLight.intensity = 0.6 + Math.random() * 0.6;
  } else if (W3.tvOn) {
    W3.tvMat.map = null; W3.tvMat.color.setHex(0x050507); W3.tvMat.needsUpdate = true; W3.tvOn = false;
    W3.tvLight.intensity = 0;
  }
  // the phone rattles when it rings
  W3.phone.position.x = W3.phonePos.x + (S.phone > 0 ? (Math.random() - 0.5) * 0.02 : 0);
  W3.phone.rotation.y = S.phone > 0 ? (Math.random() - 0.5) * 0.15 : 0;
  // doors, windows, boards
  W3.entries.forEach((o, i) => {
    const e = S.entries[i];
    const j = e.hit > 0 ? e.hit * 0.025 : 0;
    o.g.position.x = o.base.x + (Math.random() - 0.5) * j;
    o.g.position.z = o.base.z + (Math.random() - 0.5) * j;
    if (o.glass) { o.glass.visible = !e.broken; o.shards.forEach((s) => (s.visible = e.broken)); }
    if (o.door) {
      o.rot = lerpTo(o.rot, e.broken ? o.openRot * 1.15 : e.open ? o.openRot : 0, k);
      o.door.rotation.y = o.rot;
      o.door.rotation.z = e.broken ? 0.06 : 0;
      o.bolt.position.x = e.locked ? 0.36 : 0.3;
    }
    o.boards.forEach((b, n) => {
      b.visible = n < e.boards;
      b.material.color.setHex(n === e.boards - 1 && e.bhp < 55 ? 0x8a7a6a : 0xffffff);
    });
  });
  W3.idoors.forEach((o, i) => { o.rot = lerpTo(o.rot, S.idoors[i].open ? o.openRot : 0, k); o.hinge.rotation.y = o.rot; });
}

function setHeld(group, holder, kind, n) {
  const key = kind ? kind + (n || 0) : null;
  if (holder.heldKey === key) return;
  holder.heldKey = key;
  while (group.children.length) group.remove(group.children[0]);
  if (kind) group.add(makeItem(kind, n));
}

function updateCharacters(S, me, G, t) {
  const sr = G.stR, st = W3.stalker;
  st.group.visible = S.stalker.state !== "away";
  if (st.group.visible) poseStalker(st, sr.x, sr.y, sr.a, t, { stun: S.stalker.stun, bang: G.stBang || 0 });
  if (G.phantom) {
    W3.phantom.group.visible = true;
    poseStalker(W3.phantom, G.phantom.x, G.phantom.y, G.phantom.a, t, {});
  } else W3.phantom.group.visible = false;
  // other players
  const seen = {};
  for (const p of Object.values(S.players)) {
    if (p.id === G.myId) continue;
    seen[p.id] = true;
    const r = G.rpos[p.id] || { x: p.x, y: p.y, a: p.a };
    const m = W3.players[p.id] || (W3.players[p.id] = makePlayerModel(p.color));
    m.group.visible = !p.hidden;
    const moved = Math.hypot(r.x - m.last.x, r.y - m.last.z);
    m.last.set(r.x, 0, r.y);
    m.phase += Math.min(moved, 0.2) * 7;
    if (p.down) {
      if (m.lieA == null) m.lieA = lieAngle(r.x, r.y, r.a);
      const la = m.lieA;
      m.group.position.set(r.x + Math.cos(la) * 0.85, 0.18, r.y + Math.sin(la) * 0.85);
      m.group.rotation.set(-Math.PI / 2, faceYaw(la), 0, "YXZ");
    } else {
      m.lieA = null;
      m.group.position.set(r.x, Math.abs(Math.sin(m.phase)) * 0.04, r.y);
      m.group.rotation.set(0, faceYaw(r.a), 0, "YXZ");
    }
    setHeld(m.hand, m, p.down ? null : p.carry, p.carryN);
  }
  for (const id in W3.players) if (!seen[id]) { W3.scene.remove(W3.players[id].group); delete W3.players[id]; }
  // what you're holding
  setHeld(W3.held, W3, me.down || me.hidden ? null : G.call ? "handset" : me.carry, me.carryN);
  W3.held.position.y = -0.3 + (G.bob || 0) * 0.6;
}
const opts3d = { menu: false };

function updateFlashlights(S, me, G, t) {
  const cam = W3.camera;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const f0 = W3.flash[0];
  f0.position.copy(cam.position).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.28, 0)).addScaledVector(fwd, 0.15);
  f0.target.position.copy(cam.position).addScaledVector(fwd, 6);
  const on = !opts3d.menu && flashOn(me);
  f0.intensity = on ? (me.bat < 15 && Math.random() < 0.25 ? 0.4 : 2.3) : 0;
  const others = Object.values(S.players)
    .filter((p) => p.id !== G.myId && flashOn(p))
    .map((p) => { const r = G.rpos[p.id] || p; return { p, r, d: Math.hypot(r.x - me.x, r.y - me.y) }; })
    .sort((a, b) => a.d - b.d);
  for (let i = 1; i < W3.flash.length; i++) {
    const s = W3.flash[i], beam = W3.beams[i - 1], o = others[i - 1];
    if (!o || opts3d.menu) { s.intensity = 0; beam.visible = false; continue; }
    const a = o.r.a, pt = o.p.pt || 0;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(pt), Math.sin(pt), Math.sin(a) * Math.cos(pt));
    s.position.set(o.r.x + Math.cos(a) * 0.2 - Math.sin(a) * 0.16, 1.25, o.r.y + Math.sin(a) * 0.2 + Math.cos(a) * 0.16);
    s.target.position.copy(s.position).addScaledVector(dir, 6);
    s.intensity = o.p.bat < 15 && Math.random() < 0.25 ? 0.4 : 2.0;
    beam.visible = true;
    beam.position.copy(s.position);
    beam.lookAt(s.target.position);
  }
}

function placeCamera(S, me, G, t) {
  const cam = W3.camera;
  let x = me.x, z = me.y, y = EYE_H + (G.bob || 0), roll = 0;
  if (me.hidden) {
    const under = tileAt(Math.floor(me.hideX), Math.floor(me.hideY)) === "b";
    x = me.hideX; z = me.hideY; y = under ? 0.22 : 1.45;
  } else if (me.down) { y = 0.35; roll = 0.45; }
  cam.position.set(x + (G.shakeX || 0), y + (G.shakeY || 0), z);
  cam.rotation.set(me.pitch || 0, -me.a - Math.PI / 2, roll);
  cam.updateMatrixWorld();
}

// The jumpscare: his face, right in front of yours
function poseScare(G, t) {
  const cam = W3.camera, k = G.scare / 1.4;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const dist = 0.55 + (k - 0.6) * 0.6;
  const px = cam.position.x + fwd.x * Math.max(0.35, dist), pz = cam.position.z + fwd.z * Math.max(0.35, dist);
  const st = W3.stalker;
  st.group.visible = true;
  st.group.position.set(px, cam.position.y - 1.9 + (Math.random() - 0.5) * 0.04, pz);
  st.group.rotation.y = Math.atan2(cam.position.x - px, cam.position.z - pz);
  st.parts.head.rotation.z = (Math.random() - 0.5) * 0.5;
  st.parts.arms.forEach((a) => (a.rotation.x = -2.2));
  W3.scareLight.position.set(cam.position.x + fwd.x * 0.2, cam.position.y + 0.1, cam.position.z + fwd.z * 0.2);
  W3.scareLight.intensity = 2.5;
}

function renderGame(S, me, G, t, dt) {
  if (!R.ok) return drawNoGL();
  opts3d.menu = false;
  updateWorld(S, t, dt);
  placeCamera(S, me, G, t);
  updateCharacters(S, me, G, t);
  W3.scareLight.intensity = 0;
  if (G.scare > 0 && me.down) poseScare(G, t);
  updateFlashlights(S, me, G, t);
  W3.renderer.render(W3.scene, W3.camera);
  trackFps(dt);
  drawOverlay(S, me, G, t);
}

function renderMenu(t, dt) {
  if (!R.ok) return drawNoGL();
  opts3d.menu = true;
  const S = W3.menuS;
  updateWorld(S, t, dt);
  const a = t * 0.05;
  const cam = W3.camera;
  cam.position.set(15 + Math.cos(a) * 17, 2.6, 14 + Math.sin(a) * 15);
  cam.rotation.set(0, 0, 0);
  cam.lookAt(15, 1.6, 14);
  cam.updateMatrixWorld();
  const sa = -t * 0.09;
  const sx = 15 + Math.cos(sa) * 12.5, sz = 14 + Math.sin(sa) * 10.8;
  W3.stalker.group.visible = true;
  poseStalker(W3.stalker, sx, sz, Math.atan2(-Math.cos(sa) * 10.8, Math.sin(sa) * 12.5), t, {});
  W3.phantom.group.visible = false;
  for (const id in W3.players) { W3.scene.remove(W3.players[id].group); delete W3.players[id]; }
  setHeld(W3.held, W3, null);
  for (const s of W3.flash) s.intensity = 0;
  for (const b of W3.beams) b.visible = false;
  W3.scareLight.intensity = 0;
  W3.renderer.render(W3.scene, W3.camera);
  trackFps(dt);
  const g = R.h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, R.W, R.H);
  const vg = g.createRadialGradient(R.W / 2, R.H / 2, R.H * 0.15, R.W / 2, R.H / 2, R.H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0.2)"); vg.addColorStop(1, "rgba(0,0,0,0.85)");
  g.fillStyle = vg; g.fillRect(0, 0, R.W, R.H);
}

function drawNoGL() {
  const g = R.h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "#050507"; g.fillRect(0, 0, R.W, R.H);
}

// screen position of a world point, or null if behind the camera
function projectToScreen(x, y, z) {
  const v = W3.v.set(x, y, z).project(W3.camera);
  if (v.z > 1 || v.z < -1) return null;
  return [(v.x + 1) / 2 * R.W, (1 - v.y) / 2 * R.H];
}
