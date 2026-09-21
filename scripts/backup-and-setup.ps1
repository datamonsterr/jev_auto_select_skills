# ==============================================================================
# Jev Skill Selector: Centralized Skills Bank Setup & Hook Installer (PowerShell)
# ==============================================================================
# This script:
# 1. Backs up existing skills in ~/.agents/skills, ~/.claude/skills, ~/.codex/skills
# 2. Moves skills into a centralized skills bank (~/.agents/skills_bank)
# 3. Packages and installs jev-skill-selector into ~/.agents/skills
# 4. Configures Claude Code and Codex hooks to auto-route every prompt with Jev
# ==============================================================================

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $ScriptDir) {
    $ScriptDir = (Get-Location).Path
}

$HomeDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::UserProfile)
$SkillsBank = if ($env:SKILLS_BANK_PATH) { $env:SKILLS_BANK_PATH } else { Join-Path $HomeDir ".agents\jev_skills" }
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupDir = Join-Path $HomeDir ".agents\skills_backup_$Timestamp"

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  🚀 Jev Skill Selector: Automated Machine Setup (Windows) " -ForegroundColor Cyan
Write-Host "======================================================`n" -ForegroundColor Cyan

# 1. Verify Bun runtime
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Host "Error: 'bun' runtime is not installed." -ForegroundColor Red
    Write-Host "Please install Bun: powershell -c ""irm bun.sh/install.ps1 | iex"""
    exit 1
}
$bunVersion = bun --version
Write-Host "✓ Bun runtime detected: $bunVersion" -ForegroundColor Green

# 2. Create Skills Bank and Backup Directories
Write-Host "`nStep 1: Setting up centralized skills bank & backup directory..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $SkillsBank | Out-Null
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
Write-Host "Skills Bank Path : $SkillsBank" -ForegroundColor Green
Write-Host "Backup Directory : $BackupDir" -ForegroundColor Green

# 3. Collect and Move Skills from Agents, Claude, and Codex directories
Write-Host "`nStep 2: Consolidating skills into skills bank..." -ForegroundColor Yellow

$SourceDirs = @(
    (Join-Path $HomeDir ".agents\skills"),
    (Join-Path $HomeDir ".claude\skills"),
    (Join-Path $HomeDir ".codex\skills"),
    (Join-Path $ScriptDir ".agents\jev_skills"),
    (Join-Path $ScriptDir "skills")
)

$MovedCount = 0
foreach ($src in $SourceDirs) {
    if (Test-Path $src) {
        Write-Host "Scanning $src..."
        Get-ChildItem -Directory -Path $src | ForEach-Object {
            $skillName = $_.Name
            if ($skillName -ne "jev-skill-selector") {
                # Copy to backup
                Copy-Item -Recurse -Force -Path $_.FullName -Destination (Join-Path $BackupDir $skillName)
                
                # Move to centralized skills bank if not already present
                $destSkill = Join-Path $SkillsBank $skillName
                if (-not (Test-Path $destSkill)) {
                    Copy-Item -Recurse -Force -Path $_.FullName -Destination $destSkill
                    $MovedCount++
                }
                
                # Remove from original agent folder if it's not the repo's skills folder
                if ($src -ne (Join-Path $ScriptDir "skills")) {
                    Remove-Item -Recurse -Force -Path $_.FullName
                }
            }
        }
    }
}

$bankCount = (Get-ChildItem -Directory -Path $SkillsBank).Count
Write-Host "✓ Consolidated and backed up skills. Bank now contains: $bankCount skills." -ForegroundColor Green

# 4. Install jev-skill-selector into ~/.agents/skills
Write-Host "`nStep 3: Installing jev-skill-selector as the active router skill..." -ForegroundColor Yellow
$AgentsSkills = Join-Path $HomeDir ".agents\skills"
New-Item -ItemType Directory -Force -Path $AgentsSkills | Out-Null
$TargetSkillDir = Join-Path $AgentsSkills "jev-skill-selector"

if (Test-Path $TargetSkillDir) {
    Remove-Item -Recurse -Force -Path $TargetSkillDir
}

# Create Junction or Copy
try {
    New-Item -ItemType Junction -Path $TargetSkillDir -Target $ScriptDir | Out-Null
    Write-Host "✓ Created junction link to: $TargetSkillDir" -ForegroundColor Green
} catch {
    Copy-Item -Recurse -Force -Path $ScriptDir -Destination $TargetSkillDir
    Write-Host "✓ Copied jev-skill-selector to: $TargetSkillDir" -ForegroundColor Green
}

