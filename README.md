# Until 6 AM

A first-person 3D co-op horror game for the browser (made for Chromebooks).

You're apartment-sitting for your aunt for three nights in Apartment 302 at Briar Court.
The apartment is one floor, laid out like Room 302 from *Silent Hill 4: The Room*: the
chained front door opens into the kitchen and living room, a laundry room sits by the
door, and a hallway leads back to the bedroom and the bathroom (the one with the hole in
the wall). Every evening you do the chores: heat up dinner, wash your plate, take the
trash out to the dumpster, brush your teeth, lock up. Then you go to bed and wake up in the
middle of the night. Night 1 is just weird. Night 2 is scary. On Night 3 he wants in.
Play alone or with up to 5 friends.

## Play

Open `index.html` in Chrome. No install and no accounts needed.

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
| E / Space / Click (tap) | Use things: doors, light switches, fridge, microwave, sink, trash, beds, closets, fuse box... |
| Q | Lock / unlock the outside doors (and other second actions) |
| G | Put back whatever you're carrying |
| F | Flashlight on/off |

## How it works

- **Chores** are listed on the left. Many need you to carry something from one place to
  another: a frozen dinner to the microwave, your hot dinner to the table, your plate to
  the sink, the trash bag out the front door to the dumpster in the courtyard, clean clothes
  from the dryer to your closet, a spare bulb from the laundry room shelf to the bathroom light.
- **Doors and lights:** every room has a door or archway, and a light switch by the
  doorway. Lock the front door and put the chain on before bed (Q).
- **At night** he walks around the building, knocks, looks in the windows, cuts the power
  and tries to get in. Shine your flashlight in his face through a window to scare him
  off. The fuse box is in the laundry room. Planks for boarding up windows and doors
  are on the laundry room shelf.
- **If he gets in,** hide in a closet or under a bed. If he sees you hide, he'll find
  you. You can only stay under the bed for 30 seconds, then you have to wait 45 seconds
  before hiding there again. Friends can help you up if you get caught. If everyone is caught, you can try
  that night again.

## Notes

- Multiplayer is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com/)). The host's
  browser runs the game, so the host should keep their tab open and in front.
- Some school networks block peer-to-peer connections. When joining fails, the menu says
  which step failed: reaching the game server, finding the room, or connecting to the
  host's computer. Try a different network (like a phone hotspot) or play Solo.
- Play with headphones. All sounds are generated in the browser.
- The 3D graphics use [Three.js](https://threejs.org/). Three.js and PeerJS are copied into
  `lib/` so the game doesn't depend on outside code sites (school filters often block
  them). If the game runs slowly, it automatically lowers the resolution.

## Files

- `index.html`, `style.css`: page and menus
- `js/map.js`: the apartment layout (Room 302), rooms, light switches
- `js/sim.js`: game rules, chores, the story for each night and the stalker (runs on the host)
- `js/world3d.js`: the 3D apartment and building, lighting, flashlights and characters
- `js/hud.js`: the on-screen clock, minimap, prompts and messages
- `js/audio.js`: sound effects
- `js/main.js`: menus, input, networking and the main loop
- `lib/`: copies of Three.js r128 and PeerJS 1.5.4 (MIT licensed)
- `tools/build-single-file.js`: bundles everything into one HTML file (used for the
  solo version on claude.ai)
