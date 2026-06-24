---
title: C2 Server
description: Deploy and use the Flask command-and-control server.
---

## Deploying the C2 server

Deploy the Flask C2 server to `/c2` on the attacking VM, then run it from there:

```sh
# From the repository root — upload the C2 server to the attacking VM
scp -P 10023 -r attacking_program root@localhost:/c2

# On the attacking machine:
cd /c2
cp .env.example .env          # set SECRET_KEY and ADMIN_PASSWORD
pip install -r requirements.txt
python3 app.py                # starts on 0.0.0.0:5000
```

The web interface is then reachable from the host at http://localhost:5000 (forwarded from guest port 5000).

![WLKOM C2 dashboard](/c2-dashboard.png)

## Rootkit endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/register` | GET | Rootkit registers; server returns a UUID |
| `/api/<uuid>/action` | GET | Polled every 5 s; server returns the next pending action or 204 if none |
| `/api/<uuid>/result` | POST | Rootkit posts command output; body fields: `exit_code`, `stdout`, `stderr` |
| `/api/<uuid>/file/<path_b64>` | GET | Rootkit fetches a staged file to write on the victim (upload: C2 → victim) |
| `/api/<uuid>/file/<path_b64>` | POST | Rootkit POSTs a file it read on the victim (download: victim → C2) |

`<path_b64>` is the target remote path encoded as URL-safe base64.

## Admin endpoints (login required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/stage/<machine_uuid>` | POST | Stage a local file for upload to the victim; form fields: `file`, `remote_path` |
| `/download/<machine_uuid>/<transfer_id>` | GET | Download a file retrieved from the victim |

## Action format

Commands sent by the server follow the format `verb:args`.

| Verb | Args format | Effect |
|------|-------------|--------|
| `exec` | `<shell command>` | Runs the command on the victim; stdout, stderr and exit code are posted back via `POST /api/<uuid>/result` |
| `shell` | `<ip>,<port>` | Opens a reverse shell from the victim to the specified address and port |
| `eshell` | `<ip>,<port>` | Opens an XOR-encrypted interactive shell from the victim to the attacker's listener |
| `upload` | `<remote_path>` | Rootkit fetches the staged file from the C2 and writes it to `<remote_path>` on the victim |
| `download` | `<remote_path>` | Rootkit reads `<remote_path>` on the victim and POSTs its content to the C2 |

![C2 action selection modal](/c2-actions.png)
