#!/usr/bin/env bun
import { legacyContext, type LegacyHookOptions } from "./shared";
export async function handleClaudeHook(
  rawInput: string | { prompt?: string; userPrompt?: string; message?: string },
  options: LegacyHookOptions = {},
): Promise<string> {
  return (await legacyContext("claude", rawInput, options)).context;
}
if (import.meta.main) {
  const { main } = await import("../otherskill");
  process.exitCode = await main([
    "find",
    "--agent",
    "claude",
    ...process.argv.slice(2),
  ]);
}
