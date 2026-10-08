+++
date = '2026-06-25T21:20:00+01:00'
draft = true
title = 'Configuring the OS'
description = 'This is the third post'
tags = ['powershell', 'virtual machine', 'hyper-v']
categories = ['Series']
author = 'Andrew Davidson'
summary = 'Third post in the Second Series: Introduction.'
series = 'Building a Developer Virtual Machine using Hyper-V and PowerShell'
+++

## Install the Operating System

Start Virtual Machine and install your chosen Microsoft Windows OS. I'm not going to go though how to do this - just follow your nose ;-)

Remember, the virtual machine will reboot several times, wait for the install to completely finish before proceeding onwards.

> The main reason I don't document this is because the Windows Setup wizard changes so much depending on the combination of OS Version (10/11/2019/2022/2025 and 21H2/23H2/24H2 etc) and Edition (Home, Pro, Server etc) that documenting it would be pointless. Every setup process appears to be different!

## Setup Operating System

Connect to the Virtual Guest you just created from the Hyper-V Virtual Manager

> Now might be a good time to checkpoint the Virtual Machine so that you don't have to setup the Virtual Machine again, you can reset it back to here - a blank machine - if something goes wrong later on.

We're now going to configure the chosen OS as I like it. All of these steps are technically optional so do the ones you want/need and ignore the rest!

* Set Time Zone
* Join an Active Directory Domain
* Confirugre PowerShell
* Set Windows Options:
  * Edge Wizard to not run on first startup
  * Set Short Date to UK format
  * Set the language default across Windows to en-GB (UK format)
  * Disable Desktop Widgets
  * Disable Search 'enhancements'
  * Set default Search Engine to google
  * Patch the Virtual Machine
* For Servers only (Windows Server 2019/2022/2025)
  * Disable Server Manager
  * Disable IEESC (IE Enhanced Security)
  * Remove Azure Arc (Server 2022 only)
  * Remove Azure Arc (Server 2025 only)
  * Remove other Bits and Pieces

> From now on we will run commands inside the Virtual Machine you have just created using an `Admin Level Windows PowerShell` or `Terminal (Admin)` prompt. So get yourself logged into your Virtual Machine, and let's start configuring!

### Set the TimeZone

Firstly, let's get the timezone right. Depending on the OS version and edition you installed it might be set to PST by default, so here I set it to GMT.

```powershell
Set-TimeZone -Name "GMT Standard Time"
```

> Obviously you can set the TimeZone to wherever you are, just use the appropriate name. You can get a list of the names with `Get-TimeZone -ListAvailable | Format-Table Id, DisplayName` and use the value in the `DisplayName` column for the `-Name` parameter.

### Join an Active Directory Domain

This one is _most definitely_  optional, I domain join my virtual machines because I have a local domain to do my development and testing with. Increasingly however it's not used.

> You will be prompted for a suitable administration account to join the domain with.

```powershell
Add-Computer -NewName 'TestVM' -DomainName YourDomain -Restart
```

### Setup PowerShell

Setup PowerShell

```powershell
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Set-ExecutionPolicy -ExecutionPolicy 'RemoteSigned' -Scope Process -Force
Install-PackageProvider -Name 'NuGet' -MinimumVersion 2.8.5.201 -Force
Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted
Remove-Module -Name PowerShellGet
Remove-Module -Name PackageManagement
Install-Module 'PowerShellGet' -AllowClobber -Force

# Install default PowerShell modules
Install-Module -Name posh-git
```

### Set Windows Options

In your admin level Windows PowerShell window, paste the code below and this will register a function that we will use throughout this post.

```powershell
function Set-RegistryKey {
    param (
        $RegistryPath,
        $Name,
        $Value,
        $Type
    )
    if (-not (Test-Path $RegistryPath)) {
        New-Item -Path $RegistryPath -Force | Out-Null
    }  
    New-ItemProperty -Path $RegistryPath -Name $Name -Value $Value -PropertyType $Type -Force 
}
```

> Some of these settings apply to the currently logged in user only. If you create new user profiles then you may have to re-apply some of these settings.

#### For Windows Client OS only (WIndows 10/11)

This will setup the following

