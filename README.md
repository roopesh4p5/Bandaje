# BANDAJE FALLS TREK — Joint Travellers auto-playing reel

A vertical 9:16 game-style 3D reel of the Joint Travellers trek from **Kelagur Tea Estate** to **Bandaje Falls** (Durgadahalli, Mudigere taluk, Chikkamagaluru). It plays entirely by itself and loops:

0. **Joint Travellers logo**: shown for 1 second at the start of every play.
1. **Chapter 1: the stay and the tea estate.** The reel opens on the stay with everyone in the jeep. The jeep pulls out with both jeep selfies on screen (`assets/web/jeepselfieup.jpg` and `jeepselfiedown.jpg`). Everyone gets down at Kelagur tea estate to explore it: the tea estate photo (`assets/web/teastate.jpg`), the flora/fauna cards and the tea estate memories. Then the reel cuts back to the stay.
2. **Chapter 2: games at the ground.** On the ground beside the stay, the group plays cricket (the clip `assets/web/cricket.mp4`, seconds 5–9 of `5-9seccricket.MOV`) and then a round of lagori. Then night falls: everyone sits on camping chairs around a campfire beside the stay, and the shot tilts up from the group to the stars and the Milky Way.
3. **Chapter 3: to the trekking point.** Everyone gets back in the jeep and rides to the checkpoint, then gets down and treks through the forest, across the stream and over the ridge to Bandaje falls.

Place names come from public travel write-ups of the area. The 3D route, coordinates and elevations are stylised, not a GPS track.

## Run it
Serve the folder (ES modules need a web server):

```
cd bandaje_expedition
python3 -m http.server 8000
```
Open http://localhost:8000. Internet is needed on first load (Three.js and fonts come from a CDN).

To record it, open the page in Chrome at a 9:16 size and screen-record. Hidden keys: **Space** pauses, **R** restarts.

## Your photos and videos
Drop files into `photos and video/flora founa/` (flora/fauna, 2–3 at a time) and `photos and video/memories/` (one at a time, large, with a zoom-in). Reload to pick them up.

**Where each photo appears** is set in `captions.json`: a caption, `FLORA`/`FAUNA`, a `stage` and an `order`.

| stage | memories appear… | flora/fauna appear… |
|---|---|---|
| `home` | at the homestay opening | – |
| `drive` | at a photo stop on the jeep road | – |
| `tea` | at the tea estate after everyone gets down | at the tea estate stops |
| `camp` | at the night campfire beside the stay | – |
| `trek` | at viewpoint stops along the trek, taking turns with flora/fauna | at the forest stops |
| `falls` | at the waterfall finale | – |

Files not listed in `captions.json` are placed from words in their names, for example `sunrise`, `jeep`, `tea`, `campfire`/`bonfire`/`night`/`stars`, `viewpoint`/`trek`, `waterfall`/`final`. Videos (mp4/webm/mov) play muted for up to 8 s. If your host doesn't show folder listings, run `python3 make_media_list.py`.

## Music
The soundtrack is an original Bollywood-style travel song generated live in the browser, so there's no copyright problem on Instagram:
* **Instruments:** a sitar hook, a dholak keherwa groove, ghungroo, harmonium, a tanpura drone, bass and bansuri flute.
* **Arrangement:** a calm tanpura and flute intro at the homestay, then the hook alternates with flute verses on the road and trail, with claps and flute doubling at the peaks and the falls.
* **Nature sounds:** birds, cicadas and wind, the jeep engine during the ride, and stream and waterfall sound that gets louder as you get closer.

To use your own track instead, save it as `music/theme.mp3`.

Browsers only allow sound after a click. A "click anywhere for sound" hint appears until you click once. For hands-free recording with sound, launch Chrome with `--autoplay-policy=no-user-gesture-required`. **M** mutes.

## Download the video
Click **⬇ DOWNLOAD VIDEO** (bottom-right, outside the frame) in Chrome or Edge:
1. Chrome asks what to share. Pick **this tab** and click Share.
2. The reel restarts from the logo card and records one full play: the 3D scene, holograms, HUD and soundtrack. Keep the tab visible and don't switch away.
3. When it reaches the end card, the file downloads: `Bandaje-Falls-Trek-Joint-Travellers.mp4`. Older Chrome versions save `.webm` instead, which you can convert with any converter or CapCut.

The video's resolution is the frame's size on your screen. On a Retina Mac, a browser window tall enough for the frame gives about 1080×1920.

## Tuning
The `CONFIG` block at the top of `app.js` sets the speeds, hold durations, number of people and the trek distance shown. For a shorter reel, raise `walkSpeed` or lower `speciesHold` and `memoryHold`. Add `?q=low` to the URL on slower machines.

## Files
* `app.js` – story timeline, camera director, HUD, truck and crew animation
* `js/world.js` – terrain (two mountains, winding route), river, waterfall, homestay, forest placement, sky
* `js/plants.js`, `js/textures.js` – procedural trees, palms, bamboo, ferns, grass, tea hedges, rocks and their textures
* `js/characters.js`, `js/truck.js` – cel-shaded trekkers and the pickup
* `js/media.js` – finds your media and renders the holograms

The route, distance and elevation readouts are stylised. They are not a GPS track.
