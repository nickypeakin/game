// ---------------------------------------------------------------------------
// Apartment 302, laid out like Room 302 from Silent Hill 4: The Room.
// The chained front door opens into one open room: kitchen on the left,
// living room beyond it, a small laundry room right by the door. A hallway
// leads back to the bedroom and the bathroom (the one with the hole in the
// wall). The bedroom and living room each have two windows on the west wall.
// Each character is one tile (1 metre).
//
//  Inside:  .  floor        a  archway       d  room door (opens/closes)
//           #  wall         W  window        D  front door
//           b  bed          n  nightstand    C  closet        e  desk
//           u  bathtub      z  bathroom sink o  toilet
//           w  washer/dryer L  supply shelf (bulbs, planks)   F  fuse box
//           v  TV           H  old chest     c  coffee table  s  red love seat
//           h  phone (landline)
//           g  trash can    A  drawer (batteries)   S  kitchen sink
//           O  stove        M  microwave     r  fridge        T  dining table
//  Outside: ,  ground       y  courtyard (players may walk here)
//           f  fence        G  gate          Z  dumpster      X  power breaker
// ---------------------------------------------------------------------------
const TILE = 32;
const MAP_W = 30;
const MAP_H = 32;
const OX = 7, OY = 6; // where the apartment sits in the map

const HOUSE_ROWS = [
  "###########,,,,",
  "#e..nbb#..#,,,,",
  "W....bb#..#,,,,",
  "#......d..#,,,,",
  "W......#..#####",
  "#.....C#..#ww.#",
  "########..#...W",
  "#uu..z.#..#...F",
  "#......d..#...#",
  "#o.....#..#..L#",
  "########aa##d##",
  "#.vvH.h.......#",
  "W........TT...D",
  "#.cc.....TT...#",
  "W.ss..........#",
  "#......g.ASOMr#",
  "########W######",
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
// a small fenced courtyard outside the front door, with the dumpster and a gate
for (let y = 14; y <= 21; y++) for (let x = 22; x <= 26; x++) MAP[y][x] = "y";
for (let x = 22; x <= 27; x++) { MAP[13][x] = "f"; MAP[22][x] = "f"; }
for (let y = 13; y <= 22; y++) MAP[y][27] = "f";
MAP[19][27] = "G";
MAP[15][25] = "Z";
const BREAKER = { x: 6, y: 15 };
MAP[BREAKER.y][BREAKER.x] = "X";

const HOUSE = { x0: OX, y0: OY, x1: OX + HOUSE_ROWS[0].length - 1, y1: OY + HOUSE_ROWS.length - 1 };

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "#";
  return MAP[y][x];
}
// true for tiles inside the apartment (the corner notch outside it doesn't count)
function insideApt(x, y) {
  if (x < HOUSE.x0 || x > HOUSE.x1 || y < HOUSE.y0 || y > HOUSE.y1) return false;
  return tileAt(x, y) !== ",";
}

const L = (x, y) => [x + OX, y + OY]; // local -> map coordinates

// Rooms: floors, wallpaper, lights
const ROOMS = [
  { id: "bed1", name: "Bedroom", x0: 8, y0: 7, x1: 13, y1: 11, floor: "carpetBlue", wall: "wpBlue", lights: [[10.5, 9.5]] },
  { id: "bath", name: "Bathroom", x0: 8, y0: 13, x1: 13, y1: 15, floor: "tile", wall: "wpTile", lights: [[10.5, 14.5]] },
  { id: "hall", name: "Hallway", x0: 15, y0: 7, x1: 16, y1: 16, floor: "wood", wall: "wpDamask", lights: [[16, 11.5]] },
  { id: "laundry", name: "Laundry Room", x0: 18, y0: 11, x1: 20, y1: 15, floor: "tile", wall: "wpGreen", lights: [[19.5, 13.5]] },
  { id: "living", name: "Living Room", x0: 8, y0: 17, x1: 13, y1: 21, floor: "wood", wall: "wpWarm", lights: [[10.5, 19]] },
  { id: "kitchen", name: "Kitchen", x0: 14, y0: 17, x1: 20, y1: 21, floor: "tile2", wall: "wpYellow", lights: [[17.5, 19]] },
];
const ROOM_BY_ID = {};
ROOMS.forEach((r) => (ROOM_BY_ID[r.id] = r));
function roomAt(x, y) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}

