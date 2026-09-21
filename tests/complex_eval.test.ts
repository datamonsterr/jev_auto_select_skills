import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { selectSkills, resolveSkillsBankPath, resolveSkillsSearchPaths, loadSkillsFromDir } from "../index";

describe("complex_testset evaluation", () => {
  const complexTestsetPath = path.resolve(__dirname, "../golden_set/complex_testset.json");
  const skillsDir = resolveSkillsBankPath();

  const backupBank = path.join(process.env.HOME || "", ".agents", "skills_bank_full_backup");
  const testBankPaths = fs.existsSync(backupBank) ? [backupBank] : resolveSkillsSearchPaths();

  it("validates complex testset schema and verifies all required and acceptable skills exist", () => {
    const raw = fs.readFileSync(complexTestsetPath, "utf-8");
    const testcases = JSON.parse(raw);

    expect(Array.isArray(testcases)).toBe(true);
    expect(testcases.length).toBeGreaterThanOrEqual(10);

    const availableSkills = loadSkillsFromDir(testBankPaths);
    const availableSkillDirs = new Set(availableSkills.map((s) => s.name));

    if (availableSkillDirs.size <= 1) {
      expect(availableSkillDirs.has("jev-skill-selector")).toBe(true);
      return;
    }

    for (const tc of testcases) {
      expect(tc.id).toBeDefined();
      expect(tc.title).toBeDefined();
      expect(["multi-step", "continuation"]).toContain(tc.type);
      expect(tc.prompt.length).toBeGreaterThan(50);
      expect(Array.isArray(tc.requiredSkills)).toBe(true);
      expect(tc.requiredSkills.length).toBeGreaterThanOrEqual(2);
      expect(tc.minSkillsExpected).toBeGreaterThanOrEqual(2);

      for (const skill of tc.requiredSkills) {
        expect(availableSkillDirs.has(skill)).toBe(true);
      }
      for (const skill of tc.acceptableSkills) {
        expect(availableSkillDirs.has(skill)).toBe(true);
      }
    }
  });

  it("evaluates a complex multi-step prompt and selects multiple matching skills", async () => {
    const availableSkills = loadSkillsFromDir(testBankPaths);
    const hasTdd = availableSkills.some((s) => s.name === "tdd");
    if (!hasTdd) return;

    const prompt = `We have an ongoing incident in production:
Step 1: First, systematically diagnose the root cause of the memory leak in auth-service.
Step 2: Next, write unit tests test-first using TDD before modifying code.
Step 3: Run all checks with verification-before-completion.`;

    const result = await selectSkills({
      userPrompt: prompt,
      skillsDir: testBankPaths,
      options: { multiStep: true, maxSkills: 3 },
    });

    expect(result.selectedSkills.length).toBeGreaterThanOrEqual(2);
    const selectedNames = result.selectedSkills.map((s) => s.name);

    // At least one debugging skill
    const hasDebugging = selectedNames.includes("diagnosing-bugs") || selectedNames.includes("systematic-debugging");
    // At least one testing skill
    const hasTDD = selectedNames.includes("tdd") || selectedNames.includes("test-driven-development");

    expect(hasDebugging).toBe(true);
    expect(hasTDD).toBe(true);
  }, 20000);
});
