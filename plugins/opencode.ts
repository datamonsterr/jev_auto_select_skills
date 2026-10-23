/** Deprecated factory shape; setup installs the native OtherSkill adapter. */
import path from "node:path";
import { repoRoot } from "../lib/otherskill/setup";
import { createOpenCodePlugin } from "./otherskill-opencode";
import { formatSkillSummary, type SelectedSkill } from "../lib/model";
export interface OpenCodePluginOptions {
  skillsDir?: string | string[];
  threshold?: number;
  autoInject?: boolean;
  selectSkillsFn?: (input: {
    userPrompt: string;
    skillsDir?: string | string[];
  }) => Promise<{ selectedSkills: SelectedSkill[] }>;
}
export default function otherSkillPlugin(options: OpenCodePluginOptions = {}) {
  const command = [
    process.execPath,
    path.join(repoRoot, "otherskill.ts"),
    "find",
    "--agent",
    "opencode",
  ];
  const run = options.selectSkillsFn
    ? async (args: string[]) => {
        const prompt = args[args.indexOf("--prompt") + 1] ?? "";
        const result = await options.selectSkillsFn!({
          userPrompt: prompt,
          skillsDir: options.skillsDir,
        });
        return JSON.stringify({
          context: result.selectedSkills.length
            ? formatSkillSummary(result.selectedSkills)
            : "",
        });
      }
    : undefined;
  const hooks = createOpenCodePlugin({ command, cwd: process.cwd(), run });
  return {
    name: "otherskill",
    version: "1.1.0",
    hooks: {
      ...hooks,
      ...(options.autoInject === false
        ? { "experimental.chat.messages.transform": async () => {} }
        : {}),
      "chat:before": async (context: unknown) => context,
    },
    tools: [
      {
        name: "select_skill",
        description:
          "Deprecated: use otherskill find --agent opencode --prompt <text>",
        execute: async ({ task }: { task: string }) => {
          const child = Bun.spawn([...command, "--prompt", task], {
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
          });
          const output = await new Response(child.stdout).text();
          await child.exited;
          return JSON.parse(output);
        },
      },
    ],
  };
}
