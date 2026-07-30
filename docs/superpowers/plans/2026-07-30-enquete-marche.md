# Enquête de marché — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recueillir auprès des visiteurs les informations qui manquent à Hugo pour dimensionner son parc, valider ses prix et cibler ses livraisons.

**Architecture :** Les questions et la validation vivent dans `lib/survey.js`, pur et testé. Une fenêtre modale cliente affiche le formulaire ; une Server Action enregistre la réponse. Le back-office agrège les résultats. Aucune dépendance ajoutée.

**Ce document tient lieu de spec et de plan.**

## Décisions prises avec Hugo

| Sujet | Décision |
|---|---|
| Déclenchement | **Fenêtre bloquante dès l'arrivée**, choisie après que le risque de conversion a été exposé |
| Résultats | **Page `/admin/enquete`** avec totaux par question et export tableur |
| Nombre de questions | 8 obligatoires + email facultatif. Au-delà, le taux d'abandon s'effondre |

## Garde-fous non négociables

- **Refusable en un clic.** Un consentement contraint est nul au sens du RGPD : les
  données seraient inexploitables. Bouton de fermeture, touche Échap, clic sur le fond.
- **Ne réapparaît jamais** après une réponse ou un refus (mémorisé par le navigateur).
- **Consentement explicite** : case à cocher non pré-cochée, finalité annoncée,
  durée de conservation indiquée.
- **Le contenu reste lisible par les moteurs de recherche** : la fenêtre est posée
  côté navigateur, le HTML envoyé par le serveur n'est pas modifié.
- **Accessible au clavier** : focus piégé dans la fenêtre, Échap ferme, chaque
  champ a son intitulé.
- **Aucune donnée sensible.** Pas de revenu, pas de nom, pas d'adresse précise.

## Les 8 questions, et la décision que chacune éclaire

| Champ | Question | Décision éclairée |
|---|---|---|
| `surface` | Surface à rafraîchir | Répartition SEINE / RIVOLI / TROCADÉRO à l'achat |
| `location` | Arrondissement ou commune | Où concentrer les tournées de livraison |
| `housing` | Locataire ou propriétaire | Le vrai marché : un locataire ne peut pas poser de clim fixe |
| `duration` | Durée envisagée | Rotation du parc, validité du tarif dégressif |
| `priceRange` | Prix par jour acceptable | Les tarifs 12 / 18 / 26 € sont-ils justes ? |
| `currentSolution` | Comment la chaleur est supportée aujourd'hui | Contre quoi l'offre est réellement en concurrence |
| `blocker` | Ce qui ferait hésiter | Objections à traiter sur la page d'accueil |
| `ageRange` | Tranche d'âge | Ciblage publicitaire |
| `email` | **Facultatif** — être prévenu du lancement | Transforme l'enquête en liste d'attente |

Écartés volontairement : le revenu (intrusif, réponses peu fiables), la composition
du foyer (n'oriente aucune décision), le mode de transport.

---

### Task 1 : `lib/survey.js` — questions et validation

**Files:** Create `lib/survey.js`, `lib/survey.test.js`

**Produces:**
- `SURVEY_QUESTIONS` — tableau décrivant chaque question (id, intitulé, choix)
- `validateSurvey(donnees)` → `{ ok: true, valeurs }` ou `{ ok: false, erreurs }`
- `summarise(reponses)` → totaux par question, pour la page d'analyse

- [ ] **Step 1 : écrire les tests qui échouent** (voir code dans l'implémentation)
- [ ] **Step 2 : `npm test` doit échouer sur le module manquant**
- [ ] **Step 3 : écrire `lib/survey.js`**
- [ ] **Step 4 : `npm test` au vert**
- [ ] **Step 5 : commit**

### Task 2 : le modèle en base

**Files:** Modify `prisma/schema.prisma`, create migration

- [ ] Ajouter le modèle `SurveyResponse` (tous les champs en `String`, comme le
      reste du projet — SQLite n'avait pas d'énumérations et la convention est restée)
- [ ] `npx prisma migrate dev --name enquete_marche`
- [ ] Vérifier que la table existe
- [ ] Commit

### Task 3 : la fenêtre et l'enregistrement

**Files:** Create `app/SurveyModal.js`, `app/survey-actions.js`; modify `app/page.js`, `app/globals.css`

- [ ] Server Action `submitSurvey` qui valide puis enregistre
- [ ] Composant client : fenêtre bloquante, fermeture par bouton / Échap / fond,
      mémorisation du refus, focus piégé
- [ ] Montage sur la page d'accueil
- [ ] Styles accordés à la charte (Jost, navy, bleu bleuet)
- [ ] Vérifier : build, tests, et que le HTML serveur ne contient pas la fenêtre
- [ ] Commit

### Task 4 : la page de résultats

**Files:** Create `app/admin/enquete/page.js`; modify `app/admin/page.js` (lien)

- [ ] Totaux par question, en pourcentage et en nombre
- [ ] Les emails collectés, séparément
- [ ] Export en CSV
- [ ] Lien depuis le back-office
- [ ] Commit

### Task 5 : recette

- [ ] `npm test` et `npm run build` au vert
- [ ] Une réponse envoyée depuis le site apparaît dans `/admin/enquete`
- [ ] La fenêtre ne réapparaît pas après refus
- [ ] Échap et le clic sur le fond ferment bien
- [ ] Les pages `/reserver/*` et `/admin/*` sont inchangées

## Reste à faire, hors de ce plan

**La politique de confidentialité n'existe pas.** Le formulaire annonce la finalité
et la durée de conservation au moment de la collecte, ce qui couvre l'obligation
d'information immédiate. Mais la page complète reste obligatoire, et doit être
publiée rapidement.
