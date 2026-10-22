import { test, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig } from "../lib/otherskill/config";
import {
  installLocal,
  discoverBank,
  createSkill,
} from "../lib/otherskill/bank";

test("complete skill copies in every nested match are repeatable and same-name sources retain scoped identities", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-bank-"));
  try {
    const config = loadConfig({ home: root, cwd: root });
    const source = path.join(root, "source");
    const created = createSkill(
      source,
      "design",
      "Design and test interfaces",
      "BODY SENTINEL",
    );
    fs.mkdirSync(path.join(source, "references"));
    fs.writeFileSync(
      path.join(source, "references/detail.txt"),
      "full resource",
    );
    fs.mkdirSync(path.join(source, "scripts"));
    fs.writeFileSync(
      path.join(source, "scripts/run.sh"),
      "#!/bin/sh\necho ok\n",
      { mode: 0o755 },
    );
    fs.writeFileSync(path.join(source, "LICENSE"), "license sentinel");
    const first = installLocal(config, created, ["frontend/ui-ux", "testing"]);
    expect(first).toHaveLength(2);
    const copies = discoverBank(config);
    expect(copies).toHaveLength(2);
    expect(new Set(copies.map((s) => s.logicalId)).size).toBe(1);
    expect(new Set(copies.map((s) => s.instanceId)).size).toBe(2);
    for (const copy of copies) {
      expect(
        fs.readFileSync(
          path.join(path.dirname(copy.path), "references/detail.txt"),
          "utf8",
        ),
      ).toBe("full resource");
      expect(
        fs.readFileSync(path.join(path.dirname(copy.path), "LICENSE"), "utf8"),
      ).toBe("license sentinel");
      expect(
        fs.statSync(path.join(path.dirname(copy.path), "scripts/run.sh")).mode &
          0o111,
      ).toBeGreaterThan(0);
    }
    installLocal(config, source, ["frontend/ui-ux", "testing"]);
    expect(discoverBank(config)).toHaveLength(2);
    const other = createSkill(
      path.join(root, "other"),
      "design",
      "Another design source",
      "other",
    );
    installLocal(config, other, ["testing"]);
    expect(discoverBank(config)).toHaveLength(3);
    expect(new Set(discoverBank(config).map((s) => s.logicalId)).size).toBe(2);
    expect(() => installLocal(config, source, ["../escape"])).toThrow();
    fs.symlinkSync("/tmp", path.join(source, "unsafe"));
    expect(() => installLocal(config, source, ["testing"])).toThrow();
    expect(discoverBank(config)).toHaveLength(3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("online source validation rejects ref/path injection and traversal without launching a shell", async () => {
  const { parseOnlineSource } = await import("../lib/otherskill/bank");
  expect(
    parseOnlineSource("https://skills.sh/vercel-labs/agent-skills/web-design"),
  ).toEqual({
    repo: "https://github.com/vercel-labs/agent-skills",
    ref: undefined,
    subpath: "web-design",
  });
  expect(
    parseOnlineSource("github:owner/repo", "feature/branch", "skills/design")
      .ref,
  ).toBe("feature/branch");
  for (const source of [
    "https://evil.test/owner/repo",
    "github:owner/repo/../escape",
    "github:owner/repo/tree/--exec/x",
    "github:owner/repo/a/../../b",
  ])
    expect(() => parseOnlineSource(source)).toThrow();
  for (const ref of [
    "--upload-pack=evil",
    "main;echo hacked",
    "../main",
    "x$(echo)",
  ])
    expect(() => parseOnlineSource("github:owner/repo", ref)).toThrow();
});

test("online search sends a real documented GitHub query and reports access failure honestly", async () => {
  const { findOnline } = await import("../lib/otherskill/bank");
  let seen = "";
  const found = await findOnline("accessibility", async (url) => {
    seen = String(url);
    return Response.json({
      total_count: 1,
      items: [
        {
          name: "SKILL.md",
          path: "skills/design/SKILL.md",
          html_url:
            "https://github.com/owner/repo/blob/main/skills/design/SKILL.md",
          repository: { full_name: "owner/repo" },
        },
      ],
    });
  });
  expect(decodeURIComponent(seen)).toContain("accessibility path:SKILL.md");
  expect(found).toHaveProperty("total_count", 1);
  await expect(
    findOnline("design", async () => new Response("denied", { status: 401 })),
  ).rejects.toThrow("HTTP 401");
});

test("online attribution symlinks cannot disclose private files into complete skill copies", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-license-"));
  try {
    const config = loadConfig({ home: path.join(root, "home"), cwd: root });
    const repo = path.join(root, "repo"),
      source = createSkill(
        path.join(repo, "skills/design"),
        "design",
        "Design",
        "body",
      );
    const privateFile = path.join(root, "fake-private.json");
    fs.writeFileSync(privateFile, "SYNTHETIC PRIVATE SENTINEL");
    fs.symlinkSync(privateFile, path.join(repo, "LICENSE"));
    expect(() =>
      installLocal(config, source, ["testing"], {
        source: "https://github.com/test/repo",
        licenseRoot: repo,
      }),
    ).toThrow("attribution");
    expect(discoverBank(config)).toEqual([]);
    expect(fs.existsSync(config.bankPath)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
