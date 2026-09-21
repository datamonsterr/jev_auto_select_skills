/**
 * Cross-runtime __dirname compatibility helper.
 * Works in Bun (import.meta.dir), Node ≥21 (import.meta.dirname),
 * and older Node/tsx (fileURLToPath fallback).
 *
 * Usage:
 *   import { dirnameCompat } from "./lib/compat";
 *   const __dir = dirnameCompat(import.meta);
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export function dirnameCompat(meta: ImportMeta): string {
  return (
    (meta as any).dir ??                           // Bun
    (meta as any).dirname ??                        // Node ≥21
    path.dirname(fileURLToPath(meta.url))           // Node <21 / tsx
  );
}
