#!/usr/bin/env bun
import { selectSkills } from "../index";
import { formatSkillSummary } from "../lib/model";

/**
 * Handle Claude hook input (stdin or string prompt)
 */
export async function handleClaudeHook(
  rawInput: string,
  options: { selectSkillsFn?: typeof selectSkills; skillsDir?: string } = {}
): Promise<string> {
  const selectFn = options.selectSkillsFn || selectSkills;
  let prompt = rawInput.trim();

  // Try parsing JSON if passed as Claude structured event
  if (prompt.startsWith("{")) {
    try {
      const parsed = JSON.parse(prompt);
      prompt = parsed.prompt || parsed.userPrompt || parsed.message || prompt;
    } catch {
      // Keep as string
    }
  }

  if (!prompt) {
    return "";
  }

  const result = await selectFn({
    userPrompt: prompt,
    skillsDir: options.skillsDir,
  });

  return formatSkillSummary(result.selectedSkills);
}

// CLI invocation
if (import.meta.main) {
  let input = "";
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk));
    }
    input = Buffer.concat(chunks).toString("utf-8").trim();
  } else {
    input = process.argv.slice(2).join(" ");
  }

  // If invoked by Antigravity CLI lifecycle hook
  if (input.startsWith("{") && (input.includes('"invocationNum"') || input.includes('"conversationId"') || input.includes('"transcriptPath"'))) {
    const { handleAntigravityHook } = await import("./antigravity");
    handleAntigravityHook(input)
      .then((out) => {
        console.log(JSON.stringify(out, null, 2));
      })
      .catch((err) => {
        console.error(`[jev-antigravity] Error: ${err.message}`);
        console.log(JSON.stringify({ injectSteps: [] }));
      });
  } else {
    handleClaudeHook(input)
      .then((out) => {
        if (out) console.log(out);
      })
      .catch((err) => {
        console.error(`Claude Hook Error: ${err.message}`);
        process.exit(1);
      });
  }
}
