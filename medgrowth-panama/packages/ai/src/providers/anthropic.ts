import Anthropic from "@anthropic-ai/sdk";
import type { AIProvider, CompleteInput, CompleteOutput } from "../types";

export class AnthropicProvider implements AIProvider {
  readonly name = "ANTHROPIC" as const;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const response = await this.client.messages.create({
      model: input.model,
      system: input.system,
      max_tokens: input.maxTokens ?? 1024,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((block) => block.type === "text");

    return {
      content: textBlock && textBlock.type === "text" ? textBlock.text : "",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
