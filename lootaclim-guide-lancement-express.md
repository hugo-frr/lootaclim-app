# LOOTACLIM — Guide de lancement express (ouverture en ~2 semaines)

**Situation** : nous sommes mi-juillet, en pleine saison. Objectif : encaisser vos premières locations avant fin juillet avec une solution clé en main, puis basculer sur le site sur-mesure à l'automne (Phase 2).

---

## Vue d'ensemble de la Phase 1

```
Votre page 3D LOOTACLIM (vitrine)  ──►  bouton "Réserver"  ──►  Boutique de location clé en main
        hébergée gratuitement                                    (réservation, paiement, stock, clients)
```

Vous gardez le site "waouh" que nous avons créé comme page d'accueil, et le bouton "Réserver ma clim" envoie vers une boutique de location prête à l'emploi.

---

## Choix de la plateforme de réservation

Trois options réalistes pour de la LOCATION (pas de la vente) — vérifiez les tarifs actuels, ils évoluent :

| | **Twice** (ex-Rentle) | **Shopify + app location** | **WordPress + WooCommerce + plugin location** |
|---|---|---|---|
| Conçu pour la location | ✅ Nativement (calendrier, unités, caution) | Via app (BookThatApp, etc.) | Via plugin (RnB, WooCommerce Bookings) |
| Rapidité de mise en ligne | ⭐⭐⭐ 1-2 jours | ⭐⭐ 3-5 jours | ⭐ 1-2 semaines |
| Difficulté | Très facile | Facile | Moyenne (mais vous avez des bases HTML/CSS ✔) |
| Coût indicatif | Gratuit + commission, ou abonnement | ~36 €/mois + app ~20-30 €/mois | ~10 €/mois hébergement + plugin ~100-200 €/an |
| Gestion stock par unité | ✅ | Selon l'app | Selon le plugin |
| Vous êtes propriétaire de tout | ❌ | ❌ | ✅ |

**Ma recommandation vu l'urgence : Twice.** C'est une plateforme pensée exclusivement pour les entreprises de location : chaque climatiseur physique est une unité avec son calendrier, les clients choisissent leurs dates, la livraison est une option configurable, le paiement et la caution sont intégrés. Vous pouvez être en ligne ce week-end. Si à l'usage elle ne vous convient pas, vous migrerez vers WooCommerce sans avoir perdu la saison.

---

## Semaine 1 — Fondations

### Jour 1 : Légal et administratif (à lancer en premier, il y a des délais)
- [ ] **Créer votre micro-entreprise** (si pas déjà fait) sur le guichet unique de l'INPI (procedures.inpi.fr). Activité : "location de matériel". C'est gratuit, comptez quelques jours pour recevoir le SIRET. Sans SIRET, pas de compte de paiement.
- [ ] **Ouvrir un compte bancaire dédié** (Qonto, Shine, ou votre banque) — ouverture en 24-48h pour les néobanques.
- [ ] **Acheter le nom de domaine** `lootaclim.fr` (et idéalement `.com`) chez OVH ou Gandi (~10-15 €/an). Faites-le aujourd'hui même : un nom de domaine se réserve en 5 minutes.
- [ ] **Assurance RC Pro** : demandez des devis (dégât des eaux causé par une machine chez un client = risque réel du métier).

### Jour 2 : Photos produits
- [ ] Option rapide : photographiez vos machines au smartphone, devant un mur clair, lumière du jour, plusieurs angles + un plan en situation (dans un salon). Des photos vraies et propres convertissent mieux que des visuels volés.
- [ ] ⚠️ N'utilisez PAS les photos des sites des fabricants sans autorisation écrite (droit d'auteur). Certains fabricants fournissent un kit média à leurs revendeurs/loueurs : demandez-leur.
- [ ] Retouche gratuite : remove.bg pour détourer, Canva pour uniformiser les fonds.

