import { z } from "zod";

/**
 * Representation of a skill loaded from a skill bank
 */
export interface Skill {
  name: string;
  description: string;
  whenToUse: string;
  path?: string;
}

/**
 * State object sent to the Jev decision model
 */
export interface JevState {
  user_prompt: string;
  system_prompt?: string;
  skills: Array<{
    name: string;
    description: string;
    when_to_use: string;
  }>;
  context?: Record<string, any>;
}

/**
 * Jev Choice question schema
 */
export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

/**
 * Decisions request payload for OpenRouter alpha decisions API
 */
export interface JevDecisionRequest {
  model: string;
  state: JevState | Record<string, any> | string;
  questions: Record<string, JevChoiceQuestion>;
}

/**
 * Answer for a Choice question from Jev
 */
export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

/**
 * Full response from Jev / OpenRouter decisions API
 */
export interface JevDecisionResponse {
  model: string;
  answers: Record<string, JevChoiceAnswer>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cost?: number;
  };
  id?: string;
  provider?: string;
}

/**
 * A selected skill with calibrated confidence and probability
 */
export interface SelectedSkill {
  name: string;
  confidence: number;
  probability: number;
  description?: string;
  whenToUse?: string;
}

/**
 * Token usage breakdown
 */
export interface UsageMetrics {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  user_prompt_tokens: number;
  system_prompt_tokens: number;
  cost?: number;
}

/**
 * High-level result of skill selection
 */
export interface SkillSelectionResult {
  selectedSkills: SelectedSkill[];
  primarySkill: string | null;
  answers: Record<string, JevChoiceAnswer>;
  usage?: UsageMetrics;
  raw?: JevDecisionResponse;
}

/**
 * Options for configuring skill selection
 */
export interface SkillSelectorOptions {
  model?: string;
  apiKey?: string;
  threshold?: number;
  maxSkills?: number;
  skillsDir?: string;
  systemPrompt?: string;
  includeNone?: boolean;
  retries?: number;
  retryDelayMs?: number;
  multiStep?: boolean | "auto";
}

/**
 * Filter and sort selected skills from a Jev choice answer based on probability threshold
 */
export function filterSelectedSkills(params: {
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
  threshold?: number;
  maxSkills?: number;
  skillMap?: Map<string, Skill>;
}): SelectedSkill[] {
  const { choice, probabilities, confidence, threshold = 0.05, maxSkills = 3, skillMap } = params;

  // Filter out 'none'
  const items: SelectedSkill[] = Object.entries(probabilities)
    .filter(([name, prob]) => name !== "none" && prob >= threshold)
    .map(([name, prob]) => {
      const skill = skillMap?.get(name);
      return {
        name,
        probability: Number(prob.toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        description: skill?.description,
        whenToUse: skill?.whenToUse,
      };
    })
    .sort((a, b) => b.probability - a.probability);

  // If the winning choice was not "none", ensure it is at the front even if probabilities were close
  if (choice && choice !== "none") {
    const winningIdx = items.findIndex((i) => i.name === choice);
    if (winningIdx > 0) {
      const [winningItem] = items.splice(winningIdx, 1);
      items.unshift(winningItem);
    } else if (winningIdx === -1 && probabilities[choice] !== undefined) {
      const skill = skillMap?.get(choice);
      items.unshift({
        name: choice,
        probability: Number(probabilities[choice].toFixed(4)),
        confidence: Number(confidence.toFixed(4)),
        description: skill?.description,
        whenToUse: skill?.whenToUse,
      });
    }
  }

  return items.slice(0, maxSkills);
}

/**
 * Format selected skills into clean markdown summary suitable for injection into hooks
 */
export function formatSkillSummary(skills: SelectedSkill[]): string {
  if (skills.length === 0) {
    return "No specialized skills required for this request.";
  }

  const lines = [
    "### Recommended Agent Skills",
    "The following specialized skills have been selected for this task:",
    "",
  ];

  for (const skill of skills) {
    lines.push(`- **${skill.name}** (probability: ${skill.probability.toFixed(2)}, confidence: ${skill.confidence.toFixed(2)})`);
    if (skill.description) {
      lines.push(`  *Description:* ${skill.description}`);
    }
    if (skill.whenToUse && skill.whenToUse !== skill.description) {
      lines.push(`  *When to use:* ${skill.whenToUse}`);
    }
  }

  return lines.join("\n");
}
