/**
 * Concise system prompt and question instructions for Jev skill selection
 */

export const DEFAULT_SYSTEM_PROMPT =
  "Decision model: route the user task to the most appropriate specialized skill in the skill bank, or 'none' if no specialized skill applies.";

/**
 * Build concise choice instructions for Jev
 */
export function buildJevInstructions(
  role: "primary" | "secondary" | "followup" | "single" = "single"
): string {
  switch (role) {
    case "primary":
      return "Select the primary skill for the initial phase or main objective, or 'none'.";
    case "secondary":
      return "Select the secondary implementation or testing skill, or 'none'.";
    case "followup":
      return "Select any follow-up verification, documentation, git, or completion skill, or 'none'.";
    case "single":
    default:
      return "Select the most relevant specialized skill for the task, or 'none'.";
  }
}
