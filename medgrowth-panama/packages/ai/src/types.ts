export type AIProviderName = "OPENAI" | "ANTHROPIC";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteInput {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface CompleteOutput {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AIProvider {
  readonly name: AIProviderName;
  complete(input: CompleteInput): Promise<CompleteOutput>;
}
