// ---------------------------------------------------------------------------
// Rules + the host-side simulation. The host's browser runs the real game
// (chores, doors, lights, the monster) and sends snapshots to everyone.
//
// One night, 9:00 PM to 6:00 AM. Do the chores on the clipboard, and a sticky
// note with the safe's code appears on it. The safe in the laundry room holds
// the front door key. Get out the front door to win. Something lives in the
// bathroom wall, and it comes out to hunt. At curfew, be in bed with your eyes
// shut (look up at the ceiling).
// ---------------------------------------------------------------------------
const PR = 0.3;                    // player radius (m)
const WALK = 2.6, SPRINT = 4.3;    // player speeds (m/s) before any hits
const RAY_EYE = 1.62;              // eye height for aiming at things
const REACH = 2.0;                 // how far away you can use things
const FL_RANGE = 9, FL_HALF = 0.42;
const MAX_STRIKES = 3;
const STRIKE_SLOW = 0.9;           // each hit leaves you a little slower, for good
const CHASE_RATIO = 0.8;           // he runs slower than you can sprint (but faster than you walk)...
const RAGE_RATIO = 1.1;            // ...unless you keep looping him around the furniture
const RESET_RATIO = 1.2;           // ...or he already had you once tonight
const RR_WAIT = 10;                // seconds he waits for you to pull the trigger
const BED_MAX = 30;                // seconds you can stay in bed (outside a curfew)
const BED_COOLDOWN = 45;           // then this long before you can get back in
const NIGHT_MINS = 540;            // 9:00 PM to 6:00 AM
const NIGHT_LEN = 1500;            // real seconds the night lasts
const CURFEWS = [75, 165, 255, 345, 435, 510]; // minutes after 9:00 PM
const COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#f06292", "#ba68c8", "#fff176"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------ the chores ---------------------------------
const TASK_LABELS = {
  eat: "Heat up a frozen dinner and eat it at the table",
  dishes: "Wash your plate in the kitchen sink",
  trash: "Take the trash out to the can in the backyard",
  laundry: "Get the clothes from the dryer and put them in your closet",
  bulb: "Replace the dead bathroom bulb (spares: laundry room shelf)",
  teeth: "Brush your teeth",
  backdoor: "Lock the back door",
};
const CHORES = ["eat", "dishes", "trash", "laundry", "bulb", "teeth", "backdoor"];
const ITEM_HOME = {
  food: "the freezer", hot: "the microwave", plate: "the table", trash: "the kitchen can", bulb: "the shelf",
  laundry: "the dryer", clipboard: "the counter", key: "the safe", batteries: "where you found them",
};

// ------------------------------ geometry -----------------------------------
function doorOpen(S, tx, ty) {
  const c = tileAt(tx, ty), k = tx + "," + ty;
  if (c === "d") return S.idoors[IDOOR_AT[k]].open;
  if (c === "D") { const e = S.entries[ENTRY_AT[k]]; return e.open || e.broken; }
  return false;
}
function playerPass(S, tx, ty) {
  const c = tileAt(tx, ty);
  if (c === "." || c === "a" || c === "y") return true;
  if (c === "d" || c === "D") return doorOpen(S, tx, ty);
  return false;
}
function playerSolidFn(S) { return (tx, ty) => !playerPass(S, tx, ty); }

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

// Does this tile block sight? Walls, tall furniture and closed doors do.
function opaqueAt(S, tx, ty) {
  const c = tileAt(tx, ty);
  if (c === "d" || c === "D") return !doorOpen(S, tx, ty);
  return c === "#" || c === "F" || c === "C" || c === "L" || c === "r";
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

// your flashlight is in your left hand; it goes away while your phone is out
function flashOn(p) { return p.fl && !p.ph && p.bat > 0 && !p.down && !p.hidden && !p.cut && !p.escaped; }
function active(p) { return !p.down && !p.escaped && !p.cut; }

function flashHits(S, p, x, y) {
  if (!flashOn(p)) return false;
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d > FL_RANGE) return false;
  const slack = 0.35 / Math.max(d, 0.5);
  if (Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > FL_HALF + slack) return false;
  if (Math.abs((p.pt || 0) - Math.atan2(0.4, d)) > FL_HALF + slack + 0.15) return false;
  return los(S, p.x, p.y, x, y);
}

