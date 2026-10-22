# Compatibility entrypoint. Preserve native skills and configuration.
$ErrorActionPreference = "Stop"
$OtherSkillRepo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
& bun --no-env-file (Join-Path $OtherSkillRepo "otherskill.ts") setup @args
exit $LASTEXITCODE
