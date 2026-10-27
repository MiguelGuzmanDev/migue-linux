---
id: 001A
slug: instalar-libvirt-virt-install-fedora-40
titulo: Instalar libvirt y crear tu primera VM con virt-install en Fedora 40
fecha: 2026-10-27
categoria: sysadmin
tags: [fedora, kvm, libvirt, qemu, virt-install, virsh, virtualizacion]
extracto: Guía paso a paso para convertir tu Fedora 40 en un host KVM, configurar libvirt y crear máquinas virtuales desde la terminal con virt-install.
author: miguel-guzman
---

# Instalar libvirt y crear tu primera VM con virt-install en Fedora 40

![Instalar libvirt y crear tu primera VM con virt-install en Fedora 40](/assets/img/post/2026/10/001A-instalar-libvirt-virt-install-fedora-40.jpg "Instalar libvirt y crear tu primera VM con virt-install en Fedora 40")

Tener un laboratorio de máquinas virtuales en tu propia laptop es de lo más útil que puede hacer un SysAdmin: pruebas un cambio antes de llevarlo a producción, rompes cosas sin miedo y practicas con otras distribuciones.

En Fedora todo lo necesario ya viene en los repositorios oficiales: **KVM** (el hipervisor del kernel), **QEMU** (el emulador que corre las VMs), **libvirt** (la capa que las administra) y **virt-install** (la herramienta para crearlas desde la terminal).

> En esta guía todo se hace por línea de comandos, sin interfaz gráfica. Si después quieres una, `virt-manager` usa exactamente la misma configuración.

## Requisitos

- Fedora 40 (Workstation o Server) con un usuario con `sudo`.
- Un procesador con virtualización por hardware: **Intel VT-x** o **AMD-V**.
- Al menos 8 GB de RAM y unos 30 GB libres en disco para trabajar cómodo.

## 1. Verificar que tu CPU soporta virtualización

```bash
$ grep -Ec '(vmx|svm)' /proc/cpuinfo
```

Si el resultado es **mayor a 0**, tu CPU la soporta (`vmx` es Intel, `svm` es AMD). Si sale `0`, entra al BIOS/UEFI y activa la opción **Intel Virtualization Technology**, **VT-x** o **SVM Mode**.

También puedes revisarlo con:

```bash
$ lscpu | grep -i virtualization
```

## 2. Instalar el grupo de virtualización

Fedora agrupa todos los paquetes en un solo grupo:

```bash
$ sudo dnf install @virtualization
```

Esto instala, entre otros:

| Paquete | Para qué sirve |
|---|---|
| `qemu-kvm` | El emulador que ejecuta las VMs usando KVM |
| `libvirt` | Demonios y API para administrar las VMs |
| `virt-install` | Crear VMs desde la terminal |
| `virt-manager` | Interfaz gráfica (opcional) |
| `libvirt-daemon-config-network` | La red NAT `default` para las VMs |

## 3. Arrancar los servicios de libvirt

Desde Fedora 35, libvirt usa **demonios modulares**: en lugar de un solo `libvirtd`, hay uno por función (`virtqemud` para las VMs, `virtnetworkd` para las redes, `virtstoraged` para los discos, etc.). Se activan solos por *socket* la primera vez que los usas.

Verifica que el socket principal esté activo:

```bash
$ systemctl status virtqemud.socket
```

Si no aparece como `active (listening)`, actívalos:

```bash
$ sudo systemctl enable --now virtqemud.socket virtnetworkd.socket virtstoraged.socket virtnodedevd.socket
```

Ahora comprueba que el host está listo para KVM:

```bash
$ sudo virt-host-validate qemu
```

Lo importante es que las líneas de **hardware virtualization** y **/dev/kvm** digan `PASS`. Algunos avisos `WARN` (por ejemplo sobre IOMMU) no impiden crear VMs.

## 4. Usar libvirt sin sudo

Agrega tu usuario al grupo `libvirt`:

```bash
$ sudo usermod -aG libvirt $USER
```

Y dile a las herramientas que se conecten al libvirt **del sistema**:

```bash
$ echo 'export LIBVIRT_DEFAULT_URI=qemu:///system' >> ~/.bashrc
```

Cierra sesión y vuelve a entrar para que el grupo se aplique. Luego verifica:

```bash
$ virsh uri
$ virsh list --all
```

`virsh uri` debe mostrar `qemu:///system`, y `virsh list --all` una tabla vacía (todavía no tienes VMs).

