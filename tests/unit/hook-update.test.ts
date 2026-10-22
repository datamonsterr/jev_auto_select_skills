import { test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "../../lib/otherskill/setup";
import { loadConfig } from "../../lib/otherskill/config";
import { createSkill, installLocal } from "../../lib/otherskill/bank";

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-hardening-"));
  roots.push(root);
  const home = path.join(root, "home"),
    cwd = path.join(root, "project");
  fs.mkdirSync(cwd, { recursive: true });
  return { root, home, cwd };
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
async function cli(
  f: ReturnType<typeof fixture>,
  args: string[],
  input?: object,
  preload?: string,
  payloadCwd = false,
) {
  const child = Bun.spawn(
    [
      process.execPath,
      ...(preload ? ["--preload", preload] : []),
      path.join(repoRoot, "otherskill.ts"),
      ...args,
      "--home",
      f.home,
      ...(payloadCwd ? [] : ["--cwd", f.cwd]),
    ],
    {
      cwd: f.cwd,
      env: {
        ...process.env,
        OPENROUTER_API_KEY: preload ? "offline-test-key" : "",
        OTHERSKILL_CONFIG: "",
        OTHERSKILL_HOME: f.home,
      },
      stdin: input ? new Blob([JSON.stringify(input)]) : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(out + err).not.toContain("offline-test-key");
  return { code, err, out, json: () => JSON.parse(out) };
}
function routingFixture() {
  const f = fixture();
  const file = path.join(f.cwd, "otherskill.config.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      model: "original/model:free",
      limits: { maxSkills: 1, maxCategories: 1, timeoutMs: 1000, retries: 0 },
    }),
  );
  const config = loadConfig({ ...f, configPath: file });
  for (const name of ["first", "second"])
    installLocal(
      config,
      createSkill(path.join(f.root, name), name, "Test skill", "instructions"),
      ["testing"],
    );
  const preload = path.join(f.root, "fetch.ts");
  fs.writeFileSync(
    preload,
    `globalThis.fetch=async (_url,init)=>{const r=JSON.parse(init.body);if(r.model!=='override/model:free')throw Error('wrong model');if(r.state.stage==='categories' && r.state.categories.map(c=>c.id).join(',')!=='backend,testing')throw Error('wrong categories');const keys=Object.keys(r.questions.selection.criteria);const p=Object.fromEntries(keys.map(k=>[k,k==='none'?0:1/(keys.length-1)]));return Response.json({answers:{selection:{type:'choice',choice:keys[0],probabilities:p,confidence:1}}});};`,
  );
  return { ...f, file, preload };
}
test("find flags override categories, model and selection limits after stdin cwd reload without writing config", async () => {
  const f = routingFixture(),
    before = fs.readFileSync(f.file, "utf8");
  const args = [
    "find",
    "--agent",
    "claude",
    "--json",
    "--config",
    f.file,
    "--model",
    "override/model:free",
    "--categories",
    "testing,backend",
    "--max-categories",
    "2",
    "--max-skills",
    "2",
  ];
  const result = await cli(
    f,
    args,
    { prompt: "Write tests", cwd: f.cwd },
    f.preload,
    true,
  );
  expect(result.code).toBe(0);
  expect(result.json().status).toBe("ok");
  expect(result.json().selected).toHaveLength(2);
  expect(result.json().categories).toHaveLength(2);
  const limited = await cli(
    f,
    [...args.slice(0, -1), "1"],
    { prompt: "Write tests", cwd: f.cwd },
    f.preload,
    true,
  );
  expect(limited.json().diagnostics).toContain(
    "skill_selection_limit_exceeded_raise_maxSkills",
  );
  const categories = await cli(
    f,
    [...args, "--max-categories=1"],
    { prompt: "Write tests", cwd: f.cwd },
    f.preload,
    true,
  );
  expect(categories.json().diagnostics).toContain(
    "category_selection_limit_exceeded",
  );
  expect(fs.readFileSync(f.file, "utf8")).toBe(before);
});

test("find timeout-ms bounds the request and invalid overrides fail open without persisting", async () => {
  const f = routingFixture();
  fs.writeFileSync(
    f.preload,
    `globalThis.fetch=async (_url,init)=>{await Bun.sleep(100);const r=JSON.parse(init.body),keys=Object.keys(r.questions.selection.criteria);return Response.json({answers:{selection:{type:'choice',choice:keys[0],probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?1:0])),confidence:1}}});};`,
  );
  const result = await cli(
    f,
    [
      "find",
      "--agent",
      "claude",
      "--json",
      "--prompt",
      "Write tests",
      "--timeout-ms",
      "10",
    ],
    undefined,
    f.preload,
  );
  expect(result.json().diagnostics).toContain("openrouter_network_or_timeout");
  const baseline = await cli(
    f,
    ["find", "--agent", "claude", "--json", "--prompt", "Write tests"],
    undefined,
    f.preload,
  );
  expect(baseline.json().status).toBe("ok");
  for (const args of [
    ["--max-skills", "0"],
    ["--max-categories", "1.5"],
    ["--timeout-ms", "Infinity"],
    ["--categories", "unknown"],
    ["--model", "paid/model"],
  ]) {
    const invalid = await cli(f, [
      "find",
      "--agent",
      "claude",
      "--prompt",
      "Write tests",
      ...args,
    ]);
    expect(invalid.code).toBe(0);
    expect(invalid.json().hookSpecificOutput.additionalContext).toBe("");
  }
});

test("Claude setup preserves unrelated handlers, migrates legacy hooks, embeds params and is idempotent", async () => {
  const f = fixture(),
    file = path.join(f.home, ".claude/settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const rtk = [
    { matcher: "Bash", hooks: [{ type: "command", command: "rtk rewrite" }] },
  ];
  fs.writeFileSync(
    file,
    JSON.stringify({
      model: "keep",
      hooks: {
        PreToolUse: rtk,
        UserPromptSubmit: [
          {
            matcher: "",
            extension: "keep",
            hooks: [
              { type: "command", command: "echo unrelated" },
              {
                type: "command",
                command: "bun run '/old/repo/hooks/claude.ts'",
              },
            ],
          },
          { hooks: [{ type: "command", command: "skill_selector --hook" }] },
        ],
      },
    }),
  );
  const before = fs.readFileSync(file, "utf8");
  const args = [
    "setup",
    "--agent",
    "claude",
    "--scope",
    "global",
    "--non-interactive",
    "--max-skills",
    "5",
    "--max-categories",
    "2",
    "--timeout-ms",
    "20000",
    "--categories",
    "testing",
    "--model",
    "example/model:free",
  ];
  const preview = await cli(f, [...args, "--dry-run"]);
  expect(preview.code).toBe(0);
  expect(preview.json().removedLegacyHooks).toHaveLength(2);
  expect(fs.readFileSync(file, "utf8")).toBe(before);
  expect(fs.existsSync(path.join(f.home, ".local"))).toBe(false);
  const first = await cli(f, args);
  expect(first.code).toBe(0);
  expect(first.json().removedLegacyHooks).toHaveLength(2);
  const settings = fs.readFileSync(file, "utf8"),
    data = JSON.parse(settings);
  expect(data.model).toBe("keep");
  expect(data.hooks.PreToolUse).toEqual(rtk);
  expect(data.hooks.UserPromptSubmit).toHaveLength(2);
  expect(data.hooks.UserPromptSubmit[0]).toEqual({
    matcher: "",
    extension: "keep",
    hooks: [{ type: "command", command: "echo unrelated" }],
  });
  const command = data.hooks.UserPromptSubmit[1].hooks[0].command;
  for (const tokens of [
    "'--max-skills' '5'",
    "'--max-categories' '2'",
    "'--timeout-ms' '20000'",
    "'--categories' 'testing'",
    "'--model' 'example/model:free'",
  ])
    expect(command).toContain(tokens);
  expect((await cli(f, args)).code).toBe(0);
  expect(fs.readFileSync(file, "utf8")).toBe(settings);
  expect(
    (
      await cli(f, [
        "config",
        "--apply",
        "--non-interactive",
        "--agent",
        "claude",
        "--scope",
        "global",
      ])
    ).code,
  ).toBe(0);
  expect(fs.readFileSync(file, "utf8")).toBe(settings);
});

test("project Claude setup targets cwd and a fresh dry-run writes nothing", async () => {
  const f = fixture();
  const args = [
    "setup",
    "--agent",
    "claude",
    "--scope",
    "project",
    "--non-interactive",
    "--max-skills",
    "5",
  ];
  expect((await cli(f, [...args, "--dry-run"])).code).toBe(0);
  expect(fs.readdirSync(f.cwd)).toEqual([]);
  expect(fs.existsSync(f.home)).toBe(false);
  expect((await cli(f, args)).code).toBe(0);
  const file = path.join(f.cwd, ".claude/settings.json"),
    before = fs.readFileSync(file, "utf8");
  expect(JSON.parse(before).hooks.UserPromptSubmit).toHaveLength(1);
  expect(before).toContain("--config");
  expect(fs.existsSync(path.join(f.home, ".claude/settings.json"))).toBe(false);
  expect((await cli(f, args)).code).toBe(0);
  expect(fs.readFileSync(file, "utf8")).toBe(before);
});

test("Claude stdin UserPromptSubmit with no key exits zero and emits valid empty hookSpecificOutput", async () => {
  const f = fixture();
  const result = await cli(
    f,
    ["find", "--agent", "claude"],
    {
      prompt: "Write tests",
      cwd: f.cwd,
      hook_event_name: "UserPromptSubmit",
      session_id: "x",
    },
    undefined,
    true,
  );
  expect(result.code).toBe(0);
  expect(result.json()).toEqual({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: "",
    },
  });
  expect(result.err).toContain("openrouter_credential_unavailable");
  expect(fs.existsSync(f.home)).toBe(false);
});

test("update from a development checkout gives git pull instructions and exits zero without network or writes", async () => {
  const f = fixture();
  const result = await cli(f, ["update", "--check", "--ref", "next"]);
  expect(result.code).toBe(0);
  expect(result.out).toContain("git pull");
  expect(fs.existsSync(f.home)).toBe(false);
  expect(fs.readdirSync(f.cwd)).toEqual([]);
});

test("Claude legacy migration preserves unrelated commands that only mention legacy identifiers", async () => {
  const f = fixture(),
    file = path.join(f.home, ".claude/settings.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const unrelated = {
    hooks: [
      { type: "command", command: "echo skill_selector hooks/claude.ts" },
    ],
  };
  fs.writeFileSync(
    file,
    JSON.stringify({ hooks: { UserPromptSubmit: [unrelated] } }),
  );
  const result = await cli(f, [
    "setup",
    "--agent",
    "claude",
    "--non-interactive",
  ]);
  expect(result.code).toBe(0);
  expect(result.json().removedLegacyHooks).toEqual([]);
  expect(
    JSON.parse(fs.readFileSync(file, "utf8")).hooks.UserPromptSubmit[0],
  ).toEqual(unrelated);
});
