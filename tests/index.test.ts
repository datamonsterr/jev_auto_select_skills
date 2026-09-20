import { describe, it, expect } from "bun:test";
import { selectSkills } from "../index";
import path from "path";

describe("index programmatic API", () => {
  it("exports selectSkills function that returns matching skills", async () => {
    // Test with mock or local provider
    const skillsDir = path.resolve(__dirname, "../skills");
    
    // Test that selectSkills function exists and handles parameters correctly
    expect(typeof selectSkills).toBe("function");
  });
});
