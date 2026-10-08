+++
date = '2026-06-18T20:45:00+01:00'
draft = true
title = 'What are we going to do?'
description = 'This is the second post'
tags = ['powershell', 'virtual machine', 'hyper-v']
categories = ['Series']
author = 'Andrew Davidson'
summary = 'Second post in the Second Series: Introduction.'
series = 'Building a Developer Virtual Machine using Hyper-V and PowerShell'
+++

## What I'm going to do in this post

* Create a Generation 2 Virtual Machine with:
  * 4 vCPUs
  * 8Gb RAM
  * 2 disks
    * a 100Gb primary (for OS)
    * a 20Gb secondary (for code)
  * A network connection to my 'External Virtual Switch'
  * If required configure the virtual TPM settings
* Export it, remove original, copy and Import Virtual Machine back in so that the folder structure is created and files put in appropriate places
* Enable the Guest Service Interface
* Add a DVD drive, connect an appropriate ISO and set it as the boot device

## Download the OS ISO

Download an appropriate Windows OS ISO and store it locally on your disk, you can use any version of Windows from Windows 10/11 or even Server 2019/22/25. That's up to you.

```callout {.note title="If you don't have a copy of windows to try this with"}
You can get an evaluation edition of Windows 11 from here <https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise>
```

## PowerShell

```callout {.info}
You need to run these commands inside your host machine using an `Admin Level Windows PowerShell` or `Windows Terminal (Admin)` prompt. So get yourself logged in, and let's get going!
```

### Virtual Machine setup variables

These commands create the variables for the configuration of the virtual machine we are creating, alter these values to meet your needs.

```powershell
## Virtual Machine Guest settings

# This will be the name of the virtual machine in the Hyper-V console
$vmName = 'TestVM' 

# The full path to the ISO file you are using to build the OS
$isoFile = 'C:\Media\os.iso' 

# Is the machine going to use a Windows 11 client OS?
# If it is then we need the vTPM adding in
$requireTPM = $true 

# The full path to the location where the virtual guests will be created/run from
$vmRootPath = 'C:\VirtualMachines'

# The full path to the export folder 
# (temporary space can be used as it is just used to create an export, 
# then the data from this folder is removed)
$vmExportPath = 'C:\Export'


## Virtual Machine Settings
## ===========================
# The amount of RAM to use
$vmMemory = 8GB

# The number of vCPUs to use
$vmCpuCount = 4

# Size in GB of the primary hard disk
$vhdPrimarySize = 100GB

# Size in GB of the secondary hard disk
$vhdSecondarySize = 20GB

# The name of the network switch to use 
# (normally would be Default, but I have my host setup a bit differently)
$vmSwitchName = "External Virtual Switch"
```

## Initial Virtual Machine setup

```callout {.note}
The rest of the commands in this and the following sections do not need altering for the machine to build, you can just execute them as is.
```

```powershell
$vhdPrimaryName = '{0}-C.vhdx' -f $vmName
$vhdSecondaryName = '{0}-D.vhdx' -f $vmName
$vmLocation = (Join-Path -Path $vmRootPath -ChildPath $vmName)
$vmExportedLocation = (Join-Path -Path $vmExportPath -ChildPath $vmName)

$newVmSplat = @{
    Name               = $vmName 
    MemoryStartupBytes = $vmMemory 
    NewVHDPath         = $vhdPrimaryName 
    NewVHDSizeBytes    = $vhdPrimarySize
    Generation         = 2
    SwitchName         = $vmSwitchName
    Path               = $vmRootPath
}
New-VM @newVmSplat
```

### Add in the secondary Hard Disk

```powershell
$newVhdSplat = @{
    Path        = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName) 
    SizeInBytes = 20GB
}
New-VHD @newVhdSplat

$addVMHardDiskDrive = @{
    VmName        = $vmName
    Path = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName)
}
Add-VMHardDiskDrive @addVMHardDiskDrive
```

### Enable the vTPM (if needed)

```callout {.warning title="Enabling vTPM"}
To enable TPM in Windows 11 (and I'm assuming in other version of windows too) in this manner, at least _one_ virtual machine must have been created before hand, Windows only creates the virtual machine vTPM-store on first use.
```

```powershell
if ($requireTPM -eq $true) {
    $owner = Get-HgsGuardian 'UntrustedGuardian'
    if ($null -ne $owner) {
        $kp = New-HgsKeyProtector -Owner $owner -AllowUntrustedRoot
        Set-VMKeyProtector -VMName $vmName -KeyProtector $kp.RawData
        Enable-VMTPM -VMName $vmName
    }
    else {
        Write-Output "Host Guardian not yet setup." 
        Write-Output "You must enable the vTPM settings manually in at least one"
        Write-Output "Hyper-V virtual machine before this can be automated"
    }
}
```

### Setup Checkpoints

This code sets up the Snapshots/Checkpoint/whatever they're called today

```powershell
$setVmSplat = @{
    Name                        = $vmName 
    ProcessorCount              = $vmCpuCount 
    AutomaticCheckpointsEnabled = $false 
    CheckpointType              = 'Production' 
    Notes                       = $vmName 
    StaticMemory                = $true
    SmartPagingFilePath         = $vmLocation
    SnapshotFileLocation        = (Join-Path -Path $vmLocation -ChildPath 'Snapshots')
}

Set-VM @setVmSplat
```

### Enable the Guest Services

