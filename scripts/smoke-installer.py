#!/usr/bin/env python3
"""Opt-in network smoke: real archive/dependencies, piped Bash and a controlling PTY.

All setup, credentials, caches and snapshots live in a disposable HOME. This
does not call OpenRouter or install hooks in the operator's home.
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
import tempfile
import time

INSTALLER = Path(__file__).resolve().parent.parent / "install.sh"
FAKE_KEY = "synthetic-installer-smoke-not-a-real-key"


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
            ("Harness:", "1"), ("Hook scope:", "1"),
            ("API key (hidden", FAKE_KEY), ("Free decision model", ""),
            ("Enabled categories:", "4"), ("Install native use-otherskill", "n"),
            ("Apply setup?", "y"),
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
            os.write(terminal, answer.encode() + b"\n")
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


def main():
    bun = shutil.which("bun")
    if not bun:
        for candidate in [Path(os.environ.get("BUN_INSTALL", "~/.bun")).expanduser() / "bin/bun", Path.home() / ".bun/bin/bun"]:
            if candidate.is_file() and os.access(candidate, os.X_OK):
                bun = str(candidate)
                break
    assert bun, "Install Bun >= 1.3 before running this smoke"
    with tempfile.TemporaryDirectory(prefix="jev installer's network smoke-") as temp:
        root = Path(temp).resolve()
        home, project, scratch = root / "home", root / "project", root / "scratch"
        for directory in [home, project, scratch]:
            directory.mkdir()
        env = {"HOME": str(home), "TMPDIR": str(scratch),
               "PATH": str(Path(bun).parent) + os.pathsep + os.defpath}
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
        assert not (home / ".claude/skills").exists()
        key = home / ".config/otherskill/credentials.json"
        assert key.stat().st_mode & 0o777 == 0o600
        assert FAKE_KEY in key.read_text()
        snapshots = list((home / ".local/share/otherskill/installs").glob("release.*"))
        assert len(snapshots) == 2
        assert all((snapshot / "node_modules/zod/package.json").is_file() for snapshot in snapshots)
        assert not list(scratch.glob("otherskill-download.*"))
        print(json.dumps({"real_github_downloads_and_dependency_installs": 2,
                          "piped_project_setup": "passed", "piped_interactive_pty_setup": "passed",
                          "persistent_launcher": "passed", "key_mode": "0600",
                          "home": "disposable", "provider_calls": 0}))


if __name__ == "__main__":
    main()
