+++
date = '2026-10-04T10:44:00+01:00'
draft = true
title = 'Set the CD drive letter using PowerShell'
description = 'Use PowerShell to assign a drive letter to the optical drive when Windows or a VM has left it without one.'
tags = ['PowerShell', 'Windows', 'Drive Letter', 'CD Drive', 'Storage']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Assign a drive letter to the optical drive with PowerShell when the default letter is missing or incorrect.'
+++

If you have ever installed Windows in a virtual machine with extra disks, you will know that the optical drive can take a letter you do not want. The OS assigns the CD-ROM or ISO-mounted drive a low letter such as `D:`, which can get in the way when you want to assign `D:`, `E:`, and so on to your data or application disks.

This is a quick way to move the optical drive to a less intrusive letter, such as `Z:`, so the rest of your drive layout stays clean and predictable.

```powershell
Get-WmiObject -Class Win32_volume -Filter 'DriveType=5' |
    Select-Object -First 1 |
    Set-WmiInstance -Arguments @{DriveLetter='Z:'}
```

This command targets the volume where `DriveType` is `5`, which identifies a CD-ROM drive, and then assigns it the new letter. It is especially useful when working with VMs, ISO images, or systems where the default optical drive letter is inconvenient or conflicts with your partitioning scheme.
