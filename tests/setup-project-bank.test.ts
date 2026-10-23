import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultProjectBankPath } from "../lib/otherskill/config";

const cli = path.join(import.meta.dir, "../otherskill.ts");
async function run(args: string[], cwd: string, home: string) {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", cli, ...args, "--home", home],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: home },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, code };
}
function dirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-pbank-"));
  const home = path.join(root, "home");
  const cwd = path.join(root, "proj");
  fs.mkdirSync(home);
  fs.mkdirSync(cwd);
  return { root, home, cwd };
}
const setup = [
  "setup",
  "--agent",
  "claude",
  "--scope",
  "project",
  "--non-interactive",
];

test("new project config defaults to a relative project bank", async () => {
  const d = dirs();
  try {
    const r = await run([...setup, "--cwd", d.cwd], d.cwd, d.home);
    expect(r.code).toBe(0);
    const written = JSON.parse(
      fs.readFileSync(path.join(d.cwd, "otherskill.config.json"), "utf8"),
    );
    expect(written.bankPath).toBe(".otherskill/bank");
  } finally {
    fs.rmSync(d.root, { recursive: true, force: true });
  }
}, 20000);

test("default project bank is relative to the config location", () => {
  expect(defaultProjectBankPath("/p/otherskill.config.json")).toBe(
    ".otherskill/bank",
  );
  expect(defaultProjectBankPath("/p/.otherskill/config.json")).toBe("bank");
});

test("existing project bankPath is untouched", async () => {
  const d = dirs();
  try {
    const file = path.join(d.cwd, "otherskill.config.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ scope: "project", bankPath: "elsewhere/bank" }),
    );
    const r = await run([...setup, "--cwd", d.cwd], d.cwd, d.home);
    expect(r.code).toBe(0);
    expect(JSON.parse(fs.readFileSync(file, "utf8")).bankPath).toBe(
      "elsewhere/bank",
    );
  } finally {
    fs.rmSync(d.root, { recursive: true, force: true });
  }
}, 20000);

test("global setup keeps the global default bank", async () => {
  const d = dirs();
  try {
    const r = await run(
      ["setup", "--agent", "claude", "--scope", "global", "--non-interactive"],
      d.cwd,
      d.home,
    );
    expect(r.code).toBe(0);
    const written = JSON.parse(
      fs.readFileSync(
        path.join(d.home, ".config/otherskill/otherskill.config.json"),
        "utf8",
      ),
    );
    expect(written.bankPath).toBe(
      path.join(d.home, ".local/share/otherskill/bank"),
    );
  } finally {
    fs.rmSync(d.root, { recursive: true, force: true });
  }
}, 20000);

test("portable setup rejects an absolute bankPath", async () => {
  const d = dirs();
  try {
    const file = path.join(d.cwd, "otherskill.config.json");
    for (const bankPath of [path.join(d.home, "bank"), "~/bank"]) {
      fs.writeFileSync(file, JSON.stringify({ scope: "project", bankPath }));
      const r = await run(
        [...setup, "--portable", "--cwd", d.cwd],
        d.cwd,
        d.home,
      );
      expect(r.code).not.toBe(0);
      expect(r.err).toContain(
        "portable hooks require a project-relative bankPath",
      );
      expect(
        JSON.parse(fs.readFileSync(file, "utf8")).portableHooks,
      ).toBeUndefined();
    }
  } finally {
    fs.rmSync(d.root, { recursive: true, force: true });
  }
}, 20000);

test("portable setup on a fresh project config succeeds with relative bank", async () => {
  const d = dirs();
  try {
    const r = await run(
      [...setup, "--portable", "--cwd", d.cwd],
      d.cwd,
      d.home,
    );
    expect(r.code).toBe(0);
    const written = JSON.parse(
      fs.readFileSync(path.join(d.cwd, "otherskill.config.json"), "utf8"),
    );
    expect(written.bankPath).toBe(".otherskill/bank");
    expect(written.portableHooks).toBe(true);
  } finally {
    fs.rmSync(d.root, { recursive: true, force: true });
  }
}, 20000);
