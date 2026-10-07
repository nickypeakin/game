# Until 6 AM

A co-op horror game for the browser (made for Chromebooks). You and up to 5 friends
are stuck in an apartment at night. Someone is outside. He pounds on the doors and
windows, cuts the power, calls the landline, and texts you from an unknown number.
Board everything up and survive until **6:00 AM**.

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
| WASD / Arrow keys | Move |
| Mouse / trackpad | Aim flashlight |
| Shift | Sprint |
| E / Space / Click (hold) | Interact: grab planks, board up, hide, fix power, answer phone, help a friend up |
| F | Flashlight on/off |

## How to survive

- **Planks** are in the hallway and the living room. Hold E at a door or window to nail
  one on (max 3 each). You can carry 2.
- **The minimap** (top right) shows every entrance: red = 0 boards, then orange, yellow,
  green = 3. If one flashes, it's being attacked or it's broken.
- **Flashlight trick**: shine your light in his face through a window and he backs off.
  This only works through windows with fewer than 2 boards, because boards block the light.
- **Power outages**: he'll cut the power from the breaker outside. Fix it at the fuse box
  in the hallway. He hits harder in the dark.
- **If he gets in**: run and hide in a closet or under a bed. If he sees you hide, he'll
  drag you out. A flashlight on him slows him down. He leaves after a while, but he leaves
  the entrance broken, so fix it.
- **Caught?** A friend can hold E next to you to help you up. If everyone is caught,
  it's over.
- **Answer the phone.** The caller might tell you where he's coming next.
- **Batteries** are in the kitchen drawer.

## Notes

- Multiplayer is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com/)). The host's
  browser runs the game, so the host should keep their tab open and in front.
- Some school networks block peer-to-peer connections. If joining never connects, try
  a different network (like a phone hotspot) or play Solo.
- Play with headphones. All sounds are generated in the browser.

## Files

- `index.html`, `style.css`: page and menus
- `js/map.js`: the apartment layout
- `js/sim.js`: game rules, the stalker's behavior and random events (runs on the host)
- `js/render.js`: graphics, lighting and HUD
- `js/audio.js`: sound effects
- `js/main.js`: menus, input, networking and the main loop
