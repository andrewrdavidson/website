+++
date = '2025-06-22T16:23:50+01:00'
draft = true
title = 'Remove empty folders in specified path'
description = 'This is the first post'
tags = ['PowerShell', 'Folders', 'Emptying']
categories = ['Tips']
author = 'Andrew Davidson'
summary = 'After processing files, I ended up with a structure with some empty folders. This script recursively processes a folder structure and removes any empty folder it finds.'
+++


```powershell
# Set to true to test the script
$whatIf = $false
# Remove hidden files, like thumbs.db
$removeHiddenFiles = $false
# Get hidden files or not. Depending on removeHiddenFiles setting
$getHiddenFiles = !$removeHiddenFiles
# Remove empty directories locally
Function Delete-EmptyFolder($path) {
 if ($path -like '*#recycle*') {
  Write-Host "Skipping $path"
  continue
 }
 if ($path -like '$recycle.Bin*') {
  Write-Host "Skipping $path"
  continue
 }
 if ($path -like '*System Volume Information*') {
  Write-Host "Skipping $path"
  continue
 }
 # Go through each subfolder,
 Foreach ($subFolder in Get-ChildItem -Force -Literal $path -Directory) {
  # Call the function recursively
  Delete-EmptyFolder -path $subFolder.FullName
 }
 # Get all child items
 $subItems = Get-ChildItem -Force:$getHiddenFiles -LiteralPath $path
 #Write-Host "subItems -eq null" + ($null -eq $subItems)
 #Write-Host "subItems.count" + ($subItems.Count)
 # If there are no items, then we can delete the folder
 # Exluce folder: If (($subItems -eq $null) -and (-Not($path.contains("DfsrPrivate"))))
 If ($subItems -eq $null) {
  Write-Host "Removing empty folder '${path}'"
  Remove-Item -Force -Recurse:$removeHiddenFiles -LiteralPath $Path -WhatIf:$whatIf
 }
}
# Run the script
#Delete-EmptyFolder -path "D:\tag"
Delete-EmptyFolder -path 'D:\'
```
