import fs from "node:fs";
import {
  type Skill,
  type SelectedSkill,
  type SkillSelectorOptions,
  type SkillSelectionResult,
  type UsageMetrics,
  type JevDecisionRequest,
  type JevDecisionResponse,
  filterSelectedSkills,
} from "./model";
import { buildSkillState, buildSkillCriteria } from "./parse_skill";
import { DEFAULT_SYSTEM_PROMPT, buildJevInstructions } from "./system_prompt";

export const DEFAULT_OPENROUTER_DECISIONS_URL =
  "https://openrouter.ai/api/alpha/decisions";
export const DEFAULT_FREE_MODEL = "inception/mercury-decide:free";
export const DEFAULT_JEV_MODEL = DEFAULT_FREE_MODEL;

/**
 * Check if a model is an authorized free decision model.
 * Only free decision models (ending with the exact :free suffix) are allowed.
 */
export function isFreeModel(model?: string): boolean {
  if (!model || typeof model !== "string") return false;
  const trimmed = model.trim().toLowerCase();
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+:free$/.test(trimmed);
}

/**
 * Resolve the active decision model.
 * Precedence:
 * 1. optionsModel (must be free, else error)
 * 2. SKILL_SELECTOR_MODEL env var (must be free, else error)
 * 3. Compatible legacy free-only env vars (MODEL, JEV_MODEL) ONLY if free
 * 4. DEFAULT_FREE_MODEL ("inception/mercury-decide:free")
 */
export function resolveActiveModel(optionsModel?: string): string {
  if (optionsModel) {
    if (!isFreeModel(optionsModel)) {
      throw new Error(
        `Paid model "${optionsModel}" rejected: only free decision models (such as ${DEFAULT_FREE_MODEL}) are authorized.`,
      );
    }
    return optionsModel;
  }

  const envSelectorModel = process.env.SKILL_SELECTOR_MODEL;
  if (envSelectorModel) {
    if (!isFreeModel(envSelectorModel)) {
      throw new Error(
        `Paid model "${envSelectorModel}" rejected: only free decision models (such as ${DEFAULT_FREE_MODEL}) are authorized.`,
      );
    }
    return envSelectorModel;
  }

  const legacyModel = process.env.MODEL || process.env.JEV_MODEL;
  if (legacyModel) {
    if (isFreeModel(legacyModel)) {
      return legacyModel;
    }
    // Legacy model is paid (e.g. ~typesafe/jev-latest): do not silently use it!
  }

  return DEFAULT_FREE_MODEL;
}

export interface JevProviderConfig {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetchFn?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
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
  private timeoutMs: number;
  private fetchFn: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;

  constructor(config: JevProviderConfig = {}) {
    this.apiKey =
      config.apiKey ||
      process.env.OPENROUTER_API_KEY ||
      process.env.JEV_API_KEY ||
      "";
    this.model = resolveActiveModel(config.model);
    this.endpoint = config.endpoint || DEFAULT_OPENROUTER_DECISIONS_URL;
    this.retries = Math.max(1, Math.min(3, Math.floor(config.retries ?? 3)));
    this.retryDelayMs =
      config.retryDelayMs !== undefined ? config.retryDelayMs : 500;
    this.timeoutMs = Math.max(1, Math.min(8000, config.timeoutMs ?? 8000));
    this.fetchFn = config.fetchFn || fetch;
  }

  /**
   * Send a decision request to Jev with automatic retries and backoff
   */
  async sendDecisionRequest(
    request: JevDecisionRequest,
  ): Promise<JevDecisionResponse> {
    const modelToUse = request.model || this.model;
    if (!isFreeModel(modelToUse)) {
      throw new Error(
        `Paid model "${modelToUse}" rejected: only free decision models (such as ${DEFAULT_FREE_MODEL}) are authorized.`,
      );
    }

    if (!this.apiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. Please set the environment variable or pass apiKey in constructor.",
      );
    }

