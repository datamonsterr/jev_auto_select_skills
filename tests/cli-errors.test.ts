import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cli = path.join(import.meta.dir, "../otherskill.ts");
async function run(args: string[], home: string) {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", cli, ...args, "--home", home],
    {
      cwd: home,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: home, OPENROUTER_API_KEY: "" },
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { out, err, code };
}
const home = () => fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-err-"));

test("unknown option reports the flag instead of an opaque failure", async () => {
  const h = home();
  const r = await run(["list", "--bogus"], h);
  expect(r.code).toBe(1);
  expect(r.err).toContain("--bogus");
  expect(r.err).not.toContain("filesystem_or_process_operation_failed");
});

test("missing option value reports the option", async () => {
  const h = home();
  const r = await run(["list", "--scope"], h);
  expect(r.code).toBe(1);
  expect(r.err).toContain("--scope");
  expect(r.err).not.toContain("filesystem_or_process_operation_failed");
});

test("add with a missing source reports source not found", async () => {
  const h = home();
  const missing = path.join(h, "nonexistent");
  const r = await run(["add", missing], h);
  expect(r.code).toBe(1);
  expect(r.err).toContain(`source not found: ${missing}`);
});

test("find with an unknown flag still exits 0 with empty hook context", async () => {
  const h = home();
  const r = await run(["find", "--agent", "claude", "--bogus"], h);
  expect(r.code).toBe(0);
  expect(r.out).not.toContain("selected skills");
});
