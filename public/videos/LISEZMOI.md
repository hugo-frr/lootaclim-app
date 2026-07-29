# Vidéos de la page d'accueil

| Fichier | Rôle |
|---|---|
| `hero-clim.mp4` | **Le fichier utilisé par le site.** Ne pas remplacer à la main |
| `hero-clim.jpg` | Affiche, extraite de la vidéo ci-dessus |
| `hero-clim-master.mp4` | L'original, tel que reçu du générateur. Conservé comme source |

## Pourquoi ne pas remplacer `hero-clim.mp4` directement

La vidéo n'est pas lue normalement : c'est le défilement de la page qui déplace
la tête de lecture, image par image (`app/ScrollVideo.js`).

Un fichier vidéo ordinaire ne contient une **image-clé** que toutes les 2 à 5
secondes. Toutes les autres images ne stockent que la différence avec la
précédente. Pour afficher une image quelconque, le navigateur doit donc
décoder depuis l'image-clé qui la précède — invisible en lecture normale,
mais catastrophique quand on saute d'une position à l'autre à chaque
mouvement de souris : **le défilement saccade**.

`hero-clim.mp4` est réencodé avec **une image-clé à chaque image**. N'importe
quelle position devient instantanée. C'est ce qui explique qu'il pèse 1,8 Mo
pour 452 Ko de source : le compromis est assumé.

## Remplacer la vidéo

Déposer le nouveau fichier sous `hero-clim-master.mp4`, puis :

```bash
cd public/videos
ffmpeg -y -i hero-clim-master.mp4 -an -c:v libx264 -g 1 -crf 25 \
       -pix_fmt yuv420p -movflags +faststart hero-clim.mp4
ffmpeg -y -i hero-clim.mp4 -frames:v 1 -q:v 3 hero-clim.jpg
```

Vérifier ensuite qu'il n'y a **aucune coupe** — une seule rendrait la vidéo
inutilisable au défilement :

```bash
ffmpeg -i hero-clim-master.mp4 -filter:v "select='gt(scene,0.3)',showinfo" \
       -f null - 2>&1 | grep -c "showinfo.*pts_time"
```

Le résultat doit être `0`.
