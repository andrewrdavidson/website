+++
date = '2026-06-23T00:00:00+08:00'
draft = true
title = 'Getting I219V drivers to work in Server 2022/25'
description = 'This is the first post'
tags = ['Network Driver', 'Intel', 'Intel I219-V', 'I219-V']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'How I got the Intel I219-V network drivers working on Windows Server 2022/2025, including driver pack download, .inf file editing, and SecureBoot/UEFI considerations.'
+++

# Introduction

I have an old Intel NUC that I wanted to re-use, so I got out my trusty Rufus tools and created myself a Windows Server 2025 USB stick. After I'd install Windows, and logged in, I was met with no network interface 😞

I remembered I'd solved this problem before many years ago by hacking the driver .inf files but I couldn't remeber exactly how and I never kept any notes. I do remember that I had to disable the driver signing system somehow to get it to install but now, with more modern OSes having SecureBoot and UEFI, I kind of expected it to be a bit more complicated than before. So, I went a-hunting around on the Internet and I found a post where they did just that - get the network driver installed - but only for Windows Server 2016.

<div class="alert alert-info" role="alert">
  <div style="display: block;"><i class="fa-solid fa-circle-info fa-2x"></i> INFORMATION</div>
  <div style="display: block;">
    So, I tried the instructions here in this <a href="https://blog.workinghardinit.work/2017/06/19/installing-intel-i211-i217v-i218v-i219v-drivers-windows-server-2016-eufi-boot/" target="_blank" rel="noopener noreferrer">original blog post<i class="fa-solid fa-arrow-up-right-from-square fa-sm" style="margin-left:0.25em;"></i></a>and here are my updated notes for Server 2025 (which should work on Server 2022)
  </div>
</div>

## Get the drivers

First of all lets get the latest drivers. I downloaded the latest 64-bit Intel Ethernet Driver Pack from <a href="https://www.intel.com/content/www/us/en/download/15084/intel-ethernet-adapter-complete-driver-pack.html">here<i class="fa-solid fa-arrow-up-right-from-square fa-sm" style="margin-left:0.25em;"></i></a> (correct as of 15/06/25)

Unzip using your favourite zipping tools and put them somewhere useful. I put mine in `c:\source\IntelDrivers\`. Being a PowerShell nerd obviously I extracted it using that!

```powershell
Set-Location -Path 'c:\source'
New-Item -Name 'IntelDrivers' -ItemType 'Directory'
$downloadsFolder =  Join-Path -Path "$([System.Environment]::GetFolderPath(40))" -ChildPath "Downloads"
$zipFile = Join-Path -Path $downloadsFolder -ChildPath 'Release_30.1.0.1.zip'
Expand-Archive -Path $zipFile -DestinationPath 'c:\source\IntelDrivers'
```

## Find the NIC in your server

I wrote and ran this little PowerShell snippet to find the Name and Hardware ID of the NIC. In my NUC the NIC with the missing driver is listed in Device Manager as 'Ethernet Controller'.

```powershell
$nic = Get-WmiObject 'Win32_PNPEntity' | 
          Select 'Name', 'DeviceID' | 
          Where-Object 'Name' -eq 'Ethernet Controller'
```

and it should return something like this:

`
Ethernet Controller, PCI\VEN_8086&DEV_1570&SUBSYS_20638086&REV_21\3&11583659&0&FE
`

and that's the I219-V adapter.

## Find the driver .inf file we need to update

```powershell
# Create the proper vendor ID string for the NIC
$nicDeviceId = $nic.DeviceID -split '&'
$vendorIdString = $nicDeviceId[0].Replace('PCI\', '') + '&' + $nicDeviceId[1]

# Search for the vendor ID in the specified directory and its subdirectories
# and show the file where that vendor ID is found
Get-ChildItem -Path 'c:\source\IntelDrivers\PRO1000\Winx64\NDIS65' -Recurse | 
    Select-String -Pattern $vendorIdString | 
    Group-Object Path | 
    Select-Object Name

```

alter file

(remove all lines between [ControlFlags] and [Intel])
(copy all lines between [Instal.NTamd64.10.0.1] and [Instal.NTamd64.10.0.0])
(paste under the last line of [Install.NT.amd64.10.0.0])

Admin command prompt

bcdedit /set LOADOPTIONS DISABLE_INTEGRITY_CHECKS

restart server whilst holding down shift key

When it boots

Troubleshoot
Advanced options
Startup settings
Click restart

it will reboot
and show advanced boot options
choose Disable Automatic restart on system failure
it will boot
Install driver
You will get a prompt "Windows cant verify the publisher of this driver software"
Choose Install this driver software anyway

bcdedit /set LOADOPTIONS ENABLE_INTEGRITY_CHECKS
bcdedit /set TESTSIGNING ON
bcdedit /set nointegritychecks OFF

reboot

# First try

Build OS
Login
Admin command prompt: bcdedit /set LOADOPTIONS DISABLE_INTEGRITY_CHECKS
Shift-reboot
Troubleshoot
Startup Settings
Click Restart
-Select Disable automatic restart on system failure
Select Disable Driver Signature Enforcement
After rebooting, login again
