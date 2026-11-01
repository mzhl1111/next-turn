import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages } from "@openrouter/sdk/models";

export const DEFAULT_OPENROUTER_MODEL = "z-ai/glm-5.3-flash";

export interface OpenRouterUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number;
  readonly costUsd: number | null;
}

export interface OpenRouterTextResult {
  readonly model: string;
  readonly text: string;
  readonly usage: OpenRouterUsage | null;
}

interface StreamChunkLike {
  readonly model: string;
  readonly choices: readonly {
    readonly delta: { readonly content?: string | null | undefined };
  }[];
  readonly error?: {
    readonly code: number;
    readonly message: string;
  } | undefined;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly completionTokensDetails?:
      | {
          readonly reasoningTokens?: number | null | undefined;
        }
      | null
      | undefined;
    readonly totalTokens: number;
    readonly cost?: number | null | undefined;
  } | undefined;
}

export interface OpenRouterTextOptions {
  readonly messages: readonly ChatMessages[];
  readonly model?: string;
  readonly maxCompletionTokens?: number;
  readonly temperature?: number;
  readonly apiKey?: string;
}

export async function collectOpenRouterStream(
  stream: AsyncIterable<StreamChunkLike>,
): Promise<OpenRouterTextResult> {
  let model = "";
  let text = "";
  let usage: OpenRouterUsage | null = null;

  for await (const chunk of stream) {
    model = chunk.model || model;
    if (chunk.error !== undefined) {
      throw new Error(`OpenRouter error ${chunk.error.code}: ${chunk.error.message}`);
    }

    const content = chunk.choices[0]?.delta.content;
    if (content) text += content;

    if (chunk.usage !== undefined) {
      usage = {
        promptTokens: chunk.usage.promptTokens,
        completionTokens: chunk.usage.completionTokens,
        reasoningTokens:
          chunk.usage.completionTokensDetails?.reasoningTokens ?? null,
        totalTokens: chunk.usage.totalTokens,
        costUsd: chunk.usage.cost ?? null,
      };
    }
  }

  return { model, text, usage };
}

export async function streamOpenRouterText(
  options: OpenRouterTextOptions,
): Promise<OpenRouterTextResult> {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required; export it or add it to the ignored .env file",
    );
  }

  const model =
    options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
  const client = new OpenRouter({ apiKey });
  const stream = await client.chat.send({
    chatRequest: {
      model,
      messages: [...options.messages],
      stream: true,
      streamOptions: { includeUsage: true },
      maxCompletionTokens: options.maxCompletionTokens ?? 256,
      temperature: options.temperature ?? 0,
    },
  });

  return collectOpenRouterStream(stream);
}
