// ---------------------------------------------------------------------------
// Rules + the host-side simulation. The host's browser runs the real game
// (story, chores, doors, lights, the stalker) and sends snapshots to everyone.
// ---------------------------------------------------------------------------
const PR = 0.3;                    // player radius (m)
const WALK = 2.8, SPRINT = 4.4;
const FL_RANGE = 9, FL_HALF = 0.42;
const MAX_BOARDS = 3, MAX_PLANKS = 2;
const NIGHT_END = 600;             // 6:00 AM, in minutes after 8:00 PM
const LAST_NIGHT = 3;
const COLORS = ["#4fc3f7", "#ffb74d", "#81c784", "#f06292", "#ba68c8", "#fff176"];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

// ------------------------------ the nights ---------------------------------
const NIGHTS = {
  1: { day: "MONDAY", wake: 407, nightLen: 140, aggr: 1, eveningAggr: 0, closetPlanks: 0, nightPlanks: 4 },
  2: { day: "TUESDAY", wake: 432, nightLen: 190, aggr: 2, eveningAggr: 0, closetPlanks: 0, nightPlanks: 10 },
  3: { day: "WEDNESDAY", wake: 358, nightLen: 230, aggr: 3, eveningAggr: 1, closetPlanks: 16, nightPlanks: 10 },
};
const TASK_LABELS = {
  eat: "Heat up a dinner from the fridge and eat it",
  dishes: "Wash your plate in the kitchen sink",
  trash: "Take the trash bag out to the bin in the yard",
  teeth: "Brush your teeth",
  lock: "Lock the front door and the back door",
  bulb: "Replace the dead bathroom bulb (spares: hall closet)",
  laundry: "Put the clean laundry away in your closet",
  batteries: "Grab spare flashlight batteries (kitchen drawer)",
  board: "Board up 3 windows (planks: hall closet)",
  bed: "Go to bed",
  check: "Find out what made that noise",
  power: "Get the power back on (fuse box, end of the hall)",
  survive: "Survive until 6:00 AM",
};
const EVENING_TASKS = {
  1: ["eat", "dishes", "trash", "teeth", "lock", "bed"],
  2: ["bulb", "eat", "dishes", "laundry", "trash", "lock", "bed"],
  3: ["eat", "batteries", "board", "lock", "bed"],
};
const NIGHT_TASKS = { 1: ["check", "survive"], 2: ["power", "survive"], 3: ["survive"] };

