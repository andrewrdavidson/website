+++
date = '2025-06-18T10:00:00+01:00'
draft = false
title = 'Installing some applications'
description = 'This is the fourth post'
tags = ['powershell', 'virtual machine', 'hyper-v']
categories = ['Series']
author = 'Andrew Davidson'
summary = 'Fourth post in the Second Series: Introduction.'
series = 'Building a Developer Virtual Machine using Hyper-V and PowerShell'
+++

## What am I going to install?

I will install the following applications:

* WinGet (if not installed already, newer OSes have it already installed)
* Windows Terminal (if not installed already, newer OSes have it already installed)
* PowerShell 7 (latest)
* VS Code
* VS Code Insiders
* Git
* Gsudo
* NanaZip
* Fork
* WinMerge
* Chrome
* Firefox

And the following extensions in VS Code and VS Code Insiders:

* Editor Config
* Prettier
* Github Copilot
* PowerShell
* Spell Checker
* Markdown All-in-one
* GitHub VS Code theme (optional)
* Inline PowerShell (optional)
* VSCode Team Icons (optional)

Later in the post I will install specific tools/programs for the different types of development I could be doing.

* node
* python
* hugo
* PowerShell
* Azure
* AWS
* SQL

> For your own developer environment install the ones that you are interested in/that you use. To find other packages have a look on [winget.run](https://winget.run/) on how to find packages you can install with WinGet.

## Install common applications

I'll install the application common to all the development roles

### WinGet

```powershell
Install-Script WinGet-install -Force
WinGet-install
```

> If that doesn't work for you then you can try this post from Mike Robbins - <https://mikefrobbins.com/2024/05/02/how-to-resolve-winget-is-unable-to-find-or-install-packages/>

### Windows Terminal

```powershell
WinGet install --exact --id Microsoft.WindowsTerminal --source WinGet --silent --accept-source-agreements --accept-package-agreements
```

### PowerShell 7 (latest)

```powershell
WinGet install --id Microsoft.Powershell --source WinGet --silent --override "ADD_EXPLORER_CONTEXT_MENU_OPENPOWERSHELL=1 ADD_FILE_CONTEXT_MENU_RUNPOWERSHELL=1 ENABLE_PSREMOTING=1 REGISTER_MANIFEST=1 USE_MU=1 ENABLE_MU=1 ADD_PATH=1" --accept-source-agreements --accept-package-agreements
```

### VS Code & VS Code Insiders

```powershell
WinGet install --exact --id Microsoft.VisualStudioCode --scope machine --override '/SP- /SILENT /NORESTART /MERGETASKS=!runcode,!desktopicon,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath' --accept-source-agreements --accept-package-agreements
WinGet install --exact --id Microsoft.VisualStudioCode.Insiders --scope machine --override '/SP- /SILENT /NORESTART /MERGETASKS=!runcode,!desktopicon,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath' --accept-source-agreements --accept-package-agreements
```

> You could use VS Codium/VSCodium Insiders as well, replace the above with:
>
>```powershell
>WinGet install --exact --id VSCodium.VSCodium --scope machine --override '/SP- /SILENT /NORESTART /MERGETASKS=!runcode,!desktopicon,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath' --accept-source-agreements --accept-package-agreements
>WinGet install --exact --id VSCodium.VSCodium.Insiders --scope machine --override '/SP- /SILENT /NORESTART /MERGETASKS=!runcode,!desktopicon,addcontextmenufiles,addcontextmenufolders,associatewithfiles,addtopath' --accept-source-agreements --accept-package-agreements
>```
>
> I did find that some of the Extensions didn't work though (I'm looking at you GitHub copilot)

### Git

```powershell
# Create a git.ini for setting up Git
@"
[Setup]
Lang=default
Dir=C:\Program Files\Git
Group=Git
NoIcons=0
SetupType=default
Components=gitlfs,assoc,assoc_sh,windowsterminal
Tasks=
EditorOption=VisualStudioCode
CustomEditorPath=
DefaultBranchOption=main
PathOption=Cmd
SSHOption=OpenSSH
TortoiseOption=false
CURLOption=WinSSL
CRLFOption=CRLFCommitAsIs
BashTerminalOption=MinTTY
GitPullBehaviorOption=Merge
UseCredentialManager=Enabled
PerformanceTweaksFSCache=Enabled
EnableSymlinks=Disabled
EnablePseudoConsoleSupport=Disabled
EnableFSMonitor=Disabled
"@ | Set-Content "git-options.ini"
# Install using parameters and the git-options.ini we just created
WinGet install --exact --id Git.Git --override '/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh" /LOADINF=git-options.ini' --accept-source-agreements --accept-package-agreements
# Remove the get-options.ini file as we no longer need it
Remove-Item "git-options.ini" -force
```

