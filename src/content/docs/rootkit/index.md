---
title: Rootkit (LKM)
description: Overview of the wlkom.ko kernel module features.
---

`wlkom.ko` is a Linux Kernel Module loaded on the victim machine. Once loaded, it hides itself from the module list, registers with the C2 server, and polls it every 5 seconds for commands.

## Features

| Feature | Description |
|---------|-------------|
| [Connection & Polling](/rootkit/connection) | Registers with the C2 on load, polls every 5 s, retries on disconnect |
| [Execute Commands](/rootkit/exec) | Runs arbitrary shell commands and posts stdout/stderr/exit code back |
| [Reverse Shell](/rootkit/reverse-shell) | Opens an interactive bash session back to the attacker |
| [Encrypted Shell](/rootkit/encrypted-shell) | XOR-encrypted authenticated interactive shell |
| [Upload / Download](/rootkit/upload-download) | Transfers files in both directions between C2 and victim |
| [Hide from Module List](/rootkit/hide-module) | Invisible in `lsmod`, `/proc/modules`, and `/sys/module/` |
| [Hide Files & Directories](/rootkit/hide-files) | Filters `getdents64` results to hide files and directories |
| [Hide Lines from Files](/rootkit/hide-lines) | Strips lines from `read()` results before they reach user-space |

## Source layout

| File | Role |
|------|------|
| `src/wlkom_main.c` | Module entry/exit, calls hide and C2 init |
| `src/hide.c` | Removes the module from `lsmod` / `/proc/modules` / sysfs; hooks `read` to hide `wlkom.conf` |
| `src/c2.c` | C2 registration, UUID persistence, polling thread |
| `src/exec.c` | Command execution (`call_usermodehelper`) and plain reverse shell |
| `src/eshell.c` | XOR-encrypted interactive shell (auth + framed protocol) |
| `src/utils.c` | Filesystem helpers: `read_file`, `write_file`, `ensure_rootkit_dir` |