// ------------------------------ geometry -----------------------------------
function doorOpen(S, tx, ty) {
  const c = tileAt(tx, ty), k = tx + "," + ty;
  if (c === "d") return S.idoors[IDOOR_AT[k]].open;
  if (c === "D" || c === "B") { const e = S.entries[ENTRY_AT[k]]; return e.open || e.broken; }
  return false;
}
function playerPass(S, tx, ty) {
  const c = tileAt(tx, ty);
  if (c === "." || c === "a" || c === "y") return true;
  if (c === "d" || c === "D" || c === "B") return doorOpen(S, tx, ty);
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

// Does this tile block sight? Closed doors and boarded windows (2+ boards) do.
function opaqueAt(S, tx, ty) {
  const c = tileAt(tx, ty);
  if (c === "W") return S.entries[ENTRY_AT[tx + "," + ty]].boards >= 2;
  if (c === "d" || c === "D" || c === "B") return !doorOpen(S, tx, ty);
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

function flashOn(p) { return p.fl && p.bat > 0 && !p.down && !p.hidden; }

function flashHits(S, p, x, y) {
  if (!flashOn(p)) return false;
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d > FL_RANGE) return false;
  const slack = 0.35 / Math.max(d, 0.5);
  if (Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > FL_HALF + slack) return false;
  // his head is ~0.3 m above your flashlight; aiming at the floor or ceiling misses
  if (Math.abs((p.pt || 0) - Math.atan2(0.3, d)) > FL_HALF + slack + 0.15) return false;
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

// minutes after 8:00 PM -> "11:42 PM"
function clockText(mins) {
  const total = (20 * 60 + Math.floor(mins)) % (24 * 60);
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
function inHouse(x, y) { return x >= HOUSE.x0 && x < HOUSE.x1 + 1 && y >= HOUSE.y0 && y < HOUSE.y1 + 1; }

// ------------------------------ chores --------------------------------------
function task(S, id) { return S.tasks.find((t) => t.id === id); }
function hasTask(S, id) { const t = task(S, id); return !!t && !t.done; }
function taskDone(S, id) { const t = task(S, id); return !!t && t.done; }
function choresDone(S) { return S.tasks.every((t) => t.done || t.id === "bed"); }
function completeTask(S, id) {
  const t = task(S, id);
  if (!t || t.done) return;
  t.done = true;
  if (t.once) return; // re-done after being undone (e.g. re-locking a door)
  t.once = true;
  S.dir.doneAt[id] = S.dir.t;
  emit({ k: "task", text: t.label });
}

// What can player p interact with right now? Used by the host (to do it) and
// by every client (to show the prompt). Returns {e, q} actions or null.
function findTarget(S, p) {
  let best = null, bestScore = 1e9;
  const consider = (spot, d) => {
    if (!spot || (!spot.e && !spot.q)) return;
    const da = Math.abs(angDiff(Math.atan2(spot.ty - p.y, spot.tx - p.x), p.a));
    const can = (spot.e && spot.e.can) || (spot.q && spot.q.can);
    const score = d + da * 0.35 + (can ? 0 : 0.3);
    if (score < bestScore) { bestScore = score; best = spot; }
  };
  for (const q of Object.values(S.players)) {
    if (q.id === p.id || !q.down) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < 1.6) consider({ tx: q.x, ty: q.y, e: { key: "rv:" + q.id, kind: "revive", ref: q.id, label: "Help " + q.name + " up", dur: 2.5, can: true } }, d - 0.5);
  }
  SWITCHES.forEach((sw, i) => {
    const d = Math.hypot(sw.px - p.x, sw.py - p.y);
    if (d > 0.9) return;
    const r = S.rooms[sw.room], name = ROOM_BY_ID[sw.room].name;
    consider({ tx: sw.x, ty: sw.y, e: { key: "sw" + i, kind: "switch", ref: sw.room, label: (r.on ? "Turn off the " : "Turn on the ") + name.toLowerCase() + " light", dur: 0.15, can: true } }, d - 0.3);
  });
  // replacing a dead bulb: stand under the light
  if (p.carry === "bulb") {
    for (const r of ROOMS) {
      if (S.rooms[r.id].bulb) continue;
      for (const [lx, ly] of r.lights) {
        const d = Math.hypot(lx - p.x, ly - p.y);
        if (d < 1.4) consider({ tx: lx, ty: ly, e: { key: "bulb" + r.id, kind: "bulbPut", ref: r.id, label: "Screw in the new light bulb", dur: 2, can: true } }, d - 0.6);
      }
    }
  }
  const cx = Math.floor(p.x), cy = Math.floor(p.y);
  for (let ty = cy - 2; ty <= cy + 2; ty++) for (let tx = cx - 2; tx <= cx + 2; tx++) {
    const c = tileAt(tx, ty);
    if ("dDBWrMTSgZzoLAlCbvhF".indexOf(c) < 0) continue;
    const nx = clamp(p.x, tx, tx + 1), ny = clamp(p.y, ty, ty + 1);
    const d = Math.hypot(p.x - nx, p.y - ny);
    if (d > 0.85) continue;
    const spot = tileSpot(S, p, c, tx, ty);
    if (spot) { spot.tx = tx + 0.5; spot.ty = ty + 0.5; consider(spot, d); }
  }
  return best;
}

const doAct = (key, kind, label, dur, ref) => ({ key, kind, label, dur, ref, can: true });
const noteAct = (key, label) => ({ key, label, can: false });

function tileSpot(S, p, c, tx, ty) {
  const k = tx + "," + ty, empty = !p.carry;
  switch (c) {
    case "d": {
      const i = IDOOR_AT[k], dr = S.idoors[i];
      return { e: doAct("id" + i, "idoor", dr.open ? "Close the door" : "Open the door", 0.2, i) };
    }
    case "D": case "B": {
      const i = ENTRY_AT[k], e = S.entries[i], E = ENTRIES[i], nm = E.name.toLowerCase();
      const out = inYard(p.x, p.y);
      if (p.carry === "plank" && !out) {
        if (e.open) return { e: noteAct("e" + i, "Close the door before boarding it up") };
        if (e.boards >= MAX_BOARDS) return { e: noteAct("e" + i, E.name + " — fully boarded") };
        return { e: doAct("e" + i, "board", (e.broken ? "Patch up the " : "Board up the ") + nm + " (" + e.boards + "/" + MAX_BOARDS + ")", 1.6, i) };
      }
      if (e.broken) return { e: noteAct("e" + i, "The " + nm + " has been smashed in") };
      if (e.boards > 0) return { e: noteAct("e" + i, "The " + nm + " is boarded up") };
      const spot = {};
      if (e.open) spot.e = doAct("e" + i, "edoor", "Close the " + nm, 0.25, i);
      else if (e.locked) spot.e = noteAct("e" + i, "Locked" + (out ? "" : " — press Q to unlock"));
      else spot.e = doAct("e" + i, "edoor", "Open the " + nm, 0.25, i);
      if (!e.open && !out) spot.q = doAct("l" + i, "lock", e.locked ? "Unlock" : "Lock the " + nm, 0.5, i);
      return spot;
    }
    case "W": {
      if (p.carry !== "plank") return null;
      const i = ENTRY_AT[k], e = S.entries[i], E = ENTRIES[i];
      if (e.boards >= MAX_BOARDS) return { e: noteAct("e" + i, E.name + " — fully boarded") };
      return { e: doAct("e" + i, "board", (e.broken ? "Patch up the " : "Board up the ") + E.name.toLowerCase() + " (" + e.boards + "/" + MAX_BOARDS + ")", 1.6, i) };
    }
    case "r":
      return { e: empty ? doAct("fridge", "food", "Take a frozen dinner", 0.6) : noteAct("fridge", "Your hands are full") };
    case "M":
      if (S.micro.st === "cooking") return { e: noteAct("micro", "Heating up... " + Math.ceil(S.micro.t) + "s") };
      if (S.micro.st === "ready") return { e: empty ? doAct("micro", "microOut", "Take out your hot dinner", 0.4) : noteAct("micro", "Your hands are full") };
      if (p.carry === "food") return { e: doAct("micro", "microIn", "Heat it up in the microwave", 0.6) };
      return { e: noteAct("micro", "Microwave") };
    case "T":
      if (p.carry === "hot") return { e: doAct("table", "eat", "Sit down and eat", 4) };
      if (S.plateOnTable && empty) return { e: doAct("table", "plate", "Pick up your dirty plate", 0.4) };
      return null;
    case "S":
      if (p.carry === "plate") return { e: doAct("sink", "wash", "Wash your plate", 3.5) };
      return null;
    case "g":
      if (S.trash === "can") return { e: empty ? doAct("can", "trashUp", "Tie up the trash bag and take it", 0.8) : noteAct("can", "Your hands are full") };
      return null;
    case "Z":
      if (p.carry === "trash") return { e: doAct("bin", "trashBin", "Throw the bag in the bin", 0.6) };
      return null;
    case "z":
      if (hasTask(S, "teeth")) return { e: doAct("bsink", "teeth", "Brush your teeth", 3) };
      return null;
    case "o":
      return { e: doAct("toilet", "flush", "Flush the toilet", 0.3) };
    case "L": {
      const spot = {};
      const wantBulb = Object.values(S.rooms).some((r) => !r.bulb) && S.closet.bulbs > 0 && empty;
      const plankOk = S.closet.planks > 0 && (empty || (p.carry === "plank" && p.carryN < MAX_PLANKS));
      if (wantBulb) spot.e = doAct("closetB", "bulbTake", "Take a light bulb", 0.6);
      if (plankOk) spot[spot.e ? "q" : "e"] = doAct("closetP", "plankTake", "Take a plank (" + S.closet.planks + " left)", 0.5);
      if (!spot.e) spot.e = noteAct("closet", S.closet.planks <= 0 && S.stage === "night" ? "Hall closet — no planks left" : "Hall closet — towels and old junk");
      return spot;
    }
    case "A":
      if (S.batteries <= 0) return { e: noteAct("drawer", "Junk drawer — no batteries left") };
      if (p.bat >= 95 && !hasTask(S, "batteries")) return { e: noteAct("drawer", "Junk drawer (your flashlight is full)") };
      return { e: doAct("drawer", "batt", "Take flashlight batteries", 0.8) };
    case "l":
      if (S.laundry === "basket") return { e: empty ? doAct("basket", "laundryUp", "Pick up the clean laundry", 0.6) : noteAct("basket", "Your hands are full") };
      return null;
    case "C": {
      if (p.carry === "laundry" && tx === 12 && ty === 7) return { e: doAct("h" + k, "laundryPut", "Put the laundry away", 1.2) };
      return { e: doAct("h" + k, "hide", "Hide in the closet", 0.35, k) };
    }
    case "b": {
      if (S.stage === "evening" && hasTask(S, "bed")) {
        return {
          e: choresDone(S) ? doAct("bed", "sleep", "Go to sleep", 1.5) : noteAct("bed", "Finish your chores before bed"),
          q: doAct("h" + k, "hide", "Hide under the bed", 0.35, k),
        };
      }
      return { e: doAct("h" + k, "hide", "Hide under the bed", 0.35, k) };
    }
    case "v":
      return { e: doAct("tv", "tv", S.tv ? "Turn off the TV" : "Turn on the TV", 0.3) };
    case "h":
      return S.phone > 0 ? { e: doAct("phone", "phone", "Answer the phone", 0.3) } : null;
    case "F":
      return { e: S.power ? noteAct("fuse", "Fuse box — the power is on") : doAct("fuse", "fuse", "Flip the breakers back on", 2.5) };
  }
  return null;
}

// ======================= HOST SIMULATION ===================================
let emit = () => {};
function setEmitter(f) { emit = f; }

function newStalker() {
  return { x: -30, y: -30, a: 0, mode: "out", state: "away", timer: 9999, path: [], next: null, target: -1, last: -1, bangT: 0, stun: false, expose: 0, repath: 0, lastSeen: null, seenT: 0, msg: null };
}

function newGame(lobby, night) {
  const S = {
    phase: "play", night: night || 1, stage: "evening", mins: 0, stageT: 0,
    power: true, flick: 0, tv: false, phone: 0, phoneMsg: null,
    entries: [], idoors: [], rooms: {}, micro: { st: "off", t: 0 }, trash: "can", plateOnTable: false, laundry: "done",
    closet: { bulbs: 2, planks: 0 }, batteries: 4, tasks: [],
    dir: { t: 0, fired: {}, doneAt: {} },
    players: {}, stalker: newStalker(), n: Math.max(1, lobby.length),
    nextEvent: 9999, powerCD: 40, aggr: 0, nextTarget: -1,
  };
  lobby.forEach((L, i) => {
    S.players[L.id] = {
      id: L.id, name: L.name, color: L.color, x: 0, y: 0, a: 0, pt: 0, fl: true, bat: 100, carry: null, carryN: 0,
      down: false, hidden: false, hideX: 0, hideY: 0, snap: 0, act: null, needRel: false, seenHide: false, hamT: 0, gHeld: false,
    };
  });
  setupEvening(S);
  return S;
}

function placePlayers(S, spots, a) {
  Object.values(S.players).forEach((p, i) => {
    const s = spots[i % spots.length];
    p.x = s[0]; p.y = s[1]; p.a = a; p.snap++;
    p.down = false; p.hidden = false; p.act = null; p.carry = null; p.carryN = 0; p.needRel = false;
  });
}

function setupEvening(S) {
  const cfg = NIGHTS[S.night];
  S.stage = "evening"; S.mins = 0; S.stageT = 0;
  S.power = true; S.flick = 0; S.tv = false; S.phone = 0; S.phoneMsg = null;
  S.entries = ENTRIES.map((E) => ({ boards: 0, bhp: 100, lock: E.kind === "door" ? 100 : 55, broken: false, hit: 0, open: false, locked: false }));
  S.idoors = IDOORS.map(() => ({ open: true }));
  S.rooms = {};
  ROOMS.forEach((r) => (S.rooms[r.id] = { on: true, bulb: true }));
  if (S.night === 2) S.rooms.bath.bulb = false;
  S.micro = { st: "off", t: 0 }; S.trash = "can"; S.plateOnTable = false;
  S.laundry = S.night === 2 ? "basket" : "done";
  S.closet = { bulbs: 2, planks: cfg.closetPlanks }; S.batteries = 4;
  S.tasks = EVENING_TASKS[S.night].map((id) => ({ id, label: TASK_LABELS[id], done: false }));
  S.dir = { t: 0, fired: {}, doneAt: {} };
  S.aggr = cfg.eveningAggr; S.nextTarget = -1;
  S.stalker = newStalker();
  if (S.aggr > 0) { S.stalker.x = 1.5; S.stalker.y = 1.5; S.stalker.state = "wander"; S.stalker.timer = 25; }
  S.nextEvent = S.aggr > 0 ? 30 : 9999;
  S.powerCD = 9999;
  for (const p of Object.values(S.players)) p.bat = 100;
  placePlayers(S, EVENING_SPOTS, -Math.PI / 2);
}

function goToSleep(S) {
  S.stage = "sleep"; S.stageT = 0;
  for (const p of Object.values(S.players)) { p.act = null; p.hidden = false; }
  emit({ k: "sleep" });
}

function startNightStage(S) {
  const cfg = NIGHTS[S.night];
  S.stage = "night"; S.stageT = 0; S.mins = cfg.wake;
  for (const id in S.rooms) S.rooms[id].on = false;
  S.tv = false; S.micro = { st: "off", t: 0 }; S.phone = 0;
  if (S.night === 2) S.power = false;
  S.closet.planks += cfg.nightPlanks;
  S.tasks = NIGHT_TASKS[S.night].map((id) => ({ id, label: TASK_LABELS[id], done: false }));
  S.dir = { t: 0, fired: {}, doneAt: {} };
  S.aggr = cfg.aggr; S.nextTarget = -1;
  const st = S.stalker = newStalker();
  st.x = 3.5; st.y = 27.5; st.state = "wander"; st.timer = S.night === 3 ? 2 : 10;
  S.nextEvent = 25; S.powerCD = S.night >= 2 ? 50 : 9999;
  placePlayers(S, WAKE_SPOTS, Math.PI / 2);
  emit({ k: "wake" });
}

function startMorning(S) {
  S.stage = "morning"; S.stageT = 0; S.mins = NIGHT_END;
  goAway(S);
  for (const p of Object.values(S.players)) p.act = null;
  const lines = {
    1: ["6:00 AM. The sun is coming up.", "Whoever it was, they're gone. The back gate is hanging open."],
    2: ["6:00 AM. The police came by.", "They found muddy footprints under every single window.", "\"Call us if he comes back,\" they said. Your aunt gets home in two days."],
    3: ["6:00 AM. Sirens. Red and blue light through the cracks in the boards.", "They never found him. But in the bushes by the gate, the police found a key.", "A key to your aunt's back door."],
  }[S.night];
  emit({ k: "card", title: S.night === LAST_NIGHT ? "YOU SURVIVED" : "MORNING", lines, t: 8.5 });
  emit({ k: "morning" });
}

function nextNight(S) {
  if (S.night >= LAST_NIGHT) { S.phase = "win"; emit({ k: "win" }); return; }
  S.night++;
  setupEvening(S);
}

// What clients receive (same shape as S, minus host-only bookkeeping)
function publicState(S) {
  const players = {};
  for (const p of Object.values(S.players)) {
    players[p.id] = {
      id: p.id, name: p.name, color: p.color, x: +p.x.toFixed(2), y: +p.y.toFixed(2), a: +p.a.toFixed(2), pt: +(p.pt || 0).toFixed(2),
      fl: p.fl, bat: Math.round(p.bat), carry: p.carry, carryN: p.carryN, down: p.down, hidden: p.hidden, hideX: p.hideX, hideY: p.hideY,
      snap: p.snap, act: p.act ? { label: p.act.label, t: p.act.t, dur: p.act.dur } : null,
    };
  }
  const st = S.stalker;
  return {
    phase: S.phase, night: S.night, stage: S.stage, mins: S.mins, stageT: S.stageT,
    power: S.power, flick: S.flick, tv: S.tv, phone: S.phone,
    entries: S.entries.map((e) => ({ boards: e.boards, bhp: Math.round(e.bhp), lock: Math.round(e.lock), broken: e.broken, hit: e.hit, open: e.open, locked: e.locked })),
    idoors: S.idoors, rooms: S.rooms, micro: { st: S.micro.st, t: S.micro.t }, trash: S.trash, plateOnTable: S.plateOnTable,
    laundry: S.laundry, closet: S.closet, batteries: S.batteries, tasks: S.tasks, aggr: S.aggr,
    players,
    stalker: { x: +st.x.toFixed(2), y: +st.y.toFixed(2), a: +st.a.toFixed(2), mode: st.mode, state: st.state, stun: st.stun, target: st.target },
  };
}

function simStep(S, inputs, dt) {
  if (S.phase !== "play") return;
  S.stageT += dt;
  if (S.stage === "sleep") { if (S.stageT > 5) startNightStage(S); return; }
  if (S.stage === "morning") { if (S.stageT > 9) nextNight(S); return; }
  S.dir.t += dt;
  if (S.stage === "evening") S.mins = Math.min(235, S.mins + dt / 1.3);
  else {
    const cfg = NIGHTS[S.night];
    S.mins += dt * (NIGHT_END - cfg.wake) / cfg.nightLen;
    if (S.mins >= NIGHT_END) { completeTask(S, "survive"); startMorning(S); return; }
  }
  S.flick = Math.max(0, S.flick - dt);
  if (S.power) S.powerCD -= dt;
  if (S.phone > 0) S.phone = Math.max(0, S.phone - dt);
  for (const e of S.entries) e.hit = Math.max(0, e.hit - dt * 2);
  if (S.micro.st === "cooking") {
    S.micro.t -= dt;
    if (S.micro.t <= 0 || !S.power) {
      if (S.power) { S.micro.st = "ready"; emit({ k: "ding", x: 21.5, y: 15.5 }); }
      else { S.micro.st = "ready"; }
    }
  }
  updatePlayers(S, inputs, dt);
  updateStalker(S, dt);
  runDirector(S);
  updateEvents(S, dt);
  updateTasks(S);
  const ps = Object.values(S.players);
  if (ps.length && ps.every((p) => p.down)) { S.phase = "lose"; emit({ k: "lose" }); }
}

function updateTasks(S) {
  const lockT = task(S, "lock");
  if (lockT) {
    const f = S.entries[FRONT_DOOR], b = S.entries[BACK_DOOR];
    const ok = (e) => (e.locked && !e.open) || e.boards > 0;
    const now = ok(f) && ok(b);
    if (now && !lockT.done) completeTask(S, "lock");
    else if (!now && lockT.done) lockT.done = false;
  }
  const boardT = task(S, "board");
  if (boardT) {
    const n = S.entries.filter((e, i) => ENTRIES[i].kind === "window" && e.boards > 0).length;
    boardT.label = TASK_LABELS.board + " — " + Math.min(3, n) + "/3";
    if (n >= 3) completeTask(S, "board");
  }
  if (hasTask(S, "power") && S.power && S.stageT > 2) completeTask(S, "power");
  if (hasTask(S, "check")) {
    if (Object.values(S.players).some((p) => !p.down && (roomAt(Math.floor(p.x), Math.floor(p.y)) || {}).id === "living") || S.dir.t > 40) completeTask(S, "check");
  }
}

function updatePlayers(S, inputs, dt) {
  const solid = playerSolidFn(S);
  for (const p of Object.values(S.players)) {
    const inp = inputs[p.id];
    if (inp) {
      if (!p.down && !p.hidden && typeof inp.x === "number") {
        const d = Math.hypot(inp.x - p.x, inp.y - p.y);
        if (d < 2.5 && !collides(inp.x, inp.y, PR - 0.05, solid)) { p.x = inp.x; p.y = inp.y; }
        else if (d > 0.001) p.snap++;
      }
      if (typeof inp.a === "number") p.a = inp.a;
      if (typeof inp.pt === "number") p.pt = clamp(inp.pt, -1.4, 1.4);
      p.fl = !!inp.fl;
      // drop whatever you're carrying (G)
      if (inp.g && !p.gHeld && p.carry && !p.down) dropItem(S, p);
      p.gHeld = !!inp.g;
    }
    if (flashOn(p)) p.bat = Math.max(0, p.bat - dt * 0.45);
    const wantE = inp && inp.e, wantQ = inp && inp.q;
    const held = wantE || wantQ;
    if (!held || p.down) { p.act = null; p.needRel = false; continue; }
    if (p.needRel) continue;
    if (p.hidden) {
      p.hidden = false; p.seenHide = false; p.needRel = true;
      emit({ k: "creak", x: p.hideX, y: p.hideY, soft: true });
      continue;
    }
    const spot = findTarget(S, p);
    const a = spot && (wantE ? spot.e : spot.q);
    if (!a || !a.can) { p.act = null; continue; }
    if (!p.act || p.act.key !== a.key) p.act = { key: a.key, label: a.label, t: 0, dur: a.dur };
    p.act.t += dt;
    if (a.kind === "board") {
      p.hamT -= dt;
      if (p.hamT <= 0) { p.hamT = 0.38; emit({ k: "hammer", x: spot.tx, y: spot.ty }); }
    }
    if (p.act.t >= p.act.dur) { completeAction(S, p, a, spot); p.act = null; p.needRel = true; }
  }
}

function dropItem(S, p) {
  const what = p.carry;
  switch (what) {
    case "food": break; // back in the freezer
    case "hot": S.micro.st = "ready"; break;
    case "plate": S.plateOnTable = true; break;
    case "trash": S.trash = "can"; break;
    case "bulb": S.closet.bulbs++; break;
    case "laundry": S.laundry = "basket"; break;
    case "plank": S.closet.planks += p.carryN; break;
  }
  p.carry = null; p.carryN = 0;
  emit({ k: "msg", to: p.id, text: "You put it back where you found it.", c: "#b0bec5" });
}

function occupied(S, tx, ty) {
  const st = S.stalker;
  if (Math.floor(st.x) === tx && Math.floor(st.y) === ty) return true;
  return Object.values(S.players).some((q) => Math.abs(q.x - (tx + 0.5)) < 0.5 + PR && Math.abs(q.y - (ty + 0.5)) < 0.5 + PR);
}

function completeAction(S, p, a, spot) {
  const st = S.stalker;
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
      const e = S.entries[a.ref], E = ENTRIES[a.ref];
      if (e.open && occupied(S, E.x, E.y)) { emit({ k: "msg", to: p.id, text: "Something's in the way.", c: "#b0bec5" }); return; }
      e.open = !e.open;
      emit({ k: "creak", x: at.x, y: at.y, heavy: true });
      if (e.open && a.ref === FRONT_DOOR && S.dir.fired.knock && !S.dir.fired.nobody) {
        S.dir.fired.nobody = true;
        emit({ k: "msg", text: "Nobody's there.", c: "#b0bec5" });
      }
      break;
    }
    case "lock": {
      const e = S.entries[a.ref];
      e.locked = !e.locked;
      emit({ k: "lock", x: at.x, y: at.y });
      break;
    }
    case "board": {
      if (p.carry !== "plank") return;
      const e = S.entries[a.ref];
      p.carryN--; if (p.carryN <= 0) { p.carry = null; p.carryN = 0; }
      if (e.broken) { e.broken = false; e.lock = 40; e.open = false; }
      e.boards = Math.min(MAX_BOARDS, e.boards + 1);
      e.bhp = 100;
      emit({ k: "nail", x: at.x, y: at.y });
      break;
    }
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
    case "bulbTake": if (S.closet.bulbs > 0) { S.closet.bulbs--; p.carry = "bulb"; emit({ k: "grab", x: at.x, y: at.y }); } break;
    case "bulbPut":
      if (p.carry !== "bulb") return;
      p.carry = null; S.rooms[a.ref].bulb = true; S.rooms[a.ref].on = true;
      if (a.ref === "bath") completeTask(S, "bulb");
      emit({ k: "screw", x: at.x, y: at.y });
      break;
    case "plankTake":
      if (S.closet.planks <= 0) return;
      S.closet.planks--;
      if (p.carry === "plank") p.carryN++; else { p.carry = "plank"; p.carryN = 1; }
      emit({ k: "plank", x: at.x, y: at.y });
      break;
    case "batt":
      if (S.batteries <= 0) return;
      S.batteries--; p.bat = 100; completeTask(S, "batteries");
      emit({ k: "grab", x: at.x, y: at.y });
      break;
    case "laundryUp": p.carry = "laundry"; S.laundry = "carried"; emit({ k: "rustle", x: at.x, y: at.y }); break;
    case "laundryPut": p.carry = null; S.laundry = "done"; completeTask(S, "laundry"); emit({ k: "creak", x: at.x, y: at.y, soft: true }); break;
    case "hide":
      p.hidden = true; p.act = null;
      p.hideX = spot.tx; p.hideY = spot.ty;
      p.seenHide = st.mode === "in" && Math.hypot(st.x - p.x, st.y - p.y) < 7 && los(S, st.x, st.y, p.x, p.y);
      emit({ k: "creak", x: at.x, y: at.y, soft: true });
      break;
    case "sleep": if (choresDone(S)) { completeTask(S, "bed"); goToSleep(S); } break;
    case "tv": S.tv = !S.tv; emit({ k: "click", x: at.x, y: at.y }); break;
    case "phone": {
      S.phone = 0;
      let text = S.phoneMsg;
      if (!text && S.aggr >= 2) {
        const i = weightedEntry(S);
        S.nextTarget = i;
        text = "...(breathing)... the " + ENTRIES[i].name.toLowerCase() + ". that's where i'm coming in.";
      }
      emit({ k: "call", to: p.id, text: text || "...(slow breathing)..." });
      emit({ k: "msg", text: p.name + " answered the phone...", c: "#b0bec5" });
      S.phoneMsg = null;
      break;
    }
    case "fuse":
      S.power = true; S.powerCD = Math.max(30, 70 - S.night * 12);
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
    case "revive": {
      const q = S.players[a.ref];
      if (q && q.down) { q.down = false; q.snap++; emit({ k: "msg", text: p.name + " helped " + q.name + " back up!", c: "#a5d6a7" }); }
      break;
    }
  }
}

