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
  const wood = (base) => (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) {
      g.fillStyle = `rgba(${srand() * 40 | 0},${srand() * 20 | 0},0,${0.12 + srand() * 0.12})`;
      g.fillRect(0, r * 32, w, 32);
      for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(0, r * 32 + 3 + srand() * 26, w, 1); }
      g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(0, r * 32, w, 2);
      g.fillRect(((r * 53) % 128), r * 32, 2, 32);
    }
  };
  T.wood = ctex(128, 128, wood("#6a4c34"));
  T.wood2 = ctex(128, 128, wood("#57402e"));
  const checker = (a, b) => (g, w, h) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 32, j * 32, 32, 32); }
    g.strokeStyle = "rgba(30,30,30,0.6)"; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    speckle(g, w, h, 300, "rgba(0,0,0,0.08)", 2);
  };
  T.tile = ctex(128, 128, checker("#8d9298", "#787d83"));
  T.tile2 = ctex(128, 128, checker("#7a7668", "#625f55"));
  T.carpet = ctex(128, 128, (g, w, h) => { g.fillStyle = "#5c4244"; g.fillRect(0, 0, w, h); speckle(g, w, h, 1400, "rgba(0,0,0,0.18)", 1); speckle(g, w, h, 600, "rgba(255,200,200,0.05)", 1); });
  T.wall = ctex(128, 256, (g, w, h) => {
    g.fillStyle = "#7d7262"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = "rgba(255,240,210,0.05)"; g.fillRect(x, 0, 8, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(80,60,40,0.15)"; g.fillRect(srand() * w, srand() * h, 3, 3); }
    g.fillStyle = "rgba(40,30,20,0.25)"; g.fillRect(0, h * 0.62, w, 3);
    g.fillStyle = "#3b2c22"; g.fillRect(0, h - 12, w, 12);
    g.fillStyle = "#d9d2c3"; g.fillRect(0, 0, w, 5);
    // water stain
    const sg = g.createRadialGradient(80, 60, 2, 80, 60, 40);
    sg.addColorStop(0, "rgba(70,60,30,0.25)"); sg.addColorStop(1, "rgba(70,60,30,0)");
    g.fillStyle = sg; g.fillRect(0, 0, w, h);
  });
  T.brick = ctex(128, 128, (g, w, h) => {
    g.fillStyle = "#2c2622"; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) {
      const v = 70 + srand() * 30;
      g.fillStyle = `rgb(${v | 0},${v * 0.55 | 0},${v * 0.45 | 0})`;
      g.fillRect(c * 32 + (r % 2) * 16 + 1, r * 16 + 1, 30, 14);
    }
  });
  T.grass = ctex(128, 128, (g, w, h) => { g.fillStyle = "#1c2a15"; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, "rgba(70,100,40,0.35)", 2); speckle(g, w, h, 500, "rgba(0,0,0,0.3)", 2); });
  T.asphalt = ctex(128, 128, (g, w, h) => { g.fillStyle = "#1b1b1e"; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, "rgba(255,255,255,0.05)", 1); });
  T.sidewalk = ctex(128, 128, (g, w, h) => { g.fillStyle = "#4a4a4c"; g.fillRect(0, 0, w, h); speckle(g, w, h, 800, "rgba(0,0,0,0.2)", 2); g.fillStyle = "#2c2c2e"; g.fillRect(0, 0, 2, h); g.fillRect(0, 0, w, 2); });
  T.rug = ctex(256, 128, (g, w, h) => {
    g.fillStyle = "#4a1e22"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#a07a46"; g.lineWidth = 4; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = "#6a2e30"; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(w / 2, h / 2, 20 + i * 16, 8 + i * 8, 0, 0, 7); g.stroke(); }
    speckle(g, w, h, 900, "rgba(0,0,0,0.15)", 1);
  });
  T.closet = ctex(64, 128, (g, w, h) => {
    g.fillStyle = "#5d4430"; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let y = 10; y < h - 10; y += 6) { g.fillRect(4, y, 25, 2); g.fillRect(35, y, 25, 2); }
    g.fillStyle = "#1e140c"; g.fillRect(31, 0, 2, h);
    g.fillStyle = "#c9a96e"; g.fillRect(27, 60, 2, 8); g.fillRect(35, 60, 2, 8);
  });
  T.door = ctex(64, 128, (g, w, h) => {
    g.fillStyle = "#5a3a24"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 2;
    g.strokeRect(8, 8, 48, 50); g.strokeRect(8, 68, 48, 52);
  });
  T.board = ctex(128, 16, (g, w, h) => {
    g.fillStyle = "#9b7a50"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) { g.fillStyle = "rgba(60,40,20,0.3)"; g.fillRect(0, srand() * h, w, 1); }
    g.fillStyle = "#222"; g.fillRect(6, 6, 3, 3); g.fillRect(w - 9, 6, 3, 3);
  });
  T.board.wrapS = T.board.wrapT = THREE.ClampToEdgeWrapping;
  return T;
}

