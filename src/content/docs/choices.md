---
title: Design Choices & Failed Attempts
description: Every non-obvious decision made for WLKOM, why it was made, and what was tried before landing on the final approach.
---

Every non-obvious decision made for WLKOM, why it was made, and what was tried before landing on the final approach.

## Rootkit type: LKM vs alternatives

Three main categories of Linux rootkits exist.

**LD_PRELOAD userland hook — Rejected**

Intercepts libc calls (`open`, `read`, `getdents64`…) by injecting a shared library via the `LD_PRELOAD` environment variable.

- Only affects processes started with the env var set
- Does not affect processes that bypass libc (direct syscalls)
- Trivially detected: `env | grep LD_PRELOAD`
- Does not survive reboots naturally
- No kernel-level visibility

**eBPF rootkit — Rejected**

Attaches eBPF programs to kernel tracepoints or kprobes to intercept and modify kernel behavior without a loadable module.

- Requires kernel ≥ 5.7 with BTF and CO-RE support
- Requires `CAP_BPF` / `CAP_SYS_ADMIN` capability
- The eBPF verifier actively limits what programs can do (no arbitrary memory writes)
- Excellent for monitoring but limited for active rootkit operations
- More modern approach, interesting but beyond our scope

**Linux Kernel Module (LKM) — Chosen**

A `.ko` file loaded with `insmod` that runs in ring 0, the same privilege level as the kernel itself.

- Full access to kernel internals, memory, syscall table, network stack
- Can hook any syscall
- Explicit compile-time integration with the running kernel (`linux-headers`)
- Required `insmod` as initial infection vector — acceptable for a pedagogical project
- Matches exactly what the project subject asks for

## Kernel version choice

See the [Setup guide](/setup#why-kernel-66-lts-and-not-newer) for the detailed breakdown. In summary:

- `kallsyms_lookup_name()` was removed from exported symbols in kernel ≥ 5.7 (recovered via kprobe)
- `CONFIG_STRICT_KERNEL_RWX` is enabled by default on Arch Linux, ruling out CR0-based syscall table patching
- Kernel lockdown mode (≥ 5.4) blocks unsigned modules on hardened distributions

**Linux 6.6 LTS** is the most recent LTS where ftrace hooking and `call_usermodehelper` work reliably on the school's Arch Linux laptops.

## Distro choice

**Arch Linux** was chosen for both VMs because:

1. The school laptops already run Arch — package names and kernel version are consistent
2. Rolling release: `linux` and `linux-headers` always stay in sync, no kernel/headers mismatch
3. `archinstall` lets us version-control the full VM environment as JSON config files, making it 100% reproducible
4. Provides `linux-headers` for out-of-tree module compilation against the exact running kernel

## C2 technology

**Flask — Chosen over alternatives**

Flask was chosen because it allows rapid development of an HTTP API with a web frontend in a single process. SQLite via the standard `sqlite3` module gives persistent storage without any extra setup or separate database server.

Alternatives considered:
- **Express/Node.js** — would have worked, but Python was the familiar choice for the team, and Flask's synchronous model matches the simple polling architecture perfectly
- **FastAPI** — more modern but adds complexity (async, Pydantic models) that was not needed for this scale
- **Raw HTTP server** — too much boilerplate for the dashboard features needed

## Communication protocol

**HTTP/1.0 — Chosen over WebSockets or raw TCP**

The rootkit needs to communicate from kernel space using only low-level TCP socket APIs (`sock_create`, `kernel_connect`, `kernel_sendmsg`, `kernel_recvmsg`).

HTTP/1.0 was chosen because:
- **Connection closes after each response** — no persistent connection state to manage in the kernel
- **No chunked transfer encoding** — `Content-Length` or EOF marks the end
- **Simple text format** — easy to hand-write as byte strings in C
- **Stateless** — each poll is completely independent

WebSockets would require a persistent connection and HTTP upgrade handshake — significant complexity in kernel space. Raw TCP would require inventing a custom protocol, which adds development time for no educational benefit.

## Command execution design

**`call_usermodehelper()` with temp files — Chosen**

The challenge: kernel threads have no file descriptors, no TTY, no access to stdio. Running a shell command from the kernel and capturing its output requires bridging kernel space to userland.

The solution:
1. Build a shell one-liner that redirects stdout/stderr to temp files: `cmd > /rootkit/stdout 2> /rootkit/stderr; echo $? > /rootkit/exitcode`
2. Call `call_usermodehelper("/bin/sh", argv, envp, UMH_WAIT_PROC)` — blocks until the shell exits
3. Read back the temp files with kernel VFS helpers

Alternative rejected: using pipes or sockets from kernel to userland would require setting up file descriptors in the kernel context — significantly more complex and fragile.

## Syscall hooking approach

**ftrace — Chosen over direct CR0 patching**

Two approaches exist for replacing a syscall handler:

**Direct syscall table patching:**
1. Find `sys_call_table` via `kallsyms_lookup_name` (recovered via kprobe)
2. Clear WP bit in CR0
3. Overwrite the function pointer
4. Restore WP bit

**ftrace-based hooking:**
1. Resolve the target syscall symbol via `get_symbol()` (kprobe trick for `kallsyms_lookup_name`)
2. Register a `ftrace_ops` callback with `FTRACE_OPS_FL_SAVE_REGS | FTRACE_OPS_FL_IPMODIFY`
3. The callback redirects `regs->ip` to the hook function, with a `within_module` guard against recursion

We tried direct patching first and it **failed**. On our Arch Linux VM with kernel 6.6, `CONFIG_STRICT_KERNEL_RWX` is enabled, which makes the MMU enforce read-only permissions on kernel pages independently of CR0. Clearing the WP bit in CR0 does not bypass the MMU — any write to a protected page triggers an immediate kernel panic:

```
[  42.317] BUG: unable to handle page fault for address: ffffffffc0a3e120
[  42.317] #PF: supervisor write access in kernel mode
[  42.317] #PF: error_code(0x0003) - permissions violation
```

ftrace is compatible with `CONFIG_STRICT_KERNEL_RWX` because it writes to code pages through `text_poke()`, which creates a temporary writable mapping without touching CR0 or MMU permissions directly. It is the kernel's own mechanism for live code patching and works on all modern kernels.

## Upload/Download design

See the [Upload/Download](/rootkit/upload-download) page for the full story. Key decision: **URL-safe base64 for file paths in the URL** rather than a custom header.

The initial `X-Filename` header approach caused code duplication and race conditions. Embedding the path in the URL allows reuse of existing `http_get()` / `http_post()` helpers and gives each file transfer a unique URL.

## Security features disabled

These security features are disabled in the victim VM by design, with justification:

**`PermitRootLogin yes` in sshd**  
Enabled to facilitate file deployment via `scp`. In a real context this is a significant risk. Here it is justified because the VM is isolated and serves only for development.

**Kernel without Secure Boot**  
Secure Boot is not activated in QEMU (not enabled by default). With Secure Boot active, unsigned kernel modules would be refused at load time with `Operation not permitted`. Signing the module would require a Machine Owner Key (MOK), which is outside the scope of this pedagogical project.

**Kernel without lockdown mode**  
The Arch Linux 6.6 kernel is not compiled with `CONFIG_SECURITY_LOCKDOWN_LSM` active by default. In confidentiality lockdown mode, `call_usermodehelper` is blocked, which would prevent our rootkit from executing userland commands from the kernel. We verified this is not the case on our VM kernel.
