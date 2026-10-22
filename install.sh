#!/usr/bin/env bash
# Keep this entrypoint self-contained: it also runs from curl's stdout.
main() (
  set -euo pipefail
  umask 077
  installer_source=$1
  shift

  fail() { printf '[otherskill installer] %s\n' "$*" >&2; exit 1; }
  usage() {
    cat <<'HELP'
Install Jev Skill Selector (OtherSkill) on Linux/macOS with Bash.

Usage: bash install.sh [--install-dir DIR] [--] [setup options...]
       curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash
       curl -fsSL https://raw.githubusercontent.com/datamonsterr/jev_auto_select_skills/master/install.sh | bash -s -- --non-interactive --agent codex --scope global

Installer options (before --):
  --install-dir DIR  Persistent snapshot parent (default: $HOME/.local/share/otherskill/installs)
  -h, --help         Show this help without downloading or writing anything
  --                Forward every remaining argument verbatim to `otherskill setup`

All other arguments are forwarded to the existing setup command, including:
  --agent claude|codex|antigravity|opencode, --agents claude,codex,...,
                                    (use --agent or --agents, not both),
  --scope global|project, --home DIR, --cwd DIR, --non-interactive,
  --no-companion, --dry-run, --key-env OPENROUTER_API_KEY, --model MODEL,
  --categories IDS.
Use `-- --help` for setup's full help after downloading/installing dependencies.
Without --non-interactive, the setup menu reads from the controlling terminal.
Its target checklist starts with .agents selected; use arrow keys or j/k, SPACE
to toggle optional Claude, Codex, Antigravity and OpenCode hooks, and ENTER to
confirm. .agents stays required while a harness is selected. Companion content
is canonical under .agents; Claude's native path is a symlink to it. No
terminal? Pass --non-interactive and --agent (or --agents) explicitly.

Requires Bash, curl with HTTPS, tar with gzip support, standard POSIX utilities,
and Bun >= 1.3. Bun is never downloaded automatically: install it separately
from https://bun.sh before retrying. Discovery: PATH, $BUN_INSTALL/bin/bun,
then $HOME/.bun/bin/bun. No Git or sudo is needed (Git is needed for skill imports).

Downloads the repository's current master archive over HTTPS, installs locked
dependencies, then runs setup from your original working directory. Each run
uses a new private persistent snapshot; existing snapshots/data are never replaced.
--dry-run previews setup only; source/dependencies are still installed.
Keep snapshots referenced by launchers or OpenCode adapters. A setup failure may
have written references, so its snapshot is retained for diagnosis/retry too.

API keys: inherit OPENROUTER_API_KEY or pass --key-env ENV_NAME to save privately.
For --key-stdin, download this script to a file first so stdin can carry the key;
never pipe a secret alongside the installer source. Never put keys in arguments.
HELP
  }

  install_dir=''
  setup_args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -h|--help) usage; exit 0 ;;
      --install-dir)
        [ "$#" -ge 2 ] && [ -n "$2" ] && [[ "$2" != --* ]] || fail '--install-dir requires a directory'
        install_dir=$2; shift 2 ;;
      --install-dir=*)
        install_dir=${1#*=}
        [ -n "$install_dir" ] || fail '--install-dir requires a directory'
        shift ;;
      --) shift; setup_args+=("$@"); break ;;
      *) setup_args+=("$1"); shift ;;
    esac
  done

  case "$(uname -s)" in
    Linux|Darwin) ;;
    *) fail 'supported platforms are Linux and macOS (Bash)' ;;
  esac
  [ -n "${HOME:-}" ] && [[ "$HOME" = /* ]] || fail 'HOME must be an absolute user-owned directory'
  for tool in curl tar mktemp mkdir rm; do
    command -v "$tool" >/dev/null 2>&1 || fail "missing prerequisite: $tool"
  done

  bun_bin=$(command -v bun || true)
  if [ -z "$bun_bin" ] && [ -n "${BUN_INSTALL:-}" ] && [ -x "$BUN_INSTALL/bin/bun" ]; then
    bun_bin=$BUN_INSTALL/bin/bun
  fi
  if [ -z "$bun_bin" ] && [ -x "$HOME/.bun/bin/bun" ]; then
    bun_bin=$HOME/.bun/bin/bun
  fi
  [ -n "$bun_bin" ] || fail 'Bun >= 1.3 is required. Install Bun from https://bun.sh, then retry (checked PATH, BUN_INSTALL and ~/.bun/bin).'
  # A relative PATH/BUN_INSTALL entry must survive the dependency-install chdir.
  case "$bun_bin" in /*) ;; *) bun_bin=$PWD/$bun_bin ;; esac
  bun_version=$("$bun_bin" --version) || fail 'Bun was found but could not run'
  if [[ "$bun_version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+) ]]; then
    [ "${BASH_REMATCH[1]}" -gt 1 ] || { [ "${BASH_REMATCH[1]}" -eq 1 ] && [ "${BASH_REMATCH[2]}" -ge 3 ]; } || fail "Bun >= 1.3 is required (found $bun_version)"
  else
    fail 'could not determine Bun version; Bun >= 1.3 is required'
  fi

  interactive=1
  key_stdin=0
  # The guarded array expansion also works with nounset on macOS Bash 3.2.
  for arg in ${setup_args[@]+"${setup_args[@]}"}; do
    case "$arg" in
      --non-interactive|--help|-h) interactive=0 ;;
      --key-stdin) key_stdin=1 ;;
    esac
  done
  if [ "$key_stdin" -eq 1 ] && [ ! -f "$installer_source" ]; then
    fail '--key-stdin requires running a saved installer file; use --key-env with curl | bash'
  fi
  if [ "$interactive" -eq 1 ]; then
    # Redirect only setup's stdin, never read the installer pipe as menu input.
    { exec 3</dev/tty; } 2>/dev/null || fail 'interactive setup requires a terminal; pass --non-interactive --agent <harness>'
  fi

  install_dir=${install_dir:-"$HOME/.local/share/otherskill/installs"}
  case "$install_dir" in /*) ;; *) install_dir=$PWD/$install_dir ;; esac
  work_dir=''
  release_dir=''
  retain_release=0
  cleanup() {
    if [ -n "$work_dir" ]; then rm -rf -- "$work_dir"; fi
    if [ "$retain_release" -eq 0 ] && [ -n "$release_dir" ]; then rm -rf -- "$release_dir"; fi
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  work_dir=$(mktemp -d "${TMPDIR:-/tmp}/otherskill-download.XXXXXXXX") || fail 'could not create temporary download directory'
  printf '[otherskill installer] Downloading master from GitHub...\n' >&2
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
    --connect-timeout 15 --max-time 180 --retry 2 \
    --output "$work_dir/source.tar.gz" \
    'https://codeload.github.com/datamonsterr/jev_auto_select_skills/tar.gz/refs/heads/master' \
    || fail 'repository download failed; check HTTPS/network access and retry'

  mkdir -p -- "$install_dir" || fail 'could not create persistent install directory'
  release_dir=$(mktemp -d "$install_dir/release.XXXXXXXX") || fail 'could not create persistent snapshot'
  tar -xzf "$work_dir/source.tar.gz" --strip-components=1 -C "$release_dir" \
    || fail 'could not extract repository archive'
  for file in package.json bun.lock otherskill.ts; do
    [ -f "$release_dir/$file" ] || fail "repository archive is missing $file"
  done
  printf '[otherskill installer] Installing locked dependencies in %s\n' "$release_dir" >&2
  (cd "$release_dir" && "$bun_bin" install --frozen-lockfile) \
    || fail 'dependency installation failed; check Bun version and package registry access'

  # GitHub codeload archives carry the exact commit in the global PAX comment.
  # Read it from the downloaded bytes, avoiding a branch/HEAD race or another API call.
  "$bun_bin" -e '
    import fs from "node:fs";
    import path from "node:path";
    import { gunzipSync } from "node:zlib";
    const [archive, release] = process.argv.slice(1);
    const tar = gunzipSync(fs.readFileSync(archive));
    const size = parseInt(tar.subarray(124, 136).toString().replace(/\0/g, "").trim(), 8);
    const pax = tar[156] === 103 ? tar.subarray(512, 512 + size).toString() : "";
    const commit = pax.match(/^\d+ comment=([a-f0-9]{40})\n/m)?.[1] ?? null;
    if (!commit) console.error("[otherskill installer] Archive commit unavailable; update --check will report installedCommit: null.");
    fs.writeFileSync(path.join(release, ".otherskill-version"), JSON.stringify({ commit, ref: "master", installedAt: new Date().toISOString() }, null, 2) + "\n");
  ' "$work_dir/source.tar.gz" "$release_dir" || fail 'could not record installed version'

  # From here setup can persist absolute references, even before a later failure.
  retain_release=1
  printf '[otherskill installer] Running setup; keeping source at %s\n' "$release_dir" >&2
  if [ "$interactive" -eq 1 ]; then
    "$bun_bin" --no-env-file "$release_dir/otherskill.ts" setup ${setup_args[@]+"${setup_args[@]}"} <&3 \
      || fail "setup failed; source retained at $release_dir (rerun its otherskill.ts setup)"
  else
    "$bun_bin" --no-env-file "$release_dir/otherskill.ts" setup ${setup_args[@]+"${setup_args[@]}"} \
      || fail "setup failed; source retained at $release_dir (rerun its otherskill.ts setup)"
  fi
  printf '[otherskill installer] Setup finished. Keep this source directory: %s\n' "$release_dir" >&2
  printf '[otherskill installer] Setup writes the otherskill launcher to <selected home>/.local/bin/otherskill (hooks use <selected home>/.local/share/otherskill/bin/otherskill).\n' >&2
  case ":${PATH:-}:" in
    *":$HOME/.local/bin:"*|*":$HOME/.local/bin/:"*) ;;
    *) printf '[otherskill installer] %s/.local/bin is not on PATH; add it to your shell profile to run `otherskill`.\n' "$HOME" >&2 ;;
  esac
)

# Capture this outside the function: Bash may use its own executable as
# BASH_SOURCE[0] inside a function defined on stdin.
main "${BASH_SOURCE[0]:-}" "$@"