// --------------------------- geometry helpers ------------------------------
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
function setup3D() {
  const renderer = new THREE.WebGLRenderer({ canvas: R.gl, antialias: false, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  W3.renderer = renderer;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050b);
  scene.fog = new THREE.FogExp2(0x04050b, 0.055);
  W3.scene = scene;
  const cam = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  cam.rotation.order = "YXZ";
  W3.camera = cam;
  scene.add(cam);
  const T = makeTextures();
  W3.T = T;

  // --- materials
  const M = {
    wall: phong({ map: T.wall }),
    ext: phong({ map: T.brick, emissive: 0x07090f }),
    trim: phong({ color: 0x8a8174 }),
    ceil: phong({ color: 0x3a3532 }),
    roof: phong({ color: 0x15161a, emissive: 0x05060a }),
    wood: phong({ map: T.wood, shininess: 25 }),
    wood2: phong({ map: T.wood2, shininess: 25 }),
    tile: phong({ map: T.tile, shininess: 50 }),
    tile2: phong({ map: T.tile2, shininess: 40 }),
    carpet: phong({ map: T.carpet }),
    darkwood: phong({ color: 0x3e2a1e }),
    midwood: phong({ color: 0x6d4c33, shininess: 20 }),
    white: phong({ color: 0xd8dcdf, shininess: 60 }),
    steel: phong({ color: 0x9aa0a4, shininess: 70 }),
    black: phong({ color: 0x111114, shininess: 30 }),
    blanket: phong({ color: 0x3f5a7a }),
    blanket2: phong({ color: 0x6b3a4a }),
    pillow: phong({ color: 0xd9d4c7 }),
    sofa: phong({ color: 0x5e2a33 }),
    sofaDark: phong({ color: 0x45202a }),
    counter: phong({ color: 0x8d8d88, shininess: 40 }),
    cabinet: phong({ color: 0x6f6152 }),
    closet: phong({ map: T.closet }),
    door: phong({ map: T.door, shininess: 15 }),
    brass: phong({ color: 0xd4af37, shininess: 90 }),
    red: phong({ color: 0xb71c1c, shininess: 60 }),
    grass: phong({ map: T.grass, emissive: 0x050810 }),
    asphalt: phong({ map: T.asphalt, emissive: 0x040508 }),
    sidewalk: phong({ map: T.sidewalk, emissive: 0x05060a }),
    bark: phong({ color: 0x2a1d14, emissive: 0x030305 }),
    leaves: phong({ color: 0x14220f, emissive: 0x040710 }),
    glass: phong({ color: 0x9fc6e0, transparent: true, opacity: 0.16, shininess: 120, specular: 0x8899aa, side: THREE.DoubleSide, depthWrite: false }),
    board: phong({ map: T.board }),
  };
  W3.M = M;
  M.rug = phong({ map: T.rug });

  const world = new THREE.Group();
  scene.add(world);

  // --- floors, walls, ceiling
  const floorB = { wood: new GeoBuilder(), wood2: new GeoBuilder(), tile: new GeoBuilder(), tile2: new GeoBuilder(), carpet: new GeoBuilder() };
  const wallB = new GeoBuilder(), extB = new GeoBuilder(), trimB = new GeoBuilder();
  const isWall = (c) => c === "#" || c === "F";
  for (let z = 0; z < MAP_H; z++) for (let x = 0; x < MAP_W; x++) {
    const c = tileAt(x, z);
    if (c === "," || c === "X") continue;
    if (!isWall(c)) {
      const room = roomAt(x, z);
      const fb = floorB[room ? room.floor : "carpet"];
      fb.rect([x, 0, z], [0, 0, 1], [1, 0, 0], 1, 1, z, x, 1, 1);
      continue;
    }
    const sides = [
      [1, 0, [x + 1, 0, z + 1], [0, 0, -1]],
      [-1, 0, [x, 0, z], [0, 0, 1]],
      [0, 1, [x, 0, z + 1], [1, 0, 0]],
      [0, -1, [x + 1, 0, z], [-1, 0, 0]],
    ];
    for (const [dx, dz, o, u] of sides) {
      const nb = tileAt(x + dx, z + dz);
      if (isWall(nb)) continue;
      const outside = nb === "," || nb === "X";
      const along = dx ? z : x;
      if (outside) extB.rect(o, u, [0, 1, 0], 1, WALL_H, along, 0, 1, 1);
      else wallB.rect(o, u, [0, 1, 0], 1, WALL_H, along, 0, 1, 1 / WALL_H);
    }
  }
  // window sills / lintels and door lintels
  for (const E of ENTRIES) {
    if (E.kind === "window") {
      trimB.box(E.x, 0, E.y, E.x + 1, 0.9, E.y + 1);
      trimB.box(E.x, 2.05, E.y, E.x + 1, WALL_H, E.y + 1);
    } else {
      trimB.box(E.x, 2.15, E.y, E.x + 1, WALL_H, E.y + 1);
    }
  }
  for (const k in floorB) { const m = floorB[k].mesh(M[k]); m.castShadow = false; world.add(m); }
  world.add(wallB.mesh(M.wall));
  world.add(extB.mesh(M.ext));
  world.add(trimB.mesh(M.trim));
  const hw = HOUSE.x1 - HOUSE.x0 + 1, hd = HOUSE.y1 - HOUSE.y0 + 1;
  const ceilB = new GeoBuilder();
  ceilB.rect([HOUSE.x0, WALL_H, HOUSE.y0], [1, 0, 0], [0, 0, 1], hw, hd, 0, 0, 1, 1);
  const ceil = ceilB.mesh(M.ceil); ceil.castShadow = false; world.add(ceil);
  const roofB = new GeoBuilder();
  roofB.box(HOUSE.x0 - 0.15, WALL_H, HOUSE.y0 - 0.15, HOUSE.x1 + 1.15, WALL_H + 0.25, HOUSE.y1 + 1.15);
  world.add(roofB.mesh(M.roof));

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
  W3.menuS = newGame([]);
}

function buildOutside(world, M, T) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), M.grass);
  T.grass.repeat.set(80, 80);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(18, -0.02, 13);
  ground.receiveShadow = true;
  world.add(ground);
  const strip = (mat, z0, z1, y, tex, rep) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(160, z1 - z0), mat);
    if (tex) tex.repeat.set(rep[0], rep[1]);
    m.rotation.x = -Math.PI / 2;
    m.position.set(18, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    world.add(m);
  };
  strip(M.sidewalk, 22, 23.2, 0.006, T.sidewalk, [80, 1]);
  strip(M.asphalt, 23.2, 28, 0.004, T.asphalt, [60, 2]);
  const line = phong({ color: 0x6b5d1e, emissive: 0x151000 });
  for (let x = -40; x < 80; x += 3) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.12), line);
    d.rotation.x = -Math.PI / 2; d.position.set(x, 0.008, 25.6); world.add(d);
  }
  // trees
  for (const [tx, tz, s] of [[1.5, 6, 1.1], [2, 14, 1], [33.5, 9, 1.05], [34, 17, 0.9], [12, 1.5, 1], [21, 1.2, 1.15], [29, 1.6, 0.85], [1.4, 20.2, 0.85], [-6, 4, 1.4], [42, 10, 1.3], [-5, 18, 1.2], [40, 2, 1.1]]) {
    addCyl(world, 0.12 * s, 0.18 * s, 2.4 * s, tx, 0, tz, M.bark, 7);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.IcosahedronGeometry((1.3 - i * 0.25) * s, 0), M.leaves);
      f.position.set(tx + (i - 1) * 0.3 * s, (2.4 + i * 0.75) * s, tz + ((i * 37) % 5 - 2) * 0.1 * s);
      f.rotation.set(i, i * 2, 0);
      f.castShadow = f.receiveShadow = true;
      world.add(f);
    }
  }
  // parked car
  const car = new THREE.Group();
  const paint = phong({ color: 0x3a1414, shininess: 80, emissive: 0x050205 });
  addBox(car, 3.4, 0.7, 1.6, 0, 0.3, 0, paint);
  addBox(car, 1.9, 0.6, 1.45, -0.2, 1.0, 0, phong({ color: 0x0c1218, shininess: 120, specular: 0x445566 }));
  for (const [wx, wz] of [[-1.1, 0.8], [1.1, 0.8], [-1.1, -0.8], [1.1, -0.8]]) {
    const w = addCyl(car, 0.33, 0.33, 0.25, wx, 0.33 - 0.125, wz, M.black, 10);
    w.rotation.x = Math.PI / 2;
  }
  car.position.set(12.6, 0, 24.3);
  world.add(car);
  // houses across the street and around (dark, a few lit windows)
  const houseMat = phong({ color: 0x14151a, emissive: 0x030407 });
  const litWin = new THREE.MeshBasicMaterial({ color: 0x9a7a40 });
  const darkWin = new THREE.MeshBasicMaterial({ color: 0x0b0d14 });
  const houses = [[-14, 13, 10, 7, 24], [50, 13, 10, 8, 24], [18, -14, 40, 9, 10], [8, 36, 18, 7, 8], [32, 36, 16, 8, 8]];
  houses.forEach(([hx, hz, w, h, d], hi) => {
    addBox(world, w, h, d, hx, 0, hz, houseMat);
    for (let i = 0; i < 6; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), (i + hi) % 5 === 0 ? litWin : darkWin);
      const fy = 1.5 + (i % 2) * 3;
      if (hz > 25) { win.position.set(hx - w / 2 + 2 + (i >> 1) * (w - 4) / 3, fy, hz - d / 2 - 0.02); win.rotation.y = Math.PI; }
      else if (hz < 0) win.position.set(hx - w / 2 + 3 + (i >> 1) * (w - 6) / 3, fy, hz + d / 2 + 0.02);
      else if (hx < 0) { win.position.set(hx + w / 2 + 0.02, fy, hz - d / 2 + 3 + (i >> 1) * (d - 6) / 3); win.rotation.y = Math.PI / 2; }
      else { win.position.set(hx - w / 2 - 0.02, fy, hz - d / 2 + 3 + (i >> 1) * (d - 6) / 3); win.rotation.y = -Math.PI / 2; }
      world.add(win);
    }
  });
  // moon and stars ignore fog
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xd8dce8, fog: false }));
  moon.position.set(-40, 45, -60);
  world.add(moon);
  const sp = [];
  for (let i = 0; i < 500; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * 1.3;
    sp.push(18 + Math.cos(th) * Math.sin(ph) * 90, Math.cos(ph) * 90 + 5, 13 + Math.sin(th) * Math.sin(ph) * 90);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  world.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xaab4cc, size: 0.35, fog: false })));
  // outside breaker box
  addBox(world, 0.12, 0.6, 0.45, BREAKER.x + 0.06, 1.1, BREAKER.y + 0.5, M.steel);
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
  for (const b of components("C")) addBox(world, 0.94, 2.25, 0.94, b.x0 + 0.5, 0, b.y0 + 0.5, M.closet);
  for (const b of components("t")) {
    addBox(world, 1.9, 0.55, 0.85, (b.x0 + b.x1 + 1) / 2, 0, b.y0 + 0.47, M.white);
    addBox(world, 1.7, 0.02, 0.65, (b.x0 + b.x1 + 1) / 2, 0.5, b.y0 + 0.47, phong({ color: 0x5f7380, shininess: 90 }));
  }
  for (const b of components("k")) {
    if (b.y0 === 15) {
      const w = b.x1 - b.x0 + 1, cx = (b.x0 + b.x1 + 1) / 2;
      addBox(world, w, 0.86, 0.85, cx, 0, b.y0 + 0.44, M.cabinet);
      addBox(world, w, 0.05, 0.9, cx, 0.86, b.y0 + 0.45, M.counter);
      addBox(world, w, 0.7, 0.36, cx, 1.5, b.y0 + 0.19, M.cabinet);
      addBox(world, 1.8, 0.02, 0.7, 8, 0.91, b.y0 + 0.45, M.black);
      for (const [bx, bz] of [[7.5, 0.3], [8.5, 0.3], [7.5, 0.65], [8.5, 0.65]]) addCyl(world, 0.13, 0.13, 0.02, bx, 0.93, b.y0 + bz, phong({ color: 0x333333 }));
      addBox(world, 0.75, 0.04, 0.55, 5.6, 0.89, b.y0 + 0.45, M.steel);
      addCyl(world, 0.02, 0.02, 0.3, 5.6, 0.91, b.y0 + 0.15, M.steel);
    } else {
      addCyl(world, 0.08, 0.1, 0.75, b.x0 + 0.6, 0, b.y0 + 0.5, M.white);
      addBox(world, 0.55, 0.15, 0.45, b.x0 + 0.6, 0.75, b.y0 + 0.5, M.white);
      addBox(world, 0.5, 0.7, 0.03, b.x0 + 0.97, 1.2, b.y0 + 0.5, phong({ color: 0x8aa0aa, shininess: 120 }), Math.PI / 2);
    }
  }
  for (const b of components("r")) {
    addBox(world, 0.88, 1.9, 0.8, b.x0 + 0.5, 0, b.y0 + 0.42, M.white);
    addBox(world, 0.04, 0.4, 0.04, b.x0 + 0.85, 1.0, b.y0 + 0.84, M.steel);
  }
  for (const b of components("A")) {
    addBox(world, 0.9, 0.85, 0.6, b.x0 + 0.5, 0, b.y0 + 0.32, M.midwood);
    for (const y of [0.3, 0.6]) addBox(world, 0.3, 0.03, 0.02, b.x0 + 0.5, y, b.y0 + 0.63, M.brass);
    W3.battery = addBox(world, 0.12, 0.06, 0.06, b.x0 + 0.5, 0.86, b.y0 + 0.3, new THREE.MeshBasicMaterial({ color: 0xffd600 }));
  }
  for (const b of components("T")) {
    const cx = (b.x0 + b.x1 + 1) / 2, cz = (b.y0 + b.y1 + 1) / 2;
    addBox(world, 1.6, 0.05, 1.3, cx, 0.72, cz, M.midwood);
    for (const [lx, lz] of [[-0.7, -0.55], [0.7, -0.55], [-0.7, 0.55], [0.7, 0.55]]) addBox(world, 0.06, 0.72, 0.06, cx + lx, 0, cz + lz, M.darkwood);
    for (const [px, pz, r] of [[0, -0.95, 0], [0, 0.95, Math.PI], [-1.05, 0, Math.PI / 2], [1.05, 0, -Math.PI / 2]]) {
      const ch = new THREE.Group();
      addBox(ch, 0.44, 0.06, 0.44, 0, 0.42, 0, M.darkwood);
      addBox(ch, 0.44, 0.5, 0.05, 0, 0.48, -0.2, M.darkwood);
      for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) addBox(ch, 0.04, 0.42, 0.04, lx, 0, lz, M.darkwood);
      ch.position.set(cx + px, 0, cz + pz);
      ch.rotation.y = r;
      world.add(ch);
    }
  }
  for (const b of components("s")) {
    const w = b.x1 - b.x0 + 1, cx = (b.x0 + b.x1 + 1) / 2, z = b.y0;
    addBox(world, w - 0.1, 0.42, 0.9, cx, 0, z + 0.5, M.sofaDark);
    addBox(world, w - 0.1, 0.55, 0.22, cx, 0.3, z + 0.86, M.sofaDark);
    for (let i = 0; i < 3; i++) addBox(world, (w - 0.6) / 3 - 0.04, 0.14, 0.62, b.x0 + 0.3 + (i + 0.5) * (w - 0.6) / 3, 0.42, z + 0.42, M.sofa);
    addBox(world, 0.22, 0.62, 0.9, b.x0 + 0.16, 0, z + 0.5, M.sofaDark);
    addBox(world, 0.22, 0.62, 0.9, b.x1 + 0.84, 0, z + 0.5, M.sofaDark);
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
  for (const b of components("h")) {
    addCyl(world, 0.32, 0.28, 0.72, b.x0 + 0.5, 0, b.y0 + 0.5, M.darkwood, 16);
    const ph = new THREE.Group();
    addBox(ph, 0.24, 0.08, 0.18, 0, 0, 0, M.red);
    addBox(ph, 0.26, 0.05, 0.06, 0, 0.09, 0, M.red);
    ph.position.set(b.x0 + 0.5, 0.72, b.y0 + 0.5);
    world.add(ph);
    W3.phone = ph;
  }
  // fuse box on the hallway side of its wall
  for (const b of components("F")) {
    addBox(world, 0.5, 0.7, 0.1, b.x0 + 0.5, 1.2, b.y0 + 1.05, M.steel);
    W3.fuseLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
    W3.fuseLed.position.set(b.x0 + 0.68, 1.8, b.y0 + 1.11);
    world.add(W3.fuseLed);
  }
  // bathroom toilet, rugs
  addBox(world, 0.4, 0.42, 0.55, 17.5, 0, 5.45, M.white);
  addBox(world, 0.45, 0.4, 0.2, 17.5, 0.42, 5.12, M.white);
  const rug = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.rug); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.006, z); m.receiveShadow = true; world.add(m); };
  rug(6.4, 3.0, 22.5, 18);
  rug(3.6, 2.2, 8, 8.8);
  // plank piles: 9 layers, shown according to how many planks are left
  W3.piles = PILES.map((P) => {
    const g = new THREE.Group();
    const layers = [];
    for (let l = 0; l < 9; l++) {
      const layer = new THREE.Group();
      for (let k = 0; k < 2; k++) {
        const bd = addBox(layer, 0.9, 0.05, 0.14, 0, 0, (k - 0.5) * 0.3 + (l % 2) * 0.05, M.board);
        bd.rotation.y = (l % 2) * 0.08;
      }
      layer.position.y = l * 0.055;
      g.add(layer);
      layers.push(layer);
    }
    g.position.set(P.x + 0.5, 0.02, P.y + 0.5);
    world.add(g);
    return layers;
  });
}

