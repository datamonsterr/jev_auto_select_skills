import { afterAll, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type GoldenCase = {
  id: string;
  prompt: string;
  expectedSkills: string[];
  category: string;
  source: string;
};
type RouteResult = {
  status: string;
  selected: Array<{ name: string }>;
  diagnostics?: string[];
};

const repo = path.resolve(import.meta.dir, "../..");
const cases = JSON.parse(
  fs.readFileSync(path.join(repo, "golden_set/e2e_golden.json"), "utf8"),
) as GoldenCase[];
const configuredLimit = Number.parseInt(process.env.E2E_LIMIT ?? "0", 10);
const sample =
  configuredLimit > 0 && configuredLimit < cases.length
    ? Array.from(
        { length: configuredLimit },
        (_, i) => cases[Math.floor((i * cases.length) / configuredLimit)]!,
      )
    : cases;
const minHit = Number.parseFloat(process.env.E2E_MIN_HIT ?? "0.6");
const keyAvailable = Boolean(process.env.OPENROUTER_API_KEY);
const tempDirs: string[] = [];
let finalReport: Record<string, unknown> | undefined;

async function runCase(
  item: GoldenCase,
): Promise<{ item: GoldenCase; result: RouteResult; attempts: number }> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-e2e-"));
  tempDirs.push(home);
  let last: RouteResult = { status: "failed", selected: [] };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const child = Bun.spawn(
      [
        "bun",
        "otherskill.ts",
        "find",
        "--json",
        "--agent",
        "claude",
        "--home",
        home,
        "--config",
        path.join(repo, "tests/fixtures/e2e-bank/config.json"),
        "--prompt",
        item.prompt,
      ],
      { cwd: repo, stdout: "pipe", stderr: "pipe", env: process.env },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode === 0) {
      try {
        last = JSON.parse(stdout) as RouteResult;
        const transientPartial =
          last.status === "partial" &&
          last.diagnostics?.some((detail) =>
            /openrouter_(http_(429|5\d\d)|network_or_timeout)/.test(detail),
          );
        if (last.status !== "failed" && !transientPartial)
          return { item, result: last, attempts: attempt };
      } catch {
        last = { status: "failed", selected: [] };
      }
    }
    // Keep diagnostics in the report without exposing environment values.
    if (stderr && last.status === "failed" && !last.diagnostics?.length)
      last = { ...last, diagnostics: [stderr.slice(0, 300)] };
    if (attempt < 3) await Bun.sleep(800 * 2 ** (attempt - 1));
  }
  return { item, result: last, attempts: 3 };
}

async function runLimited<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= items.length) return;
        result[index] = await fn(items[index]!);
      }
    }),
  );
  return result;
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!keyAvailable)("OtherSkill CLI golden E2E", () => {
  it(
    "routes the golden prompts with measurable precision and recall",
    async () => {
      const completed = await runLimited(sample, 4, runCase);
      let truePositive = 0;
      let falsePositive = 0;
      let falseNegative = 0;
      let positiveHits = 0;
      let positiveCases = 0;
      let negativeFalsePositives = 0;
      let negativeCases = 0;
      for (const { item, result } of completed) {
        const selected = result.selected.slice(0, 3).map((skill) => skill.name);
        if (item.expectedSkills.length === 0) {
          negativeCases++;
          if (selected.length > 0) negativeFalsePositives++;
          continue;
        }
        positiveCases++;
        const expected = new Set(item.expectedSkills);
        const selectedSet = new Set(selected);
        const matched = [...expected].filter((name) =>
          selectedSet.has(name),
        ).length;
        truePositive += matched;
        falseNegative += expected.size - matched;
        falsePositive += selectedSet.size - matched;
        if (matched > 0) positiveHits++;
      }
      const hitAtK = positiveCases ? positiveHits / positiveCases : 0;
      const precision =
        truePositive + falsePositive
          ? truePositive / (truePositive + falsePositive)
          : 0;
      const recall =
        truePositive + falseNegative
          ? truePositive / (truePositive + falseNegative)
          : 0;
      const negativeFalsePositiveRate = negativeCases
        ? negativeFalsePositives / negativeCases
        : 0;
      finalReport = {
        generatedAt: new Date().toISOString(),
        total: completed.length,
        positiveCases,
        negativeCases,
        hitAtK,
        precision,
        recall,
        negativeFalsePositiveRate,
        failedCases: completed
          .filter(({ result }) => result.status === "failed")
          .map(({ item, result }) => ({
            id: item.id,
            diagnostics: result.diagnostics ?? [],
          })),
        attempts: completed.reduce((sum, row) => sum + row.attempts, 0),
        results: completed.map(({ item, result }) => ({
          id: item.id,
          expectedSkills: item.expectedSkills,
          selectedSkills: result.selected.map((skill) => skill.name),
          status: result.status,
        })),
      };
      fs.mkdirSync(path.join(repo, ".tmp"), { recursive: true });
      fs.writeFileSync(
        path.join(repo, ".tmp/e2e-report.json"),
        `${JSON.stringify(finalReport, null, 2)}\n`,
      );

      console.log(
        `E2E metrics: hit@3=${hitAtK.toFixed(3)}, precision=${precision.toFixed(3)}, recall=${recall.toFixed(3)}, negative-FP=${negativeFalsePositiveRate.toFixed(3)} (${completed.length} cases)`,
      );
      expect(hitAtK).toBeGreaterThanOrEqual(minHit);
    },
    30 * 60 * 1000,
  );
});
