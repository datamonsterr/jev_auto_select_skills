import { test, expect, afterEach } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { update } from "../../lib/otherskill/update";
import { loadConfig } from "../../lib/otherskill/config";

const roots: string[] = [];
const oldCommit = "1".repeat(40),
  newCommit = "2".repeat(40);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-update-"));
  roots.push(root);
  const home = path.join(root, "home"),
    cwd = path.join(root, "project"),
    repo = path.join(root, "old-snapshot");
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(cwd);
  fs.writeFileSync(
    path.join(repo, ".otherskill-version"),
    JSON.stringify({
      commit: oldCommit,
      ref: "master",
      installedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
  return { root, repo, home, cwd, config: loadConfig({ home, cwd }) };
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});

test("update --check compares remote SHA and --ref without filesystem or process writes", async () => {
  const f = fixture(),
    calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    return Response.json({ sha: newCommit });
  };
  const result = await update(f.config, {
    repoDir: f.repo,
    check: true,
    ref: "feature/routing",
    fetchFn,
  });
  expect(result).toMatchObject({
    status: "checked",
    installedCommit: oldCommit,
    remoteCommit: newCommit,
    updateAvailable: true,
    ref: "feature/routing",
  });
  expect(calls).toEqual([
    "https://api.github.com/repos/datamonsterr/jev_auto_select_skills/commits/feature%2Frouting",
  ]);
  expect(fs.existsSync(f.home)).toBe(false);
  expect(fs.readdirSync(f.repo)).toEqual([".otherskill-version"]);
  const same = await update(f.config, {
    repoDir: f.repo,
    check: true,
    fetchFn: async () => Response.json({ sha: oldCommit }),
  });
  if (same.status !== "checked") throw new Error("expected checked result");
  expect(same.updateAvailable).toBe(false);
});

test("update --dry-run previews pinned snapshot, frozen install and configured setup with no writes", async () => {
  const f = fixture(),
    calls: string[] = [];
  const result = await update(
    {
      ...f.config,
      agent: "claude",
      hookParams: { maxSkills: 5, timeoutMs: 20000 },
    },
    {
      repoDir: f.repo,
      dryRun: true,
      fetchFn: async (url) => {
        calls.push(url);
        return Response.json({ sha: newCommit });
      },
    },
  );
  expect(result).toMatchObject({
    status: "dry-run",
    ref: "master",
    remoteCommit: newCommit,
  });
  if (result.status !== "dry-run") throw new Error("expected dry-run result");
  expect(result.steps?.join(" ")).toContain("bun install --frozen-lockfile");
  expect(result.steps?.join(" ")).toContain("claude");
  expect(calls).toHaveLength(1);
  expect(fs.existsSync(f.home)).toBe(false);
  expect(fs.readdirSync(f.repo)).toEqual([".otherskill-version"]);
});

