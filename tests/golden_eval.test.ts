import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { selectSkills, resolveSkillsBankPath, resolveSkillsSearchPaths, loadSkillsFromDir } from "../index";

describe("golden_set integration", () => {
  const testsetPath = path.resolve(__dirname, "../golden_set/testset.json");
  const skillsDir = resolveSkillsBankPath();

  it("validates golden set schema and verifies all expected skills exist in skills bank", () => {
    const raw = fs.readFileSync(testsetPath, "utf-8");
    const testcases = JSON.parse(raw);

    expect(Array.isArray(testcases)).toBe(true);
    expect(testcases.length).toBeGreaterThanOrEqual(10);

    const availableSkills = loadSkillsFromDir(resolveSkillsSearchPaths());
    const availableSkillDirs = new Set(availableSkills.map((s) => s.name));

    for (const tc of testcases) {
      expect(tc.id).toBeDefined();
      expect(tc.prompt).toBeDefined();
      expect(Array.isArray(tc.expectedSkills)).toBe(true);
      expect(tc.expectedSkills.length).toBeGreaterThan(0);

      for (const skillName of tc.expectedSkills) {
        expect(availableSkillDirs.has(skillName)).toBe(true);
      }
    }
  });

  it("selects expected skill for a complex software engineering prompt from golden set", async () => {
    // Run live test case 1 (TDD)
    const result = await selectSkills({
      userPrompt:
        "We need to refactor the payment calculation service. I want to use red-green-refactor cycle and write unit tests against public interfaces before touching any implementation code.",
      options: { threshold: 0.05 },
    });

    expect(["tdd", "test-driven-development"]).toContain(result.primarySkill || "");
    expect(result.selectedSkills.length).toBeGreaterThan(0);
    expect(result.selectedSkills[0].probability).toBeGreaterThan(0.5);
  }, 15000);
});
