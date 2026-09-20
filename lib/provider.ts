import {
  type Skill,
  type SkillSelectorOptions,
  type SkillSelectionResult,
  type JevDecisionRequest,
  type JevDecisionResponse,
  filterSelectedSkills,
} from "./model";
import { buildSkillState, buildSkillCriteria } from "./parse_skill";
import { DEFAULT_SYSTEM_PROMPT, buildJevInstructions } from "./system_prompt";

export const DEFAULT_OPENROUTER_DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_JEV_MODEL = "~typesafe/jev-latest";

export interface JevProviderConfig {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  retries?: number;
  retryDelayMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Provider client for TypeSafe Jev Decision Model via OpenRouter
 */
export class JevProvider {
  private apiKey: string;
  private model: string;
  private endpoint: string;
  private retries: number;
  private retryDelayMs: number;
  private fetchFn: typeof fetch;

  constructor(config: JevProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY || "";
    this.model = config.model || process.env.MODEL || DEFAULT_JEV_MODEL;
    this.endpoint = config.endpoint || DEFAULT_OPENROUTER_DECISIONS_URL;
    this.retries = config.retries !== undefined ? config.retries : 3;
    this.retryDelayMs = config.retryDelayMs !== undefined ? config.retryDelayMs : 500;
    this.fetchFn = config.fetchFn || fetch;
  }

  /**
   * Send a decision request to Jev with automatic retries and backoff
   */
  async sendDecisionRequest(request: JevDecisionRequest): Promise<JevDecisionResponse> {
    if (!this.apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Please set the environment variable or pass apiKey in constructor."
      );
    }

    let lastError: Error | null = null;
    const maxAttempts = this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await this.fetchFn(this.endpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/agent-tools/jev-skill-selector",
            "X-Title": "Jev Skill Selector",
          },
          body: JSON.stringify(request),
        });

        if (response.ok) {
          const data = (await response.json()) as JevDecisionResponse;
          return data;
        }

        const isRateLimit = response.status === 429;
        const isServerError = response.status >= 500 && response.status <= 599;

        let errorText = "";
        try {
          const errJson = await response.json();
          errorText = errJson.error?.message || JSON.stringify(errJson);
        } catch {
          errorText = await response.text();
        }

        const error = new Error(
          `Jev decision API failed with HTTP ${response.status}: ${errorText}`
        );
        lastError = error;

        // Retry on 429 rate limit or 5xx server error if attempts remain
        if ((isRateLimit || isServerError) && attempt < maxAttempts - 1) {
          const backoff = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }

        throw error;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxAttempts - 1) {
          const backoff = this.retryDelayMs * Math.pow(2, attempt);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error("Failed to send decision request after retries");
  }

  /**
   * Select relevant skills from a skill bank for a given user prompt
   */
  async selectSkills(params: {
    userPrompt: string;
    skills: Skill[];
    systemPrompt?: string;
    context?: Record<string, any>;
    options?: SkillSelectorOptions;
  }): Promise<SkillSelectionResult> {
    const { userPrompt, skills, systemPrompt, context, options = {} } = params;

    const threshold = options.threshold ?? 0.05;
    const maxSkills = options.maxSkills ?? 3;
    const includeNone = options.includeNone ?? true;
    const activeModel = options.model || this.model;

    // Build state and criteria
    const state = buildSkillState(
      skills,
      userPrompt,
      systemPrompt || DEFAULT_SYSTEM_PROMPT,
      context
    );
    const criteria = buildSkillCriteria(skills, includeNone);

    const request: JevDecisionRequest = {
      model: activeModel,
      state,
      questions: {
        selected_skill: {
          type: "choice",
          instructions: buildJevInstructions("single"),
          criteria,
        },
      },
    };

    const response = await this.sendDecisionRequest(request);
    const choiceAnswer = response.answers?.selected_skill;

    if (!choiceAnswer) {
      return {
        selectedSkills: [],
        primarySkill: null,
        answers: response.answers || {},
        raw: response,
      };
    }

    const skillMap = new Map(skills.map((s) => [s.name, s]));

    const selectedSkills = filterSelectedSkills({
      choice: choiceAnswer.choice,
      probabilities: choiceAnswer.probabilities || {},
      confidence: choiceAnswer.confidence || 0,
      threshold,
      maxSkills,
      skillMap,
    });

    const primarySkill =
      choiceAnswer.choice && choiceAnswer.choice !== "none" ? choiceAnswer.choice : null;

    return {
      selectedSkills,
      primarySkill,
      answers: response.answers,
      raw: response,
    };
  }
}
