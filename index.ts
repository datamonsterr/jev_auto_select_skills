#!/usr/bin/env bun
import path from "node:path";
import {
  type Skill,
  type SelectedSkill,
  type SkillSelectionResult,
  type SkillSelectorOptions,
  type UsageMetrics,
  formatSkillSummary,
} from "./lib/model";
import { JevProvider } from "./lib/provider";
import { loadSkillsFromDir, parseSkillFile, parseSkillContent } from "./lib/parse_skill";
import { DEFAULT_SYSTEM_PROMPT } from "./lib/system_prompt";

export {
  JevProvider,
  loadSkillsFromDir,
  parseSkillFile,
  parseSkillContent,
  formatSkillSummary,
  DEFAULT_SYSTEM_PROMPT,
};
export type { Skill, SelectedSkill, SkillSelectionResult, SkillSelectorOptions, UsageMetrics };

/**
 * High-level programmatic API to select skills using Jev decision model
 */
export async function selectSkills(params: {
  userPrompt: string;
  systemPrompt?: string;
  skillsDir?: string;
  options?: SkillSelectorOptions;
}): Promise<SkillSelectionResult> {
  const { userPrompt, systemPrompt, skillsDir, options = {} } = params;
  const targetDir = skillsDir || options.skillsDir || path.resolve(process.cwd(), "skills");

  const skills = loadSkillsFromDir(targetDir);
  if (skills.length === 0) {
    throw new Error(`No skills found in directory: ${targetDir}`);
  }

  const provider = new JevProvider({
    apiKey: options.apiKey,
    model: options.model,
    retries: options.retries,
    retryDelayMs: options.retryDelayMs,
  });

  return provider.selectSkills({
    userPrompt,
    skills,
    systemPrompt: systemPrompt || options.systemPrompt,
    options,
  });
}

/**
 * CLI Handler
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 && process.stdin.isTTY) {
    console.log(`
Jev Skill Selector (TypeSafe Jev System One Model)
Usage:
  bun run index.ts "<user prompt>" [options]
  bun run index.ts --prompt "<user prompt>" [options]
  echo '{"userPrompt": "..."}' | bun run index.ts

Options:
  --prompt, -p <text>      The user prompt / task to evaluate
  --system, -s <text>      Optional system prompt or instructions
  --skills-dir, -d <path>  Path to skills directory (default: ./skills)
  --threshold, -t <num>    Probability threshold (default: 0.05)
  --max-skills, -m <num>   Maximum skills to return (default: 3)
  --json                   Output results as JSON
  --help, -h               Show this help message
`);
    process.exit(0);
  }

  let prompt = "";
  let systemPrompt: string | undefined;
  let skillsDir = path.resolve(process.cwd(), "skills");
  let threshold = 0.05;
  let maxSkills = 3;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      main();
      return;
    } else if (arg === "--prompt" || arg === "-p") {
      prompt = args[++i] || "";
    } else if (arg === "--system" || arg === "-s") {
      systemPrompt = args[++i];
    } else if (arg === "--skills-dir" || arg === "-d") {
      skillsDir = path.resolve(args[++i] || "./skills");
    } else if (arg === "--threshold" || arg === "-t") {
      threshold = parseFloat(args[++i]) || 0.05;
    } else if (arg === "--max-skills" || arg === "-m") {
      maxSkills = parseInt(args[++i], 10) || 3;
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (!arg.startsWith("-") && !prompt) {
      prompt = arg;
    }
  }

  // Handle stdin if no prompt provided via args
  if (!prompt && !process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    const input = Buffer.concat(chunks).toString("utf-8").trim();
    if (input) {
      try {
        const parsed = JSON.parse(input);
        prompt = parsed.userPrompt || parsed.prompt || parsed.task || input;
        if (parsed.systemPrompt) systemPrompt = parsed.systemPrompt;
      } catch {
        prompt = input;
      }
    }
  }

  if (!prompt) {
    console.error("Error: No prompt provided. Provide a prompt as argument or via stdin.");
    process.exit(1);
  }

  try {
    const result = await selectSkills({
      userPrompt: prompt,
      systemPrompt,
      skillsDir,
      options: { threshold, maxSkills },
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("\n🎯 Jev Skill Selection Result");
      console.log(`Prompt: "${prompt}"`);
      console.log(`Primary Choice: ${result.primarySkill || "none"}`);
      console.log(`Confidence: ${result.answers?.selected_skill?.confidence ?? "N/A"}\n`);

      if (result.selectedSkills.length === 0) {
        console.log("No specialized skills matched the threshold.");
      } else {
        console.log("Selected Skills:");
        for (const s of result.selectedSkills) {
          console.log(`  • ${s.name.padEnd(30)} Prob: ${(s.probability * 100).toFixed(1)}% | Conf: ${(s.confidence * 100).toFixed(1)}%`);
          if (s.description) {
            console.log(`    ${s.description}`);
          }
        }
      }

      if (result.usage) {
        console.log("\n📊 Token Usage Breakdown:");
        console.log(`  • Total Used Tokens:    ${result.usage.total_tokens}`);
        console.log(`  • Input Prompt Tokens:  ${result.usage.user_prompt_tokens}`);
        console.log(`  • System Prompt Tokens: ${result.usage.system_prompt_tokens}`);
        console.log(`  • API Input Tokens:     ${result.usage.input_tokens} (including skills criteria)`);
        console.log(`  • Output Tokens:        ${result.usage.output_tokens}`);
        if (result.usage.cost !== undefined) {
          console.log(`  • Estimated Cost:       $${result.usage.cost.toFixed(6)}`);
        }
      }
    }
  } catch (error: any) {
    console.error(`Error selecting skills: ${error.message}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
