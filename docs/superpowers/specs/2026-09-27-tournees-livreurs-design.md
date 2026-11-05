# Tournées des livreurs — conception

**Date :** 2026-09-27
**Statut :** en attente de validation

## Pourquoi

Un livreur qui se connecte est envoyé vers `/admin/tournees`, une page qui
n'existe pas. Il n'a donc aucun moyen de savoir où aller, dans quel ordre, ni
avec quelle machine. Et rien ne relie une livraison à un livreur précis : dès
qu'il y a deux livreurs, personne ne sait qui fait quoi.

## Ce qu'Hugo a demandé

- Le livreur voit **son parcours sur une carte** au moment de commencer.
- L'ordre de passage est calculé par **le meilleur algorithme** possible.
- Ça marche avec **plusieurs livreurs en même temps**.
- **L'application répartit toute seule** les livraisons entre les livreurs du
  jour (option A), l'admin pouvant corriger à la main.
- Des **fausses commandes à de vraies adresses parisiennes** pour tester.

Hugo a délégué les autres choix : ce sont les recommandations ci-dessous.

## Le problème à résoudre

C'est un problème classique de logistique : le **VRPTW** (tournées de
véhicules avec fenêtres horaires). Il faut à la fois :

1. répartir les arrêts entre plusieurs livreurs ;
2. ordonner les arrêts de chacun ;
3. respecter le **créneau de 2 h** promis au client (`TIME_SLOTS`) ;
4. respecter la **capacité du véhicule** : une livraison vide le camion d'une
   machine, une reprise le remplit ;
5. minimiser le temps total de conduite, sans surcharger un livreur.

## L'algorithme

Aucun algorithme ne donne la solution parfaite en un temps raisonnable. Les
logiciels professionnels (VROOM, OR-Tools, les solveurs des transporteurs)
utilisent tous la même famille de méthodes : **une construction intelligente,
puis une recherche locale qui l'améliore**. C'est ce qu'on implémente, en
JavaScript pur et testé, sans dépendance :

1. **Construction par insertion avec regret** (Potvin & Rousseau). On place
   d'abord les arrêts qu'on regretterait le plus de mal placer, c'est-à-dire
   ceux qui n'ont qu'une bonne place possible. C'est ce qui évite qu'un arrêt
   excentré se retrouve impossible à caser en fin de calcul.
2. **Amélioration par recherche locale** : déplacer un arrêt (dans la même
   tournée ou vers une autre), échanger deux arrêts, inverser un morceau de
   trajet (2-opt), échanger les fins de deux tournées (2-opt\*).
3. **Ruine et reconstruction** (LNS) : on retire quelques arrêts voisins et on
   les réinsère, en boucle pendant un budget fixe (environ 2 secondes), pour
   sortir des solutions « bonnes mais pas meilleures ». Le hasard est tiré
   d'une graine fixe : le même jour donne toujours le même résultat, et les
   tests sont reproductibles.

Chaque déplacement n'est accepté que si **tous** les créneaux et la capacité
restent respectés. Un livreur qui arrive en avance attend l'ouverture du
créneau. Un arrêt impossible à caser n'est jamais forcé : il est signalé à
l'admin avec sa raison.

**Objectif minimisé** : temps de conduite total, plus une petite pénalité
d'écart entre les tournées (pour ne pas donner 12 arrêts à l'un et 2 à l'autre).

**Hypothèses de départ, réglables dans `lib/tournees/config.js`** :

| Réglage | Valeur | Pourquoi |
|---|---|---|
| Temps sur place | 15 min | installation ou démontage d'un climatiseur mobile |
| En plus si étage sans ascenseur | +10 min | porter la machine dans l'escalier |
| Capacité d'un véhicule | 6 machines | petit utilitaire |
| Journée du livreur | 8 h 30 → 22 h 30 | couvre les créneaux 9 h → 22 h |
| Départ et retour | l'entrepôt | les machines y sont chargées et y reviennent |

⚠️ **L'adresse de l'entrepôt n'existe pas encore.** Une adresse provisoire
dans Paris est posée dans la configuration, clairement marquée à remplacer.

## Les cartes et le calcul des trajets

| Besoin | Choix | Pourquoi |
|---|---|---|
| Adresse → point GPS | **Géoplateforme de l'IGN** (Base Adresse Nationale) | La référence officielle française, gratuite, sans compte ni clé |
| Temps de trajet entre arrêts | **OpenRouteService** (clé gratuite) | De vrais temps de conduite sur le réseau routier. Offre gratuite largement suffisante |
| Tracé du trajet sur la carte | OpenRouteService | Même service |
| Affichage de la carte | **MapLibre** + fonds **OpenFreeMap** | Carte moderne et fluide sur téléphone, gratuite, sans clé, sans traçage publicitaire |
| Guidage GPS vocal | **Google Maps ou Waze**, au choix du livreur | Les deux gèrent le trafic en temps réel et continuent écran verrouillé. Inutile de réinventer le guidage |

