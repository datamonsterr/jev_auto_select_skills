import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../lib/otherskill/config";
import {
  agents,
  hookFile,
  inspectInstallation,
  launcherPath,
  portableError,
  setup,
  type Agent,
} from "../lib/otherskill/setup";

function project(portable: boolean, extra: Record<string, unknown> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-portable-"));
  const home = path.join(root, "home"),
    cwd = path.join(root, "project");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const file = path.join(cwd, "otherskill.config.json");
  const write = (value: boolean) =>
    fs.writeFileSync(
      file,
      JSON.stringify({
        bankPath: ".otherskill/bank",
        scope: "project",
        ...(value ? { portableHooks: true } : {}),
        ...extra,
      }),
    );
  write(portable);
  const load = () => loadConfig({ home, cwd });
  const stub = () => {
    const launcher = launcherPath(home);
    fs.mkdirSync(path.dirname(launcher), { recursive: true });
    fs.writeFileSync(
      launcher,
      `#!/bin/sh\n# OtherSkill managed launcher\nprintf '%s\\n' "$@" > "$HOME/args.txt"\ncat > "$HOME/stdin.txt"\necho '{"context":"stub ctx"}'\n`,
      { mode: 0o755 },
    );
  };
  return { root, home, cwd, write, load, stub };
}
async function sh(command: string, env: Record<string, string>, input: string) {
  const child = Bun.spawn(["sh", "-c", command], {
    stdin: new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  const [out, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, code };
}

test("portable setup writes no home or project path for any harness", () => {
  const p = project(true, { hookParams: { maxSkills: 3 } });
  try {
    const config = p.load();
    for (const agent of agents) {
      setup(config, agent, { scope: "project" });
      const text = fs.readFileSync(hookFile(agent, p.cwd, "project"), "utf8");
      expect(text).not.toContain(p.home);
      expect(text).not.toContain(p.cwd);
      expect(text).not.toContain(p.root);
      const found = inspectInstallation(config, agent);
      expect(found.configured).toBe(true);
      expect(found.diagnostics).toEqual([]);
    }
    const claude = JSON.parse(
      fs.readFileSync(hookFile("claude", p.cwd, "project"), "utf8"),
    );
    expect(claude.hooks.UserPromptSubmit[0].hooks[0].command).toBe(
      `"$HOME/.local/share/otherskill/bin/otherskill" 'find' '--agent' 'claude' '--config' "$CLAUDE_PROJECT_DIR/otherskill.config.json" '--max-skills' '3'`,
    );
    const agy = JSON.parse(
      fs.readFileSync(hookFile("antigravity", p.cwd, "project"), "utf8"),
    );
    expect(agy.otherskill.PreInvocation[0].command).toBe(
      `"$HOME/.local/share/otherskill/bin/otherskill" 'find' '--agent' 'antigravity' '--max-skills' '3'`,
    );
    const plugin = fs.readFileSync(
      hookFile("opencode", p.cwd, "project"),
      "utf8",
    );
    expect(
      plugin.startsWith(
        "// OtherSkill managed adapter\n// otherskill:portable\n",
      ),
    ).toBe(true);
    expect(plugin).not.toContain("export function");
    expect(plugin).toContain('"--agent","opencode","--max-skills","3"');
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

test("portable Claude and Antigravity commands reach the launcher through sh -c", async () => {
  const p = project(true);
  try {
    const config = p.load();
    const claude = setup(config, "claude", { scope: "project" });
    p.stub();
    const env = { HOME: p.home, CLAUDE_PROJECT_DIR: p.cwd };
    const a = await sh(
      claude.command,
      env,
      JSON.stringify({ prompt: "hi", cwd: p.cwd }),
    );
    expect(a.code).toBe(0);
    expect(JSON.parse(a.out).context).toBe("stub ctx");
    expect(
      fs.readFileSync(path.join(p.home, "args.txt"), "utf8").split("\n"),
    ).toEqual([
      "find",
      "--agent",
      "claude",
      "--config",
      path.join(p.cwd, "otherskill.config.json"),
      "",
    ]);
    const agy = setup(config, "antigravity", { scope: "project" });
    p.stub();
    fs.rmSync(path.join(p.home, "args.txt"));
    const b = await sh(
      agy.command,
      { HOME: p.home },
      JSON.stringify({ workspacePaths: [p.cwd], invocationNum: 1 }),
    );
    expect(b.code).toBe(0);
    expect(fs.readFileSync(path.join(p.home, "args.txt"), "utf8")).toBe(
      "find\n--agent\nantigravity\n",
    );
    expect(fs.readFileSync(path.join(p.home, "stdin.txt"), "utf8")).toContain(
      "workspacePaths",
    );
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

test("portable OpenCode plugin imports and runs with HOME set", async () => {
  const p = project(true);
  try {
    const config = p.load();
    setup(config, "opencode", { scope: "project" });
    p.stub();
    const file = hookFile("opencode", p.cwd, "project");
    const runner = path.join(p.root, "runner.ts");
    fs.writeFileSync(
      runner,
      `const m = await import(${JSON.stringify(file)});
console.log(JSON.stringify(Object.keys(m)));
const hooks = await m.OtherSkill({ directory: ${JSON.stringify(p.cwd)} });
const output = { messages: [{ info: { role: "user", id: "t", sessionID: "s" }, parts: [{ type: "text", text: "Find skills" }] }] };
await hooks["experimental.chat.messages.transform"]({}, output);
console.log(JSON.stringify(output.messages[0].parts[1]?.text));
`,
    );
    const child = Bun.spawn([process.execPath, "--no-env-file", runner], {
      stdout: "pipe",
      stderr: "pipe",
      env: { PATH: process.env.PATH ?? "", HOME: p.home },
    });
    const out = await new Response(child.stdout).text();
    await child.exited;
    expect(out.trim().split("\n")).toEqual(['["OtherSkill"]', '"stub ctx"']);
    expect(fs.readFileSync(path.join(p.home, "args.txt"), "utf8")).toBe(
      "find\n--agent\nopencode\n--prompt\nFind skills\n",
    );
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

test("switching absolute to portable and back keeps one handler and unrelated hooks", () => {
  const p = project(false);
  try {
    const claudeFile = hookFile("claude", p.cwd, "project");
    fs.mkdirSync(path.dirname(claudeFile), { recursive: true });
    const unrelated = {
      matcher: "Bash",
      hooks: [{ type: "command", command: "python3 guard.py" }],
    };
    fs.writeFileSync(
      claudeFile,
      JSON.stringify({ hooks: { PreToolUse: [unrelated] } }),
    );
    const count = (agent: Agent) => {
      const text = fs.readFileSync(hookFile(agent, p.cwd, "project"), "utf8");
      return text.split("'find' '--agent'").length - 1;
    };
    for (const portable of [false, true, false, true]) {
      p.write(portable);
      for (const agent of ["claude", "antigravity"] as const)
        setup(p.load(), agent, { scope: "project" });
      expect(count("claude")).toBe(1);
      expect(count("antigravity")).toBe(1);
      const claude = JSON.parse(fs.readFileSync(claudeFile, "utf8"));
      expect(claude.hooks.PreToolUse).toEqual([unrelated]);
      expect(claude.hooks.UserPromptSubmit).toHaveLength(1);
      expect(
        claude.hooks.UserPromptSubmit[0].hooks[0].command.includes(
          "$HOME/.local",
        ),
      ).toBe(portable);
      expect(inspectInstallation(p.load(), "claude").configured).toBe(true);
    }
    p.write(false);
    setup(p.load(), "opencode", { scope: "project" });
    p.write(true);
    setup(p.load(), "opencode", { scope: "project" });
    p.write(false);
    setup(p.load(), "opencode", { scope: "project" });
    expect(
      fs.readFileSync(hookFile("opencode", p.cwd, "project"), "utf8"),
    ).toContain("import {createOpenCodePlugin}");
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

test("portable hooks require project scope with a root config", () => {
  const p = project(true);
  try {
    expect(() => setup(p.load(), "claude", { scope: "global" })).toThrow(
      portableError,
    );
    const nested = path.join(p.cwd, "sub");
    fs.mkdirSync(nested);
    expect(() =>
      setup(loadConfig({ home: p.home, cwd: nested }), "claude", {
        scope: "project",
        projectRoot: nested,
      }),
    ).toThrow(portableError);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
});

test("--portable and config set persist portableHooks", async () => {
  const p = project(false);
  try {
    const run = async (args: string[]) => {
      const child = Bun.spawn(
        [
          process.execPath,
          "--no-env-file",
          path.resolve("otherskill.ts"),
          ...args,
          "--home",
          p.home,
          "--cwd",
          p.cwd,
        ],
        {
          stdout: "pipe",
          stderr: "pipe",
          env: { PATH: process.env.PATH ?? "", HOME: p.home },
        },
      );
      const [out, err] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { out, err, code: await child.exited };
    };
    const a = await run([
      "setup",
      "--non-interactive",
      "--agent",
      "codex",
      "--scope",
      "project",
      "--portable",
      "--no-companion",
    ]);
    expect(a.code).toBe(0);
    const saved = () =>
      JSON.parse(
        fs.readFileSync(path.join(p.cwd, "otherskill.config.json"), "utf8"),
      );
    expect(saved().portableHooks).toBe(true);
    expect(
      fs.readFileSync(hookFile("codex", p.cwd, "project"), "utf8"),
    ).not.toContain(p.home);
    const b = await run(["config", "set", "portableHooks", "false", "--apply"]);
    expect(b.code).toBe(0);
    expect(saved().portableHooks).toBe(false);
    expect(
      fs.readFileSync(hookFile("codex", p.cwd, "project"), "utf8"),
    ).toContain(p.home);
  } finally {
    fs.rmSync(p.root, { recursive: true, force: true });
  }
}, 20000);
test("setup keeps a relative bankPath as written", async () => {
  const p = project(false);
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      path.join(import.meta.dir, "../otherskill.ts"),
      "setup",
      "--non-interactive",
      "--agent",
      "claude",
      "--scope",
      "project",
      "--home",
      p.home,
      "--cwd",
      p.cwd,
      "--portable",
    ],
    {
      cwd: p.cwd,
      stdout: "ignore",
      stderr: "pipe",
      env: { ...process.env, HOME: p.home },
    },
  );
  expect(await child.exited).toBe(0);
  const written = JSON.parse(
    fs.readFileSync(path.join(p.cwd, "otherskill.config.json"), "utf8"),
  );
  expect(written.bankPath).toBe(".otherskill/bank");
  expect(written.portableHooks).toBe(true);
});
test("project config under .otherskill is discovered and pinned portably", () => {
  const p = project(false);
  fs.rmSync(path.join(p.cwd, "otherskill.config.json"));
  const file = path.join(p.cwd, ".otherskill/config.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ bankPath: "bank", scope: "project", portableHooks: true }),
  );
  const sub = path.join(p.cwd, "src/deep");
  fs.mkdirSync(sub, { recursive: true });
  const config = loadConfig({ home: p.home, cwd: sub });
  expect(config.configPath).toBe(file);
  expect(config.bankPath).toBe(path.join(p.cwd, ".otherskill/bank"));
  p.stub();
  setup(loadConfig({ home: p.home, cwd: p.cwd }), "claude");
  const settings = fs.readFileSync(
    hookFile("claude", p.cwd, "project"),
    "utf8",
  );
  expect(settings).toContain(
    JSON.stringify(`"$CLAUDE_PROJECT_DIR/.otherskill/config.json"`).slice(
      1,
      -1,
    ),
  );
  expect(settings).not.toContain(p.cwd);
  expect(settings).not.toContain(p.home);
  expect(
    inspectInstallation(loadConfig({ home: p.home, cwd: p.cwd }), "claude")
      .configured,
  ).toBe(true);
});
test("setup and doctor from a subdirectory use the .otherskill config's project root", () => {
  const p = project(false);
  fs.rmSync(path.join(p.cwd, "otherskill.config.json"));
  const file = path.join(p.cwd, ".otherskill/config.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ bankPath: "bank", scope: "project", portableHooks: true }),
  );
  const sub = path.join(p.cwd, "crates/deep");
  fs.mkdirSync(sub, { recursive: true });
  p.stub();
  setup(loadConfig({ home: p.home, cwd: sub }), "claude");
  expect(fs.existsSync(hookFile("claude", p.cwd, "project"))).toBe(true);
  expect(fs.existsSync(hookFile("claude", sub, "project"))).toBe(false);
  expect(
    inspectInstallation(loadConfig({ home: p.home, cwd: sub }), "claude")
      .configured,
  ).toBe(true);
});
