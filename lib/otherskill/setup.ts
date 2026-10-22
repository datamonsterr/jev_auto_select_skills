import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import {
  type Config,
  nativePaths,
  overlaps,
  realPath,
  auditNativeExposure,
} from "./config";
export const agents = ["claude", "codex", "antigravity", "opencode"] as const;
export type Agent = (typeof agents)[number];
export function agentName(value: string): Agent {
  if (value === "agy") return "antigravity";
  if (agents.includes(value as Agent)) return value as Agent;
  throw new Error(
    "unsupported agent; choose claude, codex, antigravity, opencode",
  );
}
export function detectAgent(
  env: NodeJS.ProcessEnv = process.env,
): Agent | undefined {
  if (env.CLAUDE_CODE || env.CLAUDE_PLUGIN_ROOT) return "claude";
  if (env.CODEX_THREAD_ID || env.CODEX) return "codex";
  if (env.ANTIGRAVITY || env.GEMINI_CLI) return "antigravity";
  if (env.OPENCODE || env.OPENCODE_VERSION) return "opencode";
}
export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function quote(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error("invalid command path");
  return "'" + value.replaceAll("'", "'\\''") + "'";
}
export function launcherPath(home: string): string {
  return path.join(home, ".local/share/otherskill/bin/otherskill");
}
export function hookFile(
  agent: Agent,
  root: string,
  scope: "global" | "project",
): string {
  if (agent === "claude") return path.join(root, ".claude/settings.json");
  if (agent === "codex") return path.join(root, ".codex/hooks.json");
  if (agent === "antigravity")
    return path.join(
      root,
      scope === "global" ? ".gemini/config/hooks.json" : ".agents/hooks.json",
    );
  return path.join(
    root,
    scope === "global"
      ? ".config/opencode/plugins/otherskill.ts"
      : ".opencode/plugins/otherskill.ts",
  );
}
export function nativeCompanion(agent: Agent, root: string): string {
  return path.join(
    root,
    agent === "claude"
      ? ".claude/skills/use-otherskill"
      : ".agents/skills/use-otherskill",
    "SKILL.md",
  );
}
function objectFile(file: string): Record<string, unknown> {
  if (!fs.existsSync(file)) return {};
  try {
    return z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch {
    throw new Error("refusing to overwrite malformed native configuration");
  }
}
function record(value: unknown): Record<string, unknown> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success)
    throw new Error("refusing malformed native hook configuration");
  return parsed.data;
}
function assertRealTarget(file: string): void {
  if (realPath(file) !== path.resolve(file))
    throw new Error("refusing installation through symlink paths");
}
export interface SetupPlan {
  agent: Agent;
  scope: "global" | "project";
  root: string;
  files: Array<{ path: string; content: string; mode?: number }>;
  command: string;
  companion: boolean;
}
export function planSetup(
  config: Config,
  agent: Agent,
  options: {
    scope?: "global" | "project";
    projectRoot?: string;
    repoDir?: string;
    companion?: boolean;
  } = {},
): SetupPlan {
  auditNativeExposure(config);
  const scope = options.scope ?? config.scope;
  const root =
    scope === "global"
      ? config.home
      : path.resolve(options.projectRoot ?? config.cwd);
  const repo = path.resolve(options.repoDir ?? repoRoot);
  const launcher = launcherPath(config.home);
  const cli = path.join(repo, "otherskill.ts");
  if (!fs.existsSync(cli)) throw new Error("OtherSkill CLI source not found");
  const files: SetupPlan["files"] = [];
  const launcherContent = `#!/bin/sh\n# OtherSkill managed launcher\nexec ${quote(process.execPath)} ${quote(cli)} "$@"\n`;
  if (
    fs.existsSync(launcher) &&
    !fs.readFileSync(launcher, "utf8").includes("# OtherSkill managed launcher")
  )
    throw new Error("refusing unrelated launcher collision");
  files.push({ path: launcher, content: launcherContent, mode: 0o755 });
  const commandArgs = [
    launcher,
    "find",
    "--agent",
    agent,
    "--home",
    config.home,
    ...(scope === "project" ||
    (config.configPath &&
      config.configPath !==
        path.join(config.home, ".config/otherskill/otherskill.config.json"))
      ? [
          "--config",
          config.configPath ?? path.join(root, "otherskill.config.json"),
        ]
      : []),
  ];
  // Native payloads travel on stdin; no interpolation of prompt text into a shell command.
  const command = commandArgs.map(quote).join(" ");
  const hook = hookFile(agent, root, scope);
  if (agent === "opencode") {
    const module = pathToFileURL(
      path.join(repo, "plugins/otherskill-opencode.ts"),
    ).href;
    const plugin = `// OtherSkill managed adapter\nimport {createOpenCodePlugin} from ${JSON.stringify(module)};\nexport const OtherSkill = async ({directory}:{directory:string}) => createOpenCodePlugin({command:${JSON.stringify(commandArgs)},cwd:directory});\n`;
    if (
      fs.existsSync(hook) &&
      !fs.readFileSync(hook, "utf8").startsWith("// OtherSkill managed adapter")
    )
      throw new Error("refusing unrelated OpenCode adapter collision");
    // Validate existing config, even though the auto-discovery adapter does not need to edit it.
    for (const configPath of [
      path.join(
        root,
        scope === "global" ? ".config/opencode/opencode.json" : "opencode.json",
      ),
      path.join(root, ".opencode/opencode.json"),
    ]) {
      const existing = objectFile(configPath);
      const skills =
        existing.skills === undefined ? {} : record(existing.skills);
      if (
        Array.isArray(skills.paths) &&
        skills.paths.some(
          (p) =>
            typeof p === "string" &&
            overlaps(config.bankPath, path.resolve(root, p)),
        )
      )
        throw new Error(
          "bank is exposed by native OpenCode skills.paths; remove that exposure before setup",
        );
    }
    files.push({ path: hook, content: plugin });
  } else {
    const data = objectFile(hook);
    const handler = {
      type: "command",
      command,
      timeout: 60,
      ...(agent === "codex" ? { additionalContextLimit: 100000 } : {}),
    };
    if (agent === "antigravity") {
      const old = data.otherskill;
      if (old !== undefined) {
        const group = record(old);
        if (
          !Array.isArray(group.PreInvocation) ||
          group.PreInvocation.some(
            (h) =>
              !h ||
              typeof h !== "object" ||
              !String((h as Record<string, unknown>).command).startsWith(
                quote(launcher) + " 'find' '--agent' 'antigravity'",
              ),
          )
        )
          throw new Error("refusing unrelated Antigravity hook collision");
      }
      data.otherskill = { PreInvocation: [handler] };
    } else {
      const hooks = data.hooks === undefined ? {} : record(data.hooks);
      const groups = hooks.UserPromptSubmit ?? [];
      if (!Array.isArray(groups))
        throw new Error("refusing malformed UserPromptSubmit hooks");
      // Keep all unrelated groups/handlers, including unknown valid extension fields.
      const kept = groups
        .map((group) => {
          const entry = record(group);
          if (!Array.isArray(entry.hooks))
            throw new Error("refusing malformed native hook group");
          return {
            ...entry,
            hooks: entry.hooks.filter((h) => {
              const hook = record(h);
              if (typeof hook.command !== "string") return true;
              return !hook.command.startsWith(
                quote(launcher) + " 'find' '--agent' " + quote(agent),
              );
            }),
          };
        })
        .filter((entry) => entry.hooks.length > 0);
      hooks.UserPromptSubmit = [...kept, { hooks: [handler] }];
      data.hooks = hooks;
    }
    files.push({ path: hook, content: JSON.stringify(data, null, 2) + "\n" });
  }
  const companion = options.companion ?? true;
  if (companion) {
    const source = path.join(
      repo,
      "examples/polly/skills/use-otherskill/SKILL.md",
    );
    const content = fs.readFileSync(source, "utf8");
    const target = nativeCompanion(agent, root);
    if (fs.existsSync(target) && fs.readFileSync(target, "utf8") !== content)
      throw new Error("refusing to overwrite modified native companion");
    files.push({ path: target, content });
  }
  for (const file of files) {
    assertRealTarget(file.path);
    if (overlaps(config.bankPath, file.path))
      throw new Error("bank overlaps installation paths");
  }
  for (const native of nativePaths(root))
    if (overlaps(config.bankPath, native))
      throw new Error("bank overlaps native discovery");
  return { agent, scope, root, files, command, companion };
}
export function applySetup(plan: SetupPlan, dryRun = false): void {
  if (dryRun) return;
  for (const file of plan.files) {
    assertRealTarget(file.path);
    fs.mkdirSync(path.dirname(file.path), { recursive: true });
    if (
      !fs.existsSync(file.path) ||
      fs.readFileSync(file.path, "utf8") !== file.content
    )
      fs.writeFileSync(file.path, file.content, { mode: file.mode ?? 0o644 });
    if (file.mode) fs.chmodSync(file.path, file.mode);
  }
}
export function setup(
  config: Config,
  agent: Agent,
  options: Parameters<typeof planSetup>[2] & { dryRun?: boolean } = {},
): SetupPlan {
  const plan = planSetup(config, agent, options);
  applySetup(plan, options.dryRun);
  return plan;
}

