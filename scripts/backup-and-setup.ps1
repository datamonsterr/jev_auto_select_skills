# Compatibility entrypoint. Preserve native skills and configuration.
$ErrorActionPreference = "Stop"
$OtherSkillRepo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& bun (Join-Path $OtherSkillRepo "otherskill.ts") setup @args
exit $LASTEXITCODE