async function archiveFixture(f: ReturnType<typeof fixture>) {
  const { repoRoot, setup } = await import("../../lib/otherskill/setup");
  const source = path.join(f.root, "source"),
    archive = path.join(f.root, "source.tar.gz");
  fs.mkdirSync(source);
  for (const file of [
    "package.json",
    "bun.lock",
    "otherskill.ts",
    "lib",
    "examples",
    "plugins",
  ])
    fs.cpSync(path.join(repoRoot, file), path.join(source, file), {
      recursive: true,
    });
  expect(
    Bun.spawnSync(["tar", "-czf", archive, "-C", f.root, "source"]).exitCode,
  ).toBe(0);
  const configFile = path.join(
    f.home,
    ".config/otherskill/otherskill.config.json",
  );
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(
    configFile,
    JSON.stringify({
      agent: "claude",
      hookParams: { maxSkills: 5, timeoutMs: 20000 },
    }),
  );
  f.config = loadConfig({ home: f.home, cwd: f.cwd });
  setup(f.config, "claude", { companion: false });
  const commands: string[][] = [];
  const runCommand = async (args: string[], cwd: string) => {
    commands.push(args);
    if (args[1] === "install") {
      fs.symlinkSync(
        path.join(repoRoot, "node_modules"),
        path.join(cwd, "node_modules"),
      );
      return;
    }
    const child = Bun.spawn(args, {
      cwd,
      env: {
        ...process.env,
        HOME: f.home,
        OTHERSKILL_HOME: f.home,
        OTHERSKILL_CONFIG: "",
        OPENROUTER_API_KEY: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code) throw new Error(`test process failed ${code}: ${err}`);
  };
  const calls: string[] = [];
  const fetchFn = async (url: string) => {
    calls.push(url);
    return url.includes("api.github.com")
      ? Response.json({ sha: newCommit })
      : new Response(fs.readFileSync(archive));
  };
  return { commands, calls, runCommand, fetchFn };
}

test("update installs a pinned tarball in a new snapshot, records commit and reapplies configured Claude hook params", async () => {
  const f = fixture(),
    deps = await archiveFixture(f);
  const { launcherPath } = await import("../../lib/otherskill/setup");
  const oldMetadata = fs.readFileSync(
    path.join(f.repo, ".otherskill-version"),
    "utf8",
  );
  const result = await update(f.config, {
    repoDir: f.repo,
    ...deps,
    ref: "v2.0",
  });
  expect(result.status).toBe("updated");
  if (result.status !== "updated") throw new Error("expected updated result");
  expect(deps.calls).toEqual([
    "https://api.github.com/repos/datamonsterr/jev_auto_select_skills/commits/v2.0",
    `https://codeload.github.com/datamonsterr/jev_auto_select_skills/tar.gz/${newCommit}`,
  ]);
  const snapshot = result.snapshot!;
  expect(snapshot).toStartWith(
    path.join(f.home, ".local/share/otherskill/installs/release."),
  );
  expect(fs.statSync(snapshot).mode & 0o777).toBe(0o700);
  expect(
    JSON.parse(
      fs.readFileSync(path.join(snapshot, ".otherskill-version"), "utf8"),
    ),
  ).toMatchObject({
    commit: newCommit,
    ref: "v2.0",
    installedAt: expect.any(String),
  });
  expect(
    deps.commands.some(
      (args) => args.slice(1).join(" ") === "install --frozen-lockfile",
    ),
  ).toBe(true);
  expect(fs.readFileSync(launcherPath(f.home), "utf8")).toContain(
    path.join(snapshot, "otherskill.ts"),
  );
  const settings = JSON.parse(
    fs.readFileSync(path.join(f.home, ".claude/settings.json"), "utf8"),
  );
  expect(settings.hooks.UserPromptSubmit).toHaveLength(1);
  expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
    "'--timeout-ms' '20000'",
  );
  expect(settings.hooks.UserPromptSubmit[0].hooks[0].command).toContain(
    "'--max-skills' '5'",
  );
  expect(
    fs.readFileSync(path.join(f.repo, ".otherskill-version"), "utf8"),
  ).toBe(oldMetadata);
});

test("failed dependency install removes only the new snapshot and leaves the managed launcher intact", async () => {
  const f = fixture(),
    deps = await archiveFixture(f);
  const { launcherPath } = await import("../../lib/otherskill/setup");
  const before = fs.readFileSync(launcherPath(f.home), "utf8");
  const installs = path.join(f.home, ".local/share/otherskill/installs");
  fs.mkdirSync(path.join(installs, "existing"), { recursive: true });
  const commands: string[][] = [];
  await expect(
    update(f.config, {
      repoDir: f.repo,
      fetchFn: deps.fetchFn,
      runCommand: async (args) => {
        commands.push(args);
        throw new Error("private process detail");
      },
    }),
  ).rejects.toThrow("previous installation retained");
  expect(commands).toHaveLength(1);
  expect(commands[0]?.slice(1)).toEqual(["install", "--frozen-lockfile"]);
  expect(fs.readdirSync(installs)).toEqual(["existing"]);
  expect(fs.readFileSync(launcherPath(f.home), "utf8")).toBe(before);
});

test("update rejects HTTP failures, invalid remote SHA and incomplete archives before touching installation", async () => {
  const f = fixture();
  const config = { ...f.config, agent: "claude" as const };
  for (const response of [
    new Response("private remote body", { status: 503 }),
    Response.json({ sha: "invalid" }),
  ])
    await expect(
      update(config, {
        repoDir: f.repo,
        check: true,
        fetchFn: async () => response,
      }),
    ).rejects.toThrow();
  const bad = await new Bun.Archive(
    { "source/otherskill.ts": "incomplete" },
    { compress: "gzip" },
  ).bytes();
  await expect(
    update(config, {
      repoDir: f.repo,
      fetchFn: async (url) =>
        url.includes("api.github.com")
          ? Response.json({ sha: newCommit })
          : new Response(bad),
    }),
  ).rejects.toThrow("missing package.json");
  expect(fs.existsSync(f.home)).toBe(false);
  expect(fs.readdirSync(f.repo)).toEqual([".otherskill-version"]);
});

test("update setup failure retains the new snapshot for recovery and does not repoint the old launcher", async () => {
  const f = fixture(),
    deps = await archiveFixture(f);
  const { launcherPath } = await import("../../lib/otherskill/setup");
  const before = fs.readFileSync(launcherPath(f.home), "utf8");
  const settings = path.join(f.home, ".claude/settings.json");
  fs.writeFileSync(settings, "malformed user config");
  await expect(update(f.config, { repoDir: f.repo, ...deps })).rejects.toThrow(
    "source retained at",
  );
  const installs = path.join(f.home, ".local/share/otherskill/installs");
  expect(fs.readdirSync(installs)).toHaveLength(1);
  expect(fs.readFileSync(launcherPath(f.home), "utf8")).toBe(before);
  expect(fs.readFileSync(settings, "utf8")).toBe("malformed user config");
});

test("update --check reports missing legacy version metadata explicitly without writing it", async () => {
  const f = fixture();
  fs.unlinkSync(path.join(f.repo, ".otherskill-version"));
  const result = await update(f.config, {
    repoDir: f.repo,
    check: true,
    fetchFn: async () => Response.json({ sha: newCommit }),
  });
  expect(result).toMatchObject({
    status: "checked",
    installedCommit: null,
    remoteCommit: newCommit,
    updateAvailable: true,
  });
  expect(fs.readdirSync(f.repo)).toEqual([]);
  expect(fs.existsSync(f.home)).toBe(false);
});
