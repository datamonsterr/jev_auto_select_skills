import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";
import type { Skill, JevState } from "./model";

/**
 * Extract "When to Use" or trigger section from markdown body
 */
export function extractWhenToUseFromBody(markdown: string): string | null {
  // Look for ## When to Use, ## When to use this skill, ## Triggers, etc.
  const whenToUseRegex = /##\s*(?:When\s+to\s+Use|Triggers|When\s+to\s+use\s+this\s+skill)[\s\S]*?(?=\n##|\n#|$)/i;
  const match = markdown.match(whenToUseRegex);
  if (match) {
    // Strip header line and trim
    const lines = match[0].split("\n").slice(1).join("\n").trim();
    if (lines.length > 0) {
      return lines;
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
 * Load all skills from a skills bank directory
 */
export function loadSkillsFromDir(skillsDir: string): Skill[] {
  const resolvedDir = path.resolve(skillsDir);
  if (!fs.existsSync(resolvedDir)) {
    return [];
  }

  const skills: Skill[] = [];
  const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(resolvedDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const skill = parseSkillFile(skillPath);
        if (skill) skills.push(skill);
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const skill = parseSkillFile(path.join(resolvedDir, entry.name));
      if (skill) skills.push(skill);
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build state object for Jev containing skill metadata and user prompt
 */
export function buildSkillState(
  skills: Skill[],
  userPrompt: string,
  systemPrompt?: string,
  context?: Record<string, any>
): JevState {
  return {
    user_prompt: userPrompt,
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
 */
export function buildSkillCriteria(
  skills: Skill[],
  includeNone: boolean = true
): Record<string, string> {
  const criteria: Record<string, string> = {};

  for (const skill of skills) {
    // Keep description concise for Jev criteria
    criteria[skill.name] = skill.whenToUse || skill.description || skill.name;
  }

  if (includeNone) {
    criteria["none"] = "No specialized skill applies or general reasoning is sufficient";
  }

  return criteria;
}
