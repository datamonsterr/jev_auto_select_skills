import { describe, it, expect } from "bun:test";
import {
  parseSkillContent,
  parseSkillFile,
  loadSkillsFromDir,
  buildSkillState,
  buildSkillCriteria,
} from "../lib/parse_skill";
import path from "path";

describe("parse_skill", () => {
  it("parses skill content with frontmatter and explicit When to Use section", () => {
    const rawMarkdown = `---
name: my-sample-skill
description: A sample skill for testing frontmatter parsing.
---

# My Sample Skill

Introduction to sample skill.

## When to Use

- When you need to test parsing of markdown skills.
- When creating automated unit tests.

## Other section
Some details.
`;

    const skill = parseSkillContent(rawMarkdown, "fallback-name");
    expect(skill.name).toBe("my-sample-skill");
    expect(skill.description).toBe("A sample skill for testing frontmatter parsing.");
    expect(skill.whenToUse).toContain("When you need to test parsing of markdown skills.");
    expect(skill.whenToUse).toContain("When creating automated unit tests.");
  });

  it("falls back to directory name if frontmatter name is missing", () => {
    const rawMarkdown = `---
description: Just a description.
---

# Title
`;
    const skill = parseSkillContent(rawMarkdown, "inferred-name");
    expect(skill.name).toBe("inferred-name");
    expect(skill.description).toBe("Just a description.");
  });

  it("extracts whenToUse from description when explicit section is absent", () => {
    const rawMarkdown = `---
name: git-commit
description: Execute git commit with conventional commit message analysis. Use when user asks to commit changes or mentions /commit.
---

# Git Commit
Details here.
`;
    const skill = parseSkillContent(rawMarkdown);
    expect(skill.name).toBe("git-commit");
    expect(skill.whenToUse).toContain("Use when user asks to commit changes");
  });

  it("loads skills from the actual skills directory (.agents/jev_skills)", () => {
    const skills = loadSkillsFromDir(path.resolve(__dirname, "../.agents/jev_skills"));
    expect(skills.length).toBeGreaterThan(50);
    
    const tdd = skills.find((s) => s.name === "tdd");
    expect(tdd).toBeDefined();
    expect(tdd?.description).toContain("Test-driven development");

    const gitCommit = skills.find((s) => s.name === "git-commit");
    expect(gitCommit).toBeDefined();
  });

  it("loads and merges skills across multiple directories with precedence", () => {
    const primaryDir = path.resolve(__dirname, "../.agents/jev_skills");
    const merged = loadSkillsFromDir([primaryDir, primaryDir]);
    expect(merged.length).toBeGreaterThan(50);
  });

  it("builds Jev state containing skills description, name and when to use it", () => {
    const sampleSkills = [
      {
        name: "skill-a",
        description: "Does task A",
        whenToUse: "Use when task A is requested",
      },
      {
        name: "skill-b",
        description: "Does task B",
        whenToUse: "Use when task B is requested",
      },
    ];

    const state = buildSkillState(sampleSkills, "Please run task A", "Be accurate");
    expect(state.user_prompt).toBe("Please run task A");
    expect(state.system_prompt).toBe("Be accurate");
    expect(Array.isArray(state.skills)).toBe(true);
    expect(state.skills).toHaveLength(2);
    expect(state.skills[0]).toEqual({
      name: "skill-a",
      description: "Does task A",
      when_to_use: "Use when task A is requested",
    });
  });

  it("builds skill criteria strictly limited to skill names as keys", () => {
    const sampleSkills = [
      {
        name: "skill-a",
        description: "Does task A",
        whenToUse: "Use when task A is requested",
      },
      {
        name: "skill-b",
        description: "Does task B",
        whenToUse: "Use when task B is requested",
      },
    ];

    const criteria = buildSkillCriteria(sampleSkills, true);
    const keys = Object.keys(criteria);
    expect(keys).toContain("skill-a");
    expect(keys).toContain("skill-b");
    expect(criteria["skill-a"]).toBe("task A is requested");
  });
});
