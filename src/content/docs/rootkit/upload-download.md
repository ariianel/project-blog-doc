---
title: Upload / Download
description: Transfer files in both directions between the C2 and the victim.
---

Files can be transferred in both directions between the C2 and the victim.

## Upload (C2 → victim)

1. In the web UI, select a machine and use the upload form to choose a local file and specify its destination path on the victim.
2. The C2 stages the file and queues an `upload:<remote_path>` action.
3. The rootkit fetches the file via `GET /api/<uuid>/file/<path_b64>` and writes it to the specified path.

## Download (victim → C2)

1. In the web UI, send a `download:<remote_path>` action for the target machine.
2. The rootkit reads the file and POSTs its raw content to `POST /api/<uuid>/file/<path_b64>`.
3. The C2 stores the file under `attacking_program/downloads/<uuid>/` and makes it available for retrieval via the admin download endpoint.

The transfer history (direction, remote path, size, timestamp) is displayed per machine in the dashboard.
