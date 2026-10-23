import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as api from "../index";
import { DecisionProvider, DEFAULT_DECISION_MODEL } from "../lib/provider";
import { buildDecisionInstructions } from "../lib/system_prompt";
import { compactUserPromptForDecision } from "../lib/parse_skill";
import { migrateSkills, DEFAULT_KEEP_SKILLS } from "../lib/migrate";
import { DEFAULT_BANK_PATH, defaultBankPath } from "../lib/otherskill/config";

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
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-rf-"));

test("migrate keeps installed otherskill skill", async () => {
  const root = tmp();
  const src = path.join(root, "native");
  fs.mkdirSync(path.join(src, "otherskill"), { recursive: true });
  fs.writeFileSync(
    path.join(src, "otherskill", "SKILL.md"),
    "---\nname: otherskill\ndescription: x\n---\n",
  );
  expect(DEFAULT_KEEP_SKILLS).toContain("otherskill");
  const res = await migrateSkills({
    sourceDirs: [src],
    targetDir: path.join(root, "bank"),
    backupDir: path.join(root, "backup"),
    keepSkills: DEFAULT_KEEP_SKILLS,
    dryRun: false,
  });
  expect(res.kept).toContain("otherskill");
  expect(fs.existsSync(path.join(src, "otherskill", "SKILL.md"))).toBe(true);
});

test("assess accepts deprecated jev-model alias and useJevModel option", async () => {
  const { assessSkill } = await import("../scripts/assess");
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    "---\nname: s\ndescription: docker\n---\n",
  );
  const res = await assessSkill({ skillPathOrName: dir, useJevModel: true });
  expect(res.classification).toBe("ROUTED");
  const src = fs.readFileSync(
    path.join(import.meta.dir, "../scripts/assess.ts"),
    "utf8",
  );
  expect(src).toContain('"--jev-model"');
});

test("default bank helper matches schema default", () => {
  expect(defaultBankPath("/h")).toBe("/h/.local/share/otherskill/bank");
  expect(DEFAULT_BANK_PATH).toBe("~/.local/share/otherskill/bank");
});

test("portable check only runs when portable or bankPath touched", async () => {
  const h = tmp();
  const cfg = path.join(h, "cfg.json");
  fs.writeFileSync(
    cfg,
    JSON.stringify({ portableHooks: true, bankPath: path.join(h, "bank") }),
  );
  const ok = await run(
    [
      "config",
      "set",
      "model",
      "inception/mercury-decide:free",
      "--config",
      cfg,
      "--dry-run",
    ],
    h,
  );
  expect(ok.err).not.toContain("portable hooks require");
  const bad = await run(
    [
      "config",
      "set",
      "bankPath",
      path.join(h, "bank2"),
      "--config",
      cfg,
      "--dry-run",
    ],
    h,
  );
  expect(bad.err).toContain(
    "portable hooks require a project-relative bankPath",
  );
});

test("help lookup ignores prototype keys and supports help <cmd>", async () => {
  const h = tmp();
  const g = (await run(["--help"], h)).out;
  expect((await run(["constructor", "--help"], h)).out).toBe(g);
  const viaHelp = await run(["help", "find"], h);
  expect(viaHelp.out).toContain("Usage: otherskill find");
  expect(viaHelp.out).not.toContain("Canonical commands:");
});

test("index exports deprecated aliases", () => {
  expect(api.JevProvider).toBe(DecisionProvider);
  expect(api.DEFAULT_JEV_MODEL).toBe(DEFAULT_DECISION_MODEL);
  expect(api.buildJevInstructions).toBe(buildDecisionInstructions);
  expect(api.compactUserPromptForJev).toBe(compactUserPromptForDecision);
});
