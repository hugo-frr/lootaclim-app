# Vidéo produit défilée au scroll (Motion)

**Date :** 2026-07-29
**Statut :** préparé, en attente de crédits Motion
**Contexte :** remplace le climatiseur 3D temps réel de
`2026-07-29-climatiseur-3d-scroll-design.md`, jugé trop laid dans la partie
basse de la page.

## Décisions

| Sujet | Décision |
|---|---|
| Source de l'animation | Vidéo générée par le connecteur Motion |
| Image de départ | **Aucune.** Climatiseur générique décrit par le brief — pas la photo RAKS, qui porte le logo d'une autre marque et pose une question de droit d'auteur |
| Pilotage | Le défilement de la page fait avancer la vidéo (`currentTime`), elle ne se lit jamais toute seule |
| Cohabitation avec la 3D | Exclusive : une constante dans `app/page.js` choisit la vidéo **ou** la scène 3D. La 3D reste le repli tant que le fichier n'existe pas |
| Encodage | Réencodage ffmpeg avec une image-clé à chaque image (`-g 1`) |

## Le brief Motion

Exigence non négociable : **un plan unique, continu, sans aucune coupe**. Motion
produit par défaut des vidéos montées ; au défilement, chaque changement de plan
donnerait un saut brutal. Le brief le martèle.

Autres exigences : aucun texte incrusté (la page a déjà le sien), aucun logo,
aucune marque, aucun humain, fond dégradé blanc vers bleu glacé, boucle possible
(la dernière image doit pouvoir rejoindre la première).

Paramètres d'appel : `aspect_ratio: "16:9"`, `duration: "10-30s"`,
`design_system_id: "apple"`.

Le texte exact du brief est dans `docs/motion-brief-climatiseur.md`.

## Architecture

### `lib/scrollVideo.js` — le calcul, pur et testé

```
scrubProgress(scrollY, documentHeight, viewportHeight) -> 0..1
videoTimeAt(progress, duration) -> secondes, borné à [0, duration]
shouldSeek(courant, cible, seuil) -> booléen
```

`shouldSeek` évite de solliciter le décodeur pour des écarts inférieurs à une
image (1/60 s par défaut) : sans ce filtre, on réassigne `currentTime` 60 fois
par seconde pour des déplacements invisibles, et la lecture se met à hoqueter.

### `app/ScrollVideo.js` — le composant

Un `<video>` en `position: fixed`, `object-fit: cover`, même emplacement que le
canvas 3D. Jamais en lecture automatique : une boucle `requestAnimationFrame`
amène `currentTime` vers sa cible par interpolation, pour lisser les défilements
brusques.

Replis, du plus probable au moins probable :

- `src` absent → le composant ne rend rien, le dégradé CSS reste.
- La vidéo échoue au chargement (`onError`) → le composant se retire.
- `prefers-reduced-motion: reduce` → l'affiche (`poster`) seule, figée, aucune
  boucle, aucun écouteur de défilement.
- Onglet en arrière-plan → la boucle s'arrête.

### Branchement dans `app/page.js`

```js
// Chemin de la vidéo de fond. null tant que Motion n'a rien produit :
// la scène 3D sert alors de repli.
const HERO_VIDEO = null;
```

```jsx
{HERO_VIDEO ? (
  <>
    <ScrollVideo src={HERO_VIDEO} poster="/videos/hero-clim.jpg" />
    <AcLabels forceStatic />
  </>
) : (
  <AcStage sectionIds={SECTION_IDS} />
)}
```

Une seule ligne à changer le jour où le fichier existe. Les étiquettes
explicatives survivent au basculement : elles s'affichent en liste dans la
section réassurance, puisqu'une vidéo ne peut pas les porter.

## Chaîne de production du fichier

1. `create_video` avec le brief → Motion renvoie une URL de vidéo.
2. Téléchargement dans `public/videos/hero-clim-source.mp4`.
3. Réencodage :
   ```
   ffmpeg -i hero-clim-source.mp4 -an -c:v libx264 -g 1 -crf 24 \
          -pix_fmt yuv420p -movflags +faststart public/videos/hero-clim.mp4
   ```
   `-g 1` met une image-clé partout : n'importe quelle position devient
   instantanée. `-an` retire la piste audio, inutile et lourde.
4. Extraction de l'affiche : `ffmpeg -i hero-clim.mp4 -frames:v 1 hero-clim.jpg`
5. Mesure du poids final. **Au-delà de 6 Mo, revoir la durée ou la définition.**

## Points de vigilance

- **Le poids.** Une image-clé partout multiplie la taille par 3 à 5. C'est le
  compromis assumé du défilement fluide.
- **`public/` n'est pas versionné** (`?? public/` dans git). La vidéo n'existera
  pas en ligne tant que ce dossier n'est pas commité ou déplacé vers un
  stockage adapté.
- **Le montage.** Si Motion livre malgré tout une vidéo avec des coupes, elle
  est inutilisable au défilement. Contrôle obligatoire avant intégration.

## Hors périmètre

- Le remplacement des photos produit identiques (les 5 fichiers de
  `public/images` ont la même empreinte MD5) — problème distinct, à traiter.
- La mise en ligne sur `lootaclim.fr`.
