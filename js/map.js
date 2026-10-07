// ---------------------------------------------------------------------------
// The apartment. Each character is one tile.
//   ,  outside (yard / street)        .  floor
//   #  wall                           W  window (entry)
//   D  front door (entry)             B  back door (entry)
//   P  plank pile                     F  fuse box
//   A  battery drawer                 C  closet (hide spot)
//   b  bed (hide spot)                h  phone
//   v  TV        s sofa    T table    k counter / sink
//   t  bathtub   r fridge  X  outside power breaker
// ---------------------------------------------------------------------------
const TILE = 32;
const MAP_W = 36;
const MAP_H = 26;

const INNER_ROWS = [
  "###W########W#######W#######",
  "#bb.....C#tt...#........bb.#",
  "#bb......#.....#........bb.#",
  "#........#.....#...........W",
  "#........#.....#...........#",
  "#........#....k#...........#",
  "#........#.....#C..........#",
  "#####.######.####F####.#####",
  "#C........................P#",
  "#..........................#",
  "######.###########..########",
  "#kkkkkkrA..#h..........vv..#",
  "#..........#...............#",
  "#...TT......P..............#",
  "B...TT.....#...ssss........W",
  "#..........#...............#",
  "#..........#...............#",
  "##############W#####D#######",
];

const MAP = [];
for (let y = 0; y < MAP_H; y++) {
  let row;
  if (y >= 4 && y < 4 + INNER_ROWS.length) row = ",,,," + INNER_ROWS[y - 4] + ",,,,";
  else row = ",".repeat(MAP_W);
  MAP.push(row.split(""));
}
const BREAKER = { x: 32, y: 13 };
MAP[BREAKER.y][BREAKER.x] = "X";

// Inside walls bounding box (inclusive)
const HOUSE = { x0: 4, y0: 4, x1: 31, y1: 21 };

function tileAt(x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return "#";
  return MAP[y][x];
}

const ROOMS = [
  { name: "Bedroom", x0: 5, y0: 5, x1: 12, y1: 10, floor: "wood" },
  { name: "Bathroom", x0: 14, y0: 5, x1: 18, y1: 10, floor: "tile" },
  { name: "Guest Room", x0: 20, y0: 5, x1: 30, y1: 10, floor: "wood2" },
  { name: "Hallway", x0: 5, y0: 12, x1: 30, y1: 13, floor: "carpet" },
  { name: "Kitchen", x0: 5, y0: 15, x1: 14, y1: 20, floor: "tile2" },
  { name: "Living Room", x0: 16, y0: 15, x1: 30, y1: 20, floor: "wood" },
];
function roomAt(x, y) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  return null;
}

const ENTRY_NAMES = {
  "7,4": "Bedroom Window",
  "16,4": "Bathroom Window",
  "24,4": "Guest Room Window",
  "31,7": "Guest Room Side Window",
  "4,18": "Back Door",
  "31,18": "Living Room Side Window",
  "18,21": "Living Room Window",
  "24,21": "Front Door",
};

// Entries (windows & doors): the things the stalker attacks and you board up.
const ENTRIES = [];
const ENTRY_AT = {};
const PILES = [];
const PILE_AT = {};
const FLOORS = [];
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const c = MAP[y][x];
    if (c === ".") FLOORS.push({ x, y });
    if (c === "P") { PILE_AT[x + "," + y] = PILES.length; PILES.push({ x, y }); }
    if (c === "W" || c === "D" || c === "B") {
      let dx = 0, dy = 0;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (tileAt(x + ax, y + ay) === ",") { dx = ax; dy = ay; }
      }
      ENTRY_AT[x + "," + y] = ENTRIES.length;
      ENTRIES.push({
        x, y, dx, dy,
        kind: c === "W" ? "window" : "door",
        name: ENTRY_NAMES[x + "," + y] || (c === "W" ? "Window" : "Door"),
        // where the stalker stands outside, and where he lands inside
        ox: x + dx + 0.5 - dx * 0.25, oy: y + dy + 0.5 - dy * 0.25,
        ix: x - dx + 0.5, iy: y - dy + 0.5,
      });
    }
  }
}

const STREETLIGHTS = [{ x: 8, y: 22.6 }, { x: 28, y: 22.6 }, { x: 34.2, y: 2 }];
