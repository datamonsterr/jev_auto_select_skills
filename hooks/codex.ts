#!/usr/bin/env bun
import { selectSkills } from "../index";
import { formatSkillSummary } from "../lib/model";

export interface CodexHookInput {
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  context?: Record<string, any>;
}

export interface CodexHookOutput {
  prompt: string;
  injectedContext: string;
  skills: Array<{ name: string; probability: number; confidence: number }>;
}

/**
 * Handle Codex Pre-Prompt / User-Prompt Hook
 */
export async function handleCodexHook(
  rawInput: string | CodexHookInput,
  options: { selectSkillsFn?: typeof selectSkills; skillsDir?: string } = {}
): Promise<CodexHookOutput> {
  const selectFn = options.selectSkillsFn || selectSkills;
  let inputData: CodexHookInput = {};

  if (typeof rawInput === "string") {
    try {
      inputData = JSON.parse(rawInput);
    } catch {
      inputData = { prompt: rawInput };
    }
  } else {
    inputData = rawInput;
  }

  let prompt = inputData.prompt || "";
  if (!prompt && Array.isArray(inputData.messages) && inputData.messages.length > 0) {
    const lastUser = [...inputData.messages].reverse().find((m) => m.role === "user");
    if (lastUser) prompt = lastUser.content;
  }

  if (!prompt) {
    return {
      prompt: "",
      injectedContext: "",
      skills: [],
    };
  }

  const result = await selectFn({
    userPrompt: prompt,
    skillsDir: options.skillsDir,
  });

  const injectedContext = formatSkillSummary(result.selectedSkills);

  return {
    prompt,
    injectedContext,
    skills: result.selectedSkills.map((s) => ({
      name: s.name,
      probability: s.probability,
      confidence: s.confidence,
    })),
  };
}

// CLI invocation
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

  handleCodexHook(input)
    .then((out) => {
      console.log(JSON.stringify(out, null, 2));
    })
    .catch((err) => {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    });
}
