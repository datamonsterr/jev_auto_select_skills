import { describe, it, expect } from "bun:test";
import { formatSkillSummary, formatSkillContent, type SelectedSkill } from "../lib/model";
import opencodePlugin from "../plugins/opencode";

describe("Context optimization and injection formatting", () => {
  const dummySkills: SelectedSkill[] = [
    {
      name: "tdd",
      probability: 0.95,
      confidence: 0.95,
      description: "Test-driven development",
      whenToUse: "Use when user wants to build features test-first",
      path: "/path/to/.agents/other_skills/tdd/SKILL.md",
      content: "---\nname: tdd\n---\n# Mandatory TDD Workflow Instructions\n1. Write failing test\n2. Make it pass\n3. Refactor",
    },
  ];

  it("formats concise names, original accessible paths, and load instructions by default without repeating user prompt", () => {
    const summary = formatSkillSummary(dummySkills);

    expect(summary).toContain("tdd");
    expect(summary).toContain("/path/to/.agents/other_skills/tdd/SKILL.md");
    expect(summary).toMatch(/load.*instruction|view_file|read/i);
    // Must NOT contain repeated user prompt or full markdown body
    expect(summary).not.toContain("Mandatory TDD Workflow Instructions");
    expect(summary).not.toContain('Task: "');
  });

  it("does not repeat user prompt in default formatted summary or content", () => {
    const output = formatSkillSummary(dummySkills);
    expect(output).not.toContain('Task: "');
    expect(output).not.toContain("user prompt");
  });

  it("includes bounded full content only when explicit formatSkillContent or includeContent is requested", () => {
    const contentOutput = formatSkillContent(dummySkills);
    expect(contentOutput).toContain("Mandatory TDD Workflow Instructions");
    // Does not repeat full user prompt
    expect(contentOutput).not.toContain('Task: "');
  });

  it("does not silently truncate mandatory skill instructions when content is rendered", () => {
    const longInstructions = "Step A\n" + "x".repeat(3000) + "\nStep Z: Mandatory final verification";
    const skillWithLongInstructions: SelectedSkill[] = [
      {
        name: "verification",
        probability: 0.9,
        confidence: 0.9,
        content: longInstructions,
      },
    ];

    const rendered = formatSkillContent(skillWithLongInstructions);
    expect(rendered).toContain("Step Z: Mandatory final verification");
  });

  it("OpenCode plugin dedupes per user turn and replaces own prior injection instead of unbounded messages", async () => {
    const plugin = opencodePlugin({ autoInject: true });
    const transformHook = plugin.hooks["experimental.chat.messages.transform"];

    const mockOutput = {
      messages: [
        { role: "user", parts: [{ type: "text", text: "Run TDD tests" }] },
      ],
    };

    // First transform run
    await transformHook({}, mockOutput);
    expect(mockOutput.messages.length).toBe(2);
    const firstSystemMsg = mockOutput.messages[1];
    expect(firstSystemMsg.info?.role).toBe("system");

    // Second transform run on the same turn / state
    await transformHook({}, mockOutput);
    // Must NOT append a 3rd message; must replace prior injection in-place
    expect(mockOutput.messages.length).toBe(2);
  });
});
