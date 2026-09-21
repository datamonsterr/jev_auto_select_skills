import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { Skill, JevState } from "./model";

/**
 * Sanitize and compact text by removing code blocks, links, boilerplate phrases, and redundant spaces
 */
export function sanitizeSkillText(text: string, maxLen = 120): string {
  if (!text) return "";
  // Strip code blocks and markdown artifacts
  let cleaned = text.replace(/```[\s\S]*?```/g, " ");
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");
  cleaned = cleaned.replace(/[*_`#]/g, "");

  // Strip redundant repetitive boilerplate prefixes to optimize input tokens
  cleaned = cleaned.replace(
    /^(?:Use (?:this skill )?when (?:the user )?(?:wants to |asks to |needs to |is )?|Trigger (?:with|on) |Activate this skill when(?:ever)? |This skill (?:should be used when|provides|helps(?: users)?(?: to)?) )/i,
    ""
  );

  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > maxLen) {
    cleaned = cleaned.slice(0, maxLen).replace(/\s+\S*$/, "") + "...";
  }
  return cleaned;
}

/**
 * Extract "When to Use" or trigger section from markdown body
 */
export function extractWhenToUseFromBody(markdown: string): string | null {
  const whenToUseRegex = /##\s*(?:When\s+to\s+Use|Triggers|When\s+to\s+use\s+this\s+skill)[\s\S]*?(?=\n##|\n#|$)/i;
  const match = markdown.match(whenToUseRegex);
  if (match) {
    const lines = match[0].split("\n").slice(1).join("\n").trim();
    const sanitized = sanitizeSkillText(lines, 250);
    if (sanitized.length > 0) {
      return sanitized;
    }
  }
  return null;
}

/**
 * Parse single skill markdown content string
 */
export function parseSkillContent(
  content: string,
  fallbackName?: string,
  filePath?: string
): Skill {
  let name = fallbackName || "unknown-skill";
  let description = "";
  let body = content;

  // Extract YAML frontmatter
  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatterMatch) {
    try {
      const parsed = yaml.parse(frontmatterMatch[1]);
      if (parsed && typeof parsed === "object") {
        if (parsed.name && typeof parsed.name === "string") {
          name = parsed.name.trim();
        }
        if (parsed.description && typeof parsed.description === "string") {
          description = parsed.description.trim();
        }
      }
    } catch {
      // Fallback on yaml parse failure
    }
    body = content.slice(frontmatterMatch[0].length);
  }

  // Extract when to use
  let whenToUse = extractWhenToUseFromBody(body);
  if (!whenToUse && description) {
    // Check if description has "Use when..." or "Trigger with..."
    const useWhenMatch = description.match(/(?:Use when|Trigger with|Activate this skill)[^.]*\.?/i);
    if (useWhenMatch) {
      whenToUse = useWhenMatch[0].trim();
    } else {
      whenToUse = description;
    }
  }

  return {
    name,
    description: description || name,
    whenToUse: whenToUse || description || name,
    path: filePath,
  };
}

/**
 * Parse a SKILL.md file from disk
 */
export function parseSkillFile(filePath: string): Skill | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, "utf-8");
    const dirName = path.basename(path.dirname(filePath));
    return parseSkillContent(content, dirName, filePath);
  } catch {
    return null;
  }
}

/**
 * Load all skills from one or multiple skills bank directories.
 * When multiple directories are provided, earlier directories take precedence over later ones
 * (e.g. [agentSkillsDir, globalSkillsDir] lets agent skills override global skills with same name).
 */
export function loadSkillsFromDir(skillsDir: string | string[]): Skill[] {
  const dirs = Array.isArray(skillsDir) ? skillsDir : [skillsDir];
  const skillMap = new Map<string, Skill>();

  // Process in reverse so earlier entries in `dirs` overwrite later ones
  for (const dir of [...dirs].reverse()) {
    if (!dir) continue;
    const resolvedDir = path.resolve(dir);
    if (!fs.existsSync(resolvedDir)) continue;

    const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(resolvedDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          const skill = parseSkillFile(skillPath);
          if (skill) skillMap.set(skill.name, skill);
        }
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        const skill = parseSkillFile(path.join(resolvedDir, entry.name));
        if (skill) skillMap.set(skill.name, skill);
      }
    }
  }

  return Array.from(skillMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compact user prompt for Jev routing by collapsing massive code blocks or logs
 * while preserving the essential user request instructions at top and bottom.
 */
export function compactUserPromptForJev(prompt: string, maxChars: number = 1800): string {
  if (!prompt || prompt.length <= maxChars) return prompt;

  let cleaned = prompt.replace(/```[\s\S]*?```/g, (block) => {
    if (block.length > 250) {
      const firstLines = block.slice(0, 100);
      const lastLines = block.slice(-80);
      return `${firstLines}\n...[code block truncated for routing]...\n${lastLines}`;
    }
    return block;
  });

  if (cleaned.length > maxChars) {
    const head = cleaned.slice(0, 1100);
    const tail = cleaned.slice(-600);
    cleaned = `${head}\n...[prompt truncated for skill routing]...\n${tail}`;
  }

  return cleaned;
}

/**
 * Build state object for Jev containing skill metadata and user prompt.
 * If compact is true, omits the redundant skills array to save ~11,000 input tokens.
 */
export function buildSkillState(
  skills: Skill[],
  userPrompt: string,
  systemPrompt?: string,
  context?: Record<string, any>,
  options: { compact?: boolean } = {}
): JevState {
  const compactedPrompt = compactUserPromptForJev(userPrompt);

  if (options.compact) {
    return {
      user_prompt: compactedPrompt,
      ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
      skills: [],
      ...(context ? { context } : {}),
    };
  }

  return {
    user_prompt: compactedPrompt,
    ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      when_to_use: s.whenToUse,
    })),
    ...(context ? { context } : {}),
  };
}

/**
 * Build criteria record for Jev Choice question, limited to skill names (+ none)
 * Compacts and sanitizes description strings to keep input tokens lean.
 */
export function buildSkillCriteria(
  skills: Skill[],
  includeNone: boolean = true,
  maxLen: number = 110
): Record<string, string> {
  const criteria: Record<string, string> = {};

  for (const skill of skills) {
    // Keep description concise and sanitized for Jev criteria
    criteria[skill.name] = sanitizeSkillText(
      skill.whenToUse || skill.description || skill.name,
      maxLen
    );
  }

  if (includeNone) {
    criteria["none"] = "No specialized skill applies";
  }

  return criteria;
}
