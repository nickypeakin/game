# Curfew Control

A first-person 3D co-op horror game for the browser (made for Chromebooks).

It's 9:00 PM in Apartment 302, laid out like Room 302 from *Silent Hill 4: The Room*:
the locked front door opens into the kitchen and living room, a laundry room sits by the
door, a hallway leads back to the bedroom and the bathroom, and the back door goes out
to a fenced backyard. Something with a key to the back door comes in at night.

Do every chore on the clipboard. When they're done, a sticky note with the code to the
laundry room safe appears on it. The safe holds the front door key. Get out before
6:00 AM. And when curfew comes, be in bed with your eyes shut.

Play alone or with up to 5 friends.

## Play

Open `index.html` in Chrome. No install and no accounts needed. Pick your character
(female or male) and your name on the menu.

- **Host a Game**: you get a 4-letter room code. Friends open the same page, type
  the code and press **Join**. (Or send them the invite link from the lobby.)
- **Play Solo**: just you against the night. Works offline too.

### Putting it online (so friends can open it on their Chromebooks)

Use GitHub Pages: repo **Settings → Pages → Build and deployment → Deploy from a
branch**, pick the branch with the game (e.g. `main`) and folder `/ (root)`, then
save. After a minute the game is live at `https://<your-username>.github.io/<repo>/`.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse / trackpad | Look around (click the game first; Esc frees the mouse) |
| Arrow keys | Walk forward/back and turn |
| Shift | Sprint |
| E / Space / Click | Use what the dot is pointing at: doors, switches, the fridge, the safe, beds, closets... |
| Q | Second action (lock / unlock the back door) |
| G | Put back whatever you're carrying |
| F | Flashlight on/off (it's in your left hand) |
| R | Put new batteries in your flashlight (while holding batteries) |
| T | Check your watch: the time and the next curfew |
| C | Read the clipboard (it also comes up by itself when you pick it up) |
| 1 / 2 | Text him back |
| M | Map |

## How it works

- **Look right at things to use them.** A dot in the middle of the screen shows what
  you're aiming at.
- **One thing at a time.** You carry one item: the clipboard, the key, batteries, your
  dinner, the trash bag... Your flashlight is in your other hand. The flashlight runs on
  batteries; spare ones turn up around the apartment, and a gauge on the flashlight shows
  how much is left.
- **The chores** (on the clipboard, on the counter next to the kitchen sink): heat up a
  frozen dinner and eat it at the table, wash your plate, take the trash out the back
  door to the can in the backyard, get the clothes from the dryer into your closet,
  replace the dead bathroom bulb (spares on the laundry room shelf), brush your teeth,
  lock the back door.
- **The escape:** finish the chores and the sticky note shows the safe's code. Type it
  into the safe's keypad in the laundry room, take the key, unlock the front door, and
  walk out.
- **Your phone** comes out by itself when he texts you, and your flashlight goes away
  while it's out. Text back with 1 or 2. Ignore him and he comes looking for you.
- **Your watch** (T) replaces the on-screen clock.
- **Curfew** comes a few times a night. Every light goes out, and you have 20 seconds to
  get into bed (two fit) or onto the couch, under the blanket. Look up at the ceiling to
  shut your eyes. Eyes shut, he can't see you. Eyes open, he pulls you out. Out of bed
  with your flashlight on, and he shows up at the window next to you and comes through.
  You can only stay in bed 30 seconds at a time outside a curfew, then you have to wait
  45 seconds.
- **He always comes in through the back door** (he has a key) and hunts you. He can't go
  through walls, but he opens doors. He runs slower than you can sprint, but faster than
  you walk. Every hit slows you down for good, and he slows down to match. Run him around
  a table (or keep one between you) for too long and he screams, runs out the front
  door, and comes back in the back door faster. Closets are risky: if he sees you get
  in, he knows.
- **Three hits** and he drags you by the foot to the kitchen table, turns off the lights
  and sits down across from you with a revolver: one bullet, you go first (E pulls the
  trigger; wait too long and he makes you), then him, then you... If it goes off on your
  turn, you're out. If it goes off on his, it doesn't stop him: he carries you back to
  bed and the night starts over at 9:00 PM, with him faster than before.
- **Winning:** get out the front door. With friends, the game ends when everyone has
  either gotten out or lost the roulette. At 6:00 AM, anyone still inside loses.

## Notes

- Multiplayer is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com/)). The host's
  browser runs the game, so the host should keep their tab open and in front.
- Some school networks block peer-to-peer connections. When joining fails, the menu says
  which step failed: reaching the game server, finding the room, or connecting to the
  host's computer. Try a different network (like a phone hotspot) or play Solo.
- **Relay for strict networks:** networks like school Wi-Fi block direct connections
  between computers, so the game also relays through a free [Metered](https://www.metered.ca/)
  TURN server on ports 80 and 443. Its login is in `PEER_OPTS` at the top of `js/main.js`
  (the free plan allows 20 GB of relayed traffic a month).
- Play with headphones. All sounds are generated in the browser.
- The 3D graphics use [Three.js](https://threejs.org/). Three.js and PeerJS are copied into
  `lib/` so the game doesn't depend on outside code sites (school filters often block
  them). If the game runs slowly, it automatically lowers the resolution.

## Files

- `index.html`, `style.css`: page and menus
- `js/map.js`: the apartment layout (Room 302), rooms, light switches, hiding and battery spots
- `js/sim.js`: game rules: chores, the safe, curfew, texts, the monster (runs on the host)
- `js/world3d.js`: the 3D apartment and building, lighting, flashlights, the monster and players
- `js/hud.js`: the aiming dot and prompts, watch, clipboard, phone, keypad and messages
- `js/audio.js`: sound effects
- `js/main.js`: menus, input, networking and the main loop
- `lib/`: copies of Three.js r128 and PeerJS 1.5.4 (MIT licensed)
- `tools/build-single-file.js`: bundles everything into one HTML file (used for the
  solo version on claude.ai)
