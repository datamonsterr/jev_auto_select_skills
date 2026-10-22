#!/usr/bin/env bun
import { legacyContext, type LegacyHookOptions } from "./shared";
export interface CodexHookInput {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  context?: Record<string, unknown>;
}
export async function handleCodexHook(
  rawInput: string | CodexHookInput,
  options: LegacyHookOptions = {},
) {
  const result = await legacyContext("codex", rawInput, options);
  return {
    prompt: result.prompt,
    injectedContext: result.context,
    skills: result.skills.map((s) => ({
      name: s.name,
      probability: s.probability,
      confidence: s.confidence,
    })),
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit" as const,
      additionalContext: result.context,
    },
  };
}
export type CodexHookOutput = Awaited<ReturnType<typeof handleCodexHook>>;
if (import.meta.main) {
  const { main } = await import("../otherskill");
  process.exitCode = await main([
    "find",
    "--agent",
    "codex",
    ...process.argv.slice(2),
  ]);
}
