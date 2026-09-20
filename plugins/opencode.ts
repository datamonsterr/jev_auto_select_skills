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
      /**
       * Runs before chat message is dispatched to the LLM
       */
      "chat:before": async (context: { messages: Array<{ role: string; content: string }>; systemPrompt?: string }) => {
        if (!autoInject || !context.messages || context.messages.length === 0) {
          return context;
        }

        const lastUser = [...context.messages].reverse().find((m) => m.role === "user");
        if (!lastUser || !lastUser.content) {
          return context;
        }

        try {
          const result = await selectSkills({
            userPrompt: lastUser.content,
            skillsDir: options.skillsDir,
            options: { threshold: options.threshold || 0.05 },
          });

          if (result.selectedSkills.length > 0) {
            const skillContext = formatSkillSummary(result.selectedSkills);
            if (context.systemPrompt) {
              context.systemPrompt = `${context.systemPrompt}\n\n${skillContext}`;
            } else {
              context.systemPrompt = skillContext;
            }
          }
        } catch (err: any) {
          console.warn(`[jev-skill-selector] Plugin hook error: ${err.message}`);
        }

        return context;
      },
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
