+++
date = '2026-10-06T20:12:00+01:00'
draft = false
title = 'Get and set IP addresses with PowerShell'
description = 'Use PowerShell to view, filter, and assign IPv4 addresses on Windows systems without clicking through the GUI.'
tags = ['PowerShell', 'Networking', 'IP Address', 'Windows Server', 'Windows']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Use PowerShell to inspect current IP addresses, find DHCP failures, and assign a static IPv4 address when needed.'
+++

The quickest way to see what addresses are currently assigned to a Windows machine is to query the network adapter information directly from PowerShell.

```powershell
Get-NetIPAddress
```

This gives you the core IP details for each adapter, but it is a little dense, so formatting the output into a table makes it much easier to read.

```powershell
Get-NetIPAddress |
    Format-Table InterfaceAlias, InterfaceIndex, IPAddress, AddressFamily
```

If a device is not receiving a DHCP lease, Windows often falls back to an Automatic Private IP Address in the 169.254.0.0/16 range. That is a useful clue when you are troubleshooting connectivity issues.

```powershell
Get-NetIPAddress |
    Where IPAddress -like "169.*" |
    Where AddressFamily -like IPv4 |
    Format-Table InterfaceAlias, InterfaceIndex, IPAddress, AddressFamily
```

When you need to assign a static address manually, `New-NetIPAddress` is the command to use. This example sets a typical IPv4 configuration with a gateway and a /24 subnet mask.

```powershell
New-NetIPAddress -IPAddress 192.168.1.16 -PrefixLength 24 -DefaultGateway 192.168.1.1 -Confirm:$false
```