**Sans clé OpenRouteService**, tout fonctionne quand même : les temps de
trajet sont estimés à vol d'oiseau (× 1,4 pour les détours, 18 km/h de moyenne
en ville), et la carte relie les arrêts en pointillés. C'est ce qui permet de
tester dès aujourd'hui. Hugo crée la clé gratuite plus tard (marche à suivre
dans le README), et les calculs deviennent précis sans rien changer d'autre.

**Pourquoi pas Google Maps partout ?** Son calcul d'itinéraire est excellent,
mais il demande une carte bancaire, facture à l'usage, et lie l'application à
un seul fournisseur. Le livreur utilise quand même Waze ou Google Maps pour le
guidage, là où ils sont les meilleurs.

**Le géocodage** se fait à l'enregistrement de la réservation. Une adresse pas
encore géocodée (réservations anciennes, service indisponible) l'est au moment
du calcul des tournées. Une adresse introuvable est signalée à l'admin, jamais
placée au hasard.

## Données

```prisma
model Address {
  // …champs actuels
  lat Float? // rempli par le géocodage ; null tant qu'il n'a pas réussi
  lng Float?
}

// La tournée d'un livreur pour un jour donné.
model Tour {
  id          String     @id @default(cuid())
  date        DateTime   // le jour, à minuit UTC comme Delivery.date
  driver      User       @relation(fields: [driverId], references: [id], onDelete: Cascade)
  driverId    String
  status      String     @default("PLANNED") // PLANNED | STARTED (terminée = plus aucun arrêt à faire)
  startedAt   DateTime?
  conduiteMin Int?       // pour l'affichage
  trace       String?    // tracé routier en JSON, pour la carte
  createdAt   DateTime   @default(now())
  deliveries  Delivery[]

  @@unique([date, driverId]) // un livreur, une tournée par jour
}

model Delivery {
  // …champs actuels
  tour        Tour?   @relation(fields: [tourId], references: [id], onDelete: SetNull)
  tourId      String?
  ordre       Int?    // position dans la tournée
  heurePrevue Int?    // minutes depuis minuit, heure de Paris (évite les pièges de fuseau)
}
```

`User` reçoit la relation inverse `tours Tour[]`.

## Plusieurs livreurs en même temps

- **Un arrêt n'appartient qu'à une tournée** : `Delivery.tourId` est un seul
  champ. Impossible qu'il apparaisse chez deux livreurs.
- **Recalculer ne touche jamais le travail en cours.** Les arrêts déjà
  effectués et les tournées **commencées** sont figés. Un nouveau calcul
  répartit seulement les arrêts restants entre les tournées pas encore
  commencées.
- **Chaque livreur ne voit que sa tournée**, et ne peut marquer que ses
  propres arrêts. L'admin peut tout marquer.
- Le calcul se fait dans une **transaction** : deux admins qui cliquent en
  même temps ne produisent pas deux répartitions mélangées.

## Les écrans

### Admin — `/admin/tournees` (droit `planifierTournees`, nouveau, ADMIN)

