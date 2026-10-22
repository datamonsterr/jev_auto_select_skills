/** Deprecated factory shape; setup installs the native adapter from otherskill-opencode.ts. */
import path from "node:path";
import { repoRoot } from "../lib/otherskill/setup";
import { createOpenCodePlugin } from "./otherskill-opencode";
export interface OpenCodePluginOptions {
  skillsDir?: string | string[];
  threshold?: number;
  autoInject?: boolean;
}
export default function jevSkillSelectorPlugin(
  options: OpenCodePluginOptions = {},
) {
  const command = [
    process.execPath,
    path.join(repoRoot, "otherskill.ts"),
    "find",
    "--agent",
    "opencode",
  ];
  const hooks = createOpenCodePlugin({ command, cwd: process.cwd() });
  return {
    name: "jev-skill-selector",
    version: "1.0.0",
    hooks: { ...hooks, "chat:before": async (context: unknown) => context },
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
