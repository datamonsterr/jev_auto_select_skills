import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { type Config, FREE_MODEL } from "./config";
import { agentName, type Agent } from "./setup";
export interface MenuResult {
  agent: Agent;
  scope: "global" | "project";
  model: string;
  enabledCategories: string[];
  key?: string;
  companion: boolean;
  apply: boolean;
}
export async function menu(
  config: Config,
  kind: "setup" | "config",
): Promise<MenuResult> {
  if (!process.stdin.isTTY)
    throw new Error(
      "interactive menu requires a terminal; use --non-interactive and flags",
    );
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stderr.write(chunk);
      callback();
    },
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  const ask = async (question: string, secret = false) => {
    if (!secret) return (await rl.question(question)).trim();
    process.stderr.write(question);
    muted = true;
    try {
      return (await rl.question("")).trim();
    } finally {
      muted = false;
      process.stderr.write("\n");
    }
  };
  try {
    process.stderr.write(`OtherSkill ${kind} menu\n`);
    const choice = await ask(
      `Harness: 1 Claude, 2 Codex, 3 Antigravity, 4 OpenCode [${config.agent ?? "claude"}]: `,
    );
    const agent = agentName(
      (
        {
          "1": "claude",
          "2": "codex",
          "3": "antigravity",
          "4": "opencode",
        } as Record<string, string>
      )[choice] ??
        (choice || config.agent || "claude"),
    );
    const scopeChoice = await ask(
      `Hook scope: 1 global, 2 project [${config.scope}]: `,
    );
    const scope =
      scopeChoice === "2" || scopeChoice === "project"
        ? "project"
        : scopeChoice === "1" || scopeChoice === "global"
          ? "global"
          : scopeChoice === ""
            ? config.scope
            : undefined;
    if (!scope) throw new Error("invalid scope");
    const key = await ask(
      "OpenRouter API key (hidden, blank keeps existing): ",
      true,
    );
    const model =
      (await ask(`Free decision model [${config.model || FREE_MODEL}]: `)) ||
      config.model;
    process.stderr.write(
      "Categories:\n" +
        config.categories
          .map((c, i) => `  ${i + 1}. ${c.id}: ${c.description}`)
          .join("\n") +
        "\n",
    );
    const categoryInput = await ask(
      `Enabled categories: comma-separated numbers or IDs [${(config.enabledCategories ?? config.categories.map((c) => c.id)).join(",")}]: `,
    );
    const enabledCategories = categoryInput
      ? categoryInput.split(",").map((s) => {
          const value = s.trim();
          return /^\d+$/.test(value)
            ? (config.categories[Number(value) - 1]?.id ?? value)
            : value;
        })
      : (config.enabledCategories ?? config.categories.map((c) => c.id));
    const companion =
      (
        await ask("Install native use-otherskill companion? [Y/n]: ")
      ).toLowerCase() !== "n";
    const apply =
      (
        await ask(
          kind === "setup"
            ? "Apply setup? [Y/n]: "
            : "Save and apply settings/hooks? [Y/n]: ",
        )
      ).toLowerCase() !== "n";
    return {
      agent,
      scope,
      key: key || undefined,
      model,
      enabledCategories,
      companion,
      apply,
    };
  } finally {
    rl.close();
  }
}