// Light switches: the plate sits on a wall face; (px, py) is where you stand.
// nx/ny point out of the wall into the room.
const SWITCHES = [
  { room: "bed1", x: 14, y: 10.4, nx: -1, ny: 0 },
  { room: "bath", x: 14, y: 15.4, nx: -1, ny: 0 },
  { room: "hall", x: 17, y: 15.4, nx: -1, ny: 0 },
  { room: "laundry", x: 18.4, y: 16, nx: 0, ny: -1 },
  { room: "living", x: 14.4, y: 17, nx: 0, ny: 1 },
  { room: "kitchen", x: 21, y: 19.4, nx: -1, ny: 0 },
];
SWITCHES.forEach((s) => { s.px = s.x + s.nx * 0.45; s.py = s.y + s.ny * 0.45; });

const ENTRY_NAMES = {
  "7,8": "Bedroom Window",
  "7,10": "Bedroom Corner Window",
  "7,18": "Living Room Window",
  "7,20": "Living Room Corner Window",
  "15,22": "Kitchen Window",
  "21,12": "Laundry Room Window",
  "21,18": "Front Door",
};

// Entries: windows and the front door (what the stalker attacks)
const ENTRIES = [];
const ENTRY_AT = {};
// Room doors inside the apartment
const IDOORS = [];
const IDOOR_AT = {};
const FLOORS = [];
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = MAP[y][x];
    if (c === "." || c === "a") FLOORS.push({ x, y });
    if (c === "d") {
      // the room this door belongs to (not the hallway or the main room)
      let room = null, dir = [0, 0];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = roomAt(x + dx, y + dy);
        if (r && r.id !== "hall" && r.id !== "kitchen" && r.id !== "living") { room = r; dir = [dx, dy]; }
      }
      IDOOR_AT[x + "," + y] = IDOORS.length;
      IDOORS.push({ x, y, name: (room ? room.name : "Room") + " door", room: room && room.id, dir });
    }
    if (c === "W" || c === "D") {
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
const FRONT_DOOR = ENTRY_AT["21,18"];

// Fixed spots the game refers to
const SPOTS = {
  tv: { x: 10, y: 17.5 },
  phone: { x: 13.5, y: 17.5 },
  micro: { x: 19.5, y: 21.5 },
  fuse: { x: 21, y: 13 },
  closet: { x: 13, y: 11 },          // your bedroom closet (laundry goes here)
  hole: { x: 8.01, y: 14.4 },         // the hole in the bathroom wall
  porch: { x: 22.07, y: 17.1 },       // light by the front door
  yard: { x: 22.07, y: 15.2 },        // motion light over the courtyard
  watchFence: { x: 28.6, y: 17.5 },   // just past the courtyard fence
  watchStreet: { x: 10.5, y: 24.6 },  // under the streetlight, seen from the living room
  watchGate: { x: 28.4, y: 19.5 },
  center: { x: 14.5, y: 14.5 },
};

// Where everyone wakes up, and where the evening starts
const WAKE_SPOTS = [L(4, 2), L(3, 3), L(2, 4), L(8, 4), L(9, 6), L(5, 12)].map(([x, y]) => [x + 0.5, y + 0.5]);
const EVENING_SPOTS = [L(4, 12), L(5, 13), L(7, 12), L(7, 14), L(5, 14), L(11, 12)].map(([x, y]) => [x + 0.5, y + 0.5]);

const STREETLIGHTS = [{ x: 10, y: 25.6 }, { x: 24, y: 25.6 }];
