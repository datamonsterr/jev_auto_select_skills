import { describe, it, expect } from "bun:test";
import {
  filterSelectedSkills,
  formatSkillSummary,
  formatSkillContent,
} from "../lib/model";
import { DEFAULT_SYSTEM_PROMPT, buildJevInstructions } from "../lib/system_prompt";

describe("model and system_prompt", () => {
  it("filters selected skills based on confidence and probability thresholds", () => {
    const probabilities = {
      "tdd": 0.85,
      "test-driven-development": 0.12,
      "git-commit": 0.02,
      "none": 0.01,
    };

    const skills = filterSelectedSkills({
      choice: "tdd",
      probabilities,
      confidence: 0.85,
      threshold: 0.1,
      maxSkills: 2,
    });

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe("tdd");
    expect(skills[0].probability).toBe(0.85);
    expect(skills[1].name).toBe("test-driven-development");
    expect(skills[1].probability).toBe(0.12);
  });

  it("handles when choice is 'none'", () => {
    const probabilities = {
      "none": 0.95,
      "tdd": 0.05,
    };

    const skills = filterSelectedSkills({
      choice: "none",
      probabilities,
      confidence: 0.95,
      threshold: 0.1,
    });

    expect(skills).toHaveLength(0);
  });

  it("formats skill summaries for hook output injection", () => {
    const summary = formatSkillSummary([
      { name: "tdd", probability: 0.9, confidence: 0.9, description: "Test driven dev" },
    ]);
    expect(summary).toContain("**tdd** (probability: 0.90, confidence: 0.90)");
    expect(summary).toContain("Test driven dev");
  });

  it("formats full skill content for hook injection and standalone runs", () => {
    const output = formatSkillContent(
      [
        {
          name: "tdd",
          probability: 0.9,
          confidence: 0.9,
          description: "Test driven dev",
          content: "# TDD Guide\nAlways write red before green.",
          path: "/tmp/tdd/SKILL.md",
        },
      ],
      { userPrompt: "Build user signup test-first" }
    );
    expect(output).toContain("Build user signup test-first");
    expect(output).toContain("## Skill: tdd");
    expect(output).toContain("Always write red before green.");
  });

  it("provides well-structured default system prompt and instructions", () => {
    expect(DEFAULT_SYSTEM_PROMPT.toLowerCase()).toContain("decision model");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("skill");

    const instructions = buildJevInstructions("primary");
    expect(instructions).toContain("skill");
  });
});
