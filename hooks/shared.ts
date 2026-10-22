import { loadConfig } from "../lib/otherskill/config";
import { readKey } from "../lib/otherskill/credentials";
import { route, Decisions, summary } from "../lib/otherskill/routing";
import { formatSkillSummary, type SkillSelectionResult } from "../lib/model";
import { hookInput } from "../lib/otherskill/hook";
import type { Agent } from "../lib/otherskill/setup";
export interface LegacyHookOptions {
  selectSkillsFn?: (params: {
    userPrompt: string;
    skillsDir?: string | string[];
  }) => Promise<SkillSelectionResult>;
  skillsDir?: string | string[];
  includeContent?: boolean;
}
export async function legacyContext(
  agent: Agent,
  raw: unknown,
  options: LegacyHookOptions = {},
): Promise<{
  prompt: string;
  context: string;
  skills: SkillSelectionResult["selectedSkills"];
}> {
  const input = hookInput(
    typeof raw === "string" ? raw : JSON.stringify(raw),
    agent,
  );
  if (input.skip || !input.prompt)
    return { prompt: "", context: "", skills: [] };
  try {
    if (options.selectSkillsFn) {
      const result = await options.selectSkillsFn({
        userPrompt: input.prompt,
        skillsDir: options.skillsDir,
      });
      return {
        prompt: input.prompt,
        context: result.selectedSkills.length
          ? formatSkillSummary(result.selectedSkills)
          : "",
        skills: result.selectedSkills,
      };
    }
    const config = loadConfig({ cwd: input.cwd });
    const result = await route(
      config,
      input.prompt,
      new Decisions(config, { apiKey: readKey(config.home) }),
    );
    for (const code of result.diagnostics)
      console.error(`[otherskill] ${code}`);
    return {
      prompt: input.prompt,
      context: summary(result),
      skills: result.selected,
    };
  } catch {
    console.error("[otherskill] hook unavailable; continuing without context");
    return { prompt: input.prompt, context: "", skills: [] };
  }
}
