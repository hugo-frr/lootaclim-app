# Prompt vidéo — climatiseur LOOTACLIM

À coller dans n'importe quel générateur vidéo (Sora, Veo, Kling, Runway, Luma,
Hailuo, Higgsfield…). En anglais : tous ces modèles sont nettement meilleurs en
anglais qu'en français.

## Le prompt

```
Product turntable shot: a modern white portable air conditioner rotating slowly
and continuously on a seamless studio background. One single unbroken take,
locked camera, no cuts.

THE UNIT: a tall rounded rectangular portable air conditioner on small castors.
Matte white lacquered body, soft bevelled edges, horizontal louvred vents across
the upper front, a slim dark grey control panel on top, and a flexible silver
exhaust hose curving away from the back. Completely unbranded — no logo, no
text, no badge, no model number anywhere on the machine.

MOTION: the air conditioner turns steadily on its vertical axis, one slow
complete rotation from start to finish. Pale blue cool air drifts gently upward
from the vents like soft vapour. Nothing else moves. Very slow, calm, hypnotic.

LIGHTING AND BACKGROUND: bright soft studio lighting, gentle highlights along
the white body, soft contact shadow beneath the unit. Seamless gradient
background, white at the bottom fading to pale icy blue at the top. Cool, fresh,
airy, premium.

STYLE: high-end Apple-style product film, photorealistic, clean, minimal.

Absolutely no text, no captions, no logos, no branding, no people, no hands, no
room, no furniture, no window, no cuts, no transitions, no camera shake, no fast
movement.
```

## Version courte (si l'outil limite le nombre de caractères)

```
Slow continuous turntable rotation of a modern unbranded white portable air
conditioner on castors, matte white body, horizontal louvred vents, flexible
exhaust hose at the back. Pale blue cool air drifting gently upward from the
vents. Seamless gradient background, white fading to pale icy blue. Soft bright
studio lighting, soft shadow beneath. Photorealistic Apple-style product film.
One single unbroken take, locked camera, very slow, calm. No text, no logo, no
people, no cuts.
```

## Prompt négatif (si l'outil en propose un)

```
text, caption, subtitles, watermark, logo, brand, lettering, numbers, people,
hands, room, furniture, window, cuts, transitions, montage, camera shake, fast
motion, zoom, warping, melting, morphing, distorted geometry, extra objects,
duplicated parts
```

## Réglages

| Réglage | Valeur |
|---|---|
| Durée | **10 s** (12 si possible ; prendre le maximum si l'outil plafonne plus bas) |
| Format | **16:9** |
| Définition | 1080p ou 720p — inutile d'aller au-delà, c'est un fond estompé |
| Audio | **désactivé** (je le supprime de toute façon) |
| Boucle | l'activer si l'option existe, mais ce n'est pas indispensable (voir plus bas) |

## À vérifier avant de me l'envoyer

1. **Aucune coupe ni changement de plan.** C'est éliminatoire : au défilement,
   une coupe donne un saut brutal.
2. **Aucun texte ni logo** n'est apparu.
3. **La machine ne se déforme pas.** C'est le défaut le plus fréquent des IA
   vidéo : la carrosserie ondule, les grilles se dédoublent, une roulette
   apparaît puis disparaît. Regarde la vidéo au ralenti.
4. **Le mouvement est lent et régulier**, sans à-coup.

**La boucle n'est pas un souci.** Si la dernière image ne rejoint pas la
première, je fabrique un aller-retour avec ffmpeg — la vidéo joue en avant puis
en arrière. La boucle devient alors parfaite par construction, quelle que soit
la vidéo de départ. Ne perds pas de temps là-dessus.

## Où déposer le fichier

```
public/videos/hero-clim-source.mp4
```

Le dossier `public/videos/` n'existe pas encore, il faut le créer. Ensuite je
m'occupe de tout : réencodage avec une image-clé partout, extraction de
l'affiche, réduction du poids sous 4 Mo, bascule de `HERO_VIDEO` dans
`app/page.js`, et mesure.

## Quelques générateurs

Sora (OpenAI), Veo (dans Gemini), Kling, Runway, Luma Dream Machine, Hailuo.
La plupart ont une formule gratuite limitée — de quoi faire un ou deux essais
sans rien payer.
