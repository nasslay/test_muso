# Muso Moderation Web

## Description

Muso Moderation Web est une interface d'administration et de modération pour la plateforme Muso. Elle permet de gérer les utilisateurs, les signalements, les actions administrateur et d'afficher les statistiques de réputation et d'activité pour chaque profil.

## Vérification des statistiques utilisateurs

> **Important :**
>
> Si les statistiques (points, signalements, votes, etc.) affichées dans les profils restent à zéro, il faut vérifier dans la console Firebase (Firestore) que les champs suivants sont bien renseignés pour chaque utilisateur :
>
> - `reputationScore`, `score`, `points`
> - `stats` (ou `reportStats`)
> - `totalReports`, `reportsCreated`, `createdReports`
> - `votes`, `voteCount`, `totalVotes`
>
> Si ces champs sont absents ou à zéro, l'interface affichera des valeurs nulles. Il est aussi possible d'utiliser une collection dédiée (ex : `user_stats`) pour stocker les statistiques, à condition d'adapter le code pour les lire.

## Fonctionnalités principales

  
Server-side admin actions
--------------------------------
This project now includes server-side Firebase Cloud Functions that implement admin-only actions (ban, unban, quarantine, reset reputation, adjust score, add admin note, delete post/user, moderate reports). These functions provide secure, auditable updates and trigger notification workflows.

Deployment & test
--------------------------------
From the `akha/functions` directory, deploy functions with the Firebase CLI:

```bash
cd akha/functions
firebase deploy --only functions
```

The moderation web UI (`webmuso/muso-moderation-web`) will automatically call these functions when available. If functions are not deployed, the UI falls back to client-side Firestore writes (still requires admin privileges in `users` document).

Quick test
--------------------------------
Open the moderation UI, login as an admin (your `users/{uid}.isAdmin` must be `true`).
Open the browser console and run an example call:

```javascript
// adjust score by -25
AdminActionsService.adjustUserScore({ userId: '<target-uid>', scoreChange: -25, reason: 'Test' }).then(console.log).catch(console.error)
```

If functions are deployed, the callable will return the server response and an `admin_actions` document will be created, triggering notification logic. If not, the UI will perform Firestore writes directly.

## Dépendances

- Firebase (Firestore, Auth)
- Material Icons




