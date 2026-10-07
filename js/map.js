// ---------------------------------------------------------------------------
// 14 Alder Lane: a one-floor house. Each character is one tile (1 metre).
//
//  Inside:  .  floor        a  archway       d  room door (opens/closes)
//           #  wall         W  window        D  front door    B  back door
//           b  bed          n  nightstand    C  closet        u  bathtub
//           z  bathroom sink                 o  toilet        e  desk
//           l  laundry basket                L  hall closet (bulbs, planks)
//           F  fuse box     v  TV            c  coffee table  s  sofa
//           g  kitchen trash can             A  drawer (batteries)
//           S  kitchen sink k  counter       O  stove         M  microwave
//           r  fridge       T  dining table  h  phone
//  Outside: ,  ground       y  back yard (players may walk here)
//           f  fence        G  gate          Z  trash bin     X  power breaker
// ---------------------------------------------------------------------------
const TILE = 32;
const MAP_W = 31;
const MAP_H = 32;
const OX = 7, OY = 6; // where the house sits in the map

const HOUSE_ROWS = [
  "###W#####W###W###",
  "#bb.nC#uu.#C..bb#",
  "#bb...#...#...bb#",
  "#.....#z.o#e....#",
  "#.....#...#....l#",
  "###d####d####d###",
  "#..............L#",
  "#...............F",
  "####aa###########",
  "#.vv.....gASkOMr#",
  "#...............W",
  "#.cc........TT..#",
  "#sss........TT..B",
  "W...............#",
  "#.......h.......#",
  "###W###D####W####",
];

const MAP = [];
for (let y = 0; y < MAP_H; y++) {
  const row = [];
  for (let x = 0; x < MAP_W; x++) {
    const hx = x - OX, hy = y - OY;
    if (hy >= 0 && hy < HOUSE_ROWS.length && hx >= 0 && hx < HOUSE_ROWS[0].length) row.push(HOUSE_ROWS[hy][hx]);
    else row.push(",");
  }
  MAP.push(row);
}
// fenced back yard behind the kitchen door, with the trash bin and a gate
for (let y = 14; y <= 21; y++) for (let x = 24; x <= 28; x++) MAP[y][x] = "y";
for (let x = 24; x <= 29; x++) { MAP[13][x] = "f"; MAP[22][x] = "f"; }
for (let y = 13; y <= 22; y++) MAP[y][29] = "f";
MAP[18][29] = "G";
MAP[15][27] = "Z";
const BREAKER = { x: 6, y: 12 };
MAP[BREAKER.y][BREAKER.x] = "X";

const HOUSE = { x0: OX, y0: OY, x1: OX + HOUSE_ROWS[0].length - 1, y1: OY + HOUSE_ROWS.length - 1 };

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "#";
  return MAP[y][x];
}

// Rooms: floors, wallpaper, lights and switches
const ROOMS = [
  { id: "bed1", name: "Your Bedroom", x0: 8, y0: 7, x1: 12, y1: 10, floor: "carpetBlue", wall: "wpBlue", lights: [[10.5, 9]] },
  { id: "bath", name: "Bathroom", x0: 14, y0: 7, x1: 16, y1: 10, floor: "tile", wall: "wpTile", lights: [[15.5, 9]] },
  { id: "bed2", name: "Guest Room", x0: 18, y0: 7, x1: 22, y1: 10, floor: "wood2", wall: "wpGreen", lights: [[20.5, 9]] },
  { id: "hall", name: "Hallway", x0: 8, y0: 12, x1: 22, y1: 14, floor: "wood", wall: "wpDamask", lights: [[11, 13], [19, 13]] },
  { id: "living", name: "Living Room", x0: 8, y0: 15, x1: 15, y1: 20, floor: "wood", wall: "wpWarm", lights: [[11.5, 17.5]] },
  { id: "kitchen", name: "Kitchen", x0: 16, y0: 15, x1: 22, y1: 20, floor: "tile2", wall: "wpYellow", lights: [[19.5, 17.5]] },
];
const ROOM_BY_ID = {};
ROOMS.forEach((r) => (ROOM_BY_ID[r.id] = r));
function roomAt(x, y) {
  // doorways count as the hallway
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}

// Light switches: the plate sits on a wall face; (px, py) is where you stand.
// nx/ny point out of the wall into the room.
const SWITCHES = [
  { room: "bed1", x: 11.4, y: 11, nx: 0, ny: -1 },
  { room: "bath", x: 16.4, y: 11, nx: 0, ny: -1 },
  { room: "bed2", x: 19.4, y: 11, nx: 0, ny: -1 },
  { room: "hall", x: 13.4, y: 14, nx: 0, ny: -1 },
  { room: "living", x: 13.4, y: 15, nx: 0, ny: 1 },
  { room: "living", x: 15.4, y: 21, nx: 0, ny: -1 },
  { room: "kitchen", x: 23, y: 19.4, nx: -1, ny: 0 },
];
SWITCHES.forEach((s) => { s.px = s.x + s.nx * 0.45; s.py = s.y + s.ny * 0.45; });

const ENTRY_NAMES = {
  "10,6": "Bedroom Window",
  "16,6": "Bathroom Window",
  "20,6": "Guest Room Window",
  "23,16": "Kitchen Side Window",
  "7,19": "Living Room Side Window",
  "10,21": "Living Room Window",
  "19,21": "Kitchen Window",
  "14,21": "Front Door",
  "23,18": "Back Door",
};

// Entries: windows and the two outside doors (what the stalker attacks)
const ENTRIES = [];
const ENTRY_AT = {};
// Room doors inside the house
const IDOORS = [];
const IDOOR_AT = {};
const FLOORS = [];
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = MAP[y][x];
    if (c === "." || c === "a") FLOORS.push({ x, y });
    if (c === "d") {
      IDOOR_AT[x + "," + y] = IDOORS.length;
      const room = roomAt(x, y - 1);
      IDOORS.push({ x, y, name: (room ? room.name : "Room") + " door" });
    }
    if (c === "W" || c === "D" || c === "B") {
      let dx = 0, dy = 0;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = tileAt(x + ax, y + ay);
        if (n === "," || n === "y") { dx = ax; dy = ay; }
      }
      ENTRY_AT[x + "," + y] = ENTRIES.length;
      ENTRIES.push({
        x, y, dx, dy,
        kind: c === "W" ? "window" : "door",
        name: ENTRY_NAMES[x + "," + y] || (c === "W" ? "Window" : "Door"),
        ox: x + dx + 0.5 - dx * 0.25, oy: y + dy + 0.5 - dy * 0.25,
        ix: x - dx + 0.5, iy: y - dy + 0.5,
      });
    }
  }
}
const FRONT_DOOR = ENTRY_AT["14,21"], BACK_DOOR = ENTRY_AT["23,18"];

// Where everyone wakes up when something wakes the house at night
const WAKE_SPOTS = [[10.5, 8.5], [20.5, 8.5], [12.5, 9.5], [19.5, 9.5], [11.5, 12.5], [19.5, 12.5]];
const EVENING_SPOTS = [[11.5, 17.5], [12.5, 17.5], [13.5, 16.5], [10.5, 16.5], [12.5, 19.5], [13.5, 19.5]];

const STREETLIGHTS = [{ x: 10, y: 25.6 }, { x: 26, y: 25.6 }];
const PORCH_LIGHT = { x: 14.5, y: 21.9 };
const YARD_LIGHT = { x: 23.9, y: 17.2 };