function buildEntries(world, M) {
  const boardGeo = new THREE.BoxGeometry(1.3, 0.17, 0.045);
  W3.entries = ENTRIES.map((E) => {
    const horiz = E.dy !== 0;   // wall runs along x
    const g = new THREE.Group();
    g.position.set(E.x + 0.5, 0, E.y + 0.5);
    if (!horiz) g.rotation.y = Math.PI / 2;
    world.add(g);
    // local frame: opening spans local x, local z points outside or inside
    const inSign = horiz ? -E.dy : -E.dx;  // +1 when local +z points into the apartment
    const o = { g, glass: null, shards: [], door: null, boards: [], E };
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
      const hinge = new THREE.Group();
      hinge.position.set(-0.47, 0, 0);
      const slab = addBox(hinge, 0.94, 2.12, 0.07, 0.47, 0, 0, M.door);
      addBox(hinge, 0.06, 0.06, 0.16, 0.82, 1.0, 0, M.brass);
      g.add(hinge);
      o.door = hinge; o.slab = slab;
      // swing the door into the apartment when it's smashed open
      o.openRot = 1.75 * (inSign > 0 ? -1 : 1);
    }
    const heights = E.kind === "window" ? [1.15, 1.78, 1.47] : [0.6, 1.15, 1.72];
    const tilts = E.kind === "window" ? [0.28, -0.3, 0.05] : [0.14, -0.12, 0.04];
    for (let k = 0; k < MAX_BOARDS; k++) {
      const mat = M.board.clone();
      const b = new THREE.Mesh(boardGeo, mat);
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
}

function buildLights(scene, world, M) {
  W3.hemi = new THREE.HemisphereLight(0x2a3858, 0x0a0806, 0.22);
  scene.add(W3.hemi);
  const moon = new THREE.DirectionalLight(0x8899cc, 0.1);
  moon.position.set(-20, 40, -30);
  scene.add(moon);
  W3.rooms = [];
  const lampOn = new THREE.MeshBasicMaterial({ color: 0xfff0d0 });
  W3.lampMat = lampOn;
  for (const [x, z] of [[8.5, 7.5], [16.5, 7.5], [25, 7.5], [10, 12.9], [24, 12.9], [9.5, 17.5], [23, 17.5]]) {
    const l = new THREE.PointLight(0xffd8a8, 1.0, 9, 1.6);
    l.position.set(x, WALL_H - 0.3, z);
    scene.add(l);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), lampOn);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, WALL_H - 0.01, z);
    world.add(disc);
    W3.rooms.push(l);
  }
  W3.street = [];
  for (const x of [8, 28]) {
    addCyl(world, 0.07, 0.09, 4.2, x, 0, 25.9, phong({ color: 0x333336 }), 8);
    addBox(world, 0.1, 0.1, 0.9, x, 4.1, 25.5, phong({ color: 0x333336 }));
    const head = addBox(world, 0.35, 0.12, 0.25, x, 4.0, 25.1, new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    head.castShadow = false;
    const l = new THREE.PointLight(0xffa860, 1.3, 6.5, 1.5);
    l.position.set(x, 3.8, 25.1);
    scene.add(l);
    W3.street.push(l);
  }
  W3.tvLight = new THREE.PointLight(0x8ab4ff, 0, 7, 1.8);
  W3.tvLight.position.set(W3.tvPos ? W3.tvPos.x : 28, 1.1, W3.tvPos ? W3.tvPos.z : 16);
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
  const torch = addCyl(g, 0.03, 0.03, 0.22, 0.16, 1.1, 0.18, phong({ color: 0x222222 }), 6);
  torch.rotation.x = Math.PI / 2;
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  W3.scene.add(g);
  return { group: g, phase: 0, last: new THREE.Vector3() };
}

