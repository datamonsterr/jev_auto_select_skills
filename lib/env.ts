import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { dirnameCompat } from "./compat";

/**
 * Automatically discover and load environment variables from candidate .env files
 * across the active workspace, the jev-skill-selector repo, and user home directories.
 */
export function loadEnvironment(options: { cwd?: string; workspacePaths?: string[] } = {}): void {
  const home = os.homedir();
  const cwd = options.cwd || process.cwd();
  const scriptDir = path.resolve(dirnameCompat(import.meta), "..");

  const candidates = [
    // 1. Current workspace / working directory .env
    path.resolve(cwd, ".env"),
    // 2. Any explicit workspace paths (e.g. from Antigravity)
    ...(options.workspacePaths?.map((w) => path.resolve(w, ".env")) || []),
    // 3. Jev Skill Selector installation repository .env
    path.resolve(scriptDir, ".env"),
    // 4. Gemini / Antigravity config .env
    path.join(home, ".gemini", "config", ".env"),
    // 5. OpenCode config .env
    path.join(home, ".config", "opencode", ".env"),
    // 6. Codex home .env
    path.join(home, ".codex", ".env"),
    // 7. Global user .env
    path.join(home, ".env"),
  ];

  for (const filePath of candidates) {
    if (!filePath || !fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eqIdx = line.indexOf("=");
        if (eqIdx > 0) {
          const key = line.slice(0, eqIdx).trim();
          let val = line.slice(eqIdx + 1).trim();
          if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
          ) {
            val = val.slice(1, -1);
          }
          // Do not overwrite existing process.env values
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    } catch {
      // Ignore reading errors for non-readable files
    }
  }
}
