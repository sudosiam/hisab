# Start Hisab Expo in offline LAN mode (no Expo account required for local open).
# Usage: right-click → Run with PowerShell, or: powershell -File .\scripts\start-expo.ps1

Set-Location (Split-Path -Parent $PSScriptRoot)
$env:EXPO_NO_TELEMETRY = '1'
Remove-Item Env:CI -ErrorAction SilentlyContinue

Write-Host "Starting Hisab (offline LAN)..." -ForegroundColor Cyan
Write-Host "On phone Expo Go → Enter URL: exp://$((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '10.*' } | Select-Object -First 1 -ExpandProperty IPAddress)):8081" -ForegroundColor Yellow
Write-Host ""

npx expo start --offline --port 8081
