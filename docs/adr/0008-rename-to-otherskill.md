# 0008: Rename to OtherSkill

Status: accepted

## Context

The project began as "Jev Skill Selector" (`skill_selector`, `jev-skill-selector`, repo `jev_auto_select_skills`). `otherskill` is already the canonical CLI, but old names remained in the package, docs, identifiers and env vars.

## Decision

- Repo is `datamonsterr/other-skill`; package name is `other-skill`; the bundled skill is `skills/otherskill` with `name: otherskill`.
- Jev-prefixed TypeScript names became neutral (`DecisionProvider`, `DecisionState`, `DecisionRequest`, `DecisionResponse`, `DecisionChoiceQuestion`, `DecisionChoiceAnswer`, `DEFAULT_DECISION_MODEL`, `buildDecisionInstructions`, `compactUserPromptForDecision`, `OtherSkillOptions`). `index.ts` re-exports the old names as `@deprecated` aliases so library consumers keep working.
- Bins `skill_selector` and `jev-skill-selector` stay in `package.json` as deprecated aliases so existing installs and scripts keep running.
- Env vars: `OTHERSKILL_MODEL`, `OTHERSKILL_BANK_PATH`, `OTHERSKILL_GLOBAL_SKILLS_PATH`, `OTHERSKILL_AGENT_SKILLS_PATH` are primary. Each is read first; the legacy `SKILL_SELECTOR_*` name (and `JEV_MODEL`, after `MODEL`, for the model) is read only when the new one is unset. Free-model enforcement is unchanged.
- Kept on purpose: legacy detection and migration lists (`lib/migrate.ts`, setup hook detection of `skill_selector` / `jev-skill-selector`), legacy bank paths `.agents/jev_skills`, `JEV_API_KEY`, the migrate backup dir `~/.local/state/skill-selector`, and external names (OpenRouter `~typesafe/jev-latest`, openrouter.ai Jev tutorial URL, the external Jev/Decisions skill in `docs/project-skills.md`).

## Consequences

Old env vars, bins and library imports still work but are deprecated. Removal of the aliases and legacy names needs a later major version.
