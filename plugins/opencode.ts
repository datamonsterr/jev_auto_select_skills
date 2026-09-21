import { selectSkills } from "../index";
import { formatSkillSummary } from "../lib/model";
import { z } from "zod";

export interface OpenCodePluginOptions {
  skillsDir?: string;
  threshold?: number;
  autoInject?: boolean;
}

/**
 * OpenCode Plugin for TypeSafe Jev Skill Selector
 */
export default function jevSkillSelectorPlugin(options: OpenCodePluginOptions = {}) {
  const autoInject = options.autoInject ?? true;

  return {
    name: "jev-skill-selector",
    version: "1.0.0",
    description: "Dynamically selects and loads skills using TypeSafe Jev decision model",

    hooks: {
      // OpenCode 1.x lifecycle hook. The old `chat:before` event is not loaded
      // by current OpenCode releases.
      "experimental.chat.messages.transform": async (_input: unknown, output: any) => {
        if (!autoInject || !Array.isArray(output?.messages)) return;

        const messages = output.messages;
        const lastUser = [...messages].reverse().find((entry: any) => entry?.info?.role === "user");
        const parts = lastUser?.parts ?? [];
        const prompt = parts
          .filter((part: any) => part?.type === "text" && typeof part.text === "string")
          .map((part: any) => part.text)
          .join("\n")
          .trim();
        if (!prompt) return;

        try {
          const result = await selectSkills({
            userPrompt: prompt,
            skillsDir: options.skillsDir,
            options: { threshold: options.threshold ?? 0.05 },
          });
          if (result.selectedSkills.length > 0) {
            // Add a model-visible system message without mutating the user text.
            messages.push({
              info: { role: "system", synthetic: true },
              parts: [{ type: "text", text: formatSkillSummary(result.selectedSkills) }],
            });
          }
        } catch (err: any) {
          console.warn(`[jev-skill-selector] Plugin hook error: ${err.message}`);
        }
      },
      // Kept as a compatibility alias for older OpenCode 1.x builds.
      "chat:before": async (context: any) => context,
    },

    tools: [
      {
        name: "select_skill",
        description: "Use TypeSafe Jev decision model on OpenRouter to choose relevant skills for a task from the skill bank",
        parameters: z.object({
          task: z.string().describe("The user task or engineering request to evaluate"),
          threshold: z.number().optional().describe("Probability threshold (default 0.05)"),
        }),
        execute: async ({ task, threshold }: { task: string; threshold?: number }) => {
          const result = await selectSkills({
            userPrompt: task,
            skillsDir: options.skillsDir,
            options: { threshold: threshold || 0.05 },
          });

          return {
            primarySkill: result.primarySkill,
            skills: result.selectedSkills,
            summary: formatSkillSummary(result.selectedSkills),
          };
        },
      },
    ],
  };
}