function faceYaw(a) { return Math.PI / 2 - a; } // model +z faces game angle a

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
function updateWorld(S, t, opts) {
  const flick = S.flick > 0 && Math.sin(t * 40) * Math.sin(t * 17) > 0;
  const lit = S.power && !flick;
  for (const l of W3.rooms) l.intensity = lit ? 1.0 : 0;
  W3.lampMat.color.setHex(lit ? 0xd8c8a8 : 0x1a1a1a);
  W3.fuseLed.material.color.setHex(S.power ? 0x00ff66 : (Math.floor(t * 3) % 2 ? 0xff1744 : 0x220000));
  if (W3.battery) W3.battery.visible = S.batteries > 0;
  // TV static
  if (S.tv) {
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
  // phone rattles when it rings
  W3.phone.position.x = 16.5 + (S.phone > 0 ? (Math.random() - 0.5) * 0.02 : 0);
  W3.phone.rotation.y = S.phone > 0 ? (Math.random() - 0.5) * 0.15 : 0;
  // plank piles
  W3.piles.forEach((layers, i) => { const n = Math.ceil(S.piles[i] / 3); layers.forEach((l, k) => (l.visible = k < n)); });
  // doors, windows, boards
  W3.entries.forEach((o, i) => {
    const e = S.entries[i];
    const j = e.hit > 0 ? e.hit * 0.025 : 0;
    o.g.position.x = o.base.x + (Math.random() - 0.5) * j;
    o.g.position.z = o.base.z + (Math.random() - 0.5) * j;
    if (o.glass) { o.glass.visible = !e.broken; o.shards.forEach((s) => (s.visible = e.broken)); }
    if (o.door) { o.door.rotation.y = e.broken ? o.openRot : 0; o.door.rotation.z = e.broken ? 0.05 : 0; }
    o.boards.forEach((b, k) => {
      b.visible = k < e.boards;
      b.material.color.setHex(k === e.boards - 1 && e.bhp < 55 ? 0x8a7a6a : 0xffffff);
    });
  });
}

function updateCharacters(S, me, G, t) {
  const sr = G.stR;
  const st = W3.stalker;
  poseStalker(st, sr.x, sr.y, sr.a, t, { stun: S.stalker.stun, bang: G.stBang || 0 });
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
    m.group.position.set(r.x, p.down ? 0.18 : Math.abs(Math.sin(m.phase)) * 0.04, r.y);
    m.group.rotation.set(p.down ? -Math.PI / 2 : 0, faceYaw(r.a), 0, "YXZ");
  }
  for (const id in W3.players) if (!seen[id]) { W3.scene.remove(W3.players[id].group); delete W3.players[id]; }
}
const opts3d = { menu: false };

