import { describe, it, expect } from "bun:test";
import { selectSkills } from "../index";

describe("index programmatic API", () => {
  it("exports selectSkills function that returns matching skills and usage breakdown", async () => {
    expect(typeof selectSkills).toBe("function");

    const result = await selectSkills({
      userPrompt: "Dynamically select and route the right skill for an agent prompt to avoid context bloat",
      options: { threshold: 0.05 },
    });

    expect(result.primarySkill).toBe("jev-skill-selector");
    expect(result.usage).toBeDefined();
    expect(result.usage?.total_tokens).toBeGreaterThan(0);
    expect(result.usage?.input_tokens).toBeGreaterThan(0);
    expect(result.usage?.user_prompt_tokens).toBeGreaterThan(0);
    expect(result.usage?.system_prompt_tokens).toBeGreaterThan(0);
  }, 15000);
});
