import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../lib/otherskill/config";
import {
  TerminalSession,
  menu,
  targetChoices,
  type MenuResult,
} from "../lib/otherskill/menu";
import {
  applySetup,
  canonicalCompanionDir,
  companionDir,
  planMultiSetup,
  planSetup,
  setupTargets,
} from "../lib/otherskill/setup";

const repo = path.resolve(import.meta.dir, "..");
const companionSource = path.join(
  repo,
  "examples/polly/skills/use-otherskill/SKILL.md",
);
const companionContent = fs.readFileSync(companionSource, "utf8");

function streams() {
  const input = new PassThrough();
  const output = new PassThrough();
  let text = "";
  output.on("data", (chunk) => (text += chunk.toString()));
  return { input, output, transcript: () => text };
}

async function driveCheckbox(
  keys: string,
  initial: (typeof setupTargets)[number][] = ["agents"],
) {
  const { input, output, transcript } = streams();
  const session = new TerminalSession(input, output, true);
  const result = session.checkbox({
    title: "Install targets:",
    choices: targetChoices,
    initial,
  });
  input.write(keys);
  try {
    return { selected: await result, transcript: transcript() };
  } finally {
    session.close();
  }
}

async function driveMenu(
  keys: string,
  config: ReturnType<typeof loadConfig>,
): Promise<{ result: MenuResult; transcript: string }> {
  const { input, output, transcript } = streams();
  const result = menu(config, "setup", {
    input,
    output,
    terminal: true,
  });
  input.write(keys);
  try {
    return { result: await result, transcript: transcript() };
  } finally {
    input.end();
  }
}

function configFor(home: string, cwd: string) {
  fs.mkdirSync(cwd, { recursive: true });
  return loadConfig({ home, cwd });
}

describe("interactive target checkbox", () => {
  it("defaults to .agents and responds to real arrow, space and enter key bytes", async () => {
    // Down to Claude, toggle it; down to Codex, toggle it; confirm.
    const { selected, transcript } = await driveCheckbox(
      "\x1b[B \x1b[B \r",
    );
    expect(selected).toEqual(["agents", "claude", "codex"]);
    expect(transcript).toContain("[x] .agents");
    expect(transcript).toContain("[x] Claude");
    expect(transcript).toContain("[x] Codex");
    expect(transcript).toContain("[ ] Antigravity");
    expect(transcript).toContain("[ ] OpenCode");
  });

  it("supports SPACE deselect and refuses to confirm an empty target list", async () => {
    const { selected, transcript } = await driveCheckbox(" \r \r");
    expect(selected).toEqual(["agents"]);
    expect(transcript).toContain("Select at least one target.");
  });

  it("wraps with up/down and also accepts j/k navigation", async () => {
    const { selected } = await driveCheckbox(
      "\x1b[A " + "j" + "j" + " " + "\r",
    );
    expect(selected).toEqual(["agents", "claude", "opencode"]);
  });
});

describe("interactive setup menu", () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-menu-test-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("confirms the default .agents target and companion without prompting separately", async () => {
    const home = path.join(root, "home");
    const cwd = path.join(root, "project");
    const config = configFor(home, cwd);
    // Confirm targets, accept scope, blank key, model and categories, apply.
    const { result, transcript } = await driveMenu("\r\r\r\r\r\r", config);
    expect(result.targets).toEqual(["agents"]);
    expect(result.agents).toEqual([]);
    expect(result.agent).toBeUndefined();
    expect(result.companion).toBe(true);
    expect(transcript).not.toContain("Install native use-otherskill?");
    expect(transcript).toContain("[x] .agents");
  });

  it("selects multiple harnesses and the shared canonical companion", async () => {
    const home = path.join(root, "home");
    const cwd = path.join(root, "project");
    const config = configFor(home, cwd);
    // Claude and OpenCode while keeping the default .agents target.
    const { result } = await driveMenu(
      "\x1b[B " + "\x1b[B\x1b[B\x1b[B " + "\r\r\r\r\r\r",
      config,
    );
    expect(result.targets).toEqual(["agents", "claude", "opencode"]);
    expect(result.agents).toEqual(["claude", "opencode"]);
    expect(result.agent).toBe("claude");
    expect(result.companion).toBe(true);
  });
});

