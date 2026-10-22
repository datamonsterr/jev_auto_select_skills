# 0005: Release workflow

Status: accepted

## Context

Users install from master with `install.sh` and update with `otherskill update`, which defaults to ref `master`. There were no tags or releases, so users could not pin a known version or read release notes.

## Decision

`release.yml` runs after the `CI` workflow completes successfully for a push to master (also manually via `workflow_dispatch`). It checks out the tested commit, runs an installer smoke test (`install.sh --help`, `setup --dry-run` and `doctor` in a temporary home), then reads `version` from `package.json`. If tag `vX.Y.Z` does not exist, it creates an annotated tag on that commit and a GitHub release with generated notes, using `GITHUB_TOKEN` and `gh` (no third-party action). If the tag exists, it prints "version already released" and exits 0. Releasing a new version means bumping `package.json` in a merged change.

Installers keep tracking master. `otherskill update --ref vX.Y.Z` pins a release.

## Consequences

Every green master commit with an unreleased version produces a release; unbumped commits produce none. The `live` job is part of CI, so a flaky live run blocks the release until CI is re-run. Tags are not moved: fixing a bad release needs a new version.