1. Choisir le jour (aujourd'hui par défaut, ou demain pour préparer).
2. Cocher les livreurs qui travaillent ce jour-là.
3. Bouton **« Calculer les tournées »**.
4. Résultat : une carte avec une couleur par livreur, et une colonne par
   livreur avec ses arrêts dans l'ordre, l'heure prévue, le nombre de machines
   à charger au départ, le temps de conduite total.
5. Chaque arrêt a un menu **« Donner à… »** pour le passer à un autre
   livreur ; seules les deux tournées concernées sont réordonnées.
6. Les arrêts non casés sont listés en haut, en rouge, avec leur raison
   (« adresse introuvable », « créneau impossible à tenir », « véhicule plein »).

Seules les interventions **actionnables** sont planifiées : livraisons de
réservations `CONFIRMED` et reprises de réservations `DELIVERED`. Les
réservations en attente de paiement ou de confirmation n'entrent pas dans les
tournées.

### Livreur — `/admin/tournees` (droit `voirTournees`, déjà existant)

Pensé d'abord pour le téléphone, tenu d'une main :

1. En haut, la carte avec le trajet complet et les arrêts numérotés.
2. En dessous, la liste des arrêts : numéro, heure prévue, créneau client,
   « Livraison » ou « Reprise », machine et kit, adresse, étage, code
   d'accès, téléphone cliquable.
3. Au départ : bouton **« Commencer ma tournée »**. Il note l'heure de départ
   et, si le livreur l'autorise, prend sa **position GPS actuelle** pour
   réordonner ses arrêts restants à partir de là où il est vraiment. Sans
   autorisation, on part de l'entrepôt.
4. L'arrêt en cours est mis en avant, avec deux gros boutons : **« Y aller »**
   et **« Livrée »** / **« Récupérée »**.
   - « Y aller » ouvre le guidage vocal dans l'application choisie par le
     livreur : **Google Maps** ou **Waze**. Le choix se fait une fois, en haut
     de la page, et reste mémorisé sur son téléphone.
   - Un bouton **« Toute la tournée dans Google Maps »** ouvre les arrêts
     restants, dans l'ordre calculé, comme étapes d'un seul trajet. Google
     Maps accepte au plus 9 étapes plus la destination par lien : au-delà de
     10 arrêts, la tournée est découpée en tronçons (« arrêts 1 à 10 »,
     « 11 à 20 »…). Waze ne sait pas enchaîner plusieurs étapes, d'où ce
     bouton réservé à Google Maps.

   Le guidage lui-même n'est volontairement pas refait dans l'application :
   un site web perd la position GPS dès que l'écran se verrouille, alors que
   Google Maps et Waze continuent de guider en arrière-plan, avec le trafic.
   L'application sert de feuille de route ; le GPS guide.
5. Marquer un arrêt passe au suivant et met la carte à jour.

Marquer livrée passe par l'action existante `markDelivery`, avec toutes ses
règles actuelles (caution posée, machine affectée). Si une règle bloque, le
livreur voit la raison en clair et le conseil « appelez l'administrateur ».

Un admin qui ouvre la page voit la vue admin ; un livreur voit sa vue. Le lien
« Tournées » s'ajoute à l'en-tête du back-office.

## Architecture

Les calculs sont séparés en petits fichiers purs, testables sans base ni
réseau :

| Fichier | Rôle |
|---|---|
| `lib/tournees/config.js` | Réglages : entrepôt, temps sur place, capacité, horaires |
| `lib/tournees/distances.js` + tests | Distance à vol d'oiseau et temps estimé |
| `lib/tournees/solveur.js` + tests | L'algorithme complet. Entrée : arrêts, livreurs, matrice des temps. Sortie : tournées et arrêts non casés. Aucun accès réseau ni base |
| `lib/tournees/arrets.js` + tests | Transforme livraisons et réservations en arrêts (fenêtre horaire, temps sur place, effet sur la charge) |
| `lib/geocodage.js` + tests | Appel à la Géoplateforme ; la partie « lire la réponse » est testée à part |
| `lib/itineraires.js` | Appels à OpenRouteService, avec repli sur l'estimation |
| `app/admin/tournees/page.js` | Choisit la vue admin ou livreur |
| `app/admin/tournees/actions.js` | Calculer, réattribuer, commencer, marquer |
| `app/admin/tournees/CarteTournees.js` | Composant client MapLibre |
| `prisma/fausses-tournees.js` | Données de test (voir ci-dessous) |

Une seule dépendance ajoutée : `maplibre-gl`.

## Données de test

`npm run db:demo-tournees` crée :

- **3 livreurs** (`livreur1@test.lootaclim.fr` à `livreur3@…`), mot de passe
  affiché à la fin du script ;
- **une trentaine d'interventions** réparties sur aujourd'hui et demain, à de
  **vraies adresses** dans tous les arrondissements de Paris et quelques
  communes proches (Boulogne, Montreuil, Vincennes…), sur tous les créneaux,
  mélange de livraisons et de reprises, d'étages avec ou sans ascenseur ;
- les adresses sont géocodées pour de vrai par la Géoplateforme ;
- assez de machines pour qu'elles soient toutes affectées, cautions marquées
  posées pour que « Livrée » fonctionne.

Garde-fous, comme `prisma/seed.js` :

- le script **refuse de tourner** sur une base qui ressemble à la production ;
- tout ce qu'il crée est reconnaissable (emails `@test.lootaclim.fr`,
  références `TEST-…`) et `npm run db:demo-tournees -- --effacer` retire
  **uniquement** ces données-là.

## Tests

- **Solveur** : les créneaux sont toujours respectés, la capacité jamais
  dépassée, chaque arrêt apparaît exactement une fois (ou dans les non casés),
  un arrêt impossible est bien signalé, deux livreurs se partagent un nuage
  d'arrêts en deux groupes géographiques cohérents, le résultat est identique
  d'un calcul à l'autre, et le calcul reste sous 3 secondes pour 60 arrêts et
  5 livreurs.
- **Arrêts** : conversion créneau → fenêtre horaire, étage → temps sur place,
  livraison/reprise → effet sur la charge.
- **Géocodage** : lecture d'une réponse réelle enregistrée, adresse
  introuvable, score trop faible refusé.
- **Recette manuelle** avec les fausses commandes : se connecter en admin,
  calculer les tournées de 3 livreurs, puis se connecter en livreur sur un
  téléphone et dérouler une tournée jusqu'au bout.

## Hors périmètre

- Suivi en direct de la position des livreurs sur la carte admin.
- Recalcul automatique en cours de journée (annulation, bouchon) : l'admin
  relance le calcul, qui respecte le travail commencé.
- Prévenir le client par SMS de l'heure d'arrivée.
- Photo ou signature à la livraison (`Delivery.proofUrl` reste inutilisé).
- La page de gestion de l'équipe (`/admin/equipe`) : les comptes livreurs se
  créent avec `prisma/creer-compte.js` ou le script de test.