### gsudo

```powershell
WinGet install --exact --id gerardog.gsudo --scope machine --accept-source-agreements --accept-package-agreements
```

### NanaZip

```powershell
WinGet install --exact --id M2Team.NanaZip --accept-source-agreements --accept-package-agreements
```

### Fork

```powershell
WinGet install --exact --id Fork.Fork --source WinGet --silent --accept-source-agreements --accept-package-agreements
```

### WinMerge

```powershell
WinGet install --exact --id WinMerge.WinMerge --source WinGet --silent --scope machine --accept-source-agreements --accept-package-agreements
```

### Chrome

```powershell
WinGet install --exact --id Google.Chrome --source WinGet --silent --scope machine --accept-source-agreements --accept-package-agreements
```

### Firefox

```powershell
winget install --exact --id Mozilla.Firefox --source WinGet --silent --scope machine --accept-source-agreements --accept-package-agreements
```

### Postman

```powershell
winget install -e --id Postman.Postman --source WinGet --silent -scope machine --accept-source-agreements --accept-package-agreements
```

## Code extensions

Next, let us install some useful Extensions to Visual Studio Code.

> For these commands to work you must close and re-open your `Admin-Level PowerShell` or `Terminal (Admin)` window.

```powershell
code --install-extension EditorConfig.EditorConfig
code --install-extension esbenp.prettier-vscode
code --install-extension github.copilot
code --install-extension GitHub.github-vscode-theme
code --install-extension mechatroner.rainbow-csv
code --install-extension ms-vscode.vscode-speech
code --install-extension ms-vscode.vscode-speech-language-pack-en-gb
code --install-extension postman.postman-for-vscode
code --install-extension streetsidesoftware.code-spell-checker
code --install-extension TylerLeonhardt.vscode-inline-values-powershell
code --install-extension vscode-icons-team.vscode-icons
code --install-extension yzhang.markdown-all-in-one
code --install-extension zainchen.json
```

### Other Code Editors

If you are using one of the other code editors (or have multiple ones installed) just change the commands in the code block above and replace `code` with one of the following:

* For VSCode Insiders use `code-insiders`
* For VSCoduim use `vscodium`
* For VSCodium Insiders use `vscodium-insiders`

> If the above commands don't work, try closing and re-opening admin level PowerShell or Terminal window.

## Install applications and extensions for PowerShell development

### VS Code extensions

```powershell
code --install-extension ms-vscode.powershell
code --install-extension TylerLeonhardt.vscode-inline-values-powershell
code --install-extension pspester.pester-test
```

## Install applications and extensions for node.js development

I'll install the application common to all the development roles

### node.js

```powershell
winget install -e --id OpenJS.NodeJS --scope machine --accept-source-agreements --accept-package-agreements
```

### VS Code extensions

## Install applications and extensions for hugo development

### hugo

```powershell
winget install -e --id Hugo.Hugo.Extended --accept-source-agreements --accept-package-agreements
```

### VS Code extensions

code --install-extension budparr.language-hugo-vscode
code --install-extension kofuk.hugo-utils
code --install-extension rusnasonov.vscode-hugo

## Install applications and extensions for python development

### VS Code extensions

## Install applications and extensions for Azure development

### VS Code extensions

code --install-extension ms-azuretools.vscode-bicep
code --install-extension ms-dotnettools.csdevkit
code --install-extension ms-dotnettools.csharp
code --install-extension ms-dotnettools.vscode-dotnet-runtime

## Install applications and extensions for AWS development

### VS Code extensions

## Install applications and extensions for SQL development

### VS Code extensions

code --install-extension ms-mssql.data-workspace-vscode
code --install-extension ms-mssql.mssql
code --install-extension ms-mssql.sql-bindings-vscode
code --install-extension ms-mssql.sql-database-projects-vscode

## Configure Terminal settings

Modify settings.json file

## Configure Visual Studio settings

Modify settings.json file

## Set git global config options
