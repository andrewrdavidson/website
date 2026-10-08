+++
date = '2026-10-04T11:31:00+01:00'
draft = true
title = 'Prune stale local Git branches'
description = 'Clean up local Git branches that no longer exist on the remote by fetching and deleting stale references.'
tags = ['Git', 'PowerShell', 'Branch Cleanup', 'Source Control', 'Development']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'Remove local Git branches that have already been deleted on the remote with a single prune-and-delete workflow.'
+++

When a branch has been merged or deleted upstream, it can keep hanging around in your local repository as a stale reference. Over time that creates clutter and makes it harder to see what is still active. The quickest fix is to prune the remote-tracking refs and then delete the local branches that Git reports as already gone.

# Remove all local Git branches that no longer exist on remote

The first command updates your remote refs and removes any stale remote-tracking branches:

```powershell
git fetch origin --prune --prune-tags
```

This next command finds local branches whose upstream has been removed and deletes them:

```powershell
git branch -vv | select-string 'origin/(.*): gone]' | ForEach-Object { ($_.Matches.Value).replace("origin/","") } | ForEach-Object { $_.replace(": gone]",""); } | ForEach-Object { git branch -D $_ }
```

This is a handy cleanup step after rebasing, branch deletion, or repository maintenance, and it keeps your local Git view clean and accurate.
