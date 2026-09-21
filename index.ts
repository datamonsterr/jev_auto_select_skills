import fs from "node:fs";
import path from "node:path";
import {
  type Skill,
  type SelectedSkill,
  type SkillSelectionResult,
  type SkillSelectorOptions,
  type UsageMetrics,
  formatSkillSummary,
  formatSkillContent,
} from "./lib/model";
import { JevProvider } from "./lib/provider";
import { loadSkillsFromDir, parseSkillFile, parseSkillContent } from "./lib/parse_skill";
import { DEFAULT_SYSTEM_PROMPT } from "./lib/system_prompt";

/**
 * Resolve all search paths for skills bank directories.
 * By default reads:
 *  - Agent skills: ./.agents/jev_skills (or AGENT_SKILLS_PATH / SKILLS_AGENT_DIR)
 *  - Global skills: ~/.agents/jev_skills/ (or GLOBAL_SKILLS_PATH / SKILLS_GLOBAL_DIR)
 *
 * Can be overridden by environment variables (SKILLS_BANK_PATH, SKILLS_DIR,
 * GLOBAL_SKILLS_PATH, AGENT_SKILLS_PATH) or explicit arguments.
 */
export function resolveSkillsSearchPaths(options?: {
  customPath?: string | string[];
  skillsDir?: string | string[];
  cwd?: string;
}): string[] {
  const paths: string[] = [];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cwd = options?.cwd || process.cwd();

  // 1. Explicit path(s) passed directly
  const explicit = options?.customPath || options?.skillsDir;
  if (explicit) {
    const list = Array.isArray(explicit) ? explicit : [explicit];
    for (const p of list) {
      if (!p) continue;
      const resolved = p.startsWith("~") ? path.join(homeDir, p.slice(1)) : path.resolve(cwd, p);
      if (fs.existsSync(resolved) && !paths.includes(resolved)) {
        paths.push(resolved);
      }
    }
    if (paths.length > 0) return paths;
  }

  // 2. Environment variable overrides (SKILLS_BANK_PATH, SKILLS_DIR)
  const envPath = process.env.SKILLS_BANK_PATH || process.env.SKILLS_DIR;
  if (envPath) {
    const parts = envPath.split(/[:;,]/).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const resolved = p.startsWith("~") ? path.join(homeDir, p.slice(1)) : path.resolve(cwd, p);
      if (fs.existsSync(resolved) && !paths.includes(resolved)) {
        paths.push(resolved);
      }
    }
    if (paths.length > 0) return paths;
  }

  // 3. Agent-specific skills path (default: ./.agents/jev_skills)
  const agentEnv = process.env.AGENT_SKILLS_PATH || process.env.SKILLS_AGENT_DIR;
  const agentCandidates = [
    agentEnv ? (agentEnv.startsWith("~") ? path.join(homeDir, agentEnv.slice(1)) : path.resolve(cwd, agentEnv)) : null,
    path.resolve(cwd, ".agents", "jev_skills"),
    path.resolve(import.meta.dir, ".agents", "jev_skills"),
  ].filter((p): p is string => Boolean(p));

  for (const cand of agentCandidates) {
    if (fs.existsSync(cand) && !paths.includes(cand)) {
      paths.push(cand);
      break;
    }
  }

  // 4. Global skills path (default: ~/.agents/jev_skills/)
  const globalEnv = process.env.GLOBAL_SKILLS_PATH || process.env.SKILLS_GLOBAL_DIR;
  const globalCandidates = [
    globalEnv ? (globalEnv.startsWith("~") ? path.join(homeDir, globalEnv.slice(1)) : path.resolve(globalEnv)) : null,
    path.join(homeDir, ".agents", "jev_skills"),
    path.join(homeDir, ".agents", "skills_bank"),
    path.join(homeDir, ".gemini", "config", "skills"),
  ].filter((p): p is string => Boolean(p));

  for (const cand of globalCandidates) {
    if (fs.existsSync(cand) && !paths.includes(cand)) {
      paths.push(cand);
      break;
    }
  }

  // 5. Legacy fallbacks
  const legacyCandidates = [
    path.resolve(cwd, "skills"),
    path.resolve(import.meta.dir, "skills"),
    path.join(homeDir, ".agents", "skills"),
  ];
  for (const cand of legacyCandidates) {
    if (fs.existsSync(cand) && !paths.includes(cand)) {
      paths.push(cand);
      break;
    }
  }

  // Default fallback if none exists yet
  if (paths.length === 0) {
    paths.push(path.resolve(cwd, ".agents", "jev_skills"));
  }

  return paths;
}

