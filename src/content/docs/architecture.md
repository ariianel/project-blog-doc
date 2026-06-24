---
title: Architecture
description: How the two virtual machines are structured and communicate.
---

Two virtual machines communicate over a network:

- **Victim VM** (Arch Linux, QEMU/KVM) — runs the `wlkom.ko` kernel module
- **Attacking VM** (Linux, QEMU/KVM) — runs the attacking program (C2 server)

On load, the rootkit hides itself from the module list, registers with the C2 server, and polls it every 5 seconds for commands to execute on the victim.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 276" style="width:100%;max-width:760px;display:block;margin:1.5rem auto;font-family:monospace;">
  <defs>
    <marker id="al" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#60a5fa"/></marker>
  </defs>
  <rect x="4" y="4" width="752" height="268" rx="8" fill="none" stroke="#334155" stroke-width="1.5" stroke-dasharray="8,4"/>
  <text x="380" y="23" text-anchor="middle" fill="#64748b" font-size="10" letter-spacing="2">HOST MACHINE</text>
  <rect x="18" y="32" width="316" height="220" rx="6" fill="#0f172a" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="176" y="54" text-anchor="middle" fill="#93c5fd" font-size="11" font-weight="bold">ATTACKING VM</text>
  <line x1="18" y1="62" x2="334" y2="62" stroke="#1e3a5f" stroke-width="1"/>
  <text x="176" y="80" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="bold">Flask C2 Server</text>
  <text x="176" y="96" text-anchor="middle" fill="#4ade80" font-size="10">port :5000</text>
  <text x="176" y="113" text-anchor="middle" fill="#94a3b8" font-size="9">Web dashboard</text>
  <text x="176" y="129" text-anchor="middle" fill="#94a3b8" font-size="9">SQLite (actions, results, transfers)</text>
  <line x1="28" y1="143" x2="324" y2="143" stroke="#1e293b" stroke-width="1"/>
  <text x="176" y="158" text-anchor="middle" fill="#475569" font-size="8" font-weight="bold" letter-spacing="1">PORT FORWARDING</text>
  <text x="176" y="175" text-anchor="middle" fill="#94a3b8" font-size="9">:10023  →  :22   (SSH)</text>
  <text x="176" y="191" text-anchor="middle" fill="#94a3b8" font-size="9">:5000   →  :5000  (C2)</text>
  <text x="176" y="207" text-anchor="middle" fill="#94a3b8" font-size="9">:9000-9500  →  :9000-9500  (reverse shells)</text>
  <rect x="426" y="32" width="316" height="220" rx="6" fill="#0f172a" stroke="#f87171" stroke-width="1.5"/>
  <text x="584" y="54" text-anchor="middle" fill="#fca5a5" font-size="11" font-weight="bold">VICTIM VM</text>
  <line x1="426" y1="62" x2="742" y2="62" stroke="#3f1f1f" stroke-width="1"/>
  <text x="584" y="80" text-anchor="middle" fill="#e2e8f0" font-size="10" font-weight="bold">wlkom.ko (LKM)</text>
  <text x="584" y="96" text-anchor="middle" fill="#4ade80" font-size="10">polls C2 every 5 s</text>
  <line x1="436" y1="110" x2="732" y2="110" stroke="#3f1f1f" stroke-width="1"/>
  <text x="584" y="125" text-anchor="middle" fill="#475569" font-size="8" font-weight="bold" letter-spacing="1">PORT FORWARDING</text>
  <text x="584" y="142" text-anchor="middle" fill="#94a3b8" font-size="9">:10022  →  :22  (SSH)</text>
  <line x1="424" y1="96" x2="338" y2="96" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#al)"/>
  <text x="381" y="89" text-anchor="middle" fill="#60a5fa" font-size="8">HTTP polling</text>
</svg>

## Source layout

| File | Role |
|------|------|
| `src/wlkom_main.c` | Module entry/exit, calls hide and C2 init |
| `src/hide.c` | Removes the module from `lsmod` / `/proc/modules` / sysfs; hooks `read` to hide `wlkom.conf` |
| `src/c2.c` | C2 registration, UUID persistence, polling thread |
| `src/exec.c` | Command execution (`call_usermodehelper`) and plain reverse shell |
| `src/eshell.c` | XOR-encrypted interactive shell (auth + framed protocol) |
| `src/utils.c` | Filesystem helpers: `read_file`, `write_file`, `ensure_rootkit_dir` |
