import OpenAI from "openai";
import type { AIProvider, CompleteInput, CompleteOutput } from "../types";

export class OpenAIProvider implements AIProvider {
  readonly name = "OPENAI" as const;
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async complete(input: CompleteInput): Promise<CompleteOutput> {
    const response = await this.client.chat.completions.create({
      model: input.model,
      max_tokens: input.maxTokens ?? 1024,
      response_format: input.responseFormat === "json" ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((m) => ({ role: m.role, content: m.content }) as const),
      ],
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