* Edge Wizard to not run on first startup
* Set Short Date to UK format
* Set the language default across Windows to en-GB (UK format)

```powershell
# Hide Edge First Run wizard
$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 
    Name = 'HideFirstRunExperience' 
    Value = '1' 
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat

# Set the Short Date format
$regKeySplat = @{
    RegistryPath = 'HKCU:\Control Panel\International'
    Name = 'sShortDate' 
    Value = 'dd/MM/yyyy'
    Type = 'String'
}
Set-RegistryKey @regKeySplat

# Set the default language
Set-WinUserLanguageList -LanguageList 'en-GB' -Force
Set-WinSystemLocale -SystemLocale 'en-GB'
Set-WinDefaultInputMethodOverride -InputTip "0809:00000809"
```

##### Disable Widgets

This will turn off the desktop 'Widgets'

```powershell
$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Microsoft\PolicyManager\default\NewsAndInterests'
    Name = 'AllowNewsAndInterests' 
    Value = '0'
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat

$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Dsh'
    Name = 'AllowNewsAndInterests' 
    Value = '0'
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat
```

##### Disable Search 'enhancements'

```powershell
$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Windows Search'
    Name = 'EnableDynamicContentInWSB' 
    Value = '0'
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat
```

##### Set default Search Engine to google

> For some reason, this only works if the virtual machine is joined to an Active Directory domain.

```powershell
$regKeySplat = @{
    RegistryPath = 'HKCU:\Software\Policies\Microsoft\Edge\'
    Name = 'DefaultSearchProviderEnabled'
    Value = '1'
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat
$regKeySplat = @{
    RegistryPath = 'HKCU:\Software\Policies\Microsoft\Edge\'
    Name = 'DefaultSearchProviderName'
    Value = 'Google'
    Type = 'String'
}
Set-RegistryKey @regKeySplat
$regKeySplat = @{
    RegistryPath = 'HKCU:\Software\Policies\Microsoft\Edge\'
    Name = 'DefaultSearchProviderSearchURL'
    Value = '{google:baseURL}search?q={searchTerms}&{google:RLZ}{google:originalQueryForSuggestion}{google:assistedQueryStats}{google:searchFieldtrialParameter}{google:searchClient}{google:sourceId}ie={inputEncoding}'
    Type = 'String'
}
Set-RegistryKey @regKeySplat
$regKeySplat = @{
    RegistryPath = 'HKCU:\Software\Policies\Microsoft\Edge\'
    Name = 'DefaultSearchProviderKeyword'
    Value = 'google'
    Type = 'String'
}
Set-RegistryKey @regKeySplat
$regKeySplat = @{
    RegistryPath = 'HKCU:\Software\Policies\Microsoft\Edge\'
    Name = 'DefaultSearchProviderSuggestURL'
    Value = '{google:baseURL}complete/search?output=chrome&q={searchTerms}'
    Type = 'String'
}
Set-RegistryKey @regKeySplat
```

Yeah all that crap never worked for me. Just put a URL in there. Works fine on latest Win11 and W2K25.

Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge]
"AddressBarMicrosoftSearchInBingProviderEnabled"=dword:00000000
"DefaultSearchProviderEnabled"=dword:00000001
"DefaultSearchProviderSearchURL"="<https://www.google.com/search?q={searchTerms}>"
"DefaultSearchProviderName"="Google"
"DefaultSearchProviderSuggestURL"="{google:baseURL}complete/search?output=chrome&q={searchTerms}"

Does this work for edge? I doubt it

HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\Main" "Start Page"
HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\Main" "Default_Search_URL"
HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\Main" "Default_Page_URL" "<http://abc.com/>"
HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\SearchScopes\YourSearchEngineName" "DisplayName" "YourSearchEngineName"
HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\SearchScopes\YourSearchEngineName" "URL" "YourSearchEngineUrl"
HKEY_CURRENT_USER "Software\Microsoft\Internet Explorer\SearchScopes" "DefaultScope" "YourSearchEngineName"

#### For Servers only (WIndows Server 2019/2022)

##### Disable IEESC (IE Enhanced Security)

