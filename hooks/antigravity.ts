#!/usr/bin/env bun
import { legacyContext, type LegacyHookOptions } from "./shared";
import { hookInput } from "../lib/otherskill/hook";
import { formatSkillSummary, type SelectedSkill } from "../lib/model";
export interface AntigravityHookInput {
  invocationNum?: number;
  initialNumSteps?: number;
  conversationId?: string;
  workspacePaths?: string[];
  transcriptPath?: string;
  artifactDirectoryPath?: string;
  modelName?: string;
  prompt?: string;
  userPrompt?: string;
}
export interface AntigravityInjectStep {
  ephemeralMessage?: string;
  userMessage?: string;
}
export interface AntigravityHookOutput {
  injectSteps: AntigravityInjectStep[];
}
export function extractUserPromptFromTranscript(
  transcriptPath: string,
): string {
  return hookInput(JSON.stringify({ transcriptPath }), "antigravity").prompt;
}
export function formatAntigravityEphemeral(
  skills: SelectedSkill[],
  _skillsDir: string,
  _options?: { userPrompt?: string; includeContent?: boolean },
): string {
  return skills.length ? formatSkillSummary(skills) : "";
}
export async function handleAntigravityHook(
  rawInput: string | AntigravityHookInput,
  options: LegacyHookOptions = {},
): Promise<AntigravityHookOutput> {
  const result = await legacyContext("antigravity", rawInput, options);
  return {
    injectSteps: result.context ? [{ ephemeralMessage: result.context }] : [],
  };
}
if (import.meta.main) {
  const { main } = await import("../otherskill");
  process.exitCode = await main([
    "find",
    "--agent",
    "antigravity",
    ...process.argv.slice(2),
  ]);
}