// ------------------------------ the story -----------------------------------
// Beats fire once: at a time (seconds into the evening/night), after a chore
// is done (plus a delay), or when a condition becomes true.
const say = (text, c, big) => () => emit({ k: "msg", text, c: c || "#b0bec5", big });
const textMsg = (text) => () => emit({ k: "text", text });
const anyPlayer = (S, f) => Object.values(S.players).some((p) => !p.down && f(p));
const nearWindow = (S, key, r) => { const E = ENTRIES[ENTRY_AT[key]]; return anyPlayer(S, (p) => Math.hypot(p.x - E.ix, p.y - E.iy) < r); };

function ring(S, msg) { if (S.phone <= 0) { S.phone = 16; S.phoneMsg = msg; emit({ k: "msg", text: "The landline is ringing in the living room...", c: "#b0bec5" }); } }
function knockAt(S, i, heavy) { const E = ENTRIES[i]; emit({ k: heavy ? "bang" : "knock", x: E.x + 0.5, y: E.y + 0.5 }); if (heavy) S.entries[i].hit = 1; }
function watch(S, x, y, dur, seenMsg) {
  const st = S.stalker;
  Object.assign(st, { mode: "out", state: "watch", x, y, timer: dur, seenT: 0, msg: seenMsg, path: [] });
  st.a = Math.atan2(14 - y, 15 - x);
}
function goAway(S) { Object.assign(S.stalker, { mode: "out", state: "away", x: -30, y: -30, path: [], timer: 9999 }); }

