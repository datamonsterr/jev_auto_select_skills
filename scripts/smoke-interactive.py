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

# Raw terminal sequences understood by the setup checkbox.
DOWN = b"\x1b[B"
UP = b"\x1b[A"
SPACE = b" "
ENTER = b"\r"


def environment_for(root, extra=None):
    home = root / "home"
    env = dict(os.environ, OPENROUTER_API_KEY="", OTHERSKILL_CONFIG="", OTHERSKILL_HOME=str(home))
    if extra:
        env.update(extra)
    return env


def cli(root, command, args=(), extra_env=None):
    home, project = root / "home", root / "project"
    project.mkdir(parents=True, exist_ok=True)
    completed = subprocess.run(
        ["bun", str(REPO / "otherskill.ts"), command, "--home", str(home), "--cwd", str(project), *args],
        cwd=project,
        env=environment_for(root, extra_env),
        capture_output=True,
        text=True,
    )
    assert completed.returncode == 0, "cli failed: " + completed.stdout + completed.stderr
    return completed.stdout


def drive(root, command, responses, extra=(), extra_env=None):
    home, project = root / "home", root / "project"
    project.mkdir(exist_ok=True)
    master, slave = pty.openpty()
    env = environment_for(root, extra_env)
    process = subprocess.Popen(["bun", str(REPO / "otherskill.ts"), command, "--home", str(home), "--cwd", str(project), *extra], stdin=slave, stdout=slave, stderr=slave, cwd=project, env=env)
    os.close(slave)
    transcript = b""
    consumed = 0
    try:
        for marker, response in responses:
            deadline = time.monotonic() + 10
            while marker.encode() not in transcript[consumed:]:
                if time.monotonic() > deadline:
                    raise AssertionError("menu did not reach " + marker + ": " + transcript.decode(errors="replace"))
                ready, _, _ = select.select([master], [], [], 0.1)
                if ready:
                    try:
                        transcript += os.read(master, 65536)
                    except OSError:
                        raise AssertionError("menu exited before " + marker + ": " + transcript.decode(errors="replace")) from None
            consumed = transcript.index(marker.encode(), consumed) + len(marker)
            os.write(master, response)
        deadline = time.monotonic() + 10
        while process.poll() is None and time.monotonic() < deadline:
            ready, _, _ = select.select([master], [], [], 0.1)
            if ready:
                try:
                    transcript += os.read(master, 65536)
                except OSError:
                    break
        try:
            status = process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            raise AssertionError("interactive process did not exit: " + transcript.decode(errors="replace")) from None
        assert status == 0, "interactive process failed: " + transcript.decode(errors="replace")
        assert FAKE_KEY.encode() not in transcript, "secret echoed by menu"
        return transcript.decode()
    finally:
        if process.poll() is None:
            process.kill()
            process.wait()
        os.close(master)


def prompts(scope, key, model, categories, apply_marker):
    return [
        ("Hook scope:", scope + b"\n"),
        ("API key (hidden", key + b"\n"),
        ("Free decision model", model + b"\n"),
        ("Enabled categories:", categories + b"\n"),
        (apply_marker, b"y\n"),
    ]