describe("multi-target setup and shared companion links", () => {
  let root: string;
  let home: string;
  let cwd: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-multi-setup-"));
    home = path.join(root, "home");
    cwd = path.join(root, "project");
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("installs canonical .agents content, Claude symlink and multiple hooks idempotently", () => {
    const config = configFor(home, cwd);
    const unrelated = path.join(home, ".agents/skills/my-skill/SKILL.md");
    fs.mkdirSync(path.dirname(unrelated), { recursive: true });
    fs.writeFileSync(unrelated, "keep my native skill");
    const claudeSettings = path.join(home, ".claude/settings.json");
    fs.mkdirSync(path.dirname(claudeSettings), { recursive: true });
    fs.writeFileSync(
      claudeSettings,
      JSON.stringify({
        model: "keep",
        hooks: {
          UserPromptSubmit: [
            { hooks: [{ type: "command", command: "original" }] },
          ],
        },
      }),
    );
    const plan = planMultiSetup(config, ["claude", "codex", "opencode"], {
      scope: "global",
    });
    expect(plan.targets).toEqual([
      "agents",
      "claude",
      "codex",
      "opencode",
    ]);
    applySetup(plan);
    const canonical = path.join(
      canonicalCompanionDir(home),
      "SKILL.md",
    );
    expect(fs.readFileSync(canonical, "utf8")).toBe(companionContent);
    const link = companionDir("claude", home);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(
      fs.realpathSync(link),
      ).toBe(fs.realpathSync(canonicalCompanionDir(home)));
    for (const hook of [
      path.join(home, ".claude/settings.json"),
      path.join(home, ".codex/hooks.json"),
      path.join(home, ".config/opencode/plugins/otherskill.ts"),
    ])
      expect(fs.existsSync(hook)).toBe(true);
    expect(fs.readFileSync(unrelated, "utf8")).toBe("keep my native skill");
    const settings = JSON.parse(fs.readFileSync(claudeSettings, "utf8"));
    expect(settings.model).toBe("keep");
    expect(settings.hooks.UserPromptSubmit).toHaveLength(2);
    expect(JSON.stringify(settings)).toContain("original");

    // A rerun neither duplicates hooks nor replaces the symlink with a copy.
    const rerun = planMultiSetup(config, ["claude", "codex", "opencode"], {
      scope: "global",
    });
    applySetup(rerun);
    expect(
      JSON.parse(fs.readFileSync(claudeSettings, "utf8")).hooks
        .UserPromptSubmit,
    ).toHaveLength(2);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(
      fs.readdirSync(path.dirname(path.dirname(unrelated))).sort(),
    ).toEqual(["my-skill", "use-otherskill"]);
  });

  it("migrates an untouched legacy Claude companion copy to a symlink", () => {
    const legacy = companionDir("claude", home);
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "SKILL.md"), companionContent);
    const config = configFor(home, cwd);
    applySetup(planSetup(config, "claude", { scope: "global" }));
    expect(fs.lstatSync(legacy).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(legacy)).toBe(
      fs.realpathSync(canonicalCompanionDir(home)),
    );
  });

  it("refuses modified copies and symlink collisions without changing them", () => {
    const config = configFor(home, cwd);
    const legacy = companionDir("claude", home);
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, "SKILL.md"), "user modified companion");
    expect(() =>
      planSetup(config, "claude", { scope: "global" }),
    ).toThrow("modified native companion");
    expect(fs.readFileSync(path.join(legacy, "SKILL.md"), "utf8")).toBe(
      "user modified companion",
    );

    const other = path.join(root, "other-companion");
    fs.mkdirSync(other);
    fs.rmSync(legacy, { recursive: true, force: true });
    fs.symlinkSync(other, legacy);
    expect(() =>
      planSetup(config, "claude", { scope: "global" }),
    ).toThrow("existing native companion symlink");
    expect(fs.readlinkSync(legacy)).toBe(other);

    const canonical = canonicalCompanionDir(home);
    fs.rmSync(legacy, { force: true });
    fs.mkdirSync(path.dirname(canonical), { recursive: true });
    fs.symlinkSync(other, canonical);
    expect(() =>
      planSetup(config, "codex", { scope: "global" }),
    ).toThrow("canonical companion symlink collision");
    fs.rmSync(canonical, { force: true });
  });

  it("keeps --no-companion hooks-only and preserves pre-existing shared skills", () => {
    const config = configFor(home, cwd);
    const skill = path.join(home, ".agents/skills/existing/SKILL.md");
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, "existing");
    applySetup(
      planSetup(config, "claude", {
        scope: "global",
        companion: false,
      }),
    );
    expect(fs.existsSync(path.join(home, ".claude/settings.json"))).toBe(true);
    expect(fs.existsSync(path.join(home, ".claude/skills"))).toBe(false);
    expect(fs.existsSync(canonicalCompanionDir(home))).toBe(false);
    expect(fs.readFileSync(skill, "utf8")).toBe("existing");
  });
});

describe("headless CLI compatibility", () => {
  it("accepts --agents for multiple hooks and keeps --agent single-target", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-agents-"));
    const home = path.join(root, "home");
    const cwd = path.join(root, "project");
    fs.mkdirSync(cwd, { recursive: true });
    const run = async (args: string[]) => {
      const child = Bun.spawn(
        [process.execPath, path.join(repo, "otherskill.ts"), ...args, "--home", home, "--cwd", cwd],
        {
          cwd,
          env: {
            ...process.env,
            OPENROUTER_API_KEY: "",
            OTHERSKILL_CONFIG: "",
            OTHERSKILL_HOME: home,
          },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { out, err, code, json: () => JSON.parse(out) };
    };
    try {
      const multi = await run([
        "setup",
        "--non-interactive",
        "--agents",
        "claude,codex",
        "--scope",
        "global",
      ]);
      expect(multi.code).toBe(0);
      expect(multi.json().agents).toEqual(["claude", "codex"]);
      expect(multi.json().targets).toEqual(["agents", "claude", "codex"]);
      expect(fs.existsSync(path.join(home, ".claude/settings.json"))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(home, ".codex/hooks.json"))).toBe(true);
      expect(
        fs.lstatSync(companionDir("claude", home)).isSymbolicLink(),
      ).toBe(true);
      const single = await run([
        "setup",
        "--non-interactive",
        "--agent",
        "codex",
        "--scope",
        "project",
      ]);
      expect(single.code).toBe(0);
      expect(single.json().agents).toEqual(["codex"]);
      expect(fs.existsSync(path.join(cwd, ".codex/hooks.json"))).toBe(true);
      // A config edit plus --apply must use the newly selected agent.
      const configured = await run([
        "config",
        "set",
        "agent",
        "opencode",
        "--apply",
        "--scope",
        "global",
      ]);
      expect(configured.code).toBe(0);
      expect(configured.json().agent).toBe("opencode");
      expect(
        fs.existsSync(
          path.join(home, ".config/opencode/plugins/otherskill.ts"),
        ),
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