const STORY = {
  "1evening": [
    { at: 0.3, fn: () => emit({ k: "card", title: "NIGHT 1 — MONDAY", lines: ["You're house-sitting for your aunt May at 14 Alder Lane.", "She left a list of chores. It's a quiet street.", "Mostly."], t: 7 }) },
    { at: 8, fn: say("Your chores are listed on the left. Start with dinner: frozen meals are in the fridge.", "#ffe082") },
    { at: 40, fn: textMsg("hey neighbor :) welcome to alder lane") },
    { after: "eat", delay: 7, fn: (S) => { if (!S.tv) { S.tv = true; emit({ k: "click", x: 10, y: 15.5 }); } say("The TV turned itself on. Weird.")(); } },
    { id: "yard", when: (S) => anyPlayer(S, (p) => inYard(p.x, p.y)) && !taskDone(S, "trash"), fn: (S) => watch(S, 26.5, 24.6, 12, "...was someone standing past the fence?") },
    { id: "knock", after: "teeth", delay: 4, fn: (S) => { knockAt(S, FRONT_DOOR); say("Someone's knocking at the front door. At this hour?")(); } },
    { after: "teeth", delay: 16, fn: textMsg("nice pajamas") },
  ],
  "1night": [
    { at: 0.5, fn: (S) => { knockAt(S, FRONT_DOOR, true); emit({ k: "card", title: "2:47 AM", lines: ["Something woke you up.", "Three slow knocks on the front door."], t: 5 }); } },
    { at: 45, fn: (S) => ring(S, "...you looked so peaceful sleeping.") },
    { at: 85, fn: (S) => emit({ k: "scratch", x: 10.5, y: 6.5 }) },
  ],
  "2evening": [
    { at: 0.3, fn: () => emit({ k: "card", title: "NIGHT 2 — TUESDAY", lines: ["Aunt May called: \"Mrs. Pell next door saw a man in a white mask on our lawn last night.\"", "\"Lock everything. I'll be home Thursday.\"", "The bathroom light is dead."], t: 8 }) },
    { at: 26, fn: textMsg("you forgot to close the bathroom blinds last night") },
    { at: 55, fn: (S) => { if (S.power) { S.flick = 2.5; emit({ k: "flicker" }); } } },
    { id: "street", when: (S) => S.dir.t > 35 && (nearWindow(S, "10,21", 3.5) || nearWindow(S, "7,19", 3.5)), fn: (S) => watch(S, 10.5, 24.9, 14, "He was standing under the streetlight. Staring at the house.") },
    { after: "laundry", delay: 4, fn: (S) => {
      const e = S.entries[BACK_DOOR];
      emit({ k: "rattle", x: 23.5, y: 18.5 });
      if (!e.locked && !e.open && !e.boards) { e.open = true; emit({ k: "creak", x: 23.5, y: 18.5, heavy: true }); say("The back door just swung open by itself...", "#ff8a80")(); }
      else say("Someone just tried the back door handle.", "#ff8a80")();
    } },
    { after: "dishes", delay: 5, fn: (S) => ring(S, "...what's for dessert?") },
    { id: "gate", when: (S) => anyPlayer(S, (p) => inYard(p.x, p.y)) && !taskDone(S, "trash"), fn: (S) => watch(S, 30.4, 18.5, 8, "Something moved by the gate.") },
  ],
  "2night": [
    { at: 0.5, fn: () => { emit({ k: "card", title: "3:12 AM", lines: ["It's pitch black. The power's out.", "Someone is walking around the house."], t: 5 }); emit({ k: "powerout" }); } },
    { at: 7, fn: say("There are planks in the hall closet. Board up the windows.", "#ffe082") },
  ],
  "3evening": [
    { at: 0.3, fn: () => emit({ k: "card", title: "NIGHT 3 — WEDNESDAY", lines: ["Aunt May gets home in the morning. One more night.", "Uncle Ray left planks in the hall closet.", "He's already out there. Board up the windows. Lock the doors."], t: 8 }) },
    { at: 20, fn: textMsg("tonight.") },
    { at: 75, fn: (S) => { if (S.power) { S.power = false; emit({ k: "powerout" }); say("The power just went out. And it's not even midnight.", "#ff5252", true)(); } } },
    { at: 110, fn: textMsg("i'm right outside your kitchen") },
  ],
  "3night": [
    { at: 0.5, fn: (S) => {
      const open = S.entries.map((e, i) => i).filter((i) => ENTRIES[i].kind === "window" && S.entries[i].boards === 0);
      if (open.length) { const i = pick(open); S.entries[i].broken = true; const E = ENTRIES[i]; emit({ k: "glass", x: E.x + 0.5, y: E.y + 0.5 }); S.nextTarget = i; }
      else knockAt(S, BACK_DOOR, true);
      emit({ k: "stinger" });
      emit({ k: "card", title: "1:58 AM", lines: [open.length ? "Glass breaking." : "BANG. BANG. BANG.", "He's done waiting."], t: 5 });
    } },
  ],
};

