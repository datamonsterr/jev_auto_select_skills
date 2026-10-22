import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { type Config, realPath } from "./config";
import { repoRoot, quote, nativeCompanion } from "./setup";

export interface UpdateOptions {
  check?: boolean;
  dryRun?: boolean;
  ref?: string;
  repoDir?: string;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  runCommand?: (args: string[], cwd: string) => Promise<void>;
}
interface UpdateInfo {
  ref: string;
  installedCommit: string | null;
  remoteCommit: string;
  updateAvailable: boolean;
}
export type UpdateResult =
  | { status: "development"; instructions: string }
  | ({ status: "checked" } & UpdateInfo)
  | ({ status: "dry-run"; steps: string[] } & UpdateInfo)
  | ({ status: "updated"; snapshot: string } & UpdateInfo);

export async function update(
  config: Config,
  options: UpdateOptions = {},
): Promise<UpdateResult> {
  const repo = options.repoDir ?? repoRoot;
  if (fs.existsSync(path.join(repo, ".git")))
    return {
      status: "development",
      instructions: `Development checkout: cd ${quote(repo)} and run git pull.`,
    };
  const ref = options.ref ?? "master";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(ref) || ref.includes(".."))
    throw new Error("invalid update ref");
  const versionFile = path.join(repo, ".otherskill-version");
  let installedCommit: string | null = null;
  if (fs.existsSync(versionFile)) {
    const version = z
      .object({
        commit: z
          .string()
          .regex(/^[a-f0-9]{40}$/)
          .nullable(),
      })
      .safeParse(JSON.parse(fs.readFileSync(versionFile, "utf8")));
    if (!version.success) throw new Error("invalid installed version metadata");
    installedCommit = version.data.commit;
  }
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(
    `https://api.github.com/repos/datamonsterr/jev_auto_select_skills/commits/${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "OtherSkill",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok) throw new Error(`update_commit_http_${response.status}`);
  const remote = z
    .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
    .safeParse(await response.json());
  if (!remote.success) throw new Error("invalid update commit response");
  const info = {
    ref,
    installedCommit,
    remoteCommit: remote.data.sha,
    updateAvailable: installedCommit !== remote.data.sha,
  };
  if (options.check) return { status: "checked", ...info };
  if (!config.agent)
    throw new Error(
      "update requires a configured agent; run otherskill setup first",
    );
  const archiveUrl = `https://codeload.github.com/datamonsterr/jev_auto_select_skills/tar.gz/${remote.data.sha}`;
  const setupArgs = [
    "setup",
    "--non-interactive",
    "--agent",
    config.agent,
    "--scope",
    config.scope,
    "--home",
    config.home,
    "--cwd",
    config.cwd,
    ...(config.configPath ? ["--config", config.configPath] : []),
    ...(fs.existsSync(
      nativeCompanion(
        config.agent,
        config.scope === "global" ? config.home : config.cwd,
      ),
    )
      ? []
      : ["--no-companion"]),
  ];
  const steps = [
    `Download ${archiveUrl} into a new private snapshot`,
    "bun install --frozen-lockfile",
    `bun otherskill.ts ${setupArgs.map(quote).join(" ")}`,
  ];
  if (options.dryRun) return { status: "dry-run", ...info, steps };
  const archiveResponse = await fetchFn(archiveUrl, {
    signal: AbortSignal.timeout(180000),
  });
  if (!archiveResponse.ok)
    throw new Error(`update_archive_http_${archiveResponse.status}`);
  const archive = new Bun.Archive(await archiveResponse.arrayBuffer());
  const entries = await archive.files();
  const wrapper = entries.keys().next().value?.split("/")[0];
  if (
    !wrapper ||
    wrapper === "." ||
    wrapper === ".." ||
    [...entries.keys()].some((name) => !name.startsWith(`${wrapper}/`))
  )
    throw new Error("invalid update archive root");
  for (const file of ["package.json", "bun.lock", "otherskill.ts"])
    if (!entries.has(`${wrapper}/${file}`))
      throw new Error(`update archive is missing ${file}`);
  const installs = path.join(config.home, ".local/share/otherskill/installs");
  if (realPath(installs) !== path.resolve(installs))
    throw new Error("refusing update through symlink paths");
  fs.mkdirSync(installs, { recursive: true, mode: 0o700 });
  const snapshot = fs.mkdtempSync(path.join(installs, "release."));
  const runCommand =
    options.runCommand ??
    (async (args: string[], cwd: string) => {
      const child = Bun.spawn(args, {
        cwd,
        env: {
          ...process.env,
          HOME: config.home,
          OTHERSKILL_HOME: config.home,
        },
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      if ((await child.exited) !== 0)
        throw new Error("update subprocess failed");
    });
  let retain = false;
  try {
    // Bun validates paths and symlink targets during extraction. Preserve file modes.
    await archive.extract(snapshot);
    const extracted = path.join(snapshot, wrapper);
    for (const name of fs.readdirSync(extracted))
      fs.renameSync(path.join(extracted, name), path.join(snapshot, name));
    fs.rmdirSync(extracted);
    await runCommand(
      [process.execPath, "install", "--frozen-lockfile"],
      snapshot,
    );
    fs.writeFileSync(
      path.join(snapshot, ".otherskill-version"),
      `${JSON.stringify(
        { commit: remote.data.sha, ref, installedAt: new Date().toISOString() },
        null,
        2,
      )}\n`,
    );
    // Setup can persist references before a later failure; keep that snapshot for recovery.
    retain = true;
    await runCommand(
      [process.execPath, path.join(snapshot, "otherskill.ts"), ...setupArgs],
      config.cwd,
    );
    return { status: "updated", ...info, snapshot };
  } catch {
    throw new Error(
      retain
        ? `update setup failed; source retained at ${snapshot}`
        : "update installation failed; previous installation retained",
    );
  } finally {
    if (!retain) fs.rmSync(snapshot, { recursive: true, force: true });
  }
}
