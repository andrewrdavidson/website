+++
date = '2026-10-07T20:12:00+01:00'
draft = true
title = 'Set DNS forwarders on all Domain Controllers'
description = 'Use PowerShell to apply the same DNS forwarders to every Domain Controller in your Active Directory domain.'
tags = ['DNS', 'PowerShell', 'Active Directory', 'Domain Controllers', 'Windows Server']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Set DNS forwarders across all Domain Controllers in one PowerShell command, using Google and Cloudflare as the upstream resolvers.'
+++

Instead of clicking through the GUI on every single Domain Controller, you can push the settings to all of your DNS servers at once using PowerShell.

Open PowerShell as an Administrator on one of your DCs and run this block of code. It will automatically gather all DNS servers in your Active Directory domain and set their forwarders to Google and Cloudflare:

```powershell
# Get all DNS servers in the Active Directory Domain
$DNSServers = (Get-ADDomainController -Filter *).Name

# Apply public forwarders to every server found
foreach ($Server in $DNSServers) {
    Write-Host "Configuring DNS Forwarders on $Server..." -ForegroundColor Cyan
    Set-DnsServerForwarder -ComputerName $Server -IPAddress "1.1.1.1", "8.8.8.8" -PassThru
}
```