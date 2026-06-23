---
title: Architecture
description: How the C2 server and the rootkit are structured and communicate.
---

WLKOM is split into two components running on separate virtual machines hosted on the same physical laptop via QEMU/KVM. The victim VM loads the kernel module, which connects back to the C2 server and polls for instructions every 5 seconds.

```
┌─────────────────────────────────────────────────────────────┐
│                HOST MACHINE (Arch Linux)                     │
│                                                             │
│  ┌──────────────────────┐      ┌───────────────────────┐   │
│  │    ATTACKER VM       │      │      VICTIM VM        │   │
│  │                      │      │                       │   │
│  │  Flask C2 Server     │      │  Kernel Space         │   │
│  │  Python · SQLite     │◄────►│  wlkom.ko (LKM)       │   │
│  │  REST API + Web UI   │      │  c2_poll kthread      │   │
│  │  0.0.0.0:5000        │      │  Arch Linux           │   │
│  └──────────────────────┘      └───────────────────────┘   │
│              HTTP/1.0  ·  10.0.2.2:5000                     │
│                     QEMU / KVM                              │
└─────────────────────────────────────────────────────────────┘
```

## C2 API Protocol

The rootkit communicates with the C2 server over plain **HTTP/1.0**, implemented entirely in kernel space.

| Method | Route | Direction | Description |
|--------|-------|-----------|-------------|
| GET | `/register` | rootkit → C2 | Module registers on load. Server returns a UUID (plain text). |
| GET | `/api/<uuid>/action` | rootkit → C2 | Polled every 5 s. Returns next pending action or `204` if none. |
| POST | `/api/<uuid>/result` | rootkit → C2 | Posts command output back. Body: `exit_code`, `stdout`, `stderr`. |
| POST | `/api/<uuid>/file/<path_b64>` | rootkit → C2 | Rootkit sends a file to C2 (download action). Path encoded as URL-safe base64. |
| GET | `/api/<uuid>/file/<path_b64>` | C2 → rootkit | Rootkit fetches a staged file (upload action). |

### Communication flow

On load, the rootkit:
1. Sends `GET /register` → receives a UUID, saves it to `/rootkit/uuid`
2. Spawns a `kthread` (`c2_poll_fn`) that loops every 5 s
3. Each tick: `GET /api/<uuid>/action` → `204` (nothing) or `200 "exec:ls -la"` (action)
4. On action received: execute, then `POST /api/<uuid>/result`

:::note[Why URL-safe base64 for file paths?]
File paths like `/etc/passwd` contain `/` which breaks URL routing. Standard base64 also uses `+` and `/` (reserved in URLs). URL-safe base64 replaces them with `-` and `_`, making the path safe to embed in a URL segment without additional encoding logic in kernel space.
:::

## Kernel module structure

The rootkit is split into focused translation units, each responsible for one feature.

| File | Role |
|------|------|
| `wlkom_main.c` | Module entry point — calls `hide_module()` then `c2_init()` on load |
| `c2.c` | HTTP/1.0 client, registration, action polling, result posting, file transfer |
| `exec.c` | Command execution via `call_usermodehelper()` and reverse shell |
| `hide.c` | Removes the module from `lsmod`, `/proc/modules`, and `/sys/module/` |
| `utils.c` | Kernel VFS helpers — `read_file()` and `write_file()` |
| `hook.c` | Syscall table hooking: `getdents64` (hide files) and `read()` (hide lines) |

![dmesg output after insmod wlkom.ko](/dmesg.png)

## Technology choices

**C — Kernel Module**
The Linux kernel only exposes a C API. Kernel modules must be written in C (or assembly). No standard library, no malloc, no userspace — everything goes through kernel APIs (`kmalloc`, `printk`, `sock_create_kern`…).

**Python — C2 Server**
Flask allows rapid development of an HTTP API with a web frontend. SQLite via the standard `sqlite3` module gives persistent storage without extra setup. The entire server runs in a single process.

**QEMU/KVM — Virtualization**
Required by the subject. QEMU/KVM provides hardware virtualization on the school's Arch Linux laptops. The victim VM uses user-mode networking; the host is reachable from the VM at `10.0.2.2`, passed as the `c2_host` parameter at `insmod` time.

**Arch Linux — Distribution**
Chosen for both VMs because it matches the school laptops, ships with a recent kernel, and provides the `linux-headers` package needed to compile out-of-tree kernel modules against the running kernel version.

:::note[Why kernel 6.6 LTS specifically?]
Recent kernels enforce stricter security policies — lockdown mode and restricted `/proc/kallsyms` access make syscall hooking significantly harder without disabling specific kernel features. Our implementation targets **Linux 6.6 LTS** (the default on current Arch), which still allows the syscall table manipulation used by the hide feature without requiring Secure Boot or lockdown mode to be disabled. See [Design Choices](/choices) for the full breakdown.
:::

## C2 Dashboard

![WLKOM C2 dashboard](/c2-dashboard.png)
