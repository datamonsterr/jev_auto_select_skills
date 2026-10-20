import path from "node:path";
import fs from "node:fs";
import { z } from "zod";

export interface OpenCodePluginOptions {
  skillsDir?: string | string[];
  threshold?: number;
  autoInject?: boolean;
  includeContent?: boolean;
  selectSkillsFn?: any;
}

let cachedSelectSkills: any = null;
let cachedFormatSkillSummary: any = null;
let cachedFormatSkillContent: typeof import("../index").formatSkillContent | undefined;

async function getSelectSkillsFn(customSelectFn?: any) {
  if (customSelectFn) {
    try {
      const mod = await import("../index");
      return {
        selectSkills: customSelectFn,
        formatSkillSummary: mod.formatSkillSummary,
        formatSkillContent: mod.formatSkillContent,
      };
    } catch {
      return {
        selectSkills: customSelectFn,
        formatSkillSummary: (skills: any[]) => JSON.stringify(skills),
        formatSkillContent: (skills: any[]) => JSON.stringify(skills),
      };
    }
  }

  const setupModule = (mod: any) => {
    mod.loadEnvironment?.();
    cachedSelectSkills = mod.selectSkills;
    cachedFormatSkillSummary = mod.formatSkillSummary;
    cachedFormatSkillContent = mod.formatSkillContent;
    return {
      selectSkills: cachedSelectSkills,
      formatSkillSummary: cachedFormatSkillSummary,
      formatSkillContent: cachedFormatSkillContent,
    };
  };

  if (cachedSelectSkills && cachedFormatSkillSummary && cachedFormatSkillContent) {
    return {
      selectSkills: cachedSelectSkills,
      formatSkillSummary: cachedFormatSkillSummary,
      formatSkillContent: cachedFormatSkillContent,
    };
  }

  // 1. Try local relative import (in-repo execution)
  try {
    const mod = await import("../index");
    return setupModule(mod);
  } catch {}

  // 2. Try SKILL_SELECTOR_DIR / JEV_SKILL_SELECTOR_DIR env variable
  const selectorDir = process.env.SKILL_SELECTOR_DIR || process.env.JEV_SKILL_SELECTOR_DIR;
  if (selectorDir) {
    try {
      const mod = await import(path.resolve(selectorDir, "index.ts"));
      return setupModule(mod);
    } catch {}
  }

  // 3. Try standard installation paths
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const candidates = [
    path.join(home, "dev", "skill_selector", "index.ts"),
    path.join(home, ".agents", "skill_selector", "index.ts"),
    path.join(home, "dev", "jev_skill_selector", "index.ts"),
    path.join(home, ".agents", "jev_skill_selector", "index.ts"),
  ];
  for (const cand of candidates) {
    if (fs.existsSync(cand)) {
      try {
        const mod = await import(cand);
        return setupModule(mod);
      } catch {}
    }
  }

  throw new Error("Could not load skill_selector. Set SKILL_SELECTOR_DIR environment variable.");
}

/**
 * OpenCode Plugin for Skill Selector
 */
export default function skillSelectorPlugin(options: OpenCodePluginOptions = {}) {
  const autoInject = options.autoInject ?? true;

  const turns = new Map<string, Promise<string | null>>();

  return {
    name: "skill_selector",
    version: "1.0.0",
    description: "Dynamically selects and loads skills using free decision models",

    hooks: {
      // OpenCode 1.x lifecycle hook for message stream inspection & injection
      "experimental.chat.messages.transform": async (_input: unknown, output: any) => {
        if (!autoInject || !Array.isArray(output?.messages)) return;

        const messages = output.messages;
        const lastUser = [...messages].reverse().find(
          (entry: any) => entry?.info?.role === "user" || entry?.role === "user"
        );
        const parts = lastUser?.parts ?? [];
        let prompt = parts
          .filter((part: any) => part?.type === "text" && typeof part.text === "string")
          .map((part: any) => part.text)
          .join("\n")
          .trim();

        if (!prompt && typeof lastUser?.content === "string") {
          prompt = lastUser.content.trim();
        }
        if (!prompt) return;

        // Remove all previous selector context, including legacy installations.
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if ((m?.info?.role === "system" || m?.role === "system") &&
              (m?.info?.source === "skill_selector" || m?.parts?.some((p: any) =>
                typeof p?.text === "string" && /\[Skill Selector\]|\[Jev Dynamic Skill Routing\]/.test(p.text)))) {
            messages.splice(i, 1);
          }
        }
        const info = lastUser?.info ?? lastUser;
        const session = info?.sessionID ?? (_input as any)?.sessionID;
        const message = info?.id;
        // Never dedupe solely by prompt text: identical consecutive real turns differ.
        const key = session && message ? JSON.stringify([session, message, prompt]) : undefined;
        let pending = key ? turns.get(key) : undefined;
        if (!pending) {
          pending = (async () => {
            try {
              const { selectSkills, formatSkillSummary, formatSkillContent } =
                await getSelectSkillsFn(options.selectSkillsFn);
              const includeContent = options.includeContent ?? false;
              const result = await selectSkills({ userPrompt: prompt, skillsDir: options.skillsDir,
                options: { threshold: options.threshold ?? 0.05, includeContent } });
              if (!result?.selectedSkills?.length) return null;
              return includeContent && formatSkillContent
                ? formatSkillContent(result.selectedSkills)
                : formatSkillSummary(result.selectedSkills);
            } catch (err: any) {
              console.warn(`[skill_selector] Plugin hook error: ${err.message}`);
              return null;
            }
          })();
          if (key) {
            turns.set(key, pending);
            if (turns.size > 256) turns.delete(turns.keys().next().value!);
          }
        }
        const content = await pending;
        // Another concurrent transform may have finished while awaiting the same decision.
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.info?.source === "skill_selector") messages.splice(i, 1);
        }
        if (content) messages.push({
          info: { role: "system", synthetic: true, source: "skill_selector" },
          parts: [{ type: "text", text: content }],
        });
      },

      // OpenCode hook for system prompt transformations
      "experimental.chat.system.transform": async (_input: unknown, output: any) => {
        // System transform hook available for future prompt adaptations
        return;
      },

      // Kept as a compatibility alias for older OpenCode 1.x builds
      "chat:before": async (context: any) => context,
    },

    tools: [
      {
        name: "select_skill",
        description: "Use TypeSafe Jev decision model on OpenRouter to choose relevant skills for a task from the skill bank",
        parameters: z.object({
          task: z.string().describe("The user task or engineering request to evaluate"),
          threshold: z.number().optional().describe("Probability threshold (default 0.05)"),
          content: z.boolean().optional().describe("Include full SKILL.md instructions in response"),
        }),
        execute: async ({ task, threshold, content }: { task: string; threshold?: number; content?: boolean }) => {
          const { selectSkills, formatSkillSummary, formatSkillContent } = await getSelectSkillsFn();
          const result = await selectSkills({
            userPrompt: task,
            skillsDir: options.skillsDir,
            options: { threshold: threshold || 0.05, includeContent: true },
          });

          const formattedContent = formatSkillContent
            ? formatSkillContent(result.selectedSkills, { userPrompt: task })
            : formatSkillSummary(result.selectedSkills);

          return {
            primarySkill: result.primarySkill,
            skills: result.selectedSkills,
            summary: formatSkillSummary(result.selectedSkills),
            content: formattedContent,
          };
        },
      },
    ],
  };
}
