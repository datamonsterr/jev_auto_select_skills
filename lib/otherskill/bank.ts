import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import yaml from "yaml";
import { z } from "zod";
import { type Config, overlaps, realPath, assertHiddenBank } from "./config";

const metadataSchema = z.object({
  version: z.literal(1),
  logicalId: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.string(),
  ref: z.string().optional(),
  revision: z.string().optional(),
  category: z.string(),
  installedAt: z.string(),
});
export type Metadata = z.infer<typeof metadataSchema>;
export interface BankSkill {
  name: string;
  description: string;
  path: string;
  category: string;
  logicalId: string;
  instanceId: string;
  source: Metadata;
}
const metaFile = ".otherskill.json";
export function readSkill(dir: string): { name: string; description: string } {
  const content = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match?.[1])
    throw new Error(
      "skill requires YAML frontmatter with name and description",
    );
  let frontmatter: unknown;
  try {
    frontmatter = yaml.parse(match[1]);
  } catch {
    throw new Error("invalid skill frontmatter");
  }
  const parsed = z
    .object({ name: z.string().min(1), description: z.string().min(1) })
    .safeParse(frontmatter);
  if (!parsed.success)
    throw new Error("skill requires nonempty name and complete description");
  if (/[\x00-\x1f]/.test(parsed.data.name))
    throw new Error("invalid skill name");
  return parsed.data;
}
function validateTree(dir: string): void {
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink())
    throw new Error(
      "source/destination symlinks are not supported; provide a real skill tree",
    );
  if (stat.isDirectory())
    for (const name of fs.readdirSync(dir)) {
      if (name === ".git") continue;
      validateTree(path.join(dir, name));
    }
  else if (!stat.isFile())
    throw new Error(
      "skill tree must contain only regular files and directories",
    );
}
function insideNoLinks(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("destination escapes bank");
  let cursor = root;
  // Check every ancestor too, so a broken or native-bound bank alias cannot be followed.
  const parts = path.resolve(target).split(path.sep).filter(Boolean);
  cursor = path.parse(path.resolve(target)).root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    {
      try {
        if (fs.lstatSync(cursor).isSymbolicLink())
          throw new Error("destination symlinks are not supported");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }
}
export function createSkill(
  dir: string,
  name: string,
  description: string,
  instructions: string,
): string {
  if (
    !/^[a-z0-9][a-z0-9_-]*$/.test(name) ||
    !description.trim() ||
    !instructions.trim()
  )
    throw new Error(
      "create requires a safe slug, description and instructions",
    );
  if (fs.existsSync(dir)) throw new Error("create destination already exists");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    "---\n" +
      yaml.stringify({ name, description }) +
      "---\n\n" +
      instructions +
      "\n",
  );
  return path.resolve(dir);
}
export function discoverBank(config: Config): BankSkill[] {
  assertHiddenBank(config.bankPath, config.home, config.cwd);
  const skills: BankSkill[] = [];
  for (const category of config.categories) {
    const dir = path.join(config.bankPath, category.id);
    insideNoLinks(config.bankPath, dir);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const folder = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("bank contains symlink");
      if (
        entry.name.startsWith(".") ||
        !entry.isDirectory() ||
        !fs.existsSync(path.join(folder, "SKILL.md"))
      )
        continue;
      validateTree(folder);
      let metadata: Metadata;
      try {
        metadata = metadataSchema.parse(
          JSON.parse(fs.readFileSync(path.join(folder, metaFile), "utf8")),
        );
      } catch {
        throw new Error(
          "invalid or missing bank provenance; import skills with install/classify",
        );
      }
      if (metadata.category !== category.id)
        throw new Error("bank category provenance mismatch");
      const skill = readSkill(folder);
      skills.push({
        ...skill,
        path: path.join(folder, "SKILL.md"),
        category: category.id,
        logicalId: metadata.logicalId,
        instanceId: `${category.id}::${entry.name}`,
        source: metadata,
      });
    }
  }
  return skills;
}
export function installLocal(
  config: Config,
  sourceDir: string,
  categories: string[],
  origin?: {
    source: string;
    ref?: string;
    revision?: string;
    licenseRoot?: string;
  },
): BankSkill[] {
  assertHiddenBank(config.bankPath, config.home, config.cwd);
  const source = path.resolve(sourceDir);
  validateTree(source);
  const skill = readSkill(source);
  const ids = [...new Set(categories)];
  if (
    !ids.length ||
    ids.some((id) => !config.categories.some((c) => c.id === id))
  )
    throw new Error("classification requires known configured category IDs");
  let previous: Metadata | undefined;
  if (fs.existsSync(path.join(source, metaFile))) {
    try {
      previous = metadataSchema.parse(
        JSON.parse(fs.readFileSync(path.join(source, metaFile), "utf8")),
      );
    } catch {
      throw new Error("invalid reserved .otherskill.json provenance");
    }
  }
  // Only reuse metadata from our own bank; external authors cannot claim another source identity.
  const inBank = realPath(source).startsWith(
    realPath(config.bankPath) + path.sep,
  );
  if (previous && !inBank)
    throw new Error("external source contains reserved OtherSkill provenance");
  const sourceId =
    origin?.source ?? previous?.source ?? `file://${realPath(source)}`;
  const logicalId =
    previous?.logicalId ?? createHash("sha256").update(sourceId).digest("hex");
  const slug =
    skill.name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .slice(0, 60) || "skill";
  const folderName = slug + "--" + logicalId.slice(0, 16);
  const targets = ids.map((category) => ({
    category,
    target: path.join(config.bankPath, category, folderName),
  }));
  for (const { target } of targets) {
    insideNoLinks(config.bankPath, target);
    if (overlaps(source, target) && realPath(source) !== realPath(target))
      throw new Error("source and destination overlap");
    if (fs.existsSync(target)) {
      const existing = metadataSchema.safeParse(
        JSON.parse(fs.readFileSync(path.join(target, metaFile), "utf8")),
      );
      if (!existing.success || existing.data.logicalId !== logicalId)
        throw new Error("refusing to overwrite an unrelated bank directory");
    }
  }
  // Stage every complete copy before replacing any owned target.
  const staging: Array<{
    stage: string;
    target: string;
    backup: string;
    committed: boolean;
  }> = [];
  try {
    for (const { category, target } of targets) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const stage = path.join(path.dirname(target), ".import-" + randomUUID());
      const backup = stage + "-backup";
      staging.push({ stage, target, backup, committed: false });
      fs.cpSync(source, stage, {
        recursive: true,
        preserveTimestamps: true,
        filter: (p) => path.basename(p) !== ".git",
      });
      if (origin?.licenseRoot)
        for (const file of fs.readdirSync(origin.licenseRoot)) {
          if (
            /^(LICENSE|LICENCE|COPYING|NOTICE)(\..*)?$/i.test(file) &&
            fs.statSync(path.join(origin.licenseRoot, file)).isFile() &&
            !fs.existsSync(path.join(stage, file))
          )
            fs.copyFileSync(
              path.join(origin.licenseRoot, file),
              path.join(stage, file),
            );
        }
      const metadata: Metadata = {
        version: 1,
        logicalId,
        source: sourceId,
        ref: origin?.ref ?? previous?.ref,
        revision: origin?.revision ?? previous?.revision,
        category,
        installedAt: new Date().toISOString(),
      };
      fs.writeFileSync(
        path.join(stage, metaFile),
        JSON.stringify(metadata, null, 2) + "\n",
      );
    }
    for (const item of staging) {
      if (fs.existsSync(item.target)) fs.renameSync(item.target, item.backup);
      try {
        fs.renameSync(item.stage, item.target);
        item.committed = true;
      } catch (error) {
        if (fs.existsSync(item.backup)) fs.renameSync(item.backup, item.target);
        throw error;
      }
    }
  } catch (error) {
    for (const item of [...staging].reverse()) {
      if (item.committed)
        fs.rmSync(item.target, { recursive: true, force: true });
      if (fs.existsSync(item.backup)) fs.renameSync(item.backup, item.target);
    }
    throw error;
  } finally {
    for (const item of staging) {
      fs.rmSync(item.stage, { recursive: true, force: true });
      fs.rmSync(item.backup, { recursive: true, force: true });
    }
  }
  return discoverBank(config).filter(
    (s) => s.logicalId === logicalId && ids.includes(s.category),
  );
}

