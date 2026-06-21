# Compétens – Application scolaire PWA de gestion des compétences

## Fonctionnalités du MVP

- [x] **Années scolaires** — Créer, modifier, clôturer une année. Une seule année active à la fois. Historique complet.
- [x] **Niveaux** — Les 6 niveaux (CP1 → CM2). Administrateur peut ajouter, modifier, archiver.
- [x] **Classes** — Créer une classe avec nom, niveau, professeur principal, effectif. Modifier, archiver.
- [x] **Élèves** — Import massif Excel, modification manuelle, photo, affectation automatique à une classe.
- [x] **Professeurs** — Création de compte, attribution de classes.
- [x] **Référentiel de compétences** — 12 compétences (C1 à C12) avec code, titre, description et conseils pédagogiques.
- [x] **Évaluations quotidiennes** — Le professeur sélectionne une classe et une compétence, voit tous les élèves, coche les aptitudes non acquises. Résultat : Acquis / En cours / Non acquis.
- [x] **Dashboard Administrateur** — Cartes statistiques (élèves, classes, profs, évaluations), graphique d'activité sur 7 jours.
- [x] **Dashboard Professeur** — Mes classes, évaluations du jour, élèves nécessitant un suivi.
- [x] **Page Élève** — Photo, infos, radar des compétences (C1→C12), progression.
- [x] **Mode sombre** — Thème clair/sombre avec bascule.
- [x] **PWA complète** — Installable sur mobile et desktop, fonctionnement hors-ligne, synchronisation différée.

## Design

- [x] Palette professionnelle : bleu primaire `#3A7AFE`, fond clair `#F7F9FC`, texte `#1E1E1E`. Mode sombre : fond `#121212`, cartes `#1E1E1E`.
- [x] Typographie : Inter pour le corps, Roboto Mono pour les chiffres et statistiques.
- [x] Navigation : menu latéral sur desktop, barre de navigation en bas sur mobile.
- [x] Interfaces aérées, gros boutons tactiles, accessibilité élevée.
- [x] Radar chart et graphiques pour la visualisation des compétences.

## Pages / Écrans

1. [x] **Connexion** — Formulaire email/mot de passe, choix du rôle (admin, directeur, professeur)
2. [x] **Dashboard Admin** — Cartes de statistiques, graphique d'activité hebdomadaire, accès rapide
3. [x] **Dashboard Professeur** — Classes assignées, évaluations récentes, alertes élèves
4. [x] **Années scolaires** — Liste, création, édition, clôture
5. [x] **Niveaux** — Grille des 6 niveaux, actions administrateur
6. [x] **Classes** — Liste par niveau, fiche classe avec effectif
7. [x] **Élèves** — Liste filtrable, import Excel, fiche élève détaillée
8. [x] **Professeurs** — Liste, création de compte, attribution de classes
9. [x] **Compétences** — Bibliothèque des 12 compétences avec descriptions et conseils
10. [x] **Évaluation** — Interface d'évaluation rapide : classe → compétence → grille d'élèves
11. [x] **Page Élève** — Radar des compétences, progression, historique des évaluations

## Icône de l'application

- [x] Icône avec fond bleu dégradé (`#3A7AFE` → `#1E5FCC`) et un symbole central blanc représentant un livre ouvert avec une étoile, évoquant l'apprentissage et l'excellence scolaire.
