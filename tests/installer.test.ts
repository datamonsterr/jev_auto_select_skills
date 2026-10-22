import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dir, "..");
const installer = path.join(repo, "install.sh");
const script = fs.readFileSync(installer, "utf8");
let fixture: string, archive: string, root: string, home: string;
let project: string, bin: string, scratch: string;

function executable(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o755 });
}

beforeAll(() => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), "jev-installer-fixture-"));
  const source = path.join(fixture, "source");
  fs.mkdirSync(source);
  for (const file of [
    "package.json",
    "bun.lock",
    "otherskill.ts",
    "lib",
    "plugins",
    "examples",
  ]) {
    fs.cpSync(path.join(repo, file), path.join(source, file), {
      recursive: true,
    });
  }
  archive = path.join(fixture, "source.tar.gz");
  expect(
    Bun.spawnSync(["tar", "-czf", archive, "-C", fixture, "source"]).exitCode,
  ).toBe(0);
});
afterAll(() => fs.rmSync(fixture, { recursive: true, force: true }));
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "jev installer's space-"));
  home = path.join(root, "home");
  project = path.join(root, "project");
  bin = path.join(root, "bin");
  scratch = path.join(root, "scratch");
  for (const dir of [home, project, bin, scratch]) fs.mkdirSync(dir);
  // Keep runtime-discovery tests deterministic even if a host installs Bun
  // in /usr/bin. Expose only the utilities used by the installer/fixtures.
  for (const tool of [
    "cat",
    "cp",
    "gzip",
    "ln",
    "mkdir",
    "mktemp",
    "rm",
    "tar",
    "uname",
  ]) {
    const found = Bun.which(tool);
    if (!found) throw new Error(`test prerequisite missing: ${tool}`);
    fs.symlinkSync(found, path.join(bin, tool));
  }
  executable(
    path.join(bin, "curl"),
    `#!/bin/bash
set -eu
printf '%s\\0' "$@" > "$TEST_CURL_LOG"
if [ "\${TEST_DOWNLOAD_STATUS:-0}" != 0 ]; then
  printf 'fixture HTTP error\\n' >&2
  exit "$TEST_DOWNLOAD_STATUS"
fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then cp "$TEST_ARCHIVE" "$2"; exit 0; fi
  shift
done
exit 99
`,
  );
  executable(
    path.join(bin, "bun"),
    `#!/bin/bash
set -eu
case "$1" in
  --version) printf '%s\\n' "\${TEST_BUN_VERSION:-1.3.14}" ;;
  install)
    printf '%s\\0' "$PWD" "$@" > "$TEST_INSTALL_LOG"
    [ "\${TEST_INSTALL_STATUS:-0}" = 0 ] || exit "$TEST_INSTALL_STATUS"
    ln -s "$TEST_DEPENDENCIES" node_modules ;;
  *)
    printf '%s\\0' "$PWD" "$@" > "$TEST_SETUP_LOG"
    exec "$TEST_REAL_BUN" "$@" ;;
esac
`,
  );
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function run(
  args: string[] = [],
  options: {
    pipe?: boolean;
    input?: string;
    env?: Record<string, string>;
  } = {},
) {
  const child = Bun.spawn(
    ["/bin/bash", ...(options.pipe ? ["-s", "--"] : [installer]), ...args],
    {
      cwd: project,
      // Deliberate allowlist: no real credentials, home config, or agent detection.
      env: {
        PATH: bin,
        HOME: home,
        TMPDIR: scratch,
        TEST_ARCHIVE: archive,
        TEST_REAL_BUN: process.execPath,
        TEST_DEPENDENCIES: path.join(repo, "node_modules"),
        TEST_CURL_LOG: path.join(root, "curl.log"),
        TEST_INSTALL_LOG: path.join(root, "install.log"),
        TEST_SETUP_LOG: path.join(root, "setup.log"),
        ...options.env,
      },
      stdin: new Blob([options.pipe ? script : (options.input ?? "")]),
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(fs.readdirSync(scratch)).toEqual([]);
  return { out, err, code };
}
const defaults = () => path.join(home, ".local/share/otherskill/installs");
const snapshots = (dir = defaults()) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((n) => n.startsWith("release."))
    : [];
const log = (name: string) =>
  fs
    .readFileSync(path.join(root, `${name}.log`), "utf8")
    .split("\0")
    .slice(0, -1);
const setupFlags = [
  "--non-interactive",
  "--agent",
  "codex",
  "--scope",
  "global",
];

test.each([false, true])(
  "installer help is side-effect free (pipe=%p)",
  async (pipe) => {
    const result = await run(["--help"], { pipe, env: { HOME: "" } });
    expect(result.code).toBe(0);
    expect(result.out).toContain("--install-dir");
    expect(result.out).toContain("Bun >= 1.3");
    expect(fs.readdirSync(home)).toEqual([]);
    expect(fs.existsSync(path.join(root, "curl.log"))).toBe(false);
  },
);

test.each([["--install-dir"], ["--install-dir="]])(
  "installer rejects missing install-dir value: %s",
  async (arg) => {
    const result = await run([arg]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("--install-dir requires a directory");
    expect(fs.readdirSync(home)).toEqual([]);
  },
);

test("missing Bun fails before any download or installation", async () => {
  fs.unlinkSync(path.join(bin, "bun"));
  const result = await run(setupFlags);
  expect(result.code).toBe(1);
  expect(result.err).toContain("Bun >= 1.3 is required");
  expect(fs.existsSync(path.join(root, "curl.log"))).toBe(false);
  expect(fs.readdirSync(home)).toEqual([]);
});

test("missing curl reports the prerequisite before writing anything", async () => {
  fs.unlinkSync(path.join(bin, "curl"));
  const result = await run(setupFlags);
  expect(result.code).toBe(1);
  expect(result.err).toContain("missing prerequisite: curl");
  expect(fs.readdirSync(home)).toEqual([]);
});

test.each(["1.2.23", "not-a-version"])(
  "rejects unsupported/broken Bun version %s",
  async (version) => {
    const result = await run(setupFlags, {
      env: { TEST_BUN_VERSION: version },
    });
    expect(result.code).toBe(1);
    expect(result.err).toContain("Bun >= 1.3 is required");
    expect(fs.existsSync(path.join(root, "curl.log"))).toBe(false);
  },
);

test.each(["home", "BUN_INSTALL", "relative PATH"])(
  "discovers Bun outside an absolute PATH entry: %s",
  async (location) => {
    const dest =
      location === "home"
        ? path.join(home, ".bun/bin/bun")
        : path.join(root, "custom runtime/bin/bun");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(bin, "bun"), dest);
    const env: Record<string, string> =
      location === "BUN_INSTALL"
        ? { BUN_INSTALL: path.dirname(path.dirname(dest)) }
        : location === "relative PATH"
          ? { PATH: `${path.relative(project, path.dirname(dest))}:${bin}` }
          : {};
    const result = await run([...setupFlags, "--dry-run"], { env });
    expect(result.code).toBe(0);
    expect(log("setup")[1]).toBe("--no-env-file");
    expect(log("setup").slice(3)).toEqual([
      "setup",
      ...setupFlags,
      "--dry-run",
    ]);
  },
);

test("curl HTTP failure fails closed and cleans temporary files without touching existing data", async () => {
  fs.mkdirSync(defaults(), { recursive: true });
  fs.writeFileSync(path.join(defaults(), "keep.txt"), "user data");
  const result = await run(setupFlags, { env: { TEST_DOWNLOAD_STATUS: "22" } });
  expect(result.code).toBe(1);
  expect(result.err).toContain("repository download failed");
  expect(log("curl")).toContain("--fail");
  expect(log("curl")).toContain("--location");
  expect(log("curl")).toContain("=https");
  expect(log("curl").at(-1)).toBe(
    "https://codeload.github.com/datamonsterr/jev_auto_select_skills/tar.gz/refs/heads/master",
  );
  expect(fs.readFileSync(path.join(defaults(), "keep.txt"), "utf8")).toBe(
    "user data",
  );
  expect(snapshots()).toEqual([]);
  expect(fs.existsSync(path.join(root, "install.log"))).toBe(false);
  expect(fs.existsSync(path.join(root, "setup.log"))).toBe(false);
});

test.each(["corrupt", "incomplete"])(
  "invalid %s archive never invokes Bun install and cleans its snapshot",
  async (kind) => {
    const bad = path.join(root, "bad.tar.gz");
    if (kind === "corrupt") fs.writeFileSync(bad, "not an archive");
    else {
      const empty = path.join(root, "empty");
      fs.mkdirSync(empty);
      expect(
        Bun.spawnSync(["tar", "-czf", bad, "-C", root, "empty"]).exitCode,
      ).toBe(0);
    }
    const result = await run(setupFlags, { env: { TEST_ARCHIVE: bad } });
    expect(result.code).toBe(1);
    expect(result.err).toContain(
      kind === "corrupt" ? "could not extract" : "archive is missing",
    );
    expect(snapshots()).toEqual([]);
    expect(fs.existsSync(path.join(root, "install.log"))).toBe(false);
  },
);

test("failed dependencies remove only the new snapshot and never run setup", async () => {
  fs.mkdirSync(defaults(), { recursive: true });
  fs.writeFileSync(path.join(defaults(), "existing"), "untouched");
  const result = await run(setupFlags, { env: { TEST_INSTALL_STATUS: "42" } });
  expect(result.code).toBe(1);
  expect(result.err).toContain("dependency installation failed");
  expect(snapshots()).toEqual([]);
  expect(fs.readFileSync(path.join(defaults(), "existing"), "utf8")).toBe(
    "untouched",
  );
  expect(fs.existsSync(path.join(root, "setup.log"))).toBe(false);
});

test("piped real setup preserves native hooks/skills and private bank, and retains prior snapshots on repeat", async () => {
  const native = path.join(home, ".codex");
  const ownSkill = path.join(home, ".agents/skills/my-skill/SKILL.md");
  const bank = path.join(
    home,
    ".local/share/otherskill/bank/testing/private/SKILL.md",
  );
  for (const file of [ownSkill, bank]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "keep complete user skill");
  }
  fs.mkdirSync(native);
  const settings = path.join(native, "hooks.json");
  fs.writeFileSync(
    settings,
    JSON.stringify({
      custom: true,
      hooks: {
        UserPromptSubmit: [
          { hooks: [{ type: "command", command: "my-original-hook" }] },
        ],
      },
    }),
  );
  for (let i = 0; i < 2; i++) {
    const result = await run(setupFlags, { pipe: true });
    expect(result.code).toBe(0);
    expect(log("install").slice(1)).toEqual(["install", "--frozen-lockfile"]);
    expect(log("setup")[0]).toBe(project);
    expect(log("setup")[1]).toBe("--no-env-file");
    expect(log("setup").slice(3)).toEqual(["setup", ...setupFlags]);
    expect(snapshots()).toHaveLength(i + 1);
    const currentSource = path.dirname(log("setup")[2]!);
    expect(fs.statSync(currentSource).mode & 0o777).toBe(0o700);
    const launcher = path.join(home, ".local/share/otherskill/bin/otherskill");
    expect(fs.readFileSync(launcher, "utf8")).toContain(
      currentSource.replaceAll("'", "'\\''"),
    );
    expect(fs.existsSync(path.join(currentSource, "otherskill.ts"))).toBe(true);
    const hooks = JSON.parse(fs.readFileSync(settings, "utf8"));
    expect(hooks.custom).toBe(true);
    expect(hooks.hooks.UserPromptSubmit).toHaveLength(2);
    expect(JSON.stringify(hooks)).toContain("my-original-hook");
    expect(fs.readFileSync(ownSkill, "utf8")).toBe("keep complete user skill");
    expect(fs.readFileSync(bank, "utf8")).toBe("keep complete user skill");
    expect(fs.readdirSync(path.join(home, ".agents/skills")).sort()).toEqual([
      "my-skill",
      "use-otherskill",
    ]);
    const invoked = Bun.spawnSync([launcher, "--help"], {
      cwd: project,
      env: { HOME: home },
    });
    expect(invoked.exitCode).toBe(0);
    expect(invoked.stdout.toString()).toContain("OtherSkill");
  }
});

test("relative install-dir and project/key options are forwarded verbatim after --", async () => {
  const target = "target with spaces";
  const args = [
    "--non-interactive",
    "--agent",
    "claude",
    "--scope",
    "project",
    "--cwd",
    project,
    "--home",
    home,
    "--no-companion",
    "--key-env",
    "SYNTHETIC_KEY",
    "--categories",
    "testing",
  ];
  const result = await run(["--install-dir", target, "--", ...args], {
    pipe: true,
    env: { SYNTHETIC_KEY: "fake-installer-key" },
  });
  expect(result.code).toBe(0);
  expect(result.out + result.err).not.toContain("fake-installer-key");
  expect(snapshots(path.join(project, target))).toHaveLength(1);
  expect(log("setup")[1]).toBe("--no-env-file");
  expect(log("setup").slice(3)).toEqual(["setup", ...args]);
  expect(fs.existsSync(path.join(project, ".claude/settings.json"))).toBe(true);
  expect(fs.existsSync(path.join(project, ".claude/skills"))).toBe(false);
  expect(fs.existsSync(path.join(home, ".claude"))).toBe(false);
  const key = path.join(home, ".config/otherskill/credentials.json");
  expect(fs.statSync(key).mode & 0o777).toBe(0o600);
  expect(fs.readFileSync(key, "utf8")).toContain("fake-installer-key");
  expect(
    fs.readFileSync(path.join(project, "otherskill.config.json"), "utf8"),
  ).not.toContain("fake-installer-key");
});

test("dry-run installs source but does not write setup config/hooks", async () => {
  const result = await run([...setupFlags, "--dry-run"], { pipe: true });
  expect(result.code).toBe(0);
  expect(snapshots()).toHaveLength(1);
  expect(fs.existsSync(path.join(home, ".codex"))).toBe(false);
  expect(fs.existsSync(path.join(home, ".config"))).toBe(false);
  expect(fs.existsSync(path.join(home, ".local/share/otherskill/bin"))).toBe(
    false,
  );
});

test("setup failure preserves native collision and retains source for any partial references", async () => {
  const native = path.join(home, ".codex");
  fs.mkdirSync(native);
  fs.writeFileSync(path.join(native, "hooks.json"), "malformed user config");
  const result = await run(setupFlags);
  expect(result.code).toBe(1);
  expect(result.err).toContain("setup failed; source retained");
  expect(snapshots()).toHaveLength(1);
  expect(fs.readFileSync(path.join(native, "hooks.json"), "utf8")).toBe(
    "malformed user config",
  );
});

test("non-terminal menu invocation fails clearly before downloads", async () => {
  const result = await run([], { pipe: true });
  expect(result.code).toBe(1);
  expect(result.err).toContain("interactive setup requires a terminal");
  expect(fs.existsSync(path.join(root, "curl.log"))).toBe(false);
});

test("piped installer refuses key-stdin so source cannot be mistaken for a credential", async () => {
  const result = await run([...setupFlags, "--key-stdin"], { pipe: true });
  expect(result.code).toBe(1);
  expect(result.err).toContain(
    "--key-stdin requires running a saved installer file",
  );
  expect(fs.existsSync(path.join(root, "curl.log"))).toBe(false);
});

test("saved installer forwards secret-manager stdin to real setup", async () => {
  const result = await run([...setupFlags, "--key-stdin"], {
    input: "fake-stdin-key\n",
  });
  expect(result.code).toBe(0);
  expect(result.out + result.err).not.toContain("fake-stdin-key");
  expect(
    fs.readFileSync(
      path.join(home, ".config/otherskill/credentials.json"),
      "utf8",
    ),
  ).toContain("fake-stdin-key");
});