with tempfile.TemporaryDirectory(prefix="otherskill-menu-") as temp:
    root = Path(temp)
    # Default .agents plus Codex: DOWN DOWN SPACE ENTER.
    setup_bytes = drive(root, "setup", [("Install targets", DOWN + DOWN + SPACE + ENTER), *prompts(b"2", FAKE_KEY.encode(), b"", b"1,4", "Apply setup?")], extra_env={"CLAUDE_CODE": "1"})
    project_config = root / "project/otherskill.config.json"
    configured = json.loads(project_config.read_text())
    assert configured["agent"] == "codex" and configured["scope"] == "project"
    assert configured["enabledCategories"] == ["frontend/ui-ux", "testing"]
    private = root / "home/.config/otherskill/credentials.json"
    assert private.stat().st_mode & 0o777 == 0o600
    assert FAKE_KEY not in project_config.read_text()
    shared = root / "project/.agents/skills/use-otherskill/SKILL.md"
    assert shared.exists()
    assert (root / "project/.codex/hooks.json").exists()
    assert not (root / "project/.claude/skills").exists()
    assert not (root / "project/.claude/settings.json").exists()
    # Global config menu: keep .agents, add Claude, remove the previous Codex.
    config_bytes = drive(root, "config", [("Install targets", DOWN + SPACE + DOWN + SPACE + ENTER), *prompts(b"1", b"", b"example/decision:free", b"4", "Save and apply settings/hooks?")])
    global_config = root / "home/.config/otherskill/otherskill.config.json"
    changed = json.loads(global_config.read_text())
    assert changed["model"] == "example/decision:free" and changed["scope"] == "global"
    assert changed["enabledCategories"] == ["testing"]
    assert (root / "home/.claude/settings.json").exists()
    assert json.loads(project_config.read_text())["model"] == "inception/mercury-decide:free"
    # B3: a seeded multi-harness selection survives an untouched interactive rerun.
    persist_root = root / "persist"
    persisted = json.loads(cli(persist_root, "setup", ["--non-interactive", "--agents", "codex,opencode", "--scope", "global"], {"CLAUDE_CODE": "1"}))
    assert persisted["agent"] == "codex" and persisted["agents"] == ["codex", "opencode"]
    persisted_home = persist_root / "home"
    persisted_config = persisted_home / ".config/otherskill/otherskill.config.json"
    assert (persisted_home / ".codex/hooks.json").exists()
    assert (persisted_home / ".config/opencode/plugins/otherskill.ts").exists()
    assert not (persisted_home / ".claude/settings.json").exists()
    persist_bytes = drive(persist_root, "setup", [("Install targets", ENTER), *prompts(b"\n", b"", b"", b"", "Apply setup?")], extra_env={"CLAUDE_CODE": "1"})
    survived = json.loads(persisted_config.read_text())
    assert survived["agent"] == "codex" and survived["agents"] == ["codex", "opencode"]
    assert (persisted_home / ".codex/hooks.json").exists()
    assert (persisted_home / ".config/opencode/plugins/otherskill.ts").exists()
    assert not (persisted_home / ".claude/settings.json").exists()
    reapplied = json.loads(cli(persist_root, "config", ["set", "model", "example/persist:free", "--apply", "--scope", "global"], {"CLAUDE_CODE": "1"}))
    assert reapplied["agent"] == "codex" and reapplied["agents"] == ["codex", "opencode"]
    assert (persisted_home / ".codex/hooks.json").exists()
    assert (persisted_home / ".config/opencode/plugins/otherskill.ts").exists()
    assert not (persisted_home / ".claude/settings.json").exists()
    # Explicit flags still take precedence; --no-companion leaves no skill paths.
    flags_output = drive(root, "setup", [("Install targets", ENTER), *prompts(b"\n", b"", b"", b"", "Apply setup?")], ["--agent", "codex", "--scope", "project", "--no-companion", "--dry-run"])
    flags_result = json.loads(flags_output[flags_output.rfind("{"):])
    assert flags_result["agent"] == "codex" and flags_result["scope"] == "project"
    assert not any("skills/use-otherskill" in item for item in flags_result["files"])
    print(json.dumps({"setup_menu": "passed", "checkbox_keys": "arrows/space/enter", "default_on_disk": ".agents", "explicit_menu_flags": "passed", "config_menu": "passed", "saved_targets_survive_pty": "passed", "saved_set_reapplied": "passed", "claude_detection_ignored": "passed", "hidden_key": "not echoed", "credential_mode": "0600", "project_and_global_scopes": "passed", "captured_bytes": len(setup_bytes) + len(config_bytes) + len(persist_bytes)}))
