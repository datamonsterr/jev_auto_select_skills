#!/usr/bin/env bun
/** Deprecated programmatic setup names delegate to non-destructive OtherSkill setup. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { loadConfig } from "../lib/otherskill/config";
import {
  agentName,
  setup,
  hookFile,
  nativeCompanion,
  launcherPath,
  repoRoot,
  type Agent,
} from "../lib/otherskill/setup";
export interface SetupOptions {
  repoDir?: string;
  homeDir?: string;
  projectRoot?: string;
  scope?: "global" | "project";
  dryRun?: boolean;
  hooksOnly?: boolean;
  skillOnly?: boolean;
  silent?: boolean;
}
export interface SetupResult {
  target: string;
  success: boolean;
  hookConfigured: boolean;
  skillInstalled: boolean;
  pluginConfigured?: boolean;
  filesModified: string[];
}
export const getRepoDir = (custom?: string) => path.resolve(custom ?? repoRoot);
export const getHomeDir = (custom?: string) =>
  path.resolve(custom ?? os.homedir());
function configure(agent: Agent, options: SetupOptions = {}): SetupResult {
  const config = loadConfig({
    home: getHomeDir(options.homeDir),
    cwd: options.projectRoot ?? getRepoDir(options.repoDir),
  });
  const plan = setup(config, agent, {
    repoDir: getRepoDir(options.repoDir),
    scope: options.scope ?? "global",
    companion: !options.hooksOnly,
    dryRun: true,
  });
  if (options.skillOnly)
    plan.files = plan.files.filter(
      (f) => f.path === nativeCompanion(agent, plan.root),
    );
  const { applySetup } =
    require("../lib/otherskill/setup") as typeof import("../lib/otherskill/setup");
  applySetup(plan, options.dryRun);
  return {
    target: agent === "antigravity" ? "agy" : agent,
    success: true,
    hookConfigured: !options.skillOnly,
    skillInstalled: !options.hooksOnly,
    pluginConfigured: agent === "opencode",
    filesModified: plan.files.map((f) => f.path),
  };
}
export const setupClaude = (options: SetupOptions = {}) =>
  configure("claude", options);
export const setupCodex = (options: SetupOptions = {}) =>
  configure("codex", options);
export const setupAntigravity = (options: SetupOptions = {}) =>
  configure("antigravity", options);
export const setupOpenCode = (options: SetupOptions = {}) =>
  configure("opencode", options);
export const setupAll = (options: SetupOptions = {}) => [
  setupClaude(options),
  setupCodex(options),
  setupAntigravity(options),
  setupOpenCode(options),
];
export function checkAgentStatus(options: SetupOptions = {}) {
  const home = getHomeDir(options.homeDir),
    scope = options.scope ?? "global",
    root =
      scope === "global"
        ? home
        : (options.projectRoot ?? getRepoDir(options.repoDir));
  const status = (agent: Agent) => {
    const file = hookFile(agent, root, scope);
    return {
      hook:
        fs.existsSync(file) &&
        fs.readFileSync(file, "utf8").includes(launcherPath(home)),
      skill: fs.existsSync(nativeCompanion(agent, root)),
    };
  };
  return {
    claude: status("claude"),
    codex: status("codex"),
    agy: status("antigravity"),
    opencode: status("opencode"),
  };
}
export function runSetupCli(args: string[] = []) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      status: { type: "boolean" },
      "dry-run": { type: "boolean" },
      "hooks-only": { type: "boolean" },
      "skill-only": { type: "boolean" },
      home: { type: "string" },
      cwd: { type: "string" },
    },
  });
  if (values.help) {
    console.log("Deprecated: use otherskill setup --help");
    return;
  }
  const options: SetupOptions = {
    homeDir: values.home,
    projectRoot: values.cwd,
    dryRun: values["dry-run"],
    hooksOnly: values["hooks-only"],
    skillOnly: values["skill-only"],
  };
  if (values.status) {
    console.log(JSON.stringify(checkAgentStatus(options)));
    return;
  }
  const target = positionals[0];
  if (!target)
    throw new Error(
      "Use otherskill setup for the interactive menu, or specify an agent",
    );
  if (target === "all") return setupAll(options);
  let agent: Agent;
  try {
    agent = agentName(target);
  } catch {
    throw new Error("Unknown agent target");
  }
  return [configure(agent, options)];
}
if (import.meta.main) {
  const { main } = await import("../otherskill");
  process.exitCode = await main(["setup", ...process.argv.slice(2)]);
}
