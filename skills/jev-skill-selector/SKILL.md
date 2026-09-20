---
name: jev-skill-selector
description: Use TypeSafe Jev decision model on OpenRouter to dynamically select, filter, and load relevant skills based on user prompt and system instructions. Use this skill as a router/gatekeeper before agent planning or execution.
---

# Jev Skill Selector

This skill provides fast, calibrated skill selection using the TypeSafe Jev System One decision model on OpenRouter (`~typesafe/jev-latest`).

## When to Use

- When an agent harness receives a complex or open-ended user request and needs to decide which specialized skills or tool instructions should be activated from the skills bank.
- In pre-prompt hooks or middleware to reduce context bloat by injecting only the documentation for relevant skills.
- To route software engineering workflows to specialized domain tools (TDD, debugging, GitOps, DB schema design, conventional commits, etc.).

## CLI Usage

Run the selector using Bun:

```bash
bun run index.ts "How do I refactor code using TDD and commit changes?"
```

With specific options:

```bash
bun run index.ts \
  --prompt "Deploy Kubernetes services via GitOps with ArgoCD" \
  --system "You are a senior DevOps engineer" \
  --threshold 0.05 \
  --max-skills 3
```

Output formatted JSON for programmatic integration:

```bash
bun run index.ts --json "Diagnose memory leak and write tests"
```

## Hook Integration

### Unified Auto-Detecting Hook
Agent harnesses can pipe input via stdin:

```bash
echo '{"prompt": "Refactor payment service with red-green-refactor loop"}' | bun run scripts/run-hook.ts
```

### Codex Hook
```bash
echo '{"prompt": "Generate a conventional commit message for staged changes"}' | bun run hooks/codex.ts
```

### Claude Hook
```bash
echo '{"prompt": "Build an accessible data table with shadcn/ui"}' | bun run hooks/claude.ts
```

### OpenCode Plugin
In your OpenCode configuration, register the plugin from `plugins/opencode.ts`:

```typescript
import jevSkillSelectorPlugin from "./plugins/opencode";

export default {
  plugins: [
    jevSkillSelectorPlugin({
      skillsDir: "./skills",
      threshold: 0.05,
    }),
  ],
};
```

## Programmatic TypeScript API

```typescript
import { selectSkills } from "./index";

const result = await selectSkills({
  userPrompt: "Need to run opencode web server and make commits",
  systemPrompt: "Follow conventional commits",
  options: {
    threshold: 0.05,
    maxSkills: 3,
  },
});

console.log(result.primarySkill);
// => "opencode"
console.log(result.selectedSkills);
// => [ { name: "opencode", probability: 0.94, confidence: 0.98 }, ... ]
```
