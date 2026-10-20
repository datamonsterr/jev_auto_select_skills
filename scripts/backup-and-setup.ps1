# Compatibility entrypoint: installation is implemented by the typed setup CLI.
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) { throw "Error: bun is required." }
& bun run (Join-Path $ScriptDir "scripts/setup-agent.ts") @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Skills were not moved. Preview separately with skill_selector migrate --dry-run; use --apply only after reviewing the plan."