export function inspectInstallation(
  config: Config,
  agent: Agent,
): {
  agent: Agent;
  hook: string;
  configured: boolean;
  companion: boolean;
  diagnostics: string[];
} {
  const root = config.scope === "global" ? config.home : config.cwd;
  const hook = hookFile(agent, root, config.scope);
  const launcher = launcherPath(config.home);
  const diagnostics: string[] = [];
  const content = fs.existsSync(hook) ? fs.readFileSync(hook, "utf8") : "";
  const expected =
    agent === "opencode"
      ? JSON.stringify([launcher, "find", "--agent", agent]).slice(0, -1)
      : [launcher, "find", "--agent", agent].map(quote).join(" ");
  let configured = content.includes(expected);
  if (content.includes("otherskill") && !configured)
    diagnostics.push("hook_installation_path_or_agent_mismatch");
  if (
    content.includes("jev-skill-selector") ||
    content.includes("hooks/claude.ts") ||
    content.includes("hooks/codex.ts")
  )
    diagnostics.push("legacy_routing_hook_present");
  if (configured) {
    const launcherContent = fs.existsSync(launcher)
      ? fs.readFileSync(launcher, "utf8")
      : "";
    if (
      !launcherContent.includes("# OtherSkill managed launcher") ||
      !launcherContent.includes(quote(path.join(repoRoot, "otherskill.ts")))
    ) {
      configured = false;
      diagnostics.push("launcher_source_path_mismatch_or_missing");
    }
  }
  return {
    agent,
    hook,
    configured,
    companion: fs.existsSync(nativeCompanion(agent, root)),
    diagnostics,
  };
}
