import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../lib/otherskill/config";
import { discoverBank } from "../../lib/otherskill/bank";

const repo = path.resolve(import.meta.dir, "../..");

describe("E2E golden dataset", () => {
  it("contains 100 unique, well-formed cases backed by the fixture bank", () => {
    const datasetPath = path.join(repo, "golden_set/e2e_golden.json");
    const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8")) as Array<{
      id: string;
      prompt: string;
      expectedSkills: string[];
      category: string;
      source: string;
    }>;
    const config = JSON.parse(
      fs.readFileSync(
        path.join(repo, "tests/fixtures/e2e-bank/config.json"),
        "utf8",
      ),
    ) as { categories: Array<{ id: string }> };
    const tempHome = path.join(
      os.tmpdir(),
      `otherskill-golden-bank-${process.pid}`,
    );
    const loadedConfig = loadConfig({
      configPath: path.join(repo, "tests/fixtures/e2e-bank/config.json"),
      home: tempHome,
      cwd: tempHome,
    });
    const names = new Set(
      discoverBank(loadedConfig).map((skill) => skill.name),
    );
    const logicalIds = new Set<string>();
    for (const category of config.categories) {
      const categoryDir = path.join(
        repo,
        "tests/fixtures/e2e-bank",
        category.id,
      );
      if (!fs.existsSync(categoryDir)) continue;
      for (const entry of fs.readdirSync(categoryDir, {
        withFileTypes: true,
      })) {
        if (!entry.isDirectory()) continue;
        const provenance = JSON.parse(
          fs.readFileSync(
            path.join(categoryDir, entry.name, ".otherskill.json"),
            "utf8",
          ),
        ) as { logicalId: string; category: string };
        logicalIds.add(provenance.logicalId);
        expect(provenance.category).toBe(category.id);
      }
    }

    expect(dataset).toHaveLength(100);
    expect(
      dataset.filter((item) => item.expectedSkills.length === 0),
    ).toHaveLength(10);
    expect(
      dataset.filter((item) => item.expectedSkills.length > 0),
    ).toHaveLength(90);
    expect(new Set(dataset.map((item) => item.id)).size).toBe(100);
    expect(logicalIds.size).toBe(44);
    const categoryIds = new Set([
      ...config.categories.map((category) => category.id),
      "none",
    ]);
    const publicSources = new Set([
      "https://github.com/HowieHwong/MetaTool",
      "https://github.com/OpenBMB/ToolBench",
      "https://arxiv.org/abs/2304.08244",
    ]);
    for (const item of dataset) {
      expect(item.id).toMatch(/^[a-z0-9-]+$/);
      expect(Object.keys(item).sort()).toEqual([
        "category",
        "expectedSkills",
        "id",
        "prompt",
        "source",
      ]);
      expect(item.prompt.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(item.expectedSkills)).toBe(true);
      expect(item.expectedSkills.length).toBeLessThanOrEqual(3);
      expect(
        item.expectedSkills.every((name) => typeof name === "string"),
      ).toBe(true);
      expect(item.category.trim().length).toBeGreaterThan(0);
      expect(categoryIds.has(item.category)).toBe(true);
      expect(
        item.source === "synthetic" || publicSources.has(item.source),
      ).toBe(true);
      for (const name of item.expectedSkills)
        expect(names.has(name)).toBe(true);
    }
  });
});
