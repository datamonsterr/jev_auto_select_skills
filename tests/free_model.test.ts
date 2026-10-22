import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import {
  JevProvider,
  isFreeModel,
  resolveActiveModel,
  DEFAULT_FREE_MODEL,
} from "../lib/provider";
import { selectSkills } from "../index";
import type { Skill } from "../lib/model";

describe("Free Decision Model enforcement", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.MODEL;
    delete process.env.JEV_MODEL;
    delete process.env.SKILL_SELECTOR_MODEL;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("identifies free models vs paid models correctly", () => {
    expect(isFreeModel("inception/mercury-decide:free")).toBe(true);
    expect(isFreeModel("meta-llama/llama-3-8b-instruct:free")).toBe(true);
    expect(isFreeModel("any-provider/any-model:FREE")).toBe(true);

    // Paid models must return false
    expect(isFreeModel("~typesafe/jev-latest")).toBe(false);
    expect(isFreeModel("typesafe/jev-1.13-20260917")).toBe(false);
    expect(isFreeModel("openai/gpt-4o")).toBe(false);
    expect(isFreeModel("anthropic/claude-3.5-sonnet")).toBe(false);
  });

  it("defaults to inception/mercury-decide:free", () => {
    expect(resolveActiveModel()).toBe(DEFAULT_FREE_MODEL);
    expect(resolveActiveModel()).toBe("inception/mercury-decide:free");
  });

  it("rejects paid model overrides before network call", async () => {
    const mockFetch = mock(async () => new Response("{}", { status: 200 }));

    // Explicit paid model option
    expect(() => {
      new JevProvider({
        apiKey: "test-key",
        model: "~typesafe/jev-latest",
        fetchFn: mockFetch as any,
      });
    }).toThrow(/paid.*rejected|only free/i);

    expect(mockFetch).toHaveBeenCalledTimes(0);
  });

  it("prefers SKILL_SELECTOR_MODEL then compatible legacy free-only values", () => {
    process.env.SKILL_SELECTOR_MODEL = "custom/free-model:free";
    process.env.MODEL = "legacy/model:free";
    expect(resolveActiveModel()).toBe("custom/free-model:free");

    delete process.env.SKILL_SELECTOR_MODEL;
    expect(resolveActiveModel()).toBe("legacy/model:free");
  });

  it("does not silently use legacy MODEL or JEV_MODEL if configured to paid model", () => {
    process.env.MODEL = "~typesafe/jev-latest";
    process.env.JEV_MODEL = "openai/gpt-4o";

    // Should NOT use the paid legacy model; must fallback safely to default free model
    expect(resolveActiveModel()).toBe(DEFAULT_FREE_MODEL);
  });

  it("treats provider failure/timeout as local fallback or no selected skills with explicit source metadata", async () => {
    const dummySkills: Skill[] = [
      {
        name: "tdd",
        description: "TDD",
        whenToUse: "Use for test-first development",
      },
    ];

    const mockFailingFetch = mock(async () => {
      throw new Error("Connection timeout");
    });

    const provider = new JevProvider({
      apiKey: "test-key",
      model: "inception/mercury-decide:free",
      fetchFn: mockFailingFetch as any,
      retries: 1,
    });

    const result = await provider.selectSkills({
      userPrompt: "Run TDD tests",
      skills: dummySkills,
    });

    expect(result.source).toBe("unavailable");
    expect(result.metadata?.source).toBe("unavailable");
    expect(result.metadata?.error).toBe("decision_unavailable");
    expect(result.selectedSkills).toEqual([]);
  });
});
