+++
date = '2026-10-07T19:31:00+01:00'
draft = true
title = 'Move Windows 11 Virtual Machine to a new Hyper-V host'
description = 'How to move a Windows 11 virtual machine with vTPM to a new Hyper-V host while preserving the TPM certificates.'
tags = ['Windows 11', 'vTPM', 'TPM', 'Hyper-V', 'Shielded Certificate']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Move a Windows 11 Virtual Machine between Hyper-V hosts by exporting and re-importing the Shielded Virtual Machine certificates so the virtual TPM remains valid.'
+++

If you are moving a Windows 11 virtual machine between Hyper-V hosts, the virtual machine itself is easy to copy, but the virtual TPM is not. The issue is that Windows 11 uses a local certificate store on the Hyper-V host to preserve the TPM trust state. If that certificate data is not copied across, the virtual machine can fail to start or report TPM-related issues on the new machine.

## Basic Steps

- Shut down the Windows 11 virtual machine.
- Export the virtual machine.
- Export the certificates from the source host's Shielded Virtual Machine Local Certificates store.
- Copy the virtual machine and the exported `.pfx` files to the new host.
- Import the certificates into the new host's Shielded Virtual Machine Local Certificates store.
- Import the virtual machine and start it on the new Hyper-V host.

## Move the Virtual Machine to a new Hyper-V host

### 1. Shut down the virtual machine

Before exporting or copying anything, make sure the virtual machine is fully shut down. This avoids any risk of inconsistent state and ensures the TPM data is stable.

### 2. Export the virtual machine from the source host

Open an elevated PowerShell window on the original Hyper-V host and export the virtual machine to a folder on a local drive:

```powershell
Export-VM -Name 'Windows11-VM' -Path 'D:\Export'
```

This creates a folder containing the virtual machine configuration and associated files for import later. If you prefer to use Hyper-V Manager, you can also right-click the virtual machine, choose `Export`, and choose the same destination path.

### 3. Export the TPM certificates from the source host

Now export the hosts Shielded Virtual Machine certificate store. This is the step that preserves the Virtual TPM configuration when the virtual machine is moved.

```powershell
$tpmCerts = Get-ChildItem -Path 'Cert:\LocalMachine\Shielded Virtual Machine Local Certificates'
$tpmPassword = ConvertTo-SecureString -String '1234' -Force -AsPlainText

foreach ($cert in $tpmCerts) {
    Export-PfxCertificate `
        -Cert $cert `
        -FilePath "D:\Exports\$($cert.Subject.Replace('CN=', '')).pfx" `
        -Password $tpmPassword
}
```

This exports each certificate from the host's `Shielded Virtual Machine Local Certificates` store into a password-protected `.pfx` file.

### 4. Copy the Virtual Machine and the exported certs to the new host

Copy both the exported virtual machine folder and the files in `D:\Export` to the destination Hyper-V host. Keep the certificate files together with the virtual machine so you can import them in the same place.

If you are moving the data manually, make sure the exported virtual machine files remain in their original structure so the import process can find the configuration files.

### 5. Import the TPM certificates on the new host

On the new Hyper-V host, open an elevated PowerShell prompt and run:

Note: alter the path `D:\Export` to wherever you copied the export virtual machine to on the destination host.

```powershell
$certificateFiles = Get-ChildItem -File -Filter *.pfx -Path 'D:\Export'
$tpmPassword = ConvertTo-SecureString -String '1234' -Force -AsPlainText

foreach ($certificate in $certificateFiles) {
    Import-PfxCertificate `
        -Exportable `
        -Password $tpmPassword `
        -CertStoreLocation 'Cert:\LocalMachine\Shielded Virtual Machine Local Certificates' `
        -FilePath $certificate.FullName
}
```

```callout {.note}
The new host must already have had at least one virtual machine with TPM enabled before this step works. Hyper-V only creates the `Shielded Virtual Machine Local Certificates` store when it is needed.
```

### 6. Import the Virtual Machine on the new host and start it

Once the certificates are in place, you need to import the exported virtual machine definition. Hyper-V exports the virtual machine as a folder, and the actual import path is the `.vmcx` configuration file inside that folder.

First, locate the exported virtual machine configuration file and then import it using that path:

```powershell
$vmConfig = Get-ChildItem -Path 'D:\Export' -Recurse -Filter *.vmcx | Select-Object -First 1
Import-VM -Path $vmConfig.FullName -Register
```

If you are using Hyper-V Manager instead, select `Import Virtual Machine`, point it at the exported folder, and let it locate the `.vmcx` file automatically.

After the import finishes, start the virtual machine normally:

```powershell
Start-VM -Name 'Windows11-VM'
```

Now that the certificate store includes the TPM state from the original host, the virtual machine should boot without complaining, and you can continue using it on the new Hyper-V host.
