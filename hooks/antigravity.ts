#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { selectSkills, resolveSkillsBankPath, resolveSkillsSearchPaths } from "../index";
import type { SelectedSkill } from "../lib/model";

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

/**
 * Lightweight helper to load .env variables if not already in process.env
 */
function loadEnvFromCandidates(candidates: string[]): void {
  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          const key = line.slice(0, eqIdx).trim();
          let val = line.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore reading errors
    }
  }
}

/**
 * Extract the raw user prompt from the transcript JSONL file
 */
export function extractUserPromptFromTranscript(transcriptPath: string): string {
  if (!fs.existsSync(transcriptPath)) return "";
  try {
    const content = fs.readFileSync(transcriptPath, "utf-8");
    const lines = content.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "USER_INPUT" && entry.source === "USER_EXPLICIT") {
          const text = entry.content || "";
          const reqMatch = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/.exec(text);
          if (reqMatch) {
            return reqMatch[1].trim();
          }
          // Strip auxiliary tags if USER_REQUEST wrapper not found
          const cleaned = text
            .replace(/<(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|SYSTEM_MESSAGE)>[\s\S]*?<\/(?:ADDITIONAL_METADATA|USER_SETTINGS_CHANGE|SYSTEM_MESSAGE)>/g, "")
            .trim();
          return cleaned;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Locate transcript file if transcriptPath wasn't directly provided
 */
function findTranscriptPath(input: AntigravityHookInput): string | null {
  if (input.transcriptPath && fs.existsSync(input.transcriptPath)) {
    return input.transcriptPath;
  }
  const convId = input.conversationId;
  if (!convId) return null;

  const home = os.homedir();
  const candidates = [
    path.join(home, ".gemini", "antigravity-cli", "brain", convId, ".system_generated", "logs", "transcript.jsonl"),
    path.join(home, ".gemini", "antigravity-ide", "brain", convId, ".system_generated", "logs", "transcript.jsonl"),
    path.join(home, ".gemini", "antigravity", "brain", convId, ".system_generated", "logs", "transcript.jsonl"),
  ];

  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      return cand;
    }
  }
  return null;
}

/**
 * Format selected skills for Antigravity ephemeralMessage
 */
export function formatAntigravityEphemeral(
  skills: SelectedSkill[],
  skillsDir: string
): string {
  if (skills.length === 0) return "";

  const lines = [
    "🎯 **[Jev Dynamic Skill Routing]**",
    "Recommended skill(s) for this user prompt:",
    "",
  ];

  for (const skill of skills) {
    const prob = (skill.probability * 100).toFixed(1);
    const conf = (skill.confidence * 100).toFixed(0);
    const skillFile = skill.path || path.join(skillsDir, skill.name, "SKILL.md");
    const hasFile = fs.existsSync(skillFile);

    lines.push(`• **${skill.name}** (Probability: ${prob}% | Confidence: ${conf}%)`);
    if (hasFile) {
      lines.push(`  - Path: \`${skillFile}\``);
    }
    if (skill.description) {
      lines.push(`  - Description: ${skill.description}`);
    }
  }

  lines.push("");
  lines.push("*Instruction:* If relevant, use `view_file` to read the skill instructions and follow its workflow.");

  return lines.join("\n");
}

/**
 * Main Antigravity PreInvocation hook handler
 */
export async function handleAntigravityHook(
  rawInput: string | AntigravityHookInput,
  options: { selectSkillsFn?: typeof selectSkills; skillsDir?: string } = {}
): Promise<AntigravityHookOutput> {
  const emptyOutput: AntigravityHookOutput = { injectSteps: [] };

  let inputData: AntigravityHookInput = {};
  if (typeof rawInput === "string") {
    try {
      inputData = JSON.parse(rawInput);
    } catch {
      inputData = { prompt: rawInput };
    }
  } else {
    inputData = rawInput || {};
  }

  // Only run Jev on initial invocation of a user turn (invocationNum <= 1)
  // Subsequent invocations during the same turn handle tool call returns
  if (inputData.invocationNum !== undefined && inputData.invocationNum > 1) {
    return emptyOutput;
  }

  // Load environment variables (.env) from candidate paths
  const home = os.homedir();
  const envCandidates = [
    path.resolve(import.meta.dir, "..", ".env"),
    ...(inputData.workspacePaths?.map((w) => path.resolve(w, ".env")) || []),
    path.join(home, ".gemini", "config", ".env"),
    path.join(home, ".env"),
  ];
  loadEnvFromCandidates(envCandidates);

  // Extract prompt
  let prompt = inputData.prompt || inputData.userPrompt || "";
  if (!prompt) {
    const transcriptPath = findTranscriptPath(inputData);
    if (transcriptPath) {
      prompt = extractUserPromptFromTranscript(transcriptPath);
    }
  }

  if (!prompt || prompt.length < 2) {
    return emptyOutput;
  }

  // Determine skills directories
  let searchDirs: string[] = [];
  if (options.skillsDir) {
    searchDirs = resolveSkillsSearchPaths({ skillsDir: options.skillsDir });
  } else if (inputData.workspacePaths && inputData.workspacePaths.length > 0) {
    const wsDirs: string[] = [];
    for (const ws of inputData.workspacePaths) {
      const p = path.join(ws, ".agents", "jev_skills");
      if (fs.existsSync(p)) wsDirs.push(p);
    }
    searchDirs = resolveSkillsSearchPaths({ skillsDir: wsDirs.length > 0 ? wsDirs : undefined });
  } else {
    searchDirs = resolveSkillsSearchPaths();
  }

  const primaryDir = searchDirs[0] || resolveSkillsBankPath();

  const selectFn = options.selectSkillsFn || selectSkills;
  const result = await selectFn({
    userPrompt: prompt,
    skillsDir: searchDirs,
  });

  if (!result.selectedSkills || result.selectedSkills.length === 0) {
    return emptyOutput;
  }

  const ephemeralMessage = formatAntigravityEphemeral(result.selectedSkills, primaryDir);
  if (!ephemeralMessage) {
    return emptyOutput;
  }

  return {
    injectSteps: [
      {
        ephemeralMessage,
      },
    ],
  };
}

// CLI execution
if (import.meta.main) {
  let input = "";
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    input = Buffer.concat(chunks).toString("utf-8").trim();
  } else {
    input = process.argv.slice(2).join(" ");
  }

  handleAntigravityHook(input)
    .then((output) => {
      console.log(JSON.stringify(output, null, 2));
    })
    .catch((err) => {
      // Safe fallback: never crash the agent turn
      console.error(`[jev-antigravity] Error: ${err.message}`);
      console.log(JSON.stringify({ injectSteps: [] }));
    });
}
