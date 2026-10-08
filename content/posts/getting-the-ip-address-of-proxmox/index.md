+++
date = '2026-09-18T18:31:00+01:00'
draft = true
title = 'Find the IP address of a Proxmox host'
description = 'Check the network address of a Proxmox host using the GUI or the command line when you need to connect to the node.'
tags = ['Proxmox', 'Networking', 'Linux', 'IP Address', 'Virtualisation']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Find the IP address of a Proxmox host either from the web UI or from the Linux console using the vmbr0 interface.'
+++

If you need to check a Proxmox host to confirm which address it is listening on, there are two simple ways to check it. The quickest route is to look in the Proxmox web UI, but if you are already on the console then a single command will show the active IP on the bridge interface.

## Using the GUI

Log in to the Proxmox console and open the node settings. In the network section, check the address assigned to `vmbr0`, which is usually the primary bridge used for the host's management traffic.

## Using the console

If you are already at the shell, this command prints the IPv4 address for the `vmbr0` interface:

```bash
ip -o -4 addr show vmbr0 | awk '{print $4}'
```

This is a quick way to confirm the host's management IP without opening the web interface.