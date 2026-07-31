# Étiquettes QR et suivi logistique — conception et plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Suivre chaque climatiseur physiquement — l'identifier d'un coup d'appareil photo, connaître son état, et enregistrer les livraisons et retours sans se tromper de machine.

**Ce document tient lieu de spec et de plan.**

## Décisions prises avec Hugo

| Sujet | Décision | Raison |
|---|---|---|
| Application mobile | **Aucune.** Une page du site, faite pour le téléphone | L'appareil photo de l'iPhone scanne déjà les QR codes nativement. Pas d'App Store, pas de validation, pas de version Android, pas de mise à jour à publier |
| Contenu du QR | Une **adresse web** vers la page de la machine | Un QR contenant juste « SEI-001 » exigerait une application pour l'interpréter. Une adresse s'ouvre toute seule |
| Ampleur | Le socle : QR, planche d'étiquettes, page d'action | 80 % de la valeur pour une fraction du travail |
| Horizon | **Conçu pour 50 machines et plus** | D'où l'historique par machine et la sélection à l'impression, inutiles à 8 mais indispensables à 50 |
| Notifications poussées | **Écartées** | Un email part déjà à chaque réservation payée. À trois personnes, ça suffit |

## Ce que le scan apporte réellement

Pas la vitesse — à 8 machines, taper le numéro est aussi rapide. Mais :

- **La traçabilité** : quelle machine était chez quel client, à quelle date. Indispensable le jour où un dégât est contesté.
- **L'absence d'erreur** : impossible de livrer la RIV-002 en croyant livrer la RIV-003.

Les deux valent dès la première machine et tiennent encore à 200.

## Architecture

### Le QR code

Il encode `https://www.lootaclim.fr/admin/scan/<numéro de série>`.

Conséquence heureuse : `/admin` est déjà protégé par le middleware. Un inconnu
qui scanne une étiquette tombe sur la page de connexion, pas sur l'état de ton
parc. La sécurité est acquise sans rien ajouter.

Sous le QR, **le numéro écrit en clair** : un code abîmé, mouillé ou rayé
devient illisible, alors que « SEI-001 » se lit toujours.

### Nouveau modèle : l'historique

```prisma
model UnitEvent {
  id        String   @id @default(cuid())
  unit      Unit     @relation(fields: [unitId], references: [id], onDelete: Cascade)
  unitId    String
  type      String   // CREATED | SCANNED | ASSIGNED | DELIVERED | RETURNED | STATUS_CHANGED | NOTE
  detail    String?
  bookingId String?  // réservation concernée, si applicable
  createdAt DateTime @default(now())

  @@index([unitId, createdAt])
}
```

C'est la fondation « 50 machines » : sans journal, un parc important devient
ingouvernable dès la première contestation.

### `lib/scan.js` — la logique, pure et testée

```
nextAction(unit, booking, today) -> { id, label, danger? } | null
```

Renvoie **la seule action pertinente** pour cette machine à cet instant, selon
exactement les mêmes règles que le tableau de réservations — jamais un bouton
qui échouerait silencieusement.

| État constaté | Action proposée |
|---|---|
| Machine disponible, réservation confirmée sans machine affectée | Affecter à cette réservation |
| Machine affectée, livraison prévue | Marquer livrée |
| Machine en location, réservation livrée | Marquer récupérée |
| Machine en maintenance | Remettre en service |
| Rien à faire | Aucun bouton, état affiché seulement |

```
labelSheets(units, parPage) -> pages          // découpe pour l'impression
```

### Les pages

| Route | Rôle |
|---|---|
| `/admin/scan/[serial]` | Ce qui s'ouvre au scan. Machine, état, réservation en cours, **un seul bouton**, historique, note |
| `/admin/etiquettes` | Sélection des machines et planche d'étiquettes à imprimer |

La page de scan est conçue pour le téléphone d'abord : gros caractères, bouton
d'action pleine largeur, aucun tableau.

### Impression

Une planche A4 de 24 étiquettes (3 colonnes × 8 lignes), au format des
planches autocollantes courantes. `@media print` masque tout le reste.

Sélection par cases à cocher, avec un filtre par modèle et par état : à 50
machines on n'imprime que les nouvelles.

**Recommandation matérielle :** étiquettes plastifiées ou vinyle. Ces machines
sortent, prennent la pluie et se font manipuler ; une étiquette papier ne tient
pas une saison.

### Dépendance ajoutée

`qrcode` — génération des QR codes. Écrire un encodeur soi-même représente
plusieurs centaines de lignes délicates pour zéro bénéfice. Utilisé
**uniquement côté serveur**, donc aucun poids ajouté pour le visiteur.

---

### Task 1 : `lib/scan.js` — l'action pertinente, en calcul pur

**Files:** Create `lib/scan.js`, `lib/scan.test.js`

- [ ] Écrire les tests : chaque état du tableau ci-dessus, plus les cas limites
      (machine retirée, réservation annulée, machine affectée à une autre
      réservation, aucune réservation)
- [ ] `npm test` doit échouer
- [ ] Écrire `nextAction` et `labelSheets`
- [ ] `npm test` au vert
- [ ] Commit

### Task 2 : l'historique en base

**Files:** Modify `prisma/schema.prisma`, create migration, modify `app/admin/actions.js`

- [ ] Ajouter `UnitEvent` et la relation depuis `Unit`
- [ ] `npx prisma migrate dev --name historique_machines`
- [ ] Consigner un événement dans `assignUnit`, `markDelivery`, `saveUnit`,
      `createUnit` — sans changer leur comportement
- [ ] Vérifier : les tests passent, une affectation crée bien une ligne
- [ ] Commit

### Task 3 : la page de scan

**Files:** Create `app/admin/scan/[serial]/page.js`, `app/admin/scan/actions.js`; modify `app/globals.css`

- [ ] Page : machine, modèle, état, réservation en cours avec client et dates
- [ ] Le bouton d'action unique, calculé par `nextAction`
- [ ] Historique des dix derniers événements
- [ ] Champ de note rapide
- [ ] Numéro de série inconnu : message clair, pas d'erreur
- [ ] Mise en forme téléphone d'abord
- [ ] Commit

### Task 4 : les étiquettes

**Files:** Create `app/admin/etiquettes/page.js`; modify `app/admin/AdminHeader.js`, `app/globals.css`; add `qrcode`

- [ ] `npm install qrcode`
- [ ] Sélection des machines, filtre par modèle et par état
- [ ] Planche de 24 étiquettes par page A4, QR + numéro en clair + modèle
- [ ] Styles d'impression : rien d'autre que la planche
- [ ] Lien depuis le back-office
- [ ] Commit

### Task 5 : recette

- [ ] `npm test` et `npm run build` au vert
- [ ] Imprimer une planche en PDF depuis le navigateur : les QR sont nets et
      alignés
- [ ] Scanner un QR **avec l'appareil photo d'un iPhone** : la bonne page
      s'ouvre
- [ ] Le parcours complet sur téléphone : affecter, livrer, récupérer
- [ ] Un inconnu non connecté qui scanne tombe sur la page de connexion
- [ ] Les pages existantes sont inchangées

## Hors périmètre

- Le scanner intégré au navigateur pour enchaîner plusieurs machines. À
  reconsidérer si le chargement de la camionnette devient pénible.
- Les notifications poussées.
- Les étiquettes pour les kits de calfeutrage : même principe, à ajouter si le
  besoin se confirme.
