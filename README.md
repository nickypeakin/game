# Until 6 AM

A first-person 3D co-op horror game for the browser (made for Chromebooks).

You're house-sitting for your aunt for three nights at 14 Alder Lane, a cosy one-floor
house: a living room open to the kitchen, and a hallway to your bedroom, the bathroom and
a guest room. Every evening you do the chores: heat up dinner, wash your plate, take the
trash out to the bin, brush your teeth, lock up. Then you go to bed and wake up in the
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
  the sink, the trash bag out the back door to the bin, clean laundry to your closet, a
  spare bulb from the hall closet to the bathroom light.
- **Doors and lights:** every room has a door you can open and close, and a light switch
  by the doorway. Lock the front and back doors before bed (Q).
- **At night** he walks around the house, knocks, looks in the windows, cuts the power
  and tries to get in. Shine your flashlight in his face through a window to scare him
  off. The fuse box is at the end of the hall. Planks for boarding up windows and doors
  are in the hall closet.
- **If he gets in,** hide in a closet or under a bed. If he sees you hide, he'll find
  you. Friends can help you up if you get caught. If everyone is caught, you can try
  that night again.

## Notes

- Multiplayer is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com/)). The host's
  browser runs the game, so the host should keep their tab open and in front.
- Some school networks block peer-to-peer connections. If joining never connects, try
  a different network (like a phone hotspot) or play Solo.
- Play with headphones. All sounds are generated in the browser.
- The 3D graphics use [Three.js](https://threejs.org/) (loaded from cdnjs). If the game
  runs slowly, it automatically lowers the resolution.

## Files

- `index.html`, `style.css`: page and menus
- `js/map.js`: the house layout, rooms, light switches
- `js/sim.js`: game rules, chores, the story for each night and the stalker (runs on the host)
- `js/world3d.js`: the 3D apartment, lighting, flashlights and characters
- `js/hud.js`: the on-screen clock, minimap, prompts and messages
- `js/audio.js`: sound effects
- `js/main.js`: menus, input, networking and the main loop
- `tools/build-single-file.js`: bundles everything into one HTML file (used for the
  solo version on claude.ai)
