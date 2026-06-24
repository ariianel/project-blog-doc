---
title: Hide Files & Directories
description: Hooks getdents64 via ftrace to filter directory listings before they reach user-space.
---

The rootkit hooks `getdents64` via ftrace to filter directory listings before they reach user-space.

```
[root@archlinux ~]# ls -l /rootkit/        # directory appears empty — inode match hides all entries
total 0
[root@archlinux ~]# ls / | grep rootkit    # /rootkit itself is not listed in /
[root@archlinux ~]# ls -l /rootkit/uuid    # but the file exists when accessed by direct path
-rw------- 1 root root 36 Jun 24 15:18 /rootkit/uuid

[root@archlinux ~]# ls -l /etc/modprobe.d/         # wlkom.conf is not listed
total 0
[root@archlinux ~]# ls -l /etc/modprobe.d/wlkom.conf   # but it exists by direct path
-rw-r--r-- 1 root root 87 Jun 24 11:31 /etc/modprobe.d/wlkom.conf
[root@archlinux ~]# ls -l /etc/modules-load.d/     # same for modules-load.d
total 0
[root@archlinux ~]# ls -l /etc/modules-load.d/wlkom.conf
-rw-r--r-- 1 root root 6 Jun 24 11:31 /etc/modules-load.d/wlkom.conf
```

All hidden files and directories exist on disk and are accessible by direct path, but are invisible to any tool that uses `getdents64` (ls, find, ...).

This feature is implemented using the ftrace-based syscall hook described in [Syscall Hooking](/rootkit/syscall-hooking).

## How it works

- Any file or directory whose name starts with `rootkit` or `wlkom` is silently removed from `getdents64` results, making it invisible to `ls`, `find`, and any tool that calls `getdents64`.
- The `/rootkit` directory (where the UUID and command output are stored) is matched by inode and always appears completely empty.
