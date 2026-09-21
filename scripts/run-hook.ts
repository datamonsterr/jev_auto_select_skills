#!/usr/bin/env bun
import { handleCodexHook } from "../hooks/codex";
import { handleClaudeHook } from "../hooks/claude";
import { handleAntigravityHook } from "../hooks/antigravity";
import { selectSkills } from "../index";

export type HookEnvironment = "codex" | "claude" | "opencode" | "antigravity" | "cli";

/**
 * Detect runtime caller environment
 */
export function detectEnvironment(
  argv: string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  rawInput: string = ""
): HookEnvironment {
  // Check CLI flag override
  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const mode = arg.split("=")[1].toLowerCase();
      if (mode === "codex" || mode === "claude" || mode === "opencode" || mode === "antigravity" || mode === "cli") {
        return mode as HookEnvironment;
      }
    }
  }

  // Check Environment Variables
  if (env.ANTIGRAVITY || env.GEMINI_CLI) {
    return "antigravity";
  }
  if (env.OPENCODE || env.OPENCODE_VERSION || env.OPENCODE_CONFIG_DIR) {
    return "opencode";
  }
  if (env.CLAUDE_CODE || env.CLAUDE_WORKSPACE || env.CLAUDE_CONVERSATION_ID) {
    return "claude";
  }
  if (env.CODEX_RUNNER || env.CODEX || env.CODEX_THREAD_ID) {
    return "codex";
  }

  // Probe raw input for Antigravity-specific JSON keys
  if (rawInput && rawInput.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawInput);
      if ("invocationNum" in parsed || "transcriptPath" in parsed || "artifactDirectoryPath" in parsed) {
        return "antigravity";
      }
    } catch {}
  }

  return "cli";
}

/**
 * Main hook dispatcher function
 */
export async function runHookDispatcher(
  input: string,
  env?: HookEnvironment
): Promise<string> {
  const resolvedEnv = env || detectEnvironment(process.argv, process.env, input);
  switch (resolvedEnv) {
    case "antigravity": {
      const res = await handleAntigravityHook(input);
      return JSON.stringify(res, null, 2);
    }
    case "codex": {
      const res = await handleCodexHook(input);
      return JSON.stringify(res, null, 2);
    }
    case "claude": {
      return await handleClaudeHook(input);
    }
    case "opencode": {
      const res = await selectSkills({ userPrompt: input });
      return JSON.stringify({
        primarySkill: res.primarySkill,
        skills: res.selectedSkills,
      }, null, 2);
    }
    case "cli":
    default: {
      const res = await selectSkills({ userPrompt: input });
      return JSON.stringify(res, null, 2);
    }
  }
}

// CLI runner
if (import.meta.main) {
  (async () => {
    let input = "";
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
      }
      input = Buffer.concat(chunks).toString("utf-8").trim();
    } else {
      // Collect non-flag arguments
      input = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(" ");
    }

    const env = detectEnvironment(process.argv, process.env, input);
    runHookDispatcher(input, env)
      .then((out) => {
        if (out) console.log(out);
      })
      .catch((err) => {
        console.error(`Hook Dispatcher Error [${env}]: ${err.message}`);
        process.exit(1);
      });
  })();
}
