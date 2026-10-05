+++
date = '2025-06-15T10:00:00+01:00'
draft = false
title = 'Introduction'
description = 'This is the first post'
tags = ['Network Driver', 'Intel', 'Intel I219-V', 'I219-V']
categories = ['Series']
author = 'Andrew Davidson'
summary = 'First post in the Second Series: Introduction.'
series = 'Building a Developer Virtual Machine using Hyper-V and PowerShell'
+++

## Introduction

This blog series aims to document the setup as much of a Developer virtual machine as quickly as we can using as much automation/scripting with PowerShell as possible.

```callout {.note title="This is how I tend to setup my virtual development workstations"}
I don't normally develop on my host machine since I get conflicting configurations or so many tools/languages etc that my machine can't cope - *it can really, it's me that can't* - but I do like my dev machines to be fixed on one purpose. One for PowerShell Dev, one for Azure Dev, one for React dev and so on. In this series I will be creating a developer virtual machine. If you want to setup your own PC then just skip the create the virtual machine creation and follow the rest of the posts.
```

## What you need to have and know before we can start

You will need to know a few things before we start:

* A virtualisation host running on Windows (you can use Windows 10/11, Windows Server 2019 or 2022) with the Hyper-V feature installed and configured.
  * The default Hyper-V path used in the code samples is `C:\Virtualisation`, with the ISOs in the `C:\Media` folder, and the exports going to the `C:\Exports` folder. Substitute your own paths as needed.
* Basic bare-metal OS installation knowledge.
* Familiarity with using a command line (such as PowerShell and we will be using the built-in version 5.1 in this post)
* How to start Windows PowerShell in admin mode, you can use the standard Windows PowerShell option or Windows PowerShell through Windows Terminal. Both will work just fine.
* The virtual machine should have an internet connection.
