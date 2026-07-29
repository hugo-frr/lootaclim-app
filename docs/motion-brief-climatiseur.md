# Brief Motion — vidéo de fond LOOTACLIM

Texte à passer tel quel dans le paramètre `prompt` de `create_video`.

Paramètres d'accompagnement :

- `aspect_ratio`: `16:9`
- `duration`: `10-30s`
- `design_system_id`: `apple`
- `attachments`: aucun

---

```
A single, continuous, unbroken 20-second shot of one modern portable air
conditioner unit, slowly rotating on its vertical axis. Product-film aesthetic,
in the style of an Apple product page.

THE MOST IMPORTANT REQUIREMENT — READ FIRST:
This video will be scrubbed frame by frame as the visitor scrolls a web page.
It must therefore be ONE SINGLE CONTINUOUS CAMERA TAKE from the first frame to
the last. Absolutely no cuts, no shot changes, no transitions, no dissolves, no
jump cuts, no montage, no title cards, no B-roll inserts. One camera, one
uninterrupted move. Any cut makes the video unusable.

THE OBJECT:
A generic, unbranded, modern portable air conditioner on castors — a tall
rounded white rectangular unit, roughly 45 cm wide and 75 cm high, with
horizontal louvred vents on the upper front, a slim dark control panel on top,
and a flexible exhaust hose leaving the back. Matte white lacquered body, soft
bevelled edges, subtle ice-blue accents. Clean industrial design, premium feel.

NO BRANDING OF ANY KIND: no logo, no brand name, no lettering, no badge, no
model number anywhere on the machine or in the frame.

THE MOTION, from first frame to last, in one continuous take:
- The unit rotates slowly and evenly through a full 360 degrees.
- As it turns, the louvres gradually open.
- Cool air becomes visible as soft, pale blue vapour streams flowing out of the
  vents and drifting upward — gentle and elegant, never smoky or dramatic.
- The camera drifts almost imperceptibly closer over the whole take.
- The last frame must closely match the first frame so the video can loop
  seamlessly.

LIGHTING AND BACKGROUND:
Bright, soft studio lighting. Seamless gradient background going from white at
the bottom to a pale icy blue at the top (#f6fbfd to #dff2fa). Soft contact
shadow beneath the unit. Cool, fresh, airy, calm.

STRICTLY EXCLUDED:
- No text, no captions, no subtitles, no numbers, no UI overlays.
- No people, no hands, no rooms, no furniture, no windows.
- No music cues or beat-driven editing.
- No fast movement, no whip pans, no shake.
- Nothing that would look wrong when played very slowly, backwards, or paused
  on any single frame.

Calm, slow, hypnotic, premium. One shot.
```

---

## Après réception

1. Télécharger la vidéo dans `public/videos/hero-clim-source.mp4`.
2. **Contrôler qu'il n'y a aucune coupe.** Si le plan change, la vidéo est
   inutilisable au défilement : relancer avec `create_followup` en insistant sur
   le plan unique.
3. Réencoder avec une image-clé partout :

```bash
ffmpeg -i public/videos/hero-clim-source.mp4 -an -c:v libx264 -g 1 -crf 24 \
       -pix_fmt yuv420p -movflags +faststart public/videos/hero-clim.mp4
ffmpeg -i public/videos/hero-clim.mp4 -frames:v 1 public/videos/hero-clim.jpg
ls -lh public/videos/
```

4. Dans `app/page.js`, passer `HERO_VIDEO` de `null` à `"/videos/hero-clim.mp4"`.
