import { describe, it, expect } from "bun:test";
import { assessSkill } from "../scripts/assess";
import path from "node:path";
import fs from "node:fs";
import { dirnameCompat } from "../lib/compat";

describe("assess.ts skill placement", () => {
  it("classifies task-specific skills as JEV_ROUTED", async () => {
    const result = await assessSkill({
      skillPathOrName: path.resolve(__dirname, "../skills/jev-skill-selector"),
    });

    expect(result.classification).toBe("JEV_ROUTED");
    expect(result.recommendedDir).toContain("jev_skills");
  });

  it("classifies caveman persona skill as ALWAYS_ON", async () => {
    const tmpDir = path.join(dirnameCompat(import.meta), "fixtures", "mock_caveman");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "SKILL.md"),
      `---
name: caveman
description: Ultra terse caveman persona for short answers.
---
# Caveman Mode
Me speak short.
`
    );

    try {
      const result = await assessSkill({
        skillPathOrName: tmpDir,
      });

      expect(result.classification).toBe("ALWAYS_ON");
      expect(result.recommendedDir).toContain(path.join(".agents", "skills", "caveman"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("classifies docker deployment skill as JEV_ROUTED", async () => {
    const tmpDir = path.join(dirnameCompat(import.meta), "fixtures", "mock_docker");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "SKILL.md"),
      `---
name: docker-deploy
description: Deploy multi-container apps using Docker Compose. Use when user asks about docker or containerization.
---
# Docker Deploy
Instructions...
`
    );

    try {
      const result = await assessSkill({
        skillPathOrName: tmpDir,
      });

      expect(result.classification).toBe("JEV_ROUTED");
      expect(result.recommendedDir).toContain(path.join(".agents", "jev_skills", "docker-deploy"));
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