function runDirector(S) {
  const beats = STORY[S.night + S.stage];
  if (!beats) return;
  beats.forEach((b, i) => {
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

// ----------------------------- the stalker ----------------------------------
const passOut = (tx, ty) => { const c = tileAt(tx, ty); return c === "," || c === "y" || c === "G"; };
const passIn = (allowEntry) => (tx, ty) => { const c = tileAt(tx, ty); return c === "." || c === "a" || c === "d" || (allowEntry != null && ENTRY_AT[tx + "," + ty] === allowEntry); };
const stalkerSolidFn = (S) => (tx, ty) => { const c = tileAt(tx, ty); return !(c === "." || c === "a" || (c === "d" && S.idoors[IDOOR_AT[tx + "," + ty]].open)); };

function goTo(st, gx, gy, pass) {
  const p = bfs(Math.floor(st.x), Math.floor(st.y), Math.floor(gx), Math.floor(gy), pass);
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
        st.pause = 0.8;
      }
    }
  }
  if (st.pause > 0) { st.pause -= dt; return false; }
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
  const w = S.entries.map((e, i) => {
    let v = e.broken || e.open ? 4 : 1 / (1 + e.boards * 1.6);
    if (ENTRIES[i].kind === "door" && !e.locked && !e.boards) v *= 2.5;
    if (i === st.last) v *= 0.3;
    return v;
  });
  let sum = w.reduce((a, b) => a + b, 0), r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}

