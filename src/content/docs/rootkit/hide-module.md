---
title: Hide from Module List
description: The rootkit removes itself from lsmod, /proc/modules, and /sys/module/.
---

Once loaded, the module removes itself from `lsmod`, `/proc/modules`, and `/sys/module/`, making it invisible to standard introspection tools.

## How the kernel tracks loaded modules

The kernel maintains a global doubly-linked list of every loaded module. Each `struct module` contains a `struct list_head list` field — a pair of `next`/`prev` pointers that links it into the global `modules` list.

```
modules  ←→  [module A]  ←→  [module B]  ←→  [wlkom]  ←→  [module C]  ←→ …
                list               list          list           list
```

When you run `lsmod`, the kernel walks this list from head to tail and prints each entry. `/proc/modules` is generated the same way — it is a sequential file that iterates the same list.

In addition, each module has a `struct module_kobject mkobj` which embeds a `struct kobject kobj`. When a module is loaded, its kobject is inserted into the sysfs hierarchy under `/sys/module/<name>/`. Tools like `modinfo` and `systool` read from there.

## What hide_module() does

```c
void hide_module(void)
{
    list_del_init(&THIS_MODULE->list);
    kobject_del(&THIS_MODULE->mkobj.kobj);
}
```

`list_del_init` unlinks the module's `list` node from the doubly-linked list by rewiring the adjacent nodes to point to each other, then resets the node's own pointers to point to itself (so it is a valid but isolated node):

```
before:  … ←→ [module B] ←→ [wlkom] ←→ [module C] ←→ …
after:   … ←→ [module B] ←→ [module C] ←→ …
                                 [wlkom] (isolated, self-referential)
```

From this point, iterating the global modules list skips `wlkom` entirely. `lsmod` and `/proc/modules` no longer show it.

`kobject_del` detaches the module's kobject from the sysfs tree. The `/sys/module/wlkom/` directory disappears, so tools that query sysfs also come up empty.

## Effect

| Tool | Before | After |
|------|--------|-------|
| `lsmod` | shows `wlkom` | no entry |
| `cat /proc/modules` | shows `wlkom` | no entry |
| `ls /sys/module/` | shows `wlkom/` | no entry |
| `modinfo wlkom` | returns metadata | `ERROR: Module wlkom not found` |

The module is still fully active in the kernel — its code runs, its hooks fire, its polling thread keeps running. Only the bookkeeping entries are gone.
