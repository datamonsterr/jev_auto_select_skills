import { describe, it, expect } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { selectSkills, resolveSkillsBankPath, resolveSkillsSearchPaths, loadSkillsFromDir } from "../index";

describe("golden_set integration", () => {
  const testsetPath = path.resolve(__dirname, "../golden_set/testset.json");
  const skillsDir = resolveSkillsBankPath();

  const backupBank = path.join(process.env.HOME || "", ".agents", "skills_bank_full_backup");
  const testBankPaths = fs.existsSync(backupBank) ? [backupBank] : resolveSkillsSearchPaths();

  it("validates golden set schema and verifies all expected skills exist in skills bank", () => {
    const raw = fs.readFileSync(testsetPath, "utf-8");
    const testcases = JSON.parse(raw);

    expect(Array.isArray(testcases)).toBe(true);
    expect(testcases.length).toBeGreaterThanOrEqual(10);

    const availableSkills = loadSkillsFromDir(testBankPaths);
    const availableSkillDirs = new Set(availableSkills.map((s) => s.name));

    if (availableSkillDirs.size <= 1) {
      // Standalone repo mode without test bank
      expect(availableSkillDirs.has("skill_selector") || availableSkillDirs.has("jev-skill-selector")).toBe(true);
      return;
    }

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
    const availableSkills = loadSkillsFromDir(testBankPaths);
    const hasTdd = availableSkills.some((s) => s.name === "tdd");
    if (!hasTdd) return;

    const mockFetch = (async () => {
      return new Response(
        JSON.stringify({
          model: "inception/mercury-decide:free",
          answers: {
            primary_skill: {
              type: "choice",
              choice: "tdd",
              probabilities: { tdd: 0.92, "test-driven-development": 0.05 },
              confidence: 0.95,
            },
          },
          usage: { input_tokens: 150, output_tokens: 40 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    const result = await selectSkills({
      userPrompt:
        "We need to refactor the payment calculation service. I want to use red-green-refactor cycle and write unit tests against public interfaces before touching any implementation code.",
      skillsDir: testBankPaths,
      options: { apiKey: "offline-test-key", threshold: 0.05, fetchFn: mockFetch },
    });

    expect(["tdd", "test-driven-development"]).toContain(result.primarySkill || "");
    expect(result.selectedSkills.length).toBeGreaterThan(0);
    expect(result.selectedSkills[0].probability).toBeGreaterThan(0.5);
  });
});
