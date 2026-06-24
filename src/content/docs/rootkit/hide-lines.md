---
title: Hide Lines from Files
description: Hooks the read syscall via ftrace to strip lines containing wlkom from file reads.
---

This feature is implemented using the ftrace-based syscall hook described in [Syscall Hooking](/rootkit/syscall-hooking).

The rootkit hooks the `read` syscall via ftrace to strip any line containing `wlkom` from the content of regular files before it reaches user-space. This covers:

- `/etc/modules-load.d/wlkom.conf` — the systemd auto-load entry that would reveal the module name at boot.
- `/etc/modprobe.d/wlkom.conf` — the modprobe options file containing the C2 IP and the MD5-hashed password.

The files are not modified on disk; the hook rewrites the read buffer in-flight, so the data never reaches user-space.
