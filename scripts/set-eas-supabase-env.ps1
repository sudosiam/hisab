# Sets EXPO_PUBLIC_SUPABASE_* (+ optional CLOUD_OWNER_EMAIL) on EAS preview + production from local .env
# Requires: eas login (or EXPO_TOKEN)
# Usage: npm run eas:env:supabase

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

if (-not (Test-Path .env)) {
  throw 'Missing .env - copy .env.example and fill Supabase URL + anon key.'
}

$vars = @{}
Get-Content .env | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#')) { return }
  $i = $line.IndexOf('=')
  if ($i -lt 1) { return }
  $name = $line.Substring(0, $i).Trim()
  $val = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
  $vars[$name] = $val
}

$url = $vars['EXPO_PUBLIC_SUPABASE_URL']
$anon = $vars['EXPO_PUBLIC_SUPABASE_ANON_KEY']
$ownerEmail = $vars['EXPO_PUBLIC_CLOUD_OWNER_EMAIL']

if (-not $url -or $url -match 'your-project-ref' -or -not $anon -or $anon -eq 'your-anon-key') {
  throw 'Set real EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env first.'
}

Write-Host 'Setting EAS env vars for preview + production (values not printed)...'

$eas = @('npx', '--yes', 'eas-cli@latest')

foreach ($environment in @('preview', 'production')) {
  & $eas[0] $eas[1] $eas[2] env:set `
    --name EXPO_PUBLIC_SUPABASE_URL `
    --value $url `
    --environment $environment `
    --visibility plaintext `
    --type string `
    --non-interactive
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  & $eas[0] $eas[1] $eas[2] env:set `
    --name EXPO_PUBLIC_SUPABASE_ANON_KEY `
    --value $anon `
    --environment $environment `
    --visibility sensitive `
    --type string `
    --non-interactive
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  if ($ownerEmail -and $ownerEmail -match '@' -and $ownerEmail -ne 'you@example.com') {
    & $eas[0] $eas[1] $eas[2] env:set `
      --name EXPO_PUBLIC_CLOUD_OWNER_EMAIL `
      --value $ownerEmail `
      --environment $environment `
      --visibility plaintext `
      --type string `
      --non-interactive
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }

  Write-Host "OK: $environment"
}

Write-Host 'Done. Verify with: npx eas-cli@latest env:list --environment production'
