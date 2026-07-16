# Gestion du catalogue et des stocks depuis le back-office

**Date** : 16 juillet 2026
**Statut** : validé avec Hugo (voir décisions ci-dessous)

## Objectif

Aujourd'hui, ajouter un nouveau modèle de climatiseur, une machine physique en
stock, ou n'importe quel autre article passe obligatoirement par Prisma
Studio (l'outil technique). Cette étape ajoute trois formulaires au
back-office pour qu'Hugo n'ait plus besoin d'y toucher au quotidien :
créer un nouveau modèle, ajouter une machine en stock, et gérer un nouveau
type d'article — les kits de calfeutrage — avec un suivi individuel comme
les machines.

## Décisions validées

| Sujet | Décision |
|---|---|
| Créer un modèle | Formulaire en haut de `/admin/produits` ; adresse web (slug) générée automatiquement à partir du nom. |
| Créer une machine | Formulaire en haut du tableau « Parc machines » de `/admin` ; modèle choisi dans une liste, numéro de série, notes facultatives. |
| Kits de calfeutrage | Nouveau type d'article suivi individuellement (comme les machines), universel (pas lié à un modèle précis), avec son propre tableau dans `/admin`. |
| Affectation d'un kit | Facultative — un kit peut être affecté à une réservation comme une machine, mais rien ne bloque si aucun kit n'est affecté. |
| Statut d'un kit | Piloté automatiquement par les livraisons (« En location » à la livraison, « Disponible » à la reprise), exactement comme les machines. |
| Retirer un kit / une machine | Passage au statut « Retiré » (comme déjà possible pour les machines) — jamais de suppression définitive, pour ne pas casser l'historique des réservations passées. |
| Photos | Un simple champ « lien d'image » (texte), pas d'upload de fichier — cohérent avec le fonctionnement actuel (voir note ci-dessous). |

**Note sur les photos** : en l'état actuel du site, aucune image n'est
réellement affichée dans le catalogue — chaque carte produit montre un
encadré avec l'texte alternatif de la photo (ou « Photo à venir » si
aucune image n'est renseignée). Le champ image est donc **facultatif** à la
création d'un modèle : le renseigner prépare l'affichage du jour où de
vraies photos seront intégrées, mais ne rien mettre ne bloque rien.

## 1. Créer un nouveau modèle (Product)

Nouveau formulaire en haut de `/admin/produits`, au-dessus des formulaires
d'édition existants : nom, description, puissance (kW), bruit (dB), surface
max (m²), prix par jour (€), caution (€), lien d'image (facultatif), visible
au catalogue (case à cocher, cochée par défaut).

- **Slug** : généré automatiquement à partir du nom (minuscules, accents
  retirés, espaces et caractères spéciaux remplacés par des tirets — ex.
  « Climatiseur Bastille » → `climatiseur-bastille`). En cas de collision
  avec un slug existant, un suffixe numérique est ajouté (`-2`, `-3`...)
  jusqu'à trouver une adresse libre. Fonction pure testable :
  `lib/slug.js` → `slugify(name)`.
- **Validation** (mêmes bornes que l'édition d'un modèle existant, plus les
  champs propres à la création) :
  - nom : 2 à 60 caractères ;
  - description : 10 à 500 caractères ;
  - puissance : 0,1 à 20 kW ;
  - bruit : 20 à 90 dB (entier) ;
  - surface max : 1 à 300 m² (entier) ;
  - prix/jour : 1 à 500 € ;
  - caution : 0 à 2000 € ;
  - lien d'image : facultatif, 500 caractères maximum.
- Si un lien d'image est renseigné, une `ProductImage` est créée avec un
  texte alternatif dérivé automatiquement (« Climatiseur {nom} vue de
  face »), position 0.
- Le nouveau modèle apparaît immédiatement dans la liste d'édition
  (`/admin/produits`) juste en dessous du formulaire de création.

## 2. Ajouter une machine en stock (Unit)

Nouveau formulaire en haut du tableau « Parc machines » de `/admin` : liste
déroulante des modèles actifs, numéro de série (texte libre, 3 à 40
caractères), notes facultatives (500 caractères max, même règle que
l'édition existante).

- Le numéro de série doit être unique (contrainte déjà présente en base) ;
  collision renvoyée comme message clair (« Ce numéro de série existe déjà. »)
  plutôt que l'erreur technique brute.
- La machine créée a le statut « Disponible » par défaut et apparaît
  immédiatement dans le tableau.

## 3. Kits de calfeutrage — nouveau modèle de données

```prisma
model Kit {
  id           String    @id @default(cuid())
  serialNumber String    @unique
  status       String    @default("AVAILABLE") // AVAILABLE | RENTED | MAINTENANCE | RETIRED
  notes        String?
  bookings     Booking[]
}
```

`Booking` reçoit un nouveau champ `kitId String?` (relation facultative vers
`Kit`), sur le même principe que `unitId`.

Statuts (`lib/constants.js`, `KIT_STATUS`) : Disponible / En location / En
maintenance / Retiré — les quatre statuts réellement utilisés pour les
machines aujourd'hui (« En livraison » figure dans les libellés des machines
mais n'est en pratique jamais posé par le code actuel ; il n'est donc pas
repris pour les kits).

### Règles (fonctions pures, `lib/transitions.js`, testées)

- `kitAssignmentError(booking, kit, kitBookings)` — même logique que
  `unitAssignmentError`, **sans la contrainte de modèle** (un kit est
  universel) : réservation en `PENDING`/`CONFIRMED`, kit ni `MAINTENANCE` ni
  `RETIRED`, aucun chevauchement de dates (avec le même jour de battement)
  avec les autres réservations déjà affectées à ce kit.
- `kitStatusChangeError(kit, newStatus)` — même logique que
  `unitStatusChangeError` : changement manuel limité à
  `AVAILABLE`/`MAINTENANCE`/`RETIRED`, impossible si le kit est actuellement
  en location.
- `deliveryDoneEffects(delivery, booking)` est étendu : si `booking.kitId`
  est renseigné, les effets retournés incluent aussi `kit: "RENTED"` (à la
  livraison) ou `kit: "AVAILABLE"` (à la reprise), en plus des effets
  existants sur la réservation et la machine. Si aucun kit n'est affecté,
  aucun effet supplémentaire (le kit reste facultatif — cf. décision
  validée).

### Back-office

- Nouveau tableau « Kits de calfeutrage » dans `/admin`, sur le même
  principe que « Parc machines » : colonnes N° de kit, Statut, Gestion
  (liste déroulante de statut + notes + bouton Enregistrer). Formulaire
  « Nouveau kit » au-dessus (numéro + notes facultatives).
- Tableau des réservations : nouvelle liste déroulante facultative pour
  affecter un kit, à côté de celle des machines, visible pour les
  réservations `PENDING`/`CONFIRMED` sans kit affecté. Les kits proposés
  sont calculés côté serveur (disponibles, dates libres) via
  `kitAssignmentError`, comme pour les machines.
- `markDelivery` (action existante) applique aussi l'effet `kit` retourné
  par `deliveryDoneEffects` quand il est présent, dans la même transaction
  que les effets réservation/machine.

## Hors périmètre

- Upload de fichier image (le champ reste un lien texte pour l'instant).
- Suppression définitive d'un article (modèle, machine ou kit) — seul le
  passage au statut « Retiré » existe, pour préserver l'historique des
  réservations.
- Facturation ou coût associé aux kits (ils sont fournis avec la location,
  pas vendus séparément).
- Modification du slug d'un modèle existant après création (comme
  aujourd'hui pour les 3 modèles de départ).

## Tests

- `lib/slug.js` : cas simples, accents, espaces multiples, caractères
  spéciaux, collision → suffixe numérique.
- `lib/transitions.js` (étendu) : `kitAssignmentError` (cas valide, kit
  indisponible, chevauchement avec battement, réservation non éligible),
  `kitStatusChangeError` (statuts manuels, kit en location), extension de
  `deliveryDoneEffects` (effet kit présent seulement si `kitId` renseigné).
- Vérification HTTP de bout en bout à l'implémentation : créer un modèle,
  créer une machine, créer un kit, affecter un kit à une réservation,
  cycle livraison/reprise avec suivi du statut du kit, retirer un kit.
