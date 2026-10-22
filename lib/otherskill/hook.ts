import fs from "node:fs";
import { type Agent, detectAgent } from "./setup";
import { type RouteResult, summary } from "./routing";
export interface HookInput {
  prompt: string;
  cwd?: string;
  skip: boolean;
}
export function hookInput(
  raw: string,
  agent: Agent,
  explicitPrompt?: string,
): HookInput {
  if (explicitPrompt !== undefined)
    return { prompt: explicitPrompt, skip: false };
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { prompt: raw, skip: false };
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { prompt: "", skip: false };
  const data = input as Record<string, unknown>;
  const cwd =
    typeof data.cwd === "string"
      ? data.cwd
      : Array.isArray(data.workspacePaths) &&
          typeof data.workspacePaths[0] === "string"
        ? data.workspacePaths[0]
        : undefined;
  if (
    agent === "antigravity" &&
    typeof data.invocationNum === "number" &&
    data.invocationNum > 1
  )
    return { prompt: "", cwd, skip: true };
  for (const field of ["prompt", "userPrompt", "message"])
    if (typeof data[field] === "string")
      return { prompt: data[field], cwd, skip: false };
  if (Array.isArray(data.messages)) {
    const last = [...data.messages]
      .reverse()
      .find(
        (m) =>
          m &&
          typeof m === "object" &&
          m.role === "user" &&
          typeof m.content === "string",
      );
    if (last) return { prompt: last.content, cwd, skip: false };
  }
  if (agent === "antigravity" && typeof data.transcriptPath === "string") {
    try {
      for (const line of fs
        .readFileSync(data.transcriptPath, "utf8")
        .split("\n")
        .reverse()) {
        if (!line.trim()) continue;
        try {
          const entry: unknown = JSON.parse(line);
          if (
            entry &&
            typeof entry === "object" &&
            "type" in entry &&
            entry.type === "USER_INPUT" &&
            "source" in entry &&
            entry.source === "USER_EXPLICIT" &&
            "content" in entry &&
            typeof entry.content === "string"
          ) {
            const match = entry.content.match(
              /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/,
            );
            return { prompt: match?.[1] ?? entry.content, cwd, skip: false };
          }
        } catch {
          continue;
        }
      }
    } catch {
      /* Empty context on unavailable transcript. */
    }
  }
  return { prompt: "", cwd, skip: false };
}
export function hookOutput(agent: Agent, result?: RouteResult): object {
  const context = result ? summary(result) : "";
  if (agent === "claude" || agent === "codex")
    return {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: context,
      },
    };
  if (agent === "antigravity")
    return { injectSteps: context ? [{ ephemeralMessage: context }] : [] };
  return {
    context,
    status: result?.status ?? "failed",
    skills:
      result?.selected.map((s) => ({
        name: s.name,
        description: s.description,
        path: s.path,
        categories: s.categories,
        source: s.source.source,
      })) ?? [],
  };
}
export { detectAgent };
