import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { realPath } from "./config";
const schema = z.object({ openrouter: z.string().min(1) }).strict();
export function credentialPath(home: string): string {
  return path.join(home, ".config/otherskill/credentials.json");
}
function privatePath(file: string): void {
  if (realPath(file) !== path.resolve(file))
    throw new Error("credential path must not contain symlinks");
}
export function readKey(home: string): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = credentialPath(home);
  if (!fs.existsSync(file)) return undefined;
  privatePath(file);
  if (process.platform !== "win32" && (fs.statSync(file).mode & 0o077) !== 0)
    throw new Error("credential file must have mode 0600");
  const parsed = schema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error("invalid private credential file");
  return parsed.data.openrouter;
}
export function saveKey(home: string, key: string, dryRun = false): void {
  if (!key.trim() || /[\r\n\0]/.test(key))
    throw new Error("invalid credential input");
  const file = credentialPath(home);
  privatePath(file);
  if (fs.existsSync(file))
    schema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify({ openrouter: key }), {
      mode: 0o600,
    });
    fs.chmodSync(file, 0o600);
  }
}