```powershell
Enable-VMIntegrationService -Name "Guest Service Interface" -VMName $vmName
```

### Add a DVD drive

And finally this block adds a DVD drive, with our ISO image connected and then sets the boot order so that the Virtual Machine will boot the ISO.

```powershell
$addVMDvdDrive = @{
    VmName = $vmName 
    Path = $isoFile
    Controller = 0
    ControllerLocation = 9
}

Add-VMDvdDrive @addVMDvdDrive

$setVMFirmware = @{
    VmName                      = $vmName 
    BootOrder              = $(Get-VMDvdDrive -VMName $vmName), $(Get-VMHardDiskDrive -VMName $vmName)[0]
}

# Set-VMFirmware -VMName $vmName -BootOrder $(Get-VMDvdDrive -VMName $vmName), $(Get-VMHardDiskDrive -VMName $vmName)[0]
```

### Tidy Up the Virtual Machine

This code exports the Virtual Machine, cleans up the original build folders and files, moves the exported Virtual Machine back into the correct location and then imports it. I do this so that all the files for the Virtual machine are all under the folder named for the Virtual Machine and not spread in seemingly random locations across my disk(s).

```powershell
Export-VM -Name $vmName -Path $vmExportPath
Remove-VM -Name $vmName -Force
Get-ChildItem -Path $vmLocation -Recurse | Remove-Item -Recurse -Force
Remove-Item -Path $vmLocation

Move-Item -Path $vmExportedLocation -Destination $vmLocation

$vmcx = Get-ChildItem -Path $vmLocation -Recurse | 
            Where-Object Extension -eq '.vmcx'
$vmcxFile = $vmcx.FullName
Import-VM -Path $vmcxFile -Register
```

### Lets put it all together 

This code block brings all the previous steps together into a single repeatable script: it creates the virtual machine, adds the extra disk, enables TPM when required, exports the finished machine, removes the temporary working copy, and then imports the exported virtual machine back into its final folder structure. The goal is to keep the configuration simple, the layout tidy, and the process easy to automate again later.

```powershell
$vmName = 'TestVM' 
$isoFile = 'C:\Media\os.iso' 
$requireTPM = $true 
$vmRootPath = 'C:\VirtualMachines'
$vmExportPath = 'C:\Export'
$vmMemory = 8GB
$vmCpuCount = 4
$vhdPrimarySize = 100GB
$vhdSecondarySize = 20GB
$vmSwitchName = "External Virtual Switch"
$vhdPrimaryName = '{0}-C.vhdx' -f $vmName
$vhdSecondaryName = '{0}-D.vhdx' -f $vmName
$vmLocation = (Join-Path -Path $vmRootPath -ChildPath $vmName)
$vmExportedLocation = (Join-Path -Path $vmExportPath -ChildPath $vmName)

$newVmSplat = @{
    Name               = $vmName 
    MemoryStartupBytes = $vmMemory 
    NewVHDPath         = $vhdPrimaryName 
    NewVHDSizeBytes    = $vhdPrimarySize
    Generation         = 2
    SwitchName         = $vmSwitchName
    Path               = $vmRootPath
}
New-VM @newVmSplat

$newVhdSplat = @{
    Path        = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName) 
    SizeInBytes = 20GB
}
New-VHD @newVhdSplat

$addVMHardDiskDrive = @{
    VmName        = $vmName
    Path = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName)
}
Add-VMHardDiskDrive @addVMHardDiskDrive

if ($requireTPM -eq $true) {
    $owner = Get-HgsGuardian 'UntrustedGuardian'
    if ($null -ne $owner) {
        $kp = New-HgsKeyProtector -Owner $owner -AllowUntrustedRoot
        Set-VMKeyProtector -VMName $vmName -KeyProtector $kp.RawData
        Enable-VMTPM -VMName $vmName
    }
    else {
        Write-Output "Host Guardian not yet setup." 
        Write-Output "You must enable the vTPM settings manually in at least one"
        Write-Output "Hyper-V virtual machine before this can be automated"
    }
}

$newVhdSplat = @{
    Path        = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName) 
    SizeInBytes = 20GB
}
New-VHD @newVhdSplat

$addVMHardDiskDrive = @{
    VmName        = $vmName
    Path = (Join-Path -Path $vmLocation -ChildPath $vhdSecondaryName)
}
Add-VMHardDiskDrive @addVMHardDiskDrive

if ($requireTPM -eq $true) {
    $owner = Get-HgsGuardian 'UntrustedGuardian'
    if ($null -ne $owner) {
        $kp = New-HgsKeyProtector -Owner $owner -AllowUntrustedRoot
        Set-VMKeyProtector -VMName $vmName -KeyProtector $kp.RawData
        Enable-VMTPM -VMName $vmName
    }
    else {
        Write-Output "Host Guardian not yet setup." 
        Write-Output "You must enable the vTPM settings manually in at least one"
        Write-Output "Hyper-V virtual machine before this can be automated"
    }
}

Export-VM -Name $vmName -Path $vmExportPath
Remove-VM -Name $vmName -Force
Get-ChildItem -Path $vmLocation -Recurse | Remove-Item -Recurse -Force
Remove-Item -Path $vmLocation

Move-Item -Path $vmExportedLocation -Destination $vmLocation

$vmConfig = Get-ChildItem -Path $vmLocation -Recurse -Filter *.vmcx | Select-Object -First 1
Import-VM -Path $vmConfig.FullName -Register
```