```powershell
$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components\{A509B1A7-37EF-4b3f-8CFC-4F3A74704073}'
    Name = 'IsInstalled'
    Value = '0'
    Type = 'Dword'
}
Set-RegistryKey @regKeySplat
$regKeySplat = @{
    RegistryPath = 'HKLM:\SOFTWARE\Microsoft\Active Setup\Installed Components\{A509B1A8-37EF-4b3f-8CFC-4F3A74704073}'
    Name = 'IsInstalled'
    Value = '0'
    Type = 'Dword'
}
```

##### Disable Server Manager

This will disable Server Manager starting automatically and when/if you do run it it will also disable the "Use Windows Admin Centre" prompt.

```powershell
Disable-ScheduledTask -TaskPath '\Microsoft\Windows\Server Manager\' -TaskName 'ServerManager'
Set-RegistryKey -RegistryPath 'HKLM:\SOFTWARE\Microsoft\ServerManager' -Name 'DoNotPopWACConsoleAtSMLaunch' -Value '1' -Type 'Dword'
```

### Patch the Virtual Machine

> If you want to use PowerShell to patch Windows use the code below, if not then go ahead and do it the regular way.

```powershell
Install-Module PSWindowsUpdate
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned
Get-WindowsUpdate
Install-WindowsUpdate -AcceptAll -AutoReboot
```

### Remove Azure Arc

#### Server 2022 only

> This only seems to work after round of Windows Updates. No idea why?!

```powershell
Uninstall-WindowsFeature -Name AzureArcSetup
Disable-WindowsOptionalFeature -Online -FeatureName AzureArcSetup
Uninstall-WindowsFeature -Name WindowsAdminCenterSetup
Remove-WindowsFeature AzureArcSetup
Remove-Item -Path 'C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Azure Arc Setup.lnk'
```

#### Server 2025 only

```powershell
Remove-WindowsCapability -online -Name AzureArcSetup~~~~
Remove-WindowsFeature -Name WindowsAdminCenterSetup
```

### Remove other Bits and Pieces

```powershell
Get-AppxPackage | ? {$_.Name -like 'Microsoft.WindowsFeedbackHub*'} | Remove-AppxPackage -AllUsers
Get-AppxProvisionedPackage -Online | ? {$_.DisplayName -Like 'Microsoft.WindowsFeedbackHub'} | Remove-AppxProvisionedPackage -Online
```

# Start Location

HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced
Create LaunchTo and set to 1 for This PC, 2 for Quick Access, 3 for Downloads folder, 4 OneDrive folder

Set-RegistryKey -RegistryPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'LaunchTo' -Value '1' -Type 'Dword'

# Get Rid of "Home Page" in explorer

Set-RegistryKey -RegistryPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer' -Name 'HubMode' -Value '1' -Type 'Dword'

HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Desktop\NameSpace
Remove key {f874310e-b6b7-47dc-bc84-b9e6b38f5903}

# Show file extensions

Set-RegistryKey -RegistryPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'HideFileExt' -Value '0' -Type 'Dword'

# Computer\HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced

# Set HideFileExt key to 0 (or create new DWORD 32)

# Show hidden files

Set-RegistryKey -RegistryPath 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced' -Name 'Hidden' -Value '1' -Type 'Dword'

# Computer\HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Advanced

# Set Hidden key to 1 (or create new DWORD 32)

Create default settings files for VSCode, Terminal

# Remove crap from Windows 11

function Remove-SelectedAppXPackages {

$unwantedApps = (
    "DellInc.DellSupportAssistforPCs",
    "Microsoft.Microsoft3DViewer",
    "Microsoft.MicrosoftOfficeHub"
)

# Remove advertising.xaml due to multiple outs, x32 & x64, fails with current foreach loop

Get-AppxPackage -Name microsoft.advertising.xaml -ErrorAction SilentlyContinue| Remove-AppxPackage -ErrorAction SilentlyContinue

# Remove user apps

foreach ($app in $unwantedApps) {
    try {
        Get-AppXPackage -Name $a | Remove-AppxPackage
        Write-Host "Uninstalled: $($app)" -ForegroundColor Green
    }
    catch {
        Write-Host "Uninstall failed: $($app)" -ForegroundColor Yellow
    }
}
Remove-SelectedAppXPackages

### TLDR, Looking for all the code together?

That's in the last post in th series

code $PROFILE
