#!/usr/bin/env python3
"""Opt-in installer smoke: piped Bash, dependencies and a controlling PTY.

By default this downloads the current GitHub master archive. Set
SMOKE_LOCAL_ARCHIVE=1 to package this working tree instead, which verifies
unmerged branches without changing the installer's production URL. All setup,
credentials, caches and snapshots live in a disposable HOME. This does not
call OpenRouter or install hooks in the operator's home.
"""
import errno
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time

REPO = Path(__file__).resolve().parent.parent
INSTALLER = REPO / "install.sh"
FAKE_KEY = "synthetic-installer-smoke-not-a-real-key"
DOWN = b"\x1b[B"
SPACE = b" "
ENTER = b"\r"


def interactive(project, env):
    read_fd, write_fd = os.pipe()
    pid, terminal = pty.fork()
    if pid == 0:
        os.close(write_fd)
        os.dup2(read_fd, 0)  # Source on stdin, menu through /dev/tty.
        os.close(read_fd)
        os.chdir(project)
        os.execve("/bin/bash", ["bash", "-s", "--"], env)
    os.close(read_fd)
    transcript = b""
    consumed = 0
    reaped = False
    try:
        with os.fdopen(write_fd, "wb") as source:
            source.write(INSTALLER.read_bytes())
        for marker, answer in [
            ("Install targets", DOWN + SPACE + ENTER),
            ("Hook scope:", b"1\n"),
            ("API key (hidden", FAKE_KEY.encode() + b"\n"),
            ("Free decision model", b"\n"),
            ("Enabled categories:", b"4\n"),
            ("Apply setup?", b"y\n"),
        ]:
            deadline = time.monotonic() + 240
            while marker.encode() not in transcript[consumed:]:
                assert time.monotonic() < deadline, "installer did not reach " + marker
                ready, _, _ = select.select([terminal], [], [], 0.1)
                if ready:
                    try:
                        data = os.read(terminal, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        data = b""
                    assert data, "installer exited before " + marker + ": " + transcript.decode()
                    transcript += data
            consumed = len(transcript)
            os.write(terminal, answer)
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            ready, _, _ = select.select([terminal], [], [], 0.1)
            if ready:
                try:
                    transcript += os.read(terminal, 65536)
                except OSError as error:
                    if error.errno != errno.EIO:
                        raise
            finished, status = os.waitpid(pid, os.WNOHANG)
            if finished:
                reaped = True
                assert os.waitstatus_to_exitcode(status) == 0, transcript.decode()
                assert FAKE_KEY.encode() not in transcript, "secret echoed"
                return
        raise AssertionError("installer did not exit after menu")
    finally:
        if not reaped:
            os.killpg(pid, signal.SIGKILL)
            os.waitpid(pid, 0)
        os.close(terminal)


def local_archive(dest):
    """Build the current working tree into the archive shape the installer expects."""
    skip = {".git", "node_modules", ".tmp", ".polly", "__pycache__"}
    with tarfile.open(dest, "w:gz") as tar:
        for entry in sorted(REPO.iterdir()):
            if entry.name in skip:
                continue
            tar.add(entry, arcname="source/" + entry.name)


def fake_curl(bin_dir):
    bin_dir.mkdir()
    curl = bin_dir / "curl"
    curl.write_text(
        """#!/bin/sh
out=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --output) out=$2; shift 2 ;;
    *) shift ;;
  esac
done
[ -n "$out" ] || exit 2
cp "$SMOKE_ARCHIVE" "$out"
"""
    )
    curl.chmod(0o755)


def main():
    bun = shutil.which("bun")
    if not bun:
        for candidate in [Path(os.environ.get("BUN_INSTALL", "~/.bun")).expanduser() / "bin/bun", Path.home() / ".bun/bin/bun"]:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                bun = str(candidate)
                break
    assert bun, "Install Bun >= 1.3 before running this smoke"
    with tempfile.TemporaryDirectory(prefix="otherskill installer's network smoke-") as temp:
        root = Path(temp).resolve()
        home, project, scratch = root / "home", root / "project", root / "scratch"
        for directory in [home, project, scratch]:
            directory.mkdir()
        extra = {}
        tool_path = str(Path(bun).parent) + os.pathsep + os.defpath
        if os.environ.get("SMOKE_LOCAL_ARCHIVE"):
            archive = root / "source.tar.gz"
            local_archive(archive)
            fake_curl(root / "bin")
            extra["SMOKE_ARCHIVE"] = str(archive)
            tool_path = str(root / "bin") + os.pathsep + tool_path
        env = {"HOME": str(home), "TMPDIR": str(scratch),
               "PATH": tool_path, **extra}
        result = subprocess.run(
            ["/bin/bash", "-s", "--", "--non-interactive", "--agent", "codex", "--scope", "project"],
            input=INSTALLER.read_bytes(), cwd=project, env=env,
            capture_output=True, timeout=240,
        )
        assert result.returncode == 0, result.stderr.decode()
        assert (project / ".codex/hooks.json").is_file()
        assert not (home / ".codex").exists()
        launcher = home / ".local/share/otherskill/bin/otherskill"
        subprocess.run([launcher, "--help"], env=env, cwd=project,
                       check=True, capture_output=True, timeout=15)
        interactive(project, env)
        assert (home / ".claude/settings.json").is_file()
        shared = home / ".agents/skills/use-otherskill/SKILL.md"
        assert shared.is_file()
        assert (home / ".claude/skills/use-otherskill").is_symlink()
        key = home / ".config/otherskill/credentials.json"
        assert key.stat().st_mode & 0o777 == 0o600
        assert FAKE_KEY in key.read_text()
        snapshots = list((home / ".local/share/otherskill/installs").glob("release.*"))
        assert len(snapshots) == 2
        assert all((snapshot / "node_modules/zod/package.json").is_file() for snapshot in snapshots)
        assert not list(scratch.glob("otherskill-download.*"))
        print(json.dumps({"source": "local working tree" if extra else "real GitHub master",
                          "real_github_downloads_and_dependency_installs": 0 if extra else 2,
                          "piped_project_setup": "passed", "piped_interactive_pty_setup": "passed",
                          "checkbox_keys": "arrows/space/enter",
                          "shared_companion": ".agents canonical + Claude symlink",
                          "persistent_launcher": "passed", "key_mode": "0600",
                          "home": "disposable", "provider_calls": 0}))


if __name__ == "__main__":
    main()
