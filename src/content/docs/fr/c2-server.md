---
title: Serveur C2
description: Documentation technique du serveur Flask de commande et contrôle WLKOM.
---

Une application Flask qui fait office de serveur de commande et contrôle : gestion des machines victimes, envoi de commandes, transfert de fichiers.

**Python 3 · Flask · SQLite · Jinja2 · AJAX**

## Vue d'ensemble

Le serveur C2 expose deux interfaces tournant dans le même processus Flask sur le port 5000 :

- **Tableau de bord web** — interface protégée par mot de passe pour l'opérateur. Affiche toutes les machines connectées en temps réel, permet d'envoyer des commandes, d'uploader/télécharger des fichiers et de consulter les résultats.
- **API rootkit** — API REST HTTP/1.0 non authentifiée consommée par le module noyau. Gère l'enregistrement, le polling d'actions, la soumission de résultats et le transfert de fichiers binaires.

## Schéma de base de données

Tout l'état est persisté dans un seul fichier SQLite (`c2.db`), géré par `database.py`.

**`machines`** — une ligne par instance de rootkit enregistrée

| Colonne | Type | Description |
|---------|------|-------------|
| `uuid` | TEXT PK | Identifiant unique de l'instance rootkit |
| `ip` | TEXT | Dernière adresse IP vue |
| `registered_at` | TEXT | Horodatage d'enregistrement |
| `last_seen` | TEXT | Dernier polling (utilisé pour détecter la connexion) |

**`actions`** — file d'attente des commandes à consommer par le rootkit

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT PK | ID de l'action |
| `machine_uuid` | FK | Machine cible |
| `command` | TEXT | Chaîne d'action (ex. `exec:ls -la`) |
| `consumed` | INT | 0 = en attente, 1 = consommée |
| `created_at` | TEXT | Horodatage |

**`results`** — sorties des commandes renvoyées par le rootkit

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT PK | |
| `machine_uuid` | FK | Machine source |
| `command` | TEXT | Commande exécutée |
| `exit_code` | INT | Code de retour |
| `stdout` | TEXT | Sortie standard |
| `stderr` | TEXT | Sortie d'erreur |

**`transfers`** — historique de tous les uploads et downloads

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT PK | |
| `machine_uuid` | FK | |
| `direction` | TEXT | `'upload'` ou `'download'` |
| `remote_path` | TEXT | Chemin sur la victime |
| `local_path` | TEXT | Chemin sur le serveur C2 |
| `size` | INT | Taille du fichier en octets |

## Routes

### Frontend (opérateur)

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/login` | Page de connexion |
| POST | `/login` | Authentification avec `ADMIN_PASSWORD` depuis `.env` |
| GET | `/` | Tableau de bord — liste des machines, actions, résultats, transferts |
| GET | `/api/poll` | Endpoint AJAX, retourne l'état complet en JSON (interrogé toutes les 3 s) |
| POST | `/action/<uuid>` | Mettre en file une commande pour une machine |
| POST | `/stage/<uuid>` | Uploader un fichier depuis le navigateur et le préparer pour livraison |
| GET | `/download/<uuid>/<id>` | Télécharger un fichier reçu de la victime |
| POST | `/logs/<uuid>/clear` | Effacer toutes les actions et résultats d'une machine |

### API rootkit

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/register` | Enregistrer une nouvelle machine ; retourne un UUID en texte brut |
| GET | `/api/<uuid>/action` | Dépiler l'action en attente la plus ancienne ; retourne `verb:args` ou `204` |
| POST | `/api/<uuid>/result` | Stocker la sortie d'une commande ; corps : `command`, `exit_code`, `stdout`, `stderr` |
| POST | `/api/<uuid>/file/<path_b64>` | Recevoir un fichier de la victime (action download) ; corps binaire brut |
| GET | `/api/<uuid>/file/<path_b64>` | Servir un fichier mis en attente à la victime (action upload) |

## Tableau de bord

![Tableau de bord WLKOM C2](/c2-dashboard.png)

- **Statut des machines en direct** — chaque machine affiche un point vert/rouge mis à jour toutes les 5 secondes via AJAX. Une machine est considérée en ligne si son `last_seen` date de moins de 15 secondes.
- **Modal d'action** — cliquer sur **+ Action** pour ouvrir un modal avec quatre types d'actions : Exécuter une commande, Télécharger un fichier, Uploader un fichier, Reverse Shell.
- **Polling AJAX** — le tableau de bord interroge `/api/poll` toutes les 3 secondes et met à jour le statut, l'historique des actions, les résultats et les transferts sans rechargement de page.
- **Panneau des transferts** — affiche tous les uploads (↑) et downloads (↓) avec leur taille et horodatage.

![Modal de sélection d'action C2](/c2-action.png)

## Authentification

Le tableau de bord est protégé par un mot de passe stocké dans `.env`, jamais en dur dans le source. L'API rootkit n'a pas d'authentification (par conception pour ce projet pédagogique).

```sh
# .env
SECRET_KEY=votre-cle-secrete-longue-et-aleatoire
ADMIN_PASSWORD=votremotdepasse
```

Les sessions sont gérées par le mécanisme de cookie signé de Flask via `SECRET_KEY`. Le décorateur `@login_required` protège toutes les routes opérateur.

![Page de connexion WLKOM C2](/c2-login-interface.png)

## Interface asynchrone (polling AJAX)

### Le problème initial

La première version du tableau de bord était entièrement statique. Après l'envoi d'une commande, l'opérateur devait recharger manuellement la page pour voir si le rootkit l'avait récupérée.

### La solution

Le tableau de bord exécute une boucle JavaScript qui appelle `GET /api/poll` toutes les 3 secondes. Le serveur répond avec l'état complet des machines en JSON. JavaScript met alors à jour uniquement ce qui a changé, sans rechargement de page.

```js
async function poll() {
    const res  = await fetch('/api/poll');
    const data = await res.json();
    updateMachines(data.machines);   // points de statut
    updateResults(data.results);     // sortie des commandes
    updateTransfers(data.transfers); // historique des transferts
}

setInterval(poll, 3000);  // toutes les 3 s
poll();                   // premier appel immédiat
```

### Décisions de conception

**Polling HTTP plutôt que WebSockets** — les WebSockets nécessitent une connexion persistante et un état côté serveur plus complexe. Comme le rootkit lui-même fonctionne sur un modèle de beaconing (il se manifeste périodiquement), cadencer le tableau de bord sur le même rythme garde l'architecture cohérente.

**JavaScript vanilla, sans framework** — utiliser `fetch()` natif et les APIs DOM plutôt que React ou Vue garde le projet sans dépendance frontend. Un outil C2 doit être léger et autonome.

**Endpoint unique `/api/poll`** — plutôt que plusieurs endpoints pour les machines, résultats et transferts, un seul endpoint retourne tout en une payload JSON. Une requête par tick, un endroit à mettre à jour.

## Détection de connexion

Il n'y a pas de connexion TCP persistante entre le rootkit et le C2. Le serveur infère l'état de connexion à partir de la fréquence de polling.

À chaque fois que le rootkit interroge `GET /api/<uuid>/action`, le serveur met à jour le timestamp `last_seen` dans la table `machines`. Une machine est considérée **en ligne** si `last_seen` date de moins de **15 secondes** (au plus 3 polls manqués à 5 secondes d'intervalle). Si le rootkit est déchargé ou que la victime tombe, la machine passe au rouge en moins de 15 secondes.
