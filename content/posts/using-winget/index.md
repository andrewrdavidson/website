+++
date = '2026-10-06T19:39:00+01:00'
draft = true
title = 'Using winget on Windows'
description = 'Use winget to install, update, search for, and manage software packages from the command line on Windows.'
tags = ['winget', 'PowerShell', 'Windows', 'Software', 'Package Manager']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Use Windows Package Manager to install apps, check for updates, search the catalog, and manage software from the command line.'
+++

Windows Package Manager, also known as `winget`, is the built-in command-line tool for installing and managing software on Windows. It is especially useful when you want a faster, more repeatable way to install apps than browsing the Microsoft Store or downloading installers manually.

This quick reference covers the most common commands for finding, installing, updating, and managing packages.

# Using winget

## Install an app

This downloads and installs the specified application. For example, `winget install Git.Git` installs Git from the winget catalog.

```powershell
winget install <package>
```

## Uninstall an app

This removes the specified application completely from the system.

```powershell
winget uninstall <package>
```


## List apps with available updates

This shows apps that have newer versions available for upgrade.

```powershell
winget upgrade
```

## Upgrade all apps

This updates every installed package that winget can manage.

```powershell
winget upgrade --all
```

If you want to include packages where the current version is not known, use:

```powershell
winget upgrade --all --include-unknown
```

## Find an application

```powershell
winget search <query>
```

This searches the winget repository for a package matching your search term.

## List installed apps

```powershell
winget list
```

This shows a complete list of software currently installed on the machine.

## Block an app from being upgraded

This lets you prevent specific applications from being updated when you run a broader upgrade command.

```powershell
winget pin
```

## Show package details

This displays package metadata such as publisher, installer information, supported architectures, and version details.

```powershell
winget show <package>
```