function updateFlashlights(S, me, G, t) {
  const cam = W3.camera;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const f0 = W3.flash[0];
  f0.position.copy(cam.position).addScaledVector(right, 0.22).add(new THREE.Vector3(0, -0.28, 0)).addScaledVector(fwd, 0.15);
  f0.target.position.copy(cam.position).addScaledVector(fwd, 6);
  let on = !opts3d.menu && flashOn(me);
  f0.intensity = on ? (me.bat < 15 && Math.random() < 0.25 ? 0.4 : 2.3) : 0;
  // nearest friends' flashlights
  const others = Object.values(S.players)
    .filter((p) => p.id !== G.myId && flashOn(p))
    .map((p) => { const r = G.rpos[p.id] || p; return { p, r, d: Math.hypot(r.x - me.x, r.y - me.y) }; })
    .sort((a, b) => a.d - b.d);
  for (let i = 1; i < W3.flash.length; i++) {
    const s = W3.flash[i], beam = W3.beams[i - 1], o = others[i - 1];
    if (!o || opts3d.menu) { s.intensity = 0; beam.visible = false; continue; }
    const a = o.r.a, pt = o.p.pt || 0;
    const dir = new THREE.Vector3(Math.cos(a) * Math.cos(pt), Math.sin(pt), Math.sin(a) * Math.cos(pt));
    s.position.set(o.r.x + Math.cos(a) * 0.2, 1.3, o.r.y + Math.sin(a) * 0.2);
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
  W3.hemi.intensity = 0.22;
  updateWorld(S, t);
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
  updateWorld(S, t);
  const a = t * 0.05;
  const cam = W3.camera;
  cam.position.set(18 + Math.cos(a) * 21, 2.4, 13 + Math.sin(a) * 15);
  cam.rotation.set(0, 0, 0);
  cam.lookAt(18, 1.3, 13);
  cam.updateMatrixWorld();
  const sa = -t * 0.09;
  const sx = 18 + Math.cos(sa) * 16.5, sz = 13 + Math.sin(sa) * 11.5;
  poseStalker(W3.stalker, sx, sz, Math.atan2(-Math.cos(sa) * 11.5, Math.sin(sa) * 16.5), t, {});
  W3.phantom.group.visible = false;
  for (const id in W3.players) { W3.scene.remove(W3.players[id].group); delete W3.players[id]; }
  for (const s of W3.flash) s.intensity = 0;
  for (const b of W3.beams) b.visible = false;
  W3.scareLight.intensity = 0;
  W3.renderer.render(W3.scene, W3.camera);
  trackFps(dt);
  const g = R.h;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, R.W, R.H);
  const vg = g.createRadialGradient(R.W / 2, R.H / 2, R.H * 0.15, R.W / 2, R.H / 2, R.H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0.25)"); vg.addColorStop(1, "rgba(0,0,0,0.9)");
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
