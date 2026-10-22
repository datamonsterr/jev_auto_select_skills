import { describe, it, expect, mock } from "bun:test";
import plugin from "../plugins/opencode";
import type { Message } from "../plugins/otherskill-opencode";
describe("OpenCode real-turn lifecycle", () => {
  it("requests once per session and real user turn, clears stale content on empty/failure", async () => {
    let mode = "match";
    const select = mock(async () => {
      if (mode === "fail") throw new Error("offline");
      return {
        selectedSkills:
          mode === "empty"
            ? []
            : [
                {
                  name: "tdd",
                  path: "/tmp/tdd/SKILL.md",
                  probability: 1,
                  confidence: 1,
                },
              ],
      };
    });
    const transform = plugin({ selectSkillsFn: select }).hooks[
      "experimental.chat.messages.transform"
    ];
    const output: { messages: Message[] } = {
      messages: [
        {
          info: { role: "user", id: "u1", sessionID: "s1" },
          parts: [{ type: "text", text: "same prompt" }],
        },
      ],
    };
    const ownParts = () =>
      output.messages
        .flatMap((m) => m.parts)
        .filter((p) => p.synthetic && p.id?.startsWith("otherskill-"));
    await Promise.all([transform({}, output), transform({}, output)]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(ownParts()).toHaveLength(1);
    await transform({}, output);
    expect(ownParts()).toHaveLength(1);
    mode = "empty";
    output.messages.push({
      info: { role: "user", id: "u2", sessionID: "s1" },
      parts: [{ type: "text", text: "same prompt" }],
    });
    await transform({}, output);
    expect(select).toHaveBeenCalledTimes(2);
    expect(ownParts()).toHaveLength(0);
    mode = "fail";
    output.messages[0]!.parts.push({
      type: "text",
      text: "stale",
      synthetic: true,
      id: "otherskill-u1",
    });
    output.messages.push({
      info: { role: "user", id: "u3", sessionID: "s1" },
      parts: [{ type: "text", text: "another prompt" }],
    });
    await transform({}, output);
    await transform({}, output);
    expect(select).toHaveBeenCalledTimes(3);
    expect(ownParts()).toHaveLength(0);
  });
});
