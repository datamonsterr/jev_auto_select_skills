#!/usr/bin/env python3
"""Exercise actual setup/config menus on a PTY; use synthetic credentials only."""
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import tempfile
import time

REPO = Path(__file__).resolve().parent.parent
FAKE_KEY = "synthetic-menu-key-not-a-real-credential"


def drive(root, command, responses):
    home, project = root / "home", root / "project"
    project.mkdir(exist_ok=True)
    master, slave = pty.openpty()
    env = dict(os.environ, OPENROUTER_API_KEY="", OTHERSKILL_CONFIG="", OTHERSKILL_HOME=str(home))
    process = subprocess.Popen(["bun", str(REPO / "otherskill.ts"), command, "--home", str(home), "--cwd", str(project)], stdin=slave, stdout=slave, stderr=slave, cwd=project, env=env)
    os.close(slave)
    transcript = b""
    consumed = 0
    try:
        for marker, response in responses:
            deadline = time.monotonic() + 10
            while marker.encode() not in transcript[consumed:]:
                if time.monotonic() > deadline:
                    raise AssertionError("menu did not reach " + marker)
                ready, _, _ = select.select([master], [], [], 0.1)
                if ready:
                    transcript += os.read(master, 65536)
            consumed = len(transcript)
            os.write(master, response.encode() + b"\n")
        deadline = time.monotonic() + 10
        while process.poll() is None and time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    transcript += os.read(master, 65536)
                except OSError:
                    break
        assert process.wait(timeout=2) == 0, "interactive process failed"
        assert FAKE_KEY.encode() not in transcript, "secret echoed by menu"
        return len(transcript)
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        os.close(master)


def answers(agent, scope, key, model, categories, apply_marker):
    return [("Harness:", agent), ("Hook scope:", scope), ("API key (hidden", key), ("Free decision model", model), ("Enabled categories:", categories), ("Install native use-otherskill", "y"), (apply_marker, "y")]


with tempfile.TemporaryDirectory(prefix="otherskill-menu-") as temp:
    root = Path(temp)
    setup_bytes = drive(root, "setup", answers("2", "2", FAKE_KEY, "", "1,4", "Apply setup?"))
    project_config = root / "project/otherskill.config.json"
    configured = json.loads(project_config.read_text())
    assert configured["agent"] == "codex" and configured["scope"] == "project"
    assert configured["enabledCategories"] == ["frontend/ui-ux", "testing"]
    private = root / "home/.config/otherskill/credentials.json"
    assert private.stat().st_mode & 0o777 == 0o600
    assert FAKE_KEY not in project_config.read_text()
    assert (root / "project/.agents/skills/use-otherskill/SKILL.md").exists()
    config_bytes = drive(root, "config", answers("1", "1", "", "example/decision:free", "4", "Save and apply settings/hooks?"))
    global_config = root / "home/.config/otherskill/otherskill.config.json"
    changed = json.loads(global_config.read_text())
    assert changed["model"] == "example/decision:free" and changed["scope"] == "global"
    assert changed["enabledCategories"] == ["testing"]
    assert (root / "home/.claude/settings.json").exists()
    assert json.loads(project_config.read_text())["model"] == "inception/mercury-decide:free"
    print(json.dumps({"setup_menu": "passed", "config_menu": "passed", "hidden_key": "not echoed", "credential_mode": "0600", "project_and_global_scopes": "passed", "captured_bytes": setup_bytes + config_bytes}))
