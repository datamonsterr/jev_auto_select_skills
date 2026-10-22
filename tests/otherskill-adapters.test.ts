import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createOpenCodePlugin,
  type Message,
} from "../plugins/otherskill-opencode";
import { hookInput, hookOutput } from "../lib/otherskill/hook";
import { loadConfig } from "../lib/otherskill/config";
import { setup, hookFile, agents } from "../lib/otherskill/setup";

test("OpenCode native transform passes prompt as one literal argument, caches per turn and injects only selected context", async () => {
  const seen: string[][] = [];
  const plugin = createOpenCodePlugin({
    command: ["otherskill", "find", "--agent", "opencode"],
    cwd: ".",
    run: async (argv) => {
      seen.push(argv);
      return JSON.stringify({
        context:
          "Selected test: full description; path /bank/testing/test/SKILL.md",
      });
    },
  });
  const prompt = "literal `echo x` $(touch /tmp/no)\nfull second line";
  const message = (): Message => ({
    info: { role: "user", id: "turn1", sessionID: "session1" },
    parts: [{ type: "text", text: prompt }],
  });
  const output = { messages: [message()] };
  await plugin["experimental.chat.messages.transform"]({}, output);
  await plugin["experimental.chat.messages.transform"]({}, output);
  const replay = { messages: [message()] };
  await plugin["experimental.chat.messages.transform"]({}, replay);
  expect(seen).toEqual([
    ["otherskill", "find", "--agent", "opencode", "--prompt", prompt],
  ]);
  expect(output.messages[0]?.parts).toHaveLength(2);
  expect(replay.messages[0]?.parts).toHaveLength(2);
  expect(output.messages[0]?.parts[1]?.synthetic).toBe(true);
});
test("native payload extraction preserves full text and explicit harness output ignores detection", () => {
  const prompt = "  full prompt\nnext line  ";
  expect(
    hookInput(JSON.stringify({ prompt, cwd: "/workspace" }), "codex").prompt,
  ).toBe(prompt);
  expect(hookInput("ignored", "claude", prompt).prompt).toBe(prompt);
  expect(
    hookInput(JSON.stringify({ invocationNum: 2, prompt }), "antigravity").skip,
  ).toBe(true);
  expect(hookOutput("codex")).toEqual({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "",
    },
  });
  expect(hookOutput("claude")).toEqual({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "",
    },
  });
  expect(hookOutput("antigravity")).toEqual({ injectSteps: [] });
  expect(hookOutput("opencode")).toEqual({
    context: "",
    status: "failed",
    skills: [],
  });
});
test("Antigravity reads original USER_REQUEST from the supplied transcript without env/home scanning", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-transcript-"));
  try {
    const transcript = path.join(root, "transcript.jsonl");
    fs.writeFileSync(
      transcript,
      JSON.stringify({
        type: "USER_INPUT",
        source: "USER_EXPLICIT",
        content: "<USER_REQUEST>  original\nfull text  </USER_REQUEST>",
      }) +
        "\n" +
        JSON.stringify({ type: "TOOL_OUTPUT", content: "ignore" }) +
        "\n",
    );
    expect(
      hookInput(
        JSON.stringify({ transcriptPath: transcript, invocationNum: 1 }),
        "antigravity",
      ).prompt,
    ).toBe("  original\nfull text  ");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("every adapter supports global/project scopes and dry runs without bank exposure or duplicate hooks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-scopes-"));
  try {
    const home = path.join(root, "home"),
      cwd = path.join(root, "project");
    fs.mkdirSync(cwd, { recursive: true });
    const config = loadConfig({ home, cwd });
    for (const agent of agents)
      for (const scope of ["global", "project"] as const) {
        const plan = setup(config, agent, { scope, dryRun: true });
        expect(
          fs.existsSync(
            hookFile(agent, scope === "global" ? home : cwd, scope),
          ),
        ).toBe(false);
        expect(plan.command).toContain("'find' '--agent' '" + agent + "'");
        setup(config, agent, { scope });
        setup(config, agent, { scope });
        const hook = fs.readFileSync(
          hookFile(agent, scope === "global" ? home : cwd, scope),
          "utf8",
        );
        expect(hook).not.toContain(config.bankPath);
        expect(hook).not.toContain("skills.paths");
      }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("setup detects existing native symlink/config bank exposure without altering it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-exposure-"));
  try {
    const home = path.join(root, "home"),
      cwd = path.join(root, "project");
    fs.mkdirSync(cwd, { recursive: true });
    const config = loadConfig({ home, cwd });
    fs.mkdirSync(config.bankPath, { recursive: true });
    const native = path.join(home, ".agents/skills");
    fs.mkdirSync(native, { recursive: true });
    fs.symlinkSync(config.bankPath, path.join(native, "exposed"));
    expect(() => setup(config, "codex", { dryRun: true })).toThrow(
      "bank exposed",
    );
    expect(fs.lstatSync(path.join(native, "exposed")).isSymbolicLink()).toBe(
      true,
    );
    fs.unlinkSync(path.join(native, "exposed"));
    fs.mkdirSync(path.join(home, ".config/opencode"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".config/opencode/opencode.json"),
      JSON.stringify({ skills: { paths: [config.bankPath] } }),
    );
    expect(() => setup(config, "opencode", { dryRun: true })).toThrow(
      "bank exposed",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("doctor installation inspection detects stale launcher source paths", async () => {
  const { inspectInstallation, launcherPath } = await import(
    "../lib/otherskill/setup"
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-doctor-"));
  try {
    const config = loadConfig({ home: root, cwd: root });
    setup(config, "codex");
    expect(inspectInstallation(config, "codex").configured).toBe(true);
    fs.writeFileSync(
      launcherPath(root),
      '#!/bin/sh\n# OtherSkill managed launcher\nexec bun /missing/otherskill.ts "$@"\n',
    );
    const result = inspectInstallation(config, "codex");
    expect(result.configured).toBe(false);
    expect(result.diagnostics).toContain(
      "launcher_source_path_mismatch_or_missing",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("generated installed hook commands and the installed OpenCode module execute with safe native failures", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-installed-"));
  try {
    const config = loadConfig({ home: path.join(root, "home"), cwd: root });
    const invalid = path.join(root, "malformed.json");
    fs.writeFileSync(invalid, "{invalid");
    config.configPath = invalid;
    for (const agent of agents) {
      const plan = setup(config, agent, { scope: "global" });
      const child = Bun.spawn(["sh", "-c", plan.command], {
        stdin: new Blob([
          JSON.stringify({ prompt: "literal $(touch forbidden) prompt" }),
        ]),
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, OPENROUTER_API_KEY: "" },
      });
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(code).toBe(0);
      expect(out + err).not.toContain("literal $(touch forbidden) prompt");
      expect(JSON.parse(out)).toEqual(hookOutput(agent));
      if (agent === "opencode") {
        const module = await import(
          plan.files.find((f) => f.path.endsWith("/plugins/otherskill.ts"))!
            .path
        );
        const hooks = await module.OtherSkill({ directory: root });
        const output: { messages: Message[] } = {
          messages: [
            {
              info: { role: "user", id: "turn", sessionID: "session" },
              parts: [{ type: "text", text: "Find relevant skills" }],
            },
          ],
        };
        await hooks["experimental.chat.messages.transform"]({}, output);
        expect(output.messages[0]?.parts).toHaveLength(1);
      }
    }
    expect(fs.existsSync(path.join(root, "forbidden"))).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 10000);
