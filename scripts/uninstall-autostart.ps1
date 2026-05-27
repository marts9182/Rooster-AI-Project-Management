<#
.SYNOPSIS
  Remove the Publishing Ops Dashboard's at-logon Task Scheduler entry.

.DESCRIPTION
  Idempotent: succeeds whether the "Rooster Dashboard" task currently exists
  or not. No effect on the running node process — stop it manually if needed.

.EXAMPLE
  PS> .\scripts\uninstall-autostart.ps1
#>

$ErrorActionPreference = 'Stop'
$taskName = 'Rooster Dashboard'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Unregistered task '$taskName'."
} else {
    Write-Host "Task '$taskName' was not registered. Nothing to do."
}
