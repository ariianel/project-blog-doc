---
title: Architecture
description: Comment le serveur C2 et le rootkit sont structurés et communiquent.
---

WLKOM est divisé en deux composants tournant sur des machines virtuelles séparées, hébergées sur le même laptop physique via QEMU/KVM. La VM victime charge le module noyau, qui se connecte au serveur C2 et interroge les instructions toutes les 5 secondes.

```
┌─────────────────────────────────────────────────────────────┐
│                MACHINE HÔTE (Arch Linux)                     │
│                                                             │
│  ┌──────────────────────┐      ┌───────────────────────┐   │
│  │    VM ATTAQUANTE     │      │     VM VICTIME        │   │
│  │                      │      │                       │   │
│  │  Serveur C2 Flask    │      │  Espace noyau         │   │
│  │  Python · SQLite     │◄────►│  wlkom.ko (LKM)       │   │
│  │  API REST + Web UI   │      │  kthread c2_poll      │   │
│  │  0.0.0.0:5000        │      │  Arch Linux           │   │
│  └──────────────────────┘      └───────────────────────┘   │
│              HTTP/1.0  ·  10.0.2.2:5000                     │
│                     QEMU / KVM                              │
└─────────────────────────────────────────────────────────────┘
```

## Protocole API C2

Le rootkit communique avec le serveur C2 en **HTTP/1.0** pur, implémenté entièrement dans l'espace noyau.

| Méthode | Route | Direction | Description |
|---------|-------|-----------|-------------|
| GET | `/register` | rootkit → C2 | Le module s'enregistre au chargement. Le serveur retourne un UUID. |
| GET | `/api/<uuid>/action` | rootkit → C2 | Interrogé toutes les 5 s. Retourne l'action suivante ou `204` si vide. |
| POST | `/api/<uuid>/result` | rootkit → C2 | Envoie le résultat d'une commande : `exit_code`, `stdout`, `stderr`. |
| POST | `/api/<uuid>/file/<path_b64>` | rootkit → C2 | Envoie un fichier de la victime vers le C2 (action download). Chemin encodé en base64 URL-safe. |
| GET | `/api/<uuid>/file/<path_b64>` | C2 → rootkit | Le rootkit récupère un fichier mis en attente (action upload). |

### Flux de communication

Au chargement, le rootkit :
1. Envoie `GET /register` → reçoit un UUID, le sauvegarde dans `/rootkit/uuid`
2. Démarre un `kthread` (`c2_poll_fn`) qui boucle toutes les 5 s
3. À chaque tick : `GET /api/<uuid>/action` → `204` (rien) ou `200 "exec:ls -la"` (action)
4. Sur action reçue : exécution, puis `POST /api/<uuid>/result`

:::note[Pourquoi base64 URL-safe pour les chemins de fichiers ?]
Les chemins comme `/etc/passwd` contiennent `/` qui casse le routage URL. Le base64 standard utilise aussi `+` et `/` (réservés dans les URLs). Le base64 URL-safe les remplace par `-` et `_`, rendant le chemin utilisable directement dans un segment d'URL sans encodage supplémentaire côté noyau.
:::

## Structure du module noyau

| Fichier | Rôle |
|---------|------|
| `wlkom_main.c` | Point d'entrée — appelle `hide_module()` puis `c2_init()` au chargement |
| `c2.c` | Client HTTP/1.0, enregistrement, polling, envoi de résultats, transfert de fichiers |
| `exec.c` | Exécution de commandes via `call_usermodehelper()` et reverse shell |
| `hide.c` | Retire le module de `lsmod`, `/proc/modules` et `/sys/module/` |
| `utils.c` | Helpers VFS noyau — `read_file()` et `write_file()` |
| `hook.c` | Hooks syscall : `getdents64` (cacher fichiers) et `read()` (cacher lignes) |

![Sortie dmesg après insmod wlkom.ko](/dmesg.png)

## Choix technologiques

**C — Module noyau**  
Le noyau Linux n'expose qu'une API C. Les modules doivent être écrits en C (ou assembleur). Pas de bibliothèque standard, pas de malloc, pas d'espace utilisateur — tout passe par les APIs noyau (`kmalloc`, `printk`, `sock_create_kern`…).

**Python — Serveur C2**  
Flask permet de développer rapidement une API HTTP avec un frontend web. SQLite via le module `sqlite3` standard donne un stockage persistant sans configuration supplémentaire.

**QEMU/KVM — Virtualisation**  
Requis par le sujet. QEMU/KVM fournit la virtualisation matérielle sur les laptops Arch Linux de l'école. La VM victime utilise le réseau user-mode ; l'hôte est accessible depuis la VM à `10.0.2.2`.

**Arch Linux — Distribution**  
Choisie pour les deux VMs car elle correspond aux laptops de l'école, fournit un noyau récent et le paquet `linux-headers` nécessaire à la compilation de modules hors-arbre.

:::note[Pourquoi le noyau 6.6 LTS spécifiquement ?]
Les noyaux récents imposent des politiques de sécurité plus strictes qui rendent le hooking de syscall significativement plus difficile. Notre implémentation cible **Linux 6.6 LTS**, sur lequel toutes nos techniques fonctionnent sans désactiver Secure Boot ou le mode lockdown. Voir [Choix techniques](/fr/choices) pour le détail.
:::

## Tableau de bord C2

![Tableau de bord WLKOM C2](/c2-dashboard.png)