function nightProgress(S) {
  if (S.stage !== "night") return 0;
  const cfg = NIGHTS[S.night];
  return clamp((S.mins - cfg.wake) / (NIGHT_END - cfg.wake), 0, 1);
}

function wanderDelay(S) { return Math.max(2, 9 - S.aggr * 1.6 - nightProgress(S) * 2 - (S.n - 1) * 0.5) + rand(0, 3); }

function wanderOutside(S) {
  const st = S.stalker;
  for (let tries = 0; tries < 30; tries++) {
    const tx = Math.floor(rand(0, MAP_W)), ty = Math.floor(rand(0, MAP_H));
    if (tileAt(tx, ty) === "," && Math.hypot(tx - st.x, ty - st.y) < 14) { goTo(st, tx + 0.5, ty + 0.5, passOut); return; }
  }
}

function stalkerDecide(S) {
  const st = S.stalker, r = Math.random(), A = S.aggr;
  if (A <= 0) { goAway(S); return; }
  const windows = ENTRIES.map((E, i) => i).filter((i) => ENTRIES[i].kind === "window" && !S.entries[i].broken);
  if (A >= 2 && S.power && S.powerCD <= 0 && r < 0.2) {
    st.next = "cut";
    goTo(st, BREAKER.x - 0.5, BREAKER.y + 0.5, passOut);
  } else if (S.nextTarget < 0 && windows.length && r < [0, 0.5, 0.3, 0.15][A]) {
    st.target = pick(windows); st.next = "peek";
    goTo(st, ENTRIES[st.target].ox, ENTRIES[st.target].oy, passOut);
  } else if (A === 1) {
    st.target = pick([FRONT_DOOR, BACK_DOOR, pick(windows.length ? windows : [FRONT_DOOR])]);
    st.next = "knock";
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
  const st = S.stalker, E = ENTRIES[i], e = S.entries[i];
  if (e.broken || e.open) { enterInside(S, i); return; }
  // an unlocked door: he just opens it
  if (E.kind === "door" && !e.locked && !e.boards) {
    e.open = true;
    emit({ k: "creak", x: E.x + 0.5, y: E.y + 0.5, heavy: true, slow: true });
    emit({ k: "msg", text: "The " + E.name.toLowerCase() + " wasn't locked. He's coming in!", c: "#ff1744", big: true });
    emit({ k: "stinger" });
    enterInside(S, i);
    return;
  }
  const factor = S.aggr >= 3 ? 1 : 0.55;
  const dmg = (11 + nightProgress(S) * 8) * factor * (S.power ? 1 : 1.3) * (0.75 + 0.12 * S.n) * rand(0.8, 1.2);
  e.hit = 1;
  emit({ k: "bang", x: E.x + 0.5, y: E.y + 0.5 });
  if (e.boards > 0) {
    e.bhp -= dmg;
    if (e.bhp <= 0) {
      e.boards--; e.bhp = 100;
      emit({ k: "wood", x: E.x + 0.5, y: E.y + 0.5 });
      emit({ k: "msg", text: "A board on the " + E.name.toLowerCase() + " just snapped!", c: "#ffab40" });
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
  if (S.aggr < 2) return; // night 1: he never comes in
  st.mode = "in"; st.state = "hunt"; st.timer = (S.n === 1 ? 13 : 17) + S.night * 3;
  st.x = E.ix; st.y = E.iy; st.path = []; st.lastSeen = null; st.repath = 0; st.pause = 0;
}

function startLeave(S) {
  const st = S.stalker;
  let best = 0, bs = 1e9;
  ENTRIES.forEach((E, i) => {
    const e = S.entries[i];
    const s = Math.hypot(E.x + 0.5 - st.x, E.y + 0.5 - st.y) + (e.broken || e.open ? 0 : 6);
    if (s < bs) { bs = s; best = i; }
  });
  st.state = "leave"; st.target = best;
  if (!goTo(st, ENTRIES[best].x + 0.5, ENTRIES[best].y + 0.5, passIn(best))) exitHouse(S);
}

function exitHouse(S) {
  const st = S.stalker, i = st.target, E = ENTRIES[i], e = S.entries[i];
  if (!e.broken && !e.open) {
    if (E.kind === "door" && !e.boards) { e.open = true; e.locked = false; emit({ k: "creak", x: E.x + 0.5, y: E.y + 0.5, heavy: true }); }
    else { e.broken = true; e.boards = 0; e.lock = 0; emit({ k: E.kind === "window" ? "glass" : "doorbreak", x: E.x + 0.5, y: E.y + 0.5 }); }
  }
  st.mode = "out"; st.state = "wander"; st.timer = wanderDelay(S) + 5;
  st.x = E.x + E.dx + 0.5; st.y = E.y + E.dy + 0.5; st.path = []; st.last = i;
  emit({ k: "msg", text: "He went back outside through the " + E.name.toLowerCase() + "... close it up!", c: "#ffab40" });
  wanderOutside(S);
}

function catchPlayer(S, p) {
  p.down = true; p.hidden = false; p.act = null; p.snap++;
  if (p.carry) dropItem(S, p);
  emit({ k: "caught", id: p.id, name: p.name, x: p.x, y: p.y });
  if (S.stalker.mode === "in" && Object.values(S.players).some((q) => !q.down)) startLeave(S);
}

function updateStalker(S, dt) {
  const st = S.stalker;
  st.stun = st.state !== "away" && litByAny(S, st.x, st.y);
  if (st.mode === "out") {
    const spd = 2.2 + S.aggr * 0.2 + nightProgress(S) * 0.4;
    // anyone out in the yard at night is fair game
    if (S.aggr >= 1 && st.state !== "away" && st.state !== "watch") {
      for (const p of Object.values(S.players)) {
        if (!p.down && inYard(p.x, p.y) && Math.hypot(p.x - st.x, p.y - st.y) < 0.75) { catchPlayer(S, p); break; }
      }
    }
    switch (st.state) {
      case "away": break;
      case "watch": {
        st.timer -= dt;
        const seen = anyPlayer(S, (p) => !p.hidden && Math.hypot(p.x - st.x, p.y - st.y) < 24 &&
          Math.abs(angDiff(Math.atan2(st.y - p.y, st.x - p.x), p.a)) < 0.45 && los(S, p.x, p.y, st.x, st.y));
        if (seen) st.seenT += dt;
        if (st.seenT > 0.9) { emit({ k: "stinger", soft: true }); if (st.msg) emit({ k: "msg", text: st.msg, c: "#ff8a80" }); goAway(S); }
        else if (st.timer <= 0) goAway(S);
        if (st.state === "away" && S.aggr > 0) { st.state = "wander"; st.x = 1.5; st.y = 30.5; st.timer = 10; }
        break;
      }
      case "wander":
        st.timer -= dt;
        followPath(S, st, spd * 0.6, dt);
        if (st.timer <= 0) stalkerDecide(S);
        break;
      case "goto":
        if (followPath(S, st, spd, dt)) {
          st.state = st.next; st.expose = 0;
          const E = ENTRIES[st.target];
          if (st.state === "attack") {
            st.timer = 6 + S.aggr * 1.5 + nightProgress(S) * 4 + rand(0, 3); st.bangT = 0.6;
            emit({ k: "msg", text: "Something is pounding on the " + E.name.toLowerCase() + "!", c: "#ffab40" });
          } else if (st.state === "peek") {
            st.timer = rand(3, 6);
            emit({ k: Math.random() < 0.5 ? "tap" : "scratch", x: E.x + 0.5, y: E.y + 0.5 });
          } else if (st.state === "knock") {
            st.timer = 3.5;
            const e = S.entries[st.target];
            if (E.kind === "door") {
              emit({ k: "knock", x: E.x + 0.5, y: E.y + 0.5 });
              emit({ k: "rattle", x: E.x + 0.5, y: E.y + 0.5 });
              if (!e.locked && !e.open && !e.boards) {
                e.open = true;
                emit({ k: "creak", x: E.x + 0.5, y: E.y + 0.5, heavy: true, slow: true });
                emit({ k: "msg", text: "The " + E.name.toLowerCase() + " just creaked open...", c: "#ff8a80" });
              }
            } else emit({ k: "tap", x: E.x + 0.5, y: E.y + 0.5 });
          } else st.timer = 2;
        }
        break;
      case "attack":
      case "peek":
      case "knock": {
        const E = ENTRIES[st.target];
        st.a = Math.atan2(E.y + 0.5 - st.y, E.x + 0.5 - st.x);
        // a flashlight in his face through a window scares him off
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
            st.bangT = Math.max(0.75, 1.35 - nightProgress(S) * 0.4) * rand(0.8, 1.2);
            doBang(S, st.target);
            if (st.mode === "in") break;
          }
        }
        st.timer -= dt;
        if (st.timer <= 0) { st.last = st.target; st.state = "wander"; st.timer = wanderDelay(S); wanderOutside(S); }
        break;
      }
      case "cut":
        st.a = Math.PI;
        st.timer -= dt;
        if (st.timer <= 0) {
          if (S.power) {
            S.power = false;
            emit({ k: "powerout" });
            emit({ k: "msg", text: "THE POWER WENT OUT. Fix the fuse box at the end of the hall!", c: "#ff5252", big: true });
          }
          st.state = "wander"; st.timer = wanderDelay(S); wanderOutside(S);
        }
        break;
    }
    return;
  }

  // ---- inside the house ----
  const spd = (st.stun ? 0.4 : 1) * (2.7 + S.night * 0.15);
  if (st.state === "leave") {
    if (followPath(S, st, spd, dt)) exitHouse(S);
    return;
  }
  st.timer -= dt;
  let tgt = null, bd = 1e9, seeDirect = false;
  for (const p of Object.values(S.players)) {
    if (p.down) continue;
    let px = p.x, py = p.y;
    if (p.hidden) { if (!p.seenHide) continue; px = p.hideX; py = p.hideY; }
    const d = Math.hypot(px - st.x, py - st.y);
    const range = roomLit(S, px, py) || flashOn(p) ? 12 : 5;
    const vis = !p.hidden && (d < 1.6 || (d < range && los(S, st.x, st.y, px, py)));
    if ((p.hidden || vis) && d < bd) { bd = d; tgt = { p, px, py }; seeDirect = vis; }
  }
  if (tgt) {
    st.lastSeen = { x: tgt.px, y: tgt.py };
    st.timer = Math.max(st.timer, 3);
    if (bd < (tgt.p.hidden ? 1.15 : 0.65)) { catchPlayer(S, tgt.p); return; }
    if (seeDirect && bd < 2.2) {
      const dx = tgt.px - st.x, dy = tgt.py - st.y;
      st.a = Math.atan2(dy, dx);
      moveCircle(st, dx / bd * spd * dt, dy / bd * spd * dt, 0.3, stalkerSolidFn(S));
      st.path = [];
    } else {
      st.repath -= dt;
      if (st.repath <= 0 || !st.path.length) { st.repath = 0.4; goTo(st, tgt.px, tgt.py, passIn(null)); }
      followPath(S, st, spd, dt);
    }
  } else {
    if (!st.path.length) {
      if (st.lastSeen) { goTo(st, st.lastSeen.x, st.lastSeen.y, passIn(null)); st.lastSeen = null; }
      else { const f = pick(FLOORS); goTo(st, f.x + 0.5, f.y + 0.5, passIn(null)); }
    }
    followPath(S, st, spd * 0.75, dt);
  }
  if (st.timer <= 0) startLeave(S);
}

// --------------------------- creepy little things ---------------------------
const TEXTS = [
  "i can see you",
  "why'd you turn the lights on? i like the dark",
  "don't bother calling anyone. nobody's coming.",
  "how many of you are in there? i counted {n}.",
  "the {e} looks weak",
  "it's cold out here. let me in.",
  "check the closets",
  "i've been inside before. while you were sleeping.",
  "that flashlight won't last all night",
  "sweet dreams :)",
  "look outside",
];
function updateEvents(S, dt) {
  if (S.aggr <= 0 || S.stage === "sleep" || S.stage === "morning") return;
  S.nextEvent -= dt;
  if (S.nextEvent > 0) return;
  S.nextEvent = rand(12, 26) - S.aggr * 2;
  const alive = Object.values(S.players).filter((p) => !p.down);
  const who = alive.length ? pick(alive).id : null;
  const winE = ENTRIES.filter((E) => E.kind === "window");
  const ev = pick(["text", "text", "whisper", "steps", "scratch", "dog", "phantom", "flicker", "tv", "phone"]);
  switch (ev) {
    case "scratch": { const E = pick(winE); emit({ k: "scratch", x: E.x + 0.5, y: E.y + 0.5 }); break; }
    case "phone": ring(S, null); break;
    case "tv": if (!S.tv && S.power) { S.tv = true; emit({ k: "click", x: 10, y: 15.5 }); emit({ k: "msg", text: "The TV turned on by itself.", c: "#b0bec5" }); } break;
    case "flicker": if (S.power) { S.flick = 1.8; emit({ k: "flicker" }); } break;
    case "text": emit({ k: "text", to: who, text: pick(TEXTS).replace("{n}", S.n).replace("{e}", pick(ENTRIES).name.toLowerCase()) }); break;
    case "whisper": emit({ k: "whisper", to: who }); break;
    case "steps": emit({ k: "steps", x: rand(8, 22), y: rand(7, 20) }); break;
    case "dog": emit({ k: "dog" }); break;
    case "phantom": emit({ k: "phantom", to: who }); break;
  }
}
