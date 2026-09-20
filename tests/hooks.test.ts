import { describe, it, expect, mock } from "bun:test";
import { handleCodexHook } from "../hooks/codex";
import { handleClaudeHook } from "../hooks/claude";
import jevSkillSelectorPlugin from "../plugins/opencode";
import { detectEnvironment, runHookDispatcher } from "../scripts/run-hook";

describe("hooks and plugin", () => {
  it("handles Codex hook input and formats skill instructions", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "git-commit",
      selectedSkills: [
        {
          name: "git-commit",
          probability: 0.98,
          confidence: 0.98,
          description: "Conventional git commits",
        },
      ],
      answers: {},
    }));

    const result = await handleCodexHook(
      JSON.stringify({ prompt: "Please commit the changes" }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(result).toHaveProperty("prompt");
    expect(result).toHaveProperty("injectedContext");
    expect(result.injectedContext).toContain("git-commit");
  });

  it("handles Claude hook input and outputs structured injection", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "tdd",
      selectedSkills: [
        {
          name: "tdd",
          probability: 0.95,
          confidence: 0.95,
          description: "Test driven development",
        },
      ],
      answers: {},
    }));

    const output = await handleClaudeHook("Refactor payment with TDD", {
      selectSkillsFn: mockSelectSkills as any,
    });

    expect(output).toContain("Recommended Agent Skills");
    expect(output).toContain("tdd");
  });

  it("creates a valid OpenCode plugin object with chat hook and tool", () => {
    const plugin = jevSkillSelectorPlugin();
    expect(plugin.name).toBe("jev-skill-selector");
    expect(typeof plugin.hooks?.["chat:before"]).toBe("function");
    expect(Array.isArray(plugin.tools)).toBe(true);
    expect(plugin.tools[0].name).toBe("select_skill");
  });

  it("detects environment from arguments or env vars", () => {
    expect(detectEnvironment(["--mode=codex"])).toBe("codex");
    expect(detectEnvironment(["--mode=claude"])).toBe("claude");
    expect(detectEnvironment(["--mode=opencode"])).toBe("opencode");
    expect(detectEnvironment([], { OPENCODE: "1" })).toBe("opencode");
    expect(detectEnvironment([], { CLAUDE_CODE: "1" })).toBe("claude");
    expect(detectEnvironment([], { CODEX_RUNNER: "1" })).toBe("codex");
    expect(detectEnvironment([], {})).toBe("cli");
  });
});