### Jour 3-4 : Création de la boutique
- [ ] Créer le compte Twice (ou l'option choisie), boutique en français, devise EUR.
- [ ] Créer vos 3 produits : SEINE, RIVOLI, TROCADÉRO — reprenez les descriptions et prix de notre prototype (12/18/26 €/jour, dégressif -15 % à 7 jours, -30 % à 30 jours si la plateforme le permet).
- [ ] **Saisir votre stock réel** : chaque machine physique = 1 unité avec son numéro de série. C'est ce qui rend le calendrier de disponibilité fiable.
- [ ] Configurer la **livraison** : zone Paris + petite couronne, 29 €, créneaux (9h-12h / 14h-18h). Ajoutez l'option "reprise en fin de location".
- [ ] Connecter **Stripe** (nécessite le SIRET) : paiement CB + **caution par empreinte bancaire** (pré-autorisation non débitée — indispensable en location).

### Jour 5 : Mise en ligne de la vitrine 3D
- [ ] Créer un compte **Netlify** (gratuit). Glissez-déposez le fichier `lootaclim.html` (renommé `index.html`) sur netlify.com/drop → votre site est en ligne en 30 secondes.
- [ ] Connecter votre nom de domaine `lootaclim.fr` à Netlify (ils fournissent le guide DNS pas à pas ; chez OVH cela se fait dans "Zone DNS").
- [ ] Je modifierai le fichier pour que tous les boutons "Réserver" pointent vers votre boutique Twice — envoyez-moi l'URL de la boutique quand elle existe.

### Jour 6-7 : Pages légales
- [ ] **CGV/CGL de location** : partez d'un modèle (LegalPlace, Captain Contrat) couvrant caution, casse, annulation, retard de restitution. Faites relire par un juriste si possible.
- [ ] **Mentions légales + politique de confidentialité (RGPD)** : générateurs en ligne + relecture.
- [ ] Ajoutez ces pages dans la boutique ET en pied de page de la vitrine.

---

## Semaine 2 — Tests et acquisition

### Jour 8-9 : Tests grandeur nature
- [ ] Passez une commande test complète (Stripe a un mode test) : réservation → paiement → email de confirmation → la machine apparaît indisponible aux mêmes dates.
- [ ] Testez sur mobile (la majorité de vos clients réserveront depuis leur téléphone, en sueur, un soir de canicule).
- [ ] Testez l'annulation et le remboursement.

### Jour 10 : Être trouvable — le plus important pour ce business
- [ ] **Google Business Profile** (gratuit, prioritaire n°1) : créez la fiche "LOOTACLIM — Location de climatiseurs Paris". Les recherches "location climatiseur paris" en pleine canicule passent massivement par Google Maps. Ajoutez photos, horaires, lien de réservation.
- [ ] **Google Ads** : campagne simple sur "location climatiseur paris", "louer clim paris", "climatiseur mobile location". En période de canicule ces recherches explosent — budget test 10-20 €/jour.
- [ ] Inscrivez-vous sur les annuaires locaux (PagesJaunes, etc.).

### Jour 11-12 : Organisation opérationnelle
- [ ] **Planning de livraisons** : au début, un simple Google Sheets partagé suffit (colonnes : date, créneau, client, adresse, étage, téléphone, machine n°, livré ✔/reprise ✔). Twice fournit aussi une vue commandes.
- [ ] **Check-list de livraison** imprimée : état de la machine (photos avant/après), kit fenêtre complet, démonstration au client, signature.
- [ ] **Contrat de location papier ou PDF** signé à la livraison (doublon de sécurité des CGV en ligne).

### Jour 13-14 : Lancement 🚀
- [ ] Passer Stripe en mode réel.
- [ ] Annonce sur les réseaux, groupes Facebook de quartier, Nextdoor (très efficace localement pour ce type de service).
- [ ] Premier objectif : 5 locations la première semaine pour roder le processus.

---

## Budget Phase 1

| Poste | Coût |
|---|---|
| Nom de domaine | ~15 €/an |
| Hébergement vitrine (Netlify) | 0 € |
| Plateforme de location | 0-40 €/mois selon formule |
| Stripe | ~1,5 % + 0,25 €/transaction |
| Google Ads (optionnel mais recommandé en canicule) | 300-600 €/mois en juillet-août |
| CGV (modèle en ligne) | 0-200 € |
| **Total pour démarrer** | **< 300 € hors publicité** |

---

## Phase 2 — Le site sur-mesure (à partir de septembre)

Une fois la saison passée, on construit ensemble la version définitive (Next.js + PostgreSQL, cf. plan de projet) avec :
- votre tunnel de réservation intégré au design 3D,
- le back-office complet (stock, clients, tournées de livraison optimisées),
- zéro commission de plateforme.

L'expérience de l'été (questions récurrentes des clients, problèmes de livraison, taux d'occupation réel des machines) rendra ce site custom bien meilleur que si on le construisait aujourd'hui à l'aveugle. Vos données clients et l'historique seront exportables de la plateforme vers votre future base.

---

## Ce dont j'ai besoin de vous pour avancer

1. L'URL de votre boutique dès qu'elle est créée → je mets à jour la vitrine 3D avec les bons liens.
2. Vos vrais tarifs, modèles et nombre de machines en stock → j'adapte les textes de la vitrine.
3. Vos photos produits → je peux vous aider à écrire les fiches produits.

*Note : les noms d'outils, tarifs et fonctionnalités cités sont à vérifier au moment de l'inscription — les offres évoluent vite. Les points juridiques sont un pense-bête, pas un conseil juridique.*