function git(args: string[], cwd?: string): string {
  const result = Bun.spawnSync(
    ["git", "-c", "core.hooksPath=/dev/null", ...args],
    {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout: 60000,
    },
  );
  if (result.exitCode !== 0)
    throw new Error(
      "GitHub source operation failed; check source/ref and access",
    );
  return result.stdout.toString().trim();
}
export function parseOnlineSource(
  source: string,
  ref?: string,
  subpath?: string,
): { repo: string; ref?: string; subpath?: string } {
  const match = source.match(
    /^(?:https:\/\/(?:github\.com|skills\.sh)\/|github:)([\w.-]+)\/([\w.-]+)(?:\/(.*))?$/,
  );
  if (!match?.[1] || !match[2])
    throw new Error(
      "online source must be https://github.com/owner/repo, github:owner/repo or https://skills.sh/owner/repo/skill",
    );
  const repo = `https://github.com/${match[1]}/${match[2].replace(/\.git$/, "")}`;
  let tail = match[3];
  if (tail?.startsWith("tree/")) {
    const parts = tail.slice(5).split("/");
    ref ??= parts.shift();
    tail = parts.join("/");
  }
  subpath ??= tail;
  if (
    ref &&
    (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref) ||
      ref.includes("..") ||
      ref.includes("//"))
  )
    throw new Error("invalid source ref");
  if (
    subpath &&
    (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(subpath) ||
      subpath.split("/").some((p) => p === ".." || p === "."))
  )
    throw new Error("invalid source skill path");
  return { repo, ref, subpath };
}
export async function withOnlineSkill<T>(
  source: string,
  options: { ref?: string; subpath?: string },
  run: (
    dir: string,
    origin: {
      source: string;
      ref?: string;
      revision: string;
      licenseRoot: string;
    },
  ) => Promise<T>,
): Promise<T> {
  const parsed = parseOnlineSource(source, options.ref, options.subpath);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-source-"));
  try {
    git([
      "clone",
      "--depth",
      "1",
      ...(parsed.ref ? ["--branch", parsed.ref] : []),
      "--",
      parsed.repo,
      temp,
    ]);
    let dir = parsed.subpath ? path.join(temp, parsed.subpath) : temp;
    if (
      !fs.existsSync(path.join(dir, "SKILL.md")) &&
      parsed.subpath &&
      !parsed.subpath.includes("/")
    )
      dir = path.join(temp, "skills", parsed.subpath);
    if (!fs.existsSync(path.join(dir, "SKILL.md")))
      throw new Error(
        "source must identify one skill directory containing SKILL.md; use --path",
      );
    if (realPath(dir) !== path.resolve(dir))
      throw new Error("online skill path contains symlink ancestors");
    validateTree(dir);
    const relative = path.relative(temp, dir).split(path.sep).join("/");
    const revision = git(["rev-parse", "HEAD"], temp);
    return await run(dir, {
      source:
        parsed.repo +
        (relative ? "/tree/" + (parsed.ref ?? "HEAD") + "/" + relative : ""),
      ref: parsed.ref ?? "HEAD",
      revision,
      licenseRoot: temp,
    });
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
export async function findOnline(
  query: string,
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>,
): Promise<unknown> {
  if (!query.trim()) throw new Error("search requires a query");
  const q = `${query} path:SKILL.md`;
  let raw: unknown;
  if (fetchFn || process.env.GH_TOKEN) {
    const response = await (fetchFn ?? fetch)(
      "https://api.github.com/search/code?q=" +
        encodeURIComponent(q) +
        "&per_page=20",
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(process.env.GH_TOKEN
            ? { Authorization: `Bearer ${process.env.GH_TOKEN}` }
            : {}),
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new Error(
        `GitHub code search unavailable (HTTP ${response.status}); use gh auth login or GH_TOKEN with code-search access`,
      );
    raw = await response.json();
  } else {
    try {
      const child = Bun.spawn(
        [
          "gh",
          "api",
          "-X",
          "GET",
          "search/code",
          "-f",
          "q=" + q,
          "-f",
          "per_page=20",
        ],
        {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          signal: AbortSignal.timeout(15000),
        },
      );
      const [output] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if ((await child.exited) !== 0) throw new Error();
      raw = JSON.parse(output);
    } catch {
      throw new Error(
        "GitHub code search unavailable; use gh auth login or GH_TOKEN with code-search access",
      );
    }
  }
  const parsed = z
    .object({
      total_count: z.number(),
      items: z.array(
        z.object({
          name: z.string(),
          path: z.string(),
          html_url: z.string(),
          repository: z.object({ full_name: z.string() }),
        }),
      ),
    })
    .safeParse(raw);
  if (!parsed.success) throw new Error("invalid GitHub search response");
  return { source: "GitHub code search (path:SKILL.md)", ...parsed.data };
}
