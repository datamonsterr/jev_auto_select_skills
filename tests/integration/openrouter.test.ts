import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../lib/otherskill/config";
import { Decisions, classify, route } from "../../lib/otherskill/routing";

const repo = path.resolve(import.meta.dir, "../..");
const fixtureConfig = path.join(repo, "tests/fixtures/e2e-bank/config.json");
const tempDirs: string[] = [];

function config() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-integration-"));
  tempDirs.push(home);
  return loadConfig({ configPath: fixtureConfig, home, cwd: home });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(!process.env.OPENROUTER_API_KEY)("OpenRouter routing integration", () => {
  it("classifies a skill into valid configured category IDs", async () => {
    const current = config();
    const source = fs.mkdtempSync(path.join(os.tmpdir(), "otherskill-classify-"));
    tempDirs.push(source);
    fs.writeFileSync(
      path.join(source, "SKILL.md"),
      "---\nname: api-documentation\ndescription: Document API schemas, request parameters, responses, and errors.\n---\n\n# API documentation\n",
    );

    const selected = await classify(current, source);

    expect(selected.length).toBeGreaterThan(0);
    expect(selected.every((id) => current.categories.some((item) => item.id === id))).toBe(true);
  }, 90000);

  it("selects a fixture skill from a selected category", async () => {
    const current = config();
    const result = await route(
      current,
      "Write isolated unit tests using red-green-refactor for the broken date parser.",
    );

    expect(result.status).toBe("ok");
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories.every((id) => current.categories.some((item) => item.id === id))).toBe(true);
    expect(result.selected.length).toBeGreaterThan(0);
    expect(result.selected.every((skill) => result.categories.includes(skill.category))).toBe(true);
    expect(result.selected.some((skill) => skill.name === "tdd" || skill.name === "unit-testing")).toBe(true);
  }, 90000);

  it("returns a failed route for an invalid credential without throwing", async () => {
    const current = config();
    const result = await route(
      current,
      "Choose a skill for a unit testing request.",
      new Decisions(current, { apiKey: "invalid-test-credential" }),
    );

    expect(result.status).toBe("failed");
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics.some((code) =>
      code === "openrouter_http_401" || code === "openrouter_http_403" ||
      code === "openrouter_network_or_timeout"
    )).toBe(true);
  }, 90000);

  it("returns a failed route after a request timeout without throwing", async () => {
    const current = config();
    current.limits = { ...current.limits, timeoutMs: 100, retries: 0 };
    const provider = new Decisions(current, {
      apiKey: process.env.OPENROUTER_API_KEY,
      fetchFn: () => new Promise<Response>(() => {}),
    });

    const result = await route(current, "Help me write unit tests.", provider);

    expect(result.status).toBe("failed");
    expect(result.diagnostics).toContain("openrouter_network_or_timeout");
  }, 10000);

  it("rejects paid model IDs before making a request", () => {
    const current = config();
    expect(() => new Decisions({ ...current, model: "openai/gpt-4o" })).toThrow(/:free/);
  });
});