    let lastError: Error | null = null;
    const maxAttempts = this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const deadline = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new Error(`Decision request timed out after ${this.timeoutMs}ms`),
            );
          }, this.timeoutMs);
        });
        let response: Response;
        let data: any;
        try {
          const operation = (async () => {
            const reply = await this.fetchFn(this.endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer":
                  "https://github.com/datamonsterr/jev_auto_select_skills",
                "X-Title": "Skill Selector",
              },
              body: JSON.stringify({ ...request, model: modelToUse }),
              signal: controller.signal,
            });
            // The deadline covers both headers and body, even for injected clients.
            const body = await reply.text();
            let parsed: any;
            try {
              parsed = JSON.parse(body);
            } catch {
              parsed = { error: { message: body } };
            }
            return { reply, parsed };
          })();
          const completed = await Promise.race([operation, deadline]);
          response = completed.reply;
          data = completed.parsed;
        } finally {
          clearTimeout(timer!);
        }
        if (response.ok) return data as JevDecisionResponse;

        const isRateLimit = response.status === 429;
        const isServerError = response.status >= 500 && response.status <= 599;

        const errorText = "provider unavailable";

        const error = new Error(
          `Jev decision API failed with HTTP ${response.status}: ${errorText}`,
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

    throw (
      lastError || new Error("Failed to send decision request after retries")
    );
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
    const activeModel = resolveActiveModel(options.model || this.model);

    // Build state and criteria (compact: true omits redundant skill array from state, saving ~11,000 input tokens)
    const state = buildSkillState(
      skills,
      userPrompt,
      systemPrompt || DEFAULT_SYSTEM_PROMPT,
      context,
      { compact: true },
    );
    const criteria = buildSkillCriteria(skills, includeNone, 140);

    // Determine if multi-step questions should be used
    const isMultiStep =
      options.multiStep === true ||
      (options.multiStep !== false &&
        /(?:step\s*\d|phase\s*\d|continuing|continue|first.*(?:next|then)|after that|subsequent)/i.test(
          userPrompt,
        ));

    const questions: Record<string, any> = isMultiStep
      ? {
          primary_skill: {
            type: "choice",
            instructions: buildJevInstructions("primary"),
            criteria,
          },
          secondary_skill: {
            type: "choice",
            instructions: buildJevInstructions("secondary"),
            criteria,
          },
          followup_skill: {
            type: "choice",
            instructions: buildJevInstructions("followup"),
            criteria,
          },
        }
      : {
          selected_skill: {
            type: "choice",
            instructions: buildJevInstructions("single"),
            criteria,
          },
        };

    const request: JevDecisionRequest = {
      model: activeModel,
      state,
      questions,
    };

    let response: JevDecisionResponse;
    try {
      response = await this.sendDecisionRequest(request);
    } catch (err: any) {
      // Treat provider failure/timeout as local fallback or no selected skills, explicit source metadata
      const activeSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const estimateTokens = (text: string) =>
        Math.max(1, Math.ceil(text.trim().length / 3.8));

      return {
        selectedSkills: [],
        primarySkill: null,
        answers: {},
        source: "unavailable",
        metadata: {
          source: "unavailable",
          model: activeModel,
          error: "decision_unavailable",
        },
        usage: {
          total_tokens: 0,
          input_tokens: 0,
          output_tokens: 0,
          user_prompt_tokens: estimateTokens(userPrompt),
          system_prompt_tokens: estimateTokens(activeSystemPrompt),
        },
      };
    }

    const skillMap = new Map(skills.map((s) => [s.name, s]));
    const collectedMap = new Map<string, SelectedSkill>();

    // Process all choice answers returned from Jev
    for (const [, choiceAnswer] of Object.entries(response.answers || {})) {
      if (choiceAnswer.type !== "choice") continue;

      const skillsFromAns = filterSelectedSkills({
        choice: choiceAnswer.choice,
        probabilities: choiceAnswer.probabilities || {},
        confidence: choiceAnswer.confidence || 0,
        threshold,
        maxSkills,
        skillMap,
      });

      for (const item of skillsFromAns) {
        const existing = collectedMap.get(item.name);
        if (!existing || item.probability > existing.probability) {
          collectedMap.set(item.name, item);
        }
      }
    }

    const selectedSkills = Array.from(collectedMap.values())
      .sort((a, b) => b.probability - a.probability)
      .slice(0, maxSkills);

    if (options?.includeContent) {
      for (const skill of selectedSkills) {
        if (skill.path && fs.existsSync(skill.path)) {
          try {
            skill.content = fs.readFileSync(skill.path, "utf-8");
          } catch {
            // Keep content undefined
          }
        }
      }
    }

    // Primary skill is choice from primary_skill, or selected_skill, or top selected skill
    const primaryChoice =
      (response.answers?.primary_skill?.choice !== "none"
        ? response.answers?.primary_skill?.choice
        : null) ||
      (response.answers?.selected_skill?.choice !== "none"
        ? response.answers?.selected_skill?.choice
        : null) ||
      selectedSkills[0]?.name ||
      null;

    const primarySkill =
      primaryChoice && primaryChoice !== "none" ? primaryChoice : null;

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const activeSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    const estimateTokens = (text: string) =>
      Math.max(1, Math.ceil(text.trim().length / 3.8));
    const userPromptTokens = estimateTokens(userPrompt);
    const systemPromptTokens = estimateTokens(activeSystemPrompt);

    const usage: UsageMetrics = {
      total_tokens: totalTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      user_prompt_tokens: userPromptTokens,
      system_prompt_tokens: systemPromptTokens,
      cost: response.usage?.cost,
    };

    return {
      selectedSkills,
      primarySkill,
      answers: response.answers,
      usage,
      raw: response,
      source: "model",
      metadata: {
        source: "model",
        model: activeModel,
      },
    };
  }
}