/**
 * Dynamically resolve the primary skills bank directory path from environment or defaults
 */
export function resolveSkillsBankPath(customPath?: string): string {
  const searchPaths = resolveSkillsSearchPaths({ customPath });
  return searchPaths[0] || path.resolve(process.cwd(), ".agents", "jev_skills");
}

export {
  JevProvider,
  loadSkillsFromDir,
  parseSkillFile,
  parseSkillContent,
  formatSkillSummary,
  formatSkillContent,
  DEFAULT_SYSTEM_PROMPT,
};
export type { Skill, SelectedSkill, SkillSelectionResult, SkillSelectorOptions, UsageMetrics };

/**
 * High-level programmatic API to select skills using Jev decision model
 */
export async function selectSkills(params: {
  userPrompt: string;
  systemPrompt?: string;
  skillsDir?: string | string[];
  options?: SkillSelectorOptions;
}): Promise<SkillSelectionResult> {
  const { userPrompt, systemPrompt, skillsDir, options = {} } = params;
  const targetDirs = resolveSkillsSearchPaths({
    skillsDir: skillsDir || options.skillsDir,
  });

  const skills = loadSkillsFromDir(targetDirs);
  if (skills.length === 0) {
    throw new Error(`No skills found in directories: ${targetDirs.join(", ")}`);
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

function printHelp(): void {
  console.log(`
Jev Skill Selector (TypeSafe Jev System One Model)
Usage:
  bun run index.ts "<user prompt>" [options]
  bun run index.ts --prompt "<user prompt>" --content
  bun run index.ts --skill "<skill-name>"
  echo '{"userPrompt": "..."}' | bun run index.ts

Options:
  --prompt, -p <text>      The user prompt / task to evaluate
  --content, -c            Output full SKILL.md instructions for selected skills (use if harness cannot use hooks)
  --skill, -k <name>       Fetch and print content of a specific skill directly by name
  --system, -s <text>      Optional system prompt or instructions
  --skills-dir, -d <path>  Path to skills directory (default: agent ./.agents/jev_skills and global ~/.agents/jev_skills)
  --threshold, -t <num>    Probability threshold (default: 0.05)
  --max-skills, -m <num>   Maximum skills to return (default: 3)
  --json                   Output results as JSON
  --help, -h               Show this help message
`);
}

/**
 * CLI Handler
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 && process.stdin.isTTY) {
    printHelp();
    process.exit(0);
  }

  let prompt = "";
  let directSkillName: string | undefined;
  let systemPrompt: string | undefined;
  let customSkillsDir: string | undefined;
  let threshold = 0.05;
  let maxSkills = 3;
  let jsonOutput = false;
  let showContent = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    } else if (arg === "--prompt" || arg === "-p") {
      prompt = args[++i] || "";
    } else if (arg === "--content" || arg === "-c") {
      showContent = true;
    } else if (arg === "--skill" || arg === "-k") {
      directSkillName = args[++i];
    } else if (arg === "--system" || arg === "-s") {
      systemPrompt = args[++i];
    } else if (arg === "--skills-dir" || arg === "-d") {
      customSkillsDir = args[++i];
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

  // Handle direct skill lookup
  if (directSkillName) {
    const searchDirs = resolveSkillsSearchPaths({ skillsDir: customSkillsDir });
    const allSkills = loadSkillsFromDir(searchDirs);
    const found = allSkills.find(
      (s) => s.name.toLowerCase() === directSkillName!.toLowerCase()
    );
    if (!found) {
      console.error(`Skill "${directSkillName}" not found in search paths: ${searchDirs.join(", ")}`);
      process.exit(1);
    }
    const content = found.path && fs.existsSync(found.path) ? fs.readFileSync(found.path, "utf-8") : found.description;
    if (jsonOutput) {
      console.log(JSON.stringify({ skill: found, content }, null, 2));
    } else {
      console.log(`\n### Skill: ${found.name}\n*Path: ${found.path || "embedded"}*\n\n${content}`);
    }
    return;
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
        if (parsed.content || parsed.showContent) showContent = true;
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
      skillsDir: customSkillsDir,
      options: { threshold, maxSkills, includeContent: showContent },
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else if (showContent) {
      console.log("\n" + formatSkillContent(result.selectedSkills, { userPrompt: prompt }));
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