# 5. Environment configuration
Write-Host "`nStep 4: Checking environment configuration..." -ForegroundColor Yellow
$EnvFile = Join-Path $ScriptDir ".env"
$EnvExample = Join-Path $ScriptDir ".env.example"
if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
        Copy-Item -Path $EnvExample -Destination $EnvFile
        Write-Host "Created .env from .env.example. Please update OPENROUTER_API_KEY in: $EnvFile" -ForegroundColor Yellow
    }
} else {
    Write-Host "✓ .env found: $EnvFile" -ForegroundColor Green
}

# 6. Configure Claude Code Hook (~/.claude/settings.json)
Write-Host "`nStep 5: Configuring Claude Code Hook..." -ForegroundColor Yellow
$ClaudeConfigDir = Join-Path $HomeDir ".claude"
$ClaudeSettings = Join-Path $ClaudeConfigDir "settings.json"
New-Item -ItemType Directory -Force -Path $ClaudeConfigDir | Out-Null

$ClaudeHookScript = (Join-Path $ScriptDir "hooks\claude.ts").Replace("\", "/")
$ClaudeHookCmd = "bun run $ClaudeHookScript"

$settingsObj = @{}
if (Test-Path $ClaudeSettings) {
    try {
        $settingsObj = Get-Content -Raw -Path $ClaudeSettings | ConvertFrom-Json -AsHashtable
    } catch {
        $settingsObj = @{}
    }
}

if (-not $settingsObj.ContainsKey("hooks")) {
    $settingsObj["hooks"] = @{}
}
if (-not $settingsObj["hooks"].ContainsKey("UserPromptSubmit")) {
    $settingsObj["hooks"]["UserPromptSubmit"] = @()
}

$alreadyPresent = $false
foreach ($h in $settingsObj["hooks"]["UserPromptSubmit"]) {
    if ($h -eq $ClaudeHookCmd -or $h.command -eq $ClaudeHookCmd) {
        $alreadyPresent = $true
        break
    }
}

if (-not $alreadyPresent) {
    $settingsObj["hooks"]["UserPromptSubmit"] += @{ command = $ClaudeHookCmd }
    $settingsObj | ConvertTo-Json -Depth 10 | Set-Content -Path $ClaudeSettings
    Write-Host "✓ Configured UserPromptSubmit hook in Claude settings: $ClaudeSettings" -ForegroundColor Green
} else {
    Write-Host "✓ Hook already present in Claude settings." -ForegroundColor Green
}

# 7. Configure Codex Hook (~/.codex/config.json)
Write-Host "`nStep 6: Configuring Codex Hook..." -ForegroundColor Yellow
$CodexConfigDir = Join-Path $HomeDir ".codex"
$CodexConfig = Join-Path $CodexConfigDir "config.json"
New-Item -ItemType Directory -Force -Path $CodexConfigDir | Out-Null

$CodexHookScript = (Join-Path $ScriptDir "hooks\codex.ts").Replace("\", "/")
$CodexHookCmd = "bun run $CodexHookScript"

$codexObj = @{}
if (Test-Path $CodexConfig) {
    try {
        $codexObj = Get-Content -Raw -Path $CodexConfig | ConvertFrom-Json -AsHashtable
    } catch {
        $codexObj = @{}
    }
}
if (-not $codexObj.ContainsKey("hooks")) {
    $codexObj["hooks"] = @{}
}
$codexObj["hooks"]["pre_prompt"] = $CodexHookCmd
$codexObj | ConvertTo-Json -Depth 10 | Set-Content -Path $CodexConfig
Write-Host "✓ Configured pre_prompt hook in Codex config: $CodexConfig" -ForegroundColor Green

Write-Host "`n======================================================" -ForegroundColor Green
Write-Host "  🎉 Setup Complete!                                  " -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
Write-Host "Centralized Skills Bank : $SkillsBank" -ForegroundColor Cyan
Write-Host "Backup Location        : $BackupDir" -ForegroundColor Cyan
Write-Host "Router Skill           : $TargetSkillDir" -ForegroundColor Cyan
Write-Host "`nHow to add new skills in the future:" -ForegroundColor Yellow
Write-Host "  Simply create a folder with a SKILL.md in your skills bank:"
Write-Host "  New-Item -ItemType Directory -Path ""$SkillsBank\my-new-skill""" -ForegroundColor Cyan
Write-Host "  New-Item -ItemType File -Path ""$SkillsBank\my-new-skill\SKILL.md""" -ForegroundColor Cyan
Write-Host "  Jev will automatically discover and route to it on your next prompt!`n"