> **¿Por qué `qemu:///system`?** Sin esa variable, `virsh` y `virt-install` usan `qemu:///session`: VMs de tu usuario, sin acceso a la red `default` ni a `/var/lib/libvirt/images`. Es una de las confusiones más comunes al empezar.

## 5. Activar la red default

libvirt crea una red NAT llamada `default` (interfaz `virbr0`, rango `192.168.122.0/24`). Revisa que esté activa y que arranque con el sistema:

```bash
$ virsh net-list --all
$ virsh net-start default
$ virsh net-autostart default
```

Si `net-start` dice que ya está activa, no pasa nada.

## 6. Crear tu primera VM con virt-install

Vamos a instalar **AlmaLinux 9** por red, en modo texto y con la consola serial, todo sin salir de la terminal.

Primero busca el nombre que libvirt usa para el sistema operativo invitado:

```bash
$ virt-install --osinfo list | grep -i almalinux
```

Y crea la VM:

```bash
$ virt-install \
    --name alma9-lab \
    --memory 2048 \
    --vcpus 2 \
    --disk size=20 \
    --osinfo almalinux9 \
    --location https://repo.almalinux.org/almalinux/9/BaseOS/x86_64/os/ \
    --network network=default \
    --graphics none \
    --extra-args 'console=ttyS0,115200n8 inst.text'
```

| Opción | Qué hace |
|---|---|
| `--name` | Nombre de la VM en libvirt |
| `--memory` / `--vcpus` | RAM en MB y número de CPUs |
| `--disk size=20` | Crea un disco qcow2 de 20 GB en `/var/lib/libvirt/images` |
| `--osinfo` | Optimiza la VM para ese sistema operativo |
| `--location` | Instala desde un repositorio por red, sin descargar ISO |
| `--graphics none` + `--extra-args` | Instalación en texto por la consola serial |

Se abrirá el instalador en tu terminal. Configura idioma, disco, usuario y contraseña de root, y espera a que termine.

> Para salir de la consola de la VM sin apagarla usa **Ctrl + ]**.

### Si prefieres instalar desde una ISO

Copia la ISO a `/var/lib/libvirt/images/`. Si la dejas en tu `/home`, QEMU no tendrá permiso para leerla, por los permisos y por SELinux:

```bash
$ sudo cp ~/Descargas/AlmaLinux-9-latest-x86_64-minimal.iso /var/lib/libvirt/images/
$ virt-install \
    --name alma9-iso \
    --memory 2048 \
    --vcpus 2 \
    --disk size=20 \
    --osinfo almalinux9 \
    --cdrom /var/lib/libvirt/images/AlmaLinux-9-latest-x86_64-minimal.iso \
    --network network=default
```

Sin `--graphics none`, se abrirá `virt-viewer` con la pantalla de la VM.

## 7. Administrar tus VMs con virsh

```bash
$ virsh list --all                # ver todas las VMs y su estado
$ virsh start alma9-lab           # encender
$ virsh console alma9-lab         # entrar por consola (salir: Ctrl + ])
$ virsh domifaddr alma9-lab       # ver la IP que le dio la red default
$ virsh shutdown alma9-lab        # apagado ordenado
$ virsh destroy alma9-lab         # apagado forzado (como desconectar el cable)
$ virsh autostart alma9-lab       # encender al arrancar el host
```

Y cuando ya no la necesites, para borrarla junto con su disco:

```bash
$ virsh destroy alma9-lab
$ virsh undefine alma9-lab --remove-all-storage
```

## Problemas comunes

| Error | Causa y solución |
|---|---|
| `KVM is not available` o no existe `/dev/kvm` | Virtualización desactivada en el BIOS/UEFI, o estás dentro de otra VM sin virtualización anidada. |
| `Network not found: no network with matching name 'default'` | Te estás conectando a `qemu:///session`. Revisa `virsh uri` y la variable `LIBVIRT_DEFAULT_URI`. |
| `network 'default' is not active` | Corre `virsh net-start default`. |
| `Permission denied` al leer la ISO | Muévela a `/var/lib/libvirt/images/`. |
| `authentication unavailable` sin `sudo` | No cerraste sesión después de agregarte al grupo `libvirt`. |

## Conclusión

Con esto tu Fedora 40 ya es un host KVM y puedes crear VMs en segundos desde la terminal. A partir de aquí puedes automatizar laboratorios completos: un script de Bash que levante varias VMs con `virt-install`, plantillas con `virt-clone` o redes aisladas con `virsh net-define`.

> Si algún paso no te funcionó igual, escríbeme y dime qué error te salió. Lo agrego a la tabla de problemas comunes.
