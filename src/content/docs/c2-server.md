---
title: C2 Server
description: Technical documentation of the WLKOM Flask command-and-control server.
---

A Flask web application that acts as the command-and-control server: managing victim machines, dispatching commands, and handling file transfers.

**Python 3 · Flask · SQLite · Jinja2 · AJAX**

## Overview

The C2 server exposes two interfaces running on the same Flask process on port 5000:

- **Web Dashboard** — password-protected interface for the operator. Shows all connected machines in real-time, lets you dispatch commands, upload/download files, and view results.
- **Rootkit API** — unauthenticated HTTP/1.0 REST API consumed by the kernel module. Handles registration, action polling, result submission, and binary file transfer.

## Database schema

All state is persisted in a single SQLite file (`c2.db`), managed by `database.py`.

**`machines`** — one row per registered rootkit instance

| Column | Type | Description |
|--------|------|-------------|
| `uuid` | TEXT PK | Unique identifier for the rootkit instance |
| `ip` | TEXT | Last seen IP address |
| `registered_at` | TEXT | Registration timestamp |
| `last_seen` | TEXT | Last poll timestamp (used for online detection) |

**`actions`** — queue of commands waiting to be consumed by the rootkit

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | Action ID |
| `machine_uuid` | FK | Target machine |
| `command` | TEXT | Action string (e.g. `exec:ls -la`) |
| `consumed` | INT | 0 = pending, 1 = consumed |
| `created_at` | TEXT | Timestamp |

**`results`** — command outputs posted back by the rootkit

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | |
| `machine_uuid` | FK | Source machine |
| `command` | TEXT | Command that was run |
| `exit_code` | INT | Exit code |
| `stdout` | TEXT | Standard output |
| `stderr` | TEXT | Standard error |

**`transfers`** — history of all file uploads and downloads

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT PK | |
| `machine_uuid` | FK | |
| `direction` | TEXT | `'upload'` or `'download'` |
| `remote_path` | TEXT | Path on the victim |
| `local_path` | TEXT | Path on the C2 server |
| `size` | INT | File size in bytes |

## Routes

### Frontend (operator)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/login` | Login page |
| POST | `/login` | Authenticate with `ADMIN_PASSWORD` from `.env` |
| GET | `/` | Dashboard — list of machines, actions, results, transfers |
| GET | `/api/poll` | AJAX endpoint, returns full machine state as JSON (polled every 3 s by UI) |
| POST | `/action/<uuid>` | Enqueue a command for a machine |
| POST | `/stage/<uuid>` | Upload a file from the browser and stage it for delivery to the victim |
| GET | `/download/<uuid>/<id>` | Download a file received from the victim |
| POST | `/logs/<uuid>/clear` | Clear all actions and results for a machine |

### Rootkit API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/register` | Register a new machine; returns a fresh UUID as plain text |
| GET | `/api/<uuid>/action` | Pop the oldest pending action; returns `verb:args` or `204` if none |
| POST | `/api/<uuid>/result` | Store command output; body: `command`, `exit_code`, `stdout`, `stderr` |
| POST | `/api/<uuid>/file/<path_b64>` | Receive a file from the victim (download action); raw binary body |
| GET | `/api/<uuid>/file/<path_b64>` | Serve a staged file to the victim (upload action); returns raw binary |

## Dashboard

![WLKOM C2 dashboard](/c2-dashboard.png)

- **Live machine status** — each machine shows a green/red dot updated every 5 seconds via AJAX. A machine is considered online if its `last_seen` timestamp is less than 15 seconds old.
- **Action modal** — click **+ Action** on any machine to open a modal with four action types: Execute Command, Download File, Upload File, Reverse Shell.
- **AJAX live polling** — the dashboard polls `/api/poll` every 3 seconds and updates machine status, action history, results, and file transfers without a page reload.
- **File transfers panel** — shows all uploads (↑) and downloads (↓) with their size and timestamp. Downloads include a save link.

![C2 action selection modal](/c2-action.png)

## Authentication

The dashboard is protected by a password stored in `.env`, never hardcoded in the source. The rootkit API has no authentication (by design for this pedagogical project).

```sh
# .env
SECRET_KEY=your-long-random-secret-key
ADMIN_PASSWORD=yourpassword
```

Sessions are managed by Flask's signed cookie mechanism using `SECRET_KEY`. The `@login_required` decorator protects all operator routes.

![WLKOM C2 login page](/c2-login-interface.png)

## Asynchronous interface (AJAX polling)

### The problem

The first version of the dashboard was entirely static. After sending a command, the operator had to manually reload the page to see whether the rootkit had picked it up and returned a result.

### The solution

The dashboard runs a JavaScript loop that calls `GET /api/poll` every 3 seconds. The server responds with the full machine state as JSON: machine list, pending actions, results, and file transfers. JavaScript then updates only what changed, with no page reload.

```js
async function poll() {
    const res  = await fetch('/api/poll');
    const data = await res.json();
    updateMachines(data.machines);   // status dots
    updateResults(data.results);     // command output
    updateTransfers(data.transfers); // file transfer history
}

setInterval(poll, 3000);  // run every 3 s
poll();                   // immediate first call
```

### Design decisions

**HTTP polling over WebSockets** — WebSockets would allow the server to push results instantly, but they require a persistent connection and more complex server-side state. Since the rootkit itself operates on a beaconing model (it checks in periodically), matching the dashboard to the same rhythm keeps the architecture consistent.

**Vanilla JavaScript, no framework** — using native `fetch()` and DOM APIs instead of React or Vue keeps the project dependency-free on the frontend side. A C2 tool should be lightweight and self-contained.

**Single `/api/poll` endpoint** — rather than multiple endpoints for machines, results, and transfers, a single endpoint returns everything in one JSON payload. One request per tick, one place to update.

## Online detection

There is no persistent TCP connection between the rootkit and the C2. The server infers connection status from the polling frequency.

Every time the rootkit polls `GET /api/<uuid>/action`, the server updates the `last_seen` timestamp in the `machines` table. A machine is considered **online** if `last_seen` is less than **15 seconds** ago (at most 3 missed polls at the 5-second interval). If the rootkit is unloaded or the victim goes down, the machine turns red within 15 seconds.
