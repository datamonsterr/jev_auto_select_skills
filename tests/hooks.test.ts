import { describe, it, expect, mock } from "bun:test";
import { handleCodexHook } from "../hooks/codex";
import { handleClaudeHook } from "../hooks/claude";
import { handleAntigravityHook } from "../hooks/antigravity";
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

  it("handles Antigravity hook input and injects ephemeral message", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "writing-srs",
      selectedSkills: [
        {
          name: "writing-srs",
          probability: 0.89,
          confidence: 0.88,
          description: "Generate Software Requirements Specification",
        },
      ],
      answers: {},
    }));

    const result = await handleAntigravityHook(
      JSON.stringify({
        invocationNum: 1,
        prompt: "viết tài liệu SRS cho hệ thống",
      }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(result.injectSteps).toHaveLength(1);
    expect(result.injectSteps[0].ephemeralMessage).toContain("Jev Dynamic Skill Routing");
    expect(result.injectSteps[0].ephemeralMessage).toContain("writing-srs");
  });

  it("skips invocation when invocationNum > 1 in Antigravity hook", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "writing-srs",
      selectedSkills: [],
      answers: {},
    }));

    const result = await handleAntigravityHook(
      JSON.stringify({
        invocationNum: 2,
        prompt: "some tool output",
      }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(result.injectSteps).toHaveLength(0);
    expect(mockSelectSkills).not.toHaveBeenCalled();
  });

  it("detects environment from arguments or env vars", () => {
    expect(detectEnvironment(["--mode=codex"])).toBe("codex");
    expect(detectEnvironment(["--mode=claude"])).toBe("claude");
    expect(detectEnvironment(["--mode=opencode"])).toBe("opencode");
    expect(detectEnvironment(["--mode=antigravity"])).toBe("antigravity");
    expect(detectEnvironment([], { ANTIGRAVITY: "1" })).toBe("antigravity");
    expect(detectEnvironment([], { OPENCODE: "1" })).toBe("opencode");
    expect(detectEnvironment([], { CLAUDE_CODE: "1" })).toBe("claude");
    expect(detectEnvironment([], { CODEX_RUNNER: "1" })).toBe("codex");
    expect(detectEnvironment([], {}, '{"invocationNum": 1}')).toBe("antigravity");
    expect(detectEnvironment([], {})).toBe("cli");
  });

  it("resolves skills paths using agent and global defaults with env overrides", async () => {
    const { resolveSkillsSearchPaths } = await import("../index");
    
    // Default search paths should contain skills or jev_skills
    const defaultPaths = resolveSkillsSearchPaths();
    expect(defaultPaths.length).toBeGreaterThan(0);
    expect(defaultPaths.some((p) => p.includes("skills") || p.includes("jev_skills"))).toBe(true);

    // Explicit path override
    const explicitPaths = resolveSkillsSearchPaths({ customPath: "/tmp/custom_skills" });
    // If doesn't exist, it won't add non-existent, but if we point to an existing dir:
    const existingExplicit = resolveSkillsSearchPaths({ customPath: "./skills" });
    expect(existingExplicit[0]).toContain("skills");
  });

  it("handles Codex hook wire format output containing hookSpecificOutput", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "git-commit",
      selectedSkills: [
        {
          name: "git-commit",
          probability: 0.95,
          confidence: 0.95,
          description: "Conventional git commits",
        },
      ],
      answers: {},
    }));

    const result = await handleCodexHook(
      JSON.stringify({ prompt: "Please commit the changes" }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(result.hookSpecificOutput).toBeDefined();
    expect(result.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(result.hookSpecificOutput.additionalContext).toContain("git-commit");
  });

  it("handles Claude structured JSON event input and extracts prompt", async () => {
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

    const output = await handleClaudeHook(
      JSON.stringify({
        prompt: "Write unit tests first with TDD",
        hook_event_name: "UserPromptSubmit",
        session_id: "test-session-123",
      }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(output).toContain("tdd");
  });

  it("injects full skill instructions and user prompt in Codex hook output", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "tdd",
      selectedSkills: [
        {
          name: "tdd",
          probability: 0.95,
          confidence: 0.95,
          description: "Test driven development",
          content: "# Complete TDD Guide\nRed green refactor loop",
          path: "/tmp/tdd/SKILL.md",
        },
      ],
      answers: {},
    }));

    const result = await handleCodexHook(
      JSON.stringify({ prompt: "Refactor payment module test-first" }),
      { selectSkillsFn: mockSelectSkills as any }
    );

    expect(result.injectedContext).toContain("Refactor payment module test-first");
    expect(result.injectedContext).toContain("## Skill: tdd");
    expect(result.injectedContext).toContain("Red green refactor loop");
  });

  it("injects full skill instructions and user prompt in Claude hook output", async () => {
    const mockSelectSkills = mock(async () => ({
      primarySkill: "git-commit",
      selectedSkills: [
        {
          name: "git-commit",
          probability: 0.92,
          confidence: 0.92,
          description: "Conventional git commits",
          content: "# Git Commit Standard\nFollow conventional commits",
          path: "/tmp/git-commit/SKILL.md",
        },
      ],
      answers: {},
    }));

    const output = await handleClaudeHook("Commit the auth feature branch", {
      selectSkillsFn: mockSelectSkills as any,
    });

    expect(output).toContain("Commit the auth feature branch");
    expect(output).toContain("## Skill: git-commit");
    expect(output).toContain("Follow conventional commits");
  });
});