function bfs(sx, sy, gx, gy, pass) {
  if (sx === gx && sy === gy) return [];
  const N = MAP_W * MAP_H, prev = new Int32Array(N).fill(-1);
  const start = sy * MAP_W + sx, goal = gy * MAP_W + gx;
  if (start < 0 || start >= N || goal < 0 || goal >= N) return null;
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

// minutes after 9:00 PM -> "11:42 PM"
function clockText(mins) {
  const total = (21 * 60 + Math.floor(mins)) % (24 * 60);
  const h24 = Math.floor(total / 60), m = total % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return h + ":" + String(m).padStart(2, "0") + (h24 >= 12 ? " PM" : " AM");
}

function roomLit(S, x, y) {
  const r = roomAt(Math.floor(x), Math.floor(y));
  if (!r) return false;
  const st = S.rooms[r.id];
  return S.power && st.on && st.bulb;
}
function inYard(x, y) { return tileAt(Math.floor(x), Math.floor(y)) === "y"; }
function inHouse(x, y) { return insideApt(Math.floor(x), Math.floor(y)); }
function nightProgress(S) { return clamp(S.mins / NIGHT_MINS, 0, 1); }

// ------------------------------ chores --------------------------------------
function task(S, id) { return S.tasks.find((t) => t.id === id); }
function hasTask(S, id) { const t = task(S, id); return !!t && !t.done; }
function taskDone(S, id) { const t = task(S, id); return !!t && t.done; }
function choresDone(S) { return S.tasks.every((t) => t.done); }
function completeTask(S, id) {
  const t = task(S, id);
  if (!t || t.done) return;
  t.done = true;
  if (t.once) return; // re-done after being undone (e.g. re-locking a door)
  t.once = true;
  S.dir.doneAt[id] = S.dir.t;
  emit({ k: "task", text: t.label });
}

// --------------------------- aiming at things -------------------------------
// You have to look right at something to use it: a ray goes out from your eyes.
const OBJ_H = {
  b: [0, 0.75], n: [0, 0.95], C: [0, 2.25], e: [0, 1.0], u: [0, 0.62], z: [0, 1.5], o: [0, 0.8], w: [0, 1.08],
  L: [0, 2.0], v: [0, 1.5], H: [0, 0.62], c: [0, 0.5], s: [0, 0.95], h: [0, 0.95], g: [0, 0.72], A: [0, 1.0],
  S: [0, 1.0], O: [0, 1.0], M: [0, 1.25], r: [0, 1.9], T: [0, 0.8], K: [0, 0.9], Z: [0, 1.1], d: [0, 2.15], D: [0, 2.15],
};
function eyeOf(p) {
  if (p.hidden === "bed") return { x: p.hideX, y: p.hideY, h: 0.75 };
  return { x: p.x, y: p.y, h: RAY_EYE };
}
// small things you can aim at that aren't a whole tile
function pointTargets(S, p) {
  const pts = [];
  SWITCHES.forEach((sw, i) => pts.push({ type: "sw", i, x: sw.x, y: sw.y, h: 1.2, r: 0.17 }));
  if (p.carry === "bulb") for (const r of ROOMS) if (!S.rooms[r.id].bulb) for (const [lx, ly] of r.lights) pts.push({ type: "bulb", room: r.id, x: lx, y: ly, h: 2.5, r: 0.4 });
  pts.push({ type: "hole", x: SPOTS.hole.x, y: SPOTS.hole.y, h: 1.05, r: 0.3 });
  S.batts.forEach((b, i) => { if (b.here) pts.push({ type: "batt", i, x: b.x, y: b.y, h: b.h + 0.04, r: 0.16 }); });
  if (S.clip === "counter") pts.push({ type: "clip", x: SPOTS.clipboard.x, y: SPOTS.clipboard.y, h: SPOTS.clipboard.h, r: 0.2 });
  return pts;
}
function rayHit(S, p) {
  const e = eyeOf(p), pt = p.pt || 0;
  const dx = Math.cos(p.a) * Math.cos(pt), dy = Math.sin(p.a) * Math.cos(pt), dz = Math.sin(pt);
  const pts = pointTargets(S, p);
  let tileHit = null;
  for (let d = 0.12; d <= REACH; d += 0.04) {
    // once the ray reaches a piece of furniture, look a little further for small things lying on it
    if (tileHit && d > tileHit.d + 0.7) break;
    const x = e.x + dx * d, y = e.y + dy * d, h = e.h + dz * d;
    if (h < 0 || h > 2.62) break;
    for (const sp of pts) if ((x - sp.x) ** 2 + (y - sp.y) ** 2 + (h - sp.h) ** 2 < sp.r * sp.r) return { ref: { pt: sp }, d };
    const tx = Math.floor(x), ty = Math.floor(y), c = tileAt(tx, ty);
    if (c === "#" || c === "W" || c === "F") {
      // the fuse box hangs on the laundry room wall
      if (!tileHit && c === "F" && h > 0.85 && h < 1.6) tileHit = { ref: { tx, ty }, d };
      break;
    }
    if (tileHit) continue;
    const rng = OBJ_H[c];
    if (!rng || h < rng[0] || h > rng[1]) continue; // nothing here, or looking over it
    if ((c === "d" || c === "D") && doorOpen(S, tx, ty) && d > 1.3) continue; // looking through an open doorway
    tileHit = { ref: { tx, ty }, d };
  }
  return tileHit;
}

// What does player p have in their sights? Returns {e, q, tx, ty, ref} or null.
function findTarget(S, p) {
  if (!active(p) || p.stun > 0 || p.hidden) return null;
  const hit = rayHit(S, p);
  return hit ? spotFor(S, p, hit.ref) : null;
}
function spotFor(S, p, ref) {
  let spot = null;
  if (ref.pt) {
    spot = pointSpot(S, p, ref.pt);
    if (spot) { spot.tx = ref.pt.x; spot.ty = ref.pt.y; }
  } else {
    spot = tileSpot(S, p, tileAt(ref.tx, ref.ty), ref.tx, ref.ty);
    if (spot) { spot.tx = ref.tx + 0.5; spot.ty = ref.ty + 0.5; }
  }
  if (spot) spot.ref = ref;
  return spot;
}
// is this particular action still within reach? (lets a started action keep going)
function findAction(S, p, act) {
  if (!active(p) || p.hidden) return null;
  const spot = spotFor(S, p, act.ref);
  if (!spot || Math.hypot(spot.tx - p.x, spot.ty - p.y) > REACH + 0.6) return null;
  const a = spot[act.which];
  return a && a.key === act.key && a.can ? { a, spot } : null;
}

const doAct = (key, kind, label, dur, ref) => ({ key, kind, label, dur, ref, can: true });
const noteAct = (key, label) => ({ key, label, can: false });

function pointSpot(S, p, sp) {
  const empty = !p.carry;
  switch (sp.type) {
    case "sw": {
      const sw = SWITCHES[sp.i], r = S.rooms[sw.room], name = ROOM_BY_ID[sw.room].name;
      return { e: doAct("sw" + sp.i, "switch", (r.on ? "Turn off the " : "Turn on the ") + name.toLowerCase() + " light", 0.15, sw.room) };
    }
    case "bulb": return { e: doAct("bulb" + sp.room, "bulbPut", "Screw in the new light bulb", 2, sp.room) };
    case "hole": return { e: doAct("hole", "peek", "Look through the hole in the wall", 0.6) };
    case "batt": return { e: empty ? doAct("bt" + sp.i, "battUp", "Pick up the batteries", 0.3, sp.i) : noteAct("bt" + sp.i, "Batteries — your hands are full") };
    case "clip": return { e: empty ? doAct("clip", "clipUp", "Pick up the clipboard (your chores)", 0.3) : noteAct("clip", "The clipboard — your hands are full") };
  }
  return null;
}

function tileSpot(S, p, c, tx, ty) {
  const k = tx + "," + ty, empty = !p.carry;
  switch (c) {
    case "d": {
      const i = IDOOR_AT[k], dr = S.idoors[i];
      return { e: doAct("id" + i, "idoor", dr.open ? "Close the door" : "Open the door", 0.2, i) };
    }
    case "D": {
      const i = ENTRY_AT[k], e = S.entries[i], E = ENTRIES[i], nm = E.name.toLowerCase();
      if (e.broken) return { e: noteAct("e" + i, "The " + nm + " has been smashed in") };
      if (i === FRONT_DOOR && !S.unlocked) {
        if (p.carry === "key") return { e: doAct("unlock", "unlock", "Unlock the front door with the key", 1.4, i) };
        return { e: noteAct("e" + i, "The front door is locked. The key is in the laundry room safe.") };
      }
      const spot = {};
      if (e.open) spot.e = doAct("e" + i, "edoor", "Close the " + nm, 0.25, i);
      else if (e.locked) spot.e = noteAct("e" + i, "Locked" + (inHouse(p.x, p.y) ? " — press Q to unlock" : ""));
      else spot.e = doAct("e" + i, "edoor", i === FRONT_DOOR ? "Open the front door and get out" : "Open the " + nm, 0.25, i);
      if (i === BACK_DOOR && !e.open && inHouse(p.x, p.y)) spot.q = doAct("l" + i, "lock", e.locked ? "Unlock the back door" : "Lock the back door", 0.5, i);
      return spot;
    }
    case "r":
      return { e: empty ? doAct("fridge", "food", "Take a frozen dinner", 0.6) : noteAct("fridge", "Your hands are full") };
    case "M":
      if (S.micro.st === "cooking") return { e: noteAct("micro", "Heating up... " + Math.ceil(S.micro.t) + "s") };
      if (S.micro.st === "ready") return { e: empty ? doAct("micro", "microOut", "Take out your hot dinner", 0.4) : noteAct("micro", "Your hands are full") };
      if (p.carry === "food") return { e: doAct("micro", "microIn", "Heat it up in the microwave", 0.6) };
      return { e: noteAct("micro", "Microwave") };
    case "T":
      if (p.carry === "hot") return { e: doAct("table", "eat", "Sit down and eat", 5) };
      if (S.plateOnTable && empty) return { e: doAct("table", "plate", "Pick up your dirty plate", 0.4) };
      return null;
    case "S":
      if (p.carry === "plate") return { e: doAct("sink", "wash", "Wash your plate", 3.5) };
      return { e: noteAct("sink", "Kitchen sink") };
    case "A":
      if (p.carry === "clipboard") return { e: doAct("clip", "clipDown", "Put the clipboard down", 0.3) };
      if (S.clip === "counter") return { e: empty ? doAct("clip", "clipUp", "Pick up the clipboard (your chores)", 0.3) : noteAct("clip", "The clipboard — your hands are full") };
      return { e: noteAct("counter", "Kitchen counter") };
    case "g":
      if (S.trash === "can") return { e: empty ? doAct("can", "trashUp", "Tie up the trash bag and take it", 0.8) : noteAct("can", "Your hands are full") };
      return null;
    case "Z":
      if (p.carry === "trash") return { e: doAct("bin", "trashBin", "Throw the bag in the trash can", 0.6) };
      return { e: noteAct("bin", "Trash can") };
    case "z":
      if (hasTask(S, "teeth")) return { e: doAct("bsink", "teeth", "Brush your teeth", 3) };
      return { e: noteAct("bsink", "Bathroom sink") };
    case "o":
      return { e: doAct("toilet", "flush", "Flush the toilet", 0.3) };
    case "L": {
      const want = Object.values(S.rooms).some((r) => !r.bulb);
      if (want && S.shelf.bulbs > 0) return { e: empty ? doAct("shelf", "bulbTake", "Take a light bulb", 0.6) : noteAct("shelf", "Your hands are full") };
      return { e: noteAct("shelf", "Supply shelf — detergent and old junk") };
    }
    case "K": {
      if (!S.safe.open) return { e: doAct("safe", "keypad", "Type in the safe's code", 0.2) };
      if (S.safe.key === "safe") return { e: empty ? doAct("safe", "keyUp", "Take the front door key", 0.5) : noteAct("safe", "The key — your hands are full") };
      if (p.carry === "key") return { e: doAct("safe", "keyDown", "Put the key back", 0.4) };
      return { e: noteAct("safe", "The safe is empty") };
    }
    case "w":
      if (S.laundry === "basket") return { e: empty ? doAct("dryer", "laundryUp", "Take the clean clothes out of the dryer", 0.8) : noteAct("dryer", "Your hands are full") };
      return { e: noteAct("dryer", "Washer and dryer") };
    case "H":
      return { e: noteAct("chest", "An old wooden chest. It's locked.") };
    case "C": {
      if (p.carry === "laundry" && tx === SPOTS.closet.x && ty === SPOTS.closet.y) return { e: doAct("h" + k, "laundryPut", "Put the clothes away", 1.2) };
      return { e: doAct("h" + k, "hideCloset", "Hide in the closet", 0.35, k) };
    }
    case "b": case "s": {
      if (p.bedCD > 0 && !curfewOn(S)) return { e: noteAct("bed" + k, "Too soon to get back in bed (" + Math.ceil(p.bedCD) + "s)") };
      const free = freeBedSpot(S, c);
      if (free < 0) return { e: noteAct("bed" + k, "There's no room") };
      return { e: doAct("bed" + k, "hideBed", c === "b" ? "Get into bed, under the blanket" : "Lie down on the couch, under the blanket", 0.5, free) };
    }
    case "v":
      return { e: doAct("tv", "tv", S.tv ? "Turn off the TV" : "Turn on the TV", 0.3) };
    case "h":
      return S.phone > 0 ? { e: doAct("phone", "phone", "Answer the phone", 0.3) } : { e: noteAct("phone", "The landline") };
    case "F":
      return { e: S.power ? noteAct("fuse", "Fuse box — the power is on") : doAct("fuse", "fuse", "Flip the breakers back on", 2.5) };
  }
  return null;
}

function freeBedSpot(S, c) {
  for (let i = 0; i < BED_SPOTS.length; i++) {
    const [tx, ty] = BED_SPOTS[i].tile.split(",").map(Number);
    if (tileAt(tx, ty) !== c) continue;
    if (!Object.values(S.players).some((q) => q.hidden === "bed" && q.bedSpot === i)) return i;
  }
  return -1;
}

// ======================= HOST SIMULATION ===================================
let emit = () => {};
function setEmitter(f) { emit = f; }

function newStalker() {
  return {
    x: -30, y: -30, a: 0, mode: "away", state: "away", timer: 9999, path: [], target: null, lastSeen: null,
    repath: 0, pause: 0, wait: 0, rage: false, loop: null, lostT: 0, look: 0, checked: false, wps: [], win: -1, spd: 0,
  };
}

function newPlayer(L) {
  return {
    id: L.id, name: L.name, color: L.color, model: L.model === "m" ? "m" : "f",
    x: 0, y: 0, a: 0, pt: 0, fl: true, ph: false, sp: false, bat: 100, carry: null, battFrom: -1,
    hidden: false, hideX: 0, hideY: 0, hideT: 0, bedCD: 0, bedSpot: -1, seenHide: false,
    strikes: 0, spd: 1, stun: 0, down: false, escaped: false, cut: false,
    text: null, answer: null, snap: 0, act: null, press: {},
  };
}

function newGame(lobby) {
  const S = {
    phase: "play", night: 1, stage: "night", mins: 0, stageT: 0,
    players: {}, n: Math.max(1, lobby.length), resets: 0,
  };
  lobby.forEach((L) => (S.players[L.id] = newPlayer(L)));
  setupNight(S);
  return S;
}

// everything back to how it was at 9:00 PM (the start, or after he carries you back to bed)
function setupNight(S) {
  S.mins = 0; S.stageT = 0;
  S.power = true; S.flick = 0; S.tv = false; S.phone = 0; S.phoneMsg = null;
  S.entries = ENTRIES.map(() => ({ broken: false, hit: 0, open: false, locked: false }));
  S.entries[FRONT_DOOR].locked = true;
  S.unlocked = false;
  S.idoors = IDOORS.map(() => ({ open: false }));
  S.rooms = {};
  ROOMS.forEach((r) => (S.rooms[r.id] = { on: true, bulb: true }));
  S.rooms.bath.bulb = false;
  S.micro = { st: "off", t: 0 }; S.trash = "can"; S.plateOnTable = false; S.laundry = "basket";
  S.shelf = { bulbs: 2 };
  S.clip = "counter"; S.note = false;
  S.safe = { code: String(Math.floor(1000 + Math.random() * 9000)), open: false, key: "safe" };
  S.batts = BATTERY_SPOTS.map((b) => ({ x: b.x, y: b.y, h: b.h, here: false }));
  for (const i of shuffled(BATTERY_SPOTS.map((b, i) => i)).slice(0, 4)) S.batts[i].here = true;
  S.battT = 150;
  S.tasks = CHORES.map((id) => ({ id, label: TASK_LABELS[id], done: false }));
  S.dir = { t: 0, fired: {}, doneAt: {} };
  S.curfew = { i: 0, state: "none", t: 0 };
  S.cut = null;
  const st = S.stalker = newStalker();
  st.timer = S.resets ? 40 : 130; // seconds until he first climbs out of the wall
  S.nextEvent = 45;
  S.powerCD = rand(420, 600);
  Object.values(S.players).forEach((p, i) => {
    const s = EVENING_SPOTS[i % EVENING_SPOTS.length];
    Object.assign(p, {
      x: s[0], y: s[1], a: -Math.PI / 2, bat: 100, carry: null, battFrom: -1, hidden: false, hideT: 0, bedCD: 0, bedSpot: -1,
      seenHide: false, strikes: 0, spd: 1, stun: 0, cut: false, down: false, text: null, answer: null, act: null,
    });
    p.snap++;
  });
}
function shuffled(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// What clients receive (same shape as S, minus host-only bookkeeping)
function publicState(S) {
  const players = {};
  for (const p of Object.values(S.players)) {
    players[p.id] = {
      id: p.id, name: p.name, color: p.color, model: p.model, x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: +p.a.toFixed(2), pt: +(p.pt || 0).toFixed(2),
      fl: p.fl, ph: p.ph, bat: Math.round(p.bat), carry: p.carry, hidden: p.hidden, hideX: p.hideX, hideY: p.hideY, bedSpot: p.bedSpot,
      hideT: p.hidden ? +p.hideT.toFixed(1) : 0, bedCD: Math.ceil(p.bedCD || 0),
      strikes: p.strikes, spd: +p.spd.toFixed(3), stun: +p.stun.toFixed(2), down: p.down, escaped: p.escaped, cut: p.cut,
      snap: p.snap, act: p.act ? { label: p.act.label, t: p.act.t, dur: p.act.dur, kind: p.act.kind } : null,
    };
  }
  const st = S.stalker;
  return {
    phase: S.phase, night: 1, stage: "night", mins: S.mins, stageT: S.stageT,
    power: S.power, flick: S.flick, tv: S.tv, phone: S.phone,
    entries: S.entries.map((e) => ({ broken: e.broken, hit: e.hit, open: e.open, locked: e.locked })),
    idoors: S.idoors, rooms: S.rooms, micro: { st: S.micro.st, t: S.micro.t }, trash: S.trash, plateOnTable: S.plateOnTable,
    laundry: S.laundry, shelf: S.shelf, clip: S.clip, note: S.note, safe: { open: S.safe.open, key: S.safe.key },
    code: S.note ? S.safe.code : null, unlocked: S.unlocked, batts: S.batts.map((b) => ({ x: b.x, y: b.y, h: b.h, here: b.here })), tasks: S.tasks,
    curfew: { state: S.curfew.state, t: +S.curfew.t.toFixed(1) }, resets: S.resets,
    cut: S.cut ? { id: S.cut.id, ph: S.cut.ph, t: +S.cut.t.toFixed(2), step: S.cut.step, st: S.cut.st != null ? +S.cut.st.toFixed(2) : 0, n: S.cut.n || 0 } : null,
    players,
    stalker: { x: +st.x.toFixed(2), y: +st.y.toFixed(2), a: +st.a.toFixed(2), mode: st.mode, state: st.state, rage: st.rage, spd: +st.spd.toFixed(2), stun: false },
  };
}

function simStep(S, inputs, dt) {
  if (S.phase !== "play") return;
  S.stageT += dt;
  S.dir.t += dt;
  S.mins = Math.min(NIGHT_MINS, S.mins + dt * NIGHT_MINS / NIGHT_LEN);
  S.flick = Math.max(0, S.flick - dt);
  if (S.phone > 0) S.phone = Math.max(0, S.phone - dt);
  for (const e of S.entries) e.hit = Math.max(0, e.hit - dt * 2);
  if (S.micro.st === "cooking") {
    S.micro.t -= dt;
    if (S.micro.t <= 0 || !S.power) {
      S.micro.st = "ready";
      if (S.power) emit({ k: "ding", x: SPOTS.micro.x, y: SPOTS.micro.y });
    }
  }
  tidyOwners(S);
  updatePlayers(S, inputs, dt);
  if (S.cut) updateCutscene(S, dt);
  else updateStalker(S, dt);
  updateCurfew(S, dt);
  runDirector(S);
  updateEvents(S, dt);
  updateBatteries(S, dt);
  updateTasks(S);
  checkEnd(S);
}

// someone left the game while holding something: put it back
function tidyOwners(S) {
  const ps = Object.values(S.players);
  if (S.clip !== "counter" && !ps.some((p) => p.carry === "clipboard")) S.clip = "counter";
  if (S.safe.key === "carried" && !ps.some((p) => p.carry === "key")) S.safe.key = "safe";
  if (S.trash === "carried" && !ps.some((p) => p.carry === "trash")) S.trash = "can";
  if (S.laundry === "carried" && !ps.some((p) => p.carry === "laundry")) S.laundry = "basket";
}

function checkEnd(S) {
  const ps = Object.values(S.players);
  if (!ps.length) return;
  const escaped = ps.some((p) => p.escaped);
  const left = ps.filter((p) => !p.down && !p.escaped);
  if (!left.length) { S.phase = escaped ? "win" : "lose"; emit({ k: S.phase }); return; }
  if (S.mins >= NIGHT_MINS && !S.cut) {
    S.phase = escaped ? "win" : "lose";
    if (!escaped) emit({ k: "card", title: "6:00 AM", lines: ["Curfew's over.", "So are you."], t: 6 });
    emit({ k: S.phase });
  }
}

function updateTasks(S) {
  const lockT = task(S, "backdoor");
  if (lockT) {
    const b = S.entries[BACK_DOOR];
    const now = b.locked && !b.open && !b.broken;
    if (now && !lockT.done) completeTask(S, "backdoor");
    else if (!now && lockT.done) lockT.done = false;
  }
  if (!S.note && choresDone(S)) {
    S.note = true;
    emit({ k: "note" });
    emit({ k: "msg", text: "All your chores are done. A sticky note just appeared on the clipboard...", c: "#ffe082", big: true });
  }
}

function updateBatteries(S, dt) {
  S.battT -= dt;
  if (S.battT > 0) return;
  S.battT = 150;
  const free = S.batts.map((b, i) => i).filter((i) => !S.batts[i].here && !Object.values(S.players).some((p) => p.carry === "batteries" && p.battFrom === i));
  if (S.batts.filter((b) => b.here).length < 3 && free.length) S.batts[pick(free)].here = true;
}

function updatePlayers(S, inputs, dt) {
  const solid = playerSolidFn(S);
  for (const p of Object.values(S.players)) {
    const inp = inputs[p.id];
    p.stun = Math.max(0, p.stun - dt);
    if (inp && active(p)) {
      if (!p.hidden && p.stun <= 0 && typeof inp.x === "number") {
        const d = Math.hypot(inp.x - p.x, inp.y - p.y);
        if (d < 2.5 && !collides(inp.x, inp.y, PR - 0.05, solid)) { p.x = inp.x; p.y = inp.y; }
        else if (d > 0.001) p.snap++;
      }
      if (typeof inp.a === "number") p.a = inp.a;
      if (typeof inp.pt === "number") p.pt = clamp(inp.pt, -1.5, 1.5);
      p.fl = !!inp.fl; p.ph = !!inp.ph; p.sp = !!inp.sp;
    }
    p.press = p.press || {};
    const pressed = (k) => {
      if (!inp || typeof inp[k] !== "number") return false;
      const last = p.press[k];
      p.press[k] = inp[k];
      return last !== undefined && inp[k] !== last;
    };
    const pe = pressed("ep"), pq = pressed("qp"), pg = pressed("gp"), pr = pressed("rl"), prep = pressed("rp"), psc = pressed("sc");
    if (pe && S.cut && S.cut.id === p.id && S.cut.ph === "rr" && S.cut.step === "you") S.cut.pull = true;
    if (!active(p)) { p.act = null; continue; }
    if (flashOn(p)) p.bat = Math.max(0, p.bat - dt * 0.45);
    if (p.bedCD > 0) p.bedCD = Math.max(0, p.bedCD - dt);
    // texts from him: answer one, or he comes looking
    if (p.text) {
      p.text.t += dt;
      if (prep && inp && p.text.opts) {
        const i = inp.rc === 1 ? 1 : 0;
        p.answer = { t: 1.6, text: p.text.ans ? p.text.ans[i] : null };
        p.text = null;
      } else if (p.text.t > 14) {
        p.text = null;
        sendText(S, p, { text: "ignoring me? fine. i'll come to you." });
        investigate(S, p.x, p.y);
      }
    }
    if (p.answer) { p.answer.t -= dt; if (p.answer.t <= 0) { const a = p.answer.text; p.answer = null; if (a) sendText(S, p, { text: a }); } }
    if (psc && inp && typeof inp.sv === "string") tryCode(S, p, inp.sv);
    if (pr && p.carry === "batteries") {
      p.bat = 100; p.carry = null; p.battFrom = -1;
      emit({ k: "click", x: p.x, y: p.y });
      emit({ k: "msg", to: p.id, text: "Fresh batteries. Your flashlight is full again.", c: "#ffe082" });
    }
    if (pg && p.carry) dropItem(S, p, true);
    if (inCourtyard(p.x, p.y)) { escape(S, p); continue; }
    if (p.hidden) {
      if (!curfewOn(S)) p.hideT += dt;
      // no camping in bed all night
      if (p.hidden === "bed" && p.hideT >= BED_MAX && !curfewOn(S)) {
        leaveHiding(S, p);
        emit({ k: "msg", to: p.id, text: "You can't stay in bed forever. You get up.", c: "#ffb74d" });
        continue;
      }
    }
    if (pe || pq) {
      if (p.hidden) { leaveHiding(S, p); continue; }
      const which = pe ? "e" : "q";
      const spot = findTarget(S, p);
      const a = spot && spot[which];
      if (a && a.can && !(p.act && p.act.key === a.key)) p.act = { key: a.key, kind: a.kind, label: a.label, t: 0, dur: a.dur, which, ref: spot.ref };
    }
    if (p.act) {
      // keeps going on its own; walking away cancels it
      const f = findAction(S, p, p.act);
      if (!f) { p.act = null; continue; }
      p.act.t += dt;
      if (p.act.t >= p.act.dur) { completeAction(S, p, f.a, f.spot); p.act = null; }
    }
  }
}

function escape(S, p) {
  if (p.escaped) return;
  p.escaped = true; p.hidden = false; p.act = null; p.text = null;
  if (p.carry) dropItem(S, p);
  emit({ k: "escaped", id: p.id, name: p.name });
}

function curfewOn(S) { return S.curfew.state !== "none"; }
function eyesShut(p) { return p.hidden === "bed" && (p.pt || 0) > 0.9; }

function leaveHiding(S, p) {
  if (p.hidden === "bed") {
    p.bedCD = BED_COOLDOWN;
    const bs = BED_SPOTS[p.bedSpot];
    if (bs) { const out = standNear(S, bs.x, bs.y); p.x = out.x; p.y = out.y; p.snap++; }
  }
  emit({ k: "creak", x: p.hideX, y: p.hideY, soft: true });
  p.hidden = false; p.seenHide = false; p.act = null; p.hideT = 0; p.bedSpot = -1;
}
// a free floor spot next to a piece of furniture
function standNear(S, x, y) {
  let best = null, bd = 1e9;
  for (let ty = Math.floor(y) - 2; ty <= Math.floor(y) + 2; ty++) for (let tx = Math.floor(x) - 2; tx <= Math.floor(x) + 2; tx++) {
    const c = tileAt(tx, ty);
    if (c !== "." && c !== "a") continue;
    const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
    if (d < bd) { bd = d; best = { x: tx + 0.5, y: ty + 0.5 }; }
  }
  return best || { x, y };
}

function dropItem(S, p, say) {
  const what = p.carry;
  switch (what) {
    case "food": break; // back in the freezer
    case "hot": S.micro.st = "ready"; break;
    case "plate": S.plateOnTable = true; break;
    case "trash": S.trash = "can"; break;
    case "bulb": S.shelf.bulbs++; break;
    case "laundry": S.laundry = "basket"; break;
    case "clipboard": S.clip = "counter"; break;
    case "key": S.safe.key = "safe"; break;
    case "batteries": if (S.batts[p.battFrom]) S.batts[p.battFrom].here = true; break;
  }
  p.carry = null; p.battFrom = -1;
  if (say && what) emit({ k: "msg", to: p.id, text: "You put it back (" + ITEM_HOME[what] + ").", c: "#b0bec5" });
}

function occupied(S, tx, ty) {
  const st = S.stalker;
  if (st.mode === "in" && Math.floor(st.x) === tx && Math.floor(st.y) === ty) return true;
  return Object.values(S.players).some((q) => active(q) && !q.hidden && Math.abs(q.x - (tx + 0.5)) < 0.5 + PR && Math.abs(q.y - (ty + 0.5)) < 0.5 + PR);
}

function tryCode(S, p, code) {
  if (S.safe.open || Math.hypot(p.x - SPOTS.safe.x, p.y - SPOTS.safe.y) > REACH + 1) return;
  if (code === S.safe.code) {
    S.safe.open = true;
    emit({ k: "safe", x: SPOTS.safe.x, y: SPOTS.safe.y });
    emit({ k: "msg", text: p.name + " opened the safe. The front door key is inside!", c: "#ffe082", big: true });
  } else emit({ k: "safeNo", to: p.id, x: SPOTS.safe.x, y: SPOTS.safe.y });
}

function completeAction(S, p, a, spot) {
  const at = { x: spot.tx, y: spot.ty };
  switch (a.kind) {
    case "idoor": {
      const dr = S.idoors[a.ref], D = IDOORS[a.ref];
      if (dr.open && occupied(S, D.x, D.y)) { emit({ k: "msg", to: p.id, text: "Something's in the way.", c: "#b0bec5" }); return; }
      dr.open = !dr.open;
      emit({ k: "creak", x: at.x, y: at.y });
      break;
    }
    case "edoor": {
      const e = S.entries[a.ref];
      if (e.open && occupied(S, ENTRIES[a.ref].x, ENTRIES[a.ref].y)) { emit({ k: "msg", to: p.id, text: "Something's in the way.", c: "#b0bec5" }); return; }
      e.open = !e.open;
      emit({ k: "creak", x: at.x, y: at.y, heavy: true });
      if (a.ref === FRONT_DOOR && e.open) emit({ k: "msg", text: "The front door is open! GET OUT!", c: "#a5d6a7", big: true });
      break;
    }
    case "lock": {
      const e = S.entries[a.ref];
      e.locked = !e.locked;
      emit({ k: "lock", x: at.x, y: at.y });
      break;
    }
    case "unlock":
      if (p.carry !== "key") return;
      p.carry = null; S.unlocked = true; S.safe.key = "door";
      S.entries[FRONT_DOOR].locked = false;
      emit({ k: "lock", x: at.x, y: at.y });
      emit({ k: "msg", text: p.name + " unlocked the front door!", c: "#a5d6a7", big: true });
      break;
    case "food": p.carry = "food"; emit({ k: "fridge", x: at.x, y: at.y }); break;
    case "microIn": p.carry = null; S.micro = { st: "cooking", t: 8 }; emit({ k: "micro", x: at.x, y: at.y }); break;
    case "microOut": p.carry = "hot"; S.micro.st = "off"; emit({ k: "grab", x: at.x, y: at.y }); break;
    case "eat": p.carry = "plate"; completeTask(S, "eat"); emit({ k: "munch", x: at.x, y: at.y }); break;
    case "plate": p.carry = "plate"; S.plateOnTable = false; emit({ k: "grab", x: at.x, y: at.y }); break;
    case "wash": p.carry = null; completeTask(S, "dishes"); emit({ k: "water", x: at.x, y: at.y }); break;
    case "trashUp": p.carry = "trash"; S.trash = "carried"; emit({ k: "rustle", x: at.x, y: at.y }); break;
    case "trashBin": p.carry = null; S.trash = "bin"; completeTask(S, "trash"); emit({ k: "bin", x: at.x, y: at.y }); break;
    case "teeth": completeTask(S, "teeth"); emit({ k: "brush", x: at.x, y: at.y }); break;
    case "flush": emit({ k: "flush", x: at.x, y: at.y }); break;
    case "peek": {
      const late = nightProgress(S) > 0.45;
      const home = S.stalker.state === "away";
      const text = home && late ? "You put your eye to the hole. Something on the other side blinks."
        : home ? "It's pitch black in there. It smells like wet dirt. Something shifts and goes still."
        : "The hole goes back much further than the wall should. It's empty... for now.";
      emit({ k: "msg", to: p.id, text, c: "#ce93d8" });
      if (home && late) emit({ k: "stinger", to: p.id });
      break;
    }
    case "clipUp": if (p.carry || S.clip !== "counter") return; p.carry = "clipboard"; S.clip = p.id; emit({ k: "rustle", x: at.x, y: at.y }); break;
    case "clipDown": if (p.carry !== "clipboard") return; p.carry = null; S.clip = "counter"; emit({ k: "rustle", x: at.x, y: at.y }); break;
    case "battUp": {
      const b = S.batts[a.ref];
      if (!b || !b.here || p.carry) return;
      b.here = false; p.carry = "batteries"; p.battFrom = a.ref;
      emit({ k: "grab", x: at.x, y: at.y });
      break;
    }
    case "bulbTake": if (S.shelf.bulbs > 0) { S.shelf.bulbs--; p.carry = "bulb"; emit({ k: "grab", x: at.x, y: at.y }); } break;
    case "bulbPut":
      if (p.carry !== "bulb") return;
      p.carry = null; S.rooms[a.ref].bulb = true; S.rooms[a.ref].on = true;
      if (a.ref === "bath") completeTask(S, "bulb");
      emit({ k: "screw", x: at.x, y: at.y });
      break;
    case "keypad": emit({ k: "keypad", to: p.id }); break;
    case "keyUp": if (S.safe.key !== "safe" || p.carry) return; p.carry = "key"; S.safe.key = "carried"; emit({ k: "grab", x: at.x, y: at.y }); break;
    case "keyDown": if (p.carry !== "key") return; p.carry = null; S.safe.key = "safe"; break;
    case "laundryUp": p.carry = "laundry"; S.laundry = "carried"; emit({ k: "rustle", x: at.x, y: at.y }); break;
    case "laundryPut": p.carry = null; S.laundry = "done"; completeTask(S, "laundry"); emit({ k: "creak", x: at.x, y: at.y, soft: true }); break;
    case "hideCloset":
      p.hidden = "closet"; p.act = null; p.hideT = 0;
      p.hideX = spot.tx; p.hideY = spot.ty;
      p.seenHide = monsterSees(S, p, 8);
      emit({ k: "creak", x: at.x, y: at.y, soft: true });
      break;
    case "hideBed": {
      const bs = BED_SPOTS[a.ref];
      if (!bs || Object.values(S.players).some((q) => q.hidden === "bed" && q.bedSpot === a.ref)) return;
      p.seenHide = monsterSees(S, p, 8);
      p.hidden = "bed"; p.bedSpot = a.ref; p.act = null; p.hideT = 0;
      p.hideX = bs.x; p.hideY = bs.y;
      emit({ k: "rustle", x: bs.x, y: bs.y });
      break;
    }
    case "tv": S.tv = !S.tv; emit({ k: "click", x: at.x, y: at.y }); break;
    case "phone": {
      S.phone = 0;
      emit({ k: "call", to: p.id, text: S.phoneMsg || "...(breathing)... i can hear you doing your little chores." });
      emit({ k: "msg", text: p.name + " picked up the landline...", c: "#b0bec5" });
      S.phoneMsg = null;
      break;
    }
    case "fuse":
      S.power = true; S.powerCD = rand(300, 480);
      emit({ k: "powerup" });
      emit({ k: "msg", text: p.name + " got the power back on.", c: "#ffe082" });
      break;
    case "switch": {
      const r = S.rooms[a.ref];
      r.on = !r.on;
      emit({ k: "switch", x: at.x, y: at.y });
      if (r.on && !r.bulb) emit({ k: "msg", to: p.id, text: "Click. Nothing. The bulb must be dead.", c: "#b0bec5" });
      else if (r.on && !S.power) emit({ k: "msg", to: p.id, text: "Click. Nothing. The power's out.", c: "#b0bec5" });
      break;
    }
  }
}

// ------------------------------ texts --------------------------------------
// He texts you. Your phone comes out by itself (and your flashlight goes away).
const TEXTS = [
  { text: "hey roomie :)", opts: ["who is this?", "wrong number"], ans: ["the one in the walls.", "no. it's definitely you i want."] },
  { text: "you missed a spot", opts: ["stop watching me", "where??"], ans: ["no.", "behind you."] },
  { text: "why'd you turn the lights on? i like the dark", opts: ["go away", "i'm not scared of you"], ans: ["i live here.", "you will be."] },
  { text: "do your chores. or else.", opts: ["or else what?", "ok ok"], ans: ["you'll see.", "good. i'm watching."] },
  { text: "i can hear you breathing", opts: ["leave me alone", "..."], ans: ["never.", "shhh."] },
  { text: "check the closets", opts: ["why?", "no thanks"], ans: ["that's where i'd hide.", "smart. i'm not in there. yet."] },
  { text: "that flashlight won't last all night", opts: ["i have batteries", "neither will you"], ans: ["not enough.", "funny."] },
  { text: "it's almost curfew. you know the rules.", opts: ["what rules?", "bed. eyes shut."], ans: ["in bed. eyes shut. or i come get you.", "good."] },
];
function sendText(S, p, t) {
  if (!active(p)) return;
  if (t.opts) p.text = { opts: t.opts, ans: t.ans, t: 0 };
  emit({ k: "text", to: p.id, text: t.text, opts: t.opts || null });
}

// ------------------------------ the story -----------------------------------
const say = (text, c, big) => () => emit({ k: "msg", text, c: c || "#b0bec5", big });
const anyPlayer = (S, f) => Object.values(S.players).some((p) => active(p) && f(p));
function knockAt(S, i) { const E = ENTRIES[i]; emit({ k: "knock", x: E.x + 0.5, y: E.y + 0.5 }); }
function ring(S, msg) { if (S.phone <= 0) { S.phone = 24; S.phoneMsg = msg; emit({ k: "msg", text: "The landline is ringing in the living room...", c: "#b0bec5" }); } }

const STORY = [
  { at: 0.3, fn: (S) => emit({ k: "card", title: S.resets ? "9:00 PM. AGAIN." : "CURFEW CONTROL", lines: S.resets
    ? ["You wake up in bed. The clock says 9:00 PM.", "Your chores are undone. He's faster now.", "Get out before 6:00 AM."]
    : ["9:00 PM. Apartment 302.", "Your chores are on the clipboard by the kitchen sink. Finish them and you'll find the code to the safe.", "The front door key is in the safe. Get out before 6:00 AM.", "And at curfew: be in bed, eyes shut."], t: 10 }) },
  { at: 11, fn: say("Find the clipboard on the counter next to the kitchen sink. Look right at things and press E.", "#ffe082") },
  { at: 40, fn: (S) => { for (const p of Object.values(S.players)) sendText(S, p, TEXTS[0]); } },
  { at: 80, fn: (S) => { knockAt(S, FRONT_DOOR); say("Someone's knocking on the front door. At this hour?")(); } },
  { at: 105, fn: (S) => { if (!S.tv && S.power) { S.tv = true; emit({ k: "click", x: SPOTS.tv.x, y: SPOTS.tv.y }); } say("The TV turned itself on.")(); } },
  { id: "yard", when: (S) => S.stalker.state === "away" && anyPlayer(S, (p) => inBackyard(p.x, p.y)), fn: (S) => watchFrom(S, SPOTS.watchYard.x, SPOTS.watchYard.y, 10, "...was someone standing past the fence?") },
  { after: "laundry", delay: 15, fn: (S) => ring(S, "...(breathing)... you folded them wrong.") },
];

function runDirector(S) {
  STORY.forEach((b, i) => {
    const id = b.id || "b" + i;
    if (S.dir.fired[id]) return;
    let go = false;
    if (b.at != null) go = S.dir.t >= b.at;
    else if (b.after) go = S.dir.doneAt[b.after] != null && S.dir.t >= S.dir.doneAt[b.after] + (b.delay || 0);
    else if (b.when) go = b.when(S);
    if (!go) return;
    S.dir.fired[id] = true;
    b.fn(S);
  });
}

// --------------------------------- curfew -----------------------------------
// At curfew every light goes out. You have 20 seconds to get in bed and shut
// your eyes (look up). Then he comes to check. Flashlight on = he finds you.
function updateCurfew(S, dt) {
  const c = S.curfew;
  if (c.state === "none") {
    if (c.i < CURFEWS.length && S.mins >= CURFEWS[c.i] && !S.cut) {
      c.state = "warn"; c.t = 20;
      for (const id in S.rooms) S.rooms[id].on = false;
      S.tv = false;
      emit({ k: "curfew" });
      emit({ k: "msg", text: "CURFEW. Get in bed and close your eyes (look up at the ceiling). 20 seconds.", c: "#ff5252", big: true });
      for (const p of Object.values(S.players)) sendText(S, p, { text: "curfew. lights out. in bed. eyes shut." });
    }
    return;
  }
  c.t -= dt;
  if (c.state === "warn" && c.t <= 0) {
    c.state = "check"; c.t = 30;
    startCheck(S);
  } else if (c.state === "check" && c.t <= 0) {
    c.state = "none"; c.i++;
    if (S.stalker.state === "check") goReturn(S);
    emit({ k: "msg", text: "It's quiet again. You can get up.", c: "#a5d6a7" });
  }
}

function startCheck(S) {
  const st = S.stalker;
  if (st.state === "chase" || st.state === "rageOut" || st.state === "rageAway" || S.cut) return;
  // anyone out of bed with a flashlight on: he shows up at the window next to them
  const lit = Object.values(S.players).filter((p) => active(p) && !p.hidden && flashOn(p) && inHouse(p.x, p.y));
  if (lit.length) {
    const p = pick(lit);
    let best = -1, bd = 1e9;
    ENTRIES.forEach((E, i) => {
      if (E.kind !== "window" || S.entries[i].broken) return;
      const d = Math.hypot(E.ix - p.x, E.iy - p.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) {
      const E = ENTRIES[best];
      Object.assign(st, { mode: "out", state: "window", x: E.ox, y: E.oy, timer: 3.5, target: p.id, win: best, path: [], spd: 0 });
      st.a = Math.atan2(E.iy - E.oy, E.ix - E.ox);
      S.entries[best].hit = 1;
      emit({ k: "bang", x: E.x + 0.5, y: E.y + 0.5 });
      emit({ k: "stinger" });
      emit({ k: "msg", to: p.id, text: "Your flashlight was on. He's at the " + E.name.toLowerCase() + "!", c: "#ff1744", big: true });
      return;
    }
  }
  // otherwise he walks the apartment, checking the beds first
  if (st.mode !== "in") emerge(S);
  st.state = "check"; st.path = []; st.wait = st.wait || 0;
  st.wps = [[11.5, 9.6], [11.6, 19.4], [15.5, 12.5], [10.5, 14.5], [19.5, 13.5], [18.5, 19.5]].map(([x, y]) => ({ x, y }));
}

// ------------------------------ the monster ---------------------------------
const passIn = (tx, ty) => { const c = tileAt(tx, ty); return c === "." || c === "a" || c === "d"; };
const stalkerSolidFn = (S) => (tx, ty) => { const c = tileAt(tx, ty); return !(c === "." || c === "a" || (c === "d" && S.idoors[IDOOR_AT[tx + "," + ty]].open)); };
const passOut = (tx, ty) => { const c = tileAt(tx, ty); return c === "," || c === "y" || c === "G"; };

// tables you can run circles around
const LOOP_CENTERS = (() => {
  const out = [], seen = new Set();
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const c = MAP[y][x];
    if ("Tc".indexOf(c) < 0 || seen.has(x + "," + y)) continue;
    let x1 = x, y1 = y;
    while (MAP[y][x1 + 1] === c) x1++;
    while (MAP[y1 + 1] && MAP[y1 + 1][x] === c) y1++;
    for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) seen.add(xx + "," + yy);
    out.push({ x: (x + x1 + 1) / 2, y: (y + y1 + 1) / 2 });
  }
  return out;
})();

function goTo(st, gx, gy, pass) {
  const p = bfs(Math.floor(st.x), Math.floor(st.y), Math.floor(gx), Math.floor(gy), pass || passIn);
  if (p === null) { st.path = []; return false; }
  if (p.length) p[p.length - 1] = { x: gx, y: gy }; else p.push({ x: gx, y: gy });
  st.path = p;
  return true;
}

function followPath(S, st, spd, dt) {
  // he opens room doors on his way through
  const n0 = st.path[0];
  if (n0 && st.mode === "in") {
    const tx = Math.floor(n0.x), ty = Math.floor(n0.y);
    if (tileAt(tx, ty) === "d") {
      const dr = S.idoors[IDOOR_AT[tx + "," + ty]];
      if (!dr.open && Math.hypot(n0.x - st.x, n0.y - st.y) < 1.2) {
        dr.open = true;
        emit({ k: "creak", x: n0.x, y: n0.y, slow: true });
        st.pause = st.state === "chase" ? 0.35 : 0.8;
      }
    }
  }
  if (st.pause > 0) { st.pause -= dt; st.spd = 0; return false; }
  let move = spd * dt;
  st.spd = spd;
  while (move > 0 && st.path.length) {
    const n = st.path[0];
    const dx = n.x - st.x, dy = n.y - st.y, d = Math.hypot(dx, dy);
    if (d > 0.001) st.a = Math.atan2(dy, dx);
    if (d <= move) { st.x = n.x; st.y = n.y; st.path.shift(); move -= d; }
    else { st.x += dx / d * move; st.y += dy / d * move; move = 0; }
  }
  if (!st.path.length) st.spd = 0;
  return st.path.length === 0;
}

// how fast he runs at you: just under your sprint, scaled to your injuries
function chaseSpeed(S, p) {
  const st = S.stalker;
  const ratio = S.resets > 0 ? RESET_RATIO : st.rage ? RAGE_RATIO : CHASE_RATIO;
  return SPRINT * (p ? p.spd : 1) * ratio;
}
function walkSpeed(S) { return 1.45 + nightProgress(S) * 0.45 + (S.resets ? 0.4 : 0); }

// can he see this player right now?
function monsterSees(S, p, maxD) {
  const st = S.stalker;
  if (st.mode !== "in" || !active(p)) return false;
  const d = Math.hypot(p.x - st.x, p.y - st.y);
  if (maxD && d > maxD) return false;
  if (d < 1.3) return true;
  if (!los(S, st.x, st.y, p.x, p.y)) return false;
  if (flashHits(S, p, st.x, st.y)) return true;
  const range = roomLit(S, p.x, p.y) || flashOn(p) ? 11 : 4.5;
  if (d > range) return false;
  return Math.abs(angDiff(Math.atan2(p.y - st.y, p.x - st.x), st.a)) < 1.25;
}
// players he notices: seen, or heard sprinting nearby
function spotPlayer(S) {
  const st = S.stalker;
  let best = null, bd = 1e9;
  for (const p of Object.values(S.players)) {
    if (!active(p) || p.hidden) continue;
    const d = Math.hypot(p.x - st.x, p.y - st.y);
    if (monsterSees(S, p) && d < bd) { bd = d; best = p; }
  }
  return best;
}
function heardPlayer(S) {
  const st = S.stalker;
  for (const p of Object.values(S.players)) {
    if (active(p) && !p.hidden && p.sp && inHouse(p.x, p.y) && Math.hypot(p.x - st.x, p.y - st.y) < 7) return p;
  }
  return null;
}

// he always comes in through the back door. He has a key.
function emerge(S) {
  const st = S.stalker, E = ENTRIES[BACK_DOOR];
  Object.assign(st, { mode: "in", x: E.ix, y: E.iy, a: 0, path: [], pause: 0.8, wait: 2.2, lastSeen: null, target: null, lostT: 0 });
  backDoorSwing(S);
}
// the back door swings open and shut again (and he locks it behind him)
function backDoorSwing(S) {
  const E = ENTRIES[BACK_DOOR];
  if (S.entries[BACK_DOOR].locked) emit({ k: "lock", x: E.x + 0.5, y: E.y + 0.5 });
  emit({ k: "creak", x: E.x + 0.5, y: E.y + 0.5, heavy: true });
  emit({ k: "bdoor" });
}
function startPatrol(S) {
  const st = S.stalker;
  st.state = "patrol"; st.target = null;
  st.timer = 45 + nightProgress(S) * 45 + rand(0, 15);
  st.path = [];
}
function goReturn(S) {
  const st = S.stalker;
  st.state = "return"; st.target = null; st.rage = false;
  if (!goTo(st, ENTRIES[BACK_DOOR].ix, ENTRIES[BACK_DOOR].iy)) vanish(S, 30);
}
function vanish(S, away) {
  const st = S.stalker;
  Object.assign(st, { mode: "away", state: "away", x: -30, y: -30, path: [], target: null, rage: false, timer: away, spd: 0 });
}
function investigate(S, x, y) {
  const st = S.stalker;
  if (S.cut || st.state === "chase" || curfewOn(S)) return;
  if (st.state === "away") { st.timer = Math.min(st.timer, 4); return; }
  if (st.mode !== "in") return;
  st.state = "search"; st.lastSeen = { x, y }; st.look = 0; st.checked = false;
  goTo(st, x, y);
}
function startChase(S, p) {
  const st = S.stalker;
  if (st.state !== "chase") { emit({ k: "stinger" }); emit({ k: "msg", to: p.id, text: "HE SEES YOU. RUN!", c: "#ff1744", big: true }); }
  st.state = "chase"; st.target = p.id; st.lostT = 0; st.repath = 0; st.wait = 0;
  st.lastSeen = { x: p.x, y: p.y };
  if (!st.loop || st.loop.id !== p.id) st.loop = { id: p.id, c: -1, last: 0, acc: 0, away: 0 };
}
function startSearch(S, x, y) {
  const st = S.stalker;
  st.state = "search"; st.look = 0; st.checked = false; st.target = null;
  if (x != null) goTo(st, x, y); else st.path = [];
}

function watchFrom(S, x, y, dur, seenMsg) {
  const st = S.stalker;
  Object.assign(st, { mode: "out", state: "watch", x, y, timer: dur, seenT: 0, msg: seenMsg, path: [], spd: 0 });
  st.a = Math.atan2(SPOTS.center.y - y, SPOTS.center.x - x);
}

function updateStalker(S, dt) {
  const st = S.stalker;
  switch (st.state) {
    case "away":
      st.timer -= dt;
      if (st.timer <= 0) {
        emerge(S); startPatrol(S);
        if (!S.dir.fired.firstOut) { S.dir.fired.firstOut = true; emit({ k: "msg", text: "The back door just opened. Someone came in...", c: "#ff8a80", big: true }); }
      }
      return;
    case "watch": {
      st.timer -= dt;
      const seen = anyPlayer(S, (p) => !p.hidden && Math.hypot(p.x - st.x, p.y - st.y) < 24 &&
        Math.abs(angDiff(Math.atan2(st.y - p.y, st.x - p.x), p.a)) < 0.45 && los(S, p.x, p.y, st.x, st.y));
      if (seen) st.seenT += dt;
      if (st.seenT > 0.9 || st.timer <= 0) {
        if (st.seenT > 0.9) { emit({ k: "stinger", soft: true }); emit({ k: "msg", text: st.msg, c: "#ff8a80" }); }
        vanish(S, Math.max(st.timer, 0) + 20);
      }
      return;
    }
    case "window": {
      // a face at the glass, then he smashes through
      st.timer -= dt;
      const E = ENTRIES[st.win];
      st.a = Math.atan2(E.iy - E.oy, E.ix - E.ox);
      if (st.timer <= 0) {
        S.entries[st.win].broken = true;
        emit({ k: "glass", x: E.x + 0.5, y: E.y + 0.5 });
        Object.assign(st, { mode: "in", x: E.ix, y: E.iy, path: [], pause: 0.5 });
        const p = S.players[st.target];
        if (p && active(p) && !p.hidden) startChase(S, p); else startPatrol(S);
      }
      return;
    }
    case "rageAway":
      st.timer -= dt;
      if (st.timer <= 0) {
        // round the outside of the building and back in through the back door
        const E = ENTRIES[BACK_DOOR];
        Object.assign(st, { mode: "in", x: E.ix, y: E.iy, path: [], pause: 0.3, rage: true });
        backDoorSwing(S);
        emit({ k: "msg", text: "The back door bangs open. He's back. And he's FAST.", c: "#ff1744", big: true });
        const p = S.players[st.target];
        if (p && active(p) && !p.hidden) startChase(S, p); else startSearch(S, p ? p.x : null, p ? p.y : null);
      }
      return;
    case "rageOut": {
      const E = ENTRIES[FRONT_DOOR];
      if (followPath(S, st, SPRINT * 1.3, dt)) {
        emit({ k: "creak", x: E.x + 0.5, y: E.y + 0.5, heavy: true });
        Object.assign(st, { mode: "out", state: "rageAway", x: SPOTS.frontOut.x, y: SPOTS.frontOut.y, timer: 3.5, path: [], spd: 0 });
      }
      return;
    }
  }
  if (st.mode !== "in") return;

  // bed rule: eyes open in a bed he's standing next to = he sees you
  for (const p of Object.values(S.players)) {
    if (!active(p) || p.hidden !== "bed" || eyesShut(p)) continue;
    const d = Math.hypot(p.hideX - st.x, p.hideY - st.y);
    if (d < 2.8 && los(S, st.x, st.y, p.hideX, p.hideY)) { st.a = Math.atan2(p.hideY - st.y, p.hideX - st.x); strike(S, p, "bed"); return; }
  }

  switch (st.state) {
    case "patrol": {
      st.timer -= dt;
      const p = spotPlayer(S);
      if (p) { startChase(S, p); break; }
      const h = heardPlayer(S);
      if (h) { investigate(S, h.x, h.y); break; }
      if (st.path.length) { followPath(S, st, walkSpeed(S), dt); break; }
      if (st.wait > 0) { st.wait -= dt; st.spd = 0; st.a += dt * 0.6 * Math.sin(S.dir.t * 0.7); break; }
      if (st.timer <= 0) { goReturn(S); break; }
      const r = pick(ROOMS);
      const f = pick(FLOORS.filter((t) => t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1)) || pick(FLOORS);
      goTo(st, f.x + 0.5, f.y + 0.5);
      st.wait = rand(1.5, 3.5);
      break;
    }
    case "search": {
      const p = spotPlayer(S);
      if (p) { startChase(S, p); break; }
      if (st.path.length) { followPath(S, st, walkSpeed(S) * 1.3, dt); break; }
      st.look += dt; st.spd = 0;
      st.a += dt * 1.6 * Math.sin(st.look * 1.3);
      if (st.look > 1.5 && !st.checked) { st.checked = true; checkClosets(S); if (st.state !== "search") break; }
      if (st.look > 4) startPatrol(S);
      break;
    }
    case "check": {
      const p = spotPlayer(S);
      if (p) { startChase(S, p); break; }
      if (st.path.length) { followPath(S, st, walkSpeed(S), dt); break; }
      if (st.wait > 0) { st.wait -= dt; st.a += dt * 0.8; st.spd = 0; break; }
      const w = st.wps.shift();
      if (w) { goTo(st, w.x, w.y); st.wait = 2.5; checkClosets(S, 0.25); }
      else st.wps = [[11.5, 9.6], [11.6, 19.4]].map(([x, y]) => ({ x, y }));
      break;
    }
    case "chase": {
      const p = S.players[st.target];
      if (!p || !active(p)) { startSearch(S); break; }
      if (p.hidden) {
        // you hid. If he saw you do it, he knows where you are.
        if (p.hidden === "closet" && p.seenHide) {
          if (Math.hypot(p.hideX - st.x, p.hideY - st.y) < 1.25) { strike(S, p, "closet"); break; }
          st.repath -= dt;
          if (st.repath <= 0 || !st.path.length) { st.repath = 0.5; const o = standNear(S, p.hideX, p.hideY); goTo(st, o.x, o.y); }
          followPath(S, st, chaseSpeed(S, p), dt);
          break;
        }
        if (p.hidden === "bed" && p.seenHide) {
          // he stands over the bed, waiting for you to open your eyes
          const o = standNear(S, p.hideX, p.hideY);
          if (Math.hypot(o.x - st.x, o.y - st.y) > 0.5) {
            st.repath -= dt;
            if (st.repath <= 0 || !st.path.length) { st.repath = 0.5; goTo(st, o.x, o.y); }
            followPath(S, st, chaseSpeed(S, p), dt);
          } else {
            st.spd = 0; st.a = Math.atan2(p.hideY - st.y, p.hideX - st.x);
            st.lostT += dt;
            if (st.lostT > 9) { p.seenHide = false; startSearch(S); }
          }
          break;
        }
        startSearch(S, st.lastSeen.x, st.lastSeen.y);
        break;
      }
      const d = Math.hypot(p.x - st.x, p.y - st.y);
      if (d < 0.75) { strike(S, p, "caught"); break; }
      const sees = monsterSees(S, p) || d < 2;
      if (sees) { st.lastSeen = { x: p.x, y: p.y }; st.lostT = 0; }
      else st.lostT += dt;
      if (st.lostT > 3.5) { startSearch(S, st.lastSeen.x, st.lastSeen.y); break; }
      if (!st.rage && S.resets === 0 && trackLoop(S, p, dt)) { startRage(S, p); break; }
      const spd = chaseSpeed(S, p);
      if (sees && d < 2.2 && los(S, st.x, st.y, p.x, p.y)) {
        const dx = p.x - st.x, dy = p.y - st.y;
        st.a = Math.atan2(dy, dx); st.spd = spd;
        moveCircle(st, dx / d * spd * dt, dy / d * spd * dt, 0.3, stalkerSolidFn(S));
        st.path = [];
      } else {
        st.repath -= dt;
        const goal = sees ? p : st.lastSeen;
        if (st.repath <= 0 || !st.path.length) { st.repath = 0.3; goTo(st, goal.x, goal.y); }
        followPath(S, st, spd, dt);
      }
      break;
    }
    case "return":
    case "retreat":
      if (followPath(S, st, walkSpeed(S) * (st.state === "retreat" ? 1.5 : 1), dt)) {
        backDoorSwing(S);
        vanish(S, st.state === "retreat" ? 25 : Math.max(18, 55 - nightProgress(S) * 30 + rand(0, 20)));
      } else if (st.state === "return") {
        const p = spotPlayer(S);
        if (p) startChase(S, p);
      }
      break;
  }
}

// circling a table: add up how far round it you've gone
function trackLoop(S, p, dt) {
  const st = S.stalker, L = st.loop;
  if (!L) return false;
  let ci = -1, cd = 1e9;
  LOOP_CENTERS.forEach((c, i) => { const d = Math.hypot(p.x - c.x, p.y - c.y); if (d < cd) { cd = d; ci = i; } });
  const C = LOOP_CENTERS[ci];
  if (!C || cd > 2.8 || Math.hypot(st.x - C.x, st.y - C.y) > 3.6) {
    L.away += dt;
    if (L.away > 2) { L.acc = 0; L.c = -1; }
    return false;
  }
  L.away = 0;
  const ang = Math.atan2(p.y - C.y, p.x - C.x);
  if (L.c !== ci) { L.c = ci; L.last = ang; L.acc = 0; L.time = 0; return false; }
  L.acc += angDiff(ang, L.last);
  L.last = ang;
  // running laps, or just keeping the table between you and him
  L.time = (L.time || 0) + dt;
  return Math.abs(L.acc) > Math.PI * 2.5 || L.time > 8;
}

function startRage(S, p) {
  const st = S.stalker;
  st.loop = null; st.target = p.id;
  emit({ k: "scream", x: st.x, y: st.y, rage: true });
  emit({ k: "msg", text: "He screams and bolts out the front door...", c: "#ff1744", big: true });
  const E = ENTRIES[FRONT_DOOR];
  st.state = "rageOut";
  if (!goTo(st, E.ix, E.iy)) Object.assign(st, { mode: "out", state: "rageAway", x: SPOTS.frontOut.x, y: SPOTS.frontOut.y, timer: 3.5, path: [] });
}

// he opens closets near where he's looking for you
function checkClosets(S, chance) {
  const st = S.stalker;
  for (const p of Object.values(S.players)) {
    if (!active(p) || p.hidden !== "closet") continue;
    if (Math.hypot(p.hideX - st.x, p.hideY - st.y) > 2.2) continue;
    if (p.seenHide || Math.random() < (chance == null ? 0.35 : chance)) {
      emit({ k: "creak", x: p.hideX, y: p.hideY, heavy: true });
      strike(S, p, "closet");
      return;
    }
  }
}

// --------------------------- getting hit -------------------------------------
function strike(S, p, how) {
  const st = S.stalker;
  if (p.carry) dropItem(S, p);
  if (p.hidden) {
    const out = standNear(S, p.hideX, p.hideY);
    p.x = out.x; p.y = out.y;
  }
  p.snap++;
  p.hidden = false; p.act = null; p.seenHide = false; p.bedSpot = -1; p.hideT = 0;
  p.strikes++;
  p.spd *= STRIKE_SLOW;
  p.stun = 1.6;
  st.rage = false; st.loop = null;
  emit({ k: "hit", id: p.id, name: p.name, x: p.x, y: p.y, n: p.strikes, how });
  if (p.strikes >= MAX_STRIKES) { startDefeat(S, p); return; }
  emit({ k: "msg", to: p.id, text: how === "closet" ? "He ripped the closet open and dragged you out!" : how === "bed" ? "Your eyes were open. He pulled you out of bed!" : "He hit you!", c: "#ff1744", big: true });
  emit({ k: "msg", to: p.id, text: "Strike " + p.strikes + " of " + MAX_STRIKES + ". You're slower now." + (MAX_STRIKES - p.strikes === 1 ? " One more and he takes you." : ""), c: "#ff8a80" });
  st.state = "retreat"; st.target = null;
  if (!goTo(st, ENTRIES[BACK_DOOR].ix, ENTRIES[BACK_DOOR].iy)) vanish(S, 25);
}

// --------------------------- the third strike --------------------------------
// He drags you by the foot to the kitchen table, sits down across from you and
// puts a revolver between you: one bullet, you go first, then him, and so on.
// If it goes off on your turn, you're out for good. If it goes off on his, it
// doesn't stop him: he carries you back to bed and the night starts over (and
// he's faster).
function startDefeat(S, p) {
  const st = S.stalker;
  p.cut = true; p.hidden = false; p.act = null; p.text = null;
  S.cut = { id: p.id, ph: "drag", t: 0 };
  Object.assign(st, { state: "drag", target: p.id, rage: false, mode: "in", pause: 0 });
  emit({ k: "drag", id: p.id, name: p.name, x: p.x, y: p.y });
  emit({ k: "msg", text: p.name + " was caught for the third time...", c: "#ff1744", big: true });
  if (!goTo(st, SPOTS.rrDrag.x, SPOTS.rrDrag.y)) st.path = [];
}

function updateCutscene(S, dt) {
  const c = S.cut, st = S.stalker, p = S.players[c.id];
  c.t += dt;
  if (!p) { S.cut = null; goReturn(S); return; }
  if (c.ph === "drag") {
    const done = followPath(S, st, 1.25, dt) || c.t > 25;
    // you slide along behind him, feet first
    const dx = p.x - st.x, dy = p.y - st.y, d = Math.hypot(dx, dy);
    if (d > 1.15) { p.x = st.x + dx / d * 1.15; p.y = st.y + dy / d * 1.15; }
    p.a = Math.atan2(st.y - p.y, st.x - p.x); p.snap++;
    if (done) {
      Object.assign(c, { ph: "rr", t: 0, step: "intro", st: 0, n: 0, shot: Math.floor(Math.random() * 6), pull: false });
      for (const id in S.rooms) S.rooms[id].on = false;
      p.x = SPOTS.rrYou.x; p.y = SPOTS.rrYou.y; p.a = -Math.PI / 2; p.snap++;
      Object.assign(st, { x: SPOTS.rrHim.x, y: SPOTS.rrHim.y, a: Math.PI / 2, path: [], state: "rr", spd: 0 });
      emit({ k: "rrStart", id: p.id, name: p.name });
    }
  } else if (c.ph === "rr") {
    c.st += dt;
    const next = (step, ev) => { c.step = step; c.st = 0; c.pull = false; if (ev) emit(Object.assign({ id: p.id }, ev)); };
    const fire = (who) => {
      if (c.n === c.shot) next(who === "you" ? "youShot" : "hisShot", { k: "rrBang", who, x: SPOTS.rrGun.x, y: SPOTS.rrGun.y });
      else { c.n++; next(who === "you" ? "youSafe" : "hisSafe", { k: "rrClick", who, x: SPOTS.rrGun.x, y: SPOTS.rrGun.y }); }
    };
    switch (c.step) {
      case "intro": if (c.st > 5) next("you", { k: "rrTurn", who: "you" }); break;
      case "you":
        if (c.pull || c.st > RR_WAIT) {
          if (!c.pull) emit({ k: "msg", to: p.id, text: "He won't wait. He pushes your hand up to your head.", c: "#ff8a80" });
          next("youAim", { k: "rrAim", who: "you" });
        }
        break;
      case "youAim": if (c.st > 1.6) fire("you"); break;
      case "youSafe": if (c.st > 1.8) next("him", { k: "rrTurn", who: "him" }); break;
      case "him": if (c.st > 2) next("hisAim", { k: "rrAim", who: "him" }); break;
      case "hisAim": if (c.st > 1.8) fire("him"); break;
      case "hisSafe": if (c.st > 1.8) next("you", { k: "rrTurn", who: "you" }); break;
      case "youShot": if (c.st > 1.2) { c.ph = "ko"; c.t = 0; emit({ k: "knockout", id: p.id }); } break;
      case "hisShot":
        // it doesn't stop him. He sits back up, gets up, and picks you up.
        if (c.st > 6) {
          c.ph = "carry"; c.t = 0; st.state = "carry";
          st.x = SPOTS.rrHim.x; st.y = SPOTS.rrHim.y - 0.5;
          if (!goTo(st, 11.5, 8.5)) st.path = [];
          emit({ k: "carry", id: p.id });
        }
        break;
    }
  } else if (c.ph === "ko") {
    if (c.t > 3) {
      p.down = true; p.cut = false; S.cut = null;
      emit({ k: "msg", text: p.name + " is gone.", c: "#ff1744", big: true });
      vanish(S, 30);
    }
  } else if (c.ph === "carry") {
    const done = followPath(S, st, 1.4, dt) || c.t > 25;
    p.x = st.x; p.y = st.y; p.a = st.a + Math.PI; p.snap++;
    if (done) {
      // back in bed. It's 9:00 PM again, and he's faster now.
      S.resets++;
      setupNight(S);
      const bs = BED_SPOTS[0];
      Object.assign(p, { hidden: "bed", bedSpot: 0, hideX: bs.x, hideY: bs.y, x: 11.5, y: 8.5, cut: false });
      p.snap++;
      emit({ k: "reset", id: p.id });
    }
  }
}

// --------------------------- creepy little things ---------------------------
function updateEvents(S, dt) {
  if (S.cut || curfewOn(S)) return;
  if (S.power) {
    S.powerCD -= dt;
    if (S.powerCD <= 0 && S.stalker.state !== "chase") {
      S.power = false; S.powerCD = 9999;
      emit({ k: "powerout" });
      emit({ k: "msg", text: "The power went out. The fuse box is in the laundry room.", c: "#ff5252", big: true });
    }
  }
  S.nextEvent -= dt;
  if (S.nextEvent > 0) return;
  S.nextEvent = rand(28, 50) - nightProgress(S) * 10;
  const alive = Object.values(S.players).filter(active);
  const who = alive.length ? pick(alive) : null;
  const winE = ENTRIES.filter((E) => E.kind === "window");
  const ev = pick(["text", "text", "text", "whisper", "steps", "scratch", "dog", "phantom", "flicker", "tv", "phone", "knock"]);
  switch (ev) {
    case "scratch": { const E = pick(winE); emit({ k: "scratch", x: E.x + 0.5, y: E.y + 0.5 }); break; }
    case "phone": ring(S, null); break;
    case "knock": knockAt(S, FRONT_DOOR); break;
    case "tv": if (!S.tv && S.power) { S.tv = true; emit({ k: "click", x: SPOTS.tv.x, y: SPOTS.tv.y }); emit({ k: "msg", text: "The TV turned on by itself.", c: "#b0bec5" }); } break;
    case "flicker": if (S.power) { S.flick = 1.8; emit({ k: "flicker" }); } break;
    case "text": if (who && !who.text) sendText(S, who, pick(TEXTS.slice(1))); break;
    case "whisper": if (who) emit({ k: "whisper", to: who.id }); break;
    case "steps": emit({ k: "steps", x: rand(8, 20), y: rand(7, 21) }); break;
    case "dog": emit({ k: "dog" }); break;
    case "phantom": if (who && S.stalker.state === "away") emit({ k: "phantom", to: who.id }); break;
  }
}
