<#
.SYNOPSIS
  Register the Publishing Ops Dashboard to launch at user logon.

.DESCRIPTION
  Creates a Windows Task Scheduler entry named "Rooster Dashboard" that
  runs `node web.ui\backend\server.js` from this repo at every interactive
  logon of the current user.

  Idempotent: if the task already exists, it is unregistered first and
  re-created. Safe to re-run after pulling repo updates.

  Permissions: scheduling a per-user logon task with -RunLevel Limited does
  NOT require administrator rights on modern Windows. If the cmdlets below
  fail with "Access is denied", open an elevated PowerShell ("Run as
  administrator") and re-run.

.EXAMPLE
  PS> .\scripts\install-autostart.ps1
#>

$ErrorActionPreference = 'Stop'
$taskName = 'Rooster Dashboard'

# Resolve absolute paths so the task keeps working even if the user later
# moves the repo (the resolved paths are baked into the task at register-time).
$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
$serverJs = Join-Path $repoRoot 'web.ui\backend\server.js'
$workDir  = Join-Path $repoRoot 'web.ui\backend'

if (-not (Test-Path $serverJs)) {
    throw "server.js not found at $serverJs. Run this script from the repo's scripts\ directory."
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
    throw "node.exe is not on PATH. Install Node 18+ and re-run."
}

# Idempotency: remove any prior registration before creating the new one.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task '$taskName' before re-registering."
}

$action = New-ScheduledTaskAction `
    -Execute $node `
    -Argument "`"$serverJs`"" `
    -WorkingDirectory $workDir

$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

$principal = New-ScheduledTaskPrincipal `
    -UserId $env:USERNAME `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal | Out-Null

Write-Host "Registered '$taskName'. It will start on next logon."
Write-Host "  node:    $node"
Write-Host "  server:  $serverJs"
Write-Host "  workdir: $workDir"
Write-Host "  user:    $env:USERNAME (interactive logon trigger)"
Write-Host ""
Write-Host "To remove the autostart entry later, run:"
Write-Host "  .\scripts\uninstall-autostart.ps1"
