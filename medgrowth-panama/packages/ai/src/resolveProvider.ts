import { AnthropicProvider } from "./providers/anthropic";
import { OpenAIProvider } from "./providers/openai";
import type { AIProvider, AIProviderName } from "./types";

export interface ResolveProviderInput {
  provider: AIProviderName;
  apiKeys: {
    openai?: string;
    anthropic?: string;
  };
}

/**
 * Every AI call in the system goes through this function instead of
 * instantiating an SDK client directly — swapping providers per
 * organization (AIAssistantConfig.provider in the DB) never requires a
 * deploy. See docs/AI_SYSTEM.md section 1.
 */
export function resolveProvider(input: ResolveProviderInput): AIProvider {
  switch (input.provider) {
    case "ANTHROPIC": {
      if (!input.apiKeys.anthropic) throw new Error("Missing ANTHROPIC_API_KEY");
      return new AnthropicProvider(input.apiKeys.anthropic);
    }
    case "OPENAI": {
      if (!input.apiKeys.openai) throw new Error("Missing OPENAI_API_KEY");
      return new OpenAIProvider(input.apiKeys.openai);
    }
    default: {
      const exhaustive: never = input.provider;
      throw new Error(`Unknown AI provider: ${exhaustive}`);
    }
  }
}
