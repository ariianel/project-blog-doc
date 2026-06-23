---
title: Choix techniques & tentatives échouées
description: Chaque décision non évidente prise pour WLKOM, pourquoi elle a été prise, et ce qui a été essayé avant d'arriver à l'approche finale.
---

Chaque décision non évidente prise pour WLKOM, pourquoi elle a été prise, et ce qui a été essayé avant d'arriver à l'approche finale.

## Type de rootkit : LKM vs alternatives

Trois grandes catégories de rootkits Linux existent.

**Hook LD_PRELOAD en espace utilisateur — Rejeté**

Intercepte les appels libc (`open`, `read`, `getdents64`…) en injectant une bibliothèque partagée via la variable d'environnement `LD_PRELOAD`.

- N'affecte que les processus démarrés avec la variable d'environnement positionnée
- N'affecte pas les processus qui contournent libc (syscalls directs)
- Détectable trivialement : `env | grep LD_PRELOAD`
- Ne survit pas aux redémarrages naturellement
- Pas de visibilité au niveau noyau

**Rootkit eBPF — Rejeté**

Attache des programmes eBPF à des tracepoints ou kprobes noyau pour intercepter et modifier le comportement du noyau sans module chargeable.

- Nécessite un noyau ≥ 5.7 avec le support BTF et CO-RE
- Nécessite la capacité `CAP_BPF` / `CAP_SYS_ADMIN`
- Le vérificateur eBPF limite activement ce que les programmes peuvent faire (pas d'écriture mémoire arbitraire)
- Excellent pour le monitoring mais limité pour les opérations actives de rootkit
- Approche plus moderne, intéressante mais hors de notre portée

**Module noyau Linux (LKM) — Choisi**

Un fichier `.ko` chargé avec `insmod` qui tourne en ring 0, le même niveau de privilège que le noyau lui-même.

- Accès complet aux internals du noyau, à la mémoire, à la table des syscalls, à la pile réseau
- Peut hooker n'importe quel syscall
- Intégration explicite au noyau en cours à la compilation (`linux-headers`)
- Nécessite `insmod` comme vecteur d'infection initial — acceptable pour un projet pédagogique
- Correspond exactement à ce que le sujet demande

## Choix de la version du noyau

Voir le [guide d'installation](/fr/setup#pourquoi-le-noyau-66-lts-et-pas-plus-récent) pour le détail. En résumé :

- `kallsyms_lookup_name()` a été retirée des symboles exportés dans les noyaux ≥ 5.7 (retrouvée via kprobe)
- `CONFIG_STRICT_KERNEL_RWX` est activé par défaut sur Arch Linux, rendant le patch CR0 de la table des syscalls impossible
- Le mode lockdown noyau (≥ 5.4) bloque les modules non signés sur les distributions renforcées

**Linux 6.6 LTS** est le LTS le plus récent sur lequel le hooking ftrace et `call_usermodehelper` fonctionnent de manière fiable sur les laptops Arch Linux de l'école.

## Choix de la distribution

**Arch Linux** a été choisi pour les deux VMs parce que :

1. Les laptops de l'école tournent déjà sous Arch — noms de paquets et version du noyau cohérents
2. Rolling release : `linux` et `linux-headers` sont toujours synchronisés, pas de décalage noyau/headers
3. `archinstall` permet de versionner l'environnement VM complet sous forme de fichiers de config JSON, le rendant 100% reproductible
4. Fournit `linux-headers` pour la compilation de modules hors-arbre contre le noyau exact en cours d'exécution

## Technologie C2

**Flask — Choisi parmi les alternatives**

Flask a été choisi car il permet de développer rapidement une API HTTP avec un frontend web dans un seul processus. SQLite via le module `sqlite3` standard donne un stockage persistant sans serveur de base de données séparé.

Alternatives considérées :
- **Express/Node.js** — aurait fonctionné, mais Python était le choix familier pour l'équipe, et le modèle synchrone de Flask correspond parfaitement à l'architecture de polling simple
- **FastAPI** — plus moderne mais ajoute de la complexité (async, modèles Pydantic) non nécessaire à cette échelle
- **Serveur HTTP brut** — trop de boilerplate pour les fonctionnalités de tableau de bord nécessaires

## Protocole de communication

**HTTP/1.0 — Choisi parmi WebSockets ou TCP brut**

Le rootkit doit communiquer depuis l'espace noyau en utilisant uniquement des APIs TCP bas niveau (`sock_create`, `kernel_connect`, `kernel_sendmsg`, `kernel_recvmsg`).

HTTP/1.0 a été choisi parce que :
- **La connexion se ferme après chaque réponse** — pas d'état de connexion persistante à gérer dans le noyau
- **Pas de chunked transfer encoding** — `Content-Length` ou EOF marque la fin
- **Format texte simple** — facile à écrire manuellement sous forme de chaînes d'octets en C
- **Sans état** — chaque poll est complètement indépendant

Les WebSockets nécessiteraient une connexion persistante et une négociation d'upgrade HTTP — complexité significative en espace noyau. TCP brut nécessiterait d'inventer un protocole personnalisé, ce qui ajoute du temps de développement sans bénéfice pédagogique.

## Conception de l'exécution de commandes

**`call_usermodehelper()` avec fichiers temporaires — Choisi**

Le défi : les threads noyau n'ont pas de descripteurs de fichiers, pas de TTY, pas d'accès à stdio. Exécuter une commande shell depuis le noyau et capturer sa sortie nécessite de faire le pont entre l'espace noyau et l'espace utilisateur.

La solution :
1. Construire un one-liner shell qui redirige stdout/stderr vers des fichiers temporaires : `cmd > /rootkit/stdout 2> /rootkit/stderr; echo $? > /rootkit/exitcode`
2. Appeler `call_usermodehelper("/bin/sh", argv, envp, UMH_WAIT_PROC)` — bloque jusqu'à la fin du shell
3. Relire les fichiers temporaires avec les helpers VFS noyau

Alternative rejetée : utiliser des pipes ou sockets du noyau vers l'espace utilisateur nécessiterait de créer des descripteurs de fichiers dans le contexte noyau — significativement plus complexe et fragile.

## Approche de hooking des syscalls

**ftrace — Choisi plutôt que le patch direct CR0**

Deux approches existent pour remplacer un gestionnaire de syscall :

**Patch direct de la table des syscalls :**
1. Trouver `sys_call_table` via `kallsyms_lookup_name` (récupérée via kprobe)
2. Effacer le bit WP dans CR0
3. Écraser le pointeur de fonction
4. Restaurer le bit WP

**Hook basé sur ftrace :**
1. Résoudre le symbole du syscall cible via `get_symbol()` (astuce kprobe pour `kallsyms_lookup_name`)
2. Enregistrer un callback `ftrace_ops` avec `FTRACE_OPS_FL_SAVE_REGS | FTRACE_OPS_FL_IPMODIFY`
3. Le callback redirige `regs->ip` vers la fonction hook, avec un guard `within_module` contre la récursion

Nous avons d'abord essayé le patch direct — il **a échoué**. Sur notre VM Arch Linux avec le noyau 6.6, `CONFIG_STRICT_KERNEL_RWX` est activé, ce qui fait enforcer par la MMU les permissions read-only sur les pages noyau indépendamment de CR0. Effacer le bit WP dans CR0 ne contourne pas la MMU — toute écriture dans une page protégée déclenche un kernel panic immédiat :

```
[  42.317] BUG: unable to handle page fault for address: ffffffffc0a3e120
[  42.317] #PF: supervisor write access in kernel mode
[  42.317] #PF: error_code(0x0003) - permissions violation
```

ftrace est compatible avec `CONFIG_STRICT_KERNEL_RWX` car il écrit dans les pages de code via `text_poke()`, qui crée un mapping temporaire en écriture sans toucher à CR0 ni aux permissions MMU directement. C'est le propre mécanisme du noyau pour le live code patching, et il fonctionne sur tous les noyaux modernes.

## Conception Upload/Download

Voir la page [Upload / Download](/fr/rootkit/upload-download) pour l'histoire complète. Décision clé : **base64 URL-safe pour les chemins de fichiers dans l'URL** plutôt qu'un en-tête personnalisé.

L'approche initiale avec l'en-tête `X-Filename` causait de la duplication de code et des conditions de course. Intégrer le chemin dans l'URL permet de réutiliser les helpers `http_get()` / `http_post()` existants et donne à chaque transfert de fichier une URL unique.

## Fonctionnalités de sécurité désactivées

Ces fonctionnalités de sécurité sont désactivées dans la VM victime par conception, avec justification :

**`PermitRootLogin yes` dans sshd**  
Activé pour faciliter le déploiement de fichiers via `scp`. Dans un contexte réel, c'est un risque significatif. Ici c'est justifié car la VM est isolée et sert uniquement au développement.

**Noyau sans Secure Boot**  
Le Secure Boot n'est pas activé dans QEMU (non activé par défaut). Avec Secure Boot actif, les modules noyau non signés (`wlkom.ko`) seraient refusés au chargement avec `Operation not permitted`. Signer le module nécessiterait une clé MOK (Machine Owner Key), ce qui sort du cadre de ce projet pédagogique.

**Noyau sans mode lockdown**  
Le noyau Arch Linux 6.6 n'est pas compilé avec `CONFIG_SECURITY_LOCKDOWN_LSM` actif par défaut. En mode lockdown confidentialité, `call_usermodehelper` est bloqué, ce qui empêcherait notre rootkit d'exécuter des commandes userland depuis le noyau. Nous avons vérifié que ce n'est pas le cas sur notre noyau VM.
