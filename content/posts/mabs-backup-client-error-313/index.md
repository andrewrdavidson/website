+++
date = '2026-10-07T20:40:00+01:00'
draft = true
title = 'MABS backup client error 313'
description = 'Fix the MABS backup client installation error 313 by installing the required Visual C++ runtime before the client setup runs.'
tags = ['MABS', 'Backup', 'Error 313', 'Visual C++', 'Windows Server']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Resolve the MABS backup client installation error 313 by installing the required Visual C++ runtime on the server before retrying the client setup.'
+++

Using MABS v4 to install the backup client onto a brand new server returns

Error 313:

Cause:

Turns out that you need a very specific version of the VC++ runtime that isn't documented anywhere I can find

```powershell
winget install -e microsoft.visual 
```

Then the client will install OK.

