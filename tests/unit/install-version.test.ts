import { test, expect } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "../../lib/otherskill/setup";

test("installer records the actual archived commit in its snapshot version metadata offline", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "otherskill-install-version-"),
  );
  try {
    const bin = path.join(root, "bin"),
      home = path.join(root, "home"),
      installs = path.join(root, "installs"),
      archive = path.join(root, "source.tar.gz");
    fs.mkdirSync(bin);
    fs.mkdirSync(home);
    const packed = Bun.spawnSync(
      ["git", "archive", "--format=tar.gz", "--prefix=source/", "HEAD"],
      { cwd: repoRoot },
    );
    expect(packed.exitCode).toBe(0);
    fs.writeFileSync(archive, packed.stdout);
    const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
      cwd: repoRoot,
    })
      .stdout.toString()
      .trim();
    fs.writeFileSync(
      path.join(bin, "curl"),
      `#!/bin/bash\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --output ]; then cp "$TEST_ARCHIVE" "$2"; exit 0; fi; shift; done\nexit 99\n`,
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(bin, "bun"),
      `#!/bin/bash\ncase "$1" in --version) echo 1.3.14;; install) exit 0;; -e) exec "$TEST_BUN" "$@";; *) exit 0;; esac\n`,
      { mode: 0o755 },
    );
    const child = Bun.spawn(
      [
        "bash",
        path.join(repoRoot, "install.sh"),
        "--install-dir",
        installs,
        "--non-interactive",
        "--agent",
        "claude",
        "--home",
        home,
      ],
      {
        cwd: root,
        env: {
          PATH: `${bin}:${process.env.PATH}`,
          HOME: home,
          TMPDIR: root,
          TEST_ARCHIVE: archive,
          TEST_BUN: process.execPath,
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code).toBe(0);
    const snapshots = fs.readdirSync(installs);
    expect(snapshots).toHaveLength(1);
    const file = path.join(installs, snapshots[0]!, ".otherskill-version");
    expect(fs.existsSync(file)).toBe(true);
    const version = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(Number.isNaN(Date.parse(version.installedAt))).toBe(false);
    expect(version).toMatchObject({
      commit,
      ref: "master",
      installedAt: expect.any(String),
    });
    expect(err).not.toContain("failed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
